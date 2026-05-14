---
author: JZ
pubDatetime: 2026-05-14T12:00:00Z
modDatetime: 2026-05-14T12:00:00Z
title: System Design - How Two-Phase Commit (2PC) Works
tags:
  - design-system
  - design-concurrency
description:
  "How two-phase commit (2PC) works in distributed databases: the coordinator/participant model, prepare and commit phases, failure handling, recovery via write-ahead logging, and real-world implementations in PostgreSQL, MySQL, and TiDB."
---

## Table of contents

## Context

Imagine you're transferring money between two bank accounts that live on different database servers. You debit $100 from Account A on Server 1, and credit $100 to Account B on Server 2. What happens if Server 2 crashes right after Server 1 commits the debit? The money vanishes — debited from A but never credited to B.

This is the **atomic commit problem** in distributed systems. You need a protocol that guarantees either **all** participants commit, or **none** of them do. The classic answer, published by Jim Gray in 1978, is the **Two-Phase Commit** protocol (2PC).

```
  The Problem: How do multiple nodes agree to commit or abort?

  Server 1 (Account A)          Server 2 (Account B)
  +------------------+          +------------------+
  |  debit $100      |          |  credit $100     |
  |  COMMIT?         |   ???    |  COMMIT?         |
  +------------------+          +------------------+

  Without coordination:
    - Server 1 commits, Server 2 crashes → money lost
    - Server 2 commits, Server 1 aborts  → money created from nothing
```

2PC solves this by introducing a **coordinator** that drives a two-round voting protocol. Let's walk through how it works.

## The Players

2PC has two roles:

- **Coordinator (Transaction Manager):** The node that initiated the distributed transaction. It runs the protocol and makes the final commit/abort decision.
- **Participants (Resource Managers):** The nodes that hold the data being modified. Each participant votes on whether it can commit.

```
                    +---------------+
                    |  Coordinator  |
                    |  (TM)        |
                    +-------+-------+
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        +-----------+ +-----------+ +-----------+
        | Particip. | | Particip. | | Particip. |
        |  Node A   | |  Node B   | |  Node C   |
        +-----------+ +-----------+ +-----------+
```

In practice, the coordinator is often the application server or the database node where the transaction originated. Participants are the other nodes that the transaction touches.

## Phase 1: Prepare (The Vote)

The coordinator sends a `PREPARE` message to every participant. Each participant must decide: "Can I guarantee that I will be able to commit this transaction, no matter what happens next?"

```
  Phase 1: Prepare

  Coordinator                 Participants
      |                     A       B       C
      |--- PREPARE -------->|       |       |
      |--- PREPARE ---------------->|       |
      |--- PREPARE ------------------------>|
      |                     |       |       |
      |   (each participant |       |       |
      |    writes to its    |       |       |
      |    WAL, acquires    |       |       |
      |    locks)           |       |       |
      |                     |       |       |
      |<-- VOTE YES --------|       |       |
      |<-- VOTE YES ----------------|       |
      |<-- VOTE YES ------------------------|
```

When a participant receives `PREPARE`, it does the following:

1. **Executes the transaction** up to the point of commit (applies changes to a temporary area).
2. **Writes a prepare record** to its local **write-ahead log (WAL)**, ensuring the changes survive a crash.
3. **Acquires all necessary locks** so that no other transaction can interfere.
4. **Responds with VOTE YES** if everything succeeded, or **VOTE ABORT** if anything went wrong (constraint violation, disk full, deadlock, etc.).

A YES vote is a **promise**: "I will commit if you tell me to, and I will not unilaterally abort." Once a participant votes YES, it cannot change its mind.

## Phase 2: Commit (The Decision)

The coordinator collects all votes. The decision rule is simple:

- **All votes are YES** → send `COMMIT` to all participants.
- **Any vote is ABORT** (or a participant times out) → send `ABORT` to all participants.

```
  Phase 2: Commit (all voted YES)

  Coordinator                 Participants
      |                     A       B       C
      |                     |       |       |
      |  (write COMMIT      |       |       |
      |   to coordinator    |       |       |
      |   WAL)              |       |       |
      |                     |       |       |
      |--- COMMIT --------->|       |       |
      |--- COMMIT ----------------->|       |
      |--- COMMIT ------------------------->|
      |                     |       |       |
      |   (each participant |       |       |
      |    applies changes, |       |       |
      |    releases locks)  |       |       |
      |                     |       |       |
      |<-- ACK -------------|       |       |
      |<-- ACK ----------------------|       |
      |<-- ACK ------------------------------|
      |                     |       |       |
      |  (transaction       |       |       |
      |   complete)         |       |       |
```

The coordinator writes its decision to its own WAL **before** sending the commit/abort message. This is the **commit point** — the moment the transaction's fate is sealed. Even if the coordinator crashes immediately after writing this record, it can recover and resend the decision.

## The Abort Path

If any participant votes ABORT, the coordinator tells everyone to roll back:

```
  Phase 2: Abort (Node B voted ABORT)

  Coordinator                 Participants
      |                     A       B       C
      |                     |       |       |
      |<-- VOTE YES --------|       |       |
      |<-- VOTE ABORT --------------|       |
      |                     |       |       |
      |  (write ABORT       |       |       |
      |   to coordinator    |       |       |
      |   WAL)              |       |       |
      |                     |       |       |
      |--- ABORT ---------->|       |       |
      |--- ABORT ------------------->|       |
      |--- ABORT --------------------------->|
      |                     |       |       |
      |   (each participant |       |       |
      |    rolls back,      |       |       |
      |    releases locks)  |       |       |
```

Node A voted YES, so it was holding locks and waiting. When it receives ABORT, it undoes its work and releases the locks. Node B already decided to abort, so it just confirms. Atomicity is preserved — nobody commits.

## State Machine

Each participant moves through a well-defined state machine:

```
  Participant State Machine

       +--------+
       | INIT   |  (transaction in progress, not yet asked to prepare)
       +---+----+
           |
           | receive PREPARE
           v
       +--------+
       | VOTING |  (evaluating whether we can commit)
       +---+----+
           |
      +----+------+
      |           |
   vote YES    vote ABORT
      |           |
      v           v
  +--------+  +--------+
  |PREPARED|  |ABORTED |  (terminal)
  +---+----+  +--------+
      |
      | receive COMMIT or ABORT
      |
  +---+----+-------+
  |               |
  v               v
+--------+    +--------+
|COMMITTED|   |ABORTED |  (terminal)
+--------+    +--------+


  Coordinator State Machine

  +------+                +--------+
  | INIT | --send PREPARE--> | WAIT   |
  +------+                +---+----+
                              |
                    +---------+---------+
                    |                   |
              all YES              any ABORT/timeout
                    |                   |
                    v                   v
              +---------+         +---------+
              | COMMIT  |         | ABORT   |
              +---------+         +---------+
                    |                   |
              send COMMIT          send ABORT
              collect ACKs         collect ACKs
                    |                   |
                    v                   v
              +---------+         +---------+
              |  DONE   |         |  DONE   |
              +---------+         +---------+
```

## Recovery After a Crash

The entire protocol is designed so that every participant and the coordinator can recover from a crash at any point. The key is the **write-ahead log**.

### Coordinator crash

| When it crashed | Recovery action |
|---|---|
| Before writing COMMIT/ABORT | The decision was never made. Coordinator restarts and sends ABORT to all participants. |
| After writing COMMIT | Coordinator reads its WAL, finds the COMMIT record, and resends COMMIT to all participants. |
| After writing ABORT | Same — reads WAL, resends ABORT. |

### Participant crash

| When it crashed | Recovery action |
|---|---|
| Before voting YES | Participant never promised anything. It aborts locally. The coordinator will eventually time out and abort. |
| After voting YES, before receiving decision | This is the **uncertain period**. The participant must ask the coordinator (or other participants) for the decision. It **cannot** unilaterally commit or abort. |
| After receiving COMMIT/ABORT | Participant replays the decision from its WAL. |

The uncertain period is the Achilles' heel of 2PC — more on this below.

## The Blocking Problem

2PC has a well-known weakness: it is a **blocking protocol**. If the coordinator crashes after participants have voted YES but before sending the decision, those participants are **stuck**:

```
  The Blocking Scenario

  Coordinator    Node A (voted YES)    Node B (voted YES)
      |               |                    |
      | PREPARE       |                    |
      |-------------->|                    |
      |------------------------------>     |
      |               |                    |
      |<-- YES -------|                    |
      |<-- YES ----------------------------|
      |               |                    |
      X (crash!)      |                    |
                      |                    |
                  "I voted YES.        "I voted YES.
                   I can't commit       I can't commit
                   or abort on my       or abort on my
                   own. I must wait."   own. I must wait."
                      |                    |
                  (holding locks...)   (holding locks...)
```

Both nodes are holding locks and cannot release them. They must wait for the coordinator to recover. In the worst case, if the coordinator's disk is destroyed, the participants remain blocked until manual intervention.

This is why 2PC is sometimes called a "blocking atomic commit protocol." Variants like **Three-Phase Commit (3PC)** were designed to address this, but they come with their own trade-offs (more round trips, assumptions about failure detection).

## The Write-Ahead Log in Detail

Every state transition in 2PC is logged **before** the corresponding message is sent. This is what makes recovery possible:

```
  Coordinator WAL                Participant WAL (Node A)
  +------------------+           +------------------+
  | START tx_id=42   |           | START tx_id=42   |
  | participants:    |           |                  |
  |   [A, B, C]     |           |                  |
  +------------------+           +------------------+
          |                              |
  (send PREPARE)                 (receive PREPARE)
          |                              |
  +------------------+           +------------------+
  |                  |           | PREPARE tx_id=42 |
  |                  |           | changes: [...]   |
  +------------------+           +------------------+
          |                              |
  (collect votes)                (send VOTE YES)
          |                              |
  +------------------+           +------------------+
  | COMMIT tx_id=42  |  <-- commit point
  +------------------+           +------------------+
          |                              |
  (send COMMIT)                  (receive COMMIT)
          |                              |
  +------------------+           +------------------+
  | DONE tx_id=42    |           | COMMIT tx_id=42  |
  +------------------+           +------------------+
```

The rule: **log first, then act.** If a node crashes mid-protocol, it reads its WAL on restart and knows exactly where it left off.

## Real-World Implementations

### PostgreSQL: Prepared Transactions

PostgreSQL supports 2PC through **prepared transactions**, exposed via two SQL commands:

```sql
-- Phase 1: prepare (on each participating database)
PREPARE TRANSACTION 'transfer_tx_42';

-- Phase 2: commit (after all participants prepared successfully)
COMMIT PREPARED 'transfer_tx_42';

-- or abort
ROLLBACK PREPARED 'transfer_tx_42';
```

When you run `PREPARE TRANSACTION`, PostgreSQL writes the transaction state to disk (in `pg_twophase/` directory) and releases the connection — the transaction survives even if the client disconnects. The coordinator (typically the application or a transaction manager like [pgbouncer](https://www.pgbouncer.org/) or an XA-compliant middleware) is responsible for driving phase 2.

Source: [`src/backend/access/transam/twophase.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/twophase.c)

### MySQL: XA Transactions

MySQL implements the **XA specification** (X/Open Distributed Transaction Processing standard):

```sql
-- Start an XA transaction
XA START 'transfer_tx_42';
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
XA END 'transfer_tx_42';

-- Phase 1: prepare
XA PREPARE 'transfer_tx_42';

-- Phase 2: commit
XA COMMIT 'transfer_tx_42';

-- or rollback
XA ROLLBACK 'transfer_tx_42';
```

The XA protocol maps directly to 2PC: `XA PREPARE` is the vote phase, and `XA COMMIT`/`XA ROLLBACK` is the decision phase. MySQL's InnoDB engine logs the prepared state in the redo log, so prepared transactions survive server crashes.

Source: [`sql/xa/xa_cmd.cc`](https://github.com/mysql/mysql-server/blob/trunk/sql/xa/xa_cmd.cc)

### TiDB: Percolator-Style 2PC

TiDB uses a variation of 2PC inspired by Google's Percolator paper. Unlike classical 2PC where a separate coordinator drives the protocol, TiDB's SQL layer acts as the coordinator and TiKV storage nodes are the participants:

```
  TiDB's Percolator 2PC

  TiDB Server (coordinator)         TiKV Nodes (participants)
       |                          Region A     Region B
       |                             |            |
       |  1. Prewrite (primary key)  |            |
       |  [write lock + data]        |            |
       |---------------------------->|            |
       |<---- ok --------------------|            |
       |                             |            |
       |  2. Prewrite (secondary keys)            |
       |---------------------------->|            |
       |-------------------------------------------->|
       |<---- ok --------------------|            |
       |<---- ok ------------------------------------|
       |                             |            |
       |  3. Commit (primary key)    |            |
       |---------------------------->|            |
       |<---- ok --------------------|            |
       |                             |            |
       |  4. Commit (secondary keys, async)       |
       |---------------------------->|            |
       |-------------------------------------------->|
```

The key difference from classical 2PC: there is a **primary key** that acts as the commit point. If the primary key's lock is committed, the transaction is committed. Secondary keys can be committed asynchronously because any reader that encounters a locked secondary key will check the primary key's status to determine the transaction's outcome.

This eliminates the blocking problem of classical 2PC — if the coordinator (TiDB server) crashes after committing the primary key, any other TiDB server can resolve the transaction by checking the primary key's lock status in TiKV.

## 2PC vs. Other Approaches

| Protocol | Round trips | Blocking? | Tolerates coordinator failure? |
|---|---|---|---|
| **2PC** | 2 | Yes | Only after recovery |
| **3PC** | 3 | No (with assumptions) | Yes (with timeout-based abort) |
| **Paxos Commit** | 2-3 | No | Yes (replicated coordinator) |
| **Percolator 2PC** | 2 | No (primary key resolves) | Yes (any node can resolve) |
| **Saga** | N (one per step) | No | Yes (compensating transactions) |

Classical 2PC remains popular because it is **simple, correct, and fast** (only 2 round trips). The blocking problem is mitigated in practice by keeping the coordinator highly available (replicated state machines, short timeouts, etc.).

## Summary

Two-phase commit is one of those protocols that shows up everywhere in distributed systems, from databases to message queues to microservice orchestrators. The core idea is elegant: split the commit into a **voting phase** (can you commit?) and a **decision phase** (everyone commit, or everyone abort). The write-ahead log at each node makes the whole thing recoverable.

The trade-off is blocking: if the coordinator fails at the wrong moment, participants holding locks must wait. Modern systems like TiDB's Percolator variant and Paxos-based commit protocols address this, but classical 2PC remains the foundation they all build upon.

## References

1. Jim Gray, "Notes on Data Base Operating Systems," 1978 — original 2PC description [paper](https://link.springer.com/chapter/10.1007/3-540-08755-9_9)
2. C. Mohan, B. Lindsay, R. Obermarck, "Transaction Management in the R* Distributed Database Management System," 1986 [paper](https://dl.acm.org/doi/10.1145/7239.7266)
3. PostgreSQL prepared transactions [`src/backend/access/transam/twophase.c`](https://github.com/postgres/postgres/blob/master/src/backend/access/transam/twophase.c)
4. MySQL XA transactions [docs](https://dev.mysql.com/doc/refman/8.0/en/xa.html)
5. Google Percolator paper [paper](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/)
6. TiDB transaction overview [docs](https://docs.pingcap.com/tidb/stable/transaction-overview)
7. Leslie Lamport, "Paxos Commit," 2004 [paper](https://lamport.azurewebsites.net/video/consensus-on-transaction-commit.pdf)
8. Dale Skeen, "Nonblocking Commit Protocols," 1981 — 3PC [paper](https://dl.acm.org/doi/10.1145/800228.806714)
