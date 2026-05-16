---
author: JZ
pubDatetime: 2026-05-16T07:00:00Z
modDatetime: 2026-05-16T07:00:00Z
title: System Design - How the Linux Process Scheduler (CFS) Works
tags:
  - design-system
  - design-concurrency
description:
  "How Linux's Completely Fair Scheduler (CFS) works: virtual runtime, red-black tree scheduling, nice values, CPU bandwidth control, and source code walkthrough from the kernel's sched/fair.c."
---

## Table of contents

## Context

Every program you run — a web server handling requests, a database crunching queries, or `grep` searching through files — needs CPU time. But a typical Linux server has far more runnable tasks than CPU cores. Somehow, the kernel must decide: which task runs next, and for how long?

This is the job of the **process scheduler**. It's one of the most performance-critical pieces of the kernel. A bad scheduling decision means a user-facing request waits milliseconds longer than necessary, or a background batch job starves a critical service.

Linux has used several schedulers over its history:

- **O(n) scheduler** (Linux 2.4): Scanned the entire task list to find the next task. Simple but slow with many tasks.
- **O(1) scheduler** (Linux 2.6.0): Used priority arrays with bitmaps. Fast, but had fairness problems with interactive workloads.
- **CFS — Completely Fair Scheduler** (Linux 2.6.23, 2007): The current default scheduler, written by Ingo Molnár. Replaced heuristic-based priorities with a simple mathematical model of fairness.

The core idea of CFS is: **give each task an equal share of CPU time, proportional to its weight**. If you have 4 tasks of equal priority on one CPU, each should get 25% of the CPU. If one task uses more than its fair share, it gets preempted in favor of tasks that have used less.

```
  The fairness model:

  4 tasks on 1 CPU, all same priority (weight):

  Ideal (perfectly fair):    Each gets exactly 25%
  +--------+--------+--------+--------+
  | Task A | Task B | Task C | Task D |   <- repeated infinitely
  +--------+--------+--------+--------+

  Reality (discrete time):   CFS approximates this by always
                             running the task that has received
                             the LEAST CPU time so far.
```

## Virtual Runtime: The Key Abstraction

CFS doesn't track wall-clock time for scheduling decisions. Instead, it uses **virtual runtime** (`vruntime`) — a per-task counter that measures how much CPU time a task has consumed, weighted by its priority.

For a task with default priority (nice 0), virtual runtime advances at the same rate as real time: 1ms of CPU time = 1ms of vruntime. For a higher-priority task (lower nice value), vruntime advances **slower**: the task can run longer before CFS considers it to have "used its share." For a lower-priority task, vruntime advances faster.

```
  How vruntime advances for different priorities:

  Nice 0 (default, weight=1024):
    1ms wall-clock  -->  1ms vruntime

  Nice -5 (higher priority, weight=3121):
    1ms wall-clock  -->  0.33ms vruntime  (1024/3121)

  Nice +5 (lower priority, weight=335):
    1ms wall-clock  -->  3.06ms vruntime  (1024/335)

  The formula:
    delta_vruntime = delta_exec * (NICE_0_WEIGHT / task_weight)
```

The scheduling decision is dead simple: **always run the task with the smallest vruntime.** A task that has received less CPU time (relative to its weight) has a smaller vruntime, so it gets scheduled first. This naturally converges to proportional fairness.

In the kernel source ([`kernel/sched/fair.c`](https://github.com/torvalds/linux/blob/master/kernel/sched/fair.c)), the vruntime update happens in `update_curr()`:

```c
static void update_curr(struct cfs_rq *cfs_rq)
{
    struct sched_entity *curr = cfs_rq->curr;
    u64 now = rq_clock_task(rq_of(cfs_rq));
    u64 delta_exec;

    delta_exec = now - curr->exec_start;
    curr->exec_start = now;
    curr->sum_exec_runtime += delta_exec;

    curr->vruntime += calc_delta_fair(delta_exec, curr);
    update_min_vruntime(cfs_rq);
}
```

And `calc_delta_fair()` applies the weight scaling:

```c
static u64 calc_delta_fair(u64 delta, struct sched_entity *se)
{
    if (unlikely(se->load.weight != NICE_0_LOAD))
        delta = __calc_delta(delta, NICE_0_LOAD, &se->load);
    return delta;
}

// __calc_delta computes: delta * weight / lw->weight
// using fixed-point math to avoid floating point in the kernel
```

## The Red-Black Tree

CFS needs to quickly find the task with the smallest vruntime. It uses a **red-black tree** (a self-balancing binary search tree) keyed by vruntime. The leftmost node is always the next task to run.

```
  CFS run queue (red-black tree, ordered by vruntime):

                       [vruntime=50]
                      /              \
              [vruntime=30]      [vruntime=80]
              /          \              \
      [vruntime=20]  [vruntime=45]  [vruntime=95]
        ^
        |
    leftmost = next to schedule
    (O(1) access via cached pointer)
```

The tree provides:
- **O(1)** to find the next task (cached leftmost pointer).
- **O(log n)** to insert or remove a task.

In the kernel, the tree is managed through `enqueue_entity()` and `dequeue_entity()`. The cached leftmost node is stored in `cfs_rq->rb_leftmost`:

```c
struct cfs_rq {
    struct rb_root_cached tasks_timeline;  // rb tree + leftmost cache
    struct sched_entity *curr;             // currently running entity
    u64 min_vruntime;                      // floor for new tasks
    unsigned int nr_running;               // number of runnable tasks
    // ...
};
```

When a task becomes runnable (wakes up from sleep, or is newly created), it's inserted into the tree. When it's selected to run, it's removed from the tree. When it's preempted or voluntarily yields, it goes back into the tree at its current vruntime position.

## Scheduling a Task: pick_next_entity

The core scheduling decision in CFS is `pick_next_entity()`:

```c
static struct sched_entity *
pick_next_entity(struct cfs_rq *cfs_rq)
{
    struct sched_entity *left = __pick_first_entity(cfs_rq);
    struct sched_entity *se;

    if (!left)
        return NULL;

    // Generally pick the leftmost (smallest vruntime)
    se = left;

    // But skip entities that are not eligible yet
    // (bandwidth throttling, etc.)
    // ...

    return se;
}

static struct sched_entity *__pick_first_entity(struct cfs_rq *cfs_rq)
{
    struct rb_node *left = rb_first_cached(&cfs_rq->tasks_timeline);
    if (!left)
        return NULL;
    return rb_entry(left, struct sched_entity, run_node);
}
```

This is beautifully simple. The entire scheduling decision boils down to: "take the leftmost node from the red-black tree."

## Preemption: When to Switch

CFS doesn't run each task for a fixed time slice. Instead, it calculates a **target latency** — the time period over which all runnable tasks should each get at least one turn. The target latency is divided among tasks proportionally to their weights.

```
  Example: 4 tasks, target latency = 20ms

  Task A (nice 0, weight 1024):  gets 5ms
  Task B (nice 0, weight 1024):  gets 5ms
  Task C (nice 0, weight 1024):  gets 5ms
  Task D (nice 0, weight 1024):  gets 5ms

  With unequal weights:
  Task A (nice -5, weight 3121): gets 12.4ms  (3121/5024 * 20)
  Task B (nice 0, weight 1024):  gets 4.1ms
  Task C (nice +5, weight 335):  gets 1.3ms
  Task D (nice +5, weight 544):  gets 2.2ms
```

If there are too many tasks and each would get less than a minimum granularity (default: 0.75ms), CFS extends the target latency to ensure each task gets at least the minimum. This prevents excessive context switching.

Preemption happens when the current task's vruntime exceeds the leftmost task's vruntime by more than its ideal runtime. The `check_preempt_tick()` function handles this:

```c
static void check_preempt_tick(struct cfs_rq *cfs_rq, struct sched_entity *curr)
{
    u64 ideal_runtime, delta_exec;

    ideal_runtime = sched_slice(cfs_rq, curr);  // this task's share
    delta_exec = curr->sum_exec_runtime - curr->prev_sum_exec_runtime;

    if (delta_exec > ideal_runtime) {
        resched_curr(rq_of(cfs_rq));  // mark for rescheduling
        return;
    }

    // Also preempt if someone else is starving
    if (delta_exec < sysctl_sched_min_granularity)
        return;  // ran less than minimum, don't preempt yet

    struct sched_entity *se = __pick_first_entity(cfs_rq);
    s64 diff = curr->vruntime - se->vruntime;
    if (diff > ideal_runtime)
        resched_curr(rq_of(cfs_rq));
}
```

## Waking Tasks: The Sleeper Fairness Problem

When a task sleeps (waiting for I/O, a mutex, or a timer), it stops accumulating vruntime. When it wakes up, its vruntime might be far behind the other tasks. Without correction, the waker would monopolize the CPU until it catches up — bad for interactivity.

CFS handles this by setting a floor on the waking task's vruntime. When a task wakes up, its vruntime is set to at least `cfs_rq->min_vruntime - sched_latency`:

```c
static void place_entity(struct cfs_rq *cfs_rq, struct sched_entity *se, int initial)
{
    u64 vruntime = cfs_rq->min_vruntime;

    if (initial) {
        // New task: start slightly behind to avoid starvation
        vruntime += sched_vslice(cfs_rq, se);
    } else {
        // Waking task: allow some credit for sleeping, but not unlimited
        vruntime -= sysctl_sched_latency;
    }

    se->vruntime = max_vruntime(se->vruntime, vruntime);
}
```

This gives waking tasks a small "credit" for having slept (they get scheduled sooner than if they had been running the whole time), but prevents them from running for an arbitrarily long time. Interactive tasks like editors and terminals benefit: they sleep a lot, wake with some credit, handle their event quickly, and go back to sleep.

## Nice Values and Weights

The `nice` value ranges from -20 (highest priority) to +19 (lowest priority). CFS converts nice values to **weights** using a lookup table where each nice level represents roughly a 10% change in CPU share:

```c
const int sched_prio_to_weight[40] = {
 /* -20 */ 88761, 71755, 56483, 46273, 36291,
 /* -15 */ 29154, 23254, 18705, 14949, 11916,
 /* -10 */  9548,  7620,  6100,  4904,  3906,
 /*  -5 */  3121,  2501,  1991,  1586,  1277,
 /*   0 */  1024,   820,   655,   526,   423,
 /*   5 */   335,   272,   215,   172,   137,
 /*  10 */   110,    87,    70,    56,    45,
 /*  15 */    36,    29,    23,    18,    15,
};
```

The ratio between adjacent nice values is approximately 1.25 (each level gets ~25% more weight than the next). Two tasks with nice 0 and nice 1 get CPU in a 1024:820 ratio (~55%:45%).

```
  CPU share examples on a single core:

  Both nice 0:          50% / 50%
  Nice 0 vs Nice 5:     1024:(335) = 75% / 25%
  Nice -10 vs Nice 0:   9548:(1024) = 90% / 10%
  Nice -20 vs Nice 19:  88761:(15) = 99.98% / 0.02%
```

## CPU Bandwidth Control (CFS Bandwidth)

In containerized environments (Docker, Kubernetes), you often need to limit a group of tasks to a specific CPU quota. CFS provides **bandwidth throttling** via cgroups.

A cgroup can be given a quota like "100ms every 250ms" — meaning the group gets at most 40% of a CPU. When the group exhausts its quota, all its tasks are **throttled** (removed from the run queue) until the next period.

```
  CFS Bandwidth example:
  cgroup "webserver" quota=100ms, period=250ms

  Time  0ms       100ms       250ms       350ms       500ms
        |---------|-----------|-----------|-----------|
        | RUNNING | THROTTLED | RUNNING   | THROTTLED |
        | (using  | (quota    | (quota    | (quota    |
        |  quota) |  exhausted)|  renewed) |  exhausted)|
```

This is how Kubernetes CPU limits work. A pod with `resources.limits.cpu: "500m"` gets a cgroup with a 50ms quota per 100ms period (50% of one core).

The relevant structures in the kernel:

```c
struct cfs_bandwidth {
    ktime_t     period;         // e.g., 100ms
    u64         quota;          // e.g., 50ms (in ns)
    u64         runtime;        // remaining runtime in current period
    int         nr_throttled;   // number of throttled cfs_rqs
    // ...
};
```

## Multi-Core: Load Balancing

On a multi-core machine, each CPU has its own run queue and red-black tree. Tasks are distributed across CPUs, and the scheduler periodically **rebalances** to prevent one CPU from being overloaded while another is idle.

```
  4-core machine, before rebalancing:

  CPU 0: [A] [B] [C] [D] [E]  (5 tasks, overloaded)
  CPU 1: [F]                    (1 task)
  CPU 2: [G] [H]               (2 tasks)
  CPU 3: (idle)                 (0 tasks!)

  After load balancing:

  CPU 0: [A] [B] [C]           (3 tasks)
  CPU 1: [F] [D]               (2 tasks)
  CPU 2: [G] [H]               (2 tasks)
  CPU 3: [E]                   (1 task)
```

Load balancing considers:
- **CPU topology** (prefer migrating within the same NUMA node or cache domain).
- **Cache warmth** (avoid migrating tasks that have hot caches on their current CPU).
- **Task weight** (balance total load, not just task count).

The kernel's load balancer runs at different frequencies depending on the imbalance: more frequently for idle CPUs (they actively "pull" tasks), less frequently when loads are already balanced.

Key functions in the kernel:
- `load_balance()` — main load balancing entry point
- `find_busiest_group()` — find the scheduling domain with the most load
- `detach_tasks()` — pick tasks to migrate
- `attach_tasks()` — place migrated tasks on the new CPU

## EEVDF: The Next Generation (Linux 6.6+)

In Linux 6.6 (2023), CFS was enhanced with **EEVDF** (Earliest Eligible Virtual Deadline First). EEVDF builds on the same vruntime concept but adds a **deadline** to each task based on its requested time slice. The scheduler picks the eligible task with the earliest virtual deadline.

```
  EEVDF vs classic CFS:

  Classic CFS: Always pick smallest vruntime.
               Problem: doesn't account for tasks needing
               different time slice lengths.

  EEVDF: Each task has a virtual deadline:
         deadline = eligible_time + (slice / weight)

         Pick the eligible task with the earliest deadline.
         This gives latency-sensitive tasks faster response.
```

EEVDF allows the scheduler to make better tradeoffs between throughput and latency without needing the heuristic-based "buddy" and "skip" mechanisms that classic CFS used for interactive tasks.

## Putting It All Together: A Scheduling Cycle

Here is what happens every time the scheduler runs:

```
  Timer interrupt (every 1-10ms, configurable via HZ):
        |
        v
  +---------------------------+
  | scheduler_tick()          |
  | -> update_curr()          |  Update current task's vruntime
  | -> check_preempt_tick()   |  Should we switch tasks?
  +---------------------------+
        |
        | (if preemption needed)
        v
  +---------------------------+
  | schedule()                |
  | -> deactivate_task(prev)  |  Put current task back in tree
  | -> pick_next_task()       |  Walk scheduling classes:
  |    -> pick_next_task_fair |    1. stop (highest priority)
  |       -> pick_next_entity |    2. deadline (DL)
  |          -> leftmost node |    3. real-time (RT)
  |                           |    4. CFS (fair) <-- most tasks
  |                           |    5. idle
  | -> context_switch()       |  Switch page tables + registers
  +---------------------------+
        |
        v
  New task is running on this CPU.
```

The scheduler is invoked on:
- **Timer tick** (periodic, checks if preemption is needed)
- **Task wake-up** (might preempt the current task if the waker has smaller vruntime)
- **Voluntary yield** (`sched_yield()`, `sleep()`, blocking I/O)
- **Task creation** (`fork()`)

## Practical Implications

**Databases and latency:** Database processes like TiKV or MySQL often set themselves to higher priority (lower nice value) or use real-time scheduling class to avoid latency spikes from being preempted by background tasks.

**Container CPU throttling:** If your containerized service has periodic latency spikes, check if it's hitting its CFS bandwidth quota. The `nr_throttled` metric in `/sys/fs/cgroup/cpu/cpu.stat` tells you how often throttling occurs.

**`taskset` and CPU affinity:** For latency-sensitive workloads, pinning tasks to specific cores avoids migration overhead and cache thrashing. But over-pinning reduces the scheduler's ability to balance load.

**`schedstat` for debugging:** `/proc/<pid>/schedstat` shows three numbers: time spent on CPU, time spent waiting in the run queue, and number of times scheduled. High wait times indicate CPU contention.

```bash
# Check if a process is being throttled (cgroups v2)
cat /sys/fs/cgroup/system.slice/your-service.service/cpu.stat
# usage_usec, user_usec, system_usec, nr_periods, nr_throttled, throttled_usec

# See scheduling stats for a PID
cat /proc/$(pgrep tikv-server)/schedstat
# cpu_time_ns  runqueue_wait_ns  nr_switches
```

## References

1. Ingo Molnár, CFS Scheduler Design [doc](https://docs.kernel.org/scheduler/sched-design-CFS.html)
2. Linux kernel source: CFS implementation [`kernel/sched/fair.c`](https://github.com/torvalds/linux/blob/master/kernel/sched/fair.c)
3. Linux kernel source: core scheduler [`kernel/sched/core.c`](https://github.com/torvalds/linux/blob/master/kernel/sched/core.c)
4. Peter Zijlstra, EEVDF Scheduler [LWN article](https://lwn.net/Articles/925371/)
5. Robert Love, *Linux Kernel Development* (3rd edition), Chapter 4: Process Scheduling
6. CFS Bandwidth Control [doc](https://docs.kernel.org/scheduler/sched-bwc.html)
7. Completely Fair Scheduler [Wikipedia](https://en.wikipedia.org/wiki/Completely_Fair_Scheduler)
8. EEVDF original paper: Stoica, I. and Abdel-Wahab, H. *Earliest Eligible Virtual Deadline First* (1995)
