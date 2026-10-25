---
author: JZ
pubDatetime: 2026-10-25T18:35:00Z
modDatetime: 2026-10-25T18:35:00Z
title: System Design - How Database Group Commit Amortizes fsync
tags:
  - design-system
  - design-database
description: "Follow three concurrent PostgreSQL commits through WAL positions, one shared flush, and the latency-throughput trade-off of commit_delay."
---

## Table of contents

## Three customers, one expensive trip

Imagine three checkout requests arriving at a database almost together. Each updates an order, then asks `COMMIT` for a durable receipt. The database can append the three commit records to its **write-ahead log** (WAL) quickly, but telling the storage device to make those records durable can be expensive. Does it have to issue three separate syncs?

No. A WAL is an ordered sequence. If the database has made the log durable **through** position 130, then records ending at positions 100, 120, and 130 are all covered. **Group commit** lets several transactions share a flush without letting any of them acknowledge success before their own record is durable. This post zooms in on that one moment; for the broader WAL and recovery protocol, see [How Write-Ahead Logging Works](/posts/design-how-write-ahead-logging-wal-works/).

We will use PostgreSQL 18 as a concrete example. Its commit and WAL-flush code is small enough to follow while illustrating a general idea; the scheduling details and settings here are PostgreSQL-specific.

## A log position is the receipt number

Each transaction inserts a commit record and remembers its ending **log sequence number** (LSN), a position in WAL. On the synchronous local-durability path, PostgreSQL's [commit code calls `XLogFlush(XactLastRecEnd)`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xact.c#L1474-L1515). The request is not “sync only my bytes.” It is “make WAL durable at least through my LSN.”

```text
WAL order:     ... [A COMMIT] ... [B COMMIT] ... [C COMMIT] ...
                         100            120            130   <- end LSNs

durable through  90  -> nobody can finish on local WAL durability
durable through 130  -> A, B, and C are all covered
```

Those numbers are illustrative positions, not literal byte distances. The key property is that flushing through a later position also includes earlier completed WAL insertions. It does **not** imply that the corresponding data pages have been written to their final locations: WAL lets that happen later.

## Who actually flushes?

PostgreSQL keeps track of how far WAL has already been flushed. In [`XLogFlush`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xlog.c#L2774-L2910), a caller first checks whether its LSN is already covered. Otherwise it waits for WAL insertions that must precede the flush, then tries to acquire `WALWriteLock`.

If A holds the write lock while B wants to flush, B can wait for A and **recheck the flushed position** rather than blindly doing another sync. If A flushed through B's LSN, B is finished. The backend that does acquire the lock aims to write and flush as far as safely possible, not merely to its own minimum requested LSN. [`XLogWrite`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xlog.c#L2300-L2320) handles the write/flush request and advances the shared result.

```text
time    A (leader)              B               C        durable WAL
 t0     request LSN 100         -               -          through 90
 t1     acquire WALWriteLock    request 120     request 130  through 90
 t2     choose target 130       wait            wait         through 90
 t3     write + sync to 130     wait            wait         through 130
 t4     return OK               recheck -> OK   recheck -> OK through 130
```

This is a **possible concurrent interleaving**, not a promise that every flush includes every transaction already running. A commit record that has not finished insertion cannot simply be treated as durable. Depending on timing, another backend may still need a later flush. The important win is amortization: several commits _can_ be covered by one storage synchronization while each retains its own durability boundary.

## Does the database wait deliberately?

PostgreSQL can group commits without an artificial delay when concurrent backends naturally meet at the lock. The optional [`commit_delay` setting](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-COMMIT-DELAY) makes the backend about to flush wait for more records before issuing the flush. Its default is **zero microseconds**. With a positive value, the delay is applied only when `fsync` is enabled **and** at least [`commit_siblings`](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-COMMIT-SIBLINGS) other transactions are active (default: five). An active sibling is merely a reason to _expect_ more work soon; it is not guaranteed to contribute a commit record.

The [code first waits for necessary in-flight insertions, takes the lock, optionally sleeps, then reevaluates the flush target](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xlog.c#L2820-L2906). This distinction matters: the setting is **not required** for group commit, and adding a delay does not automatically improve a lightly loaded system. It can improve throughput under enough concurrent commits, but adds latency to the flush leader. Measure before changing it.

## Two tempting but different shortcuts

- **`synchronous_commit = off`** is not group commit. PostgreSQL can acknowledge a transaction before its WAL is flushed; a crash can then lose an already acknowledged commit. Group commit, on the synchronous path, still waits until each acknowledged transaction's WAL is durable. See [asynchronous commit](https://www.postgresql.org/docs/18/wal-async-commit.html).
- **One big application transaction** is not the same thing either. It combines several changes into _one transaction_ with one atomic fate. Group commit can share an I/O operation among _independent transactions_ without merging their all-or-nothing boundaries.

Local WAL durability and **synchronous replication** are also different waits: after the local flush, PostgreSQL may [wait for a standby LSN](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xact.c#L1538-L1559) according to the replication configuration. Sharing a local WAL sync does not bypass a requested replica acknowledgment.

## When is this useful?

Think of a high-concurrency workload with many small commits. The fixed cost of a sync can dominate a tiny amount of log data; batching that cost across several commits can improve throughput. Under sparse traffic, there may be no one else to share with, so deliberately waiting can only hurt latency.

For PostgreSQL 18, compare transactions committed in [`pg_stat_database`](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-DATABASE-VIEW) with WAL `fsyncs`, `writes`, and `fsync_time` in [`pg_stat_io` where `object = 'wal'`](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-IO-VIEW), alongside application throughput and tail commit latency. WAL sync time requires `track_wal_io_timing`; counts and timing also depend on `wal_sync_method` and other WAL activity, so their ratio is **not** an exact count of commits per group. Measure the same workload before and after any tuning.

The mental model: **a transaction asks for a durable LSN; a flusher advances one shared durable frontier; everyone whose LSN lies behind that frontier can proceed.**

## References

1. [PostgreSQL 18 source: synchronous commit and WAL flush in `xact.c`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xact.c#L1474-L1559).
2. [PostgreSQL 18 source: `XLogFlush` and group-commit locking in `xlog.c`](https://github.com/postgres/postgres/blob/3d6a828938a5fa0444275d3d2f67b64ec3199eb7/src/backend/access/transam/xlog.c#L2774-L2910).
3. [PostgreSQL 18 documentation: `commit_delay` and `commit_siblings`](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-COMMIT-DELAY).
4. [PostgreSQL 18 documentation: asynchronous commit versus group commit](https://www.postgresql.org/docs/18/wal-async-commit.html).
5. [PostgreSQL 18 documentation: cumulative WAL I/O statistics](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-IO-VIEW).
