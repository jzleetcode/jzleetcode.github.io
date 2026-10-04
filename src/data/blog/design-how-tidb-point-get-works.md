---
author: JZ
pubDatetime: 2026-10-04T18:43:14Z
modDatetime: 2026-10-04T18:43:14Z
title: System Design - How TiDB Point Get Works
tags:
  - design-system
  - design-database
description: "Trace a TiDB Point_Get query from planner eligibility through PointGetExecutor to TiKV's snapshot Get, with source links, diagnostics, and relevant controls."
---

## Table of contents

## Context

Suppose a table has millions of users, but the application already knows the exact primary key for one user:

```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(120)
);

SELECT display_name FROM users WHERE id = 42;
```

TiDB does not need to scan rows looking for `id = 42`. It can recognize that the predicate identifies at most one row and build a **Point Get** plan. In `EXPLAIN`, this appears as `Point_Get`; a lookup through a unique secondary index can still require a second fetch to retrieve the row.

This walkthrough follows that one-row read across TiDB's planner and executor into the TiKV request handler. The source links are pinned to the TiDB commit `93a01d3` and TiKV commit `c61d92c`, so the code discussed here is reproducible.

## The component path

```text
 SQL: SELECT ... WHERE id = 42
                 |
                 v
 TiDB planner: tryPointGetPlan
                 |
                 v
       physicalop.PointGetPlan
                 |
                 v
 executorBuilder.buildPointGet
                 |
                 v
       PointGetExecutor.Next
                 |
     encode table row key
                 |
                 v
 TiDB KV snapshot -- Get(key, start_ts) --> TiKV service::future_get
                                                 |
                                                 v
                                    Storage::get_entry(snapshot)
                                                 |
                                                 v
                                      value or not found
```

## First, the planner proves the key is unique

TiDB's `tryPointGetPlan` fast path examines the parsed `SELECT` before it builds the executor. The current implementation requires a single table, a predicate that resolves to a unique key, and a compatible table schema. It declines queries with `ORDER BY` or `HAVING`; when a `LIMIT` is present, the count must be positive and the offset must be zero. It also checks that table columns are public and not generated.

For a primary-key lookup such as `WHERE id = 42`, the planner extracts the equality value, checks that the primary access path is allowed by index hints, and puts the handle into a `PointGetPlan`. The same fast-path code can select a fully specified unique secondary index. It does not mean every selective-looking predicate qualifies: a non-unique index or a range such as `id BETWEEN 40 AND 42` can match multiple rows.

The source is [`tryPointGetPlan`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/planner/core/point_get_plan.go#L519-L600). The plan estimates one output row, which lets the rest of TiDB treat this as a small, specialized operator rather than a general scan.

## Then the builder selects a specialized executor

When the plan reaches executor construction, [`executorBuilder`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/builder.go#L228-L236) dispatches `physicalop.PointGetPlan` to `buildPointGet`. That method creates a `PointGetExecutor`, chooses the transaction's read timestamp, and prepares a one-row output chunk.

On `Next`, the executor turns a primary-key handle into TiDB's encoded row key and reads it. With a unique secondary index, it first reads the index key, decodes the row handle stored in the index value, and then reads the row key. So a `Point_Get` plan is a one-row guarantee, not necessarily one storage-key lookup.

The path is implemented in [`buildPointGet`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/point_get.go#L52-L117) and [`PointGetExecutor.Next`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/point_get.go#L304-L430). If the key does not exist, the executor returns an empty chunk, which SQL presents as zero rows.

## The read still belongs to a transaction

A shortcut must preserve transaction semantics. Before going to the storage snapshot, `PointGetExecutor.get` checks the current transaction's in-memory write buffer. If the transaction has a relevant pessimistic lock, it can also consult the lock cache. Otherwise, it reads from the snapshot selected for the statement.

That ordering gives a transaction read-your-own-writes behavior while preserving snapshot visibility for data not changed by the current transaction. TiKV's [`Storage::get_entry`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/storage/mod.rs#L630-L655) documents the snapshot rule: only writes committed before the requested `start_ts` are visible.

TiDB's KV client routes the encoded key to the appropriate TiKV region and sends a `GetRequest`. In TiKV, the `kv_get` service entry is wired to `future_get`; that handler passes the key and request version to `Storage::get_entry`, then returns either the value or a not-found response. See [`PointGetExecutor.get`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/point_get.go#L658-L710) and TiKV's [`future_get`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/server/service/kv.rs#L1617-L1659).

For a primary-key query, this is the simplest path: one encoded row key and one logical Get. Region retries, lock resolution, or a unique secondary-index lookup can add work, so a Point Get plan should not be read as a promise of exactly one network RPC.

## Inspecting and tuning the path

Start with `EXPLAIN` and check whether the plan contains `Point_Get`. `EXPLAIN ANALYZE` adds runtime information, including actual execution details; because it runs the statement, use it thoughtfully outside read-only examples. TiDB's [EXPLAIN ANALYZE reference](https://docs.pingcap.com/tidb/stable/sql-statement-explain-analyze/) describes the output.

There is no general switch you must turn on to make a primary-key equality eligible. The optimizer chooses the specialized path when the query and schema qualify. Two similarly named controls are worth distinguishing:

- `tidb_opt_fix_control = '52592:ON'` disables `Point_Get` and `Batch_Point_Get`. The [optimizer fix-control documentation](https://docs.pingcap.com/tidb/stable/optimizer-fix-controls/) describes it as an escape hatch for cases where reading a wide row for a narrow projection is less efficient than using a Coprocessor path. Measure before using it; it trades the point-read path for another execution path.
- `tidb_enable_point_get_cache` is not a general Point Get on/off switch. It defaults to `OFF` and the executor uses that cache branch only for tables with a `READ` or `READ ONLY` table lock. See the [system variable reference](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_point_get_cache) and the condition in `PointGetExecutor.get`.

If the query has multiple exact keys, TiDB has a separate `Batch_Point_Get` plan. If no unique key can be resolved, the planner needs a scan or another access path. The distinction is simple: **Point Get is fast because the planner can name the row before execution begins.**

## References

1. TiDB source, [`tryPointGetPlan`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/planner/core/point_get_plan.go#L519-L600).
2. TiDB source, [executor plan dispatch](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/builder.go#L228-L236).
3. TiDB source, [`PointGetExecutor`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/point_get.go#L52-L117).
4. TiDB source, [`PointGetExecutor.Next` and `get`](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/point_get.go#L304-L430).
5. TiKV source, [KV `future_get`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/server/service/kv.rs#L1617-L1659) and [`Storage::get_entry`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/storage/mod.rs#L630-L655).
6. TiDB docs, [EXPLAIN ANALYZE](https://docs.pingcap.com/tidb/stable/sql-statement-explain-analyze/), [optimizer fix controls](https://docs.pingcap.com/tidb/stable/optimizer-fix-controls/), and [system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
