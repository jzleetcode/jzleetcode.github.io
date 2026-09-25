---
author: JZ
pubDatetime: 2026-09-25T12:00:00Z
modDatetime: 2026-09-25T12:00:00Z
title: System Design - How Debuggers Work
tags:
  - design-system
  - design-linux
description:
  "How debuggers like GDB and LLDB work under the hood: ptrace system call, INT3 software breakpoints, hardware watchpoints, single-stepping, DWARF debug info, and source code walkthrough from the GDB and Linux kernel."
---

## Table of contents

## Context

Every programmer has typed `break main`, hit `run`, and watched their program pause at the exact right line. But what actually happens when GDB stops your program? How does a debugger read variables from another process's memory, or make it execute one line at a time?

A debugger is not magic. It relies on a surprisingly small set of operating system and CPU features working together. On Linux, the foundation is a single system call: **ptrace**. On top of that, the CPU provides a special one-byte instruction (**INT3**) that triggers a trap, and the compiler embeds a data format called **DWARF** that maps machine addresses back to source code lines and variable names.

```
  How a debugger controls your program

  +----------------+                     +-----------------+
  |   Debugger     |                     |   Your Program  |
  |   (GDB/LLDB)  |                     |   (debuggee)    |
  |                |                     |                 |
  |  ptrace()  ----|---> kernel -------->|   SIGTRAP       |
  |  PEEKDATA     |     (delivers       |   (process      |
  |  POKEDATA     |      signals,       |    stops)       |
  |  SINGLESTEP   |     manages         |                 |
  |  CONT         |     traps)          |                 |
  +----------------+                     +-----------------+
         |
         v
  +------------------+
  |  DWARF debug     |
  |  info (.debug_*  |
  |  ELF sections)   |
  |  - line numbers  |
  |  - variable      |
  |    locations     |
  |  - type info     |
  +------------------+
```

Let's walk through each piece, starting from the system call that makes it all possible.

## ptrace: The Debugger's Swiss Army Knife

The `ptrace` system call is the single interface through which a debugger controls another process. Its signature is deceptively simple:

```c
long ptrace(enum __ptrace_request request, pid_t pid, void *addr, void *data);
```

The `request` parameter selects what operation to perform. Here are the most important ones:

```
  ptrace request          What it does
  ---------------------  ------------------------------------------------
  PTRACE_TRACEME         "I want to be debugged" (called by child)
  PTRACE_ATTACH          Attach to an already-running process
  PTRACE_PEEKTEXT        Read one word from the tracee's memory
  PTRACE_POKETEXT        Write one word into the tracee's memory
  PTRACE_GETREGS         Read all CPU registers (rip, rsp, rax, ...)
  PTRACE_SETREGS         Write all CPU registers
  PTRACE_SINGLESTEP      Execute exactly one instruction, then stop
  PTRACE_CONT            Resume execution (optionally delivering a signal)
  PTRACE_DETACH          Stop debugging, let the process run free
```

### Starting a debug session

When you type `gdb ./myprogram`, GDB forks a child process. The child calls `ptrace(PTRACE_TRACEME)` before calling `execve()` to load your program. This tells the kernel: "my parent is my debugger — stop me before I execute my first instruction."

Here is a minimal debugger that does exactly this:

```c
// minimal_debugger.c — a debugger in 30 lines
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <sys/user.h>
#include <unistd.h>
#include <stdio.h>

int main(int argc, char **argv) {
    pid_t child = fork();

    if (child == 0) {
        // Child: request tracing, then exec the target
        ptrace(PTRACE_TRACEME, 0, NULL, NULL);
        execvp(argv[1], argv + 1);
    }

    // Parent: wait for child to stop at execve
    int status;
    waitpid(child, &status, 0);
    printf("Child stopped. RIP = ");

    // Read the instruction pointer
    struct user_regs_struct regs;
    ptrace(PTRACE_GETREGS, child, NULL, &regs);
    printf("0x%llx\n", regs.rip);

    // Single-step one instruction
    ptrace(PTRACE_SINGLESTEP, child, NULL, NULL);
    waitpid(child, &status, 0);

    ptrace(PTRACE_GETREGS, child, NULL, &regs);
    printf("After single-step, RIP = 0x%llx\n", regs.rip);

    // Let it run
    ptrace(PTRACE_CONT, child, NULL, NULL);
    waitpid(child, &status, 0);
    printf("Child exited.\n");
    return 0;
}
```

Compile and run:

```bash
$ gcc -o mindbg minimal_debugger.c
$ ./mindbg /bin/ls
Child stopped. RIP = 0x7f3a2b400000
After single-step, RIP = 0x7f3a2b400003
Child exited.
```

That's a working debugger — it stopped a process, read its registers, single-stepped one instruction, then let it continue. Everything GDB and LLDB do builds on top of these same primitives.

### Inside the kernel: how ptrace works

The kernel implementation of ptrace lives in [`kernel/ptrace.c`](https://github.com/torvalds/linux/blob/master/kernel/ptrace.c). When a traced process hits a trap (like INT3 or a single-step completion), the kernel's signal delivery path checks whether the process is being traced:

```c
// Simplified from kernel/signal.c — ptrace_signal()
static int ptrace_signal(int signr, kernel_siginfo_t *info) {
    // Notify the tracer and stop
    set_current_state(TASK_TRACED);
    ptrace_do_notify(SIGTRAP, signr);
    schedule(); // sleep until the tracer resumes us

    // Tracer may have changed the signal or registers
    signr = current->exit_code;
    current->exit_code = 0;
    return signr;
}
```

The traced process enters `TASK_TRACED` state (sleeping) and the tracer's `waitpid()` returns. The tracer can then inspect or modify the stopped process at leisure. When the tracer calls `PTRACE_CONT` or `PTRACE_SINGLESTEP`, the kernel wakes the tracee back up.

## Software Breakpoints: The INT3 Instruction

When you type `break main` in GDB, the debugger does something surprisingly crude: it **overwrites the first byte of the instruction at `main`** with the byte `0xCC`, which is the x86 `INT3` instruction. INT3 is a single-byte trap instruction that causes the CPU to immediately raise a **debug exception**, which the kernel delivers as `SIGTRAP` to the process.

```
  Setting a breakpoint at address 0x401000

  Before:                               After GDB sets breakpoint:
  0x401000: 55                          0x401000: CC   <-- INT3 (was 0x55 = push rbp)
  0x401001: 48 89 e5                    0x401001: 48 89 e5
  0x401004: 48 83 ec 10                 0x401004: 48 83 ec 10

  GDB saves: { addr: 0x401000, original_byte: 0x55 }
```

Here is what GDB does internally:

1. **Read** the original byte at the target address using `PTRACE_PEEKTEXT`.
2. **Save** it in a breakpoint table.
3. **Write** `0xCC` at that address using `PTRACE_POKETEXT`.

When the CPU executes the `0xCC` byte, it raises a trap. The kernel stops the process and sends `SIGTRAP` to the tracer. The debugger then:

4. **Restores** the original byte at the breakpoint address.
5. **Rewinds** the instruction pointer by 1 (because `RIP` now points past the INT3).
6. Shows you the source line.

When you type `continue`, the debugger must re-set the breakpoint. It does a clever trick:

7. **Single-step** one instruction (executing the now-restored original byte).
8. **Re-insert** the `0xCC` byte.
9. **Continue** execution.

```
  Breakpoint hit flow

  CPU executes 0xCC at 0x401000
         |
         v
  CPU raises #BP exception
         |
         v
  Kernel delivers SIGTRAP to traced process
         |
         v
  Process enters TASK_TRACED, parent's waitpid() returns
         |
         v
  GDB: "ah, breakpoint at 0x401000"
    1. POKETEXT: restore original byte (0x55) at 0x401000
    2. SETREGS:  RIP = 0x401000 (rewind past INT3)
    3. show source line to user
         |
  user types "continue"
         |
         v
  GDB:
    4. SINGLESTEP (execute the restored 0x55 = push rbp)
    5. waitpid() — process stops after one instruction
    6. POKETEXT: re-insert 0xCC at 0x401000
    7. CONT — resume execution
```

### Why INT3 is one byte

INT3 is specifically encoded as a single byte (`0xCC`) rather than the two-byte `INT n` form (`0xCD 0x03`). This is a deliberate CPU design choice: because it's exactly one byte, it can replace the first byte of **any** x86 instruction without corrupting the following instruction. If it were two bytes, inserting it could overwrite part of the next instruction, corrupting the instruction stream.

The Intel Software Developer's Manual, Volume 2, explicitly states:

> "The INT3 instruction is a one-byte instruction defined for use by debuggers to temporarily replace an instruction in a running program to set a code breakpoint."

## Hardware Breakpoints and Watchpoints

Software breakpoints (INT3) work for code, but what if you want to break when a **memory address is read or written**? You can't insert an INT3 into data. This is where **hardware debug registers** come in.

x86 CPUs have four debug registers (`DR0`–`DR3`) that can each watch one address, plus `DR7` which controls what each register watches:

```
  x86 Debug Registers

  DR0: address to watch (breakpoint 0)
  DR1: address to watch (breakpoint 1)
  DR2: address to watch (breakpoint 2)
  DR3: address to watch (breakpoint 3)

  DR6: debug status (which breakpoint fired)

  DR7: control register
       +-------+-------+-------+-------+
       | BP3   | BP2   | BP1   | BP0   |  for each:
       | cond  | cond  | cond  | cond  |  - condition: exec/write/read-write
       | len   | len   | len   | len   |  - length: 1/2/4/8 bytes
       | L/G   | L/G   | L/G   | L/G   |  - local/global enable
       +-------+-------+-------+-------+
```

When you type `watch myvar` in GDB, the debugger:

1. Finds the memory address of `myvar` using DWARF debug info.
2. Loads that address into one of `DR0`–`DR3` via `PTRACE_POKEUSER`.
3. Configures `DR7` to trigger on writes to that address.

When the CPU writes to that address, it raises a `#DB` (debug) exception **after** the instruction completes. The kernel delivers `SIGTRAP`, and GDB tells you the old and new values.

```
  (gdb) watch counter
  Hardware watchpoint 1: counter
  (gdb) continue
  ...
  Hardware watchpoint 1: counter

  Old value = 41
  New value = 42
  main () at example.c:10
  10      counter++;
```

Hardware watchpoints are fast (zero overhead until triggered) but limited: you only get four on x86. If you need more, GDB falls back to **software watchpoints**, which single-step through every instruction and check the watched address after each step — dramatically slower.

## Single-Stepping: One Instruction at a Time

When you type `stepi` (step one machine instruction), the debugger calls `ptrace(PTRACE_SINGLESTEP)`. The kernel sets the **Trap Flag (TF)** in the CPU's EFLAGS register:

```
  EFLAGS register (selected bits)

  Bit 8:  TF (Trap Flag)
          0 = normal execution
          1 = raise #DB after every instruction

  Bit 9:  IF (Interrupt Flag)
  Bit 0:  CF (Carry Flag)
  ...
```

With TF set, the CPU executes exactly one instruction, then raises a `#DB` exception. The kernel clears TF (so it doesn't trap forever) and delivers `SIGTRAP` to the tracer.

The kernel code that sets TF lives in [`arch/x86/kernel/step.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/step.c):

```c
// Simplified from arch/x86/kernel/step.c
static void enable_step(struct task_struct *child, bool block) {
    struct pt_regs *regs = task_pt_regs(child);

    // Set the Trap Flag in the saved EFLAGS
    regs->flags |= X86_EFLAGS_TF;

    // Clear TF when we resume, so the debugger's
    // own instructions are not trapped
    if (block)
        set_task_blockstep(child, true);
}
```

### Source-level stepping: `next` and `step`

When you type `next` (step one source line), the debugger doesn't just single-step one instruction. A single line of C can compile to many instructions. GDB uses the DWARF **line number table** to figure out which addresses correspond to the next source line, sets temporary breakpoints at those addresses, and continues. If the current line contains a function call:

- **`step`**: steps into the called function (sets a breakpoint at the first instruction of the callee).
- **`next`**: steps over it (sets a breakpoint at the return address — the instruction after the `call`).

```
  Source line:   x = foo(a) + bar(b);

  Compiled instructions:
  0x401010:  mov edi, [rbp-8]       ;  load a
  0x401013:  call 0x401100           ;  call foo
  0x401018:  mov ebx, eax            ;  save result
  0x40101a:  mov edi, [rbp-12]       ;  load b
  0x40101d:  call 0x401200           ;  call bar
  0x401022:  add eax, ebx            ;  foo(a) + bar(b)
  0x401024:  mov [rbp-16], eax       ;  x = ...
  0x401027:  ...                     ;  <-- next source line starts here

  "next" at 0x401010 → set temp breakpoint at 0x401027, continue
  "step" at 0x401010 → single-step to 0x401013, then step into 0x401100
```

## DWARF: Mapping Machine Code Back to Source

When you compile with `gcc -g`, the compiler embeds **DWARF** (Debugging With Attributed Record Formats) information in the binary. DWARF is stored in ELF sections with names like `.debug_info`, `.debug_line`, `.debug_abbrev`, and `.debug_frame`. You can inspect them with `readelf` or `dwarfdump`:

```bash
$ readelf --debug-dump=line myprogram

 Line Number Statements:
  [0x00000024]  Set File Name to "example.c"
  [0x0000002f]  Advance PC by 0 to 0x401000
  [0x00000035]  Set line to 5
  [0x00000039]  Advance PC by 8 to 0x401008
  [0x0000003f]  Set line to 6
  [0x00000043]  Advance PC by 12 to 0x401014
  [0x00000049]  Set line to 7
```

### The Line Number Table

The `.debug_line` section contains a compressed table mapping addresses to source lines. It's encoded as a **state machine program** — a sequence of opcodes that, when executed, produce `(address, file, line, column)` tuples. This encoding is extremely compact: a typical function's line table is just a few dozen bytes.

```
  Address    → Source Location
  ----------   ----------------------------
  0x401000   → example.c, line 5, col 1
  0x401008   → example.c, line 6, col 5
  0x401014   → example.c, line 7, col 5
  0x401020   → example.c, line 8, col 1
```

When GDB hits a breakpoint at `0x401008`, it looks up this table and shows `example.c:6`.

### Variable Locations: Where is `x` right now?

DWARF also describes where each variable lives at each point in the program. Variables move around — sometimes in a register, sometimes on the stack, sometimes optimized away entirely. DWARF uses **location expressions** (a small stack-based bytecode) to describe this:

```
  Variable "counter" at different points:

  Address range       Location expression        Meaning
  ------------------  -------------------------  -------------------
  0x401000–0x40100f   DW_OP_fbreg -16            stack: [rbp - 16]
  0x401010–0x40101f   DW_OP_reg3                 register: rbx
  0x401020–0x40102f   <optimized out>            doesn't exist
```

When you type `print counter` in GDB, it:

1. Looks up the current `RIP` in the DWARF info for `counter`.
2. Finds the location expression that covers the current address range.
3. Evaluates the expression (e.g., reads `[rbp - 16]` via `PTRACE_PEEKTEXT` or reads register `rbx` via `PTRACE_GETREGS`).
4. Uses the DWARF type information to format the raw bytes as the correct C type.

This is why optimized code is hard to debug — the compiler rearranges and eliminates variables, and the DWARF location expressions must track every change. With `-O2`, you'll often see `<optimized out>` because the variable was eliminated entirely.

### The Call Frame Information (CFI)

When your program crashes and GDB shows a backtrace (`bt`), it needs to **unwind the stack** — walk from the current frame back through each caller. But modern compilers don't always use frame pointers (`rbp`), so GDB can't just follow the `rbp` chain.

DWARF's `.debug_frame` (or `.eh_frame` for exceptions) section provides **Call Frame Information (CFI)** — rules for how to find the return address and restore registers at each instruction address:

```
  CFI for function foo():

  Address    CFA (Canonical Frame Address)    Return address
  --------   ------------------------------   ---------------
  0x401000   rsp + 8                          [CFA - 8]
  0x401001   rsp + 16   (after push rbp)      [CFA - 8]
  0x401004   rbp + 16   (after mov rbp,rsp)   [CFA - 8]
  ...
  0x40102f   rsp + 8    (after pop rbp)       [CFA - 8]
```

The CFA is an abstract "anchor point" for the stack frame. By knowing the CFA rule at the current `RIP`, GDB can compute where the return address is stored, read it, jump to the caller, and repeat.

## Conditional Breakpoints and Expressions

When you write `break foo if x > 10`, GDB sets a normal INT3 breakpoint at `foo`. Every time the breakpoint fires, GDB:

1. Evaluates the condition `x > 10` by reading `x` from the debuggee's memory/registers using DWARF info.
2. If false, silently restores the byte, single-steps, re-inserts INT3, and continues.
3. If true, stops and shows you the breakpoint.

This means conditional breakpoints on hot code paths can dramatically slow your program — the process stops and resumes on every hit, even when the condition is false. GDB must evaluate the condition in its own process, which involves multiple ptrace round-trips.

Some modern debuggers support **agent expressions** — compiled condition bytecode that the kernel evaluates in-kernel without waking the debugger. Linux's `PTRACE_SET_SYSCALL_INFO` and eBPF-based approaches are moving in this direction, but classic GDB conditional breakpoints remain tracer-side evaluations.

## Attaching to a Running Process

You don't always start a program under the debugger. Sometimes the bug only happens in production, and you need to attach to a running process:

```bash
$ gdb -p 12345
Attaching to process 12345...
```

GDB calls `ptrace(PTRACE_ATTACH, 12345)`. The kernel:

1. Checks permissions (you must own the process, or be root, or have `CAP_SYS_PTRACE`, and the `ptrace_scope` sysctl must allow it).
2. Sends `SIGSTOP` to the target process.
3. Sets the tracer relationship.

After attach, the target process is stopped, and GDB can inspect and control it just like a process it started. When you're done, `detach` calls `PTRACE_DETACH` and the process resumes normally.

The security check is important. The `ptrace_scope` sysctl (`/proc/sys/kernel/yama/ptrace_scope`) controls who can attach:

```
  ptrace_scope    Who can ptrace
  -------------   -----------------------------------------------
  0               Any process can trace any other (same uid)
  1               Only direct parent can trace (default on Ubuntu)
  2               Only admin (CAP_SYS_PTRACE) can trace
  3               No process can trace (even root)
```

## Multithreaded Debugging

Real programs have multiple threads. When one thread hits a breakpoint, what happens to the others? By default, Linux stops **all threads** in the process. GDB uses the concept of an **"all-stop" mode**: when any thread hits a breakpoint, every thread stops.

The mechanism uses `PTRACE_SETOPTIONS` with `PTRACE_O_TRACECLONE` — when the traced process calls `clone()` (which is how `pthread_create` works underneath), the kernel automatically starts tracing the new thread.

GDB also supports **"non-stop" mode**, where only the thread that hit the breakpoint stops, and other threads continue running. This is crucial for debugging real-time systems or race conditions where stopping all threads would mask the bug.

```
  All-stop mode (default)          Non-stop mode
  -------------------------        -------------------------
  Thread 1: hits breakpoint        Thread 1: hits breakpoint
  Thread 2: stopped by kernel      Thread 2: still running
  Thread 3: stopped by kernel      Thread 3: still running

  All threads frozen for           Only thread 1 frozen.
  GDB to inspect.                  Others keep going.
```

## Putting It All Together

Here is how all the pieces connect when you type a simple GDB session:

```
  $ gdb ./myprogram
  (gdb) break main

  1. GDB reads DWARF .debug_info to find the address of main()
     → 0x401126
  2. GDB reads byte at 0x401126 via PTRACE_PEEKTEXT
     → saves 0x55 (push rbp)
  3. GDB writes 0xCC at 0x401126 via PTRACE_POKETEXT

  (gdb) run

  4. GDB forks child, child calls PTRACE_TRACEME + execve
  5. Child stops at entry point, GDB calls PTRACE_CONT
  6. Program runs until CPU executes 0xCC at 0x401126
  7. CPU raises #BP, kernel sends SIGTRAP
  8. GDB's waitpid() returns
  9. GDB looks up 0x401126 in DWARF line table
     → main() at myprogram.c:10
  10. GDB shows: "Breakpoint 1, main() at myprogram.c:10"

  (gdb) print argc

  11. GDB looks up "argc" in DWARF for current RIP
      → DW_OP_fbreg -20 (meaning [rbp - 20])
  12. GDB reads rbp via PTRACE_GETREGS → 0x7ffc1234
  13. GDB reads 4 bytes at 0x7ffc1234-20 via PTRACE_PEEKTEXT
  14. GDB formats as int (from DWARF type info) → 1
  15. GDB shows: "$1 = 1"

  (gdb) next

  16. GDB reads DWARF line table for next source line
      → line 11 starts at 0x401140
  17. GDB restores 0x55 at 0x401126, sets temp breakpoint at 0x401140
  18. GDB calls PTRACE_CONT
  19. Program runs until 0x401140, SIGTRAP
  20. GDB removes temp breakpoint, re-inserts 0xCC at 0x401126
  21. GDB shows: "11      int result = compute(argc);"
```

Every interaction between you and the debugger is a choreography of ptrace calls, memory reads/writes, DWARF lookups, and signal delivery. The illusion of "pausing" a program is really the kernel suspending the process's scheduler state while the debugger pokes at its memory and registers through a well-defined interface.

## References

1. Linux ptrace man page [`ptrace(2)`](https://man7.org/linux/man-pages/man2/ptrace.2.html)
2. Linux kernel ptrace implementation [`kernel/ptrace.c`](https://github.com/torvalds/linux/blob/master/kernel/ptrace.c)
3. Linux kernel single-step implementation [`arch/x86/kernel/step.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/step.c)
4. Intel Software Developer's Manual, Volume 3, Chapter 17: Debug, Branch Profile, TSC, and Intel Resource Director Technology [manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
5. DWARF Debugging Standard Version 5 [spec](https://dwarfstd.org/dwarf5std.html)
6. GDB Internals Manual [wiki](https://sourceware.org/gdb/wiki/Internals)
7. Eli Bendersky, "How debuggers work" [blog series](https://eli.thegreenplace.net/2011/01/23/how-debuggers-work-part-1)
8. ELF and DWARF debugging formats [`readelf --debug-dump`](https://man7.org/linux/man-pages/man1/readelf.1.html)
9. Linux Yama security module — ptrace_scope [`Documentation/admin-guide/LSM/Yama.rst`](https://github.com/torvalds/linux/blob/master/Documentation/admin-guide/LSM/Yama.rst)
