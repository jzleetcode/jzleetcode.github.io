---
author: JZ
pubDatetime: 2026-08-08T09:00:00Z
modDatetime: 2026-08-08T09:00:00Z
title: System Design - How the Linux OOM Killer Works
tags:
  - design-system
  - design-linux
description:
  "How the Linux Out-of-Memory (OOM) Killer works: when it triggers, how it scores processes, the kill decision algorithm, cgroup-aware behavior, and a source code walkthrough from the Linux kernel."
---

## Table of contents

## Context

Every process on a Linux system asks the kernel for memory. The kernel usually says "yes" — even when the total amount of promised memory exceeds the physical RAM plus swap space. This optimistic strategy is called **memory overcommit**, and it works surprisingly well because most processes never actually use all the memory they allocate.

But sometimes, the system genuinely runs out. Every byte of RAM is used, swap is exhausted, and a process asks for more. The kernel has two choices:

1. Freeze or crash the entire system (kernel panic).
2. Kill one or more processes to free memory so the rest can survive.

Linux chooses option 2. The subsystem responsible for this decision is the **OOM (Out-of-Memory) Killer**. Its job is to pick the "best" victim — a process whose death frees the most memory while causing the least damage to the system.

```
    Process A           Process B           Process C
    (100 MB)            (2 GB)              (50 MB)
       |                   |                   |
       v                   v                   v
  +----------------------------------------------------+
  |              Linux Memory Manager                   |
  |                                                    |
  |   Physical RAM: 4 GB    Swap: 2 GB                 |
  |   Used: 3.95 GB         Used: 2 GB                 |
  |                                                    |
  |   "No more pages available..."                     |
  |                                                    |
  |            +------------------+                    |
  |            |   OOM Killer     |                    |
  |            |                  |                    |
  |            |  Score each      |                    |
  |            |  process, pick   |                    |
  |            |  highest score   |                    |
  |            |  → SIGKILL it    |                    |
  |            +------------------+                    |
  +----------------------------------------------------+
```

The OOM killer is a last resort. Before it runs, the kernel tries everything else: reclaiming page cache, writing dirty pages to disk, compacting memory, and swapping. Only when all paths fail does the OOM killer wake up.

## When Does OOM Get Triggered?

The entry point is the function `out_of_memory()` in [`mm/oom_kill.c`](https://github.com/torvalds/linux/blob/master/mm/oom_kill.c). It is called from the page allocator when an allocation fails after all reclaim attempts are exhausted.

The simplified call chain:

```
  __alloc_pages()                   (page allocator — the front door)
      |
      +-> __alloc_pages_slowpath()  (try harder: reclaim, compact, retry)
              |
              +-> __alloc_pages_may_oom()
                      |
                      +-> out_of_memory()   <-- OOM killer entry point
```

Before invoking the OOM killer, the kernel checks:
- Is `panic_on_oom` set? If yes, just panic (some admins prefer a dead machine over unpredictable kills).
- Is a process already being killed? If yes, wait for it to exit rather than killing more.
- Are we in a memory cgroup that hit its limit? If yes, only kill within that cgroup (more on this later).

## The OOM Score: Picking a Victim

The OOM killer must choose wisely. Killing a 5 MB shell while a 4 GB runaway process consumes everything would be pointless. The scoring algorithm lives in `oom_badness()` in [`mm/oom_kill.c`](https://github.com/torvalds/linux/blob/master/mm/oom_kill.c).

### The Algorithm

```
  oom_badness(task):
      1. Skip unkillable tasks (kernel threads, init, tasks with OOM_SCORE_ADJ_MIN)
      2. points = process RSS + swap usage + page table pages
      3. Adjust: points += (points * oom_score_adj) / 1000
      4. Return points (higher = more likely to be killed)
```

The raw score is essentially **how much memory this process is using**. The more memory you use, the higher your score, and the more likely you are to be killed. This makes intuitive sense — killing a memory hog frees the most RAM.

### oom_score_adj: The Tuning Knob

Every process has a tunable value at `/proc/<pid>/oom_score_adj` ranging from **-1000 to +1000**:

| Value | Effect |
|-------|--------|
| -1000 | Never kill this process (OOM immune) |
| 0 | Default — score based purely on memory usage |
| +1000 | Always kill this first |

System administrators use this to protect critical services:

```bash
# Protect the database — never OOM-kill it
echo -1000 > /proc/$(pidof mysqld)/oom_score_adj

# The batch job is expendable — kill it first if needed
echo 500 > /proc/$(pidof batch_worker)/oom_score_adj
```

You can see any process's current score in `/proc/<pid>/oom_score` (a read-only value the kernel computes).

### Source: oom_badness()

Here is the core logic from the kernel (simplified from [`mm/oom_kill.c`](https://github.com/torvalds/linux/blob/master/mm/oom_kill.c)):

```c
long oom_badness(struct task_struct *p, unsigned long totalpages)
{
    long points;
    long adj;

    // Never kill kernel threads or tasks opted out
    if (oom_unkillable_task(p))
        return LONG_MIN;

    adj = (long)p->signal->oom_score_adj;
    if (adj == OOM_SCORE_ADJ_MIN)
        return LONG_MIN;  // user said "never kill"

    // Base score = RSS + swap + page tables
    points = get_mm_rss(p->mm) +
             get_mm_counter(p->mm, MM_SWAPENTS) +
             mm_pgtables_bytes(p->mm) / PAGE_SIZE;

    // Apply adjustment: scale by oom_score_adj
    adj *= totalpages / 1000;
    points += adj;

    return points > 0 ? points : 1;  // minimum 1 so it can still be killed
}
```

Key observations:
- `get_mm_rss()` returns the Resident Set Size — physical pages actually in RAM.
- Swap pages count too, because killing the process frees those swap slots.
- Page table pages are included because large address spaces consume page tables.
- The adjustment is proportional to total system memory, not the process's own memory.

## The Kill: SIGKILL and Reaping

Once the highest-scoring process is chosen, the kernel sends it `SIGKILL`:

```c
static void oom_kill_process(struct oom_control *oc, const char *message)
{
    struct task_struct *victim = oc->chosen;

    // Log to dmesg so admins can see what happened
    pr_err("%s: Killed process %d (%s) total-vm:%lukB, "
           "anon-rss:%lukB, file-rss:%lukB, shmem-rss:%lukB, "
           "oom_score_adj:%hd\n", ...);

    // Also kill all threads sharing the same mm
    for_each_thread(victim, p) {
        if (p->mm == victim->mm)
            do_send_sig_info(SIGKILL, SEND_SIG_PRIV, p, PIDTYPE_TGID);
    }

    // Mark the victim so the system waits for it to exit
    mark_oom_victim(victim);
}
```

Important details:
- **All threads** in the same thread group get killed. You cannot partially kill a multi-threaded process.
- The victim is **marked** so the kernel knows someone is dying and won't trigger additional OOM kills immediately.
- The kernel prints a detailed log to `dmesg` — this is how administrators diagnose OOM events after the fact.

A typical `dmesg` OOM message looks like:

```
[  412.354821] node-app invoked oom-killer: gfp_mask=0x6200ca(GFP_HIGHUSER_MOVABLE), order=0
[  412.354825] Out of memory: Killed process 4523 (java) total-vm:8234568kB,
               anon-rss:3987256kB, file-rss:1024kB, shmem-rss:0kB, oom_score_adj:0
```

## Memory Cgroups and Container-Aware OOM

In modern systems running containers (Docker, Kubernetes), processes are organized into **cgroups** (control groups). Each cgroup can have its own memory limit. When a cgroup hits its limit, the kernel doesn't invoke the global OOM killer — it invokes a **cgroup-local OOM killer** that only considers processes within that cgroup.

```
  Global Memory (32 GB)
  +--------------------------------------------------+
  |                                                  |
  |   cgroup: /docker/container-A  (limit: 4 GB)    |
  |   +--------------------------------------------+ |
  |   |  nginx (200 MB)   app (3.5 GB)   worker    | |
  |   |                                   (280 MB) | |
  |   |                                            | |
  |   |  Total: 3.98 GB  →  approaching limit!     | |
  |   |  OOM killer scoped to THIS cgroup only     | |
  |   +--------------------------------------------+ |
  |                                                  |
  |   cgroup: /docker/container-B  (limit: 8 GB)    |
  |   +--------------------------------------------+ |
  |   |  java (6 GB)     sidecar (500 MB)          | |
  |   |  (safe — under limit)                      | |
  |   +--------------------------------------------+ |
  |                                                  |
  +--------------------------------------------------+
```

This is why in Kubernetes, when a Pod exceeds its memory limit, only that Pod gets OOM-killed — not random processes elsewhere on the node. The kernel function `mem_cgroup_out_of_memory()` handles this path.

### Kubernetes and OOM

Kubernetes sets `oom_score_adj` based on the Pod's QoS (Quality of Service) class:

| QoS Class | oom_score_adj | Meaning |
|-----------|---------------|---------|
| Guaranteed | -997 | Requests == Limits; very unlikely to be killed |
| Burstable | 2 to 999 | Scaled by memory request ratio |
| BestEffort | 1000 | No requests/limits; first to die |

This is why you should always set memory requests and limits in Kubernetes — it directly influences whether your Pod survives an OOM event on the node.

## Overcommit Modes

The kernel has three overcommit policies controlled by `/proc/sys/vm/overcommit_memory`:

| Value | Name | Behavior |
|-------|------|----------|
| 0 | Heuristic (default) | Kernel estimates if enough memory exists; may refuse obviously-too-large allocations |
| 1 | Always overcommit | Never refuse `malloc()`. OOM killer is the only safety net |
| 2 | Never overcommit | Only allow allocations up to swap + (RAM * overcommit_ratio/100). No OOM kills, but `malloc()` can fail |

Most production systems run with mode 0. Redis famously recommends mode 1 because its fork-based persistence temporarily doubles address space usage.

## The oom_reaper: Reclaiming Memory Fast

There is a subtlety: after SIGKILL is sent, the process does not die instantly. It must be scheduled, handle the signal, and tear down its address space. If the system is completely stuck (no CPU time for the victim), memory stays pinned.

Linux introduced the **oom_reaper** kernel thread (since kernel 4.6) that proactively reclaims the victim's anonymous pages without waiting for the process to fully exit:

```
  OOM Killer                    oom_reaper thread
      |                              |
      +-- SIGKILL victim             |
      |                              |
      +-- wake_oom_reaper() -------->+
                                     |
                                     +-- unmap anonymous pages
                                     |   (free memory immediately)
                                     |
                                     +-- victim eventually exits
                                         (file pages, page tables freed)
```

This prevents the deadlock scenario where the victim cannot exit because the system has no memory to schedule it.

## Practical: Diagnosing OOM Kills

### Checking dmesg

```bash
# Find OOM events
dmesg | grep -i "out of memory"
dmesg | grep -i "killed process"

# Full context: who triggered it, memory state at the time
dmesg | grep -A 20 "invoked oom-killer"
```

### Checking a specific process's OOM score

```bash
# Current score (computed by kernel)
cat /proc/$(pidof myapp)/oom_score

# Current adjustment (set by user/system)
cat /proc/$(pidof myapp)/oom_score_adj
```

### Systemd integration

Systemd services can set OOM score adjustment in unit files:

```ini
[Service]
OOMScoreAdjust=-900
```

### Disabling OOM killer (not recommended)

```bash
# Per-process: make it immune
echo -1000 > /proc/<pid>/oom_score_adj

# System-wide: panic instead of kill
echo 1 > /proc/sys/vm/panic_on_oom
```

## Summary: The Full Flow

```
  1. Process calls malloc() / mmap()
  2. Kernel tries to allocate a physical page
  3. No free pages → enter slow path
  4. Try: reclaim clean pages, flush dirty pages, compact, swap out
  5. All failed → call out_of_memory()
  6. Check: panic_on_oom? Already killing someone? Cgroup-scoped?
  7. Walk all candidate processes, call oom_badness() on each
  8. Pick highest score → send SIGKILL
  9. Wake oom_reaper to free anonymous pages immediately
  10. Victim exits, remaining memory freed
  11. Original allocation retried
```

The OOM killer is one of those kernel subsystems you hope never runs. But understanding how it works helps you:
- Set appropriate memory limits for containers.
- Protect critical services with `oom_score_adj`.
- Diagnose mysterious process deaths in production.
- Choose the right overcommit policy for your workload.

## References

- [Linux kernel source: mm/oom_kill.c](https://github.com/torvalds/linux/blob/master/mm/oom_kill.c)
- [Linux kernel documentation: proc.rst (oom_score_adj)](https://www.kernel.org/doc/Documentation/filesystems/proc.rst)
- [LWN.net: Taming the OOM killer (2009)](https://lwn.net/Articles/317814/)
- [LWN.net: The oom_reaper (2016)](https://lwn.net/Articles/666024/)
- [Kubernetes: Pod QoS and OOM scoring](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)
- [Red Hat: Understanding the Linux OOM Killer](https://access.redhat.com/solutions/18626)
