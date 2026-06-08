---
author: JZ
pubDatetime: 2026-06-08T06:23:00Z
modDatetime: 2026-06-08T06:23:00Z
title: System Design - How Raft Consensus Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, membership changes, and source code walkthrough from the etcd/raft implementation."
---

## Table of contents

## Context

Imagine you have five servers storing the configuration for every microservice in your company. If any one of them dies, the others carry on. But there is a catch: all five must agree on what that configuration looks like at every point in time. A client that writes to server A and then reads from server B must see the same value. This is the **consensus problem**.

More precisely, consensus means getting a group of machines to agree on a sequence of operations even when some machines crash, restart, or experience network delays. As long as a majority of nodes are alive, the system keeps making progress. The practical result is a **replicated state machine**: every node applies the same commands in the same order and therefore ends up in the same state.

Leslie Lamport's Paxos algorithm (1998) was the first widely-known solution. But Paxos is famously hard to understand and even harder to implement correctly. In 2014, Diego Ongaro and John Ousterhout at Stanford published a paper titled "In Search of an Understandable Consensus Algorithm." Their algorithm, **Raft**, decomposes the consensus problem into three clean sub-problems: leader election, log replication, and safety. The paper was designed so that students could learn it in a single sitting.

Today Raft powers production systems you use every day: etcd (the brain of Kubernetes), TiKV (the storage engine behind TiDB), CockroachDB, and HashiCorp Consul.

## The Raft State Machine

### Three Roles

Every Raft node is in exactly one of three states at any time:

```
                   times out,
                   starts election
             +---------------------+
             |                     |
             v                     |
  +----------+      +-----------+      +--------+
  | Follower | ---> | Candidate | ---> | Leader |
  +----------+      +-----------+      +--------+
       ^                  |                 |
       |   discovers      |  discovers      |
       |   higher term    |  higher term    |
       +------------------+-----------------+
```

- **Follower** -- passive. It responds to RPCs from the leader and from candidates but never initiates communication.
- **Candidate** -- a follower whose election timeout fired. It is trying to become leader.
- **Leader** -- handles all client requests. It replicates log entries to followers and sends periodic heartbeats to maintain authority.

### Terms

Raft divides time into **terms**, numbered with consecutive integers. Each term begins with an election. If a candidate wins, it serves as leader for the rest of the term. If the vote splits, the term ends with no leader and a new term starts immediately.

```
  Term 1         Term 2         Term 3         Term 4
|--election--|--normal ops--|--election--|--normal ops--|-->
   leader=A                  (split vote)   leader=C
```

Terms act as a logical clock. Every message carries the sender's current term. If a node receives a message with a higher term, it immediately reverts to follower and updates its own term. If it receives a message with a lower term, it rejects the message.

### Two Core RPCs

Raft needs only two RPCs for normal operation:

1. **RequestVote** -- sent by candidates during elections.
2. **AppendEntries** -- sent by the leader to replicate log entries and as heartbeats (empty payload).

A third RPC, **InstallSnapshot**, handles bringing a far-behind follower up to date.

## Leader Election

### The Story

Picture five servers -- S1 through S5 -- with S1 as the current leader. S1 sends heartbeats every 150ms. Each follower has a randomized **election timeout** chosen uniformly from, say, 300ms to 500ms. As long as heartbeats arrive before the timeout fires, everyone stays a follower.

Now S1's network cable gets unplugged. S2 through S5 stop receiving heartbeats. After S3's timeout fires (say 320ms), S3 transitions to Candidate, increments its term to 2, votes for itself, and sends RequestVote RPCs to all other nodes.

```
  Time ------>

  S1 (Leader)   X (network partition at t=100)
                |
  S2 (Follower) |
                |
  S3 (Follower) |--- timeout at t=420 ---> Candidate (term=2)
                |                           votes for self
                |                           sends RequestVote to S1-S5
                |
  S4 (Follower) |                  receives RequestVote
                |                  has not voted in term 2 --> grants vote
                |
  S5 (Follower) |                  receives RequestVote
                |                  grants vote
                |
  S3            <--- has 3 votes (self + S4 + S5): majority! --->
                     becomes Leader (term=2)
                     immediately sends heartbeats
```

S3 now has a majority (3 out of 5) and becomes leader. S1, still partitioned, remains leader of term 1 in its own view. When the partition heals and S1 receives a message with term 2, it steps down to follower.

### Voting Rules

A node grants its vote only if ALL of these hold:

1. The candidate's term >= the voter's current term.
2. The voter has not already voted for another candidate in this term (each node votes at most once per term).
3. The candidate's log is **at least as up-to-date** as the voter's log (compared by last entry's term first, then index).

Rule 3 is the key safety mechanism. It prevents a node with a stale log from ever becoming leader.

### Randomized Timeouts and Split Votes

If two candidates start elections simultaneously, votes might split so neither gets a majority. Raft handles this elegantly: after a failed election, each candidate picks a new random election timeout before retrying.

```
  Term 3 -- split vote:

  S2: timeout fires --> Candidate, term=3, votes for self
  S4: timeout fires --> Candidate, term=3, votes for self

  S2 sends RequestVote to S4 --> S4 already voted for self, rejects
  S4 sends RequestVote to S2 --> S2 already voted for self, rejects
  S3 votes for S2, S5 votes for S4 --> tied 2-2

  Neither has majority. Both wait random time:
    S2 picks 180ms, S4 picks 350ms
  S2 times out first --> starts term 4, wins election
```

The randomization makes repeated split votes exponentially unlikely.

### PreVote Optimization

In production, etcd/raft implements **PreVote**. Before incrementing its term, a candidate first sends PreVote messages asking "would you vote for me?" If it cannot get a majority of PreVote responses, it does not start a real election. This prevents a partitioned node from bumping its term number and disrupting the cluster when it rejoins.

See [`raft.go` function `hup()`](https://github.com/etcd-io/raft/blob/main/raft.go) for the implementation.

## Log Replication

### How It Works

Once elected, the leader services all client requests. Each request becomes a log entry tagged with the leader's current term and the next index. The leader appends it locally, then sends AppendEntries RPCs to every follower in parallel.

```
  Client          Leader (S1)       Follower S2      Follower S3
    |                 |                  |                |
    |-- PUT x=5 ---->|                  |                |
    |                 | append [idx=6, term=3, "x=5"]    |
    |                 |                  |                |
    |                 |--AppendEntries(prevIdx=5,prevTerm=3,entries=[6])-->
    |                 |--AppendEntries(prevIdx=5,prevTerm=3,entries=[6])-------->
    |                 |                  |                |
    |                 |<-- OK (match) ---|                |
    |                 |<-- OK (match) -------------------|
    |                 |                  |                |
    |                 | majority confirmed: advance commitIndex to 6
    |                 | apply entry 6 to state machine   |
    |<-- OK ---------|                  |                |
    |                 |                  |                |
    |                 | next heartbeat carries leaderCommit=6
    |                 |--AppendEntries(leaderCommit=6)--->|
    |                 |                  | apply entry 6  |
```

### The Commit Index

An entry is **committed** once the leader knows it has been stored on a majority of nodes. The leader maintains a `commitIndex` that it advances as entries are replicated. Followers learn the commit index via the `leaderCommit` field piggy-backed on AppendEntries.

Only committed entries are applied to the state machine. This is what makes the replicated state machine approach work -- every node applies the same prefix of committed entries.

### Log Matching and Consistency Check

Each AppendEntries RPC includes `prevLogIndex` and `prevLogTerm` -- the index and term of the entry immediately before the new entries. The follower checks that it has a matching entry at that position. If it does not, it rejects the RPC.

```
  Leader's log:    [1:t1] [2:t1] [3:t2] [4:t3] [5:t3]
  Follower's log:  [1:t1] [2:t1] [3:t2]

  Leader sends: prevLogIndex=4, prevLogTerm=t3, entries=[5:t3]
  Follower: "I don't have index 4" --> REJECT

  Leader decrements nextIndex, retries:
  Leader sends: prevLogIndex=3, prevLogTerm=t2, entries=[4:t3, 5:t3]
  Follower: "I have [3:t2], match!" --> appends [4:t3, 5:t3], replies OK
```

This mechanism guarantees the **Log Matching Property**: if two entries in different logs share the same index and term, then (a) they store the same command, and (b) all preceding entries are identical.

### Visualizing the Log

```
  Index:    1       2       3       4       5       6
         +-------+-------+-------+-------+-------+-------+
Leader:  | x=1   | y=2   | x=3   | y=1   | z=5   | x=7   |
         | t=1   | t=1   | t=1   | t=2   | t=3   | t=3   |
         +-------+-------+-------+-------+-------+-------+

         +-------+-------+-------+-------+-------+
Node S2: | x=1   | y=2   | x=3   | y=1   | z=5   |
         | t=1   | t=1   | t=1   | t=2   | t=3   |
         +-------+-------+-------+-------+-------+

         +-------+-------+-------+-------+
Node S3: | x=1   | y=2   | x=3   | y=1   |
         | t=1   | t=1   | t=1   | t=2   |
         +-------+-------+-------+-------+

                              ^ committed up to here
                         (replicated on majority: Leader + S2 + S3 >= 3/5)
```

See [`log.go`](https://github.com/etcd-io/raft/blob/main/log.go) for the `raftLog` struct and [`tracker/progress.go`](https://github.com/etcd-io/raft/blob/main/tracker/progress.go) for how the leader tracks each follower's `Match` and `Next` indices.

## Safety: Why Raft is Correct

Three properties together guarantee that Raft never produces inconsistent results.

### The Election Restriction

The voting rule (candidate's log must be at least as up-to-date as the voter's) ensures that any elected leader already contains every committed entry. "Up-to-date" is defined as:

```
Candidate's log is at least as up-to-date if:
  1. Its last entry has a HIGHER term than the voter's last entry, OR
  2. Same last term, but EQUAL or LONGER log length

Example:
  Candidate A: last entry = (index=3, term=2)
  Voter B:     last entry = (index=5, term=1)

  A's last term (2) > B's last term (1) => A is more up-to-date.
  B grants vote even though A's log is shorter.
```

### The Log Matching Property

If two entries in different logs have the same index and term, they contain the same command and all prior entries are also identical. This is enforced inductively by the consistency check in AppendEntries.

### The Leader Completeness Property

Once an entry is committed, it will be present in the log of every future leader. This follows from the Election Restriction: a candidate missing a committed entry cannot get votes from the majority that stored it, so it cannot win.

### The Figure 8 Problem

There is a subtle case: a leader might replicate an entry from a **previous** term to a majority, but this alone is not safe to commit. Why? Because a different server with a higher-term entry could still win an election and overwrite it.

Raft's fix: a leader only advances commitIndex for entries from **its own term**. Once a current-term entry is committed, all prior entries are implicitly committed too. This is why `becomeLeader()` in etcd/raft appends a no-op entry -- it gives the new leader something from its own term to commit.

## Membership Changes

Changing cluster membership (adding or removing nodes) cannot be done atomically across all nodes. Two approaches exist:

### Single-Server Changes (Practical Approach)

Add or remove one node at a time. Any two majorities of consecutive configurations (differing by one node) are guaranteed to overlap by at least one node, preventing split-brain:

```
  3-node cluster: {A, B, C}       majority = 2
  Add D:          {A, B, C, D}    majority = 3

  Any 2 nodes from {A,B,C} and any 3 nodes from {A,B,C,D}
  must share at least 1 member. Safety is preserved.
```

This is what etcd/raft implements. It is simpler and sufficient for most real systems.

### Joint Consensus (Original Paper)

For changing multiple nodes at once, the original paper proposes a two-phase approach where both old and new configurations must independently agree during a transitional period. This is more complex and rarely needed in practice.

## Raft in Practice

Raft is everywhere in modern infrastructure:

- **etcd** -- the key-value store behind Kubernetes. Every Kubernetes cluster runs a Raft group to store all cluster state.
- **TiKV** -- the distributed storage engine for TiDB. Each Region (a range of keys) is a Raft group. TiKV uses a Rust port of etcd/raft.
- **CockroachDB** -- uses Raft per range, similar to TiKV's architecture.
- **HashiCorp Consul** -- service discovery and configuration, backed by Raft.
- **Placement Driver (PD)** in TiDB -- PD itself is an etcd instance. The TSO (Timestamp Oracle) that generates globally-unique timestamps is served by the PD leader, which is elected via Raft. So every timestamp in TiDB's MVCC system ultimately depends on Raft consensus.

The connection is direct: the TSO article describes how PD generates timestamps for TiDB transactions. That PD leader is chosen through Raft consensus running inside embedded etcd. If the PD leader dies, Raft elects a new one, and the TSO resumes on the new leader.

## References

1. Ongaro, D. and Ousterhout, J. (2014). "In Search of an Understandable Consensus Algorithm." USENIX ATC. [https://raft.github.io/raft.pdf](https://raft.github.io/raft.pdf)
2. Ongaro, D. (2014). "Consensus: Bridging Theory and Practice." PhD Dissertation, Stanford. [https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)
3. etcd/raft GitHub repository. [https://github.com/etcd-io/raft](https://github.com/etcd-io/raft)
4. The Secret Lives of Data -- Raft Visualization. [https://thesecretlivesofdata.com/raft/](https://thesecretlivesofdata.com/raft/)
5. Raft Scope -- interactive Raft simulator. [https://raft.github.io/raftscope/](https://raft.github.io/raftscope/)
6. TiKV Deep Dive -- Multi-Raft. [https://tikv.org/deep-dive/scalability/multi-raft/](https://tikv.org/deep-dive/scalability/multi-raft/)
7. etcd documentation on learner design. [https://etcd.io/docs/latest/learning/](https://etcd.io/docs/latest/learning/)
8. Lamport, L. (1998). "The Part-Time Parliament." ACM TOCS 16(2).
