---
author: JZ
pubDatetime: 2026-04-12T10:00:00Z
modDatetime: 2026-04-12T10:00:00Z
title: System Design - How MVCC (Multi-Version Concurrency Control) Works
tags:
  - design-system
  - design-concurrency
description:
  "How MVCC works in databases: the concurrency problem it solves, snapshot isolation, PostgreSQL's tuple versioning with xmin/xmax, MySQL InnoDB's undo log and ReadView, garbage collection, and source code walkthrough."
---

## Table of contents

## Context

Imagine a library where only one person can read or write to a book at a time. Every other reader must wait in line. This is how early databases worked — they used **locks** to guarantee correctness, but locks meant readers blocked writers and writers blocked readers.

In 1981, Philip Bernstein and Nathan Goodman published [a paper](https://dl.acm.org/doi/10.1145/319566.319597) describing a better approach: instead of making everyone wait, **keep multiple versions of each row**. A reader sees a consistent snapshot of the data as it existed when their transaction started, even while writers are actively modifying it. This is **Multi-Version Concurrency Control (MVCC)**.

Today, nearly every major database uses MVCC: PostgreSQL, MySQL (InnoDB), Oracle, SQL Server (snapshot isolation), TiDB, CockroachDB, and many more. The core principle is simple:

> **Readers never block writers. Writers never block readers.**

```
            Without MVCC (lock-based)          With MVCC

  Writer ----[  LOCK row  ]------>     Writer ----[ write v2 ]------>
                  |                                    |
  Reader ----WAIT-+---[read]---->     Reader ----[ read v1 ]-------->
                                                 (sees old version)
```

Let's walk through how two real databases — PostgreSQL and MySQL InnoDB — implement this idea, and see the actual source code that makes it work.

## The Big Idea: Versions and Snapshots

MVCC has two moving parts:

1. **Versioning**: When a row is modified, the database does not overwrite the old data in place. Instead, it creates a **new version** of the row while preserving the old one.
2. **Snapshots**: When a transaction starts (or a statement executes, depending on isolation level), the database takes a **snapshot** — a record of which transactions have committed. The snapshot decides which row versions are visible.

Think of it like Google Docs revision history. Every edit creates a new revision. When you open a document at a specific point in time, you see the state as of that revision, even if someone else is editing right now.

```
  Row "Alice, balance=100"

  Time ──────────────────────────────────────────────>

  T1 (INSERT)    T2 (UPDATE to 200)    T3 (UPDATE to 300)
       |                |                     |
       v                v                     v
  +---------+     +-----------+     +------------+
  | v1      |     | v2        |     | v3         |
  | bal=100 |     | bal=200   |     | bal=300    |
  | xmin=T1 |     | xmin=T2   |     | xmin=T3   |
  +---------+     +-----------+     +------------+

  Reader at snapshot after T2 committed:
    sees v2 (bal=200), does NOT see v3
```

The key question each database must answer: **"Given my snapshot, which version of this row should I see?"** PostgreSQL and InnoDB answer this question differently.

## PostgreSQL: Tuple Versioning in the Heap

PostgreSQL takes the most direct approach: every version of a row (called a **tuple**) lives directly in the table's heap pages. Each tuple carries metadata stamps that say who created it and who deleted it.

### The Tuple Header

Every heap tuple has a header defined in [`src/include/access/htup_details.h`](https://github.com/postgres/postgres/blob/master/src/include/access/htup_details.h):

```c
typedef struct HeapTupleFields {
    TransactionId t_xmin;   /* inserting transaction ID */
    TransactionId t_xmax;   /* deleting or locking transaction ID */
    union {
        CommandId   t_cid;  /* inserting/deleting command ID */
        TransactionId t_xvac; /* old-style VACUUM FULL xact ID */
    } t_field3;
} HeapTupleFields;
```

Three fields tell the whole MVCC story:

| Field    | Meaning |
|----------|---------|
| `t_xmin` | The transaction ID that **created** this tuple (INSERT or UPDATE that produced it) |
| `t_xmax` | The transaction ID that **deleted** this tuple (DELETE or UPDATE that replaced it). Zero if the tuple is still live. |
| `t_cid`  | Command counter within the transaction, so statements within the same transaction can see each other's effects in order |

When you UPDATE a row in PostgreSQL, it does not modify the existing tuple. Instead, it:
1. Sets `t_xmax` on the **old** tuple to the current transaction ID (marking it as "deleted by me").
2. Inserts a **new** tuple with `t_xmin` set to the current transaction ID.

```
  Page in the heap file
  +-------------------------------------------------------+
  |  Tuple v1                    Tuple v2                  |
  |  +-------------------+      +-------------------+     |
  |  | t_xmin = 100      |      | t_xmin = 105      |     |
  |  | t_xmax = 105      | ---> | t_xmax = 0        |     |
  |  | data: bal=100      |      | data: bal=200      |     |
  |  +-------------------+      +-------------------+     |
  |                                                       |
  |  v1 was inserted by txn 100, deleted by txn 105       |
  |  v2 was inserted by txn 105, still live               |
  +-------------------------------------------------------+
```

Both the old and new tuple live in the heap. The old tuple is **dead** but still physically present until VACUUM cleans it up.

### The Snapshot

When a transaction takes a snapshot, PostgreSQL records which transactions are currently in progress. The snapshot struct is defined in [`src/include/utils/snapshot.h`](https://github.com/postgres/postgres/blob/master/src/include/utils/snapshot.h):

```c
typedef struct SnapshotData {
    TransactionId xmin;    /* all XIDs < xmin are visible (committed or aborted) */
    TransactionId xmax;    /* all XIDs >= xmax are invisible (not yet started) */
    TransactionId *xip;    /* array of in-progress XIDs at snapshot time */
    uint32        xcnt;    /* number of entries in xip[] */
    CommandId     curcid;  /* command ID within current transaction */
    /* ... */
} SnapshotData;
```

The snapshot divides the transaction ID space into three zones:

```
  Transaction ID number line
  ================================================================>

  committed/aborted    in-progress (may be   not yet started
  (definitely done)     in xip[])            (definitely invisible)

  <--- visible --->    <--- check xip[] --->  <--- invisible --->
                  ^                          ^
                xmin                       xmax
```

- **XIDs < xmin**: These transactions finished before the snapshot was taken. Their tuples are visible (if committed) or invisible (if aborted).
- **XIDs >= xmax**: These transactions had not started when the snapshot was taken. Their tuples are invisible.
- **XIDs between xmin and xmax**: Need to check the `xip[]` array. If the XID appears in `xip[]`, the transaction was still in-progress at snapshot time, so its tuples are invisible.

### The Visibility Check

The function `HeapTupleSatisfiesMVCC` in [`src/backend/access/heap/heapam_visibility.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/heapam_visibility.c) ties it all together. Here is the logic in simplified pseudocode:

```
HeapTupleSatisfiesMVCC(tuple, snapshot):

  // Step 1: Is the inserting transaction visible?
  if xmin is NOT committed:
      if xmin is aborted:  return INVISIBLE
      if xmin is my own transaction:
          if inserted after my current command: return INVISIBLE
          // check xmax below...
      else:
          return INVISIBLE   // inserted by an in-progress or future txn
  else:
      if xmin is in snapshot's xip[] array:
          return INVISIBLE   // inserter was not yet committed at snapshot time

  // Step 2: Has this tuple been deleted?
  if xmax is zero:
      return VISIBLE         // nobody deleted it

  if xmax is NOT committed:
      if xmax is my own transaction:
          if deleted before my current command: return INVISIBLE
          else: return VISIBLE
      else:
          return VISIBLE     // deleter hasn't committed, so deletion isn't real yet
  else:
      if xmax is in snapshot's xip[] array:
          return VISIBLE     // deleter was not yet committed at snapshot time
      else:
          return INVISIBLE   // deleter committed before snapshot, tuple is gone
```

The logic reads like a story: first, check if the row was **born** (inserted) in a way that is visible to us. Then, check if the row has **died** (been deleted) in a way that is visible to us. A tuple is visible only if its birth is visible and its death is not.

### Transaction ID Wraparound

PostgreSQL uses 32-bit transaction IDs. After about 4 billion transactions, the counter wraps around. To handle this, XID comparisons use signed arithmetic — defined in [`src/include/access/transam.h`](https://github.com/postgres/postgres/blob/master/src/include/access/transam.h):

```c
static inline bool
TransactionIdPrecedes(TransactionId id1, TransactionId id2)
{
    int32 diff = (int32)(id1 - id2);
    return (diff < 0);
}
```

By casting the difference to a signed 32-bit integer, XIDs within ~2 billion of each other compare correctly even across the wraparound boundary. This is the same trick network protocols use for sequence number comparison (RFC 1982).

PostgreSQL must run `VACUUM` before the XID space wraps completely, or it will shut down to prevent data corruption. This is the dreaded **transaction ID wraparound** problem that DBAs monitor carefully.

## MySQL InnoDB: Undo Logs and ReadView

InnoDB takes a different approach. Instead of storing every version in the main table, it keeps **only the latest version** in the clustered index (the primary B+ tree) and stores **older versions in undo logs**.

### The Undo Log Chain

Every row in an InnoDB clustered index has three hidden columns:

| Column       | Size    | Purpose |
|-------------|---------|---------|
| `DB_TRX_ID` | 6 bytes | Transaction ID that last modified this row |
| `DB_ROLL_PTR`| 7 bytes | Pointer to the undo log record (the previous version) |
| `DB_ROW_ID` | 6 bytes | Auto-generated row ID (if no primary key defined) |

When a transaction updates a row, InnoDB:
1. Copies the **old values** into an undo log record.
2. Updates the row **in place** in the clustered index.
3. Sets `DB_TRX_ID` to the current transaction ID.
4. Sets `DB_ROLL_PTR` to point to the undo log record.

The undo log record itself contains a pointer to an even older version, forming a chain:

```
  Clustered Index (B+ tree leaf page)
  +----------------------------------+
  |  Row: Alice, bal=300             |
  |  DB_TRX_ID  = 300               |
  |  DB_ROLL_PTR ----+              |
  +-------------------|-------------+
                      |
                      v
  Undo Log Segment
  +----------------------------------+
  |  undo record #2                  |
  |  old value: bal=200              |
  |  trx_id = 200                   |
  |  prev_roll_ptr ----+            |
  +---------------------|------------+
                        |
                        v
  +----------------------------------+
  |  undo record #1                  |
  |  old value: bal=100              |
  |  trx_id = 100                   |
  |  prev_roll_ptr = NULL            |
  +----------------------------------+
```

To read an old version, InnoDB walks this chain backward, applying undo records in reverse until it finds a version that is visible to the current snapshot. This reconstruction happens in [`storage/innobase/include/row0vers.h`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/include/row0vers.h) via `row_vers_build_for_consistent_read`.

### The ReadView

InnoDB's equivalent of PostgreSQL's snapshot is called a **ReadView**. It is defined in [`storage/innobase/include/read0types.h`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/include/read0types.h):

```cpp
class ReadView {
    trx_id_t m_up_limit_id;     // low watermark: trx IDs below this are visible
    trx_id_t m_low_limit_id;    // high watermark: trx IDs >= this are invisible
    trx_id_t m_creator_trx_id;  // the transaction that created this ReadView
    ids_t    m_ids;             // sorted list of active transaction IDs
};
```

The naming is a bit confusing — `m_up_limit_id` is the **lower** bound and `m_low_limit_id` is the **upper** bound. Think of it as: "up to `m_up_limit_id`, everything is visible" and "the low limit on what's invisible is `m_low_limit_id`."

The visibility function `changes_visible` is compact and elegant:

```cpp
bool changes_visible(trx_id_t id, const table_name_t &name) const {
    // Below the low watermark, or our own transaction: visible
    if (id < m_up_limit_id || id == m_creator_trx_id)
        return true;

    // Above the high watermark: invisible
    if (id >= m_low_limit_id)
        return false;

    // In between: check if the transaction was active at snapshot time
    if (m_ids.empty())
        return true;

    return !std::binary_search(m_ids.begin(), m_ids.end(), id);
}
```

```
  Transaction ID number line
  ================================================================>

   visible             check m_ids[]              invisible
  (committed)        (was it still active?)     (not yet started)
  <------------>    <--------------------->    <---------------->
               ^                              ^
         m_up_limit_id                  m_low_limit_id
```

The logic is structurally identical to PostgreSQL's snapshot check — both divide the transaction ID space into three zones and check the middle zone against a list of in-progress transactions.

### Putting It Together: A Consistent Read

Here is what happens when InnoDB processes a `SELECT` under `REPEATABLE READ` (the default):

```
  SELECT * FROM accounts WHERE id = 1;

  Step 1: Look up row in clustered index
          +---------------------------+
          | id=1, bal=300             |
          | DB_TRX_ID=300            |
          | DB_ROLL_PTR ---> undo    |
          +---------------------------+

  Step 2: Check visibility
          ReadView says: m_up_limit_id=250, m_low_limit_id=301, m_ids=[275]

          Is trx 300 visible?
            300 >= m_up_limit_id (250)?  Yes, keep checking
            300 >= m_low_limit_id (301)? No
            Is 300 in m_ids [275]?       No, so 300 IS visible

          Result: return bal=300

  But if DB_TRX_ID were 275 (in the active list):

  Step 2b: trx 275 is in m_ids, NOT visible
           Walk the undo chain...

  Step 3: Follow DB_ROLL_PTR to undo record
          +---------------------------+
          | old: bal=200, trx_id=200  |
          +---------------------------+

          Is trx 200 visible?
            200 < m_up_limit_id (250)?  Yes -> VISIBLE

          Result: return bal=200 (the old version)
```

## PostgreSQL vs InnoDB: Two Philosophies

The two approaches make different trade-offs:

```
  +---------------------+---------------------------+---------------------------+
  |                     |      PostgreSQL            |      InnoDB               |
  +---------------------+---------------------------+---------------------------+
  | Where old versions  | In the main heap table    | In separate undo log      |
  | are stored          | (same pages as live data) | segments                  |
  +---------------------+---------------------------+---------------------------+
  | UPDATE cost         | Insert a new tuple +      | Write undo record +       |
  |                     | mark old as dead          | update row in place       |
  +---------------------+---------------------------+---------------------------+
  | Read latest version | Direct (if visible)       | Direct (always latest     |
  |                     |                           | in clustered index)       |
  +---------------------+---------------------------+---------------------------+
  | Read old version    | May find it directly in   | Must walk undo chain      |
  |                     | heap (if not yet vacuumed)| and reconstruct           |
  +---------------------+---------------------------+---------------------------+
  | Cleanup mechanism   | VACUUM (background or     | Purge thread removes      |
  |                     | autovacuum daemon)        | undo records              |
  +---------------------+---------------------------+---------------------------+
  | Table bloat risk    | Yes — dead tuples occupy  | Less — undo logs are      |
  |                     | heap space until vacuumed | in separate tablespace    |
  +---------------------+---------------------------+---------------------------+
  | Index impact        | Every version needs index | Secondary indexes point   |
  |                     | entries                   | to clustered index, which |
  |                     |                           | has only one version      |
  +---------------------+---------------------------+---------------------------+
```

**PostgreSQL's advantage**: Reading old versions is fast because they are right there in the heap. No undo chain to walk. This benefits long-running analytical queries that read a snapshot from minutes ago.

**InnoDB's advantage**: The clustered index stays compact because only the latest version lives there. Updates in place avoid duplicating index entries. This benefits OLTP workloads with frequent updates on heavily indexed tables.

## Garbage Collection: Cleaning Up Old Versions

Old versions cannot live forever — they consume disk space and slow down scans. Both databases need a way to determine when an old version is no longer needed by any active transaction, and then remove it.

### PostgreSQL: VACUUM

PostgreSQL's `VACUUM` process scans heap pages and removes tuples where `t_xmax` is a committed transaction ID that is **older** than the oldest active snapshot. These dead tuples are then marked as free space that can be reused.

```
  Before VACUUM                        After VACUUM
  +-------------------+                +-------------------+
  | Tuple v1 (dead)   |                | [free space]      |
  | xmin=100 xmax=105 |                |                   |
  +-------------------+                +-------------------+
  | Tuple v2 (live)   |                | Tuple v2 (live)   |
  | xmin=105 xmax=0   |                | xmin=105 xmax=0   |
  +-------------------+                +-------------------+
```

The **autovacuum** daemon runs automatically in the background. But if it falls behind — say, during a write-heavy workload or because a long-running transaction holds back the oldest snapshot — dead tuples accumulate and the table **bloats**. This is one of the most common operational issues PostgreSQL DBAs face.

### InnoDB: Purge Threads

InnoDB's purge system runs as background threads that remove undo log records no longer needed by any active ReadView. Unlike PostgreSQL, old versions are in a separate area (the undo tablespace), so the main table does not bloat.

However, InnoDB has its own version of the problem: **history list length**. If a long-running transaction keeps an old ReadView alive, the purge threads cannot clean undo records, and the undo tablespace grows. You can monitor this with:

```sql
SHOW ENGINE INNODB STATUS;
-- Look for: "History list length"
```

## Isolation Levels and MVCC

MVCC enables different **isolation levels** by varying when and how snapshots are taken:

```
  +--------------------+-------------------------------+-------------------------------+
  | Isolation Level    | PostgreSQL                    | InnoDB                        |
  +--------------------+-------------------------------+-------------------------------+
  | READ COMMITTED     | New snapshot per STATEMENT    | New ReadView per STATEMENT    |
  |                    | (sees each statement's own    | (sees latest committed data   |
  |                    |  point-in-time view)          |  at statement start)          |
  +--------------------+-------------------------------+-------------------------------+
  | REPEATABLE READ    | Snapshot at TRANSACTION start | ReadView at TRANSACTION start |
  |                    | (same view for all reads)     | (same view for all reads)     |
  +--------------------+-------------------------------+-------------------------------+
  | SERIALIZABLE       | MVCC + predicate locks        | Implicit: REPEATABLE READ +  |
  |                    | (SSI — Serializable Snapshot  |  all SELECTs become           |
  |                    |  Isolation)                   |  SELECT ... FOR SHARE         |
  +--------------------+-------------------------------+-------------------------------+
```

At **READ COMMITTED**, every statement sees the freshest committed data. Two identical SELECTs within the same transaction may return different results (non-repeatable reads).

At **REPEATABLE READ**, the snapshot is frozen at the start of the transaction. All reads see the same consistent state, no matter how long the transaction runs.

At **SERIALIZABLE**, both databases add additional mechanisms on top of MVCC to detect anomalies. PostgreSQL implements **SSI (Serializable Snapshot Isolation)**, which tracks read/write dependencies and aborts transactions that would violate serializability. InnoDB converts all plain SELECTs into locking reads, which is simpler but more restrictive.

## A Concrete Example

Let's trace two concurrent transactions to see MVCC in action:

```
  Time    Transaction T1 (xid=100)           Transaction T2 (xid=101)
  ----    --------------------------          --------------------------
   t0     BEGIN                               BEGIN
           snapshot: xip=[]                    snapshot: xip=[100]
                                               (T1 was active when T2 started)

   t1     UPDATE accounts
           SET bal=200 WHERE id=1
           (old: bal=100, xmin=50)

           PostgreSQL:
             old tuple: xmax = 100
             new tuple: xmin = 100, bal=200

           InnoDB:
             row in-place: bal=200, trx_id=100
             undo: old bal=100, trx_id=50

   t2                                         SELECT bal FROM accounts
                                               WHERE id=1

                                              PostgreSQL:
                                                new tuple xmin=100,
                                                100 is in xip[] -> INVISIBLE
                                                old tuple xmin=50,
                                                50 < snapshot.xmin -> VISIBLE
                                                Result: bal=100

                                              InnoDB:
                                                row trx_id=100,
                                                100 is in m_ids -> NOT VISIBLE
                                                walk undo -> trx_id=50,
                                                50 < m_up_limit_id -> VISIBLE
                                                Result: bal=100

   t3     COMMIT

   t4                                         SELECT bal FROM accounts
                                               WHERE id=1

                                              REPEATABLE READ:
                                                still using old snapshot
                                                Result: bal=100 (same!)

                                              READ COMMITTED:
                                                takes new snapshot, T1 committed
                                                Result: bal=200 (sees the update)
```

Both databases produce the same results from the application's perspective, despite using different internal mechanisms.

## How MVCC Connects to TiDB

TiDB, being a distributed database, combines MVCC with a **Timestamp Oracle (TSO)** instead of local transaction IDs. Each transaction gets a globally unique timestamp from PD (see [How TiDB TSO Works](/posts/design-how-tidb-tso-works/)). The MVCC versions are stored in TiKV using key encoding:

```
  Key format:  {table_prefix}{row_key}{start_ts}

  Example versions of the same row:
    accounts_1_@ts=300  ->  bal=300   (latest)
    accounts_1_@ts=200  ->  bal=200
    accounts_1_@ts=100  ->  bal=100   (oldest)
```

TiKV uses an LSM-tree (RocksDB) as its storage engine, so multiple versions naturally coexist as separate key-value pairs sorted by timestamp. A read at `start_ts=250` seeks to the largest key `<= accounts_1_@ts=250`, which returns `bal=200`. No undo chain walking, no visibility function — just a key range seek.

This is a third MVCC strategy: **timestamp-ordered key-value pairs**, which works well when the storage engine already supports ordered keys efficiently.

## References

1. Concurrency Control in Distributed Database Systems — Philip Bernstein and Nathan Goodman (1981) [paper](https://dl.acm.org/doi/10.1145/319566.319597)
2. PostgreSQL documentation, Concurrency Control [doc](https://www.postgresql.org/docs/current/mvcc.html)
3. PostgreSQL tuple header [`src/include/access/htup_details.h`](https://github.com/postgres/postgres/blob/master/src/include/access/htup_details.h)
4. PostgreSQL snapshot struct [`src/include/utils/snapshot.h`](https://github.com/postgres/postgres/blob/master/src/include/utils/snapshot.h)
5. PostgreSQL MVCC visibility [`src/backend/access/heap/heapam_visibility.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/heapam_visibility.c)
6. PostgreSQL transaction ID comparison [`src/include/access/transam.h`](https://github.com/postgres/postgres/blob/master/src/include/access/transam.h)
7. MySQL InnoDB ReadView and `changes_visible` [`storage/innobase/include/read0types.h`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/include/read0types.h)
8. MySQL InnoDB ReadView construction [`storage/innobase/read/read0read.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/read/read0read.cc)
9. MySQL InnoDB undo log [`storage/innobase/include/trx0undo.h`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/include/trx0undo.h)
10. MySQL InnoDB row version reconstruction [`storage/innobase/include/row0vers.h`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/include/row0vers.h)
11. MySQL documentation, InnoDB Multi-Versioning [doc](https://dev.mysql.com/doc/refman/en/innodb-multi-versioning.html)
12. TiDB MVCC key encoding [doc](https://docs.pingcap.com/tidb/stable/tidb-computing#mapping-table-data-to-key-value)
