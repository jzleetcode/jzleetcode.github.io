---
author: JZ
pubDatetime: 2026-09-23T06:00:00Z
modDatetime: 2026-09-23T06:00:00Z
title: System Design - How Linux Signals Work
tags:
  - design-system
  - design-linux
description:
  "How Linux signals work: signal delivery from kernel to userspace, signal dispositions, the sigaction machinery, signal masks, real-time vs standard signals, and a source code walkthrough of the Linux kernel signal path."
---

## Table of contents

## Context

You press Ctrl+C in your terminal and a running program stops. You run `kill -9 <pid>` and a stubborn process vanishes. You deploy a new version of your service and it gracefully drains connections after receiving SIGTERM. Behind all of these everyday events is the Linux **signal** system — one of the oldest inter-process communication mechanisms in Unix, dating back to the original Unix in 1971.

Signals are software interrupts delivered to a process. They are the kernel's way of saying "something happened that you should know about." A signal can come from the kernel itself (your process divided by zero — SIGFPE), from another process (`kill` command — any signal), or from the process itself (`raise()` or `abort()`).

```
                     Who Can Send Signals?

  +----------+          +----------+          +-----------+
  |  Kernel  |          | Process  |          | Terminal  |
  |          |          |    B     |          |  Driver   |
  +----+-----+          +----+-----+          +-----+-----+
       |                     |                      |
       | SIGSEGV             | kill(pid_A, sig)     | SIGINT (Ctrl+C)
       | SIGFPE              |                      | SIGTSTP (Ctrl+Z)
       | SIGCHLD             |                      | SIGQUIT (Ctrl+\)
       | SIGPIPE             |                      |
       |                     |                      |
       v                     v                      v
  +------------------------------------------------------+
  |                    Process A                          |
  |                                                       |
  |   signal pending bits  -->  signal handler runs       |
  +------------------------------------------------------+
```

Despite being conceptually simple ("deliver a number to a process"), the implementation is surprisingly subtle. Signals interact with system calls, threads, and the process scheduler in ways that trip up even experienced engineers. Let's trace the full journey of a signal from sender to handler.

## The Signal Table: What Signals Exist

Linux defines 64 signals. The first 31 are **standard signals** inherited from POSIX, each with a specific meaning. Signals 34-64 are **real-time signals** (SIGRTMIN to SIGRTMAX) that applications can use for custom purposes.

```
  Standard Signals (1-31)
  ========================
  Signal    Number  Default Action   Common Trigger
  ------    ------  --------------   ---------------
  SIGHUP       1    Terminate        Terminal closed
  SIGINT       2    Terminate        Ctrl+C
  SIGQUIT      3    Core dump        Ctrl+\
  SIGILL       4    Core dump        Illegal instruction
  SIGTRAP      5    Core dump        Breakpoint (debugger)
  SIGABRT      6    Core dump        abort() called
  SIGBUS       7    Core dump        Bad memory alignment
  SIGFPE       8    Core dump        Division by zero
  SIGKILL      9    Terminate        Unconditional kill
  SIGUSR1     10    Terminate        User-defined
  SIGSEGV     11    Core dump        Invalid memory access
  SIGUSR2     12    Terminate        User-defined
  SIGPIPE     13    Terminate        Write to broken pipe
  SIGALRM     14    Terminate        Timer expired
  SIGTERM     15    Terminate        Polite "please stop"
  SIGCHLD     17    Ignore           Child process stopped/exited
  SIGCONT     18    Continue         Resume stopped process
  SIGSTOP     19    Stop             Unconditional stop
  SIGTSTP     20    Stop             Ctrl+Z
  ...
```

Two signals are special: **SIGKILL (9)** and **SIGSTOP (19)** cannot be caught, blocked, or ignored. The kernel enforces this — no matter what your process does, these two signals always take their default action. This is a safety valve: if a process goes haywire, the system administrator can always terminate or stop it.

## Signal Disposition: What Happens When a Signal Arrives

Every signal has a **disposition** — the action the kernel takes when delivering that signal. There are three possible dispositions:

1. **Default action**: The kernel performs the built-in action (terminate, core dump, stop, ignore, or continue).
2. **Ignore**: The signal is silently discarded.
3. **Catch**: A user-defined handler function runs.

A process sets the disposition for each signal using `sigaction()` (or the older, less reliable `signal()`):

```c
#include <signal.h>

void handle_sigterm(int sig) {
    // Graceful shutdown: close connections, flush buffers
    write(STDOUT_FILENO, "Caught SIGTERM, shutting down...\n", 33);
    _exit(0);
}

int main() {
    struct sigaction sa;
    sa.sa_handler = handle_sigterm;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0;

    sigaction(SIGTERM, &sa, NULL);

    // ... run the server ...
}
```

The kernel stores the disposition for each signal in the process's `task_struct`. Here is the relevant structure from [`include/linux/sched/signal.h`](https://github.com/torvalds/linux/blob/master/include/linux/sched/signal.h):

```c
struct signal_struct {
    // ...
    struct sigpending shared_pending;  // signals pending for the thread group
    // ...
};

struct sighand_struct {
    refcount_t count;
    struct k_sigaction action[_NSIG];  // disposition for each signal
    spinlock_t siglock;
};
```

The `action` array has one entry per signal number. Each `k_sigaction` stores either `SIG_DFL` (default), `SIG_IGN` (ignore), or a pointer to your handler function.

## Sending a Signal: The Kernel Side

When process B calls `kill(pid_A, SIGTERM)`, the kernel's journey begins. Let's trace the path through the source code in [`kernel/signal.c`](https://github.com/torvalds/linux/blob/master/kernel/signal.c):

```
  kill(pid, sig)                        userspace
  ──────────────────────────────────────────────
  sys_kill()                            kernel entry
      |
      v
  kill_something_info()
      |
      v
  group_send_sig_info()                 permission check
      |                                 (same uid? has CAP_KILL?)
      v
  do_send_sig_info()
      |
      v
  send_signal_locked()                  core logic
      |
      +---> __sigqueue_alloc()          allocate sigqueue entry
      |
      +---> list_add_tail()             add to pending list
      |
      +---> complete_signal()           pick a thread to wake
               |
               +---> signal_wake_up()   set TIF_SIGPENDING flag
                        |
                        +---> kick the thread if needed
```

The key function is `send_signal_locked()`. It does two things:

1. **Marks the signal as pending**: For standard signals (1-31), this means setting a bit in a bitmask. Since a bitmask can only store "pending or not," multiple deliveries of the same standard signal are merged into one. For real-time signals (34-64), each delivery is queued separately — they are never merged.

2. **Wakes a thread**: The kernel calls `complete_signal()` to find a thread in the target process that is not blocking this signal and sets a flag (`TIF_SIGPENDING`) on it.

```
  Standard Signals: Bitmask (merged)
  ===================================

  Thread receives SIGUSR1 twice before handling it:

  Pending bits:  ... 0 0 1 0 0 0 0 0 0 0     (bit 10 = SIGUSR1)
                                                only ONE delivery

  Real-Time Signals: Queue (each delivery kept)
  ===============================================

  Thread receives SIGRTMIN+3 three times:

  Pending queue: [SIGRTMIN+3] -> [SIGRTMIN+3] -> [SIGRTMIN+3]
                  all THREE will be delivered, in order
```

This merging behavior is why standard signals are called **unreliable** — you cannot count on receiving every signal that was sent. Real-time signals fix this: they queue, they deliver in order, and they carry an optional data payload (`siginfo_t.si_value`).

## Signal Delivery: When Does the Handler Actually Run?

A signal does not interrupt your code the instant it is sent. Instead, the kernel checks for pending signals at specific moments — primarily when **returning from kernel mode to user mode**. This happens after:

- A system call completes (read, write, etc.)
- A hardware interrupt is handled (timer tick, I/O completion)
- The process is scheduled back onto a CPU

```
  The Signal Check Point
  =======================

  User mode:  your_code() ---> calls read() --->
                                                  |
  ────────────────────────────────────────────────┼──────────
                                                  |
  Kernel mode:                              sys_read()
                                                  |
                                              (work...)
                                                  |
                                          exit_to_user_mode()
                                                  |
                                          do_signal()  <--- CHECK HERE
                                                  |
                                          TIF_SIGPENDING set?
                                            /           \
                                          yes            no
                                          /               \
                                  get_signal()        return to
                                      |               user code
                                  handle_signal()
                                      |
                                  setup_rt_frame()
                                      |
                                  (modify user stack
                                   and registers to
                                   call the handler)
```

The function `do_signal()` in [`arch/x86/kernel/signal.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/signal.c) is the gateway. It calls `get_signal()` to dequeue the highest-priority pending signal, then calls `handle_signal()` to set up the handler invocation.

Here is the critical insight: **the kernel does not call your handler directly**. Instead, it rewrites the process's saved registers and stack so that when the process returns to user mode, it "returns" into your signal handler instead of back to the code that was running before. When your handler finishes, a special trampoline (`sigreturn`) makes a system call back to the kernel to restore the original register state.

```
  Stack Frame Setup for Signal Delivery
  =======================================

  Before signal:
  +------------------+
  | saved registers  |  (from the syscall/interrupt)
  | RIP = 0x401234   |  (original return address)
  +------------------+

  After setup_rt_frame():
  +------------------+
  | sigframe:        |
  |   saved regs     |  (original state, for restoration)
  |   signal number  |
  |   siginfo_t      |
  |   ucontext       |
  +------------------+
  | RIP = handler()  |  (process "returns" into handler)
  | return addr =    |
  |   sigreturn      |  (trampoline back to kernel)
  +------------------+

  Execution flow:
  1. Kernel modifies stack and RIP
  2. Process returns to userspace -> lands in handler()
  3. Handler runs and returns
  4. Return address is sigreturn trampoline
  5. sigreturn syscall -> kernel restores original state
  6. Process resumes at 0x401234 as if nothing happened
```

This stack-rewriting trick is elegant: it reuses the existing kernel-to-user return path rather than inventing a separate mechanism. But it also means signal handlers must be **async-signal-safe** — they cannot safely call functions like `malloc()` or `printf()` because the signal might have interrupted those very functions in the middle of modifying shared state.

## Signal Masks: Blocking and Unblocking

Every thread has a **signal mask** — a bitmask of signals that are currently blocked. A blocked signal is not lost; it stays pending until unblocked, at which point it is delivered immediately.

```c
sigset_t mask;
sigemptyset(&mask);
sigaddset(&mask, SIGINT);

// Block SIGINT
sigprocmask(SIG_BLOCK, &mask, NULL);

// ... critical section: Ctrl+C won't interrupt us ...

// Unblock SIGINT (if one is pending, it is delivered now)
sigprocmask(SIG_UNBLOCK, &mask, NULL);
```

Blocking is essential for writing correct signal handlers. Without it, you get race conditions:

```
  Race Condition Without Blocking
  ================================

  Time    Thread               Signal
  ----    ------               ------
   t0     handler() starts
   t1       modifying data     SIGINT arrives again!
   t2       handler() called   <-- reentered before
   t3         modifying data       first call finished
   t4         CORRUPT STATE

  With sa_mask (auto-block during handler)
  ==========================================

  Time    Thread               Signal
  ----    ------               ------
   t0     handler() starts
          (SIGINT auto-blocked)
   t1       modifying data     SIGINT arrives -> PENDING
   t2       modifying data
   t3     handler() returns
          (SIGINT unblocked)
   t4     handler() starts     <-- clean reentry
```

The `sa_mask` field in `struct sigaction` lets you specify additional signals to block while your handler is running. The signal that triggered the handler is automatically blocked too (unless you set `SA_NODEFER`).

## Signals and Threads: The POSIX Model

In a multi-threaded process, signals get more complex. POSIX defines these rules:

1. Each thread has its own signal mask (set via `pthread_sigmask()`).
2. Signal dispositions (handlers) are **shared** across all threads.
3. Process-directed signals (from `kill()`) are delivered to **any one thread** that does not have the signal blocked.
4. Thread-directed signals (from `pthread_kill()` or `tgkill()`) go to a specific thread.

```
  Multi-Threaded Signal Delivery
  ================================

  Process (pid = 1234)
  +----------------------------------------------------+
  |  Shared: signal dispositions (handler table)        |
  |          shared_pending queue                       |
  +----------------------------------------------------+
  |                    |                    |            |
  |  Thread 1         |  Thread 2         |  Thread 3  |
  |  mask: block      |  mask: block      |  mask:     |
  |    SIGUSR1        |    SIGUSR1        |  (empty)   |
  |  pending: {}      |  pending: {}      |  pending:  |
  |                   |                   |    {}      |
  +-------------------+-------------------+------------+

  kill(1234, SIGUSR1) arrives:
    -> Thread 1: blocked, skip
    -> Thread 2: blocked, skip
    -> Thread 3: not blocked, DELIVER HERE
```

A common pattern in server applications is to block all signals in worker threads and dedicate one thread to handle signals using `sigwait()`:

```c
void *signal_thread(void *arg) {
    sigset_t wait_set;
    sigemptyset(&wait_set);
    sigaddset(&wait_set, SIGTERM);
    sigaddset(&wait_set, SIGINT);

    int sig;
    while (1) {
        sigwait(&wait_set, &sig);  // blocks until signal arrives
        if (sig == SIGTERM || sig == SIGINT) {
            // Initiate graceful shutdown
            set_shutdown_flag();
            break;
        }
    }
    return NULL;
}

int main() {
    // Block SIGTERM/SIGINT in all threads (inherited by children)
    sigset_t block_set;
    sigemptyset(&block_set);
    sigaddset(&block_set, SIGTERM);
    sigaddset(&block_set, SIGINT);
    pthread_sigmask(SIG_BLOCK, &block_set, NULL);

    // Spawn worker threads (they inherit the blocked mask)
    for (int i = 0; i < NUM_WORKERS; i++)
        pthread_create(&workers[i], NULL, worker_func, NULL);

    // Dedicated signal-handling thread
    pthread_t sig_tid;
    pthread_create(&sig_tid, NULL, signal_thread, NULL);

    // ...
}
```

This pattern avoids async-signal-safety issues entirely because `sigwait()` receives the signal synchronously — no handler is called, no stack is rewritten, and you can safely use any function.

## Interrupted System Calls: EINTR

When a signal arrives while a process is blocked in a slow system call (like `read()` on a socket), the kernel has a choice:

1. **Restart the system call** after the signal handler returns.
2. **Fail the system call** with `errno = EINTR`.

The behavior depends on the `SA_RESTART` flag in `sigaction`:

```
  Signal Arrives During read()
  ============================

  Without SA_RESTART:                    With SA_RESTART:
  ========================              ========================
  read() blocking...                    read() blocking...
      |                                     |
  signal arrives                        signal arrives
      |                                     |
  handler runs                          handler runs
      |                                     |
  read() returns -1                     kernel restarts read()
  errno = EINTR                         (transparent to caller)
```

This is why you see loops like this in well-written C code:

```c
ssize_t safe_read(int fd, void *buf, size_t count) {
    ssize_t n;
    do {
        n = read(fd, buf, count);
    } while (n == -1 && errno == EINTR);
    return n;
}
```

Not all system calls are restartable. The kernel marks each one internally, and some (like `nanosleep`, `select`, `poll`) always return EINTR so the caller can recheck conditions and timeouts.

## signalfd: Turning Signals Into File Descriptors

Modern Linux offers `signalfd()` — it creates a file descriptor that becomes readable when a signal is pending. This lets you handle signals with `epoll`/`select` alongside network I/O, avoiding the async-signal-safety problem entirely:

```c
sigset_t mask;
sigemptyset(&mask);
sigaddset(&mask, SIGTERM);
sigaddset(&mask, SIGINT);

// Block these signals normally (required for signalfd)
sigprocmask(SIG_BLOCK, &mask, NULL);

// Create a file descriptor for these signals
int sfd = signalfd(-1, &mask, SFD_NONBLOCK);

// Now use epoll to monitor both network sockets AND signals
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = sfd;
epoll_ctl(epoll_fd, EPOLL_CTL_ADD, sfd, &ev);

// In the event loop:
struct signalfd_siginfo si;
read(sfd, &si, sizeof(si));
if (si.ssi_signo == SIGTERM) {
    // Graceful shutdown, in the main event loop
}
```

This approach is used by systemd, nginx, and other event-driven daemons. It unifies signal handling with the event loop, making the code easier to reason about.

## Putting It All Together: A Signal's Full Journey

Let's trace SIGTERM from `kill` to handler:

```
  The Complete Journey of SIGTERM
  ================================

  1. Admin runs: kill 1234

  2. Shell calls: kill(1234, SIGTERM)      // libc wrapper

  3. Kernel: sys_kill()
       -> kill_something_info()
       -> group_send_sig_info()
       -> check permissions (same uid or CAP_KILL)
       -> do_send_sig_info()
       -> send_signal_locked()
            -> set bit 15 in shared_pending.signal
            -> complete_signal()
                 -> find a thread not blocking SIGTERM
                 -> set TIF_SIGPENDING on that thread
                 -> wake_up_state() if thread is sleeping

  4. Target thread:
       -> returns from a syscall (or timer interrupt fires)
       -> exit_to_user_mode()
       -> do_signal()
       -> get_signal()
            -> dequeue SIGTERM from pending
            -> look up action[15] in sighand_struct
            -> action is a handler pointer
       -> handle_signal()
            -> setup_rt_frame()
                 -> save current registers to user stack
                 -> set RIP = handler function address
                 -> set return address = sigreturn trampoline

  5. Thread returns to user mode:
       -> lands in handler()
       -> handler writes "shutting down" and calls _exit()

  6. (If handler returns normally instead):
       -> sigreturn syscall
       -> kernel restores original registers
       -> thread resumes at the instruction it was interrupted at
```

## Common Pitfalls

**1. Using non-async-signal-safe functions in handlers.**
`printf`, `malloc`, `syslog` all use internal locks. If the signal interrupts one of these functions, calling it again from the handler deadlocks.

**2. Forgetting that standard signals merge.**
If you send SIGUSR1 to a process 100 times while it is busy, the handler may only run once. Use real-time signals if you need reliable delivery counts.

**3. Not handling EINTR.**
A signal delivered during `read()`, `write()`, or `connect()` can cause them to fail with EINTR. Always retry or use `SA_RESTART`.

**4. Race between `fork()` and signal delivery.**
After `fork()`, the child inherits the parent's signal dispositions and pending signals. If you install handlers before forking and the child does not reset them, unexpected behavior follows.

**5. SIGPIPE killing your server.**
Writing to a closed socket sends SIGPIPE, which terminates the process by default. Most servers should ignore it: `signal(SIGPIPE, SIG_IGN)`.

## References

1. Linux kernel signal implementation: [`kernel/signal.c`](https://github.com/torvalds/linux/blob/master/kernel/signal.c)
2. x86 signal frame setup: [`arch/x86/kernel/signal.c`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/signal.c)
3. signal(7) man page: [man7.org/linux/man-pages/man7/signal.7.html](https://man7.org/linux/man-pages/man7/signal.7.html)
4. The Linux Programming Interface, Michael Kerrisk — Chapters 20-22 (the definitive reference on POSIX signals)
5. POSIX.1-2017 signal specification: [pubs.opengroup.org/onlinepubs/9699919799/functions/V2_chap02.html#tag_15_04](https://pubs.opengroup.org/onlinepubs/9699919799/functions/V2_chap02.html#tag_15_04)
6. signalfd(2) man page: [man7.org/linux/man-pages/man2/signalfd.2.html](https://man7.org/linux/man-pages/man2/signalfd.2.html)
