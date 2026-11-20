---
author: JZ
pubDatetime: 2026-11-20T19:28:26Z
modDatetime: 2026-11-20T19:28:26Z
title: System Design - How TiDB TableDual Produces Rows Without a Table
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's TableDual from a logical plan to an executor, including zero-column rows, empty results, and chunk settings."
---

## Table of contents

## A query with nothing to scan

A developer runs:

```sql
SELECT 1 + 2 AS answer;
-- answer: 3
```

There is no table after `FROM`, yet the expression needs to be evaluated once. TiDB's planner can start with a small synthetic input called `TableDual`. A projection above it evaluates the expression for that input row. If the input had zero rows, the projection would have no row on which to run.

This walkthrough follows four code units in [`pingcap/tidb` at commit `da76b944`](https://github.com/pingcap/tidb/tree/da76b94491e935de3d9fed575b574123c988b682): `LogicalTableDual`, `PhysicalTableDual`, `executorBuilder.buildTableDual`, and `TableDualExec`. Source behavior and plans can change between versions; a particular SQL statement is not guaranteed to display the same plan in every release.

## The journey from SQL to an executor

```text
 SELECT 1 + 2
      |
      v
 PlanBuilder: no FROM -> LogicalTableDual(RowCount=1, no columns)
      |
      v
 physical planning -> PhysicalTableDual(RowCount=1, same schema)
      |
      v
 executorBuilder.buildTableDual -> TableDualExec(numDualRows=1)
      |
      v
 TableDualExec.Next -> one virtual row -> projection -> answer 3
```

[`PlanBuilder.buildTableRefs`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/logical_plan_builder.go#L420-L431) handles a missing `FROM` by calling [`buildTableDual`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/logical_plan_builder.go#L4745-L4748), which creates a logical dual with `RowCount: 1`. This is a planner's synthetic input, not a stored row in TiKV.

[`LogicalTableDual`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_table_dual.go#L29-L38) represents a result with zero or one row. Its schema can have zero columns: row count and column count are separate concepts. Its [`DeriveStats`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_table_dual.go#L108-L125) supplies the row count to the optimizer. Its column-pruning method can remove unused columns, while preserving the row count.

Physical planning's [`findBestTask4LogicalTableDual`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/physicalop/physical_table_dual.go#L78-L97) copies the count and schema into `PhysicalTableDual`, then places it in a root task. Zero or one row is already ordered for any requested sort order; the function rejects an index-join property. The physical operator's [`ExplainInfo`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/physicalop/physical_table_dual.go#L70-L75) reports `rows:` followed by the count.

The executor builder [checks the count](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/builder.go#L2605-L2617): any value other than zero or one is an error. It then passes the schema and row count to `TableDualExec`, also setting the executor's initial chunk capacity to that count.

## What happens on each pull?

TiDB executors exchange batches called **chunks**. A parent asks a child for more rows with `Next`. [`TableDualExec.Open` and `Next`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/select.go#L665-L695) keep a `numReturned` counter and follow this sequence:

1. `Open` resets the counter, so the executor is ready for a new run.
2. `Next` resets the caller's chunk. If the configured count has already been returned, it leaves the chunk empty.
3. For a one-row dual with no columns, it sets the chunk's **virtual row count** to one. There are no column values to append, but the parent still sees one row.
4. For a one-row dual with columns, it appends a `NULL` to each output column. It marks the row as returned, so the next pull is empty.

```text
                         first Next              second Next
 RowCount = 0       ->   empty chunk        ->   empty chunk
 RowCount = 1,
 zero columns       ->   1 virtual row      ->   empty chunk
 RowCount = 1,
 N columns          ->   1 row of N NULLs   ->   empty chunk
```

For `SELECT 1 + 2`, the `3` comes from evaluating the projection, not from a column in the dual. A zero-row dual can also represent an empty intermediate result in a plan. The existence of that operator does not mean every unsatisfiable query takes the same optimization path, nor that all operators around it do no work.

## Inspecting a plan and the relevant settings

Try `EXPLAIN SELECT 1 + 2 AS answer;` on your TiDB version and read the operator tree. A `TableDual` entry may report `rows:1`; a projection can sit above it. Operator IDs and plan shape can differ with optimizer changes. [`EXPLAIN`](https://docs.pingcap.com/tidb/stable/explain-overview/) shows the chosen plan without executing the query; `EXPLAIN ANALYZE` executes it and also reports runtime information.

Two general chunk variables are useful context: [`tidb_init_chunk_size`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_init_chunk_size) controls the normal initial chunk size, and [`tidb_max_chunk_size`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_max_chunk_size) controls the general maximum. At the cited source revision, the dual builder explicitly sets **its own** initial capacity to `RowCount`. Neither variable changes the dual's zero-or-one-row semantics. Their documented defaults and ranges can vary by TiDB version, so consult the documentation for the version you run before tuning a broader workload.

## References

1. [TiDB source: build table references and the one-row dual](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/logical_plan_builder.go#L420-L431).
2. [TiDB source: logical dual](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_table_dual.go) and [physical dual](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/physicalop/physical_table_dual.go).
3. [TiDB source: executor builder](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/builder.go#L2605-L2617) and [executor](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/select.go#L665-L695).
4. [TiDB documentation: query execution plan overview](https://docs.pingcap.com/tidb/stable/explain-overview/) and [system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
