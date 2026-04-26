---
author: JZ
pubDatetime: 2026-04-26T04:45:00Z
modDatetime: 2026-04-26T04:45:00Z
title: System Design - RAM vs. cgroup Limit/Cap vs. RSS
tags:
  - design-system
  - cheatsheet-linux
description:
  "A practical explanation of common memory terms: physical RAM, container cgroup memory limit/cap, and RSS (resident set size), with diagrams and examples for Linux systems."
---

## Table of contents

## Context

When a machine or container runs out of memory, people often look at three different numbers:

- `free -h` on the host
- the container memory limit from Kubernetes or Docker
- the RSS shown by `ps`, `top`, or `/proc/<pid>/status`

These numbers are related, but they do **not** answer the same question.

That is the source of most memory confusion:

- A process RSS can be small while the container still hits its memory cap.
- A container can stay below its cap while the host is under memory pressure.
- The sum of RSS values can be larger than the memory actually used.

This post separates the terms clearly and shows how they fit together.

## The Short Version

Think of the memory stack like this:

```text
 +--------------------------------------------------------------+
 | Host RAM                                                     |
 | Physical memory on the machine                               |
 | Used by processes, kernel, page cache, tmpfs, buffers, etc.  |
 +-----------------------------+--------------------------------+
                               |
                               v
 +--------------------------------------------------------------+
 | cgroup memory limit / cap                                    |
 | Maximum memory a GROUP of processes is allowed to consume     |
 | Commonly used for containers                                 |
 +-----------------------------+--------------------------------+
                               |
                               v
 +--------------------------------------------------------------+
 | RSS                                                          |
 | Memory pages currently resident in RAM for ONE process        |
 | Reported per process by ps/top/proc                          |
 +--------------------------------------------------------------+
```

So the rough mental model is:

- **RAM** answers: how much physical memory exists on the machine, and how much of it is in use.
- **cgroup limit/cap** answers: how much memory a container or process group is allowed to use before reclaim or OOM handling kicks in.
- **RSS** answers: how much of one process's memory is currently resident in physical memory.

## 1. RAM: The Machine's Physical Memory

RAM is the actual physical memory installed in a machine.

If a host has 64 GiB of RAM, that is the total pool the Linux kernel manages. Every workload on the machine competes for space in that pool:

- user-space processes
- shared libraries mapped into processes
- kernel memory
- filesystem page cache
- tmpfs and shared memory
- network buffers and other kernel-managed structures

That means "used RAM" is **not** the same thing as "memory owned by my application."

On Linux, `free -h` often looks confusing because it includes page cache and buffers:

```bash
free -h
```

You may see something like:

```text
               total        used        free      shared  buff/cache   available
Mem:            64Gi        50Gi         2Gi       1.2Gi        12Gi        11Gi
```

This does **not** mean applications have permanently consumed 50 GiB and only 2 GiB is left. A large part of `buff/cache` is reclaimable. The kernel uses free RAM aggressively for caching because unused RAM is wasted RAM.

So for host-level health, `available` is usually more meaningful than `free`.

## 2. cgroup Limit / Cap: A Boundary Around a Group

A cgroup (control group) is a Linux kernel mechanism for tracking and limiting resource usage for a **group of processes**.

For memory, the important idea is simple:

- the kernel accounts memory usage for the whole group
- the group can be given a memory limit or cap
- if usage grows too high, the kernel tries reclaim first
- if reclaim is not enough, the group can be OOM-killed

Containers rely on this. A Docker container or Kubernetes pod is usually backed by one or more cgroups.

So if a pod has:

```yaml
resources:
  limits:
    memory: "8Gi"
```

that is not "the RSS limit of the main process." It is closer to:

> "All memory charged to this pod's cgroup should stay under 8 GiB."

On cgroup v2, the common files are:

```text
/sys/fs/cgroup/memory.current
/sys/fs/cgroup/memory.max
/sys/fs/cgroup/memory.stat
```

On older cgroup v1 systems, the names are different, for example:

```text
/sys/fs/cgroup/memory/memory.usage_in_bytes
/sys/fs/cgroup/memory/memory.limit_in_bytes
```

The important thing is the accounting scope:

- **cgroup memory usage is for the whole group**
- **RSS is for one process**

That single difference explains many production incidents.

## 3. RSS: Resident Set Size

RSS stands for **Resident Set Size**.

It means the portion of a process's memory that is currently resident in physical RAM.

You can inspect it with commands like:

```bash
ps -o pid,rss,comm -p <pid>
grep VmRSS /proc/<pid>/status
```

If a process shows:

```text
VmRSS:   3145728 kB
```

then about 3 GiB of that process's pages are currently in RAM.

But RSS is often misunderstood.

RSS is **not**:

- the process's total virtual address space
- the container's total memory usage
- a perfect measure of unique/private memory
- a guarantee that the process alone is responsible for all those pages

RSS includes pages that are resident now, including some pages shared with other processes, such as shared libraries or shared mappings. Because of that, **summing RSS across processes can overcount memory**.

That is why tools like `smem` also expose **PSS** (Proportional Set Size), which divides shared pages across processes more fairly.

## The Three Terms Side by Side

Here is the clean comparison:

| Term | Scope | What it means | Common command |
| --- | --- | --- | --- |
| RAM | Whole machine | Physical memory on the host | `free -h`, `vmstat` |
| cgroup memory usage / limit | Group of processes | Memory charged to a container or cgroup, plus its configured boundary | `cat /sys/fs/cgroup/memory.current`, `cat /sys/fs/cgroup/memory.max` |
| RSS | One process | Resident pages currently in RAM for that process | `ps`, `top`, `/proc/<pid>/status` |

If you remember only one sentence, use this:

> RAM is the machine's pool, cgroup limit is the group's boundary, and RSS is one process's in-RAM footprint.

## Why RSS and cgroup Memory Do Not Match

Suppose a container has two processes:

- main app: RSS = 3.2 GiB
- sidecar: RSS = 0.3 GiB

You might expect container memory usage to be about 3.5 GiB. But the cgroup may show 6.0 GiB instead.

Why?

Because cgroup accounting can include much more than the main process RSS:

- page cache charged to the cgroup
- tmpfs or `/dev/shm` usage
- memory from helper processes
- shared mappings
- allocator fragmentation
- some kernel-accounted memory associated with the group

Example:

```text
Container cgroup limit: 8.0 GiB

  main process RSS                  3.2 GiB
  sidecar RSS                       0.3 GiB
  page cache charged to cgroup      1.8 GiB
  /dev/shm and tmpfs                0.5 GiB
  other charged memory              0.2 GiB
                                   --------
  cgroup memory.current             6.0 GiB
```

Nothing is inconsistent here. The numbers are measuring different things.

## Why the Sum of RSS Can Also Be Misleading

Now take a different example.

Three worker processes each map the same 500 MiB shared library and shared memory segment:

```text
worker A RSS = 1.2 GiB
worker B RSS = 1.2 GiB
worker C RSS = 1.2 GiB
sum of RSS   = 3.6 GiB
```

But a large chunk of those resident pages is shared, so the actual total memory impact may be much lower than 3.6 GiB.

That is why:

- **RSS is useful per process**
- **RSS is dangerous to sum blindly**

When you need fair attribution across many processes, PSS is often a better metric than RSS.

## A Practical Container Example

Imagine this machine:

```text
Host RAM: 64 GiB
```

One Kubernetes pod on it has:

```text
Memory limit: 8 GiB
```

Inside that pod:

- Java process RSS = 4.5 GiB
- log sidecar RSS = 0.2 GiB
- page cache charged to the pod = 2.0 GiB
- tmpfs files = 0.6 GiB

The picture looks like this:

```text
Host RAM = 64 GiB

  +----------------------------------------------------------+
  | Host memory                                               |
  |                                                          |
  |  other workloads                          30.0 GiB       |
  |  this pod's cgroup usage                   7.3 GiB       |
  |  other page cache / kernel                10.7 GiB       |
  |  still available                          16.0 GiB       |
  +----------------------------------------------------------+

  Pod cgroup limit = 8.0 GiB

  +----------------------------------------------------------+
  | Pod memory charged to cgroup                              |
  |                                                          |
  |  Java RSS                                4.5 GiB         |
  |  sidecar RSS                             0.2 GiB         |
  |  page cache                              2.0 GiB         |
  |  tmpfs / shm                             0.6 GiB         |
  |                                          -------         |
  |  total charged                           7.3 GiB         |
  +----------------------------------------------------------+
```

This pod is close to its own cap even though the machine still has plenty of RAM available.

That is a common production pattern:

- **host healthy**
- **container not healthy**

The opposite can also happen:

- a pod stays below its 8 GiB cap
- but many pods together pressure the host's 64 GiB RAM
- then the node itself gets into memory trouble

## What Usually Triggers OOM in Containers

In containerized systems, the most common failure is not "RSS crossed some magic line." The more typical story is:

1. The cgroup's charged memory keeps growing.
2. The kernel tries reclaim.
3. Reclaim is insufficient.
4. The cgroup exceeds its hard boundary.
5. The kernel OOM logic kills one or more processes in that cgroup.

So when debugging a container OOM, check the cgroup numbers first, not only the main process RSS.

## What to Check in Real Incidents

If the question is "Is the machine under memory pressure?", check host-level RAM:

```bash
free -h
vmstat 1
```

If the question is "Is this container close to its allowed cap?", check cgroup usage:

```bash
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.stat
```

If the question is "Which process inside the container is large?", check RSS:

```bash
ps -e -o pid,rss,comm --sort=-rss | head
top
```

If the question is "Why doesn't the sum of processes line up?", look at shared memory and fair-share tools:

```bash
smem -r
cat /proc/<pid>/smaps
```

## A Better Debugging Sequence

A practical order is:

1. Start with the cgroup limit and current usage.
2. Check whether page cache, tmpfs, or shared memory is large.
3. Then inspect per-process RSS.
4. If multi-process accounting still looks strange, inspect PSS or `smaps`.
5. Finally, compare with host-level RAM to see whether this is only a container problem or a node-wide problem.

This order prevents a common mistake: staring at one big process RSS number and assuming it fully explains a container OOM.

## Final Mental Model

Use this compact model:

```text
RAM            = capacity of the whole house
cgroup limit   = the maximum space one apartment may occupy
RSS            = the floor space currently occupied by one person
```

That analogy is imperfect, but it is good enough to keep the scopes straight:

- **RAM** is machine-wide.
- **cgroup limit/cap** is group-wide.
- **RSS** is process-wide.

Once you separate scope, most memory dashboards become much easier to read.

## References

1. [Linux `proc_pid_status` man page](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
2. [Linux `proc` man page](https://man7.org/linux/man-pages/man5/proc.5.html)
3. [Linux kernel cgroup v2 admin guide](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
4. [Linux `free` man page](https://man7.org/linux/man-pages/man1/free.1.html)
5. [Linux `ps` man page](https://man7.org/linux/man-pages/man1/ps.1.html)
