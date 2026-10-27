---
author: JZ
pubDatetime: 2026-10-27T18:31:18Z
modDatetime: 2026-10-27T18:31:18Z
title: System Design - How TiDB Batch Point Get Fetches Unique Keys
tags:
  - design-system
  - design-database
  - design-tidb
description: "Walk through TiDB's BatchPointGetPlan, executor builder, and BatchPointGetExec as an IN-list on a unique secondary index becomes two KV batch reads."
---

## Table of contents

## Three product codes, two rows

Suppose an inventory table has a numeric primary key, a **unique secondary index** on `sku`, and a `label` column. Assume rows for `A-42` and `B-17` already exist. You ask for both but repeat one code:

```sql
CREATE TABLE inventory (
  id BIGINT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL,
  label VARCHAR(64),
  UNIQUE KEY uk_inventory_sku (sku)
);

SELECT id, label
FROM inventory
WHERE sku IN ('A-42', 'B-17', 'A-42');
```

The answer should not contain `A-42` twice just because the input list repeats it. When TiDB chooses its `Batch_Point_Get` access path for this kind of query, how does it find the rows without scanning the table? It cannot read the complete row from our example's secondary-index value: that value identifies a **row handle** (think "where to find the row"), not the `label` we asked for.

This post follows **three code units** in [`pingcap/tidb` at commit `42abf54ebbcb8559efe9971c4da219b63d8884d8`](https://github.com/pingcap/tidb/tree/42abf54ebbcb8559efe9971c4da219b63d8884d8): `BatchPointGetPlan`, `executorBuilder.buildBatchPointGet`, and `BatchPointGetExec`. We keep to the non-partitioned, non-locking **unique secondary index** path. Other code in these same units handles clustered keys, partitions, locks, caches, and virtual columns; those paths are not interchangeable with this example. `EXPLAIN` is the way to check the plan for a real query; the SQL here illustrates the path, not a promise that every schema and version selects it. For a single-key path, see [how TiDB Point Get works](/posts/design-how-tidb-point-get-works/).

## The three pieces and two lookups

```text
  optimizer                 TiDB executor                 TiKV-backed KV snapshot
  +-------------------+     +-------------------------+     +-------------------+
  | BatchPointGetPlan |---->| buildBatchPointGet()    |---->| snapshot          |
  | index values:     |     | constructs and equips   |     +---------+---------+
  | A-42 B-17 A-42    |     | BatchPointGetExec       |               ^
  +-------------------+     +------------+------------+               |
                                        |                            |
                              +---------v-----------+                |
                              | BatchPointGetExec   |-- 1. index keys+
                              | dedup -> handles    |<-- handles ----+
                              | handles -> row keys |-- 2. row keys -+
                              | decode -> rows      |<-- row bytes --+
                              +---------------------+
```

[`BatchPointGetPlan`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/planner/core/operator/physicalop/physical_batch_point_get.go#L488-L530) stores either handles or index values, plus `IndexInfo`, partition information, `KeepOrder`, `Desc`, `Lock`, and `LockWaitTime`. It is a _description of work_, not a set of rows fetched from storage. The builder [prunes partitions and values](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/builder.go#L6144-L6187), creates `BatchPointGetExec`, and [provides its snapshot and initial chunk capacity](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/builder.go#L6189-L6256). In our non-partitioned example, partition pruning is not the story; the two batch reads are.

### First read: unique index keys to handles

Before the KV reads, the plan's [`PrunePartitionsAndValues`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/planner/core/operator/physicalop/physical_batch_point_get.go#L810-L868) discards index-value tuples containing `NULL`. With `sku IN (NULL)`, there is no matching equality key to fetch. For our other values, [`BatchPointGetExec.initialize`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L254-L323) encodes each unique-index key and uses a set of encoded keys to remove repeats. Only then does it call `BatchGet` with the keys. The input contains three literals, but this stage sends only two distinct index keys.

The batch getter returns a **map**, so the executor does not assume the map's iteration order matches the request. It walks its ordered list of keys and reads each corresponding value. Missing index entries are skipped; found entries are [decoded into handles](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L325-L364). If the plan requires an order, `KeepOrder` makes the executor sort index keys first; otherwise, **do not infer SQL result order from the spelling of the `IN` list**. An explicit `ORDER BY` is how a query specifies its required order, though the chosen plan can differ.

### Second read: handles to complete rows

For each handle, the executor [encodes a row key](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L414-L446), then calls `BatchGet` again for the row values. It walks the requested row keys rather than ranging over the map. Found values and their handles are accumulated in the same order; missing row values are not silently treated as ordinary "no match" in the normal unique-index path. The [missing-row consistency check](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L455-L500) can report an index/row inconsistency instead.

Finally, [`Next`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L215-L251) decodes the collected row bytes into the caller's chunk until that chunk is full. Initialization happens once on the first `Next`; subsequent calls continue from the saved position. This makes the separation clear: **batched KV fetching happens in `initialize`, while `Next` serves the fetched rows as chunks**. An empty result simply leaves the chunk empty.

## What changes when the read is locking?

Our example is a plain read. When the plan's `Lock` field is true, the builder passes along `LockWaitTime` and the executor's [locking branch](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L434-L500) matters. In the path the code calls repeatable-read isolation, it locks row and index keys (including missing ones) before fetching row values. In its read-committed branch, it locks only keys whose rows were found after that fetch. These are different consistency semantics, not merely performance switches; do not add `FOR UPDATE` to this example and assume the two KV reads remain the whole story. See [TiDB's pessimistic-transaction documentation](https://docs.pingcap.com/tidb/stable/pessimistic-transaction/) for the transaction-level context.

Two other knobs are easy to misread. `KeepOrder` and `Desc` are **plan fields** passed to the executor, not session variables to set by copying this post. The builder's [`SetInitCap` and `SetMaxChunkSize`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/builder.go#L6249-L6255) derive from the number of handles or index values; they are local capacity choices, not a universal batch-size setting. If a session has a maximum execution time, [`initialize` adds a deadline](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L254-L265) around the batch-read work. None of these knobs turns a non-unique predicate into a point lookup.

## The useful mental model

A unique index maps a searched value to **one handle**; a row key maps that handle to **row bytes**. `BatchPointGetExec` groups each hop into a KV batch read, filters duplicate search keys before the first hop, and preserves handle/value alignment while serving chunks. That's why a small `IN` list over a unique key can avoid a full scan without producing duplicate rows.

## References

1. TiDB source snapshot, [`BatchPointGetPlan` and partition/value pruning](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/planner/core/operator/physicalop/physical_batch_point_get.go#L488-L530).
2. TiDB source snapshot, [`executorBuilder.buildBatchPointGet`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/builder.go#L6144-L6256).
3. TiDB source snapshot, [`BatchPointGetExec`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L48-L85) and its [`initialize`](https://github.com/pingcap/tidb/blob/42abf54ebbcb8559efe9971c4da219b63d8884d8/pkg/executor/batch_point_get.go#L254-L501).
4. PingCAP, [TiDB EXPLAIN overview](https://docs.pingcap.com/tidb/stable/explain-overview/) (checking the chosen execution plan).
5. PingCAP, [Pessimistic transactions](https://docs.pingcap.com/tidb/stable/pessimistic-transaction/) (locking-read semantics).
