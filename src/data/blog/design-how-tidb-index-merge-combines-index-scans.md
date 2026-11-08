---
author: JZ
pubDatetime: 2026-11-08T19:30:48Z
modDatetime: 2026-11-08T19:30:48Z
title: System Design - How TiDB Index Merge Combines Index Scans
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's union-type Index Merge from a physical plan through parallel index scans, duplicate-handle removal, and a table lookup."
---

## Table of contents

## Two useful indexes, one question

Suppose a contact table has separate indexes for email and phone:

```sql
CREATE TABLE contacts (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255),
  phone VARCHAR(32),
  INDEX idx_email (email),
  INDEX idx_phone (phone)
);

SELECT id, email, phone
FROM contacts
WHERE email = 'sam@example.com' OR phone = '555-0104';
```

An email match can be found through `idx_email`; a phone match can be found through `idx_phone`. A conventional scan through just one of those indexes may still need to inspect many rows for the other side of the `OR`. TiDB's **union-type Index Merge** can scan both indexes, combine the row handles that satisfy either branch, and then fetch the requested rows.

This walkthrough follows TiDB source at [commit `b98174386ec52467f1fd23eeb6b09e10fe8e77d5`](https://github.com/pingcap/tidb/tree/b98174386ec52467f1fd23eeb6b09e10fe8e77d5). It covers the non-partitioned union path with a table lookup. TiDB also supports intersection-type Index Merge for some `AND` predicates, but that uses a different merge operation and is outside this path.

## The plan carries several scans

The physical plan is not the result rows. It describes a set of partial scans and a table scan that will retrieve the full tuples. `PhysicalIndexMergeReader` stores those partial plans, the table plan, and whether the merge is a union or intersection.

```text
                 TiDB physical plan
              +-----------------------+
              | PhysicalIndexMergeReader |
              | type: union            |
              +-----------+-----------+
                          |
              +-----------+------------+
              |                        |
       partial index scan       partial index scan
          idx_email                idx_phone
        email = 'sam'           phone = '555'
              |                        |
              +-----------+------------+
                          v
                     row handles
                          |
                 remove duplicates
                          |
                    table lookup
                          |
                     result rows
```

The two partial scans are allowed to produce the same handle. A contact whose email and phone both match belongs in the answer once, just as a row from a SQL `OR` predicate should.

## The builder turns the plan into requests

When the executor builder sees a `PhysicalIndexMergeReader`, `buildIndexMergeReader` prepares the partial requests and the final table request. For each index scan, it builds a TiKV DAG request using that index's columns and range. It also builds a table request and obtains one snapshot timestamp for the executor. In this path, the index reads and the table lookup use that same timestamp, so they describe one consistent view of the table.

The resulting `IndexMergeReaderExecutor` keeps the partial plans, index metadata, ranges, table request, and handle-column information. That data lets it turn an index result into a later table read without asking the client to coordinate the two steps.

At the storage boundary, TiDB sends these DAG requests to TiKV with the key ranges to scan. TiKV's `BatchDagHandler` receives a `DagRequest`, creates a `BatchExecutorsRunner`, and runs the request to produce a response. This post stays on the TiDB side of that handoff: TiKV evaluates each partial scan, while TiDB coordinates those scans and merges the handles they return.

## Three worker roles share the work

When the executor starts, it launches one partial worker for each index scan, a merge worker, and a pool of table-scan workers:

```text
  idx_email scan worker ---- handles ----+
                                         |
  idx_phone scan worker ---- handles ----+--> union worker
                                               |  keep unseen handles
                                               v
                                         table task queue
                                               |
                              +----------------+----------------+
                              |                                 |
                       table worker 1                    table worker 2
                              |                                 |
                              +---------- fetched rows --------+
                                               |
                                               v
                                     IndexMergeReader.Next()
```

Each partial index worker sends a DistSQL request and fetches handles in batches. The union worker keeps a handle map for the execution. When a handle first appears, it sends that handle onward; when it appears again from another index, the worker skips it. This is the part that turns two result sets into the set-union meaning of `OR`.

The table-scan workers batch the remaining handles into table-reader requests. Those requests retrieve the columns needed by the query. `IndexMergeReaderExecutor.Next` reads completed table tasks and appends their rows into output chunks for the parent executor.

The division of work matters: index scans find candidate rows, the merge worker combines candidates, and the table lookup retrieves full rows. The merge is not a SQL join between the indexes, and the index entries are not automatically the complete rows selected by the query.

## Checking whether TiDB chose the path

Index Merge is a plan choice, not a promise made by the SQL syntax. TiDB may choose a table scan or a single-index path if its estimates say that is cheaper. For diagnosis, inspect the plan:

```sql
EXPLAIN
SELECT /*+ USE_INDEX_MERGE(contacts, idx_email, idx_phone) */
       id, email, phone
FROM contacts
WHERE email = 'sam@example.com' OR phone = '555-0104';
```

Look for an `IndexMerge` operator with `type: union`, partial `IndexRangeScan` children, and a table-row lookup beneath it. Use `EXPLAIN ANALYZE` to compare actual row counts and time; the hint is useful for exploring a plan, but it does not prove that the plan is faster for the real data distribution.

The main setting is `tidb_enable_index_merge`. It enables the optimizer to consider Index Merge; it does not mean every eligible query will use it. The `USE_INDEX_MERGE` hint can request Index Merge for a statement. TiDB's documentation records version-specific behavior for the setting and for automatic selection, so check the docs for the version you operate.

Index Merge is most promising when each branch finds a relatively small set of handles. If either branch matches a large portion of the table, merging handles and fetching rows can cost more than another plan. A composite index or a table scan may be a better fit. The answer depends on the predicates, statistics, and table size, so inspect the plan and measure it.

## What this walkthrough leaves out

This path explains the union form for an `OR` condition that TiDB can evaluate through the chosen indexes. Intersection for `AND`, partitioned tables, global indexes, ordering, pushed limits, and index-only plans add separate decisions and code paths. In particular, do not infer the behavior of intersection from the union worker: the source selects a different merge loop when the physical plan marks the operation as an intersection.

## The useful mental model

Index Merge is a small pipeline: each index answers “which rows might match my predicate?”, a union worker removes repeated row handles, and table readers fetch the rows the query asked to return. The plan joins those pieces under one reader and one snapshot. That model makes an `IndexMerge` node in `EXPLAIN` easier to read and gives you a concrete place to investigate when a query with an `OR` clause is slow.

## References

1. TiDB source, [`PhysicalIndexMergeReader`](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/planner/core/operator/physicalop/physical_indexmerge_reader.go#L35-L58) (partial plans, table plan, and merge type).
2. TiDB source, [`buildNoRangeIndexMergeReader`](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/builder.go#L5112-L5193) and [`buildIndexMergeReader`](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/builder.go#L5223-L5272).
3. TiDB source, [`IndexMergeReaderExecutor` worker overview](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/index_merge_reader.go#L64-L91), [worker startup](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/index_merge_reader.go#L317-L378), [table lookup and chunk output](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/index_merge_reader.go#L823-L905), and [union/dedup loop](https://github.com/pingcap/tidb/blob/b98174386ec52467f1fd23eeb6b09e10fe8e77d5/pkg/executor/index_merge_reader.go#L1249-L1353).
4. PingCAP, [Explain Statements Using Index Merge](https://docs.pingcap.com/tidb/stable/explain-index-merge/) (union and intersection plans, hints, and version notes).
5. PingCAP, [Optimizer hints](https://docs.pingcap.com/tidb/stable/optimizer-hints/#use_index_merget1_name-idx1_name--idx2_name-) and [system variable `tidb_enable_index_merge`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_index_merge-new-in-v40).
6. TiKV source, [`BatchDagHandler`](https://github.com/tikv/tikv/blob/96033a26bb4b5427deadc6168a3d210a5cd2b6ae/src/coprocessor/dag/mod.rs#L161-L204) (receives a DAG request and runs it through the coprocessor executor runner).
7. MySQL Reference Manual, [Index Merge Optimization](https://dev.mysql.com/doc/refman/8.4/en/index-merge-optimization.html) (related background on combining range scans).
