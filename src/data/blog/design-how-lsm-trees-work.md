---
author: JZ
pubDatetime: 2026-04-10T06:23:00Z
modDatetime: 2026-04-10T06:23:00Z
title: System Design - How LSM Trees Work (The Engine Behind RocksDB, LevelDB, and Cassandra)
tags:
  - design-system
  - design-database
description:
  "How Log-Structured Merge Trees (LSM Trees) work: the write-optimized data structure behind RocksDB, LevelDB, Cassandra, and TiKV. Covers memtable, WAL, SSTables, compaction strategies, bloom filters, and a source code walkthrough from the facebook/rocksdb repository."
---

## Table of contents

## Context

Traditional databases like PostgreSQL and MySQL use **B-trees** to store data on disk. B-trees are excellent for reads — finding a key takes $O(\log n)$ disk seeks. But every write modifies the tree in place, causing **random I/O** on disk. For workloads with heavy writes (logging, time-series, messaging), this becomes a bottleneck.

In 1996, Patrick O'Neil, Edward Cheng, Dieter Gawlick, and Elizabeth O'Neil published a paper called [The Log-Structured Merge-Tree (LSM-Tree)](https://www.cs.umb.edu/~poneil/lsmtree.pdf). Their insight was simple: **what if we never modify data in place?** Instead, we buffer writes in memory and periodically flush them to disk as sorted, immutable files. This turns random writes into sequential writes — and sequential I/O is 100–1000x faster than random I/O on both HDDs and SSDs.

Today, LSM trees power some of the most widely used storage engines:

| Engine     | Used By                        |
|------------|--------------------------------|
| LevelDB    | Chrome, Blockchain nodes       |
| RocksDB    | TiKV, CockroachDB, Meta (MySQL)|
| Cassandra  | Apple, Netflix, Discord        |
| HBase      | Hadoop ecosystem               |
| Pebble     | CockroachDB (newer versions)   |
| BadgerDB   | Dgraph                         |

Let's walk through how they work, from the first byte written to the final compacted file on disk.

## The Big Picture

An LSM tree has two main areas: an **in-memory** component and an **on-disk** component. Here's how they fit together:

```
                         LSM Tree Architecture

    Write ───>  +------------------+
                |    MemTable      |    (sorted, in-memory)
                |  (Red-Black Tree |
                |   or Skip List)  |
                +--------+---------+
                         |
                    flush when full
                         |
                         v
                +------------------+
                |  Immutable       |    (read-only, waiting
                |  MemTable        |     to be flushed)
                +--------+---------+
                         |
                    write to disk
                         |
          +--------------+---------------+
          v              v               v
    +-----------+  +-----------+   +-----------+
    | SSTable 1 |  | SSTable 2 |   | SSTable 3 |   Level 0
    | (sorted)  |  | (sorted)  |   | (sorted)  |   (may overlap)
    +-----------+  +-----------+   +-----------+
          |              |               |
          +-------+------+-------+-------+
                  |   compaction  |
                  v              v
          +-------------+  +-------------+
          |  SSTable A  |  |  SSTable B  |          Level 1
          |  [aaa..mzz] |  |  [naa..zzz] |          (no overlap)
          +-------------+  +-------------+
                  |              |
                  +------+-------+
                         |  compaction
                         v
          +------+  +------+  +------+  +------+
          | SS 1 |  | SS 2 |  | SS 3 |  | SS 4 |  Level 2
          +------+  +------+  +------+  +------+   (no overlap,
                                                     10x larger)

    +---------------------------------------------------+
    |    WAL (Write-Ahead Log) — crash recovery          |
    |    Sequential append-only file on disk              |
    +---------------------------------------------------+
```

Let's trace a write from start to finish.

## Step 1: Write-Ahead Log (WAL)

Before anything touches the MemTable, every write is appended to a **Write-Ahead Log** (WAL) on disk. This is a simple, append-only file — no sorting, no indexing. Its only job is crash recovery.

```
  Put("user:42", "Alice")

      |
      v
  +--------------------------------------------------+
  | WAL File (sequential append)                     |
  |                                                  |
  |  [seq=1] Put "user:1"  -> "Bob"                 |
  |  [seq=2] Put "user:17" -> "Carol"               |
  |  [seq=3] Put "user:42" -> "Alice"   <-- new     |
  +--------------------------------------------------+
```

If the process crashes before the MemTable is flushed to disk, the WAL is replayed on restart to rebuild the MemTable. Once the MemTable is successfully flushed to an SSTable, its corresponding WAL file is deleted.

In RocksDB, the WAL format is defined in [`db/log_format.h`](https://github.com/facebook/rocksdb/blob/main/db/log_format.h). Each record contains a checksum, length, type, and the key-value data. The simplicity is intentional — WAL writes must be as fast as possible.

## Step 2: MemTable (In-Memory Sorted Buffer)

After the WAL append, the key-value pair is inserted into the **MemTable** — a sorted, in-memory data structure. RocksDB uses a **skip list** by default (though it also supports hash-based and vector-based MemTables).

### Why a skip list?

A skip list is a probabilistic data structure that provides $O(\log n)$ insert, delete, and search — similar to a balanced binary tree — but with a key advantage: **concurrent inserts don't need a global lock**. Multiple threads can write simultaneously using atomic compare-and-swap operations.

```
  Skip List (MemTable)

  Level 3:  HEAD ──────────────────────────────> "user:42" ──> NIL
  Level 2:  HEAD ──────────> "user:17" ──────────> "user:42" ──> NIL
  Level 1:  HEAD ──> "user:1" ──> "user:17" ──> "user:42" ──> NIL
  Level 0:  HEAD ──> "user:1" ──> "user:17" ──> "user:42" ──> NIL
                       "Bob"       "Carol"        "Alice"
```

Each node exists at level 0 and is randomly promoted to higher levels with probability $1/4$ (in RocksDB). To find a key, start at the highest level and skip forward — this gives $O(\log n)$ expected lookup time.

The implementation lives in [`memtable/inlineskiplist.h`](https://github.com/facebook/rocksdb/blob/main/memtable/inlineskiplist.h). The "inline" part means nodes and their keys are allocated in a contiguous arena, improving cache locality.

### MemTable size limit

The MemTable has a configurable size limit (default **64 MB** in RocksDB, set by `write_buffer_size`). Once this threshold is reached:

1. The current MemTable is marked **immutable** (no more writes).
2. A new, empty MemTable is created for incoming writes.
3. A background thread begins flushing the immutable MemTable to disk as an SSTable.

```
  Before flush:                    After flush trigger:

  +----------------+               +----------------+
  |   MemTable     |               |  NEW MemTable  |  <-- writes go here
  |   (active,     |               |  (active)      |
  |    62 MB)      |               +----------------+
  +----------------+
                                   +----------------+
                                   |  OLD MemTable  |  <-- immutable,
                                   |  (frozen,      |      being flushed
                                   |   62 MB)       |
                                   +----------------+
```

## Step 3: SSTables (Sorted String Tables)

When the immutable MemTable is flushed, it becomes an **SSTable** (Sorted String Table) — an immutable, sorted file on disk. "Immutable" is the key word: once written, an SSTable is never modified. This design eliminates write locks, simplifies caching, and makes crash recovery straightforward.

### SSTable internal structure

An SSTable in RocksDB is organized into **blocks**:

```
  SSTable File Layout

  +------------------------------------------+
  |            Data Block 1                  |
  |  +------------------------------------+  |
  |  | key1 -> value1                     |  |
  |  | key2 -> value2                     |  |
  |  | key3 -> value3                     |  |
  |  |  ... (sorted by key)              |  |
  |  +------------------------------------+  |
  +------------------------------------------+
  |            Data Block 2                  |
  |  +------------------------------------+  |
  |  | key4 -> value4                     |  |
  |  | key5 -> value5                     |  |
  |  |  ...                              |  |
  |  +------------------------------------+  |
  +------------------------------------------+
  |              ...                         |
  +------------------------------------------+
  |         Filter Block                     |
  |  (Bloom filters for each data block)     |
  +------------------------------------------+
  |         Index Block                      |
  |  (last key of each data block +          |
  |   offset to locate it)                   |
  +------------------------------------------+
  |         Footer                           |
  |  (offsets to index & filter blocks,      |
  |   magic number, version)                 |
  +------------------------------------------+
```

Each **data block** is typically 4 KB (configurable via `block_size`). Keys within a block use **prefix compression** — if consecutive keys share a common prefix, only the differing suffix is stored. This can reduce file size by 20–40% for keys with common prefixes.

The **index block** maps the last key of each data block to its file offset, enabling binary search across blocks. The **filter block** contains Bloom filters (covered below) that let reads skip blocks that definitely don't contain the target key.

The SSTable format is implemented in [`table/block_based/block_based_table_builder.cc`](https://github.com/facebook/rocksdb/blob/main/table/block_based/block_based_table_builder.cc).

## Reading: How a Point Lookup Works

Reading from an LSM tree requires checking multiple places, from newest to oldest:

```
  Get("user:42")

      |
      v
  1. MemTable (active)          ──> not found
      |
      v
  2. Immutable MemTables        ──> not found
      |
      v
  3. Level 0 SSTables           ──> check ALL (they may overlap)
     +-- SSTable 3 (newest)     ──> not found
     +-- SSTable 2              ──> not found
     +-- SSTable 1 (oldest)     ──> not found
      |
      v
  4. Level 1 SSTables           ──> binary search on key ranges
     +-- SSTable A [aaa..mzz]   ──> skip (out of range)
     +-- SSTable B [naa..zzz]   ──> FOUND! "user:42" = "Alice"
      |
      done (return "Alice")
```

**Level 0 is special.** Because L0 SSTables come directly from MemTable flushes, their key ranges can overlap. For example, if key `"user:42"` was written, deleted, then written again across three flushes, all three L0 SSTables might contain an entry for it. So we must check **all** L0 files, newest first.

**Level 1 and below** have non-overlapping key ranges (guaranteed by compaction). So for each level, we binary search the file boundaries to find at most **one** SSTable that could contain the key, then search within it.

### Bloom Filters: Avoiding Unnecessary Reads

Even with binary search, checking an SSTable means reading its index block and potentially a data block from disk. For keys that don't exist, this is wasted work. **Bloom filters** solve this.

A Bloom filter is a space-efficient probabilistic data structure that answers: "Is this key **definitely not** in this SSTable?" It can have false positives (saying "maybe yes" when the key isn't there) but **never false negatives** (if it says "no", the key is guaranteed absent).

```
  Bloom Filter Check

  Get("user:99")
      |
      v
  SSTable X: Bloom filter says "definitely not here"
      |                                                  SKIP
      v                                                  (no disk read)
  SSTable Y: Bloom filter says "maybe here"
      |
      v
  Read index block -> binary search -> read data block
      |
      v
  Key not found (false positive — but we only wasted one read)
```

RocksDB uses a **10 bits per key** Bloom filter by default, giving roughly a **1% false positive rate**. The implementation is in [`table/block_based/filter_policy.cc`](https://github.com/facebook/rocksdb/blob/main/table/block_based/filter_policy.cc). For a database with 1 billion keys, the Bloom filters consume about 1.2 GB of memory — a small price to skip billions of unnecessary disk reads.

## Deletes: Tombstones, Not Erasure

Since SSTables are immutable, you can't simply remove a key. Instead, a **delete** writes a special marker called a **tombstone**:

```
  Delete("user:17")

  MemTable now contains:

  "user:1"  -> "Bob"
  "user:17" -> [TOMBSTONE]      <-- marks key as deleted
  "user:42" -> "Alice"
```

During a read, if the search finds a tombstone before finding a value, it returns "key not found." The actual data is only physically removed later during **compaction**, when the tombstone and all older versions of that key are merged away.

This means deleted data still occupies space until compaction runs. In RocksDB, you can check how much space is consumed by tombstones using the `rocksdb.estimate-num-keys` and `rocksdb.num-deletions` properties.

## Compaction: The Heart of LSM Trees

Without compaction, the number of SSTables would grow forever, and reads would get slower (more files to check). **Compaction** is the background process that merges SSTables together, removing duplicates, applying tombstones, and organizing data into levels.

### Leveled Compaction (RocksDB default)

Leveled compaction organizes SSTables into levels with exponentially increasing size:

```
  Level    Max Size    Max Files (at 64MB each)    Key Range Overlap
  -----    --------    -------------------------   ------------------
  L0       256 MB      4 files                     YES (overlapping)
  L1       256 MB      4 files                     NO
  L2       2.56 GB     40 files                    NO
  L3       25.6 GB     400 files                   NO
  L4       256 GB      4000 files                  NO
  L5       2.56 TB     40000 files                 NO
  L6       25.6 TB     400000 files                NO
```

Each level is **10x larger** than the previous (configurable via `max_bytes_for_level_multiplier`). When a level exceeds its size limit, compaction picks one SSTable from that level and merges it with the overlapping SSTables in the next level:

```
  Compaction: L1 -> L2

  L1:  [aaa...fff]  [ggg...mmm]  [nnn...zzz]
                         |
                   this file is picked
                   (score-based selection)
                         |
                         v
  L2:  [aaa...ddd]  [eee...hhh]  [iii...ppp]  [qqq...zzz]
                     ^^^^^^^^^^   ^^^^^^^^^^
                     these two files overlap with [ggg...mmm]

  Merge-sort [ggg...mmm] + [eee...hhh] + [iii...ppp]:
   - Keep newest version of each key
   - Drop tombstoned keys (if no older version exists below)
   - Split output into new ~64MB files

  L2 after:  [aaa...ddd]  [eee...jjj]  [kkk...ppp]  [qqq...zzz]
                           ^^^^^^^^^^^  ^^^^^^^^^^^
                           new files replace the old ones
```

The merge is a **k-way merge sort** — it reads the input files in key order, keeps the newest version of each key, drops keys covered by tombstones, and writes the output as new SSTable(s). The old input files are then deleted.

### Write Amplification

The main cost of leveled compaction is **write amplification** — data gets rewritten multiple times as it moves down levels. In the worst case, compacting one file from level $N$ to level $N+1$ requires rewriting up to 10 files at level $N+1$ (because level $N+1$ is 10x larger). Across all levels, the total write amplification is roughly:

$$\text{Write Amplification} \approx \text{size\_ratio} \times (\text{num\_levels} - 1)$$

For the default settings (ratio 10, 7 levels), this is about **60x** in the worst case. In practice, it's typically 10–30x because compaction files don't always overlap the full ratio.

### Size-Tiered Compaction (Alternative)

Cassandra defaults to **size-tiered compaction**, which groups similarly-sized SSTables together and merges them when a threshold is reached:

```
  Size-Tiered Compaction

  Tier 1 (small):   [A] [B] [C] [D]  --> merge into one medium file
  Tier 2 (medium):  [E] [F] [G] [H]  --> merge into one large file
  Tier 3 (large):   [I] [J] [K] [L]  --> merge into one huge file
```

Size-tiered compaction has **lower write amplification** (each key is rewritten ~$\log$ times) but **higher space amplification** (needs up to 2x disk space during merges) and **worse read performance** (more overlapping files to check).

RocksDB also supports a hybrid called **Universal Compaction** that behaves similarly. The tradeoff table:

```
  Strategy       Write Amp    Space Amp    Read Amp
  -----------    ---------    ---------    --------
  Leveled        High         Low (1.1x)   Low
  Size-Tiered    Low          High (2x)    High
  FIFO           None         None         Highest
```

## Putting It All Together: A Complete Write-Read Cycle

Let's trace through a realistic scenario:

```
  Time 0: Put("k1", "v1"), Put("k2", "v2"), ..., Put("k1M", "v1M")
          |
          v
  MemTable fills up (64 MB)
          |
          v
  Time 1: MemTable frozen -> flush to L0 SSTable #1
          New MemTable created
          More writes: Put("k500K", "v2"), Put("k1.5M", "v3"), ...
          |
          v
  Time 2: Another flush -> L0 SSTable #2
          L0 now has 2 files (overlapping key ranges)
          |
          v
  Time 3: L0 hits 4 files -> compaction triggers
          All 4 L0 files merge-sorted into L1 files
          |
          v
  Time 4: L1 exceeds 256 MB -> compaction to L2
          One L1 file + overlapping L2 files merged
          Old files deleted
          |
          v
  ...data gradually sinks to deeper levels...

  Read: Get("k500K")
  1. Check MemTable       -> found "v2" (latest write) -> return "v2"
     (if not in MemTable, check L0, L1, L2, ... until found)
```

Notice that `"k500K"` was written twice — once with `"v1"` (the original batch) and once with `"v2"` (the update). The MemTable has the latest version, so it's returned immediately. If the MemTable had already been flushed, the read would check L0 files newest-first and find `"v2"` before `"v1"`.

## RocksDB in TiKV

TiKV, the storage layer of TiDB, uses RocksDB as its local storage engine. Each TiKV node runs multiple RocksDB instances (called "column families"):

```
  TiKV Node
  +-----------------------------------------------+
  |                                               |
  |  +------------------+  +------------------+   |
  |  | RocksDB (default)|  | RocksDB (write)  |   |
  |  | CF: actual data  |  | CF: Percolator   |   |
  |  |  key -> value    |  |  locks & txn     |   |
  |  +------------------+  +------------------+   |
  |                                               |
  |  +------------------+                         |
  |  | RocksDB (raft)   |                         |
  |  | CF: Raft logs    |                         |
  |  +------------------+                         |
  |                                               |
  +-----------------------------------------------+
```

TiKV tunes RocksDB specifically for its workload. For example, it uses **leveled compaction** for the default CF (optimizing reads) and configures Bloom filters for point lookups. The Raft CF uses a smaller MemTable since Raft logs are append-heavy and quickly trimmed.

## Performance Considerations

**Tune for your workload:**

- **Write-heavy** (logging, IoT): Increase `write_buffer_size` to flush less often. Consider universal compaction for lower write amplification.
- **Read-heavy** (serving, analytics): Use leveled compaction. Enable Bloom filters. Increase `block_cache_size` to keep hot data in memory.
- **Mixed**: The defaults work well for most cases. Monitor compaction stats with `rocksdb.stats`.

**Key metrics to watch:**

- **Compaction pending bytes**: If this grows unboundedly, compaction can't keep up with writes. You'll need faster disks or reduced write rate.
- **Stalls**: When L0 has too many files (default threshold: 20), RocksDB **stalls writes** to let compaction catch up. This shows up as sudden latency spikes.
- **Space amplification**: `(total_size_on_disk / actual_data_size)`. Leveled compaction typically keeps this under 1.1x.

## References

1. The Log-Structured Merge-Tree (LSM-Tree), O'Neil et al. (1996) [paper](https://www.cs.umb.edu/~poneil/lsmtree.pdf)
2. RocksDB Wiki — Leveled Compaction [doc](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction)
3. RocksDB Wiki — Universal Compaction [doc](https://github.com/facebook/rocksdb/wiki/Universal-Compaction)
4. RocksDB SSTable format [`table/block_based/block_based_table_builder.cc`](https://github.com/facebook/rocksdb/blob/main/table/block_based/block_based_table_builder.cc)
5. RocksDB MemTable skip list [`memtable/inlineskiplist.h`](https://github.com/facebook/rocksdb/blob/main/memtable/inlineskiplist.h)
6. RocksDB WAL format [`db/log_format.h`](https://github.com/facebook/rocksdb/blob/main/db/log_format.h)
7. RocksDB Bloom filter [`table/block_based/filter_policy.cc`](https://github.com/facebook/rocksdb/blob/main/table/block_based/filter_policy.cc)
8. TiKV RocksDB tuning [doc](https://docs.pingcap.com/tidb/stable/tune-tikv-memory-performance)
9. Designing Data-Intensive Applications, Martin Kleppmann — Chapter 3: Storage and Retrieval [book](https://dataintensive.net/)
