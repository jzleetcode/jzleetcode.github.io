---
author: JZ
pubDatetime: 2026-04-16T06:23:00Z
modDatetime: 2026-04-16T06:23:00Z
title: System Design - How Apache Kafka Works
tags:
  - design-system
  - design-concurrency
description:
  "How Apache Kafka works internally: the distributed commit log, partitions, replication with ISR, producer batching, consumer groups, zero-copy transfer, and source code walkthrough from the apache/kafka repository."
---

## Table of contents

## Context

Imagine you are building a food delivery app. Orders come in from customers. The kitchen needs to know about new orders. The delivery team needs to know when food is ready. The billing system needs to charge the customer. The analytics dashboard wants to track order volume.

You could wire each system directly to every other system, but that quickly becomes a mess:

```
  Customer App ----> Kitchen System
  Customer App ----> Billing System
  Customer App ----> Analytics
  Kitchen System --> Delivery System
  Kitchen System --> Analytics
  Billing System --> Analytics
  ...
```

Every time you add a new system, you have to update all the others. This is the **coupling problem**. What you really want is a central place where events land, and each downstream system picks up what it needs at its own pace.

That central place is **Apache Kafka** — a distributed, fault-tolerant **commit log** that decouples producers (systems that generate events) from consumers (systems that process events).

```
                      Apache Kafka Cluster

  +-----------+     +-----------------------------------+     +-----------+
  | Customer  |---->|                                   |---->| Kitchen   |
  |   App     |     |         Kafka Brokers             |     | System    |
  +-----------+     |                                   |     +-----------+
                    |  +-------+ +-------+ +-------+   |
  +-----------+     |  |Broker | |Broker | |Broker |   |     +-----------+
  | Kitchen   |---->|  |  0    | |  1    | |  2    |   |---->| Delivery  |
  | System    |     |  +-------+ +-------+ +-------+   |     | System    |
  +-----------+     |                                   |     +-----------+
                    |  Topics split into partitions,    |
                    |  replicated across brokers        |     +-----------+
                    |                                   |---->| Analytics |
                    +-----------------------------------+     +-----------+
```

Kafka was originally built at LinkedIn in 2010 to handle the firehose of activity events (page views, searches, connections) flowing between hundreds of services. It was open-sourced in 2011 and became an Apache top-level project in 2012. Today it handles **trillions of messages per day** at companies like LinkedIn, Netflix, Uber, and Pinterest.

Let's open the hood and see how it works.

## The Commit Log: Kafka's Core Abstraction

At its heart, Kafka is a **distributed, append-only commit log**. If you've worked with databases, you know about the Write-Ahead Log (WAL) — a sequential file where every change is recorded before it's applied. Kafka takes this idea and makes it the entire product.

A **topic** is a named stream of events (like `orders`, `payments`, `page-views`). Each topic is split into one or more **partitions**. Each partition is an independent, ordered, append-only log:

```
  Topic: "orders"

  Partition 0:  [0] [1] [2] [3] [4] [5] [6] [7] ...
  Partition 1:  [0] [1] [2] [3] [4] [5] ...
  Partition 2:  [0] [1] [2] [3] [4] [5] [6] [7] [8] ...
                 ^                                 ^
                 |                                 |
              oldest                            newest
              message                           message

  Each box is a record with an offset (sequential ID).
  Order is guaranteed WITHIN a partition, not across partitions.
```

**Why partitions?** Parallelism. If you have one giant log, only one machine can write to it and one machine can read from it. By splitting a topic into partitions, you spread the load across multiple brokers (Kafka servers). Each partition lives on a different broker, so multiple producers and consumers can work in parallel.

## How Messages Land on Disk

When a producer sends a record to a partition, the broker appends it to the **active log segment** on disk. A partition's data is stored as a sequence of segment files:

```
  Partition directory: /data/kafka/orders-0/

  00000000000000000000.log          <-- segment file (actual messages)
  00000000000000000000.index        <-- offset index
  00000000000000000000.timeindex    <-- timestamp index
  00000000000000345678.log          <-- next segment (starts at offset 345678)
  00000000000000345678.index
  00000000000000345678.timeindex
```

Each segment is named after its **base offset** — the first offset it contains. The three files for each segment serve different purposes:

- **`.log`** — The actual message bytes, written sequentially. Each record contains a key, value, timestamp, headers, and offset.
- **`.index`** — A sparse index mapping offsets to byte positions in the `.log` file. "Sparse" means it stores an entry every N records (configurable), not every record.
- **`.timeindex`** — Maps timestamps to offsets, enabling time-based lookups like "give me all messages after 2pm."

The key class that manages a single segment is [`LogSegment`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java):

```java
public class LogSegment implements Closeable {
    private final FileRecords log;           // the .log file
    private final OffsetIndex offsetIndex;   // the .index file
    private final TimeIndex timeIndex;       // the .timeindex file
    private final long baseOffset;           // first offset in this segment

    // Append a batch of records to this segment
    public void append(long largestOffset, long largestTimestamp,
                       long shiftingOffset, MemoryRecords records) {
        int appendedBytes = log.append(records);
        // Update the offset index (sparse, every indexIntervalBytes)
        if (bytesSinceLastIndexEntry > indexIntervalBytes) {
            offsetIndex.append(largestOffset, physicalPosition);
            timeIndex.maybeAppend(largestTimestamp, largestOffset);
            bytesSinceLastIndexEntry = 0;
        }
    }
}
```

When a segment grows beyond the configured size (default **1 GB**) or age, the broker "rolls" it — closes the current segment and creates a new one. Old segments are eligible for deletion or compaction based on the topic's retention policy.

The full partition log is managed by [`UnifiedLog`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java), which coordinates multiple segments and tracks key offsets:

```
  UnifiedLog for partition "orders-0"

  +------------------------------------------------------------+
  |                                                            |
  |  logStartOffset        highWatermark      logEndOffset     |
  |       |                     |                  |           |
  |       v                     v                  v           |
  |  [0] [1] ... [345677] [345678] ... [345700] [345701]      |
  |  |--- segment 0 ---|  |------ active segment --------|    |
  |                                                            |
  |  logStartOffset: earliest available (older data deleted)   |
  |  highWatermark:  last offset replicated to all ISR         |
  |  logEndOffset:   next offset to be written (LEO)           |
  +------------------------------------------------------------+
```

The **high watermark** is crucial: consumers can only read up to this point. It represents the last offset that has been safely replicated to all in-sync replicas. We'll see why this matters in the replication section.

## How the Offset Index Works

When a consumer asks to read from offset 345,690, Kafka needs to find the byte position in the `.log` file quickly. It does a two-step lookup:

```
  Consumer requests: "read from offset 345690"

  Step 1: Binary search the .index file
  +-------------------------------------+
  | offset  |  position (bytes in .log) |
  |---------|---------------------------|
  | 345678  |  0                        |
  | 345682  |  4096                     |  <-- largest entry <= 345690
  | 345695  |  12288                    |
  | ...     |  ...                      |
  +-------------------------------------+
  Result: start scanning from byte 4096

  Step 2: Sequential scan from byte 4096 in .log
  until we find offset 345690
```

The index files are **memory-mapped** (`mmap`), so the OS kernel manages caching them in RAM. This is why Kafka doesn't need a large JVM heap — the OS page cache does the heavy lifting.

The [`OffsetIndex`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/OffsetIndex.java) class handles this:

```java
public class OffsetIndex extends AbstractIndex {
    // Each entry is 8 bytes: 4 bytes relative offset + 4 bytes position
    private static final int ENTRY_SIZE = 8;

    // Binary search to find the largest offset <= targetOffset
    public OffsetPosition lookup(long targetOffset) {
        // ... binary search over memory-mapped entries ...
    }
}
```

Each index entry is tiny: 4 bytes for a relative offset (relative to the segment's base offset, saving space) and 4 bytes for the file position. This keeps the index small enough to stay in memory even for very large partitions.

## Replication: How Kafka Survives Failures

A single copy of your data on one machine is a disaster waiting to happen. Kafka replicates every partition across multiple brokers. When you create a topic, you set a **replication factor** (commonly 3):

```
  Topic: "orders", 3 partitions, replication factor = 3

  Broker 0            Broker 1            Broker 2
  +-------------+    +-------------+    +-------------+
  | P0 (leader) |    | P0 (follower)|   | P0 (follower)|
  | P1 (follower)|   | P1 (leader) |    | P1 (follower)|
  | P2 (follower)|   | P2 (follower)|   | P2 (leader) |
  +-------------+    +-------------+    +-------------+

  Each partition has exactly one leader and N-1 followers.
  All reads and writes go through the leader.
```

### The ISR (In-Sync Replicas) Set

Not all followers are necessarily up-to-date. Kafka tracks which replicas are "in sync" with the leader in a set called the **ISR** (In-Sync Replicas):

```
  Partition 0 replication state:

  Leader (Broker 0):     offset 0  1  2  3  4  5  6  7  8  9
                                                              ^
                                                             LEO = 10
  Follower (Broker 1):   offset 0  1  2  3  4  5  6  7
                                                        ^
                                                       LEO = 8  (in ISR)

  Follower (Broker 2):   offset 0  1  2  3
                                           ^
                                          LEO = 4  (REMOVED from ISR)

  High Watermark = min(LEO of all ISR members) = 8
  Consumers can read up to offset 7.
```

A follower stays in the ISR as long as it has fetched data from the leader within `replica.lag.time.max.ms` (default 30 seconds). If a follower falls behind (due to slow disk, network issues, or GC pauses), the leader removes it from the ISR.

The [`ReplicaManager`](https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/server/ReplicaManager.scala) tracks ISR membership:

```scala
// Periodically check if any replica should be removed from ISR
def maybeShrinkIsr(): Unit = {
  // For each partition this broker leads:
  //   Check each replica's last fetch time
  //   If (now - lastFetchTime) > replicaLagTimeMaxMs:
  //     Remove replica from ISR
  //     Update high watermark
}
```

### Leader Election

When a leader broker goes down, the cluster controller picks a new leader from the ISR. This is fast because ISR members are guaranteed to have all committed data:

```
  Before failure:
    ISR = {Broker 0 (leader), Broker 1, Broker 2}

  Broker 0 crashes:
    Controller detects via heartbeat timeout
    New leader = first available broker in ISR
    ISR = {Broker 1 (new leader), Broker 2}

  Broker 0 comes back:
    Truncates its log to the high watermark
    Fetches missing data from new leader
    Rejoins ISR once caught up
```

In older versions of Kafka, the controller ran on a single broker elected via ZooKeeper. Since Kafka 3.3 (2022), the controller uses **KRaft** (Kafka Raft) — a built-in Raft consensus protocol — eliminating the ZooKeeper dependency entirely.

## Producer: How Messages Get Into Kafka

When your application calls `producer.send(record)`, the record doesn't immediately fly over the network. The producer client batches records for efficiency.

### The RecordAccumulator

The [`RecordAccumulator`](https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java) sits inside the producer client and groups records by destination partition:

```
  Producer Application
  +--------------------------------------------------+
  |                                                  |
  |  producer.send(order1) --+                       |
  |  producer.send(order2) --+--> RecordAccumulator  |
  |  producer.send(order3) --+         |             |
  |                                    |             |
  |                         +----------+----------+  |
  |                         |                     |  |
  |                    Partition 0            Partition 1
  |                    batch:                 batch:
  |                    [order1, order3]       [order2]
  |                         |                     |  |
  |                         +----------+----------+  |
  |                                    |             |
  |                              Sender thread       |
  |                           (background, async)    |
  |                                    |             |
  +------------------------------------+-------------+
                                       |
                                       v
                              Broker (network)
```

The accumulator uses a **BufferPool** bounded by `buffer.memory` (default 32 MB) to manage memory. Records accumulate until one of these triggers fires:

1. **Batch full** — the batch reaches `batch.size` (default 16 KB).
2. **Linger expired** — `linger.ms` has elapsed since the first record was added (default 0ms, meaning send immediately).
3. **Memory pressure** — the buffer pool is nearly full.
4. **Explicit flush** — the application calls `producer.flush()`.

```java
public class RecordAccumulator {
    private final BufferPool free;              // bounded memory pool
    private final ConcurrentMap<TopicPartition,
        Deque<ProducerBatch>> batches;          // per-partition batch queue

    public RecordAppendResult append(String topic, int partition,
            byte[] key, byte[] value, ...) {
        // Find or create a batch for this partition
        Deque<ProducerBatch> dq = getOrCreateDeque(tp);
        // Try to append to the last batch
        ProducerBatch last = dq.peekLast();
        if (last != null) {
            FutureRecordMetadata future = last.tryAppend(key, value, ...);
            if (future != null) return new RecordAppendResult(future, ...);
        }
        // Batch is full or doesn't exist — allocate a new one
        ByteBuffer buffer = free.allocate(batchSize);
        ProducerBatch batch = new ProducerBatch(tp, buffer);
        dq.addLast(batch);
        // ...
    }
}
```

### Acknowledgment Levels (acks)

The `acks` configuration controls how many brokers must confirm a write before the producer considers it successful:

```
  acks=0: Fire and forget
  +----------+                +--------+
  | Producer |---send-------->| Leader |     No response waited.
  +----------+                +--------+     Fastest, but data can be lost.


  acks=1: Leader confirms
  +----------+                +--------+
  | Producer |---send-------->| Leader |---> writes to local log
  +----------+<------ack------+--------+     Leader crash before replication
                                             means data loss.


  acks=all (-1): Full ISR confirms
  +----------+                +--------+     +----------+ +----------+
  | Producer |---send-------->| Leader |---->| Follower | | Follower |
  +----------+                +--------+     +----------+ +----------+
                                  |  wait for all ISR to replicate...
  +----------+<------ack---------+
  | Producer |                            Slowest, but no data loss as
  +----------+                            long as at least one ISR survives.
```

With `acks=all`, the leader waits until every broker in the ISR has written the record before responding. Combined with `min.insync.replicas=2`, this guarantees that at least 2 copies exist before the producer gets a success response.

## Consumer Groups: How Messages Get Out of Kafka

A **consumer group** is a set of consumer instances that cooperate to read from a topic. Kafka assigns each partition to exactly one consumer in the group, so records are processed in parallel without duplication:

```
  Topic "orders" with 4 partitions
  Consumer Group: "kitchen-service"

  +------+    +------+    +------+    +------+
  |  P0  |    |  P1  |    |  P2  |    |  P3  |
  +--+---+    +--+---+    +--+---+    +--+---+
     |           |           |           |
     v           v           v           v
  +-------+  +-------+  +-------+  +-------+
  |Consumer|  |Consumer|  |Consumer|  |Consumer|
  |   A    |  |   B    |  |   B    |  |   C    |
  +-------+  +-------+  +-------+  +-------+

  Consumer A reads P0, Consumer B reads P1+P2, Consumer C reads P3.
  If Consumer B crashes, its partitions are reassigned to A and C.
```

### Rebalancing

When a consumer joins or leaves a group, Kafka triggers a **rebalance** — partitions are redistributed among the remaining consumers. The process is coordinated by a **GroupCoordinator**, one of the brokers designated for this group.

```
  Rebalance triggered (Consumer B crashed)

  1. Remaining consumers send JoinGroup to coordinator
  2. Coordinator picks a "leader" consumer
  3. Leader consumer runs the partition assignment strategy
     (e.g., RangeAssignor, RoundRobinAssignor)
  4. Leader sends assignments to coordinator
  5. Coordinator sends SyncGroup to each consumer with its partitions

  Before:  A=[P0]       B=[P1,P2]    C=[P3]
  After:   A=[P0,P1]    (dead)       C=[P2,P3]
```

The [`GroupCoordinator`](https://github.com/apache/kafka/blob/trunk/group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupCoordinator.java) manages the lifecycle:

```java
public interface GroupCoordinator {
    // Consumer joins the group
    CompletableFuture<JoinGroupResponseData> joinGroup(JoinGroupRequestData request);

    // Consumer syncs its assignment
    CompletableFuture<SyncGroupResponseData> syncGroup(SyncGroupRequestData request);

    // Consumer commits its progress
    CompletableFuture<OffsetCommitResponseData> commitOffsets(OffsetCommitRequestData request);

    // Consumer sends heartbeat to stay alive
    CompletableFuture<HeartbeatResponseData> heartbeat(HeartbeatRequestData request);
}
```

### Offset Tracking

Each consumer tracks which records it has processed by committing **offsets** to a special internal topic called `__consumer_offsets`:

```
  Consumer A reads from partition 0:

  Partition 0:  [0] [1] [2] [3] [4] [5] [6] [7] [8] [9]
                                  ^                    ^
                                  |                    |
                            committed offset      current position
                            (saved in __consumer_offsets)

  If Consumer A crashes and restarts (or another consumer takes over),
  it reads the committed offset and resumes from offset 5.
```

The `__consumer_offsets` topic has 50 partitions by default. A consumer group's coordinator is the broker that leads the partition determined by `hash(group_id) % 50`. This spreads coordinator load across the cluster.

Offset commits are just regular Kafka messages written to `__consumer_offsets`, which means they are replicated and durable just like any other topic.

## Zero-Copy: Why Kafka Is Fast

When a consumer fetches data, a naive implementation would:

```
  Disk --> Kernel Buffer --> User Space (JVM) --> Kernel Buffer --> Network

  4 copies, 2 context switches. Slow.
```

Kafka avoids this using **zero-copy transfer** via Java NIO's `FileChannel.transferTo()`, which maps to the Linux `sendfile()` system call:

```
  Disk --> Kernel Buffer -----> Network
                (DMA)      (DMA, direct)

  0 copies through user space. 2 DMA transfers only.
```

The data goes straight from the OS page cache to the network interface card, never touching the JVM heap. This is why Kafka can serve consumers at disk-sequential-read speed (hundreds of MB/s per partition) with minimal CPU overhead.

This works because Kafka stores messages in the same binary format on disk, in memory, and over the network. There is no deserialization or transformation on the broker — it simply moves bytes from file to socket.

## Putting It All Together: A Record's Journey

Let's trace a single order event from producer to consumer:

```
  Step 1: Producer sends record
  +----------+
  | Producer |  record: {key: "order-42", value: "{...}"}
  +----+-----+
       |
       | 1a. Serializer converts key and value to bytes
       | 1b. Partitioner picks partition (hash(key) % numPartitions)
       |     hash("order-42") % 3 = partition 1
       | 1c. RecordAccumulator batches it with other partition-1 records
       | 1d. Sender thread ships batch to Broker 1 (leader of partition 1)
       |
       v
  Step 2: Leader broker appends to log
  +----------+
  | Broker 1 |  (leader of orders-1)
  +----+-----+
       |
       | 2a. Append batch to active LogSegment (.log file)
       | 2b. Update offset index (.index) and time index (.timeindex)
       | 2c. Assign offset 5678 to this record
       | 2d. Follower brokers fetch and replicate the data
       | 2e. Once ISR confirms, advance high watermark
       | 2f. If acks=all, send acknowledgment to producer
       |
       v
  Step 3: Consumer reads the record
  +----------+
  | Consumer |  (consumer group "kitchen-service", assigned partition 1)
  +----+-----+
       |
       | 3a. Fetch request: "give me records from partition 1, offset 5678"
       | 3b. Broker finds the segment containing offset 5678
       | 3c. Binary search the .index to find byte position
       | 3d. Zero-copy transfer from .log file to network socket
       | 3e. Consumer deserializes and processes the record
       | 3f. Consumer commits offset 5679 to __consumer_offsets
       |
       Done! The kitchen system knows about order 42.
```

## Key Design Decisions That Make Kafka Work

Five design choices set Kafka apart:

```
  Decision                    Why it matters
  -------------------------  ------------------------------------------
  1. Append-only log          Sequential disk I/O is ~100x faster than
                              random I/O. Kafka writes never seek.

  2. Partitioning             Horizontal scaling: add brokers and
                              partitions to increase throughput linearly.

  3. Pull-based consumers     Consumers control their own pace. A slow
                              analytics job doesn't block a fast kitchen
                              service. Consumers can even rewind.

  4. Retention, not deletion  Records stay for a configurable time
                              (default 7 days) regardless of whether
                              they've been consumed. Multiple consumer
                              groups can read independently.

  5. Zero-copy I/O            The broker is a "dumb pipe" that moves
                              bytes efficiently. Serialization lives in
                              clients, not the broker.
```

## References

1. Apache Kafka documentation — Design [doc](https://kafka.apache.org/documentation/#design)
2. Kafka: a Distributed Messaging System for Log Processing (original paper) [paper](https://www.microsoft.com/en-us/research/publication/kafka-a-distributed-messaging-system-for-log-processing/)
3. LogSegment implementation [`storage/.../log/LogSegment.java`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java)
4. UnifiedLog implementation [`storage/.../log/UnifiedLog.java`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java)
5. OffsetIndex implementation [`storage/.../log/OffsetIndex.java`](https://github.com/apache/kafka/blob/trunk/storage/src/main/java/org/apache/kafka/storage/internals/log/OffsetIndex.java)
6. RecordAccumulator (producer batching) [`clients/.../producer/internals/RecordAccumulator.java`](https://github.com/apache/kafka/blob/trunk/clients/src/main/java/org/apache/kafka/clients/producer/internals/RecordAccumulator.java)
7. GroupCoordinator (consumer groups) [`group-coordinator/.../GroupCoordinator.java`](https://github.com/apache/kafka/blob/trunk/group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupCoordinator.java)
8. ReplicaManager (replication) [`core/.../server/ReplicaManager.scala`](https://github.com/apache/kafka/blob/trunk/core/src/main/scala/kafka/server/ReplicaManager.scala)
9. KRaft: Apache Kafka Without ZooKeeper [KIP-500](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)
