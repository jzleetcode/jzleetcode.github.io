---
author: JZ
pubDatetime: 2026-10-16T18:00:00Z
modDatetime: 2026-10-16T18:00:00Z
title: System Design - How TiDB Writes and Reads Its Slow Query Log
tags:
  - design-system
  - design-database
  - design-tidb
description: "A source-level tour of TiDB's slow SQL path: ExecStmt's duration gate, SlowQueryLogItems formatting, the file logger, and the SLOW_QUERY virtual table."
---

## Table of contents

## A query that feels slow

Imagine an API whose `SELECT` usually finishes quickly. One request takes 700 ms. You know the user waited, but where did the time go: parsing, planning, a TiKV coprocessor task, or sending the response?

TiDB's slow query log records statement-level evidence. It is tempting to picture a background thread polling all running queries. The source tells a simpler story: **when a statement finishes, its execution wrapper decides whether to format and log its measurements**. A SQL query against `INFORMATION_SCHEMA.SLOW_QUERY` later reads those log files back.

**Source baseline:** all implementation links point to [TiDB v8.5.0, commit `d13e52ed6e22cc5789bed7c64c861578cd2ed55b`](https://github.com/pingcap/tidb/tree/d13e52ed6e22cc5789bed7c64c861578cd2ed55b). This walkthrough describes that revision, not every subsequent release. We stay inside TiDB's SQL process; TiKV contributes execution details, but **TiDB** makes the decision to write this SQL log.

## The four pieces in the story

- [`ExecStmt`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1583-L1602) checks elapsed time and assembles the statement's log data.
- [`SlowQueryLogItems`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/session.go#L3347-L3390) holds the fields to print, including durations, SQL digest, plan, and memory peak.
- [`slowLogEncoder`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/slow_query_logger.go#L30-L67) turns the formatted message into a timestamped log entry.
- [`slowQueryRetriever`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/slow_query.go#L60-L85) reads and parses the files when someone queries the virtual table.

Here is the component path; arrows represent calls or data flow, not four independent services:

```text
statement finishes / result set closes
               |
               v
      ExecStmt.LogSlowQuery() -- below threshold? --> return
               |
               v
       SlowQueryLogItems
               |
     SessionVars.SlowLogFormat()
               |
               v
    SlowQueryLogger + slowLogEncoder
               |
               v
         slow query log files
               |
               v
      slowQueryRetriever
               |
               v
 INFORMATION_SCHEMA.SLOW_QUERY
```

## The clock is checked when the statement finishes

For a result-producing statement, [`recordSet.Close()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L225-L237) leads to `ExecStmt.CloseRecordSet()`. The [finish path](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1390-L1424) calls `LogSlowQuery()` before statement summarization and previous-statement bookkeeping. A statement need not succeed to reach this reporting path: the finish method passes a success flag derived from its error.

There is also an [`OnFetchReturned()` path](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L233-L237) for multi-result fetching. That is why the log item has a `HasMoreResults` field; treating all log calls as one simple end-of-SQL callback would miss this case.

At the start of [`LogSlowQuery()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1583-L1603), TiDB reads the session's total cost duration and an **instance-level threshold in milliseconds**. With slow logging enabled, the normal path returns if the duration is less than that threshold. In this pinned version the [defaults are 300 ms and enabled](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/log.go#L43-L53). Debug-level logging or enabled tracing explicitly forces the formatting path even if the ordinary gate would have returned. Consequently, _not every line written under debug or trace means the threshold was exceeded_.

This is statement timing, not a claim that TiKV alone took 700 ms. The formatter also receives separate parsing, compilation, optimization, timestamp-waiting, and storage-execution details so you can investigate where the time went.

## Turn measurements into a line you can inspect

After the gate, `ExecStmt` gathers the SQL text and digest; execution details, coprocessor task details, peak memory and disk consumption; and the plan and result-row count. It [fills `SlowQueryLogItems`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1603-L1711) rather than writing each field individually to a file.

Then [`SessionVars.SlowLogFormat()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/session.go#L3415-L3465) converts the collected fields into text. For example, it writes `Query_time` in **seconds** even though the threshold was configured in **milliseconds**. It also writes identifying and diagnostic fields such as connection ID and SQL digest. An SQL digest identifies a normalized query shape; it is not a substitute for the execution timing of this particular statement.

The [last step in `LogSlowQuery()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1718-L1723) sends the formatted text to `logutil.SlowQueryLogger.Warn`. During initialization, TiDB installs a [dedicated slow query logger](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/log.go#L119-L138). Its [text encoder](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/slow_query_logger.go#L43-L67) prefixes `# Time: ...` and writes the message. If `log.slow-query-file` is set, its [configuration](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/slow_query_logger.go#L47-L59) routes output there; when it is empty, the slow logger follows the normal log-file configuration. This is a log writer, **not** a TiKV RPC.

There is a separate [threshold-eligible in-memory slow-query record](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1723-L1763) for `SHOW SLOW` and metrics. Do not mistake that smaller in-memory summary for the on-disk slow log or its SQL-backed virtual table.

## Reading it back is a different path

Run a query such as:

```sql
SELECT time, query_time, query, digest
FROM information_schema.slow_query
ORDER BY time DESC
LIMIT 5;
```

The SQL-facing [`slowQueryRetriever.retrieve()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/slow_query.go#L81-L143) initializes column parsers and checks the reader's privileges. It opens the configured slow log and eligible rotated files; [`getAllFiles()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/slow_query.go#L935-L1005) searches for files with the matching prefix. The retriever then parses log records into rows instead of selecting them from a TiKV table. A time predicate can help it narrow which file ranges it needs to scan; without one, the files can be expensive to parse.

This explains two practical surprises. A log file you delete or move is not automatically preserved by the virtual table. And reading the table is not a free index lookup over pre-ingested SQL rows. Keep sensitive SQL and connection information in these files under appropriate access controls.

## Which knobs change this path?

The [registered system variables](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go#L463-L482) map to the instance configuration:

- `tidb_enable_slow_log` turns normal slow logging on or off.
- `tidb_slow_log_threshold` sets the normal duration gate in **milliseconds**; 300 by default in this revision.
- `tidb_record_plan_in_slow_log` controls whether [`getPlanTree()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go#L1837-L1848) includes an encoded plan; on by default here.
- `log.slow-query-file` chooses the slow-log file at server configuration time.

These are not per-query hints. Check the configuration and variable semantics for the TiDB version you actually run before changing a production instance. If the log is empty, first verify logging is enabled, the duration clears the gate, and you are inspecting the right TiDB instance and log path. If a plan is absent, check the plan-recording option separately rather than assuming the query did not execute.

## The mental model to keep

The **writer** is the completed SQL statement, which measures, gates, formats, and appends. The **reader** is a virtual-table retriever that opens and parses the resulting files. Keeping these paths separate turns "Where did my slow query go?" into two answerable questions: _was a record emitted?_ and _is this reader looking at the right files?_

## References

1. [TiDB: Identify Slow Queries](https://docs.pingcap.com/tidb/stable/identify-slow-queries/), for the supported logging and query workflow; version-specific features may differ from the pinned source.
2. [Pinned statement finish, gate, and log writer: `pkg/executor/adapter.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/adapter.go).
3. [Pinned item structure and formatting: `pkg/sessionctx/variable/session.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/session.go).
4. [Pinned slow logger and encoder: `pkg/util/logutil/slow_query_logger.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/slow_query_logger.go).
5. [Pinned slow-log reader: `pkg/executor/slow_query.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/slow_query.go).
6. [Pinned system variables: `pkg/sessionctx/variable/sysvar.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go) and [defaults: `pkg/util/logutil/log.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/util/logutil/log.go).
