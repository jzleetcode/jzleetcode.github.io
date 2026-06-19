---
author: JZ
pubDatetime: 2026-06-19T06:23:00Z
modDatetime: 2026-06-19T06:23:00Z
title: System Design - How Database Deadlock Detection Works
tags:
  - design-system
  - design-concurrency
description:
  "How databases detect deadlocks: the wait-for graph algorithm, cycle detection via DFS, InnoDB's implementation, victim selection strategies, and how distributed databases like TiDB handle cross-node deadlocks."
---

## Table of contents

## Context

Imagine two bank tellers at the same branch. Teller A holds the key to safe-deposit box 1 and needs box 2. Teller B holds box 2's key and needs box 1. Neither can proceed. Neither will give up what they have. The branch is stuck.

This is a **deadlock** — two or more transactions each hold a lock that the other needs, forming a circular dependency. Without intervention, deadlocked transactions would wait forever. Every major database engine includes a **deadlock detector** that identifies these cycles and breaks them by killing one transaction (the "victim").

```
    Transaction A                     Transaction B
    ─────────────                     ─────────────
    LOCK row X   ✓                    LOCK row Y   ✓
         |                                 |
         v                                 v
    LOCK row Y   ← waits ───────┐    LOCK row X   ← waits ───────┐
                                │                                 │
                                └── held by B                     └── held by A

                          ╔═══════════════╗
                          ║   DEADLOCK!   ║
                          ╚═══════════════╝
```

The fundamental question: how does a database efficiently detect that a cycle has formed among potentially thousands of concurrent transactions?

## The Wait-For Graph

The standard approach, used by MySQL/InnoDB, PostgreSQL, Oracle, and TiDB, is the **wait-for graph** (WFG). The idea is simple:

1. Represent each active transaction as a **node**.
2. Draw a **directed edge** from transaction A to transaction B if A is waiting for a lock that B currently holds.
3. A **cycle** in this graph means deadlock.

```
  Wait-For Graph (no deadlock)       Wait-For Graph (deadlock!)

       T1 ──→ T2 ──→ T3                  T1 ──→ T2
                                          ↑       │
       (T1 waits for T2,                  │       ↓
        T2 waits for T3,                  T4 ←── T3
        T3 holds its lock,
        no cycle → safe)              (T1→T2→T3→T4→T1 = cycle)
```

### Why not timeouts?

A simpler alternative: if a transaction waits longer than N seconds, assume deadlock and abort it. Some systems use this as a fallback, but it has two problems:

- **Too short:** kills transactions that are simply waiting behind a long-running query (false positives).
- **Too long:** real deadlocks sit idle for N seconds, wasting resources and blocking other transactions.

The wait-for graph gives an **immediate, precise** answer with no false positives.

## InnoDB's Deadlock Detector

MySQL's InnoDB storage engine is the most widely deployed implementation. Let's walk through how it works.

### When detection triggers

InnoDB does **not** run a background thread scanning for deadlocks periodically. Instead, it checks **on demand**: the moment a transaction is about to enter a wait state (because the lock it needs is held by another transaction), the detector runs. This design means:

- No wasted cycles when there's no contention.
- Deadlocks are detected within microseconds of forming.

The entry point is in [`storage/innobase/lock/lock0lock.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/lock/lock0lock.cc). When `lock_rec_enqueue_waiting()` or `lock_table_enqueue_waiting()` is about to put a transaction to sleep, it first calls the deadlock checker.

### The DFS algorithm

InnoDB uses **depth-first search** (DFS) starting from the requesting transaction. It walks backward through the wait-for edges asking: "Can I reach myself?"

```
  DeadlockChecker::check_and_resolve()
  ─────────────────────────────────────
  Input: transaction T that is about to wait for lock L

  1. Start DFS from T
  2. Find who holds lock L → call them {H1, H2, ...}
  3. For each holder Hi:
       a. If Hi == T → CYCLE FOUND (deadlock)
       b. If Hi is also waiting for some lock L2:
            - Push Hi onto stack
            - Recurse: who holds L2?
       c. If Hi is NOT waiting → dead end, backtrack
  4. If DFS completes without finding T → no deadlock, safe to wait
```

Here's a simplified view of the core logic from [`storage/innobase/lock/lock0lock.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/lock/lock0lock.cc) (MySQL 8.0+):

```cpp
class DeadlockChecker {
  const trx_t* m_start;       // transaction that triggered the check
  const lock_t* m_wait_lock;  // the lock it's waiting for
  size_t m_cost;              // DFS steps taken (bounded)
  static const size_t MAX_DEPTH = 200;

  const trx_t* search() {
    // Walk the wait-for graph using DFS
    ut_ad(m_start != nullptr);

    const lock_t* lock = m_wait_lock;
    size_t depth = 0;

    for (;;) {
      // Find the next lock in the queue ahead of our waiting lock
      const lock_t* blocking = find_blocking_lock(lock);

      if (blocking == nullptr) {
        // No more blockers at this level, backtrack
        lock = pop_from_stack();
        if (lock == nullptr) return nullptr;  // exhausted: no deadlock
        continue;
      }

      const trx_t* blocker = blocking->trx;

      if (blocker == m_start) {
        // We've reached ourselves — cycle detected!
        return select_victim(m_start, blocker);
      }

      if (++depth > MAX_DEPTH) {
        // Too deep — treat as deadlock to avoid CPU starvation
        return m_start;
      }

      if (blocker->lock.wait_lock != nullptr) {
        // This blocker is itself waiting — follow the chain
        push_to_stack(lock);
        lock = blocker->lock.wait_lock;
      }
    }
  }
};
```

### Depth limit: a practical safeguard

Notice `MAX_DEPTH = 200`. In pathological cases (thousands of transactions forming long chains), the DFS could consume excessive CPU. InnoDB caps the search depth. If the limit is hit, it **assumes** deadlock and aborts the requesting transaction. This is a conservative choice: it might abort a transaction that wasn't truly deadlocked, but it prevents the detector itself from becoming a bottleneck.

You can monitor this with:

```sql
SHOW ENGINE INNODB STATUS\G
-- Look for: "TOO DEEP OR LONG SEARCH IN THE LOCK TABLE WAITS-FOR GRAPH"
```

### The lock system mutex

In MySQL 5.7 and earlier, the entire deadlock check ran under a single global mutex (`lock_sys->mutex`). This meant:

```
                     MySQL 5.7
  ┌──────────────────────────────────────────────┐
  │          lock_sys->mutex (GLOBAL)            │
  │                                              │
  │  All lock operations serialized here:        │
  │  - Granting locks                            │
  │  - Deadlock detection                        │
  │  - Lock queue manipulation                   │
  │                                              │
  │  Problem: 64+ cores wait on one mutex        │
  └──────────────────────────────────────────────┘
```

MySQL 8.0 introduced **sharded lock system mutexes**. The lock table is partitioned by page (for row locks) and by table (for table locks). Deadlock detection acquires only the relevant shards:

```
                     MySQL 8.0+
  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ shard 0 │  │ shard 1 │  │ shard 2 │  │ shard N │
  │  (page  │  │  (page  │  │  (page  │  │  (page  │
  │  group) │  │  group) │  │  group) │  │  group) │
  └─────────┘  └─────────┘  └─────────┘  └─────────┘

  Deadlock checker: acquires shards as it traverses edges
  Other threads: can operate on unrelated shards concurrently
```

This change dramatically improved throughput under high contention. See [`storage/innobase/lock/lock0lock.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/lock/lock0lock.cc) and the `Shard_latch_guard` class.

## Victim Selection

When a cycle is found, one transaction must die. But which one? The database picks a **victim** — the transaction whose rollback costs the least. InnoDB uses a weight-based heuristic:

```
  victim_weight(T) = undo_log_size(T) + locks_held(T)
```

- **Undo log size:** How many rows has T modified? Rolling back a transaction with 1 million modifications is expensive.
- **Locks held:** How many other transactions is T blocking? Killing a transaction that holds many locks frees more resources.

The lighter transaction (less work to undo) is chosen as the victim:

```cpp
const trx_t* DeadlockChecker::select_victim(
    const trx_t* trx1, const trx_t* trx2) {
  // If one is marked HIGH_PRIORITY, never kill it
  if (trx_is_high_priority(trx1)) return trx2;
  if (trx_is_high_priority(trx2)) return trx1;

  // Compare transaction weights
  if (TRX_WEIGHT(trx1) >= TRX_WEIGHT(trx2)) {
    return trx2;  // kill the lighter one
  }
  return trx1;
}
```

The victim receives error `1213 (ER_LOCK_DEADLOCK)`:

```sql
ERROR 1213 (40001): Deadlock found when trying to get lock;
try restarting transaction
```

Applications should catch this error and **retry** the transaction. Most ORMs and connection pools do this automatically.

## Distributed Deadlock Detection (TiDB)

In a single-node database, the entire wait-for graph fits in one process's memory. In a distributed database like TiDB, locks are spread across many TiKV nodes. A deadlock might involve locks on different machines:

```
  TiKV Node 1                  TiKV Node 2
  ┌──────────────┐             ┌──────────────┐
  │  T1 holds    │             │  T2 holds    │
  │  lock on     │             │  lock on     │
  │  key "alice" │             │  key "bob"   │
  │              │             │              │
  │  T2 waits   │             │  T1 waits    │
  │  for "alice" │             │  for "bob"   │
  └──────────────┘             └──────────────┘

  Neither node sees the full picture alone!
```

TiDB solves this with a **centralized deadlock detector** that runs on a single TiKV node (the leader of Region 1, by convention). The approach:

1. When a transaction encounters a lock conflict on any TiKV node, that node sends a **wait-for entry** `(waiter_txn, holder_txn)` to the deadlock detector.
2. The detector maintains a global wait-for graph in memory.
3. It runs cycle detection on every new edge insertion.
4. If a cycle is found, it responds to the waiter with a deadlock error.

The implementation lives in [`src/server/lock_manager/deadlock.rs`](https://github.com/tikv/tikv/blob/master/src/server/lock_manager/deadlock.rs):

```rust
pub struct DetectTable {
    // wait_for_map: txn_ts -> set of (txn_ts it's waiting for)
    wait_for_map: HashMap<TimeStamp, Vec<WaitForEntry>>,
}

impl DetectTable {
    pub fn detect(&mut self, txn_ts: TimeStamp, lock_ts: TimeStamp) -> bool {
        // Add edge: txn_ts waits for lock_ts
        // Then BFS/DFS from lock_ts to see if we can reach txn_ts
        let mut stack = vec![lock_ts];
        let mut visited = HashSet::new();

        while let Some(current) = stack.pop() {
            if current == txn_ts {
                return true;  // cycle!
            }
            if !visited.insert(current) {
                continue;
            }
            if let Some(entries) = self.wait_for_map.get(&current) {
                for entry in entries {
                    stack.push(entry.lock_ts);
                }
            }
        }
        false
    }
}
```

### Trade-offs of centralized detection

| Aspect | Centralized (TiDB) | Per-node (InnoDB) |
|--------|--------------------|--------------------|
| Completeness | Sees all cross-node deadlocks | Only local deadlocks |
| Latency | Network round-trip to detector | Immediate (in-process) |
| Scalability | Single point processes all edges | Scales with nodes |
| Failure mode | Detector failover causes brief misses | No single point of failure |

TiDB mitigates the single-point concern by keeping a **timeout fallback**: if a transaction waits longer than `innodb_lock_wait_timeout` (default 50s in TiDB), it aborts regardless of whether the deadlock detector is available.

## The Four Conditions for Deadlock

Deadlocks require all four conditions to hold simultaneously (Coffman conditions, 1971):

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  1. Mutual exclusion     Lock grants exclusive access       │
  │  2. Hold and wait        Transaction holds lock A,          │
  │                          then requests lock B               │
  │  3. No preemption        Locks cannot be forcibly taken     │
  │  4. Circular wait        A→B→C→...→A                        │
  │                                                             │
  │  Break ANY one condition → deadlocks become impossible      │
  └─────────────────────────────────────────────────────────────┘
```

Databases typically cannot eliminate conditions 1-3 (they're fundamental to ACID isolation), so they let deadlocks form and detect condition 4 (the cycle).

Some systems prevent deadlocks instead of detecting them:

- **Wait-die / Wound-wait** (Google Spanner): Older transactions always win. Younger ones are either killed immediately or forced to wait, depending on the scheme. No cycles can form because the wait direction is fixed by age.
- **Lock ordering:** If all transactions acquire locks in the same global order (e.g., by primary key), cycles are impossible. But this requires knowing all locks in advance, which is impractical for interactive transactions.

## Practical Tips

### Reading InnoDB deadlock output

```sql
SHOW ENGINE INNODB STATUS\G
```

The `LATEST DETECTED DEADLOCK` section shows:

```
*** (1) TRANSACTION:
TRANSACTION 421937, ACTIVE 0 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 2 lock struct(s), heap size 1136, 1 row lock(s)

*** (1) HOLDS THE LOCK(S):
RECORD LOCKS space id 35 page no 4 n bits 72 index PRIMARY
  of table `bank`.`accounts` trx id 421937 lock_mode X

*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 35 page no 4 n bits 72 index PRIMARY
  of table `bank`.`accounts` trx id 421937 lock_mode X waiting

*** (2) TRANSACTION:
...

*** WE ROLL BACK TRANSACTION (2)
```

### Reducing deadlocks in application code

1. **Keep transactions short.** The longer a transaction holds locks, the higher the chance another transaction will form a conflicting pattern.
2. **Access rows in consistent order.** If two operations both touch accounts A and B, always lock A first, then B.
3. **Use appropriate isolation levels.** `READ COMMITTED` takes fewer gap locks than `REPEATABLE READ`, reducing lock surface area.
4. **Retry on error 1213.** Deadlocks are normal under concurrency. Design your application to retry.

### Disabling the detector

Under extreme write contention (many threads updating the same hot rows), deadlock detection itself can become a bottleneck — threads pile up waiting to run the DFS. MySQL 8.0.1+ provides:

```sql
SET GLOBAL innodb_deadlock_detect = OFF;
```

When disabled, transactions rely purely on `innodb_lock_wait_timeout` (default 50s). This trades detection precision for throughput, and is appropriate only when you know deadlocks are rare and can tolerate longer waits.

## References

1. MySQL 8.0 Reference Manual, InnoDB Deadlock Detection [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-detection.html)
2. MySQL Server source, lock system [`storage/innobase/lock/lock0lock.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/lock/lock0lock.cc)
3. TiKV deadlock detector [`src/server/lock_manager/deadlock.rs`](https://github.com/tikv/tikv/blob/master/src/server/lock_manager/deadlock.rs)
4. TiDB pessimistic transaction docs [doc](https://docs.pingcap.com/tidb/stable/pessimistic-transaction)
5. Coffman, E. G. et al. "System Deadlocks" (1971), Computing Surveys
6. Google Spanner: TrueTime and the CAP Theorem [paper](https://research.google/pubs/spanner-truetime-and-the-cap-theorem/)
7. PostgreSQL deadlock detection [doc](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)
