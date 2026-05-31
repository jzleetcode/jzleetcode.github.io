---
author: JZ
pubDatetime: 2026-05-31T06:23:00Z
modDatetime: 2026-05-31T06:23:00Z
title: System Design - How Raft Consensus Works
tags:
  - design-system
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, membership changes, and source code walkthrough from the etcd/raft implementation."
---

## Table of contents

## Context

Imagine you have a single server storing important data — say, the configuration of every microservice in your company. If that server dies, everything stops. The obvious fix is replication: keep copies on multiple servers. But now you have a harder problem — how do you keep those copies consistent?

This is the **consensus problem**: getting a group of machines to agree on a sequence of values, even when some machines crash or messages get delayed. Consensus is the backbone of:

- **Replicated state machines** — every node applies the same commands in the same order, so they all end up in the same state.
- **Fault tolerance** — as long as a majority (e.g., 3 out of 5) of nodes are alive, the system keeps working.
- **Linearizable reads/writes** — clients see a single, consistent view of the data.

Paxos was the original answer, but it is notoriously difficult to understand and implement. In 2014, Diego Ongaro and John Ousterhout published **Raft** with an explicit goal: be understandable. Raft decomposes consensus into three sub-problems — leader election, log replication, and safety — and tackles each one cleanly.

## The Raft Basics

### Terms

Raft divides time into **terms**, numbered with consecutive integers. Each term begins with an election. If a candidate wins, it serves as leader for the rest of the term. If no one wins (split vote), the term ends with no leader and a new term starts immediately.

```
  Term 1        Term 2        Term 3        Term 4
|--election--|--normal op--|--election--|--normal op--|-->
   leader=A                  split vote     leader=C
```

Terms act as a logical clock. Every RPC includes the sender's term. If a node receives a message with a higher term, it immediately steps down to follower and updates its own term.

### Three States

Every node is in exactly one of three states:

```
                    times out,
                    starts election
              +-------------------+
              |                   |
              v                   |
  +--------+      +----------+      +---------+
  |Follower| ---> |Candidate | ---> | Leader  |
  +--------+      +----------+      +---------+
       ^               |                  |
       |  discovers    |  discovers       |
       |  higher term  |  higher term     |
       +---------------+------------------+
```

- **Follower**: passive; responds to RPCs from leader and candidates.
- **Candidate**: actively trying to get elected.
- **Leader**: handles all client requests; replicates log entries to followers.

### Two Core RPCs

1. **RequestVote** — sent by candidates during elections.
2. **AppendEntries** — sent by the leader to replicate log entries and as heartbeats (empty AppendEntries).

## Leader Election

### The Story

Picture three servers — A, B, C — humming along with A as leader. A sends heartbeats every 150ms. Each follower has a randomized **election timeout** (e.g., 300-500ms). As long as heartbeats arrive in time, everyone is happy.

Now A crashes. B and C stop receiving heartbeats. After B's election timeout fires (say, 350ms), B transitions to Candidate, increments its term, votes for itself, and sends RequestVote RPCs to A and C.

```
  Time ------>

  A (Leader)    X (crashes at t=100)
                |
  B (Follower)  |---- timeout at t=450 ---> becomes Candidate (term 2)
                |                            votes for self
                |                            sends RequestVote to A, C
                |
  C (Follower)  |                   receives RequestVote
                |                   grants vote (has not voted in term 2)
                |
  B             <--- receives vote from C (has majority: self + C) --->
                     becomes Leader (term 2)
                     sends heartbeats to A, C
```

### Voting Rules

A node grants its vote if **all** of these hold:

1. The candidate's term is >= the voter's current term.
2. The voter has not already voted for someone else in this term.
3. The candidate's log is **at least as up-to-date** as the voter's log (compared by last log entry's term, then index).

Rule 3 is critical for safety — it prevents a node with a stale log from becoming leader.

### Split Vote Handling

If two candidates start elections simultaneously, votes may split so neither gets a majority. Raft handles this with **randomized election timeouts**. Each candidate picks a new random timeout before retrying, making it unlikely that two nodes will split votes repeatedly.

```
  Term 3 — split vote scenario:

  B: timeout fires  --> becomes Candidate, term=3, gets vote from self
  C: timeout fires  --> becomes Candidate, term=3, gets vote from self

  B sends RequestVote to C --> C already voted for self, rejects
  C sends RequestVote to B --> B already voted for self, rejects

  Neither gets majority. Both wait random time.
  B picks 200ms, C picks 400ms.
  B times out first --> starts term 4, wins election.
```

### PreVote: Avoiding Disruption

etcd/raft implements an optimization called **PreVote**. Before incrementing its term and starting a real election, a candidate first sends PreVote messages to check if it could win. This prevents a partitioned server from incrementing its term unnecessarily and disrupting the cluster when it rejoins.

## Log Replication

### How Entries Flow

Once a leader is elected, it services client requests. Each request becomes a new **log entry** with the leader's current term and the next available index. The leader appends it locally, then sends AppendEntries RPCs to all followers in parallel.

```
  Client          Leader (A)        Follower B       Follower C
    |                 |                  |                |
    |--- PUT x=1 --->|                  |                |
    |                 |-- AppendEntries (index=4, term=2) -->
    |                 |-- AppendEntries (index=4, term=2) -------->
    |                 |                  |                |
    |                 |<-- success ------|                |
    |                 |<-- success ----------------------|
    |                 |                  |                |
    |                 | (majority replied: commit index=4)
    |                 | apply to state machine           |
    |<-- OK ---------|                  |                |
    |                 |                  |                |
    |                 | (next heartbeat carries commitIndex=4)
    |                 |-- AppendEntries (commitIndex=4) -->
    |                 |                  | apply entry 4  |
```

### The Commit Index

A log entry is **committed** once the leader knows it has been replicated on a majority of nodes. The leader tracks a `commitIndex` and advances it when a new entry is stored on a majority. Followers learn about commits via the `leaderCommit` field in AppendEntries.

### Log Matching Property

Raft maintains two invariants:

1. If two entries in different logs have the same index and term, they store the same command.
2. If two entries in different logs have the same index and term, all preceding entries are identical.

The leader enforces this by including the `prevLogIndex` and `prevLogTerm` in AppendEntries. If the follower does not have a matching entry at that position, it rejects the RPC. The leader then decrements `nextIndex` for that follower and retries, effectively "backing up" until logs match.

```
  Leader's log:    [1:1] [2:1] [3:2] [4:2] [5:3]
  Follower's log:  [1:1] [2:1] [3:2]

  Leader sends: prevLogIndex=4, prevLogTerm=2, entries=[5:3]
  Follower: "I don't have index 4" --> rejects

  Leader retries: prevLogIndex=3, prevLogTerm=2, entries=[4:2, 5:3]
  Follower: "I have index 3 with term 2, match!" --> appends [4:2, 5:3]
```

### The Log Structure

Each log entry contains a command, a term number, and an index:

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

## Safety

### Election Restriction

The voting rule (candidate's log must be at least as up-to-date) guarantees that any elected leader contains all committed entries. This is the **Leader Completeness Property** — once an entry is committed, it appears in the log of every future leader.

How "up-to-date" is compared:

```
Candidate's log is "at least as up-to-date" if:
  1. Its last entry has a HIGHER term than the voter's last entry, OR
  2. Same last term but EQUAL or LONGER log

  Candidate A: [1:t1] [2:t1] [3:t2]         last=(idx=3, term=2)
  Server B:    [1:t1] [2:t1] [3:t1] [4:t1]  last=(idx=4, term=1)

  A's last term (2) > B's last term (1) => A is more up-to-date
  B grants vote to A even though A has fewer entries.
```

### Commitment Rules (The Figure 8 Problem)

A leader only commits entries from **its own term** by counting replicas. It does not commit entries from previous terms by counting alone — it waits until a new entry from the current term is also committed, which indirectly commits all prior entries.

Why this matters — consider this dangerous sequence:

```
Time -->  (a)      (b)       (c)        (d)

S1:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]
                              [3:t4]     [3:t4]

S2:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]
                                        [3:t4]

S3:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
         [2:t2]   [2:t2]    [2:t2]     [2:t2]
                                        [3:t4]

S4:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
                   [2:t3]    [2:t3]     [2:t3]

S5:      [1:t1]   [1:t1]    [1:t1]     [1:t1]
                   [2:t3]    [2:t3]     [2:t3]
```

In step (c), S1 is leader in term 4 and replicates [2:t2] to a majority (S1, S2, S3). If S1 commits [2:t2] based on this alone, then crashes, S5 could still win an election (its last term is 3, higher than S2/S3's last term 2) and overwrite the committed entry.

The fix: S1 in term 4 does NOT commit [2:t2] directly. Instead, it commits [3:t4] (its own term's entry). Once [3:t4] is replicated to a majority (step d), all prior entries are implicitly committed, and no server with a stale log can win an election.

## Log Compaction / Snapshots

Over time, the log grows without bound. Raft uses **snapshotting**: each node independently takes a snapshot of its state machine at some committed index, then discards all log entries up to that point.

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

When a leader needs to bring a far-behind follower up to date, it sends an **InstallSnapshot** RPC instead of replaying thousands of log entries:

```
  Leader                             Slow Follower
    |                                     |
    | nextIndex[follower] = 3             |
    | but log starts at index 100         |
    | (entries 1-99 snapshotted)          |
    |                                     |
    |---InstallSnapshot(snapshot)-------->|
    |   lastIncludedIndex=99              |
    |   lastIncludedTerm=t5               |
    |   data=[full state machine state]   |
    |                                     |
    |                                     | discard entire log
    |                                     | load snapshot
    |                                     | set lastApplied=99
    |                                     |
    |<--Success---------------------------|
    |                                     |
    | nextIndex[follower] = 100           |
    | resume normal AppendEntries         |
```

Key points:
- Snapshots are taken independently by each node (not coordinated by the leader).
- The snapshot includes the last included index/term so the node knows where to truncate.
- After installing a snapshot, the follower discards its entire log up to the snapshot point.

## Membership Changes

Changing the cluster membership (adding/removing nodes) is tricky because you cannot atomically switch all nodes at once. Two approaches exist:

### Joint Consensus (Original Paper)

A transitional configuration where both old and new configs must agree:

```
  Old config: {A, B, C}        Majority = 2
  New config: {A, B, C, D, E}  Majority = 3

  Phase 1:  C_old          Phase 2: C_old,new       Phase 3: C_new
  {A,B,C}                  must get majority of     {A,B,C,D,E}
                           BOTH {A,B,C} AND
                           {A,B,C,D,E}
```

### Single-Server Changes (etcd/raft approach)

Add or remove one node at a time. Because any two majorities of consecutive configurations overlap by at least one node, safety is maintained without joint consensus:

```
  3-node cluster: {A, B, C}       majority = 2
  Add D:          {A, B, C, D}    majority = 3

  Any majority of {A,B,C} (2 nodes) and any majority of {A,B,C,D} (3 nodes)
  must share at least 1 node. No split brain possible.
```

## Source Code Walkthrough: etcd/raft

The [etcd/raft](https://github.com/etcd-io/raft) library is the most widely-used production Raft implementation in Go. It powers etcd, CockroachDB, and TiKV (via a Rust port). Let us look at the key pieces.

### The `raft` Struct

[`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go) — the core state machine:

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
type raft struct {
    id uint64

    Term uint64
    Vote uint64

    raftLog *raftLog

    prs tracker.ProgressTracker

    state StateType // Leader, Follower, or Candidate

    msgs []pb.Message // outbound messages to send

    lead uint64 // current leader

    electionElapsed  int
    heartbeatElapsed int

    randomizedElectionTimeout int

    tick func()  // either tickElection or tickHeartbeat
    step stepFunc // either stepLeader, stepCandidate, or stepFollower
}
```

Notice `step` is a function pointer — the node's behavior changes depending on its role. This is how one struct implements three different state machine behaviors.

### `raftLog` — The Log

[`log.go`](https://github.com/etcd-io/raft/blob/main/log.go) — manages the in-memory and persisted log:

```go
// https://github.com/etcd-io/raft/blob/main/log.go
type raftLog struct {
    storage  Storage   // persisted entries + snapshot
    unstable unstable  // entries not yet persisted

    committed uint64   // highest index known to be committed
    applying  uint64   // highest index being applied
    applied   uint64   // highest index applied to state machine
}
```

The split between `storage` (already persisted) and `unstable` (in memory, waiting to be written to disk) is a key design choice that lets the library remain agnostic about the storage engine.

### `Progress` — Tracking Followers

[`tracker/progress.go`](https://github.com/etcd-io/raft/blob/main/tracker/progress.go) — the leader maintains one `Progress` per peer:

```go
// https://github.com/etcd-io/raft/blob/main/tracker/progress.go
type Progress struct {
    Match uint64  // highest index known to be replicated on this peer
    Next  uint64  // next index to send to this peer

    State StateType // probe, replicate, or snapshot

    Inflights *Inflights // in-flight AppendEntries (flow control)
}
```

The `Match`/`Next` pair is exactly the mechanism described in the log replication section — the leader uses `Next` to decide what to send and updates `Match` on success.

### `Step` — The Main Entry Point

[`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go) — all incoming messages go through `Step`:

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func (r *raft) Step(m pb.Message) error {
    // Handle term logic first:
    // If msg.Term > r.Term, step down to follower
    // If msg.Term < r.Term, ignore the message

    switch m.Type {
    case pb.MsgHup:
        r.hup(campaignElection)
    case pb.MsgVote, pb.MsgPreVote:
        // handle vote request
    default:
        // delegate to role-specific step function
        err := r.step(r, m)
    }
    return nil
}
```

### `stepLeader` — Leader Behavior

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func stepLeader(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgProp:
        // Client proposal: append to log, broadcast AppendEntries
        r.appendEntry(m.Entries...)
        r.bcastAppend()
    case pb.MsgAppResp:
        // Follower acknowledged entries
        pr := r.prs.Progress[m.From]
        if m.Reject {
            // Back up nextIndex and retry
            if pr.MaybeDecrTo(m.Index, m.RejectHint) {
                r.sendAppend(m.From)
            }
        } else {
            pr.MaybeUpdate(m.Index)
            if r.maybeCommit() {
                r.bcastAppend() // piggyback new commitIndex
            }
        }
    case pb.MsgHeartbeatResp:
        // ...
    }
    return nil
}
```

Key points:
- Client proposals (`MsgProp`) are appended locally and broadcast.
- On success responses, the leader updates progress and attempts to advance the commit index.
- On rejections, the leader decrements `nextIndex` and retries.

### `becomeLeader` — State Transition

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func (r *raft) becomeLeader() {
    r.step = stepLeader
    r.reset(r.Term)
    r.tick = r.tickHeartbeat
    r.lead = r.id
    r.state = StateLeader

    // Append a no-op entry to commit entries from previous terms
    r.appendEntry(pb.Entry{Data: nil})
}
```

The no-op entry is the implementation of the commitment rule from the Safety section — it ensures the new leader can commit previous-term entries indirectly by first committing something from its own term.

### `appendEntry` — Adding to the Log

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func (r *raft) appendEntry(es ...pb.Entry) (accepted bool) {
    li := r.raftLog.lastIndex()
    for i := range es {
        es[i].Term = r.Term
        es[i].Index = li + 1 + uint64(i)
    }
    r.raftLog.append(es...)
    r.prs.Progress[r.id].MaybeUpdate(r.raftLog.lastIndex())
    r.maybeCommit()
    return true
}
```

### `maybeCommit` — Advancing the Commit Index

```go
// https://github.com/etcd-io/raft/blob/main/raft.go
func (r *raft) maybeCommit() bool {
    mci := r.prs.Committed()
    return r.raftLog.maybeCommit(mci, r.Term)
}

// In log.go:
func (l *raftLog) maybeCommit(maxIndex, term uint64) bool {
    if maxIndex > l.committed &&
        l.zeroTermOnOutOfBounds(l.term(maxIndex)) == term {
        l.commitTo(maxIndex)
        return true
    }
    return false
}
```

Note the `term` check — this is the Figure 8 safety rule. The leader will only advance the commit index if the entry at that index belongs to the current term.

### Putting It All Together

Here is the high-level flow of a write request through etcd/raft:

```
  Client proposes "SET x=1"
       |
       v
  raft.Step(MsgProp{entries: ["SET x=1"]})
       |
       v
  stepLeader:
    appendEntry() --> log: [..., {index=7, term=3, data="SET x=1"}]
    bcastAppend() --> sends MsgApp to each follower
       |
       v
  Followers receive MsgApp:
    raftLog.maybeAppend(entries)
    reply MsgAppResp{index=7}
       |
       v
  Leader receives MsgAppResp:
    progress[follower].Match = 7
    maybeCommit() --> committed advances to 7 (majority have it)
    bcastAppend() --> followers learn commitIndex=7
       |
       v
  Application layer (via Ready()) applies entry 7 to state machine
  Client gets response
```

### The `Ready` struct — Library/Application Boundary

etcd/raft is a library, not a framework. The application drives the event loop by calling `Ready()`:

```go
// https://github.com/etcd-io/raft/blob/main/node.go
type Ready struct {
    SoftState    *SoftState
    HardState    pb.HardState    // term, vote, commit to persist
    Entries      []pb.Entry      // entries to persist to stable storage
    Snapshot     pb.Snapshot     // snapshot to persist
    CommittedEntries []pb.Entry  // entries to apply to state machine
    Messages     []pb.Message    // messages to send to peers
}
```

The application loop looks like:

```go
for {
    rd := node.Ready()
    saveToStorage(rd.HardState, rd.Entries, rd.Snapshot)
    sendMessages(rd.Messages)
    applyToStateMachine(rd.CommittedEntries)
    node.Advance()
}
```

This separation means etcd/raft handles consensus logic while the application owns networking, persistence, and state machine semantics.

## Key Takeaways

1. **Raft is leader-based** — all writes go through the leader, simplifying reasoning about ordering.
2. **Terms are a logical clock** — stale leaders are dethroned immediately upon seeing a higher term.
3. **Randomized timeouts break symmetry** — no need for perfect clocks or complex tie-breaking.
4. **The log matching property** keeps logs consistent with one simple check in AppendEntries.
5. **The election restriction** ensures leaders always have complete committed history.
6. **etcd/raft separates concerns** — the library handles consensus; the application handles I/O.

## References

1. Ongaro, D. and Ousterhout, J. (2014). "In Search of an Understandable Consensus Algorithm." USENIX ATC. [https://raft.github.io/raft.pdf](https://raft.github.io/raft.pdf)
2. Ongaro, D. (2014). "Consensus: Bridging Theory and Practice." PhD Dissertation, Stanford University. [https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf](https://web.stanford.edu/~ouster/cgi-bin/papers/OngaroPhD.pdf)
3. etcd/raft GitHub repository. [https://github.com/etcd-io/raft](https://github.com/etcd-io/raft)
4. Raft Visualization. [https://thesecretlivesofdata.com/raft/](https://thesecretlivesofdata.com/raft/)
5. etcd documentation on Raft internals. [https://etcd.io/docs/latest/learning/](https://etcd.io/docs/latest/learning/)
6. Lamport, L. (1998). "The Part-Time Parliament." ACM TOCS 16(2).
