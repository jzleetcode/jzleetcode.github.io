---
author: JZ
pubDatetime: 2026-10-26T18:32:33Z
modDatetime: 2026-10-26T18:32:33Z
title: System Design - How TiDB Checks a Scalar Subquery's Row Count
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow TiDB's LogicalMaxOneRow, PhysicalMaxOneRow, executor builder, and MaxOneRowExec through the zero-, one-, and many-row cases."
---

## Table of contents

## A price that ought to be a single value

This source walkthrough is for engineers learning TiDB's execution engine. Suppose a query expects one price from a nested query:

```sql
SELECT (SELECT price FROM inventory WHERE sku = 'A-42') AS price;
```

For one matching row, the inner query can provide the price. For no matching rows, the scalar result is `NULL`. But if two rows match, the database must not quietly choose one. One possible TiDB plan places a `MaxOneRow` guard over the inner query. The optimizer can sometimes rewrite or evaluate scalar subqueries differently, so this SQL is an illustration of the semantics, **not** a promise that every `EXPLAIN` shows this exact operator.

We follow four code units in [`pingcap/tidb` at commit `da76b94`](https://github.com/pingcap/tidb/tree/da76b94491e935de3d9fed575b574123c988b682): `LogicalMaxOneRow`, `PhysicalMaxOneRow`, `executorBuilder.buildMaxOneRow`, and `MaxOneRowExec`. This is a snapshot of upstream `master`; it is not a claim about all released versions or TiKV's storage implementation.

## From a planning rule to a runtime check

```text
  scalar subquery's child plan
              |
              v
     LogicalMaxOneRow          describes at-most-one-row semantics
              |
              v
     PhysicalMaxOneRow         plans for detecting a second row
              |
              v
  executorBuilder.buildMaxOneRow()
              |
              v
         MaxOneRowExec         asks child, rejects >1; makes NULL for 0
              |
              v
        parent expression
```

[`LogicalMaxOneRow.Schema`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_max_one_row.go#L40-L44) clones its child's columns and clears their `NOT NULL` flags: even if `inventory.price` cannot be null, **zero rows** produce a null scalar result. Its [`PredicatePushDown`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_max_one_row.go#L52-L57) keeps predicates above this boundary instead of pushing an outside predicate into the child, where it could hide an extra row before the guard counts it.

The conversion in [`ExhaustPhysicalPlans4LogicalMaxOneRow`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/physicalop/physical_max_one_row.go#L59-L68) requests a child property with `ExpectedCnt: 2`. To disprove “at most one,” two rows suffice. The rule also declines physical properties with sort items or a TiFlash property; that is a planner constraint, not a setting you should toggle to make subqueries work.

[`executorBuilder.buildMaxOneRow`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/builder.go#L3130-L3140) first builds the child executor, then wraps it in `MaxOneRowExec`. It sets that executor's initial chunk capacity and maximum chunk size to `2`. These are **local builder values**, not a user-facing `MaxOneRow` tuning parameter. `ExpectedCnt: 2` and the chunk settings express the same goal at different layers: detect a second row without asking the child to optimize for a huge result.

## What `Next` does with each outcome

[`MaxOneRowExec.Open`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/select.go#L897-L905) opens its child and resets `evaluated` for a fresh execution. Its [`Next`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/select.go#L907-L938) clears the caller's result chunk, marks itself evaluated, then pulls from the child. Follow the rows, not just the error name:

| Child's first chunk | What the guard does                       | Result                                                               |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| 0 rows              | Appends one `NULL` for each output column | One all-null row                                                     |
| 2 or more rows      | Returns `ErrSubqueryMoreThan1Row`         | Error                                                                |
| 1 row               | Pulls **one more child chunk**            | Keeps the first row only if the next chunk is empty; otherwise error |

The extra pull matters. A child might return the first row in one chunk and the second in another; checking only the first chunk would miss the duplicate. Once the guard has emitted its single result, another call to `Next` returns an empty chunk via `evaluated` rather than repeating the value. The first chunk's size can depend on the caller and child: the code does **not** guarantee exactly two storage rows are read, nor that every child fetch fits into one chunk.

```text
 child chunks:       [ price=10 ]   [ price=11 ]
                         |                |
 first pull:         keep price=10        |
 second pull:                             +-- nonempty -> error

 child chunks:       [ price=10 ]   [ empty ]
                         |                |
 first pull:         keep price=10        |
 second pull:                             +-- empty -> return price=10
```

This is why the guard is neither `LIMIT 1` nor a uniqueness constraint. `LIMIT 1` would silently discard a second matching row; a unique index could prevent duplicate `sku` values in this particular example but cannot replace the general scalar-subquery rule. The guard enforces the contract of a scalar **at runtime**, across chunk boundaries, while the planner's schema acknowledges the zero-row case. Other plans can enforce the same SQL semantics through different paths.

## References

1. [TiDB source: `LogicalMaxOneRow` schema and predicate pushdown](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/logicalop/logical_max_one_row.go#L27-L57).
2. [TiDB source: `PhysicalMaxOneRow` and its planning rule](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/planner/core/operator/physicalop/physical_max_one_row.go#L24-L68).
3. [TiDB source: builder's per-executor chunk settings](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/builder.go#L3130-L3140).
4. [TiDB source: `MaxOneRowExec.Open` and `Next`](https://github.com/pingcap/tidb/blob/da76b94491e935de3d9fed575b574123c988b682/pkg/executor/select.go#L889-L938).
