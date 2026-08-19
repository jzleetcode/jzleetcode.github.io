---
author: JZ
pubDatetime: 2026-08-19T06:00:00Z
modDatetime: 2026-08-19T06:00:00Z
title: System Design - How Linux cgroups Work
tags:
  - design-system
  - design-concurrency
description:
  "How Linux control groups (cgroups) work: resource isolation and limiting for processes, the filesystem interface, v1 vs v2 architecture, memory/cpu/io/pids controllers, kernel internals, OOM killer integration, and how Docker and Kubernetes use cgroups to build containers."
---

## Table of contents

## Context

Imagine you are a system administrator in 2005, running a shared Linux server with 200 university students. One student writes this:

```bash
:(){ :|:& };:
```

That is a **fork bomb**. It recursively spawns processes until the system runs out of PIDs, memory, or CPU. Every user on the machine suffers. The database crashes. The web server stops responding. A single careless (or malicious) user has taken down the entire system.

This is the **noisy neighbor problem**: one workload consuming shared resources to the detriment of all others. Before cgroups, Linux had limited tools to deal with this:

- `ulimit` — per-process resource limits, but trivially bypassed by forking
- `nice` / `renice` — CPU priority hints, but no hard guarantees
- `setrlimit()` — per-process, not per-group-of-processes

None of these could say: "This group of 50 processes belonging to user X may collectively use at most 2 GB of RAM and 50% of one CPU core." That required a fundamentally new abstraction.

```
    Before cgroups:                     After cgroups:
    +---------------------------+       +---------------------------+
    |        Linux Kernel       |       |        Linux Kernel       |
    |                           |       |                           |
    |  proc1  proc2  proc3 ... |       |  +-------+   +-------+   |
    |  (all sharing everything) |       |  |cgroup1|   |cgroup2|   |
    |                           |       |  | 2 GB  |   | 4 GB  |   |
    |  No isolation.            |       |  | 50%cpu|   | 100%cpu|  |
    |  One fork bomb kills all. |       |  |proc1,2|   |proc3,4|   |
    +---------------------------+       |  +-------+   +-------+   |
                                        +---------------------------+
```

**Control groups (cgroups)** were developed at Google by Paul Menage and Rohit Seth, initially called "process containers," and merged into the Linux kernel in version 2.6.24 (January 2008). They provide a mechanism to organize processes into hierarchical groups and apply resource limits, accounting, and isolation to those groups.

## What cgroups are

A cgroup is a kernel mechanism that:

1. **Groups processes** into a hierarchy (like a directory tree)
2. **Attaches controllers** (also called subsystems) that enforce limits on specific resources
3. **Exposes control** through a pseudo-filesystem that userspace reads and writes

The key insight is that cgroups separate two concerns:

- **Grouping:** Which processes belong together?
- **Control:** What resource policies apply to each group?

Every process on the system belongs to exactly one cgroup (per controller in v1, or one unified cgroup in v2). When a process forks, the child inherits its parent's cgroup membership.

```
    cgroup hierarchy (tree structure):
    
    /                          <-- root cgroup (all processes start here)
    |
    +-- system.slice/          <-- system services
    |   +-- sshd.service/
    |   +-- nginx.service/
    |
    +-- user.slice/            <-- user sessions
    |   +-- user-1000.slice/
    |       +-- session-1.scope/
    |
    +-- docker/                <-- containers
        +-- container-abc123/
        +-- container-def456/
```

## cgroup v1 vs v2

Linux has two versions of cgroups, and this causes real confusion. Understanding the architectural difference is essential.

### cgroup v1 (2008)

In v1, each **controller** (cpu, memory, blkio, etc.) has its own independent hierarchy. A process can be in different cgroups for different controllers:

```
    cgroup v1: Multiple Independent Hierarchies
    
    CPU hierarchy:          Memory hierarchy:       PID hierarchy:
    /                       /                       /
    +-- groupA/             +-- groupX/             +-- limit100/
    |   (proc 1,2)         |   (proc 1,3)         |   (proc 1,2,3)
    +-- groupB/             +-- groupY/             +-- limit50/
        (proc 3,4)             (proc 2,4)              (proc 4,5)
    
    Process 1: cpu=groupA, memory=groupX, pids=limit100
    Process 2: cpu=groupA, memory=groupY, pids=limit100
    (different grouping per controller!)
```

This flexibility turned out to be a mistake. It made the code complex, introduced subtle ordering bugs, and confused administrators. Multiple hierarchies also made delegation (giving unprivileged users control over sub-trees) nearly impossible to do safely.

### cgroup v2 (2016, Linux 4.5)

cgroup v2 uses a **single unified hierarchy**. All controllers attach to the same tree. A process is in exactly one place in the tree, and that determines all its resource constraints:

```
    cgroup v2: Single Unified Hierarchy
    
    /sys/fs/cgroup/
    |
    +-- cgroup.controllers      (lists available controllers)
    +-- cgroup.subtree_control  (which controllers are active for children)
    |
    +-- workload-A/
    |   +-- cgroup.procs        (PIDs: 1001, 1002)
    |   +-- cpu.max             (cpu limit)
    |   +-- memory.max          (memory limit)
    |   +-- io.max              (io limit)
    |
    +-- workload-B/
        +-- cgroup.procs        (PIDs: 2001, 2002, 2003)
        +-- cpu.max
        +-- memory.max
        +-- io.max
```

Key v2 improvements:

| Aspect | v1 | v2 |
|--------|----|----|
| Hierarchy | One per controller | Single unified |
| Delegation | Unsafe/complex | Built-in safe delegation |
| Pressure info | None | PSI (Pressure Stall Information) |
| Thread-level control | Per-controller | Threaded cgroup type |
| Internal processes | Allowed at any level | No internal processes rule |

The **no internal processes rule** in v2 means that if a cgroup has children, processes can only live in the leaf cgroups, not in the parent. This eliminates ambiguity about which cgroup's limits apply.

As of 2024, most major distributions default to cgroup v2 (Ubuntu 21.10+, Fedora 31+, Debian 11+). Docker and Kubernetes fully support v2.

## The filesystem interface

cgroups are controlled entirely through a pseudo-filesystem, typically mounted at `/sys/fs/cgroup/`. There are no special system calls to learn — you just read and write files.

```bash
# See what is mounted
$ mount | grep cgroup
cgroup2 on /sys/fs/cgroup type cgroup2 (rw,nosuid,nodev,noexec,relatime)

# List the root cgroup contents
$ ls /sys/fs/cgroup/
cgroup.controllers      cpu.stat           memory.pressure
cgroup.max.depth        cpuset.cpus.effective  memory.stat
cgroup.max.descendants  cpuset.mems.effective  misc.capacity
cgroup.procs            io.pressure        pids.current
cgroup.stat             io.stat            system.slice/
cgroup.subtree_control  memory.current     user.slice/
cgroup.threads          memory.max         init.scope/
cpu.pressure            memory.numa_stat
```

The interface follows a simple pattern:

- **Directories** = cgroups (create with `mkdir`, remove with `rmdir`)
- **Files** = control knobs and statistics (read/write with `cat`/`echo`)
- **cgroup.procs** = which PIDs belong to this cgroup (write a PID to move it)

```bash
# Create a new cgroup
$ mkdir /sys/fs/cgroup/my-group

# See what files appeared automatically
$ ls /sys/fs/cgroup/my-group/
cgroup.controllers  cgroup.procs     cpu.max      memory.current
cgroup.events       cgroup.stat      cpu.stat     memory.max
cgroup.freeze       cgroup.threads   cpu.weight   memory.high
...

# Move the current shell into that cgroup
$ echo $$ > /sys/fs/cgroup/my-group/cgroup.procs

# Verify
$ cat /proc/$$/cgroup
0::/my-group
```

This filesystem approach is elegant: it composes with standard Unix tools (`cat`, `echo`, `ls`, `find`), works with any programming language, and requires no special libraries.

## Key controllers

### PID controller — preventing fork bombs

The simplest controller. It limits how many processes (and threads) can exist in a cgroup.

```bash
# Enable the pids controller for children
$ echo "+pids" > /sys/fs/cgroup/cgroup.subtree_control

# Create a constrained cgroup
$ mkdir /sys/fs/cgroup/limited
$ echo 20 > /sys/fs/cgroup/limited/pids.max

# Move a shell in and try a fork bomb
$ echo $$ > /sys/fs/cgroup/limited/cgroup.procs
$ :(){ :|:& };:
# bash: fork: retry: Resource temporarily unavailable
# Only 20 processes total -- fork bomb contained!
```

The kernel enforces this in `copy_process()` during `fork()`. If the cgroup's PID count would exceed `pids.max`, `fork()` returns `-EAGAIN`.

Source: [kernel/cgroup/pids.c](https://github.com/torvalds/linux/blob/master/kernel/cgroup/pids.c)

### Memory controller — capping RAM usage

The memory controller tracks and limits physical memory (RSS), kernel memory, and swap usage per cgroup.

Key files:

| File | Purpose |
|------|---------|
| `memory.current` | Current memory usage (bytes) |
| `memory.max` | Hard limit — triggers OOM killer |
| `memory.high` | Soft limit — triggers reclaim pressure |
| `memory.low` | Best-effort memory protection |
| `memory.min` | Hard memory protection (guaranteed) |
| `memory.swap.max` | Swap usage limit |
| `memory.stat` | Detailed breakdown (anon, file, slab, etc.) |

```bash
# Limit a cgroup to 512 MB of RAM
$ echo 536870912 > /sys/fs/cgroup/my-group/memory.max

# Or use human-readable shorthand (kernel 5.x+)
$ echo "512M" > /sys/fs/cgroup/my-group/memory.max

# Watch current usage
$ cat /sys/fs/cgroup/my-group/memory.current
134217728
```

We will dive deep into the memory controller internals later in this post.

### CPU controller — bandwidth throttling

The CPU controller provides two mechanisms:

1. **Proportional weight** (`cpu.weight`): When CPUs are contended, divide time proportionally
2. **Bandwidth limit** (`cpu.max`): Absolute cap, regardless of whether CPUs are idle

```bash
# Set proportional weight (default 100, range 1-10000)
$ echo 50 > /sys/fs/cgroup/my-group/cpu.weight

# Set absolute bandwidth: 50ms every 100ms period = 50% of one CPU
$ echo "50000 100000" > /sys/fs/cgroup/my-group/cpu.max
#        ^quota ^period  (in microseconds)

# "max 100000" means unlimited quota (no throttling)
$ echo "max 100000" > /sys/fs/cgroup/my-group/cpu.max
```

### I/O controller — disk bandwidth limits

The I/O controller limits read/write bandwidth and IOPS per block device:

```bash
# Find your device's major:minor number
$ lsblk -d -o NAME,MAJ:MIN
NAME  MAJ:MIN
sda     8:0
nvme0n1 259:0

# Limit to 50 MB/s read and 20 MB/s write on device 259:0
$ echo "259:0 rbps=52428800 wbps=20971520" > /sys/fs/cgroup/my-group/io.max

# Limit IOPS
$ echo "259:0 riops=1000 wiops=500" > /sys/fs/cgroup/my-group/io.max
```

## Kernel internals: how cgroups are implemented

Understanding the kernel data structures helps explain cgroup behavior and limitations.

### Core data structures

Every process in Linux is represented by a `task_struct`. The cgroup connection looks like this:

```c
// include/linux/sched.h
struct task_struct {
    // ... hundreds of fields ...
    
    #ifdef CONFIG_CGROUPS
    struct css_set __rcu *cgroups;       // pointer to cgroup state
    struct list_head cg_list;            // list of tasks in same css_set
    #endif
};
```

The `css_set` (cgroup subsystem state set) is the key indirection:

```c
// include/linux/cgroup-defs.h
struct css_set {
    struct cgroup_subsys_state *subsys[CGROUP_SUBSYS_COUNT];
    // One pointer per controller (memory, cpu, io, pids, ...)
    
    refcount_t refcount;
    struct hlist_node hlist;          // hash table linkage
    struct list_head tasks;           // all tasks sharing this css_set
    struct list_head mg_tasks;        // tasks being migrated
    struct list_head cgrp_links;      // links to actual cgroup objects
};
```

The relationship forms this structure:

```
    task_struct               css_set                cgroup_subsys_state
    +----------+             +---------+            +------------------+
    | pid: 42  |             | subsys[]|            |                  |
    | cgroups -|------------>| [0] cpu-|----------->| cgroup (memory)  |
    +----------+             | [1] mem-|--+         +------------------+
                             | [2] io  |  |
    task_struct              | [3] pids|  |         +------------------+
    +----------+             +---------+  +-------->| cgroup (cpu)     |
    | pid: 43  |                  ^                 +------------------+
    | cgroups -|------------------+
    +----------+          (both tasks share
                           the same css_set if
                           in same cgroups)
```

Multiple tasks can share the same `css_set` if they are in identical cgroups for all controllers. This is an optimization — the kernel maintains a hash table of `css_set` objects and reuses them.

### How a process moves between cgroups

When you write a PID to `cgroup.procs`, the kernel calls `cgroup_migrate()`:

```c
// kernel/cgroup/cgroup.c (simplified)
static int cgroup_migrate(struct task_struct *task, 
                          struct cgroup *dst_cgrp) {
    struct css_set *old_cset = task_css_set(task);
    struct css_set *new_cset;
    
    // Find or create a css_set for the destination
    new_cset = find_css_set(old_cset, dst_cgrp);
    
    // Update the task atomically
    rcu_assign_pointer(task->cgroups, new_cset);
    
    // Notify controllers (they may need to update accounting)
    for_each_subsys(ss, ssid) {
        ss->attach(new_cset, task);  // e.g., memory charges transfer
    }
    
    return 0;
}
```

The migration is atomic from the task's perspective — it never exists in "no cgroup" or "two cgroups" simultaneously.

### Filesystem implementation

The cgroupfs is implemented as a kernfs-based filesystem (not the older VFS approach). Each cgroup directory maps to a `struct kernfs_node`, and reading/writing files calls into controller-specific callbacks:

```c
// kernel/cgroup/cgroup.c
static struct cftype cgroup_base_files[] = {
    {
        .name = "cgroup.procs",
        .seq_show = cgroup_procs_show,   // called on read
        .write = cgroup_procs_write,     // called on write
    },
    {
        .name = "cgroup.controllers",
        .seq_show = cgroup_controllers_show,
    },
    // ...
};
```

Source: [kernel/cgroup/cgroup.c](https://github.com/torvalds/linux/blob/master/kernel/cgroup/cgroup.c)

## Memory controller deep dive

The memory controller is the most complex cgroup subsystem. It must track every page of memory charged to a cgroup and decide what happens when limits are exceeded.

### How memory charging works

When a process allocates memory (via `mmap`, `brk`, `malloc` -> page fault), the kernel must **charge** that page to the process's memory cgroup:

```
    Process calls malloc(4096)
            |
            v
    Page fault (first access)
            |
            v
    alloc_pages() -> get physical page
            |
            v
    mem_cgroup_charge()
            |
            +----> Is cgroup over memory.max?
            |           |
            |       YES |           NO
            |           v            |
            |      try_reclaim()     v
            |           |        charge succeeds
            |       reclaimed?      page mapped
            |       YES | NO
            |        |     |
            |        v     v
            |   charge   invoke OOM
            |   succeeds  killer
            v
    Page mapped into process address space
```

The charging happens in `mem_cgroup_charge()` ([mm/memcontrol.c](https://github.com/torvalds/linux/blob/master/mm/memcontrol.c)):

```c
int mem_cgroup_charge(struct folio *folio, struct mm_struct *mm, gfp_t gfp) {
    struct mem_cgroup *memcg;
    
    memcg = get_mem_cgroup_from_mm(mm);  // find task's memory cgroup
    
    // Try to charge. If over limit, this triggers reclaim.
    int ret = try_charge(memcg, gfp, folio_nr_pages(folio));
    if (ret)
        return ret;  // OOM or allocation failure
    
    // Record ownership: this page belongs to this cgroup
    folio->memcg_data = (unsigned long)memcg;
    return 0;
}
```

### The memory limit hierarchy

cgroup v2 provides multiple limit knobs that work together:

```
    memory.min (hard protection)
         |
         v
    memory.low (best-effort protection)
         |
         v
    [normal reclaim pressure zone]
         |
         v
    memory.high (soft limit - throttle + reclaim)
         |
         v
    memory.max (hard limit - OOM kill if reclaim fails)
         |
         v
    memory.swap.max (swap limit)


    Example configuration for a web server:
    
    memory.min  = 256M    (kernel will never reclaim below this)
    memory.low  = 512M    (reclaim only under global pressure)
    memory.high = 1800M   (start throttling here, encourage reclaim)
    memory.max  = 2048M   (hard wall, OOM if exceeded)
```

### OOM killer integration

When a cgroup exceeds `memory.max` and reclaim cannot free pages, the kernel invokes the **OOM killer** scoped to that cgroup. This is a critical difference from the system-wide OOM killer:

```
    System-wide OOM:                    Cgroup-scoped OOM:
    
    Kill the "worst" process           Kill within the offending cgroup
    on the entire system               only. Other cgroups unaffected.
    
    Collateral damage: HIGH            Collateral damage: CONTAINED
```

The cgroup OOM killer selects a victim within the cgroup using `oom_badness()` — the process using the most memory gets killed first. You can monitor OOM events:

```bash
# Watch for OOM kills in a cgroup
$ cat /sys/fs/cgroup/my-group/memory.events
low 0
high 5
max 2
oom 1          <-- one OOM kill has occurred
oom_kill 1
oom_group_kill 0
```

The `memory.oom.group` file controls whether the OOM killer kills a single process or the entire cgroup (useful for containers where partial kill leaves inconsistent state):

```bash
# Kill entire cgroup on OOM (like Docker's --oom-kill-disable=false)
$ echo 1 > /sys/fs/cgroup/my-group/memory.oom.group
```

## CPU controller deep dive

The CPU controller uses the **Completely Fair Scheduler (CFS)** bandwidth throttling mechanism to enforce CPU limits.

### CFS bandwidth control

CFS bandwidth works in terms of **periods** and **quotas**:

- **Period:** A recurring time window (default 100ms)
- **Quota:** How much CPU time the cgroup may consume within each period

```
    cpu.max = "50000 100000"  ->  50ms quota per 100ms period = 50% of one CPU
    
    Time --->
    |---- 100ms period ----|---- 100ms period ----|
    [===== 50ms used =====][===== 50ms used =====]
    [    throttled 50ms    ][    throttled 50ms    ]
    
    cpu.max = "200000 100000"  ->  200ms per 100ms = 2 full CPUs
    (requires at least 2 CPUs)
```

When a cgroup exhausts its quota within a period, all its runnable tasks are **throttled** — moved off the CPU run queue until the next period begins. You can observe this:

```bash
# Check throttling statistics
$ cat /sys/fs/cgroup/my-group/cpu.stat
usage_usec 4521902
user_usec 3892001
system_usec 629901
nr_periods 1205
nr_throttled 387        <-- throttled 387 times
throttled_usec 19350000 <-- total 19.35 seconds spent throttled
```

### How CFS bandwidth is implemented

The kernel tracks bandwidth with a per-cgroup structure:

```c
// kernel/sched/sched.h
struct cfs_bandwidth {
    ktime_t         period;           // period duration
    u64             quota;            // quota per period (ns)
    u64             runtime;          // remaining runtime in current period
    int             nr_throttled;     // count of throttled entities
    struct hrtimer  period_timer;     // fires every period to refill
    struct hrtimer  slack_timer;      // handles leftover runtime
};
```

The flow when a task runs:

```
    Task is running on CPU
            |
            v
    scheduler tick / dequeue
            |
            v
    account_cfs_rq_runtime()
            |
            +----> Decrement cfs_bandwidth.runtime
            |
            +----> runtime <= 0?
                        |
                    YES |        NO
                        v         |
                   throttle_cfs_rq()   (continue running)
                        |
                        v
                   Dequeue all tasks
                   Wait for period_timer
                        |
                        v
                   period_timer fires
                        |
                        v
                   distribute_cfs_runtime()
                        |
                        v
                   unthrottle_cfs_rq()
                   Tasks become runnable again
```

Source: [kernel/sched/fair.c](https://github.com/torvalds/linux/blob/master/kernel/sched/fair.c) — search for `cfs_bandwidth`.

### CPU weight (proportional sharing)

Unlike `cpu.max` which is an absolute cap, `cpu.weight` only matters when CPUs are contended:

```bash
# GroupA gets weight 100 (default), GroupB gets weight 300
# When both are CPU-hungry on the same core:
#   GroupA gets 100/(100+300) = 25% of CPU
#   GroupB gets 300/(100+300) = 75% of CPU
# When only GroupA is running: it gets 100% (weights irrelevant)
```

This is the difference between a **limit** (cpu.max) and a **share** (cpu.weight). Most production systems use both: weight for fairness, max as a safety cap.

## How Docker and Kubernetes use cgroups

A Linux container is fundamentally three kernel features composed together:

```
    Container = cgroups + namespaces + overlay filesystem
    
    +----------------------------------------------------------+
    |  What you see as a "container":                          |
    |                                                          |
    |  +-- Namespaces (isolation of WHAT you see) ----------+  |
    |  |   PID namespace:  container sees pid 1             |  |
    |  |   NET namespace:  container has own network stack  |  |
    |  |   MNT namespace:  container has own filesystem     |  |
    |  |   UTS namespace:  container has own hostname       |  |
    |  +----------------------------------------------------+  |
    |                                                          |
    |  +-- cgroups (isolation of HOW MUCH you get) ---------+  |
    |  |   memory.max:  RAM limit                           |  |
    |  |   cpu.max:     CPU limit                           |  |
    |  |   pids.max:    process count limit                 |  |
    |  |   io.max:      disk I/O limit                      |  |
    |  +----------------------------------------------------+  |
    |                                                          |
    |  +-- Overlay FS (isolation of filesystem state) ------+  |
    |  |   Image layers (read-only) + container layer (rw)  |  |
    |  +----------------------------------------------------+  |
    +----------------------------------------------------------+
```

### Docker resource flags and cgroup mappings

When you run `docker run --memory=1g --cpus=2 nginx`, Docker creates a cgroup and writes:

```bash
# Docker translates flags to cgroup files:
#   --memory=1g        ->  echo 1073741824 > memory.max
#   --cpus=2           ->  echo "200000 100000" > cpu.max
#   --pids-limit=100   ->  echo 100 > pids.max
#   --memory-swap=2g   ->  echo 1073741824 > memory.swap.max (swap = total - ram)
```

You can verify this for a running container:

```bash
# Find a container's cgroup
$ docker inspect --format '{{.State.Pid}}' my-container
12345
$ cat /proc/12345/cgroup
0::/system.slice/docker-abc123...scope

# Check its limits
$ cat /sys/fs/cgroup/system.slice/docker-abc123...scope/memory.max
1073741824
$ cat /sys/fs/cgroup/system.slice/docker-abc123...scope/cpu.max
200000 100000
```

### Kubernetes resource requests and limits

Kubernetes maps its resource model to cgroups:

```yaml
# Pod spec
resources:
  requests:
    memory: "512Mi"     # memory.low (guaranteed minimum)
    cpu: "500m"         # cpu.weight (proportional share)
  limits:
    memory: "1Gi"       # memory.max (hard cap, OOM kill)
    cpu: "2"            # cpu.max = "200000 100000"
```

The kubelet (via the container runtime) creates cgroup hierarchies:

```
    /sys/fs/cgroup/
    +-- kubepods.slice/
        +-- kubepods-burstable.slice/         <-- QoS class: Burstable
        |   +-- kubepods-burstable-pod<uid>.slice/
        |       +-- cri-containerd-<id>.scope/   <-- actual container
        |           memory.max = 1073741824
        |           cpu.max = 200000 100000
        |
        +-- kubepods-besteffort.slice/        <-- QoS class: BestEffort
        +-- kubepods-guaranteed.slice/        <-- QoS class: Guaranteed (not in burstable parent)
```

Kubernetes uses three QoS classes, each with different cgroup configurations:

- **Guaranteed:** requests == limits for all resources (predictable, no throttling surprises)
- **Burstable:** requests < limits (can use more when available, throttled when contended)
- **BestEffort:** no requests/limits set (first to be evicted under pressure)

## Practical examples

### Example 1: Containing a memory hog

```bash
# Create a cgroup limited to 100 MB
sudo mkdir /sys/fs/cgroup/demo-mem
echo "+memory" | sudo tee /sys/fs/cgroup/cgroup.subtree_control
echo "100M" | sudo tee /sys/fs/cgroup/demo-mem/memory.max

# Run a memory-hungry process inside it
sudo bash -c 'echo $$ > /sys/fs/cgroup/demo-mem/cgroup.procs && \
  python3 -c "
import time
chunks = []
while True:
    chunks.append(b\"x\" * 10_000_000)  # 10 MB per iteration
    print(f\"Allocated {len(chunks) * 10} MB\")
    time.sleep(0.5)
"'

# Output:
# Allocated 10 MB
# Allocated 20 MB
# ...
# Allocated 90 MB
# Killed                 <-- OOM killer fires at ~100 MB
```

### Example 2: CPU throttling in action

```bash
# Create a cgroup with 25% of one CPU
sudo mkdir /sys/fs/cgroup/demo-cpu
echo "+cpu" | sudo tee /sys/fs/cgroup/cgroup.subtree_control
echo "25000 100000" | sudo tee /sys/fs/cgroup/demo-cpu/cpu.max

# Run a CPU burner
sudo bash -c 'echo $$ > /sys/fs/cgroup/demo-cpu/cgroup.procs && \
  python3 -c "
import time
start = time.time()
i = 0
while time.time() - start < 5:
    i += 1
print(f\"Iterations in 5s: {i}\")
"'

# Compare: same code without cgroup limit does ~4x more iterations
# Check throttle stats:
cat /sys/fs/cgroup/demo-cpu/cpu.stat
# nr_throttled 47
# throttled_usec 3750000   <-- 3.75 seconds throttled out of 5
```

### Example 3: Preventing fork bombs

```bash
# Create a cgroup that allows max 5 processes
sudo mkdir /sys/fs/cgroup/demo-pids
echo "+pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control
echo 5 | sudo tee /sys/fs/cgroup/demo-pids/pids.max

# Enter the cgroup and try to fork bomb
sudo bash -c 'echo $$ > /sys/fs/cgroup/demo-pids/cgroup.procs && \
  for i in $(seq 1 20); do
    sleep 100 &
    echo "Started background process $i (exit code: $?)"
  done'

# Output:
# Started background process 1 (exit code: 0)
# Started background process 2 (exit code: 0)
# Started background process 3 (exit code: 0)
# bash: fork: retry: Resource temporarily unavailable
# ...
```

### Example 4: Monitoring with Pressure Stall Information (PSI)

cgroup v2 provides PSI metrics — a measure of how much time tasks spend waiting for resources:

```bash
$ cat /sys/fs/cgroup/my-group/cpu.pressure
some avg10=45.02 avg60=38.91 avg300=21.56 total=982345621
full avg10=12.05 avg60=9.33 avg300=5.12 total=312456789

$ cat /sys/fs/cgroup/my-group/memory.pressure
some avg10=2.15 avg60=1.02 avg300=0.45 total=45678123
full avg10=0.00 avg60=0.00 avg300=0.00 total=0

$ cat /sys/fs/cgroup/my-group/io.pressure
some avg10=8.75 avg60=6.21 avg300=3.44 total=123456789
full avg10=5.12 avg60=3.88 avg300=2.01 total=89012345
```

- **some:** Percentage of time at least one task was stalled
- **full:** Percentage of time all tasks were stalled simultaneously

PSI is what powers Meta's oomd and systemd-oomd — they kill workloads based on sustained memory pressure rather than waiting for the hard OOM kill.

### Cleanup

```bash
# To remove a cgroup, first move all processes out, then rmdir
# (cannot rmdir a cgroup that still has processes)
$ cat /sys/fs/cgroup/demo-mem/cgroup.procs   # check for remaining PIDs
$ echo <pid> > /sys/fs/cgroup/cgroup.procs   # move to root
$ sudo rmdir /sys/fs/cgroup/demo-mem
```

## Summary

```
    +-------------------------------------------------------------------+
    |                    Linux cgroups Architecture                      |
    +-------------------------------------------------------------------+
    |                                                                    |
    |  Userspace                                                        |
    |  +--------------------+  +--------------------+                   |
    |  | Docker / Podman    |  | Kubernetes kubelet |                   |
    |  +--------+-----------+  +--------+-----------+                   |
    |           |                       |                               |
    |           v                       v                               |
    |  +----------------------------------------------------+          |
    |  |  /sys/fs/cgroup/ (cgroupfs - pseudo-filesystem)    |          |
    |  |  mkdir/rmdir = create/destroy cgroups               |          |
    |  |  echo/cat    = configure/read cgroup settings       |          |
    |  +------------------------+---------------------------+          |
    |                           |                                       |
    |  - - - - - - - - - - - - | - - - - - - - - - - - (kernel) - -   |
    |                           v                                       |
    |  +----------------------------------------------------+          |
    |  |              cgroup core (kernel/cgroup/)           |          |
    |  |  task_struct -> css_set -> cgroup_subsys_state      |          |
    |  +----+---------+---------+---------+---------+-------+          |
    |       |         |         |         |         |                   |
    |       v         v         v         v         v                   |
    |  +------+  +------+  +------+  +------+  +------+               |
    |  | cpu  |  | mem  |  |  io  |  | pids |  | cpuset|              |
    |  |ctrl  |  |ctrl  |  | ctrl |  | ctrl |  | ctrl  |              |
    |  +------+  +------+  +------+  +------+  +------+               |
    |                                                                   |
    +-------------------------------------------------------------------+
```

cgroups are one of the most impactful kernel features of the past two decades. They transformed Linux from a system where workloads could interfere with each other into one capable of running thousands of isolated containers on a single machine. Every time you run a Docker container, deploy a Kubernetes pod, or even log into a modern systemd-based desktop (which puts each user session in its own cgroup), you are using cgroups.

## References

1. cgroups v2 official documentation: [kernel.org/doc/Documentation/admin-guide/cgroup-v2.rst](https://www.kernel.org/doc/Documentation/admin-guide/cgroup-v2.rst)
2. Original cgroups (v1) documentation: [kernel.org/doc/Documentation/admin-guide/cgroup-v1/](https://www.kernel.org/doc/Documentation/admin-guide/cgroup-v1/)
3. Kernel source — cgroup core: [github.com/torvalds/linux/tree/master/kernel/cgroup](https://github.com/torvalds/linux/tree/master/kernel/cgroup)
4. Kernel source — memory controller: [github.com/torvalds/linux/blob/master/mm/memcontrol.c](https://github.com/torvalds/linux/blob/master/mm/memcontrol.c)
5. Kernel source — CFS bandwidth: [github.com/torvalds/linux/blob/master/kernel/sched/fair.c](https://github.com/torvalds/linux/blob/master/kernel/sched/fair.c)
6. LWN.net — "A brief history of control groups" (2018): [lwn.net/Articles/769500/](https://lwn.net/Articles/769500/)
7. LWN.net — "The unified control group hierarchy in 3.16" (2014): [lwn.net/Articles/601840/](https://lwn.net/Articles/601840/)
8. Meta's PSI documentation: [facebookmicrosites.github.io/psi/](https://facebookmicrosites.github.io/psi/)
9. systemd and cgroups: [systemd.io/CGROUP_DELEGATION/](https://systemd.io/CGROUP_DELEGATION/)
10. Docker runtime documentation — resource constraints: [docs.docker.com/config/containers/resource_constraints/](https://docs.docker.com/config/containers/resource_constraints/)
