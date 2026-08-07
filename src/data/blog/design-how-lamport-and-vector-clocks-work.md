---
author: JZ
pubDatetime: 2026-08-07T06:00:00Z
modDatetime: 2026-08-07T06:00:00Z
title: System Design - How Lamport Clocks and Vector Clocks Work
tags:
  - design-system
  - design-concurrency
description:
  "How logical clocks solve the ordering problem in distributed systems: Lamport clocks, vector clocks, causal ordering, happens-before relation, and real-world usage in databases like DynamoDB, Riak, and CockroachDB."
---

## Table of contents

## Context

Imagine you have three servers — A, B, and C — each processing user requests. Server A updates a shopping cart, then tells Server B. Meanwhile, Server C independently updates the same cart. When you look at the logs afterward, you see timestamps like:

```
Server A:  10:00:01.003  "set quantity = 2"
Server B:  10:00:01.005  "received update from A"
Server C:  10:00:01.004  "set quantity = 5"
```

Can you trust these wall-clock times? **No.** Each server's clock drifts independently. Server C's `10:00:01.004` might actually have happened *after* Server B's `10:00:01.005` in real time. NTP (Network Time Protocol) can synchronize clocks to within a few milliseconds, but that's not good enough when you need to know which event truly happened first.

This is the **ordering problem** in distributed systems. Leslie Lamport solved it in his 1978 paper ["Time, Clocks, and the Ordering of Events in a Distributed System"](https://lamport.azurewebsites.net/pubs/time-clocks.pdf) — one of the most cited papers in computer science.

## The Happens-Before Relation

Before we build any clock, we need a precise definition of "before." Lamport defined the **happens-before** relation (written →) with three rules:

1. **Same process:** If event `a` happens before event `b` on the same process, then `a → b`.
2. **Message passing:** If event `a` is the sending of a message and event `b` is the receipt of that message, then `a → b`.
3. **Transitivity:** If `a → b` and `b → c`, then `a → c`.

If neither `a → b` nor `b → a`, the events are **concurrent** (written `a ‖ b`). Concurrent doesn't mean "at the same time" — it means neither event could have influenced the other.

```
  Process P1         Process P2         Process P3
  ----------         ----------         ----------
      a                                     
      |                                     
      |--- msg1 --->     b                  
                         |                  
                         |--- msg2 --->  c  
                                        |
                                        d

  Ordering: a → b → c → d  (causal chain via messages)

  But what about event 'e' on P1 that happens after 'a'
  but before msg2 arrives at P3?

  Process P1         Process P2         Process P3
  ----------         ----------         ----------
      a                                     
      |                                     
      e                  b                  
      |                  |                  
      |--- msg1 --->     |--- msg2 --->  c  

  Here: e ‖ b, e ‖ c  (concurrent — no causal link)
```

The happens-before relation captures **causality**: if `a → b`, then `a` *could have influenced* `b`. This is the foundation logical clocks are built on.

## Lamport Clocks

A Lamport clock is the simplest logical clock. Every process maintains a single counter `L`:

**Algorithm:**

1. Before executing any event, increment the counter: `L = L + 1`
2. When sending a message, attach the current `L` value.
3. When receiving a message with timestamp `t`, update: `L = max(L, t) + 1`

That's it. Let's trace through an example:

```
  Process P1 (L=0)       Process P2 (L=0)       Process P3 (L=0)
  ----------------       ----------------       ----------------
  
  event a: L=1                                      
       |                                            
       |--- send(L=1) -->                           
                          recv: L=max(0,1)+1=2       
                          event b: L=2               
                               |                    
                               |--- send(L=2) --->  
                                                    recv: L=max(0,2)+1=3
                                                    event c: L=3
  
  event d: L=2                                      event e: L=4
```

**Key property (the Clock Condition):**

> If `a → b`, then `L(a) < L(b)`.

But the **converse is NOT true**: `L(a) < L(b)` does NOT imply `a → b`. In the trace above, `L(d) = 2` and `L(b) = 2`. We can't tell from Lamport timestamps alone whether `d` and `b` are concurrent or ordered.

This is the fundamental limitation: Lamport clocks can tell you "this might have happened before that" but cannot tell you "these two events are definitely concurrent."

**Implementation in Go (from etcd's Raft library):**

```go
// A simplified view of logical clock usage in etcd/raft.
// The "term" in Raft acts like a Lamport clock for leader elections.
type raft struct {
    Term uint64  // current term (Lamport-style logical clock)
    // ...
}

func (r *raft) send(m pb.Message) {
    m.Term = r.Term  // attach clock to outgoing message
    // ...
}

func (r *raft) Step(m pb.Message) error {
    if m.Term > r.Term {
        r.Term = m.Term  // max(local, received) — Lamport rule
        r.becomeFollower(m.Term, None)
    }
    // ...
}
```

## Vector Clocks

To detect concurrency, we need more information. A **vector clock** gives each process its own counter and tracks *all* processes' counters. If there are `N` processes, each process maintains a vector of `N` integers.

**Algorithm (for process `i` out of N):**

1. Before executing any event, increment your own position: `V[i] = V[i] + 1`
2. When sending a message, attach a copy of the entire vector `V`.
3. When receiving a message with vector `Vm`, update each entry: `V[j] = max(V[j], Vm[j])` for all `j`, then increment your own: `V[i] = V[i] + 1`

Let's trace the same example with 3 processes:

```
  Process P1              Process P2              Process P3
  V = [0,0,0]            V = [0,0,0]            V = [0,0,0]
  ----------------        ----------------        ----------------
  
  event a:
  V = [1,0,0]                                      
       |                                            
       |--- send [1,0,0] -->                        
                           recv [1,0,0]:            
                           V = [max(0,1), max(0,0), max(0,0)]
                             = [1,0,0]              
                           then V[2] += 1           
                           V = [1,1,0]              
                           (event b)                
                                |                   
                                |-- send [1,1,0] -->
                                                    recv [1,1,0]:
                                                    V = [1,1,0]
                                                    then V[3] += 1
                                                    V = [1,1,1]
                                                    (event c)
  
  event d:
  V = [2,0,0]                                      event e:
                                                    V = [1,1,2]
```

**Comparing vector clocks:**

- `V1 ≤ V2` if `V1[i] ≤ V2[i]` for ALL `i`
- `V1 < V2` (V1 happened before V2) if `V1 ≤ V2` and `V1 ≠ V2`
- `V1 ‖ V2` (concurrent) if neither `V1 ≤ V2` nor `V2 ≤ V1`

Let's check `d = [2,0,0]` vs `b = [1,1,0]`:
- Is `d ≤ b`? Check: `2 ≤ 1`? **No.**
- Is `b ≤ d`? Check: `1 ≤ 0`? **No.**
- Therefore: `d ‖ b` — they're concurrent! ✓

This is the power of vector clocks: they can **exactly characterize** the happens-before relation.

> `V(a) < V(b)` **if and only if** `a → b`.

## The Tradeoff

| Property | Lamport Clock | Vector Clock |
|----------|--------------|--------------|
| Space per event | O(1) — one integer | O(N) — N integers |
| Detects ordering (a → b) | Yes | Yes |
| Detects concurrency (a ‖ b) | No | Yes |
| Scalability | Excellent | Degrades with N |

Vector clocks give you perfect causal ordering, but at a cost: every message carries N integers. When N is small (3-10 nodes), this is fine. When N is thousands of clients, it becomes impractical. This has led to several optimizations in practice.

## Conflict Detection with Vector Clocks

The real-world payoff of detecting concurrency: **conflict resolution**. Here's how a key-value store uses vector clocks:

```
  Client X writes key "cart":                Client Y writes key "cart":
  value = {apples: 1}                        value = {bananas: 3}
  clock = [1, 0]                             clock = [0, 1]

          Server receives both writes.
          Compares clocks: [1,0] vs [0,1]
          
          Neither ≤ the other → CONFLICT!

          Resolution strategies:
          1. Last-writer-wins (throw away one)  ← Cassandra default
          2. Return both to client (merge)      ← Riak, DynamoDB
          3. Application-level CRDT merge       ← Riak with CRDTs
```

Without vector clocks, the server would have to guess using wall-clock time (unsafe) or always treat writes as conflicts (too conservative).

## Real-World Usage

### Amazon DynamoDB (Dynamo Paper, 2007)

DynamoDB's original design used vector clocks to track causality across replicas. When a client reads a key, it gets back the value plus its vector clock. On the next write, the client sends the clock back, and DynamoDB can tell if the write supersedes or conflicts with concurrent writes.

In practice, Amazon found that vector clocks grew too large because any coordinator could update a key. They bounded the vector size and used timestamp-based truncation for old entries — trading perfect accuracy for bounded metadata.

### Riak

Riak (a distributed key-value store) used vector clocks extensively. Each write gets a vector clock, and Riak detects siblings (concurrent writes) automatically. The application resolves conflicts by merging siblings — for example, a shopping cart takes the union of items.

Riak later moved to **dotted version vectors**, an optimization that handles client-write patterns more efficiently than plain vector clocks.

### CockroachDB — Hybrid Logical Clocks (HLC)

CockroachDB uses **Hybrid Logical Clocks** — a combination of physical time and a logical counter. The physical component uses wall-clock time (keeping clocks useful for humans), while the logical component breaks ties and ensures the Lamport property:

```
HLC = (physical_time, logical_counter)

Rules:
  - On local event: if wall_time > physical_time:
      physical_time = wall_time, logical = 0
    else:
      logical += 1
      
  - On receive(msg_hlc): 
      physical_time = max(physical_time, msg_physical, wall_time)
      if all three equal: logical = max(local_logical, msg_logical) + 1
      elif physical_time advanced: logical = 0
```

This gives you Lamport-clock causality PLUS wall-clock correlation, at O(1) space. The tradeoff: like Lamport clocks, HLCs cannot detect concurrency. CockroachDB handles this by using a bounded clock-skew assumption and transaction restarts.

### TiDB — Pure Physical TSO

Contrast with TiDB (covered in a [previous post](./design-how-tidb-tso-works)): TiDB uses a centralized Timestamp Oracle that hands out monotonically increasing physical timestamps. This sidesteps the logical clock problem entirely by having a **single point of serialization**. The tradeoff is that all transactions must contact the TSO, which becomes a bottleneck and single point of failure (mitigated by batching and leader election).

## Summary of Logical Clock Families

```
                    Logical Clock Design Space

        Perfect causality               Scalable
        detection                       (O(1) space)
            |                               |
            v                               v
    +---------------+    +---------+    +------------------+
    | Vector Clocks |    |  HLC    |    | Lamport Clocks   |
    | O(N) per msg  |    | O(1)    |    | O(1) per msg     |
    | detects a‖b   |    | causal  |    | causal ordering  |
    +-------+-------+    | + wall  |    | only (no ‖)      |
            |            | time    |    +--------+---------+
            |            +---------+             |
            |                                    |
    +-------v-----------+               +--------v---------+
    | Dotted Version    |               | Centralized TSO  |
    | Vectors (Riak)    |               | (TiDB PD)        |
    | bounded vectors   |               | total order, but |
    | for KV stores     |               | single bottleneck|
    +-------------------+               +------------------+
```

## When to Use What

- **Lamport Clock / HLC:** When you need causal ordering and can tolerate not detecting concurrency. Works well when you have other mechanisms for conflict handling (transactions, locks, single-leader). Examples: Raft term numbers, CockroachDB HLC.

- **Vector Clock:** When you need to detect concurrent updates in a leaderless, multi-writer system. Works when the number of writers is bounded and small. Examples: Dynamo-style databases, collaborative editing.

- **Centralized TSO:** When you need total ordering and can afford a single serialization point. Simplest to reason about. Examples: TiDB, Google Spanner's TrueTime (which uses GPS/atomic clocks instead of a logical approach).

## References

1. Lamport, L. (1978). ["Time, Clocks, and the Ordering of Events in a Distributed System"](https://lamport.azurewebsites.net/pubs/time-clocks.pdf). Communications of the ACM, 21(7), 558-565.
2. Fidge, C. (1988). "Timestamps in Message-Passing Systems That Preserve the Partial Ordering." Australian Computer Science Conference.
3. Mattern, F. (1989). "Virtual Time and Global States of Distributed Systems." Parallel and Distributed Algorithms.
4. DeCandia, G. et al. (2007). ["Dynamo: Amazon's Highly Available Key-value Store"](https://www.allthingsdistributed.com/files/amazon-dynamo-soraj2007.pdf). SOSP.
5. Kulkarni, S. et al. (2014). ["Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases"](https://cse.buffalo.edu/tech-reports/2014-04.pdf). (HLC paper)
6. etcd/raft source: [github.com/etcd-io/raft](https://github.com/etcd-io/raft)
7. CockroachDB HLC implementation: [github.com/cockroachdb/cockroach/pkg/util/hlc](https://github.com/cockroachdb/cockroach/tree/master/pkg/util/hlc)
