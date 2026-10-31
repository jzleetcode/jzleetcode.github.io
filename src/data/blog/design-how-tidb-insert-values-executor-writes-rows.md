---
author: JZ
pubDatetime: 2026-10-31T18:30:00Z
modDatetime: 2026-10-31T18:30:00Z
title: System Design - How TiDB INSERT VALUES Writes Rows in Source Code
tags:
  - design-system
  - design-database
description: "A focused TiDB source walkthrough of INSERT ... VALUES: how InsertExec turns expressions into rows, batches optional large inserts, and delegates record and index writes to TableCommon."
---

## Table of contents

## Context

An `INSERT` statement appears to be a tiny request:

```sql
INSERT INTO orders (customer_id, amount) VALUES (42, 19.99), (42, 7.50);
```

But a database cannot put those values straight into a table-shaped file. It must evaluate SQL expressions, fill omitted columns, allocate a row handle when necessary, preserve transactional atomicity, enforce constraints, and write index entries that agree with the row.

This is a focused source walkthrough of the `INSERT ... VALUES` path in TiDB commit [`49ad420278001b896de85fd7985b35ff49be877f`](https://github.com/pingcap/tidb/tree/49ad420278001b896de85fd7985b35ff49be877f). The permalink matters: TiDB's `main` branch evolves, while a reader can inspect the exact code discussed here.

We will follow the ordinary no-`IGNORE`, no-`ON DUPLICATE KEY UPDATE` case and keep the cast intentionally small:

| Code unit               | Responsibility                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `executor.InsertExec`   | Selects the insert route and asks the table layer to add each completed row.                                               |
| `executor.InsertValues` | Builds complete table rows from each `VALUES` list and optionally splits a large autocommit insert into batches.           |
| `tables.TableCommon`    | Allocates a record handle when required, encodes the row, checks constraints, and writes record/index key-value mutations. |

Planning, transaction commit, TiKV's Raft replication, and special `INSERT ... SELECT` handling exist outside this article's boundary. That boundary lets us answer a concrete question: **after TiDB has a physical insert plan, how does a list of SQL values become transactional row and index mutations?**

## The route in one picture

```text
INSERT INTO orders (customer_id, amount) VALUES (42, 19.99), (42, 7.50)
                                  |
                                  v
                         InsertExec.Next()
                                  |
                                  v
                         insertRows(InsertValues)
                                  |
                    evaluate each VALUES expression
                    cast values; fill defaults/generated values
                                  |
                                  v
                         InsertExec.exec(rows)
                                  |
                                  v
                     InsertValues.addRecord(...)
                                  |
                                  v
                     TableCommon.AddRecord(...)
                    /             |              \
                   v              v               v
          choose/allocate     encode row       add index entries
          record handle       and check        to transaction memory
                              constraints          buffer
```

The arrows are function calls inside the TiDB server, not network hops. The transaction's key-value mutations become durable only when the transaction later commits.

## 1. `InsertExec.Next` chooses the VALUES path

[`InsertExec.Next`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert.go#L362-L402) is called through TiDB's executor interface. It resets the output chunk because `INSERT` returns no result rows. If an insert has a child executor, it is an `INSERT ... SELECT`-style path. A direct `VALUES` statement has no child, so `Next` calls `insertRows(ctx, e)`.

That small branch is an important design decision: a `VALUES` clause starts as expression lists already attached to the physical plan, whereas `INSERT ... SELECT` has to pull rows from another executor. Both eventually need complete table rows, but they acquire their input differently.

`InsertExec` also owns the semantic branches that make insertion non-ordinary. Its [`exec`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert.go#L49-L125) method chooses among:

```text
INSERT variant
    |
    +-- ON DUPLICATE KEY UPDATE --> batchUpdateDupRows
    +-- INSERT IGNORE -----------> batchCheckAndInsert
    +-- plain INSERT ------------> add every row; duplicate policy chosen below
```

The ordinary route does not mean uniqueness is ignored. It means the table layer receives a duplicate-key check mode and returns an error if it finds a conflict. The special forms need extra behavior: `IGNORE` changes certain errors into warnings, while `ON DUPLICATE KEY UPDATE` first locates the existing record and updates it.

## 2. `InsertValues` turns an expression list into a row

[`insertRows`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert_common.go#L250-L315) belongs to `InsertValues`, the shared base for insert-like executors. For each parenthesized `VALUES` list, it calls either a fast constant path or `evalRow` when expressions are not all constant. The result is not merely the values typed in SQL. It is a row shaped like the table.

Conceptually, the work looks like this:

```text
VALUES (42, 19.99)
       |
       +--> evaluate expressions in the session context
       +--> put values at their table-column offsets
       +--> cast to each column's SQL type
       +--> obtain omitted-column defaults
       +--> calculate generated columns when applicable
       +--> return a complete []Datum row
```

For a concrete cast/default path, [`getRow`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert_common.go#L622-L660) shows the same invariant used for datum-based input: it calls `table.CastValue`, records which column offsets are supplied, and then calls `fillRow`. `InsertValues` caches non-expression defaults for multi-row inserts when safe, avoiding repeated evaluation of the same default. It must not cache expression defaults as if they were constants.

This is why column order matters less than it first seems. `INSERT INTO orders (amount, customer_id) VALUES (19.99, 42)` is normalized into positions in the table row before storage sees it. Conversely, an unknown column, duplicate named column, invalid cast, missing required value, or generated-column rule is rejected before a malformed row reaches the table layer.

## 3. Optional batching changes transaction boundaries

By default, one autocommit `INSERT ... VALUES` statement is executed as one statement transaction. `insertRows` can instead split a sufficiently large insert when all of these conditions hold:

```text
tidb_batch_insert = ON
AND no explicit transaction is active
AND enable-batch-dml is enabled on the server
AND tidb_dml_batch_size > 0
```

At each configured row count, it completes the current row slice, invokes `InsertExec.exec`, and calls [`doBatchInsert`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert_common.go#L605-L618). That helper commits the statement's current transaction and starts a new one for the next batch.

```text
rows 1 ... N                 rows N+1 ... 2N
     |                             |
     v                             v
evaluate -> add records -> commit -> start new txn -> add records -> commit
```

This reduces the size of an individual transaction, but it changes the failure story. A later batch can fail after earlier batches committed. Applications that require all-or-nothing behavior should use the normal statement transaction (or an explicit transaction) rather than treating batch insert as a transparent performance switch.

Before passing a batch down, `InsertValues` also reserves and fills auto-increment values where appropriate. For a multi-row `VALUES` insert this helps TiDB provide the expected consecutive generated identifiers while avoiding a separate allocation operation for every row.

## 4. `InsertExec` selects when to check duplicates

For a plain insert, [`optimizeDupKeyCheckForNormalInsert`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert.go#L319-L342) chooses between in-place and lazy checking.

```text
constraint setting / transaction kind
                |
                +-- pessimistic, pipelined, or in-place checking OFF
                |       -> DupKeyCheckLazy
                |
                +-- otherwise
                        -> DupKeyCheckInPlace
```

In-place checking asks storage during the insert path, which can surface a duplicate early. Lazy checking defers more work and can reduce requests, but the conflict may be discovered later in the transaction's write path. TiDB deliberately does not apply this shortcut blindly: the transaction mode affects what is safe and useful.

`InsertExec.exec` then loops over the completed rows. Periodically it passes a reserve-auto-ID hint based on `ShardAllocateStep`; otherwise it calls [`InsertValues.addRecord`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert_common.go#L1648-L1682). After a successful add, the executor updates affected-row accounting and remembers a generated last-insert ID when one applies.

## 5. `TableCommon.AddRecord` makes key-value mutations

The table abstraction is where a logical SQL row turns into storage keys. [`TableCommon.AddRecord`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/table/tables/tables.go#L734-L738) packages options and delegates to `addRecord`. The latter is broader than our simple example because it also supports temporary tables, changing schemas, and several kinds of table handle.

First, it determines the record handle:

```text
table kind / supplied values
       |
       +-- explicit _tidb_rowid or integer primary key handle -> use that integer
       +-- clustered common primary key ----------------------> encode primary-key columns
       +-- otherwise -----------------------------------------> allocate a handle / auto ID
```

Then it walks writable columns, applies schema-state rules, builds an encoded row value, and checks row constraints. This matters during online DDL: a column that is not yet public can require a default value on new writes so records remain compatible while schemas transition.

Finally, it stages the record key and index keys in the transaction's in-memory buffer. The core sequence is:

```text
InsertValues.addRecord
          |
          v
TableCommon.addRecord
          |
          +--> RecordKey(handle) -> encoded row value
          +--> index key/value mutations for each writable index
          +--> duplicate-key behavior according to supplied options
          +--> transaction memory buffer
```

Staging is not a direct disk write. The transaction coordinates commit later; TiKV's transaction and Raft layers then handle distributed persistence and replication. Keeping table encoding separate from commit protocol lets the executor reason in SQL rows while the storage layer reasons in keys.

## Important settings for this path

| Setting                          | Effect                                                                              | Practical caution                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tidb_batch_insert`              | Enables automatic splitting for qualifying large autocommit inserts.                | Batches commit independently; it is not all-or-nothing.                                                                  |
| `tidb_dml_batch_size`            | Number of rows per automatic DML batch; source default is 20,000.                   | Choose based on row size and transaction limits, not only row count.                                                     |
| `tidb_constraint_check_in_place` | Controls whether ordinary inserts favor in-place rather than lazy duplicate checks. | Turning it off can improve bulk throughput but moves when a conflict becomes visible.                                    |
| `tidb_dml_type = 'bulk'`         | Uses bulk behavior for supported auto-committed DML.                                | The source ties this to pipelined transaction behavior; validate semantics and version-specific docs before changing it. |

The first two are defined with their batching behavior in [`vardef/tidb_vars.go`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/sessionctx/vardef/tidb_vars.go#L130-L153). The constraint and DML-mode definitions are in the same file. Settings influence this call path, but they do not remove normal data-model obligations such as unique indexes and transaction-error handling.

## Takeaways

- `InsertExec.Next` sends `VALUES` inserts to a row-building path and keeps `INSERT ... SELECT` separate because its input is streamed.
- `InsertValues` evaluates, casts, defaults, and completes each row before the table layer writes anything.
- Batch insert is a throughput feature with a visible atomicity trade-off: earlier batches can commit before a later one fails.
- `InsertExec` chooses a duplicate-check strategy based on session settings and transaction type.
- `TableCommon` turns the logical row into record and index key-value mutations; transaction commit and TiKV replication are deliberately separate responsibilities.

## References

1. [TiDB `InsertExec`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert.go).
2. [TiDB `InsertValues` and `insertRows`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/insert_common.go).
3. [TiDB `TableCommon.AddRecord`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/table/tables/tables.go#L734-L900).
4. [TiDB system variables](https://docs.pingcap.com/tidb/stable/system-variables/).
5. [TiDB transaction overview](https://docs.pingcap.com/tidb/stable/transaction-overview/).
6. [TiDB bulk data loading best practices](https://docs.pingcap.com/tidb/stable/dev-guide-insert-data/).
