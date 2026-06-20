---
author: JZ
pubDatetime: 2026-06-20T08:00:00Z
modDatetime: 2026-06-20T08:00:00Z
title: System Design - How Copy-on-Write (COW) Works
tags:
  - design-system
  - design-os
description:
  "How Copy-on-Write works across operating systems, databases, and filesystems: the core mechanism behind fork(), Redis snapshots, LMDB reads, B-tree databases, and modern filesystems like Btrfs and ZFS."
---

## Table of contents

## Context

Imagine you have a 4 GB process running in memory. You call `fork()` to create a child process. Should the OS copy all 4 GB right away? That would be wasteful — the child might only read a few pages or call `exec()` immediately, replacing everything.

**Copy-on-Write (COW)** is the answer: instead of copying data eagerly, share it and only make a private copy when someone tries to modify it. This single idea shows up everywhere in systems programming:

- **Operating systems:** `fork()` shares page tables; pages are copied only when written.
- **Databases:** Redis forks for snapshots without doubling memory. LMDB and SQLite WAL let readers see consistent snapshots while writers modify the B-tree.
- **Filesystems:** Btrfs and ZFS never overwrite data in place — every write creates a new copy of the modified block.
- **Programming languages:** Rust's `Cow<T>`, C++ `std::string` (pre-C++11), Swift value types.

The beauty of COW is that it turns an expensive **copy** into a cheap **reference count increment** (or page table entry share), deferring real work until absolutely necessary. Let's see how each layer implements this.

## The Core Idea

```
  Before write:                After process B writes to page 2:

  Process A         Process B   Process A         Process B
  +--------+       +--------+   +--------+       +--------+
  | page 1 |----+----| page 1 |   | page 1 |----+----| page 1 |
  +--------+   |   +--------+   +--------+   |   +--------+
               |                              |
  +--------+   |   +--------+   +--------+       +--------+
  | page 2 |---+---| page 2 |   | page 2 |       | page 2'|  <-- new copy
  +--------+       +--------+   +--------+       +--------+
               |                              |
  +--------+   |   +--------+   +--------+   |   +--------+
  | page 3 |---+---| page 3 |   | page 3 |---+---| page 3 |
  +--------+       +--------+   +--------+       +--------+

  All pages shared             Only modified page is copied
  (read-only PTEs)             (page 2 now has two physical copies)
```

The three-step protocol is always the same:

1. **Share:** Point multiple consumers at the same underlying data.
2. **Protect:** Mark the shared data as read-only (or bump a reference count).
3. **Copy on fault:** When a write happens, intercept it, allocate a private copy, and let the write proceed on the copy.

## Copy-on-Write in the Linux Kernel (fork)

When a process calls `fork()`, the kernel does NOT copy the parent's physical memory. Instead, it duplicates only the **page table** (the mapping from virtual addresses to physical frames) and marks every page table entry (PTE) as **read-only** in both parent and child:

```
  Parent virtual memory             Child virtual memory
  +--------------------+            +--------------------+
  | VAddr 0x1000       |            | VAddr 0x1000       |
  | PTE: frame 42, R-- |            | PTE: frame 42, R-- |
  +--------------------+            +--------------------+
  | VAddr 0x2000       |            | VAddr 0x2000       |
  | PTE: frame 87, R-- |            | PTE: frame 87, R-- |
  +--------------------+            +--------------------+
           |                                 |
           +--------+    +-------------------+
                    |    |
                    v    v
            Physical Memory
            +--------------------+
            | Frame 42 (shared)  |  refcount = 2
            +--------------------+
            | Frame 87 (shared)  |  refcount = 2
            +--------------------+
```

### What happens on a write

When the child writes to virtual address `0x1000`:

1. The CPU raises a **page fault** (write to read-only page).
2. The kernel's page fault handler checks: is this a COW page?
3. Yes — the refcount on frame 42 is > 1.
4. Kernel allocates a **new physical frame** (say frame 99).
5. Kernel copies the contents of frame 42 into frame 99.
6. Kernel updates the child's PTE: `VAddr 0x1000 → frame 99, RW-`.
7. Kernel decrements the refcount on frame 42 (now 1).
8. Since the parent is the only user of frame 42, the kernel marks the parent's PTE as writable too.
9. The write instruction resumes on the child's new private page.

The key source file in Linux is [`mm/memory.c`](https://github.com/torvalds/linux/blob/master/mm/memory.c). The function `do_wp_page()` (write-protect page fault) handles step 2–8:

```c
static vm_fault_t do_wp_page(struct vm_fault *vmf)
{
    struct folio *folio = page_folio(vmf->page);

    // Fast path: if we're the only user, just make it writable
    if (folio_ref_count(folio) == 1) {
        wp_page_reuse(vmf, folio);
        return 0;
    }

    // Slow path: need to copy
    return wp_page_copy(vmf);
}
```

The fast path is crucial: if a page's refcount is 1, no copy is needed — just flip the PTE to writable. This happens frequently after the child calls `exec()`, which unmaps all shared pages.

### Performance implications

`fork()` itself is nearly instant regardless of process size:

| Process size | fork() without COW | fork() with COW |
|---|---|---|
| 100 MB | ~25 ms (copy) | ~0.5 ms (page table only) |
| 4 GB | ~1000 ms | ~2 ms |
| 64 GB | ~16000 ms | ~30 ms |

The cost shifts to **later**, spread across individual page faults. If the child immediately calls `exec()`, zero pages are ever copied.

## Copy-on-Write in Redis (Background Snapshots)

Redis is single-threaded, but it needs to write snapshots (RDB files) to disk. Saving a multi-GB dataset to disk takes seconds or minutes — Redis can't stop serving reads and writes that long.

The solution: `fork()` + COW.

```
  Before BGSAVE:

  +------------------+
  |   Redis parent   |     All data in memory
  |   (serves cmds)  |     (e.g., 10 GB RSS)
  +------------------+

  After fork():

  +------------------+     +------------------+
  |   Redis parent   |     |   Redis child    |
  |   (serves cmds)  |     |  (writes RDB)    |
  +--------+---------+     +--------+---------+
           |                        |
           +-------+    +-----------+
                   |    |
                   v    v
           +------------------+
           | Shared physical  |     Still ~10 GB total
           |     memory       |     (not 20 GB!)
           +------------------+
```

The child process has a **frozen snapshot** of all Redis data at the moment of `fork()`. It reads this snapshot page by page and serializes it to the RDB file. Meanwhile, the parent continues handling writes.

When the parent modifies a key, the kernel COW-faults the affected page, allocating a private copy for the parent. The child still sees the old data (its PTE still points to the original frame).

### Memory overhead

The extra memory used during BGSAVE is proportional to the **write rate**, not the total dataset:

```
  Extra memory = (pages modified during save) * 4 KB

  Example:
  - 10 GB dataset = 2,621,440 pages
  - Save takes 30 seconds
  - Write rate modifies 5% of pages during that window
  - Extra memory: 2,621,440 * 0.05 * 4 KB = 512 MB
```

This is why Redis documentation recommends setting `vm.overcommit_memory = 1` on Linux — the kernel needs to be willing to promise memory that the COW pages *might* need, even though most won't actually be copied.

### The source code

In [`src/rdb.c`](https://github.com/redis/redis/blob/unstable/src/rdb.c), the `rdbSaveBackground()` function:

```c
int rdbSaveBackground(char *filename, rdbSaveInfo *rsi) {
    if ((childpid = redisFork(CHILD_TYPE_RDB)) == 0) {
        // Child process
        retval = rdbSave(server.rdb_filename, rsi, RDBFLAGS_NONE);
        exitFromChild((retval == C_OK) ? 0 : 1);
    }
    // Parent continues serving commands
    return C_OK;
}
```

Redis also tracks COW memory usage during the save. The child periodically checks `/proc/self/smaps` or uses `CRIU` info to report how many pages were actually copied:

```
Background saving started by pid 12345
DB saved on disk
RDB: 234 MB of memory used by copy-on-write
```

## Copy-on-Write in B-tree Databases (LMDB, Btrfs)

Traditional databases like InnoDB modify B-tree pages **in place** and use a write-ahead log (WAL) for crash recovery. COW databases take a different approach: they never overwrite existing pages. Every modification creates a new version of the page.

### How a COW B-tree write works

```
  Original tree:                  After updating key K in leaf C:

       [Root A]                        [Root A']  <-- new root
       /      \                        /      \
    [B]      [C]                    [B]      [C'] <-- new leaf
   / | \    / | \                  / | \    / | \
  ...     ...K...                ...     ...K'...

  Pages A and C are NOT freed.     Old pages A, C still exist on disk.
  They remain as the previous      New pages A', C' written to free space.
  snapshot.                         The old root pointer = instant snapshot.
```

The critical insight: **the old root pointer is a free, consistent snapshot**. Any reader that holds the old root pointer sees the entire tree as it was before the write. No locks needed.

### LMDB: lock-free readers via COW

LMDB (Lightning Memory-Mapped Database) uses this property to achieve something remarkable: **readers never block writers, and writers never block readers.** There are no read locks at all.

The mechanism in [`mdb.c`](https://github.com/LMDB/lmdb/blob/mdb.master/libraries/liblmdb/mdb.c):

```c
// Reader grabs the current root page number (one atomic read)
txn->mt_dbs[dbi] = env->me_txns->mti_txns[txn->mt_txnid].mt_dbs[dbi];

// Writer creates new pages via COW, then atomically updates the root
// by writing to the meta page (a single msync or fdatasync)
```

```
  Writer                              Reader (snapshot)
    |                                    |
    |  1. Start write txn                |  1. Read meta page -> root = page 5
    |  2. COW: copy page 5 to page 9    |  2. Traverse from page 5
    |  3. Modify page 9                  |     (sees old, consistent data)
    |  4. COW: copy root to page 10     |
    |  5. Commit: meta page -> root=10  |
    |                                    |  3. Still reading from page 5
    |                                    |     (valid until reader closes txn)
    |                                    |
    v                                    v
```

Pages from old snapshots are freed only when no active reader still references them. LMDB tracks the oldest active reader's transaction ID and reclaims pages that are older.

### Trade-off: write amplification

COW B-trees pay a cost: **write amplification**. Modifying a single key requires writing a new leaf page AND new copies of every page on the path from leaf to root:

```
  Tree height    Pages written per update
  -----------    -------------------------
       3              3 pages (leaf + internal + root)
       4              4 pages
       5              5 pages
```

For a tree with branching factor 100 and 100 million keys, the height is about 4, so every single-key update writes 4 pages (typically 4 × 4 KB = 16 KB). Compare this to an in-place update that writes just 1 page.

This is why COW B-trees (Btrfs, LMDB, CockroachDB's Pebble) work well for read-heavy and snapshot-heavy workloads but are less ideal for write-intensive random updates compared to LSM-trees.

## Copy-on-Write in Filesystems (Btrfs and ZFS)

Traditional filesystems (ext4, XFS) overwrite blocks in place. If power fails mid-write, you get a torn write — a block that is half-old, half-new. They mitigate this with journaling.

COW filesystems eliminate the problem entirely: **you never overwrite a block.** A write always goes to a new location. The old blocks remain valid until the new tree is fully committed.

```
  ext4 (in-place update):        Btrfs (COW):

  Block 100: [old data]          Block 100: [old data]  (untouched)
       |                         Block 200: [new data]  (written here)
       v
  Block 100: [NEW data]          Then atomically update the pointer:
                                 Parent block now points to 200 instead of 100.
  If crash during write:         If crash during write:
  Block 100 = corrupt            Block 100 = still valid (old snapshot)
                                 Block 200 = garbage (never linked in)
```

### Btrfs snapshot creation

Because the entire filesystem is a COW B-tree, creating a snapshot is a **constant-time** operation — just save the current root pointer:

```bash
# Create a snapshot of /data — instant, regardless of size
btrfs subvolume snapshot /data /data/.snapshots/2026-06-20

# This does NOT copy any data. It just creates a new reference
# to the same root node. Future writes COW as needed.
```

Compare to rsync-based backups that must scan and copy all files, which scales with data size.

### ZFS: block-level checksums + COW

ZFS extends the COW model with checksums stored in **parent** blocks:

```
       +---[Root]---+
       |            |
       v            v
  +--[Ptr A]--+  +--[Ptr B]--+
  | cksum: x1 |  | cksum: x2 |
  +-----+-----+  +-----+-----+
        |               |
        v               v
   [Data Block]    [Data Block]
   (hash = x1)    (hash = x2)
```

When reading, ZFS verifies the checksum of a child block against what the parent recorded. If a disk silently corrupts data (**bit rot**), ZFS detects it immediately. This is only possible because of COW — since the parent is rewritten every time a child changes, the parent always stores the correct checksum of the new child content.

## Copy-on-Write in Programming Languages

### Rust: `Cow<T>`

Rust's standard library provides [`std::borrow::Cow`](https://doc.rust-lang.org/std/borrow/enum.Cow.html) — an enum that holds either a borrowed reference or an owned value:

```rust
use std::borrow::Cow;

fn normalize_path(path: &str) -> Cow<str> {
    if path.contains("//") {
        // Need to modify: allocate a new String
        Cow::Owned(path.replace("//", "/"))
    } else {
        // No change needed: just borrow the input
        Cow::Borrowed(path)
    }
}

let p1 = normalize_path("/home/user");      // Cow::Borrowed (no alloc)
let p2 = normalize_path("/home//user");     // Cow::Owned (allocates)
```

This is COW at the application level: avoid allocation unless you actually need to modify the data.

### Swift: value type COW

Swift arrays, dictionaries, and strings use COW internally. When you assign an array to a new variable, they share the same buffer. A copy only happens on mutation:

```swift
var a = [1, 2, 3, 4, 5]    // buffer allocated, refcount = 1
var b = a                    // refcount = 2, same buffer

b.append(6)                  // refcount > 1, so copy buffer first
                             // now a and b have separate buffers
```

The runtime checks `isKnownUniquelyReferenced()` before every mutating operation. If the reference count is 1, it mutates in place (no copy needed).

## When COW Hurts

COW is not free. Here are the costs:

**1. Page fault latency (OS-level COW)**

Each COW fault costs ~2–5 μs (allocate frame, copy 4 KB, update PTE, TLB flush). For write-heavy workloads after fork(), thousands of faults accumulate:

```
  Write-heavy child after fork():
  - 100,000 pages modified
  - 100,000 × 3 μs = 300 ms of fault handling
  - Plus TLB shootdowns on multicore (IPIs to other cores)
```

**2. Write amplification (filesystem/database COW)**

As discussed, modifying one leaf requires rewriting the entire root-to-leaf path. For deep trees or small random writes, this multiplies I/O.

**3. Fragmentation**

In-place updates keep data sequential on disk. COW scatters new versions to wherever free space exists, turning sequential reads into random reads over time. Btrfs notoriously suffers from fragmentation on workloads with many small random writes (databases, VM images).

**4. Memory pressure after fork()**

Redis on a write-heavy workload during BGSAVE can temporarily use up to 2× memory. If the system doesn't have headroom, the OOM killer intervenes.

## Summary

```
  +-------------------+------------------+------------------------+
  |   Layer           |  Shared Unit     |  Copy Trigger          |
  +-------------------+------------------+------------------------+
  | OS (fork)         |  Memory page     |  Page fault on write   |
  | Database (LMDB)   |  B-tree page     |  Transaction commit    |
  | Filesystem (Btrfs)|  Disk block      |  File write syscall    |
  | Language (Rust)   |  Heap allocation |  Mutation call         |
  | Redis (snapshot)  |  Memory page     |  Parent writes key     |
  +-------------------+------------------+------------------------+
```

The pattern is universal: **defer expensive copies until you prove they're necessary.** Whether it's a 4 KB page in RAM or a 128 KB block on an SSD, the math is the same — sharing is cheap, copying is expensive, and most shared data is never actually modified.

## References

1. Linux kernel `do_wp_page()` — COW page fault handler [`mm/memory.c`](https://github.com/torvalds/linux/blob/master/mm/memory.c)
2. Redis background save implementation [`src/rdb.c`](https://github.com/redis/redis/blob/unstable/src/rdb.c)
3. LMDB design paper — Howard Chu, "MDB: A Memory-Mapped Database and Backend for OpenLDAP" [paper](http://www.lmdb.tech/media/20120829-LinuxCon-MDB-txt.pdf)
4. Btrfs wiki — Copy-on-Write semantics [wiki](https://btrfs.wiki.kernel.org/index.php/Btrfs_design)
5. ZFS on-disk format specification — block pointer checksums [doc](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/index.html)
6. Rust `std::borrow::Cow` documentation [doc](https://doc.rust-lang.org/std/borrow/enum.Cow.html)
7. Ohad Rodeh, "B-trees, Shadowing, and Clones" — COW B-tree formalization [paper](https://dl.acm.org/doi/10.1145/1326542.1326544)
