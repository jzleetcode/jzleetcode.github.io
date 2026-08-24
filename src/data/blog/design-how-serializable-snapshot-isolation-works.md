---
author: JZ
pubDatetime: 2026-08-24T12:01:00Z
modDatetime: 2026-08-24T12:01:00Z
title: System Design - How Serializable Snapshot Isolation (SSI) Works
tags:
  - design-database
  - design-concurrency
description:
  "How Serializable Snapshot Isolation (SSI) works: the theory behind detecting dangerous read-write conflicts in MVCC databases, how PostgreSQL implements it, and why it matters for correctness without sacrificing concurrency."
---

## Table of contents

## Context

Most modern databases use **Snapshot Isolation (SI)** to give each transaction a consistent view of data without blocking readers. Under SI, a transaction sees the database as it was at the moment the transaction started — reads never block writes, and writes never block reads. This is the isolation level you get with PostgreSQL's `REPEATABLE READ` or MySQL's default InnoDB behavior.

But SI has a dirty secret: it allows **write skew** anomalies. Two transactions can each read something, make a decision based on what they read, and write — yet the combined result is impossible under any serial execution. The classic example:

```
Doctor on-call constraint: at least one doctor must remain on call.

  Initially: Alice=on_call, Bob=on_call

  T1 reads: Alice=on_call, Bob=on_call  →  "Bob is still on call, I can leave"
  T2 reads: Alice=on_call, Bob=on_call  →  "Alice is still on call, I can leave"

  T1 writes: Alice=off_call    ← commits
  T2 writes: Bob=off_call      ← commits

  Result: nobody is on call!  ← impossible in any serial order
```

Under SI, both transactions commit because they don't write to the *same* row (no write-write conflict). But no serial execution of T1 and T2 would allow both to go off call.

For decades, the only way to get true **SERIALIZABLE** isolation was to use heavy locking (two-phase locking, or 2PL), which blocks readers. In 2008, researchers Michael Cahill, Uwe Röhm, and Alan Fekete published a breakthrough: **Serializable Snapshot Isolation** (SSI). It achieves serializability on top of SI by detecting *dangerous structures* in the dependency graph — with no read locks and almost no extra blocking.

PostgreSQL adopted SSI in version 9.1 (2011), and CockroachDB uses a variant at its core. Let's understand how it works.

## The Serializability Theory

A schedule of concurrent transactions is **serializable** if its outcome is equivalent to *some* serial (one-at-a-time) execution of those same transactions. We model conflicts between transactions as a **dependency graph** (also called a serialization graph):

```
  Nodes:  committed transactions
  Edges:  T1 → T2 means "T1 must come before T2 in the equivalent serial order"
```

Three types of edges (dependencies):

| Type | Notation | Meaning |
|------|----------|---------|
| Write-Read (WR) | T1 →wr T2 | T2 reads a version written by T1 |
| Write-Write (WW) | T1 →ww T2 | T2 overwrites a version written by T1 |
| Read-Write (RW) | T1 →rw T2 | T2 writes a new version of something T1 read (an older version) |

**Theorem (Fekete et al. 2005):** Under Snapshot Isolation, the *only* anomalies that can occur involve a cycle in the serialization graph that contains **two consecutive RW-dependency edges** (called rw-antidependencies). In other words:

```
    T1 ──rw──→ T2 ──rw──→ T3     (where T3 might be T1, forming a cycle)
```

This is the **dangerous structure**. If we detect and abort one transaction in every dangerous structure, the remaining schedule is guaranteed serializable.

```
  Serialization Graph for Write Skew:

    T1 ──rw──→ T2
     ↑          │
     └────rw────┘

  T1 reads Bob's row (version v0), T2 overwrites it → RW edge T1→T2
  T2 reads Alice's row (version v0), T1 overwrites it → RW edge T2→T1

  Cycle with two consecutive RW edges → dangerous structure → abort one!
```

## The SSI Algorithm

SSI works by tracking two things for each transaction:

1. **rw-in edges**: "some concurrent transaction wrote a newer version of data I read"
2. **rw-out edges**: "I wrote a newer version of data some concurrent transaction read"

The rule is simple:

> If a transaction T has **both** an rw-in edge from some T_in **and** an rw-out edge to some T_out, then T is the "pivot" of a potential dangerous structure. Abort T.

```
         ┌─────── rw-in ───────┐
         │                     │
         v                     │
  T_in ─────── ? ──────→ T (pivot) ──── rw-out ────→ T_out
                               │
                          ABORT HERE
```

In practice, the algorithm tracks two boolean flags per transaction:

```
  struct Transaction {
      committed: bool,
      in_conflict:  bool,   // has an incoming rw-antidependency
      out_conflict: bool,   // has an outgoing rw-antidependency
  }
```

When a new RW conflict is detected:
1. Set `out_conflict = true` on the reader (older transaction)
2. Set `in_conflict = true` on the writer (newer transaction)
3. If either transaction now has **both** flags set → abort it

This is conservative — it may abort transactions that would have been safe (false positives). But it **never** allows a serializability violation (no false negatives). The abort rate is typically low in practice because most workloads don't create dangerous structures.

## How PostgreSQL Implements SSI

PostgreSQL's implementation lives primarily in `src/backend/storage/lmgr/predicate.c` (over 4,500 lines). It uses three key data structures:

### 1. SIREAD Locks (Predicate Locks)

When a SERIALIZABLE transaction reads data, PostgreSQL records a **SIREAD lock** (also called a predicate lock). These are *not* blocking locks — they're bookkeeping markers that say "transaction T read this."

```
  SIREAD Lock Granularity (coarsest to finest):

  ┌─────────────────────────────────┐
  │          Relation lock          │   "T read somewhere in this table"
  │  ┌───────────────────────────┐  │
  │  │        Page lock          │  │   "T read somewhere on this page"
  │  │  ┌─────────────────────┐  │  │
  │  │  │    Tuple lock       │  │  │   "T read this specific row"
  │  │  └─────────────────────┘  │  │
  │  └───────────────────────────┘  │
  └─────────────────────────────────┘
```

PostgreSQL starts with fine-grained tuple-level locks. When memory pressure grows, it *promotes* locks to page-level or relation-level (this increases false positives but controls memory usage):

```c
// Simplified from predicate.c
// When too many locks exist for a page, promote to page-level
if (page_lock_count > max_pred_locks_per_page) {
    // Remove all tuple-level locks on this page
    // Replace with a single page-level lock
    promote_to_page_lock(relation, page);
}
```

### 2. RW-Conflict List (SERIALIZABLEXACT)

Each serializable transaction has a `SERIALIZABLEXACT` structure:

```c
typedef struct SERIALIZABLEXACT {
    // ...
    SHM_QUEUE   inConflicts;     // list of rw-in edges
    SHM_QUEUE   outConflicts;    // list of rw-out edges
    // flags
    bool        doSomething;
    // ...
} SERIALIZABLEXACT;
```

When transaction T2 writes a row that T1 previously read (detected via SIREAD locks):

```
  1. Create an RWConflict record: T1 →rw T2
  2. Add to T1's outConflicts list
  3. Add to T2's inConflicts list
  4. Check: does T1 have inConflicts AND outConflicts?  → abort T1
  5. Check: does T2 have inConflicts AND outConflicts?  → abort T2
```

### 3. The Commit Sequence Number (CSN)

PostgreSQL assigns each committed transaction a **commit sequence number**. This determines which transactions are "concurrent" — two transactions are concurrent if their lifetimes overlap (one started before the other committed). Only concurrent transactions can form dangerous structures.

### Putting It Together: A Write Skew Detection

```
  Timeline:
  ─────────────────────────────────────────────────────→ time

  T1: BEGIN ─── READ(Bob) ─── WRITE(Alice=off) ─── COMMIT
  T2: BEGIN ─── READ(Alice) ─── WRITE(Bob=off) ─── try COMMIT → ABORT!

  Step by step:
  1. T1 reads Bob's row → SIREAD lock on Bob's tuple
  2. T2 reads Alice's row → SIREAD lock on Alice's tuple
  3. T1 writes Alice's row → check SIREAD locks on Alice
     → T2 holds a SIREAD lock!
     → Create conflict: T2 →rw T1  (T2 read old Alice, T1 writes new Alice)
     → T2.outConflict = true, T1.inConflict = true
  4. T2 writes Bob's row → check SIREAD locks on Bob
     → T1 holds a SIREAD lock!
     → Create conflict: T1 →rw T2  (T1 read old Bob, T2 writes new Bob)
     → T1.outConflict = true, T2.inConflict = true
  5. T1 commits successfully (at this point, T2 hasn't committed yet)
  6. T2 tries to commit → has BOTH inConflict AND outConflict → ABORT!
```

The application retries T2, which now sees Alice is already off call and makes a different decision.

## Why Not Just Use Locking?

Two-phase locking (2PL) also achieves serializability, but at a steep cost:

```
                    2PL                         SSI
  ┌──────────────────────────────┬──────────────────────────────┐
  │  Readers block writers       │  Readers never block writers  │
  │  Writers block readers       │  Writers never block readers  │
  │  Deadlocks possible          │  No deadlocks (aborts only)  │
  │  Zero false aborts           │  Some false aborts            │
  │  Low concurrency             │  High concurrency             │
  │  Read latency = lock wait    │  Read latency = snapshot read │
  └──────────────────────────────┴──────────────────────────────┘
```

SSI trades a small false-abort rate for dramatically better concurrency. In read-heavy workloads (the common case), SSI approaches the throughput of plain SI while guaranteeing serializability.

## SSI in CockroachDB

CockroachDB implements a distributed variant of SSI as its *only* isolation level (until recently, when they added READ COMMITTED). Key differences from PostgreSQL:

1. **Timestamp ordering**: CockroachDB uses timestamp-based MVCC where each transaction gets a read timestamp and a commit timestamp. RW-conflicts are detected by checking if a write's timestamp falls within a concurrent reader's [read_ts, commit_ts] window.

2. **Read timestamp cache**: Instead of explicit SIREAD locks, CockroachDB maintains a **timestamp cache** that records the highest timestamp at which each key was read. When a write arrives, it checks the timestamp cache to detect conflicts.

3. **Transaction restarts vs. aborts**: CockroachDB often *restarts* a transaction at a higher timestamp rather than aborting it entirely, which is transparent to the client.

```
  CockroachDB SSI Detection:

  T1 reads key K at timestamp ts=10
  → timestamp cache records: K was read at ts=10

  T2 writes key K at timestamp ts=8 (earlier than T1's read!)
  → T2 checks timestamp cache: "someone read K at ts=10 > my ts=8"
  → RW-conflict detected: T1 →rw T2
  → T2 must restart at timestamp > 10
```

## Performance Characteristics

Real-world benchmarks show SSI adds modest overhead compared to SI:

- **Read-only transactions**: Zero overhead (no writes = no dangerous structures possible)
- **Low-contention workloads**: ~2-5% overhead from SIREAD lock bookkeeping
- **High-contention workloads**: Higher abort rates, but still better throughput than 2PL because reads don't block

The key insight: **most transactions don't participate in dangerous structures**. The overwhelming majority of concurrent transactions either don't conflict at all, or conflict in ways that don't form the two-consecutive-RW-edge pattern. SSI only penalizes the rare cases that actually threaten serializability.

## Summary

```
  The SSI Story in One Diagram:

  ┌─────────────────────────────────────────────────────────┐
  │                   Snapshot Isolation                      │
  │                                                          │
  │  ✓ MVCC: readers see a consistent snapshot               │
  │  ✓ No read-write blocking                                │
  │  ✗ Allows write skew (two adjacent RW-antidependencies)  │
  └─────────────────────────┬───────────────────────────────┘
                            │
                   + SSI layer adds:
                            │
  ┌─────────────────────────▼───────────────────────────────┐
  │              Track RW-antidependencies                    │
  │              (SIREAD locks + conflict lists)              │
  │                                                          │
  │  If a transaction has BOTH inConflict AND outConflict:   │
  │  → it's the pivot of a dangerous structure → ABORT       │
  │                                                          │
  │  Result: serializability with SI-level concurrency       │
  └─────────────────────────────────────────────────────────┘
```

SSI is one of the most elegant algorithms in database systems: a small theoretical insight (only two consecutive RW edges matter) turns into a practical, high-performance implementation that gives you the strongest correctness guarantee without sacrificing the read performance that made snapshot isolation popular in the first place.

## References

1. Cahill, M., Röhm, U., Fekete, A. "Serializable Isolation for Snapshot Databases" [ACM TODS 2009](https://dl.acm.org/doi/10.1145/1620585.1620587) — the original SSI paper
2. Fekete, A., Liarokapis, D., O'Neil, E., O'Neil, P., Shasha, D. "Making Snapshot Isolation Serializable" [ACM TODS 2005](https://dl.acm.org/doi/10.1145/1071610.1071615) — the theory of dangerous structures
3. Ports, D., Grittner, K. "Serializable Snapshot Isolation in PostgreSQL" [VLDB 2012](https://vldb.org/pvldb/vol5/p1850_danrports_vldb2012.pdf) — PostgreSQL's implementation
4. PostgreSQL source: [`src/backend/storage/lmgr/predicate.c`](https://github.com/postgres/postgres/blob/master/src/backend/storage/lmgr/predicate.c)
5. CockroachDB architecture: [Transaction Layer](https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer.html)
6. Kleppmann, M. "Designing Data-Intensive Applications" (2017), Chapter 7 — excellent coverage of SSI in context
