---
author: JZ
pubDatetime: 2026-10-28T18:34:00Z
modDatetime: 2026-10-28T18:34:00Z
title: System Design - How TiDB's EXPLAIN Executor Produces Plan Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace a SELECT's EXPLAIN and EXPLAIN ANALYZE through TiDB's planner, executor builder, and ExplainExec to see when SQL runs and how plan rows reach the client."
---

## Table of contents

## The plan is a result set too

This source walkthrough is for engineers new to TiDB's SQL execution engine. A teammate asks why a query is slow. You try `EXPLAIN SELECT 1` and see a plan; then `EXPLAIN ANALYZE SELECT 1` adds observations from actually running the query. How does TiDB turn an execution plan into ordinary rows that a SQL client can read?

We will follow three code units in [`pingcap/tidb` at commit `4150cef7`](https://github.com/pingcap/tidb/tree/4150cef7a280246667f8bf0b97c6cd53bcd09f56): the planner's `Explain`, the builder's `buildExplain`, and the executor's `ExplainExec`. The scope is a normal `SELECT`, not `EXPLAIN FOR CONNECTION`, `EXPLAIN EXPLORE`, or the special handling for data-changing statements. This is a snapshot of upstream source, not a promise that all TiDB releases follow the same path. TiDB's [EXPLAIN overview](https://docs.pingcap.com/tidb/stable/explain-overview/) explains the user-facing difference: ordinary `EXPLAIN` does not execute the query; `EXPLAIN ANALYZE` does.

## The three pieces

```text
 SQL: EXPLAIN [ANALYZE] SELECT ...
                   |
                   v
       planner/core.Explain
       TargetPlan, Analyze, Format, Rows
                   |
                   v
       executorBuilder.buildExplain
       constructs ExplainExec; builds target executor
                   |
                   v
       executor.ExplainExec
       optionally drains target; renders plan;
       returns rendered rows in Chunk batches
                   |
                   v
               SQL client
```

[`core.Explain`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L932-L949) holds the target plan, whether analysis is requested, the requested output format, and eventually the rendered `Rows`. It represents **what to explain**; it is not itself the loop that sends rows to the client.

[`executorBuilder.buildExplain`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/builder.go#L1655-L1675) wraps that planner object in an `ExplainExec`. For `ANALYZE`, it ensures a statement runtime-statistics collection exists. On this ordinary path, it also builds the target executor even without `ANALYZE`: building can be necessary to obtain information such as partition pruning. **Building an executor is not executing its `Next` method.** A brief binary plan from `EXPLAIN FOR CONNECTION` can bypass that target build; that is a separate path.

[`ExplainExec`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L44-L53) keeps the plan and optional target executor plus an `executed` flag, rendered rows, and a `cursor` into those rows. These last two fields turn a plan explanation into a result set the client can fetch in batches.

## The first fetch does the interesting work

Consider this sequence for an ordinary `SELECT`:

```text
 client            ExplainExec          target executor       core.Explain
   |  Open()            |                       |                   |
   |------------------->|-- Open (ANALYZE only)->|                   |
   |  Next()            |                       |                   |
   |------------------->|                       |                   |
   |                    |-- Next until empty --->| (ANALYZE only)    |
   |                    |<-- close / stats ------|                   |
   |                    |-- RenderResult() ------------------------->|
   |                    |<-- plan rows ------------------------------|
   |<-- first Chunk ----|                       |                   |
   |  Next()            |                       |                   |
   |------------------->|-- copy next rows      |                   |
   |<-- next Chunk -----|   (no second run)     |                   |
```

The diagram summarizes [`Open`, `Next`, and `Close`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L55-L96) and the [analyze path](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L98-L150). With `ANALYZE`, `Open` opens the target. The first `ExplainExec.Next` calls `generateExplainInfo`, which drains the target executor by repeatedly requesting chunks until it finishes or fails. The target's query-result rows are consumed to gather runtime information; the client receives **explanation rows**, not those original SELECT rows. The target is closed when this execution finishes, including the error path; if `Open` happened but `Next` never did, `ExplainExec.Close` closes the target instead.

Without `ANALYZE`, `generateExplainInfo` skips the target-execution loop. In either case it asks [`core.Explain.RenderResult`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L1134-L1142) to produce plan rows. In the usual row-like formats, rendering [flattens the physical plan and converts it to rows](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L1203-L1215). The renderer also has other format-specific branches; do not assume every format has the same columns.

Back in `Next`, the executor [stores those rendered rows once and advances `cursor`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L73-L96). It fills at most one output chunk per call. A later `Next` resumes from the cursor instead of re-running the query. Once the cursor passes the last rendered row, it returns an empty chunk. `EXPLAIN ANALYZE` drains the target on the first fetch, but opening a target executor can already do work; later pages of the printed plan do not run the target again.

## What the knobs change

- **`ANALYZE`** selects the path that actually runs the target and gathers runtime information. For a data-changing target, that also means real side effects; this article's `SELECT` scope deliberately avoids that special path. See the [TiDB `EXPLAIN ANALYZE` statement reference](https://docs.pingcap.com/tidb/stable/sql-statement-explain-analyze/) before using it on write statements.
- **`FORMAT`** changes rendering and the result schema, not the underlying requirement to build the plan. For example, [`core.Explain.prepareSchema`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L994-L1030) chooses columns based on format and whether runtime stats exist. Use the [EXPLAIN overview](https://docs.pingcap.com/tidb/stable/explain-overview/) for how to read those columns.
- **`tidb_max_chunk_size`** is the session setting passed to the output chunk's growth routine. [`ExplainExec.Next`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L83-L95) uses `MaxChunkSize` when resetting and growing that chunk; [`Chunk.GrowAndReset`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/util/chunk/chunk.go#L352-L380) does not shrink an already larger chunk. The [system-variable registration](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/sessionctx/variable/sysvar.go#L2665-L2669) defines the setting. It does **not** cap how many target rows `EXPLAIN ANALYZE` must consume.

If you only need the optimizer's proposed plan, use plain `EXPLAIN`. If the question is whether estimated row counts or execution time match reality, `EXPLAIN ANALYZE` pays the cost of running the statement to find out. The source-code mental model is simple: **plan object describes, builder wires, executor runs if requested and pages out the explanation**.

## References

1. [TiDB documentation, "EXPLAIN overview"](https://docs.pingcap.com/tidb/stable/explain-overview/) — plan output and the distinction between EXPLAIN and EXPLAIN ANALYZE.
2. [TiDB documentation, "EXPLAIN ANALYZE"](https://docs.pingcap.com/tidb/stable/sql-statement-explain-analyze/) — execution and runtime information.
3. [TiDB source: `executorBuilder.buildExplain` at `4150cef7`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/builder.go#L1655-L1675) — target-executor construction.
4. [TiDB source: `ExplainExec` at `4150cef7`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/executor/explain.go#L44-L150) — run-once and row-batching behavior.
5. [TiDB source: `core.Explain` and `RenderResult` at `4150cef7`](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L932-L949) — planner state and [rendering implementation](https://github.com/pingcap/tidb/blob/4150cef7a280246667f8bf0b97c6cd53bcd09f56/pkg/planner/core/common_plans.go#L1134-L1215).
