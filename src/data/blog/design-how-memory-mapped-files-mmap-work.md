---
author: JZ
pubDatetime: 2026-07-26T12:01:00Z
modDatetime: 2026-07-26T12:01:00Z
title: System Design - How Memory-Mapped Files (mmap) Work
tags:
  - design-system
  - design-os
description:
  "How memory-mapped files (mmap) work: virtual memory mapping, page faults, kernel page cache interaction, copy-on-write semantics, and why databases love and hate them."
---

## Table of contents

## Context

Normally when a program reads a file, it calls `read()`, which copies bytes from the kernel's page cache into a user-space buffer. This copy costs CPU time and doubles memory usage (one copy in the kernel, one in your program). Memory-mapped files eliminate this copy by letting your program access file data directly through virtual memory addresses.

The system call is `mmap()` on Unix systems (and `CreateFileMapping` / `MapViewOfFile` on Windows). It tells the kernel: "make this file appear as if it were a chunk of RAM starting at this address." After that, reading a byte from that address reads the file, and (with the right flags) writing to that address writes the file.

```
                    Traditional I/O vs. Memory-Mapped I/O

   Traditional read():                Memory-mapped:

   +------------+                     +------------+
   | User buffer| <-- copy --+        | User space |
   +------------+            |        | (virtual)  |
                             |        +-----+------+
                             |              |
                             |              | page table entry
                             |              | points directly here
                             |              v
   +------------+            |        +------------+
   | Page cache | -----------+        | Page cache |
   | (kernel)   |                     | (kernel)   |
   +------+-----+                     +------+-----+
          |                                  |
          v                                  v
   +------------+                     +------------+
   |    Disk    |                     |    Disk    |
   +------------+                     +------------+

   2 copies of data in RAM            1 copy of data in RAM
```

Programs like databases, search engines, and video players use `mmap` to avoid this overhead. Let's trace exactly what happens from the system call down to the hardware.

## The mmap System Call

Here is the signature on Linux:

```c
void *mmap(
    void   *addr,    // hint: where in virtual address space (usually NULL = let kernel choose)
    size_t  length,  // how many bytes to map
    int     prot,    // protection: PROT_READ, PROT_WRITE, PROT_EXEC
    int     flags,   // MAP_SHARED, MAP_PRIVATE, MAP_ANONYMOUS, ...
    int     fd,      // file descriptor (or -1 for anonymous mappings)
    off_t   offset   // starting offset in the file
);
```

A typical call looks like:

```c
int fd = open("/data/users.db", O_RDONLY);
struct stat st;
fstat(fd, &st);

// Map the entire file into memory
char *data = mmap(NULL, st.st_size, PROT_READ, MAP_SHARED, fd, 0);

// Now access file contents like an array
printf("First byte: %c\n", data[0]);
printf("Byte at offset 4096: %c\n", data[4096]);

// Done
munmap(data, st.st_size);
close(fd);
```

After `mmap` returns, `data` is a pointer to a virtual address range. But here is the key insight: **no file data has been loaded yet.** The kernel only created a mapping in the process's page table. The actual loading happens on demand through page faults.

## What Happens: The Page Fault Dance

When the CPU tries to read `data[4096]`, the following sequence occurs:

```
  CPU                 MMU              Kernel            Disk
   |                   |                 |                |
   | load data[4096]   |                 |                |
   |------------------>|                 |                |
   |                   | page table      |                |
   |                   | lookup:         |                |
   |                   | not present!    |                |
   |                   |                 |                |
   |                   | #PF (page       |                |
   |                   | fault trap)     |                |
   |                   |---------------->|                |
   |                   |                 |                |
   |                   |                 | find VMA for   |
   |                   |                 | faulting addr  |
   |                   |                 |                |
   |                   |                 | check page     |
   |                   |                 | cache:         |
   |                   |                 |                |
   |                   |       +---------|--------+       |
   |                   |       | cached? |        |       |
   |                   |       +----+----+--------+       |
   |                   |            |             |       |
   |                   |         yes |          no |       |
   |                   |            v             v       |
   |                   |       map existing    submit     |
   |                   |       page into       I/O       |
   |                   |       page table      request   |
   |                   |            |             |------>|
   |                   |            |             |       |
   |                   |            |             | DMA   |
   |                   |            |             |<------|
   |                   |            |             |       |
   |                   |            |        map page     |
   |                   |            |        into PT      |
   |                   |            |             |       |
   |                   |<-----------|-------------|       |
   |                   |                 |                |
   |                   | retry the       |                |
   |                   | instruction     |                |
   |<------------------|                 |                |
   | got the byte!     |                 |                |
```

Step by step:

1. **CPU executes a load instruction** for address `data + 4096`.
2. **MMU walks the page table**, finds the page table entry (PTE) marked "not present."
3. **Hardware raises a page fault** (trap #14 on x86). Control transfers to the kernel's page fault handler.
4. **Kernel identifies the mapping** by searching the process's VMA (Virtual Memory Area) red-black tree. It finds this address belongs to an mmap'd file region.
5. **Kernel checks the page cache.** If the page is already cached (perhaps another process read it earlier), no disk I/O is needed — just wire the existing page into this process's page table.
6. **If not cached**, the kernel allocates a page frame, submits a read request to the block layer, and the disk controller DMAs the data into the page frame.
7. **Kernel updates the page table** entry to point to the physical page and marks it present.
8. **CPU retries the faulting instruction**, which now succeeds.

The program never knew any of this happened. From its perspective, reading `data[4096]` was just a normal memory access (albeit one that took microseconds instead of nanoseconds if it triggered I/O).

## Virtual Memory Areas (VMAs)

The kernel tracks each mapping with a VMA structure. When you call `mmap`, the kernel creates (or extends) a VMA:

```
  Process Virtual Address Space

  0x0000000000000000
  |                    |
  | ...                |
  |                    |
  +--------------------+ 0x7f3a00000000   <-- VMA start
  |                    |
  |  mmap'd region     |   vm_file = /data/users.db
  |  (4 pages)         |   vm_pgoff = 0
  |                    |   vm_flags = VM_READ | VM_SHARED
  +--------------------+ 0x7f3a00004000   <-- VMA end
  |                    |
  | ...                |
  |                    |
  +--------------------+ 0x7ffc00000000   <-- stack
  |       stack        |
  +--------------------+

  Each VMA records:
  - start and end virtual addresses
  - permissions (read/write/exec)
  - backing file + offset
  - flags (shared vs. private)
```

The kernel organizes VMAs in a maple tree (Linux 6.1+; previously a red-black tree) for O(log n) lookup during page faults. The relevant structure in the Linux kernel source is [`struct vm_area_struct`](https://github.com/torvalds/linux/blob/master/include/linux/mm_types.h):

```c
struct vm_area_struct {
    unsigned long vm_start;      // first byte address
    unsigned long vm_end;        // first byte AFTER the region
    pgoff_t vm_pgoff;            // offset in file (in pages)
    struct file *vm_file;        // the backing file (or NULL)
    vm_flags_t vm_flags;         // protection + MAP_SHARED/PRIVATE
    const struct vm_operations_struct *vm_ops;  // fault handler, etc.
    // ...
};
```

## MAP_SHARED vs MAP_PRIVATE (Copy-on-Write)

The `flags` argument to `mmap` fundamentally changes how writes behave:

```
  MAP_SHARED                           MAP_PRIVATE (copy-on-write)

  Process A    Process B               Process A    Process B
  page table   page table              page table   page table
      |             |                       |             |
      |   shared    |                       |   shared    |
      +----+--------+                       +----+--------+
           |                                     |
           v                                     v
  +------------------+                  +------------------+
  | Physical page    |                  | Physical page    |  (read-only PTE)
  | in page cache    |                  | in page cache    |
  +------------------+                  +------------------+
           |                                     
           v                            On write by Process A:
  +------------------+                  
  |   Disk file      |                  +------------------+
  +------------------+                  | COPY of page     |  <-- new private page
                                        | (Process A only) |
  Writes by either process              +------------------+
  modify the page cache and             
  eventually flush to disk.             Original page cache page
                                        remains unchanged for Process B.
```

**MAP_SHARED:** Multiple processes see the same physical pages. A write by one process is visible to all others and will eventually be flushed to the file on disk. This is how databases implement shared buffer pools.

**MAP_PRIVATE:** The mapping starts by sharing pages with the page cache (for memory efficiency). But if the process writes to a page, the kernel makes a private copy first (the "copy-on-write" or COW mechanism). The file on disk is never modified. This is how the OS loads executables — all processes share the read-only `.text` segment pages.

The COW page fault path:

```
  1. Process writes to a MAP_PRIVATE page
  2. PTE is marked read-only (even though PROT_WRITE was requested)
  3. CPU raises a write-protection page fault
  4. Kernel's fault handler checks: is this a COW page?
  5. Yes: allocate a new page frame
  6. Copy the contents of the original page
  7. Update PTE to point to the new private page (now writable)
  8. Retry the write instruction — succeeds on the private copy
```

## The Page Cache: Where mmap and read() Meet

A critical insight: **mmap and regular `read()`/`write()` share the same page cache.** If you `read()` a file and another process has it `mmap`'d, they are both using the same physical pages:

```
  +------------------+      +------------------+
  | Process A        |      | Process B        |
  | (uses mmap)      |      | (uses read())    |
  +--------+---------+      +--------+---------+
           |                          |
           | page table               | copy into
           | points to                | user buffer
           |                          |
           v                          |
  +--------|--------------------------|--------+
  |        v                          v        |
  |  +-----------+  +-----------+  +-----------+
  |  |  page 0   |  |  page 1   |  |  page 2   |   Page Cache
  |  +-----------+  +-----------+  +-----------+
  |                                            |
  +--------------------------------------------+
           |
           v
  +--------------------------------------------+
  |              /data/users.db                |
  +--------------------------------------------+
```

The page cache is indexed by `(inode, offset)` pairs. When the mmap fault handler needs page 1 of a file, it calls `filemap_get_folio()` (formerly `find_get_page()`), which looks up the page in a per-inode xarray. This is the same lookup path that `read()` uses.

## Read-Ahead and Fault-Around

Fetching one page at a time from disk would be painfully slow. The kernel uses two optimizations:

**Read-ahead (prefetch):** When it detects sequential access patterns, the kernel prefetches upcoming pages before they are faulted. The read-ahead window starts small (a few pages) and grows as sequential access continues, up to a maximum (typically 256 KB or 64 pages).

**Fault-around:** When a page fault occurs, the kernel also maps nearby pages that are already in the page cache into the process's page table. This avoids future page faults for pages that are already in RAM but just not yet mapped.

```
  Page fault at page 5:

  Page cache state:   [0:cached] [1:cached] [2:--] [3:cached] [4:cached] [5:--] [6:--] [7:--]
                                                                            ^
                                                                         faulted

  Kernel actions:
  1. Load page 5 from disk (the faulted page)
  2. Read-ahead: also load pages 6, 7 (sequential prediction)
  3. Fault-around: map pages 3, 4 into page table (already cached, just not mapped)

  After:             [0:cached] [1:cached] [2:--] [3:mapped] [4:mapped] [5:mapped] [6:cached] [7:cached]
```

## Dirty Pages and Writeback

When a process writes to a MAP_SHARED page, the kernel marks the page as **dirty**. Dirty pages must eventually be written back to disk. This happens:

1. **Periodically** — the `writeback` kernel thread wakes up every few seconds (controlled by `dirty_writeback_centisecs`, default 500 = 5 seconds).
2. **When memory is low** — the kernel reclaims clean pages first; if that's not enough, it writes back dirty pages.
3. **On explicit `msync()` or `fsync()`** — the program requests synchronous flush.
4. **On `munmap()` or process exit** — dirty pages are scheduled for writeback.

```c
// Force dirty pages to disk
msync(data, length, MS_SYNC);   // blocks until write completes
msync(data, length, MS_ASYNC);  // schedules write, returns immediately
```

The dirty page lifecycle:

```
  +--------+     write      +---------+    writeback     +--------+
  | Clean  | ------------> |  Dirty  | --------------> | Clean  |
  | page   |               |  page   |   (to disk)     | page   |
  +--------+               +---------+                  +--------+
       ^                                                     |
       |                                                     |
       +-----------------------------------------------------+
                      page stays in cache
```

## Why Databases Love mmap (and Why Some Don't)

**Advantages:**

- **Zero-copy access:** No `memcpy` from kernel to user space. For read-heavy workloads, this can be 2-3x faster.
- **Automatic caching:** The kernel's page cache handles eviction, LRU policy, and memory pressure — you don't have to write a buffer pool.
- **Lazy loading:** Pages load on demand. Map a 100GB file but only touch 1GB? Only 1GB of RAM is used.
- **Shared memory for free:** Multiple processes mapping the same file automatically share physical pages.

**Disadvantages (why some databases avoid mmap):**

- **No control over eviction.** The kernel decides which pages to evict under memory pressure. A database might know that certain pages (e.g., B-tree root nodes) should never be evicted, but it cannot express this with mmap.
- **No control over I/O scheduling.** With `read()`, a database can issue I/O in the optimal order for its access pattern. With mmap, page faults happen wherever the application touches memory, and the kernel may not batch them efficiently.
- **Writeback is asynchronous and opaque.** A dirty page might be flushed to disk at any time. For a database that needs write-ahead logging (WAL) guarantees, this is dangerous — a data page might hit disk before the corresponding WAL record.
- **SIGBUS on I/O errors.** If a disk read fails during a page fault, the kernel delivers SIGBUS to the process (a fatal signal by default). With `read()`, you get a clean error return code.
- **TLB shootdowns on `munmap`.** Unmapping pages requires flushing TLB entries on all CPUs that might have the mapping cached — an expensive cross-CPU interrupt.

This is why **SQLite** uses mmap as an optional optimization (for reads), **MongoDB** used mmap as its original storage engine (MMAPv1, now deprecated in favor of WiredTiger which uses `read()`/`write()`), and **PostgreSQL** explicitly avoids mmap for its buffer pool (preferring its own shared buffer manager with fine-grained eviction control).

## mmap in the Real World

**Executable loading:** When you run `./myprogram`, the kernel doesn't load the entire binary into RAM. It `mmap`s the executable's segments (text, rodata, data, bss) with MAP_PRIVATE. Code pages are loaded on demand as the CPU executes instructions.

**Shared libraries:** `libc.so` is loaded once into physical memory and MAP_PRIVATE-mapped into every process. Thousands of processes share the same physical pages for glibc.

**tmpfs / shmem:** `MAP_ANONYMOUS | MAP_SHARED` creates a memory region backed by the tmpfs filesystem (swap-backed). This is how `shm_open` and POSIX shared memory work.

**Huge pages:** For large mappings, the kernel can use 2MB (or 1GB) huge pages instead of 4KB pages. This reduces TLB pressure. You can request this with `MAP_HUGETLB` or by using Transparent Huge Pages (THP).

```c
// Map 1GB with explicit huge pages
void *p = mmap(NULL, 1UL << 30, PROT_READ | PROT_WRITE,
               MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB, -1, 0);
```

## A Note on madvise

The `madvise()` system call lets you hint to the kernel about your access pattern. This is crucial for getting good mmap performance:

```c
madvise(addr, length, MADV_SEQUENTIAL);  // will access sequentially (aggressive read-ahead)
madvise(addr, length, MADV_RANDOM);      // will access randomly (disable read-ahead)
madvise(addr, length, MADV_WILLNEED);    // will need this soon (prefetch now)
madvise(addr, length, MADV_DONTNEED);    // done with this (kernel can reclaim the pages)
```

`MADV_DONTNEED` is particularly powerful: it tells the kernel to drop the pages immediately, giving the application some control over memory usage that plain mmap otherwise lacks.

## References

1. Linux man page, mmap(2) [man](https://man7.org/linux/man-pages/man2/mmap.2.html)
2. Linux kernel source, vm_area_struct [`include/linux/mm_types.h`](https://github.com/torvalds/linux/blob/master/include/linux/mm_types.h)
3. Linux kernel source, filemap fault handler [`mm/filemap.c`](https://github.com/torvalds/linux/blob/master/mm/filemap.c)
4. Andrew S. Tanenbaum, "Modern Operating Systems" — Virtual Memory chapter
5. Are You Sure You Want to Use MMAP in Your Database Management System? [paper](https://db.cs.cmu.edu/papers/2022/cidr2022-p13-crotty.pdf)
6. LWN.net, The maple tree [article](https://lwn.net/Articles/845507/)
7. SQLite mmap documentation [doc](https://www.sqlite.org/mmap.html)
