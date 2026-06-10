---
author: JZ
pubDatetime: 2026-06-10T06:00:00Z
modDatetime: 2026-06-10T06:00:00Z
title: System Design - How Raft Consensus Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, membership changes, and a source code walkthrough from etcd's raft library."
---

## Table of contents

## Context

Imagine three servers that need to agree on the same sequence of commands — a replicated state machine. If one server crashes, the remaining two should continue serving clients without losing any acknowledged data. This is the **consensus problem** in distributed systems.

Before Raft, the standard answer was **Paxos** (Lamport, 1989). Paxos is provably correct, but notoriously difficult to understand and implement. Many production systems that claim to implement Paxos actually implement something subtly different.

In 2014, Diego Ongaro and John Ousterhout published the [Raft paper](https://raft.github.io/raft.pdf) with an explicit design goal: **understandability**. They decomposed consensus into three relatively independent subproblems:

1. **Leader election** — how to pick one node to coordinate.
2. **Log replication** — how the leader distributes entries to followers.
3. **Safety** — why committed entries are never lost.

Raft is used in production by etcd, TiKV, CockroachDB, Consul, and many other systems. Let's walk through each piece.

```
                         Raft Cluster (5 nodes)

  +----------+      +----------+      +----------+
  | Server 1 |      | Server 2 |      | Server 3 |
  | (Leader) |      |(Follower)|      |(Follower)|
  +----+-----+      +----+-----+      +----+-----+
       |                  |                  |
       |  AppendEntries   |                  |
       |----------------->|                  |
       |----------------->|----------------->|
       |                  |                  |
  +----+-----+      +----+-----+
  | Server 4 |      | Server 5 |
  |(Follower)|      |(Follower)|
  +----------+      +----------+

  Clients send all writes to the Leader.
  Leader replicates to a majority (3/5) before responding.
```

## Server States

Every Raft server is in one of three states at any time:

```
                   times out,          receives votes
                   starts election     from majority
  +----------+    +-----------+    +----------+
  | Follower |---->| Candidate |---->|  Leader  |
  +----+-----+    +-----+-----+    +----+-----+
       ^                |                |
       |   discovers    |                |
       |   current      |  discovers     |
       |   leader or    |  higher term   |
       |   higher term  |                |
       +----------------+<---------------+
```

- **Follower**: Passive. Responds to RPCs from leaders and candidates.
- **Candidate**: Actively seeking votes to become leader.
- **Leader**: Handles all client requests and replicates log entries.

The state machine is driven by a monotonically increasing **term** number. Each term begins with an election. If the election succeeds, the winner leads for the rest of the term. If it fails (split vote), a new term starts.

## Leader Election

### How it starts

A follower becomes a candidate when it hasn't heard from a leader within the **election timeout** (randomized, typically 150-300ms). The randomization is critical — it makes split votes rare.

### The protocol

```
  Server A (Candidate, term=3)           Server B (Follower, term=2)
       |                                        |
       |  RequestVote(term=3, lastLog=(5,2))    |
       |--------------------------------------->|
       |                                        |
       |     checks:                            |
       |     1. term 3 > my term 2? yes         |
       |     2. haven't voted in term 3? yes    |
       |     3. candidate's log up-to-date? yes |
       |                                        |
       |  VoteGranted=true                      |
       |<---------------------------------------|
       |                                        |
```

A candidate sends `RequestVote` RPCs to all other servers. Each server grants its vote if:

1. The candidate's term is at least as large as the voter's current term.
2. The voter hasn't already voted for someone else in this term.
3. The candidate's log is **at least as up-to-date** as the voter's log.

Rule 3 is the **Election Restriction** — it prevents a server with a stale log from becoming leader. "Up-to-date" means: compare the last log entry's term first, then the index. Higher term wins; if terms are equal, longer log wins.

Once a candidate receives votes from a majority (including itself), it becomes leader and immediately sends heartbeats (empty `AppendEntries`) to establish authority.

### Handling split votes

If two candidates start elections simultaneously and split the votes, neither gets a majority. Both time out and start a new election with an incremented term. The randomized timeout makes it extremely unlikely that the same pair splits again.

## Log Replication

Once elected, the leader accepts client commands and appends them to its log. It then replicates each entry to followers via `AppendEntries` RPCs:

```
  Leader's log:          [1:x<-3] [1:y<-1] [2:x<-5] [3:z<-7] [3:w<-2]
                          idx 1     idx 2    idx 3    idx 4     idx 5

  Follower A's log:      [1:x<-3] [1:y<-1] [2:x<-5] [3:z<-7] [3:w<-2]
                          (fully replicated)

  Follower B's log:      [1:x<-3] [1:y<-1] [2:x<-5]
                          (behind, will catch up)

  Each entry: [term:command]
```

### AppendEntries RPC

The leader maintains a `nextIndex` for each follower — the index of the next log entry to send. The `AppendEntries` message includes:

- `prevLogIndex` and `prevLogTerm` — the entry just before the new ones.
- `entries[]` — the new log entries to append.
- `leaderCommit` — the leader's commit index.

The follower performs a **consistency check**: it verifies that it has an entry at `prevLogIndex` with term `prevLogTerm`. If it does, it appends the new entries. If not, it rejects the request, and the leader decrements `nextIndex` and retries with an earlier entry.

```
  Leader                               Follower
    |                                      |
    | AppendEntries(prevIdx=3, prevTerm=2, |
    |   entries=[{idx:4,term:3,cmd:z<-7}]) |
    |------------------------------------->|
    |                                      |
    |   Follower checks: entry[3].term==2? |
    |   Yes -> append entry 4              |
    |                                      |
    | success=true, matchIndex=4           |
    |<-------------------------------------|
    |                                      |
```

This backtracking mechanism guarantees that leader and follower logs eventually become identical.

### Committing entries

An entry is **committed** once the leader has replicated it to a majority of servers. The leader tracks this with the `commitIndex` — the highest index known to be replicated on a majority. Once committed, the entry is safe: it will appear in every future leader's log.

```
  Index:    1    2    3    4    5
  Leader:  [1]  [1]  [2]  [3]  [3]    <-- commitIndex = 4
  Flwr A:  [1]  [1]  [2]  [3]  [3]    (has all)
  Flwr B:  [1]  [1]  [2]  [3]         (has entry 4, majority!)
  Flwr C:  [1]  [1]  [2]              (missing 4, but not needed)
  Flwr D:  [1]  [1]                   (far behind)

  Entry 4 is replicated on Leader + A + B = 3/5 = majority -> committed.
```

The leader advances `commitIndex` and notifies followers via the next `AppendEntries`. Followers then apply committed entries to their state machines.

## Safety: Why Committed Entries Survive

The key safety property: **if a log entry is committed, it will be present in the log of every future leader.** This follows from two rules working together:

1. **Election Restriction**: A candidate cannot win unless its log is at least as up-to-date as a majority's logs.
2. **Majority Overlap**: Any majority of servers overlaps with any other majority by at least one server.

Therefore, if entry E is committed (replicated on a majority M1), and a new leader wins (voted by a majority M2), at least one server is in both M1 and M2. That server has E in its log and won't vote for a candidate whose log doesn't include E (by the Election Restriction).

```
  M1 (committed entry E):     {S1, S2, S3}
  M2 (voted for new leader):  {S2, S4, S5}
                                  ^
                            overlap: S2 has E
                            S2 won't vote for anyone
                            whose log doesn't include E
```

### The commitment rule for previous terms

There's a subtle case: a leader cannot commit entries from a **previous term** by counting replicas alone. Consider:

```
  Time -->

  S1: [1][2]       [1][2][4]      Leader in term 4
  S2: [1][2]       [1][2]
  S3: [1]          [1][3]         Was leader in term 3
  S4: [1]          [1][3]
  S5: [1]          [1]

  Entry at index 2, term 2 is replicated on S1 and S2 (not yet majority).
  S3 was elected in term 3 and wrote entry [3] at index 2 to S3, S4.
  S1 gets elected in term 4.
```

If S1 tries to commit entry `[2]` at index 2 by replicating it to S3 (now a majority: S1, S2, S3), and then S1 crashes, S3 could be elected in term 5 (with votes from S3, S4, S5) and overwrite index 2 with `[3]`.

Raft's solution: **a leader only commits entries from its own current term.** Once a current-term entry at a higher index is committed, all previous entries are implicitly committed too (because log matching guarantees them). This is why the leader appends a **no-op** entry at the start of its term.

## Log Compaction (Snapshots)

Logs grow without bound, so Raft uses **snapshots**. Each server independently takes a snapshot of its state machine at some committed index, then discards all log entries up to that point:

```
  Before snapshot:
  Log: [1:x<-3] [1:y<-1] [2:x<-5] [3:z<-7] [3:w<-2] [3:a<-9]
                                                        ^
                                              lastApplied = 6

  After snapshot at index 4:
  Snapshot: {x=5, y=1, z=7} (state at index 4)
  Log: [3:w<-2] [3:a<-9]     (only entries 5 and 6 remain)
       lastIncludedIndex=4, lastIncludedTerm=3
```

If a follower is so far behind that the leader has already discarded the entries it needs, the leader sends an `InstallSnapshot` RPC instead of log entries.

## Membership Changes

Adding or removing servers is tricky because the old and new configurations could have disjoint majorities during the transition. Raft solves this with **joint consensus**:

```
  Phase 1: Leader commits C_old,new (joint configuration)
            Both old AND new majorities must agree.

  Phase 2: Leader commits C_new (new configuration only)
            Only new majority needed.

  Timeline:
  ---[C_old]---[C_old,new committed]---[C_new committed]---[C_new]-->
       ^                                       ^
       |                                       |
    old majority             new majority rules from here
    still matters
```

During joint consensus, log entries must be replicated to a majority of **both** the old and new configurations. This guarantees no split-brain during the transition.

In practice, many implementations (including etcd) use a simpler **single-server change** approach: add or remove one server at a time. With single-server changes, the old and new majorities always overlap, so no joint consensus is needed.

## Source Code Walkthrough: etcd/raft

The most widely-used Raft implementation is [etcd/raft](https://github.com/etcd-io/raft). It's a library — it doesn't manage network or storage directly, giving the application full control.

### Core state machine: `raft.go`

The `raft` struct holds the node's state:

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
type raft struct {
    id uint64

    Term uint64
    Vote uint64

    raftLog *raftLog  // the log

    state StateType   // follower, candidate, or leader

    // leader state
    trk tracker.ProgressTracker  // tracks each follower's progress

    // election
    electionElapsed  int
    heartbeatElapsed int
    randomizedElectionTimeout int

    lead uint64  // current leader
}
```

### Message-driven design

etcd/raft is event-driven. All inputs (ticks, client proposals, peer messages) become `pb.Message` values fed into `raft.Step()`:

```go
func (r *raft) Step(m pb.Message) error {
    // Handle term changes
    switch {
    case m.Term == 0:
        // local message
    case m.Term > r.Term:
        // step down to follower
        r.becomeFollower(m.Term, m.From)
    case m.Term < r.Term:
        // ignore stale message
        return nil
    }

    // Dispatch by message type
    switch m.Type {
    case pb.MsgHup:
        r.hup(campaignElection)
    case pb.MsgVote, pb.MsgPreVote:
        r.handleVote(m)
    default:
        // delegate to state-specific step function
        r.step(r, m)  // stepLeader, stepCandidate, or stepFollower
    }
    return nil
}
```

### Starting an election

When the election timer fires, the application calls `raft.tick()` which eventually sends a local `MsgHup`:

```go
func (r *raft) tickElection() {
    r.electionElapsed++
    if r.electionElapsed >= r.randomizedElectionTimeout {
        r.electionElapsed = 0
        r.Step(pb.Message{From: r.id, Type: pb.MsgHup})
    }
}
```

`hup()` transitions to candidate and broadcasts `MsgVote`:

```go
func (r *raft) hup(t CampaignType) {
    r.becomeCandidate()
    // vote for self
    r.poll(r.id, true)
    // send RequestVote to all peers
    for _, id := range r.trk.Voters() {
        if id == r.id { continue }
        r.send(pb.Message{
            To:      id,
            Type:    pb.MsgVote,
            Term:    r.Term,
            LogTerm: r.raftLog.lastTerm(),
            Index:   r.raftLog.lastIndex(),
        })
    }
}
```

### Log replication in the leader

When the leader receives a client proposal (`MsgProp`), it appends to its log and broadcasts:

```go
func stepLeader(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgProp:
        r.appendEntry(m.Entries...)
        r.bcastAppend()
    case pb.MsgAppResp:
        pr := r.trk.Progress[m.From]
        if m.Reject {
            pr.MaybeDecrTo(m.Index, m.RejectHint)
            r.sendAppend(m.From)
        } else {
            pr.MaybeUpdate(m.Index)
            r.maybeCommit()  // check if new entries reached majority
        }
    }
    return nil
}
```

`maybeCommit()` finds the highest index replicated on a majority:

```go
func (r *raft) maybeCommit() bool {
    mis := r.trk.Committed()  // median matchIndex across voters
    return r.raftLog.maybeCommit(mis, r.Term)
}
```

The `Committed()` function sorts each voter's `matchIndex` and returns the median — the value that a majority has reached. The `r.Term` check ensures we only commit entries from the current term (the safety rule discussed earlier).

### PreVote: preventing disruptions

etcd/raft implements a **PreVote** optimization. Before starting a real election, a server first asks peers if they would vote for it without incrementing the term. This prevents a partitioned server from incrementing its term and disrupting the cluster when it rejoins:

```go
func (r *raft) hup(t CampaignType) {
    if t == campaignPreElection {
        r.becomePreCandidate()
        // send MsgPreVote without incrementing term
        ...
    } else {
        r.becomeCandidate()
        // send MsgVote with incremented term
        ...
    }
}
```

A PreVote succeeds only if the requester's log is up-to-date AND the voter hasn't heard from a leader recently. Only after PreVote succeeds does the real election begin.

## Performance Characteristics

| Metric | Typical Value | Notes |
|--------|--------------|-------|
| Heartbeat interval | 100-200ms | Must be << election timeout |
| Election timeout | 1-2s | Randomized within range |
| Commit latency | 1 RTT | Leader to majority |
| Throughput | Tens of thousands ops/s | Bottleneck is disk fsync |

The main performance knobs:

- **Batching**: Group multiple entries into one `AppendEntries` (etcd does this).
- **Pipelining**: Send entries without waiting for the previous response.
- **Parallel appends**: Leader appends locally in parallel with sending to followers.
- **Lease-based reads**: Serve reads from the leader without a Raft round-trip if the lease hasn't expired.

## How TiKV Uses Raft

TiKV splits data into **Regions** (default 96MB). Each Region is a separate Raft group:

```
  +---Region 1---+    +---Region 2---+    +---Region 3---+
  | [a, f)       |    | [f, m)       |    | [m, z)       |
  | Raft group:  |    | Raft group:  |    | Raft group:  |
  | S1,S2,S3     |    | S1,S3,S4     |    | S2,S4,S5     |
  +--------------+    +--------------+    +--------------+

  Each Region has its own leader, log, and commit index.
  Different Regions can have leaders on different servers.
```

This **Multi-Raft** design scales horizontally: adding more servers spreads the Raft groups across more machines. The Placement Driver (PD) balances Regions across TiKV nodes, splitting Regions that grow too large and merging ones that shrink.

## References

1. In Search of an Understandable Consensus Algorithm (Raft paper) [paper](https://raft.github.io/raft.pdf)
2. Raft visualization [site](https://thesecretlivesofdata.com/raft/)
3. etcd/raft implementation [`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go)
4. etcd/raft log replication [`log.go`](https://github.com/etcd-io/raft/blob/main/log.go)
5. etcd/raft progress tracker [`tracker/progress.go`](https://github.com/etcd-io/raft/blob/main/tracker/progress.go)
6. TiKV Raft module [`components/raft`](https://github.com/tikv/tikv/tree/master/components/raft)
7. Raft PhD dissertation (Ongaro, 2014) [thesis](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)
8. Paxos Made Simple (Lamport, 2001) [paper](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
