---
author: JZ
pubDatetime: 2026-11-17T19:30:00Z
modDatetime: 2026-11-17T19:30:00Z
title: System Design - How TiDB Isolates a Failed Statement Inside a Transaction
tags:
  - design-system
  - design-database
  - design-tidb
description: "A source walkthrough of TiDB's LazyTxn and MemBuffer staging: how a successful statement joins a transaction while a failed statement's writes are discarded."
---

## Table of contents

## One transaction, two different kinds of rollback

Assume the orders table uses **id** as its primary key. Consider a client that runs three statements in one transaction:

    BEGIN;
    INSERT INTO orders VALUES (101, 'ready');
    INSERT INTO orders VALUES (101, 'conflict');
    COMMIT;

Suppose the second statement fails. The client expects the first statement to remain part of the transaction, while the failed statement contributes no partial writes. It can then decide whether to fix the problem, run another statement, or roll back the whole transaction.

That requires two rollback boundaries:

- A **statement rollback** discards the writes made by one failed SQL statement.
- A **transaction rollback** discards all writes accumulated since **BEGIN**.

TiDB handles the statement boundary in its SQL session layer. The important pieces are the **session** methods **StmtCommit** and **StmtRollback**, the **LazyTxn** wrapper, and the transaction's in-memory **MemBuffer**. The walkthrough below follows those pieces in [TiDB's session transaction source](https://github.com/pingcap/tidb/blob/master/pkg/session/txn.go).

## Where a statement's writes go

An executor does not normally send each row change straight to TiKV as soon as it evaluates the SQL. TiDB first records mutations in the transaction's in-memory buffer. **LazyTxn** wraps the lower-level **kv.Transaction** and creates a staging area in that buffer for the current statement.

    SQL executor
         |
         | statement succeeded or failed
         v
    session.StmtCommit / session.StmtRollback
         |
         v
    LazyTxn
         |
         v
    transaction MemBuffer
         |
         | final transaction COMMIT
         v
    TiDB transaction client --> TiKV

Think of the MemBuffer as a list of pending changes owned by the transaction. A statement stage is a temporary layer on top of that list. It lets TiDB either publish the layer into the transaction's buffer or throw it away.

The **MemBuffer** interface in [pkg/kv/kv.go](https://github.com/pingcap/tidb/blob/master/pkg/kv/kv.go#L174) describes the three operations that matter:

- **Staging** creates a new nested buffer. Later writes go into that stage.
- **Release** publishes the latest stage into its parent buffer.
- **Cleanup** discards the stage if it has not been released.

These are buffer operations. Releasing a stage does not by itself commit the SQL transaction or make its rows visible to other transactions.

## The successful statement path

When a transaction becomes active, **LazyTxn.initStmtBuf** records the current buffer length and opens a stage. The stage begins before the statement writes are added.

After the executor finishes the statement successfully, **session.StmtCommit** asks the transaction manager to finish its statement work and calls **LazyTxn.flushStmtBuf**. That method releases the stage, moving the statement's changes into the parent transaction buffer. TiDB then cleans up the stage bookkeeping and opens a fresh stage for the next statement.

    Before statement 1:
      transaction buffer: [ ]
      active stage:       [ ]

    Statement 1 succeeds:
      Release(stage 1)
      transaction buffer: [ statement 1 writes ]
      active stage:       [ ]

The earlier writes are now part of the transaction, but the transaction is still open. A later **ROLLBACK** can still discard them.

## The failed statement path

If the executor reports a statement error, TiDB can call **session.StmtRollback**. That method notifies the transaction manager and calls **LazyTxn.cleanup**. The cleanup removes the current stage, which discards writes that the failed statement had placed there. It then opens a new stage so the session can continue with another statement.

    Before statement 2:
      transaction buffer: [ statement 1 writes ]
      active stage:       [ ]

    Statement 2 fails:
      active stage:       [ partial statement 2 writes ]
      Cleanup(stage 2)

    After statement rollback:
      transaction buffer: [ statement 1 writes ]
      active stage:       [ ]

This is why a failed statement does not have to erase successful statements that came before it. The outer transaction still owns statement 1's writes; only the un-released stage for statement 2 is discarded.

The sequence can be summarized as:

    start stage
        |
        +-- statement succeeds --> Release into transaction buffer
        |
        +-- statement fails -----> Cleanup and discard this stage

The implementation is in [LazyTxn.initStmtBuf, flushStmtBuf, and cleanupStmtBuf](https://github.com/pingcap/tidb/blob/master/pkg/session/txn.go#L114). The session callbacks that choose the success or failure path are [StmtCommit and StmtRollback](https://github.com/pingcap/tidb/blob/master/pkg/session/txn.go#L755).

## Statement commit is not transaction commit

The similar names can be confusing. **session.StmtCommit** means “this SQL statement succeeded; merge its changes into the transaction.” It does not mean “finish the transaction.”

The client issues **COMMIT** separately. TiDB then commits the underlying transaction. At the storage layer, TiKV's [Prewrite command](https://github.com/tikv/tikv/blob/master/src/storage/txn/commands/prewrite.rs#L50) handles the first phase of two-phase commit. That later protocol decides whether the transaction's accumulated writes become committed data. Statement staging happens earlier and only decides which writes are allowed to remain in the transaction's buffer.

This distinction also explains why the layer matters for both optimistic and pessimistic transactions: the mode changes conflict handling and locking behavior, while statement staging protects the transaction's pending writes from a failed statement.

There are paths with additional rules. **LazyTxn** does not create a statement stage for a pipelined transaction. Also, some errors invalidate or abort the transaction itself; statement staging does not override those transaction-level rules. This article follows the ordinary statement success or failure path.

## Settings that shape the example

- **autocommit:** The default is **ON**, so a statement outside an explicit transaction is automatically committed as its own transaction. Use **BEGIN** or **START TRANSACTION** to keep multiple statements in one transaction while observing the statement boundary.
- **tidb_txn_mode:** This selects optimistic or pessimistic transaction behavior. New TiDB clusters use pessimistic mode by default. It affects when TiDB detects conflicts and acquires locks; it does not change the meaning of **Release** and **Cleanup** in the statement buffer.

These settings define the outer transaction context. The statement stage is an internal mechanism that protects the transaction's pending mutations inside that context.

## References

1. TiDB source, [LazyTxn and statement callbacks](https://github.com/pingcap/tidb/blob/master/pkg/session/txn.go)
2. TiDB source, [MemBuffer staging interface](https://github.com/pingcap/tidb/blob/master/pkg/kv/kv.go#L174)
3. TiDB documentation, [Transactions](https://docs.pingcap.com/tidb/stable/transaction-overview/)
4. TiDB documentation, [autocommit](https://docs.pingcap.com/tidb/stable/system-variables/#autocommit) and [tidb_txn_mode](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_txn_mode)
5. TiKV source, [Prewrite command](https://github.com/tikv/tikv/blob/master/src/storage/txn/commands/prewrite.rs#L50)
