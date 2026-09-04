---
author: JZ
pubDatetime: 2026-09-04T06:23:00Z
modDatetime: 2026-09-04T06:23:00Z
title: System Design - How RCU (Read-Copy-Update) Works
tags:
  - design-system
  - design-concurrency
description:
  "How Linux's RCU (Read-Copy-Update) synchronization mechanism works: the publish-subscribe pattern, grace periods, quiescent states, memory barriers, and a source code walkthrough of the Linux kernel's Tree RCU implementation."
---

## Table of contents

## Context

Imagine a busy library. Hundreds of people are reading books at the same time, but occasionally a librarian needs to replace an outdated edition with a new one. The naive approach — lock the entire library, swap the book, then unlock — would make every reader wait, even if they are reading completely different books. That is essentially what a read-write lock does in software: writers block all readers.

In operating system kernels, this matters enormously. The Linux kernel maintains data structures — routing tables, module lists, file system metadata — that are read millions of times per second but updated rarely. If every read requires acquiring a lock, the cost of **cache-line bouncing** alone (where CPUs fight over the lock's memory location) destroys performance on multi-core machines.

**RCU (Read-Copy-Update)** is a synchronization mechanism invented to solve this exact problem. It allows readers to access shared data with **zero overhead** — no locks, no atomic operations, no memory barriers on the read side. Writers, in exchange, do more work: they create a new copy of the data, publish it, and then wait for all pre-existing readers to finish before reclaiming the old version.

```
  Traditional read-write lock         RCU

  Reader A ---[LOCK]---read---[UNLOCK]---   Reader A ---read--->
  Reader B ---[LOCK]---read---[UNLOCK]---   Reader B ---read--->
  Writer   ---[LOCK]---write--[UNLOCK]---   Writer   ---copy--->publish--->wait--->free old
                                                                  ^
  All serialize on the lock              Readers never block    grace
                                                               period
```

RCU was introduced to the Linux kernel by Paul McKenney in 2002 (kernel 2.5.43). Today it protects hundreds of kernel data structures and is one of the most performance-critical pieces of infrastructure in the kernel. Let's walk through how it works.

## The Core Idea: Publish, Read, Wait, Reclaim

RCU's algorithm has four conceptual steps. We'll use a linked list as the running example, since that's the most common use case in the kernel.

### Step 1: Read (the fast path)

A reader enters an **RCU read-side critical section**, traverses the data structure, and exits. The critical section is delimited by `rcu_read_lock()` and `rcu_read_unlock()`:

```c
rcu_read_lock();
struct foo *p = rcu_dereference(global_ptr);
// use p->field safely
do_something(p->field);
rcu_read_unlock();
```

On non-preemptible kernels (the common case for servers), `rcu_read_lock()` simply disables preemption. It does **not** acquire any lock, does **not** perform any atomic operation, and does **not** touch any shared cache line. This is why RCU reads are essentially free.

`rcu_dereference()` is a macro that inserts a **data dependency barrier** — on most architectures (x86, ARM with LDAR), this compiles to nothing. It exists for DEC Alpha, where a CPU can speculatively follow a pointer before the pointer value has been fully loaded (a hardware quirk unique to Alpha).

### Step 2: Copy and Publish (the writer)

When a writer wants to update the data structure, it creates a new version:

```c
struct foo *new = kmalloc(sizeof(*new), GFP_KERNEL);
*new = *old;           // copy
new->field = new_value; // modify the copy

rcu_assign_pointer(global_ptr, new);  // publish
```

`rcu_assign_pointer()` inserts a **write memory barrier** before the pointer assignment. This ensures that any CPU reading the new pointer will also see the fully initialized fields of the new structure. Without this barrier, a reader could follow the new pointer and see stale (uninitialized) field values.

```
  Memory ordering guarantee:

  Writer CPU                          Reader CPU
  ----------                          ----------
  new->field = value                  p = rcu_dereference(ptr)
       |                                   |
    [write barrier]                   [data dependency]
       |                                   |
  global_ptr = new                    use p->field
       |                                   |
       v                                   v
  All stores to *new are              Reader sees either old ptr
  visible before the                  (and old data) or new ptr
  pointer update                      (and new data), never a mix
```

### Step 3: Wait for Readers (the grace period)

After publishing the new pointer, old readers might still hold a reference to the old data. The writer must wait for all of them to finish:

```c
synchronize_rcu();  // blocks until all pre-existing readers complete
```

This call blocks until every CPU has passed through a **quiescent state** — a point where the CPU is guaranteed not to be inside an RCU read-side critical section. On non-preemptible kernels, any of these events is a quiescent state:

- The CPU runs in user mode
- The CPU is idle
- The CPU executes a context switch

Why do these work? Because `rcu_read_lock()` disables preemption, a context switch proves that the CPU is not inside a critical section. Once every CPU has gone through at least one quiescent state after the `synchronize_rcu()` call, we know that no reader can still be referencing the old data.

```
  CPU 0        CPU 1        CPU 2        Time
    |            |            |            |
    | rcu_read   |            |            |
    | _lock()    |            |            |
    |  [reading  |            |            |
    |   old ptr] |            |            |
    |  rcu_read  |            |            |
    |  _unlock() |            |            v
    |            |            |
 - - - - - synchronize_rcu() called - - - - -
    |            |            |
    | context    |            |            grace
    | switch     | idle       |            period
    | (QS)       | (QS)       | user mode  ...
    |            |            | (QS)
    |            |            |
 - - - - - grace period ends - - - - - - -
    |            |            |
    v            v            v
    all CPUs passed through a quiescent state
    => safe to free old data
```

**QS** = quiescent state. The grace period ends when the last CPU reports its quiescent state.

### Step 4: Reclaim

Once the grace period completes, the writer frees the old data:

```c
kfree(old);
```

No reader can possibly reference it anymore.

## Putting It All Together

Here is the full lifecycle of an RCU-protected update to a singly linked list:

```
  Before update:
  HEAD --> [A] --> [B] --> [C] --> NULL
                    ^
                    | (will be updated)

  Step 1: Writer allocates B' with new data
          B' has next = C (same as B)

  HEAD --> [A] --> [B] --> [C] --> NULL
                    ^
           [B'] ---+-----/
            (new, points to C)

  Step 2: Writer publishes — A->next = B' (with write barrier)

  HEAD --> [A] --> [B'] --> [C] --> NULL
                    
           [B] ----------> [C]
            ^
            | (old, still reachable by pre-existing readers)

  Step 3: synchronize_rcu() — wait for grace period

  Step 4: kfree(B) — no reader can see B anymore
  
  Final:
  HEAD --> [A] --> [B'] --> [C] --> NULL
```

Notice that readers traversing the list during the update see either the old version (A→B→C) or the new version (A→B'→C), but **never** a corrupted or partial state. This is the key invariant RCU provides.

## The API at a Glance

The kernel exposes a small, focused API:

```
  Function                 Purpose                   Side
  -----------------------  ------------------------  ------
  rcu_read_lock()          Begin read-side section   Reader
  rcu_read_unlock()        End read-side section     Reader
  rcu_dereference(p)       Load RCU-protected ptr    Reader
  rcu_assign_pointer(p,v)  Publish new pointer       Writer
  synchronize_rcu()        Wait for grace period     Writer
  call_rcu(head, func)     Defer callback to after   Writer
                           grace period (async)
  kfree_rcu(ptr, field)    Shorthand: free after     Writer
                           grace period
```

`call_rcu()` is the asynchronous version of `synchronize_rcu()`. Instead of blocking, it registers a callback that the RCU infrastructure invokes after the grace period ends. This is critical for performance-sensitive paths where blocking is unacceptable:

```c
// synchronous (blocks the writer)
synchronize_rcu();
kfree(old);

// asynchronous (returns immediately, frees later)
kfree_rcu(old, rcu_head);
```

## Inside the Linux Kernel: Tree RCU

The production RCU implementation in the Linux kernel is called **Tree RCU** (since kernel 2.6.29). It organizes CPUs into a hierarchy to avoid having a single global counter that every CPU must update.

### The Problem with Flat RCU

Imagine 256 CPUs, each reporting their quiescent state by writing to a single bitmap. Every write causes the cache line holding the bitmap to bounce between CPUs. With 256 CPUs, this serialization point becomes a bottleneck.

### The Tree Solution

Tree RCU arranges CPUs into groups (called `rcu_node` structures), forming a tree:

```
                     +-------------+
                     |  root node  |
                     |  (level 0)  |
                     +------+------+
                            |
              +-------------+-------------+
              |                           |
       +------+------+            +------+------+
       |   node L1   |            |   node L1   |
       |  CPUs 0-15  |            | CPUs 16-31  |
       +------+------+            +------+------+
              |                           |
     +--------+--------+        +--------+--------+
     |        |        |        |        |        |
  +--+--+  +--+--+  +--+--+  +--+--+  +--+--+  +--+--+
  | leaf |  | leaf |  | leaf |  | leaf |  | leaf |  | leaf |
  |0-3   |  |4-7   |  |8-11 |  |12-15|  |16-19|  |20-23|
  +------+  +------+  +------+  +------+  +------+  +------+
  ||||       ||||       ||||       ||||       ||||       ||||
  CPUs       CPUs       CPUs       CPUs       CPUs       CPUs
```

Each leaf node tracks a small group of CPUs (typically 16). When all CPUs in a leaf report quiescent states, the leaf propagates upward to its parent. The grace period completes when the root node sees all children done. This reduces contention from O(N) to O(log N) for N CPUs.

The key structures live in [`kernel/rcu/tree.h`](https://github.com/torvalds/linux/blob/master/kernel/rcu/tree.h):

```c
struct rcu_node {
    raw_spinlock_t lock;
    unsigned long gp_seq;        // current grace period sequence
    unsigned long qsmask;        // bitmask: which children still owe a QS
    unsigned long qsmaskinit;    // initial mask at grace period start
    struct rcu_node *parent;
    // ...
};

struct rcu_data {
    unsigned long gp_seq;        // last GP this CPU participated in
    bool cpu_no_qs;              // true if CPU hasn't reported QS yet
    struct rcu_segcblist cblist;  // callbacks waiting for GP completion
    // ...
};
```

Each CPU has its own `rcu_data` (no sharing, no cache-line bouncing for the common case). The `rcu_node` tree is shared, but each CPU only touches its leaf node, and only when reporting a quiescent state.

### Grace Period State Machine

The grace period is managed by a dedicated kernel thread `rcu_gp_kthread` defined in [`kernel/rcu/tree.c`](https://github.com/torvalds/linux/blob/master/kernel/rcu/tree.c). It runs a state machine:

```
  +----------+     new callbacks      +-----------+
  |  IDLE    |  ------------------->  |   INIT    |
  | (no GP   |    need a new GP       | set up    |
  |  needed) |                        | qsmasks   |
  +----------+                        +-----+-----+
       ^                                    |
       |                                    v
       |                             +------+------+
       |   all QS reported           |    WAIT     |
       +-----------------------------+  for CPUs   |
       |                             |  to report  |
  +----+------+                      |    QS       |
  |  CLEANUP  |                      +------+------+
  |  invoke   |                             |
  |  callbacks|                        all done
  +-----------+                             |
       ^                                    v
       |                             +------+------+
       +-----------------------------+   FQS       |
                                     | force QS    |
                                     | on slow CPUs|
                                     +-------------+
```

Here is a simplified view of the main loop from `rcu_gp_kthread()`:

```c
static int rcu_gp_kthread(void *unused)
{
    for (;;) {
        // Sleep until callbacks need a new grace period
        swait_event_idle(rcu_state.gp_wq,
                         rcu_gp_init_needed() || kthread_should_stop());

        // Initialize: set qsmask bits for all online CPUs
        rcu_gp_init();

        // Wait for all CPUs to report quiescent states
        // Periodically force stragglers via force_qs
        rcu_gp_fqs_loop();

        // Cleanup: advance callbacks, wake up waiters
        rcu_gp_cleanup();
    }
}
```

### Quiescent State Reporting

When a CPU goes through a context switch, the scheduler calls `rcu_note_context_switch()`, which records the quiescent state:

```c
void rcu_note_context_switch(void)
{
    struct rcu_data *rdp = this_cpu_ptr(&rcu_data);
    
    // Record that this CPU passed through a quiescent state
    rcu_qs();
    
    // If this CPU has noted a QS for the current GP, report it
    if (rdp->cpu_no_qs.b.norm)
        return;
    rcu_report_qs_rdp(rdp);
}
```

`rcu_report_qs_rdp()` clears this CPU's bit in the leaf `rcu_node`'s `qsmask`. If that was the last bit, it propagates up the tree:

```c
static void rcu_report_qs_rnp(unsigned long mask, struct rcu_node *rnp)
{
    for (;;) {
        // Clear this child's bit
        rnp->qsmask &= ~mask;
        
        if (rnp->qsmask != 0)
            return;  // other children still pending
        
        if (rnp->parent == NULL) {
            // Root reached — grace period can end
            rcu_report_gp_end();
            return;
        }
        
        // Propagate to parent
        mask = rnp->grpmask;  // this node's bit in parent
        rnp = rnp->parent;
    }
}
```

This walk from leaf to root is the only part of RCU where different CPUs contend on shared data, and it happens at most once per CPU per grace period.

### Callback Processing

When a grace period ends, callbacks registered via `call_rcu()` become ready to invoke. Each CPU processes its own callback list in softirq context:

```c
// Simplified from rcu_do_batch()
static void rcu_do_batch(struct rcu_data *rdp)
{
    struct rcu_cblist rcl;
    
    // Move ready callbacks to a local list
    rcu_segcblist_extract_done_cbs(&rdp->cblist, &rcl);
    
    // Invoke each callback
    while ((rhp = rcu_cblist_dequeue(&rcl)) != NULL) {
        rhp->func(rhp);  // e.g., kfree_rcu's callback calls kfree()
    }
}
```

By keeping callbacks per-CPU, this avoids cross-CPU synchronization during the common case of callback invocation.

## Flavors of RCU

The Linux kernel provides several RCU variants for different contexts:

```
  Flavor          Read-side primitive    Quiescent state        Use case
  --------------- --------------------   --------------------   -----------------
  RCU             rcu_read_lock()        context switch,        General kernel
  (classic)       rcu_read_unlock()      user mode, idle        data structures

  RCU-bh          rcu_read_lock_bh()     softirq completion     Network packet
  (bottom-half)   rcu_read_unlock_bh()                          processing

  RCU-sched       rcu_read_lock_sched()  context switch,        Scheduler and
  (scheduler)     rcu_read_unlock_sched() user mode, idle       interrupt contexts

  SRCU            srcu_read_lock()       srcu_read_unlock()     Sleeping allowed
  (sleepable)     srcu_read_unlock()     (explicit tracking)    in critical section
```

**SRCU** (Sleepable RCU) is notable because it allows readers to sleep inside critical sections. Classic RCU cannot allow this — if a reader sleeps, it never goes through a quiescent state, and the grace period would never end. SRCU solves this by maintaining per-CPU counters that explicitly track the number of active readers.

## RCU vs. Other Synchronization

How does RCU compare to the alternatives?

```
  Mechanism         Read cost    Write cost   Readers block?   Writers block?
  ---------------   ----------   ----------   --------------   --------------
  Spinlock          Lock/unlock  Lock/unlock  Yes (on write)   Yes (on read)
  RW-lock           Lock/unlock  Lock/unlock  Yes (on write)   Yes (on read)
  Seqlock           Retry loop   Lock/unlock  No (but retry)   Yes (on read)
  RCU               ~Zero        Copy+wait    No               No (deferred)
  Lock-free (CAS)   CAS/retry    CAS/retry    No               No
```

RCU wins decisively when:
- Reads vastly outnumber writes (100:1 or higher)
- Read performance is critical
- Stale data is acceptable for short periods (the grace period window)

RCU is a poor fit when:
- Reads and writes are balanced
- The data structure is small (copying overhead dominates)
- Readers need the absolute latest version immediately

## Real-World Examples in the Kernel

RCU protects some of the most performance-sensitive paths:

**Routing table lookups** — Every packet the kernel forwards requires a routing table lookup. The routing table changes only when routes are added or removed (rare), but lookups happen millions of times per second. RCU makes each lookup lock-free.

**File system dentries** — The directory entry cache (`dcache`) maps pathnames to inodes. `rcu_read_lock()` protects path walks, avoiding lock contention during `open()`, `stat()`, and similar system calls.

**Module list** — The list of loaded kernel modules is read on every symbol lookup but only modified during `insmod`/`rmmod`. RCU protects traversal while modules are being loaded or removed.

**PID lookups** — Finding a process by PID is a frequent operation for signals, scheduling, and `/proc`. The PID hash table is RCU-protected so lookups don't compete with `fork()` and `exit()`.

## Performance Impact

Paul McKenney's benchmarks (from his PhD dissertation and various LWN articles) show dramatic improvements:

- **Read-side overhead:** ~0 ns for non-preemptible kernels (the `rcu_read_lock()`/`rcu_read_unlock()` pair compiles to local preemption counter adjustments, which are CPU-local and stay in L1 cache)
- **Grace period latency:** Typically 5-20 ms on a lightly loaded system, bounded by the scheduling tick interval
- **Scalability:** Near-linear read-side scaling up to thousands of CPUs, compared to reader-writer locks which plateau at ~8-16 CPUs due to cache-line bouncing

On a 64-core system performing routing lookups, switching from `rwlock` to RCU improved throughput by over **10x** while reducing tail latency from milliseconds to microseconds.

## Common Pitfalls

RCU has a deceptively simple API, but several mistakes are common:

**Holding an RCU reference too long.** Grace periods have a deadline. If a reader holds `rcu_read_lock()` for an extended time (especially across blocking operations), grace periods stall, memory from deferred `kfree_rcu()` accumulates, and the system can eventually OOM:

```c
rcu_read_lock();
// BAD: sleeping with RCU read lock held (classic RCU)
msleep(1000);
rcu_read_unlock();
```

**Forgetting `rcu_dereference()`.** Accessing an RCU-protected pointer without the macro can cause subtle bugs on weakly-ordered architectures:

```c
// WRONG: compiler/CPU might reorder the load
struct foo *p = global_ptr;

// CORRECT: ensures ordering
struct foo *p = rcu_dereference(global_ptr);
```

**Modifying data in place.** The whole point of RCU is copy-then-publish. If a writer modifies the original object while readers can see it, RCU provides no protection:

```c
// WRONG: in-place modification
rcu_dereference(global_ptr)->field = new_value;

// CORRECT: copy, modify, publish
struct foo *new = kmalloc(sizeof(*new), GFP_KERNEL);
*new = *rcu_dereference(global_ptr);
new->field = new_value;
rcu_assign_pointer(global_ptr, new);
```

## References

1. Paul E. McKenney, "What is RCU, Fundamentally?" [LWN](https://lwn.net/Articles/262464/)
2. Paul E. McKenney, "What is RCU? Part 2: Usage" [LWN](https://lwn.net/Articles/263130/)
3. Paul E. McKenney, "RCU part 3: the RCU API" [LWN](https://lwn.net/Articles/264090/)
4. Paul E. McKenney, *Is Parallel Programming Hard, And, If So, What Can You Do About It?* [book](https://mirrors.edge.kernel.org/pub/linux/kernel/people/paulmck/perfbook/perfbook.html)
5. Linux kernel RCU documentation [`Documentation/RCU/`](https://github.com/torvalds/linux/tree/master/Documentation/RCU)
6. Tree RCU implementation [`kernel/rcu/tree.c`](https://github.com/torvalds/linux/blob/master/kernel/rcu/tree.c)
7. Tree RCU header [`kernel/rcu/tree.h`](https://github.com/torvalds/linux/blob/master/kernel/rcu/tree.h)
8. RCU API header [`include/linux/rcupdate.h`](https://github.com/torvalds/linux/blob/master/include/linux/rcupdate.h)
9. Jonathan Corbet, "The RCU API, 2019 edition" [LWN](https://lwn.net/Articles/777036/)
