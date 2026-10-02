---
author: JZ
pubDatetime: 2026-10-02T00:00:00Z
modDatetime: 2026-10-02T00:00:00Z
title: System Design - How TiDB Index Lookup Pushdown Works
tags:
  - design-system
  - design-database
description: "A source-code walkthrough of TiDB's double-read IndexLookUp plan, how TiDB and TiKV cooperate to push local row lookups down, and the policy, hint, and affinity settings that control it."
---

## Table of contents

This explanation is for engineers learning TiDB's source code. It follows one secondary-index query through TiDB's `IndexLookUpExecutor` and TiKV's `BatchIndexLookUpExecutor`, then explains when the local lookup can avoid sending a second request back to TiKV.

## Why an index lookup needs two reads

Suppose a table has a secondary index on `region`, but a query also asks for the `note` column:

```sql
SELECT /*+ INDEX_LOOKUP_PUSHDOWN(profiles, idx_region) */ note
FROM profiles
WHERE region = 'west';
```

An index entry is usually smaller than the full row. The index scan can find matching `region` values and their row handles, but it may not have `note`. TiDB must use each handle to fetch the base-table row. This is called a **double read**: first scan the index, then look up rows by handle.

Without pushdown, the journey looks like this:

```text
TiDB                                      TiKV
  |                                         |
  |-- scan idx_region for 'west' --------->|
  |<-- index values + row handles ----------|
  |                                         |
  |-- fetch table rows by handles -------->|
  |<-- full rows ---------------------------|
  |                                         |
  +-- return selected columns to client     |
```

The two requests are correct, but the second trip from TiDB can add latency. The idea behind **IndexLookUp pushdown** is to let TiKV try the table lookup near the index scan, where some matching rows may already be reachable locally.

## What TiDB builds

The optimizer represents this work as an `IndexLookUp` plan with an index side and a table side. In the [TiDB builder](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/builder.go#L4850-L4865), `buildNoRangeIndexLookUpReader` checks the plan's pushdown flag. If it is set, TiDB builds a pushdown DAG; otherwise it builds the ordinary index request. The executor still keeps the table request, because some rows may need the normal lookup path.

The [pushdown DAG builder](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/builder.go#L4750-L4788) creates an intermediate output channel for the index lookup operator. That channel carries either an index result with a row handle or a completed row produced by the pushed-down lookup.

## What TiKV does with the handles

On TiKV, the [executor builder](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/components/tidb_query_executors/src/index_lookup_executor.rs#L130-L187) creates a `BatchIndexLookUpExecutor`. It keeps the index scan as its source and builds an iterator that turns returned handles into table tasks. Its state machine has an `IndexScan` phase followed by a `TableLookUp` phase ([phase definitions](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/components/tidb_query_executors/src/index_lookup_executor.rs#L48-L64), [phase transition](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/components/tidb_query_executors/src/index_lookup_executor.rs#L314-L336)).

The lookup builder groups handles by region. When it can find the region's leader and obtain local region storage, it creates a local table task for those key ranges. Handles that cannot be served by that local path remain for TiDB to fetch. The [region grouping and local-storage attempt](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/components/tidb_query_executors/src/index_lookup_executor.rs#L890-L989) is the concrete reason affinity can matter: it makes the index result and the table row more likely to be on a TiKV node that can serve both parts locally.

```text
Client
  |
  v
TiDB builder -- builds one DAG with LocalIndexLookUp --> TiKV
  |                                                   |
  |                                      index scan for matching keys
  |                                                   |
  |                                      try local table lookup by handle
  |                                                   |
  |<-- completed rows (local hit) + remaining handles |
  |                                                   |
  +-- emit completed rows                             |
  +-- send remaining handles through the usual table reader
  |                                                   |
  +-- combine rows and return result                  |
```

This is a best-effort local optimization, not a promise that every row is returned by the first TiKV request. At the pinned TiDB source revision, the result reader separates completed rows from handles: it sends completed rows directly onward and dispatches remaining handles as table-lookup work ([result handling](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/distsql.go#L1707-L1748), [channel decoding](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/distsql.go#L1810-L1859)). The regular table worker then reads rows using those handles ([table worker](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/distsql.go#L2388-L2435)).

The fallback is important for correctness. If a row is not local to the TiKV node doing the index scan, TiDB can still perform the ordinary table read instead of silently dropping that result.

## Where region affinity fits

Pushdown can save a network trip only when TiKV can also reach the corresponding row. TiDB's **table affinity** feature helps by asking Placement Driver (PD) to schedule regions from the same table, or from the same table partition, onto the same subset of TiKV nodes. That raises the chance that an index scan can find a row locally. It does not change the fact that rows can miss the local path.

The feature and the pushdown controls are separate:

- `AFFINITY='table'` or `AFFINITY='partition'` configures affinity for a table or its partitions.
- PD's `schedule.affinity-schedule-limit` must be greater than `0` to enable affinity scheduling; its default of `0` leaves that scheduling disabled.
- `tidb_index_lookup_pushdown_policy` controls when TiDB pushes the operator down. It is a session/global enum and defaults to `hint-only`.

The policy values are:

| Value            | Behavior                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `hint-only`      | Default. Push down only when the query includes `INDEX_LOOKUP_PUSHDOWN`. |
| `affinity-force` | Automatically push down lookups for tables configured with `AFFINITY`.   |
| `force`          | Automatically push down eligible lookups for all tables.                 |

For a cautious test, leave the default policy and add the hint to one query. The hint can name the table and the index, as shown in the earlier example. `NO_INDEX_LOOKUP_PUSHDOWN(table_name)` opts a table out when a broader policy is enabled; TiDB documents that this negative hint takes precedence if both hints appear.

Affinity scheduling is experimental in the TiDB v8.5.5 documentation and disabled by default. Enabling the policy or hint does not guarantee a speedup: the benefit depends on region placement, the number of local hits, and the cost of the remaining lookups. Compare plans and latency on representative data before using a broad `force` policy.

## What to remember

1. A normal `IndexLookUp` uses the index to find handles, then fetches the base rows.
2. TiDB's builder can encode that relationship into a TiKV DAG with an intermediate channel.
3. TiKV runs the index scan and attempts a local table lookup; it returns complete rows for local hits and handles for misses.
4. TiDB sends misses through its existing table worker, so pushdown reduces round trips when it can but keeps the ordinary path available.
5. The policy defaults to hint-only. Table affinity and PD scheduling improve locality but are separate controls, and the feature remains workload-dependent.

## References

- [TiDB optimizer hints: `INDEX_LOOKUP_PUSHDOWN`](https://docs.pingcap.com/tidb/stable/optimizer-hints/)
- [TiDB system variables: `tidb_index_lookup_pushdown_policy`](https://docs.pingcap.com/tidb/stable/system-variables/)
- [TiDB table affinity](https://docs.pingcap.com/tidb/v8.5/table-affinity)
- [TiDB v8.5.5 release notes](https://docs.pingcap.com/tidb/stable/release-8.5.5/)
- [TiDB `IndexLookUpExecutor` and result handling](https://github.com/pingcap/tidb/blob/93a01d31f6da205ae4bf376825293903a6899fdb/pkg/executor/distsql.go#L485-L582)
- [TiKV `BatchIndexLookUpExecutor`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/components/tidb_query_executors/src/index_lookup_executor.rs)
