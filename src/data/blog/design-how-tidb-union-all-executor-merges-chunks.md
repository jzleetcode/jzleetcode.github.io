---
author: JZ
pubDatetime: 2026-10-21T18:00:00Z
modDatetime: 2026-10-21T18:00:00Z
title: System Design - How TiDB's UNION ALL Executor Merges Chunks
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's root UnionAllExec from planner to worker goroutines, reusable chunks, error delivery, and the session concurrency knob."
---

## Table of contents

## Two tables, one result stream

Suppose yesterday's orders live in one table and today's in another. An application asks TiDB for both sets of IDs:

```sql
SELECT id FROM yesterday_orders
UNION ALL
SELECT id FROM today_orders;
```

`UNION ALL` keeps duplicates: an `id` present in both branches can appear twice. Unlike plain `UNION`, it does not require duplicate elimination. But TiDB still needs to _read_ both branches and hand batches of rows to its caller. Does it finish yesterday's branch before opening today's? Not in the root executor studied here.

This post follows **one TiDB-server (`root`) `PhysicalUnionAll`**, not TiFlash MPP execution or every plan the optimizer could choose. The source links all refer to [`pingcap/tidb` commit `328460a9af032ec6b53823724f87837a6d2d5857`](https://github.com/pingcap/tidb/tree/328460a9af032ec6b53823724f87837a6d2d5857). Check [`EXPLAIN`](https://docs.pingcap.com/tidb/stable/explain-overview/) on your version before assuming your query takes this path.

## Meet the four moving pieces

```text
   PhysicalUnionAll (planner: children, output schema)
                  |
                  v
   executorBuilder.buildUnionAll (constructs root executor)
                  |
                  v
   UnionExec: childIDChan --assigns children--> resultPuller workers
       ^                                           |       |       |
       | empty chunks                        resourcePools (one per worker)
       |                                           |       |       |
       +---- Next caller <-- resultPool <--- unionWorkerResult
                              (chunk, error, return-channel)
```

[`PhysicalUnionAll`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/planner/core/operator/physicalop/physical_union_all.go#L27-L40) is the physical plan node. Its [planner rules](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/planner/core/operator/physicalop/physical_union_all.go#L78-L106) do not claim that the operator preserves an input sort order. [`executorBuilder.buildUnionAll`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/builder.go#L3121-L3133) builds each child executor and passes them to [`UnionExec`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L56-L85), along with a concurrency value from the session. The fourth piece, `unionWorkerResult`, is an envelope containing a `Chunk`, an error, and the channel to which the consumed chunk should be returned.

A **Chunk** is TiDB's column-oriented batch of rows. The union executor receives whole batches from children; it does not concatenate all rows into one giant in-memory table.

## The first `Next` starts the workers

[`Open`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L93-L101) resets the union executor's state, but it does not eagerly open all children. On the first [`Next`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L200-L207), `initialize` caps the number of workers at the number of children, creates the result channel and a one-slot **resource pool per worker**, then sends child IDs into `childIDChan`. Each goroutine runs `resultPuller` and can take another child ID after finishing its current one. For example, with five branches and concurrency two, there are **two workers**, not five simultaneous workers.

Follow one worker:

1. It takes a child ID, calls `Open` on that child, and gets a reusable chunk from its resource pool.
2. It calls the child's `Next` to fill the chunk. An empty, successful chunk means this child is done; the worker can move to another child.
3. For a nonempty chunk, it sends a `unionWorkerResult` into the shared result channel. It cannot reuse that chunk until the caller returns an available one.

Those steps follow [`resultPuller`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L126-L189). The channels bound the number of chunks in flight and keep a worker from overwriting rows its caller is still using. Arrival order depends on which child produces a chunk first, so **neither branch order nor row order is guaranteed** without a final `ORDER BY`.

## A chunk crosses the boundary without a row-by-row copy

The parent calls [`UnionExec.Next`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L200-L222) with an output chunk. The executor receives the next result from `resultPool`, checks for an error and a matching column count, then calls `req.SwapColumns(result.chk)`. It returns the now-unused chunk through `result.src`, allowing that worker to run again. The useful rows have changed hands by swapping the chunks' column storage, **not by appending every row**.

The workers share one result channel. When all have finished, [`waitAllFinished`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L88-L91) closes it. A receive from the closed channel tells `Next` there are no more chunks. If a child reports an error, its worker [sends the error through the same result channel](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L148-L182); the next `Next` to receive it returns the error instead of hiding it.

Even a caller that stops early must call `Close`: [`UnionExec.Close`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L224-L247) signals workers to stop, waits for them, clears pending channel contents, and closes children that were opened. This is why a parent `LIMIT` can stop consuming without leaving union workers running indefinitely.

## What can you tune, and what can't you assume?

The builder reads [`UnionConcurrency()`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/sessionctx/variable/session.go#L3524-L3527), which in this snapshot returns `ExecutorConcurrency`. The corresponding session/global system variable is [`tidb_executor_concurrency`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/sessionctx/variable/sysvar.go#L2390-L2393); `initialize` further caps workers to the number of branches. More workers can help when branches have independent work, but cannot create more parallel branches than exist and does not imply ordered output.

[`tidb_max_chunk_size`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/sessionctx/variable/sysvar.go#L2665-L2668) controls the session's maximum chunk size. `UnionExec.Next` [grows and resets the caller's output chunk](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L200-L206) using that bound. It is a **batch-size control**, not the SQL result limit or a promise that every batch will be full.

To investigate a real query, inspect its plan and current session settings rather than assuming the optimizer picked this root implementation:

```sql
EXPLAIN ANALYZE
SELECT id FROM yesterday_orders
UNION ALL
SELECT id FROM today_orders;

SHOW VARIABLES LIKE 'tidb_executor_concurrency';
SHOW VARIABLES LIKE 'tidb_max_chunk_size';
```

The core idea is simple: `UNION ALL` keeps the branch results, while **bounded workers and reusable chunks** let the root executor collect them concurrently without buffering every row or pretending the branches have a stable order.

## References

- [TiDB documentation: Understand the query execution plan](https://docs.pingcap.com/tidb/stable/explain-overview/)
- [TiDB documentation: System variables](https://docs.pingcap.com/tidb/stable/system-variables/)
- [TiDB source: physical union plan and planner constraints](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/planner/core/operator/physicalop/physical_union_all.go#L27-L106)
- [TiDB source: root executor builder](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/builder.go#L3121-L3133)
- [TiDB source: union executor](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/unionexec/union.go#L56-L247)
- [TiDB source: concurrency setting](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/sessionctx/variable/session.go#L3524-L3527)
