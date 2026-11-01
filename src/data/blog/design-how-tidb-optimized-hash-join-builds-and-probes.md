---
author: JZ
pubDatetime: 2026-11-01T17:45:00Z
modDatetime: 2026-11-01T17:45:00Z
title: How TiDB's Optimized Hash Join Builds and Probes in Source Code
tags:
  - design-database
  - design-tidb
description: "A focused walkthrough of TiDB's optimized hash join: HashJoinV2Exec, its context, build workers, probe workers, partitions, and spill-to-disk behavior."
---

## Table of contents

## The join that cannot compare every pair

Consider this SQL query:

```sql
SELECT o.id, c.name
FROM orders AS o
JOIN customers AS c ON o.customer_id = c.id;
```

If `orders` has one million rows and `customers` has one hundred thousand, comparing every order to every customer would require one hundred billion comparisons. A **hash join** avoids that. It first builds a hash table from one input, then probes it with rows from the other input. A lookup is usually close to constant time.

This post follows TiDB's optimized implementation in [`pkg/executor/join/hash_join_v2.go`](https://github.com/pingcap/tidb/blob/master/pkg/executor/join/hash_join_v2.go). The file is deliberately performance-oriented, but its story becomes manageable when we focus on five cooperating types:

1. `HashJoinV2Exec` — the executor that owns the lifecycle.
2. `HashJoinCtxV2` — shared configuration and state for one join.
3. `hashTableContext` — temporary row partitions and the final hash table.
4. `BuildWorkerV2` — workers that split build rows and construct buckets.
5. `ProbeWorkerV2` — workers that look up probe rows and emit result chunks.

The word **build** means "put rows into the hash table." **Probe** means "look up matching rows." TiDB chooses which input is build side while planning the query; a smaller build side usually saves memory.

## The cast and its handoffs

TiDB executes operators in chunks, not one Go object per row. The central executor receives a request for the next output chunk, starts the join pipeline once, and then returns chunks produced by workers.

```
                         HashJoinV2Exec
                                |
              +-----------------+------------------+
              |                                    |
       HashJoinCtxV2                       joinResultCh
       keys, join type,                         |
       partitions, trackers                     v
              |                           Next() returns
              v                           result chunks
      hashTableContext
      /              \
rowTables          hashTableV2
  (building)        (probing)
      ^                  ^
      |                  |
BuildWorkerV2       ProbeWorkerV2
```

`HashJoinV2Exec.OpenSelf` resets state and prepares memory and disk trackers. It also installs a spill action when temporary storage is enabled and there is more than one partition. That setup matters: a hash join is fast only while its working set fits in memory, but it must remain correct if a large join does not.

```go
func (e *HashJoinV2Exec) OpenSelf() error {
    e.HashJoinCtxV2.ChunkAllocPool = e.AllocPool
    e.memTracker = memory.NewTracker(e.ID(), -1)
    e.diskTracker = disk.NewTracker(e.ID(), -1)
    e.spillHelper = newHashJoinSpillHelper(e, int(e.partitionNumber), ...)
    // Workers, channels, and runtime statistics are initialized next.
}
```

The exact constructors have been shortened above, but the ownership is the important part: the executor owns resources for the full operator, while the context gives all workers the same join metadata and limits.

## First, divide the hash space

Before processing rows, `HashJoinCtxV2.SetupPartitionInfo` chooses a partition count based on join concurrency. The helper rounds up to a power of two, capped at 16. The code then uses high bits of each 64-bit hash to select a partition:

```go
func getPartitionMaskOffset(partitionNumber uint) int {
    msbPos := bits.TrailingZeros64(uint64(partitionNumber))
    return 64 - msbPos
}

func generatePartitionIndex(hashValue uint64, offset int) uint64 {
    return hashValue >> uint64(offset)
}
```

For eight partitions, three high hash bits select a partition. Build and probe rows with the same join key therefore reach the same partition.

```
hash(key) = 101...  -> partition 5

build row customer_id=7  ----> partition 5
probe row customer_id=7  ----> partition 5  -> same bucket chain
```

Partitioning gives workers independent areas to process and gives the spill mechanism a useful unit: TiDB can write pressure-causing partitions to disk instead of abandoning the entire join.

## The build phase: rows become a searchable table

On the first call to `Next`, `HashJoinV2Exec` initializes `hashTableContext`, channels, and starts `startBuildAndProbe` in a goroutine. That goroutine first calls `fetchAndBuildHashTable`.

The build pipeline has two stages:

```
build-side executor
       |
       | chunks
       v
BuildWorkerV2 splitPartitionAndAppendToRowTable
       |
       | one rowTable per worker and partition
       v
hashTableContext.mergeRowTablesToHashTable
       |
       | balanced build tasks
       v
BuildWorkerV2 buildHashTable -> hashTableV2
```

The first stage lets each build worker append without all workers fighting over one shared row slice. `hashTableContext` holds `rowTables[worker][partition]` while this happens. After input is consumed, `mergeRowTablesToHashTable` combines the per-worker data for each partition, checks whether data must spill, chooses pointer-tagging details, and clears the temporary row-table references once the final table owns the data.

Then the executor creates `buildTask` values that describe a partition and a segment range. `BuildWorkerV2.buildHashTable` consumes those tasks and inserts hash entries. Splitting large partitions into segments prevents one unlucky worker from owning all of a skewed partition.

The code keeps errors and cancellation explicit. Channels carry an error to the coordinator, while `doneCh` tells a producer that a consumer has stopped. This is easy to overlook in concurrent code: a pipeline that returns on error without unblocking its producer can leak goroutines forever.

## The probe phase: fetch, look up, join

Only after the build phase has finished successfully does TiDB run the probe side. `startProbeFetcher` starts a fetcher that reads probe chunks. `startProbeJoinWorkers` starts one `ProbeWorkerV2` per configured worker. Each worker receives chunks through its own channel, hashes the join key, selects the matching partition, and asks the table for candidate build rows.

```
probe-side executor
       |
       v
ProbeSideTupleFetcherV2
       | distributes chunks
       +--------+--------+
       v        v        v
   ProbeWorker  ProbeWorker  ProbeWorker
       |        |        |
       +---- lookup matching partition ----+
                                      |
                                      v
                                joined chunks
                                      |
                                      v
                                joinResultCh -> Next()
```

The high-level coordination is visible in `fetchAndProbeHashTable`:

```go
func (e *HashJoinV2Exec) fetchAndProbeHashTable(ctx context.Context) {
    e.startProbeFetcher(ctx)
    e.startProbeJoinWorkers(ctx)
    e.waiterWg.RunWithRecover(func() {
        e.waitJoinWorkers(start)
    }, nil)
}
```

`ProbeWorkerV2` owns a `ProbeV2` instance, rather than sharing one joiner among workers. That is a concurrency boundary: buffers and selection state used to assemble output chunks stay local to the worker. Finished chunks travel back through `joinResultCh`; `HashJoinV2Exec.Next` swaps a received chunk into the caller's requested chunk and returns it.

For outer joins and some semi/anti join forms, a simple successful lookup is not the entire answer. An unmatched row may need to appear with NULLs, or a build-side row may need later scanning. The `needScanRowTableAfterProbeDone` flag captures this requirement. After probe workers finish, TiDB can call `scanRowTableAfterProbeDone` to produce those remaining semantics.

## What happens when memory runs out

Hash joins are memory-hungry because the build side stays available while probing. TiDB's V2 path can spill partitions to temporary storage when the session memory tracker invokes its fallback action and temporary storage is enabled.

The outer loop in `startBuildAndProbe` is the clue:

```
build + probe in memory
        |
        v
did spill helper leave a partition on disk?
        |
   no --+--> finish
        |
       yes
        |
        v
restore one partition's build and probe chunks, then repeat
```

The executor resets in-memory structures before restoring a saved partition pair. Processing the matching build and probe partition together preserves the crucial invariant: every equal hash key is in the same partition in both phases. TiDB may need multiple rounds if a restored partition is still too large, and `initMaxSpillRound` bounds that work.

This is slower than a pure in-memory join, but it is a graceful degradation. The alternative is a query that exhausts memory and fails even though disk space is available.

## The configuration and operational knobs that matter

The implementation exposes a few practical levers:

- `tidb_hash_join_version` selects the hash join implementation. The source test helpers name `optimized` for this V2 path and `legacy` for the earlier path. Check the [current TiDB system-variable documentation](https://docs.pingcap.com/tidb/stable/system-variables) for the release-specific default and supported values.
- Join concurrency controls how many build/probe workers can run. More workers can help a large join, but they increase scheduling work, memory pressure, and possible data skew. The source uses this value to size channels and choose partitions.
- Temporary storage must be available for spill-to-disk recovery. Disk-backed execution protects availability but changes the latency and disk-I/O profile of the query.
- `EXPLAIN ANALYZE` is the right first inspection tool: look for the selected join operator, actual row counts, execution time, and memory/disk details before changing a setting.

The optimizer's choice still matters more than a knob. A very large build side, poor cardinality estimates, or a highly skewed join key can make any hash join costly. An index lookup, a different join order, or fresher statistics can be the better fix.

## A compact mental model

When reading `hash_join_v2.go`, keep this sequence in mind:

1. `HashJoinV2Exec` initializes trackers, channels, and workers.
2. `BuildWorkerV2` hashes build rows into partitioned `rowTable` data.
3. `hashTableContext` merges that temporary data and builds the searchable hash table.
4. `ProbeWorkerV2` hashes probe rows into the same partitions and emits matching chunks.
5. The executor repeats a partition-at-a-time round if spilling occurred, then cleans up in `Close`.

That division lets TiDB combine vectorized chunks, parallel workers, and memory safety without making each row lookup pay for global synchronization. The details are optimized, but the core database idea remains pleasantly simple: organize one side once, then use that organization to find the other side quickly.

## References

1. TiDB source: [`pkg/executor/join/hash_join_v2.go`](https://github.com/pingcap/tidb/blob/master/pkg/executor/join/hash_join_v2.go)
2. TiDB source: [`pkg/executor/join/hash_join_base.go`](https://github.com/pingcap/tidb/blob/master/pkg/executor/join/hash_join_base.go)
3. TiDB documentation: [Join reorder algorithm](https://docs.pingcap.com/tidb/stable/join-reorder)
4. TiDB documentation: [EXPLAIN ANALYZE](https://docs.pingcap.com/tidb/stable/explain-analyze)
5. TiDB documentation: [Memory control](https://docs.pingcap.com/tidb/stable/configure-memory-usage)
6. Graefe, Goetz. [Query Evaluation Techniques for Large Databases](https://doi.org/10.1145/568271.223872), 1993.
