---
author: JZ
pubDatetime: 2026-11-07T19:31:01Z
modDatetime: 2026-11-07T19:31:01Z
title: System Design - How TiDB Dynamically Prunes Table Partitions
tags:
  - design-system
  - design-database
  - design-tidb
description: "A source-code walkthrough of TiDB dynamic partition pruning: how a plan carries predicates to execution, selects physical partitions, and builds scans for them."
---

## Table of contents

## Why a query can skip partitions

A partitioned table is stored as several physical tables behind one SQL table name. The partitioning rule assigns each row to a partition. If a query filters on the partition key, TiDB can often avoid scanning partitions that cannot contain a matching row.

Consider an `orders` table partitioned by quarter on `order_date`. A query for rows from April through June cannot match the partition for January through March, so there is no reason to read it. The hard part is deciding **when** to make that choice. A literal is known while planning a query; a parameter in a prepared statement may have a different value each time the statement runs.

TiDB has static and dynamic pruning modes. In the current source snapshot linked below, `tidb_partition_prune_mode` defaults to `dynamic`; the mode definitions describe static pruning as happening during planning and dynamic pruning as happening during execution [1][2]. This post follows the dynamic path and the small set of code that carries the pruning conditions from a plan to a reader.

```text
                SQL and predicate
                       |
                       v
   Planner keeps the partition condition in PhysPlanPartInfo
                       |
                       v
   Executor evaluates the condition for this execution
                       |
                       v
    PartitionPruning chooses definition indexes
                       |
                       v
     TiDB maps indexes to physical table IDs
                       |
                       v
       Readers create key ranges for those tables
                       |
                       v
       TiKV coprocessors scan the requested ranges
```

## A concrete range-partitioned query

Here is a simplified table whose range boundaries line up with calendar quarters:

```sql
CREATE TABLE orders (
    order_date DATE NOT NULL,
    customer_id BIGINT,
    amount DECIMAL(10, 2)
)
PARTITION BY RANGE COLUMNS (order_date) (
    PARTITION p_before VALUES LESS THAN ('2026-04-01'),
    PARTITION p_q2 VALUES LESS THAN ('2026-07-01'),
    PARTITION p_q3 VALUES LESS THAN ('2026-10-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

PREPARE quarter_orders FROM
  'SELECT SUM(amount) FROM orders WHERE order_date >= ? AND order_date < ?';

SET @from_date = '2026-04-01';
SET @to_date = '2026-07-01';
EXECUTE quarter_orders USING @from_date, @to_date;
```

For these values, `p_q2` is the only range that can contain a qualifying row. With a different date range, a later execution of the same prepared statement may need a different set of partitions. Dynamic pruning lets TiDB keep the plan’s partition decision open until it is building the executor for that run.

## The planner carries the ingredients forward

When TiDB builds a physical scan plan, `buildPhysPlanPartInfo` packages the scan’s conditions, partition names, and table columns into `PhysPlanPartInfo` [3][4]. It is like a note attached to the scan: “when you know the values for this execution, use these predicates and this partitioning metadata to decide what to read.” The physical plan does not have to turn every partition into a permanent branch of a `UNION ALL` just to represent the table.

The session variable controls which timing TiDB uses. In this source snapshot, its scope is both global and session, its default is `dynamic`, and setting `static` produces a deprecation warning [1][2]. Static mode invokes the `PartitionProcessor` during logical optimization, after predicate pushdown; that rule rewrites a partitioned data source into only the partitions selected by the conditions [5].

Dynamic mode keeps the pruning metadata on the physical plan instead. There is an important planning guard: if TiDB does not have analyzed global statistics for the partitioned table, the current logical-plan builder can fall back to the static processor and emit a warning [6]. Before changing the pruning mode on a real cluster, check the current [partitioning](https://docs.pingcap.com/tidb/stable/partitioned-table/) and [system-variable](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_partition_prune_mode) documentation for the release you run. The source default and warnings can change between releases.

## Execution turns indexes into physical partitions

The shared `partitionpruning.PartitionPruning` function dispatches by partition type: hash and key partitions use their matching path, range partitions use range-boundary logic, and list partitions use list-value logic [7]. The work is delegated to `rule.PartitionProcessor`, which has the expression and metadata needed to determine which partition definition indexes can match. For a range partition, `PruneRangePartition` starts with the full set and narrows it using ranges derived from the conditions; when it cannot identify the partition column safely, it keeps the full range [8]. Keeping extra partitions may cost more reads, but it avoids skipping data based on a guess.

In the executor, `dataReaderBuilder.partitionPruning` calls that shared function and converts each returned definition index into a `PhysicalTable` using the partition’s physical ID [9]. A table scan with no matching partitions can become a `TableDualExec`, which returns no rows without opening a storage scan [10]. For selected partitions, the reader builds key ranges using those physical tables. On the TiKV side, the coprocessor endpoint builds a DAG handler with the request’s ranges and a snapshot store; it executes the ranges it was sent rather than deciding which SQL partitions qualify [11].

That division is useful to remember: **TiDB owns the SQL partition choice; TiKV scans the resulting storage ranges.** The pruning step happens before those ranges are executed, and a query that selects one physical partition asks the storage layer to work on that partition’s key space.

## Settings and practical checks

| Setting or check            | What it means                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tidb_partition_prune_mode` | Selects static pruning at plan time or dynamic pruning at execution time. The linked source snapshot defaults to `dynamic`.                                                                             |
| Global statistics           | The planner may fall back to static pruning if dynamic mode is enabled but global table statistics are not ready. Analyze partitioned tables and check warnings before diagnosing unexpected plans.     |
| `EXPLAIN`                   | Inspect the plan’s partition information for a representative query and its actual predicate values. A predicate that does not constrain the partition key may correctly retain many or all partitions. |

Partition pruning is an optimization, not a different query result: any partition that might contain a match must remain in the scan. The main troubleshooting question is whether TiDB could prove that a partition was irrelevant from the predicate and current values. If not, scanning more partitions is the safe behavior.

## References

1. TiDB source: [`PartitionPruneMode`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/sessionctx/variable/session.go#L2196-L2233) and the [`tidb_partition_prune_mode` system variable](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/sessionctx/variable/sysvar.go#L3045-L3072).
2. TiDB source: [`tidb_partition_prune_mode` default](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/sessionctx/vardef/tidb_vars.go#L1742).
3. TiDB source: [`buildPhysPlanPartInfo`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/find_best_task.go#L89-L102).
4. TiDB source: [`PhysPlanPartInfo`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/operator/physicalop/physical_plan_misc.go#L79-L105).
5. TiDB source: [`PartitionProcessor`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/rule/rule_partition_processor.go#L65-L123) and its partition rewrite path [`prune`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/rule/rule_partition_processor.go#L878-L910).
6. TiDB source: [dynamic-pruning statistics guard](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/logical_plan_builder.go#L5080-L5115).
7. TiDB source: [`partitionpruning.PartitionPruning`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/util/partitionpruning/partition_prune.go#L27-L50).
8. TiDB source: [`PartitionProcessor.PruneRangePartition`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/planner/core/rule/rule_partition_processor.go#L1054-L1089).
9. TiDB source: [`dataReaderBuilder.partitionPruning`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/executor/builder.go#L6296-L6341).
10. TiDB source: [empty and selected partition handling in the table-scan builder](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/executor/builder.go#L4416-L4449).
11. TiKV source: [coprocessor DAG handler receives request ranges](https://github.com/tikv/tikv/blob/96033a26bb4b5427deadc6168a3d210a5cd2b6ae/src/coprocessor/endpoint.rs#L354-L371).
12. TiDB documentation: [Partitioned tables](https://docs.pingcap.com/tidb/stable/partitioned-table/) and [system variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_partition_prune_mode).
