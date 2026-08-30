---
author: JZ
pubDatetime: 2026-08-30T09:00:00Z
modDatetime: 2026-08-30T09:00:00Z
title: System Design - How Database Buffer Pool Management Works
tags:
  - design-system
  - design-database
description:
  "How database buffer pools work: page abstraction, InnoDB buffer pool architecture, LRU with midpoint insertion, dirty page flushing, adaptive checkpointing, and source code walkthrough from MySQL/InnoDB."
---

## Table of contents

## Context

Every database faces the same fundamental problem: disks are slow, memory is fast, but memory is small. A single random disk read takes about 10 milliseconds on a spinning drive, or 100 microseconds on an SSD. A memory access takes about 100 nanoseconds — that's **1,000x faster** than an SSD and **100,000x faster** than a hard drive.

The **buffer pool** is how databases bridge this gap. It is a region of main memory that caches disk pages so that frequently accessed data can be read from RAM instead of disk. Think of it as the database's own private cache, managed with algorithms tailored for database workloads rather than relying on the operating system's generic page cache.

```
             Speed vs Capacity

  +--------+   ~100 ns     +----------+    ~100 us     +--------+
  |  CPU   |-------------->|  Buffer  |--------------->|  SSD   |
  | Cache  |               |   Pool   |               | Storage|
  | (MB)   |               |  (GB)    |               |  (TB)  |
  +--------+               +----------+               +--------+
      ^                         ^                          ^
      |                         |                          |
   fastest                 managed by                   slowest
   smallest                the database                 largest
                           engine
```

Almost every relational database has one: MySQL/InnoDB calls it the **buffer pool**, PostgreSQL calls it **shared buffers**, Oracle calls it the **buffer cache**, and SQL Server calls it the **buffer pool**. The core ideas are the same across all of them. In this article, we will use InnoDB (MySQL's default storage engine) as our primary example because its source code is open and well-documented.

## The Page Abstraction

Databases do not read or write individual rows. They read and write **pages** (also called blocks). A page is a fixed-size chunk of data, typically 16 KB in InnoDB (8 KB in PostgreSQL, 8 KB in SQL Server).

```
  On Disk (tablespace file)
  +--------+--------+--------+--------+--------+--------+
  | Page 0 | Page 1 | Page 2 | Page 3 | Page 4 | Page 5 | ...
  +--------+--------+--------+--------+--------+--------+
     16KB     16KB     16KB     16KB     16KB     16KB

  Each page contains:
  +--------------------------------------------------+
  | Page Header (38 bytes)                           |
  |   - page number, checksum, LSN, type             |
  +--------------------------------------------------+
  | Record Directory                                 |
  |   - pointers to rows within the page              |
  +--------------------------------------------------+
  | Row Data                                         |
  |   - actual table rows, stored contiguously        |
  |   - each row has a header + column values         |
  +--------------------------------------------------+
  | Free Space                                       |
  |   - available for new rows                        |
  +--------------------------------------------------+
  | Page Trailer (8 bytes)                           |
  |   - checksum for corruption detection             |
  +--------------------------------------------------+
```

Why pages? Because disks are optimized for sequential access and block-sized I/O. Reading one byte from disk costs almost the same as reading 16 KB, since the seek time dominates. By reading a full page at once, the database amortizes the disk access cost across many rows.

Every page in the buffer pool is identified by a **(space_id, page_no)** pair — the tablespace (file) and the offset within that file. This pair is the "address" that the buffer pool uses to look up cached pages.

## Buffer Pool Architecture in InnoDB

InnoDB's buffer pool is a contiguous region of memory allocated at server startup. Its size is controlled by `innodb_buffer_pool_size` (default 128 MB, but production systems typically set it to 70-80% of available RAM).

The buffer pool is organized around three main data structures:

```
  InnoDB Buffer Pool
  +-----------------------------------------------------------+
  |                                                           |
  |  1. Page Hash Table                                       |
  |     (space_id, page_no) --> buf_page_t*                   |
  |     O(1) lookup to find if a page is in memory            |
  |                                                           |
  |  2. LRU List (doubly-linked)                              |
  |     All pages currently in the pool, ordered by recency   |
  |     [head/young] <-> ... <-> [midpoint] <-> ... <-> [tail/old]
  |                                                           |
  |  3. Flush List (doubly-linked)                             |
  |     Only dirty pages, ordered by oldest modification LSN  |
  |     Used to decide which pages to write back to disk      |
  |                                                           |
  |  4. Free List                                              |
  |     Pages not currently in use, available for allocation  |
  |                                                           |
  +-----------------------------------------------------------+
```

When a query needs a page, the process looks like this:

```
  Query: SELECT * FROM users WHERE id = 42

        |
        v
  +------------------+
  | Look up page in  |    hash(space_id, page_no)
  | page hash table  |
  +--------+---------+
           |
     +-----+-----+
     |           |
   found      not found
     |           |
     v           v
  +--------+  +------------------+
  | Return |  | Pick a free page |
  | cached |  | (or evict one)   |
  | page   |  +--------+---------+
  +--------+           |
                       v
              +------------------+
              | Read page from   |
              | disk into the    |
              | free frame       |
              +--------+---------+
                       |
                       v
              +------------------+
              | Insert into hash |
              | table and LRU    |
              +------------------+
```

The source code for this lookup lives in [`storage/innobase/buf/buf0buf.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0buf.cc). The main function is `buf_page_get_gen()`:

```cpp
buf_block_t *buf_page_get_gen(const page_id_t &page_id,
                               const page_size_t &page_size,
                               ulint rw_latch,
                               buf_block_t *guess,
                               Page_fetch mode,
                               ut_location_t location,
                               mtr_t *mtr) {
  buf_pool_t *buf_pool = buf_pool_get(page_id);
  buf_page_t *bpage;

  // Step 1: Try the adaptive hash index (a shortcut for B-tree lookups)
  // Step 2: Look up in the page hash table
  rw_lock_s_lock(&buf_pool->page_hash_latch);
  bpage = buf_page_hash_get_low(buf_pool, page_id);

  if (bpage != nullptr) {
    // Page is in the buffer pool
    // Move it in the LRU list (see below)
    buf_page_make_young_if_needed(bpage);
    // Pin the page, set latch, return
  } else {
    // Page is not in the buffer pool
    // Allocate a free page (or evict), read from disk
    bpage = buf_page_init_for_read(buf_pool, page_id, page_size);
    // Issue async I/O read
    fil_io(IORequest(IORequest::READ), page_id, page_size, ...);
  }
}
```

## The LRU List: Not Your Textbook LRU

A textbook LRU (Least Recently Used) cache puts newly accessed items at the head and evicts from the tail. This works well for general-purpose caches, but it has a critical flaw for databases: **full table scans**.

Imagine a query like `SELECT COUNT(*) FROM large_table`. This reads every page in the table exactly once. With a naive LRU, these one-time-use pages flood the cache and push out frequently accessed pages (like index root pages) that the database actually needs.

InnoDB solves this with a **midpoint insertion strategy**. The LRU list is divided into two sublists:

```
  LRU List with Midpoint Insertion
  (default: 3/8 for new sublist, 5/8 for old sublist)

  Head                                                    Tail
  +----+----+----+----+----+----+----+----+----+----+----+----+
  | P1 | P2 | P3 | P7 | P8 | P4 | P5 | P6 | P9 |P10 |P11 |P12 |
  +----+----+----+----+----+----+----+----+----+----+----+----+
  |<--- young sublist --->|<|<------- old sublist ----------->|
                           |
                       midpoint
                    (new pages land here)

  Promotion rule:
  - A page in the OLD sublist moves to the HEAD of the YOUNG sublist
    only after it has been in the old sublist for at least
    innodb_old_blocks_time (default 1000ms) AND is accessed again.

  Eviction:
  - Pages are evicted from the TAIL (end of old sublist).
```

Here is how this defeats full table scans:

1. A sequential scan reads page after page. Each new page enters at the **midpoint** (start of old sublist).
2. The scan moves to the next page quickly — within milliseconds.
3. Since the page was only in the old sublist for a short time (< `innodb_old_blocks_time`), it **never** gets promoted to the young sublist.
4. As more scan pages arrive, the old scan pages get pushed to the tail and evicted.
5. Meanwhile, the frequently accessed pages in the young sublist remain untouched.

The code for this lives in `buf_page_make_young_if_needed()` in [`storage/innobase/buf/buf0lru.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0lru.cc):

```cpp
void buf_page_make_young_if_needed(buf_page_t *bpage) {
  if (buf_page_peek_if_too_old(bpage)) {
    buf_LRU_make_block_young(bpage);
  }
}

bool buf_page_peek_if_too_old(const buf_page_t *bpage) {
  if (buf_page_is_old(bpage)) {
    // Page is in old sublist
    unsigned access_time = bpage->access_time;
    if (access_time > 0 &&
        (ut_time_monotonic_ms() - access_time) >=
            buf_LRU_old_threshold_ms) {
      // Page has been in old sublist long enough, promote it
      return true;
    }
    return false;
  }
  // Page is in young sublist
  // Only move to head if it's past 1/4 of the young sublist
  // (to reduce mutex contention from frequent moves)
  return buf_page_peek_if_young(bpage);
}
```

The `buf_page_peek_if_young` optimization is worth noting: even within the young sublist, InnoDB does not move a page to the head on every access. It only promotes if the page has drifted past the first quarter of the young sublist. This reduces lock contention on the LRU mutex — a critical optimization under high concurrency.

## Dirty Pages and the Flush List

When a transaction modifies a row, the change is applied to the **in-memory page** in the buffer pool. The page is now "dirty" — its in-memory contents differ from what's on disk. The page is added to the **flush list**.

```
  Write Path

  UPDATE users SET name='Alice' WHERE id=42;

  1. Find the page containing row id=42 in buffer pool
  2. Write the change to the WAL (redo log) on disk  <-- durability
  3. Modify the page in memory                       <-- fast
  4. Add page to flush list if not already there
  5. Return success to the client

  The page is NOT written to disk yet!
  It will be flushed later, asynchronously.

  +--------------------------------------------------+
  |  Flush List (ordered by oldest_modification LSN) |
  |                                                  |
  |  [Page3, LSN=100] -> [Page7, LSN=150] ->        |
  |  [Page1, LSN=200] -> [Page9, LSN=350]           |
  |                                                  |
  |  Flushing starts from the LEFT (oldest)          |
  +--------------------------------------------------+
```

This separation between writing to the WAL and writing to the data file is the **write-ahead logging** pattern (covered in detail in the [WAL article](/posts/design-how-write-ahead-logging-wal-works)). The key insight is:

- **Durability** comes from the WAL (redo log), which is written synchronously at commit time.
- **Performance** comes from batching and deferring the actual data page writes.

The flush list is ordered by the **oldest modification LSN** (Log Sequence Number) of each page. This means the page that has been dirty the longest is at the head. Flushing in LSN order is important for recovery: if the database crashes, it only needs to replay the redo log from the oldest unflushed LSN forward.

## Checkpoint: The Coordination Point

A **checkpoint** marks the point in the redo log up to which all dirty pages have been flushed to disk. After a crash, recovery only needs to replay the redo log starting from the last checkpoint — everything before is already safely on disk.

```
  Redo Log (circular buffer)
  +================================================================+
  |  ...  |  entry  |  entry  |  entry  |  entry  |  entry  | ...  |
  +================================================================+
          ^                              ^                    ^
          |                              |                    |
     checkpoint LSN              oldest dirty page       current LSN
     (safe to overwrite          in flush list           (newest write)
      log before here)
                                 ^
                                 |
                          This is the constraint:
                          checkpoint cannot advance
                          past this point until the
                          page is flushed to disk

  Available log space = total log size - (current LSN - checkpoint LSN)
```

InnoDB's redo log is a **circular buffer**. If the current write position catches up to the checkpoint, the database must stall and flush dirty pages to advance the checkpoint before it can accept more writes. This is the dreaded **checkpoint stall** — a situation you want to avoid in production.

The checkpoint logic lives in [`storage/innobase/log/log0chkp.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/log/log0chkp.cc):

```cpp
void log_checkpoint(log_t &log) {
  // The checkpoint LSN is the oldest modification LSN
  // of any dirty page in any buffer pool instance
  lsn_t oldest_lsn = buf_pool_get_oldest_modification_approx();

  if (oldest_lsn == 0) {
    // No dirty pages, checkpoint at current LSN
    oldest_lsn = log_get_lsn(log);
  }

  // Write checkpoint info to the log file header
  log_files_write_checkpoint(log, oldest_lsn);
}
```

## Adaptive Flushing: Avoiding Checkpoint Stalls

Rather than waiting until the redo log is almost full, InnoDB proactively flushes dirty pages at a rate calibrated to keep the redo log from filling up. This is called **adaptive flushing**.

The algorithm considers several factors:

```
  Adaptive Flushing Decision

  +---------------------+     +---------------------+
  |  Redo log fullness  |     |  Dirty page ratio   |
  |  (how close to      |     |  (dirty pages /     |
  |   catching up to    |     |   total pages)       |
  |   checkpoint?)      |     |                     |
  +----------+----------+     +----------+----------+
             |                           |
             v                           v
      +------+------+            +-------+-------+
      | log_capacity|            | dirty_pct     |
      | urgency     |            | urgency       |
      +------+------+            +-------+-------+
             |                           |
             +--------+    +------------+
                      |    |
                      v    v
              +------------------+
              |  Target flush   |
              |  rate (pages/s) |
              +--------+---------+
                       |
                       v
              +------------------+
              | Page cleaner     |
              | threads execute  |
              | the flushes      |
              +------------------+
```

The core of adaptive flushing is in [`storage/innobase/buf/buf0flu.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0flu.cc). The function `af_get_pct_for_lsn()` computes how urgently pages need to be flushed based on redo log consumption:

```cpp
static ulint af_get_pct_for_lsn(lsn_t age) {
  lsn_t max_async_age = log_get_max_modified_age_async();

  if (age < max_async_age) {
    // Below the async threshold, no urgency
    return 0;
  }

  lsn_t max_age = log_get_max_checkpoint_age();
  // Linear interpolation between 0% and 100% urgency
  // as log age goes from async threshold to max
  double pct = (double)(age - max_async_age) /
               (double)(max_age - max_async_age) * 100.0;
  return std::min((ulint)pct, (ulint)100);
}
```

InnoDB runs **page cleaner threads** (`innodb_page_cleaners`, default 4) that wake up periodically and flush batches of dirty pages. The number of pages flushed per batch is proportional to the urgency computed above. Under light load, flushing is gentle. Under heavy write load, it ramps up to prevent the log from filling.

## Buffer Pool Instances: Scaling on Multi-Core

On a server with a large buffer pool (say 64 GB) and many concurrent queries, the LRU mutex becomes a bottleneck. Every page access potentially needs to update the LRU list, and a single mutex serializes all of them.

InnoDB solves this by splitting the buffer pool into **multiple instances** (`innodb_buffer_pool_instances`, default 8 when pool >= 1 GB):

```
  Buffer Pool with Multiple Instances

  +------------------+  +------------------+  +------------------+
  | Instance 0       |  | Instance 1       |  | Instance 7       |
  |                  |  |                  |  |                  |
  | page_hash        |  | page_hash        |  | page_hash        |
  | LRU list         |  | LRU list         |  | LRU list         |
  | flush list       |  | flush list       |  | flush list       |
  | free list        |  | free list        |  | free list        |
  | LRU mutex        |  | LRU mutex        |  | LRU mutex        |
  | flush mutex      |  | flush mutex      |  | flush mutex      |
  |                  |  |                  |  |                  |
  +------------------+  +------------------+  +------------------+

  Page assignment: instance = page_id.fold() % n_instances

  Each instance has its own mutex, so operations on
  different instances run in parallel.
```

A page is assigned to an instance based on a hash of its page ID. Since different queries typically touch different pages (and therefore different instances), the mutexes rarely contend.

The instance selection code is straightforward:

```cpp
static inline buf_pool_t *buf_pool_get(const page_id_t &page_id) {
  return &buf_pool_ptr[page_id.fold() % srv_buf_pool_instances];
}
```

## The Read-Ahead Optimization

Databases often access pages sequentially (e.g., a range scan on a B-tree leaf level). InnoDB detects this pattern and **prefetches** pages before they are requested:

```
  Linear Read-Ahead

  Buffer pool access pattern:
  ... Page 10, Page 11, Page 12, Page 13 (sequential!)

  InnoDB thinks: "This looks like a sequential scan.
  I'll prefetch Pages 14-77 (one extent = 64 pages)
  in the background before the query asks for them."

  +--------+--------+--------+--------+--------+--------+
  | Pg 10  | Pg 11  | Pg 12  | Pg 13  | Pg 14  | ...    |
  +--------+--------+--------+--------+--------+--------+
  |<-- already read by query -->|<-- prefetched by -->|
                                    read-ahead
```

The threshold is controlled by `innodb_read_ahead_threshold` (default 56). If 56 out of the 64 pages in an extent have been accessed sequentially, InnoDB triggers an asynchronous read of the next extent.

There is also **random read-ahead**: if 13 or more pages from the same extent are found in the buffer pool (regardless of access order), InnoDB prefetches the remaining pages of that extent. This helps workloads with random-but-clustered access patterns.

## Buffer Pool in Practice

Here are the key monitoring metrics for InnoDB buffer pool health:

```sql
-- Buffer pool utilization
SHOW ENGINE INNODB STATUS\G

-- Key metrics from INNODB_BUFFER_POOL_STATS:
SELECT
  pool_id,
  pool_size * 16 / 1024 AS pool_size_mb,
  free_buffers,
  database_pages,
  modified_db_pages AS dirty_pages,
  ROUND(100 * database_pages / pool_size, 1) AS pct_used,
  ROUND(100 * modified_db_pages / database_pages, 1) AS pct_dirty,
  pages_read,
  pages_written,
  hit_rate / 1000 AS hit_rate_pct
FROM information_schema.INNODB_BUFFER_POOL_STATS;
```

A healthy buffer pool typically shows:

| Metric | Healthy range |
|--------|---------------|
| Hit rate | > 99% |
| Dirty page ratio | < 75% |
| Free buffers | > 0 (not starved) |
| Pages evicted/sec | Low and steady |

If your hit rate drops below 99%, your buffer pool is likely too small for your working set. If dirty pages exceed 75%, your flush rate may not keep up with write throughput, risking checkpoint stalls.

## How Buffer Pools Differ: PostgreSQL vs InnoDB

PostgreSQL takes a different approach worth comparing:

```
  InnoDB                          PostgreSQL
  +--------------------------+    +--------------------------+
  | Buffer pool manages      |    | Shared buffers +         |
  | its own pages directly   |    | OS page cache cooperate  |
  | (bypasses OS page cache  |    | (double-buffering by     |
  |  with O_DIRECT on Linux) |    |  design)                 |
  +--------------------------+    +--------------------------+
  | LRU with midpoint        |    | Clock-sweep algorithm    |
  | insertion                |    | (approximation of LRU)   |
  +--------------------------+    +--------------------------+
  | Multiple instances for   |    | Single shared buffer     |
  | concurrency              |    | with per-page pin/locks  |
  +--------------------------+    +--------------------------+
  | Dirty pages tracked by   |    | Dirty pages tracked by   |
  | flush list (LSN order)   |    | bgwriter + checkpointer  |
  +--------------------------+    +--------------------------+
```

PostgreSQL's **clock-sweep** algorithm is simpler: each buffer frame has a usage counter. The sweep hand rotates through frames; if usage > 0, it decrements and moves on. If usage == 0, the page is evicted. This approximates LRU without maintaining an explicit linked list, reducing lock contention at the cost of less precise eviction ordering.

PostgreSQL also relies more heavily on the OS page cache. Setting `shared_buffers` to 25% of RAM is typical (vs 70-80% for InnoDB), because PostgreSQL expects the OS to cache the rest. InnoDB bypasses the OS cache with `O_DIRECT`, taking full control of caching decisions.

## Recovery: Putting It All Together

When a database crashes and restarts, the buffer pool is empty (it was in RAM, which is volatile). Here is how InnoDB recovers:

```
  Crash Recovery

  1. Read checkpoint LSN from redo log header
     "Everything before LSN 50000 is safely on disk"

  2. Scan redo log from checkpoint LSN to end
     "Found entries for LSN 50001 through 75000"

  3. For each redo log entry:
     a. Read the target page from disk into buffer pool
     b. If page LSN < redo entry LSN:
        Apply the redo entry (page was stale)
     c. If page LSN >= redo entry LSN:
        Skip (page was already flushed before crash)

  4. After all redo entries applied:
     Buffer pool contains the same state as before crash
     (minus any uncommitted transactions, handled by undo log)

     +-------------------------------------------+
     |  Time saved by checkpoints:               |
     |                                           |
     |  Without: replay ALL redo from beginning  |
     |  With:    replay only from last checkpoint |
     |           (typically seconds of log)       |
     +-------------------------------------------+
```

This is why the flush list ordering matters: by flushing oldest-dirty-first, InnoDB advances the checkpoint LSN as quickly as possible, minimizing the amount of redo log that must be replayed after a crash.

## Summary

The buffer pool is the bridge between fast memory and slow storage. Its design reflects decades of database engineering wisdom:

```
  Design Decision                  Why
  ----------------------------    ----------------------------
  Page-based I/O                  Matches disk block size,
                                  amortizes seek cost

  Midpoint LRU insertion          Protects hot pages from
                                  full table scan pollution

  Old block time threshold        One-time reads never
                                  pollute the young sublist

  Flush list ordered by LSN       Advances checkpoint as
                                  fast as possible

  Adaptive flushing               Prevents checkpoint stalls
                                  under heavy write load

  Multiple buffer pool instances  Reduces mutex contention
                                  on multi-core systems

  Read-ahead prefetching          Exploits sequential access
                                  patterns for I/O overlap
```

Every major database implements these ideas in some form. Understanding the buffer pool helps you tune your database (sizing, dirty page thresholds, flush rates) and diagnose performance issues (low hit rates, checkpoint stalls, LRU contention).

## References

1. MySQL InnoDB Buffer Pool documentation [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool.html)
2. MySQL InnoDB buffer pool source [`storage/innobase/buf/buf0buf.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0buf.cc)
3. MySQL InnoDB LRU source [`storage/innobase/buf/buf0lru.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0lru.cc)
4. MySQL InnoDB flush source [`storage/innobase/buf/buf0flu.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/buf/buf0flu.cc)
5. MySQL InnoDB checkpoint source [`storage/innobase/log/log0chkp.cc`](https://github.com/mysql/mysql-server/blob/trunk/storage/innobase/log/log0chkp.cc)
6. PostgreSQL Buffer Manager documentation [doc](https://www.postgresql.org/docs/current/storage-buffer.html)
7. PostgreSQL Clock-sweep algorithm, `src/backend/storage/buffer/freelist.c` [source](https://github.com/postgres/postgres/blob/master/src/backend/storage/buffer/freelist.c)
8. InnoDB Buffer Pool configuration [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool-resize.html)
9. Goetz Graefe, "The Five-Minute Rule" updates [paper](https://dl.acm.org/doi/10.1145/1363189.1363198)
