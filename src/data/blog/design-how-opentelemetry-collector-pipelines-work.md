---
author: JZ
pubDatetime: 2026-11-09T19:34:52Z
modDatetime: 2026-11-09T19:34:52Z
title: System Design - How OpenTelemetry Collector Pipelines Work
tags:
  - design-system
  - design-observability
description: "A practical walkthrough of how the OpenTelemetry Collector receives telemetry, runs it through ordered pipelines, and exports it to observability backends."
---

## Table of contents

- [Context](#context)
- [The collector is a telemetry relay](#the-collector-is-a-telemetry-relay)
- [Four pieces make a pipeline](#four-pieces-make-a-pipeline)
- [Read a collector configuration](#read-a-collector-configuration)
- [Choose where collectors run](#choose-where-collectors-run)
- [Configuration details that matter](#configuration-details-that-matter)
- [References](#references)

## Context

Suppose the checkout service already creates OpenTelemetry spans. Today it sends them to one tracing backend. Later, the team wants a second backend, a filter for sensitive attributes, and a way to protect the application from a temporary outage in the first backend.

The OpenTelemetry Collector gives the team a place to receive, process, and export telemetry outside the application. It is a separate program between instrumented services and observability systems. The application still creates spans, metrics, and logs; the Collector handles their journey after they leave the process.

This post focuses on that journey. The trace and context model is covered in [How Distributed Tracing Works](/posts/design-how-distributed-tracing-works); here, we follow the Collector's configuration and data path.

## The collector is a telemetry relay

An application uses an OpenTelemetry API and SDK, or an auto-instrumentation library, to create telemetry. An exporter sends it using OTLP, the OpenTelemetry Protocol. OTLP commonly travels over gRPC or HTTP.

```text
  Checkout service                 OpenTelemetry Collector
  +------------------+              +------------------------+
  | Instrumentation  | -- OTLP ---> | Receiver               |
  | OpenTelemetry SDK|              |    |                   |
  +------------------+              |    v                   |
                                    | Processors             |
                                    |    |                   |
                                    |    v                   |
                                    | Exporters              |
                                    +----+-------------------+
                                         |            |
                                         v            v
                                   Trace backend   Archive or
                                                  second backend
```

The Collector is useful because applications can keep speaking one protocol while operators change destinations or apply shared processing centrally. It can receive telemetry from applications, agents, or other Collectors. It can then send a copy to more than one destination.

The Collector does not automatically create missing spans inside application code. Instrumentation does that. A receiver can also scrape or translate telemetry from systems that do not use an OpenTelemetry SDK, but the Collector still only sees data that one of its configured receivers can obtain.

## Four pieces make a pipeline

A Collector pipeline is a path through three required component types, with an optional connector between pipelines:

```text
  Receiver(s) --> Processor(s) --> Exporter(s)
                         ^
                         |
               optional Connector links
               two pipelines together
```

### Receivers take data in

A receiver accepts a particular telemetry format. The OTLP receiver listens for OTLP over gRPC or HTTP. Other receivers can scrape a source or accept a different protocol.

Each receiver supports certain signal types. An OTLP receiver can receive traces, metrics, and logs. A Prometheus receiver, for example, is concerned with metrics. The pipeline must use components that support its signal type.

### Processors inspect or change data

Processors run in the order listed in the pipeline. A `memory_limiter` can apply backpressure when the Collector is short on memory. A `batch` processor groups many small exports so the Collector can send fewer, larger requests. Attribute, filter, and sampling processors can also edit or drop telemetry.

Processors are optional. With no processors, data moves from the receiver directly to an exporter. When the list contains several processors, the output of one becomes the input to the next.

### Exporters send data out

An exporter sends telemetry to a destination. An OTLP exporter can send it to another Collector or an OTLP-compatible backend. A debug exporter is useful while setting up a pipeline because it writes received data to the Collector's own output.

If a pipeline names two exporters, both receive a copy of each item. This makes it possible to migrate backends gradually or send a second copy for auditing.

### Connectors join pipelines

A connector acts like an exporter for one pipeline and a receiver for another. For example, a connector can read spans from a traces pipeline and produce metrics for a metrics pipeline. Most first deployments do not need one; it is an option for connecting signal processing paths.

The Collector also has extensions, such as health-check and profiling endpoints. Extensions are enabled in the service configuration, but they are not steps in a telemetry pipeline because they do not process the telemetry stream.

## Read a collector configuration

Here is a small traces pipeline. It listens on the local machine, limits memory use, batches spans, and prints them for inspection:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: localhost:4317
      http:
        endpoint: localhost:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  debug:

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
```

The top sections define and configure component instances. The `service.pipelines` section wires receivers, processors, and exporters together. A component definition by itself is not enough: pipeline components must be named in a pipeline, and extensions must be enabled under `service.extensions`.

Here the application sends OTLP to port `4317` or `4318`. The receiver hands each span to `memory_limiter`, then to `batch`, then to `debug`. `send_batch_size` is the batch processor's send threshold; it is not a maximum size. A timeout also flushes a batch when traffic is quiet.

To send traces to a backend, replace `debug` with an exporter supported by the Collector distribution and configure its endpoint. A production deployment should also configure authentication, TLS, and exporter queues or retries to match the backend and failure-recovery needs. The Collector binary must include each component named in the file; distributions can ship different sets of receivers, processors, and exporters.

The official configuration docs include a `validate` command for checking a Collector configuration before starting it:

```sh
otelcol validate --config=collector.yaml
```

## Choose where collectors run

The same Collector can run close to applications or as a shared service:

- **Agent pattern:** run a Collector on each host or next to each workload. Applications send to a nearby receiver, and the agent can attach host information or batch data before forwarding it.
- **Gateway pattern:** run a pool of Collectors behind a network endpoint. Agents or applications send to the pool, which centralizes routing, credentials, and processing.

Many deployments combine both. An agent can keep application configuration stable while a gateway controls backend destinations. A gateway also needs enough capacity and redundancy for the traffic it receives; it becomes part of the observability path.

## Configuration details that matter

- **Use `service.pipelines` to turn components on.** A receiver that is configured but not connected to a pipeline will not receive application data.
- **Keep processor order intentional.** The Collector runs processors from first to last. A memory limit check is usually early; batching is commonly near the end of a pipeline.
- **Configure an endpoint that applications can reach.** `localhost` works when the app and Collector share a host network namespace. In containers or Kubernetes, use the appropriate service address and bind address. Exposing a receiver on every network interface should be a deliberate choice.
- **Check component availability.** A valid YAML file can still fail at startup if the selected Collector distribution does not contain one of the named components.
- **Make delivery behavior explicit.** Exporter queues and retry settings determine what happens during backend outages. They consume memory or disk and need capacity limits of their own.

The central idea is that the Collector turns telemetry handling into a configurable path. Receivers define how data enters, processors define the work done in between, and exporters define where it goes. That shared path lets teams change observability infrastructure without rewriting every application exporter.

## References

1. OpenTelemetry, [Collector overview](https://opentelemetry.io/docs/collector/).
2. OpenTelemetry, [Collector architecture](https://opentelemetry.io/docs/collector/architecture/).
3. OpenTelemetry, [Collector configuration](https://opentelemetry.io/docs/collector/configuration/).
4. OpenTelemetry, [OTLP specification](https://opentelemetry.io/docs/specs/otlp/).
5. OpenTelemetry Collector source: [receiver components](https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver), [processor components](https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor), and [exporter components](https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter).
