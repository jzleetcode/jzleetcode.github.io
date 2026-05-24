---
author: JZ
pubDatetime: 2026-05-24T06:23:00Z
modDatetime: 2026-05-24T06:23:00Z
title: System Design - How Distributed Tracing Works
tags:
  - design-system
  - design-observability
description:
  "How distributed tracing works: trace/span model, context propagation, sampling strategies, and how systems like Jaeger, Zipkin, and OpenTelemetry implement end-to-end request tracking across microservices."
---

## Table of contents

## Context

A user clicks "Buy Now" on an e-commerce site. The request travels through an API gateway, hits the order service, which calls the inventory service, the payment service, and the notification service. The response takes 3.2 seconds. Which service is slow? Which call is failing?

In a monolith, you'd look at one log file. In a microservices architecture with 50+ services, a single user request fans out into dozens of internal RPCs across different machines, languages, and teams. **Distributed tracing** solves the problem of following a single request through this maze.

```
  A single "Buy Now" request, expanded:

  User Browser
       |
       v
  API Gateway (12ms)
       |
       +---> Auth Service (5ms)
       |
       v
  Order Service (45ms)
       |
       +---> Inventory Service (200ms)  <-- slow!
       |         |
       |         +---> Database (180ms)  <-- the real culprit
       |
       +---> Payment Service (35ms)
       |         |
       |         +---> Stripe API (30ms)
       |
       +---> Notification Service (8ms)
              |
              +---> Kafka Publish (3ms)

  Total: 305ms  (most of it in Inventory -> DB)

  Without tracing: "something is slow"
  With tracing: "the inventory DB query at line 142 takes 180ms"
```

The foundational ideas come from Google's [Dapper paper](https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/) (2010), which introduced the trace/span model now used by every major tracing system.

## The Data Model: Traces and Spans

### Traces

A **trace** represents the entire journey of a single request through the system. It has a globally unique **trace ID** (typically a 128-bit random value) that travels with the request across all services.

### Spans

A **span** represents a single operation within a trace — one RPC call, one database query, one function execution. Each span has:

```
  Span Structure:
  +---------------------------+
  | trace_id:    abc123...    |  (shared by all spans in this trace)
  | span_id:     def456...    |  (unique to this span)
  | parent_id:   789xyz...    |  (span that caused this one)
  | operation:   "GET /order" |  (human-readable name)
  | service:     "order-svc"  |  (which service produced it)
  | start_time:  1716531200   |  (Unix timestamp, microseconds)
  | duration:    45000 us     |  (how long it took)
  | status:      OK           |  (OK, ERROR, UNSET)
  | attributes:  {...}        |  (key-value metadata)
  | events:      [...]        |  (timestamped annotations)
  +---------------------------+
```

### The Span Tree

Spans form a tree (or more precisely, a directed acyclic graph). The root span is the entry point; child spans are operations triggered by their parent:

```
  Trace ID: abc123

  [Root Span] API Gateway: GET /checkout  (0ms - 305ms)
  |
  +--[Child] Auth Service: validate_token  (2ms - 7ms)
  |
  +--[Child] Order Service: create_order  (10ms - 255ms)
  |    |
  |    +--[Child] Inventory: check_stock  (15ms - 215ms)
  |    |    |
  |    |    +--[Child] PostgreSQL: SELECT * FROM stock  (20ms - 200ms)
  |    |
  |    +--[Child] Payment: charge  (220ms - 255ms)
  |         |
  |         +--[Child] Stripe API: POST /charges  (222ms - 252ms)
  |
  +--[Child] Notification: send_email  (260ms - 268ms)
       |
       +--[Child] Kafka: produce  (262ms - 265ms)

  Waterfall view (time -->):
  |=== API Gateway =======================================|
    |= Auth =|
              |======= Order Service ====================|
              |====== Inventory ================|
              |===== PostgreSQL ==============|
                                              |== Payment ==|
                                              |= Stripe ==|
                                                           |= Notif =|
                                                           |Kafka|
```

This visualization is the classic "waterfall" or "flame chart" view in tracing UIs (Jaeger, Tempo, Datadog APM).

## Context Propagation

The hardest part of distributed tracing is **propagation** — making sure the trace ID and parent span ID travel with the request as it crosses service boundaries.

### How It Works

```
  Service A                              Service B
  +------------------+                   +------------------+
  | span_id: s1      |                   | span_id: s2      |
  | trace_id: t1     |                   | trace_id: t1     |
  |                  |                   | parent_id: s1    |
  |  HTTP request:   |                   |                  |
  |  headers:        |  --- HTTP --->    | extract headers  |
  |   traceparent:   |                   | create child span|
  |   00-t1-s1-01    |                   |                  |
  +------------------+                   +------------------+
```

The trace context is injected into the transport headers. For HTTP, the W3C standard defines the `traceparent` header:

```
  traceparent: 00-<trace-id>-<parent-span-id>-<trace-flags>

  Example:
  traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                |  |                                |                  |
                v  v                                v                  v
            version  trace-id (32 hex)      span-id (16 hex)    flags (sampled=01)
```

For gRPC, the context travels as metadata. For message queues (Kafka, RabbitMQ), it's embedded in message headers.

### Propagation Formats

Different systems invented their own formats before W3C standardized:

```
  +------------------+-------------------------------------------+
  | System           | Header / Format                           |
  +------------------+-------------------------------------------+
  | W3C (standard)   | traceparent: 00-{trace}-{span}-{flags}   |
  | Zipkin (B3)      | X-B3-TraceId, X-B3-SpanId, X-B3-Sampled  |
  | Jaeger           | uber-trace-id: {trace}:{span}:{parent}:{flags} |
  | AWS X-Ray        | X-Amzn-Trace-Id: Root=1-xxx;Parent=yyy   |
  | Datadog          | x-datadog-trace-id, x-datadog-parent-id  |
  +------------------+-------------------------------------------+
```

OpenTelemetry supports all of these through pluggable **propagators**, so services using different formats can still participate in the same trace.

### Code Example: Instrumentation

Here is what instrumentation looks like with OpenTelemetry in Go:

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
)

func HandleCheckout(ctx context.Context, req *CheckoutRequest) error {
    // Start a new span (automatically a child of whatever span is in ctx)
    ctx, span := otel.Tracer("order-service").Start(ctx, "HandleCheckout")
    defer span.End()

    // Add attributes (searchable metadata)
    span.SetAttributes(
        attribute.String("user.id", req.UserID),
        attribute.Int("cart.items", len(req.Items)),
    )

    // Call another service — ctx carries the trace context
    stock, err := inventoryClient.CheckStock(ctx, req.Items)
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, "inventory check failed")
        return err
    }

    // The inventoryClient.CheckStock call will:
    // 1. Extract trace context from ctx
    // 2. Inject it into outgoing HTTP/gRPC headers
    // 3. The inventory service extracts it, creates a child span
    // All automatic with OpenTelemetry middleware!

    return nil
}
```

The key insight: **you pass `ctx` everywhere.** The context carries the active span. When you make an outgoing call, the instrumentation library injects the span's trace context into the request headers automatically.

## Sampling: You Can't Trace Everything

At Pinterest's scale (billions of requests/day), storing a trace for every request would cost millions in storage. Sampling decides which requests get traced.

### Head-Based Sampling

The decision is made at the **start** of the request (the "head"):

```
  Request arrives at API Gateway
       |
       v
  Roll dice: random() < 0.01?  (1% sampling rate)
       |
    +--+--+
    |     |
    v     v
   YES    NO
    |     |
    v     v
  Set     Set
  flags=01  flags=00
  (sampled) (not sampled)
    |     |
    v     v
  All downstream     No spans
  services create    recorded for
  spans for this     this request
  request
```

**Pros:** Simple, low overhead, sampling decision is made once
**Cons:** Interesting requests (errors, slow responses) are randomly discarded at the same rate as boring ones

### Tail-Based Sampling

The decision is made **after** the trace is complete:

```
  All spans are collected first (buffered)
       |
       v
  +-------------------+
  | Sampling Decision |
  | Engine            |
  |                   |
  | Keep if:          |
  |  - duration > 2s  |
  |  - status = ERROR |
  |  - specific user  |
  |  - random 1%      |
  +-------------------+
       |
    +--+--+
    |     |
    v     v
  KEEP   DROP
```

**Pros:** Keeps all interesting traces (errors, slow requests)
**Cons:** Must buffer all spans temporarily (memory-intensive), more complex infrastructure

### OpenTelemetry Collector Sampling

In practice, you combine both approaches:

```
  Service A     Service B     Service C
     |              |              |
     v              v              v
  OTel SDK      OTel SDK      OTel SDK
  (head sample  (follow        (follow
   at 10%)       parent)        parent)
     |              |              |
     v              v              v
  +--------------------------------------------+
  |         OpenTelemetry Collector            |
  |                                            |
  |  Tail-based sampling:                      |
  |  - Keep all errors                         |
  |  - Keep traces > 2s                        |
  |  - Keep 1% of remaining                    |
  +--------------------------------------------+
              |
              v
  +---------------------+
  |  Storage Backend    |
  |  (Jaeger / Tempo)   |
  +---------------------+
```

## Architecture: Collecting and Storing Traces

### The Pipeline

```
  +----------+     +----------+     +-----------+     +----------+
  |  Service |     | Collector|     |  Storage  |     |    UI    |
  | (SDK +   | --> | (process,| --> | (Jaeger,  | <-- | (query + |
  |  exporter)|    |  sample, |     |  Tempo,   |     |  render) |
  |          |     |  batch)  |     |  Elastic) |     |          |
  +----------+     +----------+     +-----------+     +----------+

  Phase 1: Instrumentation
    - Application code creates spans
    - SDK batches and exports spans via OTLP (gRPC/HTTP)

  Phase 2: Collection
    - Collector receives spans from multiple services
    - Applies sampling, enrichment, filtering
    - Batches and forwards to storage

  Phase 3: Storage
    - Indexed by trace_id for fast retrieval
    - Stored with service name, duration, status for querying
    - TTL-based retention (7-30 days typical)

  Phase 4: Query
    - Find traces by service, duration, error, tags
    - Render waterfall visualizations
    - Compute service dependency graphs
```

### Storage Backends

Different backends make different trade-offs:

```
  +---------------+-------------------+--------------------+
  | Backend       | Strengths         | Weaknesses         |
  +---------------+-------------------+--------------------+
  | Jaeger +      | Battle-tested,    | Complex ops,       |
  | Elasticsearch | full-text search  | expensive storage  |
  +---------------+-------------------+--------------------+
  | Grafana Tempo | Cheap (object     | No tag indexing,   |
  |               | storage: S3/GCS), | needs exemplars    |
  |               | scales infinitely | or logs for lookup |
  +---------------+-------------------+--------------------+
  | ClickHouse    | Fast aggregation, | Newer ecosystem,   |
  |               | good compression  | fewer integrations |
  +---------------+-------------------+--------------------+
```

Grafana Tempo's approach is notable: it stores traces in object storage (S3) without indexing by tags. You find traces via **exemplars** (trace IDs embedded in metrics) or correlated logs. This reduces storage cost by 10-100x compared to Elasticsearch.

## OpenTelemetry: The Standard

OpenTelemetry (OTel) is the CNCF project that unified the fragmented tracing ecosystem. Before OTel, you had to choose between OpenTracing and OpenCensus — incompatible APIs with overlapping goals. OTel merged them.

### The Three Signals

OTel defines three observability signals:

```
  +----------+     +----------+     +----------+
  |  Traces  |     |  Metrics |     |   Logs   |
  | (request |     | (counter,|     | (text    |
  |  flow)   |     |  gauge,  |     |  events) |
  |          |     |  histo)  |     |          |
  +-----+----+     +-----+----+     +-----+----+
        |                |                |
        +----------------+----------------+
                         |
                    Correlation
              (trace_id links them all)
```

The key insight: by embedding the trace ID in metrics (as exemplars) and logs (as structured fields), you can jump between signals:
- Metric spike -> exemplar trace ID -> waterfall view
- Log error -> trace ID field -> see full request path
- Slow span -> correlated logs -> see error details

### OTel Architecture

```
  Your Application
  +--------------------------------------------------+
  |                                                  |
  |  +------------------+                            |
  |  | Instrumentation  |  (auto or manual)          |
  |  | Libraries        |                            |
  |  +--------+---------+                            |
  |           |                                      |
  |           v                                      |
  |  +------------------+                            |
  |  | OTel SDK         |                            |
  |  |  - TracerProvider|  (manages span lifecycle)  |
  |  |  - SpanProcessor |  (batch, simple)           |
  |  |  - Exporter      |  (OTLP, Jaeger, Zipkin)   |
  |  +--------+---------+                            |
  +-----------|------------------------------------------+
              |
              | OTLP (OpenTelemetry Protocol)
              | gRPC or HTTP/protobuf
              v
  +------------------+
  | OTel Collector   |
  |  - Receivers     |  (accept data in any format)
  |  - Processors    |  (batch, filter, sample, enrich)
  |  - Exporters     |  (send to any backend)
  +------------------+
```

The Collector is the Swiss Army knife: it can receive data from any source (Jaeger, Zipkin, OTLP, Prometheus), process it (add attributes, sample, filter), and export to any backend. This decouples your application instrumentation from your storage choice.

## Span Relationships: Beyond Parent-Child

Most spans have a simple parent-child relationship. But OTel supports a richer model:

```
  1. Parent-Child (synchronous call):

     [Parent: HTTP handler] -----> [Child: DB query]
     Parent waits for child to complete.

  2. Follows-From / Link (asynchronous):

     [Producer: publish message]
              |
              |  (link, not parent-child)
              v
     [Consumer: process message]  (runs later, different trace possible)

  3. Multiple Links (batch processing):

     [Batch Job: process 100 messages]
       |--- link ---> Trace A (original request 1)
       |--- link ---> Trace B (original request 2)
       |--- link ---> Trace C (original request 3)
```

Links are essential for async architectures (message queues, batch processing) where the producer and consumer run in different traces but you still want to connect them.

## Performance Overhead

Tracing adds overhead. Here's what to expect:

```
  Component                   Overhead
  -------------------------------------------
  Context propagation         ~1 microsecond per hop
  Span creation               ~1-5 microseconds
  Attribute recording         ~0.5 microseconds per attribute
  Export (batched, async)     ~0.1% CPU (amortized)
  Network (OTLP to collector) ~1-2 KB per span

  At 10,000 spans/sec with batched export:
  - CPU: 1-3% additional
  - Memory: 5-20 MB buffer
  - Network: 10-20 MB/sec to collector
```

The key optimization: **batched, asynchronous export.** Spans are buffered in memory and flushed in batches (typically every 5 seconds or 512 spans). The hot path (span creation) is fast; the expensive work (serialization, network) happens in a background goroutine.

```go
// Batch span processor (simplified from OTel SDK)
type batchSpanProcessor struct {
    queue    chan ReadOnlySpan
    batch    []ReadOnlySpan
    exporter SpanExporter
    timer    *time.Timer
}

func (bsp *batchSpanProcessor) OnEnd(s ReadOnlySpan) {
    // Non-blocking enqueue — if queue is full, drop the span
    select {
    case bsp.queue <- s:
    default:
        // dropped (backpressure)
    }
}

func (bsp *batchSpanProcessor) exportLoop() {
    for {
        select {
        case span := <-bsp.queue:
            bsp.batch = append(bsp.batch, span)
            if len(bsp.batch) >= maxBatchSize {
                bsp.export()
            }
        case <-bsp.timer.C:
            if len(bsp.batch) > 0 {
                bsp.export()
            }
        }
    }
}
```

## Practical Patterns

### Trace-Based Testing

Use traces to verify system behavior in integration tests:

```
  1. Send request to service
  2. Wait for trace to appear in backend
  3. Assert span tree matches expected structure:
     - Root span has status OK
     - DB span exists and took < 50ms
     - No retry spans (means first attempt succeeded)
     - Payment span has attribute "provider=stripe"
```

### Service Dependency Maps

Aggregate traces to build a live service topology:

```
  From thousands of traces, derive:

  API Gateway ---> Order Service ---> Inventory DB
       |                |
       |                +---> Payment Service ---> Stripe
       |
       +---> Auth Service ---> Redis Cache

  Edge weights = request rate, error rate, latency p99
  Generated automatically from span parent-child relationships
```

### Critical Path Analysis

The critical path is the longest chain of spans that determines total latency:

```
  [API Gateway: 305ms total]
  |
  |--- Auth (5ms)           NOT on critical path (parallel)
  |
  |--- Order (245ms)        ON critical path
       |
       |--- Inventory (200ms)   ON critical path
       |    |
       |    +--- DB (180ms)     ON critical path <-- optimize this!
       |
       |--- Payment (35ms)      NOT on critical path (parallel with Inventory? No, sequential)

  Critical path: Gateway -> Order -> Inventory -> DB
  Optimizing DB query by 100ms would save 100ms total latency.
  Optimizing Auth by 4ms would save 0ms (it's parallel).
```

## References

1. Sigelman, B. et al. "Dapper, a Large-Scale Distributed Systems Tracing Infrastructure." Google Technical Report, 2010. [paper](https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/)
2. OpenTelemetry specification. [doc](https://opentelemetry.io/docs/specs/otel/)
3. W3C Trace Context standard. [spec](https://www.w3.org/TR/trace-context/)
4. Jaeger architecture. [doc](https://www.jaegertracing.io/docs/architecture/)
5. Grafana Tempo architecture. [doc](https://grafana.com/docs/tempo/latest/operations/architecture/)
6. OpenTelemetry Collector. [doc](https://opentelemetry.io/docs/collector/)
7. Kaldor, J. et al. "Canopy: An End-to-End Performance Tracing And Analysis System." Facebook, SOSP 2017.
8. Shkuro, Y. "Mastering Distributed Tracing." Packt, 2019.
