---
author: JZ
pubDatetime: 2026-04-26T06:00:00Z
modDatetime: 2026-04-26T06:00:00Z
title: System Design - How Linux Containers Work Under the Hood
tags:
  - design-system
  - design-infrastructure
description:
  "How Linux containers work: namespaces for isolation, cgroups for resource limits, union filesystems for layered images, and how container runtimes like runc tie it all together."
---

## Table of contents

## Context

When you run `docker run nginx`, a fully isolated process appears in under a second. It has its own filesystem, its own network stack, its own PID 1 — and yet it shares the host kernel with every other container on the machine. No virtual machine was booted. No guest OS was loaded.

How is this possible?

Containers are not a single feature. They are an **assembly of three Linux kernel mechanisms** that, combined, create the illusion of a lightweight virtual machine:

```
  +-----------------------------------------------------+
  |                   Container                          |
  |                                                      |
  |  +---------------+  +---------------+  +-----------+ |
  |  |  Namespaces   |  |    cgroups    |  |  Union    | |
  |  |  (isolation)  |  |  (resource    |  |  FS       | |
  |  |               |  |   limits)     |  |  (image   | |
  |  |  - PID        |  |  - CPU        |  |   layers) | |
  |  |  - NET        |  |  - Memory     |  |           | |
  |  |  - MNT        |  |  - I/O        |  |           | |
  |  |  - UTS        |  |  - PIDs       |  |           | |
  |  |  - IPC        |  |               |  |           | |
  |  |  - USER       |  |               |  |           | |
  |  +---------------+  +---------------+  +-----------+ |
  +-----------------------------------------------------+
                          |
                   Linux Kernel (shared)
```

1. **Namespaces** make a process think it's alone on the machine.
2. **cgroups** prevent one process from starving the rest.
3. **Union filesystems** let containers share base layers while having their own writable layer.

A container runtime like `runc` (the OCI reference implementation) simply calls the right system calls to set up these three pieces, then `exec`s your process. Let's trace through each one.

## Namespaces: The Illusion of Isolation

A **namespace** wraps a global system resource so that processes inside the namespace see their own isolated instance of that resource. Think of it as a one-way mirror: the host can see everything, but each container only sees its own world.

Linux provides eight namespace types (as of kernel 5.6+):

```
  Namespace   Flag            What it isolates
  ---------   --------------  -----------------------------------
  PID         CLONE_NEWPID    Process IDs
  NET         CLONE_NEWNET    Network stack (interfaces, routes)
  MNT         CLONE_NEWNS     Mount points (filesystem tree)
  UTS         CLONE_NEWUTS    Hostname and domain name
  IPC         CLONE_NEWIPC    System V IPC, POSIX message queues
  USER        CLONE_NEWUSER   User and group IDs
  cgroup      CLONE_NEWCGROUP cgroup root directory
  time        CLONE_NEWTIME   Boot and monotonic clocks
```

### Creating namespaces: clone() and unshare()

There are two ways to enter a new namespace:

1. **`clone()`** — create a child process in new namespaces (used by container runtimes).
2. **`unshare()`** — move the current process into new namespaces (useful for experiments).

Here is what `runc` does, simplified. The container runtime calls `clone()` with namespace flags to create the container's init process:

```c
// Simplified from opencontainers/runc/libcontainer/nsenter
int flags = CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS |
            CLONE_NEWUTS | CLONE_NEWIPC | CLONE_NEWUSER;

pid_t child = clone(container_init, stack_top, flags | SIGCHLD, args);
```

After this call, the child process lives in fresh namespaces. It sees PID 1 (itself), an empty network stack, and a blank hostname — a clean slate.

### PID namespace: why your container has PID 1

The PID namespace is the easiest to visualize. Every container gets its own PID numbering starting from 1:

```
  Host PID namespace              Container PID namespace
  +---------------------------+   +---------------------------+
  |  PID 1: systemd           |   |  PID 1: nginx            |
  |  PID 245: dockerd         |   |  PID 2: nginx worker     |
  |  PID 3201: containerd     |   |  PID 3: nginx worker     |
  |  PID 4500: nginx (=PID 1) |   +---------------------------+
  |  PID 4501: worker (=PID 2)|
  |  PID 4502: worker (=PID 3)|
  +---------------------------+
```

The host sees the container's processes with host-level PIDs (4500, 4501, 4502). Inside the container, they are renumbered as 1, 2, 3. The mapping is maintained by the kernel — a process has **one** real PID but different visible PIDs depending on which namespace you observe from.

This is defined in [`kernel/pid.c`](https://github.com/torvalds/linux/blob/master/kernel/pid.c). Each process has a `struct pid` with an array of `pid_t` values, one per namespace level:

```c
struct pid {
    refcount_t count;
    unsigned int level;       // depth of namespace nesting
    struct upid numbers[];    // one entry per namespace level
};

struct upid {
    int nr;                   // the PID number in this namespace
    struct pid_namespace *ns; // which namespace this belongs to
};
```

When you call `getpid()` inside a container, the kernel returns `numbers[level].nr` — the PID in the innermost namespace the process belongs to.

### NET namespace: virtual networks

Each network namespace gets its own:
- Network interfaces (lo, eth0, etc.)
- Routing tables
- iptables rules
- `/proc/net` entries

When a container starts, it has only a loopback interface. The runtime creates a **veth pair** — a virtual ethernet cable with two ends:

```
  Host namespace                    Container namespace
  +--------------------+            +--------------------+
  |                    |            |                    |
  |   docker0 bridge   |            |    eth0            |
  |   172.17.0.1       |            |    172.17.0.2      |
  |        |           |            |        |           |
  |     vethXXXX ------+------------+---> veth (renamed) |
  |        |           |            |                    |
  +--------+-----------+            +--------------------+
           |
     host network stack
     (forwards to outside)
```

One end of the veth pair stays in the host namespace (attached to a bridge like `docker0`), and the other end is moved into the container's network namespace with `ip link set vethXXXX netns <pid>`. This is how containers get network connectivity while remaining isolated.

### You can try it yourself

You don't need Docker to experiment with namespaces. The `unshare` command is available on any Linux system:

```bash
# Create a process in a new PID and mount namespace
sudo unshare --pid --mount --fork bash

# Inside the new namespace:
echo $$          # PID 1
mount -t proc proc /proc
ps aux           # only shows processes in this namespace
hostname         # still the host's — we didn't use --uts
```

This is essentially what a container runtime does, just with more careful setup around mount points, networking, and security.

## cgroups: Resource Limits

Namespaces hide resources. **cgroups** (control groups) *limit* resources. Without cgroups, a container process could consume all CPU, memory, or I/O on the host, starving other containers and the host itself.

cgroups are exposed as a filesystem, typically mounted at `/sys/fs/cgroup`. You create a "control group" by making a directory, and you add processes to it by writing their PIDs to a file:

```
  /sys/fs/cgroup/
  +-- cpu/
  |   +-- docker/
  |       +-- <container-id>/
  |           +-- cpu.max          # CPU limit
  |           +-- cgroup.procs     # PIDs in this group
  +-- memory/
  |   +-- docker/
  |       +-- <container-id>/
  |           +-- memory.max       # memory limit
  |           +-- memory.current   # current usage
  +-- pids/
      +-- docker/
          +-- <container-id>/
              +-- pids.max         # max number of processes
              +-- pids.current     # current count
```

### How docker sets memory limits

When you run `docker run --memory=512m nginx`, Docker creates a cgroup and writes:

```bash
echo "536870912" > /sys/fs/cgroup/memory/docker/<id>/memory.max
```

That's 512 * 1024 * 1024 = 536,870,912 bytes. If the container tries to allocate beyond this, the kernel's OOM killer steps in.

### How CPU limits work

CPU limits use two values in cgroups v2: `cpu.max` contains `$QUOTA $PERIOD`. For example:

```bash
# Allow 50% of one CPU core (50ms every 100ms)
echo "50000 100000" > /sys/fs/cgroup/cpu/docker/<id>/cpu.max
```

The kernel scheduler enforces this: during each 100ms period, processes in this cgroup get at most 50ms of CPU time. After that, they are **throttled** — put to sleep until the next period begins.

```
  Time -->
  Period:    |------100ms------|------100ms------|
  Container: [==50ms==]........[==50ms==]........
              running  throttled running  throttled
```

This is why you sometimes see high `cpu.stat` throttle counts in containers — the application is trying to use more CPU than its cgroup allows.

### cgroups v1 vs v2

cgroups went through a major redesign:

```
  cgroups v1 (legacy)              cgroups v2 (unified)
  +------------------------+       +------------------------+
  | Separate hierarchies   |       | Single unified tree    |
  | per controller:        |       |                        |
  |   /sys/fs/cgroup/cpu/  |       |  /sys/fs/cgroup/       |
  |   /sys/fs/cgroup/mem/  |       |    +-- container-A/    |
  |   /sys/fs/cgroup/pids/ |       |    |   +-- cpu.max     |
  |                        |       |    |   +-- memory.max  |
  | A process can be in    |       |    |   +-- pids.max    |
  | different groups for   |       |    +-- container-B/    |
  | different controllers  |       |        +-- cpu.max     |
  +------------------------+       +------------------------+
```

v1 allowed a process to be in one cgroup for CPU and a *different* cgroup for memory, leading to confusing configurations. v2 enforces a single hierarchy: each process belongs to exactly one cgroup, and all controllers (CPU, memory, I/O, PIDs) apply to that one group. Most modern distributions now default to cgroups v2.

### The cgroup implementation in the kernel

The kernel-side implementation lives in [`kernel/cgroup/cgroup.c`](https://github.com/torvalds/linux/blob/master/kernel/cgroup/cgroup.c). Each cgroup is a `struct cgroup` that holds references to its controllers and child groups. When a process forks, the child inherits the parent's cgroup membership. The scheduler checks the cgroup's CPU quota before granting time slices, and the memory subsystem checks the cgroup's memory limit before allowing allocations.

```c
// Simplified from kernel/cgroup/cgroup.c
struct cgroup {
    struct cgroup_subsys_state self;
    struct cgroup *parent;
    struct kernfs_node *kn;       // sysfs directory
    struct list_head children;    // child cgroups
    struct cgroup_file procs_file; // cgroup.procs
    // ... per-controller state
};
```

## Union Filesystems: Layered Images

When you pull a Docker image, you don't download one giant filesystem. You download **layers** — each layer is a set of file changes stacked on top of the previous one. A union filesystem (also called an overlay filesystem) merges these layers into a single coherent view.

### How layers work

Consider a simple Dockerfile:

```dockerfile
FROM ubuntu:22.04         # Layer 1: base OS files
RUN apt-get install nginx # Layer 2: nginx binaries + deps
COPY nginx.conf /etc/     # Layer 3: your config file
```

Each instruction creates a layer. The final image is all three layers stacked:

```
  Container (running)
  +----------------------------------+
  |  Writable layer (container)      |  <-- copy-on-write
  +----------------------------------+
  |  Layer 3: COPY nginx.conf       |  read-only
  +----------------------------------+
  |  Layer 2: RUN apt-get install   |  read-only
  +----------------------------------+
  |  Layer 1: FROM ubuntu:22.04     |  read-only
  +----------------------------------+
```

All image layers are **read-only**. When a container starts, the runtime adds a thin **writable layer** on top. Any file modifications happen in this top layer using **copy-on-write**: the first time a container modifies a file from a lower layer, that file is copied up to the writable layer, and the modification happens there. The original layer is untouched.

### OverlayFS: the default storage driver

Modern Docker uses **OverlayFS** (specifically `overlay2`), which is built into the Linux kernel at [`fs/overlayfs/`](https://github.com/torvalds/linux/tree/master/fs/overlayfs). It takes four directories:

```
  OverlayFS mount
  +------------------------------------------+
  |                                          |
  |  merged/  (unified view - what the       |
  |            container sees)               |
  |                                          |
  +--+-----------+-----------+---------------+
     |           |           |
  upper/      work/      lower/
  (writable)  (internal) (read-only layers)
```

- **lowerdir**: the read-only image layers, stacked with `:` separators.
- **upperdir**: the writable container layer.
- **workdir**: a scratch directory OverlayFS uses internally for atomic operations.
- **merged**: the final unified view mounted into the container.

The mount command looks like:

```bash
mount -t overlay overlay \
  -o lowerdir=/var/lib/docker/overlay2/layer3:/var/lib/docker/overlay2/layer2:/var/lib/docker/overlay2/layer1,\
     upperdir=/var/lib/docker/overlay2/<container-id>/diff,\
     workdir=/var/lib/docker/overlay2/<container-id>/work \
  /var/lib/docker/overlay2/<container-id>/merged
```

### Copy-on-write in action

When a container reads `/etc/passwd`, OverlayFS checks the upper layer first. If the file isn't there, it falls through to the lower layers. This lookup is fast — the kernel caches directory entries.

When a container writes to `/etc/passwd`, the sequence is:

```
  1. Container writes to /etc/passwd
                |
                v
  2. OverlayFS: file not in upperdir?
                |
         yes    |    no
         |      |     |
         v      |     v
  3. Copy file  | 4. Write directly
     from lower |    to upperdir
     to upper   |
         |      |
         v      |
  5. Write to   |
     the copy   |
     in upper   |
```

This is why deleting a file in a container doesn't actually free space in the image layers. Instead, OverlayFS creates a **whiteout file** (a character device with 0/0 major/minor) in the upper layer that masks the lower-layer file from view.

### Why layers matter for efficiency

Layers enable massive sharing. If you have 100 containers all running `ubuntu:22.04`, the base layer exists **once** on disk. Each container only needs its own thin writable layer. This is why containers start in milliseconds — there's no OS image to copy:

```
                  On disk (shared)
                  +------------------+
                  | ubuntu:22.04     |  ~78 MB, stored once
                  +------------------+
                     /    |    \
                    /     |     \
  +---------+  +---------+  +---------+
  | upper A |  | upper B |  | upper C |   ~few KB each
  +---------+  +---------+  +---------+
  container A  container B  container C
```

## Container Runtimes: Tying It All Together

A container runtime orchestrates all three mechanisms. The OCI (Open Container Initiative) reference runtime is [`runc`](https://github.com/opencontainers/runc). Here is the sequence of events when you start a container:

```
  docker run nginx
       |
       v
  Docker daemon (dockerd)
       |
       v
  containerd (container lifecycle manager)
       |
       v
  runc create <container-id>
       |
       +---> 1. Read OCI config.json (namespace flags, cgroup limits,
       |        root filesystem path, environment, etc.)
       |
       +---> 2. Set up rootfs:
       |        - Mount OverlayFS (lower=image layers, upper=container layer)
       |        - Mount /proc, /sys, /dev inside the container
       |
       +---> 3. Create cgroup:
       |        - mkdir /sys/fs/cgroup/<container-id>
       |        - Write cpu.max, memory.max, pids.max
       |
       +---> 4. clone() with namespace flags:
       |        - CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | ...
       |        - Child process is born in new namespaces
       |
       +---> 5. Inside the child:
       |        - pivot_root() to the OverlayFS merged directory
       |        - Set hostname (UTS namespace)
       |        - Configure network (veth pair + bridge)
       |        - Drop capabilities, apply seccomp filter
       |        - exec() the container entrypoint (e.g., nginx)
       |
       v
  Container is running
```

The `config.json` is defined by the [OCI Runtime Specification](https://github.com/opencontainers/runtime-spec). Here is a fragment showing the namespace and cgroup configuration:

```json
{
  "linux": {
    "namespaces": [
      { "type": "pid" },
      { "type": "network" },
      { "type": "mount" },
      { "type": "uts" },
      { "type": "ipc" }
    ],
    "resources": {
      "memory": { "limit": 536870912 },
      "cpu": { "quota": 50000, "period": 100000 },
      "pids": { "limit": 100 }
    }
  }
}
```

### pivot_root vs chroot

You might wonder why runc uses `pivot_root()` instead of `chroot()`. The difference matters for security:

- **`chroot()`** changes the apparent root directory but the old root is still accessible. A sufficiently privileged process can escape.
- **`pivot_root()`** swaps the root filesystem entirely: the old root is moved to a mount point, then unmounted. There is no path back.

```c
// From runc/libcontainer/rootfs_linux.go (simplified)
func pivotRoot(rootfs string) error {
    // Bind-mount rootfs onto itself (required by pivot_root)
    mount(rootfs, rootfs, "", MS_BIND|MS_REC, "")

    // Create a directory for the old root
    pivotDir := filepath.Join(rootfs, ".pivot_root")
    os.Mkdir(pivotDir, 0700)

    // Swap root filesystems
    syscall.PivotRoot(rootfs, pivotDir)

    // Now inside the new root, unmount the old one
    syscall.Unmount("/.pivot_root", MNT_DETACH)
    os.Remove("/.pivot_root")
}
```

## Security: Containers Are Not VMs

Containers share the host kernel. This is their greatest strength (efficiency) and their greatest weakness (attack surface). A kernel exploit inside a container compromises the host.

Several mechanisms reduce this risk:

```
  Security Layer         What it does
  -------------------   -------------------------------------------
  Capabilities          Drop all but the minimum set (e.g., no
                        CAP_SYS_ADMIN, CAP_NET_RAW by default)

  Seccomp               Block dangerous syscalls (e.g., reboot,
                        kexec_load, mount) via BPF filter

  AppArmor / SELinux    Mandatory access control policies limit
                        file and network access

  User namespaces       Map container root (UID 0) to an
                        unprivileged host UID (e.g., 100000)

  Read-only rootfs      Mount the container filesystem as read-only;
                        writes only go to explicitly mounted volumes
```

The default Docker seccomp profile blocks over 40 syscalls. You can inspect it at [`moby/profiles/seccomp/default.json`](https://github.com/moby/moby/blob/master/profiles/seccomp/default.json). Each blocked syscall represents a potential privilege escalation that containers don't need.

## Putting It All Together

Here is a complete picture of a running container with all the pieces labeled:

```
  +----------------------------------------------------------------+
  |                         Host Machine                           |
  |                                                                |
  |  +--------------------------+  +--------------------------+    |
  |  |     Container A          |  |     Container B          |    |
  |  |                          |  |                          |    |
  |  |  PID ns: PID 1 = nginx  |  |  PID ns: PID 1 = redis  |    |
  |  |  NET ns: eth0 172.17.0.2|  |  NET ns: eth0 172.17.0.3|    |
  |  |  MNT ns: /merged-A      |  |  MNT ns: /merged-B      |    |
  |  |  UTS ns: hostname=web   |  |  UTS ns: hostname=cache  |    |
  |  |                          |  |                          |    |
  |  |  cgroup: 512MB mem       |  |  cgroup: 256MB mem       |    |
  |  |          50% CPU         |  |          25% CPU         |    |
  |  |          100 pids max    |  |          50 pids max     |    |
  |  |                          |  |                          |    |
  |  |  rootfs: overlay2        |  |  rootfs: overlay2        |    |
  |  |    lower: ubuntu layers  |  |    lower: alpine layers  |    |
  |  |    upper: container diff |  |    upper: container diff |    |
  |  +--------------------------+  +--------------------------+    |
  |           |          |                  |          |            |
  |       veth-A     seccomp            veth-B     seccomp         |
  |           |      filter                |       filter          |
  |           +-----+------+              +-----+------+           |
  |                 |                           |                   |
  |              docker0 bridge (172.17.0.1)                       |
  |                 |                                              |
  |           +-----+------+                                       |
  |           | Host kernel | (shared by all containers)           |
  |           |  - scheduler enforces cgroup CPU quotas            |
  |           |  - mm enforces cgroup memory limits                |
  |           |  - pid.c maintains namespace PID mappings          |
  |           |  - overlayfs merges filesystem layers              |
  |           +------------------------------------------------+   |
  +----------------------------------------------------------------+
```

No hypervisor, no guest OS, no hardware emulation. Just a regular Linux process that thinks it's alone — because the kernel is very good at pretending.

## References

1. Linux namespaces man page [`namespaces(7)`](https://man7.org/linux/man-pages/man7/namespaces.7.html)
2. Linux cgroups v2 documentation [`cgroup-v2.txt`](https://docs.kernel.org/admin-guide/cgroup-v2.html)
3. OverlayFS documentation [`overlayfs.rst`](https://docs.kernel.org/filesystems/overlayfs.html)
4. OCI Runtime Specification [spec](https://github.com/opencontainers/runtime-spec)
5. runc — OCI reference runtime [repo](https://github.com/opencontainers/runc)
6. Linux kernel PID implementation [`kernel/pid.c`](https://github.com/torvalds/linux/blob/master/kernel/pid.c)
7. Linux kernel cgroup implementation [`kernel/cgroup/cgroup.c`](https://github.com/torvalds/linux/blob/master/kernel/cgroup/cgroup.c)
8. Docker seccomp default profile [`default.json`](https://github.com/moby/moby/blob/master/profiles/seccomp/default.json)
9. What even is a container: namespaces and cgroups [blog](https://jvns.ca/blog/2016/10/10/what-even-is-a-container/)
10. Michael Kerrisk, Namespaces in operation [LWN series](https://lwn.net/Articles/531114/)
