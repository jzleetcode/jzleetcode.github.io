---
author: JZ
pubDatetime: 2026-08-14T06:23:00Z
modDatetime: 2026-08-14T06:23:00Z
title: System Design - How RocksDB Compaction Works
tags:
  - design-system
  - design-database
description:
  "How RocksDB compaction works under the hood: leveled compaction scheduling, file picking, merge-sort mechanics, write amplification tradeoffs, and a source code walkthrough from the facebook/rocksdb repository."
---

## Table of contents

## Context

You write a key-value pair to RocksDB. It goes into a memtable in RAM, gets flushed to an SST file on disk, and... then what? Over time, hundreds of SST files accumulate. Some contain stale data (overwritten keys, deleted tombstones). Reads slow down because they must check many files to find the latest version of a key.

**Compaction** is RocksDB's garbage collector and defragmenter rolled into one. It reads existing SST files, merge-sorts their contents, drops obsolete entries, and writes new, cleaner files. Without compaction, an LSM-tree would grow unbounded and reads would degrade to scanning every file ever written.

This article walks through how RocksDB decides *when* to compact, *which files* to pick, *how* the merge works, and what knobs you can turn — all grounded in source code from the [facebook/rocksdb](https://github.com/facebook/rocksdb) repository.

```
                         RocksDB Write Path → Compaction

    Client
      |
      | Put(key, value)
      v
  +----------+         +----------+
  |   WAL    |-------->| Memtable |       (in memory, sorted)
  | (append) |         +----+-----+
  +----------+              |
                            | flush (memtable full)
                            v
                       +---------+
                       | Level 0 |   unsorted SST files (overlapping keys)
                       +---------+
                            |
                            | compaction
                            v
                       +---------+
                       | Level 1 |   sorted, non-overlapping SST files
                       +---------+
                            |
                            | compaction
                            v
                       +---------+
                       | Level 2 |   10x larger than Level 1
                       +---------+
                            |
                            :
                            v
                       +---------+
                       | Level N |   bottom level (bulk of data)
                       +---------+
```

Every level below L0 has a key invariant: **files within the same level have non-overlapping key ranges.** This means a point lookup at any single level only needs to check one file (found via binary search on file boundaries). L0 is the exception — its files can overlap because they come directly from memtable flushes without rewriting.

## The Compaction Trigger

RocksDB runs compaction when any of these conditions are met:

1. **Level 0 file count exceeds threshold** (`level0_file_num_compaction_trigger`, default 4)
2. **A level's total size exceeds its target** (Level 1 default: 256 MB, each subsequent level is `max_bytes_for_level_multiplier` × previous, default 10×)
3. **Too many delete tombstones** in a file
4. **TTL expiration** or periodic compaction timer fires

The scoring system lives in [`db/version_set.cc`](https://github.com/facebook/rocksdb/blob/main/db/version_set.cc). Each level gets a **compaction score**:

```cpp
// Simplified from VersionStorageInfo::ComputeCompactionScore()
void VersionStorageInfo::ComputeCompactionScore(...) {
  for (int level = 0; level <= max_level; level++) {
    double score;
    if (level == 0) {
      // L0 score based on file count
      score = static_cast<double>(num_l0_files) /
              mutable_cf_options.level0_file_num_compaction_trigger;
    } else {
      // Other levels: score based on size ratio
      score = static_cast<double>(level_bytes) /
              MaxBytesForLevel(level);
    }
    compaction_score_[level] = score;
  }
  // Sort levels by score, highest first
  // A score >= 1.0 means "needs compaction"
}
```

The level with the highest score (and score >= 1.0) gets compacted first. This priority system ensures the most "overflowing" level gets attention first.

```
  Compaction Scoring Example
  ===========================

  Level    Size     Target    Score    Action
  -----    ----     ------    -----    ------
    L0     6 files  4 files   1.50     <-- highest score, compact first
    L1     200 MB   256 MB    0.78     ok
    L2     3.1 GB   2.56 GB   1.21     needs compaction (queued next)
    L3     18 GB    25.6 GB   0.70     ok
    L4     150 GB   256 GB    0.59     ok
```

## Leveled Compaction: The Default Strategy

RocksDB's default compaction style is **Leveled Compaction**. Here is how a single compaction job works, step by step:

### Step 1: Pick Input Files

The compaction picker selects files from the level that triggered compaction (the "input level") and finds overlapping files in the next level (the "output level").

```
  Before Compaction: L1 → L2

  Level 1:  [a---d]  [e---h]  [i---m]  [n---z]
                       ^^^^^
                       picked (e.g., highest write rate or oldest)

  Level 2:  [a--c] [d--f] [g--j] [k--m] [n--p] [q--t] [u--z]
                    ^^^^^  ^^^^^  ^^^^^
                    overlaps with [e---h]: files covering [d..j]
```

The file-picking logic is in [`db/compaction/compaction_picker_level.cc`](https://github.com/facebook/rocksdb/blob/main/db/compaction/compaction_picker_level.cc):

```cpp
// Simplified from LevelCompactionBuilder::PickCompaction()
Compaction* LevelCompactionBuilder::PickCompaction() {
  // 1. Pick the level with highest score
  SetupInitialFiles();

  // 2. Find input files from that level
  //    Strategy: round-robin through files, or pick by
  //    oldest file, or by file with most deletions
  if (!SetupOtherInputsIfNeeded()) {
    return nullptr;
  }

  // 3. Find overlapping files in the output level
  GetOverlappingL1Files();

  return GetCompaction();
}
```

RocksDB uses a **round-robin pointer** (`compact_pointer_`) to avoid re-picking the same file. After compacting a file from L1, the pointer advances so the next compaction starts from where the last one left off. This ensures all files get compacted eventually, not just the hot ones.

### Step 2: Merge-Sort the Inputs

The actual merge happens in [`db/compaction/compaction_job.cc`](https://github.com/facebook/rocksdb/blob/main/db/compaction/compaction_job.cc). RocksDB opens iterators on all input files and runs a **k-way merge**:

```
  K-way Merge (simplified)

  Input iterators (sorted within each file):

  File A (L1):   e:5  f:3  g:8  h:1
  File B (L2):   d:2  e:7  f:9
  File C (L2):   g:4  h:6  i:2  j:3

  Priority queue (min-heap on key, then sequence number):
  ┌─────────────────────────────────────────┐
  │  Merge Iterator                         │
  │                                         │
  │  heap: [d:2, e:5, e:7, f:3, f:9, ...]  │
  │                                         │
  │  Pop smallest key. If duplicate key,    │
  │  keep the one with highest sequence     │
  │  number (newest write wins).            │
  └─────────────────────────────────────────┘

  Output (new L2 files):
  [d:2  e:5  f:3  g:8  h:1  i:2  j:3]
           ^       ^
           e:7     f:9 dropped (older versions, no snapshot needs them)
```

The merge iterator is implemented as a binary heap in [`table/merging_iterator.cc`](https://github.com/facebook/rocksdb/blob/main/table/merging_iterator.cc). Each "child" in the heap is an iterator pointing into one SST file.

### Step 3: Drop Obsolete Entries

During the merge, the compaction filter decides which entries to keep:

```cpp
// Simplified from CompactionIterator::NextFromInput()
void CompactionIterator::NextFromInput() {
  // ...
  if (ikey_.type == kTypeDeletion) {
    // A tombstone. Can we drop it?
    if (bottommost_level_ && no_snapshot_needs_it) {
      // Yes — no older version exists below, and no
      // snapshot references the deleted key
      valid_ = false;  // drop this entry
      return;
    }
  }

  if (ikey_.sequence <= earliest_snapshot_ && has_newer_version) {
    // An overwritten value that no snapshot can see
    valid_ = false;  // drop
    return;
  }
  // Otherwise: keep this entry in the output
}
```

Three things get dropped:
1. **Tombstones at the bottommost level** (nothing below to mask)
2. **Overwritten values** where no active snapshot references the old version
3. **Entries rejected by a custom CompactionFilter** (user-defined TTL, etc.)

### Step 4: Write Output Files and Swap Atomically

The merge output is written as new SST files. Once all output files are written and fsync'd, RocksDB atomically installs them:

```
  Atomic Version Switch
  =====================

  Before:
    Version V7:
      L1: [a-d].sst, [e-h].sst, [i-m].sst, [n-z].sst
      L2: [a-c].sst, [d-f].sst, [g-j].sst, [k-m].sst, ...

  Compaction produces:
    new L2 files: [d-e].sst, [f-g].sst, [h-j].sst

  After (Version V8):
    L1: [a-d].sst, [i-m].sst, [n-z].sst      ← [e-h].sst removed
    L2: [a-c].sst, [d-e].sst, [f-g].sst, [h-j].sst, [k-m].sst, ...
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                    new files replace [d-f].sst and [g-j].sst

  Old files deleted after all readers (snapshots) release them.
```

The swap is recorded in the **MANIFEST** file (a write-ahead log of version edits). If RocksDB crashes mid-compaction, the incomplete output files are simply orphans that get cleaned up on next startup — the old version remains valid.

## Write Amplification: The Central Tradeoff

Every byte written by the user eventually gets rewritten multiple times as it moves through levels. This is **write amplification (WA)**:

```
  Write Amplification in Leveled Compaction
  ==========================================

  User writes 1 byte
       |
       v
  [Memtable] ──flush──> [L0]    1x  (first write to disk)
                          |
                     compact to L1    ~1x  (merge with ~0 existing data if L1 small)
                          |
                     compact to L2    ~10x (L2 is 10x larger, so each L1 byte
                          |                 is merged with ~10 L2 bytes)
                     compact to L3    ~10x
                          |
                          :

  Total WA ≈ 1 + 1 + 10 + 10 + ... ≈ 10 * (num_levels - 1)

  With default settings (7 levels, multiplier 10):
    Theoretical worst case: ~60x
    Typical observed: 10x–30x
```

Why does this matter? SSDs have limited write endurance (typically 1–3 DWPD — Drive Writes Per Day). A 30x write amplification means your application's 100 MB/s write rate becomes 3 GB/s of actual disk writes. This directly impacts SSD lifespan and I/O bandwidth.

## Level 0 → Level 1: The Special Case

L0 compaction is unique because L0 files can overlap. When compacting L0 to L1, RocksDB must include **all L0 files that overlap with the chosen file's key range** (transitively):

```
  L0 File Overlap Expansion

  L0 files (overlapping ranges):
    file1: [a-----f]
    file2: [d---------k]
    file3: [h-----------p]
    file4: [s-------z]

  Pick file1 [a-f] for compaction:
    → file2 [d-k] overlaps with file1
    → file3 [h-p] overlaps with file2
    → file4 [s-z] does NOT overlap
    
  Final L0 input set: {file1, file2, file3}
  Key range: [a-p]
  Must also pull all L1 files overlapping [a-p]
```

This transitive expansion means L0 compactions can be expensive — they may pull in many more files than expected. This is why the `level0_slowdown_writes_trigger` (default 20) and `level0_stop_writes_trigger` (default 36) exist: they apply back-pressure to writers when L0 accumulates too many files, preventing compaction from falling behind.

## Subcompactions: Parallelizing a Single Job

A large compaction (especially L0→L1) can take minutes. RocksDB splits a single compaction job into **subcompactions** that run in parallel:

```
  Subcompaction Parallelism

  Input key range: [a ──────────────────────── z]

  Split into 4 subcompactions:
    Thread 1: [a ─── f]  → output-1.sst
    Thread 2: [g ─── m]  → output-2.sst
    Thread 3: [n ─── s]  → output-3.sst
    Thread 4: [t ─── z]  → output-4.sst

  Each thread runs an independent merge on its key range.
  All finish → single atomic install of all outputs.
```

The split boundaries are chosen using the file boundaries of the output level. Configuration: `max_subcompactions` (default: 1, meaning no parallelism — you must opt in).

The implementation lives in [`db/compaction/compaction_job.cc`](https://github.com/facebook/rocksdb/blob/main/db/compaction/compaction_job.cc):

```cpp
// Simplified from CompactionJob::GenSubcompactionBoundaries()
void CompactionJob::GenSubcompactionBoundaries() {
  // Collect all file boundaries from the output level
  std::vector<Slice> bounds;
  for (auto* f : compaction->output_level_files()) {
    bounds.push_back(f->smallest.user_key());
    bounds.push_back(f->largest.user_key());
  }
  // Pick approximately max_subcompactions evenly-spaced boundaries
  // from the collected set
}
```

## Alternative Strategies: Universal and FIFO

Leveled compaction is the default, but RocksDB offers alternatives:

### Universal Compaction

Instead of distinct levels, all SST files are in a single sorted list ordered by recency. Compaction merges adjacent files when a size ratio condition is met:

```
  Universal Compaction

  Files (newest → oldest):
    R1(2MB)  R2(3MB)  R3(5MB)  R4(8MB)  R5(50MB)

  Rule: compact if size(R[i]) / size(R[i+1]) > size_ratio (default 1%)
  Or if total_files > level0_file_num_compaction_trigger

  Merge R1+R2+R3+R4 → R_new(18MB)
  Result: R_new(18MB)  R5(50MB)
```

**Tradeoff:** Universal compaction has lower write amplification (~2–4x vs. 10–30x for leveled) but higher space amplification (up to 2x because you need space for both input and output files simultaneously) and higher read amplification (more files to check per read).

### FIFO Compaction

Simply deletes the oldest SST files when total size exceeds a threshold. Zero write amplification beyond the initial flush. Used for time-series data where old entries are disposable.

## Rate Limiting: Avoiding I/O Storms

Compaction can starve foreground reads/writes of I/O bandwidth. RocksDB provides a **rate limiter** to cap compaction's disk throughput:

```cpp
// Usage
options.rate_limiter.reset(
  NewGenericRateLimiter(
    100 * 1024 * 1024,  // 100 MB/s max compaction write rate
    100 * 1000,         // refill period (100ms)
    10,                 // fairness factor
    RateLimiter::Mode::kWritesOnly
  )
);
```

The rate limiter uses a **token bucket** algorithm. Compaction threads must acquire tokens before writing; if the bucket is empty, they sleep. This smooths out I/O spikes and keeps read latency predictable.

Additionally, `max_background_compactions` (replaced by `max_background_jobs` in newer versions) limits how many compaction threads run simultaneously. Default is 1, but production deployments often set this to 4–8 on machines with fast SSDs.

## Compaction in TiKV

TiKV (the storage layer of TiDB) uses RocksDB as its engine. It adds a custom `CompactionFilter` to handle MVCC garbage collection:

```
  TiKV Compaction Filter

  Key format in TiKV:
    user_key + timestamp (descending)

  During compaction, the filter checks:
    Is this version older than the GC safe point?
    AND is there a newer version of the same user_key?

    Yes → drop it (GC during compaction, no separate GC pass needed)
    No  → keep it
```

This is called **GC in Compaction Filter** and was introduced in TiKV 5.0. It eliminates the separate GC worker scanning the entire key space, reducing read/write amplification significantly for workloads with many updates.

TiKV configures RocksDB with leveled compaction, `max_bytes_for_level_base = 512MB`, multiplier = 10, and typically 5–7 levels — meaning the bottom level can hold terabytes of data per TiKV instance.

## Monitoring Compaction

RocksDB exposes compaction statistics via `DB::GetProperty()`:

```
rocksdb.stats:
                               Compactions
Level  Files Size   Score Read(GB)  Rn(GB) Rnp1(GB) Write(GB) Wnew(GB) RW-Amp  W-Amp
-----------------------------------------------------------------------------------
  L0     2   15MB    0.5     0.0     0.0     0.0      2.5      2.5     0.0   0.0
  L1     4   200MB   0.8     2.5     2.5     0.0      2.3      2.3     2.0   0.9
  L2    41   2.1GB   0.8    12.3     2.3    10.0     12.1      2.1    10.5   5.3
  L3   400   21GB    0.8    90.1    12.1    78.0     89.5     11.5    14.8   7.4
```

Key metrics to watch:
- **Write-Amp (W-Amp):** actual bytes written / bytes entering this level. High values mean excessive rewriting.
- **Stall counts:** `rocksdb.stall.micros` — time spent throttling writes because compaction can't keep up.
- **Pending compaction bytes:** `rocksdb.estimate-pending-compaction-bytes` — if this grows unboundedly, compaction is falling behind.

## Summary

```
  Compaction at a Glance

  ┌─────────────────────────────────────────────────────────────┐
  │  1. Score levels         (which level is most overdue?)     │
  │  2. Pick files           (round-robin + overlap detection)  │
  │  3. K-way merge-sort     (priority queue on iterators)      │
  │  4. Drop dead entries    (tombstones, old versions)         │
  │  5. Write new SSTs       (split by target_file_size)        │
  │  6. Atomic version swap  (MANIFEST edit)                    │
  │  7. Delete old files     (after all readers release)        │
  └─────────────────────────────────────────────────────────────┘
```

Compaction is the invisible engine that keeps an LSM-tree healthy. It balances three competing goals:

- **Low write amplification** (don't rewrite data too many times)
- **Low space amplification** (don't keep too many obsolete copies)
- **Low read amplification** (don't make reads check too many files)

No single strategy wins on all three. Leveled compaction optimizes for reads at the cost of writes. Universal compaction optimizes for writes at the cost of space. FIFO compaction optimizes for simplicity when data is disposable. Understanding these tradeoffs is key to tuning RocksDB for your workload.

## References

1. RocksDB Wiki: Leveled Compaction [doc](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction)
2. RocksDB Wiki: Universal Compaction [doc](https://github.com/facebook/rocksdb/wiki/Universal-Compaction)
3. RocksDB Wiki: Choose a Compaction Style [doc](https://github.com/facebook/rocksdb/wiki/RocksDB-Tuning-Guide#compaction-style)
4. facebook/rocksdb compaction picker [`db/compaction/compaction_picker_level.cc`](https://github.com/facebook/rocksdb/blob/main/db/compaction/compaction_picker_level.cc)
5. facebook/rocksdb compaction job [`db/compaction/compaction_job.cc`](https://github.com/facebook/rocksdb/blob/main/db/compaction/compaction_job.cc)
6. facebook/rocksdb merging iterator [`table/merging_iterator.cc`](https://github.com/facebook/rocksdb/blob/main/table/merging_iterator.cc)
7. facebook/rocksdb version set [`db/version_set.cc`](https://github.com/facebook/rocksdb/blob/main/db/version_set.cc)
8. TiKV blog: GC in Compaction Filter [blog](https://tikv.org/blog/gc-in-compaction-filter/)
9. The Log-Structured Merge-Tree (O'Neil et al., 1996) [paper](https://www.cs.umb.edu/~poneil/lsmtree.pdf)
10. Mark Callaghan, "Read, Write, and Space Amplification" [slides](http://smalldatum.blogspot.com/2015/11/read-write-space-amplification-pick-2_23.html)
