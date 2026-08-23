---
author: JZ
pubDatetime: 2026-08-23T06:23:00Z
modDatetime: 2026-08-23T06:23:00Z
title: System Design - How the Linux I/O Scheduler Works
tags:
  - design-system
  - design-storage
description:
  "How the Linux I/O scheduler works: the block layer, request merging and sorting, multi-queue architecture, mq-deadline, BFQ, kyber, and how schedulers interact with storage devices."
---

## Table of contents

## Context

When a program calls `write()` or `read()`, the data doesn't go directly to disk. It passes through several kernel layers before reaching the physical device. One of these layers is the **I/O scheduler** — a component that decides *in what order* I/O requests are sent to the storage device.

Why not just send them immediately? Because storage devices — especially spinning hard drives — have physical constraints. A hard drive's read/write head must physically move across a platter to reach different sectors. If you send requests in random order, the head bounces back and forth (**seeking**), and throughput collapses. Even SSDs, which have no moving parts, benefit from batching and prioritization.

The I/O scheduler sits between the filesystem/page cache layer above and the device driver below:

```
  User Process
       |
       | read() / write()
       v
  +--------------------+
  |  Virtual File      |
  |  System (VFS)      |
  +--------------------+
       |
       v
  +--------------------+
  |  Page Cache        |   (buffered I/O lives here)
  +--------------------+
       |
       | submit_bio()
       v
  +--------------------+
  |  Block Layer       |
  |  +==============+  |
  |  | I/O Scheduler|  |  <-- decides ordering
  |  +==============+  |
  +--------------------+
       |
       | dispatch to driver
       v
  +--------------------+
  |  Device Driver     |
  |  (NVMe, SCSI, etc)|
  +--------------------+
       |
       v
  +--------------------+
  |  Storage Device    |
  |  (SSD / HDD)      |
  +--------------------+
```

The scheduler receives **bio** structures (Block I/O — a description of which sectors to read/write) from the block layer. It may merge adjacent requests, reorder them by sector address, apply fairness policies, and finally dispatch them to the hardware queue.

## The Single-Queue Era (Legacy)

Before Linux 3.13, the block layer used a **single request queue** per device. All CPUs funneled their I/O into one queue protected by a single spinlock. The classic schedulers from this era were:

- **Noop** — a simple FIFO; no reordering at all.
- **Deadline** — maintains read and write queues sorted by sector, plus FIFO queues with expiration timers. Prevents starvation by serving expired requests first.
- **CFQ (Completely Fair Queuing)** — gives each process its own queue, then services them round-robin with time slices. Optimized for desktop responsiveness.

The single-queue design worked fine when a disk could do ~200 IOPS. But modern NVMe SSDs can do millions of IOPS. A single spinlock serializing all CPUs became the bottleneck — not the device.

## Multi-Queue Block Layer (blk-mq)

Linux 3.13 (2014) introduced the **multi-queue block layer** (`blk-mq`). The key idea: give each CPU (or NUMA node) its own **software queue**, then map those to one or more **hardware dispatch queues** that the device driver exposes.

```
    CPU 0       CPU 1       CPU 2       CPU 3
      |           |           |           |
      v           v           v           v
  +-------+  +-------+  +-------+  +-------+
  | SW Q0 |  | SW Q1 |  | SW Q2 |  | SW Q3 |   software staging queues
  +-------+  +-------+  +-------+  +-------+   (per-CPU, no contention)
      |           |           |           |
      +-----------+-----------+-----------+
                        |
                  +===========+
                  | Scheduler |               (optional: mq-deadline, BFQ, kyber)
                  +===========+
                        |
              +---------+---------+
              |                   |
              v                   v
         +--------+          +--------+
         | HW Q0  |          | HW Q1  |      hardware dispatch queues
         +--------+          +--------+      (mapped to device queues)
              |                   |
              v                   v
         +----------------------------+
         |       NVMe Device          |
         |   (64 submission queues)   |
         +----------------------------+
```

Each software queue collects I/O from its CPU without locking against other CPUs. The scheduler (if any) merges and reorders across software queues, then dispatches to hardware queues. If no scheduler is configured (the `none` scheduler), requests go directly from software queues to hardware queues — maximum throughput, no reordering overhead.

The key source file is [`block/blk-mq.c`](https://github.com/torvalds/linux/blob/master/block/blk-mq.c). The entry point for dispatching is `blk_mq_run_hw_queue()`, which pulls requests from the scheduler (or directly from the software ctx) and pushes them into the driver's hardware queue.

## Request Merging

Before the scheduler even considers ordering, the block layer tries to **merge** adjacent I/O requests. If process A writes sectors 100–103 and process B writes sectors 104–107, those can become a single 8-sector write. This reduces the total number of requests the device must process.

Merging happens in two places:

1. **Plug/unplug** — when a process submits several bios quickly, they accumulate in a per-task "plug list." When the process sleeps or explicitly unplugs, the list is sorted and merged before being inserted into the scheduler.

2. **Elevator merge** — the scheduler itself checks incoming requests against those already queued. A new request can be merged with an existing one if their sector ranges are contiguous.

```
  Before merging:           After merging:

  req A: sectors 100-103    req AB: sectors 100-107
  req B: sectors 104-107    (one request, one DMA operation)
```

The merge logic lives in [`block/blk-merge.c`](https://github.com/torvalds/linux/blob/master/block/blk-merge.c). The function `blk_attempt_plug_merge()` handles plug-time merging, while `elv_merge()` handles scheduler-level merges.

## mq-deadline Scheduler

**mq-deadline** is the multi-queue successor to the legacy deadline scheduler. It's the default scheduler for most non-rotational devices in many distributions.

The algorithm maintains:

- A **sorted list** (red-black tree) per direction (read/write), ordered by sector number.
- A **FIFO list** per direction, ordered by submission time.
- **Expiration times**: reads default to 500ms, writes to 5000ms.

Dispatch logic (simplified):

```
  function dispatch_next():
      if any FIFO request has expired:
          serve the oldest expired request
          (prevents starvation)
      else:
          serve from sorted list in current direction
          (sequential access, minimizes seeks)
          if no more in this direction:
              switch direction
```

Reads get priority (shorter deadline) because processes usually block waiting for reads, while writes can be buffered. This matches the common case: a program blocked on `read()` cares about latency, while `write()` often returns immediately (data goes to page cache first).

The implementation is in [`block/mq-deadline.c`](https://github.com/torvalds/linux/blob/master/block/mq-deadline.c). The key dispatch function is `dd_dispatch_request()`.

## BFQ (Budget Fair Queuing) Scheduler

**BFQ** is designed for interactive workloads. It evolved from CFQ's ideas but with a more sophisticated fairness model. Each process gets a **budget** (in sectors) and a time-based weight.

The core idea: BFQ doesn't just round-robin between processes. It uses a **B-WF²Q+** (Budget Weighted Fair Queuing) algorithm — a modified variant of WF²Q+ adapted for block I/O. Think of it as a virtual-time-based fair scheduler:

```
  Process A (weight 100)     Process B (weight 200)
  budget: 8 sectors          budget: 16 sectors

  Timeline:
  |--A (8 sectors)--|----B (16 sectors)----|--A (8 sectors)--|-- ...
                    ^                      ^
              B gets 2x share because 2x weight
```

BFQ also implements **low-latency heuristics**: it detects "interactive" processes (those doing small, sporadic I/O) and boosts their priority temporarily. This is why BFQ makes a desktop feel snappy even when a background `cp` is running — the desktop app's tiny reads get served almost immediately.

BFQ's downside: the accounting and per-process queue management adds CPU overhead. On high-IOPS NVMe devices doing millions of operations, BFQ's overhead can become the bottleneck. It's best suited for SATA SSDs or HDDs where the device is the bottleneck, not the CPU.

Source: [`block/bfq-iosched.c`](https://github.com/torvalds/linux/blob/master/block/bfq-iosched.c).

## Kyber Scheduler

**Kyber** takes the opposite philosophy from BFQ: instead of complex fairness accounting, it uses a simple **token-based** approach to control queue depth at the hardware level.

The insight: for fast devices (NVMe SSDs), the main goal is controlling **latency**, not fairness. If you allow too many writes to pile up in the hardware queue, reads get stuck behind them and latency spikes. Kyber limits how many requests of each type can be in-flight:

```
  Kyber Token Buckets:

  +------------------+     +------------------+
  | Read tokens: 16  |     | Write tokens: 8  |
  | (in-flight limit)|     | (in-flight limit)|
  +------------------+     +------------------+
         |                         |
         |   only dispatch if      |
         |   tokens available      |
         v                         v
  +----------------------------------------+
  |         Hardware Queue                 |
  +----------------------------------------+
```

Kyber dynamically adjusts these token counts based on observed latency. If read latencies exceed a target (default 2ms), it reduces the write token count, throttling writes so reads get through faster. This auto-tuning means Kyber requires essentially zero configuration.

The trade-off: Kyber doesn't do sector-based sorting or request merging beyond what the plug list provides. For HDDs (where sequential access matters enormously), Kyber performs poorly. It's designed exclusively for fast random-access devices.

Source: [`block/kyber-iosched.c`](https://github.com/torvalds/linux/blob/master/block/kyber-iosched.c).

## Choosing a Scheduler

The scheduler is set per block device. You can check and change it at runtime:

```bash
# Check current scheduler (bracketed = active)
cat /sys/block/sda/queue/scheduler
# Output: [mq-deadline] kyber bfq none

# Change scheduler
echo "bfq" > /sys/block/sda/queue/scheduler
```

General guidelines:

```
  +------------------+-------------------+-------------------------------+
  | Device Type      | Recommended       | Why                           |
  +------------------+-------------------+-------------------------------+
  | NVMe SSD         | none or kyber     | Device is fast enough;        |
  | (high IOPS)      |                   | scheduler overhead hurts      |
  +------------------+-------------------+-------------------------------+
  | SATA SSD         | mq-deadline       | Some ordering helps; low      |
  |                  | or kyber          | overhead                      |
  +------------------+-------------------+-------------------------------+
  | HDD              | mq-deadline       | Seek reduction is critical;   |
  | (spinning disk)  | or bfq            | BFQ if interactive needed     |
  +------------------+-------------------+-------------------------------+
  | Desktop (mixed)  | bfq               | Interactive responsiveness    |
  |                  |                   | under mixed workloads         |
  +------------------+-------------------+-------------------------------+
```

For database workloads (like TiDB on NVMe), `none` or `kyber` is typical — the database engine already has its own I/O scheduling (e.g., RocksDB's rate limiter), and adding a kernel scheduler just adds latency.

## How a Request Flows End-to-End

Let's trace a single `read()` call through the entire path:

```
  1. User calls read(fd, buf, 4096)
             |
  2. VFS resolves file -> inode -> block mappings
             |
  3. Page cache miss -> submit_bio(READ, sector=2048, len=8)
             |
  4. Bio enters block layer
             |
  5. Per-CPU plug list: attempt merge with pending bios
             |  (merged if adjacent sector range)
             |
  6. Plug flushes -> bio converted to struct request
             |
  7. Request inserted into scheduler (e.g., mq-deadline)
             |  - Added to sector-sorted red-black tree
             |  - Added to read FIFO queue with timestamp
             |
  8. blk_mq_run_hw_queue() called
             |  - Scheduler's dispatch function picks next request
             |  - mq-deadline: serve expired or next-in-sequence
             |
  9. Request placed in hardware dispatch queue
             |
  10. Device driver (e.g., nvme_queue_rq) programs DMA
             |
  11. Device completes I/O -> interrupt -> softirq
             |
  12. Block layer completes request -> wakes waiting process
             |
  13. User's read() returns with data in buf
```

## The "none" Scheduler

Setting the scheduler to `none` bypasses all scheduling logic. Requests go from the software queue directly to the hardware queue with only basic merging from the plug list. This gives:

- **Lowest latency** — no scheduling overhead
- **Highest throughput** — on devices with internal parallelism (NVMe with 64+ queues)
- **No fairness** — a single process can dominate the device
- **No starvation protection** — writes can starve reads indefinitely

For NVMe devices with their own internal scheduler (FTL firmware), using `none` avoids double-scheduling. The device's Flash Translation Layer already optimizes access to NAND chips internally.

## I/O Priorities and cgroups

The I/O scheduler interacts with Linux's **cgroup** system to enforce per-group I/O limits. With cgroup v2 and BFQ:

```
  # Limit container to 50MB/s write bandwidth
  echo "259:0 wbps=52428800" > /sys/fs/cgroup/mycontainer/io.max

  # Set I/O weight (BFQ uses this for proportional sharing)
  echo "259:0 100" > /sys/fs/cgroup/mycontainer/io.bfq.weight
```

BFQ is the only upstream scheduler that fully supports proportional-weight I/O control with cgroups. When multiple containers compete for disk bandwidth, BFQ allocates budget proportional to their configured weights — similar to how CFS allocates CPU time.

## Historical Note: The Elevator Analogy

I/O schedulers are sometimes called "elevators" — a name dating back to early Unix. The analogy: an elevator doesn't serve floor requests in the order they arrive. Instead, it moves in one direction serving all requests along the way, then reverses. This **SCAN** (or **LOOK**) algorithm minimizes total head movement:

```
  Head position -->          direction: -->

  FIFO order:     50, 200, 30, 180, 10
  Seeks:          50->200->30->180->10  = 4 direction changes

  Elevator order: 50, 180, 200, 30, 10
  Seeks:          10->30->50->180->200  = sweep up once
                  (or 50->180->200 then 30->10)
```

Modern schedulers like mq-deadline still use this principle (the sorted red-black tree provides scan order), but layer deadline-based starvation prevention on top.

## References

1. Linux block layer documentation: [Block Layer Overview](https://www.kernel.org/doc/html/latest/block/index.html)
2. blk-mq design paper: Bjørling, Axboe, et al. "Linux Block IO: Introducing Multi-queue SSD Access on Multi-core Systems" (2013)
3. BFQ documentation: [BFQ I/O Scheduler](https://www.kernel.org/doc/html/latest/block/bfq-iosched.html)
4. Kyber documentation: [Kyber I/O Scheduler](https://www.kernel.org/doc/html/latest/block/kyber-iosched.html)
5. Jens Axboe's blk-mq talk at Linux Plumbers Conference 2013
6. LWN.net: [The multiqueue block layer](https://lwn.net/Articles/552904/) (2013)
7. LWN.net: [Block layer introduction](https://lwn.net/Articles/736534/) (2017)
