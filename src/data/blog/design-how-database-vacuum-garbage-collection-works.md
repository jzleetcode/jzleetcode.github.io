---
author: JZ
pubDatetime: 2026-09-17T07:00:00Z
modDatetime: 2026-09-17T07:00:00Z
title: System Design - How Database Vacuum and Garbage Collection Works
tags:
  - design-system
  - design-database
description:
  "How PostgreSQL's VACUUM and garbage collection works: why MVCC creates dead tuples, the lazy vacuum and full vacuum algorithms, visibility maps, freeze maps, transaction ID wraparound, and autovacuum tuning — with source code walkthrough."
---

## Table of contents

## Context

Databases that use **MVCC** (Multi-Version Concurrency Control) never update a row in place. Instead, they create a new version of the row and mark the old version as "dead." This is what lets readers see a consistent snapshot without blocking writers — the old version sticks around until every transaction that might need it has finished.

But dead rows pile up. If nobody cleans them, the table grows without bound, queries slow down because they skip over invisible garbage, and indexes bloat with pointers to rows that will never be read again. Every MVCC database needs a garbage collector. PostgreSQL calls it **VACUUM**.

```
  Timeline of a single row (heap tuple)

  tx 100: INSERT (xmin=100)
     |
     |  Tuple version 1:  xmin=100, xmax=∞  (visible to all)
     v
  tx 200: UPDATE  (creates version 2, marks version 1 dead)
     |
     |  Tuple version 1:  xmin=100, xmax=200  (dead after tx 200 commits)
     |  Tuple version 2:  xmin=200, xmax=∞    (live)
     v
  tx 300: DELETE  (marks version 2 dead)
     |
     |  Tuple version 1:  xmin=100, xmax=200  (dead)
     |  Tuple version 2:  xmin=200, xmax=300  (dead)
     |
     v
  VACUUM: removes both dead tuples, reclaims space
```

This article walks through PostgreSQL's approach because it is the most thoroughly documented MVCC garbage collector in any open-source database. The core ideas — identifying dead versions, reclaiming space, preventing ID exhaustion — apply to TiDB's GC, MySQL's purge thread, and CockroachDB's GC TTL as well.

## How Dead Tuples Accumulate

Every row in a PostgreSQL table is stored as a **heap tuple** on an 8 KB **page**. Each tuple carries two hidden columns:

| Column | Meaning |
|--------|---------|
| `xmin` | Transaction ID that created this tuple |
| `xmax` | Transaction ID that deleted or updated this tuple (0 if still live) |

When you run `UPDATE users SET name = 'Alice' WHERE id = 1`, PostgreSQL does not modify the existing tuple. It:

1. Sets `xmax` on the old tuple to the current transaction ID.
2. Writes a brand-new tuple with the updated data and `xmin` = current transaction ID.
3. Updates every index that covers the changed columns to point to the new tuple (unless HOT — Heap-Only Tuple — optimization applies).

The old tuple is now **dead** to any transaction that started after the update committed. But it might still be visible to a long-running transaction that started before the update. PostgreSQL tracks the oldest transaction still running — called `OldestXmin` — and a dead tuple is truly reclaimable only when its `xmax` is older than `OldestXmin`.

```
  Visibility check for a tuple with xmin=100, xmax=200

  Transaction 150 (snapshot includes tx < 150):
    xmin=100 < 150  → tuple was created before my snapshot  ✓
    xmax=200 > 150  → tuple was NOT deleted before my snapshot  ✓
    → I can see this tuple

  Transaction 250 (snapshot includes tx < 250):
    xmin=100 < 250  → tuple was created before my snapshot  ✓
    xmax=200 < 250  → tuple WAS deleted before my snapshot  ✗
    → I cannot see this tuple  (it's dead to me)

  VACUUM checks:
    OldestXmin = 250  (no transaction older than 250 is running)
    xmax=200 < 250   → safe to remove this tuple
```

## Lazy VACUUM: The Normal Path

When you run `VACUUM mytable` (or autovacuum triggers it), PostgreSQL performs a **lazy vacuum** — also called a "standard" or "non-full" vacuum. It works in three passes.

### Pass 1: Scan the Heap for Dead Tuples

VACUUM reads every page of the table sequentially, checking each tuple's `xmin` and `xmax` against `OldestXmin`. Dead tuple locations (block number + offset) are collected into a **dead tuple array** in memory, limited by `maintenance_work_mem` (default 64 MB).

From [`src/backend/access/heap/vacuumlazy.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/vacuumlazy.c):

```c
static void
lazy_scan_heap(LVRelState *vacrel)
{
    BlockNumber nblocks = vacrel->rel_pages;

    for (BlockNumber blkno = 0; blkno < nblocks; blkno++)
    {
        /* Skip pages that are all-visible (optimization) */
        if (VM_ALL_VISIBLE(vacrel->rel, blkno))
            continue;

        buf = ReadBufferExtended(vacrel->rel, MAIN_FORKNUM, blkno, ...);
        /* ... lock page, examine each tuple ... */

        for (each tuple on the page)
        {
            if (heap_tuple_is_dead(tuple, OldestXmin))
            {
                /* Record this dead tuple's location */
                dead_items_add(vacrel, blkno, offnum);
            }
        }

        /* If all remaining tuples are visible to everyone,
           mark this page in the visibility map */
        if (all_visible)
            visibilitymap_set(vacrel->rel, blkno, ...);
    }
}
```

### Pass 2: Remove Index Entries Pointing to Dead Tuples

For each index on the table, VACUUM scans the entire index and removes entries that point to any tuple in the dead tuple array. This is the most expensive part of vacuum for heavily-indexed tables.

```
  Index cleanup (B-tree example)

  Before VACUUM:
  Index leaf page:
  ┌──────────────────────────────────────────────┐
  │  key=Alice → (blk=5, off=2)   ← dead tuple  │
  │  key=Bob   → (blk=7, off=1)   ← live         │
  │  key=Carol → (blk=5, off=4)   ← dead tuple  │
  │  key=Dave  → (blk=9, off=3)   ← live         │
  └──────────────────────────────────────────────┘

  After VACUUM:
  Index leaf page:
  ┌──────────────────────────────────────────────┐
  │  key=Bob   → (blk=7, off=1)   ← live         │
  │  key=Dave  → (blk=9, off=3)   ← live         │
  └──────────────────────────────────────────────┘
```

### Pass 3: Reclaim Heap Space

VACUUM revisits the heap pages that contained dead tuples and marks those tuple slots as free in the page's **line pointer array**. The space is now available for future `INSERT`s or `UPDATE`s (via the **Free Space Map**, FSM). Importantly, lazy VACUUM does *not* return disk space to the operating system — it only makes space reusable within the table file.

```
  Heap page before and after lazy VACUUM

  Before:                              After:
  ┌─────────────────────┐             ┌─────────────────────┐
  │ Page Header          │             │ Page Header          │
  ├─────────────────────┤             ├─────────────────────┤
  │ lp[1] → tuple (live) │             │ lp[1] → tuple (live) │
  │ lp[2] → tuple (DEAD) │             │ lp[2] → UNUSED        │
  │ lp[3] → tuple (live) │             │ lp[3] → tuple (live) │
  │ lp[4] → tuple (DEAD) │             │ lp[4] → UNUSED        │
  ├─────────────────────┤             ├─────────────────────┤
  │ Free space: 200 B    │             │ Free space: 600 B    │
  ├─────────────────────┤             ├─────────────────────┤
  │ Tuple data            │             │ Tuple data            │
  └─────────────────────┘             └─────────────────────┘
```

## VACUUM FULL: The Heavy-Duty Option

When a table has so many dead tuples that lazy VACUUM cannot reclaim enough space (the table file is mostly empty pages), you can run `VACUUM FULL`. This rewrites the entire table into a new file, copying only the live tuples:

1. Acquires an **AccessExclusiveLock** on the table (blocks all reads and writes).
2. Creates a new heap file.
3. Copies every live tuple to the new file, compactly.
4. Rebuilds all indexes from scratch.
5. Swaps the old file for the new one and deletes the old file.

```
  VACUUM FULL: table rewrite

  Old table file (fragmented):      New table file (compact):
  ┌────────────────────────┐        ┌────────────────────────┐
  │ Page 0: [live][dead]   │        │ Page 0: [live][live]   │
  │ Page 1: [dead][dead]   │   →    │ Page 1: [live][live]   │
  │ Page 2: [live][dead]   │        │         (done, smaller)│
  │ Page 3: [dead][live]   │        └────────────────────────┘
  └────────────────────────┘
  4 pages, ~25% utilization          2 pages, ~100% utilization
```

The downside is severe: the exclusive lock blocks the entire table for the duration, which can be minutes or hours for large tables. In production, `pg_repack` is often preferred because it can do the same compaction without holding a long exclusive lock.

## The Visibility Map

Scanning every page on every VACUUM run is wasteful. Most pages in a stable table haven't changed since the last vacuum. PostgreSQL tracks this with the **Visibility Map** (VM) — a bitmap with two bits per heap page:

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `all_visible` | Every tuple on this page is visible to all current and future transactions |
| 1 | `all_frozen` | Every tuple on this page is frozen (see next section) |

```
  Visibility Map (one bit per page, simplified)

  Heap pages:     [ 0 ][ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ]
  VM all_visible:   1    1    0    1    0    1    1    1

  VACUUM skips pages 0, 1, 3, 5, 6, 7  (all_visible = 1)
  VACUUM only scans pages 2 and 4       (all_visible = 0)
```

When any tuple on a page is modified (INSERT, UPDATE, DELETE), PostgreSQL clears that page's `all_visible` bit. VACUUM sets it back to 1 after confirming every remaining tuple is visible to all.

This is also what makes **index-only scans** possible. If a query only needs columns that exist in the index, PostgreSQL can skip fetching the heap page entirely — *but only if the visibility map says the page is all-visible*. Otherwise, it must check the heap to confirm visibility.

From [`src/backend/access/heap/visibilitymap.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/visibilitymap.c):

```c
void
visibilitymap_set(Relation rel, BlockNumber heapBlk, ...)
{
    /* Calculate which VM byte and bit correspond to this heap page */
    BlockNumber mapBlock = HEAPBLK_TO_MAPBLOCK(heapBlk);
    uint32      mapByte  = HEAPBLK_TO_MAPBYTE(heapBlk);
    uint8       mapOffset = HEAPBLK_TO_OFFSET(heapBlk);

    /* Set the all_visible (and optionally all_frozen) bits */
    map[mapByte] |= (flags << mapOffset);
}
```

## Transaction ID Wraparound: The Ticking Clock

PostgreSQL transaction IDs are 32-bit unsigned integers. That gives roughly 4.2 billion unique IDs. At a rate of 1,000 transactions per second, you exhaust the space in about 136 years — but busy databases running millions of transactions per hour can approach the limit in weeks.

PostgreSQL uses **modular arithmetic** to compare transaction IDs: a transaction ID is "in the past" if it is within 2 billion IDs behind the current one, and "in the future" if it is within 2 billion IDs ahead. This means at any point, half the 4-billion ID space represents the past and half represents the future.

```
  Transaction ID number line (circular, 32-bit)

           2^31 IDs ago                    current xid
                |                              |
  ...[past]-----+-----[past]---[past]---[NOW]--+--[future]...
                                                |
                                           2^31 IDs ahead

  If we don't freeze old tuples, eventually "past" wraps around
  and becomes "future" — making committed data invisible!

  ┌─────────────────────────────────────────────┐
  │  xid 100 was committed long ago.            │
  │  Current xid = 2,147,483,748 (100 + 2^31)  │
  │  Now xid 100 is exactly at the boundary.    │
  │  One more xid and 100 appears to be in the  │
  │  FUTURE — its data vanishes from queries!   │
  └─────────────────────────────────────────────┘
```

The solution is **freezing**. VACUUM replaces old `xmin` values with a special `FrozenTransactionId` (value 2), which is defined to be visible to all transactions regardless of wraparound:

```c
/* From src/include/access/transam.h */
#define InvalidTransactionId        ((TransactionId) 0)
#define BootstrapTransactionId      ((TransactionId) 1)
#define FrozenTransactionId         ((TransactionId) 2)
```

A tuple is frozen when its `xmin` is older than `vacuum_freeze_min_age` transactions ago (default 50 million). The aggressive freeze threshold, `vacuum_freeze_table_age` (default 150 million), triggers a full-table scan that freezes everything old enough, ignoring the visibility map.

```
  Freezing timeline

  vacuum_freeze_min_age = 50M
  vacuum_freeze_table_age = 150M
  autovacuum_freeze_max_age = 200M

  ──────────────────────────────────────────────────► xid
  │                                              │
  │  0          50M        150M       200M       │
  │  ├──────────┼──────────┼──────────┤          │
  │  │  frozen  │ eligible │ triggers │ DANGER   │
  │  │  zone    │ to freeze│ aggr.    │ forced   │
  │  │          │ (normal  │ freeze   │ anti-    │
  │  │          │  vacuum) │ scan     │ wraparound│
  │  │          │          │          │ vacuum   │
```

If a table is not vacuumed before its oldest unfrozen `xmin` reaches `autovacuum_freeze_max_age` (default 200 million), PostgreSQL forces an **anti-wraparound autovacuum** that cannot be cancelled. If even *that* fails and the database approaches 2 billion transactions from the oldest unfrozen xid, PostgreSQL **shuts down** and refuses to start new transactions, printing:

```
WARNING: database "mydb" must be vacuumed within 10000000 transactions
HINT: To avoid a database shutdown, execute a database-wide VACUUM.
```

## Autovacuum: The Background Worker

Nobody wants to run VACUUM by hand. PostgreSQL's **autovacuum** daemon spawns worker processes that continuously vacuum tables that need it. The decision is based on a simple threshold:

```
  Trigger VACUUM when:
    dead_tuples > autovacuum_vacuum_threshold
                  + autovacuum_vacuum_scale_factor * reltuples

  Defaults:
    threshold = 50 rows
    scale_factor = 0.20 (20%)

  Example: a table with 10,000 rows triggers vacuum after
    50 + 0.20 * 10,000 = 2,050 dead tuples accumulate
```

The `pg_stat_user_tables` view shows the state:

```sql
SELECT relname,
       n_live_tup,
       n_dead_tup,
       last_vacuum,
       last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'users';

  relname | n_live_tup | n_dead_tup | last_vacuum |    last_autovacuum
 ---------+------------+------------+-------------+------------------------
  users   |     10000  |       2100 | 2026-09-15  | 2026-09-16 03:14:07
```

Autovacuum workers share a cost-based delay system (`autovacuum_vacuum_cost_delay` and `autovacuum_vacuum_cost_limit`) that throttles I/O to avoid overwhelming the disk during peak traffic.

## How Other Databases Handle GC

The core problem — cleaning up old MVCC versions — appears in every MVCC database, but the mechanism differs:

```
  ┌──────────────┬──────────────────────────────────────────────┐
  │  Database    │  GC Mechanism                                │
  ├──────────────┼──────────────────────────────────────────────┤
  │  PostgreSQL  │  VACUUM (separate process, heap + index)     │
  │  MySQL/InnoDB│  Purge thread (undo log cleanup, in-place)   │
  │  TiDB        │  GC worker (resolves locks, deletes old      │
  │              │  MVCC versions from RocksDB via compaction)  │
  │  CockroachDB │  GC TTL zone configs + MVCC GC queue         │
  │  Oracle      │  Undo tablespace automatic management        │
  └──────────────┴──────────────────────────────────────────────┘
```

**MySQL/InnoDB** stores old versions in a separate **undo log** rather than in the main table pages. The purge thread walks the undo log and removes entries that no active transaction needs. This is fundamentally different from PostgreSQL: the main table always has the latest version, so there are no "dead tuples" in the heap — only undo log segments to clean up.

**TiDB** runs a GC worker on the TiDB server that calculates a **safe point** (similar to PostgreSQL's `OldestXmin`). It resolves any lingering transaction locks older than the safe point, then deletes MVCC versions older than the safe point. Since TiDB stores data in RocksDB (an LSM-tree), the actual space reclamation happens during RocksDB's compaction — the GC worker only marks versions as deletable by writing tombstones.

## Practical Lessons

1. **Long-running transactions are the enemy.** A single idle-in-transaction session prevents VACUUM from reclaiming any tuples created after that transaction started. Monitor `pg_stat_activity` for old `xact_start` values.

2. **Watch table bloat, not just dead tuples.** After a bulk UPDATE, lazy VACUUM reclaims tuple slots but the table file stays the same size. Use `pgstattuple` or `pg_relation_size` to track actual bloat.

3. **Tune autovacuum for write-heavy tables.** The defaults (20% scale factor) mean a 100-million-row table won't vacuum until 20 million rows die. Set per-table overrides:
   ```sql
   ALTER TABLE events SET (
     autovacuum_vacuum_scale_factor = 0.01,
     autovacuum_vacuum_threshold = 1000
   );
   ```

4. **Never disable autovacuum.** Transaction ID wraparound will eventually force a shutdown. The only safe approach is to let autovacuum run and tune its aggressiveness.

5. **Index bloat is often worse than heap bloat.** Each dead tuple requires a full index scan to clean up. Tables with many indexes pay a multiplied cost. Consider `REINDEX CONCURRENTLY` for badly bloated indexes.

## References

1. [PostgreSQL Documentation: Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
2. [PostgreSQL Source: vacuumlazy.c](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/vacuumlazy.c)
3. [PostgreSQL Source: visibilitymap.c](https://github.com/postgres/postgres/blob/master/src/backend/access/heap/visibilitymap.c)
4. [PostgreSQL Source: transam.h](https://github.com/postgres/postgres/blob/master/src/include/access/transam.h)
5. [Hironobu Suzuki: The Internals of PostgreSQL — Chapter 6: VACUUM Processing](https://www.interdb.jp/pg/pgsql06.html)
6. [Cybertec: PostgreSQL VACUUM and Autovacuum Demystified](https://www.cybertec-postgresql.com/en/vacuum-autovacuum-demystified/)
7. [TiDB Documentation: GC Overview](https://docs.pingcap.com/tidb/stable/garbage-collection-overview)
