---
author: JZ
pubDatetime: 2026-11-22T19:31:00Z
modDatetime: 2026-11-22T19:33:51Z
title: System Design - How TiDB ANALYZE TABLE Builds Statistics in Source
tags:
  - design-database
  - design-tidb
description:
  "Trace TiDB ANALYZE TABLE from planner tasks through TiKV scans and TiDB statistics executors to persisted histograms, Top-N values, and optimizer estimates."
---

## Table of contents

## The optimizer needs a good estimate

Suppose a table has one million orders, but a query only asks for orders from one customer. The optimizer needs to estimate how many rows match before it chooses a plan. If the estimate is far off, TiDB may choose an expensive join or read much more data than necessary.

TiDB keeps **statistics** to help make these estimates. A histogram summarizes ranges of values, Top-N stores especially frequent values, and a sketch estimates the number of distinct values. These are compact summaries rather than a copy of every row.

When an engineer runs `ANALYZE TABLE orders`, TiDB refreshes those summaries. This post follows the normal statement execution path that builds them. The separate scheduler that decides when to run auto-analyze is covered in [How TiDB Auto Analyze Works](/posts/design-how-tidb-auto-analyze-works/).

The main path crosses three TiDB executors and a TiKV scan:

```text
ANALYZE TABLE orders
        |
        v
PlanBuilder.buildAnalyze
        |
        v
   AnalyzeExec --------------------- result and error channels
        |
        +---- column task ----> AnalyzeColumnsExec ----+
        |                                              |
        +---- index task -----> AnalyzeIndexExec ------+--> DistSQL AnalyzeReq
                                                       |         |
                                                       |         v
                                                       |   TiKV Region scans
                                                       |         |
                                                       +<-- samples or summaries
        |
        v
Save AnalyzeResults to statistics storage and refresh the stats cache
        |
        v
Optimizer uses the new estimates
```

## The planner turns one SQL statement into tasks

The planner's `buildAnalyze` function checks the requested options and creates an `Analyze` plan. `buildAnalyzeTable` then walks the requested tables and their physical IDs. A partitioned table can produce work for its partitions as well as for the table's global statistics.

The executor builder turns those plan tasks into separate column and index executors. A column task creates an `AnalyzeColumnsExec`; each index task creates an `AnalyzeIndexExec`. The parent `AnalyzeExec` owns the whole statement and coordinates the tasks.

You can see the split in TiDB's [`PlanBuilder.buildAnalyzeTable`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/planner/core/planbuilder.go#L3098-L3127), [`PlanBuilder.buildAnalyze`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/planner/core/planbuilder.go#L3309-L3342), and [executor builder](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/builder.go#L3766-L3827).

This separation is useful: the planner decides what needs statistics, while the executors decide how to collect them.

## AnalyzeExec runs tasks concurrently

`AnalyzeExec.Next` is the coordinator. It first filters out locked tables, then starts worker goroutines. Each worker takes one task from a channel and calls either the column path or the index path. Results and errors travel back on another channel.

```text
                    task channel
Plan tasks  ------------------------------+
                                           |
                         +-----------------+-----------------+
                         |                 |                 |
                         v                 v                 v
                     worker 1          worker 2          worker 3
                         |                 |                 |
                         +------------ result channel ------+
                                           |
                                           v
                                      save workers
```

The worker pool avoids running every task one at a time, but it is bounded by `tidb_build_stats_concurrency`. `AnalyzeExec` also resolves the sampling worker count before starting goroutines, because session variables cannot safely be looked up concurrently in this code path.

The implementation is in [`AnalyzeExec.Next`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze.go#L300-L453) and [`AnalyzeExec.analyzeWorker`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze.go#L914-L958).

## TiKV scans near the data

TiDB does not copy the entire table to its SQL layer to build statistics. `AnalyzeColumnsExec` builds a DistSQL request with the table's handle ranges and an `AnalyzeReq`, then sends it through the TiKV client. TiKV receives the request in its coprocessor endpoint and routes it to the analyze handler.

For column statistics, TiKV uses a `BatchTableScanExecutor` to scan its Region and collect samples. The [TiKV `RowSampleBuilder`](https://github.com/tikv/tikv/blob/4d5e1a0968d72deb5aecd65dfd16176b9a01e080/src/coprocessor/statistics/analyze.rs#L52-L100) sets up that scan, and [`collect_column_stats`](https://github.com/tikv/tikv/blob/4d5e1a0968d72deb5aecd65dfd16176b9a01e080/src/coprocessor/statistics/analyze.rs#L144-L225) gathers rows under the analyze sampling rules. The request routing is visible in the [TiKV coprocessor endpoint](https://github.com/tikv/tikv/blob/4d5e1a0968d72deb5aecd65dfd16176b9a01e080/src/coprocessor/endpoint.rs#L374-L417).

Each Region returns its part of the work. TiKV reads rows near storage and returns samples or summaries to TiDB. TiDB merges those results and builds table-level statistics. When sampling is used, this avoids transferring every row to the SQL layer. [`AnalyzeColumnsExec.buildResp`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze_col.go#L88-L121) constructs the request. [`analyzeColumnsPushDown`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze_col_sampling.go#L53-L125) and [`buildSamplingStats`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze_col_sampling.go#L194-L260) merge the samples and produce histograms, Top-N values, and sketches.

Index statistics have a separate path. `AnalyzeIndexExec` issues an index analyze request and turns the response into a histogram and other index summaries. Keeping the index work separate matters because an index has its own value distribution, which can differ from the distribution of its table columns. See [`analyzeIndexPushdown`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze_idx.go#L54-L101).

The idea is similar to asking each warehouse to summarize the inventory on its own shelves, then combining those summaries centrally. TiKV reads the data where it lives; TiDB assembles the statistics the optimizer will consume.

## Results are persisted before the cache is refreshed

When a worker finishes, it sends an `AnalyzeResults` value to the coordinator. A save worker calls `StatsHandle.SaveAnalyzeResultToStorage`, which writes the collected statistics to TiDB's statistics tables. After the results are saved, `AnalyzeExec` calls `StatsHandle.Update` for the affected table and partition IDs so the server's statistics cache can load the refreshed data.

The save worker keeps draining its input even after a storage error or a kill signal. That prevents a failed save from blocking the scan workers that are trying to return their remaining results. The relevant code is in [`handleResultsErrorWithConcurrency`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze.go#L783-L842) and [`analyzeSaveStatsWorker.run`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/executor/analyze_worker.go#L46-L99).

Once the new statistics are visible, a later query can use them to estimate predicate selectivity and compare possible plans. A PingCAP [TiDB performance tuning guide](https://www.pingcap.com/article/mastering-tidb-performance-tuning-a-comprehensive-guide/) describes this user-facing reason to refresh stale statistics: row-estimate errors can lead the optimizer toward a poor plan.

## Settings that change the work

The source and documentation call out several useful settings:

| Setting | What it controls | Default in the linked source |
| --- | --- | ---: |
| `tidb_analyze_version` | Which statistics format to collect. The linked source uses version 2. | `2` |
| `tidb_build_stats_concurrency` | How many analyze tasks can build statistics at once. | `2` |
| `tidb_build_sampling_stats_concurrency` | How many workers merge statistics from sampled rows. | `2` |
| `tidb_analyze_partition_concurrency` | How many partition-level results can be saved concurrently. | `2` |
| `tidb_persist_analyze_options` | Whether choices from an `ANALYZE` statement are kept for later analyze work. | `ON` |

The concurrency defaults are defined in TiDB's [`vardef/tidb_vars.go`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/vardef/tidb_vars.go#L1564-L1566). The partition concurrency default is [defined here](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/vardef/tidb_vars.go#L1877-L1881). The analyze-version default is [2](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/vardef/tidb_vars.go#L1748), and the persistence default is [ON](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/vardef/tidb_vars.go#L1779-L1783). Their system-variable definitions are in [`sysvar.go`](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/variable/sysvar.go#L1237-L1248), and the version setting is [validated here](https://github.com/pingcap/tidb/blob/bca43971a06d31e4711ba6c0c4e13a503ffd91ec/pkg/sessionctx/variable/sysvar.go#L3083-L3090).

The concurrency settings control different levels of the work. The docs describe their combined work as `tidb_build_stats_concurrency * (tidb_build_sampling_stats_concurrency + tidb_analyze_partition_concurrency)`. Raising them can multiply resource use, so measure the effect before increasing them. The official [statistics guide](https://docs.pingcap.com/tidb/stable/statistics/) also documents statement options such as `WITH NUM BUCKETS`, `WITH NUM TOPN`, and `SAMPLERATE`.

For example, `WITH NUM BUCKETS` controls the maximum histogram buckets, while `WITH NUM TOPN` controls how many frequent values are kept separately. A higher setting can represent a distribution in more detail, but takes more memory and work to build.

## References

1. TiDB Docs, [`ANALYZE TABLE`](https://docs.pingcap.com/tidb/stable/sql-statement-analyze-table/).
2. TiDB Docs, [Statistics](https://docs.pingcap.com/tidb/stable/statistics/).
3. PingCAP, [Mastering TiDB Performance Tuning](https://www.pingcap.com/article/mastering-tidb-performance-tuning-a-comprehensive-guide/).
4. TiDB source at commit [`bca43971`](https://github.com/pingcap/tidb/tree/bca43971a06d31e4711ba6c0c4e13a503ffd91ec), especially `pkg/planner/core/planbuilder.go` and `pkg/executor/`.
5. TiKV source at commit [`4d5e1a0`](https://github.com/tikv/tikv/tree/4d5e1a0968d72deb5aecd65dfd16176b9a01e080), especially `src/coprocessor/endpoint.rs` and `src/coprocessor/statistics/analyze.rs`.
