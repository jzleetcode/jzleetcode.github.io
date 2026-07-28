---
author: JZ
pubDatetime: 2026-07-28T06:00:00Z
modDatetime: 2026-07-28T06:00:00Z
title: System Design - How Linux System Calls Work
tags:
  - design-system
  - design-concurrency
description:
  "How Linux system calls work: the x86-64 syscall instruction, kernel entry/exit, the syscall dispatch table, vDSO optimization, and a source code walkthrough from the Linux kernel."
---

## Table of contents

## Context — Why System Calls Exist

Your C program runs in **user mode**. It can do arithmetic, access its own memory, branch and loop — but it cannot touch hardware directly. It cannot read a file from disk, send a packet over the network, or even ask what time it is. All of these require the kernel's help.

This is not an accident. It is the most fundamental security boundary in a modern operating system. The CPU enforces it in hardware through **privilege levels** (also called protection rings on x86):

```
  +-----------------------------------------------+
  |              Ring 3 (User Mode)                |
  |                                                |
  |   Your application code runs here.             |
  |   Cannot execute privileged instructions.      |
  |   Cannot access kernel memory.                 |
  |                                                |
  |   +-----------------------------------------+ |
  |   |          Ring 0 (Kernel Mode)           | |
  |   |                                         | |
  |   |   Full access to hardware, all memory,  | |
  |   |   privileged instructions (IN/OUT,      | |
  |   |   MOV to CR3, WRMSR, HLT, etc.)        | |
  |   |                                         | |
  |   +-----------------------------------------+ |
  +-----------------------------------------------+

  (Rings 1 and 2 exist on x86 but are unused by Linux)
```

A **system call** (syscall) is the controlled gateway between these two worlds. It is like a function call, but instead of jumping to another address in your own code, it transitions the CPU from Ring 3 to Ring 0, executes kernel code on your behalf, then returns you safely to Ring 3. The kernel validates every argument, checks permissions, and ensures one process cannot corrupt another.

Linux on x86-64 defines about 450 system calls (as of kernel 6.x). Every I/O operation, every process creation, every memory mapping goes through one of them.

## The syscall Instruction — What the CPU Does

On x86-64, the `syscall` instruction is the fast path into the kernel. Before `syscall` existed, the older `int 0x80` mechanism required an interrupt descriptor table lookup, which was slower. Intel and AMD introduced `syscall`/`sysret` specifically to make the user-to-kernel transition cheaper.

Here is what the CPU does in hardware when it executes `syscall`:

```
  User Mode (Ring 3)                        Kernel Mode (Ring 0)
  ==================                        ====================

  1. User sets up:
     RAX = syscall number
     RDI = arg1
     RSI = arg2
     RDX = arg3
     R10 = arg4
     R8  = arg5
     R9  = arg6

  2. Execute: syscall
     +-----------------------------+
     | CPU microcode does:         |
     |                             |
     | RCX <- RIP  (save return)   |
     | R11 <- RFLAGS (save flags)  |
     | RIP <- IA32_LSTAR MSR       |
     | CS  <- IA32_STAR[47:32]     |  (kernel code segment)
     | SS  <- IA32_STAR[47:32]+8   |  (kernel stack segment)
     | RFLAGS &= ~IA32_FMASK      |  (clear IF, etc.)
     | CPL <- 0                    |  (now in Ring 0!)
     +-----------------------------+
                    |
                    v
  3. Execution continues at address in LSTAR MSR
     (this is entry_SYSCALL_64 in the kernel)
```

Key points:

- **RCX** saves the return address (the instruction after `syscall` in userspace). This is why the C calling convention uses R10 instead of RCX for the 4th argument to syscalls.
- **R11** saves RFLAGS so the kernel can restore flags on return.
- **LSTAR MSR** (Model Specific Register 0xC0000082) holds the kernel entry point address. The kernel writes this during boot in [`syscall_init()`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/cpu/common.c).
- **No stack switch happens yet** — that is the kernel's first job after getting control.

## Kernel Entry — entry_SYSCALL_64

The CPU now jumps to the address stored in LSTAR. On Linux, this is the function `entry_SYSCALL_64` defined in assembly:

Source: [`arch/x86/entry/entry_64.S`](https://github.com/torvalds/linux/blob/master/arch/x86/entry/entry_64.S)

```asm
SYM_CODE_START(entry_SYSCALL_64)
    /* Switch to kernel stack. RSP currently points to user stack! */
    swapgs                          /* Load kernel GS base (per-CPU data) */
    movq    %rsp, PER_CPU_VAR(cpu_tss_rw + TSS_sp2)  /* save user RSP */
    movq    PER_CPU_VAR(pcpu_hot + X86_top_of_stack), %rsp  /* kernel stack */

    /* Build pt_regs on the kernel stack */
    pushq   $__USER_DS              /* ss */
    pushq   PER_CPU_VAR(cpu_tss_rw + TSS_sp2)  /* user rsp */
    pushq   %r11                    /* rflags (saved by CPU in R11) */
    pushq   $__USER_CS              /* cs */
    pushq   %rcx                    /* rip (saved by CPU in RCX) */
    pushq   %rax                    /* orig_rax = syscall number */

    /* Push all general-purpose registers */
    PUSH_AND_CLEAR_REGS rax=%rax

    /* Now we have a complete pt_regs frame on the stack */
    movq    %rsp, %rdi              /* arg1 to C handler = pt_regs* */
    movq    %rax, %rsi              /* arg2 = syscall number */
    call    do_syscall_64
    ...
```

The key steps:

1. **swapgs** — switches the GS segment base from user to kernel, giving access to per-CPU data structures (including the kernel stack pointer).
2. **Stack switch** — the user RSP is saved; RSP is loaded with the kernel stack top for this thread.
3. **Build pt_regs** — push all registers onto the kernel stack in a defined layout. This is the snapshot of userspace state that will be restored on return.

### pt_regs Stack Layout

After the pushes complete, the kernel stack looks like this:

```
  High addresses (stack grows down)
  +------------------+  <-- top of kernel stack
  |       ss         |  } saved segment registers
  +------------------+
  |      rsp         |  } user stack pointer
  +------------------+
  |     rflags       |  } from R11
  +------------------+
  |       cs         |  } user code segment
  +------------------+
  |      rip         |  } return address (from RCX)
  +------------------+
  |    orig_rax      |  } syscall number
  +------------------+
  |      rax         |  }
  +------------------+  }
  |      rbx         |  }
  +------------------+  }
  |      rcx         |  }
  +------------------+  }  General purpose registers
  |      rdx         |  }  (struct pt_regs)
  +------------------+  }
  |      rsi         |  }
  +------------------+  }
  |      rdi         |  }
  +------------------+  }
  |      rbp         |  }
  +------------------+  }
  |    r8 - r15      |  }
  +------------------+  <-- RSP (current stack pointer)
  Low addresses
```

This structure is defined in [`arch/x86/include/asm/ptrace.h`](https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/ptrace.h) as `struct pt_regs`.

## The Syscall Table — Dispatching by Number

The C function `do_syscall_64` receives the pt_regs pointer and the syscall number. Its job is simple: look up the handler in a table and call it.

Source: [`arch/x86/entry/syscall_64.c`](https://github.com/torvalds/linux/blob/master/arch/x86/entry/common.c)

```c
__visible noinstr void do_syscall_64(struct pt_regs *regs, int nr)
{
    add_random_kstack_offset();
    nr = syscall_enter_from_user_mode(regs, nr);

    if (likely(nr < NR_syscalls)) {
        nr = array_index_nospec(nr, NR_syscalls);
        regs->ax = sys_call_table[nr](regs);
    } else {
        regs->ax = __x64_sys_ni_syscall(regs);
    }

    syscall_exit_to_user_mode(regs);
}
```

The **sys_call_table** is an array of function pointers, indexed by syscall number:

```c
/* Generated from arch/x86/entry/syscalls/syscall_64.tbl */
const sys_call_table_t sys_call_table[NR_syscalls] = {
    [0]   = __x64_sys_read,
    [1]   = __x64_sys_write,
    [2]   = __x64_sys_open,
    [3]   = __x64_sys_close,
    ...
    [435] = __x64_sys_cachestat,
};
```

The syscall numbers are stable ABI — they never change once assigned. The mapping is defined in [`arch/x86/entry/syscalls/syscall_64.tbl`](https://github.com/torvalds/linux/blob/master/arch/x86/entry/syscalls/syscall_64.tbl).

Each handler function is defined using the `SYSCALL_DEFINE` macro family from [`include/linux/syscalls.h`](https://github.com/torvalds/linux/blob/master/include/linux/syscalls.h):

```c
SYSCALL_DEFINE3(write, unsigned int, fd, const char __user *, buf, size_t, count)
{
    return ksys_write(fd, buf, count);
}
```

The macro handles extracting arguments from pt_regs (since all handlers now receive a single `struct pt_regs *` argument for Spectre mitigation). See [`arch/x86/include/asm/syscall_wrapper.h`](https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/syscall_wrapper.h) for the gory details.

### Why array_index_nospec?

Notice `array_index_nospec(nr, NR_syscalls)`. This is a Spectre v1 mitigation. Without it, speculative execution could access out-of-bounds entries in the syscall table if a branch predictor mispredicts the bounds check. The function clamps the index to zero if it would be out of range, defeating speculative out-of-bounds loads.

## A Concrete Example — Tracing write(1, "hello", 5)

Let's follow a `printf("hello")` from userspace all the way through the kernel and back.

```
  User Program          glibc               CPU              Kernel
  ============         ======              =====            ========

  printf("hello")
       |
       v
  write(1,"hello",5)
       |
       v
  glibc wrapper:
    mov $1, %eax       (syscall # for write)
    mov $1, %edi       (fd = stdout)
    lea "hello", %rsi  (buf pointer)
    mov $5, %edx       (count)
    syscall  ---------> CPU transitions:
                        RCX = return addr
                        R11 = RFLAGS
                        RIP = LSTAR
                        CPL = 0
                              |
                              v
                        entry_SYSCALL_64:
                          swapgs
                          switch stack
                          push pt_regs
                          call do_syscall_64
                              |
                              v
                        do_syscall_64:
                          sys_call_table[1] -> __x64_sys_write
                              |
                              v
                        ksys_write(1, "hello", 5):
                          fd = fdget(1)        // get file struct
                          file->f_op->write()  // call tty driver
                          copy_from_user()     // safe copy from userspace
                          // ... hardware writes to terminal ...
                          return 5             // bytes written
                              |
                              v
                        regs->ax = 5          // return value in RAX
                        syscall_exit_to_user_mode(regs)
                              |
                              v
                        sysretq  <---------- CPU transitions:
                                              RIP = RCX (saved return addr)
                                              RFLAGS = R11
                                              CPL = 3 (back to Ring 3!)
                              |
                              v
  glibc wrapper:
    check %rax          (5 = success, wrote 5 bytes)
    return 5
       |
       v
  printf returns
```

The glibc wrapper is thin — it shuffles arguments into the right registers (note: the 4th arg goes in R10, not RCX, because the CPU clobbers RCX), executes `syscall`, and checks the return value. If RAX is between -4096 and -1, it is an error; glibc negates it and stores it in `errno`.

## Return to Userspace — sysretq vs. iretq

The kernel has two ways to return to userspace:

**sysretq** (fast path):
- Restores RIP from RCX, RFLAGS from R11
- Sets CPL back to 3
- Very fast (~20 cycles)
- But has constraints: cannot return to non-canonical addresses, must restore exact RFLAGS

**iretq** (slow path):
- Pops RIP, CS, RFLAGS, RSP, SS from the stack
- More general, works for any return scenario
- Used when returning to 32-bit code, after signals, or when ptrace is active
- Costs ~40-80 more cycles

The kernel prefers `sysretq` when possible. The decision is in the exit path of `entry_SYSCALL_64`:

```asm
SYM_INNER_LABEL(entry_SYSCALL_64_after_hwframe, SYM_L_GLOBAL)
    /* ... restore registers from pt_regs ... */

    /* Can we use sysretq? */
    testq   $(SYSCALL_WORK_FLAGS), TASK_TI_flags(%r11)
    jnz     swapgs_restore_regs_and_return_to_usermode  /* slow path: iretq */

    /* Fast path: sysretq */
    POP_REGS
    movq    RCX(%rsp), %rcx    /* restore return address */
    movq    R11(%rsp), %r11    /* restore RFLAGS */
    movq    RSP(%rsp), %rsp    /* restore user stack */
    swapgs
    sysretq
```

There is a subtle hardware bug on some Intel CPUs: if RCX contains a non-canonical address (e.g., from a signal trampoline at a high address), `sysretq` will #GP fault *in kernel mode* but with user-controlled RIP. This is a security risk, so the kernel validates RCX before using `sysretq` and falls back to `iretq` when needed.

## vDSO — Avoiding the Syscall Entirely

Some system calls are read-only and called extremely frequently. `gettimeofday()` and `clock_gettime()` are the classic examples — applications might call them millions of times per second (think: logging timestamps, profiling, database transaction ordering).

For these, the full syscall overhead (~100ns) is wasteful. The kernel provides a clever optimization: the **vDSO** (virtual Dynamic Shared Object).

```
  Process Virtual Address Space
  +------------------------------------------+
  |  0x000... - 0x7FF...  (user space)       |
  |                                          |
  |  +------------------------------------+  |
  |  |  Program code (.text)              |  |
  |  +------------------------------------+  |
  |  |  Heap                              |  |
  |  +------------------------------------+  |
  |  |  ...                               |  |
  |  +------------------------------------+  |
  |  |  Stack                             |  |
  |  +------------------------------------+  |
  |  |  vDSO (mapped by kernel)           |  |  <-- kernel code, readable
  |  |  +------------------------------+  |  |      from Ring 3!
  |  |  | __vdso_clock_gettime()       |  |  |
  |  |  | __vdso_gettimeofday()        |  |  |
  |  |  | __vdso_time()                |  |  |
  |  |  +------------------------------+  |  |
  |  |  vvar (mapped by kernel)           |  |  <-- kernel data page,
  |  |  +------------------------------+  |  |      read-only to user
  |  |  | struct vdso_data {            |  |  |
  |  |  |   seq_count                   |  |  |
  |  |  |   clock_mode                  |  |  |
  |  |  |   cycle_last                  |  |  |
  |  |  |   mult, shift                 |  |  |
  |  |  |   wall_time_sec              |  |  |
  |  |  |   wall_time_nsec            |  |  |
  |  |  | }                             |  |  |
  |  |  +------------------------------+  |  |
  |  +------------------------------------+  |
  +------------------------------------------+
```

How it works:

1. **At boot**, the kernel maps a small shared library (the vDSO) into every process's address space. You can see it with `cat /proc/self/maps | grep vdso`.
2. **The vDSO contains userspace-executable code** that reads time from a kernel-maintained data page (`vvar`), which is mapped read-only into userspace.
3. **The kernel updates `vvar`** on every timer interrupt (or via HPET/TSC) — writing the current time and the TSC calibration parameters.
4. **When glibc calls `clock_gettime()`**, it does NOT execute `syscall`. Instead, it calls `__vdso_clock_gettime()` which reads the TSC register (via `rdtsc`), applies the calibration math from vvar, and returns — all in userspace, zero privilege transitions.

Source: [`arch/x86/entry/vdso/`](https://github.com/torvalds/linux/tree/master/arch/x86/entry/vdso)

The result: `clock_gettime()` costs ~20ns instead of ~100ns. For a database doing millions of timestamp reads per second, this is the difference between 200ms and 20ms of CPU time per second spent just reading the clock.

You can verify this with:

```bash
# See the vDSO mapping
$ cat /proc/self/maps | grep -E 'vdso|vvar'
7fff1a5fe000-7fff1a600000 r--p  [vvar]
7fff1a600000-7fff1a602000 r-xp  [vdso]

# Dump the vDSO as a shared library
$ dd if=/proc/self/mem bs=1 skip=$((0x7fff1a600000)) count=8192 of=/tmp/vdso.so 2>/dev/null
$ objdump -T /tmp/vdso.so
...
0000000000000b20 g    DF .text  00000000000001a2  LINUX_2.6   clock_gettime
0000000000000a40 g    DF .text  00000000000000d5  LINUX_2.6   gettimeofday
```

## strace — Intercepting Syscalls with ptrace

`strace` is the essential debugging tool that shows you every system call a process makes. But how does strace itself work?

It uses the `ptrace` system call — the same mechanism used by debuggers like GDB. The flow is:

```c
// Simplified strace logic
pid_t child = fork();
if (child == 0) {
    ptrace(PTRACE_TRACEME, 0, 0, 0);  // "parent can trace me"
    execvp(argv[1], &argv[1]);         // run the target program
} else {
    while (1) {
        waitpid(child, &status, 0);
        if (WIFEXITED(status)) break;

        // Read syscall number from child's registers
        ptrace(PTRACE_GETREGS, child, 0, &regs);
        printf("syscall %d(%d, %p, %d)\n",
               regs.orig_rax, regs.rdi, regs.rsi, regs.rdx);

        // Let child continue to syscall exit
        ptrace(PTRACE_SYSCALL, child, 0, 0);
    }
}
```

When a traced process hits a `syscall` instruction, the kernel stops the process at two points:
1. **Syscall entry** — before the handler runs (strace prints the call and arguments)
2. **Syscall exit** — after the handler returns (strace prints the return value)

This is why strace makes programs dramatically slower (10-100x) — every syscall now requires two extra context switches to/from the tracing process. For production tracing, eBPF is preferred because it runs inside the kernel without context switches.

## Performance — The Cost of Crossing the Boundary

A system call is much more expensive than a regular function call. A function call on x86-64 costs ~1-2ns (a `call` instruction + stack frame). A syscall costs **100-200ns** on modern hardware. Where does the time go?

```
  Breakdown of syscall overhead (~100-200ns total):
  +--------------------------------------------------------+
  | User-to-kernel transition (syscall insn)     ~10ns     |
  +--------------------------------------------------------+
  | swapgs + stack switch                        ~5ns      |
  +--------------------------------------------------------+
  | Save/restore registers (pt_regs)             ~10ns     |
  +--------------------------------------------------------+
  | Spectre mitigations (IBRS, retpolines)       ~30-80ns  |  <-- biggest!
  +--------------------------------------------------------+
  | Actual syscall work                          variable   |
  +--------------------------------------------------------+
  | Return to userspace (sysretq)                ~10ns     |
  +--------------------------------------------------------+
```

### Spectre Changed Everything

Before 2018 (pre-Spectre), a minimal syscall like `getpid()` took about 50-80ns. After Spectre/Meltdown mitigations, the same call takes 150-300ns on affected hardware. The mitigations include:

- **KPTI (Kernel Page Table Isolation):** Separate page tables for user/kernel, requiring CR3 switches on every syscall entry/exit.
- **Retpolines:** Indirect branch protection, replacing indirect calls with a trampoline that defeats speculative execution.
- **IBRS/STIBP:** Hardware-based indirect branch prediction barriers.

### Batching with io_uring

For I/O-heavy workloads, the syscall overhead becomes the bottleneck — not the actual I/O. If you submit 1000 disk reads, that is 1000 syscall transitions (200us just in overhead!).

**io_uring** (added in Linux 5.1) solves this by using shared memory rings between user and kernel:

```
  Traditional I/O:                    io_uring:
  ==============                     ========

  for each request:                  // Setup (one-time):
    syscall(read, ...)               syscall(io_uring_setup, ...)
    wait for completion
    syscall(read, ...)               // Submit 1000 requests:
    wait for completion              // Write to submission queue (no syscall!)
    ...                              sq_ring[0..999] = requests
  1000 syscalls!                     syscall(io_uring_enter)  // 1 syscall!

                                     // Reap completions:
                                     // Read from completion queue (no syscall!)
                                     while (cq_ring[head] != cq_ring[tail])
                                       process(cq_ring[head++]);
```

The kernel and userspace share two ring buffers (submission queue and completion queue) via mmap. Requests are submitted by writing to shared memory — no syscall needed. The kernel polls the submission queue and posts completions. In the best case, with `IORING_SETUP_SQPOLL`, even `io_uring_enter` is unnecessary because a kernel thread continuously polls the submission ring.

This takes I/O from 1000 syscalls (200us overhead) down to 0-1 syscalls (~0-200ns overhead) for the same 1000 operations.

## Putting It All Together

```
  +------------------------------------------------------------------+
  |                        User Space                                 |
  |                                                                   |
  |  Application                                                      |
  |      |                                                            |
  |      v                                                            |
  |  glibc wrapper (write, read, open, etc.)                          |
  |      |                                                            |
  |      | Sets RAX=nr, RDI/RSI/RDX/R10/R8/R9 = args                 |
  |      v                                                            |
  |  [syscall instruction] ---- or ---- [vDSO call, no transition]    |
  +==================== CPU privilege boundary =======================+
  |                        Kernel Space                               |
  |                                                                   |
  |  entry_SYSCALL_64 (entry_64.S)                                    |
  |      |  swapgs, switch stack, save pt_regs                        |
  |      v                                                            |
  |  do_syscall_64 (common.c)                                         |
  |      |  bounds check, array_index_nospec                          |
  |      v                                                            |
  |  sys_call_table[nr](regs)                                         |
  |      |                                                            |
  |      v                                                            |
  |  __x64_sys_write / __x64_sys_read / ...                           |
  |      |  does the actual work (VFS, drivers, etc.)                 |
  |      v                                                            |
  |  regs->ax = return_value                                          |
  |  syscall_exit_to_user_mode()                                      |
  |      |                                                            |
  |      v                                                            |
  |  sysretq (fast) or iretq (slow)                                   |
  +==================== CPU privilege boundary =======================+
  |                        User Space                                 |
  |                                                                   |
  |  glibc: check RAX, set errno if needed, return to caller          |
  +------------------------------------------------------------------+
```

## References

1. [Linux kernel entry_64.S](https://github.com/torvalds/linux/blob/master/arch/x86/entry/entry_64.S) — The assembly entry point for 64-bit syscalls.
2. [Linux kernel common.c (do_syscall_64)](https://github.com/torvalds/linux/blob/master/arch/x86/entry/common.c) — C dispatch function for syscalls.
3. [syscall_64.tbl](https://github.com/torvalds/linux/blob/master/arch/x86/entry/syscalls/syscall_64.tbl) — The syscall number-to-function mapping table.
4. [include/linux/syscalls.h](https://github.com/torvalds/linux/blob/master/include/linux/syscalls.h) — SYSCALL_DEFINE macros and declarations.
5. [arch/x86/include/asm/syscall_wrapper.h](https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/syscall_wrapper.h) — How pt_regs-based wrappers work.
6. [arch/x86/entry/vdso/](https://github.com/torvalds/linux/tree/master/arch/x86/entry/vdso) — vDSO implementation source.
7. [Intel SDM Vol. 2, SYSCALL instruction](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html) — CPU-level specification of the syscall instruction.
8. [io_uring documentation](https://kernel.dk/io_uring.pdf) — Jens Axboe's design document for io_uring.
9. [LWN: Rethinking the syscall API (vDSO)](https://lwn.net/Articles/615809/) — Background on vDSO design decisions.
10. [Spectre mitigations in the Linux kernel](https://docs.kernel.org/admin-guide/hw-vuln/spectre.html) — Official documentation on Spectre/Meltdown patches.
