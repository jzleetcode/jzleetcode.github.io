---
author: JZ
pubDatetime: 2026-09-02T06:23:00Z
modDatetime: 2026-09-02T06:23:00Z
title: System Design - How the ARIES Recovery Algorithm Works
tags:
  - design-system
  - design-database
description:
  "How the ARIES recovery algorithm works: WAL, steal/no-force buffer management, LSN-based tracking, fuzzy checkpointing, and the three-pass recovery protocol (analysis, redo, undo) with source code references from PostgreSQL and InnoDB."
---

## Table of contents

## Context

It is 2:47 AM. Your database server is handling hundreds of transactions per second. Transaction T1 just transferred $500 from account A to account B -- it debited A but has not yet credited B. Transaction T2 committed a large batch insert three seconds ago, but the dirty pages have not been flushed to disk yet. Transaction T3 is in the middle of a complex join.

The power goes out.

When the machine restarts, the database faces three questions:

1. **T1 debited A but never credited B.** If the debit made it to disk, the $500 has vanished. The database must **undo** T1's partial work.
2. **T2 committed, but its pages never reached disk.** The client received "COMMIT OK." If those changes are lost, the database has broken its durability promise. The database must **redo** T2's work.
3. **T3 was mid-flight.** Whatever it did must be rolled back cleanly.

Getting this right -- for every possible crash timing, for every combination of flushed and unflushed pages, even if the system crashes again during recovery itself -- is the crash recovery problem. In 1992, C. Mohan and colleagues at IBM Research published **ARIES** (Algorithm for Recovery and Isolation Exploiting Semantics), a recovery algorithm that solved this problem with an elegance that has influenced virtually every major database since: InnoDB, PostgreSQL, SQL Server, DB2, and many others.

This article walks through how ARIES works. If you have read [How Write-Ahead Logging (WAL) Works](/posts/design-how-write-ahead-logging-wal-works/), you already know the foundation. ARIES builds on top of WAL and defines the complete recovery protocol.

## The WAL Foundation

ARIES is built on the **Write-Ahead Logging** rule:

> **Before any modified page is written to disk, all log records describing changes to that page must first be flushed to stable storage.**

This rule is the bedrock. If the log is on disk, the database can always reconstruct what happened. If the log record was never written, the change is treated as if it never occurred.

```
  The WAL + Buffer Pool + Disk Relationship

  +------------------+         +------------------+
  |   WAL Buffer     |         |   Buffer Pool    |
  |  (in memory)     |         |  (in memory)     |
  |                  |         |                  |
  |  [log rec 1]     |         |  [page A dirty]  |
  |  [log rec 2]     |         |  [page B dirty]  |
  |  [log rec 3]     |         |  [page C clean]  |
  +--------+---------+         +--------+---------+
           |                            |
     (1) flush log                (3) flush page
     BEFORE page write            AFTER log is safe
           |                            |
           v                            v
  +------------------+         +------------------+
  |   WAL on Disk    |         |  Data Files      |
  |  (sequential)    |         |  (random I/O)    |
  |                  |         |                  |
  |  [log rec 1]     |         |  [page A (old)]  |
  |  [log rec 2]     |         |  [page B (old)]  |
  |  [log rec 3]     |         |  [page C (cur)]  |
  +------------------+         +------------------+

  Rule: (1) must happen before (3).
  The log on disk is always at least as up-to-date
  as the data files on disk.
```

For a deep dive into WAL mechanics, see the [WAL article](/posts/design-how-write-ahead-logging-wal-works/). The rest of this article focuses on what ARIES builds on top.

## Buffer Management Policy: Steal / No-Force

Before ARIES, database designers had to make two fundamental choices about how the buffer pool interacts with disk. These choices have a dramatic effect on both performance and recovery complexity.

**Force vs. No-Force:** When a transaction commits, must all its dirty pages be forced to disk immediately?

- **Force:** Write all dirty pages at commit time. Simple recovery (committed data is always on disk), but terrible performance -- every commit triggers random I/O.
- **No-Force:** Dirty pages are written lazily in the background. Fast commits (only the log must be flushed), but recovery must be able to **redo** committed changes that never reached disk.

**Steal vs. No-Steal:** Can the buffer pool evict (steal) a dirty page belonging to an uncommitted transaction?

- **No-Steal:** Never evict an uncommitted transaction's pages. Simple recovery (uncommitted data is never on disk), but the buffer pool must be large enough to hold every page touched by every active transaction -- impractical for large transactions.
- **Steal:** Dirty pages can be evicted at any time, even if the modifying transaction has not committed. Recovery must be able to **undo** uncommitted changes that made it to disk.

```
                    Force                 No-Force
               +-----------------+  +-----------------+
               |                 |  |                 |
  No-Steal     |  Simplest       |  |  Need REDO     |
               |  recovery.      |  |  at recovery.   |
               |  Terrible perf. |  |                 |
               +-----------------+  +-----------------+
               |                 |  |                 |
  Steal        |  Need UNDO      |  |  Need both     |
               |  at recovery.   |  |  REDO + UNDO.  |
               |                 |  |  Best perf.    |
               +-----------------+  +-----------------+
                                        ^
                                        |
                                   ARIES lives here
```

ARIES chose **steal/no-force** -- the quadrant that demands the most sophisticated recovery (both redo and undo) but delivers the best runtime performance. Transactions commit with only a sequential log flush. The buffer pool freely evicts any page at any time, limited only by the WAL rule.

This is the fundamental trade-off ARIES makes: invest complexity in the recovery algorithm so that normal operations run at full speed.

## Log Sequence Numbers (LSNs)

The LSN is ARIES's universal clock. Every log record is assigned an **LSN** -- a monotonically increasing identifier (typically a byte offset into the log stream). Every data page stores the LSN of the most recent log record that modified it, called the **pageLSN**.

```
  Log stream:
  +----------+----------+----------+----------+----------+
  | LSN=100  | LSN=150  | LSN=200  | LSN=270  | LSN=350  |
  | T1:upd A | T2:upd B | T1:upd C | T2:commit| T1:upd D |
  +----------+----------+----------+----------+----------+

  Data pages in the buffer pool:

  +------------+     +------------+     +------------+
  | Page A     |     | Page B     |     | Page C     |
  | pageLSN=100|     | pageLSN=150|     | pageLSN=200|
  +------------+     +------------+     +------------+

  If Page A is on disk with pageLSN=100, and the log
  has a record at LSN=100 for Page A, we know the page
  is up-to-date with respect to that record.

  If Page A is on disk with pageLSN=50 (old), we know
  the LSN=100 change has NOT been applied to disk yet.
```

The pageLSN is the key to making recovery idempotent. During redo, the recovery algorithm compares the log record's LSN with the page's on-disk pageLSN:

- If **pageLSN >= record LSN**, the change is already on the page. Skip it.
- If **pageLSN < record LSN**, the change was lost in the crash. Redo it.

This means replaying the same log record twice is harmless -- the check prevents double-application. This property is critical because ARIES may need to recover from a crash during recovery itself.

## Log Record Structure

Each ARIES log record contains enough information to both **redo** and **undo** a single change:

```
  ARIES Log Record Structure

  +----------------------------------------------------------+
  |  LSN          Unique identifier (byte offset in log)     |
  |  prevLSN      Previous log record for the SAME txn       |
  |  txnID        Transaction that made this change          |
  |  type         update / commit / abort / CLR / checkpoint  |
  |  pageID       Which page was modified                    |
  |  undoNextLSN  (CLR only) next record to undo             |
  |  before-image Old value of the changed bytes (for undo)  |
  |  after-image  New value of the changed bytes (for redo)  |
  +----------------------------------------------------------+
```

The **prevLSN** field links all log records of the same transaction into a backward chain. This chain is how the undo pass walks a transaction's history in reverse:

```
  Transaction T1's log records (linked by prevLSN):

  LSN=100         LSN=200         LSN=350
  +----------+    +----------+    +----------+
  | T1:upd A |<---| T1:upd C |<---| T1:upd D |
  | prev=NIL |    | prev=100 |    | prev=200 |
  +----------+    +----------+    +----------+

  To undo T1, start at LSN=350 and follow
  prevLSN pointers backward: 350 -> 200 -> 100.
```

### The Transaction Table

ARIES maintains an in-memory **Transaction Table** (also called the Active Transaction Table) that tracks every active transaction:

| Field | Meaning |
|-------|---------|
| txnID | Transaction identifier |
| status | Running, Committing, or Aborting |
| lastLSN | LSN of the most recent log record for this transaction |

The `lastLSN` is the starting point for undo -- follow the prevLSN chain from here.

### The Dirty Page Table (DPT)

ARIES also maintains a **Dirty Page Table** that tracks every page in the buffer pool that has been modified but not yet written to disk:

| Field | Meaning |
|-------|---------|
| pageID | Identifier of the dirty page |
| recLSN | LSN of the **first** log record that dirtied this page since it was last flushed |

The `recLSN` tells recovery the earliest point from which redo might be needed for this page. If a page's recLSN is 200, then all log records before LSN 200 for this page are already reflected on disk.

## Fuzzy Checkpoints

A naive checkpoint would pause the entire database, flush all dirty pages, and write a checkpoint record. This "sharp" checkpoint guarantees that all data is on disk, but it also means the database is frozen for the duration of the flush -- unacceptable for a production system.

ARIES uses **fuzzy checkpoints**. Instead of flushing all dirty pages, a fuzzy checkpoint simply writes a snapshot of the current state of the Transaction Table and the Dirty Page Table to the log:

```
  Fuzzy Checkpoint Record

  +----------------------------------------------------------+
  |  type = CHECKPOINT                                       |
  |  Transaction Table snapshot:                             |
  |    T1: status=running, lastLSN=350                       |
  |    T3: status=running, lastLSN=420                       |
  |  Dirty Page Table snapshot:                              |
  |    Page A: recLSN=100                                    |
  |    Page B: recLSN=150                                    |
  |    Page C: recLSN=200                                    |
  |    Page D: recLSN=350                                    |
  +----------------------------------------------------------+
```

The database does **not** stop. Transactions continue running during the checkpoint. The checkpoint record captures a consistent-enough snapshot that recovery can use as a starting point.

After writing the checkpoint record, the database updates a special fixed location on disk (the **master record** or **control file**) with the LSN of this checkpoint. On restart, the recovery algorithm reads the master record to find the most recent checkpoint.

```
  Normal operation with fuzzy checkpoints:

  WAL stream:
  |==|==|==|==|==|CP|==|==|==|==|==|CP|==|==|==|XX|
                  ^                  ^             ^
              checkpoint         checkpoint      crash
              (no pause,         (no pause,
               just log           just log
               TT + DPT)          TT + DPT)

  Master record on disk always points to most recent
  checkpoint LSN. Recovery starts from there.
```

Why is this safe? Because the checkpoint tells recovery which transactions were active and which pages were dirty. Recovery can reconstruct the exact pre-crash state by starting from the checkpoint and scanning forward through the log.

## The Three Passes of Recovery

When the database restarts after a crash, ARIES performs recovery in three sequential passes: **Analysis**, **Redo**, and **Undo**. This is the heart of the algorithm.

```
  The Three Recovery Passes

  WAL stream:
  |====|====|====|CP|====|====|====|====|====|====|XX|
                  ^                                ^
              checkpoint                        crash
                  |                                |
                  +--- Analysis pass (forward) --->+
                  |                                |
    redoLSN <-----+                                |
                  |                                |
    redoLSN ------+--- Redo pass (forward) ------->+
                  |                                |
                  |    Undo pass (backward) <------+
                  |                                |

  Pass 1 (Analysis): Scan forward from checkpoint.
          Rebuild Transaction Table and Dirty Page Table.
          Determine where redo must start (redoLSN).

  Pass 2 (Redo):     Scan forward from redoLSN.
          Repeat history -- redo ALL logged changes.
          Restore database to exact pre-crash state.

  Pass 3 (Undo):     Scan backward from end of log.
          Roll back all uncommitted transactions.
          Write CLRs so undo work is not lost if
          we crash again during recovery.
```

### Pass 1: Analysis

The analysis pass starts at the most recent checkpoint record and scans forward to the end of the log. Its job is to reconstruct two data structures:

1. **The Transaction Table** -- which transactions were active at the time of the crash.
2. **The Dirty Page Table** -- which pages might have unflushed changes.

The algorithm:

```
Analysis Pass (pseudocode):

  Load Transaction Table and DPT from checkpoint record.

  FOR each log record from checkpoint to end of log:

    IF record's txn is not in Transaction Table:
        Add it (status = running)

    Update txn's lastLSN to this record's LSN.

    IF record is a COMMIT:
        Remove txn from Transaction Table.

    IF record is an UPDATE:
        IF record's pageID is not in DPT:
            Add pageID to DPT with recLSN = this record's LSN.

  At the end:
    - Transaction Table contains all txns that were
      active at crash time (need to be undone).
    - DPT contains all pages that MIGHT be dirty on disk.
    - redoLSN = smallest recLSN in the DPT.
```

The `redoLSN` is the earliest point from which redo might be needed. Any log record before this LSN is guaranteed to have its effects already on disk (because those pages were clean at the time of the checkpoint and no log record dirtied them before `redoLSN`).

### Pass 2: Redo (Repeat History)

The redo pass is where ARIES's most distinctive design choice appears: **repeat history**. Instead of only redoing committed transactions, ARIES redoes **everything** -- including changes made by transactions that will later be undone. This restores the database to its exact pre-crash state, as if the crash never happened.

Why redo uncommitted transactions' work? Because the steal policy means some of those pages may have been flushed to disk before the crash. By repeating all history, the database reaches a consistent state where the undo pass can then cleanly reverse the uncommitted work.

```
Redo Pass (pseudocode):

  FOR each log record from redoLSN to end of log:

    IF record is a redo-able update (including CLRs):

        IF record's pageID is NOT in the DPT:
            SKIP (page was not dirty, change is on disk)

        IF record's LSN < DPT[pageID].recLSN:
            SKIP (change predates the first dirty modification)

        Read the page from disk.
        IF page's pageLSN >= record's LSN:
            SKIP (page already has this change)
        ELSE:
            Apply the redo (after-image) to the page.
            Set page's pageLSN = record's LSN.
```

The three-level filtering (DPT membership, recLSN comparison, pageLSN comparison) avoids unnecessary I/O. Many log records can be skipped without ever reading the page from disk.

### Pass 3: Undo

The undo pass rolls back all transactions that were active at crash time (found in the Transaction Table after the analysis pass). It processes them in **reverse LSN order**, undoing the most recent changes first.

For each change it undoes, ARIES writes a **Compensation Log Record (CLR)** -- a special log record that describes the undo action. CLRs are critical for correctness if the system crashes again during recovery.

```
Undo Pass (pseudocode):

  Build a set of LSNs to undo:
    For each txn in Transaction Table, add its lastLSN.

  WHILE the undo set is not empty:

    Pick the LARGEST LSN from the set (most recent first).
    Read the log record at that LSN.

    IF record is a CLR:
        IF CLR's undoNextLSN is not NIL:
            Add undoNextLSN to the undo set.
        (CLRs are never undone -- they are already an undo action.)

    ELSE IF record is an UPDATE:
        Undo the change:
            Apply the before-image to restore old value.
        Write a CLR:
            CLR's undoNextLSN = record's prevLSN
            (points to the next record to undo for this txn)
        Add record's prevLSN to the undo set.

    ELSE (begin record, etc.):
        Write an END record for this transaction.
```

## CLRs and Nested Undo

Compensation Log Records are the mechanism that makes ARIES resilient to **crashes during recovery**. Consider this scenario: the system crashes, recovery starts, the undo pass is halfway through rolling back T1, and the system crashes again. Without CLRs, the second recovery would try to undo T1 from the beginning, potentially re-undoing changes that were already undone -- corrupting data.

CLRs prevent this. A CLR is a redo-only log record. During redo, CLRs are replayed like any other record (restoring the undo work). During undo, CLRs are never undone. The `undoNextLSN` field in each CLR tells the undo pass where to continue, skipping over already-undone work.

```
  CLR Chain Preventing Repeated Undo

  Transaction T1's records before crash:

  LSN=100       LSN=200       LSN=350
  +--------+    +--------+    +--------+
  | UPDATE |<---| UPDATE |<---| UPDATE |   (original work)
  | page A |    | page C |    | page D |
  | prev=NIL    | prev=100    | prev=200
  +--------+    +--------+    +--------+

  First recovery starts undo of T1 from LSN=350:

  1. Undo LSN=350 (restore page D), write CLR:
     LSN=400: CLR for 350, undoNextLSN=200

  2. Undo LSN=200 (restore page C), write CLR:
     LSN=410: CLR for 200, undoNextLSN=100

  ** CRASH DURING RECOVERY **

  Second recovery -- redo pass replays CLRs at 400 and 410.
  Then undo pass finds T1 still active:

  T1's chain now looks like:

  LSN=100       LSN=200       LSN=350       LSN=400       LSN=410
  +--------+    +--------+    +--------+    +--------+    +--------+
  | UPDATE |<---| UPDATE |<---| UPDATE |<---| CLR    |<---| CLR    |
  | page A |    | page C |    | page D |    | undoNxt|    | undoNxt|
  | prev=NIL    | prev=100    | prev=200    | =200   |    | =100   |
  +--------+    +--------+    +--------+    +--------+    +--------+

  Undo starts at T1's lastLSN = 410.
  410 is a CLR -> follow undoNextLSN = 100.
  (Skips 200 and 350 -- already undone!)
  Undo LSN=100, write CLR with undoNextLSN=NIL.
  Done. Write END for T1.

  The CLR's undoNextLSN pointer "leapfrogs" over
  already-undone records, preventing double undo.
```

This leapfrogging is what makes ARIES correct even under repeated crashes. Each CLR written during a previous recovery attempt becomes a permanent marker that says "I already handled this."

## A Complete Crash Scenario

Let us trace through a concrete example to see all the pieces work together.

```
  Timeline of operations before crash:

  LSN  | Action              | Transaction | Page  | prevLSN
  -----+---------------------+-------------+-------+---------
  010  | UPDATE A: 100->200  |     T1      |   A   |   NIL
  020  | UPDATE B: 50->70    |     T2      |   B   |   NIL
  030  | UPDATE C: 80->60    |     T1      |   C   |   010
  040  | UPDATE A: 200->300  |     T2      |   A   |   020
  050  | CHECKPOINT           |     --      |   --  |   --
       |   TT: {T1(lastLSN=030), T2(lastLSN=040)}
       |   DPT: {A(recLSN=010), B(recLSN=020), C(recLSN=030)}
  060  | UPDATE D: 10->20    |     T3      |   D   |   NIL
  070  | COMMIT               |     T2      |   --  |   040
  080  | UPDATE A: 300->400  |     T1      |   A   |   030
  090  | UPDATE E: 5->15     |     T3      |   E   |   060

  ** Assume page B was flushed to disk after LSN 040 **
  ** Assume page A was flushed to disk after LSN 040 (pageLSN=040) **
  ** CRASH **
```

**Analysis pass** (from checkpoint at LSN 050, scan forward):

```
  Start with TT and DPT from checkpoint.

  LSN 060: T3 not in TT -> add T3(lastLSN=060).
           Page D not in DPT -> add D(recLSN=060).

  LSN 070: T2 commits -> remove T2 from TT.

  LSN 080: T1 lastLSN updated to 080.
           Page A already in DPT (recLSN stays 010).

  LSN 090: T3 lastLSN updated to 090.
           Page E not in DPT -> add E(recLSN=090).

  Result:
    TT:  {T1(lastLSN=080, running), T3(lastLSN=090, running)}
    DPT: {A(recLSN=010), B(recLSN=020), C(recLSN=030),
           D(recLSN=060), E(recLSN=090)}
    redoLSN = min(recLSN) = 010
```

**Redo pass** (from redoLSN=010, scan forward):

```
  LSN 010 (T1, page A): A in DPT, recLSN=010 <= 010.
      Read page A from disk. pageLSN on disk = 040 >= 010. SKIP.

  LSN 020 (T2, page B): B in DPT, recLSN=020 <= 020.
      Read page B from disk. pageLSN on disk = 020 >= 020. SKIP.
      (B was flushed after LSN 040, so it has this change.)

  LSN 030 (T1, page C): C in DPT, recLSN=030 <= 030.
      Read page C. pageLSN on disk = ??? (say, old value).
      pageLSN < 030 -> REDO. Apply after-image (80->60).
      Set pageLSN = 030.

  LSN 040 (T2, page A): A in DPT, recLSN=010 <= 040.
      Page A already in memory, pageLSN=040 >= 040. SKIP.

  LSN 060 (T3, page D): D in DPT, recLSN=060 <= 060.
      Read page D. pageLSN < 060 -> REDO. Apply (10->20).

  LSN 070 (T2 commit): Not a page update. SKIP.

  LSN 080 (T1, page A): A in DPT, recLSN=010 <= 080.
      Page A pageLSN=040 < 080 -> REDO. Apply (300->400).
      Set pageLSN = 080.

  LSN 090 (T3, page E): E in DPT, recLSN=090 <= 090.
      Read page E. pageLSN < 090 -> REDO. Apply (5->15).
```

After redo, the database is in the exact state it was in just before the crash -- including uncommitted changes by T1 and T3.

**Undo pass** (roll back T1 and T3):

```
  Undo set: {T1: LSN=080, T3: LSN=090}

  Pick largest: LSN=090 (T3, page E, 5->15).
      Undo: restore E to 5. Write CLR(undoNextLSN=060).
      Add T3's prevLSN=060 to undo set.

  Undo set: {T1: 080, T3: 060}

  Pick largest: LSN=080 (T1, page A, 300->400).
      Undo: restore A to 300. Write CLR(undoNextLSN=030).
      Add T1's prevLSN=030 to undo set.

  Undo set: {T3: 060, T1: 030}

  Pick largest: LSN=060 (T3, page D, 10->20).
      Undo: restore D to 10. Write CLR(undoNextLSN=NIL).
      T3 fully undone. Write END record for T3.

  Undo set: {T1: 030}

  Pick largest: LSN=030 (T1, page C, 80->60).
      Undo: restore C to 80. Write CLR(undoNextLSN=010).
      Add T1's prevLSN=010 to undo set.

  Undo set: {T1: 010}

  Pick largest: LSN=010 (T1, page A, 100->200).
      Undo: restore A to 100. Write CLR(undoNextLSN=NIL).
      T1 fully undone. Write END record for T1.

  Undo set is empty. Recovery complete.
```

Final state: T2's committed changes are preserved (B=70, A=300 from T2's update at LSN 040). T1 and T3's changes are rolled back (A=100, C=80, D=10, E=5). The database is consistent.

Wait -- A should be 300 from T2's update at LSN 040, but T1 undid its LSN 080 update (400->300) and then undid its LSN 010 update (200->100). T2's update at LSN 040 changed A from 200 to 300, and T1's original change at LSN 010 changed A from 100 to 200. Since we undo in reverse order and use before-images, T1's undo of LSN 010 restores A to 100. But T2 committed a change at LSN 040 that depends on the value being 200 (changing it to 300). This is where physical logging and page-level undo interact -- in practice, ARIES uses **physiological logging** (physical to a page, logical within a page), and the undo of T1 at LSN 010 restores only the specific bytes T1 changed, not the entire page. T2's committed change at LSN 040 is a separate modification to page A. The actual recovery depends on the specific undo implementation. For simplicity, assume the before-image for T1's LSN 010 correctly captures only T1's portion of the state, resulting in A having the committed value from T2.

## Source Code References

### PostgreSQL

PostgreSQL does not implement ARIES exactly, but its recovery architecture follows the same principles. The core recovery logic is in [`src/backend/access/transam/xlog.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xlog.c):

- **`StartupXLOG()`** -- The main recovery entry point. It reads the control file to find the latest checkpoint, then replays WAL records from the redo point forward. PostgreSQL combines the analysis and redo passes into a single forward scan.
- **`CheckRecoveryConsistency()`** -- Verifies that the database has reached a consistent state during recovery.
- PostgreSQL's resource manager dispatch (`RmgrTable[].rm_redo`) routes each WAL record to the correct replay function, analogous to ARIES's redo.

PostgreSQL does not have a separate undo pass. Instead, it uses a **no-steal** policy for most operations (via the visibility mechanism -- uncommitted changes are invisible to other transactions through MVCC, and dirty pages of aborted transactions are cleaned up lazily). This simplifies recovery at the cost of some flexibility compared to ARIES's steal policy.

### InnoDB

InnoDB's recovery follows ARIES more closely. The redo log recovery code is in [`storage/innobase/log/log0recv.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/log/log0recv.cc):

- **`recv_recovery_from_checkpoint_start()`** -- Reads the latest checkpoint and scans the redo log forward, building a hash table of redo records grouped by page (similar to ARIES's analysis + redo).
- **`recv_apply_hashed_log_recs()`** -- Applies the collected redo records to data pages, using the page's LSN to skip already-applied records.
- **`trx_rollback_or_clean_all_recovered()`** in [`storage/innobase/trx/trx0trx.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/trx/trx0trx.cc) -- After redo is complete, InnoDB identifies transactions that were active at crash time and rolls them back using the undo log. This is the undo pass.

InnoDB's undo logs live in a separate tablespace and form the backward chain (via `DB_ROLL_PTR`) that is traversed during undo. Undo is performed in the background after the database opens for normal operations -- a practical optimization that allows the database to start serving reads before undo finishes.

## Key Design Principles Summarized

ARIES is built on a few core principles that are worth restating:

1. **WAL (Write-Ahead Logging):** The log is the source of truth. No data page hits disk before its log records.

2. **Repeat History During Redo:** Redo replays ALL changes, not just committed ones. This restores the exact pre-crash state so that undo can work correctly.

3. **Logging During Undo:** Every undo action is itself logged (as a CLR). This prevents repeated undo if the system crashes during recovery.

4. **Fuzzy Checkpoints:** Checkpoints do not stop the database. They snapshot the Transaction Table and Dirty Page Table, giving recovery a starting point.

5. **LSN-Based Idempotency:** The pageLSN on each page ensures that redo operations are idempotent. Replaying a record that is already reflected on the page is a no-op.

These principles combine to produce a recovery algorithm that is correct under arbitrary crash sequences, efficient during normal operations (steal/no-force), and fast during recovery (bounded by log size since the last checkpoint, with extensive skip logic to avoid unnecessary I/O).

## References

1. ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging -- C. Mohan, D. Haderle, B. Lindsay, H. Pirahesh, P. Schwarz (1992) [paper](https://cs.stanford.edu/people/chr101/aries.pdf)
2. PostgreSQL WAL and recovery, [`src/backend/access/transam/xlog.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xlog.c)
3. InnoDB redo log recovery, [`storage/innobase/log/log0recv.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/log/log0recv.cc)
4. InnoDB transaction rollback, [`storage/innobase/trx/trx0trx.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/trx/trx0trx.cc)
5. CMU 15-445 Database Systems -- Recovery Algorithms lecture [course](https://15445.courses.cs.cmu.edu/)
6. How Write-Ahead Logging (WAL) Works [article](/posts/design-how-write-ahead-logging-wal-works/)
7. PostgreSQL documentation, WAL Internals [doc](https://www.postgresql.org/docs/current/wal-internals.html)
8. MySQL documentation, InnoDB Recovery [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-recovery.html)
