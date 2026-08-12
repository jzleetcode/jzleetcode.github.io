---
author: JZ
pubDatetime: 2026-08-12T06:23:00Z
modDatetime: 2026-08-12T06:23:00Z
title: System Design - How CPU Memory Ordering and Memory Models Work
tags:
  - design-system
  - design-concurrency
description:
  "How CPU memory ordering works: why instructions execute out of order, store buffers, the x86-TSO and ARM/RISC-V relaxed models, memory barriers, and how languages like C++ and Go map atomic operations to hardware fences."
---

## Table of contents

## Context

Imagine two threads sharing a variable. Thread 1 writes `x = 1` then sets a flag `ready = true`. Thread 2 spins on `ready`, and once it sees `true`, reads `x`. You would expect Thread 2 to always see `x == 1`. On a single CPU, that is guaranteed. On a modern multi-core processor, **it is not** — Thread 2 can see `ready == true` but `x == 0`.

This is the **memory ordering** problem: modern CPUs reorder memory operations for performance. Understanding why, and how to prevent it when correctness matters, is fundamental to writing correct concurrent code.

```
 Thread 1 (CPU 0)             Thread 2 (CPU 1)
 ─────────────────            ─────────────────
 x = 1                        while (!ready) {}
 ready = true                 assert(x == 1)  // can FAIL!
```

The assertion can fail because the CPU (or compiler) may reorder the stores in Thread 1, or reorder the loads in Thread 2, or both. Let's understand why.

## Why CPUs Reorder Memory Operations

### The Speed Gap

A CPU core can execute an instruction in ~1 nanosecond, but reaching main memory (DRAM) takes ~60-100ns. That is a 60-100x gap. To hide this latency, CPUs use multiple layers of caching and **speculative execution**: they keep working on later instructions instead of stalling while a memory operation completes.

```
            Latency Hierarchy (approximate)

 +──────────────────+──────────────+──────────────────────+
 | Component        | Latency      | Relative Speed       |
 +──────────────────+──────────────+──────────────────────+
 | Register         | < 1 ns       | 1x (baseline)        |
 | L1 Cache         | ~1-2 ns      | ~1x                  |
 | L2 Cache         | ~4-7 ns      | ~5x                  |
 | L3 Cache         | ~12-30 ns    | ~20x                 |
 | Main Memory      | ~60-100 ns   | ~80x                 |
 +──────────────────+──────────────+──────────────────────+
```

Because waiting for memory would waste dozens of cycles, CPUs employ two key structures that cause visible reordering:

### Store Buffers

When a CPU executes a store, it does not immediately write to the cache. Instead, it places the value in a **store buffer** — a small FIFO queue private to each core. This lets the CPU continue executing subsequent instructions without waiting for the cache coherence protocol to propagate the write.

```
  CPU Core 0                           CPU Core 1
 +──────────────+                    +──────────────+
 |  Pipeline    |                    |  Pipeline    |
 +──────+───────+                    +──────+───────+
        |                                   |
 +──────v───────+                    +──────v───────+
 | Store Buffer |                    | Store Buffer |
 | [x=1, ready] |                    |   (empty)    |
 +──────+───────+                    +──────+───────+
        |                                   |
 +──────v───────────────────────────────────v──────+
 |              Shared Cache / Memory              |
 |         x = 0       ready = false               |
 +─────────────────────────────────────────────────+
```

Core 0 has written `x=1` and `ready=true` into its store buffer, but they haven't drained to the shared cache yet. Core 1 reads directly from the shared cache and sees the old values. Worse, the store buffer may drain entries **in any order** on weakly-ordered architectures.

### Invalidation Queues

The cache coherence protocol (e.g., MESI) sends **invalidation messages** when one core writes to a cache line another core holds. Instead of processing these immediately, the receiving core may queue them in an **invalidation queue** and acknowledge right away. This means a core can temporarily read stale data from its own cache even after the writing core's store has been globally visible.

## Memory Models: The Contract Between Hardware and Software

A **memory model** defines which reorderings are legal. Different architectures make different tradeoffs between performance and programmer convenience.

### x86-TSO (Total Store Order)

Intel and AMD x86 processors use **Total Store Order**. This is a relatively strong model:

- **Stores are not reordered with other stores** (store-store order preserved)
- **Loads are not reordered with other loads** (load-load order preserved)
- **Loads are not reordered with older stores to different addresses** — except one case:
- **A load CAN be reordered before an older store to a different address** (store-load reorder allowed)

```
 x86-TSO: What's allowed?

 +-----------------------+----------+
 | Reorder type          | Allowed? |
 +-----------------------+----------+
 | Load-Load             | NO       |
 | Load-Store            | NO       |
 | Store-Store           | NO       |
 | Store-Load            | YES (!)  |
 +-----------------------+----------+
```

This means our opening example actually works correctly on x86 for Thread 1 (stores stay in order). But there is a classic x86 bug:

```
 Initially: x = 0, y = 0

 CPU 0                    CPU 1
 ─────                    ─────
 x = 1                    y = 1
 r1 = y                   r2 = x

 Possible on x86: r1 == 0 AND r2 == 0
```

Both CPUs stored first, then loaded. Because store-load reordering is allowed, each CPU can read the other's variable before its own store becomes visible. This is called the **Store Buffer Litmus Test** (or IRIW for independent reads of independent writes in simpler variants).

### ARM and RISC-V (Weakly Ordered)

ARM (used in phones, Apple Silicon, AWS Graviton) and RISC-V use a **relaxed** memory model. Almost any reordering is legal unless you explicitly prevent it:

```
 ARM/RISC-V: What's allowed?

 +-----------------------+----------+
 | Reorder type          | Allowed? |
 +-----------------------+----------+
 | Load-Load             | YES      |
 | Load-Store            | YES      |
 | Store-Store           | YES      |
 | Store-Load            | YES      |
 +-----------------------+----------+
```

This gives the hardware maximum freedom to optimize. The programmer must explicitly insert **barriers** (also called **fences**) where ordering matters.

## Memory Barriers (Fences)

A **memory barrier** is a CPU instruction that restricts reordering across it. Think of it as a line drawn in your code: operations above the line cannot cross below it (or vice versa).

### Types of Barriers

```
 +──────────────────+────────────────────────────────────────────────+
 | Barrier Type     | What it prevents                               |
 +──────────────────+────────────────────────────────────────────────+
 | Store Fence      | Stores before cannot move after stores after   |
 | (sfence / DMB ST)|                                                |
 +──────────────────+────────────────────────────────────────────────+
 | Load Fence       | Loads before cannot move after loads after     |
 | (lfence / DMB LD)|                                                |
 +──────────────────+────────────────────────────────────────────────+
 | Full Fence       | No loads or stores cross in either direction   |
 | (mfence / DMB ISH / FENCE)|                                      |
 +──────────────────+────────────────────────────────────────────────+
```

On x86, since only store-load reordering is allowed, a full fence (`mfence` or a `lock`-prefixed instruction) is the only barrier you typically need. On ARM, you use `DMB` (Data Memory Barrier) variants, and on RISC-V, the `fence` instruction.

### Fixing Our Example with a Barrier

```
 Thread 1 (CPU 0)             Thread 2 (CPU 1)
 ─────────────────            ─────────────────
 x = 1                        while (!ready) {}
 STORE_FENCE                  LOAD_FENCE
 ready = true                 r = x  // now guaranteed to see 1
```

The store fence ensures `x = 1` is visible before `ready = true`. The load fence ensures the load of `x` happens after the load of `ready` returned true.

## How Programming Languages Map to Hardware

Programmers rarely write raw fence instructions. Instead, languages provide **atomic operations** with ordering guarantees. Here is how C++ memory orders map to hardware:

### C++ Memory Orders

```
 +────────────────────+────────────────────────────────────────+
 | C++ Order          | Meaning                                |
 +────────────────────+────────────────────────────────────────+
 | memory_order_relaxed | No ordering. Only atomicity.          |
 | memory_order_acquire | No reads/writes after this can move   |
 |                      | before it (load side of a lock).      |
 | memory_order_release | No reads/writes before this can move  |
 |                      | after it (store side of a lock).      |
 | memory_order_acq_rel | Both acquire and release.             |
 | memory_order_seq_cst | Total order. All threads agree on     |
 |                      | the same interleaving. (default)      |
 +────────────────────+────────────────────────────────────────+
```

### What the Compiler Generates

On x86, `release` and `acquire` are essentially free — the hardware already guarantees load-load and store-store order. The compiler just needs to prevent **compiler reordering** (a separate concern from CPU reordering). Only `seq_cst` stores require an `mfence` or `xchg` (which has an implicit lock prefix).

On ARM, the story is different. Here is what `std::atomic<int>::store(1, release)` compiles to:

```asm
; x86-64: just a plain MOV (hardware handles ordering)
mov DWORD PTR [rdi], 1

; ARM64: needs an explicit release store
stlr w1, [x0]         ; STLR = Store-Release Register
```

And `std::atomic<int>::load(acquire)`:

```asm
; x86-64: just a plain MOV
mov eax, DWORD PTR [rdi]

; ARM64: needs an explicit acquire load
ldar w0, [x0]         ; LDAR = Load-Acquire Register
```

ARM provides dedicated `LDAR`/`STLR` instructions (introduced in ARMv8) that combine the memory access with the barrier, which is more efficient than a separate `DMB` fence.

### Go's sync/atomic

Go exposes a simpler model. All `atomic.Load*` and `atomic.Store*` operations provide **sequential consistency** — the strongest guarantee:

```go
// From Go's sync/atomic package
// src/sync/atomic/doc.go

// StoreInt64 atomically stores val into *addr.
// On ARM64, this compiles to STLR (store-release) + DMB ISH (full barrier)
// On x86, this compiles to XCHG or MOV + MFENCE
func StoreInt64(addr *int64, val int64)
```

Go chose simplicity over exposing relaxed orderings. The runtime itself uses internal `//go:nosplit` + assembly for cases where weaker ordering suffices (e.g., the scheduler's work-stealing logic).

## The Linux Kernel's Barrier API

The Linux kernel needs to be portable across all architectures, so it provides an abstraction layer in [`include/asm-generic/barrier.h`](https://github.com/torvalds/linux/blob/master/include/asm-generic/barrier.h):

```c
// Full memory barrier — nothing crosses in either direction
#define mb()    ...

// Write (store) barrier — stores before don't pass stores after
#define wmb()   ...

// Read (load) barrier — loads before don't pass loads after
#define rmb()   ...

// SMP variants — only emit a barrier on multi-processor builds
#define smp_mb()    ...
#define smp_wmb()   ...
#define smp_rmb()   ...
```

On x86, `smp_wmb()` compiles to a **compiler barrier only** (`barrier()` which is `asm volatile("" ::: "memory")`), because the hardware already prevents store-store reordering. On ARM, it emits a real `DMB ISHST` instruction.

A common pattern in the kernel — the **write-side / read-side** protocol:

```c
// Producer (e.g., network driver filling a ring buffer)
buffer[tail] = packet;       // write data first
smp_wmb();                   // ensure data is visible before advancing tail
WRITE_ONCE(ring->tail, new_tail);

// Consumer
unsigned t = READ_ONCE(ring->tail);
smp_rmb();                   // ensure we read data after reading tail
process(buffer[t]);
```

`WRITE_ONCE` / `READ_ONCE` prevent the compiler from tearing or optimizing away the access. The `smp_wmb` / `smp_rmb` pair ensures the consumer never sees a new tail pointer but stale data.

## A Real Bug: The Double-Checked Locking Disaster

The classic example of a memory ordering bug is **double-checked locking** in Java (pre-Java 5):

```java
// BROKEN on processors with weak ordering (and even on x86 with JIT)
class Singleton {
    private static Singleton instance;

    public static Singleton getInstance() {
        if (instance == null) {               // First check (no lock)
            synchronized (Singleton.class) {
                if (instance == null) {       // Second check (with lock)
                    instance = new Singleton(); // BUG HERE
                }
            }
        }
        return instance;
    }
}
```

The problem: `instance = new Singleton()` is not atomic. It involves:
1. Allocate memory
2. Call constructor (initialize fields)
3. Assign reference to `instance`

The CPU (or JIT compiler) can reorder steps 2 and 3. Another thread can see a non-null `instance` that points to an **uninitialized object**. The fix in Java 5+ is to declare `instance` as `volatile`, which inserts the necessary barriers.

## Practical Rules of Thumb

1. **If you share data between threads, use atomic operations or locks.** Raw reads/writes to shared variables are data races (undefined behavior in C/C++).

2. **On x86, most code "just works" by accident.** The strong TSO model hides many bugs. Those same bugs explode when you port to ARM (Apple M-series, AWS Graviton, Android phones).

3. **Acquire/release is almost always what you need.** Sequential consistency (`seq_cst`) is safer but slower. Relaxed is only for counters or progress indicators where you don't need inter-variable ordering.

4. **Compiler reordering is separate from CPU reordering.** Even on a single-core system, the compiler can reorder memory accesses. Use `volatile` (C/kernel), atomics, or compiler barriers to prevent this.

5. **Test on weak architectures.** x86 will not surface ordering bugs. ARM will. Apple's Rosetta 2 (x86 emulation on ARM) preserves TSO semantics for compatibility, so it won't catch bugs either — you need native ARM execution.

## References

1. A Tutorial Introduction to the ARM and POWER Relaxed Memory Models — Maranget, Sarkar, Sewell (2012) [PDF](https://www.cl.cam.ac.uk/~pes20/ppc-supplemental/test7.pdf)
2. x86-TSO: A Rigorous and Usable Programmer's Model for x86 Multiprocessors — Sewell et al. (2010) [PDF](https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf)
3. C++ Memory Model reference — [cppreference.com](https://en.cppreference.com/w/cpp/atomic/memory_order)
4. Linux kernel memory barriers documentation — [`Documentation/memory-barriers.txt`](https://github.com/torvalds/linux/blob/master/Documentation/memory-barriers.txt)
5. Jeff Preshing's blog on memory reordering — [preshing.com](https://preshing.com/20120930/weak-vs-strong-memory-models/)
6. RISC-V memory model specification — [Chapter 14, RISC-V ISA manual](https://github.com/riscv/riscv-isa-manual)
7. Herb Sutter — "atomic<> Weapons" CppCon talks (2012)
