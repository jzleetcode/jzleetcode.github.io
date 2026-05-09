---
author: JZ
pubDatetime: 2026-05-09T19:00:00Z
modDatetime: 2026-05-09T19:00:00Z
title: System Design - How Two-Phase Commit (2PC) Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Two-Phase Commit (2PC) protocol works: the coordinator-participant model, prepare and commit phases, failure recovery, real-world implementations in Google Percolator and TiDB, and source code walkthrough."
---

## Table of contents

## Context

Imagine you are transferring $100 from your savings account to your checking account. These two accounts live on different database servers. The savings server deducts $100, but right before the checking server can add $100, it crashes. Your money just vanished.

This is the **atomic commit** problem: when a single logical operation spans multiple machines, either **all of them** must succeed, or **none of them** should. Partial completion is not acceptable.

The **Two-Phase Commit (2PC)** protocol solves this. Invented by Jim Gray in his 1978 paper "Notes on Data Base Operating Systems," it remains the most widely used protocol for distributed atomic commits. You will find it inside databases (MySQL, PostgreSQL, TiDB), message brokers (Kafka transactions), and distributed storage systems.

```
              The Atomic Commit Problem

    Server A (savings)          Server B (checking)
    +-----------------+         +-----------------+
    | balance: $1000  |         | balance: $500   |
    +-----------------+         +-----------------+
           |                           |
           | deduct $100               | add $100
           v                           v
    +-----------------+         +-----------------+
    | balance: $900   |         |    CRASH!       |
    +-----------------+         +-----------------+

    Without 2PC: $100 is lost.
    With 2PC: the deduction is rolled back. Money is safe.
```

## The Players: Coordinator and Participants

2PC has two roles:

- **Coordinator (transaction manager):** The node that drives the protocol. It decides whether to commit or abort.
- **Participants (resource managers):** The nodes that hold the actual data. Each participant votes on whether it can commit.

In a banking system, the application server that initiates the transfer acts as the coordinator. The two database servers holding the accounts are the participants.

```
                      2PC Roles

         +------------------+
         |   Coordinator    |     drives the protocol
         | (app server /    |     decides commit or abort
         |  transaction     |
         |  manager)        |
         +--------+---------+
                  |
        +---------+---------+
        |                   |
        v                   v
  +------------+     +------------+
  | Participant|     | Participant|   hold the data
  | A (savings)|     | B (checking)|  vote yes / no
  +------------+     +------------+
```

## Phase 1: Prepare (The Voting Phase)

The coordinator asks every participant: "Can you commit this transaction?" Each participant must answer honestly.

**Step by step:**

1. The coordinator sends a `PREPARE` message to all participants.
2. Each participant checks whether it can commit. This means: acquiring locks, validating constraints, writing all changes to a **write-ahead log (WAL)** so they survive a crash.
3. If a participant can commit, it responds with `YES` (also called `VOTE-COMMIT`). If it cannot (constraint violation, disk full, timeout), it responds with `NO` (also called `VOTE-ABORT`).

The critical rule: **once a participant votes YES, it promises it can commit at any point in the future.** It has written everything to durable storage and holds all necessary locks. It cannot unilaterally change its mind.

```
   Phase 1: Prepare

   Coordinator                Participant A           Participant B
       |                           |                        |
       |------- PREPARE ---------->|                        |
       |------- PREPARE ---------------------------------->|
       |                           |                        |
       |                     write changes                  |
       |                     to WAL, acquire           write changes
       |                     locks                     to WAL, acquire
       |                           |                   locks
       |                           |                        |
       |<------ YES ---------------|                        |
       |<------ YES ------------------------------------|
       |                           |                        |
       |  (all voted YES)          |                        |
```

## Phase 2: Commit (The Decision Phase)

Based on the votes, the coordinator makes an irrevocable decision:

- **If all participants voted YES:** the coordinator decides `COMMIT`.
- **If any participant voted NO:** the coordinator decides `ABORT`.

This is the unanimity rule. A single "no" vote aborts the entire transaction.

**Step by step:**

1. The coordinator writes its decision (`COMMIT` or `ABORT`) to its own WAL. This is the **commit point** — the moment the transaction's fate is sealed.
2. The coordinator sends the decision to all participants.
3. Each participant applies the decision: either make the changes permanent and release locks (`COMMIT`) or undo the changes and release locks (`ABORT`).
4. Each participant acknowledges.

```
   Phase 2: Commit

   Coordinator                Participant A           Participant B
       |                           |                        |
       | (decision: COMMIT)        |                        |
       | write COMMIT to WAL       |                        |
       |                           |                        |
       |------- COMMIT ----------->|                        |
       |------- COMMIT ----------------------------------->|
       |                           |                        |
       |                     apply changes             apply changes
       |                     release locks             release locks
       |                           |                        |
       |<------ ACK ---------------|                        |
       |<------ ACK ----------------------------------------|
       |                           |                        |
       | (transaction complete)    |                        |
```

## The Abort Path

If any participant votes NO, the coordinator aborts:

```
   Abort Scenario

   Coordinator                Participant A           Participant B
       |                           |                        |
       |------- PREPARE ---------->|                        |
       |------- PREPARE ---------------------------------->|
       |                           |                        |
       |<------ YES ---------------|                        |
       |<------ NO  ----------------------------------------|
       |                           |                 (constraint violation)
       | (decision: ABORT)         |                        |
       | write ABORT to WAL        |                        |
       |                           |                        |
       |------- ABORT ------------>|                        |
       |------- ABORT ----------------------------------->|
       |                           |                        |
       |                     undo changes              undo changes
       |                     release locks             release locks
       |                           |                        |
```

Participant A voted YES, so it was holding locks and waiting. When it receives the ABORT message, it rolls back its changes. No money moves.

## Failure Recovery: What Happens When Things Crash

The real complexity of 2PC is not the happy path — it is handling crashes. Let's walk through every crash scenario.

### Coordinator crashes before writing the decision

The coordinator sent PREPARE but crashed before deciding. Participants that voted YES are now **in doubt** — they hold locks but do not know the outcome.

When the coordinator recovers, it checks its WAL. No decision was recorded, so it aborts the transaction and notifies the participants.

```
   Coordinator Crash (before decision)

   Coordinator           Participant A            Participant B
       |                      |                        |
       |--- PREPARE --------->|                        |
       |--- PREPARE ------------------------------>|
       |                      |                        |
       |<---- YES ------------|                        |
       |                      |                        |
       X  (CRASH)             |                        |
                              |   (holding locks,      |
                              |    waiting...)          |
                              |                        |
       |  (RECOVER)           |                        |
       |  WAL: no decision    |                        |
       |  => ABORT            |                        |
       |                      |                        |
       |--- ABORT ----------->|                        |
       |--- ABORT ------------------------------>  |
```

### Coordinator crashes after writing the decision

The coordinator decided COMMIT, wrote it to WAL, sent the message to some participants, and then crashed. When it recovers, it reads the decision from WAL and resends COMMIT to any participants that haven't acknowledged.

### Participant crashes after voting YES

The participant wrote its changes to WAL and voted YES, but then crashed. When it recovers, it reads the WAL and knows it voted YES. It contacts the coordinator to learn the final decision and applies it.

### Participant crashes before voting

The coordinator will timeout waiting for the vote and abort the transaction.

## The Blocking Problem

Here is the famous weakness of 2PC. Consider this scenario:

1. Participant A votes YES.
2. The coordinator decides COMMIT and writes to WAL.
3. The coordinator sends COMMIT to Participant B (who processes it).
4. The coordinator crashes **before** sending COMMIT to Participant A.

Now Participant A is stuck: it voted YES, is holding locks, and cannot reach the coordinator. It cannot safely commit (what if the coordinator decided ABORT?). It cannot safely abort (what if the coordinator decided COMMIT and other participants already committed?). It must **wait** — potentially forever — until the coordinator recovers.

```
   The Blocking Problem

   Coordinator           Participant A            Participant B
       |                      |                        |
       | (decision: COMMIT)   |                        |
       | wrote to WAL         |                        |
       |                      |                        |
       |                      |       COMMIT           |
       |--------------------------------------------->|
       |                      |                   (committed)
       X  (CRASH)             |                        |
                              |                        |
                         BLOCKED!                      |
                    (voted YES, holding         (already committed)
                     locks, can't decide)              |
```

This is why 2PC is called a **blocking protocol**. The blocked participant holds locks, which means other transactions trying to access the same data will also block. In the worst case, this cascades into a system-wide stall.

**Three-Phase Commit (3PC)** was designed to address this by adding a "pre-commit" phase, but it requires reliable failure detectors and is rarely used in practice. Modern systems use different strategies:

- **Timeouts with heuristic decisions:** After waiting long enough, abort and deal with inconsistency through compensating transactions.
- **Paxos-based coordinators:** Make the coordinator itself fault-tolerant through consensus (Spanner does this).
- **Cooperative recovery:** Participants ask each other for the outcome instead of waiting for the coordinator.

## Real-World Implementation: Google Percolator

Google's [Percolator](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/) (2010) implements a clever variation of 2PC that is **decentralized** — there is no dedicated coordinator node. Instead, the client drives the protocol and one of the keys being written serves as the **primary lock**.

### The Percolator Model

Percolator stores data in Bigtable with three column families per user column:

- **data:** The actual values, versioned by `start_ts`.
- **lock:** Active locks, showing which transaction holds a lock on this key.
- **write:** Commit records, mapping `commit_ts` to the `start_ts` of the committed value.

```
   Percolator Column Layout (for key "balance_A")

   Column       Version     Value
   ------       -------     -----
   data         ts=100      "$1000"
   data         ts=50       "$900"

   lock         ts=100      "primary: balance_A, start_ts=100"

   write        ts=80       "start_ts=50"    (committed at ts=80)
```

### Percolator 2PC Walkthrough

Let's trace a transfer of $100 from account A to account B:

```
   Percolator 2PC: Transfer $100 from A to B

   Client           Bigtable (key: A)         Bigtable (key: B)
     |                    |                          |
     | 1. Get start_ts=100 from TSO                  |
     |                    |                          |
     |  === PHASE 1: PREWRITE ===                    |
     |                    |                          |
     | 2. Prewrite A (PRIMARY)                       |
     |   - check no lock conflict                    |
     |   - check no write after ts=100               |
     |   - write data["A"]@100 = $900                |
     |   - write lock["A"]@100 = {primary: A}        |
     |------------------->|                          |
     |                    |                          |
     | 3. Prewrite B (SECONDARY)                     |
     |   - check no lock conflict                    |
     |   - check no write after ts=100               |
     |   - write data["B"]@100 = $600                |
     |   - write lock["B"]@100 = {primary: A}        |
     |---------------------------------------------->|
     |                    |                          |
     |  === PHASE 2: COMMIT ===                      |
     |                    |                          |
     | 4. Get commit_ts=200 from TSO                 |
     |                    |                          |
     | 5. Commit PRIMARY (A)                         |
     |   - remove lock["A"]@100                      |
     |   - write  write["A"]@200 = {start_ts=100}    |
     |------------------->|                          |
     |                    |                          |
     |   *** COMMIT POINT ***                        |
     |   (once primary is committed,                 |
     |    the transaction is committed)              |
     |                    |                          |
     | 6. Commit SECONDARY (B)                       |
     |   - remove lock["B"]@100                      |
     |   - write  write["B"]@200 = {start_ts=100}    |
     |---------------------------------------------->|
     |                    |                          |
```

The key insight: **the commit point is the single atomic write that commits the primary key.** Once the primary key's lock is replaced with a write record, the transaction is committed — even if the client crashes before cleaning up secondary locks. Any future reader that encounters a secondary lock will follow the pointer to the primary key and discover the transaction's fate.

### Lock Resolution

What if the client crashes after prewriting but before committing? The locks remain in Bigtable. A later transaction that encounters these locks performs **lock resolution:**

1. Read the primary key's lock.
2. If the primary lock still exists, the transaction hasn't committed. The lock is expired and rolled back.
3. If the primary lock is gone and a write record exists, the transaction committed. Clean up the secondary lock and proceed.

```
   Lock Resolution

   Reader encounters lock on key B
   lock["B"]@100 = {primary: A, start_ts=100}
        |
        v
   Check primary key A
        |
        +--- primary lock exists? -----> Transaction uncommitted
        |                                  Roll back: delete lock and data @100
        |
        +--- primary lock gone,   -----> Transaction committed
             write record exists?          Clean up: replace lock with write record
```

This self-healing mechanism means Percolator's 2PC is **non-blocking** at the participant level. Readers don't wait for a coordinator — they resolve stale locks themselves.

## Real-World Implementation: TiDB

TiDB implements the Percolator model on top of TiKV, with several production optimizations. The 2PC logic lives in [`pkg/store/driver/txn/txn_driver.go`](https://github.com/pingcap/tidb/blob/master/pkg/store/driver/txn/txn_driver.go) and [`store/tikv/2pc.go`](https://github.com/tikv/client-go/blob/master/txnkv/transaction/2pc.go) in the tikv/client-go repository.

### TiDB 2PC Optimizations

**1. Parallel Prewrite**

In vanilla Percolator, the primary key is prewritten first, then secondaries sequentially. TiDB prewrites all keys in parallel across TiKV regions, except that the primary key's prewrite must succeed before the commit phase begins.

```
   TiDB Parallel Prewrite

   TiDB Server
       |
       +--- Prewrite(primary key) ----> Region 1 (TiKV)
       |
       +--- Prewrite(key_2, key_3) ---> Region 2 (TiKV)    (parallel)
       |
       +--- Prewrite(key_4) ----------> Region 3 (TiKV)    (parallel)
       |
       v
   All prewrites succeeded => proceed to commit
```

**2. Async Commit**

For small transactions, TiDB can return success to the client **after the prewrite phase** without waiting for a commit timestamp. The commit timestamp is determined collaboratively by the participants using the `max_read_ts` they observed. This cuts one round-trip to PD.

```
   Normal Commit vs Async Commit

   Normal:   Prewrite --> Get commit_ts --> Commit primary --> return to client
                                                                   (3 round trips)

   Async:    Prewrite (with min_commit_ts) --> return to client
             Background: Commit primary and secondaries
                                                                   (1 round trip)
```

**3. One-Phase Commit (1PC)**

When a transaction only touches keys within a single TiKV region, TiDB skips the two-phase protocol entirely. It sends a single request that writes data and commit records atomically. This works because there is only one participant — no coordination needed.

### Transaction Status in TiDB

You can observe 2PC in action by querying TiDB's internal views:

```sql
-- See active transactions and their state
SELECT * FROM information_schema.cluster_tidb_trx
WHERE STATE = 'LockWaiting';

-- See lock information
SELECT * FROM information_schema.data_lock_waits;
```

## Comparing 2PC Implementations

Different systems make different trade-offs:

```
   System       Coordinator    Blocking?    Lock Storage     Optimization
   ----------   -----------    ---------    ------------     ------------
   XA (MySQL)   App server     Yes          Each DB          None (vanilla)
   Percolator   Client         Self-heal    Bigtable cells   Lock resolution
   TiDB         TiDB server    Self-heal    TiKV locks       Async commit, 1PC
   Spanner      Paxos group    No           Lock table       Paxos coordinator
   CockroachDB  Leaseholder    Self-heal    MVCC intents     Parallel commits
```

- **XA** is the simplest but most vulnerable to blocking.
- **Percolator/TiDB** avoid blocking through lock resolution but require a global timestamp oracle.
- **Spanner** avoids blocking by making the coordinator itself fault-tolerant via Paxos, but requires TrueTime (atomic clocks + GPS).
- **CockroachDB** uses a hybrid approach with leaseholder-based coordination and parallel commits.

## Performance Characteristics

2PC adds latency because it requires at least **two round-trips** between coordinator and participants:

```
   Latency Breakdown

   Phase 1 (Prepare):
     Coordinator -> Participant: network RTT
     Participant: WAL write (fsync)
     Participant -> Coordinator: network RTT

   Phase 2 (Commit):
     Coordinator: WAL write (fsync) for decision
     Coordinator -> Participant: network RTT
     Participant: WAL write (fsync)
     Participant -> Coordinator: network RTT

   Total: ~4 network half-trips + 3 fsync operations
```

For a cross-region transaction with 10ms network RTT and 1ms fsync:

$$\text{2PC overhead} \approx 4 \times 10\text{ms} + 3 \times 1\text{ms} = 43\text{ms}$$

This is why distributed transactions are significantly slower than local ones. Systems optimize aggressively:

- **Group commit:** Batch multiple transactions' WAL writes into a single fsync.
- **Async commit:** Return to the client after Phase 1 (TiDB, CockroachDB).
- **Pipelining:** Start Phase 2 before all Phase 1 responses arrive, if the coordinator can predict the outcome.

## Summary

Two-Phase Commit is the foundational protocol for distributed atomic commits. Despite being over 45 years old, it remains at the heart of every major distributed database.

The protocol is simple in concept — vote, then decide — but handling every failure mode correctly requires careful engineering: durable write-ahead logs, timeout-based abort, lock resolution, and leadership election.

Modern systems don't replace 2PC; they optimize around its weaknesses. Percolator eliminates the dedicated coordinator. TiDB adds async commit and one-phase commit for small transactions. Spanner makes the coordinator fault-tolerant with Paxos. Each system keeps the two-phase structure but reduces the cost of its two biggest problems: blocking and latency.

## References

1. Jim Gray, "Notes on Data Base Operating Systems," 1978 — the original 2PC description.
2. Daniel Peng, Frank Dabek, "Large-scale Incremental Processing Using Distributed Transactions and Notifications" (Percolator), 2010 [paper](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/)
3. James C. Corbett et al., "Spanner: Google's Globally-Distributed Database," 2012 [paper](https://research.google/pubs/spanner-googles-globally-distributed-database/)
4. TiDB transaction overview [doc](https://docs.pingcap.com/tidb/stable/transaction-overview)
5. TiDB optimistic transaction [doc](https://docs.pingcap.com/tidb/stable/optimistic-transaction)
6. tikv/client-go 2PC implementation [`txnkv/transaction/2pc.go`](https://github.com/tikv/client-go/blob/master/txnkv/transaction/2pc.go)
7. Martin Kleppmann, "Designing Data-Intensive Applications," Chapter 9: Consistency and Consensus — excellent treatment of 2PC and its limitations.
