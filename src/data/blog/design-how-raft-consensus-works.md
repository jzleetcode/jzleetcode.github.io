---
author: JZ
pubDatetime: 2026-04-10T04:00:00Z
modDatetime: 2026-04-10T04:00:00Z
title: System Design - How the Raft Consensus Algorithm Works
tags:
  - design-system
  - design-database
  - design-concurrency
description:
  "How the Raft consensus algorithm works: leader election, log replication, safety guarantees, and a source code walkthrough of the etcd/raft implementation in Go."
---

## Table of contents

## Context

Imagine three servers holding copies of the same data. A client writes a new value. Which server decides the order of writes? What happens if one server crashes mid-update? How do the remaining servers agree on what the data looks like?

This is the **consensus problem**: getting a group of machines to agree on a shared sequence of operations, even when some of them fail. Consensus is the backbone of every replicated system — databases like TiKV and CockroachDB, coordination services like etcd and Consul, and message queues like Apache Kafka (via KRaft) all rely on it.

Before Raft, the standard answer was **Paxos**, published by Leslie Lamport in 1989. Paxos is provably correct, but notoriously hard to understand and even harder to implement. In 2014, Diego Ongaro and John Ousterhout published [*In Search of an Understandable Consensus Algorithm*](https://raft.github.io/raft.pdf), introducing **Raft** — designed from the ground up to be easy to teach, easy to implement, and easy to reason about. It achieves the same guarantees as Paxos but decomposes the problem into three clean subproblems:

1. **Leader election** — who is in charge?
2. **Log replication** — how do writes spread to all nodes?
3. **Safety** — under what conditions is it safe to consider a write "committed"?

Let's walk through each piece, then look at real source code from the [etcd/raft](https://github.com/etcd-io/raft) library — the most widely deployed Raft implementation in production.

## The Three Roles

Every node in a Raft cluster is in one of three states at any given time:

```
                          times out,
                         starts election
                 +----------------------------+
                 |                            |
                 |      receives votes        |
                 v       from majority        |
           +-----------+             +--------+-----+
   +------>| Follower  |------------>|  Candidate   |
   |       +-----------+  times out  +--------------+
   |            ^                         |
   |            |   discovers current     |  wins
   |            |   leader or new term    |  election
   |            |                         v
   |       +-----------+          +--------------+
   |       | Follower  |<--------+    Leader     |
   |       +-----------+ steps   +--------------+
   |                     down         |
   +----------------------------------+
         discovers higher term
```

- **Follower**: Passive. Responds to requests from leaders and candidates. If it hears nothing for a while (the **election timeout**), it becomes a candidate.
- **Candidate**: Actively seeking votes. If it gets votes from a majority, it becomes the leader. If another leader appears, it steps back down to follower.
- **Leader**: Handles all client requests. Replicates log entries to followers. Sends periodic heartbeats to prevent new elections.

Time in Raft is divided into **terms** — monotonically increasing integers that act like logical clocks. Each term begins with an election. If a candidate wins, it leads for the rest of that term. If no one wins (split vote), the term ends with no leader and a new term begins.

```
     Term 1         Term 2         Term 3       Term 4
  +------------+ +------------+ +----------+ +------------+
  | election + | | election + | | election | | election + |
  | normal op  | | normal op  | | (no      | | normal op  |
  |            | |            | |  leader) | |            |
  +------------+ +------------+ +----------+ +------------+
  ---time----------------------------------------------------------->
```

## Leader Election

When a follower's election timer fires without hearing from a leader, it starts an election:

1. Increment its current term.
2. Vote for itself.
3. Send `RequestVote` RPCs to all other nodes.
4. Wait for responses.

Each node votes for **at most one candidate per term** (first-come, first-served). A candidate wins if it receives votes from a **majority** of nodes (e.g., 3 out of 5). This majority requirement guarantees that at most one leader exists per term — two different candidates cannot both get a majority because the two majorities must overlap in at least one node, and that node can only vote once.

Here is how the etcd/raft library handles the transition. When the election timeout fires, `tickElection` sends a `MsgHup` message to itself:

```go
// raft.go — etcd-io/raft
func (r *raft) tickElection() {
    r.electionElapsed++
    if r.promotable() && r.pastElectionTimeout() {
        r.electionElapsed = 0
        r.Step(pb.Message{From: r.id, Type: pb.MsgHup})
    }
}
```

`MsgHup` triggers `becomeCandidate`, which increments the term, votes for self, and switches the message handler:

```go
func (r *raft) becomeCandidate() {
    r.step = stepCandidate
    r.reset(r.Term + 1)
    r.tick = r.tickElection
    r.Vote = r.id
    r.state = StateCandidate
}
```

The candidate then broadcasts `MsgVote` to all peers. When votes come back, the `stepCandidate` handler tallies them:

```go
func stepCandidate(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgVoteResp:
        gr, rj, res := r.poll(m.From, m.Type, !m.Reject)
        switch res {
        case quorum.VoteWon:
            r.becomeLeader()
            r.bcastAppend()
        case quorum.VoteLost:
            r.becomeFollower(r.Term, None)
        }
    case pb.MsgApp:
        // Another leader exists for this term — step down
        r.becomeFollower(m.Term, m.From)
        r.handleAppendEntries(m)
    }
    return nil
}
```

If the candidate wins, it immediately becomes leader and broadcasts an empty append entry (a "no-op") to assert its authority. If it discovers a message from a valid leader, it steps down.

### Randomized Timeouts Prevent Split Votes

What if two followers time out at the same instant and both become candidates? They could split the vote, with neither getting a majority. Raft handles this elegantly: each node picks a **random** election timeout from a range (e.g., 150–300ms). Because timeouts differ, it's very unlikely that two nodes start an election simultaneously. If a split vote does happen, both candidates time out again (with new random values), and the next round almost certainly produces a winner.

### Pre-Vote: Avoiding Disruption

A node that is partitioned from the cluster will keep timing out and incrementing its term. When it rejoins, its artificially high term forces the real leader to step down — disrupting the entire cluster over a single node's network blip.

etcd/raft solves this with **PreVote**. Before incrementing its term, a candidate runs a "pre-election" to check whether it *could* win. It asks peers: "Would you vote for me if I started a real election?" If a majority says no (because they're still hearing from a valid leader), the node stays a follower and doesn't disrupt anyone:

```go
func (r *raft) becomePreCandidate() {
    // Does NOT increment term
    r.step = stepCandidate
    r.trk.ResetVotes()
    r.tick = r.tickElection
    r.lead = None
    r.state = StatePreCandidate
}
```

## Log Replication

Once a leader is elected, it handles all client writes. Each write becomes an **entry** in the leader's log. The leader then replicates this entry to all followers. Here is the flow:

```
  Client          Leader (Node 1)       Follower (Node 2)    Follower (Node 3)
    |                  |                       |                     |
    |  PUT x=7         |                       |                     |
    |----------------->|                       |                     |
    |                  |  append to local log  |                     |
    |                  |  [term=3, idx=5, x=7] |                     |
    |                  |                       |                     |
    |                  |--- AppendEntries ---->|                     |
    |                  |--- AppendEntries --------------------------->|
    |                  |                       |                     |
    |                  |<-- success -----------|                     |
    |                  |<-- success --------------------------------|
    |                  |                       |                     |
    |                  |  majority replied     |                     |
    |                  |  => commit index 5    |                     |
    |                  |  => apply x=7 to      |                     |
    |                  |     state machine     |                     |
    |                  |                       |                     |
    |  ok              |--- next heartbeat --->|                     |
    |<-----------------|    (commitIdx=5)      |--- next heartbeat ->|
    |                  |                       |                     |
    |                  |               apply x=7 to          apply x=7 to
    |                  |               state machine         state machine
```

### The Log Structure

Every entry in the log has three fields:

```
  Log (Node 1 — Leader, Term 3)

  Index:  | 1 | 2 | 3 | 4 | 5 |
  Term:   | 1 | 1 | 2 | 3 | 3 |
  Data:   |x=1|y=2|x=3|y=5|x=7|
                                ^
                             lastIndex
```

- **Index**: Position in the log (monotonically increasing).
- **Term**: The term when the entry was created.
- **Data**: The command to apply to the state machine.

The etcd/raft `raftLog` struct manages the log across stable storage and an in-memory buffer:

```go
// log.go — etcd-io/raft
type raftLog struct {
    storage   Storage   // persisted entries (e.g., on disk)
    unstable  unstable  // new entries not yet persisted
    committed uint64    // highest index known to be on a quorum
    applied   uint64    // highest index applied to state machine
}
```

There is a crucial invariant: `applied <= committed <= lastIndex`. Entries are first appended (unstable), then persisted (storage), then committed (quorum ack), then applied (state machine).

### AppendEntries: The Consistency Check

The leader sends `AppendEntries` RPCs with the new entries and a **consistency check**: it includes the index and term of the entry *immediately before* the new ones. The follower rejects the request if it doesn't have a matching entry at that position:

```
  Leader sends:
    prevLogIndex = 4
    prevLogTerm  = 3
    entries      = [{index:5, term:3, data:"x=7"}]

  Follower's log:
    | 1 | 2 | 3 | 4 |
    | 1 | 1 | 2 | 3 |    <-- term at index 4 is 3, matches!

    => Accept. Append entry 5.

  Different follower's log (was partitioned):
    | 1 | 2 | 3 | 4 |
    | 1 | 1 | 2 | 2 |    <-- term at index 4 is 2, mismatch!

    => Reject. Leader will decrement prevLogIndex and retry.
```

This check is what gives Raft its **Log Matching Property**: if two logs contain an entry with the same index and term, then all entries up to that index are identical. The leader never gives up — it keeps decrementing `prevLogIndex` until the follower's log matches, then sends all entries from that point forward.

The `matchTerm` method in etcd/raft implements this check:

```go
// log.go — etcd-io/raft
func (l *raftLog) matchTerm(id entryID) bool {
    t, err := l.term(id.index)
    if err != nil {
        return false
    }
    return t == id.term
}
```

### Commitment

An entry is **committed** when the leader knows it has been replicated to a majority of nodes. The leader tracks each follower's progress (how far along their log is) and advances the commit index when a majority has caught up:

```
  Leader tracks match index for each follower:

  Node 1 (leader):  matchIndex = 5
  Node 2:           matchIndex = 5   <-- ack'd up to 5
  Node 3:           matchIndex = 4   <-- still catching up

  Sorted matchIndexes: [4, 5, 5]
  Majority position (N/2): index 1 => matchIndex = 5

  Is entry 5's term == current term?  term=3, currentTerm=3  => YES
  => commitIndex advances to 5
```

The term check is critical. A leader only commits entries from its **own term**. Entries from previous terms get committed indirectly — once a new entry from the current term is committed, all prior entries are committed too. This prevents a subtle bug where a leader could commit an old entry, get replaced, and have that entry overwritten by a new leader (see Section 5.4.2 of the Raft paper for the full scenario).

## Safety: The Election Restriction

For consensus to work, a newly elected leader must already have every committed entry in its log. Raft enforces this through a **voting restriction**: a node refuses to vote for a candidate whose log is less up-to-date than its own.

"Up-to-date" is defined by comparing the last entry in each log:

```go
// log.go — etcd-io/raft
func (l *raftLog) isUpToDate(their entryID) bool {
    our := l.lastEntryID()
    return their.term > our.term ||
           their.term == our.term && their.index >= our.index
}
```

This means:

1. The candidate with the higher last-entry term wins.
2. If the terms are equal, the longer log wins.

Since a committed entry must be on a majority of nodes, and a candidate needs votes from a majority, the candidate must contact at least one node that has the committed entry. That node will refuse to vote for anyone with a less complete log. Therefore, the winner of any election is guaranteed to have all committed entries.

```
  Node A log: | 1 | 1 | 2 | 3 |     lastTerm=3, lastIndex=4
  Node B log: | 1 | 1 | 2 |         lastTerm=2, lastIndex=3
  Node C log: | 1 | 1 | 2 | 3 | 3 | lastTerm=3, lastIndex=5

  If Node B starts an election:
    Node A: "My last term is 3, yours is 2. Rejected."
    Node C: "My last term is 3, yours is 2. Rejected."
    Node B loses.

  If Node A starts an election:
    Node B: "Your last term 3 > my 2. Granted."
    Node C: "Same term 3, but your index 4 < my 5. Rejected."
    Node A needs Node B's vote + its own = 2 out of 3. Wins.
```

## Putting It Together: The Leader's Message Loop

When a client proposes a write to the leader, the `stepLeader` function handles the full pipeline:

```go
// raft.go — etcd-io/raft
func stepLeader(r *raft, m pb.Message) error {
    switch m.Type {
    case pb.MsgBeat:
        r.bcastHeartbeat()
        return nil
    case pb.MsgProp:
        // 1. Append entries to local log
        if !r.appendEntry(m.Entries...) {
            return ErrProposalDropped
        }
        // 2. Broadcast to all followers
        r.bcastAppend()
        return nil
    case pb.MsgCheckQuorum:
        // Step down if quorum of followers hasn't responded recently
        if !r.trk.QuorumActive() {
            r.becomeFollower(r.Term, None)
        }
        return nil
    }
    return nil
}
```

The leader also sends periodic heartbeats to prevent followers from starting elections:

```go
func (r *raft) tickHeartbeat() {
    r.heartbeatElapsed++
    r.electionElapsed++

    if r.state != StateLeader {
        return
    }
    if r.heartbeatElapsed >= r.heartbeatTimeout {
        r.heartbeatElapsed = 0
        r.Step(pb.Message{From: r.id, Type: pb.MsgBeat})
    }
}
```

Here is the complete lifecycle of a single write flowing through the system:

```
                         +----------------------------+
                         |     Client sends write     |
                         +-------------+--------------+
                                       |
                                       v
                         +----------------------------+
                         | Leader appends to its log  |
                         | (stepLeader -> appendEntry)|
                         +-------------+--------------+
                                       |
                                       v
                         +----------------------------+
                         | Leader sends AppendEntries |
                         | to all followers           |
                         | (bcastAppend)              |
                         +-------------+--------------+
                                       |
                          +------------+-------------+
                          |                          |
                          v                          v
                   +-------------+           +-------------+
                   | Follower 2  |           | Follower 3  |
                   | checks      |           | checks      |
                   | prevLog,    |           | prevLog,    |
                   | appends     |           | appends     |
                   | entry,      |           | entry,      |
                   | replies ok  |           | replies ok  |
                   +------+------+           +------+------+
                          |                          |
                          +------------+-------------+
                                       |
                                       v
                         +----------------------------+
                         | Leader sees majority ack   |
                         | => advances commitIndex    |
                         +-------------+--------------+
                                       |
                                       v
                         +----------------------------+
                         | Leader applies entry to    |
                         | state machine, replies     |
                         | to client                  |
                         +----------------------------+
                                       |
                                       v
                         +----------------------------+
                         | Next heartbeat carries new |
                         | commitIndex to followers   |
                         | => they apply too          |
                         +----------------------------+
```

## Raft in Practice

Raft is not just a paper — it runs in some of the most critical infrastructure in production:

| System       | What it uses Raft for                                      |
|--------------|------------------------------------------------------------|
| **etcd**     | Replicating the key-value store that backs Kubernetes      |
| **TiKV**     | Each Region (data shard) is a Raft group for replication   |
| **CockroachDB** | Each Range (data shard) uses Raft for consensus        |
| **Consul**   | Replicating service discovery and configuration data       |
| **Kafka (KRaft)** | Replacing ZooKeeper for metadata consensus            |

The etcd/raft library itself is designed as a **library, not a framework**. It does not manage networking, disk I/O, or timers. Instead, the application drives it: you call `tick()` to advance the clock, call `Step()` to feed in messages, and read from `Ready()` to get entries that need to be persisted and messages that need to be sent. This design gives applications full control over I/O, making etcd/raft one of the most flexible Raft implementations available.

```
  Your Application
  +---------------------------------------------------+
  |                                                   |
  |  for {                                            |
  |      select {                                     |
  |      case <-ticker.C:                             |
  |          node.Tick()      // advance logical clock|
  |                                                   |
  |      case msg := <-network:                       |
  |          node.Step(msg)   // feed in messages     |
  |                                                   |
  |      case rd := <-node.Ready():                   |
  |          // 1. persist rd.Entries to disk          |
  |          // 2. send rd.Messages over network      |
  |          // 3. apply rd.CommittedEntries to        |
  |          //    state machine                       |
  |          node.Advance()                           |
  |      }                                            |
  |  }                                                |
  |                                                   |
  +---------------------------------------------------+
```

## References

1. Ongaro, D. and Ousterhout, J. *In Search of an Understandable Consensus Algorithm* (2014) [paper](https://raft.github.io/raft.pdf)
2. The Raft Consensus Algorithm — interactive visualization [site](https://raft.github.io/)
3. etcd-io/raft — the Go implementation [`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go)
4. etcd-io/raft — log management [`log.go`](https://github.com/etcd-io/raft/blob/main/log.go)
5. Lamport, L. *The Part-Time Parliament* (Paxos, 1989) [paper](https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf)
6. TiKV Raft documentation [doc](https://tikv.org/deep-dive/consensus-algorithm/raft/)
7. etcd documentation — Raft internals [doc](https://etcd.io/docs/v3.5/learning/api/)
8. Kafka KRaft documentation [doc](https://kafka.apache.org/documentation/#kraft)
