---
author: JZ
pubDatetime: 2026-10-05T19:00:00Z
modDatetime: 2026-10-05T19:00:00Z
title: System Design - How TiDB Auto Analyze Works
tags:
  - design-system
  - design-database
  - design-tidb
description: "A source-code walkthrough of TiDB auto analyze, from the stats-owner scheduler and priority queue to TiDB's Analyze executor and TiKV coprocessor."
---

This explanation is for engineers new to TiDB who want to follow one background statistics job from its scheduler to the storage layer. It focuses on the priority-queue path in TiDB's current source; the source also retains a legacy candidate-selection path behind a setting.

## Table of contents

## Why a database analyzes tables

Before a SQL optimizer chooses a plan, it estimates how many rows each operation will read. If the optimizer thinks a filter returns ten rows but it actually returns ten million, it may choose a poor join order or an expensive access method.

TiDB stores statistics about tables and indexes so the optimizer can make those estimates. Inserts, updates, and deletes make existing statistics less representative. `ANALYZE TABLE` refreshes them. **Auto analyze** is TiDB's background process for deciding when a refresh is useful and running it without waiting for a user to issue the statement manually.

The process crosses several components. In the diagram, the feature-flagged priority-queue branch is expanded; the alternate branch is noted for context.

```text
           TiDB cluster
  +----------------------------------------------+
  | Stats-owner TiDB instance                    |
  |                                              |
  | Domain.autoAnalyzeWorker (periodic tick)      |
  |        | enable check + owner check           |
  |        v                                     |
  | statsAnalyze.HandleAutoAnalyze()             |
  |        |                                     |
  |        +-- priority queue enabled             |
  |        |      v                              |
  |        |   Refresher -> priority queue        |
  |        |      -> worker -> analysis job      |
  |        |                                     |
  |        +-- disabled -> legacy candidate scan  |
  +------------------------+---------------------+
                           |
                     ANALYZE TABLE
                           v
  +----------------------------------------------+
  | TiDB AnalyzeExec / AnalyzeColumnsExec        |
  | build tasks, send DistSQL Analyze requests   |
  +------------------------+---------------------+
                           | coprocessor requests
                           v
  +----------------------------------------------+
  | TiKV Coprocessor: AnalyzeContext             |
  | scan ranges, sample rows, build partial stats|
  +------------------------+---------------------+
                           | partial results
                           +---------------------> TiDB merges and stores stats
```

## From a timer tick to an analysis job

### Only the stats owner schedules work

The `Domain` starts `autoAnalyzeWorker`, which wakes on a ticker based on the statistics lease. On each tick, it checks that auto analyze is enabled, shutdown has not started, and this TiDB instance owns statistics work. This avoids every TiDB server in a cluster independently launching the same background work. The code is in [`Domain.autoAnalyzeWorker`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/domain/domain.go#L2352-L2387).

The stats handle delegates to `statsAnalyze.HandleAutoAnalyze`. That method obtains a session context, then `handleAutoAnalyze` chooses the scheduling path. When `tidb_enable_auto_analyze_priority_queue` is enabled, it asks a `Refresher` to analyze the highest-priority work. When it is disabled, the code falls back to a legacy routine that randomly scans candidates and tries one table at a time. The switch is visible in [`statsAnalyze.handleAutoAnalyze`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/autoanalyze.go#L286-L370).

### The refresher applies the scheduling rules

The priority-queue path uses [`Refresher.AnalyzeHighestPriorityTables`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/refresher/refresher.go#L93-L202). It initializes the queue when needed and rebuilds it when relevant inputs such as the auto-analyze ratio or partition-pruning mode change. It also:

- checks whether the configured auto-analyze time window is open;
- refreshes the concurrency limit from the current setting;
- counts running jobs and only takes work for available slots;
- skips a table that already has an analysis job running; and
- validates each popped job before submitting it to the worker.

The worker records running table IDs and calls `job.Analyze`. A representative [`NonPartitionedTableAnalysisJob`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/priorityqueue/non_partitioned_table_analysis_job.go#L86-L112) builds an `ANALYZE TABLE` statement for its table and delegates to `exec.AutoAnalyze`. Partitioned tables use their own job implementations, but they follow the same idea: the scheduler chooses the work, and the normal analyze execution path performs it. See the [worker's submission and execution methods](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/refresher/worker.go#L72-L112) and the job's [SQL construction](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/priorityqueue/non_partitioned_table_analysis_job.go#L224-L240).

## TiDB executes the same analyze pipeline

`exec.AutoAnalyze` calls `RunAnalyzeStmt`, which executes the generated statement through TiDB's restricted SQL executor. That reuse matters: auto analyze is not a second statistics engine. It is a scheduler that decides when to invoke the normal `ANALYZE TABLE` machinery. The wrapper and statement execution are in [`autoanalyze/exec`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/exec/exec.go#L58-L117).

The SQL plan creates an `AnalyzeExec`. It filters work that cannot run, starts worker goroutines, and sends column or index tasks to them. Those workers call the appropriate pushdown implementation. After the tasks finish, TiDB handles the returned results and updates its statistics handle. The orchestration is in [`AnalyzeExec.Next` and `analyzeWorker`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/executor/analyze.go#L301-L435) and [the result workers](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/executor/analyze.go#L895-L937).

For column statistics, `AnalyzeColumnsExec.buildResp` builds an analyze request and calls `distsql.Analyze`. The request carries the table ranges and analysis options to TiKV rather than pulling every row into the TiDB SQL layer first. See [`AnalyzeColumnsExec.buildResp`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/executor/analyze_col.go#L111-L145).

## TiKV scans and returns partial statistics

On TiKV, the coprocessor endpoint recognizes an `ANALYZE` request, decodes the request type, and creates an `AnalyzeContext`. That context dispatches column, index, mixed, and full-sampling work to the matching handler. The request routing is in [`endpoint.rs`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/coprocessor/endpoint.rs#L372-L415); the handler's type-specific dispatch is in [`AnalyzeContext::handle_request`](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/coprocessor/statistics/analyze_context.rs#L220-L294).

For a column request, TiKV uses a sample builder to scan the requested ranges and collect column summaries. For an index request, the handler builds structures such as a histogram and count-min sketch while scanning index values. A TiKV response is a partial result for its assigned ranges; TiDB coordinates the tasks, combines results, and updates statistics used by the optimizer.

This split keeps the large data scan near the storage nodes. TiDB coordinates the work and owns the SQL-level lifecycle, while TiKV scans the key ranges and produces partial summaries.

## Settings that shape auto analyze

These settings control different parts of the decision. The values below describe the TiDB source snapshot linked here; defaults can vary by release, so check the [current system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) before changing a cluster.

| Setting                                                         | What it controls                                                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tidb_enable_auto_analyze`                                      | Enables or disables background auto analyze. It is enabled in the pinned source defaults.                                                            |
| `tidb_enable_auto_analyze_priority_queue`                       | Chooses the priority-queue scheduler rather than the legacy candidate scan. It is enabled in the pinned source defaults.                             |
| `tidb_auto_analyze_ratio`                                       | How much a table's modified-row count must grow relative to its row count before the statistics need refreshing. The pinned source default is `0.5`. |
| `tidb_auto_analyze_start_time` and `tidb_auto_analyze_end_time` | Restrict when automatic analysis may run. The pinned source defaults cover the full day; use an explicit timezone when setting a narrower window.    |
| `tidb_auto_analyze_concurrency`                                 | Caps the number of auto-analyze jobs that the scheduler may run at once. The pinned source default is `3`.                                           |

The variable names and source defaults are defined in [`vardef/tidb_vars.go`](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/sessionctx/vardef/tidb_vars.go#L93-L99) and [the analyze-related settings block](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/sessionctx/vardef/tidb_vars.go#L1271-L1286), with defaults in [the default constants](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/sessionctx/vardef/tidb_vars.go#L1544-L1546) and [the feature defaults](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/sessionctx/vardef/tidb_vars.go#L1793-L1800). The official [statistics guide](https://docs.pingcap.com/tidb/stable/statistics/) and [`ANALYZE TABLE` reference](https://docs.pingcap.com/tidb/stable/sql-statement-analyze-table/) explain the SQL-facing behavior.

## Trade-offs and debugging clues

Auto analyze spends CPU and I/O to keep optimizer estimates useful. A lower modification threshold can refresh statistics sooner, but it may run more analyses. A narrow time window or low concurrency can reduce pressure during peak hours, but it can also leave stale statistics waiting in the queue. These controls are operational trade-offs, not correctness switches for query results.

When an execution plan becomes unexpectedly slow, check whether its table statistics are stale before assuming the SQL text is the only problem. When auto analyze is not running, first check whether it is enabled, whether the current TiDB instance is the stats owner, whether the time window is open, and whether concurrency is already occupied.

## References

1. [TiDB statistics](https://docs.pingcap.com/tidb/stable/statistics/).
2. [TiDB `ANALYZE TABLE` statement](https://docs.pingcap.com/tidb/stable/sql-statement-analyze-table/).
3. [TiDB system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/).
4. [TiDB auto-analyze scheduler and priority-queue path](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/autoanalyze.go#L286-L370).
5. [TiDB analysis worker and SQL execution](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/statistics/handle/autoanalyze/refresher/refresher.go#L93-L202).
6. [TiDB pushdown and TiKV AnalyzeContext](https://github.com/pingcap/tidb/blob/b36c940a4332c866d8b0e2afde88f5e7c2fd7fed/pkg/executor/analyze_col.go#L111-L145) and [TiKV request dispatch](https://github.com/tikv/tikv/blob/c61d92c26a4d96a575386f5e32179550556e2c29/src/coprocessor/statistics/analyze_context.rs#L220-L294).
