---
author: JZ
pubDatetime: 2026-10-17T18:35:00Z
modDatetime: 2026-10-17T18:35:00Z
title: System Design - How TiDB's LIMIT Executor Reads Only Enough Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace LIMIT with OFFSET through TiDB's PhysicalLimit, executorBuilder, LimitExec, and Chunk, including how chunk demand and session settings affect reads."
---

## Table of contents

## The fourth and fifth rows

This is a source walkthrough for engineers new to TiDB's SQL execution engine. A query asks for two rows after skipping three:

```sql
SELECT item_id FROM inventory LIMIT 2 OFFSET 3;
```

Without `ORDER BY`, **which** rows those are is not guaranteed; `LIMIT` restricts the result count, not the order. The question here is narrower: once a child executor produces a stream of rows, how does TiDB discard three, return two, and stop asking for more? We follow four code units in [`pingcap/tidb` at commit `f40ad1d`](https://github.com/pingcap/tidb/tree/f40ad1d845cbb1bce94253b4d8965a7389177dd7). This is a snapshot of upstream `main`, not a guarantee about every released version. It does not trace TiKV-side limit pushdown or the child's own storage reads.

## Four pieces, one local stream

```text
 PhysicalLimit (Offset=3, Count=2)
             |
             v
 executorBuilder.buildLimit() ------> LimitExec
                                       | begin=3, end=5, cursor=0
                                       | Next asks for child rows
                                       v
                             child executor (e.g. reader)
                                       |
                                       v
                                  childResult Chunk
                                       |
                                skip / append / swap
                                       v
                                caller's result Chunk
```

[`PhysicalLimit`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/planner/core/operator/physicalop/physical_limit.go#L33-L55) carries the planner's `Offset` and `Count`. [`executorBuilder.buildLimit`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/builder.go#L850-L878) builds the child, creates a `LimitExec`, and sets its `begin` to `Offset` and `end` to `Offset + Count`. Thus the cursor's positions `0..2` are discarded, while positions `3..4` are returned. The builder also sets an initial chunk capacity based on the smaller of `Count` and the session's `MaxChunkSize`. That is an allocation hint, **not** permission to return extra rows.

[`LimitExec`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L448-L472) embeds `BaseExecutor`, holds a child-result chunk, and tracks `cursor`, `begin`, and `end`. [`Chunk`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/util/chunk/chunk.go#L209-L226) is TiDB's reusable columnar batch of rows; its `RequiredRows` is a request to its producer, not a hard row-count guarantee.

## One `Next` call, then another

The caller hands `LimitExec.Next` an empty result chunk and asks for rows. `Next` first resets that chunk. If `cursor >= end`, it returns an empty result immediately. Otherwise it requests a batch from the child into `childResult`; if the child is exhausted, it returns empty. [The first-batch loop](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L474-L520) skips chunks lying wholly before `begin`, and slices the _first_ chunk crossing that boundary.

For an illustration, suppose the child gives positions `0, 1, 2, 3` in its first batch:

```text
child batch:       [0, 1, 2, 3]
offset boundary:             ^
append to caller:           [3]       cursor becomes 4

next child batch:  [4]
append to caller:  [4]                 cursor becomes 5

next Next():       []                  cursor >= end
```

Positions stand for rows here, **not** their `item_id` values. The cursor counts rows **consumed**, including skipped rows. When `begin=3` and `end=5`, the first batch's fourth row is appended and a later batch supplies the fifth. If a batch extends past `end`, [`TruncateTo`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L533-L539) removes the extra tail before returning it. The [ordinary path](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L521-L548) can swap the child chunk's columns into the caller's chunk rather than copying every row. The builder configures an inline column-pruning path when the parent only needs some child columns; that uses a column-swap helper instead.

[`Open`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L551-L569) prepares the child and resets `cursor` to zero; [`Close`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L572-L591) releases it. Calling `Next` after the limit is satisfied does not pull another batch. The [required-rows tests](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/executor_required_rows_test.go#L131-L210) cover both offset crossing and empty results beyond the child's end.

## Why ask the child for more than the page size?

If the caller requests two results but three earlier rows must be skipped, asking the child for only two input rows cannot fill that page. [`adjustRequiredRows`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L594-L611) adds the _remaining offset_ to the requested result count until the boundary is crossed. It then caps demand by the remaining distance to `end` and by `MaxChunkSize`. After crossing the offset, it requests only as many rows as the caller wants, again within those bounds.

This is **cooperative batching**, not a guarantee that the entire query scans only five storage rows. A child can buffer data ahead of time, and other operators (for example, a sort) can need to process far more input. A separate physical plan may push a limit toward storage; this article describes the **root executor's** local behavior, not every possible plan. A large `OFFSET` still requires consuming the skipped rows in this path.

## Which settings matter here?

- `tidb_max_chunk_size` sets the session's maximum chunk size. The builder caps initial capacity by it, and the executor caps child `RequiredRows` by it.
- `tidb_init_chunk_size` supplies the executor's usual initial chunk capacity; `buildLimit` overrides its own initial capacity using the limit count.
- `tidb_enable_adaptive_limit_scan` can attach a statement-local controller for **eligible ordered index-lookup paths**. The builder only attaches it when that setting and the plan's eligibility checks allow it; the basic offset/count logic above still applies.

These are system variable names from the [registered session variables](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/sessionctx/variable/sysvar.go#L2592-L2596) and [chunk-size entries](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/sessionctx/variable/sysvar.go#L2665-L2688). The adaptive path's [eligibility checks](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/builder.go#L880-L906) are a separate optimization, not a replacement for `LIMIT`. Check the variables and execution plan on the TiDB version you operate before tuning them.

## The mental model

The plan states **skip three, keep two**. The builder turns it into boundaries `begin=3`, `end=5`. `LimitExec` moves a cursor through child chunks, asks for enough rows to cross the offset, and returns only the slice inside those boundaries. `Chunk` makes that exchange batched and reusable. If pagination becomes slow, ask what the _child_ had to do before it could produce those chunks; `LIMIT` at the root alone cannot make an expensive child cheap.

## References

1. [TiDB: `LIMIT` syntax and execution-plan examples](https://docs.pingcap.com/tidb/stable/explain-overview/); inspect the actual plan to locate its `Limit` operators.
2. [TiDB source: `PhysicalLimit` and `executorBuilder.buildLimit` at commit `f40ad1d`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/builder.go#L850-L878).
3. [TiDB source: `LimitExec.Next` and `adjustRequiredRows` at commit `f40ad1d`](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/executor/select.go#L448-L611).
4. [TiDB source: chunk demand and column reuse](https://github.com/pingcap/tidb/blob/f40ad1d845cbb1bce94253b4d8965a7389177dd7/pkg/util/chunk/chunk.go#L209-L226).
