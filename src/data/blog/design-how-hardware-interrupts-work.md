---
author: JZ
pubDatetime: 2026-09-18T12:00:00Z
modDatetime: 2026-09-18T12:00:00Z
title: System Design - How Hardware Interrupts and Trap Handling Work
tags:
  - design-system
  - design-concurrency
description:
  "How hardware interrupts work: the interrupt lifecycle from electrical signal to handler execution, IDT, IRQs, top-half/bottom-half processing, and a Linux kernel source code walkthrough."
---

## Table of contents

## Context

Imagine typing a key on your keyboard. The character appears on screen almost instantly, yet the CPU was busy running your code, not watching the keyboard. How did it know to stop and read the keystroke?

The answer is **interrupts** — the fundamental mechanism that allows hardware devices to get the CPU's attention without the CPU having to constantly poll every device. Interrupts are what make modern computers feel responsive. Every keystroke, every network packet, every disk read completion, and every timer tick that drives the scheduler relies on interrupts.

Understanding interrupts connects many systems topics: how [system calls](/posts/design-how-linux-system-calls-work) enter the kernel, how the [scheduler](/posts/design-how-linux-scheduler-works) gets a chance to preempt your process, and how [I/O](/posts/design-how-linux-epoll-works) events wake up blocked threads. They're the bridge between hardware and software.

```
                    Without Interrupts: Polling
                    ===========================

  CPU                          Keyboard
  +--+                         +------+
  |  |---"Any key pressed?"--->|      |
  |  |<---"No"-----------------|      |
  |  |---"Any key pressed?"--->|      |
  |  |<---"No"-----------------|      |
  |  |---"Any key pressed?"--->|      |   <-- wastes CPU cycles
  |  |<---"Yes: 'A'"----------|      |
  +--+                         +------+


                    With Interrupts
                    ===============

  CPU                          Keyboard
  +--+                         +------+
  |  | (running user program)  |      |
  |  |                         |      |
  |  |<====== IRQ signal ======|  'A' |   <-- electrical signal
  |  |                         |      |       on interrupt line
  |  | (saves state, runs      +------+
  |  |  keyboard handler,
  |  |  resumes user program)
  +--+
```

## What is an Interrupt?

An interrupt is an **asynchronous signal** to the CPU that something needs attention. "Asynchronous" means it can arrive at any time — between any two instructions, the CPU checks for pending interrupts.

There are three categories:

| Type | Source | Example | Triggered by |
|------|--------|---------|-------------|
| **Hardware interrupt (IRQ)** | External device | Keyboard press, NIC packet arrival, timer tick | Electrical signal on CPU pin |
| **Software interrupt (trap)** | Running code | `int 0x80`, `syscall` instruction | Deliberate instruction |
| **Exception** | CPU itself | Division by zero, page fault, invalid opcode | Error during execution |

Despite these different origins, the CPU handles them all through the same mechanism: it looks up a handler in a table, saves the current state, and jumps to that handler.

## The Interrupt Descriptor Table (IDT)

On x86 processors, the CPU maintains a pointer to a table called the **Interrupt Descriptor Table** (IDT). This table has up to 256 entries, one per **interrupt vector** (a number from 0 to 255). Each entry tells the CPU: "when vector N fires, jump to this address in this code segment with this privilege level."

```
                 Interrupt Descriptor Table (IDT)
                 =================================

  IDTR Register
  +------------------+
  | Base addr | Size |---+
  +------------------+   |
                          v
  Vector  +----------------------------------------------+
    0     | Divide Error (#DE)           -> divide_error  |
    1     | Debug (#DB)                  -> debug         |
    2     | NMI (Non-Maskable Interrupt) -> nmi           |
    3     | Breakpoint (#BP)             -> int3          |
    ...   |                                               |
    6     | Invalid Opcode (#UD)         -> invalid_op    |
    ...   |                                               |
   13     | General Protection (#GP)     -> general_prot  |
   14     | Page Fault (#PF)             -> page_fault    |
    ...   |                                               |
   32     | Timer (IRQ 0)                -> timer_irq     |
   33     | Keyboard (IRQ 1)             -> keyboard_irq  |
    ...   |                                               |
  128     | System call (0x80)           -> system_call   |
    ...   |                                               |
  255     |                                               |
          +----------------------------------------------+

  Vectors 0-31:   Reserved by CPU for exceptions
  Vectors 32-255: Available for hardware IRQs and software use
```

The first 32 vectors (0–31) are reserved by the CPU architecture for exceptions like divide-by-zero (vector 0), page faults (vector 14), and general protection faults (vector 13). The remaining vectors (32–255) are available for hardware devices and software-defined interrupts.

The Linux kernel sets up the IDT early during boot. In the kernel source at [`arch/x86/kernel/idt.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/idt.c), you can see the table definition:

```c
static const __initconst struct idt_data def_idts[] = {
    INTG(X86_TRAP_DE,           asm_exc_divide_error),
    INTG(X86_TRAP_NMI,          asm_exc_nmi),
    INTG(X86_TRAP_BR,           asm_exc_bounds),
    INTG(X86_TRAP_UD,           asm_exc_invalid_op),
    ...
    INTG(X86_TRAP_PF,           asm_exc_page_fault),
    ...
};
```

Each `INTG` macro creates an **interrupt gate** — a descriptor that, when the vector fires, automatically disables further interrupts on that CPU, switches to the kernel stack, and jumps to the assembly stub listed.

## The Lifecycle of a Hardware Interrupt

When a hardware device needs the CPU's attention, here is what happens step by step:

```
  1. Device asserts     2. APIC routes       3. CPU receives
     IRQ signal            to a CPU              and checks

  +--------+          +-----------+          +--------+
  | NIC    |--IRQ---->|  I/O APIC |---msg--->| Local  |
  | (net)  |          | (routing) |          | APIC   |
  +--------+          +-----------+          | (CPU0) |
                                             +---+----+
                                                 |
                      4. CPU saves state,        |
                         looks up IDT            v
                                             +--------+
                      5. Jumps to handler    | IDT    |
                                             | vec 43 |---> net_irq_handler
                                             +--------+

  6. Handler runs     7. Sends EOI          8. CPU restores
     (ack device,        (End of              state, resumes
      queue work)        Interrupt)           interrupted code
```

Let's trace each step:

**Step 1 — Device signals.** The network card (NIC) received a packet. It asserts an electrical signal on its assigned interrupt line. In modern systems, this is a **Message Signaled Interrupt** (MSI) — a write to a special memory address rather than a dedicated wire — but the concept is the same.

**Step 2 — APIC routes.** The **I/O APIC** (Advanced Programmable Interrupt Controller) on the motherboard receives the signal and decides which CPU should handle it. In a multi-core system, the I/O APIC can distribute interrupts across CPUs for load balancing. It converts the device's IRQ number into a vector number and sends an inter-processor message.

**Step 3 — CPU receives.** The CPU's **Local APIC** receives the interrupt message. At the boundary between the current and next instruction, the CPU checks: is the interrupt flag (IF) set? If interrupts are enabled, the CPU accepts the interrupt.

**Step 4 — CPU saves state.** The CPU hardware automatically pushes the current instruction pointer (RIP), stack pointer (RSP), flags register (RFLAGS), and code segment (CS) onto the kernel stack. If the interrupt came while in user mode, the CPU also switches from the user stack to the kernel stack using the address stored in the **Task State Segment** (TSS).

```
        Kernel Stack After Interrupt from User Mode
        ============================================

  High address
  +------------------+
  | User SS          |  <-- saved user stack segment
  +------------------+
  | User RSP         |  <-- saved user stack pointer
  +------------------+
  | RFLAGS           |  <-- saved flags (including IF)
  +------------------+
  | User CS          |  <-- saved code segment
  +------------------+
  | User RIP         |  <-- instruction to resume at
  +------------------+
  | Error code       |  <-- for exceptions (0 for IRQs)
  +------------------+  <-- RSP points here
  Low address
```

**Step 5 — Jump to handler.** The CPU reads the IDT entry for the vector number and jumps to the handler address. On Linux, this lands in a small assembly stub that saves the remaining general-purpose registers (RAX, RBX, RCX, ...), then calls the C handler function.

**Step 6 — Handler runs.** The C handler acknowledges the device (reads a register to clear the interrupt condition), processes the event minimally, and typically queues further work for later (more on this below).

**Step 7 — EOI.** The handler writes to the Local APIC's **End of Interrupt** register, telling it "I'm done with this interrupt, you can send me the next one."

**Step 8 — Resume.** The assembly stub restores all saved registers and executes `iretq` (interrupt return), which pops the saved RIP, CS, RFLAGS, RSP, and SS from the stack. The CPU resumes exactly where it left off. The interrupted program never knows it was paused.

## Top Half and Bottom Half

There's a tension in interrupt handling: the handler runs with interrupts disabled (or at least with the current interrupt masked), so it must finish quickly. But some work — like processing a full network packet up the TCP/IP stack — takes time.

Linux solves this by splitting interrupt work into two phases:

```
    Interrupt arrives
         |
         v
  +------------------+
  | Top Half         |    Runs in interrupt context
  | (hardirq)        |    - Interrupts disabled
  |                  |    - Must be fast
  | - Ack device     |    - Cannot sleep
  | - Copy urgent    |    - Cannot call schedule()
  |   data           |
  | - Schedule       |
  |   bottom half    |
  +--------+---------+
           |
           v
  +------------------+
  | Bottom Half      |    Runs later, in a safer context
  | (softirq /       |
  |  tasklet /       |    - Interrupts enabled
  |  workqueue)      |    - Can do heavy processing
  |                  |    - Workqueues can sleep
  | - Process full   |
  |   packet         |
  | - Update stats   |
  | - Wake up        |
  |   waiting procs  |
  +------------------+
```

**Top half (hardirq):** This is the handler that runs immediately when the interrupt fires. It runs with preemption disabled and must not sleep. Its job is to acknowledge the hardware, grab any time-sensitive data, and schedule the bottom half.

**Bottom half:** This runs after the top half returns, with interrupts re-enabled. Linux provides three mechanisms:

| Mechanism | Context | Can sleep? | Use case |
|-----------|---------|-----------|----------|
| **Softirq** | Atomic | No | High-frequency: networking, block I/O |
| **Tasklet** | Atomic | No | Simpler, serialized per-tasklet |
| **Workqueue** | Process | Yes | Anything that needs to sleep |

The networking stack is the most prominent user of softirqs. When a NIC interrupt arrives, the top half calls `napi_schedule()` to raise `NET_RX_SOFTIRQ`. The softirq handler then calls `napi_poll()` to process packets in batches — a technique called **NAPI** (New API) that prevents interrupt storms under high load by switching to polling mode temporarily.

Here's a simplified view of the network receive path from [`net/core/dev.c`](https://github.com/torvalds/linux/blob/master/net/core/dev.c):

```c
// Top half: device driver interrupt handler
static irqreturn_t my_nic_interrupt(int irq, void *dev_id)
{
    struct my_device *dev = dev_id;

    /* Disable further interrupts from this device */
    my_nic_disable_irq(dev);

    /* Schedule NAPI polling (bottom half) */
    napi_schedule(&dev->napi);

    return IRQ_HANDLED;
}

// Bottom half: softirq context via NAPI
static int my_nic_poll(struct napi_struct *napi, int budget)
{
    int processed = 0;

    while (processed < budget) {
        struct sk_buff *skb = my_nic_receive_packet(dev);
        if (!skb)
            break;

        /* Send packet up the network stack */
        napi_gro_receive(napi, skb);
        processed++;
    }

    if (processed < budget) {
        napi_complete(napi);
        my_nic_enable_irq(dev);    /* Re-enable device interrupts */
    }

    return processed;
}
```

The `budget` parameter limits how many packets the bottom half processes in one run, ensuring the CPU isn't monopolized by one device.

## Exceptions: Synchronous Interrupts

Unlike hardware IRQs that arrive unpredictably, **exceptions** are triggered by the CPU itself during instruction execution. They're synchronous — they happen at a specific instruction, and that instruction cannot complete until the exception is handled.

The most important exception in a modern OS is the **page fault** (vector 14). When a program accesses a virtual address that doesn't have a physical page mapped, the CPU raises a page fault. The kernel's page fault handler decides what to do:

```
  Program accesses address 0x7fff12340000
         |
         v
  +-------------------+
  | MMU checks page   |
  | table             |
  |                   |
  | Present bit = 0   |---> Page Fault (#PF, vector 14)
  +-------------------+
         |
         v
  +-------------------+
  | Kernel page fault |
  | handler           |
  +--------+----------+
           |
     +-----+-----+-----+
     |           |           |
     v           v           v
  Valid addr  Valid addr  Invalid addr
  page on     page in     not in VMA
  disk (swap) file mmap
     |           |           |
     v           v           v
  Read from   Read from   Send SIGSEGV
  swap file   mapped file (segfault)
  into RAM    into RAM
     |           |
     v           v
  Update page  Update page
  table, retry table, retry
  instruction  instruction
```

This is how [virtual memory](/posts/design-how-virtual-memory-paging-works) works in practice. The CPU and OS collaborate through the page fault exception: the CPU detects the missing mapping and the OS provides the page. The faulting instruction is restarted transparently — the program never knows the page wasn't there.

Here's the entry point of the Linux page fault handler at [`arch/x86/mm/fault.c`](https://github.com/torvalds/linux/blob/master/arch/x86/mm/fault.c):

```c
DEFINE_IDTENTRY_RAW_ERRORCODE(exc_page_fault)
{
    unsigned long address = read_cr2();  /* CR2 holds faulting address */

    ...
    handle_page_fault(regs, error_code, address);
}
```

The CPU stores the faulting virtual address in the `CR2` register before jumping to the handler — this is how the OS knows *which* address caused the fault.

## Interrupt Affinity and Performance

In a multi-core system, which CPU handles an interrupt matters for performance. If a network card's interrupts always go to CPU 0 while the application runs on CPU 3, every packet requires cross-CPU cache synchronization.

Linux exposes interrupt routing through `/proc/interrupts` and `/proc/irq/<N>/smp_affinity`:

```
$ cat /proc/interrupts
           CPU0       CPU1       CPU2       CPU3
  0:         45          0          0          0  IR-IO-APIC   2-edge      timer
  1:          0          0          3          0  IR-IO-APIC   1-edge      i8042
  8:          0          0          0          1  IR-IO-APIC   8-edge      rtc0
 43:          0   12847523          0          0  IR-PCI-MSI   524288-edge eth0-rx-0
 44:          0          0   9283741          0  IR-PCI-MSI   524289-edge eth0-rx-1
 45:          0          0          0   7129843  IR-PCI-MSI   524290-edge eth0-rx-2
```

Modern NICs support **multi-queue** (RSS — Receive Side Scaling), where different flows hash to different queues, each with its own interrupt vector bound to a different CPU. This is how high-performance servers handle millions of packets per second — the interrupt load is distributed across cores, and each core processes its packets through the stack with warm caches.

You can set affinity manually:

```bash
# Pin IRQ 43 to CPU 1 (bitmask: 0x2 = bit 1 set)
echo 2 > /proc/irq/43/smp_affinity
```

Or let the `irqbalance` daemon distribute interrupts automatically based on load.

## Disabling Interrupts: Critical Sections

Sometimes the kernel needs to ensure an operation completes without interruption. For example, when modifying a per-CPU data structure that an interrupt handler also accesses, the kernel disables interrupts locally:

```c
unsigned long flags;

local_irq_save(flags);     /* Disable interrupts, save previous state */
/* ... critical section ... */
/* No interrupt handler can run on this CPU here */
local_irq_restore(flags);  /* Restore previous interrupt state */
```

This is different from a spinlock, which prevents other CPUs from entering a critical section. In practice, the kernel often needs both:

```c
spin_lock_irqsave(&my_lock, flags);
/* Safe from both other CPUs AND interrupt handlers */
spin_unlock_irqrestore(&my_lock, flags);
```

The `_irqsave` variant disables local interrupts and acquires the spinlock. The `_irqrestore` variant releases the lock and re-enables interrupts. This prevents a deadlock scenario where: (1) CPU 0 holds the lock, (2) an interrupt fires on CPU 0, (3) the interrupt handler tries to acquire the same lock, (4) deadlock — the handler spins forever waiting for a lock that the code it interrupted is holding.

```
     Deadlock Without irqsave
     =========================

  CPU 0 thread         CPU 0 interrupt handler
  +-----------+
  | spin_lock |        (interrupt arrives!)
  | (&lock)   |---+
  +-----------+   |    +-----------+
  | critical  |   +--->| spin_lock |  <-- spins forever!
  | section   |        | (&lock)   |      thread can't release
  |           |        |           |      because handler won't
  |   STUCK   |        |   STUCK   |      return
  +-----------+        +-----------+
```

## From Interrupt to Scheduler

One of the most important interrupt sources is the **timer interrupt**. On modern Linux, the timer fires at a configurable frequency (commonly 250 Hz or 1000 Hz, set by `CONFIG_HZ`). Each tick, the timer interrupt handler calls `scheduler_tick()`, which:

1. Updates the current task's runtime accounting
2. Checks if the task has used its time slice
3. Sets the `TIF_NEED_RESCHED` flag if preemption is needed

When the interrupt handler returns and the kernel is about to jump back to user space, it checks `TIF_NEED_RESCHED`. If set, instead of returning to the interrupted program, it calls `schedule()` to pick a new task.

```
  Timer Interrupt Drives Preemption
  =================================

  User program running
       |
       | <--- timer IRQ fires (every 1-4ms)
       v
  +--------------------+
  | timer_interrupt()  |
  |   scheduler_tick() |
  |   "task ran 4ms,   |
  |    set RESCHED"    |
  +--------------------+
       |
       v
  +--------------------+
  | Return from IRQ    |
  | Check: RESCHED?    |---YES---> schedule()
  +--------------------+              |
                                      v
                              Pick next task
                              Switch context
                              Resume new task
```

This is how the kernel preempts user programs — the timer interrupt provides the entry point, and the scheduler decides what runs next. Without timer interrupts, a CPU-bound process would never yield the CPU.

## Summary

Interrupts are the heartbeat of a modern operating system. They transform a sequential processor into a responsive, multitasking system:

- **Hardware IRQs** let devices signal the CPU asynchronously, eliminating wasteful polling
- The **IDT** maps each interrupt vector to a handler, set up at boot time
- The CPU automatically **saves state** and **switches stacks** before entering the handler
- **Top-half/bottom-half** splitting keeps handlers fast while deferring heavy work
- **Exceptions** like page faults enable virtual memory through CPU-OS collaboration
- **Timer interrupts** drive the scheduler, enabling preemptive multitasking
- **Interrupt affinity** and multi-queue distribute load across cores for performance

Every time you press a key, receive a network packet, or see your terminal prompt appear after a command finishes — interrupts made it happen.

## References

1. Intel Software Developer Manual, Vol. 3A, Chapter 6: [Interrupt and Exception Handling](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
2. Linux kernel IDT setup: [`arch/x86/kernel/idt.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/idt.c)
3. Linux page fault handler: [`arch/x86/mm/fault.c`](https://github.com/torvalds/linux/blob/master/arch/x86/mm/fault.c)
4. Linux softirq implementation: [`kernel/softirq.c`](https://github.com/torvalds/linux/blob/master/kernel/softirq.c)
5. NAPI networking: [`net/core/dev.c`](https://github.com/torvalds/linux/blob/master/net/core/dev.c)
6. Robert Love, "Linux Kernel Development," 3rd Edition, Chapter 7: Interrupts and Interrupt Handlers
7. Understanding the Linux Kernel, 3rd Edition, Chapter 4: Interrupts and Exceptions
