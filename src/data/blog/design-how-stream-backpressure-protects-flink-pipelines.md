---
author: JZ
pubDatetime: 2026-10-27T18:31:18Z
modDatetime: 2026-10-27T18:31:18Z
title: System Design - How Backpressure Protects a Flink Stream Pipeline
tags:
  - design-system
  - design-concurrency
description: "Follow a slow Flink sink backward through network buffers, receiver credits, and upstream tasks to see why bounded queues protect a streaming pipeline."
---

## Table of contents

## The sink that cannot keep up

Imagine a stream of orders. A source reads them, a task calculates totals, and a sink writes the results. The source can produce 1,000 records per second, but the sink can store only 600. What happens to the other 400 each second?

Without a limit, the queue between them grows by 400 records per second. Waiting for ten minutes means roughly 240,000 queued records. Throwing more memory at the queue postpones the problem; it does not make the sink faster. **Backpressure** is the alternative: when a downstream stage cannot accept more data, it makes the upstream stage wait. This explanation follows Apache Flink's _pipelined_ streaming path, rather than a batch job's blocking shuffle.

```text
external source       Flink source       map task          slow sink
     |                     |                 |                  |
     | records             | buffers         | buffers          |
     +-------------------->+---------------->+----------------->+
                           ^                 ^                  |
                           |                 |                  |
                           +---- pressure <--+<---- pressure ---+

         Data goes right; the inability to accept more goes left.
```

The arrows are a mental model, not a separate "slow down" message sent by the sink to every upstream operator. The mechanism is **bounded network buffers and the availability of space to receive them**. Flink's [network-stack explanation](https://flink.apache.org/2019/06/05/a-deep-dive-into-flinks-network-stack/) describes both the sender's full buffer pool and the receiver's lack of available buffers.

## Follow one full buffer backward

Suppose the sink is still working on earlier records. Its input buffers do not become free quickly enough. For a remote channel, Flink uses **credits**: a receiver announces how many network buffers it can accept, and the sender forwards a buffer only when it has a credit for that channel. A sent buffer uses one credit. When the credit count reaches zero, the sender cannot forward more buffers on that channel. The sender's output queue fills, its own task waits for space, and the same constraint can propagate back to the source. [Flink's description of credit-based flow control](https://flink.apache.org/2019/06/05/a-deep-dive-into-flinks-network-stack/#credit-based-flow-control) gives the precise network-level sequence.

```text
  producing task                     receiving task
  +----------------------+           +----------------------+
  | result subpartition  |  buffer   | input channel        |
  | queued buffers: 2    +---------->| free buffers: 0      |
  +----------+-----------+  credits  +----------+-----------+
             |                0                 |
             v                                  v
      no room to emit                  busy processing a record
             |
             v
      upstream task waits
```

Credits are **per logical channel**. A slow receiver need not prevent an unrelated receiver sharing the same physical connection from accepting data. This is an important improvement over simply letting a full receive buffer stop reads on the entire multiplexed connection. See the [Flink network-stack discussion of channel isolation](https://flink.apache.org/2019/06/05/a-deep-dive-into-flinks-network-stack/#inflicting-backpressure-2).

At the upstream edge, what happens depends on the connector and external system. A Flink source that cannot hand off records may stop or slow its reads; an external durable log can accumulate lag outside Flink. Backpressure bounds **in-flight data in this pipeline**. It does not magically reduce an external producer's write rate, guarantee zero lag, or discard records to make throughput look good.

## Why a bounded queue is a feature

A larger queue absorbs a short burst. If the sink catches up afterward, the queue drains. But when average incoming work exceeds average service capacity for long enough, no finite queue can prevent growth forever. Bounded buffers turn that unbounded memory problem into _waiting_ that the system can observe and manage.

There is a trade-off: a small in-flight budget makes pressure visible earlier, while a larger budget may help throughput over a high-latency network but can add queueing delay. In Flink, an input gate's buffer target depends on the channel count, `taskmanager.network.memory.buffers-per-channel`, and `taskmanager.network.memory.floating-buffers-per-gate`. These are capacity controls, **not a fix for a sink that is permanently slower than its input**. The [network buffer tuning guide](https://nightlies.apache.org/flink/flink-docs-stable/docs/deployment/memory/network_mem_tuning/#network-buffer-lifecycle) recommends starting with the defaults and measuring before changing buffer counts.

Backpressure also affects checkpoints. A checkpoint barrier travels through the stream behind earlier records. If a channel has a long queue, the barrier can take longer to reach an operator. Flink's [checkpointing-under-backpressure guide](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/checkpointing_under_backpressure/) explains how _unaligned checkpoints_ can capture in-flight data instead of waiting for ordinary barrier alignment, exchanging shorter checkpoint alignment for additional checkpoint state and I/O. That changes checkpoint behavior; it does **not** make the slow sink fast.

## How to recognize the bottleneck

Flink exposes three per-subtask measurements: `busyTimeMsPerSecond`, `backPressuredTimeMsPerSecond`, and `idleTimeMsPerSecond`. Together they account for approximately one second of task time. The [backpressure monitoring guide](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/monitoring/back_pressure/#task-performance-metrics) describes their meaning and their averaging window.

For our example, look for a sink that stays busy while its upstream map and source spend substantial time backpressured. That pattern suggests the sink or the system it writes to is the first place to investigate. A task can also be busy for unrelated reasons, and a backpressured task tells you where pressure is _felt_, not automatically where it _began_. Trace the path downstream and compare the subtask metrics, external sink latency, and input lag before adding buffers or parallelism.

The central idea is simple: **limited room to receive becomes limited permission to send**. That converts a slow consumer from an invisible memory leak into an explicit throughput limit.

## References

1. Apache Flink, [A deep-dive into Flink's network stack](https://flink.apache.org/2019/06/05/a-deep-dive-into-flinks-network-stack/) (network architecture and credit-based flow control).
2. Apache Flink, [Monitoring back pressure](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/monitoring/back_pressure/) (subtask metrics).
3. Apache Flink, [Network buffer tuning](https://nightlies.apache.org/flink/flink-docs-stable/docs/deployment/memory/network_mem_tuning/) (buffer lifecycle, tuning, and limits).
4. Apache Flink, [Checkpointing under backpressure](https://nightlies.apache.org/flink/flink-docs-stable/docs/ops/state/checkpointing_under_backpressure/) (checkpoint trade-offs).
