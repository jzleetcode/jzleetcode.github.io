---
author: JZ
pubDatetime: 2026-06-13T08:00:00Z
modDatetime: 2026-06-13T08:00:00Z
title: System Design - How Prometheus TSDB (Time-Series Database) Works
tags:
  - design-system
  - design-database
description:
  "How Prometheus stores time-series data: the in-memory head block, Write-Ahead Log, chunk encoding, compaction into persistent blocks, and how queries traverse the layered architecture. Source code walkthrough from the prometheus/prometheus repository."
---

## Table of contents

## Context

Monitoring systems need to answer questions like "what was the CPU usage of service X over the last hour?" or "how many requests per second hit endpoint Y yesterday?" These questions require storing **time-series data** — sequences of (timestamp, value) pairs associated with a metric name and labels.

Prometheus is the most widely adopted open-source monitoring system. It **scrapes** metrics from targets (your services) at regular intervals (default 15 seconds), stores the data locally, and serves queries via its PromQL language. The storage engine that makes this possible is called the **TSDB** (Time-Series Database).

The TSDB design was introduced in Prometheus 2.0 (2017), replacing the earlier per-series files approach. It draws inspiration from ideas in LSM trees (log-structured merge) and columnar databases, adapted for the specific access patterns of monitoring data: high write throughput of many concurrent series, append-only, and queries that scan contiguous time ranges.

```
              Prometheus Architecture (simplified)

  +-----------+   +-----------+   +-----------+
  |  Service  |   |  Service  |   |  Service  |   your applications
  |  /metrics |   |  /metrics |   |  /metrics |   expose metrics
  +-----+-----+   +-----+-----+   +-----+-----+
        |               |               |
        +-------+-------+-------+-------+
                |               |
                v               v
         +-----------------------------+
         |        Prometheus           |
         |                             |
         |  +-------+   +-----------+  |
         |  | Scrape|   |  PromQL   |  |
         |  | Loop  |   |  Engine   |  |
         |  +---+---+   +-----+-----+  |
         |      |              |        |
         |      v              v        |
         |  +----------------------+    |
         |  |        TSDB          |    |
         |  |  (the storage layer) |    |
         |  +----------------------+    |
         +-----------------------------+

  Writes: up to millions of samples/sec
  Reads: range queries over hours/days
```

Let's dig into how the TSDB actually stores and retrieves this data.

## The Two-Layer Storage Model

Prometheus TSDB divides time into **blocks**, each covering a fixed time range (default 2 hours). At any moment, there are two kinds of storage:

1. **Head block** — the current, mutable in-memory block receiving live writes.
2. **Persistent blocks** — older, immutable, on-disk blocks that have been "cut" from the head.

```
  Time -->
  |<-- 2h -->|<-- 2h -->|<-- 2h -->|<-- ongoing -->|
  +-----------+-----------+-----------+--------------+
  |  Block 1  |  Block 2  |  Block 3  |    Head     |
  |  (disk)   |  (disk)   |  (disk)   |  (memory)   |
  | immutable | immutable | immutable |   mutable    |
  +-----------+-----------+-----------+--------------+
```

When the head block covers more than the configured range (2 hours), Prometheus "cuts" it — serializes the data to disk as a new persistent block, and the head starts fresh. This is similar to how an LSM tree flushes its memtable to an SSTable.

## The Head Block: Where Writes Land

Every scraped sample first enters the **head block**. The head is an in-memory data structure optimized for concurrent appends from many series simultaneously.

### Series and Chunks

Each unique combination of metric name + labels is a **series**. For example, `http_requests_total{method="GET", handler="/api"}` is one series. The head maintains a hash map from label sets to series objects:

```
  Head Block
  +---------------------------------------------------+
  |                                                   |
  |  seriesHashMap                                    |
  |  +---------------------------------------------+ |
  |  | hash(labels) --> *memSeries                  | |
  |  |                                              | |
  |  |  "http_requests{method=GET}" --> series_1    | |
  |  |  "http_requests{method=POST}" --> series_2   | |
  |  |  "node_cpu_seconds{cpu=0}" --> series_3      | |
  |  |  ...                                         | |
  |  +---------------------------------------------+ |
  |                                                   |
  |  Each memSeries:                                  |
  |  +-------------------+                            |
  |  | labels            |                            |
  |  | ref (series ID)   |                            |
  |  | headChunk ------->+--> active chunk (XOR enc)  |
  |  | prevChunks []     |    being appended to       |
  |  +-------------------+                            |
  +---------------------------------------------------+
```

Each `memSeries` holds a chain of **chunks**. A chunk is a compressed buffer of (timestamp, value) pairs for a contiguous time range. The active chunk (called `headChunk`) accepts new appends. When it's full or has covered enough time (~120 samples or 2 hours range within the head), a new chunk starts.

### The Appender Interface

Writes go through the `Appender` interface defined in [`tsdb/db.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/db.go):

```go
type Appender interface {
    Append(ref storage.SeriesRef, l labels.Labels, t int64, v float64) (storage.SeriesRef, error)
    Commit() error
    Rollback() error
}
```

A typical write cycle:
1. The scrape loop collects all samples from one target.
2. It opens an `Appender` from the head.
3. It calls `Append()` for each sample — the sample is buffered.
4. It calls `Commit()` — all buffered samples are written to the WAL and then applied to the in-memory chunks atomically.

The `ref` (series reference) is a uint64 that acts as a fast lookup shortcut. On the first append for a series, you pass `0` and get back a reference. Subsequent appends reuse this reference to skip label hashing.

### Chunk Encoding: XOR Compression

Raw time-series data is highly compressible because adjacent samples tend to have similar timestamps (regular scrape intervals) and similar values (metrics don't jump wildly). Prometheus uses a **double-delta XOR encoding** inspired by Facebook's Gorilla paper (2015).

The idea for values:

```
  Sample values:   100.5   100.7   100.6   100.8   100.5

  XOR with previous:
    100.5 XOR 100.7 = small number (few bits differ)
    100.7 XOR 100.6 = small number
    ...

  Instead of storing 64-bit floats, store:
    - First value: full 64 bits
    - Subsequent: XOR with previous, then store only the meaningful bits
```

For timestamps:

```
  Timestamps (ms):  1000  1015  1030  1045  1060

  Delta:                   15    15    15    15
  Delta-of-delta:           0     0     0     0

  If delta-of-delta is 0: store a single "0" bit
  Regular scrape intervals --> almost all deltas are identical
  --> almost all delta-of-deltas are 0
  --> 1 bit per sample for timestamps!
```

This encoding achieves roughly **1.37 bytes per sample** on typical monitoring data, down from 16 bytes (8 for timestamp + 8 for value). The implementation lives in [`tsdb/chunkenc/xor.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunkenc/xor.go):

```go
func (a *xorAppender) Append(t int64, v float64) {
    if a.numSamples == 0 {
        // First sample: store full timestamp and value
        a.b.WriteBits(uint64(t), 64)
        a.b.WriteBits(math.Float64bits(v), 64)
    } else {
        a.writeTimestamp(t)
        a.writeValue(v)
    }
    a.numSamples++
    a.t = t
    a.v = v
}

func (a *xorAppender) writeValue(v float64) {
    vDelta := math.Float64bits(v) ^ math.Float64bits(a.v)

    if vDelta == 0 {
        // Same value as previous: store single 0 bit
        a.b.WriteBit(zero)
        return
    }
    // ... store leading zeros, meaningful bits, trailing zeros
}
```

## The Write-Ahead Log (WAL)

The head block is in memory. If Prometheus crashes, all recent data would be lost. The **WAL** (Write-Ahead Log) solves this — every sample is written to a sequential log file on disk *before* being applied to memory.

```
  Write Path

  Scrape loop
       |
       v
  +----------+     +------------------+
  | Appender |---->|  WAL (on disk)   |  sequential writes
  | .Commit()|     |  segments/       |  (fast, append-only)
  +----+-----+     |    000001        |
       |           |    000002        |
       v           |    000003        |
  +----------+     +------------------+
  |   Head   |
  | (memory) |
  +----------+
```

The WAL is a directory of numbered **segment files** (default 128MB each). Each segment contains a sequence of records:

- **Series records:** map a new series reference to its label set.
- **Sample records:** a batch of (ref, timestamp, value) tuples.
- **Tombstone records:** mark deleted time ranges.

On startup after a crash, Prometheus **replays** the WAL from the last checkpoint to reconstruct the head block. The implementation is in [`tsdb/wlog/wlog.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/wlog/wlog.go):

```go
func (w *WL) Log(recs ...[]byte) error {
    w.mtx.Lock()
    defer w.mtx.Unlock()

    for _, rec := range recs {
        // If current segment is full, cut a new one
        if w.curN > w.segmentSize {
            if err := w.cut(); err != nil {
                return err
            }
        }
        // Write record with length prefix and CRC
        if err := w.log(rec); err != nil {
            return err
        }
    }
    return nil
}
```

### WAL Checkpointing

The WAL grows continuously. To prevent unbounded growth, Prometheus periodically creates **checkpoints** — compressed snapshots of the still-relevant series data. After a checkpoint, older WAL segments are deleted:

```
  Before checkpoint:
  WAL/
    000001  (contains series + samples for old data)
    000002
    000003
    000004  (most recent)

  After checkpoint at segment 2:
  WAL/
    checkpoint.00002/  (compressed snapshot of live series from 000001-000002)
    000003
    000004

  Segments 000001 and 000002 are deleted.
```

## Persistent Blocks: On-Disk Format

When the head block is cut, its data is serialized into an immutable **block** on disk. Each block is a directory with this structure:

```
  data/
  +-- 01BKGV7JC0RY8A6MACW02A2PJD/     <-- block ULID
  |   +-- meta.json                     <-- time range, stats
  |   +-- index                         <-- label index + postings
  |   +-- chunks/
  |   |   +-- 000001                    <-- chunk data files
  |   +-- tombstones                    <-- deleted ranges
  +-- 01BKGTZQ1SYQJTR4PB43C8PD98/
  |   +-- ...
  +-- wal/
      +-- ...
```

### The Index File

The index file is the critical piece for query performance. It maps label names/values to series, and series to their chunk locations. Its structure:

```
  Index File Layout
  +------------------+
  |  Symbol Table    |  all unique strings (metric names, label values)
  +------------------+
  |  Series          |  sorted list of (labels, chunk_refs[])
  +------------------+
  |  Label Indices   |  for each label name: sorted list of values
  +------------------+
  |  Postings        |  for each label pair: sorted list of series IDs
  +------------------+
  |  Postings        |
  |  Offset Table    |  lookup: label pair --> offset in postings section
  +------------------+
  |  TOC (trailer)   |  offsets to each section above
  +------------------+
```

**Postings** are the key concept. A posting list for `job="api"` contains the sorted IDs of every series with that label. To resolve a query like `{job="api", method="GET"}`, Prometheus:

1. Loads the posting list for `job="api"` → `[1, 3, 5, 7, 9, ...]`
2. Loads the posting list for `method="GET"` → `[2, 3, 6, 7, 10, ...]`
3. Intersects them → `[3, 7, ...]`
4. For each resulting series ID, reads the chunk references to find the actual data.

This is the same inverted-index approach that search engines use. The implementation is in [`tsdb/index/index.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/index/index.go).

### Chunk Files

Chunk files store the actual compressed sample data. Each chunk is preceded by a small header:

```
  Chunk file format:
  +--------+--------+----------+---------+
  | series | mint   | maxt     | encoded |
  | ref    | (int64)| (int64)  | data    |
  | (var)  |        |          | (XOR)   |
  +--------+--------+----------+---------+
  | next chunk...                         |
  +---------------------------------------+
```

The index stores references that point directly into these files (file number + byte offset), so reading a chunk requires a single seek.

## Compaction: Merging Blocks

Over time, Prometheus accumulates many small 2-hour blocks. **Compaction** merges adjacent blocks into larger ones, reducing the number of blocks to scan during queries and enabling better compression.

```
  Before compaction:
  |<-2h->|<-2h->|<-2h->|<-2h->|<-2h->|<-2h->|
  +------+------+------+------+------+------+
  | Blk1 | Blk2 | Blk3 | Blk4 | Blk5 | Blk6 |
  +------+------+------+------+------+------+

  After compaction (exponential growth):
  |<-------6h-------->|<-------6h-------->|
  +-------------------+-------------------+
  | Compacted Block A | Compacted Block B |
  +-------------------+-------------------+

  Further:
  |<-----------12h----------->|
  +---------------------------+
  | Compacted Block C         |
  +---------------------------+
```

The compaction strategy uses an exponential scheme — the default progression is 2h → 6h → 18h → 54h, capped at 10% of the retention window. This is defined in [`tsdb/compact.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/compact.go):

```go
func ExponentialBlockRanges(minSize int64, steps, stepSize int) []int64 {
    ranges := make([]int64, steps)
    ranges[0] = minSize
    for i := 1; i < steps; i++ {
        ranges[i] = ranges[i-1] * int64(stepSize)
    }
    return ranges
}
```

During compaction, the engine:
1. Merges the index files (union of postings, combined series).
2. Re-encodes chunks for the merged time range.
3. Applies tombstones (removes deleted data permanently).
4. Writes a new block directory.
5. Atomically swaps the old blocks for the new one (by updating `meta.json` and removing old directories).

## Query Path: How Reads Work

A PromQL query like `rate(http_requests_total{job="api"}[5m])` triggers this sequence:

```
  PromQL Engine
       |
       | 1. Determine time range [now-5m, now]
       v
  +------------------+
  |   DB.Querier()   |  returns a Querier spanning all relevant blocks
  +--------+---------+
           |
           | 2. Find which blocks overlap the time range
           v
  +--------+---------+----------+
  | Block A Querier  | Head     |
  | (disk)           | Querier  |
  +--------+---------+----+-----+
           |              |
           | 3. Each querier resolves label matchers via postings
           v              v
  +----------------+  +----------------+
  | Posting lists  |  | Posting lists  |
  | intersect      |  | intersect      |
  | --> series IDs |  | --> series IDs |
  +-------+--------+  +-------+--------+
          |                    |
          | 4. Load chunks for matching series in time range
          v                    v
  +----------------+  +----------------+
  | Chunk iterator |  | Chunk iterator |
  | (from disk)    |  | (from memory)  |
  +-------+--------+  +-------+--------+
          |                    |
          +--------+-----------+
                   |
                   | 5. Merge iterators (time-ordered)
                   v
          +------------------+
          | MergedSeriesSet  |
          +--------+---------+
                   |
                   | 6. Apply PromQL function (rate, sum, etc.)
                   v
              Query Result
```

The key insight: each block is self-contained with its own index. The query engine creates a **querier** per block, each independently resolves label matchers to series, then results are merged. This means queries scale with the number of blocks that overlap the time range, not the total data size.

The implementation in [`tsdb/querier.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/querier.go):

```go
func (db *DB) Querier(mint, maxt int64) (storage.Querier, error) {
    var blocks []BlockReader
    for _, b := range db.blocks {
        if b.OverlapsClosedInterval(mint, maxt) {
            blocks = append(blocks, b)
        }
    }
    // Always include the head for recent data
    blocks = append(blocks, db.head)

    var queriers []storage.Querier
    for _, b := range blocks {
        q, err := NewBlockQuerier(b, mint, maxt)
        if err != nil {
            return nil, err
        }
        queriers = append(queriers, q)
    }
    return storage.NewMergeQuerier(queriers...), nil
}
```

## Memory-Mapping: Balancing Memory and Disk

Not all chunk data stays in memory. Prometheus **memory-maps** older chunks from the head block to reduce RAM usage. The head keeps:

- The **active chunk** per series in memory (being appended to).
- Older chunks are flushed to a memory-mapped file and accessed on demand via `mmap`.

```
  memSeries lifecycle:

  Time -->
  +----------+----------+----------+----------+
  | chunk 1  | chunk 2  | chunk 3  | chunk 4  |  (active)
  | mmapped  | mmapped  | mmapped  | in-memory |
  +----------+----------+----------+----------+
       |          |          |
       v          v          v
  +----------------------------------+
  |  chunks_head/                    |
  |    000001 (mmap'd file)          |
  +----------------------------------+
```

This means a series with months of data in the head's time range only consumes memory for the most recent chunk (~120 samples). The mmapped chunks are in the kernel's page cache — accessed if queried, evicted under memory pressure. Implementation in [`tsdb/chunks/head_chunks.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunks/head_chunks.go).

## Handling High Cardinality

**Cardinality** — the number of unique time series — is the primary scaling challenge. Each series needs an entry in the head's hash map, a posting list entry, and index space. Prometheus tracks this via the `prometheus_tsdb_head_series` metric.

The `stripeSeries` structure in [`tsdb/head.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/head.go) shards the series map across 128 stripes to reduce lock contention:

```go
const defaultStripeSize = 128

type stripeSeries struct {
    series [defaultStripeSize]map[chunks.HeadSeriesRef]*memSeries
    hashes [defaultStripeSize]seriesHashmap
    locks  [defaultStripeSize]sync.RWMutex
}
```

When a scrape target exposes 100,000 series and you have 50 targets, that's 5 million series — each needing hash map entries, chunk buffers, and WAL records. The practical limit on commodity hardware is roughly **10 million active series** before memory and CPU become bottlenecks.

## Retention and Deletion

Prometheus supports two retention modes:

- **Time-based** (default 15 days): blocks whose `maxTime` is older than the retention period are deleted.
- **Size-based**: when total block size exceeds the configured limit, oldest blocks are removed first.

Deletion happens at block granularity — entire block directories are removed. For deleting specific series within a block's time range, Prometheus writes **tombstones** rather than rewriting the block. The tombstones are applied during queries (skipping matching ranges) and permanently removed during the next compaction.

## Performance Characteristics

| Operation | Performance |
|-----------|-------------|
| Write (append) | ~1-2 million samples/sec on SSD |
| WAL write | Sequential, ~500MB/s on NVMe |
| Query (recent data) | Microseconds (in-memory head) |
| Query (historical) | Depends on block count + disk IOPS |
| Compaction | Background, ~100MB/s throughput |
| Storage per sample | ~1.3-1.7 bytes (XOR compressed) |
| Series lookup | O(1) hash map (head), O(log n) index (blocks) |

The write path is extremely fast because:
1. Appends are in-memory (just incrementing a chunk buffer).
2. WAL writes are sequential (SSDs excel at this).
3. No per-sample disk sync (WAL segments are fsynced periodically, not per write).

The trade-off: a crash can lose the last few seconds of data (between WAL fsyncs). For monitoring, this is acceptable.

## How It All Fits Together

Here is the complete lifecycle of a sample:

```
  1. Scrape target --> sample (timestamp, value, labels)
                          |
  2. Appender.Append()    |
                          v
  3. WAL.Log()       +----------+
     (disk, seq)     |   WAL    |  crash safety
                     +----------+
                          |
  4. Head.append()        v
     (memory)        +----------+
                     |   Head   |  serves recent queries
                     | memSeries|
                     |  chunks  |
                     +----+-----+
                          |
  5. After 2h:           v          head "cut"
                     +----------+
                     | Block    |  immutable on disk
                     | (index + |
                     |  chunks) |
                     +----+-----+
                          |
  6. Compaction:         v          merge small blocks
                     +----------+
                     | Larger   |
                     | Block    |
                     +----------+
                          |
  7. Retention:          v          delete old blocks
                        [gone]
```

## References

1. Prometheus TSDB design doc, Fabian Reinartz (2017) [blog](https://fabxc.org/tsdb/)
2. Gorilla: A Fast, Scalable, In-Memory Time Series Database (Facebook, 2015) [paper](https://www.vldb.org/pvldb/vol8/p1816-teller.pdf)
3. prometheus/prometheus TSDB implementation [`tsdb/`](https://github.com/prometheus/prometheus/tree/main/tsdb)
4. Head block implementation [`tsdb/head.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/head.go)
5. XOR chunk encoding [`tsdb/chunkenc/xor.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunkenc/xor.go)
6. Write-Ahead Log [`tsdb/wlog/wlog.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/wlog/wlog.go)
7. Block compaction [`tsdb/compact.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/compact.go)
8. Index file format [`tsdb/docs/format/index.md`](https://github.com/prometheus/prometheus/blob/main/tsdb/docs/format/index.md)
9. Prometheus storage documentation [doc](https://prometheus.io/docs/prometheus/latest/storage/)
