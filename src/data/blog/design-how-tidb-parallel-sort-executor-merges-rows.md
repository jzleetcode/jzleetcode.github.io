---
author: JZ
pubDatetime: 2026-10-25T18:36:00Z
modDatetime: 2026-10-25T18:36:00Z
title: System Design - How TiDB's Parallel Sort Executor Merges Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's PhysicalSort, SortExec, parallelSortWorker, and multiWayMerger as they sort chunks and merge worker results, with memory and spill settings."
---

## Table of contents

## The leaderboard that arrived out of order

Suppose a game records scores in whatever order players finish:

```sql
SELECT player, score FROM scores ORDER BY score DESC;
```

If TiDB chooses a root `Sort` operator, it must produce a globally ordered stream even when its child sends unsorted **chunks** (batches of rows). Several workers can sort their own slices in parallel, but that is not enough: `[90, 70]` from one worker and `[95, 80]` from another must become `[95, 90, 80, 70]` for the caller. This article follows that handoff through four source units in [`pingcap/tidb` at commit `0073665`](https://github.com/pingcap/tidb/tree/0073665a657ecc5b31f88b410504647395772ebb), dated October 24, 2026. It describes the root **parallel `SortExec`** path, not TiKV-side sorting, every `ORDER BY` plan, or the separate `TopN` algorithm. Use `EXPLAIN` to see which plan your query actually got.

## Four pieces on the stage

```text
 +-------------------+       +------------------------+
 | PhysicalSort      |------>| builder.buildSort      |
 | ORDER BY keys     |       | wires child + ByItems  |
 +-------------------+       +-----------+------------+
                                         |
                                         v
  unsorted child chunks -------> +-------+---------+
                                 | SortExec        |
                                 | fetcher/channel |
                                 +---+---------+---+
                                     |         ^
                                     v         | sorted worker streams
                              +------+---------+------+
                              | parallelSortWorker x N |
                              | sort local row batches |
                              +------------+-----------+
                                           |
                                           v
                              +------------+-----------+
                              | multiWayMerger          |
                              | globally ordered rows  |
                              +------------+-----------+
                                           |
                                           v
                                    caller's chunk
```

[`PhysicalSort`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/planner/core/operator/physicalop/physical_sort.go#L34-L47) carries the `ByItems` expressions and directions for the chosen physical plan. [`executorBuilder.buildSort`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/builder.go#L2967-L2979) builds its child, then gives those `ByItems` to a `SortExec`. The builder itself is the wiring step, not another sorting algorithm.

[`SortExec`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L42-L100) owns the child, channels, workers, comparison functions, result merger, and memory/disk trackers. A [`parallelSortWorker`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/parallel_sort_worker.go#L33-L61) sorts local rows, while [`multiWayMerger`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/multi_way_merge.go#L161-L204) picks the next row across sorted inputs using a heap. These are Go structs, not separate network services.

## From a child's chunks to sorted worker streams

On [`Open`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L155-L191), `SortExec` creates `ExecutorConcurrency` workers and channels. In this pinned revision it explicitly sets `IsUnparallel = false` on the normal path; the alternative un-parallelized code remains in the file, but is not the path we follow. The first [`Next`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L265-L302) initializes key comparators and starts the fetch/sort pipeline. Later `Next` calls drain the already-started ordered result channel into the caller's chunk.

The [fetcher repeatedly pulls chunks from the child](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L701-L758) and puts them on a shared channel. [`fetchChunksParallel`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L661-L682) launches the workers and a result generator. A worker accumulates rows, [sorts a batch with `slices.SortFunc`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/parallel_sort_worker.go#L159-L193), and, if it made several locally sorted batches, merges those batches into **one sorted iterator for that worker**. Workers share the input channel, so which worker receives a given chunk is not a property of the SQL query.

The comparison is not a string comparison of printed values. [`SortExec` builds type-specific comparison functions from the ORDER BY expressions](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L764-L788); its [`lessRow` compares keys in order and reverses a nonzero comparison for `DESC`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L804-L816). If two rows tie on **all** `ORDER BY` keys, do not assume a stable order between them; add a unique tie-breaker such as `ORDER BY score DESC, player` if your application needs deterministic results.

## The final merge, one row at a time

When the worker streams are ready, the [result generator initializes the in-memory merger](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L383-L429). Its `memorySource` contributes the first row from each nonempty worker iterator to a heap. Calling [`multiWayMerger.next`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/multi_way_merge.go#L179-L202) takes the heap's best row and replaces it with the next row from **that same** iterator; when an iterator is exhausted, the heap shrinks. Only the resulting row stream reaches the caller. Neither sorting each chunk nor concatenating the worker results would satisfy `ORDER BY`.

```text
worker 1:  90 -> 70     heap front: 95, then 90, then 80, then 70
worker 2:  95 -> 80     output:     95 -> 90 -> 80 -> 70
```

The example has distinct scores for clarity. The merger holds a front row per input, but the **workers' sorted input rows still consume memory**. Global sort must see its input before it can guarantee which row comes first; do not mistake the output `Next` API for an early-exit algorithm. If the optimizer chooses a `TopN` for `ORDER BY ... LIMIT`, that is a different executor with different trade-offs.

## Memory and configuration boundaries

- [`tidb_executor_concurrency`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/variable/sysvar.go#L2390-L2394) supplies this `SortExec`'s worker count through `ExecutorConcurrency`. More workers can increase CPU parallelism, but also maintain more local sorting state; it does not alter SQL ordering semantics.
- [`tidb_mem_quota_query`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/variable/sysvar.go#L3209-L3212) sets the session's query memory limit. `SortExec` [attaches memory and disk trackers on `Open`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L155-L169).
- [`tidb_enable_tmp_storage_on_oom`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/variable/sysvar.go#L1856-L1861) is **global**. When enabled, `Open` [installs a spill action](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L180-L189); the generator can [merge sorted rows from disk](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L323-L381) instead of keeping every run in memory. Disk spilling is a fallback with I/O cost, **not** a guarantee that every memory failure is recoverable.

Check the [version-specific system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) before changing settings; this walkthrough is tied to a development commit, not every TiDB release. For a given query, check its actual `EXPLAIN` plan before applying root-sort advice.

## Takeaway

The plan specifies **what** ordering is needed. The builder wires the child and sort keys. `SortExec` hands input chunks to workers, workers sort local streams, and a heap-backed merger produces **one** globally sorted stream. Following those four pieces explains why local parallelism does not lose global ordering—and why sorting can trade memory, CPU, and temporary-disk I/O.

## References

1. [TiDB source: `PhysicalSort`, pinned commit `0073665`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/planner/core/operator/physicalop/physical_sort.go#L34-L47).
2. [TiDB source: builder, `SortExec.Open`, `Next`, and fetcher](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/sort.go#L155-L302).
3. [TiDB source: parallel sort worker](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/parallel_sort_worker.go#L109-L232).
4. [TiDB source: `multiWayMerger` and `memorySource`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/sortexec/multi_way_merge.go#L28-L76).
5. [TiDB documentation: system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
6. [TiDB documentation: reading `EXPLAIN` plans](https://docs.pingcap.com/tidb/stable/explain-overview/).
