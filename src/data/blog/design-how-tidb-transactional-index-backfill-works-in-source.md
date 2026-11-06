---
author: JZ
pubDatetime: 2026-11-06T19:32:00Z
modDatetime: 2026-11-06T19:32:00Z
title: System Design - How TiDB Transactionally Backfills an Index
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's transactional ADD INDEX worker from schema-state changes through row decoding, uniqueness checks, and batched KV writes."
---

## Table of contents

## The new index has two kinds of rows to catch up

Suppose a `customers` table already has ten million rows and we run:

```sql
ALTER TABLE customers ADD INDEX idx_email (email);
```

TiDB has two jobs. New inserts and updates must start maintaining the index while the DDL runs. The older rows need index entries too. If TiDB switched query plans to the new index before those older entries existed, a lookup could miss customers.

This post follows one specific route through the TiDB source: the **transactional backfill** used when fast reorganization is disabled. Fast reorganization has a separate ingest-based implementation, so its sorted-file pipeline is outside this walkthrough. The source links below pin TiDB to commit `41efd866` and TiKV to commit `96033a26` so the code locations remain reproducible.

## The state machine makes writes safe before reads

The DDL worker advances the index through schema states. In the code path for adding an index, it moves from `DeleteOnly` to `WriteOnly`, then to `WriteReorganization`, and finally to `Public` after the reorganization work is complete.

While the index is `WriteOnly`, TiDB can maintain it for new or changed rows, while query planning waits to rely on it. The table mutation path iterates writable indexes, and its `IsIndexWritable` helper includes `WriteOnly`; the lookup helper `FindIndexByColName` only returns a `Public` index. In `WriteReorganization`, the background DDL work fills entries for rows that were already present. Once that work finishes, the index can become public to queries.

```text
                    DDL worker
                       |
                       v
     DeleteOnly -> WriteOnly -> WriteReorganization -> Public
                       |               |
                       |               +-- backfill old rows
                       +-- DML writes maintain the new index

WriteOnly: new writes can populate the index; reads do not depend on it yet.
WriteReorganization: a worker scans older rows and fills missing entries.
Public: the optimizer may use the complete index.
```

The transitions in [`worker.addIndex`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/index.go#L1255-L1305) make the ordering visible in code. They separate the user-visible schema change from the slower task of catching up existing data.

## Four pieces divide the work

The `worker` owns the DDL state machine and dispatches the reorganization. `writePhysicalTableRecord` divides the table's key ranges into tasks. A `txnBackfillExecutor` runs a pool of workers, and each `addIndexTxnWorker` handles one task by reading rows, making index records, and writing a batch in a KV transaction.

```text
TiDB DDL worker
      |
      | index reaches WriteReorganization
      v
writePhysicalTableRecord
      |
      | key-range tasks
      v
txnBackfillExecutor  <---- worker count from DDL metadata
      |
      +---- task channel ----> addIndexTxnWorker
      |                          |
      |                          +-- snapshot scan + row decoder
      |                          +-- unique-key check
      |                          +-- lock keys + create index records
      |                          |
      |                          v
      |                     kv.RunInNewTxn
      |                          |
      |                          v
      +---- results <-------- TiKV transaction path
               next key, row counts, errors
```

These names correspond to a small part of `pkg/ddl`. The executor creates workers from the concurrency stored in the DDL job metadata and starts one `addIndexTxnWorker` for each slot. This transactional executor caps its local pool at 16 workers. It sends tasks through a channel and receives results through another, so the scheduler can track range progress without making one goroutine scan the entire table.

## A worker turns a bounded row batch into index keys

For each task, `addIndexTxnWorker.BackfillData` opens a new KV transaction. `baseIndexWorker.fetchRowColVals` walks the task's record-key range at that transaction's start timestamp. It decodes each row, evaluates the columns needed by the index, and creates an `indexRecord` containing the indexed values, row handle, and source record key.

If `idx_email` is unique, the worker checks the generated keys before writing them. An existing unique key that belongs to a different row is a real duplicate and makes the index build fail. If the same row's entry already exists, the worker can skip it. That can happen because normal DML has already maintained the hidden index while the DDL was catching up.

The worker then locks each index key and calls `table.Index.Create` inside the same transaction. The transaction commits the batch together, or returns an error for the DDL job to handle. The `nextKey` returned by the scan marks where the task should continue after this batch; an empty result means the range is done.

```text
One task range [startKey, endKey)
       |
       v
read rows visible at txn.StartTS
       |
       v
decode row -> evaluate email -> form (email, handle) key
       |
       +-- unique collision with another handle? return error
       |
       +-- key already exists for same row? skip it
       |
       v
lock missing index key -> create it in the same KV transaction
       |
       v
commit batch and return nextKey / done / counts
```

There is an important concurrency detail here. The worker does not copy the entire table into memory and add keys afterward. It processes a bounded batch, records its snapshot timestamp, and writes through the storage transaction API. TiKV's `Prewriter::process_write` applies MVCC checks to mutations during the prewrite phase. That is the storage-side transaction machinery beneath the TiDB DDL code; it is not a special index-building protocol.

## How to read this path in the source

Start at `worker.addIndex` to see when a range job is launched. Then follow `writePhysicalTableRecord` into `newTxnBackfillExecutor`. Its `adjustWorkerSize` creates `addIndexTxnWorker` instances. The worker's `BackfillData` calls `fetchRowColVals`, checks unique keys, and writes each new entry with `Index.Create`.

The transactional path is selected by `pickBackfillType` when the DDL job's `IsFastReorg` flag is false. When fast reorganization is enabled and the Lightning ingest environment is ready, TiDB can choose an ingest path instead; if that environment is unavailable, the code can fall back to a transaction-merge path. These modes share the goal of filling the index but use different machinery.

## Three settings shape the workload

The stable system-variable reference documents these current defaults. Check the reference for the version and deployment you run; managed TiDB offerings may restrict some settings.

| Setting | Default | Effect |
| --- | ---: | --- |
| `tidb_ddl_enable_fast_reorg` | `ON` | Selects the accelerated index-backfill path when available. Turning it off selects the transactional route followed here. |
| `tidb_ddl_reorg_worker_cnt` | `4` | Sets concurrent DDL reorganization workers. More workers can finish sooner, while increasing concurrent reads and writes. |
| `tidb_ddl_reorg_batch_size` | `256` rows | Sets rows processed per reorganization batch. Larger batches reduce per-batch overhead but can increase transaction-conflict risk and storage write pressure. |

The two worker settings are related: a larger batch with more workers can send more index writes to TiKV at once. For the transactional mode, the system-variable documentation specifically warns that larger batches can increase conflicts when application updates touch the indexed columns. For fast reorganization, larger batches may improve speed while adding write pressure.

## References

1. TiDB source, [`worker.addIndex` state transitions and backfill dispatch](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/index.go#L1255-L1305).
2. TiDB source, [`TableCommon.updateRecord` writing writable indexes](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/table/tables/tables.go#L609-L653), [`IsIndexWritable`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/table/tables/index.go#L891-L898), and [public-only index lookup](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/table/tables/tables.go#L1552-L1560).
3. TiDB source, [`pickBackfillType` and mode selection](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/index.go#L1873-L1901).
4. TiDB source, [`writePhysicalTableRecord` and range-task dispatch](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/backfilling.go#L987-L1045).
5. TiDB source, [`txnBackfillExecutor` worker creation](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/backfilling_txn_executor.go#L84-L123) and [worker sizing, including the 16-worker cap](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/backfilling_txn_executor.go#L256-L330).
6. TiDB source, [`fetchRowColVals`, uniqueness checks, and `BackfillData`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/index.go#L2679-L2747) and [`addIndexTxnWorker.BackfillData`](https://github.com/pingcap/tidb/blob/41efd866c3801a637ab2d6712b86d8b2cd77ac5b/pkg/ddl/index.go#L3016-L3090).
7. TiKV source, [`Prewriter::process_write`](https://github.com/tikv/tikv/blob/96033a26bb4b5427deadc6168a3d210a5cd2b6ae/src/storage/txn/commands/prewrite.rs#L499-L555) — MVCC validation during transaction prewrite.
8. TiDB documentation, [System variables](https://docs.pingcap.com/tidb/stable/system-variables/) — `tidb_ddl_enable_fast_reorg`, `tidb_ddl_reorg_worker_cnt`, and `tidb_ddl_reorg_batch_size`.
9. PingCAP Engineering, [In-Depth Analysis of TiDB DDL Framework Optimizations](https://www.pingcap.com/blog/tidb-ddl-optimizations-unleashing-50x-performance-increases/) — background on DDL scheduling and the move toward distributed execution.
10. TiDB documentation, [DDL introduction](https://docs.pingcap.com/tidb/stable/ddl-introduction/) — overview of TiDB DDL behavior.
