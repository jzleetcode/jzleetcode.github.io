---
author: JZ
pubDatetime: 2026-10-29T18:45:00Z
modDatetime: 2026-10-29T18:45:00Z
title: System Design - How TiDB Statement Summary Works in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow one completed TiDB statement into the bounded digest map, interval history, and statement-summary tables, with the key source types and configuration controls."
---

## Table of contents

## Why a summary, not a query log?

A busy database can execute millions of statements. Keeping one detailed record for every execution would consume memory quickly and make a familiar diagnosis hard: “Which _kind_ of SQL is expensive?”

TiDB's statement summary answers that question by aggregating executions that share a normalized SQL digest. It records counts, latency, scan statistics, resource use, warnings, plans, and more in bounded time windows. The results are exposed through `INFORMATION_SCHEMA` and `sys` statement-summary tables.

This walkthrough follows the public TiDB source at commit [`9f32fa65`](https://github.com/pingcap/tidb/commit/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260). Its scope is intentionally small: four cooperating types in `pkg/util/stmtsummary/statement_summary.go`.

## The four actors

```text
completed statement
        |
        v
StmtExecInfo
  one execution's digest, plan, timings, session context, and details
        |
        v
stmtSummaryByDigestMap  (global, bounded LRU map)
        |
        +-- key: StmtDigestKey
        |     normalized statement identity and optional dimensions
        |
        `-- value: stmtSummaryByDigest
                 cumulative statistics + a list of time windows
                              |
                              v
                 stmtSummaryByDigestElement
                 one interval's counters and maxima
```

The names are long because each says exactly what it owns. `StmtExecInfo` is an input snapshot for one execution. `stmtSummaryByDigestMap` finds the bucket. `stmtSummaryByDigest` owns the durable identity and history for that digest. Each `stmtSummaryByDigestElement` is the mutable statistics for one interval.

## First, TiDB turns many literals into one question

These SQL statements should normally be investigated together:

```sql
SELECT * FROM orders WHERE id = 41;
SELECT * FROM orders WHERE id = 99;
```

Their text is different, but their normalized shape is the same: `SELECT * FROM orders WHERE id = ?`. TiDB supplies that normalized SQL and its digest in `StmtExecInfo`. The summary key also includes schema name, previous-statement digest when relevant, plan digest, and resource group. When `tidb_stmt_summary_enable_group_by_user` is enabled, it includes the user too.

The source type is [`StmtDigestKey`](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L52-L91). Its `Init` method appends the key fields into one byte slice. The user field is length-prefixed so two different field boundaries cannot accidentally form the same key. That small implementation detail matters: grouping is only trustworthy when distinct statements cannot collide.

## The global map admits an execution

The package-level `StmtSummaryByDigestMap` is a singleton `stmtSummaryByDigestMap`. Its `AddStatement` method is the front door:

```text
AddStatement(StmtExecInfo)
  |-- read enabled/history options
  |-- lock global map
  |-- reject disabled collection or excluded internal SQL
  |-- advance the current interval if its boundary passed
  |-- find or create the digest's LRU entry
  `-- delegate to that entry's add method
```

The map uses `kvcache.SimpleLRUCache`, not an unlimited Go map. `tidb_stmt_summary_max_stmt_count` bounds how many distinct statement digests it retains. When a new digest forces eviction, TiDB loses detailed in-memory history for that old identity rather than letting monitoring traffic consume the server.

It may seem tempting to replace the global mutex with many smaller locks. The source comment explains the counterintuitive choice: this critical section is short, and a prior layered-lock design produced more benchmark contention. After the map locates the bucket, the entry uses its own lock, so updating an existing digest does not require holding the global lock for all statistic work. See [`AddStatement`](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L362-L440).

## Then one digest rolls through time windows

`stmtSummaryByDigest.add` performs the per-digest work. It initializes stable fields once—normalized SQL, schema, plan digest, table names, and binding information—then adds each execution to cumulative counters and an interval element.

```text
digest: SELECT ... WHERE id = ?

cumulative totals:  12,491 executions, sum latency, maxima, scans, ...

history list (refresh interval = 30 minutes)
  [09:00, 09:30) --> 4,110 executions
  [09:30, 10:00) --> 4,908 executions
  [10:00, 10:30) --> 3,473 executions   <-- current element
```

If the next execution lands after the current interval, `add` expires the old element and creates a new `stmtSummaryByDigestElement`. It retains at most the configured history length plus the current window; setting history size to zero still preserves the current interval. Later executions in the same interval lock only that element and update its counters.

`stmtSummaryStats.add` is where the payload lands: execution count, parse/compile/total latency, coprocessor and TiKV timings, transaction details, memory and disk values, result rows, CPU, network traffic, and resource units. This is aggregation, not a trace: it retains useful totals, maxima, minima, and samples, not a complete event-by-event story. The entry initialization and interval rollover are in [`init` and `add`](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L621-L703); the statistics update is in [`stmtSummaryStats.add`](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L796-L1039).

## Reading the outcome

The public interface is SQL. For a quick investigation, query the current history table:

```sql
SELECT digest_text, exec_count, avg_latency, max_latency,
       sum_total_keys, sum_processed_keys
FROM information_schema.statements_summary_history
ORDER BY avg_latency DESC
LIMIT 10;
```

Names and available columns vary by TiDB version, so use `DESCRIBE information_schema.statements_summary_history` on the cluster being inspected. Summary rows help select a candidate. `EXPLAIN ANALYZE`, slow logs, and tracing answer different follow-up questions because they keep per-execution context the summary intentionally compresses.

## Settings that change the trade-off

The controls are global because the map describes the server's overall workload:

| Setting                                  | Effect                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `tidb_enable_stmt_summary`               | Enables or disables collection. Disabling clears existing in-memory summaries.  |
| `tidb_stmt_summary_refresh_interval`     | Duration in seconds of each aggregation window; source default is 1800 seconds. |
| `tidb_stmt_summary_history_size`         | Number of historical windows to retain for each digest.                         |
| `tidb_stmt_summary_max_stmt_count`       | Maximum number of distinct summary entries retained by the LRU map.             |
| `tidb_stmt_summary_max_sql_length`       | Maximum stored SQL length; limits memory used by samples.                       |
| `tidb_stmt_summary_internal_query`       | Whether TiDB's internal SQL joins the summary.                                  |
| `tidb_stmt_summary_enable_group_by_user` | Adds user to the identity, separating otherwise identical SQL by user.          |

For example:

```sql
SET GLOBAL tidb_stmt_summary_refresh_interval = 900;
SET GLOBAL tidb_stmt_summary_history_size = 12;
```

That produces 15-minute buckets and retains twelve prior buckets per retained digest. It is not automatically “better” than the defaults: shorter buckets improve time resolution but create more history churn, while increasing max-statement count or history size increases memory used for observability.

## What the design does—and does not—promise

Statement summary is a bounded, in-memory aggregation designed for diagnosis. It can evict entries; a reset clears entries; changing grouping changes identity; and one slow execution may be visible as a maximum rather than as a reconstructable timeline. It is therefore a strong first lens for identifying recurring expensive query shapes, not an audit log.

The main design lesson is how the layers contain cost. The global LRU map limits the number of identities, the per-digest entry groups executions across time, and a small interval object concentrates concurrent mutation. Together they make a rich SQL diagnostic surface affordable enough to leave enabled in ordinary operation.

## References

1. TiDB source, [`StmtDigestKey`, `stmtSummaryByDigestMap`, and `AddStatement`](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L52-L440).
2. TiDB source, [per-digest initialization, history, and statistics](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/util/stmtsummary/statement_summary.go#L621-L1039).
3. TiDB source, [statement-summary system-variable handlers](https://github.com/pingcap/tidb/blob/9f32fa65d03abf0dd95fcc3b9fec29b82b64a260/pkg/sessionctx/variable/sysvar.go#L999-L1032).
4. TiDB documentation, [Statement Summary Tables](https://docs.pingcap.com/tidb/stable/statement-summary-tables/).
5. TiDB documentation, [system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
