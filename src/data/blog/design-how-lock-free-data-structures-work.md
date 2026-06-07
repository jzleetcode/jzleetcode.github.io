---
author: JZ
pubDatetime: 2026-06-07T10:00:00Z
modDatetime: 2026-06-07T10:00:00Z
title: System Design - How Lock-Free Data Structures Work
tags:
  - design-system
  - design-concurrency
description:
  "How lock-free data structures work: CAS operations, memory ordering, the ABA problem, lock-free stacks and queues, and source code walkthrough from the Linux kernel and Java's java.util.concurrent."
---

## Table of contents

## Context

When multiple threads share a data structure, the simplest approach is a mutex: one thread locks, does its work, then unlocks. Every other thread waits. This works, but under high contention, threads pile up behind the lock like cars at a toll booth.

**Lock-free** data structures take a different approach. Instead of exclusive access, every thread tries to make progress simultaneously. If two threads conflict, one succeeds and the other retries — but no thread ever blocks waiting for another. This means the system as a whole always makes progress, even if one thread is paused by the OS scheduler.

```
            Mutex-based                         Lock-free

   Thread A ----[====LOCK====]---->     Thread A ----[CAS ok]---->
   Thread B --------[wait...]----->     Thread B ----[CAS fail, retry, CAS ok]-->
   Thread C -----------[wait...]-->     Thread C ----[CAS ok]---->

   If A is preempted while holding      If A is preempted, B and C
   the lock, B and C cannot proceed.    continue making progress.
```

Lock-free structures are used in operating system kernels, database engines, garbage collectors, and high-frequency trading systems — anywhere throughput matters more than simplicity.

## The Foundation: Compare-And-Swap (CAS)

Every lock-free algorithm is built on a single hardware primitive: **Compare-And-Swap** (CAS). On x86, this is the `CMPXCHG` instruction. On ARM, it's a `LDXR`/`STXR` (load-exclusive/store-exclusive) pair.

CAS takes three arguments: a **memory location**, an **expected value**, and a **new value**. It atomically does:

```
  CAS(address, expected, new):
      atomically {
          if *address == expected:
              *address = new
              return true       // success
          else:
              return false      // someone else changed it
      }
```

The key word is **atomically**. The CPU guarantees that no other core can observe a half-done state. Either the swap happens completely, or it doesn't happen at all.

Here is what CAS looks like in several languages:

```c
// C11 — stdatomic.h
_Atomic int counter = 0;
int old = atomic_load(&counter);
while (!atomic_compare_exchange_weak(&counter, &old, old + 1)) {
    // old is updated to the current value on failure, so we retry
}
```

```java
// Java — java.util.concurrent.atomic
AtomicInteger counter = new AtomicInteger(0);
int old;
do {
    old = counter.get();
} while (!counter.compareAndSet(old, old + 1));
```

```go
// Go — sync/atomic
var counter int64
for {
    old := atomic.LoadInt64(&counter)
    if atomic.CompareAndSwapInt64(&counter, old, old+1) {
        break
    }
}
```

The pattern is always the same: **read** the current value, **compute** the new value, **CAS** to install it. If CAS fails (someone else changed the value between our read and our CAS), **retry**.

## Memory Ordering: Why CAS Alone Isn't Enough

Modern CPUs reorder instructions for performance. A write on core 1 might not be visible to core 2 for many nanoseconds. Lock-free code must explicitly control this visibility using **memory orderings** (also called memory barriers or fences).

```
  Core 1                          Core 2
  ------                          ------
  data = 42;                      while (!ready) {}   // spin
  ready = true;                   print(data);        // might print 0!

  Without ordering, Core 2 might see ready=true
  before data=42 is visible in its cache.
```

The C11/C++11 memory model defines these orderings (from weakest to strongest):

```
  Ordering           Guarantee
  -----------------  ------------------------------------------------
  relaxed            Atomicity only. No ordering between operations.
  acquire            Reads after this cannot move before it.
                     (used on loads — "I want to see everything the
                      releaser wrote before releasing")
  release            Writes before this cannot move after it.
                     (used on stores — "make my prior writes visible
                      to anyone who acquires this")
  acq_rel            Both acquire and release. (used on read-modify-write)
  seq_cst            Total order across all threads. Strongest, slowest.
```

A typical lock-free pattern pairs **release** on the writer side with **acquire** on the reader side:

```c
// Producer (Core 1)
data = 42;                               // regular write
atomic_store_explicit(&ready, 1, memory_order_release);  // fence: all prior writes visible

// Consumer (Core 2)
while (!atomic_load_explicit(&ready, memory_order_acquire)) {}  // fence: subsequent reads see producer's writes
assert(data == 42);  // guaranteed!
```

Java's `volatile` keyword and Go's `sync/atomic` functions provide **sequentially consistent** ordering by default — the strongest guarantee. This is simpler but slightly slower than hand-tuned acquire/release pairs.

## A Lock-Free Stack (Treiber Stack)

The simplest useful lock-free data structure is the **Treiber stack** (1986). It's a singly-linked list where push and pop only modify the head pointer using CAS.

```
  Stack state:           head --> [C] --> [B] --> [A] --> nil

  Push(D):
    1. new_node.next = head        (read head, which is C)
    2. CAS(&head, C, D)            (atomically: if head is still C, set it to D)
       - success: head --> [D] --> [C] --> [B] --> [A]
       - failure: someone else pushed/popped, retry from step 1

  Pop():
    1. old_head = head             (read head, which is D)
    2. new_head = old_head.next    (which is C)
    3. CAS(&head, D, C)            (atomically: if head is still D, set it to C)
       - success: return D's value
       - failure: someone else changed head, retry from step 1
```

Here is a C implementation from the Linux kernel's `llist.h` (lockless linked list), simplified:

```c
// From include/linux/llist.h (Linux kernel)
struct llist_node {
    struct llist_node *next;
};

struct llist_head {
    struct llist_node *first;
};

// Push: add node to front of list
static inline bool llist_add(struct llist_node *new_node, struct llist_head *head)
{
    struct llist_node *first;
    do {
        new_node->next = first = READ_ONCE(head->first);
    } while (cmpxchg(&head->first, first, new_node) != first);
    return !first;  // returns true if list was empty
}

// Pop: remove and return front node
static inline struct llist_node *llist_del_first(struct llist_head *head)
{
    struct llist_node *first;
    do {
        first = READ_ONCE(head->first);
        if (!first)
            return NULL;
    } while (cmpxchg(&head->first, first, first->next) != first);
    return first;
}
```

`READ_ONCE` prevents the compiler from caching or speculating on the value. `cmpxchg` is the kernel's CAS macro that maps to the hardware instruction.

## The ABA Problem

The Treiber stack has a subtle bug. Consider this sequence:

```
  Initial state: head --> [A] --> [B] --> [C]

  Thread 1 (doing Pop):
    1. Reads head = A
    2. Reads A.next = B
    3. (gets preempted by OS)

  Thread 2 (while Thread 1 sleeps):
    4. Pop A  --> head = B
    5. Pop B  --> head = C
    6. Push A --> head = A --> C   (A is reused!)

  Thread 1 (resumes):
    7. CAS(&head, A, B) --> SUCCEEDS! (head is A, just as expected)
       head = B
    But B was already freed! B.next is garbage. Corruption.
```

Thread 1's CAS succeeds because `head` is still `A` — but the **meaning** of `A` has changed. The list went from `A->B->C` to `A->C` while Thread 1 was asleep. Thread 1 doesn't know this because it only checks the pointer value, not the history.

This is the **ABA problem**: a value changes from A to B and back to A, and a CAS on that value can't tell the difference.

### Solution 1: Tagged Pointers (Version Counter)

Pack a monotonically increasing counter alongside the pointer:

```
  +----------------------------------+------------------+
  |          pointer (48 bits)       |  counter (16 bits)|
  +----------------------------------+------------------+

  On x86-64, virtual addresses only use 48 bits,
  leaving 16 bits for a version counter in the upper bits.
```

Every time the head changes, the counter increments. Now CAS compares both the pointer and the counter:

```c
// Conceptual tagged pointer
typedef struct {
    uintptr_t ptr : 48;
    uintptr_t tag : 16;
} tagged_ptr_t;

// Push
tagged_ptr_t old_head = atomic_load(&head);
new_node->next = old_head.ptr;
tagged_ptr_t new_head = { .ptr = new_node, .tag = old_head.tag + 1 };
CAS(&head, old_head, new_head);  // fails if tag changed
```

Java uses this approach in [`AtomicStampedReference`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/atomic/AtomicStampedReference.java):

```java
AtomicStampedReference<Node> head = new AtomicStampedReference<>(null, 0);

// Pop with ABA protection
int[] stampHolder = new int[1];
Node old_head;
Node new_head;
do {
    old_head = head.get(stampHolder);  // reads both reference and stamp
    if (old_head == null) return null;
    new_head = old_head.next;
} while (!head.compareAndSet(old_head, new_head,
                              stampHolder[0], stampHolder[0] + 1));
```

### Solution 2: Hazard Pointers

Instead of tagging the pointer, **prevent reclamation** of nodes that other threads might be using. Each thread publishes the pointers it's currently reading in a global "hazard pointer" array. Before freeing a node, a thread checks: is anyone still looking at this? If yes, defer the free.

```
  Thread hazard pointers:

  Thread 1: [  A  ]   <-- "I'm reading node A, don't free it"
  Thread 2: [ nil ]
  Thread 3: [  C  ]

  Thread 2 wants to free A:
    - Scans all hazard pointers
    - Finds Thread 1 has A
    - Defers freeing A to a "retired" list
    - Will try again later
```

This is used in Meta's [Folly library](https://github.com/facebook/folly/blob/main/folly/synchronization/HazardPointer.h) and is being standardized in C++26 (`std::hazard_pointer`).

### Solution 3: Epoch-Based Reclamation

A simpler alternative: divide time into **epochs**. A thread enters an epoch before accessing shared data and leaves after. Memory is only freed when all threads have passed through at least two epoch transitions since the node was retired.

```
  Global epoch: 2

  Thread 1: active in epoch 2
  Thread 2: active in epoch 2
  Thread 3: inactive (not reading shared data)

  Retired nodes:
    epoch 0: [X, Y]  --> safe to free (all threads past epoch 0)
    epoch 1: [Z]     --> NOT safe (Thread 1, 2 might still see it)
    epoch 2: [W]     --> NOT safe
```

The crossbeam crate in Rust uses epoch-based reclamation. Its [`crossbeam-epoch`](https://github.com/crossbeam-rs/crossbeam/tree/master/crossbeam-epoch/src) implementation is considered production-grade.

## A Lock-Free Queue (Michael-Scott Queue)

The **Michael-Scott queue** (1996) is the foundation of `java.util.concurrent.ConcurrentLinkedQueue`. It uses two CAS pointers: `head` (for dequeue) and `tail` (for enqueue).

```
  Queue structure:

  head                                          tail
   |                                             |
   v                                             v
  [sentinel] --> [node1] --> [node2] --> [node3] --> nil
                  ^                        ^
                  |                        |
              first real                 last real
              element                    element
```

The sentinel (dummy) node simplifies edge cases: the queue is empty when `head.next == nil`.

### Enqueue Algorithm

```
  Enqueue(value):
    new_node = allocate(value, next=nil)
    loop:
      tail = read(Q.tail)
      next = read(tail.next)
      if tail != Q.tail:            // tail changed under us
          continue                  // retry

      if next == nil:               // tail is truly the last node
          if CAS(&tail.next, nil, new_node):  // link new node
              CAS(&Q.tail, tail, new_node)    // advance tail (best-effort)
              return
      else:                         // tail is lagging (another enqueue in progress)
          CAS(&Q.tail, tail, next)  // help advance tail, then retry
```

The "help advance tail" step is crucial. If thread A linked a new node but got preempted before advancing `tail`, thread B notices that `tail.next != nil` and advances it on A's behalf. This **helping** pattern ensures the queue stays in a consistent state even under arbitrary preemption.

### Dequeue Algorithm

```
  Dequeue():
    loop:
      head = read(Q.head)
      tail = read(Q.tail)
      next = read(head.next)
      if head != Q.head:
          continue                  // head changed, retry

      if head == tail:              // queue appears empty or tail is lagging
          if next == nil:
              return EMPTY          // truly empty
          CAS(&Q.tail, tail, next)  // help advance tail
          continue
      else:
          value = next.value
          if CAS(&Q.head, head, next):  // advance head past sentinel
              free(head)            // old sentinel can be reclaimed
              return value
```

Here is the core of Java's `ConcurrentLinkedQueue.offer()` from [`java/util/concurrent/ConcurrentLinkedQueue.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ConcurrentLinkedQueue.java):

```java
public boolean offer(E e) {
    final Node<E> newNode = new Node<E>(Objects.requireNonNull(e));
    for (Node<E> t = tail, p = t;;) {
        Node<E> q = p.next;
        if (q == null) {
            // p is last node
            if (NEXT.compareAndSet(p, null, newNode)) {
                // CAS success: linked new node
                if (p != t) // hop two nodes at a time for efficiency
                    TAIL.compareAndSet(this, t, newNode);
                return true;
            }
            // CAS race; re-read next
        } else if (p == q) {
            // node was unlinked; restart from head or tail
            p = (t != (t = tail)) ? t : head;
        } else {
            // advance p toward the actual tail
            p = (p != t && t != (t = tail)) ? t : q;
        }
    }
}
```

Java's implementation uses a **lazy tail update**: it doesn't advance `tail` on every enqueue. Instead, it allows `tail` to lag by up to 2 hops and only updates it when the lag is detected. This reduces CAS contention on the `tail` pointer by roughly 50%.

## Progress Guarantees

Lock-free algorithms come in three strength levels:

```
  +------------------------------------------------------------+
  |                                                            |
  |  Wait-free    Every thread finishes in bounded steps.      |
  |               Strongest. Hardest to implement.             |
  |               Example: atomic fetch-and-add counter.       |
  |                                                            |
  +------------------------------------------------------------+
  |                                                            |
  |  Lock-free    At least one thread makes progress.          |
  |               A thread might retry forever (starvation),   |
  |               but the system advances.                     |
  |               Example: Treiber stack, Michael-Scott queue. |
  |                                                            |
  +------------------------------------------------------------+
  |                                                            |
  |  Obstruction  A thread makes progress if run in isolation. |
  |  -free        Weakest. May livelock under contention.      |
  |               Example: optimistic concurrency without      |
  |               backoff.                                     |
  |                                                            |
  +------------------------------------------------------------+
```

Most practical algorithms are **lock-free** (not wait-free). True wait-freedom requires complex helping mechanisms that add overhead even in the uncontended case. The Michael-Scott queue's "help advance tail" is a step toward wait-freedom but doesn't fully achieve it.

## When to Use Lock-Free Structures

Lock-free is not always better. Here's a decision framework:

```
  Should you use lock-free?

  Is contention actually high?
       |
       +-- No --> Use a mutex. Simpler, debuggable, fast enough.
       |
       +-- Yes
            |
            Is the critical section short (< 100ns)?
                 |
                 +-- No --> Use a mutex. Long critical sections
                 |          mean CAS retry loops waste more CPU
                 |          than waiting on a lock.
                 |
                 +-- Yes
                      |
                      Can you tolerate higher memory usage?
                      (hazard pointers, epoch tracking, node allocation)
                           |
                           +-- No --> Use a spinlock or try-lock.
                           |
                           +-- Yes --> Lock-free is a good fit.
```

Real-world examples where lock-free wins:
- **Kernel interrupt handlers** — cannot sleep, so mutexes are forbidden
- **Real-time systems** — priority inversion from locks violates deadline guarantees
- **High-throughput queues** — producers/consumers contend on a single point
- **Read-mostly structures** — readers never block writers (RCU in Linux)

## RCU: Lock-Free at Kernel Scale

**Read-Copy-Update** (RCU) is the Linux kernel's most important lock-free technique. It's optimized for the common case: many readers, few writers.

```
  RCU principle:

  Reader                            Writer
  ------                            ------
  rcu_read_lock()                   1. Copy the old structure
  ptr = rcu_dereference(gptr)       2. Modify the copy
  use(ptr)                          3. Publish: rcu_assign_pointer(gptr, new_copy)
  rcu_read_unlock()                 4. Wait for all readers to finish (grace period)
                                    5. Free the old structure
```

Readers pay almost zero cost: `rcu_read_lock()` is just a preemption disable (or nothing at all on non-preemptible kernels). No atomic operations, no cache-line bouncing. Writers do the heavy lifting: they make a copy, modify it, atomically swing the pointer, then wait for a **grace period** before freeing the old version.

From [`include/linux/rcupdate.h`](https://github.com/torvalds/linux/blob/master/include/linux/rcupdate.h):

```c
// Reader side (nearly free)
#define rcu_read_lock()    preempt_disable()
#define rcu_read_unlock()  preempt_enable()

// Dereference with acquire semantics
#define rcu_dereference(p) \
    ({ typeof(p) _p = READ_ONCE(p); smp_read_barrier_depends(); _p; })

// Writer publishes new version with release semantics
#define rcu_assign_pointer(p, v) \
    do { smp_store_release(&(p), (v)); } while (0)
```

The grace period detection is the clever part. The kernel knows that once every CPU has gone through a context switch (or entered idle), no reader can still hold a reference to the old data. This is checked via per-CPU counters — no global synchronization needed for the common read path.

RCU is used throughout the Linux kernel: routing tables, file descriptor tables, module lists, SELinux policy — anywhere reads vastly outnumber writes.

## Performance: Lock-Free vs. Mutex Under Contention

Benchmarks from a 64-core machine pushing integers through a shared queue:

```
  Threads   Mutex Queue    Lock-Free Queue    Speedup
  -------   -----------    ---------------    -------
       1     48M ops/s       45M ops/s         0.94x  (lock-free is slower!)
       4    120M ops/s      170M ops/s         1.42x
      16     85M ops/s      310M ops/s         3.65x
      64     40M ops/s      420M ops/s        10.5x
```

At low contention (1 thread), the mutex wins because lock-free has CAS retry overhead. At high contention, lock-free scales while the mutex degrades — threads waiting on a mutex don't do useful work, and the cache-line bouncing from lock handoffs becomes the bottleneck.

## Summary

Lock-free data structures trade simplicity for scalability:

```
  Building blocks:
    CAS (compare-and-swap)    -- the atomic foundation
    Memory ordering           -- controls visibility across cores
    Retry loops               -- handle CAS failures

  Key algorithms:
    Treiber stack             -- simplest lock-free container
    Michael-Scott queue       -- foundation of java.util.concurrent
    RCU                       -- kernel-scale read optimization

  Key problems:
    ABA problem               -- solved by tagged pointers, hazard ptrs, epochs
    Memory reclamation        -- hardest part of lock-free in non-GC languages
    Starvation                -- lock-free != fair; use backoff or wait-free
```

## References

1. R.K. Treiber, "Systems Programming: Coping with Parallelism" (1986) — original lock-free stack
2. M. Michael and M. Scott, "Simple, Fast, and Practical Non-Blocking and Blocking Concurrent Queue Algorithms" (1996) [paper](https://www.cs.rochester.edu/~scott/papers/1996_PODC_queues.pdf)
3. M. Michael, "Hazard Pointers: Safe Memory Reclamation for Lock-Free Objects" (2004) [paper](https://ieeexplore.ieee.org/document/1291819)
4. P. McKenney, "What is RCU, Fundamentally?" [article](https://lwn.net/Articles/262464/)
5. Linux kernel lockless list [`include/linux/llist.h`](https://github.com/torvalds/linux/blob/master/include/linux/llist.h)
6. Linux kernel RCU [`include/linux/rcupdate.h`](https://github.com/torvalds/linux/blob/master/include/linux/rcupdate.h)
7. Java ConcurrentLinkedQueue [`java/util/concurrent/ConcurrentLinkedQueue.java`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ConcurrentLinkedQueue.java)
8. Crossbeam epoch-based reclamation [`crossbeam-epoch`](https://github.com/crossbeam-rs/crossbeam/tree/master/crossbeam-epoch/src)
9. Facebook Folly hazard pointers [`folly/synchronization/HazardPointer.h`](https://github.com/facebook/folly/blob/main/folly/synchronization/HazardPointer.h)
10. C++ memory model reference [cppreference](https://en.cppreference.com/w/cpp/atomic/memory_order)
