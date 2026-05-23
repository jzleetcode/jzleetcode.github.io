---
author: JZ
pubDatetime: 2026-05-23T06:23:00Z
modDatetime: 2026-05-23T06:23:00Z
title: System Design - How CRDTs (Conflict-free Replicated Data Types) Work
tags:
  - design-system
  - design-concurrency
description:
  "How CRDTs enable conflict-free replication in distributed systems: state-based vs operation-based approaches, G-Counter, PN-Counter, LWW-Register, OR-Set, and real-world usage in collaborative editing, databases, and caches."
---

## Table of contents

## Context

Imagine you and a colleague are editing the same document simultaneously — you on a flight with spotty Wi-Fi, your colleague at an office. You both type changes. When connectivity returns, both versions must merge into one coherent document without losing either person's work. This is the fundamental problem CRDTs solve.

In distributed systems, data is replicated across multiple nodes for availability and latency. When these replicas accept writes independently (a model called **multi-leader** or **active-active replication**), concurrent updates can conflict. Traditional approaches handle this with either:

1. **Coordination** (consensus protocols like Raft/Paxos) — expensive, high latency, requires quorum
2. **Last-Writer-Wins** — cheap but loses data silently
3. **Manual conflict resolution** — pushes complexity to application developers

CRDTs offer a fourth path: data structures that are **mathematically guaranteed to converge** to the same state on all replicas, regardless of the order updates are received — no coordination required.

```
        The Replication Problem

  Node A                          Node B
  +--------+                      +--------+
  | x = 1  |                      | x = 1  |
  +--------+                      +--------+
      |                                |
      | set x = 2                      | set x = 3
      v                                v
  +--------+                      +--------+
  | x = 2  |                      | x = 3  |
  +--------+                      +--------+
      |                                |
      +-------> sync <-----------------+
               ?????
          What should x be?

  With CRDTs, the answer is deterministic
  regardless of sync order.
```

The term CRDT was formalized by Marc Shapiro et al. in their 2011 paper ["Conflict-free Replicated Data Types"](https://hal.inria.fr/inria-00609399/document). The key insight: if your merge function forms a **join-semilattice** (associative, commutative, and idempotent), then all replicas will converge.

## Two Flavors of CRDTs

CRDTs come in two fundamental variants:

### State-based CRDTs (CvRDTs — Convergent)

Each replica holds the full state. Periodically, replicas send their entire state to others. The receiver **merges** the incoming state with its local state using a deterministic merge function.

```
  State-based CRDT (CvRDT)

  Replica A              Replica B
  +----------+           +----------+
  | state: S1|           | state: S2|
  +-----+----+           +----+-----+
        |    send full state  |
        +-------------------->|
        |                     | merge(S2, S1) = S3
        |                     v
        |                +----------+
        |                | state: S3|
        |<---------------+----------+
        | merge(S1, S3)       |
        v                     |
  +----------+                |
  | state: S4|                |
  +----------+                |

  Requirement: merge must be commutative,
  associative, and idempotent (a semilattice join)
```

**Pros:** Simple protocol — just ship state, any transport works (gossip, etc.)
**Cons:** State can be large; sending the full state is expensive for big data structures

### Operation-based CRDTs (CmRDTs — Commutative)

Instead of shipping state, replicas broadcast the **operations** they performed. Each replica applies received operations to its local state.

```
  Operation-based CRDT (CmRDT)

  Replica A              Replica B
  +----------+           +----------+
  | state: S |           | state: S |
  +-----+----+           +----+-----+
        |                     |
   op: add(x)           op: add(y)
        |                     |
        | broadcast op        | broadcast op
        +-------------------->|
        |<--------------------+
        |                     |
   apply add(y)         apply add(x)
        v                     v
  +----------+           +----------+
  | state: S'|           | state: S'|   <-- same!
  +----------+           +----------+

  Requirement: operations must commute
  Delivery: exactly-once, causal order
```

**Pros:** Only sends small operation messages
**Cons:** Requires reliable broadcast with causal ordering (harder infrastructure)

In practice, both variants are equivalent in expressiveness — any CvRDT can be expressed as a CmRDT and vice versa.

## The Math: Why It Works

The convergence guarantee comes from **lattice theory**. A join-semilattice is a set with a binary operation $\sqcup$ (join) such that:

- **Commutative:** $a \sqcup b = b \sqcup a$
- **Associative:** $(a \sqcup b) \sqcup c = a \sqcup (b \sqcup c)$
- **Idempotent:** $a \sqcup a = a$

These three properties mean:
- Order doesn't matter (commutative) — so network reordering is fine
- Grouping doesn't matter (associative) — so partial syncs are fine
- Duplicates don't matter (idempotent) — so at-least-once delivery is fine

The "join" always moves state **upward** in the lattice (toward a supremum), never backward. Once all replicas have received all updates, they all sit at the same point in the lattice.

## Building Block: G-Counter (Grow-only Counter)

The simplest useful CRDT. Each of $N$ replicas maintains its own local counter. The global count is the sum of all local values.

```
  G-Counter with 3 replicas

  State: vector of counts, one per replica
  [A: 0, B: 0, C: 0]   (initial)

  Replica A increments:
  [A: 1, B: 0, C: 0]

  Replica B increments twice:
  [A: 0, B: 2, C: 0]

  After sync, all replicas hold:
  [A: 1, B: 2, C: 0]

  value() = 1 + 2 + 0 = 3

  Merge rule: element-wise max
  merge([1,0,0], [0,2,0]) = [max(1,0), max(0,2), max(0,0)]
                           = [1, 2, 0]
```

Implementation in pseudocode:

```python
class GCounter:
    def __init__(self, replica_id, n_replicas):
        self.id = replica_id
        self.counts = [0] * n_replicas

    def increment(self):
        self.counts[self.id] += 1

    def value(self):
        return sum(self.counts)

    def merge(self, other):
        for i in range(len(self.counts)):
            self.counts[i] = max(self.counts[i], other.counts[i])
```

Why does this work? Each replica only increments its own slot, so there are never conflicting writes to the same slot. The `max` merge is idempotent, commutative, and associative. The value only ever increases (hence "grow-only").

## PN-Counter (Positive-Negative Counter)

A G-Counter can only go up. What if we need decrements? Use **two** G-Counters: one for increments ($P$) and one for decrements ($N$). The value is $P - N$.

```
  PN-Counter

  P-counter: [A: 3, B: 1, C: 0]   (increments)
  N-counter: [A: 1, B: 0, C: 2]   (decrements)

  value() = sum(P) - sum(N)
          = (3+1+0) - (1+0+2)
          = 4 - 3
          = 1

  increment(): P[my_id] += 1
  decrement(): N[my_id] += 1
  merge(): merge P-counters, merge N-counters independently
```

This is elegant: we decomposed a harder problem (counter with decrements) into two instances of a simpler solved problem (grow-only counter).

## LWW-Register (Last-Writer-Wins Register)

A register holds a single value. When two replicas write different values concurrently, we resolve the conflict by attaching a timestamp to each write and keeping the one with the highest timestamp.

```
  LWW-Register

  Replica A: set("hello", t=10)
  Replica B: set("world", t=12)

  After merge: value = "world" (t=12 > t=10)

  State: (value, timestamp)
  merge((v1,t1), (v2,t2)) = if t1 > t2 then (v1,t1)
                             else (v2,t2)
```

```python
class LWWRegister:
    def __init__(self):
        self.value = None
        self.timestamp = 0

    def set(self, value, timestamp):
        if timestamp > self.timestamp:
            self.value = value
            self.timestamp = timestamp

    def merge(self, other):
        if other.timestamp > self.timestamp:
            self.value = other.value
            self.timestamp = other.timestamp
```

**Caveat:** LWW is technically "conflict-free" but it **discards** concurrent writes silently. It's the simplest register CRDT but not always desirable. For this reason, Amazon's DynamoDB and Apache Cassandra (which use LWW) can lose writes under concurrent access — by design.

## OR-Set (Observed-Remove Set)

Sets are trickier. Consider: Replica A adds element $x$, Replica B concurrently removes $x$. After merge, should $x$ be in the set?

The **OR-Set** (Observed-Remove Set) says: a remove only affects adds that the remover has **observed**. If a concurrent add happens that the remover hasn't seen, the add wins.

The trick: tag each add with a unique identifier.

```
  OR-Set (Observed-Remove Set)

  State: set of (element, unique-tag) pairs

  add(x):
    generate fresh tag t
    insert (x, t) into local set

  remove(x):
    remove ALL pairs (x, *) currently visible locally

  Concurrent scenario:

  Replica A                    Replica B
  add("egg", tag=a1)          (observes "egg" with tag a1)
                               remove("egg")
                               --> removes (egg, a1)
  add("egg", tag=a2)          (hasn't seen a2)

  After merge:
  A has: {(egg, a2)}
  B has: {}
  merge = {(egg, a2)}   <-- "egg" survives!

  The concurrent add (a2) was not observed by B's remove,
  so it is preserved. Add wins over concurrent remove.
```

```python
class ORSet:
    def __init__(self):
        self.elements = set()  # set of (value, unique_tag) pairs

    def add(self, value):
        tag = generate_unique_id()
        self.elements.add((value, tag))

    def remove(self, value):
        # Remove only pairs we can currently see
        to_remove = {(v, t) for (v, t) in self.elements if v == value}
        self.elements -= to_remove

    def lookup(self, value):
        return any(v == value for (v, _) in self.elements)

    def value(self):
        return {v for (v, _) in self.elements}

    def merge(self, other):
        # Union of both sets (unique tags prevent duplication issues)
        self.elements = self.elements | other.elements
```

In practice, OR-Sets can grow unboundedly (removed tags accumulate as tombstones). Optimized variants like the **Optimized OR-Set** use vector clocks to compress the tag space.

## Real-World Applications

### Redis CRDTs (Redis Enterprise)

Redis Enterprise offers [Active-Active Geo-Distribution](https://redis.io/docs/latest/operate/rs/databases/active-active/) using CRDTs under the hood. Each Redis data type has a CRDT counterpart:

- Strings → LWW-Register
- Counters → PN-Counter
- Sets → OR-Set
- Sorted Sets → specialized CRDT with score merging

### Riak (Basho, now Riak KV)

Riak was one of the first production databases to ship CRDTs as first-class types (counters, sets, maps, registers, flags). The implementation follows Shapiro's paper closely and exposes CRDTs via a typed bucket API.

### Automerge and Yjs (Collaborative Editing)

[Automerge](https://github.com/automerge/automerge) and [Yjs](https://github.com/yjs/yjs) are libraries for building collaborative applications (like Google Docs). They model text as a sequence CRDT — each character has a unique position identifier that allows concurrent inserts to be deterministically ordered without coordination.

```
  Collaborative text editing with a sequence CRDT

  User A types "H" at position 0:   H
  User B types "i" at position 1:   Hi

  Concurrently:
  User A inserts "e" between H and i
  User B inserts "!" after i

  Sequence positions use fractional indexing:
  H (0.1) -> e (0.15) -> i (0.2) -> ! (0.3)

  Result on both replicas: "Hei!"
  No conflicts, no coordination needed.
```

### Apple Notes and Figma

Apple uses CRDTs for syncing Notes across devices. Figma uses a custom CRDT-like approach for real-time multiplayer design collaboration, where each object property is essentially an LWW-Register with Lamport timestamps.

## Trade-offs and Limitations

CRDTs are not a silver bullet:

| Aspect | CRDTs | Consensus (Raft/Paxos) |
|--------|-------|------------------------|
| Availability | Always writable (AP) | Blocked without quorum (CP) |
| Latency | Local writes, async sync | Round-trip to leader |
| Consistency | Eventual | Strong (linearizable) |
| Conflict handling | Automatic, semantic | No conflicts (single leader) |
| Expressiveness | Limited operations | Arbitrary state machines |
| Space overhead | Can grow (tombstones, vectors) | Minimal |

Key limitations:

1. **Not all operations can be CRDTs.** You cannot build a CRDT for a bank account that must never go negative — that requires coordination.
2. **Tombstone accumulation.** Deleted elements often leave metadata behind. Garbage collection requires coordination (ironic!), though bounded approaches exist.
3. **Semantic gaps.** A CRDT counter that reads 5 never "meant" 5 at any point in real time — it's the merged result of distributed increments. Applications must tolerate this.
4. **Metadata overhead.** Vector clocks, unique tags, and version vectors grow with the number of replicas or operations.

## Source Code: Automerge's Counter

Here's how [Automerge](https://github.com/automerge/automerge) implements a counter in its Rust core (`rust/automerge/src/types.rs`). The counter value is stored per-replica and merged by summing increments:

```rust
// From automerge's internal representation
// Each counter operation carries a delta (increment amount)
// The merged value = initial_value + sum(all increments from all replicas)

pub(crate) struct Counter {
    start: i64,
    // increments tracked per-operation via the op-log
}

impl Counter {
    pub fn value(&self, increments: &[i64]) -> i64 {
        self.start + increments.iter().sum::<i64>()
    }
}
```

The actual merge happens in the operation log — Automerge treats all changes as an append-only log of operations, and the counter's current value is computed by replaying all increment operations.

## Summary

```
  CRDT Family Overview

  +------------------+----------------------------+----------------+
  |  CRDT            |  Merge Strategy            |  Use Case      |
  +------------------+----------------------------+----------------+
  |  G-Counter       |  element-wise max          |  page views    |
  |  PN-Counter      |  two G-Counters (P - N)    |  likes/unlikes |
  |  LWW-Register    |  highest timestamp wins    |  user profiles |
  |  MV-Register     |  keep all concurrent vals  |  shopping cart |
  |  G-Set           |  union                     |  tag lists     |
  |  OR-Set          |  tagged union + remove     |  inventories   |
  |  LWW-Map         |  per-key LWW-Register      |  config/KV     |
  |  RGA/Sequence    |  fractional positioning    |  text editing  |
  +------------------+----------------------------+----------------+
```

The mental model: CRDTs trade **expressiveness** for **availability**. They cannot express arbitrary invariants (like "balance >= 0"), but for the operations they do support, they guarantee convergence without any coordination. In a world of globally distributed applications — collaborative editors, multi-region databases, offline-first mobile apps — that trade-off is often exactly right.

## References

1. Shapiro, M., Preguica, N., Baquero, C., & Zawirski, M. (2011). [Conflict-free Replicated Data Types](https://hal.inria.fr/inria-00609399/document). SSS 2011.
2. Shapiro, M. et al. (2011). [A comprehensive study of Convergent and Commutative Replicated Data Types](https://hal.inria.fr/inria-00555588/document). INRIA Technical Report.
3. Kleppmann, M., & Beresford, A. R. (2017). [A Conflict-Free Replicated JSON Datatype](https://arxiv.org/abs/1608.03960). IEEE TPDS.
4. Automerge. [GitHub Repository](https://github.com/automerge/automerge).
5. Yjs. [GitHub Repository](https://github.com/yjs/yjs).
6. Kleppmann, M. (2017). *Designing Data-Intensive Applications*. O'Reilly. Chapter 5: Replication.
7. Redis. [Active-Active Geo-Distributed CRDTs](https://redis.io/docs/latest/operate/rs/databases/active-active/).
