---
author: JZ
pubDatetime: 2026-08-16T06:00:00Z
modDatetime: 2026-08-16T06:00:00Z
title: System Design - How Distributed File Systems Work (GFS/HDFS)
tags:
  - design-system
  - design-distributed
description:
  "How distributed file systems work: the architecture of Google File System and Hadoop HDFS, chunk-based storage, metadata management, replication, read/write flows, and fault tolerance — with source code references."
---

## Table of contents

## Context

Imagine you work at a company that processes petabytes of web crawl data every day. You cannot store this on a single machine — no hard drive is that big, no single disk is that fast, and one machine failing means all your data is gone. You need a file system that spans thousands of machines.

In 2003, Google published the **Google File System (GFS)** paper, describing how they solved exactly this problem. In 2006, the open-source community built **Hadoop Distributed File System (HDFS)** as a faithful reimplementation. Both follow the same fundamental architecture: one master that tracks metadata, and many workers (called **chunk servers** or **DataNodes**) that store actual data.

This article walks through how these systems work, from the 10,000-foot architecture down to the code that handles a single write.

```
                    Distributed File System Architecture

  +--------+   +--------+   +--------+
  | Client |   | Client |   | Client |     applications
  +---+----+   +---+----+   +---+----+
      |            |            |
      |  metadata  |            |  metadata queries
      +-----+------+------------+
            |
            v
     +-------------+
     |   Master    |    (GFS Master / HDFS NameNode)
     | +---------+ |
     | |Namespace| |    file -> chunk mapping
     | |  tree   | |    chunk -> location mapping
     | +---------+ |
     +------+------+
            |
            |  heartbeats / chunk reports
            |
   +--------+--------+---------+
   |        |        |         |
   v        v        v         v
+------+ +------+ +------+ +------+
|Chunk | |Chunk | |Chunk | |Chunk |   (GFS ChunkServer / HDFS DataNode)
|Srv 1 | |Srv 2 | |Srv 3 | |Srv 4 |
+------+ +------+ +------+ +------+
  |disk|   |disk|   |disk|   |disk|
  +----+   +----+   +----+   +----+
```

The key insight: **separate metadata from data**. The master never touches file contents — it only knows which chunks exist and where they live. Clients read and write data directly to chunk servers, keeping the master lightweight.

## Chunks: The Unit of Storage

Both GFS and HDFS break files into fixed-size chunks (GFS calls them "chunks", HDFS calls them "blocks"):

| Property | GFS | HDFS |
|----------|-----|------|
| Chunk/Block size | 64 MB | 128 MB (default) |
| Replication factor | 3 | 3 |
| Identifier | 64-bit chunk handle | 64-bit block ID |

Why so large? Because the workloads are sequential reads and writes of enormous files. A large chunk size means:

1. **Fewer metadata entries** — The master stores one record per chunk. A 1 TB file at 128 MB chunks = ~8,000 records. At 4 KB blocks (like a local filesystem), that would be ~268 million records.
2. **Fewer client-master interactions** — A client reading a large file asks the master once per chunk, not once per kilobyte.
3. **Network efficiency** — A single TCP connection can stream 128 MB before needing to look up the next chunk.

The trade-off: small files waste space (a 1 KB file still consumes one chunk's worth of metadata), and all reads/writes to a small file hit the same set of chunk servers — creating a **hot spot**.

```
  A file stored as chunks:

  /data/crawl-2026-08-15.warc  (384 MB)
  ================================

  +------------------+------------------+------------------+
  |    Chunk A       |    Chunk B       |    Chunk C       |
  |   (128 MB)       |   (128 MB)       |   (128 MB)       |
  | handle: 0x4A01   | handle: 0x4A02   | handle: 0x4A03   |
  +------------------+------------------+------------------+
       |                   |                   |
       |                   |                   |
       v                   v                   v
  Replicated to 3      Replicated to 3     Replicated to 3
  chunk servers        chunk servers       chunk servers
```

In HDFS, the block size is configured in `hdfs-site.xml`:

```xml
<property>
  <name>dfs.blocksize</name>
  <value>134217728</value>  <!-- 128 MB in bytes -->
</property>
```

## The Master: Namespace and Chunk Mapping

The master (NameNode in HDFS) maintains two critical data structures:

### 1. The Namespace Tree

A hierarchical mapping of file paths to metadata, similar to a traditional filesystem's inode table:

```
/
├── data/
│   ├── crawl-2026-08-15.warc  →  [chunk_A, chunk_B, chunk_C]
│   └── crawl-2026-08-14.warc  →  [chunk_D, chunk_E]
└── config/
    └── settings.json          →  [chunk_F]
```

Each file entry stores: file name, permissions, replication factor, and an ordered list of chunk handles.

### 2. The Chunk-to-Location Mapping

For each chunk handle, the master knows which chunk servers currently hold replicas:

```
chunk_A (0x4A01) → [ChunkSrv_1, ChunkSrv_3, ChunkSrv_7]
chunk_B (0x4A02) → [ChunkSrv_2, ChunkSrv_5, ChunkSrv_9]
chunk_C (0x4A03) → [ChunkSrv_1, ChunkSrv_4, ChunkSrv_8]
```

**Important design choice:** the master does NOT persistently store chunk locations. Instead, it reconstructs this mapping at startup by asking every chunk server "what chunks do you have?" This is called a **block report** (HDFS) or chunk report (GFS). Why? Because chunk servers are the ground truth — disks fail, machines get replaced, and the master would need to track every hardware change if it persisted locations.

In HDFS source code ([`BlockManager.java`](https://github.com/apache/hadoop/blob/trunk/hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/blockmanagement/BlockManager.java)), the block-to-location mapping lives in a `BlocksMap`:

```java
public class BlockManager {
    private final BlocksMap blocksMap;

    // Called when a DataNode sends its block report
    public void processReport(DatanodeDescriptor node,
                              BlockReport report) {
        for (BlockInfo block : report.getBlocks()) {
            // Add this node as a location for the block
            blocksMap.addNode(block, node);
        }
    }
}
```

### Persistence: The Edit Log and Checkpoints

The namespace tree IS persisted — losing it means losing the entire filesystem. HDFS uses a write-ahead log approach:

```
  NameNode Persistence

  +------------------+     +------------------+
  |   fsimage        |     |   edit log       |
  | (checkpoint of   |     | (journal of all  |
  |  full namespace  |     |  changes since   |
  |  at time T)      |     |  last checkpoint)|
  +------------------+     +------------------+
           \                      /
            \                    /
             v                  v
        On restart: load fsimage, replay edit log
        = current namespace state
```

Every mutation (create file, delete file, rename) is first written to the edit log (a sequential append — fast on disk). Periodically, the namespace is checkpointed to a new `fsimage`, and the edit log is truncated. In HDFS, a separate process called the **Secondary NameNode** (or **Standby NameNode** in HA mode) handles checkpointing to avoid pausing the active NameNode.

## Reading a File

Here is the step-by-step flow when a client reads a file:

```
  Client                     NameNode                   DataNodes
    |                           |                          |
    |  1. open("/data/file")    |                          |
    |-------------------------->|                          |
    |                           |                          |
    |  2. returns: chunk list   |                          |
    |     + locations           |                          |
    |<--------------------------|                          |
    |                           |                          |
    |  3. read chunk_A from nearest DataNode               |
    |-------------------------------------------------->   |
    |                           |                     DN_3 |
    |  4. data bytes                                       |
    |<--------------------------------------------------   |
    |                           |                          |
    |  5. read chunk_B from nearest DataNode               |
    |--------------------------------------------->        |
    |                           |                DN_5      |
    |  6. data bytes                                       |
    |<---------------------------------------------        |
    |                           |                          |
```

Key details:

1. The client asks the NameNode for the file's chunk list and their locations.
2. The NameNode returns chunks sorted by offset, with each chunk's replica locations **sorted by network distance** from the client (same rack first, then same data center, then remote).
3. The client reads directly from the closest DataNode — the NameNode is never on the data path.
4. If a DataNode is unavailable, the client transparently retries with the next replica.

In HDFS, the client-side read logic lives in [`DFSInputStream.java`](https://github.com/apache/hadoop/blob/trunk/hadoop-hdfs-project/hadoop-hdfs-client/src/main/java/org/apache/hadoop/hdfs/DFSInputStream.java):

```java
private synchronized DatanodeInfo blockSeekTo(long target) {
    // Find which block contains offset 'target'
    LocatedBlock targetBlock = getBlockAt(target);

    // Get DataNode list sorted by distance
    DatanodeInfo[] nodes = targetBlock.getLocations();

    // Try each node until one succeeds
    for (DatanodeInfo node : nodes) {
        try {
            reader = new BlockReader(node, targetBlock);
            return node;
        } catch (IOException e) {
            // This node failed, try the next one
        }
    }
    throw new IOException("Could not read block from any node");
}
```

## Writing a File

Writes are more complex because data must land on multiple replicas atomically. GFS introduced a **pipeline replication** design that HDFS also uses:

```
  Client            DN_1 (primary)      DN_2             DN_3
    |                    |                |                |
    | 1. write request   |                |                |
    |------------------->|                |                |
    |                    |                |                |
    | 2. stream data via pipeline                          |
    |------------------->|--------------->|--------------->|
    |                    |  (each node    |  (each node    |
    |                    |   stores and   |   stores and   |
    |                    |   forwards)    |   forwards)    |
    |                    |                |                |
    | 3. ack from DN_3   |                |     ack        |
    |                    |                |<---------------|
    |                    |     ack        |                |
    |                    |<---------------|                |
    |  4. ack to client  |                |                |
    |<-------------------|                |                |
```

The pipeline works like this:

1. **Client contacts NameNode** to allocate a new block. NameNode picks 3 DataNodes (using rack-awareness: 2 on one rack, 1 on another).
2. **Client builds a pipeline:** DN_1 → DN_2 → DN_3. It sends data packets (default 64 KB each) to DN_1.
3. **DN_1 stores the packet and forwards it to DN_2.** DN_2 stores and forwards to DN_3. Each node starts forwarding immediately after receiving a packet — it does not wait for the full block.
4. **Acknowledgments flow backward** through the pipeline. Only when the client receives ack from all nodes is the write considered successful.

Why a pipeline instead of the client writing to all 3 nodes in parallel?

- **Network efficiency:** The client's upload bandwidth is used once (to DN_1), not three times. The inter-DataNode links handle replication.
- **Pipelining:** Packet N can be in transit to DN_3 while packet N+1 is being written to DN_1. The total write time is approximately: `data_size / client_bandwidth + data_size / inter_node_bandwidth` — not three times the single-node write time.

```
  Why pipeline is faster than parallel writes:

  Parallel (client writes to all 3):
  Client ----[====]----> DN_1
  Client ----[====]----> DN_2    (3x client bandwidth used)
  Client ----[====]----> DN_3

  Pipeline (client writes once, data flows):
  Client ----[====]----> DN_1 ---[====]----> DN_2 ---[====]----> DN_3
             ^                   ^                   ^
             starts immediately  starts after 1 packet delay
```

## Replication and Fault Tolerance

The replication factor (default 3) ensures data survives hardware failures. The master continuously monitors chunk server health:

### Heartbeats

Every chunk server sends a periodic heartbeat (default: every 3 seconds in HDFS) to the master. If the master misses heartbeats for 10 minutes, it declares the node dead and initiates **re-replication** of all chunks that were on that node.

```
  Failure detection and re-replication:

  Time 0s:      DN_4 last heartbeat
  Time 3s:      missed heartbeat #1
  Time 6s:      missed heartbeat #2
  ...
  Time 630s:    NameNode marks DN_4 as dead
                Chunks on DN_4 are now under-replicated:
                  chunk_X: was on [DN_1, DN_4, DN_7] → now [DN_1, DN_7]
                  chunk_Y: was on [DN_2, DN_4, DN_5] → now [DN_2, DN_5]

                NameNode schedules re-replication:
                  chunk_X: DN_1 → copy to DN_9
                  chunk_Y: DN_5 → copy to DN_3
```

### Rack-Aware Placement

The master places replicas on different racks to survive rack-level failures (switch failure, power loss):

```
  Rack-aware replica placement (replication factor = 3):

  +-- Rack A --+    +-- Rack B --+    +-- Rack C --+
  | DN_1  DN_2 |    | DN_3  DN_4 |    | DN_5  DN_6 |
  |  [R1] [R2] |    |  [R3]      |    |            |
  +-----+------+    +-----+------+    +------------+
        |                  |
        +------ ToR -------+   (top-of-rack switches)

  Rule: first replica on local node,
        second on a different rack,
        third on same rack as second but different node.
```

This policy means:
- A single node failure: 2 replicas survive.
- An entire rack failure: at least 1 replica on another rack survives.
- Only a 2-rack simultaneous failure (or 3 individual node failures on separate racks) can lose data.

## Consistency: What Happens During Concurrent Writes

GFS has a relaxed consistency model. When multiple clients write to the same chunk concurrently:

- **Record appends** (the common case in GFS): each append is guaranteed to be written atomically *at least once* at some offset. Duplicates are possible, and readers must handle them (typically using checksums or unique record IDs).
- **Random writes**: GFS makes no guarantee about the final state when multiple writers overlap — the region becomes "inconsistent."

HDFS simplifies this: **a file can only have one writer at a time** (single-writer semantics). Files are write-once: once closed, they cannot be modified (only appended in newer versions). This eliminates the consistency complexity at the cost of flexibility.

```
  GFS Consistency Model:

  Concurrent record appends to the same chunk:

  Client A: append("record_1")  ──┐
                                   ├──> Chunk after both appends:
  Client B: append("record_2")  ──┘
                                        +------------------+
                                        | ... existing ... |
                                        | record_1         |  (defined)
                                        | padding          |  (may exist)
                                        | record_2         |  (defined)
                                        +------------------+

  Each record lands atomically, but their order and gaps between
  them are non-deterministic.
```

## Data Integrity: Checksums

Disk corruption is silent — a bit can flip without any hardware error. Both GFS and HDFS protect against this with checksums:

- Each chunk is divided into 64 KB sub-blocks.
- A CRC-32 checksum is computed for each sub-block and stored separately.
- On every read, the DataNode verifies the checksum before sending data to the client.
- If corruption is detected, the DataNode reports the bad chunk to the master, which re-replicates from a healthy copy.

```
  Checksum verification on read:

  Chunk on disk (128 MB):
  +-------+-------+-------+-------+- ... -+-------+
  | 64 KB | 64 KB | 64 KB | 64 KB |       | 64 KB |  data sub-blocks
  +-------+-------+-------+-------+- ... -+-------+
  | crc1  | crc2  | crc3  | crc4  |       | crcN  |  checksum file
  +-------+-------+-------+-------+- ... -+-------+

  Read path:
    1. Read sub-block from disk
    2. Compute CRC-32 of bytes read
    3. Compare with stored checksum
    4. If match → send to client
       If mismatch → report corruption, client retries another replica
```

In HDFS, checksum verification lives in [`BlockSender.java`](https://github.com/apache/hadoop/blob/trunk/hadoop-hdfs-project/hadoop-hdfs/src/main/java/org/apache/hadoop/hdfs/server/datanode/BlockSender.java):

```java
private int sendPacket(ByteBuffer pkt, int dataLen) {
    // Read checksum from meta file
    int checksumLen = readChecksum(checksumBuf);

    // Verify checksum matches data
    checksum.verifyChunkedSums(dataBuf, checksumBuf);

    // Send both data and checksum to client
    // (client can re-verify)
    out.write(pkt);
    return dataLen + checksumLen;
}
```

## High Availability: Eliminating the Single Point of Failure

The original GFS and early HDFS had a single master — if it crashed, the entire filesystem was unavailable. Modern HDFS solves this with **HA (High Availability)** mode:

```
  HDFS High Availability Architecture:

  +------------------+           +------------------+
  |  Active NameNode |           | Standby NameNode |
  |  (serves clients)|           | (hot standby)    |
  +--------+---------+           +--------+---------+
           |                              |
           |   shared edit log            |
           +------------+-----------------+
                        |
                        v
              +-------------------+
              |  JournalNodes     |  (quorum-based shared log)
              | JN_1  JN_2  JN_3 |
              +-------------------+

  - Active writes edits to JournalNodes
  - Standby tails the same edits to stay in sync
  - ZooKeeper ZKFC handles automatic failover
  - On failover: standby applies remaining edits, becomes active
```

The **JournalNode** quorum (typically 3 or 5 nodes) ensures that the edit log is durable even if one journal node dies. The Standby NameNode continuously reads new edits from the journal, keeping its namespace within seconds of the Active. Failover takes ~30 seconds in practice.

## Putting It All Together: A MapReduce Job

To see why this architecture matters, consider a MapReduce job processing a 1 TB input file:

```
  1 TB file = 8,192 blocks (128 MB each), replicated 3x

  MapReduce framework:
    - Launches 8,192 map tasks
    - Each map task reads ONE block
    - Scheduler places map tasks on nodes that HOLD the block
      (data locality — avoids network transfer)

  +-- Node_1 --+    +-- Node_2 --+    +-- Node_3 --+
  | block_001  |    | block_002  |    | block_003  |
  | block_042  |    | block_001  |    | block_099  |
  | ...        |    | ...        |    | ...        |
  |            |    |            |    |            |
  | map(001)   |    | map(002)   |    | map(003)   |  ← tasks run
  | map(042)   |    |            |    | map(099)   |    where data is
  +------------+    +------------+    +------------+

  Result: most map tasks read from local disk, not network.
  This is the payoff of the entire architecture.
```

Data locality is the reason HDFS co-deploys storage and compute on the same machines. The scheduler knows (from the NameNode) which nodes hold each block, and preferentially assigns tasks to those nodes. The combination of large block sizes + rack-aware placement + locality-aware scheduling makes batch processing of petabyte-scale datasets practical on commodity hardware.

## Summary of Design Decisions

| Decision | Rationale |
|----------|-----------|
| Large chunks (64–128 MB) | Reduce metadata, amortize seek overhead |
| Single master for metadata | Simple, consistent namespace management |
| No persistent location tracking | Chunk servers are ground truth; avoids stale state |
| Pipeline replication | Efficient use of client bandwidth |
| Write-ahead edit log + checkpoints | Fast metadata persistence + bounded recovery time |
| Rack-aware placement | Survive rack-level failures |
| Checksums per sub-block | Detect silent corruption without full-block reads |
| Heartbeat-based failure detection | Simple, distributed health monitoring |

## References

1. Ghemawat, S., Gobioff, H., Leung, S.-T. "The Google File System." SOSP 2003. [PDF](https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf)
2. Shvachko, K., Kuang, H., Radia, S., Chansler, R. "The Hadoop Distributed File System." MSST 2010. [PDF](https://storageconference.us/2010/Papers/MSST/Shvachko.pdf)
3. Apache Hadoop HDFS source code: [github.com/apache/hadoop](https://github.com/apache/hadoop/tree/trunk/hadoop-hdfs-project)
4. White, T. "Hadoop: The Definitive Guide." O'Reilly, 4th Edition, 2015.
