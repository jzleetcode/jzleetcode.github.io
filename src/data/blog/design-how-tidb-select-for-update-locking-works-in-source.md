---
author: JZ
pubDatetime: 2026-10-14T18:35:32Z
modDatetime: 2026-10-14T18:35:32Z
title: System Design - How TiDB Locks Rows for SELECT FOR UPDATE
tags:
  - design-system
  - design-database
  - design-concurrency
description: "Trace a pessimistic SELECT FOR UPDATE from TiDB's executor through the TiKV MVCC lock command, including lock waits, timestamp conflicts, and the settings that control them."
---

## Table of contents

## Context

This is a source walkthrough for engineers new to TiDB's locking path. We will follow one selected row from the SQL result to TiKV's MVCC lock action. Imagine two shoppers trying to reserve the last copy of an item. A normal read tells each shopper what was available at the time they read. A locked read must do more: it must protect the row so another transaction cannot update it before the first shopper finishes.

In TiDB's pessimistic transaction mode, `SELECT ... FOR UPDATE` is a **current read**: it reads the latest committed version and applies a pessimistic lock. This article follows the lock request across a small set of code units in `pingcap/tidb` and `tikv/tikv`. It stops at the client/RPC boundary rather than tracing the separate `client-go` routing implementation.

The code links are pinned to the upstream `main` snapshots inspected for this walkthrough: TiDB commit `6e7213df1bbf4f3f2f1f02770bcc4c70429376bb` and TiKV commit `67ffce0c137b7c171405a76df8bc8e9f04a19ce6`.

## The SQL asks for a guarded read

For example:

```sql
BEGIN PESSIMISTIC;

SELECT quantity
FROM inventory
WHERE item_id = 42
FOR UPDATE;

UPDATE inventory
SET quantity = quantity - 1
WHERE item_id = 42;

COMMIT;
```

The `SELECT` and `UPDATE` are in one transaction. The locking read protects the selected row until the transaction commits or rolls back. Other transactions can still perform MVCC reads, but a competing writer that needs the same lock must wait or fail according to the lock-wait policy.

## From result rows to TiKV

The main path can be sketched as:

```
SQL: SELECT ... FOR UPDATE
             |
             v
+---------------------------+
| TiDB SelectLockExec       |  reads child chunks, encodes row keys
+-------------+-------------+
              | accumulated keys + for_update_ts + wait policy
              v
+---------------------------+
| TiDB LazyTxn / LockKeys   |  tracks lock-acquiring transaction state
+-------------+-------------+
              | client-go routes the request to the owning Region
              v
+---------------------------+
| TiKV TypedCommand         |  maps PessimisticLockRequest to a command
+-------------+-------------+
              v
+---------------------------+
| AcquirePessimisticLock    |  checks keys and gathers lock results
+-------------+-------------+
              v
+---------------------------+
| MVCC lock action          |  checks versions and records the lock
+---------------------------+
```

The labels name the important code units, not separate network services. The handoff from TiDB's transaction interface to TiKV crosses `client-go`; routing and RPC details are intentionally outside this small walkthrough.

## TiDB gathers the row keys

The planner builds a `SelectLockExec` around the read plan. In [`pkg/executor/select.go`](https://github.com/pingcap/tidb/blob/6e7213df1bbf4f3f2f1f02770bcc4c70429376bb/pkg/executor/select.go#L196-L225), the executor keeps the row-handle columns needed to identify selected rows. Its `Next` method asks the child executor for a chunk, converts each selected handle into an encoded table row key, and appends that key to `e.keys`.

An important detail is that it does not call the lock API for every individual row as soon as the row appears. It accumulates keys across chunks. When the child reaches the end of its results, it creates a lock context and calls `doLockKeys` with the collected keys. The same code maps `NOWAIT` to a no-wait lock request and `WAIT N` to a millisecond timeout. This batching keeps the read executor separate from the storage lock request.

`doLockKeys` obtains the session transaction and invokes `txn.LockKeys`. The [`LazyTxn` wrapper](https://github.com/pingcap/tidb/blob/6e7213df1bbf4f3f2f1f02770bcc4c70429376bb/pkg/session/txn.go#L470-L498) marks the transaction as lock-acquiring while it forwards the call to the underlying transaction. It also restores the prior transaction state when the lock operation finishes.

The lock context carries a **`for_update_ts`** as well as wait and cancellation information. That timestamp ties the lock request to the version observed by the current read; it is not itself the lock.

## TiKV checks the MVCC history

On the storage side, [`TypedCommand::from(PessimisticLockRequest)`](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/commands/mod.rs#L214-L249) translates each request mutation into a key and builds an `AcquirePessimisticLock` command. The [`process_write` implementation](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/commands/acquire_pessimistic_lock.rs#L81-L215) visits the requested keys and calls the MVCC lock action.

For each key, [`acquire_pessimistic_lock`](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/actions/acquire_pessimistic_lock.rs#L44-L333) checks the existing lock and the write history. If another transaction owns a conflicting lock, TiKV returns lock information to the waiting path; a request with no wait budget can return a lock error immediately. If the write history contains a commit newer than the request's `for_update_ts`, TiKV reports a `PessimisticRetry` write conflict rather than silently locking a stale version. The statement retry or error handling above this storage helper is outside this walkthrough.

When the key is eligible, the action constructs a `PessimisticLock` record containing the transaction's start timestamp, primary key, TTL, and `for_update_ts`, then adds it to the MVCC transaction's modifications. Acquiring the lock is not the same as committing the row update: the later write and transaction commit still have to complete. How quickly the lock becomes durable depends on TiKV's lock-write path.

## Settings and boundaries to remember

- **Transaction mode:** `tidb_txn_mode` controls whether transactions use pessimistic or optimistic behavior. `BEGIN PESSIMISTIC` makes the mode explicit for this example; cluster defaults can differ for upgraded clusters.
- **Lock wait:** `innodb_lock_wait_timeout` controls the usual wait budget (50 seconds by default in the current documentation). TiDB also supports `FOR UPDATE NOWAIT`; the executor maps that syntax to a no-wait request. A short wait or `NOWAIT` can turn contention into an application-visible error sooner.
- **Lock durability and latency:** TiKV's `pessimistic-txn.pipelined` can let TiDB continue with later requests while the lock write completes asynchronously. `pessimistic-txn.in-memory` can keep eligible locks in memory instead of writing them to disk or replicating them; it only applies when pipelined locking is enabled. These optimizations reduce latency, but TiKV documents a low-probability failure mode where a lost or failed lock write causes the transaction commit to fail. Check the documentation for the deployed version before changing them.
- **Row locks are not gap locks:** TiDB locks the selected row keys, but does not block every possible insert into a key range just because the query used a range predicate.
- **Transaction lifetime matters:** the lock remains relevant until commit or rollback. Keep pessimistic transactions short so other writers do not wait unnecessarily.

The useful boundary is this: TiDB decides which result rows to lock and supplies the transaction timestamp and wait policy; TiKV validates those keys against MVCC history and records or rejects the lock. That division lets SQL execution remain in TiDB while concurrency control is enforced beside the data.

## References

1. [TiDB pessimistic transaction mode](https://docs.pingcap.com/tidb/stable/pessimistic-transaction/).
2. [TiDB transaction mode and system variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_txn_mode).
3. [TiDB `SELECT` syntax](https://docs.pingcap.com/tidb/stable/sql-statement-select/).
4. [TiKV lock configuration and lock-write modes](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/).
5. [TiDB `SelectLockExec` and `doLockKeys`](https://github.com/pingcap/tidb/blob/6e7213df1bbf4f3f2f1f02770bcc4c70429376bb/pkg/executor/select.go#L196-L305).
6. [TiDB `LazyTxn.LockKeysFunc`](https://github.com/pingcap/tidb/blob/6e7213df1bbf4f3f2f1f02770bcc4c70429376bb/pkg/session/txn.go#L470-L498).
7. [TiKV request-to-command conversion](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/commands/mod.rs#L214-L249).
8. [TiKV `AcquirePessimisticLock` command](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/commands/acquire_pessimistic_lock.rs#L81-L215).
9. [TiKV MVCC pessimistic-lock action](https://github.com/tikv/tikv/blob/67ffce0c137b7c171405a76df8bc8e9f04a19ce6/src/storage/txn/actions/acquire_pessimistic_lock.rs#L44-L333).
