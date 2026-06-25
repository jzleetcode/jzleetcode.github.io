---
author: JZ
pubDatetime: 2026-06-25T07:00:00Z
modDatetime: 2026-06-25T07:00:00Z
title: System Design - How Paxos Consensus Works
tags:
  - design-system
  - design-concurrency
description:
  "How Paxos distributed consensus works: the protocol phases, roles (proposer, acceptor, learner), Multi-Paxos optimization, comparison with Raft, and real-world implementations in Google Chubby, Apache ZooKeeper, and Spanner."
---

## Table of contents

## Context

In a distributed system, nodes can crash, messages can be lost, and networks can split. Yet many systems require all nodes to agree on a single value — which node is the leader, what the next log entry should be, or whether a transaction should commit. This is the **consensus problem**.

Leslie Lamport introduced Paxos in his 1989 paper "The Part-Time Parliament" (published 1998). The paper uses a metaphor of Greek legislators on the island of Paxos who must pass decrees despite frequently leaving for their olive groves. Despite the whimsical framing, Paxos became the foundational consensus algorithm used in nearly every production distributed system for two decades.

```
                   The Consensus Problem

  Node A proposes: "value = X"     Node B proposes: "value = Y"
       |                                |
       v                                v
  +----------+  +----------+  +----------+
  | Server 1 |  | Server 2 |  | Server 3 |
  +----------+  +----------+  +----------+
       |              |              |
       +--------------+--------------+
                      |
                      v
            All must agree on ONE value
            (either X or Y, never both)
```

The guarantee: once a majority of nodes agree on a value, that value is **chosen** and can never change, even if nodes crash and recover.

## The Three Roles

Paxos defines three logical roles. A single physical node can play multiple roles simultaneously:

```
  +-------------------+  +-------------------+  +-------------------+
  |     Proposer      |  |     Acceptor      |  |      Learner      |
  |                   |  |                   |  |                   |
  | Suggests values   |  | Votes on          |  | Learns the chosen |
  | Drives protocol   |  | proposals         |  | value             |
  | (often the        |  | (remembers        |  | (often the same   |
  |  client or        |  |  promises and     |  |  nodes as         |
  |  leader)          |  |  accepted values) |  |  acceptors)       |
  +-------------------+  +-------------------+  +-------------------+
```

- **Proposer:** Initiates the protocol by picking a proposal number and suggesting a value. Think of it as the node trying to get the group to agree on something.
- **Acceptor:** The voters. They promise not to accept older proposals and eventually accept a value. A quorum (majority) of acceptors must agree for consensus.
- **Learner:** Observes what was accepted and acts on the chosen value (e.g., applies it to a state machine).

## The Protocol: Two Phases

Paxos operates in two phases. Each proposer selects a globally unique **proposal number** `n` (typically composed from a sequence number and the proposer's ID to ensure uniqueness).

### Phase 1: Prepare / Promise

```
  Proposer                         Acceptors (A1, A2, A3)
     |                                |    |    |
     |--- Prepare(n=5) ------------->|    |    |
     |--- Prepare(n=5) ------------------>|    |
     |--- Prepare(n=5) ----------------------->|
     |                                |    |    |
     |<-- Promise(n=5, none) ---------|    |    |
     |<-- Promise(n=5, none) --------------|    |
     |<-- Promise(n=5, accepted=       --------|
     |         (n=3, val="X"))         |    |    |
     |                                |    |    |
```

1. The proposer sends `Prepare(n)` to all acceptors.
2. Each acceptor checks: "Is `n` greater than any proposal number I've already promised?"
   - **Yes:** The acceptor promises to never accept any proposal with number less than `n`. It replies with the highest-numbered proposal it has **already accepted** (if any).
   - **No:** The acceptor ignores the message (or sends a reject).

The proposer waits for a **majority** of responses before proceeding.

### Phase 2: Accept / Accepted

```
  Proposer                         Acceptors (A1, A2, A3)
     |                                |    |    |
     |  (majority promised for n=5)   |    |    |
     |                                |    |    |
     |  value = highest accepted      |    |    |
     |          from Phase 1          |    |    |
     |  (if none: use own value)      |    |    |
     |                                |    |    |
     |--- Accept(n=5, val="X") ----->|    |    |
     |--- Accept(n=5, val="X") --------->|    |
     |--- Accept(n=5, val="X") ------------>|
     |                                |    |    |
     |<-- Accepted(n=5) -------------|    |    |
     |<-- Accepted(n=5) -----------------|    |
     |<-- Accepted(n=5) ---------------------|
     |                                |    |    |
     v                                |    |    |
  Value "X" is CHOSEN                 |    |    |
  (majority accepted)                 |    |    |
```

3. The proposer picks a value:
   - If any acceptor in Phase 1 reported a previously accepted value, the proposer **must** use the value from the highest-numbered accepted proposal. This is the key safety mechanism.
   - If no acceptor reported any accepted value, the proposer is free to choose its own.
4. The proposer sends `Accept(n, value)` to all acceptors.
5. Each acceptor checks: "Have I promised a proposal number higher than `n`?"
   - **No:** It accepts the proposal and records `(n, value)`.
   - **Yes:** It rejects (a newer proposer arrived).

When a majority of acceptors accept the same proposal, the value is **chosen**.

## Why the Protocol Is Safe

The critical insight is in Phase 2, step 3: a proposer must adopt a previously accepted value. This ensures that once a value is chosen (accepted by a majority), any future proposer will discover it during Phase 1 and be forced to propose that same value.

Let's trace through a scenario:

```
  Timeline ------------------------------------------------->

  Round 1: Proposer P1 with n=1
    Phase 1: gets promises from {A1, A2, A3} -- no prior values
    Phase 2: proposes val="X" to {A1, A2, A3}
             A1 accepts (n=1, "X")
             A2 accepts (n=1, "X")  <-- majority! "X" is chosen
             A3 crashes before accepting

  Round 2: Proposer P2 with n=2 (doesn't know "X" was chosen)
    Phase 1: gets promises from {A2, A3}
             A2 replies: "I accepted (n=1, val='X')"
             A3 replies: "nothing accepted"
    Phase 2: P2 MUST propose "X" (highest accepted from Phase 1)
             Sends Accept(n=2, "X") -- same value preserved!
```

Even though P2 wanted to propose "Y", the protocol forced it to continue with "X". This is how Paxos maintains safety: the chosen value is sticky.

## Liveness: The Dueling Proposers Problem

Paxos guarantees **safety** (never two different values chosen) but not **liveness** (progress). Two proposers can livelock:

```
  P1: Prepare(n=1) --> accepted by majority
  P2: Prepare(n=2) --> accepted by majority (invalidates n=1)
  P1: Accept(n=1)  --> REJECTED (n=2 is higher)
  P1: Prepare(n=3) --> accepted by majority (invalidates n=2)
  P2: Accept(n=2)  --> REJECTED (n=3 is higher)
  P2: Prepare(n=4) --> ...
  (repeat forever)
```

In practice, systems solve this by electing a **distinguished proposer** (leader). Only the leader proposes, eliminating contention. If the leader fails, a new one is elected after a timeout.

## Multi-Paxos: From Single Value to Replicated Log

Basic Paxos agrees on a **single value**. Real systems need to agree on a **sequence** of values (a replicated log). Multi-Paxos runs many instances of Paxos, one per log slot:

```
  Log slot:      1        2        3        4        5
  Consensus: [Paxos1] [Paxos2] [Paxos3] [Paxos4] [Paxos5]
  Value:      "SET     "SET     "DEL     "SET     "SET
               a=1"     b=2"     a"       c=3"     a=4"
```

The key optimization in Multi-Paxos: once a leader is established, it can **skip Phase 1** for subsequent slots. The leader's proposal number is implicitly promised for all future slots until a new leader appears. This reduces consensus from two round-trips to one:

```
  Without Multi-Paxos optimization:
    Slot N:  Prepare --> Promise --> Accept --> Accepted  (2 RTTs)
    Slot N+1: Prepare --> Promise --> Accept --> Accepted  (2 RTTs)

  With stable leader (Multi-Paxos):
    Slot N:  Prepare --> Promise --> Accept --> Accepted  (2 RTTs, first time)
    Slot N+1:                       Accept --> Accepted  (1 RTT!)
    Slot N+2:                       Accept --> Accepted  (1 RTT!)
```

This is why systems with stable leaders (most of the time) achieve high throughput despite using consensus.

## Paxos vs. Raft

Raft (2014) was designed as an "understandable" alternative to Paxos. They solve the same problem but differ in structure:

```
  +--------------------+----------------------------+----------------------------+
  | Aspect             | Paxos                      | Raft                       |
  +--------------------+----------------------------+----------------------------+
  | Leader election    | Separate mechanism          | Built into protocol        |
  |                    | (not specified)             | (term-based voting)        |
  +--------------------+----------------------------+----------------------------+
  | Log replication    | Any slot can be filled      | Sequential, no gaps        |
  |                    | out of order                |                            |
  +--------------------+----------------------------+----------------------------+
  | Membership change  | Not specified in            | Joint consensus or         |
  |                    | original paper              | single-server changes      |
  +--------------------+----------------------------+----------------------------+
  | Understandability  | Notoriously difficult       | Explicitly designed        |
  |                    |                             | for clarity                |
  +--------------------+----------------------------+----------------------------+
  | Safety proof       | Minimal assumptions         | More structured,           |
  |                    |                             | easier to verify           |
  +--------------------+----------------------------+----------------------------+
```

Raft restricts the protocol (e.g., logs must be sequential, only the most up-to-date node can become leader) to make reasoning simpler. Paxos is more general but leaves implementation details unspecified, leading to many variants.

## Real-World Implementations

### Google Chubby (2006)

Chubby is a distributed lock service built on Multi-Paxos. It provides coarse-grained locking and small file storage for Google's infrastructure. The Chubby paper notes that implementing Paxos correctly was significantly harder than the algorithm description suggests — handling disk corruption, leader leases, and group membership changes required careful engineering.

### Apache ZooKeeper — ZAB

ZooKeeper uses the ZooKeeper Atomic Broadcast (ZAB) protocol, which is closely related to Multi-Paxos. ZAB ensures that all state changes are applied in the same order across all replicas. It adds a recovery phase for new leaders to synchronize their state before serving requests.

### Google Spanner — Multi-Paxos

Spanner uses Multi-Paxos for replication within each split (shard). Each split's replicas form a Paxos group, and the leader of that group handles reads and writes. Combined with TrueTime (GPS + atomic clocks), Paxos groups in Spanner achieve externally consistent transactions across continents.

```
  Spanner Architecture (simplified)

  +------ Paxos Group for Split A ------+
  |                                     |
  |  Leader       Follower    Follower  |
  |  (Zone 1)    (Zone 2)   (Zone 3)   |
  |    |             |           |      |
  |    |-- Accept -->|           |      |
  |    |-- Accept ------------>|      |
  |    |             |           |      |
  |  Commit after majority              |
  +-------------------------------------+
```

### etcd — Raft (not Paxos, but equivalent)

etcd chose Raft over Paxos for its clarity, but provides the same consensus guarantees. Kubernetes, TiDB (PD), and many other systems rely on etcd's Raft implementation for coordination.

## The Algorithm in Pseudocode

Here is a complete specification of single-decree Paxos:

```python
# === PROPOSER ===
def propose(value):
    n = next_proposal_number()

    # Phase 1
    promises = []
    for acceptor in all_acceptors:
        reply = send(acceptor, Prepare(n))
        if reply.type == PROMISE:
            promises.append(reply)

    if len(promises) < majority:
        return FAILED  # retry with higher n

    # Phase 2: pick value
    accepted_values = [p.accepted for p in promises if p.accepted]
    if accepted_values:
        value = max(accepted_values, key=lambda a: a.proposal_number).value

    accepteds = []
    for acceptor in all_acceptors:
        reply = send(acceptor, Accept(n, value))
        if reply.type == ACCEPTED:
            accepteds.append(reply)

    if len(accepteds) >= majority:
        broadcast_to_learners(value)
        return CHOSEN(value)
    return FAILED


# === ACCEPTOR ===
class Acceptor:
    promised_n = 0          # highest promised proposal number
    accepted_n = 0          # highest accepted proposal number
    accepted_value = None   # the value we accepted

    def on_prepare(self, n):
        if n > self.promised_n:
            self.promised_n = n
            return Promise(n, self.accepted_n, self.accepted_value)
        return Reject()

    def on_accept(self, n, value):
        if n >= self.promised_n:
            self.promised_n = n
            self.accepted_n = n
            self.accepted_value = value
            return Accepted(n)
        return Reject()
```

## Common Misconceptions

**"Paxos requires 3 nodes."** Paxos works with any odd number of acceptors. You need 2f+1 acceptors to tolerate f failures. Three is the minimum for tolerating one failure.

**"Paxos is slow."** Basic Paxos needs two round-trips. Multi-Paxos with a stable leader needs one round-trip per decision — the same as Raft. The "slow" reputation comes from leader-less scenarios with contention.

**"Paxos and Raft are fundamentally different."** They solve the same problem with the same guarantees. Raft is a specific instantiation of the Multi-Paxos design space with explicit leader election and sequential log commitment. Papers have shown formal equivalence between the two.

## References

1. Lamport, L. "The Part-Time Parliament" (1998) [paper](https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf)
2. Lamport, L. "Paxos Made Simple" (2001) [paper](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
3. Chandra, T. et al. "Paxos Made Live" (2007) [paper](https://research.google/pubs/paxos-made-live-an-engineering-perspective/)
4. Ongaro, D. & Ousterhout, J. "In Search of an Understandable Consensus Algorithm (Raft)" (2014) [paper](https://raft.github.io/raft.pdf)
5. Burrows, M. "The Chubby Lock Service" (2006) [paper](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/)
6. Corbett, J. et al. "Spanner: Google's Globally-Distributed Database" (2012) [paper](https://research.google/pubs/spanner-googles-globally-distributed-database/)
7. Hunt, P. et al. "ZooKeeper: Wait-free Coordination for Internet-scale Systems" (2010) [paper](https://www.usenix.org/legacy/events/atc10/tech/full_papers/Hunt.pdf)
