---
author: JZ
pubDatetime: 2026-09-16T08:00:00Z
modDatetime: 2026-09-16T08:00:00Z
title: System Design - How Distributed Stream Processing Works (Apache Flink)
tags:
  - design-system
  - design-distributed
description:
  "How distributed stream processing works: dataflow graphs, event time vs processing time, windowing, watermarks, state management, checkpointing, and exactly-once semantics — with source code walkthrough from Apache Flink."
---

## Table of contents

## Context

Imagine you work at a ride-sharing company. Every second, thousands of drivers send GPS coordinates, riders request trips, and payments flow in. You need to compute surge pricing *right now* — not in an hour when a batch job finishes. This is the world of **stream processing**: computing results continuously as data arrives, rather than waiting to process it all at once.

Batch processing (think MapReduce or Spark batch jobs) collects data into chunks, processes each chunk, and writes results. It's simple but introduces **latency** — you might wait minutes or hours for fresh results. Stream processing flips this: each event is processed as it arrives, and results update in real time.

**Apache Flink** is the most widely adopted open-source stream processing engine. Companies like Alibaba, Uber, Netflix, and Pinterest use it to power real-time analytics, fraud detection, and event-driven applications. Flink processes millions of events per second with exactly-once guarantees and millisecond latency.

Let's trace a stream processing job from the moment you submit it to the moment results come out, following Flink's actual source code.

## The Dataflow Model

Every Flink program compiles down to a **dataflow graph** — a directed acyclic graph (DAG) of operators connected by streams:

```
                          Dataflow Graph

   +----------+      +----------+      +----------+
   |  Source   |----->|   Map    |----->|   Sink   |
   | (Kafka)  |      | (parse)  |      | (output) |
   +----------+      +----------+      +----------+

   +----------+      +-----------+     +----------+
   |  Source   |----->| KeyBy +   |---->|   Sink   |
   | (Kafka)  |      | Window +  |     | (output) |
   |          |      | Aggregate |     |          |
   +----------+      +-----------+     +----------+
```

In code, building a dataflow looks like a regular program:

```java
DataStream<String> lines = env.addSource(new FlinkKafkaConsumer<>(...));

DataStream<Event> events = lines.map(line -> parseEvent(line));

DataStream<Alert> alerts = events
    .keyBy(event -> event.getUserId())
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .aggregate(new FraudDetector());

alerts.addSink(new AlertSink());
```

But this isn't executed line by line. Flink compiles it into a **JobGraph** — a DAG of operators that can be distributed across a cluster. The compilation happens in [`StreamGraphGenerator`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/graph/StreamGraphGenerator.java), which walks the user's transformations and builds an intermediate `StreamGraph`, then optimizes it into a `JobGraph` by **chaining** operators that can run in the same thread.

### Operator Chaining

If two operators have the same parallelism and are connected by a forward partition (no shuffle), Flink fuses them into a single **task**:

```
  Before chaining                After chaining

  +--------+   +--------+       +------------------+
  | Source  |-->|  Map   |  ==>  | Source + Map     |
  | (p=4)  |   | (p=4)  |       | (single task)    |
  +--------+   +--------+       +------------------+
       |                              |
       v                              v
  +--------+                    +--------+
  | KeyBy  |                    | KeyBy  |
  | (p=4)  |                    | (p=4)  |
  +--------+                    +--------+
```

Chained operators avoid serialization and network transfer between them. The chaining logic lives in [`StreamingJobGraphGenerator.isChainable()`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/graph/StreamingJobGraphGenerator.java) and checks conditions like: same parallelism, forward partitioning, neither operator disables chaining.

## Cluster Architecture

Flink follows a leader-worker architecture:

```
                     Flink Cluster

  +---------------------------------------------+
  |              JobManager                      |
  |                                              |
  |  +------------------+  +------------------+  |
  |  |   Dispatcher     |  |  ResourceManager |  |
  |  | (accepts jobs)   |  | (manages slots)  |  |
  |  +------------------+  +------------------+  |
  |                                              |
  |  +------------------+                        |
  |  |   JobMaster      |  (one per running job) |
  |  | (schedules tasks)|                        |
  |  +------------------+                        |
  +---------------------------------------------+
          |              |              |
          v              v              v
  +--------------+ +--------------+ +--------------+
  | TaskManager  | | TaskManager  | | TaskManager  |
  |              | |              | |              |
  | +----------+ | | +----------+ | | +----------+ |
  | | Slot 1   | | | | Slot 1   | | | | Slot 1   | |
  | | [task]   | | | | [task]   | | | | [task]   | |
  | +----------+ | | +----------+ | | +----------+ |
  | | Slot 2   | | | | Slot 2   | | | | Slot 2   | |
  | | [task]   | | | | [task]   | | | | [task]   | |
  | +----------+ | | +----------+ | | +----------+ |
  +--------------+ +--------------+ +--------------+
```

- **JobManager** is the control plane. It runs the **Dispatcher** (receives job submissions), the **ResourceManager** (negotiates containers from YARN/Kubernetes), and one **JobMaster** per running job.
- **TaskManagers** are the workers. Each has a fixed number of **slots** — resource units that run one parallel slice of the job. A slot gets a share of CPU and memory.

When you submit a job, the JobMaster takes the JobGraph, assigns each parallel subtask to a slot, and deploys the task code. The core scheduling logic is in [`DefaultScheduler`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/scheduler/DefaultScheduler.java).

## Data Exchange: How Records Flow

Once tasks are deployed, records flow between them. Flink uses a credit-based flow control protocol inspired by TCP's sliding window, but at the application level.

### Network Stack

```
  Upstream Task                              Downstream Task
  +------------------+                       +------------------+
  |                  |                       |                  |
  |  RecordWriter    |                       |  InputGate       |
  |       |          |                       |       |          |
  |       v          |                       |       ^          |
  |  ResultPartition |                       |  InputChannel    |
  |  [Buffer Pool]   |                       |  [Buffer Pool]   |
  |       |          |                       |       |          |
  +-------|----------+                       +-------|----------+
          |                                          ^
          |          Netty (TCP)                      |
          +----------------------------------------->+
```

Each operator writes output records into a [`ResultPartition`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/io/network/partition/ResultPartition.java), which manages a pool of reusable byte buffers (default 32 KB each). When a buffer fills up, it's sent over the network via Netty to the downstream task's [`InputGate`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/io/network/partition/consumer/SingleInputGate.java).

### Credit-Based Flow Control

The downstream task tells the upstream how many **credits** (empty buffers) it has available. The upstream only sends data when it has credits, preventing the downstream from being overwhelmed:

```
  Upstream                    Downstream
     |                            |
     |   credit = 5               |    "I have 5 empty buffers"
     |<---------------------------|
     |                            |
     |   buffer 1 (credit--)      |
     |--------------------------->|
     |   buffer 2 (credit--)      |
     |--------------------------->|
     |           ...              |
     |   buffer 5 (credit = 0)    |
     |--------------------------->|
     |                            |
     |   (paused, no credits)     |    downstream processes data
     |                            |
     |   credit = 3               |    "I freed 3 buffers"
     |<---------------------------|
     |   buffer 6                 |
     |--------------------------->|
```

This is implemented in [`CreditBasedPartitionRequestClientHandler`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/io/network/netty/CreditBasedPartitionRequestClientHandler.java). The approach provides natural backpressure: if a downstream operator is slow, it stops granting credits, which causes the upstream to buffer and eventually slow down too — all the way back to the source.

## Event Time vs Processing Time

Here's a subtle but critical problem. Suppose you're counting clicks per minute. A click happens at 12:00:01 (the **event time** — when it actually occurred) but arrives at your Flink operator at 12:00:05 (the **processing time** — when Flink sees it). If a user had poor network connectivity, that click might arrive at 12:03:00. Which minute does it belong to?

```
   Event Time    (when it happened in the real world)
   ──────────────────────────────────────────────>

   12:00:01       12:00:30       12:01:15
      *              *              *
      |              |              |
      | network      | network      | network
      | delay        | delay        | delay
      v              v              v
   12:00:05       12:00:31       12:03:00
      *              *              *

   Processing Time  (when Flink receives it)
   ──────────────────────────────────────────────>
```

**Processing time** is simple — just use the wall clock when the record arrives. But results become non-deterministic: replaying the same data at a different speed gives different results.

**Event time** uses the timestamp embedded in the event itself. Results are deterministic and correct, but you need a mechanism to know when you've seen "enough" events for a given time window. That mechanism is **watermarks**.

## Watermarks: Tracking Progress in Event Time

A watermark is a special record that flows through the dataflow graph alongside regular records. A watermark with timestamp $t$ means: "no more events with timestamp $\leq t$ will arrive."

```
   Stream of events (with event timestamps):

   [e:12:00:03] [e:12:00:01] [W:12:00:00] [e:12:00:07] [e:12:00:05] [W:12:00:04]
   ---------------------------------------------------------------------------->
                                                                        time

   W:12:00:00 means: all events before 12:00:00 have arrived
   W:12:00:04 means: all events before 12:00:04 have arrived
```

When a window operator receives a watermark that passes the window's end time, it knows the window is complete and can fire (emit results).

Sources generate watermarks. The simplest strategy is **bounded-out-of-orderness**: assume events can be at most $d$ seconds late, so the watermark is always `max_event_time_seen - d`:

```java
WatermarkStrategy
    .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
    .withTimestampAssigner((event, timestamp) -> event.getTimestamp());
```

The watermark generation logic lives in [`BoundedOutOfOrdernessWatermarks`](https://github.com/apache/flink/blob/master/flink-core/src/main/java/org/apache/flink/api/common/eventtime/BoundedOutOfOrdernessWatermarks.java):

```java
public class BoundedOutOfOrdernessWatermarks<T> implements WatermarkGenerator<T> {
    private long maxTimestamp;
    private final long outOfOrdernessMillis;

    @Override
    public void onEvent(T event, long eventTimestamp, WatermarkOutput output) {
        maxTimestamp = Math.max(maxTimestamp, eventTimestamp);
    }

    @Override
    public void onPeriodicEmit(WatermarkOutput output) {
        output.emitWatermark(new Watermark(maxTimestamp - outOfOrdernessMillis - 1));
    }
}
```

When an operator has multiple input streams, it takes the **minimum** watermark across all inputs — the slowest stream determines progress. This is handled by [`StatusWatermarkValve`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/watermarkstatus/StatusWatermarkValve.java).

## Windowing: Grouping Events by Time

Windows are how you turn an infinite stream into finite chunks for aggregation. Flink supports three main window types:

```
  Tumbling Windows (fixed size, no overlap)

  |  window 1  |  window 2  |  window 3  |
  |  [0, 5)    |  [5, 10)   |  [10, 15)  |
  +---*--*--*--+--*-----*---+--*--*------+----->
     e1 e2 e3    e4    e5     e6 e7        time


  Sliding Windows (fixed size, with overlap)

  |  window 1: [0, 10)       |
  |----*--*--*--*-----*------|
  |         window 2: [5, 15)         |
  |         |--*-----*---*--*---------|
  +---*--*--*--*-----*---*--*---------+----->
                                        time


  Session Windows (gap-based, variable size)

  |  session 1  |    gap    |  session 2     |   gap   | session 3|
  +--*--*-*-----+-----------+--*--------*--*-+---------+--*-------+->
     e1 e2 e3                  e4       e5 e6            e7
```

The window assignment logic is in [`WindowAssigner`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/windowing/assigners/WindowAssigner.java). For tumbling windows, the assignment is beautifully simple — just align to the window size:

```java
// from TumblingEventTimeWindows
public Collection<TimeWindow> assignWindows(Object element, long timestamp, ...) {
    long start = TimeWindow.getWindowStartWithOffset(timestamp, offset, size);
    return Collections.singletonList(new TimeWindow(start, start + size));
}

// TimeWindow.getWindowStartWithOffset:
public static long getWindowStartWithOffset(long timestamp, long offset, long windowSize) {
    return timestamp - (timestamp - offset + windowSize) % windowSize;
}
```

When a watermark advances past a window's end time, the [`WindowOperator`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/operators/windowing/WindowOperator.java) fires the window — it calls the user's aggregation function on all events in the window and emits the result downstream.

### Late Events

What about events that arrive *after* the watermark has passed their window? By default, they're dropped. But you can configure an **allowed lateness**:

```java
stream
    .keyBy(...)
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .allowedLateness(Time.minutes(1))
    .aggregate(new MyAggregator());
```

During the allowed lateness period, late events trigger the window to re-fire with updated results. After that period, the window state is purged and any further late events are truly dropped (or routed to a **side output** for separate handling).

## State Management

Stream processing operators often need to remember things: the running sum in a window, the last event per user, a count of items seen. This is **operator state**, and managing it correctly is what makes stream processing hard.

Flink provides a typed state API. Inside an operator, you declare state like this:

```java
public class FraudDetector extends KeyedProcessFunction<Long, Transaction, Alert> {
    private ValueState<Boolean> flagState;

    @Override
    public void open(Configuration params) {
        ValueStateDescriptor<Boolean> descriptor =
            new ValueStateDescriptor<>("flag", Types.BOOLEAN);
        flagState = getRuntimeContext().getState(descriptor);
    }

    @Override
    public void processElement(Transaction tx, Context ctx, Collector<Alert> out) {
        Boolean flag = flagState.value();     // read state for THIS key
        if (flag != null && tx.getAmount() > 500) {
            out.collect(new Alert(tx.getUserId()));
        }
        if (tx.getAmount() < 1.00) {
            flagState.update(true);           // write state for THIS key
        }
    }
}
```

The key insight: state is **partitioned by key**. When you do `.keyBy(event -> event.getUserId())`, Flink routes all events for the same user to the same operator instance. That operator's `ValueState<Boolean>` automatically scopes to the current key — no manual map lookups needed.

### State Backends

Under the hood, state lives in a **state backend**. Flink has two main options:

```
  HashMapStateBackend                 EmbeddedRocksDBStateBackend

  +-------------------+              +-------------------+
  |   JVM Heap        |              |   RocksDB (LSM)   |
  |                   |              |                   |
  |  HashMap<K, V>    |              |  SST files on     |
  |  (in-memory)      |              |  local disk       |
  |                   |              |                   |
  |  + Fast reads     |              |  + Handles state  |
  |  + Fast writes    |              |    larger than    |
  |  - Limited by     |              |    memory         |
  |    heap size      |              |  + Incremental    |
  |  - Full snapshot  |              |    checkpoints    |
  |    on checkpoint  |              |  - Serialization  |
  |                   |              |    overhead       |
  +-------------------+              +-------------------+
```

The `HashMapStateBackend` stores everything on the JVM heap as regular Java objects. It's fast but limited by memory. The `EmbeddedRocksDBStateBackend` uses an embedded [RocksDB](https://github.com/facebook/rocksdb) instance per operator — state spills to local disk when it exceeds memory, and checkpoints can be taken incrementally (only changed SST files are uploaded).

The state backend abstraction is defined in [`StateBackend`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/state/StateBackend.java), and RocksDB state access goes through [`RocksDBValueState`](https://github.com/apache/flink/blob/master/flink-state-backends/flink-statebackend-rocksdb/src/main/java/org/apache/flink/contrib/streaming/state/RocksDBValueState.java).

## Checkpointing: Fault Tolerance Without Stopping

This is Flink's crown jewel. The question: how do you take a consistent snapshot of a distributed, continuously running computation without pausing it?

Flink uses an algorithm based on the **Chandy-Lamport distributed snapshot** algorithm (1985). The idea is to inject special markers called **checkpoint barriers** into the data stream.

### The Algorithm

```
  Step 1: JobManager triggers checkpoint

  JobManager
     |
     | "start checkpoint 42"
     |
     v
  +--------+      +--------+      +--------+
  | Source  | ---> | Map    | ---> |  Sink  |
  +--------+      +--------+      +--------+


  Step 2: Sources inject barriers into the stream

  +--------+                +--------+           +--------+
  | Source  | == [B42] ==>  |  Map   |  ======>  |  Sink  |
  +--------+   data  data   +--------+  data      +--------+
                barrier


  Step 3: Operator receives barrier, snapshots its state

                            +--------+
               == [B42] ==> |  Map   |  == [B42] ==>
                            |        |
                            | state  |---> snapshot to
                            | {k: v} |    durable storage
                            +--------+


  Step 4: Barriers flow through entire graph

  +--------+      +--------+      +--------+
  | Source  |      |  Map   |      |  Sink  |
  | done    |      | done   |      | done   |
  +--------+      +--------+      +--------+
      |               |               |
      v               v               v
    state           state           state
   snapshot        snapshot        snapshot
      \               |              /
       +------>  Checkpoint 42  <---+
               (complete, durable)
```

Here's how it works step by step:

1. The **CheckpointCoordinator** on the JobManager periodically triggers a checkpoint by sending a message to all source operators.
2. Each **source** snapshots its current position (e.g., Kafka offsets), then injects a **checkpoint barrier** into its output stream. The barrier is a special record that flows with the data.
3. When a non-source operator receives a barrier on **all** its inputs, it snapshots its state and forwards the barrier downstream. This is called **barrier alignment**.
4. Once all operators have reported their snapshots, the checkpoint is complete.

The checkpoint coordination logic is in [`CheckpointCoordinator`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/checkpoint/CheckpointCoordinator.java):

```java
// Simplified from CheckpointCoordinator.triggerCheckpoint()
private void triggerCheckpoint(long timestamp) {
    long checkpointId = checkpointIdCounter.getAndIncrement();

    PendingCheckpoint checkpoint = new PendingCheckpoint(
        job, checkpointId, timestamp, tasksToTrigger, tasksToAck);

    // Tell all source tasks to inject barriers
    for (Execution source : tasksToTrigger) {
        source.triggerCheckpoint(checkpointId, timestamp);
    }

    // Wait for all tasks to acknowledge
    // (async — acknowledgements arrive via RPC)
}
```

### Barrier Alignment

When an operator has multiple inputs, it must **align** barriers before snapshotting. This prevents counting records twice or missing records:

```
  Input 1:  data  data  [B42]  data  data
  Input 2:  data  data  data   data  [B42]

  Operator waits for B42 on BOTH inputs before snapshotting.

  While waiting for Input 2's barrier:
  - Records from Input 1 (after its barrier) are BUFFERED
  - Records from Input 2 (before its barrier) are PROCESSED normally

  Once both barriers arrive:
  1. Snapshot state
  2. Forward barrier downstream
  3. Release buffered Input 1 records
```

This alignment ensures the snapshot captures a **consistent cut** — the state reflects having processed all records before the barrier on every input, and none after.

The alignment logic is in [`CheckpointedInputGate`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/io/checkpointing/CheckpointedInputGate.java) and [`SingleCheckpointBarrierHandler`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/runtime/io/checkpointing/SingleCheckpointBarrierHandler.java).

### Unaligned Checkpoints

Barrier alignment has a cost: it buffers data on faster inputs while waiting for slower ones, increasing latency during checkpoints. Flink 1.11+ introduced **unaligned checkpoints** that avoid this:

```
  Aligned:    buffer records from fast input, wait for slow input
              + smaller snapshots
              - latency spike during alignment

  Unaligned:  snapshot in-flight records as part of checkpoint state
              + no latency spike
              - larger snapshots (include buffered network data)
```

With unaligned checkpoints, an operator snapshots immediately when it sees the *first* barrier (from any input), captures all in-flight buffers as part of the snapshot, and overtakes the barriers past any queued data on other inputs. This is particularly useful for jobs with high backpressure.

## Exactly-Once Semantics

Checkpoints give you **exactly-once state semantics** within Flink: if a failure occurs, Flink restores state from the last checkpoint and replays input from the checkpoint's source offsets. Records between the checkpoint and the failure are reprocessed, but because state is rolled back, the computation produces the same result — no duplicates in the state.

But what about **end-to-end** exactly-once? If Flink writes results to Kafka and then fails, those writes are already visible to consumers. After recovery, Flink replays and writes again — duplicates in the output.

Flink solves this with **two-phase commit** for sinks that support transactions:

```
  Checkpoint N starts
       |
       v
  +----------+     +----------+     +------------------+
  | Source    |---->| Operator |---->| Kafka Sink       |
  | (barrier) |     | (process)|     | (pre-commit:     |
  |           |     |          |     |  write to txn)   |
  +----------+     +----------+     +------------------+
                                           |
                          checkpoint N complete (all acks)
                                           |
                                           v
                                    +------------------+
                                    | Kafka Sink       |
                                    | (commit txn)     |
                                    | (now visible to  |
                                    |  consumers)      |
                                    +------------------+
```

1. **Pre-commit**: During normal processing, the sink writes to a Kafka transaction but doesn't commit it. Consumers using `read_committed` isolation can't see these records yet.
2. **Commit**: When the checkpoint completes (all operators acknowledged), the sink commits the transaction. Records become visible atomically.
3. **On failure**: Uncommitted transactions are aborted. After recovery from the last checkpoint, Flink starts a new transaction and re-writes.

The two-phase commit protocol is abstracted in [`TwoPhaseCommitSinkFunction`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/functions/sink/TwoPhaseCommitSinkFunction.java).

## Recovery: What Happens When Things Fail

When a TaskManager crashes or a task throws an exception, the JobMaster detects it and initiates recovery:

```
  Normal execution
  ================

  Source ----> Map ----> Sink
  (offset:    (state:    (txn:
   1000)       {...})     pending)


  Failure! Map task crashes
  =========================

  Source ----> Map [X]    Sink
                 crash!


  Recovery from checkpoint 42
  ============================

  1. Cancel all running tasks
  2. Restore each operator's state from checkpoint 42
  3. Reset source to checkpoint 42's offsets (e.g., 950)
  4. Abort any pending sink transactions
  5. Resume processing from offset 950

  Source ----> Map ----> Sink
  (offset:    (state:    (txn:
   950)       {cp42})    new)
```

The recovery is orchestrated by [`AdaptiveScheduler`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/scheduler/adaptive/AdaptiveScheduler.java) (or `DefaultScheduler` in older versions). It can either restart the entire job from the last checkpoint (**full restart**) or, with newer features, restart just the failed region of the graph (**regional restart**).

## Putting It All Together: A Ride-Sharing Surge Pricing Example

Let's trace the complete flow for our ride-sharing surge pricing system:

```java
// 1. Read ride requests from Kafka
DataStream<RideRequest> rides = env
    .addSource(new FlinkKafkaConsumer<>("ride-requests", ...))
    .assignTimestampsAndWatermarks(
        WatermarkStrategy
            .<RideRequest>forBoundedOutOfOrderness(Duration.ofSeconds(10))
            .withTimestampAssigner((ride, ts) -> ride.getRequestTime()));

// 2. Key by geographic zone and count requests per minute
DataStream<ZoneStats> stats = rides
    .keyBy(ride -> ride.getZoneId())
    .window(SlidingEventTimeWindows.of(Time.minutes(5), Time.minutes(1)))
    .aggregate(new RequestCounter());

// 3. Compute surge multiplier
DataStream<SurgePrice> surges = stats
    .keyBy(stat -> stat.getZoneId())
    .process(new SurgePricingFunction());  // uses ValueState to track history

// 4. Write to Kafka with exactly-once
surges.sinkTo(
    KafkaSink.<SurgePrice>builder()
        .setDeliveryGuarantee(DeliveryGuarantee.EXACTLY_ONCE)
        .build());
```

Here's what happens at runtime:

```
  Kafka partitions          Flink Cluster                    Output Kafka
  +-----------+
  | partition | --> Source[0] --> KeyBy --> Window[zone-A] --> Surge --> Sink
  |    0      |                    |                                     |
  +-----------+                    |                                     v
  | partition | --> Source[1] -----+--> Window[zone-B] --> Surge --> +--------+
  |    1      |                    |                                | output |
  +-----------+                    |                                | topic  |
  | partition | --> Source[2] -----+--> Window[zone-C] --> Surge --> +--------+
  |    2      |
  +-----------+

  Every 30 seconds, CheckpointCoordinator:
  1. Triggers barrier injection at all sources
  2. Sources snapshot Kafka offsets
  3. Window operators snapshot accumulated events + aggregates
  4. Surge operators snapshot their ValueState
  5. Sink pre-commits Kafka transactions
  6. All acknowledge -> checkpoint complete -> sink commits transactions
```

If any TaskManager fails between checkpoints, Flink rolls back to the last checkpoint, resets Kafka consumer offsets, restores all window and surge state, aborts uncommitted sink transactions, and resumes. The output topic sees exactly-once results despite the failure.

## Performance: How Fast Can It Go

Flink's architecture enables high throughput through several mechanisms:

- **Buffer-based transfer**: Records are serialized into 32 KB buffers and sent in batches over the network, not one at a time.
- **Operator chaining**: Fused operators pass records by reference in the same thread — zero serialization overhead.
- **Asynchronous checkpoints**: State backends snapshot in the background (using copy-on-write for heap state, or RocksDB's native snapshots) so processing continues during checkpoints.
- **Incremental checkpoints**: With RocksDB, only changed SST files are uploaded, making checkpoint size proportional to the change rate, not the total state size.

Production Flink clusters routinely process **millions of events per second** per node. Alibaba has reported running Flink at over **4 billion events per second** across their cluster during Singles' Day sales.

## References

1. Carbone et al., "Apache Flink: Stream and Batch Processing in a Single Engine," IEEE Data Engineering Bulletin, 2015 [paper](http://sites.computer.org/debull/A15dec/p28.pdf)
2. Chandy and Lamport, "Distributed Snapshots: Determining Global States of Distributed Systems," ACM TOCS, 1985 [paper](https://lamport.azurewebsites.net/pubs/chandy.pdf)
3. Apache Flink documentation [docs](https://nightlies.apache.org/flink/flink-docs-stable/)
4. Flink checkpoint coordinator [`CheckpointCoordinator.java`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/checkpoint/CheckpointCoordinator.java)
5. Flink stream graph generator [`StreamGraphGenerator.java`](https://github.com/apache/flink/blob/master/flink-streaming-java/src/main/java/org/apache/flink/streaming/api/graph/StreamGraphGenerator.java)
6. Flink watermark strategy [`BoundedOutOfOrdernessWatermarks.java`](https://github.com/apache/flink/blob/master/flink-core/src/main/java/org/apache/flink/api/common/eventtime/BoundedOutOfOrdernessWatermarks.java)
7. Flink state backend [`StateBackend.java`](https://github.com/apache/flink/blob/master/flink-runtime/src/main/java/org/apache/flink/runtime/state/StateBackend.java)
8. Flink network stack and credit-based flow control [blog](https://flink.apache.org/2019/06/05/flink-network-stack.html)
9. The Dataflow Model: A Practical Approach to Balancing Correctness, Latency, and Cost in Massive-Scale, Unbounded, Out-of-Order Data Processing [paper](https://research.google/pubs/the-dataflow-model-a-practical-approach-to-balancing-correctness-latency-and-cost-in-massive-scale-unbounded-out-of-order-data-processing/)
