---
author: JZ
pubDatetime: 2026-06-14T06:23:00Z
modDatetime: 2026-06-14T06:23:00Z
title: System Design - How the Linux Page Cache Works
tags:
  - design-system
  - design-database
description:
  "How the Linux page cache works: the kernel's transparent caching layer that sits between applications and disk. Covers address_space, radix tree (xarray), readahead, dirty page writeback, memory pressure eviction, and source code walkthrough from the Linux kernel."
---

## Table of contents

## Context

Every time you read a file, the data does not necessarily come from disk. The Linux kernel keeps recently-accessed file data in RAM — a mechanism called the **page cache**. If you read the same file twice, the second read is served entirely from memory, costing microseconds instead of milliseconds.

This is not optional or application-controlled. The page cache operates transparently inside the kernel: applications call `read()` and `write()` as usual, and the kernel decides whether to serve from cache or go to disk. This single mechanism is why:

- A `grep` over a large file is fast the second time you run it.
- Databases like PostgreSQL, MySQL, and RocksDB interact heavily with the page cache (or deliberately bypass it with `O_DIRECT`).
- A machine with 64 GB of RAM might show only 4 GB "used" but 50 GB "cached" — that 50 GB is the page cache.

```
  Application Layer
  +------------------+   +------------------+   +------------------+
  |   PostgreSQL     |   |     grep         |   |     RocksDB      |
  |   (buffered I/O) |   |   (read())       |   |   (O_DIRECT or   |
  |                  |   |                   |   |    buffered)     |
  +--------+---------+   +--------+---------+   +--------+---------+
           |                      |                      |
           |  read()/write()      |                      |
           v                      v                      v
  +----------------------------------------------------------------+
  |                    Virtual File System (VFS)                    |
  +----------------------------------------------------------------+
           |
           v
  +----------------------------------------------------------------+
  |                      Page Cache                                 |
  |                                                                |
  |   +--------+  +--------+  +--------+  +--------+  +--------+  |
  |   | page 0 |  | page 1 |  | page 2 |  | page 3 |  | page 4 |  |
  |   | (4 KB) |  | (4 KB) |  | (4 KB) |  | (4 KB) |  | (4 KB) |  |
  |   +--------+  +--------+  +--------+  +--------+  +--------+  |
  |                                                                |
  +----------------------------------------------------------------+
           |
           |  (cache miss: fetch from disk)
           v
  +----------------------------------------------------------------+
  |              Block Layer / Filesystem (ext4, xfs)               |
  +----------------------------------------------------------------+
           |
           v
  +----------------------------------------------------------------+
  |                         Disk (SSD/HDD)                         |
  +----------------------------------------------------------------+
```

The page cache makes the entire I/O stack faster without any application changes. Let's look at how it is organized internally.

## Pages: The Unit of Caching

The page cache operates in **pages** — fixed-size chunks of memory, typically 4 KB on x86-64 (matching the CPU's memory management unit page size). Every cached file region maps to one or more `struct page` objects in the kernel:

```c
// include/linux/mm_types.h (simplified)
struct page {
    unsigned long flags;        // PG_dirty, PG_locked, PG_uptodate, etc.
    struct address_space *mapping;  // which file this page belongs to
    pgoff_t index;              // page offset within the file
    atomic_t _refcount;         // reference count
    struct list_head lru;       // for LRU eviction lists
    // ... many more fields via unions
};
```

Key flags that control page cache behavior:

| Flag | Meaning |
|------|---------|
| `PG_uptodate` | Page contents match what's on disk (or are newer) |
| `PG_dirty` | Page was modified; must be written back to disk |
| `PG_locked` | Page is being read from disk or written back |
| `PG_writeback` | Page is currently being flushed to disk |
| `PG_referenced` | Page was accessed recently (used by eviction) |

## The address_space: Connecting Files to Pages

Each open file (technically, each inode) has an `address_space` structure that acts as the index for its cached pages:

```c
// include/linux/fs.h (simplified)
struct address_space {
    struct inode *host;           // the inode this cache belongs to
    struct xarray i_pages;       // the page index (radix tree / xarray)
    atomic_t i_mmap_writable;    // count of writable mmap users
    gfp_t gfp_mask;             // allocation flags for new pages
    unsigned long nrpages;       // number of cached pages
    const struct address_space_operations *a_ops;  // filesystem callbacks
    // ...
};
```

The `i_pages` field is the heart of the lookup. It is an **xarray** (extended array) — a radix-tree-based data structure that maps a page index (file offset / page size) to the corresponding `struct page`:

```
  address_space for /var/log/syslog
  +--------------------------------------------------+
  |  i_pages (xarray)                                |
  |                                                  |
  |  index 0 --> struct page (bytes 0-4095)          |
  |  index 1 --> struct page (bytes 4096-8191)       |
  |  index 2 --> (empty -- not cached yet)           |
  |  index 3 --> struct page (bytes 12288-16383)     |
  |  index 4 --> struct page (bytes 16384-20479)     |
  |  ...                                             |
  +--------------------------------------------------+
```

The xarray provides $O(\log n)$ lookup by file offset, where the branching factor is large (64 entries per node), making it effectively constant-time for practical file sizes.

## The Read Path: What Happens When You Call read()

When an application calls `read(fd, buf, 4096)`, here is the path through the kernel:

```
  read(fd, buf, 4096)
       |
       v
  vfs_read()
       |
       v
  filemap_read()                    <-- the page cache read path
       |
       +-- filemap_get_pages()
       |       |
       |       +-- filemap_get_read_batch()
       |       |       |
       |       |       +-- find pages in xarray
       |       |       |
       |       |       +-- CACHE HIT?
       |       |               |
       |       |          yes: return page directly
       |       |          no:  allocate new page
       |       |               |
       |       |               v
       |       |         filemap_create_folio()
       |       |               |
       |       |               v
       |       |         filemap_read_folio()
       |       |               |
       |       |               v
       |       |         a_ops->readahead() or a_ops->read_folio()
       |       |               |
       |       |               v
       |       |         submit_bio() --> disk I/O
       |       |               |
       |       |         wait for I/O completion
       |       |               |
       |       |         set PG_uptodate
       |       |
       |       +-- return pages[]
       |
       +-- copy_page_to_iter()   <-- copy from kernel page to user buffer
       |
       v
  return bytes_read
```

The core implementation lives in [`mm/filemap.c`](https://github.com/torvalds/linux/blob/master/mm/filemap.c). Here is the simplified lookup logic:

```c
// mm/filemap.c (simplified from filemap_get_pages)
static int filemap_get_pages(struct kiocb *iocb, size_t count,
                             struct folio_batch *fbatch) {
    struct address_space *mapping = iocb->ki_filp->f_mapping;
    pgoff_t index = iocb->ki_pos >> PAGE_SHIFT;

    // Try to find the page in the cache
    filemap_get_read_batch(mapping, index, last_index, fbatch);

    if (folio_batch_count(fbatch) == 0) {
        // Cache miss: allocate a new folio and read from disk
        struct folio *folio = filemap_create_folio(iocb, mapping, index);
        filemap_read_folio(iocb, mapping->a_ops->read_folio, folio);
    }

    // Wait for any in-progress I/O to complete
    filemap_update_page(iocb, mapping, fbatch);
    return 0;
}
```

A **folio** (introduced in Linux 5.16) is a wrapper around one or more contiguous pages. It replaces the older `struct page` interface for most page cache operations, but the underlying concept is the same.

## The Write Path: Buffered Writes and Dirty Pages

When an application calls `write()`, data does **not** go directly to disk. Instead:

```
  write(fd, data, 4096)
       |
       v
  vfs_write()
       |
       v
  generic_perform_write()
       |
       +-- 1. Find or allocate page in cache
       |       grab_cache_page_write_begin()
       |
       +-- 2. Copy user data into the page
       |       copy_from_user()
       |
       +-- 3. Mark the page DIRTY
       |       set_page_dirty()
       |
       +-- 4. Return to userspace immediately
       |
       v
  (data is now in RAM only -- not on disk yet)
```

The write returns to the application **before the data hits disk**. The kernel tracks dirty pages and flushes them later. This is why a power failure can lose recent writes (and why databases use `fsync()`).

```c
// mm/page-writeback.c (simplified)
void folio_mark_dirty(struct folio *folio) {
    struct address_space *mapping = folio->mapping;

    if (!folio_test_dirty(folio)) {
        folio_set_dirty(folio);
        // Add to the dirty page accounting
        __xa_set_mark(&mapping->i_pages, folio->index, PAGECACHE_TAG_DIRTY);
        // Update per-zone dirty page counter
        account_page_dirtied(folio);
    }
}
```

The xarray uses **tags** (PAGECACHE_TAG_DIRTY, PAGECACHE_TAG_WRITEBACK) to quickly find dirty pages without scanning the entire tree.

## Writeback: Flushing Dirty Pages to Disk

Dirty pages must eventually reach disk. The kernel uses background threads called **flusher threads** (one per block device) to do this. Writeback is triggered by three conditions:

```
  Writeback Triggers
  +---------------------------------------------------+
  |                                                   |
  |  1. Timer expires (dirty_writeback_interval)      |
  |     Default: every 5 seconds                      |
  |     /proc/sys/vm/dirty_writeback_centisecs = 500  |
  |                                                   |
  |  2. Dirty ratio exceeded                          |
  |     dirty pages > dirty_background_ratio (10%)    |
  |     --> background writeback starts               |
  |                                                   |
  |     dirty pages > dirty_ratio (20%)               |
  |     --> process BLOCKS until pages are written    |
  |                                                   |
  |  3. Explicit sync                                 |
  |     fsync(), fdatasync(), sync()                  |
  |     --> writes specific file's dirty pages NOW    |
  |                                                   |
  +---------------------------------------------------+
```

The writeback worker in [`mm/page-writeback.c`](https://github.com/torvalds/linux/blob/master/mm/page-writeback.c) and [`fs/fs-writeback.c`](https://github.com/torvalds/linux/blob/master/fs/fs-writeback.c) iterates through dirty inodes and their dirty pages:

```c
// fs/fs-writeback.c (simplified)
static long writeback_sb_inodes(struct super_block *sb,
                                struct bdi_writeback *wb,
                                struct wb_writeback_work *work) {
    while (!list_empty(&wb->b_io)) {
        struct inode *inode = wb_inode(wb->b_io.prev);

        // Write dirty pages for this inode
        __writeback_single_inode(inode, work);

        // Move inode to clean list if no more dirty pages
        if (mapping_empty(inode->i_mapping))
            list_move(&inode->i_io_list, &wb->b_clean);
    }
}
```

For each dirty page, the filesystem's `writepage()` or `writepages()` callback is invoked, which submits I/O to the block layer. Once the I/O completes, the page is marked clean and the PG_writeback flag is cleared.

## Readahead: Predicting Future Reads

Sequential reads are extremely common (reading a log file, scanning a table, streaming video). The kernel's **readahead** mechanism detects sequential access and pre-fetches upcoming pages before the application asks for them:

```
  Application reads pages: 0, 1, 2, 3, ...

  Without readahead:
    read page 0 --> disk I/O --> wait --> deliver
    read page 1 --> disk I/O --> wait --> deliver
    read page 2 --> disk I/O --> wait --> deliver

  With readahead:
    read page 0 --> disk I/O for pages 0-15 (prefetch)
    read page 1 --> already in cache, instant
    read page 2 --> already in cache, instant
    ...
    read page 14 --> trigger ASYNC readahead for pages 16-47
    read page 15 --> already in cache
    read page 16 --> already in cache (prefetched)
```

The readahead logic lives in [`mm/readahead.c`](https://github.com/torvalds/linux/blob/master/mm/readahead.c). Each file descriptor tracks readahead state:

```c
// include/linux/fs.h
struct file_ra_state {
    pgoff_t start;        // current readahead window start
    unsigned int size;    // current readahead window size (pages)
    unsigned int async_size;  // pages before end to trigger next readahead
    unsigned int ra_pages;    // max readahead size (default: 256 KB)
    // ...
};
```

The algorithm grows the readahead window exponentially (like TCP slow start) as it gains confidence that access is sequential:

```
  First read:     readahead 4 pages
  Pattern holds:  readahead 8 pages
  Still going:    readahead 16 pages
  Maximum:        readahead 64 pages (256 KB default)
                  controlled by /sys/block/<dev>/queue/read_ahead_kb
```

If the access pattern becomes random (seeking to a distant offset), readahead resets. This adaptive behavior ensures the prefetch doesn't waste memory on random workloads.

## Eviction: What Happens Under Memory Pressure

The page cache has no fixed size — it grows to fill all available RAM. When the system needs memory (for application allocations or new cache pages), the kernel must **evict** some cached pages. This is handled by the **kswapd** daemon and the direct reclaim path.

Linux uses a variant of the **LRU (Least Recently Used)** algorithm with two lists:

```
  +------------------------------------------------------------+
  |                    Page Cache LRU Lists                     |
  |                                                            |
  |  Active List (hot pages)                                   |
  |  +------+  +------+  +------+  +------+  +------+         |
  |  |page A|->|page B|->|page C|->|page D|->|page E|         |
  |  +------+  +------+  +------+  +------+  +------+         |
  |                                                            |
  |  Inactive List (eviction candidates)                       |
  |  +------+  +------+  +------+  +------+  +------+         |
  |  |page X|->|page Y|->|page Z|->|page W|->|page V|         |
  |  +------+  +------+  +------+  +------+  +------+         |
  |     ^                                        |             |
  |     |          evict from tail               v             |
  |     |                                   [freed]            |
  |                                                            |
  +------------------------------------------------------------+

  Promotion:  inactive --> active  (when accessed again)
  Demotion:   active --> inactive  (when active list is too large)
  Eviction:   inactive tail pages freed (if clean) or written back (if dirty)
```

The two-list approach solves a classic problem: a single large sequential scan (like `cat hugefile.bin > /dev/null`) would evict all hot, frequently-accessed pages from cache. With two lists, pages from the scan enter the inactive list and get evicted quickly without disturbing the active list.

The eviction decision is made in [`mm/vmscan.c`](https://github.com/torvalds/linux/blob/master/mm/vmscan.c):

```c
// mm/vmscan.c (simplified from shrink_folio_list)
static unsigned int shrink_folio_list(struct list_head *folio_list,
                                      struct scan_control *sc) {
    while (!list_empty(folio_list)) {
        struct folio *folio = lru_to_folio(folio_list);

        if (folio_test_dirty(folio)) {
            // Dirty page: must write back before freeing
            folio_start_writeback(folio);
            mapping->a_ops->writepage(folio, &wbc);
            continue;  // will be freed after writeback completes
        }

        if (folio_test_referenced(folio)) {
            // Recently accessed: promote back to active list
            folio_clear_referenced(folio);
            list_move(&folio->lru, &active_list);
            continue;
        }

        // Clean, unreferenced: safe to free
        __remove_mapping(mapping, folio);
        free_unref_page(folio);
        nr_reclaimed++;
    }
    return nr_reclaimed;
}
```

Key rules for eviction:
1. **Clean, unreferenced pages** are freed immediately (zero cost).
2. **Dirty pages** must be written back first (writeback I/O cost).
3. **Referenced pages** get a second chance — they are promoted back to the active list.

## O_DIRECT: Bypassing the Page Cache

Some applications (notably databases) want to manage their own caching. Opening a file with `O_DIRECT` bypasses the page cache entirely:

```c
int fd = open("/data/tablespace", O_RDWR | O_DIRECT);
// reads and writes go directly to/from disk
// application must align buffers to 512-byte or 4096-byte boundaries
```

Why would a database bypass the page cache?

```
  With page cache (double buffering):
  +----------+    +------------+    +------+
  |  InnoDB  | -> | Page Cache | -> | Disk |
  | Buffer   |    |  (kernel)  |    |      |
  |  Pool    |    +------------+    +------+
  +----------+
     ^-- data is copied TWICE in memory (wasteful)

  With O_DIRECT:
  +----------+    +------+
  |  InnoDB  | -> | Disk |
  | Buffer   |    |      |
  |  Pool    |    +------+
  +----------+
     ^-- single copy, database controls eviction policy
```

PostgreSQL uses buffered I/O (relies on the page cache). MySQL/InnoDB uses O_DIRECT by default. RocksDB can use either. Each choice has trade-offs:

| Approach | Pro | Con |
|----------|-----|-----|
| Buffered (page cache) | Simple, good readahead, shared across processes | Double buffering, kernel controls eviction |
| O_DIRECT | No double copy, app controls caching | Must implement own readahead, complex alignment |

## Observing the Page Cache

You can see page cache usage in several ways:

```bash
# Overall memory breakdown (Cached = page cache)
$ free -h
              total    used    free    shared  buff/cache   available
Mem:           62Gi    4.2Gi   1.1Gi   256Mi      57Gi        57Gi

# Per-file cache status (using fincore or vmtouch)
$ vmtouch /var/log/syslog
           Files: 1
     Directories: 0
  Resident Pages: 1024/1024  4M/4M  100%

# Drop the page cache (useful for benchmarking)
$ echo 3 > /proc/sys/vm/drop_caches

# Tuning dirty page behavior
$ cat /proc/sys/vm/dirty_background_ratio    # 10 (start background writeback)
$ cat /proc/sys/vm/dirty_ratio               # 20 (block writers)
$ cat /proc/sys/vm/dirty_writeback_centisecs # 500 (flush interval: 5s)
```

## How the Pieces Fit Together

Here is the complete lifecycle of a page in the cache:

```
  1. ALLOCATE                2. FILL                   3. SERVE
  +------------------+      +------------------+      +------------------+
  | alloc_page()     |      | submit_bio()     |      | copy_to_user()   |
  | add to xarray    | ---> | wait for I/O     | ---> | mark referenced  |
  | set PG_locked    |      | set PG_uptodate  |      | move to active   |
  +------------------+      | clear PG_locked  |      +------------------+
                            +------------------+
                                                            |
                                                            | (time passes)
                                                            v
  6. FREE                   5. WRITEBACK               4. DEMOTE
  +------------------+      +------------------+      +------------------+
  | remove from      |      | submit_bio()     |      | move to inactive |
  | xarray           | <--- | set PG_writeback | <--- | (active list too |
  | free_page()      |      | clear PG_dirty   |      |  large, or       |
  +------------------+      | clear PG_writeback|     |  memory pressure)|
                            +------------------+      +------------------+
```

## Why This Matters for Databases

Understanding the page cache explains many database behaviors:

1. **Why `fsync()` is critical:** After a write, data sits in the page cache (RAM). Only `fsync()` guarantees it reaches disk. A database that doesn't `fsync()` after commits can lose data on power failure.

2. **Why cold starts are slow:** After a restart, the page cache is empty. The first queries must fetch everything from disk. Some databases (like PostgreSQL's `pg_prewarm`) explicitly load hot data into the cache at startup.

3. **Why memory matters more than you think:** A machine with 256 GB RAM might use only 16 GB for the database process, but the other 240 GB serves as a page cache — effectively a free, kernel-managed read cache for your data files.

4. **Why `DROP CACHES` hurts:** Running `echo 3 > /proc/sys/vm/drop_caches` on a production database server evicts all cached data. The next few minutes of queries will hit disk for every read.

5. **Why sequential scans can trash performance:** A full table scan reads every page sequentially. Without the two-list LRU, this would evict all hot index pages from cache. The inactive list absorbs the scan without disturbing active pages (though very large scans can still cause pressure).

## References

1. Linux kernel source, page cache read path [`mm/filemap.c`](https://github.com/torvalds/linux/blob/master/mm/filemap.c)
2. Linux kernel source, page writeback [`mm/page-writeback.c`](https://github.com/torvalds/linux/blob/master/mm/page-writeback.c)
3. Linux kernel source, readahead [`mm/readahead.c`](https://github.com/torvalds/linux/blob/master/mm/readahead.c)
4. Linux kernel source, page reclaim [`mm/vmscan.c`](https://github.com/torvalds/linux/blob/master/mm/vmscan.c)
5. Linux kernel source, filesystem writeback [`fs/fs-writeback.c`](https://github.com/torvalds/linux/blob/master/fs/fs-writeback.c)
6. Linux kernel documentation, page cache [doc](https://www.kernel.org/doc/html/latest/admin-guide/mm/concepts.html)
7. LWN article, The multi-generational LRU [article](https://lwn.net/Articles/856931/)
8. Brendan Gregg, Linux Page Cache Hit Ratio [blog](https://www.brendangregg.com/blog/2014-12-31/linux-page-cache-hit-ratio.html)
