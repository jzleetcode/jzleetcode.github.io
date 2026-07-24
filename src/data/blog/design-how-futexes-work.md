---
author: JZ
pubDatetime: 2026-07-24T06:23:00Z
modDatetime: 2026-07-24T06:23:00Z
title: System Design - How Futexes Work (The Foundation of Every Lock You Use)
tags:
  - design-system
  - design-concurrency
description:
  "How Linux futexes work: the hybrid userspace/kernel synchronization primitive that powers every mutex, condition variable, and semaphore in modern programs. Covers the fast-path CAS, slow-path syscall, kernel hash table, the three-state mutex optimization, and a source code walkthrough from the Linux kernel and glibc."
---

## Table of contents

## Context

Every time you write `pthread_mutex_lock()`, `sync.Mutex.Lock()` in Go, or `synchronized` in Java, you're relying on a single Linux kernel primitive: the **futex** (Fast Userspace muTEX).

Before futexes existed (pre-Linux 2.5.7, 2002), locking always required a system call. Even if no other thread wanted the lock, your thread had to cross the user-kernel boundary — an expensive trip involving saving registers, switching privilege levels, and running kernel code. For programs with millions of lock acquisitions per second, this was devastating for performance.

The insight behind futexes is elegantly simple: **most lock acquisitions are uncontended.** If you're the only thread trying to grab a lock, you shouldn't need the kernel at all. Only when threads actually *compete* for a lock should the kernel get involved to put losers to sleep and wake them later.

```
  The Two Paths of a Futex Lock

  Thread wants the lock
         |
         v
  +-------------------+
  | Try atomic CAS    |     <--- Userspace only
  | (0 -> 1)          |          No syscall!
  +--------+----------+
           |
     +-----+------+
     |            |
   success      fail (contended)
     |            |
     v            v
  [acquired]   +-----------------------+
               | futex(FUTEX_WAIT)     |   <--- Kernel involved
               | Sleep until woken     |        Thread blocked
               +-----------+-----------+
                           |
                       (woken up)
                           |
                           v
                  Retry atomic CAS ...
```

This design means that in the common case (no contention), acquiring a lock costs just **one atomic instruction** — about 10-20 nanoseconds. The syscall path costs 100-200ns but only triggers when threads actually compete.

## The Futex Syscall Interface

At its core, a futex is just a **32-bit integer in userspace memory**. The kernel provides two primary operations on that integer:

```c
#include <linux/futex.h>
#include <sys/syscall.h>

// Block the calling thread if *uaddr == val
long futex_wait(uint32_t *uaddr, uint32_t val) {
    return syscall(SYS_futex, uaddr, FUTEX_WAIT, val, NULL, NULL, 0);
}

// Wake up at most 'count' threads blocked on uaddr
long futex_wake(uint32_t *uaddr, int count) {
    return syscall(SYS_futex, uaddr, FUTEX_WAKE, count, NULL, NULL, 0);
}
```

The kernel syscall signature in [`kernel/futex/syscalls.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/syscalls.c):

```c
SYSCALL_DEFINE6(futex, u32 __user *, uaddr, int, op, u32, val,
                const struct __kernel_timespec __user *, utime,
                u32 __user *, uaddr2, u32, val3)
```

**FUTEX_WAIT** says: "I checked the lock variable and it was `val` (meaning locked). Put me to sleep on this address until someone wakes me."

**FUTEX_WAKE** says: "I just released the lock. Wake up the next thread (or `count` threads) waiting on this address."

The key parameter in `FUTEX_WAIT` is the `val` check. The kernel will **atomically verify** that `*uaddr == val` before sleeping. If the value changed (meaning someone released the lock between your check and the syscall), the kernel returns immediately with `EWOULDBLOCK`. This prevents the classic missed-wakeup race.

There are also advanced operations:

| Operation | Purpose |
|-----------|---------|
| `FUTEX_WAIT_BITSET` | Wait with a bitmask for selective wakeup |
| `FUTEX_WAKE_BITSET` | Wake only waiters whose bitmask matches |
| `FUTEX_REQUEUE` | Move waiters from one futex to another |
| `FUTEX_LOCK_PI` | Priority-inheritance aware locking |
| `FUTEX_UNLOCK_PI` | Priority-inheritance aware unlocking |

## Kernel Data Structures: The Wait Queue

When a thread calls `FUTEX_WAIT`, the kernel needs to record where it's sleeping so it can be woken later. This is managed through a **global hash table** of wait queues.

```
  Kernel Futex Hash Table
  (one per NUMA node, cache-line aligned)

  +---+     +---------------------+
  | 0 | --> | futex_hash_bucket   |
  +---+     |   spinlock          |
  | 1 |     |   chain (plist)     |---> [futex_q] -> [futex_q] -> ...
  +---+     +---------------------+
  | 2 |
  +---+     +---------------------+
  | 3 | --> | futex_hash_bucket   |
  +---+     |   spinlock          |
  |...|     |   chain (plist)     |---> [futex_q] -> ...
  +---+     +---------------------+
  |255|
  +---+

  Hash key = hash(uaddr, memory mapping)
  Bucket = key % table_size
```

The hash bucket structure from [`kernel/futex/futex.h`](https://github.com/torvalds/linux/blob/master/kernel/futex/futex.h):

```c
struct futex_hash_bucket {
    atomic_t waiters;       // Fast check: any waiters at all?
    spinlock_t lock;        // Protects the chain
    struct plist_head chain; // Priority-sorted list of waiters
} ____cacheline_aligned_in_smp;
```

Each waiting thread is represented by a `futex_q`:

```c
struct futex_q {
    struct plist_node list;       // Linkage in the hash bucket chain
    struct task_struct *task;     // The blocked thread
    spinlock_t *lock_ptr;        // Points to the bucket's spinlock
    union futex_key key;         // Identifies which futex this waiter is on
    struct futex_pi_state *pi_state; // For priority-inheritance futexes
    u32 bitset;                  // For selective wake (FUTEX_WAIT_BITSET)
};
```

The `futex_key` union is how the kernel identifies a futex. It encodes the futex's identity differently depending on whether the memory is:
- **Private** (single process): encoded as (mm pointer, virtual address)
- **Shared** (shared memory / file-backed): encoded as (inode, page offset)

This distinction is important because the same physical memory might be mapped at different virtual addresses in different processes, and shared futexes need to work across process boundaries.

## The FUTEX_WAIT Implementation

Let's trace what happens when a thread calls `FUTEX_WAIT`. The implementation lives in [`kernel/futex/waitwake.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/waitwake.c):

```
  FUTEX_WAIT Path

  Thread calls futex(uaddr, FUTEX_WAIT, expected_val)
         |
         v
  +---------------------------+
  | 1. Compute futex key      |   hash(uaddr, mapping) -> bucket
  +------------+--------------+
               |
               v
  +---------------------------+
  | 2. Lock the hash bucket   |   spin_lock(&hb->lock)
  +------------+--------------+
               |
               v
  +---------------------------+
  | 3. Read *uaddr            |   get_user(uval, uaddr)
  | 4. Compare uval == val?   |
  +--------+------------------+
           |
     +-----+------+
     |            |
  uval==val   uval!=val
     |            |
     v            v
  +----------+  return -EWOULDBLOCK
  | 5. Enqueue futex_q        |
  | 6. Set task INTERRUPTIBLE |
  | 7. Unlock bucket          |
  | 8. schedule() — sleep     |
  +----------------------------+
```

The critical section is steps 2-4. By holding the hash bucket spinlock while checking `*uaddr`, the kernel creates an atomic "check-and-sleep" operation. Here's the key function `futex_wait_setup()`:

```c
static int futex_wait_setup(u32 __user *uaddr, u32 val,
                            struct futex_q *q, struct futex_hash_bucket **hb) {
    u32 uval;

    // Get the hash bucket and lock it
    *hb = futex_q_lock(q);

    // Read the current value of the futex (under the bucket lock)
    ret = futex_get_value_locked(&uval, uaddr);

    // If value changed, someone released the lock — don't sleep
    if (uval != val) {
        futex_q_unlock(*hb);
        return -EWOULDBLOCK;
    }

    // Value matches, caller will enqueue and sleep
    return 0;
}
```

## The FUTEX_WAKE Implementation

The wake side is simpler. When a thread releases a lock and needs to wake waiters:

```c
int futex_wake(u32 __user *uaddr, unsigned int flags, int nr_wake, u32 bitset) {
    struct futex_hash_bucket *hb;
    union futex_key key;

    // Compute the same hash key as the waiter
    futex_setup_key(uaddr, flags, &key);
    hb = futex_hash(&key);

    // Fast path: no waiters, skip locking entirely
    if (!futex_hb_waiters_pending(hb))
        return 0;

    spin_lock(&hb->lock);
    plist_for_each_entry_safe(q, next, &hb->chain, list) {
        if (futex_match(&q->key, &key)) {
            // Found a matching waiter — wake it
            futex_wake_mark(&wake_q, q);
            if (++ret >= nr_wake)
                break;
        }
    }
    spin_lock(&hb->lock);

    // Actually wake the tasks (outside the lock for performance)
    wake_up_q(&wake_q);
    return ret;
}
```

The `futex_hb_waiters_pending()` fast-path check is an optimization: if the `waiters` atomic counter is zero, we skip acquiring the spinlock entirely. This is important because waking a futex with no waiters is a common case (thread releases lock, no one was competing).

## Preventing Missed Wakeups: The Memory Barrier Protocol

The most subtle part of the futex design is preventing this race:

```
  Thread A (waiter)              Thread B (waker)
  ─────────────────              ─────────────────
  1. Read *futex → locked
                                 2. Set *futex = unlocked
                                 3. FUTEX_WAKE → no waiters found!
  4. FUTEX_WAIT(val=locked)
     → sleeps forever!           (already left)
```

Thread A sees the lock is taken and prepares to sleep. But between reading the value and entering the kernel, Thread B releases the lock and tries to wake — finding no one to wake. Thread A then sleeps forever.

Futexes solve this with the atomic value check:

```
  Thread A (waiter)              Thread B (waker)
  ─────────────────              ─────────────────
  1. Read *futex → locked
                                 2. Set *futex = unlocked
  3. FUTEX_WAIT(val=locked)
     kernel reads *futex
     → sees "unlocked" ≠ locked
     → returns EWOULDBLOCK       3. FUTEX_WAKE → no waiters
                                    (fine, A didn't sleep)
  4. Retry → CAS succeeds!
```

But there's a subtlety: what if Thread B's store (step 2) and Thread A's kernel read (step 3) happen on different CPUs with reordered memory? The kernel uses a careful memory barrier protocol between the `waiters` counter and the hash bucket lock:

```
  Waiter (FUTEX_WAIT)            Waker (FUTEX_WAKE)
  ─────────────────────          ─────────────────────
  atomic_inc(&hb->waiters)       *futex = new_value
  smp_mb()         [Barrier A]   smp_mb()        [Barrier B]
  lock(&hb->lock)                read(hb->waiters)
  read(*futex)                   if (waiters) lock(&hb->lock)
```

Either the waiter's read of `*futex` sees the new value (and returns `EWOULDBLOCK`), or the waker's read of `hb->waiters` sees the incremented count (and proceeds to wake). At least one of them observes the other's write — a classic barrier pairing that guarantees no missed wakeups.

## The Three-State Mutex: How glibc Uses Futexes

Now let's see how `pthread_mutex_lock()` uses futexes in practice. The implementation lives in glibc's NPTL (Native POSIX Threads Library) at [`nptl/pthread_mutex_lock.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=nptl/pthread_mutex_lock.c):

The futex word has three states:

```
  State 0: Unlocked
  ┌────────────────────────┐
  │  No one holds the lock │
  └────────────────────────┘

  State 1: Locked, no waiters
  ┌────────────────────────┐
  │  One thread holds it   │
  │  No one else wants it  │
  │  (unlock is cheap)     │
  └────────────────────────┘

  State 2: Locked, with waiters
  ┌────────────────────────┐
  │  One thread holds it   │
  │  Others are sleeping   │
  │  (unlock must wake)    │
  └────────────────────────┘
```

State transitions:

```
           CAS(0→1)                exchange(→2)
  [0] ─────────────────→ [1] ──────────────────→ [2]
   ^                      |                       |
   |    store 0           |      store 0          |
   +──────────────────────+      + FUTEX_WAKE     |
   +──────────────────────────────────────────────+
```

Here's the locking code (simplified from glibc):

```c
void pthread_mutex_lock(mutex) {
    // Fast path: try to grab unlocked mutex (0 → 1)
    if (atomic_cmpxchg(&mutex->lock, 0, 1) == 0)
        return;  // Got it! No syscall needed.

    // Slow path: mutex is contended
    __lll_lock_wait(&mutex->lock);
}

void __lll_lock_wait(int *futex) {
    // Set state to 2 (locked with waiters) and sleep
    while (atomic_exchange(futex, 2) != 0) {
        futex_wait(futex, 2);  // Sleep until *futex != 2
    }
    // When we wake and exchange returns 0, we own the lock
    // (and we set it to 2, which is correct — there might be more waiters)
}
```

And the unlock:

```c
void pthread_mutex_unlock(mutex) {
    // Atomically set to 0 and get previous value
    int prev = atomic_exchange(&mutex->lock, 0);

    if (prev == 2) {
        // There were waiters — wake one up
        futex_wake(&mutex->lock, 1);
    }
    // If prev == 1, no waiters, no syscall needed!
}
```

Why three states instead of two? Consider what happens with just two states (0=unlocked, 1=locked):

- Thread A holds the lock (state=1)
- Thread B tries to lock, fails, sleeps via `FUTEX_WAIT`
- Thread A unlocks: must always call `FUTEX_WAKE` even if no one is waiting

With the three-state design, unlock only calls `FUTEX_WAKE` when the state was 2 (someone is actually waiting). The uncontended unlock path (state 1→0) is a single atomic store with **no syscall**. This optimization is huge for lightly-contended locks.

## A Complete Example: Two Threads

Let's trace through a complete scenario with two threads competing for a mutex:

```
  Time    Thread A                    Thread B                 futex value
  ────    ─────────────────────       ──────────────────────   ───────────
   t0     CAS(0→1) succeeds                                      0 → 1
          [acquired lock]
   t1                                 CAS(0→1) fails (val=1)     1
   t2                                 exchange(→2) returns 1     1 → 2
   t3                                 futex_wait(futex, 2)       2
                                      [sleeping in kernel]
   t4     exchange(→0) returns 2                                 2 → 0
          prev==2, so call wake
   t5     futex_wake(futex, 1)        [woken by kernel]          0
   t6                                 exchange(→2) returns 0     0 → 2
                                      [loop exits: got lock!]
   t7                                 [holds lock, state=2]      2
   t8                                 exchange(→0) returns 2     2 → 0
                                      prev==2, calls wake
   t9                                 futex_wake(futex, 1)       0
                                      [no waiters, returns 0]
```

Notice at t6: Thread B does `atomic_exchange(futex, 2)` which returns 0 (the old value). Since the old value was 0, the while-loop condition `!= 0` is false, so it exits — Thread B acquired the lock. The value is now 2 even though there are no more waiters, which means the next unlock will do an unnecessary `FUTEX_WAKE` — but that's harmless (returns 0 waiters) and avoids a more complex state tracking scheme.

## Priority Inheritance: Avoiding Inversion

A classic problem with mutexes is **priority inversion**: a high-priority thread waits for a lock held by a low-priority thread, which is preempted by medium-priority threads. The high-priority thread is effectively blocked by medium-priority work.

```
  Priority Inversion

  High   ───────────■■■■■■■■■ BLOCKED (waiting for lock)
                              ↑ can't run!
  Med    ─────■■■■■■■■■■■■■■■■■■■■■■■■■■■■ (runs freely)
                              ↑ preempts Low
  Low    ■■■──────────────────────────────── (holds lock, preempted)
         ^lock                                                ^unlock
```

Linux PI futexes solve this by temporarily boosting the lock holder's priority:

```
  With Priority Inheritance

  High   ───────────■■ BLOCKED (waiting)
                    ↑ boosts Low's priority
  Med    ─────■■──────────■■■■■■■■■■■■■■■■ (preempted while Low runs)
  Low    ■■■──■■■■■■■■■■── (boosted to High priority, finishes fast)
         ^lock       ^unlock
                     ↑ High gets lock, Low returns to normal priority
```

The kernel implements this through `FUTEX_LOCK_PI` and `FUTEX_UNLOCK_PI` in [`kernel/futex/pi.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/pi.c). These operations maintain a chain of priority inheritance through `struct futex_pi_state`, propagating priority boosts through potentially multiple levels of lock dependency.

## Futexes in the Wild

Futexes are not just for pthreads. They're the building block for almost every synchronization primitive:

| What You Use | How It Uses Futex |
|---|---|
| `pthread_mutex_lock` | Direct futex (as shown above) |
| `pthread_cond_wait` | `FUTEX_WAIT` on a sequence number |
| `pthread_rwlock` | Futex with reader/writer counts encoded in the word |
| `sem_wait` / `sem_post` | Futex on the semaphore counter |
| Go `sync.Mutex` | `futex(FUTEX_WAIT)` via `runtime.futex()` |
| Java `synchronized` | Falls through to futex after spin attempts |
| Rust `std::sync::Mutex` | Direct futex on Linux (since Rust 1.62) |
| Python `threading.Lock` | Calls pthread, which calls futex |

Go's runtime has its own direct futex wrapper in [`src/runtime/os_linux.go`](https://github.com/golang/go/blob/master/src/runtime/os_linux.go):

```go
//go:nosplit
func futex(addr unsafe.Pointer, op int32, val uint32,
           ts, addr2 unsafe.Pointer, val3 uint32) int32
```

Rust made an interesting choice: starting with version 1.62, `std::sync::Mutex` on Linux uses futex directly instead of wrapping pthreads, eliminating the extra allocation and indirection of a `pthread_mutex_t`.

## Performance: Why This Design Wins

The numbers tell the story:

```
  Operation                         Approximate Cost
  ─────────────────────────────     ────────────────
  Atomic CAS (uncontended lock)     10-20 ns
  futex() syscall (user→kernel)     100-200 ns
  Context switch (sleep + wake)     1,000-10,000 ns
  
  Ratio of fast-path to slow-path:  10-100x
```

For a web server handling 100,000 requests/sec with 50 lock acquisitions per request, that's 5 million lock operations per second. If 95% are uncontended (a typical ratio), the futex design saves:

$$4{,}750{,}000 \times (200\text{ns} - 20\text{ns}) = 855\text{ms of CPU time per second}$$

That's nearly an entire CPU core saved just by avoiding unnecessary syscalls.

## Key Source Files

| File | What It Contains |
|------|-----------------|
| [`kernel/futex/syscalls.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/syscalls.c) | `sys_futex()` entry point, operation dispatch |
| [`kernel/futex/waitwake.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/waitwake.c) | `FUTEX_WAIT` and `FUTEX_WAKE` implementation |
| [`kernel/futex/core.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/core.c) | Hash table, key computation, queue management |
| [`kernel/futex/futex.h`](https://github.com/torvalds/linux/blob/master/kernel/futex/futex.h) | `futex_q`, `futex_hash_bucket` structures |
| [`kernel/futex/pi.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/pi.c) | Priority inheritance operations |
| [`kernel/futex/requeue.c`](https://github.com/torvalds/linux/blob/master/kernel/futex/requeue.c) | `FUTEX_REQUEUE`, `FUTEX_CMP_REQUEUE` |

## References

1. Ulrich Drepper, "Futexes Are Tricky" [paper](https://www.akkadia.org/drepper/futex.pdf) — the definitive guide to futex usage patterns
2. Hubertus Franke, Rusty Russell, Matthew Kirkwood, "Fuss, Futexes and Furwocks: Fast Userlevel Locking in Linux" [paper](https://www.kernel.org/doc/ols/2002/ols2002-pages-479-495.pdf) — the original 2002 OLS paper introducing futexes
3. Linux kernel futex implementation [`kernel/futex/`](https://github.com/torvalds/linux/tree/master/kernel/futex)
4. glibc NPTL mutex [`nptl/pthread_mutex_lock.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=nptl/pthread_mutex_lock.c)
5. futex(2) man page [man7.org](https://man7.org/linux/man-pages/man2/futex.2.html)
6. LWN.net, "A futex overview and update" [article](https://lwn.net/Articles/360699/)
7. Go runtime futex wrapper [`src/runtime/os_linux.go`](https://github.com/golang/go/blob/master/src/runtime/os_linux.go)
8. Rust std::sync::Mutex futex-based implementation [`library/std/src/sys/sync/mutex/futex.rs`](https://github.com/rust-lang/rust/blob/master/library/std/src/sys/sync/mutex/futex.rs)
