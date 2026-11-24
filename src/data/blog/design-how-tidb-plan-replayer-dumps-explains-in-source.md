---
author: JZ
pubDatetime: 2026-11-24T19:33:00Z
modDatetime: 2026-11-24T19:33:00Z
title: TiDB Source Walkthrough - How PLAN REPLAYER DUMP EXPLAIN Works
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow TiDB's PLAN REPLAYER DUMP EXPLAIN from PlanReplayerExec through the archive builder to the download handler, and see which schema, statistics, bindings, and settings help reproduce a plan."
---

## Table of contents

## The plan that only happens in production

Suppose a query is fast in a test cluster but slow in production. The SQL text alone may not explain the difference. TiDB may have a different table schema, statistics, SQL binding, configuration, or session variable, and any of those can affect the optimizer's choices.

`PLAN REPLAYER DUMP EXPLAIN` packages the planning context for a query into a ZIP file. An engineer can load that file in a separate TiDB environment and inspect whether the same inputs produce the same plan. The archive contains metadata used to reproduce the plan; it does **not** contain table rows.

This walkthrough follows the on-demand `DUMP EXPLAIN` path through four pieces of TiDB source code. The links point to the inspected `pingcap/tidb` snapshot at commit [`0103aff49f98b3f9bb87fa474b17716a822151f9`](https://github.com/pingcap/tidb/tree/0103aff49f98b3f9bb87fa474b17716a822151f9), so filenames and behavior can be compared against that exact revision.

## The four pieces in the path

```text
 SQL client
     |
     | PLAN REPLAYER DUMP EXPLAIN SELECT ...
     v
 PlanReplayerExec.Next
     | creates archive file and saves statement read timestamp
     v
 PlanReplayerDumpInfo.dump
     |
     v
 DumpPlanReplayerInfo
     |-- finds referenced tables and views
     |-- writes schema, statistics, config, variables, bindings, SQL
     |-- runs EXPLAIN and stores the result
     v
 external file storage (ZIP)
     |
     | file token or presigned URL
     v
 PlanReplayerHandler --> client downloads the ZIP
```

The main path is split across [`PlanReplayerExec` and `PlanReplayerDumpInfo`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/executor/plan_replayer.go), the archive writer in [`DumpPlanReplayerInfo`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/domain/plan_replayer_dump.go), and the HTTP download handler in [`PlanReplayerHandler`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/server/handler/optimizor/plan_replayer.go).

## Step 1: The SQL executor starts the dump

Run the statement in the same database and session where the plan was observed:

```sql
USE shop;
PLAN REPLAYER DUMP EXPLAIN
  SELECT * FROM orders WHERE customer_id = 42;
```

The planner builds a plan-replayer executor. On its first `Next` call, `PlanReplayerExec` sees that this is a dump request, creates a file through TiDB's external-storage interface, and reads the statement's current read timestamp from the transaction manager. It puts that timestamp, the SQL statements, the `EXPLAIN` option, and the session context into a `PlanReplayerDumpInfo`.

The code separates preparing this information from writing the archive because some forms of dump read a SQL file later in connection handling, after the transaction manager has finished. For the common one-statement case, the executor immediately calls `PlanReplayerDumpInfo.dump`, which constructs a `PlanReplayerDumpTask` and hands it to the domain layer.

## Step 2: The domain layer selects the planning inputs

`DumpPlanReplayerInfo` owns the ZIP writer. It first records SQL metadata, TiDB configuration, and TiDB version information. Then it walks the parsed SQL abstract syntax tree to find tables and views referenced by the statement. This is more reliable than searching the SQL string: a table can be schema-qualified, hidden inside a common table expression, or reached through a view. The extractor expands views and includes referenced foreign-key tables where needed.

For those table names, the archive writer adds their schema definitions, statistics, and TiFlash replica information. It also writes the SQL text, session variables, and session and global SQL bindings. Finally, `dumpPlanReplayerExplain` runs `EXPLAIN` for each input statement and stores the formatted rows in the archive. When the request asks for `EXPLAIN ANALYZE`, the helper runs `EXPLAIN ANALYZE`, which executes the query to collect runtime measurements; use that form only when running the query is acceptable.

For a single query, the ZIP contains files with names such as:

```text
plan_replayer.zip
|-- sql_meta.toml
|-- config.toml
|-- meta.txt
|-- variables.toml
|-- sql/sql0.sql
|-- explain.txt
|-- schema/shop.orders.schema.txt
|-- stats/shop.orders.json
|-- statsMem/shop.orders.txt
|-- session_bindings.sql
`-- global_bindings.sql
```

The exact set of files can change across TiDB versions. The useful idea is that the dump captures **plan inputs and plan output**, while leaving row data behind. The plan can therefore be studied without copying the production table contents.

## Step 3: TiDB returns a token that leads to the file

After the ZIP writer closes the file, `PlanReplayerExec` saves its token in the current session's `tidb_last_plan_replayer_token` variable and returns the token as the statement result. You can query it later with:

```sql
SELECT @@tidb_last_plan_replayer_token;
```

In a traditional deployment, use that token with the TiDB status-port endpoint:

```text
http://<tidb-host>:<status-port>/plan_replayer/dump/<file-token>
```

The `PlanReplayerHandler` asks the external-storage layer for the file. If the file is not on that TiDB instance, the handler checks the cluster topology and forwards the download request to other TiDB servers. The handler streams the archive to the client instead of loading the entire ZIP into memory. With remote object storage, current TiDB code can return a presigned download URL instead of a local file token.

This storage indirection is why the SQL connection can create the dump while the HTTP request later reaches a different TiDB node: the token identifies a file, and the handler knows how to find it.

## Step 4: Load the snapshot in a safe environment

On a separate troubleshooting cluster, `PLAN REPLAYER LOAD 'plan_replayer.zip'` restores the captured schema and optimizer context so the query can be explained again. Loading a bundle changes the destination cluster's schema, statistics, session variables, and SQL bindings. Use an isolated environment rather than a production cluster.

TiDB's [PLAN REPLAYER guide](https://docs.pingcap.com/tidb/stable/sql-plan-replayer/) recommends disabling auto analyze before loading. Otherwise, auto analyze can overwrite the statistics from the archive before the plan is inspected:

```sql
SET GLOBAL tidb_enable_auto_analyze = OFF;
PLAN REPLAYER LOAD 'plan_replayer.zip';
```

The purpose of the dump is reproducibility, so keep the captured inputs intact long enough to compare the original and replayed plans. Restore the destination cluster's normal settings after the investigation.

## Settings that affect capture and replay

The on-demand `PLAN REPLAYER DUMP EXPLAIN` command is different from background `PLAN REPLAYER CAPTURE`, which waits for a query with a registered SQL and plan digest to appear.

| Setting                                        | Default            | What it controls                                                                                              |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `tidb_enable_plan_replayer_capture`            | `ON`               | Enables the digest-based `PLAN REPLAYER CAPTURE` feature. It is not required for an on-demand `DUMP EXPLAIN`. |
| `tidb_enable_plan_replayer_continuous_capture` | `OFF`              | Enables continuous capture for registered capture tasks.                                                      |
| `tidb_enable_auto_analyze`                     | `ON` in normal use | Turn it off while loading a bundle if you need the archived statistics to remain in place for the replay.     |

The first two variables control automatic capture. They do not change what the one-shot dump command is intended to capture. The third protects the test setup from replacing imported statistics before you compare plans. See TiDB's [system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_plan_replayer_capture) for the capture variables and their scope.

## What the bundle can and cannot prove

A plan-replayer bundle helps isolate optimizer differences. It can preserve schema, statistics, bindings, variables, configuration, SQL text, and the plan output that TiDB produced. It does not reproduce production data or workload contention. The query's actual latency can still differ because of data distribution, network conditions, caches, concurrent transactions, or resource limits.

The archive includes SQL text and details about the environment. Review it before sharing it outside the team that is debugging the query.

## References

1. TiDB documentation, [Use PLAN REPLAYER to Save and Restore the On-Site Information of a Cluster](https://docs.pingcap.com/tidb/stable/sql-plan-replayer/).
2. TiDB documentation, [System variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_plan_replayer_capture), including `tidb_enable_plan_replayer_capture` and `tidb_enable_plan_replayer_continuous_capture`.
3. TiDB source, [`pkg/executor/plan_replayer.go`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/executor/plan_replayer.go).
4. TiDB source, [`pkg/domain/plan_replayer_dump.go`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/domain/plan_replayer_dump.go).
5. TiDB source, [`pkg/server/handler/optimizor/plan_replayer.go`](https://github.com/pingcap/tidb/blob/0103aff49f98b3f9bb87fa474b17716a822151f9/pkg/server/handler/optimizor/plan_replayer.go).
