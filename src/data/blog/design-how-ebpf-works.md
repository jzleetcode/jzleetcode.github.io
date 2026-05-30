---
author: JZ
pubDatetime: 2026-05-30T06:00:00Z
modDatetime: 2026-05-30T06:00:00Z
title: System Design - How eBPF Works
tags:
  - design-system
  - design-linux
description:
  "How eBPF works in the Linux kernel: architecture, program types, the verifier, JIT compilation, maps for state sharing, helper functions, and real-world use cases in observability, networking, and security."
---

## Table of contents

## Context

Imagine you want to add a feature to the Linux kernel — say, counting how many packets arrive on a network interface, or tracing every time a specific system call is invoked. Traditionally you had two choices:

1. **Modify the kernel source** — recompile, reboot, wait. Any bug you introduce can crash the entire machine.
2. **Write a loadable kernel module (LKM)** — faster iteration than a full rebuild, but still runs with full kernel privileges. A single off-by-one error can panic the system.

Both approaches are slow, dangerous, and require deep kernel expertise. What if we could run **safe, sandboxed programs inside the kernel** at near-native speed, without rebooting or risking stability?

That is exactly what **eBPF** (extended Berkeley Packet Filter) provides.

### Brief History

- **1992** — Steven McCanne and Van Jacobson created **BPF** (Berkeley Packet Filter) for efficient packet capture in BSD. It introduced a small virtual machine inside the kernel with a minimal instruction set. Linux adopted it for `tcpdump` and socket filters.
- **2014** — Alexei Starovoitov rewrote BPF from scratch in the Linux kernel (merged in Linux 3.15-3.18). The new version — **eBPF** — expanded the register set to 64-bit, added maps for persistent state, introduced a verifier for safety, and allowed attachment to many more kernel hook points beyond networking.
- **Today** — eBPF is used for observability (bpftrace, Pixie), networking (Cilium, Katran), and security (Falco, Tetragon) in production at scale.

## Architecture Overview

Here is the end-to-end flow from user-space source code to execution inside the kernel:

```
                         eBPF Architecture

  User Space                              Kernel Space
  ----------                              ------------

  +----------------+
  | BPF C program  |   (restricted C)
  | (hello.bpf.c)  |
  +-------+--------+
          |
          | clang -target bpf -O2
          v
  +----------------+
  | BPF bytecode   |   (ELF object file)
  | (hello.bpf.o)  |
  +-------+--------+
          |
          | bpf() syscall (BPF_PROG_LOAD)
          v
  +-------+--------+        +------------------+
  |    Loader      | -----> |    Verifier      |
  | (libbpf/cilium)|        | (safety checks)  |
  +----------------+        +--------+---------+
                                     |
                              pass?  | yes
                                     v
                            +--------+---------+
                            |   JIT Compiler   |
                            | (bytecode->x86)  |
                            +--------+---------+
                                     |
                                     v
                            +--------+---------+
                            |  Attach to Hook  |
                            +------------------+
                                     |
            +------------+-----------+----------+----------+
            |            |           |          |          |
            v            v           v          v          v
        +-------+   +--------+  +------+  +--------+  +-------+
        |kprobe |   |trace-  |  | XDP  |  |  TC    |  |cgroup |
        |       |   |point   |  |      |  |(traffic|  |       |
        +-------+   +--------+  +------+  | ctrl)  |  +-------+
                                           +--------+

  Hook points: where BPF programs execute in kernel context
```

Key components:

- **Compiler (clang/LLVM)** — compiles restricted C to BPF bytecode targeting the BPF instruction set.
- **Loader** — uses the `bpf()` system call to submit bytecode to the kernel.
- **Verifier** — statically analyzes the program to guarantee safety (no crashes, no infinite loops, bounded memory access).
- **JIT compiler** — translates verified bytecode to native machine instructions (x86, ARM, etc.) for near-native execution speed.
- **Hook points** — locations in the kernel where BPF programs can attach and execute.

## The BPF Instruction Set

eBPF defines a RISC-like instruction set with 64-bit registers:

```
  Registers
  ---------
  R0        return value from helpers / program exit code
  R1-R5     function arguments (caller-saved)
  R6-R9     callee-saved registers
  R10       read-only frame pointer (stack base)

  Stack: 512 bytes (fixed, per program invocation)
```

Each instruction is 64 bits wide (8 bytes):

```
  Bit 63        Bit 32  Bit 31    Bit 16  Bit 15  Bit 12  Bit 11  Bit 8   Bit 7     Bit 0
  +-------------+-------+---------+-------+-------+-------+-------+-------+-----------+
  |  immediate  |       | offset  |       |  src  |       |  dst  |       |  opcode   |
  |  (32 bits)  |       |(16 bits)|       |(4 bit)|       |(4 bit)|       | (8 bits)  |
  +-------------+-------+---------+-------+-------+-------+-------+-------+-----------+

  Layout (struct bpf_insn):
    __u8  code;        // opcode
    __u8  dst_reg:4;   // destination register
    __u8  src_reg:4;   // source register
    __s16 off;         // signed offset
    __s32 imm;         // signed immediate
```

### A Simple Bytecode Example

Consider this tiny BPF program that returns the value 42:

```c
int return_42() {
    return 42;
}
```

The compiled bytecode (two instructions):

```
  Instruction 0:  mov64 R0, 42       // BPF_ALU64 | BPF_MOV | BPF_K
                                      // opcode=0xb7, dst=R0, imm=42
  Instruction 1:  exit                // BPF_JMP | BPF_EXIT
                                      // opcode=0x95
```

The instruction set is defined in [`include/uapi/linux/bpf.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/bpf.h).

## The Verifier

The verifier is the gatekeeper that ensures no BPF program can crash or compromise the kernel. It runs **before** the program executes — this is purely static analysis at load time.

```
                     Verifier Flow

  +------------------+
  | BPF bytecode in  |
  +--------+---------+
           |
           v
  +--------+---------+
  | 1. CFG analysis  |   Build control-flow graph
  |    (DAG check)   |   Reject if back-edges found (no loops*)
  +--------+---------+
           |
           v
  +--------+---------+
  | 2. Walk every    |   Explore all paths through the program
  |    path          |   Track register state at each instruction
  +--------+---------+
           |
           v
  +--------+---------+
  | 3. Type/bounds   |   - Is R1 a valid pointer or scalar?
  |    checking      |   - Is memory access within bounds?
  |                  |   - Are map lookups NULL-checked?
  +--------+---------+
           |
           v
  +--------+---------+
  | 4. Stack depth   |   Max 512 bytes, no overflow
  |    check         |
  +--------+---------+
           |
           v
  +--------+---------+     +--------+
  | 5. Complexity    | --> | REJECT |  if instruction count > 1M
  |    limit         |     +--------+  or states exceed limit
  +--------+---------+
           |
           | all checks pass
           v
  +--------+---------+
  |   ACCEPT         |
  +------------------+

  * Since Linux 5.3, bounded loops are allowed if the verifier
    can prove termination (e.g., for-loops with known bounds).
```

Key safety properties enforced:

- **No unbounded loops** — guarantees termination.
- **No out-of-bounds memory access** — every pointer dereference is bounds-checked.
- **No reading uninitialized memory** — registers and stack must be written before read.
- **Pointer arithmetic restrictions** — you cannot cast arbitrary integers to pointers.
- **NULL checks after map lookups** — `bpf_map_lookup_elem()` can return NULL; you must check.

The verifier tracks a **state** for each register (type, min/max value, alignment) as it simulates execution along every possible path. If any path leads to an unsafe state, the program is rejected.

Source: [`kernel/bpf/verifier.c`](https://github.com/torvalds/linux/blob/master/kernel/bpf/verifier.c) — this is one of the most complex files in the kernel (~20,000+ lines).

## JIT Compilation

After the verifier approves a program, the kernel can **JIT compile** (Just-In-Time) the BPF bytecode into native machine instructions. This eliminates the overhead of interpreting bytecode at runtime.

```
  BPF bytecode                    x86-64 native code
  -------------                   -------------------
  mov64 R0, 42                    mov rax, 42
  exit                            ret

  (simplified; actual JIT handles calling conventions,
   prologue/epilogue, and register mapping)
```

Performance impact:

| Mode         | Overhead vs native |
|--------------|--------------------|
| Interpreter  | ~1.5-2x slower     |
| JIT compiled | ~1.0-1.1x (near native) |

The JIT is enabled by default on modern kernels (`net.core.bpf_jit_enable = 1`). Each architecture has its own JIT backend:

- x86-64: [`arch/x86/net/bpf_jit_comp.c`](https://github.com/torvalds/linux/blob/master/arch/x86/net/bpf_jit_comp.c)
- ARM64: [`arch/arm64/net/bpf_jit_comp.c`](https://github.com/torvalds/linux/blob/master/arch/arm64/net/bpf_jit_comp.c)

The JIT maps BPF registers to hardware registers. On x86-64 for example:

```
  BPF Register    x86-64 Register
  ------------    ---------------
  R0              rax
  R1              rdi
  R2              rsi
  R3              rdx
  R4              rcx
  R5              r8
  R6              rbx
  R7              r13
  R8              r14
  R9              r15
  R10 (fp)        rbp
```

## BPF Maps

BPF programs execute in kernel context and are event-driven — they run, do their work, and return. But what if you need to accumulate data across invocations (e.g., counting packets) or share data between the BPF program and user space?

**BPF Maps** solve this. They are key-value data structures that live in kernel memory and are accessible from both BPF programs (in kernel) and user-space applications (via the `bpf()` syscall).

```
  User Space                         Kernel Space
  ----------                         ------------

  +------------------+               +------------------+
  | User application |               | BPF program      |
  | (Python/Go/C)   |               | (runs at hook)   |
  +--------+---------+               +--------+---------+
           |                                  |
           | bpf(BPF_MAP_LOOKUP_ELEM)         | bpf_map_lookup_elem()
           | bpf(BPF_MAP_UPDATE_ELEM)         | bpf_map_update_elem()
           |                                  |
           v                                  v
           +----------------------------------+
           |           BPF Map               |
           |   (lives in kernel memory)      |
           |                                 |
           |   key (bytes) --> value (bytes)  |
           +---------------------------------+
```

### Common Map Types

| Map Type          | Description                                         |
|-------------------|-----------------------------------------------------|
| `BPF_MAP_TYPE_HASH`       | General-purpose hash table                 |
| `BPF_MAP_TYPE_ARRAY`      | Fixed-size array, O(1) lookup by index     |
| `BPF_MAP_TYPE_RINGBUF`    | Efficient single-producer ring buffer      |
| `BPF_MAP_TYPE_LRU_HASH`   | Hash table with LRU eviction               |
| `BPF_MAP_TYPE_PERCPU_HASH`| Per-CPU hash (no locking needed)           |
| `BPF_MAP_TYPE_PERCPU_ARRAY`| Per-CPU array                             |
| `BPF_MAP_TYPE_PERF_EVENT_ARRAY` | For streaming events to user space   |

Maps are created with specified key size, value size, and max entries. The kernel manages memory allocation and concurrency (using RCU or per-CPU copies depending on map type).

Source: [`kernel/bpf/hashtab.c`](https://github.com/torvalds/linux/blob/master/kernel/bpf/hashtab.c), [`kernel/bpf/arraymap.c`](https://github.com/torvalds/linux/blob/master/kernel/bpf/arraymap.c), [`kernel/bpf/ringbuf.c`](https://github.com/torvalds/linux/blob/master/kernel/bpf/ringbuf.c).

## Helper Functions

BPF programs run in a restricted environment — they cannot call arbitrary kernel functions. Instead, they call a fixed set of **helper functions** exposed by the kernel. These are the BPF program's API to interact with the outside world.

Each helper has a well-defined prototype and is called using a stable function ID:

```c
// From include/uapi/linux/bpf.h (simplified)
enum bpf_func_id {
    BPF_FUNC_map_lookup_elem     = 1,
    BPF_FUNC_map_update_elem     = 2,
    BPF_FUNC_map_delete_elem     = 3,
    BPF_FUNC_probe_read          = 4,
    BPF_FUNC_ktime_get_ns        = 5,
    BPF_FUNC_get_current_pid_tgid = 14,
    BPF_FUNC_get_current_comm    = 16,
    BPF_FUNC_perf_event_output   = 25,
    BPF_FUNC_ringbuf_output      = 130,
    // ... hundreds more
};
```

### Key Helpers

| Helper                          | Purpose                                    |
|---------------------------------|--------------------------------------------|
| `bpf_map_lookup_elem(map, key)` | Look up a value in a map by key           |
| `bpf_map_update_elem(map, key, val, flags)` | Insert or update a map entry  |
| `bpf_probe_read(dst, size, src)` | Safely read kernel memory into BPF stack  |
| `bpf_probe_read_user(dst, size, src)` | Safely read user-space memory        |
| `bpf_get_current_pid_tgid()`    | Get current process PID and TGID          |
| `bpf_get_current_comm(buf, size)` | Get current process name (comm)         |
| `bpf_ktime_get_ns()`            | Get monotonic clock in nanoseconds        |
| `bpf_perf_event_output(ctx, map, flags, data, size)` | Send event to user space |
| `bpf_ringbuf_output(ringbuf, data, size, flags)` | Write to ring buffer       |
| `bpf_trace_printk(fmt, ...)`    | Debug print to `/sys/kernel/debug/tracing/trace_pipe` |

The verifier checks that each helper call matches the expected argument types (e.g., argument 1 must be a map pointer, argument 2 must point to a memory region of at least `key_size` bytes).

Source: [`kernel/bpf/helpers.c`](https://github.com/torvalds/linux/blob/master/kernel/bpf/helpers.c), [`net/core/filter.c`](https://github.com/torvalds/linux/blob/master/net/core/filter.c) (networking helpers).

## Program Types and Attach Points

Not all BPF programs are the same. The **program type** determines what context the program receives, which helpers it can call, and where it can attach.

```
  +---------------------+-------------------------------------------+
  | Program Type        | Attach Point / Use Case                   |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_XDP   | Network device ingress (earliest hook).   |
  |                     | Decisions: pass, drop, redirect, tx.      |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Classifier hook in Traffic Control.       |
  | SCHED_CLS (TC)      | Runs after XDP; can modify packets.       |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to kprobes (any kernel function    |
  | KPROBE              | entry/exit). Used for tracing.            |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to static tracepoints defined in   |
  | TRACEPOINT          | the kernel (e.g., syscall enter/exit).    |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to socket operations. Filter or    |
  | SOCKET_FILTER       | observe packets on a socket.              |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to cgroup hooks. Control resource   |
  | CGROUP_SKB          | access, network policy per container.     |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to perf events (CPU cycles, cache  |
  | PERF_EVENT          | misses, etc.) for profiling.              |
  +---------------------+-------------------------------------------+
  | BPF_PROG_TYPE_      | Attach to Linux Security Module hooks.    |
  | LSM                 | Implement custom security policies.       |
  +---------------------+-------------------------------------------+
```

Each program type receives a **context struct** as its first argument (R1). For example:
- XDP programs get `struct xdp_md *ctx` (packet data pointers).
- Kprobe programs get `struct pt_regs *ctx` (CPU register state).
- Tracepoint programs get the tracepoint-specific struct.

## A Complete Example: Tracing Syscalls

Let's walk through a complete BPF program that counts system calls per process (by PID) using a hash map.

### Step 1: The BPF Program (kernel side)

```c
// syscall_count.bpf.c
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

// Define a hash map: key = PID (u32), value = count (u64)
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u32);
    __type(value, __u64);
} syscall_counts SEC(".maps");

// This program attaches to the raw_syscalls:sys_enter tracepoint.
// It fires on EVERY system call made by any process.
SEC("tracepoint/raw_syscalls/sys_enter")
int count_syscalls(void *ctx)
{
    // Get the current process's PID (lower 32 bits of pid_tgid)
    __u32 pid = bpf_get_current_pid_tgid() >> 32;

    // Look up existing count for this PID
    __u64 *count = bpf_map_lookup_elem(&syscall_counts, &pid);

    if (count) {
        // PID already seen: increment
        __sync_fetch_and_add(count, 1);
    } else {
        // First syscall from this PID: initialize to 1
        __u64 init_val = 1;
        bpf_map_update_elem(&syscall_counts, &pid, &init_val, BPF_ANY);
    }

    return 0;
}

char LICENSE[] SEC("license") = "GPL";
```

Key points:
- `SEC(".maps")` tells the loader this is a map definition.
- `SEC("tracepoint/raw_syscalls/sys_enter")` specifies the attach point.
- `bpf_get_current_pid_tgid()` returns a 64-bit value: upper 32 bits = TGID (what user space calls PID), lower 32 bits = kernel TID.
- We must NULL-check the result of `bpf_map_lookup_elem` — the verifier enforces this.

### Step 2: Compile to BPF bytecode

```bash
clang -target bpf -O2 -g -c syscall_count.bpf.c -o syscall_count.bpf.o
```

This produces an ELF object file containing BPF bytecode in the appropriate sections.

### Step 3: User-space loader (reads results)

```c
// loader.c (simplified, using libbpf)
#include <bpf/libbpf.h>
#include <bpf/bpf.h>
#include <stdio.h>
#include <unistd.h>

int main() {
    struct bpf_object *obj;
    int prog_fd, map_fd;

    // Open and load the BPF object file
    obj = bpf_object__open_file("syscall_count.bpf.o", NULL);
    bpf_object__load(obj);

    // Find and attach the program
    struct bpf_program *prog = bpf_object__find_program_by_name(obj, "count_syscalls");
    struct bpf_link *link = bpf_program__attach(prog);

    // Get the map file descriptor
    map_fd = bpf_object__find_map_fd_by_name(obj, "syscall_counts");

    // Every 2 seconds, dump the top syscall counts
    while (1) {
        sleep(2);
        __u32 key, next_key;
        __u64 value;

        printf("\n--- Syscall counts by PID ---\n");
        key = 0;
        while (bpf_map_get_next_key(map_fd, &key, &next_key) == 0) {
            bpf_map_lookup_elem(map_fd, &next_key, &value);
            printf("  PID %u: %llu syscalls\n", next_key, value);
            key = next_key;
        }
    }

    bpf_link__destroy(link);
    bpf_object__close(obj);
    return 0;
}
```

### Step 4: What happens at runtime

```
  +-------------------+                    +-------------------+
  | Any process       |                    | loader.c          |
  | (e.g., ls, cat)   |                    | (user space)      |
  +--------+----------+                    +--------+----------+
           |                                        |
           | syscall (open, read, write...)         |
           v                                        |
  +--------+------------------------------------------+---------+
  |                    KERNEL                                    |
  |                                                             |
  |  tracepoint: raw_syscalls/sys_enter fires                   |
  |       |                                                     |
  |       v                                                     |
  |  +----+------------------+          +-----------+           |
  |  | count_syscalls (BPF)  | -------> | hash map  | <---------+
  |  | get PID, increment    |  update  | pid->count|   lookup   |
  |  +-----------------------+          +-----------+           |
  +-------------------------------------------------------------+
```

## Real-World Use Cases

eBPF has become foundational infrastructure in modern Linux deployments:

### Networking: Cilium

[Cilium](https://cilium.io/) replaces traditional iptables-based networking in Kubernetes with eBPF programs attached at XDP and TC hooks. Benefits:
- O(1) packet processing (BPF hash maps) vs. O(n) iptables rule chains.
- Load balancing (service mesh) without sidecar proxies.
- Network policy enforcement at the kernel level.

### Load Balancing: Katran

[Katran](https://github.com/facebookincubator/katran) (Meta) is an XDP-based L4 load balancer that handles millions of packets per second per core. By processing packets at the XDP hook (before the network stack allocates sk_buff), it achieves exceptional throughput with minimal CPU overhead.

### Observability: bcc and bpftrace

[bcc](https://github.com/iovisor/bcc) provides Python/Lua frontends for writing BPF tracing tools. [bpftrace](https://github.com/bpftrace/bpftrace) is a higher-level tracing language (like DTrace for Linux):

```bash
# Count syscalls by process name (one-liner)
bpftrace -e 'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }'

# Histogram of read() latencies
bpftrace -e 'kprobe:vfs_read { @start[tid] = nsecs; }
             kretprobe:vfs_read /@start[tid]/ {
               @us = hist((nsecs - @start[tid]) / 1000);
               delete(@start[tid]);
             }'
```

### Security: Falco and Tetragon

[Falco](https://falco.org/) (CNCF) uses eBPF to monitor system calls in real time and detect anomalous behavior (e.g., a container spawning an unexpected shell, sensitive file access). [Tetragon](https://github.com/cilium/tetragon) (Cilium) provides kernel-level security observability and enforcement using LSM and kprobe BPF programs.

### Profiling: Continuous profiling

Tools like [Pyroscope](https://pyroscope.io/) and [Parca](https://parca.dev/) use `BPF_PROG_TYPE_PERF_EVENT` programs to collect stack traces with minimal overhead — enabling always-on CPU profiling in production.

## Summary

```
  +-------+    compile     +---------+   load    +----------+
  | C src | ------------> | bytecode | -------> | verifier |
  +-------+    clang/LLVM +---------+   bpf()  +----+-----+
                                                     |
                                                pass | reject
                                                     v
                              +----------+     +-----+-----+
                              |  native  | <-- |    JIT    |
                              |   code   |     +-----------+
                              +----+-----+
                                   |
                                   v
                              attach to hook
                              (kprobe, XDP, tracepoint, ...)
                                   |
                                   v
                              +----+-----+
                              | BPF maps | <--- user space reads/writes
                              +----------+
```

eBPF gives you a **safe, fast, and flexible** way to extend kernel behavior without modifying kernel source or loading risky modules. The verifier ensures safety, the JIT ensures performance, and maps provide the communication channel between kernel and user space. This combination has made eBPF one of the most important Linux innovations of the past decade.

## References

- [eBPF official documentation](https://ebpf.io/) — comprehensive introduction and reference.
- [BPF verifier source](https://github.com/torvalds/linux/blob/master/kernel/bpf/verifier.c) — the full verifier implementation.
- [BPF helpers source](https://github.com/torvalds/linux/blob/master/kernel/bpf/helpers.c) — core helper functions.
- [BPF hash map source](https://github.com/torvalds/linux/blob/master/kernel/bpf/hashtab.c) — hash map implementation.
- [x86 JIT compiler](https://github.com/torvalds/linux/blob/master/arch/x86/net/bpf_jit_comp.c) — x86-64 JIT backend.
- [BPF instruction set](https://github.com/torvalds/linux/blob/master/include/uapi/linux/bpf.h) — instruction definitions and program types.
- [Cilium documentation](https://docs.cilium.io/) — eBPF-based Kubernetes networking.
- [bpftrace reference guide](https://github.com/bpftrace/bpftrace/blob/master/docs/reference_guide.md) — high-level tracing language.
- [BPF Performance Tools (Brendan Gregg)](https://www.brendangregg.com/bpf-performance-tools-book.html) — the definitive book on BPF for observability.
