---
author: JZ
pubDatetime: 2026-05-17T06:00:00Z
modDatetime: 2026-05-17T06:00:00Z
title: System Design - How Memory Allocators Work
tags:
  - design-system
description:
  "How memory allocators work under the hood: malloc/free internals, free lists, splitting and coalescing, the buddy system, arena-based allocators like tcmalloc and jemalloc, and how modern allocators reduce lock contention in multi-threaded programs."
---

## Table of contents

## Context

Every time you write `malloc(64)` in C or `new Object()` in Java (which eventually calls a native allocator), something has to find 64 free bytes somewhere in your process's address space and hand them back. When you call `free()`, those bytes need to become reusable again. This sounds simple, but doing it **fast**, with **low fragmentation**, across **many threads** is one of the classic hard problems in systems programming.

The operating system gives your process memory in large chunks (pages, typically 4 KB). The allocator's job is to carve those pages into the small, variable-sized pieces your program actually needs.

```
  Your program calls malloc()/free()
           |
           v
  +--------------------+
  |   User-space       |
  |   Allocator        |   <-- this is what we're studying
  |   (glibc, tcmalloc,|
  |    jemalloc, etc.) |
  +--------+-----------+
           |
           |  brk() / mmap()
           v
  +--------------------+
  |   OS Kernel        |
  |   (virtual memory) |
  +--------+-----------+
           |
           v
  +--------------------+
  |   Physical RAM     |
  +--------------------+
```

The allocator sits between your code and the kernel. It batches kernel calls (which are expensive) and manages a **heap** — a region of virtual memory that grows as needed.

## The Heap: Where malloc Lives

When your process starts, the kernel sets up a memory layout like this:

```
  High addresses
  +------------------+
  |      Stack       |  grows downward
  |        |         |
  |        v         |
  |                  |
  |   (unmapped)     |
  |                  |
  |        ^         |
  |        |         |
  |      Heap        |  grows upward (via brk/sbrk)
  +------------------+  <-- program break
  |   BSS (zeros)    |
  |   Data (globals) |
  |   Text (code)    |
  +------------------+
  Low addresses
```

The heap starts just above the program's static data. The system call `brk()` moves the "program break" upward to grow the heap. Modern allocators also use `mmap()` to request memory from arbitrary virtual addresses, especially for large allocations.

Here is a simplified version of how glibc's `malloc` requests memory from the kernel:

```c
// Simplified — real glibc is much more complex
void *request_memory(size_t size) {
    if (size >= MMAP_THRESHOLD) {  // typically 128 KB
        // Large allocation: use mmap directly
        return mmap(NULL, size, PROT_READ | PROT_WRITE,
                    MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    }
    // Small allocation: extend the heap
    void *old_break = sbrk(0);
    if (sbrk(size) == (void *)-1) return NULL;
    return old_break;
}
```

Small allocations extend the heap; large ones get their own `mmap` region that can be returned to the OS independently. This dual strategy avoids a common problem: a single large allocation at the top of the heap preventing the break from being lowered, even after everything below it is freed.

## Free Lists: The Simplest Allocator

The most fundamental data structure in an allocator is the **free list** — a linked list of available memory blocks. When you `malloc`, the allocator walks the list looking for a block that fits. When you `free`, the block goes back on the list.

```
  Free list (singly linked):

  head
   |
   v
  +--------+     +--------+     +--------+
  | 64 B   |---->| 128 B  |---->| 32 B   |----> NULL
  | (free) |     | (free) |     | (free) |
  +--------+     +--------+     +--------+

  malloc(48) scans the list:
    64 B >= 48? Yes -> use this block
```

Each free block stores its size and a pointer to the next free block **inside the free memory itself** — since the memory is unused, we can repurpose it:

```c
typedef struct block_header {
    size_t size;
    struct block_header *next;
    int free;  // 1 = free, 0 = allocated
} block_header;
```

When `malloc(n)` is called, the allocator searches for a free block with `size >= n`. There are three classic strategies:

- **First fit:** Return the first block that is large enough. Fast, but leads to fragmentation at the start of the list.
- **Best fit:** Scan the entire list and return the smallest block that fits. Less waste per allocation, but slower ($O(n)$ scan) and creates many tiny unusable fragments.
- **Next fit:** Like first fit, but start scanning from where the last search left off. Spreads allocations more evenly.

### Splitting and Coalescing

If the allocator finds a 256-byte block but you only need 48 bytes, it **splits** the block:

```
  Before split:
  +--------------------+
  | 256 B (free)       |
  +--------------------+

  After malloc(48):
  +----------+---------+
  | 48 B     | 200 B   |    (8 bytes lost to header overhead)
  | (used)   | (free)  |
  +----------+---------+
```

When you `free` a block, the allocator should **coalesce** (merge) it with adjacent free blocks to prevent fragmentation:

```
  Before free(B):
  +--------+--------+--------+
  | A      | B      | C      |
  | (free) | (used) | (free) |
  +--------+--------+--------+

  After free(B) + coalescing:
  +---------------------------+
  | A + B + C                 |
  | (free, merged)            |
  +---------------------------+
```

Without coalescing, you would end up with many small free blocks that can't satisfy larger requests even though the total free memory is sufficient. This is called **external fragmentation**.

The glibc implementation in [`malloc/malloc.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c) uses a boundary-tag technique: each chunk stores its size at both the beginning and end, so the allocator can find the previous chunk in $O(1)$ and merge if it's free.

## Bins: Speeding Up the Search

Scanning a single linked list is too slow for a real allocator. glibc's `ptmalloc2` organizes free blocks into **bins** by size:

```
  Bins array (simplified):

  Index  Size range        Data structure
  -----  ----------------  ----------------
  [0]    unsorted          doubly linked list (recently freed)
  [1]    16 bytes          doubly linked list
  [2]    24 bytes          doubly linked list
  ...    ...               ...
  [63]   512 bytes         doubly linked list
  [64]   512 - 576 B       sorted tree (red-black or skip list)
  ...    ...               ...
  [126]  >= 1 MB           sorted tree

  "Small bins"  (exact size, fast lookup)
  "Large bins"  (size ranges, tree-sorted)
```

- **Fast bins:** Very small sizes (16–80 bytes on 64-bit). Singly linked, LIFO. No coalescing — speed over space.
- **Small bins:** Exact sizes up to 512 bytes. Doubly linked, FIFO. Coalescing on free.
- **Large bins:** Size ranges above 512 bytes. Sorted so best-fit is efficient.
- **Unsorted bin:** A staging area for recently freed chunks. The allocator checks here first and sorts chunks into the correct bin lazily.

This binning turns the common case — allocating a small, popular size — into an $O(1)$ operation: look up the bin by size, pop the first block.

## The Buddy System

An alternative to free lists is the **buddy allocator**, used by the Linux kernel for page-level allocation and by some user-space allocators. The idea: all blocks are powers of two, and every block has a "buddy" at a known address.

```
  Start with a 1024-byte region.
  Request 128 bytes:

  Step 1: Split 1024 -> two 512-byte buddies
  +-------------------+-------------------+
  |      512 B        |      512 B        |
  +-------------------+-------------------+

  Step 2: Split left 512 -> two 256-byte buddies
  +---------+---------+-------------------+
  |  256 B  |  256 B  |      512 B        |
  +---------+---------+-------------------+

  Step 3: Split left 256 -> two 128-byte buddies
  +----+----+---------+-------------------+
  |128 |128 |  256 B  |      512 B        |
  |used|free|  (free) |     (free)        |
  +----+----+---------+-------------------+
```

To free a block, check if its buddy is also free. If so, merge them back into the parent, and recursively check the parent's buddy:

```
  Free the 128-byte block:
  +----+----+---------+-------------------+
  |free|free|  256 B  |      512 B        |
  +----+----+---------+-------------------+
         |
         v  (buddy is free, merge)
  +---------+---------+-------------------+
  |  256 B  |  256 B  |      512 B        |
  +---------+---------+-------------------+
         |
         v  (buddy is free, merge)
  +-------------------+-------------------+
  |      512 B        |      512 B        |
  +-------------------+-------------------+
         |
         v  (buddy is free, merge)
  +---------------------------------------+
  |              1024 B                   |
  +---------------------------------------+
```

The key insight: a block's buddy address can be computed with a single XOR. If a block of size $2^k$ starts at address $A$, its buddy is at $A \oplus 2^k$. This makes the "is my buddy free?" check very fast.

The Linux kernel's page allocator (`mm/page_alloc.c` in the kernel source) uses exactly this scheme with orders 0 through 10 (4 KB to 4 MB). You can see the current state in `/proc/buddyinfo`:

```bash
$ cat /proc/buddyinfo
Node 0, zone   Normal   4096   2048   1024   512   256   128   64   32   16   8   4
#                        ^      ^      ^     ...
#                       4KB   8KB   16KB   page counts at each order
```

**Trade-off:** The buddy system has zero external fragmentation (blocks always merge cleanly) but suffers from **internal fragmentation** — a 65-byte request wastes 63 bytes because it rounds up to 128.

## The Multi-Threaded Problem

A single free list with a single lock becomes a bottleneck when dozens of threads all call `malloc` and `free` simultaneously. Every thread contends for the same lock:

```
  Thread 1 --> malloc(32) --+
  Thread 2 --> malloc(64) --+--> [ LOCK ] --> single heap --> [ UNLOCK ]
  Thread 3 --> free(ptr)  --+
  Thread 4 --> malloc(16) --+

  All 4 threads serialize on the lock. Throughput collapses.
```

This is the central problem that modern allocators (tcmalloc, jemalloc, mimalloc) solve.

## tcmalloc: Thread-Caching Malloc

Google's [tcmalloc](https://github.com/google/tcmalloc) (Thread-Caching Malloc) uses a two-level design: each thread gets its own cache of small objects, and a shared central heap handles the rest.

```
  +--------------------------------------------------+
  |                   Process                        |
  |                                                  |
  |  Thread 1            Thread 2            Thread 3|
  |  +-----------+       +-----------+       +------+|
  |  |Thread     |       |Thread     |       |Thread||
  |  |Cache      |       |Cache      |       |Cache ||
  |  |           |       |           |       |      ||
  |  |free lists |       |free lists |       |free  ||
  |  |by size    |       |by size    |       |lists ||
  |  |class      |       |class      |       |      ||
  |  +-----+-----+       +-----+-----+       +--+---+|
  |        |                    |                |    |
  |        | refill/return      |                |    |
  |        v                    v                v    |
  |  +--------------------------------------------+  |
  |  |         Central Free Lists                 |  |
  |  |         (one per size class)               |  |
  |  |         protected by per-class locks       |  |
  |  +--------------------+-----------------------+  |
  |                       |                          |
  |                       | when empty               |
  |                       v                          |
  |  +--------------------------------------------+  |
  |  |         Page Heap                          |  |
  |  |         (spans of contiguous pages)        |  |
  |  |         single lock                        |  |
  |  +--------------------------------------------+  |
  +--------------------------------------------------+
```

### Size Classes

tcmalloc rounds up every allocation to a **size class**. Instead of handling arbitrary sizes, it uses a fixed set (e.g., 8, 16, 32, 48, 64, 80, 96, 128, ... up to 256 KB). This eliminates fragmentation within a size class and makes free-list indexing trivial.

From the tcmalloc source ([`tcmalloc/size_classes.cc`](https://github.com/google/tcmalloc/blob/master/tcmalloc/size_classes.cc)):

```
  Request size    Size class    Wasted bytes
  -----------    ----------    ------------
       1 - 8         8              0 - 7
      9 - 16        16              0 - 7
     17 - 32        32              0 - 15
     33 - 48        48              0 - 15
     49 - 64        64              0 - 15
      ...           ...             ...
```

### The Thread Cache

Each thread maintains a per-size-class free list in thread-local storage:

```c
// Conceptual structure (simplified from tcmalloc source)
struct ThreadCache {
    FreeList list[kNumClasses];  // one free list per size class
    size_t size;                 // total bytes in this cache
};

void *malloc(size_t size) {
    int cl = SizeToClass(size);          // O(1) lookup
    ThreadCache *tc = GetThreadCache();  // thread-local
    if (tc->list[cl].empty()) {
        tc->FetchFromCentral(cl);        // refill from central
    }
    return tc->list[cl].Pop();           // no lock needed!
}

void free(void *ptr) {
    int cl = GetSizeClass(ptr);          // from page metadata
    ThreadCache *tc = GetThreadCache();
    tc->list[cl].Push(ptr);              // no lock needed!
    if (tc->size > kMaxSize) {
        tc->ReturnToCentral();           // give back excess
    }
}
```

The critical insight: **most malloc/free pairs never touch a lock.** The thread cache absorbs the fast path entirely. Only when the cache runs empty or gets too large does the thread interact with the shared central heap — and even then, it transfers objects in batches to amortize the lock cost.

### The Page Heap

For allocations larger than 256 KB (or when the central lists need more pages), tcmalloc goes to the **page heap**. This is a buddy-like structure that manages runs of contiguous pages called **spans**:

```
  Page Heap (simplified):

  free_lists[1] --> [1 page] --> [1 page] --> NULL
  free_lists[2] --> [2 pages] --> NULL
  free_lists[3] --> [3 pages] --> NULL
  ...
  free_lists[128] --> [128 pages] --> NULL
  large_spans --> sorted set of spans > 128 pages
```

A span can be "carved" into objects of a single size class. The span metadata records which size class it serves, so `free()` can determine the size class from just the pointer (look up the page, find the span, read the size class).

## jemalloc: Arena-Based Allocation

Facebook's [jemalloc](https://github.com/jemalloc/jemalloc) (used by FreeBSD libc, Redis, and Rust's default allocator for a long time) takes a different approach to concurrency: instead of per-thread caches, it uses multiple **arenas**.

```
  +--------------------------------------------------+
  |                   Process                        |
  |                                                  |
  |  Thread 1       Thread 2       Thread 3          |
  |      |              |              |              |
  |      | assigned     | assigned     | assigned     |
  |      v              v              v              |
  |  +--------+     +--------+     +--------+        |
  |  | Arena  |     | Arena  |     | Arena  |        |
  |  |   0    |     |   1    |     |   0    |        |
  |  +--------+     +--------+     +--------+        |
  |                                                  |
  |  Typically: ncpus * 4 arenas                     |
  |  Threads round-robin across arenas               |
  +--------------------------------------------------+

  Inside each arena:

  +------------------------------------------+
  |  Arena                                   |
  |                                          |
  |  Thread Cache (tcache)                   |
  |  +------------------------------------+  |
  |  | small bins: [8][16][32]...[14336]  |  |
  |  +------------------------------------+  |
  |                                          |
  |  Small allocations (< 14 KB):           |
  |  +------------------------------------+  |
  |  | Slabs (runs of pages, divided      |  |
  |  | into equal-size regions)           |  |
  |  +------------------------------------+  |
  |                                          |
  |  Large allocations (>= 14 KB):          |
  |  +------------------------------------+  |
  |  | Dedicated page runs                |  |
  |  +------------------------------------+  |
  +------------------------------------------+
```

### Slabs

jemalloc divides small allocations into **size classes** (similar to tcmalloc) and carves pages into **slabs** — contiguous runs of same-sized slots:

```
  Slab for 64-byte objects (one 4 KB page = 63 slots + metadata):

  +------+------+------+------+------+------+---+------+
  | 64 B | 64 B | 64 B | 64 B | 64 B | 64 B |...| 64 B |
  | obj  | obj  | FREE | obj  | FREE | obj  |   | FREE |
  +------+------+------+------+------+------+---+------+
                   ^                ^                ^
                   |                |                |
                   +-- tracked by a bitmap ----------+

  Bitmap: 1 1 0 1 0 1 ... 0
          ^       ^
          used    free
```

Instead of linked lists inside free objects, jemalloc uses a **bitmap** to track which slots are occupied. This has better cache behavior — the bitmap fits in a cache line or two, while a linked list scatters pointers across the slab.

### Thread Caches (tcache)

jemalloc also has per-thread caches (confusingly also called "tcache"), but they work with the arena system. Each tcache holds a small magazine of objects per size class. The flow is:

1. **Fast path:** Pop from tcache (no lock).
2. **Slow path:** Refill tcache from the arena's slab (arena lock).
3. **Slower path:** Allocate a new slab from the arena's page runs.
4. **Slowest path:** `mmap` new pages from the OS.

### Dirty Page Purging

One unique feature of jemalloc is its approach to returning memory to the OS. Instead of immediately `munmap`-ing freed pages, jemalloc marks them as "dirty" and periodically **purges** them using `madvise(MADV_DONTNEED)`:

```
  Page states in jemalloc:

  +----------+    free()     +----------+    decay timer    +-----------+
  | Active   | -----------> | Dirty    | ----------------> | Muzzy     |
  | (in use) |              | (freed,  |                   | (purged,  |
  +----------+              |  still   |                   |  but page |
       ^                    |  resident|                   |  tables   |
       |                    |  in RAM) |                   |  remain)  |
       |                    +----------+                   +-----------+
       |                         |                              |
       +--- reused by malloc ----+                              |
       +--- reused by malloc -----------------------------------+
```

This decay-based approach avoids the overhead of frequent `mmap`/`munmap` calls while still allowing the OS to reclaim physical pages when memory is tight. The decay rate is configurable (default: 10 seconds for dirty, 10 seconds for muzzy).

## Comparing the Allocators

```
  Feature              glibc ptmalloc2     tcmalloc          jemalloc
  -------------------  -----------------   ----------------  ----------------
  Concurrency model    Per-thread arenas   Thread cache +    Multiple arenas
                       (limited count)     central lists     + thread caches

  Small alloc speed    Medium              Very fast         Fast
                       (arena lock)        (lock-free path)  (lock-free path)

  Fragmentation        Higher              Lower             Lowest
                       (aging free lists)  (size classes)    (slabs + bitmap)

  Memory overhead      Low                 Medium            Medium
                       (minimal metadata)  (per-thread $)    (bitmap + runs)

  Large alloc          mmap above 128KB    mmap above 256KB  mmap above
  strategy                                                   a few MB

  Used by              Linux default       Google, Go(old)   FreeBSD, Redis,
                                           Chromium          Firefox, Rust
```

## A Complete malloc/free Example

Let's trace through what happens in tcmalloc when you allocate and free 48 bytes:

```
  malloc(48)
  --------
  1. Round up to size class: 48 bytes -> class 5 (48 B)
  2. Check thread cache for class 5
     +-- Not empty? Pop from free list. Done. (common case)
     +-- Empty? Go to step 3.
  3. Fetch a batch from central free list (lock per class)
     +-- Not empty? Move batch to thread cache. Pop one. Done.
     +-- Empty? Go to step 4.
  4. Allocate a span from page heap (global lock)
     +-- Find a span of appropriate size
     +-- Carve it into 48-byte objects
     +-- Move them to central free list
     +-- Transfer batch to thread cache
     +-- Pop one. Done.

  free(ptr)
  --------
  1. Look up page -> find span -> find size class: 48 B, class 5
  2. Push onto thread cache free list for class 5. Done. (common case)
     +-- Thread cache too large? Go to step 3.
  3. Return a batch to central free list (lock per class)
     +-- Span entirely free? Return span to page heap.
```

Steps 1-2 for both `malloc` and `free` are the hot path — they involve **zero locks** and **zero system calls**. This is why tcmalloc achieves millions of allocations per second per thread.

## Fragmentation: The Eternal Enemy

Even with all these techniques, fragmentation remains a challenge. There are two types:

```
  External fragmentation:
  Free memory exists but is scattered in non-contiguous blocks.

  +------+----+------+----+------+----+------+
  | used |FREE| used |FREE| used |FREE| used |
  | 32 B |16B | 64 B |16B | 32 B |16B | 32 B |
  +------+----+------+----+------+----+------+

  Total free: 48 bytes. But malloc(48) fails because
  no single contiguous block is 48 bytes.

  Internal fragmentation:
  Allocated block is larger than requested.

  malloc(33) returns a 48-byte block (size class rounding).

  +---------------------------------------------+
  |  33 bytes used  |  15 bytes wasted (padding) |
  +---------------------------------------------+
```

Modern allocators accept some internal fragmentation (typically 10-15% waste from size-class rounding) as the price for fast, scalable allocation. The key metric is **RSS (Resident Set Size)** — how much physical memory the process actually uses. A good allocator minimizes RSS over the lifetime of the program, not just at any single point.

## Debugging Allocator Issues

When things go wrong, these tools help:

- **`/proc/self/maps`** — Shows all memory mappings (heap, mmap regions, shared libraries). Look for unexpected growth.
- **`mallinfo()` / `malloc_stats()`** — glibc functions that print heap statistics.
- **`MALLOC_CONF`** — jemalloc's environment variable for runtime configuration and statistics (`MALLOC_CONF=stats_print:true`).
- **`tcmalloc::MallocExtension`** — tcmalloc's C++ API for heap profiling and statistics.
- **Valgrind / AddressSanitizer** — Detect use-after-free, double-free, buffer overflows, and leaks. ASan instruments allocator calls at compile time and catches errors with ~2x overhead.

```bash
# Compile with AddressSanitizer
gcc -fsanitize=address -g myprogram.c -o myprogram
./myprogram
# ASan reports:
# ==12345==ERROR: AddressSanitizer: heap-use-after-free on address 0x602000000010
```

## References

1. glibc malloc implementation [`malloc/malloc.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c)
2. Doug Lea's malloc design [doc](https://gee.cs.oswego.edu/dl/html/malloc.html)
3. tcmalloc design [doc](https://google.github.io/tcmalloc/design.html)
4. tcmalloc source [`tcmalloc/`](https://github.com/google/tcmalloc)
5. jemalloc source and docs [repo](https://github.com/jemalloc/jemalloc)
6. jemalloc: A Scalable Concurrent malloc Implementation for FreeBSD [paper](https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf)
7. Linux kernel buddy allocator [`mm/page_alloc.c`](https://elixir.bootlin.com/linux/latest/source/mm/page_alloc.c)
8. Hoard: A Scalable Memory Allocator for Multithreaded Applications [paper](https://people.cs.umass.edu/~emery/pubs/berger-asplos2000.pdf)
9. mimalloc: Free List Sharding in Action [paper](https://www.microsoft.com/en-us/research/publication/mimalloc-free-list-sharding-in-action/)
