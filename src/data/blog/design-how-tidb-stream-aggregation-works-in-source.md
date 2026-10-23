---
author: JZ
pubDatetime: 2026-10-23T18:30:00Z
modDatetime: 2026-10-23T18:30:00Z
title: System Design - How TiDB Stream Aggregation Carries a Group Across Chunks
tags:
  - design-system
  - design-database
description: "A small source-code tour of TiDB's PhysicalStreamAgg, executor builder, VecGroupChecker, and StreamAggExec, including chunk boundaries, empty input, and useful settings."
---

## Table of contents

## A group can outlive a batch

Consider a shop counting sales by region:

```sql
SELECT /*+ STREAM_AGG() */ region, SUM(amount)
FROM sales
GROUP BY region;
```

Suppose its input arrives ordered by `region`. TiDB reads rows in **chunks**, not one giant array. The first chunk ends halfway through the `east` group:

```text
child chunk 1:  (east, 12)  (east, 7)
child chunk 2:  (east, 4)   (west, 5)  (west, 8)
output rows:   (east, 23)  (west, 13)
```

If the executor emits `east = 19` at the end of chunk 1, it gives the wrong answer. It must hold the current aggregate until it knows the _next_ group has started, even when that boundary appears in a later chunk. That is the core job of TiDB's stream aggregation executor.

This walkthrough follows [TiDB source at commit `ab30f36`](https://github.com/pingcap/tidb/tree/ab30f363d490f72d83da6b22fadc394424b8bdc7). It focuses on four pieces: `PhysicalStreamAgg`, `executorBuilder`, `VecGroupChecker`, and `StreamAggExec`. The aggregate functions they call are an interface, not another execution pipeline explored here.

## Who hands the group to whom?

```text
      planner                         executor construction
 +---------------------+           +-------------------------+
 | PhysicalStreamAgg   |---------->| executorBuilder         |
 | ordered input needed|           | wires child + group keys|
 +---------------------+           +------------+------------+
                                               |
                                    +----------v-----------+
                                    | StreamAggExec         |
                                    | owns current results  |
                                    +---+---------------+---+
                                        |               |
                              asks for boundaries   pulls batches
                                        |               |
                               +--------v--------+  +---v---------+
                               | VecGroupChecker |  | child exec  |
                               | compare keys    |  | sorted rows |
                               +-----------------+  +-------------+
```

The [physical plan](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/planner/core/operator/physicalop/physical_stream_agg.go#L89-L162) considers stream aggregation when it can require appropriately ordered child rows. Its ordinary candidate path uses possible child orderings; `STREAM_AGG()` also makes it consider an enforced ordering. A hint influences planning; it does **not** let the executor correctly aggregate unsorted rows by magic. A sort may be needed, and the optimizer can still have other constraints.

The [builder](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/builder.go#L2479-L2513) creates the child first, passes the physical plan's `GroupByItems` to a new `VecGroupChecker`, builds each `AggFunc`, and sets an optional default row for an empty input. That is the bridge from an optimizer decision to runnable code.

## Watch the `east` group cross the boundary

At [`OpenSelf`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L78-L105), `StreamAggExec` creates a reusable child chunk and allocates one partial result per aggregate function. An aggregate's **partial result** is its running state: for `SUM(amount)`, think of a running total rather than a completed output row.

When the parent calls [`Next`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L117-L173), the executor resets the output chunk and repeats `consumeOneGroup` until it is full or there are no more groups. `VecGroupChecker.SplitIntoGroups` finds ranges of equal group keys _within_ the current input chunk. It also remembers the previous chunk's last key and reports whether the next chunk's first group matches it ([checker implementation](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/internal/vecgroupchecker/vec_group_checker.go#L77-L157)).

For the example, the sequence is:

```text
parent        StreamAggExec         VecGroupChecker        child
  |--- Next ------>|                      |                   |
  |                |--- pull chunk 1 ------------------------>|
  |                |<-- east 12, east 7 ----------------------|
  |                |--- split ----------->| east [0, 2)       |
  |                |    update SUM: 19; do not emit yet       |
  |                |--- pull chunk 2 ------------------------>|
  |                |<-- east 4, west 5, west 8 ---------------|
  |                |--- split ----------->| first group east  |
  |                |    update SUM: 23; finalize east         |
  |                |    update west; finalize at end of input |
  |<-- output chunk|    [(east, 23), (west, 13)]              |
```

In the code, [`consumeCurGroupRowsAndFetchChild`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L203-L232) updates the pending group's partial results _before_ fetching the next child chunk. If the checker's first group matches the previous chunk's last group, `consumeOneGroup` includes those new rows too. Only after a different key appears can [`appendResult2Chunk`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L234-L252) append the final result and reset the partial state for the following group. Reaching end of input also flushes the last group.

There is a useful empty-input distinction: `GROUP BY region` returns **no rows** for an empty table. A final aggregate without group keys, such as `SELECT COUNT(*) FROM sales`, still needs **one row** (`0`). The [builder's `DefaultVal` condition](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/builder.go#L2495-L2509) and the executor's [end-of-input handling](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L218-L226) implement the distinction for the appropriate final aggregation plan.

## Settings worth knowing before changing a query

- `STREAM_AGG()` is a [documented optimizer hint](https://docs.pingcap.com/tidb/stable/optimizer-hints/#stream_agg). Ordered input makes incremental groups possible, but forcing a sort can offset the memory advantage. Compare `EXPLAIN ANALYZE` plans rather than assuming the hint is faster.
- `tidb_enable_vectorized_expression` is passed into `VecGroupChecker` by the builder to control eligible vectorized group-key evaluation; it does not create sorted input ([builder](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/builder.go#L2487-L2492), [system variable](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/sessionctx/variable/sysvar.go#L2790-L2792)).
- `tidb_track_aggregate_memory_usage` governs whether the stream executor attaches its memory tracker to the statement tracker. It does **not** mean no memory is used when tracking is off ([executor](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L93-L103), [system variable](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/sessionctx/variable/sysvar.go#L3078-L3080)).
- `tidb_max_chunk_size` bounds the number of rows a chunk can hold. An input chunk ending mid-group is normal, not an error ([session setting](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/sessionctx/variable/sysvar.go#L2666-L2668)).

The executor keeps state for the current group rather than a hash entry for **every** group. That often saves memory, but large aggregate states, chunk buffers, and any preceding sort still cost memory. Finally, a stream aggregation's _input_ order is an implementation requirement, **not** a SQL promise that the result is ordered: add `ORDER BY region` if callers need that guarantee. In `EXPLAIN`, distinguish a `StreamAgg` under `cop[tikv]` from one at `root`; the Go executor above describes the latter, not TiKV's separate coprocessor implementation ([aggregation explain guide](https://docs.pingcap.com/tidb/stable/explain-aggregation/)).

## References

1. [TiDB source: `PhysicalStreamAgg`, pinned commit](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/planner/core/operator/physicalop/physical_stream_agg.go#L34-L162).
2. [TiDB source: `executorBuilder.buildStreamAggFromChildExec`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/builder.go#L2479-L2513).
3. [TiDB source: `StreamAggExec`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/aggregate/agg_stream_executor.go#L34-L252).
4. [TiDB source: `VecGroupChecker`](https://github.com/pingcap/tidb/blob/ab30f363d490f72d83da6b22fadc394424b8bdc7/pkg/executor/internal/vecgroupchecker/vec_group_checker.go#L65-L157).
5. [TiDB docs: aggregation plans](https://docs.pingcap.com/tidb/stable/explain-aggregation/) and [optimizer hints](https://docs.pingcap.com/tidb/stable/optimizer-hints/#stream_agg).
