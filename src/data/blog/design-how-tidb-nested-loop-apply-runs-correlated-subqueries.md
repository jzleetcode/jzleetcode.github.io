---
author: JZ
pubDatetime: 2026-10-24T18:36:00Z
modDatetime: 2026-10-24T18:36:00Z
title: System Design - How TiDB's Apply Executor Runs a Correlated Subquery
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace one outer row through PhysicalApply, the executor builder, NestedLoopApplyExec, and ApplyCache to see how TiDB evaluates correlated subqueries."
---

This is a small source-code tour for engineers who know SQL but are new to TiDB executors. We will follow one customer's row into a correlated subquery and see how TiDB passes that row's ID to an inner plan. Our scope is four types: `PhysicalApply`, `executorBuilder`, `NestedLoopApplyExec`, and `ApplyCache`. We will not try to explain TiDB's entire join engine.

Source links are pinned to [`pingcap/tidb` commit `0073665a`](https://github.com/pingcap/tidb/tree/0073665a657ecc5b31f88b410504647395772ebb) (October 24, 2026). Other releases can have different code and defaults. The TiDB documentation links explain the concepts; the pinned source is the authority for the implementation described here.

## Table of contents

## A question whose answer depends on the outer row

Imagine a shop asking for each customer's total order value:

```sql
SELECT c.id,
       (SELECT SUM(o.amount)
        FROM orders AS o
        WHERE o.customer_id = c.id) AS total
FROM customers AS c;
```

The expression `c.id` inside the subquery is a **correlated column**: it comes from the outer query, not `orders`. For customer 7 the inner query needs `customer_id = 7`; for customer 9 it needs `customer_id = 9`. In some cases TiDB's optimizer can [decorrelate a subquery](https://docs.pingcap.com/tidb/stable/correlated-subquery-optimization/) into an ordinary join or aggregation. Then there is no `Apply` executor to study. For this walkthrough, assume `EXPLAIN` shows `Apply` (or use a suitable test query and verify its plan); the SQL text alone does not force this plan.

```text
   SQL / optimizer
         |
         v
   PhysicalApply  -- outer/inner plans, correlated columns, cache choice
         |
         v
   executorBuilder.buildApply()
         |
         v
   NestedLoopApplyExec.Next()
      |        |          |
      |        |          +--> ApplyCache (when enabled for this plan)
      |        +-------------> inner child: orders for this customer
      +----------------------> outer child: customers
                                 |
                                 v
                       joiner builds output rows
```

The diagram shows the **serial** path. The builder also has a parallel-Apply branch, but following its worker channels would turn this into a different article.

## The builder wires up two children

Start at [`PhysicalApply`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/planner/core/operator/physicalop/physical_apply.go#L29-L43) and [`executorBuilder.buildApply`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/builder.go#L3023-L3118). The plan holds the cache and concurrency choices. The builder identifies which child is outer and which is inner, builds both child executors, extracts the correlated columns from the inner plan, and constructs a joiner for the plan's join type. It also passes `CanUseCache` and `OuterSchema` into `NestedLoopApplyExec`.

This distinction matters: **the SQL subquery is not re-parsed for every customer**. TiDB builds an executor tree first. At runtime it gives the already-built inner tree _new correlated-column values_ for each outer row. If `PhysicalApply.Concurrency > 1`, the builder attempts to clone inner plans for parallel execution; a failed clone falls back to the serial executor. The [builder branch](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/builder.go#L3080-L3118) shows this choice. In this post we stay with the serial branch.

## `Open` prepares the outer stream

The serial executor's definition and methods live in [`pkg/executor/join/hash_join_v1.go`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1258-L1514). Despite the filename, the relevant type is `NestedLoopApplyExec`. It keeps an `OuterExec`, an `InnerExec`, one list of inner rows, an iterator into that list, and an `OuterSchema` of correlated columns.

`Open` opens the **outer** child, creates reusable chunks and an inner-row list, and attaches memory trackers. It does _not_ keep the inner child permanently open. Later, [`fetchAllInners`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1417-L1451) opens, reads, filters, and closes the inner child for an outer-row evaluation. This is how a single executor tree can repeatedly evaluate a different inner result.

## `Next` carries customer 7 into the inner plan

[`NestedLoopApplyExec.Next`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1453-L1513) fills an output _chunk_ (a batch of rows). Its control flow is easier to remember as a short story:

```text
  outer.Next() -> customer 7
       |
       v
  OuterSchema: correlated c.id <- 7
       |
       +--> cache lookup by encoded correlated values (if allowed)
       |              |
       |       miss: reopen inner, read matching orders, cache list
       |       hit:  reuse earlier inner-row list
       v
  joiner matches outer row with inner rows -> output chunk
       |
       v
  when inner iterator ends -> fetch customer 9, repeat
```

First [`fetchSelectedOuterRow`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1378-L1415) pulls a chunk from the outer child and applies its outer-side filter. For a selected row, `Next` writes its values into the `OuterSchema` correlated-column data. On a cache miss (or without caching), `fetchAllInners` calls the inner child's `Next` repeatedly, applies the inner-side filter, and appends selected rows to `InnerList`. Finally the joiner tries to match the current outer row against the inner iterator and adds results to the caller's output chunk. The executor retains iterator and match state across `Next` calls when an output chunk fills.

Do not confuse the cache with a SQL result cache for the whole statement. It stores **inner rows for a particular correlated key**, before the joiner produces final output. That is useful, for example, when several outer rows have the same lookup key; it does not eliminate the first lookup.

## Why the cache can help, and when it cannot

The builder receives a plan-level `CanUseCache` flag; caching is **not guaranteed** just because a query contains a correlated column. When allowed, `Next` encodes all `OuterSchema` values into a key, checks the `ApplyCache`, and either reuses the saved `chunk.List` or reads the inner child and stores that list. The [`ApplyCache` implementation](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/internal/applycache/apply_cache.go#L27-L105) wraps an LRU cache with a lock and a memory tracker. Its `Set` skips an entry bigger than the quota and evicts older entries as needed.

For our shop example, a customer table with unique IDs offers no repeated `c.id` values: this particular cache may see few hits. A plan whose outer rows repeatedly refer to the same customer could benefit more. The executor records cache hits and accesses for runtime statistics in its [`Close` method](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1295-L1315); use `EXPLAIN ANALYZE` to observe the actual plan and execution, not just guess from the SQL. See TiDB's [`EXPLAIN` guide](https://docs.pingcap.com/tidb/stable/explain-overview/).

## Two settings worth recognizing

- [`tidb_mem_quota_apply_cache`](https://docs.pingcap.com/tidb/stable/system-variables/) limits the cache's memory; the pinned source defines a [32 MiB default](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/vardef/tidb_vars.go#L1630). Raising it does not force the optimizer to choose Apply or to enable caching.
- [`tidb_enable_parallel_apply`](https://docs.pingcap.com/tidb/stable/system-variables/) controls whether parallel Apply is considered; its [default is `false` in this commit](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/vardef/tidb_vars.go#L1724). A serial `NestedLoopApplyExec` is not the same implementation as [`ParallelNestedLoopApplyExec`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/parallel_apply.go#L58-L124). Check the actual plan before drawing performance conclusions.

The shape of the inner plan matters as much as a setting: an efficient lookup per outer key is very different from scanning all orders per customer. Start with the correlated predicate, its index options, and the observed plan; do not assume cache or concurrency fixes a poorly chosen inner access path.

## References

1. TiDB documentation: [correlated subquery optimization](https://docs.pingcap.com/tidb/stable/correlated-subquery-optimization/) and [`EXPLAIN` overview](https://docs.pingcap.com/tidb/stable/explain-overview/).
2. TiDB documentation: [system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
3. `pingcap/tidb`: [`PhysicalApply`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/planner/core/operator/physicalop/physical_apply.go#L29-L43) and [`executorBuilder.buildApply`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/builder.go#L3023-L3118).
4. `pingcap/tidb`: [`NestedLoopApplyExec` and its methods](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/join/hash_join_v1.go#L1258-L1514).
5. `pingcap/tidb`: [`ApplyCache`](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/executor/internal/applycache/apply_cache.go#L27-L105) and [variable defaults](https://github.com/pingcap/tidb/blob/0073665a657ecc5b31f88b410504647395772ebb/pkg/sessionctx/vardef/tidb_vars.go#L1630).
