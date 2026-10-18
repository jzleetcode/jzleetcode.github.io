---
author: JZ
pubDatetime: 2026-10-18T18:45:28Z
modDatetime: 2026-10-18T18:45:28Z
title: System Design - How TiDB's Selection Executor Filters Chunks
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace a root Selection from PhysicalSelection through executorBuilder and SelectionExec to a vectorized filter, including its row-at-a-time fallback and chunk controls."
---

## Table of contents

## Four rows arrive; one survives

Suppose a query needs to keep scores from 20 through 39:

```sql
SELECT score FROM attempts WHERE score >= 20 AND score < 40;
```

For illustration, its child executor hands TiDB the rows `[NULL, 18, 25, 44]`. The predicate keeps only `25`: `NULL` does not satisfy a `WHERE` filter. Where does that decision actually happen? This walkthrough follows **a selection that remains in the TiDB server's `root` task**, using [`pingcap/tidb` commit `328460a`](https://github.com/pingcap/tidb/tree/328460a9af032ec6b53823724f87837a6d2d5857). It is a source snapshot, not a promise that every version or SQL statement has the same plan.

Many simple predicates instead run in TiKV's coprocessor. `EXPLAIN` distinguishes a `Selection` under `cop[tikv]` from one under `root`; a coprocessor selection does **not** use the TiDB-server `SelectionExec` studied here. See the [execution-plan task overview](https://docs.pingcap.com/tidb/stable/explain-overview/) before applying this walkthrough to a real query.

## Four code units, one batch of rows

```text
   PhysicalSelection (Conditions)
              |
              v
   executorBuilder.buildSelection
              | creates
              v
       SelectionExec (TiDB root)
         ^             |
         | child Chunk | evaluates predicates
         |             v
   child executor   expression.VectorizedFilter
                         | selected[] mask
                         v
                  output Chunk for caller
```

[`PhysicalSelection`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/planner/core/operator/physicalop/physical_selection.go#L35-L47) carries the planned `Conditions`. [`executorBuilder.buildSelection`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/builder.go#L2504-L2516) builds its child first, then creates `SelectionExec` with those conditions, the child executor, and an evaluation context. It does not eagerly materialize all filtered rows.

[`SelectionExec`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L695-L724) keeps a reusable child-result `Chunk`, a row iterator, and a `selected` boolean slice. A `Chunk` is a batch of rows held in columns; its [`IsFull`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/util/chunk/chunk.go#L209-L225) checks whether it has reached its requested row count. The fourth unit, [`expression.VectorizedFilter`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/expression/chunk_executor.go#L410-L444), evaluates the conditions on the child chunk and returns the mask that tells the executor which rows to append.

## Follow one `Next` call

During [`Open`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L727-L755), the executor sets up its child chunk, iterator, and memory tracker. It also checks `expression.Vectorizable(filters)` to decide whether the **batched** path is safe; expressions with user-variable get/set side effects, for example, can require row-by-row evaluation. The check lives in [`chunk_executor.go`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/expression/chunk_executor.go#L29-L53).

On the usual batched path, [`SelectionExec.Next`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L768-L806) first empties the caller's result chunk. When it has no unconsumed child rows, it calls the child's `Next` for another chunk, asks `VectorizedFilter` for a mask, and walks the child rows. It skips `false` entries and appends `true` entries to the caller's chunk:

```text
child chunk:         [ NULL,    18,    25,    44 ]
score >= 20 AND <40   [ false, false, true, false ]
caller receives:                        [ 25 ]
```

If the output chunk becomes full, `Next` returns **without throwing away its position** in the child chunk; the following call resumes there. If a child batch contains no matches, the loop can request another batch before returning any rows. If the child returns an empty chunk, it has no more rows to offer. This is demand-driven filtering, not a promise to stop reading storage as soon as one row matches.

There is a subtle distinction between **batching rows** and **vectorizing expressions**. `Vectorizable(filters)` chooses between the batched loop and [`unBatchedNext`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L808-L834), which evaluates individual rows and returns after a selected row to preserve side-effect ordering. Even on the batched loop, [`VectorizedFilterConsiderNull`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/expression/chunk_executor.go#L422-L452) can evaluate expressions **row by row** if vectorization is disabled or the expressions do not support it. A batched executor is therefore not proof that every predicate runs in vectorized code.

## Two knobs worth recognizing

- `tidb_max_chunk_size` controls the session's maximum chunk size. `Next` resets its output chunk with that cap, and [`Chunk.IsFull`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/util/chunk/chunk.go#L209-L225) determines when to return a filled batch. Raising it can increase per-query memory usage; it cannot make a non-matching row pass the filter.
- `tidb_enable_vectorized_expression` selects vectorized expression evaluation where the expressions support it. The session value is captured in [`newSelectionExecutorContext`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L702-L709) and used by the filter helper, **not** by the optimizer to guarantee a root `Selection`.

Both variables are [registered in TiDB's system-variable source](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/sessionctx/variable/sysvar.go#L2665-L2668). Before tuning, check the version-specific [system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) and the actual `EXPLAIN` plan.

## The mental model

The physical plan names the predicate. The builder wires that predicate to a child. `SelectionExec` **pulls a child chunk, computes which rows pass, and returns only those rows** while preserving its place across calls. Expression evaluation may be vectorized or row-based, and simple filters may run in TiKV instead. To understand where filtering costs occur, first locate the `Selection` task in `EXPLAIN`; then trace the appropriate executor rather than assuming that every `WHERE` clause invokes this one.

## References

1. [TiDB source: `PhysicalSelection` and its conditions, commit `328460a`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/planner/core/operator/physicalop/physical_selection.go#L35-L47).
2. [TiDB source: `executorBuilder.buildSelection`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/builder.go#L2504-L2516).
3. [TiDB source: `SelectionExec.Open`, `Next`, and `unBatchedNext`](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/executor/select.go#L727-L834).
4. [TiDB source: vectorized/row-based filter dispatch](https://github.com/pingcap/tidb/blob/328460a9af032ec6b53823724f87837a6d2d5857/pkg/expression/chunk_executor.go#L410-L452).
5. [TiDB docs: root versus coprocessor tasks](https://docs.pingcap.com/tidb/stable/explain-overview/).
