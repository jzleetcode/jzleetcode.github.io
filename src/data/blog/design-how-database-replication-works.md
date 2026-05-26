---
author: JZ
pubDatetime: 2026-05-26T09:00:00Z
modDatetime: 2026-05-26T09:00:00Z
title: System Design - How Database Replication Works
tags:
  - design-system
  - design-database
description:
  "How database replication works: physical vs logical replication, MySQL binlog and PostgreSQL WAL streaming, replication lag, semi-synchronous commit, and the CAP trade-offs in real systems."
---

## Table of contents

## Context

A single database server is a single point of failure. If the disk dies or the machine loses power, your data is gone. Even if you have backups, restoring from a backup takes time — minutes to hours of downtime where your application cannot serve requests.

**Replication** solves this by keeping copies of data on multiple machines. When the primary server writes data, those writes are propagated to one or more **replicas** (also called secondaries, standbys, or followers). If the primary fails, a replica can take over.

But replication is not just about fault tolerance. It also enables:

- **Read scaling:** distribute read queries across replicas to reduce load on the primary.
- **Geographic distribution:** place replicas closer to users in different regions.
- **Analytics isolation:** run expensive analytical queries on a replica without affecting the production primary.

The central challenge of replication is: **how do you keep replicas consistent with the primary without sacrificing too much performance?** This article walks through the mechanisms that real databases use to solve this problem.

```
                        Database Replication Overview

  +------------------+
  |    Application   |
  +--------+---------+
           |
           | writes + reads
           v
  +--------+---------+         replication stream
  |     Primary      | -----------------------------------+
  |    (leader)      |                                    |
  +------------------+                                    |
                                                          |
           +----------------------------------------------+
           |                          |
           v                          v
  +------------------+       +------------------+
  |    Replica 1     |       |    Replica 2     |
  |   (follower)     |       |   (follower)     |
  +------------------+       +------------------+
           |                          |
           v                          v
       read queries              read queries
```

## Physical vs Logical Replication

There are two fundamental approaches to propagating changes from primary to replica. They differ in **what** gets sent over the wire.

### Physical Replication (WAL Shipping)

The primary sends the raw bytes of its write-ahead log (WAL) to replicas. The replica replays these bytes to arrive at an identical on-disk state.

```
  Primary                              Replica
  +-------------------+                +-------------------+
  |  Transaction      |                |                   |
  |  modifies page 42 |                |                   |
  |  at offset 0x1A0  |                |                   |
  +--------+----------+                |                   |
           |                           |                   |
           v                           |                   |
  +-------------------+                |                   |
  |  WAL record:      |   ship bytes   |  WAL record:      |
  |  page=42          | -------------> |  page=42          |
  |  offset=0x1A0     |                |  offset=0x1A0     |
  |  old=0xFF         |                |  old=0xFF         |
  |  new=0x42         |                |  new=0x42         |
  +-------------------+                +-------------------+
           |                                    |
           v                                    v
  +-------------------+                +-------------------+
  |  Data file        |                |  Data file        |
  |  (identical)      |                |  (identical)      |
  +-------------------+                +-------------------+
```

**Advantages:**
- Simple to implement — just copy bytes.
- Exact byte-for-byte replica — useful for failover since the replica is an identical copy.
- Works for any change, including DDL, index builds, and vacuum operations.

**Disadvantages:**
- Tightly coupled to the storage engine version. A WAL record that says "write these bytes at this page offset" only makes sense if the replica has the same page layout, same data file format, same version.
- Cannot replicate across different database versions or architectures.
- Cannot selectively replicate a subset of tables.

PostgreSQL's **streaming replication** uses physical replication by default. The replica connects to the primary and continuously receives WAL bytes via the `walsender` process.

### Logical Replication (Row-Based or Statement-Based)

Instead of raw bytes, the primary sends a **logical description** of the change: which rows were inserted, updated, or deleted, and what the new values are.

```
  Primary                              Replica
  +-------------------+                +-------------------+
  |  Transaction:     |                |                   |
  |  UPDATE users     |                |                   |
  |  SET name='Bob'   |                |                   |
  |  WHERE id=7       |                |                   |
  +--------+----------+                |                   |
           |                           |                   |
           v                           |                   |
  +-------------------+   logical      +-------------------+
  |  Binlog event:    |   event        |  Apply:           |
  |  table=users      | ------------->  |  UPDATE users     |
  |  type=UPDATE      |                |  SET name='Bob'   |
  |  before: id=7,    |                |  WHERE id=7       |
  |    name='Alice'   |                |                   |
  |  after:  id=7,    |                |                   |
  |    name='Bob'     |                |                   |
  +-------------------+                +-------------------+
```

**Advantages:**
- Version-independent — the replica just needs to understand the logical schema.
- Can replicate across different database engines (e.g., MySQL to PostgreSQL via Debezium).
- Can selectively replicate specific tables or databases.
- Enables transformations on the replica side (filtering, enrichment).

**Disadvantages:**
- More complex — must handle schema differences, type mappings, conflict resolution.
- Some operations are hard to replicate logically (e.g., sequences, auto-increment across multiple writers).
- Slightly higher overhead since the primary must decode changes into a logical format.

MySQL uses logical replication via the **binlog**. PostgreSQL added logical replication in version 10 as an alternative to its physical streaming replication.

## MySQL Binary Log (Binlog) in Detail

MySQL's binlog is the backbone of its replication system. Every write that modifies data produces one or more **binlog events** that are appended to a sequential log file on the primary.

### Binlog Formats

MySQL supports three binlog formats, configured via `binlog_format`:

```
  Format        What is logged             Trade-offs
  ------------- -------------------------- ---------------------------------
  STATEMENT     The SQL statement itself   Compact, but non-deterministic
                                           functions (NOW(), RAND()) may
                                           produce different results on
                                           replica

  ROW           Before/after row images    Larger, but deterministic —
                                           replica always converges

  MIXED         Statement by default,      Compromise — uses ROW when
                ROW for non-deterministic  the statement is unsafe
                statements
```

Modern MySQL deployments almost always use **ROW-based replication** because it guarantees correctness. A statement like `DELETE FROM orders WHERE created_at < NOW() - INTERVAL 30 DAY` would delete different rows on the replica if executed a few seconds later. Row-based replication captures exactly which rows were deleted.

### The Replication Pipeline

```
  Primary                     Replica
  +------------------+        +------------------+
  |  Client thread   |        |                  |
  |  executes DML    |        |                  |
  +--------+---------+        |                  |
           |                  |                  |
           | write            |                  |
           v                  |                  |
  +------------------+        |                  |
  |  Binlog file     |        |                  |
  |  (sequential)    |        |                  |
  +--------+---------+        |                  |
           |                  |                  |
           | binlog dump      |                  |
           | thread reads     |                  |
           v                  |                  |
  +------------------+  TCP   +------------------+
  |  Dump thread     | -----> |  I/O thread      |
  |  (per replica)   |        |  receives events |
  +------------------+        +--------+---------+
                                       |
                                       | write
                                       v
                              +------------------+
                              |  Relay log       |
                              |  (local copy)    |
                              +--------+---------+
                                       |
                                       | read + apply
                                       v
                              +------------------+
                              |  SQL thread      |
                              |  (applier)       |
                              +------------------+
```

1. **Primary side:** A dedicated `binlog dump thread` (one per connected replica) reads events from the binlog file and streams them over TCP.
2. **Replica I/O thread:** Receives events and writes them to a local **relay log**. This decouples network transfer from event application.
3. **Replica SQL thread:** Reads events from the relay log and applies them to the local data. In MySQL 5.7+, this can be parallelized with **multi-threaded replication** (multiple applier workers).

### Position Tracking

The replica tracks its position in the replication stream using either:

- **File + offset:** Traditional method. The replica remembers "I've applied up to binlog file `mysql-bin.000042` at byte offset `12345`." Simple but breaks if binlog files are purged or the primary changes.
- **GTID (Global Transaction ID):** Each transaction gets a unique ID like `3E11FA47-71CA-11E1-9E33-C80AA9429562:42`. The replica tracks which GTIDs it has applied. This makes failover trivial — the new primary just resumes from where the replica left off, regardless of file names.

```
  GTID format:  server_uuid : transaction_number
                    |                  |
                    v                  v
  3E11FA47-71CA-11E1-9E33-C80AA9429562 : 42
  \___________________________________/   \/
         identifies the source         sequence within
         server uniquely               that source
```

## PostgreSQL Streaming Replication

PostgreSQL takes a different default approach: physical streaming of WAL records.

### How It Works

```
  Primary                           Standby (Replica)
  +-------------------+             +-------------------+
  |  Backend process  |             |                   |
  |  writes WAL       |             |                   |
  +--------+----------+             |                   |
           |                        |                   |
           v                        |                   |
  +-------------------+             |                   |
  |  WAL segments     |             |                   |
  |  (16 MB files)    |             |                   |
  +--------+----------+             |                   |
           |                        |                   |
           v                        |                   |
  +-------------------+   stream    +-------------------+
  |  walsender        | ----------> |  walreceiver      |
  |  process          |             |  process          |
  +-------------------+             +--------+----------+
                                             |
                                             v
                                    +-------------------+
                                    |  WAL segments     |
                                    |  (local copy)     |
                                    +--------+----------+
                                             |
                                             v
                                    +-------------------+
                                    |  startup process  |
                                    |  (WAL replay)     |
                                    +-------------------+
```

1. The primary's `walsender` process streams WAL records in real-time.
2. The standby's `walreceiver` writes incoming WAL to local segment files.
3. The `startup` process continuously replays WAL records to keep the standby's data files up to date.

The standby can serve read-only queries while replay is active — this is called a **hot standby**.

### Replication Slots

A problem arises: what if the standby falls behind? The primary might delete (recycle) old WAL segments before the standby has consumed them. **Replication slots** solve this by telling the primary: "don't recycle WAL until this standby has received it."

```sql
-- On the primary: create a slot for a standby
SELECT pg_create_physical_replication_slot('standby_1');

-- Check how far behind a slot is
SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
  AS bytes_behind
FROM pg_replication_slots;
```

The trade-off: if a standby disconnects for a long time, the primary accumulates WAL files on disk. This can fill up the disk. Monitoring replication slot lag is essential.

## The Replication Lag Problem

Replication is typically **asynchronous** by default: the primary commits the transaction, acknowledges the client, and *then* ships the change to replicas. The replica might be milliseconds to seconds behind.

```
  Timeline
  ---------------------------------------------------------------->

  Primary:  COMMIT(x=1)  ........  COMMIT(x=2)
                |                       |
                | lag                   | lag
                v                       v
  Replica:      .....  APPLY(x=1)  .........  APPLY(x=2)
                       ^                      ^
                       |                      |
                  replica sees x=1       replica sees x=2
                  (stale for a moment)
```

### What Can Go Wrong

1. **Read-your-writes inconsistency:** A user writes data, then immediately reads from a replica that hasn't applied the write yet. They see stale data — "where did my update go?"

2. **Causal ordering violation:** User A posts a comment, User B sees it on a replica, replies, but User A's replica hasn't received User B's reply yet. The conversation appears out of order.

3. **Monotonic read violation:** A user refreshes a page and gets routed to a different replica that is further behind. Data appears to "go backward in time."

### Mitigation Strategies

```
  Strategy                    How it works                    Cost
  -------------------------  ------------------------------ --------
  Read-from-primary          Route reads that must be       Primary
  after write                fresh to the primary           load

  Session stickiness         Pin a user session to one      Less
                             replica                        load
                                                            balancing

  Causal consistency         Track a "read position" per    Complexity
  tokens                     client; wait if replica is
                             behind

  Semi-synchronous           Primary waits for at least     Latency
  replication                one replica to acknowledge     on writes
```

## Synchronous vs Semi-Synchronous vs Asynchronous

The spectrum of replication durability looks like this:

```
  Fully                    Semi-                      Fully
  Synchronous              Synchronous                Asynchronous
  <-------------------------------------------------------------->

  All replicas ACK         At least 1 replica         No replica
  before COMMIT            ACKs before COMMIT         needs to ACK

  Slowest replica          Bounded data loss          Fastest writes
  determines latency       (at most 1 transaction)   but data loss
                                                      on failover
```

### MySQL Semi-Synchronous Replication

MySQL's `rpl_semi_sync_master` plugin makes the primary wait for at least one replica to confirm it received the binlog events **before** returning success to the client:

```
  Client        Primary              Replica
    |              |                     |
    |  COMMIT      |                     |
    |------------->|                     |
    |              |  write binlog       |
    |              |--+                  |
    |              |  |                  |
    |              |  v                  |
    |              |  send events        |
    |              |-------------------->|
    |              |                     |  write relay log
    |              |                     |--+
    |              |                     |  |
    |              |     ACK             |  v
    |              |<--------------------|
    |   OK         |                     |
    |<-------------|                     |
    |              |                     |  apply (async)
    |              |                     |--+
    |              |                     |  v
```

The ACK means the replica has **received and persisted** the events to its relay log, not that it has applied them. This guarantees that if the primary crashes, at least one replica has the data — but there may be a brief window where the replica hasn't yet applied it.

If no replica acknowledges within `rpl_semi_sync_master_timeout` (default 10 seconds), MySQL falls back to asynchronous mode to avoid blocking all writes indefinitely.

### PostgreSQL Synchronous Replication

PostgreSQL supports synchronous replication via `synchronous_standby_names`. The primary waits for the configured standby(s) to confirm WAL receipt before committing:

```sql
-- postgresql.conf on primary
synchronous_standby_names = 'FIRST 1 (standby_1, standby_2)'
-- Wait for the first standby in the list to confirm
```

The `synchronous_commit` parameter controls what "confirm" means:

```
  Setting            Primary waits for...       Durability
  -----------------  -------------------------  ----------------
  off                Nothing (async)            May lose data
  local              Local WAL flush only       Lose if primary
                                                dies
  remote_write       Standby received in OS     Lose if standby
                     buffer                     crashes before
                                                flush
  on                 Standby flushed WAL to     No data loss
                     disk                       (default)
  remote_apply       Standby applied the WAL    Reads on standby
                                                are consistent
```

## Failover: Promoting a Replica

When the primary fails, one replica must be **promoted** to become the new primary. This is the most critical moment in a replicated system.

```
  Before failover:

  App --writes--> [Primary] --replicates--> [Replica A]
                                        \-> [Replica B]

  Primary dies:

  App --writes--> [Primary X]   [Replica A]  [Replica B]
                  (dead)         lag: 0.1s    lag: 0.3s

  After failover:

  App --writes--> [Replica A]  (promoted to primary)
                       |
                       +--replicates--> [Replica B]
                                        (re-pointed)
```

### The Split-Brain Problem

The most dangerous failure mode is **split-brain**: both the old primary and the new primary accept writes simultaneously. This creates conflicting data that is extremely difficult to reconcile.

```
  DANGER: Split-brain

  [Old Primary]  (network partition, not actually dead)
       |
       | still accepting writes!
       v
  App Server 1 --> writes x=1

  [New Primary]  (promoted by failover system)
       |
       | also accepting writes!
       v
  App Server 2 --> writes x=2

  Which value of x is correct? Both are "committed."
```

Solutions:

- **Fencing:** Before promoting a replica, ensure the old primary cannot accept writes. This is done via STONITH ("Shoot The Other Node In The Head") — literally powering off the old primary's machine, or revoking its network access.
- **Lease-based leadership:** The primary holds a time-limited lease (e.g., in etcd or ZooKeeper). If it can't renew the lease, it stops accepting writes. The new primary only starts after the old lease expires.
- **Epoch/term numbers:** Each primary gets a monotonically increasing term number. Replicas reject writes from an old term. This is how Raft-based systems (TiDB, CockroachDB) prevent split-brain.

## Multi-Primary (Multi-Master) Replication

In some architectures, multiple nodes can accept writes simultaneously. This is common in:

- Geographically distributed systems where each region has a writable primary.
- High-availability setups where the application cannot tolerate any write downtime.

```
  Region US                         Region EU
  +------------------+              +------------------+
  |  Primary A       | <----------> |  Primary B       |
  |  (accepts writes)|  bi-dir      |  (accepts writes)|
  +------------------+  replication +------------------+
         |                                   |
         v                                   v
  +------------------+              +------------------+
  |  Replica A1      |              |  Replica B1      |
  +------------------+              +------------------+
```

### Conflict Resolution

When two primaries modify the same row concurrently, you get a **write conflict**. The system must decide which write wins:

```
  Primary A:  UPDATE users SET name='Alice' WHERE id=7  (at time T1)
  Primary B:  UPDATE users SET name='Bob'   WHERE id=7  (at time T2)

  Conflict! Which value should id=7 have?
```

Common resolution strategies:

1. **Last-writer-wins (LWW):** Use timestamps to pick the "later" write. Simple but can silently discard writes. Used by Cassandra.
2. **Application-level resolution:** Surface the conflict to application code. Used by CouchDB.
3. **CRDTs (Conflict-free Replicated Data Types):** Data structures designed so concurrent modifications automatically merge. Used by Riak.
4. **Avoidance:** Partition writes so the same row is only ever written by one primary. Used by many MySQL multi-primary setups (shard by region).

## Replication Topologies

How replicas are arranged affects latency, fault tolerance, and complexity:

```
  (1) Single-leader             (2) Chain
      (star topology)

      +---[R1]                  [Primary]-->[R1]-->[R2]-->[R3]
      |
  [Primary]---[R2]             Pros: less primary bandwidth
      |                        Cons: R3 has 3x lag
      +---[R3]


  (3) Tree                      (4) Multi-primary (mesh)

       [Primary]                [P1] <---> [P2]
       /       \                  ^          ^
    [R1]      [R2]                |          |
    /   \       \                 v          v
  [R3] [R4]    [R5]            [P3] <---> [P4]
```

MySQL supports all of these. The most common production setup is **(1) single-leader with multiple followers**, optionally with **(3) tree topology** using intermediate replicas to reduce load on the primary.

## Practical Example: Setting Up MySQL Replication

Here is what MySQL replication setup looks like with GTIDs:

```sql
-- On the primary: enable GTIDs and binlog
-- my.cnf:
-- [mysqld]
-- gtid_mode = ON
-- enforce_gtid_consistency = ON
-- log_bin = mysql-bin
-- server_id = 1

-- On the replica:
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = 'primary.example.com',
  SOURCE_PORT = 3306,
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = '...',
  SOURCE_AUTO_POSITION = 1;  -- use GTIDs

START REPLICA;

-- Check status:
SHOW REPLICA STATUS\G
-- Key fields:
--   Replica_IO_Running: Yes
--   Replica_SQL_Running: Yes
--   Seconds_Behind_Source: 0
--   Retrieved_Gtid_Set: 3E11FA47-...:1-42
--   Executed_Gtid_Set: 3E11FA47-...:1-42
```

The `Seconds_Behind_Source` metric is the most-watched number in any MySQL replication deployment. When it starts climbing, something is wrong — the replica is falling behind, usually because:

- A long-running transaction on the primary produces a burst of events.
- The replica's disk I/O can't keep up.
- Single-threaded SQL applier is the bottleneck (fix: enable multi-threaded applier).

## Key Takeaways

```
  Concept                  One-line summary
  -----------------------  -----------------------------------------------
  Physical replication     Ship raw WAL bytes; exact copy, version-locked
  Logical replication      Ship row changes; flexible, cross-version
  Async replication        Fast writes, possible data loss on failover
  Semi-sync replication    Bounded loss (1 txn), slight latency increase
  Sync replication         No data loss, latency = slowest replica
  Replication lag          Inherent in async; mitigate with routing/tokens
  GTID                     Global transaction IDs make failover seamless
  Split-brain              Worst failure mode; prevent with fencing/leases
  Multi-primary            Enables geo-distribution but requires conflict
                           resolution
```

## References

1. Kleppmann, M. *Designing Data-Intensive Applications*, Chapter 5: Replication. O'Reilly, 2017.
2. MySQL 8.0 Reference Manual, Chapter 19: Replication [doc](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
3. PostgreSQL Documentation, Chapter 27: High Availability, Load Balancing, and Replication [doc](https://www.postgresql.org/docs/current/high-availability.html)
4. MySQL GTID Concepts [doc](https://dev.mysql.com/doc/refman/8.0/en/replication-gtids-concepts.html)
5. PostgreSQL Streaming Replication [doc](https://www.postgresql.org/docs/current/warm-standby.html#STREAMING-REPLICATION)
6. MySQL Semi-Synchronous Replication [doc](https://dev.mysql.com/doc/refman/8.0/en/replication-semisync.html)
7. Ongaro, D. and Ousterhout, J. "In Search of an Understandable Consensus Algorithm (Raft)" [paper](https://raft.github.io/raft.pdf)
