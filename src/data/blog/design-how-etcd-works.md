---
author: JZ
pubDatetime: 2026-08-11T06:23:00Z
modDatetime: 2026-08-11T06:23:00Z
title: System Design - How etcd Works
tags:
  - design-system
  - design-distributed
description:
  "How etcd works: Raft consensus, bbolt storage engine, MVCC revisions, watch mechanism, lease system, linearizable reads, and how Kubernetes depends on it."
---

## Table of contents

## Context

Distributed systems need a place to store small but critical pieces of data: cluster membership, configuration, leader election results, distributed locks. This data is small in volume (megabytes, not gigabytes) but demands extreme reliability. If this store goes down or returns stale data, the entire cluster misbehaves.

Before etcd, the standard answer was **Apache ZooKeeper** (2010). ZooKeeper works, but it has operational pain points: a Java dependency, complex session semantics, a hierarchical namespace that forces awkward data modeling, and a watch API that fires only once per registration. CoreOS created **etcd** in 2013 to be a simpler, more modern alternative written in Go with a flat key-value model and a gRPC API.

Today, etcd is best known as the **backing store for Kubernetes**. Every pod, service, configmap, secret, and controller state in a Kubernetes cluster lives in etcd. The Kubernetes API server is the sole client that talks to etcd. If etcd is slow, the entire cluster feels it. If etcd loses data, the cluster is unrecoverable without backups.

etcd guarantees:

- **Strong consistency** — every read can be linearizable (reflects the most recent write).
- **High availability** — tolerates up to $(n-1)/2$ node failures in an $n$-node cluster (typically 3 or 5 nodes).
- **Watch support** — clients can subscribe to key changes and receive ordered event streams.
- **Lease-based TTLs** — keys can auto-expire, enabling leader election and service discovery patterns.

Let's open the hood and see how all of this works.

## Architecture Overview

At the highest level, etcd is a replicated state machine. Clients send requests via gRPC, the Raft consensus module replicates them across nodes, and each node applies committed entries to a local storage engine.

```
                           etcd Cluster (3 nodes)

  Client (gRPC)
       |
       v
  +----+--------------------------------------------+
  |              etcd Server (Leader)               |
  |                                                 |
  |  +----------+    +---------+    +-----------+   |
  |  |  gRPC    |--->|  Raft   |--->|    WAL    |   |
  |  |  API     |    | Module  |    | (append   |   |
  |  | (etcd-   |    |         |    |  only log)|   |
  |  |  server) |    +----+----+    +-----------+   |
  |  +----------+         |                         |
  |                       | commit                  |
  |                       v                         |
  |              +--------+--------+                |
  |              |   Apply Loop    |                |
  |              |  (mvcc/store)   |                |
  |              +--------+--------+                |
  |                       |                         |
  |                       v                         |
  |              +--------+--------+                |
  |              |     bbolt       |                |
  |              |  (B+tree on     |                |
  |              |   disk, mmap)   |                |
  |              +-----------------+                |
  +-------------------+-----------------------------+
                      |
                      | Raft messages (AppendEntries, Vote, Heartbeat)
                      |
         +------------+------------+
         |                         |
         v                         v
  +------+------+           +------+------+
  | etcd Server |           | etcd Server |
  | (Follower)  |           | (Follower)  |
  +-------------+           +-------------+
```

The key components:

- **gRPC API layer** — handles client requests (Put, Range, Watch, Lease, etc.)
- **Raft module** — the consensus engine that ensures all nodes agree on the same log of operations
- **WAL (Write-Ahead Log)** — durably persists Raft log entries before they are acknowledged
- **Apply loop** — takes committed Raft entries and applies them to the MVCC store
- **bbolt** — a B+tree-based key-value store (fork of BoltDB) that holds the actual data on disk

## Raft Consensus

etcd uses the **Raft** consensus algorithm (Ongaro and Ousterhout, 2014) to replicate data across nodes. The Raft implementation lives in a standalone library at [`etcd-io/raft`](https://github.com/etcd-io/raft), which etcd imports as a dependency.

### Why Raft?

Raft was designed to be understandable. Compared to Paxos, it separates concerns cleanly: leader election, log replication, and safety are distinct subproblems. etcd was one of the first production systems to adopt Raft, and the etcd/raft library is now used by many other systems (CockroachDB, TiKV, Dgraph).

### Leader Election

In a Raft cluster, one node is the **leader** and the rest are **followers**. The leader handles all client writes and replicates them to followers.

```
  Node states and transitions:

  +----------+    timeout, no heartbeat    +----------+
  | Follower |--------------------------->| Candidate |
  +----+-----+                            +-----+----+
       ^                                        |
       |          receives higher term          |
       +----------------------------------------+
       ^                                        |
       |         wins election (majority)       |
       |                                        v
       |                                  +-----+----+
       +----------------------------------+  Leader   |
              discovers higher leader     +----------+
```

1. A follower that hasn't heard from the leader within the **election timeout** (randomized, typically 1000-1500ms) becomes a candidate.
2. The candidate increments its **term** (a monotonically increasing epoch number) and requests votes from all peers.
3. If it receives votes from a majority, it becomes leader for that term.
4. The leader sends periodic **heartbeats** (empty AppendEntries RPCs) to maintain authority.

The core Raft state machine is defined in [`raft.go`](https://github.com/etcd-io/raft/blob/main/raft.go):

```go
type raft struct {
    id uint64

    Term uint64
    Vote uint64

    state StateType // follower, candidate, leader, or preCandidate

    raftLog *raftLog

    // progress tracking for each peer (leader only)
    trk tracker.ProgressTracker

    // ...
}
```

### Log Replication

Once a leader is elected, all client writes flow through it:

```
  Write Path Through Raft:

  1. Client sends PUT("key", "value") to leader
  2. Leader appends entry to its local log
  3. Leader sends AppendEntries RPC to all followers
  4. Each follower appends to its log and responds
  5. Once a majority (including leader) has the entry -> committed
  6. Leader applies to state machine and responds to client
  7. Followers learn of commit via next heartbeat/AppendEntries

  Timeline:
  ----------------------------------------------------------->
  Leader:   [propose] [append] ----[wait majority]----> [commit] [apply] [respond]
                                  /                 \
  Follower1:          [receive] [append] [ack]       \
                                                      \
  Follower2:          [receive] [append] [ack]         (majority = 2 of 3)
```

A log entry is **committed** when a majority of nodes have durably stored it. Once committed, it will never be lost (even if the leader crashes). The safety proof guarantees that committed entries are never overwritten.

The `Step` function in the raft library processes incoming messages:

```go
func (r *raft) Step(m pb.Message) error {
    // Handle term changes
    switch {
    case m.Term == 0:
        // local message
    case m.Term > r.Term:
        // step down to follower
    case m.Term < r.Term:
        // ignore stale message
    }

    switch m.Type {
    case pb.MsgApp:        // AppendEntries from leader
        r.handleAppendEntries(m)
    case pb.MsgVote:       // RequestVote from candidate
        r.handleVote(m)
    case pb.MsgHeartbeat:  // Heartbeat from leader
        r.handleHeartbeat(m)
    // ...
    }
    return nil
}
```

An important design choice: the etcd/raft library is **not** a standalone server. It is a pure state machine that takes input messages, produces output messages, and tells the embedding application what to persist and send. The etcd server is responsible for actually writing to the WAL and sending network messages. This separation makes the library testable and reusable.

## Storage: bbolt and MVCC

### bbolt: The On-Disk Engine

etcd stores all data in **bbolt** (formerly BoltDB), a pure-Go embedded key-value store based on a **B+tree**. The source lives at [`etcd-io/bbolt`](https://github.com/etcd-io/bbolt).

bbolt properties:

- **Single-file database** — one `.db` file on disk, memory-mapped for reads
- **Copy-on-write B+tree** — writes create new pages, old pages are freed after commit
- **Single-writer, multiple-reader** — one write transaction at a time, unlimited concurrent read transactions
- **ACID transactions** — full durability via `fsync` on commit

The database is organized into **buckets** (like tables). etcd uses two main buckets:

- `key` bucket — stores revision-to-value mappings
- `meta` bucket — stores metadata (consistent index, scheduled compaction, etc.)

### MVCC: Multi-Version Concurrency Control

etcd does not overwrite old values. Instead, every write creates a new **revision**. This is etcd's MVCC model, implemented in [`server/storage/mvcc`](https://github.com/etcd-io/etcd/tree/main/server/storage/mvcc).

A **revision** is a pair `(main, sub)`:

- **main** — a globally incrementing counter. Every transaction that modifies state gets a new main revision.
- **sub** — an incrementing counter within a single transaction (for transactions that touch multiple keys).

```go
// revision in server/storage/mvcc/revision.go
type revision struct {
    main int64
    sub  int64
}
```

The revision is encoded as a fixed-size 17-byte key for storage in bbolt:

```go
func revToBytes(rev revision) []byte {
    buf := make([]byte, 17)
    binary.BigEndian.PutUint64(buf[0:8], uint64(rev.main))
    buf[8] = '_' // separator
    binary.BigEndian.PutUint64(buf[9:17], uint64(rev.sub))
    return buf
}
```

Big-endian encoding ensures that revisions sort correctly in bbolt's B+tree (which orders keys lexicographically).

### Two-Level Indexing

etcd maintains two data structures:

```
  In-memory B-tree index (treeIndex):
  +-----------+      +-------------------------------------------+
  | key: "/a" | ---> | generations: [{created: 2, modified: 5},  |
  |           |      |               revisions: [2, 3, 5]]       |
  +-----------+      +-------------------------------------------+
  | key: "/b" | ---> | generations: [{created: 4, modified: 4},  |
  |           |      |               revisions: [4]]             |
  +-----------+      +-------------------------------------------+

  On-disk bbolt (key bucket):
  +---------------------+------------------------------------------+
  | revision key (bytes)| value (protobuf KeyValue)                |
  +---------------------+------------------------------------------+
  | rev(2,0)            | {key:"/a", value:"v1", create:2, mod:2}  |
  | rev(3,0)            | {key:"/a", value:"v2", create:2, mod:3}  |
  | rev(4,0)            | {key:"/b", value:"x1", create:4, mod:4}  |
  | rev(5,0)            | {key:"/a", value:"v3", create:2, mod:5}  |
  +---------------------+------------------------------------------+
```

1. **treeIndex** (in-memory) — maps each user key to a list of revisions that touched it. Implemented as a B-tree in [`server/storage/mvcc/index.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/mvcc/index.go).
2. **bbolt key bucket** (on-disk) — maps each revision to the full key-value record (encoded as protobuf).

To read key `/a` at revision 4:
1. Look up `/a` in treeIndex, find revisions `[2, 3, 5]`.
2. Binary search for the largest revision `<= 4`, which is `3`.
3. Read `rev(3,0)` from bbolt to get the value `"v2"`.

This design enables **time-travel queries**: you can read any key at any past revision, which is how etcd watches deliver historical events.

### Compaction

Old revisions accumulate forever unless **compacted**. Compaction removes revisions below a threshold:

```bash
# compact all revisions up to revision 1000
etcdctl compaction 1000
```

After compaction, reads at revisions below 1000 return an error. Watches that try to start from a compacted revision receive a `ErrCompacted` error and must restart from a more recent revision.

Kubernetes periodically compacts etcd to prevent unbounded growth (default: every 5 minutes, retaining the last 5 minutes of history). The compaction process:

1. Removes all revision entries from the bbolt `key` bucket where `revision.main <= compactRevision`.
2. Updates the treeIndex to remove references to compacted revisions.
3. Records the compaction point in the `meta` bucket so it survives restarts.

Note that compaction does **not** reclaim disk space immediately. The freed pages go into bbolt's freelist for reuse. To actually shrink the database file, you must run **defragmentation**:

```bash
etcdctl defrag --endpoints=http://localhost:2379
```

Defragmentation rewrites the bbolt file, compacting it. This is an expensive operation that briefly blocks writes, so it should be done during maintenance windows.

## Write Path

Let's trace what happens when a client executes `etcdctl put /mykey "hello"`:

```
  Client                    Leader                 Followers
    |                         |                        |
    |  PUT /mykey "hello"     |                        |
    |  (gRPC KV.Put)         |                        |
    |------------------------>|                        |
    |                         |                        |
    |                   1. Serialize to               |
    |                      InternalRaftRequest        |
    |                         |                        |
    |                   2. Propose to Raft            |
    |                      raft.Propose(data)         |
    |                         |                        |
    |                   3. Raft appends to            |
    |                      leader's log               |
    |                         |                        |
    |                   4. Leader writes WAL          |
    |                      (fsync)                    |
    |                         |                        |
    |                   5. Send AppendEntries ------->|
    |                         |                        |
    |                         |   6. Follower writes  |
    |                         |      WAL (fsync)      |
    |                         |                        |
    |                         |<--- 7. Ack -----------|
    |                         |                        |
    |                   8. Majority acked:            |
    |                      entry is COMMITTED         |
    |                         |                        |
    |                   9. Apply to MVCC store:       |
    |                      - increment revision       |
    |                      - write to bbolt           |
    |                      - update treeIndex         |
    |                         |                        |
    |                  10. Respond to client           |
    |<------------------------|                        |
    |                         |                        |
    |                  11. Followers apply            |
    |                      (on next heartbeat)        |
    |                         |                        |
```

The apply step is where the MVCC store is updated. In [`server/storage/mvcc/kvstore_txn.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/mvcc/kvstore_txn.go), the `put` function:

```go
func (tw *storeTxnWrite) put(key, value []byte, leaseID lease.LeaseID) {
    rev := tw.beginRev + 1
    c := rev
    oldLease := lease.NoLease

    // check if key already exists
    _, created, ver, err := tw.s.kvindex.Get(key, rev)
    if err == nil {
        c = created.main
        oldLease = tw.s.le.GetLease(lease.LeaseItem{Key: string(key)})
    }

    ibytes := newRevBytes()
    idxRev := revision{main: rev, sub: int64(tw.storeTxnWrite.subRev)}
    revToBytes(idxRev, ibytes)

    kv := mvccpb.KeyValue{
        Key:            key,
        Value:          value,
        CreateRevision: c,
        ModRevision:    rev,
        Version:        ver + 1,
        Lease:          int64(leaseID),
    }
    d, _ := kv.Marshal()

    tw.tx.UnsafeSeqPut(schema.Key, ibytes, d)
    tw.s.kvindex.Put(key, idxRev)
    tw.storeTxnWrite.subRev++
}
```

Key observations:

- The **revision** is determined at apply time, not propose time. This ensures all nodes assign the same revision to the same operation.
- The write goes into bbolt's current write transaction (batched for performance).
- The in-memory treeIndex is updated in the same operation.

### WAL: Write-Ahead Log

Before Raft entries are replicated, they are persisted to the **WAL** on the leader (and on each follower upon receipt). The WAL ensures that committed entries survive crashes. WAL files live in the etcd data directory under `member/wal/`.

```
  etcd data directory layout:

  /var/lib/etcd/
  +-- member/
      +-- wal/
      |   +-- 0000000000000000-0000000000000000.wal
      |   +-- 0000000000000001-0000000000001000.wal
      |   +-- ...
      +-- snap/
      |   +-- 0000000000000003-0000000000002000.snap
      |   +-- ...
      +-- db   (bbolt database file)
```

The WAL format is a sequence of records. Each record is:

```
  +--------+-------+---------+--------+
  |  type  |  CRC  |  data   |  pad   |
  | (int64)| (uint32)| (var) | (align)|
  +--------+-------+---------+--------+
```

Record types include:
- **entryType** — a Raft log entry (proposals, config changes)
- **stateType** — the current Raft HardState (term, vote, commit index)
- **snapshotType** — marks the point where a snapshot was taken
- **crcType** — a checksum validation record

On recovery, etcd replays the WAL from the last snapshot forward. This reconstructs both the Raft log and the hard state. If any record fails CRC validation, recovery stops — data corruption is never silently ignored.

The WAL uses **preallocated segment files** (default 64 MB each) to avoid filesystem fragmentation and ensure sequential writes. When a segment fills up, a new one is created. Old segments are garbage collected after a snapshot covers their entries.

Source: [`server/storage/wal/wal.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/wal/wal.go)

### Snapshots

As the WAL grows, replaying it from the beginning would take too long. etcd periodically takes **snapshots** of the entire bbolt state and writes them to the `snap/` directory. After a snapshot, WAL entries before the snapshot's index can be discarded.

Snapshots also serve another purpose: when a new node joins the cluster (or a follower falls too far behind), the leader sends its snapshot rather than replaying thousands of individual log entries. This is called **InstallSnapshot** in Raft terminology.

The snapshot threshold is configurable (default: every 10,000 applied entries):

```bash
etcd --snapshot-count=10000
```

## Read Path

etcd supports two read consistency levels:

### Serializable Reads (Fast, Potentially Stale)

A serializable read is served directly from the local node's bbolt store without any Raft interaction. It's fast but might return stale data if the node is a lagging follower.

```bash
etcdctl get /mykey --consistency=s
```

### Linearizable Reads (Default, Strongly Consistent)

A **linearizable** read guarantees the client sees the most recently committed value. This is etcd's default. But how do you ensure the node serving the read is the current leader and has applied all committed entries?

etcd uses the **ReadIndex** protocol (an optimization described in the Raft paper, Section 8):

```
  Linearizable Read Flow (ReadIndex):

  Client                       Leader                     Followers
    |                            |                            |
    |  GET /mykey                |                            |
    |--------------------------->|                            |
    |                            |                            |
    |                     1. Record current                   |
    |                        commit index                     |
    |                        (readIndex = 47)                 |
    |                            |                            |
    |                     2. Send heartbeat to                |
    |                        confirm leadership               |
    |                            |--------------------------->|
    |                            |<---------------------------|
    |                            |  (majority responded)      |
    |                            |                            |
    |                     3. Wait until applied               |
    |                        index >= readIndex               |
    |                            |                            |
    |                     4. Read from bbolt                  |
    |                        at current revision              |
    |                            |                            |
    |<---------------------------|                            |
    |  response: "hello"         |                            |
```

Why step 2? Consider this scenario: a network partition isolates the old leader. A new leader is elected. The old leader might still think it's the leader. The heartbeat round-trip confirms that a majority still recognizes this node as leader, so its commit index is authoritative.

Why step 3? The commit index might be ahead of the applied index (entries committed but not yet applied to bbolt). Waiting ensures the read reflects all committed writes.

The implementation is in [`server/etcdserver/v3_server.go`](https://github.com/etcd-io/etcd/blob/main/server/etcdserver/v3_server.go):

```go
func (s *EtcdServer) linearizableReadNotify(ctx context.Context) error {
    s.readMu.RLock()
    nc := s.readNotifier
    s.readMu.RUnlock()

    // submit a read index request
    nr := newNotifier()
    s.readwaitc <- nr

    select {
    case <-nc.c:
        return nc.err
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

There is also a **LeaseRead** optimization where the leader skips the heartbeat round-trip if it recently confirmed leadership (within the lease interval). This trades a small window of potential staleness for lower latency.

## Watch Mechanism

One of etcd's most powerful features is **watches**: clients can subscribe to changes on a key or key range and receive an ordered stream of events. Kubernetes uses watches extensively — the API server watches etcd for changes, and kubelets watch the API server.

### How Watches Work

The watch system is implemented in [`server/storage/mvcc/watchable_store.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/mvcc/watchable_store.go). The architecture:

```
  Client A (watch /foo)         etcd Server
  Client B (watch /bar/*)
       |                    +---------------------------+
       |  gRPC bidi stream  |     Watch gRPC Service    |
       |<------------------>|                           |
       |                    +------------+--------------+
       |                                 |
       |                    +------------v--------------+
       |                    |     watchableStore        |
       |                    |                           |
       |                    |  +---------------------+  |
       |                    |  | synced watchers     |  |
       |                    |  | (up-to-date, cheap) |  |
       |                    |  +---------------------+  |
       |                    |                           |
       |                    |  +---------------------+  |
       |                    |  | unsynced watchers   |  |
       |                    |  | (catching up from   |  |
       |                    |  |  historical rev)    |  |
       |                    |  +---------------------+  |
       |                    |                           |
       |                    |  +---------------------+  |
       |                    |  | event buffer        |  |
       |                    |  | (recent events for  |  |
       |                    |  |  fast sync)         |  |
       |                    |  +---------------------+  |
       |                    +---------------------------+
```

### Synced vs Unsynced Watchers

- A **synced watcher** is caught up to the current revision. When a new write is applied, the store checks all synced watchers to see if the key matches. Matching events are sent immediately. This is the steady-state: zero additional disk I/O.

- An **unsynced watcher** was created with a historical start revision (e.g., "watch /foo from revision 100"). It needs to catch up by reading events from bbolt. A background goroutine (`syncWatchersLoop`) processes unsynced watchers in batches, reading revisions from disk and streaming them to the client. Once caught up, the watcher moves to the synced set.

```go
// watchableStore in server/storage/mvcc/watchable_store.go
type watchableStore struct {
    *store

    mu sync.RWMutex

    // synced has watchers that are caught up to current rev
    synced watcherGroup

    // unsynced has watchers that need to catch up
    unsynced watcherGroup

    // victims are watchers whose send buffer is full
    victims []watcherBatch
}
```

### Event Delivery

When a write is applied, the `notify` function fires:

```go
func (s *watchableStore) notify(rev int64, evs []mvccpb.Event) {
    for w, eb := range newWatcherBatch(&s.synced, evs) {
        if eb.revs != 1 {
            // batch events
        }
        select {
        case w.ch <- WatchResponse{Events: eb.evs, Revision: rev}:
        default:
            // channel full, move to victims for retry
            s.victims = append(s.victims, watcherBatch{w: w, eb: eb})
        }
    }
}
```

Key design points:

- Events are delivered **in revision order** — a client never sees event at revision 10 before revision 9.
- The watch stream is a **server-side gRPC streaming** RPC — one long-lived connection, no polling.
- If a client is slow (channel full), the watcher becomes a "victim" and is retried later. It is never dropped.
- Watches can be **multiplexed** — a single gRPC stream can carry multiple watches (identified by watch ID), reducing connection overhead.

### Why Watches Are Efficient

Compare to polling:

| Approach | Network cost | Latency | Server load |
|----------|-------------|---------|-------------|
| Polling every 1s | 1 RPC/second regardless of changes | up to 1s stale | high (scans on every poll) |
| etcd Watch | 0 RPCs when idle, instant on change | near-zero | minimal (in-memory match) |

Kubernetes leverages this heavily. The API server maintains long-lived watches on etcd for every resource type. When a pod is created, etcd notifies the API server instantly, which then notifies the scheduler, which then notifies the kubelet. The entire propagation happens in milliseconds.

## Leases

A **lease** is a time-to-live (TTL) mechanism. You create a lease with a TTL, attach keys to it, and when the lease expires (or is revoked), all attached keys are deleted. This enables distributed patterns like leader election and service discovery.

### Lease Lifecycle

```
  Client                          etcd
    |                               |
    |  LeaseGrant(TTL=10s)          |
    |------------------------------>|
    |  lease_id = 7587836203        |
    |<------------------------------|
    |                               |
    |  Put("/leader", "node-1",     |
    |       lease=7587836203)       |
    |------------------------------>|
    |  ok                           |
    |<------------------------------|
    |                               |
    |  LeaseKeepAlive(7587836203)   |  (every ~TTL/3 seconds)
    |------------------------------>|
    |  TTL refreshed                |
    |<------------------------------|
    |                               |
    |  ... client crashes ...       |
    |                               |
    |               (10 seconds pass with no keepalive)
    |                               |
    |                          lease expires:
    |                          DELETE "/leader"
    |                               |
```

### How Leases Work Internally

The lease subsystem is in [`server/lease`](https://github.com/etcd-io/etcd/tree/main/server/lease). The `Lessor` manages all active leases:

```go
// Lessor in server/lease/lessor.go
type lessor struct {
    mu sync.RWMutex

    // all active leases indexed by ID
    leaseMap map[LeaseID]*Lease

    // heap ordered by expiry time
    leaseExpiredNotifier *LeaseExpiredNotifier

    // checkpoint interval for persisting remaining TTL
    checkpointInterval time.Duration
}
```

Key operations:

- **Grant** — creates a lease with a TTL, assigns an ID, and persists to bbolt.
- **Attach** — associates a key with a lease. When the lease expires, the key is auto-deleted.
- **KeepAlive** — resets the lease's expiry timer. Clients must call this periodically (typically TTL/3).
- **Revoke** — immediately expires a lease and deletes all attached keys.

### Leader Election Pattern

A common use of leases is distributed leader election:

```go
// Pseudocode for leader election using etcd leases
func campaignForLeader(client *clientv3.Client) {
    // 1. Create a lease
    lease, _ := client.Grant(ctx, 15) // 15-second TTL

    // 2. Try to create the leader key (only succeeds if key doesn't exist)
    txn := client.Txn(ctx)
    txn.If(clientv3.Compare(clientv3.CreateRevision("/election/leader"), "=", 0))
    txn.Then(clientv3.OpPut("/election/leader", "my-id", clientv3.WithLease(lease.ID)))
    resp, _ := txn.Commit()

    if resp.Succeeded {
        // I am the leader! Keep the lease alive.
        ch, _ := client.KeepAlive(ctx, lease.ID)
        // process ch to confirm keepalives are working
    } else {
        // Someone else is leader. Watch and wait.
        client.Watch(ctx, "/election/leader")
    }
}
```

If the leader crashes, it stops sending keepalives, the lease expires after 15 seconds, the key is deleted, and another node can claim leadership. Watchers on the key are notified immediately when the deletion happens.

### Lease Checkpointing

In a cluster, only the leader's node tracks lease expiry timers. But what happens during a leader failover? Without any persistence, the new leader would reset all lease TTLs, potentially extending them far beyond what clients expect.

etcd solves this with **lease checkpointing**: the leader periodically persists the remaining TTL of each lease to the Raft log. When a new leader takes over, it loads the checkpointed TTLs rather than starting fresh.

```
  Lease checkpointing timeline:

  Leader A                                    Leader B (after failover)
    |                                              |
    | Lease X: TTL=30s, remaining=20s              |
    |                                              |
    | checkpoint(X, remaining=20s)                 |
    | ---> Raft log                                |
    |                                              |
    |  ... leader failover ...                     |
    |                                              |
    |                            Load checkpoint:  |
    |                            Lease X remaining=20s
    |                            (not reset to 30s)|
    |                                              |
```

Without checkpointing, after failover the new leader would give lease X a fresh 30-second TTL, even though 10 seconds had already elapsed. This could violate the client's expectations about when keys expire.

### Lease Efficiency

etcd uses a **min-heap** ordered by expiry time to efficiently find expired leases. The `revokeExpiredLeases` goroutine runs periodically (every 500ms) and pops leases from the heap whose expiry time has passed:

```go
func (le *lessor) revokeExpiredLeases() {
    for {
        le.mu.Lock()
        l := le.leaseExpiredNotifier.Poll()
        if l == nil || time.Now().Before(l.expiry) {
            le.mu.Unlock()
            break
        }
        le.mu.Unlock()
        le.Revoke(l.ID)
    }
}
```

This is $O(\log n)$ per lease expiry (heap pop), making it efficient even with thousands of active leases.

## How Kubernetes Uses etcd

Kubernetes stores **all cluster state** in etcd. There is no other persistent store. The architecture is deliberately simple:

```
  +-------------+     +-------------+     +-------------+
  |   kubectl   |     |  scheduler  |     |  controller |
  |             |     |             |     |  manager    |
  +------+------+     +------+------+     +------+------+
         |                   |                   |
         +-------------------+-------------------+
                             |
                             v
                   +---------+---------+
                   |    kube-apiserver  |   <-- ONLY etcd client
                   +---------+---------+
                             |
                             v
                   +---------+---------+
                   |       etcd        |
                   |  (3 or 5 nodes)   |
                   +-------------------+
```

### What K8s Stores

Every Kubernetes object is a key in etcd. The key format is:

```
/registry/<resource-type>/<namespace>/<name>
```

Examples:

```
/registry/pods/default/nginx-7d6f9f8b8b-abc12
/registry/services/kube-system/kube-dns
/registry/configmaps/default/my-config
/registry/secrets/default/db-password
/registry/deployments/production/web-app
/registry/nodes/worker-node-01
```

The values are protobuf-encoded Kubernetes objects (pods, services, etc.).

### Why the API Server is the Only Client

Kubernetes enforces a single-client model for etcd:

1. **Validation** — the API server validates all objects before writing to etcd. Direct writes would bypass validation.
2. **Admission control** — webhooks, resource quotas, and policies are enforced at the API layer.
3. **Watch fan-out** — the API server maintains a single watch on etcd per resource type, then fans out to many clients (kubelets, controllers). This prevents hundreds of watchers from overwhelming etcd.
4. **Schema evolution** — the API server handles version conversion. etcd only stores one version.

### Why etcd Size Matters

etcd has a default storage limit of **2 GB** (configurable up to 8 GB). This sounds small, but remember: etcd only stores metadata, not application data. A cluster with 10,000 pods, 5,000 services, and 20,000 configmaps typically uses 200-500 MB.

When etcd approaches its size limit, Kubernetes stops being able to create new objects. Common causes of bloat:

- Too many Kubernetes events (etcd stores events as objects)
- Large configmaps or secrets
- Thousands of CRDs (Custom Resource Definitions) with many instances
- Infrequent compaction

Monitoring etcd size is critical for cluster health:

```bash
# check etcd database size
etcdctl endpoint status --write-out=table

# check number of keys
etcdctl get / --prefix --keys-only | wc -l

# trigger compaction and defragmentation
rev=$(etcdctl endpoint status --write-out=json | jq '.[0].Status.header.revision')
etcdctl compaction $rev
etcdctl defrag
```

### etcd Performance Requirements for Kubernetes

The Kubernetes documentation recommends:

- **Disk latency**: < 10ms for WAL fsync (99th percentile). Use SSDs.
- **Network latency**: < 10ms RTT between etcd peers (same region/AZ).
- **Cluster size**: 3 nodes for most clusters; 5 nodes for very large clusters (>3000 nodes).
- **CPU/Memory**: 2-4 cores, 8 GB RAM for clusters up to 1000 nodes.

A slow etcd directly impacts Kubernetes responsiveness. If etcd WAL fsync takes 50ms instead of 5ms, every pod creation and scheduling decision is delayed.

## References

1. etcd official documentation [doc](https://etcd.io/docs/)
2. Ongaro, D. and Ousterhout, J. "In Search of an Understandable Consensus Algorithm" (Raft paper, 2014) [paper](https://raft.github.io/raft.pdf)
3. etcd-io/etcd main repository [source](https://github.com/etcd-io/etcd)
4. etcd-io/raft — standalone Raft library [source](https://github.com/etcd-io/raft)
5. etcd-io/bbolt — B+tree storage engine [source](https://github.com/etcd-io/bbolt)
6. etcd MVCC store implementation [`server/storage/mvcc/kvstore_txn.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/mvcc/kvstore_txn.go)
7. etcd watchable store [`server/storage/mvcc/watchable_store.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/mvcc/watchable_store.go)
8. etcd lease subsystem [`server/lease/lessor.go`](https://github.com/etcd-io/etcd/blob/main/server/lease/lessor.go)
9. etcd WAL implementation [`server/storage/wal/wal.go`](https://github.com/etcd-io/etcd/blob/main/server/storage/wal/wal.go)
10. Kubernetes etcd documentation [doc](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)
11. etcd learner design (joint consensus) [doc](https://etcd.io/docs/v3.5/learning/design-learner/)
12. etcd API reference (gRPC) [doc](https://etcd.io/docs/v3.5/learning/api/)
