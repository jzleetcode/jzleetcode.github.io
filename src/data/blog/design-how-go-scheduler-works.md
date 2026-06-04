---
author: JZ
pubDatetime: 2026-06-04T06:00:00Z
modDatetime: 2026-06-04T06:00:00Z
title: System Design - How Go's Goroutine Scheduler Works
tags:
  - design-system
  - design-concurrency
description:
  "How Go's goroutine scheduler works: the GMP model (Goroutines, OS Threads, Processors), work stealing, preemption, netpoller integration, and a source code walkthrough from the Go runtime."
---

## Table of contents

## Context: Why User-Space Scheduling Matters

Every program needs a way to do multiple things at once. Operating systems provide **threads**, but OS threads are expensive:

- Each thread consumes **~1-8 MB** of stack memory (fixed at creation on Linux).
- Creating or destroying a thread requires a **system call** (clone/exit), crossing the user-kernel boundary.
- Context-switching between threads involves saving/restoring registers, flushing TLBs, and running the kernel scheduler — costing **1-10 microseconds** per switch.

If your web server needs to handle 100,000 concurrent connections, you cannot afford 100,000 OS threads. That is 100 GB of stack space alone.

Go's answer: **goroutines**. A goroutine starts with only **2 KB** of stack (which grows dynamically) and is scheduled entirely in user space. The Go runtime multiplexes potentially millions of goroutines onto a small pool of OS threads. This is called **M:N scheduling** — M goroutines on N OS threads.

```
    Traditional 1:1 Threading              Go's M:N Scheduling

  +-------+  +-------+  +-------+      +--+ +--+ +--+ +--+ +--+ +--+
  |Thread1|  |Thread2|  |Thread3|      | G| | G| | G| | G| | G| | G|  goroutines
  +---+---+  +---+---+  +---+---+      +-++ +-++ +-++ +--+ +--+ +-++
      |          |          |             |    |    |              |
      v          v          v             +----+----+    +---------+
  +---+---+  +---+---+  +---+---+             |         |
  | OS Th |  | OS Th |  | OS Th |          +--+--+   +--+--+
  +---+---+  +---+---+  +---+---+          | M(1)|   | M(2)|   OS threads
      |          |          |               +--+--+   +--+--+
  ----+----------+----------+----              |         |
            Kernel                    ---------+---------+----------
                                                  Kernel
```

The magic happens inside the **Go runtime scheduler**, a piece of code compiled into every Go binary. Let's take it apart.

## The GMP Model

Go's scheduler is built on three core abstractions, known as **GMP**:

| Letter | Name | What it is |
|--------|------|------------|
| **G** | Goroutine | A unit of work — your `go func()`. Has its own stack, instruction pointer, and state. |
| **M** | Machine | An OS thread. The thing that actually executes instructions on a CPU core. |
| **P** | Processor | A logical CPU / scheduling context. Holds a local run queue of goroutines. The number of Ps equals `GOMAXPROCS`. |

The key insight: **a goroutine (G) can only run when an M acquires a P.** The P is the "ticket to schedule." This three-way binding decouples the number of goroutines from the number of OS threads and from the number of CPU cores.

```
                         GMP Relationship

          +------+    +------+    +------+    +------+
          |  G   |    |  G   |    |  G   |    |  G   |   (millions possible)
          +--+---+    +--+---+    +--+---+    +--+---+
             |           |           |           |
             v           v           v           v
          +-----------------------------------+-------+
          |        Local Run Queue (P0)       | LRQ P1|
          +-----------------+-----------------+---+---+
                            |                     |
                     +------+------+       +------+------+
                     |   P0        |       |   P1        |   (GOMAXPROCS = 2)
                     +------+------+       +------+------+
                            |                     |
                     +------+------+       +------+------+
                     |   M0        |       |   M1        |   OS threads
                     +------+------+       +------+------+
                            |                     |
                  ----------+---------------------+---------
                                   Kernel
```

## Data Structures (Source Code)

The core structs live in [`src/runtime/runtime2.go`](https://github.com/golang/go/blob/master/src/runtime/runtime2.go):

### The `g` struct (goroutine)

```go
type g struct {
    stack       stack   // lo and hi bounds of the goroutine stack
    stackguard0 uintptr // for stack growth check in function prologues
    m           *m      // current M executing this G (nil if not running)
    sched       gobuf   // saved registers (SP, PC, etc.) for context switch
    atomicstatus atomic.Uint32 // goroutine state
    goid         uint64 // unique goroutine ID
    preempt      bool   // preemption signal
    // ... many more fields
}
```

### The `m` struct (OS thread)

```go
type m struct {
    g0      *g     // special goroutine for scheduling stack
    curg    *g     // current user goroutine running on this M
    p       puintptr // attached P (nil if not executing user code)
    nextp   puintptr // P to attach on next schedule
    spinning bool   // is this M looking for work?
    // ...
}
```

### The `p` struct (processor)

```go
type p struct {
    id          int32
    status      uint32 // idle, running, syscall, etc.
    m           muintptr // back-link to the M currently using this P
    runqhead    uint32
    runqtail    uint32
    runq        [256]guintptr // local run queue (fixed-size ring buffer!)
    runnext     guintptr      // next G to run (hot cache, size 1)
    // ...
}
```

Notice that each P has a **local run queue** that holds up to 256 goroutines in a lock-free ring buffer. There is also a **global run queue** protected by a mutex, used as overflow.

```
                     Scheduler Queues

   +------------------------------------------------------------------+
   |                    Global Run Queue (mutex)                       |
   |   [ G ] [ G ] [ G ] [ G ] ...                                    |
   +------------------------------------------------------------------+
          |                                          |
          | (steal/put when local is full/empty)     |
          v                                          v
   +--------------------+                    +--------------------+
   |   P0 Local Queue   |                    |   P1 Local Queue   |
   |  [G][G][G][G]      |                    |  [G][G]            |
   |  runnext: G        |                    |  runnext: G        |
   +--------+-----------+                    +--------+-----------+
            |                                         |
            v                                         v
        +-------+                                 +-------+
        |  M0   | --running--> [current G]        |  M1   | --running--> [current G]
        +-------+                                 +-------+
```

## The Scheduling Loop

Every M runs an infinite scheduling loop. The entry point is [`schedule()`](https://github.com/golang/go/blob/master/src/runtime/proc.go) in `src/runtime/proc.go`:

```go
func schedule() {
    mp := getg().m

    // Every 61st schedule tick, check the global queue to prevent starvation
    if mp.schedtick%61 == 0 {
        if gp := globrunqget(pp, 1); gp != nil {
            // found one from global queue
        }
    }

    // Try local queue first
    if gp, inheritTime := runqget(pp); gp != nil {
        // found one from local queue
    }

    // Nothing local, go looking (blocking)
    gp = findRunnable()

    execute(gp)
}
```

The simplified flow:

```
                  schedule()
                      |
                      v
        +----------------------------+
        | Every 61st tick: check     |   (prevents global queue starvation)
        | global run queue           |
        +-------------+--------------+
                      |
                      v (nothing found)
        +----------------------------+
        | runqget(local P queue)     |   (check runnext, then ring buffer)
        +-------------+--------------+
                      |
                      v (nothing found)
        +----------------------------+
        | findRunnable()             |   (work stealing, global queue,
        |   - try global queue       |    netpoll, other Ps)
        |   - try netpoll           |
        |   - try stealing from     |
        |     other P's local queue |
        +-------------+--------------+
                      |
                      v
        +----------------------------+
        | execute(gp)               |   (set gp.status = running,
        |   gogo(&gp.sched)        |    restore registers, jump to PC)
        +----------------------------+
```

When a goroutine finishes (`goexit`), blocks on a channel, or hits a preemption point, control returns to `schedule()` and the loop repeats.

## Work Stealing

When a P's local run queue is empty, the runtime does not just sit idle. It **steals** work from other Ps. This is implemented in [`stealWork()`](https://github.com/golang/go/blob/master/src/runtime/proc.go):

```go
func stealWork(now int64) (gp *g, inheritTime bool, tnow, newStatus int64) {
    pp := getg().m.p.ptr()
    ranTimer := false

    const stealTries = 4
    for i := 0; i < stealTries; i++ {
        stealTimersOrRunnable := i == stealTries-1

        // Iterate over Ps in random order
        for enum := stealOrder.start(cheaprand()); !enum.done(); enum.next() {
            p2 := allp[enum.position()]
            if p2 == pp {
                continue
            }
            // Try to steal half of p2's run queue
            if gp := runqsteal(pp, p2, stealTimersOrRunnable); gp != nil {
                return gp, false, now, 0
            }
        }
    }
    return nil, false, now, 0
}
```

Key details:
- The stealer takes **half** of the victim's local queue (not just one goroutine). This ensures balanced distribution.
- Ps are visited in **random order** to avoid hot-spots.
- Stealing is tried up to **4 times** before giving up and parking the M.

```
     Work Stealing Example

     P0 (empty)                P1 (has 6 Gs)
     +---------+               +---------+
     |  [ ]    |  <---steal--- | [G][G][G][G][G][G] |
     +---------+               +---------+
                                     |
                                     v (after steal)
     P0 (got 3)                P1 (kept 3)
     +---------+               +---------+
     | [G][G][G]|              | [G][G][G] |
     +---------+               +---------+
```

## Preemption

A scheduler is useless if a goroutine can run forever without yielding. Go uses two preemption mechanisms:

### Cooperative Preemption (since Go 1.2)

The Go compiler inserts a **stack growth check** at the beginning of every function:

```asm
// Pseudo-assembly for a function prologue
MOV  SP, R1
CMP  R1, g.stackguard0   // compare SP against the stack guard
BLS  morestack           // if SP <= guard, call morestack
```

When the runtime wants to preempt a goroutine, it sets `g.stackguard0 = stackPreempt` (a special sentinel value). The next function call in that goroutine triggers the check, sees the sentinel, and yields control back to the scheduler.

This is called "cooperative" because the goroutine must make a function call for preemption to happen. A tight loop like `for {}` with no function calls cannot be preempted this way.

### Asynchronous Preemption (since Go 1.14)

Go 1.14 added **signal-based preemption** to handle tight loops. The [`sysmon`](https://github.com/golang/go/blob/master/src/runtime/proc.go) goroutine (a background monitor thread) detects goroutines running for more than 10ms and sends a **SIGURG** signal to the OS thread:

```go
// In sysmon (simplified)
func retake(now int64) uint32 {
    for i := 0; i < len(allp); i++ {
        pp := allp[i]
        pd := &pp.sysmontick
        if pp.status == _Prunning {
            t := int64(pp.schedtick)
            if pd.schedtick != t {
                pd.schedtick = t
                pd.schedwhen = now
            } else if pd.schedwhen+forcePreemptNS <= now { // 10ms
                preemptone(pp)
            }
        }
    }
}

func preemptone(pp *p) bool {
    mp := pp.m.ptr()
    gp := mp.curg
    gp.preempt = true
    gp.stackguard0 = stackPreempt
    // Send async preemption signal
    if preemptMSupported {
        signalM(mp, sigPreempt) // SIGURG
    }
    return true
}
```

The signal handler (`asyncPreempt`) saves the current state and switches back to the scheduler. This ensures even infinite loops like `for { x++ }` get preempted.

## Goroutine States

A goroutine transitions through these states (defined in [`src/runtime/runtime2.go`](https://github.com/golang/go/blob/master/src/runtime/runtime2.go)):

```
                     Goroutine State Machine

                          go func()
                              |
                              v
                       +-----------+
                       | _Grunnable|   (in a run queue, waiting to be picked up)
                       +-----+-----+
                             |
                   schedule()|
                             v
                       +-----------+
              +------->| _Grunning |   (executing on an M/P)
              |        +-----+-----+
              |              |
              |   +----------+----------+
              |   |          |          |
              |   v          v          v
              | block     preempt    finished
              |   |          |          |
              |   v          v          v
              | +---------+ +--------+ +-------+
              | |_Gwaiting| |_Grunnable| |_Gdead |
              | +---------+ +--------+ +-------+
              |       |
              |       | (woken up: channel recv, timer, I/O ready)
              |       v
              |  +-----------+
              +--| _Grunnable|
                 +-----------+
```

| State | Value | Meaning |
|-------|-------|---------|
| `_Gidle` | 0 | Just allocated, not yet initialized |
| `_Grunnable` | 1 | On a run queue, ready to run |
| `_Grunning` | 2 | Currently executing on M/P |
| `_Gsyscall` | 3 | In a system call, M may lose its P |
| `_Gwaiting` | 4 | Blocked (channel, mutex, I/O, sleep, etc.) |
| `_Gdead` | 6 | Finished execution or just created |
| `_Gpreempted` | 9 | Stopped at a safe point by async preemption |

## Netpoller Integration

One of Go's biggest strengths is that goroutines doing I/O do not block OS threads. The secret is the **netpoller** — a Go-runtime wrapper around OS multiplexing (epoll on Linux, kqueue on macOS).

When a goroutine does a network read and the socket is not ready:

```
  Goroutine calls net.Read()
         |
         v
  runtime sets socket non-blocking
  calls epoll_ctl(ADD, fd, ...)
         |
         v
  goroutine is parked (_Gwaiting)
  M is free to run other goroutines!
         |
         v
  ... later, data arrives ...
         |
         v
  netpoll() returns list of ready fds
  (called from findRunnable or sysmon)
         |
         v
  goroutines are marked _Grunnable
  and put back on run queues
```

The implementation lives in [`src/runtime/netpoll_epoll.go`](https://github.com/golang/go/blob/master/src/runtime/netpoll_epoll.go) (Linux) and [`src/runtime/netpoll_kqueue.go`](https://github.com/golang/go/blob/master/src/runtime/netpoll_kqueue.go) (macOS):

```go
// netpoll checks for ready network connections.
// Returns a list of goroutines that become runnable.
func netpoll(delay int64) gList {
    // calls epoll_wait (Linux) or kevent (macOS)
    var events [128]epollevent
    n := epollwait(epfd, &events[0], int32(len(events)), waitms)
    
    var toSchedule gList
    for i := int32(0); i < n; i++ {
        pd := *(**pollDesc)(unsafe.Pointer(&events[i].data))
        // wake up goroutines waiting on this fd
        netpollready(&toSchedule, pd, mode)
    }
    return toSchedule
}
```

This design means a Go program handling 100,000 concurrent TCP connections uses only `GOMAXPROCS` OS threads (typically equal to the number of CPU cores), not 100,000 threads.

## How `go func()` Creates a Goroutine

When you write `go myFunction()`, the compiler transforms it into a call to [`newproc`](https://github.com/golang/go/blob/master/src/runtime/proc.go):

```go
func newproc(fn *funcval) {
    gp := getg()         // get current goroutine
    pc := getcallerpc()  // for stack trace
    
    // Switch to g0 stack to create the new goroutine
    systemstack(func() {
        newg := newproc1(fn, gp, pc, false, waitReasonZero)

        pp := getg().m.p.ptr()
        runqput(pp, newg, true) // put on local P's queue

        if mainStarted {
            wakep() // wake an idle P if available
        }
    })
}
```

The `newproc1` function allocates a `g` struct (or reuses one from the free list), sets up the initial 2 KB stack, and configures the saved registers so that when the goroutine is first scheduled, it starts executing `fn`.

```
  go myFunc(arg1, arg2)
         |
         | compiler rewrites to:
         v
  newproc(&funcval{fn: myFunc})
         |
         v
  newproc1: allocate/reuse g struct
         |  set up 2KB stack
         |  save entry point in g.sched.pc
         v
  runqput(currentP, newG, true)
         |
         |  runnext slot empty? put there (hot path)
         |  else: push to tail of ring buffer
         |  ring buffer full? put half into global queue
         v
  wakep(): wake idle M/P pair if available
```

## System Calls and Thread Handoff

When a goroutine makes a blocking system call (e.g., file I/O, CGO), the M enters the kernel and cannot run other goroutines. The scheduler handles this by **detaching the P**:

```
  Before syscall:            During syscall:            After syscall:

  +----+    +----+           +----+      +----+         +----+    +----+
  | P0 |--->| M0 |           | P0 |--->  | M2 |         | P0 |--->| M0 |
  +----+    +----+           +----+      +----+         +----+    +----+
              |                            |                        |
              v              | M0 |        v                        v
           [G(user)]         | in  |    [other G]               [G(user)]
                             |syscall|
                             +----+
                               |
                               v
                            [G blocked in kernel]
```

The mechanism in code ([`src/runtime/proc.go`](https://github.com/golang/go/blob/master/src/runtime/proc.go)):

1. **`entersyscall()`** — called before the syscall. Saves state, marks P as `_Psyscall`.
2. **`sysmon` detects stalled P** — if the M has been in a syscall for >20us (or one `sysmon` tick), `sysmon` calls `handoffp()` to give the P to another (or new) M.
3. **`exitsyscall()`** — when the syscall returns, M tries to re-acquire its old P. If that P was handed off, M tries to get any idle P. If no P is available, M parks itself and the goroutine goes to the global queue.

```go
func handoffp(pp *p) {
    // If local run queue is not empty, start an M to run it
    if !runqempty(pp) || sched.runqsize != 0 ||
        sched.nmspinning.Load() == 0 && sched.npidle.Load() > 0 {
        startm(pp, false, false)
        return
    }
    // ... else put P on idle list
    pidleput(pp, 0)
}
```

This is why you sometimes see more M (OS threads) than P (GOMAXPROCS): extra Ms are parked or blocked in syscalls while Ps continue scheduling other goroutines.

## Performance Considerations

### GOMAXPROCS

`GOMAXPROCS` controls the number of Ps — the maximum number of goroutines executing simultaneously on CPUs. Since Go 1.5, it defaults to the number of available CPU cores. Setting it too low underutilizes CPUs. Setting it higher than available cores adds scheduling overhead without benefit for CPU-bound work.

```go
import "runtime"

func init() {
    runtime.GOMAXPROCS(4) // use 4 Ps
}
```

### Goroutine Stack Growth

Goroutines start with a **2 KB stack** (configurable but rarely changed). When a function's prologue detects the stack is too small, the runtime allocates a new, larger stack (typically 2x the old size) and **copies** the old stack contents to the new one. This is called a **copyable stack** or **segmented stack replacement** (Go switched from segmented to copying stacks in Go 1.4).

```
  Initial:     After growth:

  +------+     +-------------+
  | 2 KB |     |    4 KB     |
  | stack|     |   stack     |
  |      |     |  (copied    |
  +------+     |   content)  |
               +-------------+
```

This means goroutine creation is cheap ($O(1)$, just allocating a small stack), and stacks only grow when needed. In practice, most goroutines never grow beyond their initial 2-8 KB.

### The `sysmon` Thread

The runtime spawns a special M that runs without a P — the **system monitor** ([`sysmon`](https://github.com/golang/go/blob/master/src/runtime/proc.go)). It runs in a loop and:

- Triggers **netpoll** if no one has polled recently (so idle programs still handle I/O).
- **Retakes Ps** from Ms stuck in syscalls.
- **Preempts** long-running goroutines (>10ms).
- **Triggers GC** if needed.
- Starts with a 20us sleep interval, backs off to 10ms when idle.

## Putting It All Together

Here is the full lifecycle of a goroutine from birth to death:

```
  1. go myFunc()
         |
  2. newproc -> allocate G, put on P's local queue
         |
  3. schedule() on some M picks up G
         |
  4. execute(G) -> gogo(&G.sched) -> jump to myFunc
         |
  5. G runs on CPU...
         |
         +--- hits function call -> stack check -> preemption?
         |         |
         |         +-- yes: save state, back to schedule()
         |         +-- no:  continue running
         |
         +--- blocks on channel/mutex/IO
         |         |
         |         +-- gopark(): G -> _Gwaiting, back to schedule()
         |         +-- ... later: goready(): G -> _Grunnable, onto a queue
         |
         +--- makes syscall
         |         |
         |         +-- entersyscall(): P may be handed off
         |         +-- exitsyscall(): try to reclaim P
         |
  6. myFunc returns -> goexit() -> G -> _Gdead -> put on free list
         |
  7. schedule() picks next G (loop back to step 3)
```

## Summary

| Concept | Purpose |
|---------|---------|
| **G (goroutine)** | Lightweight unit of execution with its own stack |
| **M (machine/thread)** | OS thread that executes code |
| **P (processor)** | Scheduling context with a local run queue; limits parallelism to GOMAXPROCS |
| **Local run queue** | Per-P, lock-free, 256-slot ring buffer |
| **Global run queue** | Overflow queue, protected by mutex |
| **Work stealing** | Idle P steals half of another P's queue |
| **Cooperative preemption** | Stack-check in function prologues |
| **Async preemption** | SIGURG signal for tight loops (Go 1.14+) |
| **Netpoller** | epoll/kqueue integration so I/O doesn't block threads |
| **sysmon** | Background thread for preemption, GC triggers, netpoll, syscall retake |
| **Handoff** | P detaches from M blocked in syscall |

Go's scheduler achieves excellent throughput for concurrent workloads by keeping OS threads busy (work stealing), avoiding blocking them (netpoller, handoff), and doing all context switches in user space (~tens of nanoseconds vs. microseconds for kernel switches).

## References

1. **Go runtime source — proc.go**: [github.com/golang/go/blob/master/src/runtime/proc.go](https://github.com/golang/go/blob/master/src/runtime/proc.go)
2. **Go runtime source — runtime2.go** (structs): [github.com/golang/go/blob/master/src/runtime/runtime2.go](https://github.com/golang/go/blob/master/src/runtime/runtime2.go)
3. **Go runtime source — netpoll_epoll.go**: [github.com/golang/go/blob/master/src/runtime/netpoll_epoll.go](https://github.com/golang/go/blob/master/src/runtime/netpoll_epoll.go)
4. **Original GMP design doc** by Dmitry Vyukov (2012): [docs.google.com/document/d/1TTj4T2JO42uD5ID9e89oa0sLKhJYD0Y_kqxDv3I3XMw](https://docs.google.com/document/d/1TTj4T2JO42uD5ID9e89oa0sLKhJYD0Y_kqxDv3I3XMw)
5. **Go 1.14 Release Notes** (async preemption): [go.dev/doc/go1.14](https://go.dev/doc/go1.14)
6. **"The Go scheduler" by Daniel Morsing**: [morsmachine.dk/go-scheduler](https://morsmachine.dk/go-scheduler)
7. **"Go's work-stealing scheduler" by Jaana Dogan**: [rakyll.org/scheduler](https://rakyll.org/scheduler/)
8. **Go runtime source — proc.go `sysmon`**: search for `func sysmon()` in [proc.go](https://github.com/golang/go/blob/master/src/runtime/proc.go)
