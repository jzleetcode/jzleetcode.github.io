---
author: JZ
pubDatetime: 2026-05-18T06:23:00Z
modDatetime: 2026-05-18T06:23:00Z
title: System Design - How the Raft Consensus Algorithm Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, membership changes, and source code walkthrough from the etcd/raft implementation."
---

## Table of contents

## Context

Imagine you are building a key-value store that must stay available even if one of three servers crashes. Every server should agree on the same sequence of writes. This is the **consensus problem**: getting a group of machines to agree on a single value (or sequence of values) despite crashes, network partitions, and message delays.

### Why is this hard?

Consider three servers. A client sends "SET x=1" to server A. Before A can tell B and C, it crashes. Now B and C have no idea about x=1. When A recovers, did the write succeed? Who decides?

The fundamental tension is:
- We want **availability** (the system keeps serving requests)
- We want **consistency** (all nodes agree on the same state)
- Failures are inevitable

### The Paxos Era

Leslie Lamport's Paxos algorithm (1989, published 1998) solved consensus but was notoriously difficult to understand and implement. As Lamport himself noted, many people found his paper impenetrable. Real implementations (like Google's Chubby) deviated substantially from the published protocol.

### Raft: Designed for Understandability

In 2014, Diego Ongaro and John Ousterhout published "In Search of an Understandable Consensus Algorithm" at USENIX ATC. Their key insight was that consensus could be decomposed into mostly independent subproblems:

1. **Leader election** -- pick one server to be in charge
2. **Log replication** -- the leader coordinates writes
3. **Safety** -- guarantee that all servers execute the same commands in the same order

This decomposition is what makes Raft comprehensible. Let us walk through each piece.

## The Three Roles

Every server in a Raft cluster is in exactly one of three states at any given moment:

```
                    times out,
                    starts election
               +-------------------+
               |                   |
               v                   |
         +-----------+       +-----------+
    +--->| Follower  |------>| Candidate |
    |    +-----------+       +-----------+
    |         ^                    |
    |         |   discovers        | receives majority
    |         |   current leader   | of votes
    |         |   or new term      v
    |         |              +-----------+
    |         +--------------| Leader    |
    |                        +-----------+
    |                              |
    +------------------------------+
          discovers server with higher term
```

**Follower**: The default state. Passively waits for RPCs from the leader. If it hears nothing for a while (the **election timeout**), it becomes a candidate.

**Candidate**: Actively trying to become leader. Votes for itself and sends RequestVote RPCs to all other servers.

**Leader**: Handles all client requests. Sends AppendEntries RPCs (heartbeats + log entries) to followers.

### Terms: Raft's Logical Clock

Raft divides time into **terms**, numbered with consecutive integers:

```
  Term 1       Term 2         Term 3       Term 4
|----------|-------------|-------------|--------->
 election   normal       election      normal
 + normal   operation    (split vote)  operation
 operation               no leader
                         elected
```

Each term begins with an election. If a candidate wins, it serves as leader for the rest of that term. If no one wins (split vote), the term ends with no leader and a new term begins immediately.

Terms act as a logical clock. Every RPC includes the sender's term number. If a server receives an RPC with a higher term, it updates its own term and reverts to follower. If a server receives a stale RPC (lower term), it rejects it.

## Leader Election

### The Happy Path

When a follower's election timeout fires (typically 150-300ms, randomized):

```
  Server A (Follower)     Server B (Follower)     Server C (Follower)
       |                        |                        |
       | election timeout!      |                        |
       |                        |                        |
       | becomes Candidate      |                        |
       | increments term to 2   |                        |
       | votes for self         |                        |
       |                        |                        |
       |---RequestVote(term=2)->|                        |
       |---RequestVote(term=2)-------------------------->|
       |                        |                        |
       |<--VoteGranted(term=2)--|                        |
       |<--VoteGranted(term=2)---------------------------|
       |                        |                        |
       | majority! becomes Leader                        |
       |                        |                        |
       |---AppendEntries(heartbeat)----->|               |
       |---AppendEntries(heartbeat)--------------------->|
       |                        |                        |
```

### Key Rules for Voting

A server grants its vote if **all** of the following hold:
1. The candidate's term is >= the voter's current term
2. The voter has not already voted for someone else in this term
3. The candidate's log is at least as up-to-date as the voter's (more on this later)

Each server votes for **at most one** candidate per term. This ensures at most one leader per term.

### Handling Split Votes

If two candidates start elections simultaneously, votes might split and nobody gets a majority. Raft handles this with **randomized election timeouts**:

```
  Server A (Candidate)    Server B (Candidate)    Server C (Follower)
       |                        |                        |
       | term=2, votes self     | term=2, votes self     |
       |                        |                        |
       |---RequestVote--------->| (rejected, voted self) |
       |<--RequestVote----------| (rejected, voted self) |
       |---RequestVote---------------------------------->|
       |                        |---RequestVote--------->| (already voted A)
       |<--VoteGranted-----------------------------------|
       |                        |<--VoteRejected---------|
       |                        |                        |
       | 2 votes (self + C)     | 1 vote (self only)    |
       | majority! Leader!      | times out, new term    |
```

The randomized timeout (each server picks a different random value in [150ms, 300ms]) makes it extremely unlikely that two servers time out simultaneously again.

### etcd/raft Source: stepCandidate

In the etcd/raft implementation, the candidate's message handling lives in the `stepCandidate` function:

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func stepCandidate(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgVoteResp:
        gr, rj, res := r.poll(m.From, m.Type, !m.Reject)
        switch res {
        case quorum.VoteWon:
            if r.state == StatePreCandidate {
                r.campaign(campaignElection)
            } else {
                r.becomeLeader()
                r.bcastAppend()
            }
        case quorum.VoteLost:
            r.becomeFollower(r.Term, None)
        }
    case pb.MsgApp:
        r.becomeFollower(m.Term, m.From)
        r.handleAppendEntries(m)
    case pb.MsgSnap:
        r.becomeFollower(m.Term, m.From)
        r.handleSnapshot(m)
    }
    return nil
}
```

Key observations:
- `r.poll()` tallies votes and checks if quorum is reached
- On winning, the candidate becomes leader and immediately broadcasts AppendEntries
- If it receives an AppendEntries from a legitimate leader, it steps down to follower

### PreVote: Avoiding Disruption

etcd/raft implements an optimization called **PreVote**. Before incrementing its term and starting a real election, a candidate first sends PreVote messages to check if it *could* win. This prevents a partitioned server from incrementing its term unnecessarily and disrupting the cluster when it rejoins.

## Log Replication

Once a leader is elected, it begins serving client requests. Every client command goes through the leader's log before being applied to the state machine.

### The Log Structure

```
  Index:    1       2       3       4       5       6
         +-------+-------+-------+-------+-------+-------+
Leader:  | x=1   | y=2   | x=3   | y=1   | z=5   | x=7   |
         | t=1   | t=1   | t=1   | t=2   | t=2   | t=2   |
         +-------+-------+-------+-------+-------+-------+

         +-------+-------+-------+-------+-------+
Node B:  | x=1   | y=2   | x=3   | y=1   | z=5   |
         | t=1   | t=1   | t=1   | t=2   | t=2   |
         +-------+-------+-------+-------+-------+

         +-------+-------+-------+-------+
Node C:  | x=1   | y=2   | x=3   | y=1   |
         | t=1   | t=1   | t=1   | t=2   |
         +-------+-------+-------+-------+

                              ^
                         committed
                     (replicated to majority)
```

Each log entry contains:
- A **command** for the state machine (e.g., "SET x=3")
- The **term** in which the leader received the entry
- An **index** (position in the log)

### The Replication Flow

```
  Client        Leader           Follower B       Follower C
    |              |                  |                |
    |--SET x=7---->|                  |                |
    |              |                  |                |
    |              | append to local  |                |
    |              | log at index 6   |                |
    |              |                  |                |
    |              |--AppendEntries-->|                |
    |              |   (prevIdx=5,    |                |
    |              |    prevTerm=2,   |                |
    |              |    entries=[x=7])|                |
    |              |--AppendEntries------------------>|
    |              |                  |                |
    |              |<--Success--------|                |
    |              |<--Success------------------------|
    |              |                  |                |
    |              | majority ack!    |                |
    |              | commit index=6   |                |
    |              | apply to state   |                |
    |              | machine          |                |
    |              |                  |                |
    |<--OK---------|                  |                |
    |              |                  |                |
    |              | next heartbeat   |                |
    |              | includes         |                |
    |              | leaderCommit=6   |                |
    |              |--AppendEntries-->|                |
    |              |   (leaderCommit=6)               |
    |              |                  |                |
    |              |                  | apply entries  |
    |              |                  | up to index 6  |
```

### The Log Matching Property

Raft maintains a crucial invariant: **if two entries in different logs have the same index and term, they store the same command, and all preceding entries are also identical.**

This is enforced through the `prevLogIndex` and `prevLogTerm` fields in AppendEntries. The leader includes the index and term of the entry immediately preceding the new entries. A follower rejects the RPC if it does not have a matching entry, forcing the leader to back up.

### Handling Inconsistencies

When a new leader takes over, followers' logs may diverge from the leader's. The leader handles this by maintaining a `nextIndex` for each follower:

```
  Leader's log:   [1:t1] [2:t1] [3:t2] [4:t2] [5:t3]
  Follower's log: [1:t1] [2:t1] [3:t2] [4:t3]   <-- divergent at 4!

  Leader sends AppendEntries(prevIdx=4, prevTerm=t2, entries=[5:t3])
  Follower rejects: "I have term t3 at index 4, not t2"
  Leader decrements nextIndex to 4
  Leader sends AppendEntries(prevIdx=3, prevTerm=t2, entries=[4:t2, 5:t3])
  Follower accepts: deletes index 4 onward, appends leader's entries
```

### etcd/raft Source: stepLeader

The leader's message handling in etcd/raft:

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func stepLeader(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgProp:  // client proposal
        if len(m.Entries) == 0 {
            return ErrProposalDropped
        }
        if r.prs.Progress[r.id] == nil {
            return ErrProposalDropped
        }
        r.appendEntry(m.Entries...)
        r.bcastAppend()
        return nil

    case pb.MsgAppResp:  // follower response to AppendEntries
        pr := r.prs.Progress[m.From]
        if m.Reject {
            // follower's log diverges, back up nextIndex
            if pr.MaybeDecrTo(m.Index, m.RejectHint) {
                r.sendAppend(m.From)
            }
        } else {
            pr.MaybeUpdate(m.Index)
            if r.maybeCommit() {
                r.bcastAppend()  // notify followers of new commit
            }
        }
    }
    return nil
}
```

Key points:
- Client proposals (`MsgProp`) are appended locally and broadcast
- On success responses, the leader updates progress and attempts to advance the commit index
- On rejections, the leader decrements `nextIndex` and retries

### The maybeCommit Function

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func (r *raft) maybeCommit() bool {
    mci := r.prs.Committed()
    return r.raftLog.maybeCommit(mci, r.Term)
}
```

This checks: "What is the highest index replicated to a majority?" If that index has the current leader's term, it can be committed. (Why the term check matters is explained in the next section.)

## Safety: The Election Restriction

A critical safety property of Raft is: **a leader for any given term contains all entries committed in previous terms.** This is enforced during elections.

### The "Up-to-Date" Check

When a server receives a RequestVote, it compares the candidate's log to its own:

```
Candidate's log is "at least as up-to-date" if:
  1. Its last entry has a HIGHER term than the voter's last entry, OR
  2. Same last term but EQUAL or LONGER log
```

```
  Candidate A: [1:t1] [2:t1] [3:t2]         last=(idx=3, term=2)
  Server B:    [1:t1] [2:t1] [3:t1] [4:t1]  last=(idx=4, term=1)

  A's last term (2) > B's last term (1) => A is more up-to-date
  B votes for A even though A has fewer entries!
```

This makes intuitive sense: the entry with the higher term must have been created by a more recent leader, who (by induction) already had all committed entries.

### Why This Matters

Without this restriction, a server with a stale log could become leader and overwrite committed entries -- violating the core safety guarantee. The election restriction ensures that only servers with complete information can lead.

## Commit Rules: The Figure 8 Problem

There is a subtle but critical rule: **a leader only counts replicas of entries from its own term when advancing the commit index.**

### The Dangerous Scenario

Consider this sequence (from Figure 8 of the Raft paper):

```
Time -->  (a)      (b)       (c)        (d)        (e)

S1:      [1:t1]   [1:t1]    [1:t1]     [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]     [2:t2]
                             [3:t4]     [3:t4]     [3:t4]
                                                   [4:t4]

S2:      [1:t1]   [1:t1]    [1:t1]     [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]     [2:t2]
                                                   [3:t4]
                                                   [4:t4]

S3:      [1:t1]   [1:t1]    [1:t1]     [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]     [2:t2]
                                                   [3:t4]
                                                   [4:t4]

S4:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
                   [2:t3]    [2:t3]     [2:t3]

S5:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
                   [2:t3]    [2:t3]     [2:t3]
                             [3:t5]     [3:t5]
```

Step by step:
- **(a)**: S1 is leader in term 2, replicates entry [2:t2] only to S2
- **(b)**: S1 crashes. S5 wins election in term 3 (votes from S3, S4, self), accepts entry [2:t3]
- **(c)**: S5 crashes. S1 wins term 4, replicates [2:t2] to S3 (now on majority: S1, S2, S3)
- **(d)**: If S1 commits [2:t2] based on majority replication and then crashes, S5 could win term 5 (its log [1:t1][2:t3] has last term 3 > 2, so it is "more up-to-date" than S2/S3 who have last term 2). S5 would overwrite the committed entry!

The solution: **S1 in term 4 must NOT commit entry [2:t2] based on replication count alone.** Instead, it must commit a new entry [3:t4] from its own term. Once [3:t4] is committed (replicated to majority), all preceding entries are implicitly committed too. Now S5 cannot win because any majority voter will have entries with term >= 4.

This is why `maybeCommit` checks `r.Term`:

```go
func (l *raftLog) maybeCommit(maxIndex, term uint64) bool {
    if maxIndex > l.committed &&
        l.zeroTermOnOutOfBounds(l.term(maxIndex)) == term {
        l.commitTo(maxIndex)
        return true
    }
    return false
}
```

## Log Compaction (Snapshotting)

### The Problem

A Raft log grows without bound. A server that has been running for months might have millions of entries. This causes:
- Disk usage grows forever
- Replaying the entire log on restart takes too long
- Sending the full log to a new server is prohibitive

### The Solution: Snapshots

Each server independently takes a snapshot of its state machine at some committed index, then discards all log entries up to that index:

```
Before snapshot:
  Log: [1:t1] [2:t1] [3:t2] [4:t2] [5:t3] [6:t3] [7:t3]
  State machine: {x=3, y=2, z=5}
  Last applied: 7

After snapshot at index 5:
  Snapshot: {x=3, y=2}  (state at index 5)
  Log: [6:t3] [7:t3]
  Metadata: lastIncludedIndex=5, lastIncludedTerm=t3
```

### InstallSnapshot RPC

When the leader needs to bring a very slow follower up to date, it may find that the required entries have already been discarded. In this case, it sends an `InstallSnapshot` RPC:

```
  Leader                             Slow Follower
    |                                     |
    | nextIndex[follower] = 3             |
    | but log starts at index 100         |
    | (entries 1-99 are snapshotted)      |
    |                                     |
    |---InstallSnapshot(snapshot)-------->|
    |   lastIncludedIndex=99              |
    |   lastIncludedTerm=t5               |
    |   data=[full state machine state]   |
    |                                     |
    |                                     | discard entire log
    |                                     | load snapshot as state
    |                                     | set lastApplied=99
    |                                     |
    |<--Success---------------------------|
    |                                     |
    | nextIndex[follower] = 100           |
    | resume normal AppendEntries         |
```

In etcd/raft, the application is responsible for snapshot management via the `Storage` interface:

```go
// https://github.com/etcd-io/raft/blob/main/storage.go
type Storage interface {
    InitialState() (pb.HardState, pb.ConfState, error)
    Entries(lo, hi, maxSize uint64) ([]pb.Entry, error)
    Term(i uint64) (uint64, error)
    LastIndex() (uint64, error)
    FirstIndex() (uint64, error)
    Snapshot() (pb.Snapshot, error)
}
```

## Membership Changes (Joint Consensus)

### The Problem

Adding or removing servers from a Raft cluster is dangerous. If we simply switch from a 3-node to a 4-node configuration, there might be a moment where two different majorities can form under the old and new configs simultaneously -- yielding two leaders.

```
Old config: {A, B, C}        Majority = 2
New config: {A, B, C, D, E}  Majority = 3

Dangerous moment:
  Old majority: {A, B} elects leader (2/3)
  New majority: {C, D, E} elects leader (3/5)
  Two leaders exist simultaneously!
```

### Joint Consensus

Raft's original solution uses a transitional **joint configuration** where both old and new configs must agree:

```
  Phase 1:            Phase 2:             Phase 3:
  C_old               C_old,new            C_new
  (old config)        (joint consensus)    (new config)

  +----------+     +-----------------+     +----------+
  | {A,B,C}  | --> | {A,B,C}+{A,B,  | --> | {A,B,C,  |
  |          |     |  C,D,E}         |     |  D,E}    |
  +----------+     +-----------------+     +----------+

  Majority of       Must get majority     Majority of
  {A,B,C}           of BOTH {A,B,C}       {A,B,C,D,E}
                    AND {A,B,C,D,E}
```

During joint consensus, any decision (election or commit) requires approval from a majority of *both* the old and new configurations. This guarantees no "split brain".

### Single-Server Changes (Simpler Approach)

In practice, most implementations (including etcd/raft) use a simpler approach: add or remove **one server at a time**. With single-server changes, the old and new configurations always overlap in their majorities, so no joint consensus is needed.

```go
// https://github.com/etcd-io/raft/blob/main/confchange/confchange.go
// ConfChange represents a configuration change: adding/removing a node
type ConfChangeV2 struct {
    Transition ConfChangeTransition
    Changes    []ConfChangeSingle
    Context    []byte
}
```

The configuration change is proposed as a special log entry. Once committed, all servers apply the new configuration. The key safety property: **no two configurations that disagree on a majority can both be active at the same time** when changing one server at a time.

## How Raft Fits into Real Systems

Raft is not just a paper algorithm -- it runs in production at enormous scale:

| System | Use of Raft | Notes |
|--------|------------|-------|
| **etcd** | Metadata storage for Kubernetes | Single Raft group, typically 3-5 nodes |
| **TiKV** | Distributed key-value store under TiDB | Multi-Raft: thousands of independent Raft groups (one per Region) |
| **CockroachDB** | Distributed SQL database | Multi-Raft with range-based sharding |
| **Consul** | Service discovery and KV store | Single Raft group for consistent data |
| **HashiCorp Vault** | Secrets management | Uses Raft for integrated storage backend |

### Multi-Raft: Scaling Beyond One Group

A single Raft group is limited by its leader's throughput. Systems like TiKV solve this by partitioning data into **regions**, each managed by its own independent Raft group. This allows:
- Different leaders on different machines (load spreading)
- Parallel replication across regions
- Independent failure domains

```
  +---Node 1---+    +---Node 2---+    +---Node 3---+
  |            |    |            |    |            |
  | Region A   |    | Region A   |    | Region A   |
  | (Leader)   |    | (Follower) |    | (Follower) |
  |            |    |            |    |            |
  | Region B   |    | Region B   |    | Region B   |
  | (Follower) |    | (Leader)   |    | (Follower) |
  |            |    |            |    |            |
  | Region C   |    | Region C   |    | Region C   |
  | (Follower) |    | (Follower) |    | (Leader)   |
  +------------+    +------------+    +------------+
```

## Putting It All Together

If you are starting a distributed systems career, Raft is the single best algorithm to study in depth. Here is a summary of the guarantees it provides:

1. **Election Safety**: At most one leader per term
2. **Leader Append-Only**: A leader never overwrites or deletes entries in its log
3. **Log Matching**: If two logs contain an entry with the same index and term, the logs are identical through that index
4. **Leader Completeness**: If an entry is committed in a given term, it will be present in the logs of all leaders in higher terms
5. **State Machine Safety**: If a server has applied a log entry at a given index, no other server will ever apply a different entry for that index

These five properties, enforced by the mechanisms we discussed (election restriction, commit rules, log matching via prevLogIndex/prevLogTerm), make Raft a **safe** and **understandable** foundation for replicated state machines.

## References

1. Ongaro, Diego and Ousterhout, John. "In Search of an Understandable Consensus Algorithm." USENIX ATC 2014. [Paper](https://raft.github.io/raft.pdf)
2. Ongaro, Diego. "Consensus: Bridging Theory and Practice." Stanford PhD Dissertation, 2014. [Dissertation](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)
3. etcd/raft implementation. [GitHub](https://github.com/etcd-io/raft)
4. Raft Visualization. [raft.github.io](https://raft.github.io/)
5. Lamport, Leslie. "The Part-Time Parliament." ACM TOCS 16(2), 1998.
6. Howard, Heidi. "Distributed Consensus Revised." Cambridge PhD Thesis, 2019.
