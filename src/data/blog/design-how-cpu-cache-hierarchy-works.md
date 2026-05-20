---
author: JZ
pubDatetime: 2026-05-20T06:23:00Z
modDatetime: 2026-05-20T06:23:00Z
title: System Design - How the CPU Cache Hierarchy Works
tags:
  - design-system
  - design-concurrency
description:
  "How modern CPU caches work: the memory hierarchy from registers to DRAM, cache lines, associativity, write policies, coherence protocols (MESI), and false sharing — with source code examples showing real performance impact."
---

## Table of contents

## Context

Your program's data ultimately lives in main memory (DRAM). But DRAM is slow — a single read takes roughly 100 nanoseconds. If the CPU waited for DRAM on every instruction, it would spend most of its time doing nothing. Modern processors execute an instruction every ~0.3ns, so a memory access is about 300 instruction-cycles of dead time.

The solution is a **cache hierarchy**: a series of progressively larger but slower memory buffers between the CPU core and DRAM. Each level stores recently accessed data, betting that the program will need it again soon (temporal locality) or will need nearby data next (spatial locality).

```
                    The Memory Hierarchy

  +--------+
  |  Regs  |   ~0.3 ns     (few KB, per-core)
  +--------+
       |
  +--------+
  | L1 Cache|   ~1 ns       (32-64 KB, per-core)
  +--------+
       |
  +--------+
  | L2 Cache|   ~4-7 ns     (256 KB - 1 MB, per-core)
  +--------+
       |
  +--------+
  | L3 Cache|   ~10-20 ns   (4-64 MB, shared across cores)
  +--------+
       |
  +--------+
  |  DRAM  |   ~100 ns      (GBs)
  +--------+
       |
  +--------+
  |  Disk  |   ~10,000+ ns  (TBs)
  +--------+

  Faster/smaller at top, slower/larger at bottom
```

This hierarchy exists because physics imposes a fundamental trade-off: **small memory can be fast, large memory must be slow**. The speed of light limits how quickly a signal can travel across a chip. A larger SRAM array means longer wires, more transistors to drive, and more time per access.

Let's walk through how a cache actually works, starting with its fundamental unit: the cache line.

## Cache Lines: The Unit of Transfer

CPUs never fetch a single byte from memory. They always fetch a fixed-size block called a **cache line** (typically 64 bytes on x86 and ARM). Even if your program reads a single `int` (4 bytes), the hardware loads the entire 64-byte block containing it.

```
  Memory address:  0x1000
  Your program reads: *(int*)0x1020  (4 bytes at offset 0x20)

  CPU fetches the entire cache line:
  +----------------------------------------------------------------+
  |  0x1000  0x1004  0x1008  ...  0x1020  ...  0x103C              |
  |  [byte 0] [byte 4] [byte 8]   [YOUR INT]   [byte 60]          |
  +----------------------------------------------------------------+
  |<--------------------- 64 bytes -------------------------------->|
```

This design exploits **spatial locality**: if you access one element of an array, you'll likely access the next one too. By loading 64 bytes at once, subsequent accesses are free cache hits.

Here's a classic demonstration. Traversing a 2D array row-by-row is fast because elements are contiguous in memory. Column-by-column traversal is slow because each access jumps to a different cache line:

```c
#define N 4096
int matrix[N][N];

// Fast: row-major traversal (sequential in memory)
// Each cache line serves 16 consecutive ints (64 bytes / 4 bytes)
long sum = 0;
for (int i = 0; i < N; i++)
    for (int j = 0; j < N; j++)
        sum += matrix[i][j];       // stride = 4 bytes

// Slow: column-major traversal (jumping across cache lines)
// Each access is 4096*4 = 16384 bytes apart — always a cache miss
long sum = 0;
for (int j = 0; j < N; j++)
    for (int i = 0; i < N; i++)
        sum += matrix[i][j];       // stride = 16384 bytes
```

On a typical machine, the column-major version runs **4-10x slower** than row-major for large arrays — purely because of cache misses.

## How the Cache Finds Data: Tags, Sets, and Associativity

When the CPU needs to check if a memory address is cached, it can't scan every line (that would be too slow). Instead, the address is split into three fields that tell the cache exactly where to look:

```
  64-bit memory address (example: 48 bits used)
  +--------------------+-----------+--------+
  |        Tag         |   Index   | Offset |
  |    (upper bits)    | (middle)  | (low)  |
  +--------------------+-----------+--------+
                             |         |
                             |         +---> Which byte within the 64B line
                             |               (6 bits for 64-byte lines)
                             |
                             +---> Which "set" in the cache to check
```

The **offset** (low 6 bits for 64-byte lines) selects the byte within the line. The **index** selects which set to look in. The **tag** is compared against stored tags to confirm a hit.

### Direct-Mapped vs. Set-Associative

A **direct-mapped** cache gives each set exactly one slot. Every address maps to one specific location. Simple and fast, but if two hot addresses map to the same set, they keep evicting each other (**conflict miss**).

A **set-associative** cache gives each set multiple slots (called "ways"). An 8-way set-associative cache lets 8 different addresses coexist in the same set:

```
  8-way set-associative cache (typical L1)

  Set 0:  [Way0] [Way1] [Way2] [Way3] [Way4] [Way5] [Way6] [Way7]
  Set 1:  [Way0] [Way1] [Way2] [Way3] [Way4] [Way5] [Way6] [Way7]
  Set 2:  [Way0] [Way1] [Way2] [Way3] [Way4] [Way5] [Way6] [Way7]
  ...
  Set N:  [Way0] [Way1] [Way2] [Way3] [Way4] [Way5] [Way6] [Way7]

  Each "way" stores:
  +-------+---+-------------------------------+
  |  Tag  | V | Data (64 bytes)               |    V = valid bit
  +-------+---+-------------------------------+

  On access: compute Index -> check all 8 tags in that set in parallel
```

Modern CPUs typically use:
- **L1:** 8-way set-associative (optimized for speed)
- **L2:** 8-16 way set-associative
- **L3:** 12-16 way or higher (more capacity, tolerates higher latency)

When all ways in a set are full, one must be evicted. The most common policy is **pseudo-LRU** (approximation of least-recently-used) because true LRU tracking is expensive in hardware.

## Write Policies: What Happens on a Store

When the CPU writes to a cached address, the cache and main memory become inconsistent. Two strategies handle this:

**Write-through:** Every write goes to both the cache and the next level immediately. Simple but generates heavy traffic on the memory bus.

**Write-back:** Writes only update the cache line, marking it "dirty." The line is written to the next level only when evicted. This is what modern CPUs use for L1/L2/L3 — it dramatically reduces memory bus traffic.

```
  Write-back flow:

  CPU writes to address X
       |
       v
  Is X in cache? ----NO----> "Write-allocate": fetch line from memory,
       |                      put in cache, then apply the write
      YES
       |
       v
  Update cache line
  Mark line as "dirty" (D bit = 1)
       |
       (line stays in cache until evicted)
       |
       v
  On eviction, if D=1:
       Write 64 bytes back to next level
```

The "write-allocate" policy (fetch on write miss) is almost universal because after writing one field of a struct, you'll likely write another field in the same cache line.

## Cache Coherence: The MESI Protocol

In a multicore system, each core has its own L1 and L2 caches. If Core 0 modifies a value, Core 1's cached copy becomes stale. **Cache coherence protocols** solve this. The most common is MESI (Modified, Exclusive, Shared, Invalid):

```
                    MESI State Machine

                +-- Read hit --+
                |              |
                v              |
  +-------+   Read   +-------+   Read    +-------+
  |       | -------> |       | --------> |       |
  |Invalid|          |Exclusive|          | Shared|
  |  (I)  | <------- |  (E)   | <------- |  (S)  |
  +-------+  Snoop   +---+---+   Other   +---+---+
       ^     Invalidate   |     reads it      |
       |                  | Write              | Write
       |                  v                    v
       |             +--------+          +--------+
       |             |Modified|          | (I) on |
       +------------ |  (M)   |          | other  |
        Evict/Snoop  +--------+          | cores  |
                                         +--------+
```

Each cache line in each core is in one of four states:

| State | Meaning |
|-------|---------|
| **Modified (M)** | This core has modified the line. No other core has a copy. Must write back before another core can read it. |
| **Exclusive (E)** | This core has the only copy, and it matches memory. Can silently transition to Modified on a write. |
| **Shared (S)** | Multiple cores may have this line. All copies match memory. Must invalidate others before writing. |
| **Invalid (I)** | This line is not valid. Must fetch from memory/another cache. |

When Core 0 writes to a Shared line, the protocol sends an **invalidation** message to all other cores holding that line, forcing their copies to state I. This happens over a hardware interconnect (like Intel's ring bus or mesh):

```
  Core 0              Interconnect            Core 1
    |                     |                     |
    | Write to X          |                     |
    | (state S -> M)      |                     |
    |---> Invalidate X -->|---> Invalidate X -->|
    |                     |                     | X: S -> I
    |                     |<--- Ack <-----------|
    |<--- Ack <-----------|                     |
    |                     |                     |
    | (proceed with       |                     |
    |  write, now M)      |                     |
```

## False Sharing: The Silent Performance Killer

Because coherence operates at cache-line granularity (64 bytes), two cores can interfere with each other even if they access **different variables** — as long as those variables share a cache line. This is **false sharing**.

```
  Cache line (64 bytes):
  +------------------+------------------+----------------------------+
  |  counter_core_0  |  counter_core_1  |        (padding)           |
  |  (8 bytes)       |  (8 bytes)       |                            |
  +------------------+------------------+----------------------------+

  Core 0 increments counter_core_0
  Core 1 increments counter_core_1

  Even though they touch DIFFERENT variables, they fight over the
  same cache line. Each write invalidates the other core's copy.
```

Here's a real example in C. The "bad" version has two counters adjacent in memory. The "good" version pads them to separate cache lines:

```c
#include <pthread.h>
#include <stdio.h>

#define ITERATIONS 100000000

// BAD: both counters on the same cache line
struct shared_bad {
    long counter0;
    long counter1;
};

// GOOD: padded to separate cache lines
struct shared_good {
    long counter0;
    char pad[64 - sizeof(long)];  // push counter1 to next cache line
    long counter1;
};

void* increment(void* arg) {
    long* counter = (long*)arg;
    for (long i = 0; i < ITERATIONS; i++)
        (*counter)++;
    return NULL;
}

// With shared_bad:  ~2.1 seconds (two threads)
// With shared_good: ~0.3 seconds (two threads)
// Single thread:    ~0.3 seconds
// The "bad" version is 7x slower due to false sharing!
```

The Linux kernel uses `____cacheline_aligned` and `__cacheline_aligned_in_smp` macros extensively to prevent false sharing in hot structures:

```c
// From include/linux/cache.h
#define ____cacheline_aligned __attribute__((__aligned__(L1_CACHE_BYTES)))

// Usage in kernel (simplified from kernel/sched/core.c)
struct rq {
    raw_spinlock_t    lock;
    unsigned int      nr_running;
    // ...
} ____cacheline_aligned;
```

Java's `@Contended` annotation and Go's internal padding in runtime structs serve the same purpose.

## Prefetching: Predicting the Future

Modern CPUs don't just react to cache misses — they try to **predict** what data you'll need next and fetch it in advance. Hardware prefetchers detect patterns like:

- **Sequential access:** reading addresses A, A+64, A+128 → prefetch A+192
- **Strided access:** reading A, A+256, A+512 → prefetch A+768

The CPU has dedicated circuitry that watches miss patterns and issues speculative loads:

```
  Time --->

  Demand loads:    |--miss--|  |--miss--|  |--miss--|  |--hit!-|  |--hit!-|
                   addr 0     addr 64     addr 128    addr 192   addr 256
                                                        ^          ^
                                                        |          |
  Prefetcher:              detects pattern,         data already in cache
                           starts prefetching       when demand arrives
                           ahead of demand
```

Software can also issue explicit prefetch hints. In C:

```c
#include <immintrin.h>

// Prefetch data into L1 cache (temporal — expect reuse)
_mm_prefetch(&array[i + 16], _MM_HINT_T0);

// Prefetch into L2 only (non-temporal — use once then discard)
_mm_prefetch(&array[i + 64], _MM_HINT_T1);
```

The Linux kernel uses `prefetch()` and `prefetchw()` macros for linked-list traversals where the next pointer's target won't be in cache:

```c
// From include/linux/prefetch.h
#define prefetch(x) __builtin_prefetch(x, 0, 3)   // read, high locality
#define prefetchw(x) __builtin_prefetch(x, 1, 3)  // write, high locality

// Usage in list traversal
#define list_for_each(pos, head) \
    for (pos = (head)->next; prefetch(pos->next), pos != (head); \
         pos = pos->next)
```

## Measuring Cache Behavior: perf stat

On Linux, the `perf` tool lets you observe cache behavior directly. Here's what a cache-friendly vs. cache-unfriendly program looks like:

```bash
# Row-major traversal (cache-friendly)
$ perf stat -e cache-misses,cache-references,L1-dcache-load-misses ./row_major
    Performance counter stats:
         12,341      cache-misses      # 0.2% of cache references
      6,291,456      cache-references
        198,432      L1-dcache-load-misses

# Column-major traversal (cache-unfriendly)
$ perf stat -e cache-misses,cache-references,L1-dcache-load-misses ./col_major
    Performance counter stats:
      4,891,234      cache-misses      # 78.1% of cache references
      6,260,112      cache-references
     16,531,200      L1-dcache-load-misses
```

The column-major version has **400x more cache misses** — directly explaining its slower runtime.

## Real-World Impact: How Systems Use Cache Knowledge

Understanding the cache hierarchy shapes how high-performance systems are built:

**Databases** (e.g., DuckDB, ClickHouse) use columnar storage so that scanning one column touches contiguous memory, maximizing cache utilization. Row stores scatter column values across cache lines.

**Hash tables** (e.g., Google's Swiss Table / Abseil `flat_hash_map`) store metadata bytes in a 16-byte "control group" that fits in a single SIMD register, allowing 16 slots to be probed with one instruction.

**Networking** (e.g., DPDK) uses huge pages (2MB or 1GB) to reduce TLB misses, and structures packet buffers to align with cache lines.

**Memory allocators** (e.g., jemalloc, tcmalloc) use per-CPU caches and size classes aligned to cache lines to minimize false sharing between threads.

## Summary

```
  Key Takeaways:

  1. Cache line = 64 bytes. All transfers happen at this granularity.
  2. Spatial locality matters: traverse data sequentially when possible.
  3. Temporal locality matters: reuse data while it's still in cache.
  4. False sharing kills multi-threaded performance. Pad hot per-core data.
  5. Hardware prefetchers help sequential/strided patterns automatically.
  6. MESI coherence is the hidden cost of shared mutable state.
  7. Measure with perf stat; don't guess where cache misses are.
```

## References

1. What Every Programmer Should Know About Memory, Ulrich Drepper (2007) [paper](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf)
2. Gallery of Processor Cache Effects, Igor Ostrovsky [blog](https://igoro.com/archive/gallery-of-processor-cache-effects/)
3. Intel 64 and IA-32 Architectures Optimization Reference Manual, Ch. 3 [doc](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
4. Linux kernel cache alignment macros [`include/linux/cache.h`](https://github.com/torvalds/linux/blob/master/include/linux/cache.h)
5. Linux kernel prefetch macros [`include/linux/prefetch.h`](https://github.com/torvalds/linux/blob/master/include/linux/prefetch.h)
6. MESI protocol [wiki](https://en.wikipedia.org/wiki/MESI_protocol)
7. False sharing and `__cacheline_aligned` in Linux [LWN article](https://lwn.net/Articles/258228/)
8. perf-stat manual page [doc](https://man7.org/linux/man-pages/man1/perf-stat.1.html)
