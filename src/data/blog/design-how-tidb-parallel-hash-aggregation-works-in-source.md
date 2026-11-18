---
author: JZ
pubDatetime: 2026-11-18T19:32:00Z
modDatetime: 2026-11-18T19:32:00Z
title: System Design - How TiDB Parallel Hash Aggregation Works in Source
tags:
  - design-system
  - design-database
description: "A source-level tour of TiDB's root HashAgg plan, partial and final workers, group-key routing, result chunks, and memory spill settings."
---

## Table of contents

## The question is how to group unsorted rows

Imagine a report that counts orders by region:

```sql
SELECT region, COUNT(*)
FROM orders
GROUP BY region;
```

Rows from storage can arrive in any order. A streaming aggregate works well when rows with the same region arrive together, but otherwise TiDB needs to remember the running state for many regions. Hash aggregation does that with a map from each group key to its aggregate state.

TiDB can run aggregation at the storage coprocessor, the TiDB server, or other execution layers. This post follows the Go **root HashAgg** in `pkg/executor/aggregate`, where TiDB itself builds the result. The same `HashAgg` label in an `EXPLAIN` plan can describe a different implementation in TiKV or TiFlash; those paths are outside this walkthrough.

## From a physical plan to an executor

The optimizer represents this choice with `PhysicalHashAgg`. It considers several task locations, including the root task and coprocessor tasks, and later cost and pushdown decisions choose among them. When the root executor is needed, `executorBuilder.buildHashAgg` builds the child executor and creates a `HashAggExec` with the physical plan's group expressions. The [builder implementation](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/builder.go#L2443-L2530) is the bridge from the optimizer's plan to runnable workers.

For the parallel path, the builder splits each aggregate into partial and final functions. For example, a partial `AVG(amount)` keeps a sum and a count. Each final worker merges those values and divides the total sum by the total count. It cannot average the partial averages unless every partial worker saw the same number of rows.

The main pieces work together like this:

```text
                         PhysicalHashAgg
                               |
                         executorBuilder
                               |
                          HashAggExec
                    /          |           \
                   /           |            \
        child fetcher     partial workers    final workers
        reads chunks       build local maps   merge map shards
                               |                    ^
                               +-- route by key ---+
                                                    |
                                          result chunks to parent
```

`HashAggExec` owns the channels and starts the child fetcher and worker goroutines when its parent first calls `Next`. The fetcher reads one child chunk at a time and hands reusable chunks to partial workers. Each worker updates its own group map; it does not share a mutable map with the other partial workers. The executor creates those channels and workers in its [parallel initialization path](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_executor.go#L386-L453).

## Partial workers reduce rows to group state

Suppose a partial worker sees two chunks like these:

```text
chunk 1: (east, 10)  (west, 5)
chunk 2: (east,  7)  (east, 3)
```

It builds one partial state per group that it has seen. For `SUM(amount)`, its local map becomes `east -> 20` and `west -> 5`. If a different partial worker also saw east rows, that worker has its own east state. The partial stage has compressed repeated input rows into fewer intermediate group states, but those states still need to be combined.

In source, `HashAggPartialWorker.getPartialResultsOfEachRow` hashes the encoded group key with Murmur3 and takes the result modulo the number of final workers. The partial worker keeps one map per final worker. Every copy of the same group key therefore goes to the same final worker, even when different partial workers saw it. It then [sends each map shard to its assigned final worker](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_partial_worker.go#L223-L295).

The shuffle moves **maps of partial aggregate state**, not the original rows. A partial worker sends each of its maps on the channel assigned to that map's final worker. That keeps the final stage's work partitioned by group key.

## Final workers combine the pieces

Assume two partial workers both saw east:

```text
partial worker 0: east -> SUM 20, COUNT 3
partial worker 1: east -> SUM 12, COUNT 2
                         |
                         v
final worker for east:   SUM 32, COUNT 5
                         AVG 6.4
```

A `HashAggFinalWorker` reads the maps routed to it. If a group is new, it adopts that partial state; if the group is already present, it calls the aggregate function's merge method. Once all partial workers have finished, the final worker appends completed values to a reusable output chunk. The source's [merge and result code](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_final_worker.go#L78-L189) handles these states.

The code starts final worker goroutines alongside the partial workers, but each final worker waits for the partial workers to finish before it consumes their maps. That means this implementation has two worker stages and channels between them, but final aggregation does not begin while partial workers are still reading the child.

When a final worker's output chunk fills, it sends the chunk to `HashAggExec`. The next parent call to `Next` receives a result, swaps its columns into the caller's chunk, and returns. Hash maps do not preserve group order, and SQL `GROUP BY` does not promise one; add `ORDER BY region` if result ordering matters.

## Memory pressure changes the path

The partial maps grow with the number of distinct group keys and the size of each aggregate state. When the memory tracker asks HashAgg to spill, the fetcher pauses new input and waits for in-flight partial work. The partial workers serialize their maps into disk partitions, grouped by key. Final workers restore those partitions one at a time, merge the partial states, and emit the same grouped results.

A few settings affect this behavior:

- `tidb_executor_concurrency` controls both the partial and final worker counts for the root executor. The current source defaults it to 5, so an unset hash-aggregation partial or final concurrency inherits 5. Raising it can use more CPU, but it also creates more worker maps and buffers.
- `tidb_hashagg_partial_concurrency` and `tidb_hashagg_final_concurrency` are older per-stage controls. TiDB marks them deprecated in favor of `tidb_executor_concurrency`; leave them unset unless you are maintaining an existing configuration that depends on them.
- `tidb_track_aggregate_memory_usage` is ON by default and tracks aggregate-function memory. The TiDB documentation warns that disabling it can make statement memory usage inaccurate and harder to control.
- `tidb_enable_parallel_hashagg_spill` is ON by default in the inspected source. This root spill path also checks that aggregate memory tracking and global `tidb_enable_tmp_storage_on_oom` are enabled; the temporary-storage setting makes spill available when a statement exceeds its memory quota. Check the system-variable documentation for the TiDB version you operate.

The relevant implementation is in TiDB source at commit `31134f349d73c8352d3fe44aa10a79da779b8c18`. This commit is the reference for the file and line links below; check the source for the TiDB version you run before tuning behavior.

## Confirm the plan's execution layer

Use `EXPLAIN ANALYZE` to see which aggregation operators the optimizer chose. The official aggregation guide shows that TiDB can perform aggregation in both coprocessor and TiDB layers. For a concrete plan to inspect, try:

```sql
EXPLAIN ANALYZE
SELECT /*+ HASH_AGG() */ region, COUNT(*)
FROM orders
GROUP BY region;
```

If a plan contains `HashAgg` under `cop[tikv]` or an MPP task, it is not the root Go executor traced here; check the task column and follow the root operator when it appears there.

For a root plan, `HashAgg` is a small map-reduce pipeline: partial workers combine rows locally, a hash of each group key assigns its final owner, and final workers merge the partial states into output chunks. This lets TiDB aggregate unordered input in parallel. High cardinality increases map memory, while key skew can leave one final worker with more groups than the others.

## References

1. TiDB documentation, [Using Aggregation](https://docs.pingcap.com/tidb/stable/explain-aggregation/).
2. TiDB documentation, [System Variables: tidb_executor_concurrency](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_executor_concurrency), [tidb_track_aggregate_memory_usage](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_track_aggregate_memory_usage), [tidb_enable_parallel_hashagg_spill](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_parallel_hashagg_spill), and [tidb_enable_tmp_storage_on_oom](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_tmp_storage_on_oom).
3. TiDB source, [PhysicalHashAgg](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/planner/core/operator/physicalop/physical_hash_agg.go#L38-L101) and [executorBuilder.buildHashAgg](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/builder.go#L2443-L2530).
4. TiDB source, [HashAggExec initialization and worker lifecycle](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_executor.go#L386-L453) and [parallel result delivery](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_executor.go#L594-L688).
5. TiDB source, [HashAggPartialWorker group routing and shuffling](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_partial_worker.go#L223-L295).
6. TiDB source, [HashAggFinalWorker map merging and output](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_final_worker.go#L78-L189) and [worker startup](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_final_worker.go#L218-L239).
7. TiDB source, [concurrency fallbacks](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/sessionctx/variable/session.go#L3505-L3518), [system-variable registration](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/sessionctx/variable/sysvar.go#L2372-L2376), [aggregate memory tracking](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/sessionctx/variable/sysvar.go#L3137-L3140), [temporary storage on OOM](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/sessionctx/variable/sysvar.go#L1862-L1866), and [parallel spill gate](https://github.com/pingcap/tidb/blob/31134f349d73c8352d3fe44aa10a79da779b8c18/pkg/executor/aggregate/agg_hash_executor.go#L405-L441).
