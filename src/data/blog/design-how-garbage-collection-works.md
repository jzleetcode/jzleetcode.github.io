---
author: JZ
pubDatetime: 2026-04-14T06:23:00Z
modDatetime: 2026-04-14T06:23:00Z
title: System Design - How Garbage Collection Works
tags:
  - design-system
  - design-concurrency
description:
  "How garbage collection works in practice: reference counting vs. tracing, mark-and-sweep fundamentals, tri-color marking, Go's concurrent collector, write barriers, GC pacing, and source code walkthrough from the Go runtime."
---

## Table of contents

## Context

Every program allocates memory. The question is: who frees it?

In C, the programmer calls `malloc` and `free` by hand. Get it wrong and you leak memory or crash with a use-after-free. In languages like Go, Java, Python, and JavaScript, a **garbage collector** (GC) handles this automatically. It finds objects that are no longer reachable and reclaims their memory.

This sounds simple, but the devil is in the details. A naive GC can freeze your entire application for seconds. A well-designed one runs almost invisibly alongside your code. Let's explore how garbage collection actually works, using Go's runtime as our primary case study.

```
  Your Program                        The GC's Job
  +-----------------------+           +----------------------------+
  |                       |           |                            |
  |   obj = new Thing()   |           |  1. Which objects are      |
  |   obj.next = other    |           |     still reachable?       |
  |   ...                 |           |                            |
  |   // obj goes out     |           |  2. Free everything else   |
  |   // of scope         |           |                            |
  |                       |           |                            |
  +-----------------------+           +----------------------------+
```

There are two fundamental approaches to answering "which objects are still alive?" Let's start with the simpler one.

## Approach 1: Reference Counting

The idea is straightforward: attach a counter to every object. When something points to the object, increment the counter. When it stops pointing, decrement. When the counter reaches zero, the object is garbage.

```
  Step 1: A points to X         Step 2: B also points to X

    A ----> [ X, rc=1 ]           A ----> [ X, rc=2 ] <---- B

  Step 3: A stops pointing       Step 4: B stops pointing

            [ X, rc=1 ] <---- B           [ X, rc=0 ]  --> FREE!
```

Python uses reference counting as its primary GC strategy. Here is a simplified version of how CPython tracks references (from [`Include/object.h`](https://github.com/python/cpython/blob/main/Include/object.h)):

```c
typedef struct _object {
    Py_ssize_t ob_refcnt;    // the reference count
    PyTypeObject *ob_type;
} PyObject;

// When you write: b = a
// CPython internally does:
Py_INCREF(a);    // a->ob_refcnt++

// When a variable goes out of scope:
Py_DECREF(a);    // a->ob_refcnt--; if zero, free it
```

Reference counting has a big advantage: objects are freed **immediately** when they become unreachable. No pause, no delay. But it has a fatal flaw: **cycles**.

```
  Circular reference: A and B point to each other

    +-------+         +-------+
    | A     |-------->| B     |
    | rc=1  |         | rc=1  |
    |       |<--------|       |
    +-------+         +-------+

  Even after nothing else references A or B,
  both still have rc=1. They are leaked forever.
```

Python solves this with a supplementary **cycle detector** that periodically scans for unreachable cycles. But this brings us to the second, more general approach.

## Approach 2: Tracing (Mark-and-Sweep)

Instead of counting references, we start from known **roots** (stack variables, global variables, CPU registers) and trace all reachable objects. Anything not reached is garbage.

```
  Roots           Heap
  +------+
  | main |------> [ A ] ----> [ B ] ----> [ C ]
  +------+                       |
  | func |------> [ D ]         |
  +------+                       v
                               [ E ]

                  [ F ] ----> [ G ]    <-- unreachable from roots!
                                           both are garbage
```

The classic **mark-and-sweep** algorithm has two phases:

1. **Mark:** Starting from roots, visit every reachable object and mark it as "alive."
2. **Sweep:** Walk through all allocated objects. Free anything that isn't marked.

```
  Phase 1: MARK                      Phase 2: SWEEP

  Start from roots,                  Walk all objects:
  follow all pointers:               - marked? -> unmark, keep
                                     - unmarked? -> free
  [A] marked                         [A] keep
  [B] marked                         [B] keep
  [C] marked                         [C] keep
  [D] marked                         [D] keep
  [E] marked                         [E] keep
  [F] not reached                    [F] FREE
  [G] not reached                    [G] FREE
```

This is simple and handles cycles naturally (F and G can point to each other, but if neither is reachable from roots, both get swept). The problem? A naive implementation **stops the entire program** during both phases. This is called a **stop-the-world** (STW) pause.

For a web server handling thousands of requests per second, a 100ms pause is catastrophic. This is why modern GCs work hard to minimize or eliminate STW pauses. Go's garbage collector is one of the most sophisticated examples.

## Go's Garbage Collector: Concurrent Tri-Color Mark-and-Sweep

Go uses a **concurrent, tri-color, mark-and-sweep** collector. Let's unpack each word:

- **Concurrent:** Most GC work happens while your goroutines keep running.
- **Tri-color:** Objects are logically colored white, grey, or black to track progress.
- **Mark-and-sweep:** The fundamental algorithm, but executed in a way that minimizes pauses.

Go's GC is also **non-generational** (does not separate young vs. old objects), **non-compacting** (does not move objects in memory), and **non-moving** (object addresses are stable for their lifetime).

### The Tri-Color Abstraction

Instead of a simple "marked / unmarked" bit, Go uses three colors:

```
  WHITE = not yet visited (potentially garbage)
  GREY  = reachable, but not fully scanned yet
  BLACK = reachable and fully scanned (all its pointers followed)
```

The algorithm works like a wavefront expanding outward from the roots:

```
  Start:  All objects are WHITE
          Roots point to some objects -> make them GREY

  Step 1:          Step 2:          Step 3:          Done:
  Roots            Roots            Roots            Roots
    |                |                |                |
    v                v                v                v
  [A]grey         [A]black         [A]black         [A]black
    |                |                |                |
    v                v                v                v
  [B]white        [B]grey          [B]black         [B]black
    |                |                |                |
    v                v                v                v
  [C]white        [C]white         [C]grey          [C]black

  [F]white        [F]white         [F]white         [F]white -> GARBAGE
```

1. Pick a grey object from the work queue.
2. Scan all its pointers. Any white object it points to becomes grey.
3. The scanned object becomes black.
4. Repeat until no grey objects remain.

When the queue is empty, every reachable object is black. Everything still white is garbage.

### GC Phases

The full GC cycle in Go has four phases. Only two require stopping the world, and both are extremely brief (typically under 1 millisecond):

```
  Time --->

  |--STW--|--------concurrent--------|--STW--|------concurrent------|
  | Sweep |     Concurrent Mark       | Mark  |   Concurrent Sweep  |
  | Term  |                           | Term  |                     |
  |       |  write barrier ON         |       |  write barrier OFF  |
  |       |  mark workers active      |       |  lazy + background  |
  |       |  mutator assists          |       |  sweeping           |

  Phase 1    Phase 2                   Phase 3    Phase 4
```

Here is what happens in each phase, as documented in [`runtime/mgc.go`](https://github.com/golang/go/blob/master/src/runtime/mgc.go):

**Phase 1 — Sweep Termination (STW).** All goroutines are paused. Any leftover unswept memory spans from the previous cycle are cleaned up. This ensures we start with a clean slate.

**Phase 2 — Concurrent Mark.** This is where the real work happens. The write barrier is turned on (more on this below). Root scanning jobs are enqueued: stacks, globals, and off-heap runtime structures. Grey objects are drained from work queues and scanned to black — all while your application goroutines continue running.

**Phase 3 — Mark Termination (STW).** Another brief pause. All mark workers are stopped. Housekeeping tasks run (flushing per-processor memory caches, etc.).

**Phase 4 — Concurrent Sweep.** The write barrier is turned off. Sweeping reclaims memory span-by-span. It happens both lazily (a goroutine needing memory sweeps a span first) and in a background goroutine.

### The Write Barrier Problem

Here is the tricky part: during Phase 2, your application is still running and **modifying pointers**. This can break the tri-color invariant. Consider this scenario:

```
  GC has scanned A (black) and queued B (grey).
  C is still white.

  Before:                     Mutator runs:           Problem:
  [A]black --> [B]grey        A.ptr = C               [A]black --> [C]white
                |             B.ptr = nil
                v                                     C is reachable from A
              [C]white                                 but A is BLACK (won't
                                                       be scanned again!)
                                                       C gets collected. BUG!
```

The rule that must never be violated: **a black object must not point directly to a white object.** If it does, the white object could be incorrectly collected.

Go solves this with a **hybrid write barrier**. On every pointer write during the mark phase, the barrier shades both the old value (what was there before) and the new value being written:

```go
// Pseudocode for the hybrid write barrier
// (actual implementation in runtime/asm_*.s)
func writeBarrier(slot *unsafe.Pointer, new unsafe.Pointer) {
    shade(*slot)  // shade the old value (Yuasa-style deletion barrier)
    shade(new)    // shade the new value (Dijkstra-style insertion barrier)
    *slot = new
}
```

"Shading" means: if the object is white, make it grey (add it to the work queue). This ensures any pointer the GC might miss is conservatively kept alive.

Additionally, any object **allocated during the mark phase** is immediately colored black. This prevents newly created objects from being swept out from under the application.

### Mark Workers and Mutator Assists

Go dedicates approximately **25% of GOMAXPROCS** to background mark workers during Phase 2. If you have 4 CPU cores, one core runs GC marking while three run your application.

But what if your application allocates faster than the mark workers can keep up? Go drafts the fast-allocating goroutine into **mutator assist** duty:

```
  Goroutine wants to allocate 1KB
    |
    v
  Is the GC behind schedule?
    |
   YES --> You must do marking work proportional
    |      to your allocation before proceeding
    |
   NO  --> Allocate normally
    |
    v
  Continue running
```

This creates **back-pressure**: the faster you allocate, the more GC work you do, which slows down your allocation. It is a self-balancing mechanism that prevents the heap from growing out of control.

The assist ratio is calculated so that marking completes before the heap reaches its target size. From the source (simplified from [`runtime/mgcpacer.go`](https://github.com/golang/go/blob/master/src/runtime/mgcpacer.go)):

```go
// assistWorkPerByte determines how many bytes of marking work
// a goroutine must perform per byte of allocation.
assistWorkPerByte = float64(googWork) / float64(googAllocable)
```

## The GC Pacer: When to Start Collecting

The GC does not run on a fixed timer. Instead, a **pacer** decides when to trigger the next cycle based on heap growth. The target formula is:

```
  Target heap = Live heap + (Live heap + GC roots) * GOGC / 100
```

With the default **GOGC=100**, the GC triggers when the heap has roughly **doubled** since the last collection:

```
  GOGC = 100 (default)

  After GC: live heap = 100 MB
  Target:   100 + (100 + roots) * 100/100 ~ 200 MB
  GC starts when heap approaches 200 MB

  GOGC = 200 (trade memory for less CPU)

  After GC: live heap = 100 MB
  Target:   100 + (100 + roots) * 200/100 ~ 300 MB
  GC starts when heap approaches 300 MB

  GOGC = 50 (trade CPU for less memory)

  After GC: live heap = 100 MB
  Target:   100 + (100 + roots) * 50/100 ~ 150 MB
  GC starts when heap approaches 150 MB
```

This creates a direct **CPU vs. memory** trade-off:

```
                 High GOGC
                    |
                    v
   Less GC CPU  <------->  More memory usage
                    ^
                    |
                 Low GOGC
```

Since Go 1.19, you can also set **GOMEMLIMIT** as a soft memory cap. When set, the runtime adjusts GC frequency to stay under the limit, overriding GOGC if needed. A safety valve caps GC CPU at 50% to prevent **thrashing** (running GC constantly but never freeing enough).

```go
// Set via environment variable
GOMEMLIMIT=1GiB

// Or programmatically
import "runtime/debug"
debug.SetMemoryLimit(1 << 30) // 1 GiB
```

## Memory Layout: Spans, Pages, and Size Classes

Go's allocator organizes memory into **spans** — contiguous chunks of pages. Each span is dedicated to a specific **size class** (8 bytes, 16 bytes, 32 bytes, ... up to 32 KB). Objects larger than 32 KB get their own span.

```
  Heap
  +------------------------------------------------------------------+
  |                                                                  |
  |  Span (size class: 32B)    Span (size class: 64B)    Large span |
  |  +----+----+----+----+    +--------+--------+----+   +----------+
  |  | 32 | 32 | 32 | 32 |    |   64   |   64   |free|   |  large   |
  |  |obj |free|obj |obj |    |  obj   |  free  |    |   |  object  |
  |  +----+----+----+----+    +--------+--------+----+   +----------+
  |                                                                  |
  +------------------------------------------------------------------+
```

Each processor (P) has a local **mcache** — a per-P allocation cache that allows most allocations to happen **without locks**:

```
  Goroutine: x := new(MyStruct)   // 48 bytes
      |
      v
  mcache for this P
      |
      +--> size class 48B span has free slot?
      |         |
      |        YES --> bump pointer, return (no lock!)
      |         |
      |        NO  --> get new span from central list (lock)
      v
  Object allocated
```

Sweeping also operates at the span level. When the GC sweeps a span, it builds a **free list** of all the garbage slots, making them available for future allocations.

## Comparing GC Strategies Across Languages

Different languages make different trade-offs:

```
  Language    Strategy              Pause         Notes
  ---------  --------------------  -----------   ----------------------
  Go         Concurrent tri-color  < 1ms STW     Optimized for latency
             mark-and-sweep                      Non-generational

  Java       Generational +        Varies by     G1: region-based
  (HotSpot)  various collectors    collector     ZGC: < 1ms (concurrent)
                                                 Compacting

  Python     Reference counting    None for RC   Cycle detector adds
             + cycle detector      Some for      occasional pauses
                                   cycles

  Rust       No GC (ownership)     Zero          Compile-time memory
                                                 management

  JavaScript Mark-and-sweep        Short,        V8 uses generational
  (V8)       (generational)        incremental   + incremental marking
```

Go chose to optimize for **low latency** (short pauses) over **throughput** (total CPU spent on GC). A generational collector like Java's can process less total data per cycle by focusing on young objects, but Go's approach avoids the complexity of generations and write barriers for inter-generational pointers.

## Observing GC in Practice

You can watch Go's GC in real time using the `GODEBUG` environment variable:

```bash
GODEBUG=gctrace=1 ./myprogram

# Output (one line per GC cycle):
# gc 1 @0.012s 2%: 0.021+1.2+0.009 ms clock, 0.084+0.35/1.1/0+0.036 ms cpu, 4->5->2 MB, 4 MB goal, 0 MB stacks, 0 MB globals, 4 P
```

Breaking down the trace:

```
  gc 1          -- GC cycle number
  @0.012s       -- wall-clock time since program start
  2%            -- percentage of CPU spent on GC
  0.021+1.2+0.009 ms clock
    |     |    |
    |     |    +-- mark termination STW (0.009ms)
    |     +------- concurrent mark + sweep (1.2ms)
    +------------- sweep termination STW (0.021ms)
  4->5->2 MB   -- heap before -> heap at end of mark -> live after sweep
  4 MB goal     -- target heap size for this cycle
  4 P           -- number of processors used
```

For programmatic access, use the `runtime` package:

```go
var stats runtime.MemStats
runtime.ReadMemStats(&stats)

fmt.Printf("Heap in use:  %d MB\n", stats.HeapInuse/1024/1024)
fmt.Printf("Heap objects: %d\n", stats.HeapObjects)
fmt.Printf("GC cycles:    %d\n", stats.NumGC)
fmt.Printf("Total GC pause: %v\n", time.Duration(stats.PauseTotalNs))
```

## References

1. A Guide to the Go Garbage Collector [doc](https://tip.golang.org/doc/gc-guide)
2. Go runtime GC implementation [`runtime/mgc.go`](https://github.com/golang/go/blob/master/src/runtime/mgc.go)
3. Go runtime GC pacer [`runtime/mgcpacer.go`](https://github.com/golang/go/blob/master/src/runtime/mgcpacer.go)
4. Getting to Go: The Journey of Go's Garbage Collector [talk](https://go.dev/blog/ismmkeynote)
5. On-the-Fly Garbage Collection: An Exercise in Cooperation — Dijkstra et al. (1978) [paper](https://dl.acm.org/doi/10.1145/359642.359655)
6. CPython object reference counting [`Include/object.h`](https://github.com/python/cpython/blob/main/Include/object.h)
7. The Garbage Collection Handbook — Jones, Hosking, Moss (2011)
8. Java ZGC: A Scalable Low-Latency Garbage Collector [doc](https://docs.oracle.com/en/java/javase/21/gctuning/z-garbage-collector.html)
