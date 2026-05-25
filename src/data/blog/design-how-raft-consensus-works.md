---
author: JZ
pubDatetime: 2026-05-25T06:23:00Z
modDatetime: 2026-05-25T06:23:00Z
title: System Design - How the Raft Consensus Algorithm Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, membership changes, and a source code walkthrough from etcd's raft implementation."
---

## Table of contents

## Context

In a distributed system, multiple servers must agree on a single source of truth even when some machines crash or networks fail. This problem is called **consensus**. Without it, two servers might accept conflicting writes, leaving data in an inconsistent state.

The classic solution is Paxos (Lamport, 1998), but Paxos is famously difficult to understand and implement correctly. In 2014, Diego Ongaro and John Ousterhout published [In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf), introducing **Raft** — a protocol designed for the same problem but with clarity as a first-class goal.

Raft is now used in production by etcd, TiKV, CockroachDB, Consul, and many others. It is the consensus layer behind every TiDB cluster (via TiKV's embedded Raft groups).

```
     Distributed System Without Consensus     With Consensus (Raft)

   Client                                    Client
     |                                         |
     v                                         v
  +--------+    +--------+                 +--------+ (Leader)
  |Server A|    |Server B|                 |Server A|--------+
  | data=1 |    | data=2 |  CONFLICT!      | data=1 |        |
  +--------+    +--------+                 +--------+     replicate
                                               |             |
                                               v             v
                                           +--------+    +--------+
                                           |Server B|    |Server C|
                                           | data=1 |    | data=1 |
                                           +--------+    +--------+
                                                     CONSISTENT
```

Raft decomposes consensus into three sub-problems:

1. **Leader election** — how to choose a single leader among servers.
2. **Log replication** — how the leader pushes commands to followers.
3. **Safety** — why committed entries are never lost or contradicted.

Let's walk through each one.

## Server States and Terms

Every Raft server is in one of three states at any moment:

```
                 times out,            receives votes
                 starts election       from majority
          +----------+          +-----------+
          |          |          |           |
          v          |          v           |
     +---------+     |     +-----------+    |
---->| Follower |----+---->| Candidate |---+
     +---------+           +-----------+
          ^                      |
          |   discovers current  |
          |   leader or new term |
          +----------------------+
                                 |
                                 |  wins election
                                 v
                           +-----------+
                           |  Leader   |
                           +-----------+
                                 |
                                 | discovers server
                                 | with higher term
                                 v
                           +---------+
                           | Follower|
                           +---------+
```

**Terms** are Raft's logical clock. Each term has at most one leader. When a server starts an election, it increments its term. If a server receives a message with a higher term, it immediately steps down to follower. This prevents stale leaders from making progress.

In etcd's implementation ([`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go)), the state machine looks like:

```go
type raft struct {
    id    uint64
    Term  uint64
    Vote  uint64       // who we voted for in current term
    state StateType    // follower, candidate, or leader
    lead  uint64       // current leader id

    raftLog *raftLog   // the replicated log
    prs     tracker.ProgressTracker // leader's view of each peer's progress
    // ...
}
```

## Leader Election

### How it starts

A follower expects periodic **heartbeats** from the leader. If it doesn't hear from the leader within a randomized **election timeout** (typically 150-300ms), it assumes the leader has failed:

```
  Time ────────────────────────────────────────────>

  Follower A:  |---heartbeat---|---heartbeat---|--- timeout! ---> becomes Candidate
  Follower B:  |---heartbeat---|---heartbeat---|---heartbeat---|  (still happy)
  Leader:      |..............CRASH.............|
```

The follower transitions to candidate, increments its term, votes for itself, and sends `RequestVote` RPCs to all other servers.

### Voting rules

A server grants its vote if and only if:

1. It has **not already voted** in this term (one vote per term).
2. The candidate's log is **at least as up-to-date** as the voter's log.

"At least as up-to-date" means: compare the last entry's term first, then compare log length. This rule is critical for safety — it prevents a candidate with a stale log from becoming leader and overwriting committed entries.

```go
// From etcd raft: simplified vote eligibility check
func (r *raft) canVote(m pb.Message) bool {
    return r.Vote == m.From || (r.Vote == None && r.lead == None)
}

// Log comparison (simplified from raft/log.go)
func isUpToDate(lastTerm, lastIndex, candidateTerm, candidateIndex uint64) bool {
    if candidateTerm != lastTerm {
        return candidateTerm > lastTerm
    }
    return candidateIndex >= lastIndex
}
```

### Election outcomes

Three things can happen:

1. **Wins:** The candidate receives votes from a majority (including itself). It becomes leader and sends heartbeats immediately.
2. **Loses:** Another server wins (the candidate receives an `AppendEntries` from a new leader with a term >= its own). It reverts to follower.
3. **Split vote:** No one gets a majority. After another timeout, a new election starts with a higher term.

**Randomized timeouts** make split votes rare. Each server picks a random timeout between `T` and `2T`, so it's unlikely two candidates start elections simultaneously.

## Log Replication

Once elected, the leader accepts client commands and appends them to its local log. It then sends `AppendEntries` RPCs to each follower:

```
  Leader's Log:        [1:x<-3] [1:y<-1] [2:x<-7] [3:z<-5] [3:w<-2]
                        term:1   term:1   term:2   term:3   term:3
                        index:1  index:2  index:3  index:4  index:5

  AppendEntries to Follower B:
  +---------------------------------------------+
  | prevLogIndex: 3                             |
  | prevLogTerm:  2                             |
  | entries: [{index:4, term:3, cmd:"z<-5"},    |
  |           {index:5, term:3, cmd:"w<-2"}]    |
  | leaderCommit: 3                             |
  +---------------------------------------------+

  Follower B checks:
    - Do I have entry at index 3 with term 2?  YES -> accept, append entries 4-5
    - Do I have entry at index 3 with term 2?  NO  -> reject, leader retries with lower prevLogIndex
```

### The Log Matching Property

Raft maintains two invariants:

1. If two entries in different logs have the same index and term, they store the same command.
2. If two entries in different logs have the same index and term, all preceding entries are also identical.

These hold because (1) a leader creates at most one entry per index in a given term, and (2) `AppendEntries` checks `prevLogIndex`/`prevLogTerm` before appending — if the check fails, the follower rejects and the leader backs up.

### Commitment

An entry is **committed** once the leader has replicated it to a majority of servers:

```
  Server 1 (Leader):  [1:a] [1:b] [2:c] [3:d] [3:e]
  Server 2:           [1:a] [1:b] [2:c] [3:d] [3:e]
  Server 3:           [1:a] [1:b] [2:c] [3:d]
  Server 4:           [1:a] [1:b] [2:c]
  Server 5:           [1:a] [1:b]

  With 5 servers, majority = 3.
  Entry [3:d] at index 4 is on servers 1,2,3 -> committed (majority=3).
  Entry [3:e] at index 5 is on servers 1,2 -> NOT yet committed.
```

The leader tracks each follower's progress using `matchIndex` (the highest index known to be replicated on that follower). When `matchIndex[i] >= N` for a majority of servers, entry N is committed.

In etcd's code ([`tracker/progress.go`](https://github.com/etcd-io/raft/blob/main/tracker/progress.go)):

```go
type Progress struct {
    Match uint64  // highest log index known to be replicated
    Next  uint64  // next log index to send
    State StateType
    // ...
}
```

The leader advances its `commitIndex` by finding the highest N where a majority has `Match >= N` and the entry at N has the current term. That last condition (must be current term) is a subtle but critical safety rule — we'll see why next.

## Safety: The Election Restriction

Raft's key safety property: **if a leader has committed an entry, that entry will be present in the logs of all future leaders.** This is guaranteed by the voting rule we saw earlier (the candidate's log must be at least as up-to-date).

Here's the intuition. If entry E is committed, it exists on a majority of servers. Any future leader must receive votes from a majority. These two majorities must overlap (pigeonhole principle) — at least one server has E and voted for the new leader. Since the voter only votes for candidates with logs at least as up-to-date, the new leader must also have E.

```
  5 servers, majority = 3

  Committed entry E is on: {S1, S2, S3}     (any 3)
  New leader needs votes from:  {any 3}

  Overlap is guaranteed:
  |{S1,S2,S3} intersect {any 3 of 5}| >= 1

  That overlapping server has E and will only
  vote for a candidate whose log includes E.
```

### Why leaders don't commit entries from previous terms

Consider this dangerous scenario:

```
  Time ->  1    2    3    4    5

  S1:     [1:a][2:b]               -- was leader in term 2, crashed
  S2:     [1:a][2:b]               -- got the entry
  S3:     [1:a]     [3:c]          -- was leader in term 3 briefly
  S4:     [1:a]     [3:c]
  S5:     [1:a]
```

If S1 becomes leader in term 4 and replicates `[2:b]` to S3, that entry is now on a majority (S1, S2, S3). But if S1 crashes and S5 wins term 5 (possible if S3, S4, S5 vote for it — S5's log doesn't need `[2:b]`), S5 would overwrite `[2:b]` with its own entries.

Raft's solution: a leader only counts an entry from a **previous term** as committed if a **current-term** entry after it is also committed. In practice, the leader appends a no-op entry at the start of its term and commits that — once the no-op is committed, everything before it is implicitly committed too.

## Log Compaction: Snapshots

Logs grow without bound. Raft uses **snapshots** to compact: the state machine periodically serializes its full state, and the log up to that point is discarded.

```
  Before snapshot:
  Log:  [1:a] [1:b] [2:c] [2:d] [3:e] [3:f] [3:g] [3:h]
  State machine: result of applying a through h

  After snapshot at index 5:
  Snapshot: { lastIncludedIndex: 5, lastIncludedTerm: 3, state: <serialized> }
  Log:  [3:f] [3:g] [3:h]
```

If a follower is so far behind that the leader has already discarded the entries it needs, the leader sends an `InstallSnapshot` RPC instead of `AppendEntries`. The follower replaces its entire state with the snapshot and continues from there.

## Membership Changes

Adding or removing servers from a cluster is tricky — during the transition, you could momentarily have two separate majorities that elect two different leaders. Raft handles this with **joint consensus** (or the simpler single-server change approach):

```
  Single-server change (one at a time):

  Old config: {A, B, C}       majority = 2
  Add server D:
  New config: {A, B, C, D}    majority = 3

  The configuration change itself is a log entry.
  Once committed, the new config is active.

  Safety: any majority of the old set (2 of 3) overlaps
  with any majority of the new set (3 of 4), because
  the old set is a subset of the new set.
```

etcd implements this in [`confchange/confchange.go`](https://github.com/etcd-io/raft/blob/main/confchange/confchange.go). The key rule: only one configuration change can be pending (uncommitted) at a time. This prevents complex multi-step transitions that could create disjoint majorities.

## Putting It All Together

Here's a complete timeline showing a client write going through a 3-node Raft cluster:

```
  Client          Leader (S1)         Follower (S2)       Follower (S3)
    |                 |                    |                    |
    | cmd: SET x=42   |                    |                    |
    |---------------->|                    |                    |
    |                 |                    |                    |
    |          append to local log         |                    |
    |          [term:5, index:8, SET x=42] |                    |
    |                 |                    |                    |
    |                 |---AppendEntries--->|                    |
    |                 |---AppendEntries---------------------------->|
    |                 |                    |                    |
    |                 |<--success----------|                    |
    |                 |<--success----------------------------------|
    |                 |                    |                    |
    |          matchIndex[S2]=8            |                    |
    |          matchIndex[S3]=8            |                    |
    |          majority has index>=8       |                    |
    |          commitIndex = 8             |                    |
    |                 |                    |                    |
    |          apply SET x=42 to state machine                 |
    |                 |                    |                    |
    |<---response-----|                    |                    |
    |   (ok)          |                    |                    |
    |                 |                    |                    |
    |                 |---heartbeat(commit=8)-->|               |
    |                 |---heartbeat(commit=8)------------------>|
    |                 |                    |                    |
    |                 |              apply SET x=42       apply SET x=42
```

1. Client sends command to the leader.
2. Leader appends to its log and sends `AppendEntries` to all followers.
3. Followers append and acknowledge.
4. Leader sees a majority have the entry — advances `commitIndex`.
5. Leader applies the entry to its state machine and responds to the client.
6. Followers learn about the commit via the next heartbeat's `leaderCommit` field and apply locally.

## Performance in Practice

Real-world Raft implementations add several optimizations:

- **Pipelining:** The leader sends the next batch of entries without waiting for the previous acknowledgment (etcd uses `Next` index to track what to send next).
- **Batching:** Multiple client commands are batched into a single `AppendEntries` RPC.
- **Parallel appends:** The leader sends entries to followers in parallel with writing to its own disk (the leader's own write counts toward the majority).
- **Read leases:** For read-only queries, the leader can serve reads from its state machine without a full round of replication, using a lease-based approach to confirm it's still the leader.

etcd's Raft achieves sub-millisecond latency for writes within a single datacenter and handles tens of thousands of writes per second.

## References

1. In Search of an Understandable Consensus Algorithm (Raft paper) [paper](https://raft.github.io/raft.pdf)
2. The Raft Consensus Algorithm visualization [site](https://raft.github.io/)
3. etcd raft implementation [`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go)
4. etcd raft progress tracker [`tracker/progress.go`](https://github.com/etcd-io/raft/blob/main/tracker/progress.go)
5. etcd raft configuration changes [`confchange/confchange.go`](https://github.com/etcd-io/raft/blob/main/confchange/confchange.go)
6. Paxos Made Simple (Lamport) [paper](https://lamport.azurewebered.org/pubs/paxos-simple.pdf)
7. TiKV Raft implementation (based on etcd) [repo](https://github.com/tikv/raft-rs)
8. Raft PhD dissertation (extended version) [thesis](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)
