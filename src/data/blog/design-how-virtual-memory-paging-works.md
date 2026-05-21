---
author: JZ
pubDatetime: 2026-05-21T06:23:00Z
modDatetime: 2026-05-21T06:23:00Z
title: System Design - How Virtual Memory and Paging Works
tags:
  - design-system
description:
  "How virtual memory and paging works in modern operating systems: address translation, page tables, TLB, page faults, multi-level page tables, and a walkthrough of Linux's implementation."
---

## Table of contents

## Context

Every program you run believes it has the entire address space to itself. A Python script allocating a list, a Java application spinning up threads, a database engine mapping files — they all see a flat, private address space starting from 0 up to some large number. But physical RAM is shared, limited, and fragmented. The gap between what programs see and what hardware provides is bridged by **virtual memory**.

Virtual memory is one of the most important abstractions in computer science. It provides three guarantees simultaneously:

1. **Isolation**: One process cannot read or corrupt another process's memory
2. **Illusion of size**: A process can use more memory than physically exists
3. **Simplicity**: Every process sees a clean, contiguous address space

The mechanism behind this is **paging**: dividing both virtual and physical memory into fixed-size blocks and maintaining a mapping between them.

```
   Process A sees:              Physical RAM:           Process B sees:
   +-------------+                                     +-------------+
   | 0x0000      |             +------------+          | 0x0000      |
   | code        |------------>| frame 7    |<---------| code        |
   +-------------+             +------------+          +-------------+
   | 0x1000      |             | frame 2    |          | 0x1000      |
   | heap        |---+         +------------+          | heap        |---+
   +-------------+   |         | frame 5    |          +-------------+   |
   | ...         |   +-------->| A's heap   |          | ...         |   |
   +-------------+             +------------+          +-------------+   |
   | 0xFFFF      |             | frame 9    |          | 0xFFFF      |   |
   | stack       |--+          +------------+          | stack       |-+ |
   +-------------+  |         | frame 12   |<---------+-------------+ | |
                    +-------->| A's stack  |                           | |
                              +------------+                           | |
                              | frame 14   |<--------------------------+ |
                              +------------+                             |
                              | frame 20   |<----------------------------+
                              +------------+
```

Both processes think they own address `0x1000`, but the hardware maps them to completely different physical frames. Neither can access the other's memory.

## Pages and Frames

Virtual memory divides the address space into fixed-size chunks called **pages** (virtual side) and **frames** (physical side). On most modern systems (x86-64, ARM64), the standard page size is **4 KB** (4096 bytes).

```
   Virtual Address Space               Physical Memory
   (per process)                        (shared)

   +--------+ page 0                    +--------+ frame 0
   | 4 KB   |                           | 4 KB   |
   +--------+ page 1                    +--------+ frame 1
   | 4 KB   |                           | 4 KB   |
   +--------+ page 2                    +--------+ frame 2
   | 4 KB   |                           | 4 KB   |
   +--------+                           +--------+
   | ...    |                           | ...    |
   +--------+ page N                    +--------+ frame M
   | 4 KB   |                           | 4 KB   |
   +--------+                           +--------+

   N >> M  (virtual space >> physical)
```

A 64-bit process has a virtual address space of $2^{48}$ bytes (on x86-64, only 48 bits are used). That's 256 TB divided into $2^{36}$ = 68 billion pages. Physical RAM might only be 16 GB ($2^{22}$ = 4 million frames). The OS decides which virtual pages map to which physical frames, and which pages live on disk.

## Address Translation

When the CPU executes an instruction like `MOV RAX, [0x7fff12340abc]`, the address `0x7fff12340abc` is a **virtual address**. The hardware must translate it to a physical address before accessing RAM.

The translation splits the virtual address into two parts:

```
   Virtual Address (48 bits on x86-64):

   +--------------------------------------------+-----------+
   |        Virtual Page Number (VPN)           |  Offset   |
   |              (36 bits)                     | (12 bits) |
   +--------------------------------------------+-----------+

   Example: 0x7fff12340abc
   VPN = 0x7fff12340a   (identifies which page)
   Offset = 0xbc        (position within the page, 0-4095 in hex 0-FFF)

   Translation:
   VPN  ------------>  Physical Frame Number (PFN)
                       (looked up in the page table)

   Physical Address = PFN << 12 | Offset
```

The **offset** passes through unchanged — it's the position within a page, and pages and frames are the same size. Only the page number is translated.

## The Page Table

The mapping from virtual page numbers to physical frame numbers is stored in a **page table**. Conceptually, it's an array indexed by VPN:

```
   Page Table (conceptual)
   +-------+-------+-------+
   | VPN   | PFN   | Flags |
   +-------+-------+-------+
   |   0   |  --   |  I    |  I = Invalid (not mapped)
   |   1   |  42   |  V,R  |  V = Valid, R = Read-only
   |   2   |  97   |  V,RW |  RW = Read-Write
   |   3   |  --   |  I    |
   |   4   | disk  |  V,D  |  D = on Disk (swapped out)
   |   5   |  12   |  V,RW |
   +-------+-------+-------+
```

Each entry (called a **Page Table Entry** or PTE) contains:
- **Present/Valid bit**: Is this page currently in physical memory?
- **Physical Frame Number**: Where in RAM this page lives
- **Permission bits**: Read, Write, Execute, User/Kernel
- **Accessed bit**: Has this page been read recently? (used by page replacement)
- **Dirty bit**: Has this page been written to? (must write back to disk before evicting)

### The Problem: Table Size

A single-level page table for a 48-bit address space would need $2^{36}$ entries. At 8 bytes per entry, that's **512 GB per process** — far more than total RAM! We need a structure that's sparse: it only allocates entries for memory the process actually uses.

## Multi-Level Page Tables

The solution is a **hierarchical page table** (also called a multi-level or radix tree page table). Instead of one flat array, the page table is a tree. On x86-64, it's 4 levels deep (or 5 with LA57):

```
   48-bit Virtual Address decomposed:

   +--------+--------+--------+--------+----------+
   | PML4   | PDPT   |  PD    |  PT    |  Offset  |
   | 9 bits | 9 bits | 9 bits | 9 bits | 12 bits  |
   +--------+--------+--------+--------+----------+
     Level 4  Level 3  Level 2  Level 1    (page)

   Each level has 2^9 = 512 entries
   Each entry is 8 bytes => each table is 4 KB (one page!)
```

Translation walks through four tables:

```
   CR3 register (points to PML4 base)
        |
        v
   +----------+      +----------+      +----------+      +----------+
   |  PML4    |      |  PDPT    |      |   PD     |      |   PT     |
   | Table    |      | Table    |      | Table    |      | Table    |
   +----------+      +----------+      +----------+      +----------+
   | entry 0  |      | entry 0  |      | entry 0  |      | entry 0  |
   | entry 1  |      | entry 1  |      | entry 1  |      | entry 1  |
   | ...      |      | ...      |      | ...      |      | ...      |
   | entry i  |----->| entry j  |----->| entry k  |----->| entry l  |---> PFN
   | ...      |      | ...      |      | ...      |      | ...      |
   | entry 511|      | entry 511|      | entry 511|      | entry 511|
   +----------+      +----------+      +----------+      +----------+

   PML4[i] -> PDPT[j] -> PD[k] -> PT[l] -> Physical Frame

   Total lookups: 4 memory accesses (without TLB)
```

Why this is efficient: if a process only uses a few pages, most of the intermediate tables never get allocated. A minimal process might need just 5 pages of tables: 1 PML4 + 1 PDPT + 1 PD + 1 PT + the actual data page. That's 20 KB of table overhead instead of 512 GB.

## The TLB: Making It Fast

Four memory accesses for every single instruction would be catastrophically slow. The hardware uses a cache called the **Translation Lookaside Buffer (TLB)**:

```
   CPU executes: MOV RAX, [virtual_addr]
        |
        v
   +---------+
   |   TLB   |  (hardware cache, ~64-1024 entries)
   |  lookup  |
   +----+----+
        |
   +----+----+
   |         |
   v         v
  HIT       MISS
   |         |
   v         v
  PFN      Walk the 4-level
  (fast!)  page table in RAM
           (slow, ~100 cycles)
           then cache result
           in TLB
```

The TLB is a small, fully-associative cache inside the CPU. Each entry maps a virtual page number directly to a physical frame number plus permissions. A TLB hit resolves the translation in **1-2 cycles**. A TLB miss triggers a **page table walk** (4 memory accesses = ~100 cycles on modern hardware).

TLB hit rates are typically **>99%** for well-behaved programs due to spatial and temporal locality:
- Programs tend to access the same pages repeatedly (loops, stack)
- Sequential access stays within the same page for 4096 bytes

### TLB Shootdowns

When the OS modifies a page table (e.g., freeing memory, changing permissions), it must invalidate TLB entries on **all** CPUs that might have cached translations for that process. This is called a **TLB shootdown** — the OS sends an inter-processor interrupt (IPI) to other cores, forcing them to flush the stale entry. Shootdowns are expensive and are a significant cost in multi-core systems.

## Page Faults

When the CPU accesses a virtual address whose page table entry is marked **not present**, the hardware triggers a **page fault** — a trap into the OS kernel. Page faults come in three flavors:

```
   CPU access to virtual address
        |
        v
   Page Table Entry check
        |
   +----+----+----+
   |         |         |
   v         v         v
  Valid &   Invalid   Valid but
  Present   (never    not present
  (normal   mapped)   (on disk)
   access)      |         |
                v         v
           Segfault   "Major" fault:
           (SIGSEGV)  load from disk

   Additionally:
   - Write to read-only page -> may trigger Copy-on-Write
   - Access to lazily-allocated page -> allocate frame, zero it
```

### Minor Faults (Lazy Allocation)

When you call `malloc(1 GB)`, the OS doesn't immediately allocate 1 GB of physical RAM. It just creates page table entries marked "not present." The first access to each page triggers a **minor fault**: the OS allocates a physical frame, zeros it, maps it, and resumes the instruction:

```
   Process calls malloc(4096):
   +------------------+
   | OS creates PTE:  |
   | VPN=X, PFN=none  |
   | present=0        |
   +------------------+
           |
           | (later) process writes to page X
           v
   +------------------+
   | PAGE FAULT!      |
   | minor fault      |
   +------------------+
           |
           v
   +------------------+
   | OS: allocate     |
   | physical frame,  |
   | zero it, update  |
   | PTE: PFN=Y,      |
   | present=1        |
   +------------------+
           |
           v
   Instruction retries, succeeds
```

This is called **demand paging** or **lazy allocation**. It means processes can `malloc` far more memory than physically exists — the OS only commits physical RAM when the pages are actually touched.

### Major Faults (Swapping)

If physical memory is full and the OS needs a frame for a new page, it picks a victim page (using an algorithm like LRU approximation), writes it to the **swap** area on disk (if dirty), and reclaims the frame. The victim's PTE is marked "not present, on disk."

When the evicted page is accessed later, a **major fault** occurs: the OS reads the page from swap back into a physical frame. This is extremely slow (microseconds for SSD, milliseconds for HDD) compared to a normal memory access (nanoseconds).

```
   Physical RAM is full. Process A touches a new page.

   OS must evict something:
   1. Pick victim (e.g., page from process B, least recently used)
   2. If dirty, write to swap disk
   3. Mark victim's PTE: present=0, location=swap_offset
   4. Give the freed frame to process A

   Later, process B touches the evicted page:
   1. PAGE FAULT (major)
   2. OS reads page from swap into a new frame
   3. Updates B's PTE: present=1, PFN=new_frame
   4. Instruction retries
```

## Copy-on-Write (COW)

When a process calls `fork()`, the child gets a copy of the parent's entire address space. Copying all physical pages would be extremely expensive. Instead, the OS uses **copy-on-write**:

```
   Before fork():
   Parent's page table:    Physical RAM:
   VPN 5 -> frame 42 (RW)   frame 42: [data]

   After fork():
   Parent's page table:    Physical RAM:          Child's page table:
   VPN 5 -> frame 42 (R)    frame 42: [data]     VPN 5 -> frame 42 (R)
                             (shared!)

   Both PTEs now marked READ-ONLY.

   When child writes to VPN 5:
   1. PAGE FAULT (write to read-only page)
   2. OS sees this is a COW page
   3. Allocates new frame 99, copies frame 42 into it
   4. Child's PTE: VPN 5 -> frame 99 (RW)
   5. If parent is only remaining user, parent's PTE: frame 42 (RW)
   6. Instruction retries, write succeeds
```

This optimization means `fork()` is nearly free regardless of process size — only the page tables are copied (a few KB), not the actual data (potentially GBs). Pages are only duplicated when actually modified.

## Linux Implementation

Linux implements virtual memory in the `mm/` subsystem. Key files:

### The `mm_struct`: Per-Process Memory Map

Each process has an `mm_struct` that describes its address space:

```c
// https://github.com/torvalds/linux/blob/master/include/linux/mm_types.h
struct mm_struct {
    pgd_t *pgd;                    // pointer to top-level page table (PML4)
    atomic_long_t pgtables_bytes;  // memory used by page tables
    unsigned long total_vm;         // total pages mapped
    unsigned long locked_vm;        // pages locked in RAM (can't be swapped)
    unsigned long data_vm;          // pages in data segment
    unsigned long stack_vm;         // pages in stack
    // ... Virtual Memory Areas (VMAs) ...
};
```

### Virtual Memory Areas (VMAs)

Linux doesn't track every page individually in software. Instead, it groups contiguous pages with the same properties into **VMAs**:

```
   Process address space (via /proc/<pid>/maps):

   Start        End          Perm  Description
   00400000  -  00452000     r-xp  code (.text)
   00651000  -  00652000     r--p  read-only data
   00652000  -  00653000     rw-p  data (.bss)
   7f1a2000  -  7f1a5000     rw-p  heap
   7ffd8000  -  7fff9000     rw-p  stack
   ...

   Each range is one VMA (struct vm_area_struct)
```

```c
// https://github.com/torvalds/linux/blob/master/include/linux/mm_types.h
struct vm_area_struct {
    unsigned long vm_start;     // start virtual address
    unsigned long vm_end;       // end virtual address
    pgprot_t vm_page_prot;      // access permissions
    unsigned long vm_flags;     // flags (read, write, exec, shared, ...)
    struct file *vm_file;       // backing file (NULL for anonymous memory)
    // ...
};
```

### Page Fault Handler

When a page fault occurs on x86-64 Linux, the CPU pushes an error code and jumps to the handler:

```c
// https://github.com/torvalds/linux/blob/master/arch/x86/mm/fault.c
static void __do_page_fault(struct pt_regs *regs, unsigned long error_code,
                            unsigned long address) {
    struct vm_area_struct *vma;
    struct mm_struct *mm = current->mm;

    // Find the VMA containing the faulting address
    vma = find_vma(mm, address);
    if (!vma || vma->vm_start > address) {
        // No VMA covers this address -> segfault
        bad_area(regs, error_code, address);
        return;
    }

    // Check permissions
    if (error_code & X86_PF_WRITE) {
        if (!(vma->vm_flags & VM_WRITE)) {
            bad_area_access_error(regs, error_code, address);
            return;
        }
    }

    // Handle the fault (allocate page, load from disk, COW, etc.)
    handle_mm_fault(vma, address, flags, regs);
}
```

The `handle_mm_fault` function walks the page table levels, allocating intermediate tables as needed, and eventually either:
- Allocates a zero page (anonymous memory, first access)
- Reads from disk (file-backed page or swap)
- Performs copy-on-write (write to shared page)

### Page Replacement: The Clock Algorithm

When physical memory runs low, the Linux kernel's `kswapd` daemon wakes up and reclaims pages. Linux uses a variant of the **Clock algorithm** (approximation of LRU) with two lists:

```
   Active List (recently used):
   +-----+-----+-----+-----+-----+
   | pg1 | pg2 | pg3 | pg4 | pg5 |
   +-----+-----+-----+-----+-----+
     ^
     Pages promoted here when accessed while on inactive list

   Inactive List (eviction candidates):
   +-----+-----+-----+-----+-----+
   | pg6 | pg7 | pg8 | pg9 | pg10|
   +-----+-----+-----+-----+-----+
     ^
     Pages evicted from here (written to swap if dirty)
```

The kernel periodically moves pages from the active list to the inactive list, clearing their "accessed" bit. If a page on the inactive list is accessed again, it gets promoted back to the active list. Pages that remain on the inactive list untouched are evicted.

## Huge Pages

4 KB pages mean lots of TLB entries are needed to cover working sets. A 2 MB working set requires 512 TLB entries with 4 KB pages, but only 1 entry with 2 MB pages. Modern CPUs support **huge pages** (2 MB or 1 GB on x86-64):

```
   Standard Pages (4 KB):         Huge Pages (2 MB):
   +--+--+--+--+--+--+--+--+     +--------+--------+
   |4K|4K|4K|4K|4K|4K|4K|4K|     |  2 MB  |  2 MB  |
   +--+--+--+--+--+--+--+--+     +--------+--------+
   512 TLB entries for 2 MB       1 TLB entry for 2 MB
```

Linux supports huge pages in two ways:
- **Explicit**: `mmap` with `MAP_HUGETLB`, or `/proc/sys/vm/nr_hugepages`
- **Transparent Huge Pages (THP)**: The kernel automatically promotes contiguous 4 KB pages into 2 MB pages when possible

Databases (like TiDB, PostgreSQL) and JVMs often use huge pages to reduce TLB misses for their large heap allocations.

## Putting It All Together

Here's the full path of a memory access:

```
   CPU instruction: MOV RAX, [0x7fff12340abc]
        |
        v
   1. TLB lookup for VPN=0x7fff12340a
        |
   +----+----+
   |         |
  HIT       MISS
   |         |
   |    2. Walk 4-level page table:
   |       CR3 -> PML4[0xFF] -> PDPT[0x1FC]
   |               -> PD[0x091] -> PT[0x340]
   |         |
   |    3. PT entry found?
   |    +----+----+----+
   |    |         |         |
   |  Present  Not present  Permission
   |    |      (page fault)  violation
   |    |         |          (segfault or COW)
   |    |    4. OS handles:
   |    |       - allocate frame
   |    |       - load from disk
   |    |       - update PTE
   |    |       - retry instruction
   |    |         |
   v    v         v
   PFN = entry.frame_number
        |
   5. Physical address = PFN << 12 | 0xabc
        |
   6. Access physical RAM (or L1/L2/L3 cache)
        |
        v
   Data returned to CPU register
```

This entire process — from virtual address to data in register — takes 1-4 nanoseconds on a TLB hit, or ~100 nanoseconds on a TLB miss (page table walk). A major page fault (reading from SSD swap) takes ~100 microseconds — 100,000x slower than a TLB hit. This is why keeping your working set in physical RAM matters so much for performance.

## References

1. Bryant, Randal E. and O'Hallaron, David R. "Computer Systems: A Programmer's Perspective." 3rd Edition, Chapter 9: Virtual Memory.
2. Intel 64 and IA-32 Architectures Software Developer's Manual, Volume 3A, Chapter 4: Paging. [Manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
3. Linux kernel source: page fault handler [`arch/x86/mm/fault.c`](https://github.com/torvalds/linux/blob/master/arch/x86/mm/fault.c)
4. Linux kernel source: memory types [`include/linux/mm_types.h`](https://github.com/torvalds/linux/blob/master/include/linux/mm_types.h)
5. Gorman, Mel. "Understanding the Linux Virtual Memory Manager." [Book](https://www.kernel.org/doc/gorman/)
6. Arpaci-Dusseau, Remzi H. and Arpaci-Dusseau, Andrea C. "Operating Systems: Three Easy Pieces." Chapters 13-23 on Virtual Memory. [Free online](https://pages.cs.wisc.edu/~remzi/OSTEP/)
