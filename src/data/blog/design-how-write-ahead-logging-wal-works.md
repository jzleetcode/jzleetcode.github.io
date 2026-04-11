---
author: JZ
pubDatetime: 2026-04-11T06:23:00Z
modDatetime: 2026-04-11T06:23:00Z
title: System Design - How Write-Ahead Logging (WAL) Works
tags:
  - design-system
  - design-database
description:
  "How Write-Ahead Logging (WAL) works: the core protocol behind database durability and crash recovery. Covers the WAL principle, record structure, buffer management, checkpoints, crash recovery, and a source code walkthrough from PostgreSQL."
---

## Table of contents

## Context

Imagine you are running a database. A client sends `UPDATE accounts SET balance = 500 WHERE id = 42`. The database modifies the page in memory. A millisecond later, the power goes out. When the machine comes back up, is the update lost? Was it half-written to disk, leaving the page corrupted?

Every database that promises **durability** (the "D" in ACID) must answer this question. The answer, used by virtually every modern database — PostgreSQL, MySQL/InnoDB, SQLite, Oracle, SQL Server, TiDB's TiKV, and many more — is **Write-Ahead Logging (WAL)**.

The idea is deceptively simple:

> **Before modifying any data page on disk, first write a description of the change to a sequential log file.**

If the system crashes, the database replays the log to reconstruct any changes that were lost. If the log entry was never written, the change is treated as if it never happened — a clean rollback. If the log entry was fully written but the data page was not updated, the database replays the log entry to bring the page up to date — a clean redo.

```
                         The WAL Principle

   Client                    Database
     |                          |
     |   UPDATE balance=500     |
     |------------------------->|
     |                          |
     |                  1. Write change description
     |                     to WAL on disk (sequential)
     |                          |
     |                  2. Modify data page
     |                     in memory (buffer pool)
     |                          |
     |                  3. Acknowledge to client
     |                          |
     |        OK                |
     |<-------------------------|
     |                          |
     |                  4. Later: flush dirty page
     |                     to disk (background)

   Rule: step 1 MUST complete before step 4.
   If crash happens after 1 but before 4,
   replay the WAL to recover.
```

This article walks through **how WAL works** in detail, using **PostgreSQL** as the reference implementation since it is the most widely deployed open-source relational database with a well-documented WAL design.

## Why Not Just Write Data Pages Directly?

Before diving into WAL, it helps to understand why databases do not simply write modified data pages to disk immediately. There are two fundamental problems:

**Problem 1: Random I/O is slow.** A database's data pages are scattered across the disk. Writing each modified page as it changes means random writes — seeking to different positions on disk. A WAL file, by contrast, is written **sequentially** (append-only), which is dramatically faster on both spinning disks and SSDs.

**Problem 2: Torn pages.** A typical database page is 8 KB (PostgreSQL) or 16 KB (MySQL/InnoDB). If the operating system writes in 4 KB blocks, a power failure mid-write can leave half an old page and half a new page — a **torn page**. WAL records are typically much smaller than a full page, and the protocol includes checksums and atomic write techniques to detect and recover from partial writes.

```
  Problem: Torn page after crash

  Before update        During write (crash!)     After restart
  +-----------+        +-----------+             +-----------+
  | old data  |        | new data  |  <-- written| new data  |
  | old data  |        | new data  |             | new data  |
  | old data  |        |##CRASH####|             | old data  | <-- corrupt!
  | old data  |        | old data  |  <-- not yet| old data  |
  +-----------+        +-----------+             +-----------+
     8 KB page            4 KB written             torn page
```

WAL solves both problems. Writes go to the sequential log first. Data pages are flushed later in the background, and if a torn page occurs, the WAL has the complete change record to repair it.

## The WAL Record

Every change to the database is captured as a **WAL record** (also called a **log record** or **redo record**). In PostgreSQL, the record structure is defined in [`src/include/access/xlogrecord.h`](https://github.com/postgres/postgres/blob/master/src/include/access/xlogrecord.h):

```c
typedef struct XLogRecord
{
    uint32      xl_tot_len;   /* total len of entire record */
    TransactionId xl_xid;     /* xact id */
    XLogRecPtr  xl_prev;      /* ptr to previous record in log */
    uint8       xl_info;      /* flag bits, see below */
    RmgrId      xl_rmid;      /* resource manager for this record */
    /* 2 bytes of padding, initialized to zero */
    pg_crc32c   xl_crc;       /* CRC for this record */
} XLogRecord;
```

Let's break this down:

```
  WAL Record Layout
  +------------------------------------------------------------------+
  |                        XLogRecord header                         |
  +----------+--------+----------+---------+-------+-----+-----------+
  | tot_len  |  xid   |   prev   |  info   | rmid  | pad |    crc    |
  | (4 bytes)|(4 bytes)|(8 bytes) |(1 byte) |(1 b)  |(2 b)| (4 bytes) |
  +----------+--------+----------+---------+-------+-----+-----------+
  |                                                                  |
  |              Block reference headers (variable)                  |
  |  +--------------------+  +--------------------+                  |
  |  | XLogRecordBlock    |  | XLogRecordBlock    |                  |
  |  | Header             |  | Header             |  ...             |
  |  | (id, fork, length) |  | (id, fork, length) |                  |
  |  +--------------------+  +--------------------+                  |
  |                                                                  |
  |              Record data payload (variable)                      |
  |  +----------------------------------------------------------+   |
  |  | actual change data (e.g., new tuple bytes, index entry)   |   |
  |  +----------------------------------------------------------+   |
  +------------------------------------------------------------------+
```

- **`xl_tot_len`** — Total size of the entire record including headers and data. The maximum is about 1020 MB, though typical records are a few hundred bytes.
- **`xl_xid`** — The transaction ID that produced this change. During recovery, this links the record to a specific transaction.
- **`xl_prev`** — Pointer (byte offset in the WAL stream) to the previous record. This forms a backward-linked chain, useful for scanning the log in reverse.
- **`xl_info`** — Flags describing the type of operation. The upper 4 bits encode the specific operation (e.g., insert, update, delete for heap records). The lower bits carry flags like `XLR_CHECK_CONSISTENCY`.
- **`xl_rmid`** — **Resource manager** ID. PostgreSQL's WAL is generic: each subsystem (heap, B-tree index, hash index, transaction manager, etc.) registers as a "resource manager" with its own replay logic. When recovering, the system dispatches each record to the correct resource manager for replay.
- **`xl_crc`** — CRC-32C checksum of the entire record. During recovery, if the checksum does not match, the record is considered incomplete (torn write) and recovery stops at that point.

### Block Reference Headers

Most WAL records describe changes to specific **data pages** (also called blocks or buffers). Each referenced block gets an `XLogRecordBlockHeader`:

```c
typedef struct XLogRecordBlockHeader
{
    uint8       id;             /* block reference ID (0..32) */
    uint8       fork_flags;     /* which fork + flags */
    uint16      data_length;    /* length of block-specific data */
} XLogRecordBlockHeader;
```

This is followed by the **relation file locator** (which table and tablespace) and the **block number** (which 8 KB page within that file). Up to 32 block references can appear in a single WAL record (`XLR_MAX_BLOCK_ID = 32`).

### Full-Page Images (FPI)

Here is where WAL handles the torn page problem. When a page is modified for the **first time after a checkpoint** (more on checkpoints below), PostgreSQL writes a **full-page image** — a complete copy of the 8 KB page — into the WAL record. This is indicated by the `BKPBLOCK_HAS_IMAGE` flag.

```
  Full-Page Image in a WAL Record

  +---------------------------+
  | XLogRecord header         |
  +---------------------------+
  | XLogRecordBlockHeader     |
  |   flag: HAS_IMAGE         |
  +---------------------------+
  | XLogRecordBlockImageHeader|
  |   length, hole_offset     |
  +---------------------------+
  | Full 8 KB page image      |   <-- complete page snapshot
  | (possibly compressed)     |
  +---------------------------+
  | Change data payload       |
  +---------------------------+
```

Why only the first modification after a checkpoint? Because the checkpoint guarantees that all data pages up to that point are safely on disk. After the checkpoint, if a page gets modified and then a crash causes a torn write, the full-page image in the WAL contains the complete, correct page. Subsequent modifications to the same page (before the next checkpoint) do not need a full-page image because the first image already provides a valid starting point for replay.

This is a trade-off: full-page images increase WAL volume (sometimes called **write amplification**), but they provide absolute protection against torn pages.

## Writing WAL: The Insert Path

When a backend process (handling a client query) needs to write a WAL record, it follows a structured API. The key functions live in [`src/backend/access/transam/xloginsert.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xloginsert.c):

```c
/* Step 1: Begin a new WAL record */
XLogBeginInsert();

/* Step 2: Register which buffers (pages) are being modified */
XLogRegisterBuffer(0, buffer, REGBUF_STANDARD);

/* Step 3: Register the change data */
XLogRegisterData((char *) &xlrec, sizeof(xlrec));

/* Step 4: Insert the record into WAL */
XLogRecPtr lsn = XLogInsert(RM_HEAP_ID, XLOG_HEAP_INSERT);
```

The `XLogInsert` function, simplified for clarity:

```c
XLogRecPtr
XLogInsert(RmgrId rmid, uint8 info)
{
    XLogRecPtr  fpw_lsn;

    /* Assemble all registered data into a contiguous WAL record */
    XLogRecData *rdata = XLogRecordAssemble(rmid, info, &fpw_lsn, ...);

    /* Insert the assembled record into the WAL buffer */
    XLogRecPtr endPos = XLogInsertRecord(rdata, fpw_lsn, ...);

    /* Clean up insertion state */
    /* ... */

    return endPos;
}
```

The record first goes into a **WAL buffer** in shared memory — not directly to disk. The buffer is a ring of WAL pages. Multiple backends can insert records concurrently (using a lightweight lock protocol), and the buffer is flushed to disk either when it fills up or when a transaction commits.

```
  WAL Buffer (shared memory)                          WAL Files (disk)

  +------+------+------+------+------+               +-----------------+
  | page | page | page | page | page |  -- flush --> | 000000010000... |
  |  0   |  1   |  2   |  3   |  4   |               +-----------------+
  +------+------+------+------+------+               | 000000010000... |
     ^                    ^                            +-----------------+
     |                    |                            | 000000010000... |
  insert                write                          +-----------------+
  position              position                        sequential files
                                                        (16 MB each by
                                                         default)
```

### The LSN: WAL's Universal Clock

Every WAL record gets an **LSN** (Log Sequence Number) — a 64-bit byte offset into the WAL stream. The LSN is WAL's equivalent of a timestamp. It creates a global ordering of all changes in the database.

```
  LSN: byte offset in the WAL stream

  WAL stream:
  |-- record A --|-- record B --|-- record C --|-- record D --|-->
  0           120            300            412            580
  ^             ^              ^              ^
  LSN=0/0    LSN=0/78     LSN=0/12C     LSN=0/19C

  Every data page stores the LSN of the last WAL record
  that modified it. During recovery, if the page's LSN
  is already >= the record's LSN, the record is skipped
  (the change is already applied).
```

Every data page in PostgreSQL stores the LSN of the last WAL record that modified it (in the page header's `pd_lsn` field). This is how recovery knows whether a page is up-to-date: if the page's LSN is already at or past the record's LSN, the record has already been applied and can be skipped. This makes recovery **idempotent** — replaying the same record twice has no harmful effect.

## The Commit Protocol: Durability Guarantee

The critical moment for durability is **transaction commit**. WAL's golden rule:

> **A transaction is not acknowledged as committed until its commit WAL record has been flushed to durable storage.**

The sequence:

```
  Transaction Commit Sequence

  Backend                   WAL Buffer              Disk
    |                          |                      |
    | 1. XLogInsert(COMMIT)    |                      |
    |------------------------->|                      |
    |                          |                      |
    | 2. XLogFlush(commitLSN)  |                      |
    |------------------------->|                      |
    |                          | 3. write() + fsync() |
    |                          |--------------------->|
    |                          |      durable!        |
    |                          |<---------------------|
    |  4. return to client     |                      |
    |<-------------------------|                      |
    |                          |                      |
    | "COMMIT"                 |                      |
```

`XLogFlush` ensures all WAL up to the given LSN is on stable storage. It calls `write()` followed by `fsync()` (or `fdatasync()`, depending on the `wal_sync_method` setting). Only after `fsync` returns does PostgreSQL send "COMMIT" back to the client.

This is why `fsync` matters so much for database performance. Every commit must wait for the disk to confirm the write. PostgreSQL offers **group commit** optimization: if multiple transactions are committing around the same time, a single `fsync` can flush all their WAL records together, amortizing the cost of the disk sync.

### Asynchronous Commit

For workloads where some data loss is acceptable (e.g., session logs, analytics events), PostgreSQL offers **asynchronous commit** (`synchronous_commit = off`). The transaction is acknowledged before the WAL is flushed. If a crash occurs in the window between acknowledgment and the next flush (typically up to `wal_writer_delay`, default 200ms), those transactions are lost. The database remains consistent — you just lose the most recent acknowledged transactions.

## Checkpoints: Bounding Recovery Time

Without checkpoints, crash recovery would need to replay the entire WAL from the beginning of time. Checkpoints create **safe points** that limit how far back recovery needs to go.

A checkpoint does three things:

1. **Flushes all dirty data pages** from the buffer pool to disk.
2. **Writes a checkpoint WAL record** noting the current position.
3. **Updates the control file** with the checkpoint's location.

```
  Checkpoint and Recovery

  WAL stream:
  |===|===|===|===|===|===|===|===|===|===|===|===|-->
                  ^                             ^
                  |                             |
             checkpoint                     crash
             (all pages                     happens
              flushed to                    here
              disk here)

  Recovery only needs to replay from checkpoint to crash point.
  Everything before the checkpoint is guaranteed to be on disk.

  +------ already on disk ------+---- needs replay ----+
```

PostgreSQL triggers checkpoints based on two conditions:
- **Time:** Every `checkpoint_timeout` (default: 5 minutes).
- **Volume:** When `max_wal_size` (default: 1 GB) of WAL has been written since the last checkpoint.

The checkpoint process is deliberately **spread out over time** to avoid a sudden burst of I/O. The `checkpoint_completion_target` parameter (default: 0.9) tells PostgreSQL to spread the dirty page writes over 90% of the time until the next checkpoint, smoothing the I/O load.

```
  Checkpoint I/O Spreading

  I/O
  rate
   ^
   |     without spreading          with spreading (target=0.9)
   |     +--+                       +-----------------------------+
   |     |  |                       |                             |
   |     |  |                       |  steady, predictable I/O    |
   |     |  |                       |                             |
   |     |  |                       +-----------------------------+
   +-----+--+-------->         +------------------------------------>
         checkpoint                   checkpoint_timeout
         (all at once)                (spread over 90%)
```

### Inside CreateCheckPoint

The checkpoint logic lives in [`src/backend/access/transam/xlog.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xlog.c). Here is a simplified view of `CreateCheckPoint`:

```c
void CreateCheckPoint(int flags)
{
    /* 1. Record the current WAL position (redo point) */
    CheckPoint.redo = GetInsertRecPtr();

    /* 2. Flush all dirty shared buffers to disk */
    CheckPointGuts(CheckPoint.redo, flags);

    /* 3. Write the checkpoint WAL record */
    XLogInsert(RM_XLOG_ID, XLOG_CHECKPOINT_ONLINE);

    /* 4. Update pg_control with checkpoint location */
    UpdateControlFile();

    /* 5. Remove old WAL files no longer needed */
    RemoveOldXlogFiles(...);
}
```

The **redo point** (`CheckPoint.redo`) is the LSN at the start of the checkpoint. During recovery, replay begins from this point. Any WAL before the redo point is no longer needed and can be recycled.

## Crash Recovery: Replaying the Log

When PostgreSQL starts after a crash, it enters recovery mode. The entry point is `StartupXLOG()` in `xlog.c`, which coordinates the entire process:

```
  Crash Recovery Flow

  +---------------------+
  | 1. Read pg_control   |    Find the latest checkpoint location
  +----------+----------+
             |
             v
  +---------------------+
  | 2. Load checkpoint   |    Read the checkpoint record from WAL
  |    record            |    to get the redo point
  +----------+----------+
             |
             v
  +---------------------+
  | 3. Start replaying   |    Begin reading WAL records from
  |    from redo point   |    the redo point forward
  +----------+----------+
             |
             v
  +---------------------+
  | 4. For each record:  |
  |    a. Read record    |
  |    b. Check CRC      |-----> CRC invalid? STOP. End of valid WAL.
  |    c. Dispatch to    |
  |       resource mgr   |
  |    d. Resource mgr   |    Each subsystem (heap, btree, etc.)
  |       applies change |    knows how to replay its own records
  +----------+----------+
             |
             v
  +---------------------+
  | 5. End of WAL        |    All valid records replayed.
  |    reached           |    Database is consistent.
  +----------+----------+
             |
             v
  +---------------------+
  | 6. Write new         |    Mark a clean starting point
  |    checkpoint        |    for normal operations
  +---------------------+
```

A critical detail in step 4d: the resource manager checks the target page's LSN before applying the change. If the page's LSN is already >= the record's LSN, the page was already updated before the crash, so the record is skipped. This makes recovery safe even if the same WAL is replayed multiple times.

### How Long Does Recovery Take?

Recovery time is bounded by the amount of WAL between the last checkpoint and the crash. With the default settings (checkpoint every 5 minutes or 1 GB of WAL), recovery typically takes seconds to a few minutes. You can tune the trade-off:

- **More frequent checkpoints** = faster recovery, but more I/O during normal operations.
- **Less frequent checkpoints** = less background I/O, but longer recovery after a crash.

## WAL Beyond Crash Recovery

WAL was invented for crash recovery, but it turns out that a sequential, ordered log of every change is useful for much more:

### Streaming Replication

PostgreSQL ships WAL records to standby servers in real time. The standby continuously replays the WAL, maintaining an almost up-to-date copy of the primary. If the primary fails, the standby can take over.

```
  Streaming Replication

  Primary                           Standby
  +-------------+                   +-------------+
  |  Database   |                   |  Database   |
  |  (read/     |   WAL stream     |  (read-only |
  |   write)    |=================>|   replay)   |
  |             |   continuous      |             |
  +------+------+                   +------+------+
         |                                 |
    WAL files                         WAL files
    (local)                           (received)
```

### Point-in-Time Recovery (PITR)

By archiving WAL files to external storage, you can restore a database to **any point in time**. Take a base backup, then replay archived WAL up to the target timestamp. This is how most PostgreSQL backup strategies work (tools like `pg_basebackup`, pgBackRest, and Barman all rely on WAL archiving).

### Logical Replication and Change Data Capture

PostgreSQL can **decode** the WAL to extract logical changes (INSERT, UPDATE, DELETE on specific tables) using the logical decoding framework. This powers logical replication, and external tools like Debezium use it for change data capture (CDC) — streaming database changes to Kafka, data lakes, or other systems.

## WAL in Other Databases

The WAL principle is universal, though each database implements it differently:

```
  Database          WAL Name            Key Differences
  ---------------  ------------------  ---------------------------
  PostgreSQL       WAL (Write-Ahead   Resource manager dispatch,
                   Log)               full-page images after
                                      checkpoint

  MySQL/InnoDB     Redo Log            Fixed-size circular log
                                      (default 2 files, 48 MB
                                      each); separate undo log
                                      for rollback

  SQLite           WAL mode            Readers see the old pages;
                   (journal mode)     writers append to WAL;
                                      checkpoint copies WAL
                                      back to main DB file

  Oracle           Redo Log            Circular redo log groups
                                      with multiplexing;
                                      archive log for recovery

  TiKV (TiDB)     Raft Log            WAL is the Raft consensus
                                      log; replicated across
                                      nodes before acknowledging
```

The core idea is always the same: describe the change, write it sequentially, flush before acknowledging, and replay on recovery.

## Performance Considerations

### WAL Placement

Since WAL writes are sequential, they benefit enormously from dedicated storage. Placing WAL on a separate disk (or a fast NVMe SSD) from the data files avoids contention between sequential WAL writes and random data page I/O. In PostgreSQL, set `PGDATA/pg_wal` as a symlink to a separate mount point.

### wal_sync_method

PostgreSQL supports several sync methods: `fsync` (default on Linux), `fdatasync`, `open_sync`, and `open_datasync`. The choice depends on your OS and filesystem. `fdatasync` is often slightly faster because it only flushes file data, not metadata.

### wal_compression

Enabling `wal_compression` compresses full-page images in WAL records. Since FPIs can be a significant portion of WAL volume, compression can reduce WAL size by 30-60% with modest CPU cost.

### wal_buffers

The WAL buffer size (default: 1/32 of `shared_buffers`, minimum 64 KB, maximum 16 MB) controls how much WAL can accumulate in memory before requiring a flush. Larger buffers help with bursty write workloads but rarely need tuning beyond the auto-sized default.

## References

1. PostgreSQL docs, Reliability and the Write-Ahead Log [doc](https://www.postgresql.org/docs/current/wal.html)
2. PostgreSQL docs, WAL Configuration [doc](https://www.postgresql.org/docs/current/wal-configuration.html)
3. PostgreSQL docs, Continuous Archiving and PITR [doc](https://www.postgresql.org/docs/current/continuous-archiving.html)
4. PostgreSQL source, WAL record structure [`src/include/access/xlogrecord.h`](https://github.com/postgres/postgres/blob/master/src/include/access/xlogrecord.h)
5. PostgreSQL source, WAL insert path [`src/backend/access/transam/xloginsert.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xloginsert.c)
6. PostgreSQL source, WAL core and recovery [`src/backend/access/transam/xlog.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/xlog.c)
7. ARIES: A Transaction Recovery Method (Mohan et al., 1992) [paper](https://cs.stanford.edu/people/chr101/aries.pdf)
8. PostgreSQL WAL internals, PGCon talk by Heikki Linnakangas [slides](https://www.pgcon.org/2012/schedule/attachments/258_212_Internals%20Of%20PostgreSQL%20Wal.pdf)
9. InnoDB Redo Log, MySQL docs [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)
