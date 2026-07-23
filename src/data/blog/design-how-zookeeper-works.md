---
author: JZ
pubDatetime: 2026-07-23T06:23:00Z
modDatetime: 2026-07-23T06:23:00Z
title: System Design - How Apache ZooKeeper Works
tags:
  - design-system
  - design-distributed
description:
  "How Apache ZooKeeper works: the coordination service behind Kafka, Hadoop, and HBase. Covers ZAB consensus protocol, znodes, watches, ephemeral nodes, leader election, sessions, and a source code walkthrough from the apache/zookeeper repository."
---

## Table of contents

## Context

Distributed systems are collections of machines that must cooperate to accomplish a task. The hard part is not the computation — it is the **coordination**: who is the leader? what is the current configuration? is that server still alive?

These questions seem trivial when you have one machine. But with dozens or hundreds of machines that can crash, restart, or become partitioned from the network at any moment, coordination becomes the single hardest problem in distributed computing.

Before ZooKeeper, every distributed system reinvented coordination from scratch. Hadoop had its own leader election. HBase had its own configuration management. Each implementation was ad-hoc, buggy, and hard to get right. Google's Chubby paper (2006) proposed a dedicated coordination service, and Apache ZooKeeper became the open-source realization of that idea.

ZooKeeper provides a small set of primitives from which you can build:

- **Leader election** — exactly one process becomes the leader at a time
- **Configuration management** — a single source of truth for cluster config
- **Service discovery** — services register themselves; clients find them
- **Distributed locks** — mutual exclusion across machines
- **Group membership** — track which nodes are alive

The core insight: rather than building a general-purpose distributed database, ZooKeeper provides a **tiny, highly-reliable, ordered data store** with a filesystem-like API and push notifications (watches). From these building blocks, you compose higher-level coordination patterns.

```
+-------------------+     +-------------------+     +-------------------+
|   Application 1   |     |   Application 2   |     |   Application 3   |
| (Kafka Broker)    |     | (HBase RegionSrv) |     | (Hadoop NameNode) |
+--------+----------+     +--------+----------+     +--------+----------+
         |                          |                          |
         v                          v                          v
+----------------------------------------------------------------------+
|                        ZooKeeper Ensemble                             |
|   +----------+      +----------+      +----------+                   |
|   | Server 1 |<---->| Server 2 |<---->| Server 3 |    (3 or 5 nodes) |
|   | (Leader) |      | (Follower)|     | (Follower)|                  |
|   +----------+      +----------+      +----------+                   |
+----------------------------------------------------------------------+
```

## Data Model: Znodes and the Hierarchical Namespace

ZooKeeper organizes data in a tree structure that looks like a filesystem. Each node in the tree is called a **znode**. Unlike a filesystem, every znode can hold both data (up to 1 MB) and children.

```
                           /
                          / \
                         /   \
                   /app1      /app2
                   /    \         \
            /leader  /config    /members
                                 /   \
                          /member1  /member2
```

Each znode has:

- **Data** — a byte array (configuration values, lock tokens, etc.)
- **Version number** — incremented on every update (enables optimistic locking)
- **ACL** — access control list
- **Timestamps** — creation time and last modification time
- **Children** — ordered list of child znodes

### Types of Znodes

| Type | Lifetime | Use Case |
|------|----------|----------|
| **Persistent** | Exists until explicitly deleted | Configuration, metadata |
| **Ephemeral** | Deleted when the creating session ends | Service discovery, leader election |
| **Sequential** | Name gets a monotonic counter suffix | Distributed locks, ordering |
| **Ephemeral + Sequential** | Both behaviors combined | Leader election with fairness |

Ephemeral nodes are the key primitive for liveness detection. When a client's session expires (because the client crashed or lost connectivity), all its ephemeral nodes vanish. Other clients watching those nodes get notified immediately.

The znode data structure is defined in [`zookeeper-server/src/main/java/org/apache/zookeeper/server/DataNode.java`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/DataNode.java):

```java
public class DataNode implements Record {
    private volatile byte[] data;
    private volatile Long acl;
    private volatile StatPersisted stat;
    private volatile Set<String> children = null;
}
```

The entire tree is held in memory by [`DataTree`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java), which is essentially a `ConcurrentHashMap<String, DataNode>` mapping paths to nodes:

```java
public class DataTree {
    private final NodeHashMap nodes;
    private final WatchManager dataWatches;
    private final WatchManager childWatches;
    // ...
}
```

## ZAB: ZooKeeper Atomic Broadcast

ZooKeeper uses its own consensus protocol called **ZAB (ZooKeeper Atomic Broadcast)** to replicate state across the ensemble. ZAB is not Paxos and not Raft, though it shares ideas with both. The key differences:

| | Paxos | Raft | ZAB |
|---|---|---|---|
| Primary goal | Consensus on single value | Replicated log | Ordered broadcast with recovery |
| Leader election | Separate mechanism | Integrated | Integrated (FastLeaderElection) |
| Ordering | Per-instance | Log-order | Total order via ZXID |
| Recovery | Complex | Log matching | Transaction replay from leader |

ZAB guarantees:

1. **Reliability** — if a message is delivered to one server, it is eventually delivered to all servers
2. **Total order** — all servers deliver messages in the same order
3. **Causal order** — if message $a$ causally precedes message $b$, then $a$ is delivered before $b$

### The Two Phases of ZAB

ZAB operates in two phases, each with a distinct purpose:

**Phase 1: Discovery and Synchronization (Recovery Mode)**

When a new leader is elected (or the system starts up), it must first synchronize its state with a quorum of followers before processing new requests.

```
  Leader                    Follower 1              Follower 2
    |                           |                       |
    |---NEWLEADER(epoch e)----->|                       |
    |---NEWLEADER(epoch e)----------------------------->|
    |                           |                       |
    |<--ACK-NEWLEADER-----------|                       |
    |<--ACK-NEWLEADER-----------------------------------|
    |                           |                       |
    | (has quorum of ACKs)      |                       |
    |                           |                       |
    |---COMMIT-NEWLEADER------->|                       |
    |---COMMIT-NEWLEADER------------------------------->|
    |                           |                       |
    | === Now in Broadcast Mode ===                     |
```

During discovery, the leader:
1. Establishes a new **epoch** (preventing stale leaders from issuing writes)
2. Collects the transaction histories from followers
3. Determines which transactions are committed and which must be rolled back
4. Synchronizes all followers to the same state

**Phase 2: Broadcast (Normal Operation)**

Once the leader is synchronized with a quorum, it can process client write requests using a protocol similar to two-phase commit:

```
  Client        Leader              Follower 1          Follower 2
    |               |                    |                   |
    |--write(x=5)-->|                    |                   |
    |               |                    |                   |
    |               |---PROPOSAL(zxid)-->|                   |
    |               |---PROPOSAL(zxid)---------------------->|
    |               |                    |                   |
    |               |<--ACK(zxid)--------|                   |
    |               |<--ACK(zxid)----------------------------|
    |               |                    |                   |
    |               | (has quorum ACKs)  |                   |
    |               |                    |                   |
    |               |---COMMIT(zxid)---->|                   |
    |               |---COMMIT(zxid)------------------------>|
    |               |                    |                   |
    |<---OK---------|                    |                   |
```

A quorum is a majority: for 5 servers, any 3 form a quorum. This means ZooKeeper can tolerate $\lfloor (n-1)/2 \rfloor$ failures. A 5-node ensemble tolerates 2 failures; a 3-node ensemble tolerates 1.

## Leader Election: FastLeaderElection

Before ZAB can operate, the ensemble must elect a leader. ZooKeeper uses the **FastLeaderElection** algorithm, implemented in [`zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/FastLeaderElection.java`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/FastLeaderElection.java).

### ZXID: The Transaction Identifier

Every transaction in ZooKeeper is identified by a 64-bit **ZXID** (ZooKeeper Transaction ID). The ZXID is split into two 32-bit parts:

```
         ZXID (64 bits)
+----------------+----------------+
|   epoch (32)   |  counter (32)  |
+----------------+----------------+
     high bits        low bits
```

- **Epoch** — incremented every time a new leader is elected. This ensures a new leader's transactions are always ordered after the previous leader's.
- **Counter** — incremented for each transaction within an epoch. Resets to 0 when the epoch changes.

This means ZXIDs are globally ordered: a higher epoch always wins, and within the same epoch, a higher counter wins.

### The Election Algorithm

Each server starts in the LOOKING state and proposes itself as leader. Servers exchange votes, and each server updates its vote if it discovers a better candidate. A candidate is "better" if it has:

1. A higher epoch (more recent leader term)
2. If epochs are equal, a higher ZXID (more up-to-date transaction log)
3. If ZXIDs are equal, a higher server ID (tiebreaker)

```
  Server 1 (sid=1)         Server 2 (sid=2)         Server 3 (sid=3)
  zxid=0x300000005         zxid=0x300000007         zxid=0x300000007
       |                        |                        |
       | vote(1, 0x300000005)   |                        |
       |----------------------->|                        |
       |----------------------------------------------->|
       |                        |                        |
       | vote(2, 0x300000007)   |                        |
       |<-----------------------|                        |
       |                        |----------------------->|
       |                        |                        |
       | vote(3, 0x300000007)   |                        |
       |<-----------------------------------------------|
       |                        |<-----------------------|
       |                        |                        |
  Server 1 sees (2, 0x300000007) > (1, 0x300000005)
  Server 1 updates vote to Server 3 (higher sid, same zxid)
       |                        |                        |
       | vote(3, 0x300000007)   |                        |
       |----------------------->|                        |
       |----------------------------------------------->|
       |                        |                        |
  All three now vote for Server 3 --> Server 3 is LEADER
  Server 1, Server 2 --> FOLLOWING state
```

The election completes when a server has received votes for the same candidate from a quorum. The core voting logic:

```java
// From FastLeaderElection.java
protected boolean totalOrderPredicate(long newId, long newZxid, long newEpoch,
                                       long curId, long curZxid, long curEpoch) {
    if (self.getQuorumVerifier().getWeight(newId) == 0) {
        return false;
    }
    return ((newEpoch > curEpoch)
            || ((newEpoch == curEpoch)
                && ((newZxid > curZxid)
                    || ((newZxid == curZxid)
                        && (newId > curId)))));
}
```

## Sessions and Watches

### Client Sessions

A ZooKeeper client establishes a **session** with exactly one server in the ensemble. The session has:

- A unique 64-bit **session ID**
- A negotiated **timeout** (typically 2-20 seconds)
- A monotonically increasing **password** for reconnection

The client maintains the session by sending periodic heartbeats (pings). If the server does not hear from the client within the timeout, the session expires, and all ephemeral nodes created by that client are deleted.

```
  Client                         ZooKeeper Server
    |                                 |
    |--- connect (timeout=10s) ------>|
    |<-- session_id=0x17a3b... -------|
    |                                 |
    |--- ping (heartbeat) ----------->|  (every timeout/3)
    |<-- pong ------------------------|
    |                                 |
    |--- ping ------------------------>|
    |<-- pong -------------------------|
    |                                 |
    |    (client crashes)             |
    |         X                       |
    |                                 | (no ping for 10s)
    |                                 | --> session expired
    |                                 | --> delete all ephemeral nodes
```

Session management is handled by [`SessionTrackerImpl`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/SessionTrackerImpl.java), which groups sessions into expiry buckets for efficient batch expiration.

### Watches: Push Notifications

Watches are ZooKeeper's mechanism for **push-based notification**. Instead of polling for changes, a client registers a watch on a znode and receives a callback when that znode changes.

Key properties of watches:

1. **One-time trigger** — a watch fires exactly once, then is removed. The client must re-register the watch to get further notifications.
2. **Ordered** — watch events are delivered in the same order as the changes that triggered them.
3. **Lightweight** — the watch notification only says "something changed," not what the new value is. The client must re-read the znode to see the new state.

```
  Client A                   ZooKeeper               Client B
    |                            |                       |
    |-- getData(/config, watch) ->|                      |
    |<-- data="v1" --------------|                       |
    |                            |                       |
    |                            |<-- setData(/config, "v2") --|
    |                            |--- OK ------------------->|
    |                            |                       |
    |<-- WatchEvent(DATA_CHANGED)|                       |
    |                            |                       |
    |-- getData(/config, watch) ->|  (re-register watch) |
    |<-- data="v2" --------------|                       |
```

Watch registration and triggering is managed by [`WatchManager`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/watch/WatchManager.java):

```java
public class WatchManager implements IWatchManager {
    private final Map<String, Set<Watcher>> watchTable = new HashMap<>();
    private final Map<Watcher, Set<String>> watch2Paths = new HashMap<>();

    public WatcherOrBitSet triggerWatch(String path, EventType type) {
        Set<Watcher> watchers = watchTable.remove(path); // one-time!
        for (Watcher w : watchers) {
            w.process(new WatchedEvent(type, KeeperState.SyncConnected, path));
        }
        return watchers;
    }
}
```

## Write Path: From Client Request to Committed Transaction

When a client sends a write request (create, setData, delete), it follows a specific path through the ZooKeeper server code. The server processes requests through a chain of **RequestProcessors**, each performing a specific function.

```
                        ZooKeeper Leader Server
+-----------------------------------------------------------------------+
|                                                                       |
|  Client Request                                                       |
|       |                                                               |
|       v                                                               |
|  +---------------------+                                              |
|  | PrepRequestProcessor|  Validate, create transaction record         |
|  +----------+----------+                                              |
|             |                                                         |
|             v                                                         |
|  +----------------------+                                             |
|  |ProposalRequestProc.  |  Send PROPOSAL to all followers             |
|  +----------+-----------+                                             |
|             |                                                         |
|             v                                                         |
|  +---------------------+                                              |
|  | CommitProcessor     |  Wait for quorum ACK, then commit            |
|  +----------+----------+                                              |
|             |                                                         |
|             v                                                         |
|  +---------------------+                                              |
|  |FinalRequestProcessor|  Apply to DataTree, trigger watches, respond |
|  +----------+----------+                                              |
|             |                                                         |
|             v                                                         |
|       Client Response                                                 |
+-----------------------------------------------------------------------+
```

### Step 1: PrepRequestProcessor

[`PrepRequestProcessor`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/PrepRequestProcessor.java) validates the request and creates a transaction record:

```java
public class PrepRequestProcessor extends ZooKeeperCriticalThread
        implements RequestProcessor {

    protected void pRequest(Request request) throws RequestProcessorException {
        switch (request.type) {
            case OpCode.create:
                CreateRequest create2Request = new CreateRequest();
                // Deserialize, validate ACLs, check parent exists,
                // assign next ZXID, create CreateTxn record
                pRequest2Txn(request.type, zks.getNextZxid(), request, create2Request);
                break;
            case OpCode.setData:
                // Validate version (optimistic concurrency), create SetDataTxn
                break;
            case OpCode.delete:
                // Check no children, create DeleteTxn
                break;
        }
    }
}
```

### Step 2: ProposalRequestProcessor

[`ProposalRequestProcessor`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/ProposalRequestProcessor.java) broadcasts the proposal to all followers and writes it to the leader's own transaction log:

```java
public class ProposalRequestProcessor implements RequestProcessor {

    public void processRequest(Request request) throws RequestProcessorException {
        if (request instanceof LearnerSyncRequest) {
            zks.getLeader().processSync((LearnerSyncRequest) request);
        } else {
            nextProcessor.processRequest(request);
            if (request.getHdr() != null) {
                // This is a write — propose it to followers
                zks.getLeader().propose(request);
            }
        }
    }
}
```

The `propose()` method in [`Leader`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java) serializes the transaction and sends it to all followers via TCP:

```java
public Proposal propose(Request request) {
    byte[] data = SerializeUtils.serializeRequest(request);
    QuorumPacket pp = new QuorumPacket(Leader.PROPOSAL, request.zxid, data, null);
    Proposal p = new Proposal();
    p.packet = pp;
    p.request = request;
    lastProposed = p.packet.getZxid();
    outstandingProposals.put(lastProposed, p);
    sendPacket(pp);  // broadcast to all followers
    return p;
}
```

### Step 3: CommitProcessor

[`CommitProcessor`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/CommitProcessor.java) is where the leader waits for a quorum of ACKs. When enough followers acknowledge the proposal, the transaction is committed:

```java
public class CommitProcessor extends ZooKeeperCriticalThread
        implements RequestProcessor {

    // Write requests wait here until committed
    protected final LinkedBlockingQueue<Request> committedRequests =
        new LinkedBlockingQueue<>();

    // Called when quorum ACK received
    public void commit(Request request) {
        committedRequests.add(request);
        wakeup();
    }
}
```

### Step 4: FinalRequestProcessor

[`FinalRequestProcessor`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/FinalRequestProcessor.java) applies the transaction to the in-memory `DataTree`, triggers watches, and sends the response back to the client:

```java
public class FinalRequestProcessor implements RequestProcessor {

    public void processRequest(Request request) {
        // Apply transaction to in-memory data tree
        ProcessTxnResult rc = zks.processTxn(request);

        // Trigger watches
        // (done inside DataTree.processTxn)

        // Send response to client
        cnxn.sendResponse(hdr, rsp, "response");
    }
}
```

On follower servers, the request processor chain is different: they receive proposals from the leader, write them to their local transaction log, send ACKs, and then apply committed transactions to their own `DataTree`.

## Read Path: Sequential Consistency

ZooKeeper provides **sequential consistency** for reads by default — a client's reads always reflect its own writes and all writes that were committed before the client's last observed ZXID. However, a read might return stale data if another client just performed a write that has not yet propagated to the follower being read from.

```
  Client                   Follower                  Leader
    |                          |                        |
    |--- getData(/x) -------->|                        |
    |                          |  (serve from local    |
    |                          |   DataTree — no       |
    |                          |   communication       |
    |<-- data="v3" -----------|   with leader!)        |
```

This is why reads are fast and scale linearly with the number of servers in the ensemble — each server handles reads independently from its local memory.

### Linearizable Reads with sync()

If a client needs a **linearizable read** (guaranteed to see the latest committed write from any client), it must issue a `sync()` call before the read:

```
  Client                   Follower                  Leader
    |                          |                        |
    |--- sync() ------------->|                        |
    |                          |--- sync request ------>|
    |                          |<-- sync response ------|
    |<-- sync complete --------|                        |
    |                          |                        |
    |--- getData(/x) -------->|                        |
    |<-- data="v4" -----------|  (now guaranteed fresh) |
```

The `sync()` forces the follower to catch up with the leader's latest committed state before serving the subsequent read.

## Recipes: Building Higher-Level Primitives

ZooKeeper does not provide distributed locks or leader election directly. Instead, it provides the building blocks to implement them correctly. Here are two classic recipes.

### Recipe 1: Distributed Lock

To acquire a lock on resource `/locks/my-resource`:

1. Create an **ephemeral sequential** node: `/locks/my-resource/lock-` (gets assigned `/locks/my-resource/lock-0000000001`)
2. Get all children of `/locks/my-resource`
3. If your node has the **lowest sequence number**, you hold the lock
4. Otherwise, set a watch on the node with the next-lower sequence number and wait

```
  /locks/my-resource/
    |
    +-- lock-0000000001  (Client A - holds the lock)
    +-- lock-0000000002  (Client B - watches lock-0000000001)
    +-- lock-0000000003  (Client C - watches lock-0000000002)
```

Why watch only the next-lower node? This avoids the **herd effect** — if all waiters watched the lock holder, they would all wake up simultaneously when the lock is released, but only one would succeed.

If the lock holder crashes, its ephemeral node disappears, and the next client in line receives a watch notification and acquires the lock.

```
  Client A (holds lock)          ZooKeeper             Client B (waiting)
       |                             |                       |
       | (crashes)                   |                       |
       X                             |                       |
                                     |                       |
       session expires               |                       |
       delete lock-0000000001        |                       |
                                     |                       |
                                     |-- WatchEvent -------->|
                                     |                       |
                                     |<- getChildren --------|
                                     |-- [lock-0000000002] ->|
                                     |                       |
                               Client B now holds the lock!  |
```

### Recipe 2: Leader Election

Leader election is similar to the distributed lock, but with a twist: the goal is not mutual exclusion on a resource, but to elect one process as the leader that all others can discover.

1. Each candidate creates an ephemeral sequential node: `/election/candidate-`
2. The node with the **lowest sequence number** is the leader
3. All other candidates watch the leader node (or the next-lower node for scalability)
4. If the leader crashes, its ephemeral node disappears, and the next candidate becomes leader

```java
// Pseudo-code for leader election
public class LeaderElection {
    String myNode = zk.create("/election/candidate-",
                              myData,
                              OPEN_ACL_UNSAFE,
                              CreateMode.EPHEMERAL_SEQUENTIAL);

    public boolean amILeader() {
        List<String> children = zk.getChildren("/election", false);
        Collections.sort(children);
        return myNode.endsWith(children.get(0));
    }

    public void watchLeader() {
        List<String> children = zk.getChildren("/election", false);
        Collections.sort(children);
        String leader = children.get(0);
        zk.exists("/election/" + leader, event -> {
            // Leader died, check if I'm the new leader
            if (amILeader()) {
                becomeLeader();
            } else {
                watchLeader();  // watch new leader
            }
        });
    }
}
```

## Performance Characteristics

ZooKeeper's architecture produces distinctive performance characteristics:

### Read vs. Write Throughput

Reads are served from any server's local memory without contacting the leader. Writes must go through the leader and receive quorum acknowledgment. This means:

- **Reads scale linearly** with the number of servers (more servers = more read capacity)
- **Writes do not scale** — in fact, more servers means more ACKs needed, slightly reducing write throughput

```
  Throughput (ops/sec)
       ^
  100k |           reads (3 servers)
       |         ...................
   80k |       .
       |     .       reads (5 servers)
   60k |   .      ...................
       |  .     .
   40k | .    .
       |.   .
   20k |--+------------ writes (3 servers)
       |  |  +--------- writes (5 servers)
       +--|--|----------------------------------------->
          0  20  40  60  80  100
                      % reads in workload
```

### Typical Latencies

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Read | < 1 ms | Served from local memory |
| Write | 2-10 ms | Requires quorum ACK over network |
| Session creation | 5-20 ms | Includes leader notification |
| Watch notification | < 1 ms (after event) | Pushed asynchronously |

### Why 3 or 5 Servers?

The number of servers $n$ determines:

- **Fault tolerance**: tolerates $\lfloor (n-1)/2 \rfloor$ failures
- **Write latency**: more servers = higher quorum latency
- **Read throughput**: more servers = more read capacity

$$\text{quorum size} = \lfloor n/2 \rfloor + 1$$

| Ensemble Size | Quorum | Failures Tolerated |
|---------------|--------|-------------------|
| 3 | 2 | 1 |
| 5 | 3 | 2 |
| 7 | 4 | 3 |

In practice, 3 servers is the minimum for production (tolerates 1 failure), and 5 servers is common for higher availability (tolerates 2 failures). Beyond 5, the write latency increase rarely justifies the marginal availability gain.

## The Transaction Log and Snapshots

ZooKeeper persists its state through two mechanisms:

1. **Transaction log** — an append-only file of all committed transactions (for durability)
2. **Periodic snapshots** — a serialization of the complete `DataTree` at a point in time (for faster recovery)

On startup, ZooKeeper loads the latest snapshot and replays all subsequent transactions from the log to reconstruct the current state. This is handled by [`FileTxnSnapLog`](https://github.com/apache/zookeeper/blob/master/zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnSnapLog.java):

```java
public class FileTxnSnapLog {
    private final File dataDir;    // transaction logs
    private final File snapDir;    // snapshots

    public long restore(DataTree dt, Map<Long, Integer> sessions,
                        PlayBackListener listener) {
        // 1. Load latest snapshot into dt
        long deserializeResult = snapLog.deserialize(dt, sessions);
        // 2. Replay transactions after snapshot
        FileTxnLog txnLog = new FileTxnLog(dataDir);
        TxnIterator itr = txnLog.read(dt.lastProcessedZxid + 1);
        while (itr.next()) {
            processTransaction(itr.getHeader(), dt, sessions, itr.getTxn());
        }
        return dt.lastProcessedZxid;
    }
}
```

The transaction log uses **group commits** and **pre-allocated files** to minimize disk I/O latency — critical since every write must be persisted to the log before the ACK is sent.

## Putting It All Together

Let's trace a complete write from a client connected to a follower:

```
  Client          Follower 2           Leader            Follower 3
    |                  |                  |                   |
    | 1. create(/x)   |                  |                   |
    |----------------->|                  |                   |
    |                  |                  |                   |
    |                  | 2. forward       |                   |
    |                  |----------------->|                   |
    |                  |                  |                   |
    |                  |                  | 3. PrepRequestProcessor
    |                  |                  |    (validate, assign zxid)
    |                  |                  |                   |
    |                  |                  | 4. ProposalRequestProcessor
    |                  | 5. PROPOSAL      |    (broadcast)    |
    |                  |<-----------------|------------------>|
    |                  |                  |                   |
    |                  | 6. write txn log |   6. write txn log
    |                  |                  |                   |
    |                  | 7. ACK           |          7. ACK   |
    |                  |----------------->|<------------------|
    |                  |                  |                   |
    |                  |                  | 8. CommitProcessor
    |                  |                  |    (quorum reached)
    |                  |                  |                   |
    |                  | 9. COMMIT        |      9. COMMIT    |
    |                  |<-----------------|------------------>|
    |                  |                  |                   |
    |                  |                  | 10. FinalRequestProcessor
    |                  |                  |     (apply to DataTree)
    |                  |                  |                   |
    |                  | 10. apply to     |                   |
    |                  |     DataTree     |   10. apply to    |
    |                  |                  |       DataTree    |
    |                  |                  |                   |
    | 11. OK (created) |                  |                   |
    |<-----------------|                  |                   |
```

Notice that the client connected to Follower 2, which forwarded the write to the leader. The response comes back through the original follower — the client does not need to know who the leader is.

## References

1. [ZooKeeper: Wait-free coordination for Internet-scale systems](https://www.usenix.org/conference/usenix-atc-10/zookeeper-wait-free-coordination-internet-scale-systems) — Hunt et al., USENIX ATC 2010
2. [Zab: High-performance broadcast for primary-backup systems](https://ieeexplore.ieee.org/document/5958223) — Junqueira, Reed, Serafini, IEEE DSN 2011
3. [Apache ZooKeeper Source Code](https://github.com/apache/zookeeper) — GitHub repository
4. [ZooKeeper Programmer's Guide](https://zookeeper.apache.org/doc/current/zookeeperProgrammersGuide.html) — Official documentation
5. [ZooKeeper Recipes and Solutions](https://zookeeper.apache.org/doc/current/recipes.html) — Lock, leader election, and barrier recipes
6. [The Chubby Lock Service for Loosely-Coupled Distributed Systems](https://research.google/pubs/pub27897/) — Burrows, OSDI 2006 (Google's inspiration for ZooKeeper)
7. [ZooKeeper Internals](https://zookeeper.apache.org/doc/current/zookeeperInternals.html) — Official documentation on atomic broadcast and logging
