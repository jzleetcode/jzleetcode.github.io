---
author: JZ
pubDatetime: 2026-09-21T06:23:00Z
modDatetime: 2026-09-21T06:23:00Z
title: System Design - How Object Storage (S3) Works Internally
tags:
  - design-system
  - design-storage
description:
  "How object storage systems like Amazon S3 work under the hood: flat namespace design, metadata separation, data placement with consistent hashing, erasure coding for durability, multipart uploads, consistency models, and how it all compares to file and block storage."
---

## Table of contents

## Context

When you run `aws s3 cp photo.jpg s3://my-bucket/photos/photo.jpg`, the file appears to land in a folder called `photos` inside a bucket. But there is no folder. There is no filesystem. What actually happened involves a distributed metadata index, consistent hashing, erasure coding, and a fleet of storage nodes spanning multiple data centers.

Object storage is one of those systems that almost every engineer uses daily but few look inside. Amazon S3 launched in 2006 and stores over **350 trillion objects** as of 2024. Google Cloud Storage, Azure Blob Storage, and open-source systems like MinIO and Ceph all follow the same core design. Understanding how they work teaches you durable distributed storage design that applies far beyond "putting files in the cloud."

Let's trace what happens when you store and retrieve an object, layer by layer.

## Object Storage vs. File Storage vs. Block Storage

Before diving in, it helps to see where object storage sits relative to the two older storage models:

```
  Block Storage            File Storage           Object Storage
  (EBS, SAN)               (NFS, EXT4)            (S3, GCS)

  +---+---+---+---+      /home/                   bucket: my-bucket
  | 0 | 1 | 2 | 3 |       ├── user/                 ├── photos/cat.jpg
  | 4 | 5 | 6 | 7 |       │   ├── file.txt           ├── photos/dog.jpg
  | 8 | 9 |10 |11 |       │   └── notes/             └── logs/2026-09.csv
  +---+---+---+---+       └── tmp/
                                                    (flat namespace,
  Fixed-size blocks       Hierarchical tree          "/" is just part
  No metadata             Directories + inodes       of the key string)
  Lowest latency          POSIX semantics
  No built-in redundancy  Single server (usually)   HTTP API (GET/PUT)
                                                    Built-in redundancy
                                                    Massive scale
```

**Block storage** gives you raw disk blocks. You build a filesystem on top. Low latency, but you manage replication yourself.

**File storage** organizes data in a directory tree with POSIX semantics (`open`, `read`, `write`, `seek`). Great for random access within a file, but scaling a directory tree across thousands of servers is hard.

**Object storage** treats each piece of data as an opaque blob (an "object") identified by a flat key. No directories, no partial writes, no `seek`. You PUT the whole object and GET the whole object (or a byte range). This simplicity is what makes it possible to scale to trillions of objects across thousands of nodes.

## The Data Model: Buckets, Keys, and Objects

An object storage system has three concepts:

```
  +---------------------------+
  |         Account           |
  |  (authenticated identity) |
  +---------------------------+
           |
           +--- Bucket: "my-bucket"
           |       |
           |       +--- Key: "photos/cat.jpg"  -->  Object
           |       |       - Data: <binary blob>
           |       |       - Metadata: {content-type: image/jpeg, ...}
           |       |       - ETag: "d41d8cd98f00b204e9800998ecf8427e"
           |       |
           |       +--- Key: "logs/2026-09.csv"  -->  Object
           |
           +--- Bucket: "backups"
                   |
                   +--- Key: "db/snapshot-001.tar.gz"  -->  Object
```

- **Bucket**: A globally unique namespace (like a top-level directory). In S3, bucket names are DNS-compatible because they appear in URLs: `my-bucket.s3.amazonaws.com`.
- **Key**: A UTF-8 string up to 1,024 bytes. The `/` in `photos/cat.jpg` has no special meaning to the storage system — it's just a character in the string. The S3 console renders it as a folder hierarchy for human convenience, but the backend stores it flat.
- **Object**: The data blob (up to 5 TB in S3), plus user-defined metadata (key-value pairs), system metadata (size, last-modified, ETag), and an access control policy.

There is no "rename" operation. To rename, you copy to the new key and delete the old one. There is no "append." To add data, you re-upload the entire object (or use multipart upload for new objects). These constraints exist because they make the system dramatically simpler to distribute.

## Architecture: Separating Metadata from Data

The central architectural insight of object storage is **separating where objects are indexed from where their bytes live**. This split lets each layer scale independently.

```
          Client
            |
            |  PUT /bucket/key   (HTTP)
            v
  +-------------------+
  |   API Gateway /   |     Handles auth, rate limiting,
  |   Frontend        |     request routing
  +--------+----------+
           |
     +-----+------+
     |            |
     v            v
  +--------+   +--------+
  | Meta-  |   | Data   |     Metadata: "key X is stored at
  | data   |   | Plane  |      locations [A, B, C]"
  | Index  |   |        |     Data: the actual bytes
  +--------+   +--------+
     |            |
     |            +-------+--------+
     v            v       v        v
  +------+    +------+ +------+ +------+
  |Shard |    |Node  | |Node  | |Node  |   Storage nodes
  |  DB  |    |  A   | |  B   | |  C   |   (disks)
  +------+    +------+ +------+ +------+
```

### The Metadata Index

When you PUT an object, the system first needs to figure out: does this key already exist? Where should the data go? After writing, it records the mapping: `(bucket, key) → [data locations]`.

This index is typically a **distributed key-value store**, sharded by a hash of the bucket + key. In Amazon's architecture (described in their Dynamo paper lineage), the metadata tier uses a partitioned database. In Ceph, the metadata lives in the RADOS gateway (RGW) backed by the same RADOS cluster. In MinIO, metadata is co-located with data as small files on disk.

The metadata for each object is small (typically under 1 KB) but must be highly consistent — if two clients PUT the same key simultaneously, exactly one must win. This is where the system's consistency guarantees are enforced.

### The Data Plane

The actual bytes go to the **data plane**: a pool of storage nodes, each managing local disks. Objects are split into chunks and spread across multiple nodes for durability. The data plane doesn't know about keys or buckets — it just stores and retrieves chunks by their internal IDs.

## Data Placement: Consistent Hashing and Placement Groups

How does the system decide which storage nodes hold a given object's data? The classic approach is **consistent hashing** with **placement groups** (PGs).

```
  Hash Ring (simplified)

        Node A
         /   \
        /     \
   Node D      Node B
        \     /
         \   /
        Node C

  hash("my-bucket/photos/cat.jpg") = 0xA3F2...
  → maps to position on ring → primary = Node B
  → replicas: next N nodes clockwise → Node C, Node D
```

But pure consistent hashing has problems: nodes have different disk sizes, and adding a node shuffles too many objects. Real systems add an **indirection layer**:

```
  Object key
      |
      | hash
      v
  Placement Group (PG)
      |
      | placement algorithm (CRUSH, rendezvous hashing, etc.)
      v
  Set of storage nodes {Node B, Node C, Node D}
```

1. **Hash the key** to a fixed number of **placement groups** (e.g., 256 PGs per bucket). This is a simple modulo: `PG = hash(key) % num_PGs`.
2. **Map each PG to a set of nodes** using a placement algorithm that respects failure domains (different racks, different data centers).

Ceph's **CRUSH algorithm** is the best-documented example. CRUSH takes a PG number and a cluster map as inputs and deterministically computes which nodes should hold data for that PG — without consulting a central directory:

```
  CRUSH(pg_id, cluster_map) → [osd.5, osd.12, osd.31]

  The cluster map encodes:
  - Which nodes exist and their weights (disk capacity)
  - Failure domain hierarchy: disk → host → rack → datacenter
  - Placement rules: "spread 3 replicas across 3 different racks"
```

Because CRUSH is deterministic and every node has the same cluster map, any node can independently compute where any object lives. No central lookup needed for data routing.

## Durability: Erasure Coding

Storing three full copies of every object is simple but wastes 3× the storage. For large-scale systems, **erasure coding** provides the same (or better) durability at much lower overhead.

The idea comes from information theory: split data into `k` data chunks and compute `m` parity chunks such that any `k` of the `k + m` chunks can reconstruct the original data.

```
  Original object: [===========  5 MB  ===========]

  Split into k=4 data chunks:

  [chunk 1]  [chunk 2]  [chunk 3]  [chunk 4]
   1.25 MB    1.25 MB    1.25 MB    1.25 MB

  Compute m=2 parity chunks using Reed-Solomon coding:

  [parity 1]  [parity 2]
    1.25 MB     1.25 MB

  Total storage: 6 × 1.25 MB = 7.5 MB  (1.5× overhead)
  Can tolerate:  any 2 chunk losses (same as 3-way replication)
  Replication:   15 MB for same durability (3× overhead)
```

S3 uses erasure coding internally. AWS has stated that S3 provides **11 nines of durability** (99.999999999%), meaning for 10 million objects, you'd expect to lose one every 10,000 years.

The math works because the chunks are spread across independent failure domains. If each chunk is on a different rack, you'd need three racks to fail simultaneously before losing data (with `k=4, m=2`):

```
  Rack 1       Rack 2       Rack 3       Rack 4       Rack 5       Rack 6
  +-------+   +-------+   +-------+   +-------+   +-------+   +-------+
  |chunk 1|   |chunk 2|   |chunk 3|   |chunk 4|   |parity1|   |parity2|
  +-------+   +-------+   +-------+   +-------+   +-------+   +-------+

  Rack 3 dies → 5 chunks remain → reconstruct from any 4 → no data loss
  Rack 3 + Rack 5 die → 4 chunks remain → still okay (need k=4)
  Rack 3 + Rack 5 + Rack 1 die → 3 chunks remain → DATA LOST (need 4)
```

When a storage node fails, the system detects it (via heartbeats) and immediately starts **reconstructing** the lost chunks on surviving nodes. This "self-healing" property means the window of vulnerability (where enough chunks are missing to lose data) is measured in minutes, not days.

## The Write Path: What Happens on PUT

Let's trace a `PUT /my-bucket/photos/cat.jpg` request through the system:

```
  Client                  API Gateway            Metadata           Data Plane
    |                         |                     |                   |
    |  PUT object (5 MB)      |                     |                   |
    |------------------------>|                     |                   |
    |                         |                     |                   |
    |                   1. Authenticate (IAM)       |                   |
    |                   2. Check bucket exists       |                   |
    |                   3. Check quota               |                   |
    |                         |                     |                   |
    |                         |  Compute placement  |                   |
    |                         |  PG = hash(key) % N |                   |
    |                         |  nodes = CRUSH(PG)  |                   |
    |                         |                     |                   |
    |                         |  Stream data to nodes                   |
    |                         |-------------------------------------------->|
    |                         |                     |                   |
    |                         |          4. Each node writes chunk to disk  |
    |                         |          5. Computes checksum (MD5/SHA256)  |
    |                         |          6. ACKs back                       |
    |                         |<--------------------------------------------|
    |                         |                     |                   |
    |                         |  7. Write metadata  |                   |
    |                         |-------------------->|                   |
    |                         |     (bucket, key,   |                   |
    |                         |      size, etag,    |                   |
    |                         |      chunk locs)    |                   |
    |                         |     ACK             |                   |
    |                         |<--------------------|                   |
    |                         |                     |                   |
    |  200 OK + ETag          |                     |                   |
    |<------------------------|                     |                   |
```

Key details:

1. **Data before metadata.** The bytes are written to the data plane first. Only after all required chunks are durably stored does the system write the metadata entry. This ensures you never have a metadata record pointing to data that doesn't exist.

2. **Checksums everywhere.** Every chunk gets a checksum on write. On read, the checksum is verified. If a bit flip is detected, the system reconstructs from parity. This catches **silent data corruption** (bit rot) that would otherwise go undetected for years.

3. **ETag as content hash.** The `ETag` header returned to the client is typically the MD5 hash of the object content. The client can verify end-to-end integrity by comparing it to a locally computed hash.

## The Read Path: What Happens on GET

```
  Client                  API Gateway            Metadata           Data Plane
    |                         |                     |                   |
    |  GET /bucket/key        |                     |                   |
    |------------------------>|                     |                   |
    |                         |  Lookup metadata    |                   |
    |                         |-------------------->|                   |
    |                         |  {size, etag,       |                   |
    |                         |   chunks: [A,B,C,D]}|                   |
    |                         |<--------------------|                   |
    |                         |                     |                   |
    |                         |  Request k chunks   |                   |
    |                         |  (parallel)         |                   |
    |                         |-------------------------------------------->|
    |                         |                     |                   |
    |                         |  Stream chunks      |                   |
    |                         |<--------------------------------------------|
    |                         |                     |                   |
    |                         |  Reassemble + verify checksums         |
    |                         |                     |                   |
    |  200 OK + data          |                     |                   |
    |<------------------------|                     |                   |
```

The system only needs `k` chunks out of `k + m` to reconstruct the object. It sends requests to all `k + m` nodes in parallel and uses whichever `k` respond first. This means a single slow disk doesn't slow down the read — the system just ignores the straggler:

```
  Request chunks from 6 nodes (k=4, m=2):

  Node A: [chunk 1] ........  150ms  ✓ (used)
  Node B: [chunk 2] ....      80ms   ✓ (used)
  Node C: [chunk 3] ......    120ms  ✓ (used)
  Node D: [chunk 4] .......   140ms  ✓ (used)
  Node E: [parity 1] ...      60ms   ✓ (ignored, already have 4)
  Node F: [parity 2] ........ 160ms  ✓ (ignored)

  Reassemble from first 4 responses → latency = 140ms (not 160ms)
```

This technique is called **tail-latency hedging** and is critical for maintaining consistent read performance at scale.

## Multipart Uploads: Handling Large Objects

You can't upload a 5 TB object in a single HTTP request. Network failures, timeouts, and memory limits make that impractical. Object storage systems solve this with **multipart upload**, a three-phase protocol:

```
  Phase 1: Initiate
  POST /bucket/key?uploads → returns UploadID = "abc123"

  Phase 2: Upload parts (can be parallel, can retry individual parts)
  PUT /bucket/key?partNumber=1&uploadId=abc123  → ETag: "aaa..."
  PUT /bucket/key?partNumber=2&uploadId=abc123  → ETag: "bbb..."
  PUT /bucket/key?partNumber=3&uploadId=abc123  → ETag: "ccc..."

  Phase 3: Complete (assembles the parts into one object)
  POST /bucket/key?uploadId=abc123
  Body: <Part 1: ETag="aaa...">, <Part 2: ETag="bbb...">, ...
  → 200 OK, object is now visible
```

```
  Timeline of a multipart upload:

  Initiate  ────────────────────────────────  Complete
     |                                           |
     |   Part 1: [=====>]                        |
     |   Part 2:    [==>] (fast)                 |
     |   Part 3: [========>] (slow, retried)     |
     |   Part 3:        [====>] (retry succeeds) |
     |                                           |
     Object invisible ─────────────── Object visible
```

Until the `Complete` call succeeds, the object is invisible. This is atomic from the reader's perspective — they either see the old version or the new complete version, never a partial upload.

Parts are stored independently in the data plane. The `Complete` call tells the metadata index to stitch them together logically. Some systems physically compact the parts into optimal chunk sizes in the background.

## Consistency Model

Early S3 (pre-2020) offered **eventual consistency** for overwrite PUTs and DELETEs: after writing a new version, a subsequent GET might still return the old version for a brief window. This was a deliberate trade-off for availability and performance.

In December 2020, AWS announced **strong read-after-write consistency** for S3 at no extra cost. Every successful PUT is immediately visible to all subsequent GETs.

How did they achieve this? The key insight is that the metadata index is the linearization point:

```
  Eventually Consistent (old model):
  
  Client A: PUT key=v2 ──── ACK
  Client B:                      GET key → v1 (stale!)  → v2 (eventually)
            ─────────────────────────────────────────────────────────>
                             replication lag

  Strongly Consistent (current model):

  Client A: PUT key=v2 ──── ACK
  Client B:                      GET key → v2 (always)
            ─────────────────────────────────────────────────────────>
                             metadata write is the
                             linearization point
```

The metadata write uses a **consensus protocol** (like Paxos or Raft) across multiple metadata replicas. A PUT only returns success after a majority of metadata replicas acknowledge the new version. A GET reads from a metadata replica that is guaranteed to have the latest committed version. Because metadata is tiny (< 1 KB per object), this consensus overhead is small.

The data plane can still use eventual replication for the actual bytes — the metadata records which chunk replicas are confirmed durable, and only those are served to readers.

## Listing: The Flat Namespace Challenge

`GET /my-bucket?prefix=photos/&delimiter=/` lists "files" in the `photos/` "directory." But since there are no real directories, the system must **scan the metadata index** for keys matching the prefix and group them by the delimiter.

```
  Stored keys (flat):                What LIST returns:
  
  photos/cat.jpg                     CommonPrefixes:
  photos/dog.jpg                       photos/vacation/
  photos/vacation/beach.jpg          Contents:
  photos/vacation/mountain.jpg         photos/cat.jpg
  logs/2026-09.csv                     photos/dog.jpg
```

This is essentially a **range scan** on a sorted index. The metadata store must support efficient prefix queries — typically via a B-tree or LSM-tree index sorted lexicographically by key.

For buckets with billions of objects, listing can be slow. S3 paginates results (1,000 keys per response) and provides a `ContinuationToken` for the client to fetch the next page. Internally, the system parallelizes the scan across metadata shards.

This is why S3 listing is eventually consistent for very large buckets in some edge cases, and why designing your key schema matters. Using random prefixes (like UUIDs) spreads objects across shards evenly, improving both write throughput and list performance.

## Versioning and Lifecycle

Object storage systems support **versioning**: every PUT creates a new version instead of overwriting. DELETEs insert a "delete marker" instead of removing data.

```
  Key: photos/cat.jpg

  Version history:
  +----------+------------------+------------------+
  | VersionID|  Timestamp       |  Status          |
  +----------+------------------+------------------+
  | v3       | 2026-09-21 10:00 | DELETE MARKER    | ← current
  | v2       | 2026-09-15 14:30 | 2.1 MB           |
  | v1       | 2026-09-01 09:00 | 1.8 MB           |
  +----------+------------------+------------------+

  GET photos/cat.jpg       → 404 (delete marker)
  GET photos/cat.jpg?versionId=v2  → returns 2.1 MB version
```

**Lifecycle policies** automate transitions and cleanup:

```
  Day 0       Day 30           Day 90          Day 365
    |           |                |                |
    v           v                v                v
  [Standard] → [Infrequent    → [Glacier /     → [Delete]
                 Access]         Archive]

  Storage class:  Hot disk → Warm disk → Cold tape/deep archive
  Cost per GB:    $0.023   → $0.0125  → $0.004   → $0
  Retrieval:      ms       → ms       → minutes-hours
```

The lifecycle engine is a background process that scans the metadata index, identifies objects matching age or size criteria, and migrates their data to cheaper storage tiers. The metadata record is updated to reflect the new storage class, but the key remains the same.

## Security: Encryption and Access Control

Object storage encrypts data at multiple layers:

```
  Client                    Gateway                 Storage Node
    |                         |                         |
    |  ── TLS 1.3 ──────────>|                         |
    |  (encryption in transit)|                         |
    |                         |  ── server-side ──────>|
    |                         |  encryption (SSE)      |
    |                         |  AES-256-GCM           |
    |                         |                         |
    |                         |  Each object gets a    |
    |                         |  unique data key,      |
    |                         |  encrypted by a        |
    |                         |  master key (KMS)      |
```

**Envelope encryption** is the standard pattern: a unique **data encryption key (DEK)** encrypts each object, and a **master key** in a key management service (KMS) encrypts the DEK. The encrypted DEK is stored alongside the object metadata. This way, rotating the master key doesn't require re-encrypting every object — you just re-encrypt the DEKs.

Access control uses a combination of:
- **IAM policies** (who can access what)
- **Bucket policies** (rules attached to the bucket)
- **Access Control Lists** (legacy per-object permissions)
- **Pre-signed URLs** (time-limited access tokens embedded in URLs)

## Performance: Why Key Design Matters

S3 partitions its metadata index by key prefix. Before 2018, keys with the same prefix (like sequential timestamps) could create a "hot partition":

```
  Bad key design (hot partition):

  2026-09-21T00:00:01/data.json    ─┐
  2026-09-21T00:00:02/data.json     ├── all hash to same partition
  2026-09-21T00:00:03/data.json     │   = hotspot
  2026-09-21T00:00:04/data.json    ─┘

  Better key design (spread across partitions):

  a3f2/2026-09-21T00:00:01/data.json  ─── partition X
  7b01/2026-09-21T00:00:02/data.json  ─── partition Y
  e5c9/2026-09-21T00:00:03/data.json  ─── partition Z
```

AWS improved S3's auto-partitioning in 2018, and it now handles sequential prefixes much better (3,500 PUT/s and 5,500 GET/s per prefix). But for extreme throughput, spreading keys across prefixes still helps.

## Open-Source Implementations

Two popular open-source object storage systems illustrate these concepts:

**MinIO** takes a minimalist approach. It runs as a single binary, stores objects as files on local disks (one file per object), and uses **bit-rot protection** with HighwayHash checksums. Erasure coding uses Reed-Solomon across local drives. It's designed for simplicity and S3 API compatibility.

**Ceph RADOS Gateway (RGW)** provides S3 (and Swift) APIs on top of Ceph's RADOS storage layer. RADOS uses the CRUSH algorithm for data placement, Paxos for monitor consensus, and primary-copy replication or erasure coding for durability. It's more complex but handles petabyte-scale deployments.

Both implement the same architectural pattern: separate metadata indexing from data storage, use consistent hashing for placement, and provide durability through redundancy.

## References

1. Amazon S3 documentation [doc](https://docs.aws.amazon.com/s3/)
2. Amazon's Dynamo paper — "Dynamo: Amazon's Highly Available Key-value Store" (2007) [paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
3. Ceph CRUSH algorithm — "CRUSH: Controlled, Scalable, Decentralized Placement of Replicated Data" (2006) [paper](https://ceph.io/assets/pdfs/weil-crush-sc06.pdf)
4. AWS announcement: S3 strong consistency (2020) [blog](https://aws.amazon.com/blogs/aws/amazon-s3-update-strong-read-after-write-consistency/)
5. Reed-Solomon erasure coding explanation [wiki](https://en.wikipedia.org/wiki/Reed%E2%80%93Solomon_error_correction)
6. MinIO erasure coding documentation [doc](https://min.io/docs/minio/linux/operations/concepts/erasure-coding.html)
7. Ceph RADOS Gateway documentation [doc](https://docs.ceph.com/en/latest/radosgw/)
8. AWS re:Invent 2021 — "Deep dive on Amazon S3" [talk](https://www.youtube.com/watch?v=sYDJYqvNeXU)
9. S3 performance optimization [doc](https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html)
