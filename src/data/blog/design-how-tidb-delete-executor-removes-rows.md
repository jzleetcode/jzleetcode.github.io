---
author: JZ
pubDatetime: 2026-11-26T19:30:48Z
modDatetime: 2026-11-26T19:30:48Z
title: System Design - How TiDB's DELETE Executor Removes Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow one single-table DELETE through TiDB's DeleteExec: how child rows become handles, how the table layer removes row and index keys, and why deprecated batch-delete settings change transaction boundaries."
---

## Table of contents

## A DELETE statement has two jobs

Suppose an application keeps an audit table and needs to remove old events:

```sql
DELETE FROM audit_log
WHERE created_at < '2026-01-01';
```

The SQL statement describes which rows should go away. TiDB's planner builds a plan whose child executor finds those rows, and the delete executor turns each result into transactional table mutations. In this post we follow the **single-table** path in TiDB source. We do not trace SQL parsing or the planner's choice of scan; the focus begins with the physical plan ready to execute.

The walkthrough is pinned to [`pingcap/tidb` commit `bf712cf67f6f711117d8246d46586e47ad851b6b`](https://github.com/pingcap/tidb/tree/bf712cf67f6f711117d8246d46586e47ad851b6b). This source snapshot makes the line links reproducible while TiDB continues to evolve.

## The path through the executor

Three code units explain the ordinary path:

| Code unit | Job |
| --- | --- |
| `DeleteExec` | Pulls matching rows from its child executor and arranges their removal. |
| `table.Table` | Gives the executor a storage-independent interface for mutating table rows. |
| `TableCommon` | Implements record and index-key removal using the current transaction. |

```text
DELETE ... WHERE ...
        |
        v
Child executor: finds matching rows and returns chunks
        |
        v
DeleteExec.Next
        |
        v
deleteSingleTableByChunk
        |
        +--> build a row handle from the child row
        |
        v
removeRow
        |
        +--> table.Table.RemoveRecord(...)
                  |
                  v
            TableCommon.RemoveRecord
              - delete the record key
              - delete applicable index keys
        |
        +--> foreign-key work and affected-row count
```

The child executor is important: `DeleteExec` does not independently re-run the `WHERE` expression. It consumes the rows selected by the plan below it.

## 1. `Next` chooses the single-table route

TiDB calls `DeleteExec.Next` through its executor interface. It clears the output chunk, then routes a multi-table delete to a separate method. For this post, we follow the single-table branch:

```go
func (e *DeleteExec) Next(ctx context.Context, req *chunk.Chunk) error {
    req.Reset()
    if e.IsMultiTable {
        return e.deleteMultiTablesByChunk(ctx)
    }
    return e.deleteSingleTableByChunk(ctx)
}
```

The executor's output is empty because a normal `DELETE` returns an affected-row count through statement status rather than returning the deleted records as a result set. See [`DeleteExec.Next`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/delete.go#L62-L69).

## 2. The child supplies chunks, and each row supplies a handle

`deleteSingleTableByChunk` asks its child executor for a chunk at a time. The plan's output contains the table values needed for the mutation and the handle columns needed to identify each record. TiDB processes one row in the chunk, then moves on to the next.

For each row, `deleteOneRow` calls `HandleCols.BuildHandleByDatums`. A **handle** is TiDB's identifier for the row. Depending on the table definition, it can come from an integer clustered key or from the common handle for a clustered primary key. The executor also accounts for the hidden row-ID column used by tables that need one.

Once it has a handle and row data, `deleteOneRow` delegates to `removeRow`. This keeps the executor focused on turning plan output into a table mutation instead of encoding the row-key layout itself. The loop and handle construction are in [`deleteSingleTableByChunk` and `deleteOneRow`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/delete.go#L71-L85).

## 3. The table layer removes the record and its indexes

`removeRow` obtains the current transaction with `Txn(true)` and calls `RemoveRecord` on the table interface. The concrete `TableCommon.RemoveRecord` implementation stages the mutation in the transaction's memory buffer. It deletes the record key, then removes applicable index entries using the old row values and handle.

```text
transaction memory buffer
   |
   +--> delete record key for handle
   |
   +--> for each applicable index
          derive the old index key and delete it
```

The row and its index entries are part of the same transaction. Keeping them together is essential: an index entry must not point to a row that was deleted, and a deleted row must not leave index entries behind. `TableCommon.RemoveRecord` brackets the changes with a mem-buffer staging marker so it can clean up the staged work if an error occurs.

After `RemoveRecord` succeeds, the executor runs foreign-key checks or cascades configured for the table and increments the statement's affected-row count. These steps are visible in [`removeRow`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/delete.go#L299-L315), while [`TableCommon.RemoveRecord`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/table/tables/tables.go#L1177-L1243) and its [`row` and `index` deletion helpers](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/table/tables/tables.go#L1245-L1314) show the lower-level work. On the ordinary path, these writes stay in the current transaction. Autocommit commits after statement success; an explicit transaction keeps the changes until the client commits or rolls back.

## A separate path: batch delete

The same `DeleteExec` contains an optional batch-delete path. In the inspected source, it is available only when all of these conditions hold:

```text
tidb_batch_delete is ON
AND the session is not already in a transaction
AND tidb_enable_batch_dml is ON
AND tidb_dml_batch_size is greater than 0
```

When the row count reaches the configured batch size, `doBatchDelete` commits the current statement transaction and starts another transaction before it continues. That reduces the amount of work held in one transaction, but it changes the statement's behavior: completed batches are committed independently, so a later failure does not undo earlier batches.

The relevant settings are:

| Setting | Scope and default | What the source uses it for |
| --- | --- | --- |
| `tidb_enable_batch_dml` | Global; OFF by default | Global gate for the batch-DML feature. |
| `tidb_batch_delete` | Session; OFF by default | Enables the delete-specific branch. |
| `tidb_dml_batch_size` | Global or session; 0 by default | Positive row count that sets each batch boundary. |

There is an important operational warning. TiDB's current [system-variable documentation](https://docs.pingcap.com/tidb/stable/system-variables#tidb_batch_delete) marks batch-DML as deprecated, warns that it may cause data corruption, and recommends using [non-transactional DML](https://docs.pingcap.com/tidb/stable/non-transactional-dml/) instead. The code path is useful to understand when reading TiDB or diagnosing older configurations; this article is not an instruction to enable it. The source branch is in [`deleteSingleTableByChunk` and `doBatchDelete`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/delete.go#L87-L183).

## What to remember

- The child executor finds candidate rows; `DeleteExec` consumes those rows and reconstructs a handle for each one.
- The table layer removes the record and applicable index keys through the current transaction.
- Foreign-key work and affected-row accounting happen after the table mutation succeeds.
- Batch delete changes commit boundaries. TiDB's current docs deprecate the batch-DML settings and warn of data-integrity risk.

## References

1. TiDB [`DeleteExec`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/delete.go).
2. TiDB [`TableCommon.RemoveRecord`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/table/tables/tables.go).
3. TiDB [DELETE statement](https://docs.pingcap.com/tidb/stable/sql-statement-delete).
4. TiDB system variables: [`tidb_batch_delete`](https://docs.pingcap.com/tidb/stable/system-variables#tidb_batch_delete), [`tidb_enable_batch_dml`](https://docs.pingcap.com/tidb/stable/system-variables#tidb_enable_batch_dml), and [`tidb_dml_batch_size`](https://docs.pingcap.com/tidb/stable/system-variables#tidb_dml_batch_size).
5. TiDB [Non-Transactional DML](https://docs.pingcap.com/tidb/stable/non-transactional-dml/).
6. TiDB [Transaction overview](https://docs.pingcap.com/tidb/stable/transaction-overview/).
