---
author: JZ
pubDatetime: 2026-10-20T18:34:14Z
modDatetime: 2026-10-20T18:34:14Z
title: System Design - How TiDB's Projection Executor Runs Expressions
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace a root TiDB Projection from physical plan to child chunks, expression evaluation, and ordered parallel workers; learn why it sometimes runs sequentially."
---

## Table of contents

## A calculation between storage and the client

Suppose a shop asks for the price after an eight-percent markup:

```sql
SELECT product_id, price * 1.08 AS marked_up_price
FROM products;
```

Some operator must turn a child row `(17, 50)` into `(17, 54)`. In a TiDB execution plan, a **Projection** produces output columns by evaluating expressions over the rows its child supplies. We will follow a Projection that stays in the TiDB server's **`root` task**, not one pushed into TiKV or TiFlash. Run `EXPLAIN` for an actual query: both the operators and their `task` locations depend on the optimizer's decisions. PingCAP's [execution-plan guide](https://docs.pingcap.com/tidb/stable/explain-overview/) shows how to read that `task` column.

This walkthrough is anchored to [`pingcap/tidb` commit `88d75cb`](https://github.com/pingcap/tidb/tree/88d75cb0335509f29fba343d17ee668282e0d5e8), rather than assuming today's source matches every deployed TiDB release. The focus is four Go types: `ProjectionExec`, `projectionInputFetcher`, `projectionWorker`, and `expression.EvaluatorSuite`.

## Meet the four pieces

```text
       physical plan: PhysicalProjection (expressions)
                            |
                            v
                executorBuilder.buildProjection
                            |
                            v
       parent <---- ProjectionExec.Next <---- results
                            |                    ^
                            |                    |
                            v                    |
               projectionInputFetcher ----> projectionWorker(s)
                     |                          |
                     v                          v
                 child.Next             expression.EvaluatorSuite
                     |                     (evaluate columns)
                     +---- input Chunks ---------+
```

The diagram names the plan and builder as **entry points**, not additional worker classes to learn. A **Chunk** is a batch of rows; a parent repeatedly calls `Next` to request a batch. A Projection changes the values and shape of those rows; it does not, by itself, decide which rows survive a `WHERE` predicate.

The builder turns the [`PhysicalProjection.Exprs`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/planner/core/operator/physicalop/physical_projection.go#L34-L44) into an [`EvaluatorSuite` and a `ProjectionExec`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/builder.go#L2558-L2590). It also passes along the child executor and the desired projection-worker count. This is where the plan stops being a description and becomes something the executor can run.

## First try the one-lane road

[`ProjectionExec.Open` and `Next`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/projection.go#L105-L229) set up memory accounting and choose between sequential and parallel execution. In the sequential path, each `Next` asks the child for one Chunk, returns immediately if the child is exhausted, and runs the evaluator over that Chunk into the parent's output Chunk. A request for a certain number of rows is passed down to the child.

For our example, the suite treats `product_id` as a direct column and `price * 1.08` as a computed expression. [`EvaluatorSuite.Run`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/expression/evaluator.go#L86-L146) evaluates computed expressions **before** moving direct input columns into output positions. That order matters: column swapping may change the input Chunk, so computing from the original input afterward would be unsafe.

```text
Child Chunk:    product_id=[17, 23]    price=[50, 75]
                        |
               compute price * 1.08
                        |
Output Chunk:   product_id=[17, 23]    marked_up_price=[54, 81]
```

The suite can evaluate a supported expression one column at a time in vectorized mode, or fall back to row-by-row evaluation. **Vectorized expression evaluation** is not the same switch as **parallel projection**: the former changes how expressions run inside a worker, while the latter controls how many Chunks can be processed by workers at once. The [`defaultEvaluator.run`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/expression/evaluator.go#L22-L56) branch makes this distinction visible.

## Then add workers without scrambling rows

When parallel execution is selected, [`ProjectionExec.prepare`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/projection.go#L255-L305) creates reusable input and output Chunks and starts one `projectionInputFetcher` plus the configured workers. The fetcher is the **only goroutine calling the child executor**. It obtains a free input buffer and output slot, hands the output slot to `ProjectionExec.Next`, fills the input Chunk from the child, then sends both buffers to a worker. The worker calls `EvaluatorSuite.Run`, signals completion through the output slot's `done` channel, and returns the input buffer for reuse.

```text
Time          fetcher                 worker A          worker B        parent Next
  |    fetch chunk 1, queue slot 1       |                 |                |
  |    fetch chunk 2, queue slot 2       |                 |                |
  |                   |              compute 1         compute 2            |
  |                   |                 |              finish 2            |
  |                   |              finish 1             |                |
  v                   |                 |                 |          return slot 1,
                                                                        then slot 2
```

Worker B may finish first, but the fetcher puts output slots on the parent's queue in **fetch order**. [`ProjectionExec.parallelExecute`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/projection.go#L231-L253) takes the next slot, waits for _that slot's_ `done` signal, swaps its columns into the parent's Chunk, and recycles it. It does not return worker B's later Chunk ahead of worker A's earlier Chunk. When the child is exhausted, the fetcher signals the queued output and closes the output channel; [`Close`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/projection.go#L326-L357) stops workers, waits for them, and drains reusable buffers.

## Why the concurrency knob may have no effect

The builder and `Open` have deliberate sequential fallbacks:

- If the optimizer's **estimated** row count is smaller than `tidb_max_chunk_size`, the builder avoids goroutine overhead. It does not wait to measure the actual result size.
- A projection in a write or locking statement uses the sequential path to avoid races on the transaction's in-memory state.
- If expressions cannot safely use the vectorizable path (for example, `SetVar` or `GetVar`), `Open` disables parallel workers. Even turning `tidb_enable_vectorized_expression` **off** is a different decision: it selects a non-vectorized evaluation path; it does not by itself set the worker count to zero.
- A worker count of zero means sequential execution.

These rules are in [`newProjectionExec` and `ProjectionExec.open`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/builder.go#L2566-L2590). Consult PingCAP's [system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) before tuning: `tidb_projection_concurrency` is **deprecated** in favor of `tidb_executor_concurrency`. Its default `-1` inherits the latter, while `0` selects the sequential path. `tidb_max_chunk_size` defaults to `1024` rows and `tidb_enable_vectorized_expression` defaults to `ON` in that reference. Higher worker counts can also mean more simultaneously live Chunks and more query memory, not a free speedup.

The useful mental model is: **one reader preserves the child's order, several workers can compute concurrently, and the parent waits for results in order**. If you see `Projection` under `cop[tikv]` or an MPP task in `EXPLAIN`, this particular TiDB-server `ProjectionExec` walkthrough is not the operator you are observing.

## References

- [TiDB source snapshot: `ProjectionExec`, fetcher, and worker](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/projection.go) — buffer lifecycle and ordered results.
- [TiDB source snapshot: `buildProjection`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/executor/builder.go#L2558-L2590) — plan-to-executor construction and sequential fallbacks.
- [TiDB source snapshot: `EvaluatorSuite`](https://github.com/pingcap/tidb/blob/88d75cb0335509f29fba343d17ee668282e0d5e8/pkg/expression/evaluator.go#L86-L146) — expression/column evaluation order.
- [PingCAP: EXPLAIN execution plans](https://docs.pingcap.com/tidb/stable/explain-overview/) — how to tell `root` from coprocessor tasks.
- [PingCAP: system variables](https://docs.pingcap.com/tidb/stable/system-variables/) — projection and executor concurrency, Chunk size, and vectorized expressions.
