---
author: JZ
pubDatetime: 2026-08-31T06:00:00Z
modDatetime: 2026-08-31T06:00:00Z
title: System Design - How the Python GIL (Global Interpreter Lock) Works
tags:
  - design-system
  - design-concurrency
description:
  "How CPython's Global Interpreter Lock works: the GIL data structure, eval loop integration, tick vs timeout-based switching, GIL release during I/O, impact on threading, and the road to removing it (PEP 703, free-threaded Python 3.13+)."
---

## Table of contents

## Context: Why Python Has a GIL

Imagine you are building a house with one set of blueprints. If one builder reads the blueprints while another is erasing and redrawing a wall, chaos ensues. CPython -- the reference implementation of Python written in C -- faces a similar problem. Its core data structures (lists, dicts, every Python object) are shared across all threads, and the interpreter itself was not designed with fine-grained locking in mind.

The root cause is **reference counting**. Every Python object has a reference count:

```c
// Include/object.h (simplified)
typedef struct _object {
    Py_ssize_t ob_refcnt;    // reference count
    PyTypeObject *ob_type;   // pointer to the type object
} PyObject;
```

Every time you assign an object to a variable, pass it to a function, or store it in a list, CPython increments `ob_refcnt`. When the reference goes away, it decrements. When the count hits zero, the object is freed immediately. This is CPython's primary garbage collection mechanism (the cyclic GC handles reference cycles, but refcounting does the bulk of the work).

The problem: **incrementing and decrementing `ob_refcnt` is not atomic.** On a CPU, `ob_refcnt++` compiles to something like:

```
    LOAD  ob_refcnt -> register
    ADD   1
    STORE register -> ob_refcnt
```

If two threads execute this simultaneously on the same object, one increment can be lost (a classic **race condition**). The refcount could drop to zero while the object is still in use, causing a use-after-free crash -- or never reach zero, causing a memory leak.

```
    Thread A                      Thread B
    --------                      --------
    LOAD ob_refcnt (= 1)
                                  LOAD ob_refcnt (= 1)
    ADD 1 (register = 2)
                                  ADD 1 (register = 2)
    STORE 2 -> ob_refcnt
                                  STORE 2 -> ob_refcnt

    Final: ob_refcnt = 2    (should be 3!)
```

You could protect every refcount operation with a per-object lock, but that would mean acquiring and releasing a lock on **every single pointer assignment**. In early benchmarks (and later experiments), this approach slowed single-threaded Python by 30-40%. Since most Python programs are single-threaded, this was unacceptable.

The pragmatic solution, introduced by Guido van Rossum in the earliest days of CPython (circa 1992), was the **Global Interpreter Lock (GIL)**: a single, process-wide mutex that a thread must hold before it can execute Python bytecode or touch any Python objects.

```
                       The GIL Concept

    Thread 1        Thread 2        Thread 3
    +-------+       +-------+       +-------+
    |Python |       |Python |       |Python |
    |bytecode|      |bytecode|      |bytecode|
    +---+---+       +---+---+       +---+---+
        |               |               |
        +-------+-------+-------+-------+
                |               |
                v               v
          +---------------------------+
          |         GIL (mutex)       |     only ONE thread
          |  "You shall not pass...   |     holds this at a
          |   unless I let you."      |     time
          +---------------------------+
                      |
                      v
          +---------------------------+
          |   Python Objects          |
          |   (refcounts, dicts,      |
          |    lists, etc.)           |
          +---------------------------+
```

The GIL makes CPython **thread-safe at the interpreter level** without per-object locking. It also made it easy to integrate C extension modules: library authors did not need to worry about thread safety because the GIL serialized access to all Python objects.

But the GIL has a well-known downside: **only one thread can execute Python bytecode at a time**, even on a machine with 64 CPU cores. This is fine for I/O-bound workloads (where threads spend most of their time waiting), but devastating for CPU-bound parallel workloads.

Let's look at how the GIL is actually implemented.

## The GIL Data Structure

The GIL lives in [`Python/ceval_gil.c`](https://github.com/python/cpython/blob/main/Python/ceval_gil.c) and its struct is defined in [`Include/internal/pycore_gil.h`](https://github.com/python/cpython/blob/main/Include/internal/pycore_gil.h). Here is the core structure (simplified):

```c
// Include/internal/pycore_gil.h (simplified)
struct _gil_runtime_state {
    /* Whether the GIL is taken (1) or free (0). */
    int locked;

    /* Number of GIL switches since interpreter start (for debugging). */
    unsigned long switch_number;

    /* Condition variable that waiting threads sleep on. */
    PyCOND_T cond;

    /* Mutex protecting the above fields. */
    PyMUTEX_T mutex;

    /* Condition variable for the thread releasing the GIL
       to wait until another thread picks it up (force-switching). */
    PyCOND_T switch_cond;
    PyMUTEX_T switch_mutex;

    /* Microseconds a thread waits before requesting the GIL
       from the holder. Default: 5000 (5ms). */
    unsigned long interval;

    /* The PyThreadState of the last thread to hold the GIL. */
    _Py_atomic_address last_holder;
};
```

It is a textbook concurrency primitive: a boolean (`locked`), a mutex, and condition variables. Let's draw it:

```
         struct _gil_runtime_state
        +---------------------------+
        | locked: int               |  0 = free, 1 = held
        +---------------------------+
        | switch_number: ulong      |  total GIL handoffs
        +---------------------------+
        | mutex: PyMUTEX_T          |  protects locked + cond
        +---------------------------+
        | cond: PyCOND_T            |  waiters sleep here
        +---------------------------+
        | switch_mutex              |  for force-switch protocol
        | switch_cond               |
        +---------------------------+
        | interval: ulong (usec)    |  default 5000 (5ms)
        +---------------------------+
        | last_holder: atomic ptr   |  who had it last
        +---------------------------+
```

There is nothing exotic here -- the GIL is fundamentally a mutex with a timed wait. The interesting part is how the interpreter **checks** and **releases** it.

## The Eval Loop and the Eval Breaker

CPython executes Python code by running a giant loop that fetches one bytecode instruction at a time and dispatches it. This loop lives in [`Python/ceval.c`](https://github.com/python/cpython/blob/main/Python/ceval.c), in the function `_PyEval_EvalFrameDefault`.

At the top of each iteration (or periodically, depending on the version), the loop checks a flag called the **eval breaker**:

```c
// Python/ceval.c (simplified structure of the eval loop)
PyObject *
_PyEval_EvalFrameDefault(PyThreadState *tstate, _PyInterpreterFrame *frame, int throwflag)
{
    // ... setup ...

    for (;;) {
        // Check if anything needs attention
        if (_Py_atomic_load_relaxed(&tstate->interp->ceval.eval_breaker)) {
            // Handle pending events: GIL drop, signals, async exceptions...
            if (_Py_HandlePending(tstate) != 0) {
                goto error;
            }
        }

        // Fetch next bytecode instruction
        opcode = next_instr->op.code;

        // Giant switch statement
        switch (opcode) {
            case LOAD_FAST: ...
            case STORE_FAST: ...
            case CALL_FUNCTION: ...
            case BINARY_ADD: ...
            // ... hundreds of opcodes
        }
    }
}
```

The `eval_breaker` is an atomic integer that acts as a **cheap, fast check**. When it is zero, the loop runs at full speed without touching any locks. When it is non-zero, the loop calls `_Py_HandlePending()`, which figures out what needs attention.

```
                 The Eval Loop (one thread)

                  +------------------+
                  |  eval_breaker    |  <-- atomic flag
                  |  check           |
                  +--------+---------+
                           |
              +------------+------------+
              |                         |
              v                         v
         eval_breaker == 0         eval_breaker != 0
              |                         |
              v                         v
         +----------+          +-------------------+
         | Execute  |          | _Py_HandlePending()|
         | next     |          |   - drop GIL?     |
         | bytecode |          |   - handle signal?|
         | (fast    |          |   - async except? |
         |  path)   |          +-------------------+
         +----------+                   |
              |                         v
              +<------------------------+
              |
              v
         fetch next instruction
         (loop continues)
```

The `eval_breaker` can be set by multiple sources:

| Bit/Flag | Meaning |
|----------|---------|
| `_PY_GIL_DROP_REQUEST` | Another thread wants the GIL |
| `_PY_SIGNALS_PENDING` | A Unix signal was received |
| `_PY_CALLS_TO_DO` | Pending calls from `Py_AddPendingCall` |
| `_PY_ASYNC_EXCEPTION` | An async exception (e.g., `KeyboardInterrupt`) |
| `_PY_GC_SCHEDULED` | GC collection needed |

This design is elegant: the hot path (no pending events) is just one atomic load and a branch that is almost always not-taken. The CPU's branch predictor learns this pattern quickly, so the per-instruction overhead is near zero.

## How the GIL Is Acquired and Released

The actual GIL operations are in [`Python/ceval_gil.c`](https://github.com/python/cpython/blob/main/Python/ceval_gil.c). Let's trace through them.

### Taking the GIL: `take_gil()`

When a thread wants to execute Python bytecode, it calls `take_gil()`:

```c
// Python/ceval_gil.c (simplified)
static void
take_gil(PyThreadState *tstate)
{
    // Lock the GIL mutex
    MUTEX_LOCK(gil->mutex);

    if (!_Py_atomic_load_relaxed(&gil->locked)) {
        // GIL is free! Grab it.
        goto _ready;
    }

    // GIL is held by someone else. Wait.
    while (_Py_atomic_load_relaxed(&gil->locked)) {
        // Timed wait: sleep up to gil->interval microseconds (default 5ms)
        int timed_out = 0;
        COND_TIMED_WAIT(gil->cond, gil->mutex, gil->interval, timed_out);

        if (timed_out &&
            _Py_atomic_load_relaxed(&gil->locked) &&
            gil->holder != tstate)
        {
            // We waited long enough. Ask the holder to drop the GIL.
            SET_GIL_DROP_REQUEST(tstate->interp);
            // Keep waiting...
        }
    }

_ready:
    // We got the GIL!
    _Py_atomic_store_relaxed(&gil->locked, 1);
    gil->holder = tstate;

    MUTEX_UNLOCK(gil->mutex);
}
```

The flow:

```
    take_gil(tstate)
         |
         v
    +--- MUTEX_LOCK(gil->mutex) ---+
    |                               |
    v                               |
    gil->locked == 0?               |
    +------+-------+                |
    | yes  | no    |                |
    v      v       |                |
  grab  COND_TIMED_WAIT            |
  it!   (sleep up to 5ms)          |
    |      |                        |
    |      v                        |
    |   timed out?                  |
    |   +------+-------+           |
    |   | yes  | no    |           |
    |   v      |       |           |
    |  SET_GIL_DROP    |           |
    |  _REQUEST        |           |
    |   |      |       |           |
    |   +------+-------+           |
    |          |                    |
    |          v                    |
    |   (loop: check locked again) |
    |          |                    |
    +<---------+                    |
    |                               |
    v                               |
    gil->locked = 1                 |
    gil->holder = tstate            |
    MUTEX_UNLOCK(gil->mutex) -------+
```

The key insight: the waiting thread does not just spin. It sleeps on a condition variable with a **timeout** (default 5 milliseconds). If it wakes up and the GIL is still held, it **sets a drop request flag** in the eval breaker. The holding thread will see this flag on its next bytecode check and release the GIL voluntarily.

### Dropping the GIL: `drop_gil()`

```c
// Python/ceval_gil.c (simplified)
static void
drop_gil(PyInterpreterState *interp, PyThreadState *tstate)
{
    // Mark GIL as free
    MUTEX_LOCK(gil->mutex);
    _Py_atomic_store_relaxed(&gil->locked, 0);
    COND_SIGNAL(gil->cond);   // wake one waiting thread
    MUTEX_UNLOCK(gil->mutex);

    // If a drop was requested, wait until the other thread actually
    // picks up the GIL (force-switch protocol)
    if (_Py_eval_breaker_bit_is_set(interp, _PY_GIL_DROP_REQUEST)) {
        MUTEX_LOCK(gil->switch_mutex);
        if (gil->last_holder == tstate) {
            // Wait until someone else takes the GIL
            RESET_GIL_DROP_REQUEST(interp);
            COND_WAIT(gil->switch_cond, gil->switch_mutex);
        }
        MUTEX_UNLOCK(gil->switch_mutex);
    }
}
```

Notice the **force-switch protocol**: when a drop was requested, the releasing thread waits on `switch_cond` until another thread actually takes the GIL. This prevents the pathological case where the same thread immediately re-acquires the GIL before the waiter can wake up (a problem called **GIL starvation** or the **convoy effect**).

## The _Py_HandlePending Function

When the eval loop sees that `eval_breaker` is non-zero, it calls [`_Py_HandlePending()`](https://github.com/python/cpython/blob/main/Python/ceval.c) (previously called `_Py_MakeRecCheck` or scattered inline checks in older versions). This function is the central dispatch for all pending events:

```c
// Python/ceval.c (simplified)
int
_Py_HandlePending(PyThreadState *tstate)
{
    PyInterpreterState *interp = tstate->interp;

    // 1. Handle GIL drop request
    if (_Py_eval_breaker_bit_is_set(interp, _PY_GIL_DROP_REQUEST)) {
        // Drop the GIL and immediately try to re-acquire it.
        // This gives other threads a chance to run.
        drop_gil(interp, tstate);
        take_gil(tstate);
    }

    // 2. Handle signals (main thread only)
    if (_Py_eval_breaker_bit_is_set(interp, _PY_SIGNALS_PENDING)) {
        if (handle_signals(tstate) != 0) {
            return -1;  // exception raised by signal handler
        }
    }

    // 3. Handle pending calls (Py_AddPendingCall)
    if (_Py_eval_breaker_bit_is_set(interp, _PY_CALLS_TO_DO)) {
        if (make_pending_calls(tstate) != 0) {
            return -1;
        }
    }

    // 4. Handle async exceptions
    if (_Py_eval_breaker_bit_is_set(interp, _PY_ASYNC_EXCEPTION)) {
        // ...raise the pending exception...
    }

    // 5. Handle GC
    if (_Py_eval_breaker_bit_is_set(interp, _PY_GC_SCHEDULED)) {
        // ...run a GC collection...
    }

    return 0;
}
```

The GIL drop-and-reacquire pattern is the heart of thread switching in CPython:

```
    Thread A (holding GIL)              Thread B (waiting)
    ----------------------              ------------------
    executing bytecodes...
    ...
    eval_breaker check -> non-zero!
    _Py_HandlePending():
      drop_gil()  ------------------>   (wakes up)
                                        take_gil() succeeds!
                                        executing bytecodes...
      take_gil()  (waits...)
                                        ...
                                        eval_breaker check
                                        drop_gil() -------->  (Thread A wakes up)
      take_gil() succeeds!
      executing bytecodes...
```

## The Old Tick System vs the New Timeout System

### The Old Way: Ticks (Python 2.x -- 3.1)

Before Python 3.2, the GIL used a **tick-based** switching mechanism. Every 100 bytecode instructions (configurable via `sys.setcheckinterval()`), the interpreter would release the GIL:

```c
// Old Python 2.x approach (conceptual)
static int ticker = 100;

// In the eval loop:
if (--ticker < 0) {
    ticker = check_interval;  // default 100
    release_GIL();
    acquire_GIL();
}
```

This had several serious problems:

1. **Unfairness on multi-core systems.** When a thread released the GIL, it immediately tried to re-acquire it. On a multi-core machine, the releasing thread was already running on a CPU and could grab the GIL before the waiting thread's core could even respond to the condition variable signal. David Beazley demonstrated in his famous 2009 PyCon talk that a CPU-bound thread could starve an I/O-bound thread for extended periods.

2. **Bytecode instructions are not uniform.** Some instructions (like `LOAD_FAST`) take nanoseconds. Others (like `CALL_FUNCTION` calling into a C extension) could take milliseconds. Counting 100 instructions does not guarantee any meaningful time quantum.

3. **The convoy effect.** On multi-core systems, the GIL bouncing between threads caused massive overhead from cache invalidation, futex system calls, and pipeline stalls. Beazley measured that a two-thread CPU-bound program could run **2x slower** than a single-threaded one.

```
    The Old Tick Problem (multi-core)

    Core 0 (Thread A)         Core 1 (Thread B)
    -----------------         -----------------
    running bytecodes...      WAITING for GIL
    ...100 ticks...
    release GIL
    acquire GIL  <-- wins!    (woke up, but too late)
    running bytecodes...      WAITING for GIL (again!)
    ...100 ticks...
    release GIL
    acquire GIL  <-- wins!    (still loses)
    ...                       STARVED
```

### The New Way: Timeout-Based (Python 3.2+)

David Beazley's research (see References) prompted Antoine Pitrou to redesign the GIL for Python 3.2 ([BPO-7946](https://bugs.python.org/issue7946)). The new GIL replaced ticks with a **time-based** mechanism:

1. A waiting thread sleeps for `interval` microseconds (default 5000 = 5ms).
2. If it wakes up and the GIL is still held, it sets the `_PY_GIL_DROP_REQUEST` flag.
3. The holding thread sees the flag in its eval loop and drops the GIL.
4. The **force-switch protocol** ensures the waiting thread actually gets the GIL (preventing the immediate re-acquisition problem).

```
    The New Timeout System (Python 3.2+)

    Thread A (holding GIL)              Thread B (wants GIL)
    ----------------------              --------------------
    executing bytecodes...              COND_TIMED_WAIT(5ms)
    ...                                 ...
    ...                                 *timeout!*
    ...                                 SET_GIL_DROP_REQUEST
    ...
    eval_breaker != 0!
    _Py_HandlePending:
      drop_gil()
      [waits on switch_cond]  ------->  take_gil() succeeds!
                                        [signals switch_cond]
      [woken up]                        executing bytecodes...
      take_gil() -> waits...
      ...
```

You can tune the switch interval at runtime:

```python
>>> import sys
>>> sys.getswitchinterval()       # default
0.005                              # 5ms
>>> sys.setswitchinterval(0.001)  # set to 1ms
```

The timeout approach solved the worst pathologies:
- **Fairness:** the force-switch protocol guarantees a handoff.
- **Predictable timing:** switching is based on wall-clock time, not bytecode counts.
- **Reduced overhead:** fewer spurious wakeups on single-threaded programs (no ticking every 100 instructions).

## GIL Release During I/O

The GIL does not need to be held when a thread is waiting for I/O, sleeping, or doing computation in a C extension that does not touch Python objects. CPython provides macros to release and reacquire the GIL around such operations:

```c
// Include/cpython/pystate.h

#define Py_BEGIN_ALLOW_THREADS  { \
        PyThreadState *_save; \
        _save = PyEval_SaveThread();  // releases the GIL

#define Py_END_ALLOW_THREADS    \
        PyEval_RestoreThread(_save);  // reacquires the GIL \
    }
```

These macros are used extensively throughout the CPython standard library. For example, in file I/O, socket operations, `time.sleep()`, and hash computations:

```c
// Modules/_io/fileio.c (simplified)
static PyObject *
fileio_readall(fileio *self)
{
    // ... setup ...

    Py_BEGIN_ALLOW_THREADS     // <-- release the GIL
    n = read(self->fd, buf, bufsize);
    Py_END_ALLOW_THREADS       // <-- reacquire the GIL

    // ... process result (needs GIL for Python objects) ...
}
```

This is why **I/O-bound Python programs benefit from threading.** While one thread waits for a network response, another can execute Python bytecode:

```
    Thread A (HTTP request)         Thread B (computation)
    -----------------------         ----------------------
    [holds GIL]
    preparing request...
    Py_BEGIN_ALLOW_THREADS
      [releases GIL] ------------>  [acquires GIL]
      waiting for network...        executing Python code...
      ...                           ...
      recv() returns                ...
    Py_END_ALLOW_THREADS            ...
      [waits for GIL]              [still running]
                                    ...
                                    drop_gil() ----------->  [Thread A gets GIL]
                                    [waits]                  processing response...
```

Many popular C extensions also release the GIL for heavy computation. NumPy, for instance, releases the GIL during array operations, allowing true parallel execution of numerical code across threads.

## Impact: CPU-Bound vs I/O-Bound

The GIL's effect depends entirely on the nature of your workload.

### I/O-Bound: Threading Works Well

Programs that spend most of their time waiting (network requests, disk I/O, database queries) benefit from threading because the GIL is released during the wait:

```python
import threading
import urllib.request

def fetch(url):
    urllib.request.urlopen(url).read()  # GIL released during network I/O

urls = ["https://example.com"] * 10
threads = [threading.Thread(target=fetch, args=(u,)) for u in urls]
for t in threads: t.start()
for t in threads: t.join()
# Runs ~10x faster than sequential!
```

### CPU-Bound: Threading Hurts

Programs that do pure computation in Python bytecode gain **nothing** from threading -- and may actually get slower due to GIL contention overhead:

```python
import threading

def count():
    i = 0
    while i < 100_000_000:
        i += 1

# Single-threaded: ~5 seconds
count()

# Two threads: ~5-7 seconds (SLOWER!)
t1 = threading.Thread(target=count)
t2 = threading.Thread(target=count)
t1.start(); t2.start()
t1.join(); t2.join()
```

```
    CPU-Bound Benchmark (conceptual)

    Threads     Single-core     Multi-core (4 cores)
    -------     -----------     --------------------
    1           5.0s            5.0s
    2           5.0s            5.5s  (GIL contention overhead)
    4           5.0s            6.2s  (even more contention)

    Compare with multiprocessing (no GIL):
    Threads     Single-core     Multi-core (4 cores)
    -------     -----------     --------------------
    1           5.0s            5.0s
    2           5.0s            2.5s  (true parallelism!)
    4           5.0s            1.3s
```

## Workarounds

Over the decades, the Python community has developed several strategies to work around the GIL.

### 1. multiprocessing

The `multiprocessing` module sidesteps the GIL entirely by spawning separate OS processes, each with its own Python interpreter and its own GIL:

```python
from multiprocessing import Pool

def heavy_computation(n):
    return sum(i * i for i in range(n))

with Pool(4) as pool:
    results = pool.map(heavy_computation, [10**7] * 4)
# Each worker runs in a separate process -- true parallelism
```

The trade-off: inter-process communication (via pipes or shared memory) is much more expensive than sharing data between threads.

```
    multiprocessing Architecture

    +------------------+    +------------------+
    | Process 1        |    | Process 2        |
    | [Python interp]  |    | [Python interp]  |
    | [own GIL]        |    | [own GIL]        |
    | [own memory]     |    | [own memory]     |
    +--------+---------+    +--------+---------+
             |                       |
             +----------+------------+
                        |
                  +-----+------+
                  |   IPC      |
                  | (pipes,    |
                  |  shmem,    |
                  |  sockets)  |
                  +------------+
```

### 2. C Extensions That Release the GIL

Libraries like NumPy, SciPy, and Pillow release the GIL before entering their C/Fortran computation kernels. This means you can get true parallelism for numerical work even with threads:

```python
import numpy as np
import threading

def matrix_multiply():
    a = np.random.rand(1000, 1000)
    b = np.random.rand(1000, 1000)
    for _ in range(10):
        np.dot(a, b)  # GIL is released inside numpy

# These actually run in parallel!
threads = [threading.Thread(target=matrix_multiply) for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()
```

### 3. asyncio (Cooperative Concurrency)

For I/O-bound workloads, `asyncio` provides concurrency within a single thread using coroutines. Since everything runs in one thread, the GIL is never contended:

```python
import asyncio
import aiohttp

async def fetch(session, url):
    async with session.get(url) as response:
        return await response.read()

async def main():
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, "https://example.com") for _ in range(100)]
        results = await asyncio.gather(*tasks)
# One thread, no GIL contention, highly concurrent I/O
```

### 4. concurrent.futures

The `concurrent.futures` module provides a unified interface for both thread-based and process-based parallelism:

```python
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

# CPU-bound: use processes
with ProcessPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(cpu_heavy_task, data))

# I/O-bound: use threads
with ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(io_heavy_task, urls))
```

### 5. Subinterpreters (PEP 554)

Python 3.12+ introduced per-interpreter GILs. Each subinterpreter gets its own GIL, allowing true parallelism between interpreters while maintaining GIL safety within each one:

```python
# Python 3.12+ (experimental)
import interpreters

interp = interpreters.create()
interp.run("print('Hello from a subinterpreter')")
# This interpreter has its own GIL!
```

## The GIL Lifecycle: A Complete Picture

Let's trace the complete lifecycle of GIL interactions for a multi-threaded Python program:

```
    Program Start
         |
         v
    +--------------------+
    | Py_Initialize()    |
    | create_gil()       |   GIL is created
    | take_gil()         |   main thread grabs it
    +----+---------------+
         |
         v
    Main Thread running
    (holds GIL)
         |
         v
    t = threading.Thread(target=worker)
    t.start()
         |
         +----> spawns OS thread
         |           |
         |           v
         |      new thread calls take_gil()
         |      COND_TIMED_WAIT (sleeping)
         |
    (main thread continues)
    ...bytecodes...
    eval_breaker check
         |
         v
    5ms timeout fires in new thread
    SET_GIL_DROP_REQUEST
         |
    main thread sees drop request
    _Py_HandlePending():
      drop_gil()  ---------->  new thread: take_gil() OK!
      take_gil()  (waiting)    new thread runs bytecodes...
         .                          |
         .                     5ms timeout (main thread)
         .                     SET_GIL_DROP_REQUEST
         .                          |
         .                     new thread drops GIL ------> main thread gets GIL
         .
    (and so on, switching every ~5ms)
         |
         v
    t.join()
    Py_Finalize()
    destroy_gil()
```

## The Future: Removing the GIL

The GIL has been CPython's most debated feature for over 30 years. Multiple attempts to remove it have been made (and abandoned):

- **1999: Greg Stein's free-threaded patch** for Python 1.5. It replaced the GIL with per-object locks. Single-threaded performance dropped by ~40%, and the patch was not merged.
- **2007: Various proposals** during the Python 3.0 era. None gained traction due to C extension compatibility concerns.

### PEP 703: Making the GIL Optional

In 2023, Sam Gross (Meta) proposed [PEP 703](https://peps.python.org/pep-0703/) -- a plan to make the GIL optional in CPython. Unlike previous attempts, PEP 703 introduced several clever techniques to maintain acceptable single-threaded performance:

**1. Biased Reference Counting**

The key insight: most objects are only accessed by the thread that created them. Biased refcounting uses two separate counts:

```
    Traditional refcount:         Biased refcount:
    +------------------+          +------------------+
    | ob_refcnt: 42    |          | local_refcnt: 38 |  thread-local, no atomics
    +------------------+          +------------------+
                                  | shared_refcnt: 4 |  atomic ops (rare)
                                  +------------------+
```

The owning thread manipulates `local_refcnt` with plain (non-atomic) increments and decrements -- the same speed as the current GIL-protected refcount. Only when another thread needs to adjust the refcount does it use the slower atomic `shared_refcnt`. Since most refcount operations are thread-local, the overall performance impact is small.

**2. Per-Object Locking**

Instead of one global lock, each object gets a lightweight lock embedded in the object header. Most of the time, these locks are never contended:

```
    Object Header (free-threaded CPython)
    +-----------------------------------+
    | ob_tid:      thread ID of owner   |    (used for biased refcounting)
    | ob_reflocal: local refcount       |
    | ob_refshared: shared refcount     |    (atomic)
    | ob_type:     type pointer         |
    +-----------------------------------+

    Container operations (dict, list) use per-object
    critical sections instead of relying on the GIL:

    Py_BEGIN_CRITICAL_SECTION(op);
    // ... mutate container ...
    Py_END_CRITICAL_SECTION();
```

**3. Deferred Reference Counting**

Some objects (like top-level module variables and interned strings) are referenced so frequently that even biased refcounting would be expensive. Free-threaded CPython can **defer** refcounting for these objects entirely -- their memory is managed by the garbage collector instead.

**4. Mimalloc**

Free-threaded CPython replaced the default memory allocator with [mimalloc](https://github.com/microsoft/mimalloc), a thread-safe allocator with per-thread heaps. This avoids allocator lock contention that would otherwise replace the GIL bottleneck.

### Free-Threaded Python: The Build

Starting with Python 3.13 (released October 2024), CPython can be built in **free-threaded mode** (`--disable-gil` configure flag). This produces a separate binary (typically `python3.13t`) that runs without the GIL:

```bash
# Building free-threaded CPython
./configure --disable-gil
make -j$(nproc)

# Check if GIL is disabled
./python -c "import sys; print(sys._is_gil_enabled())"
# False
```

```
    GIL vs Free-Threaded CPython

    Traditional CPython (with GIL):

    Thread 1 ----[===]------[===]------[===]------>
    Thread 2 ---------[===]------[===]------[===]->
    Thread 3 ----waiting---waiting---waiting------->
                     ^^^           ^^^
                     GIL switches

    Free-Threaded CPython (no GIL):

    Thread 1 ----[=============================]--->
    Thread 2 ----[=============================]--->
    Thread 3 ----[=============================]--->
                  ^^^ true parallel execution ^^^
```

### Current State and Timeline

As of 2026, the free-threaded build is still considered **experimental** but is maturing rapidly:

- **Python 3.13 (Oct 2024):** First release with free-threaded build option. Experimental, opt-in.
- **Python 3.14 (Oct 2025):** Continued stabilization. More C extensions adapted.
- **Future:** The goal is to eventually make free-threaded mode the default and remove the GIL entirely, though no specific version has been committed to.

The biggest challenge is the **C extension ecosystem.** Thousands of C extensions were written assuming the GIL protects them. Each one needs to be audited and potentially modified to be thread-safe. The `Py_BEGIN_CRITICAL_SECTION` / `Py_END_CRITICAL_SECTION` macros help extension authors add targeted locking where needed.

## Internals Deep Dive: GIL Source Code Walkthrough

For those who want to read the source code themselves, here is a roadmap of the key files:

```
    cpython/
    +-- Include/
    |   +-- internal/
    |       +-- pycore_gil.h            GIL struct definition
    |       +-- pycore_ceval.h          eval_breaker flags
    |
    +-- Python/
    |   +-- ceval_gil.c                 take_gil(), drop_gil(), create_gil()
    |   +-- ceval.c                     _PyEval_EvalFrameDefault (eval loop)
    |   |                               _Py_HandlePending()
    |   +-- pystate.c                   PyEval_SaveThread / RestoreThread
    |
    +-- Modules/
        +-- _io/fileio.c               example of Py_BEGIN_ALLOW_THREADS
        +-- socketmodule.c             example of Py_BEGIN_ALLOW_THREADS
```

### create_gil()

```c
// Python/ceval_gil.c
static void
create_gil(struct _gil_runtime_state *gil)
{
    MUTEX_INIT(gil->mutex);
    COND_INIT(gil->cond);
    MUTEX_INIT(gil->switch_mutex);
    COND_INIT(gil->switch_cond);
    _Py_atomic_store_relaxed(&gil->locked, 0);
    gil->interval = DEFAULT_INTERVAL;  // 5000 microseconds
}
```

### The eval_breaker flags

```c
// Include/internal/pycore_ceval.h
#define _PY_GIL_DROP_REQUEST_BIT     0
#define _PY_SIGNALS_PENDING_BIT      1
#define _PY_CALLS_TO_DO_BIT          2
#define _PY_ASYNC_EXCEPTION_BIT      3
#define _PY_GC_SCHEDULED_BIT         4
```

Each flag is a single bit in the `eval_breaker` integer. Setting any bit makes the integer non-zero, triggering the slow path in the eval loop.

### PyEval_SaveThread / PyEval_RestoreThread

These are the functions behind `Py_BEGIN_ALLOW_THREADS` / `Py_END_ALLOW_THREADS`:

```c
// Python/pystate.c (simplified)
PyThreadState *
PyEval_SaveThread(void)
{
    PyThreadState *tstate = _PyThreadState_GET();
    drop_gil(tstate->interp, tstate);
    return tstate;
}

void
PyEval_RestoreThread(PyThreadState *tstate)
{
    take_gil(tstate);
    _PyThreadState_Attach(tstate);
}
```

## Common Misconceptions

**"The GIL makes Python thread-safe."** Only at the interpreter level. Your own data structures still need locks:

```python
import threading

counter = 0

def increment():
    global counter
    for _ in range(1_000_000):
        counter += 1  # NOT atomic! This is LOAD, ADD, STORE in bytecode

threads = [threading.Thread(target=increment) for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()
print(counter)  # Less than 4,000,000 -- race condition!
```

**"The GIL means Python cannot use multiple cores."** Python *threads* cannot run Python *bytecode* in parallel, but processes can (via `multiprocessing`), and C extensions can release the GIL for parallel computation.

**"Removing the GIL will make Python 4x faster on 4 cores."** For CPU-bound pure Python code, yes, the speedup potential is near-linear. But most real programs are not purely CPU-bound, and the per-object locking overhead slightly reduces single-threaded performance (benchmarks for free-threaded Python 3.13 showed ~5-10% single-thread slowdown).

**"asyncio replaces threading."** asyncio is for I/O-bound concurrency within a single thread. It does not help with CPU-bound parallelism and is not a replacement for threading or multiprocessing in all cases.

## Summary

| Concept | Details |
|---------|---------|
| **What is the GIL** | A process-wide mutex in CPython that serializes bytecode execution |
| **Why it exists** | Protects reference counts and interpreter state from data races |
| **Data structure** | Mutex + condition variable + timeout interval (5ms default) |
| **Eval breaker** | Atomic flag checked every bytecode; triggers GIL drop when set |
| **Old system (pre-3.2)** | Tick-based: release every 100 instructions; unfair on multi-core |
| **New system (3.2+)** | Timeout-based: 5ms interval + force-switch protocol |
| **I/O release** | `Py_BEGIN_ALLOW_THREADS` / `Py_END_ALLOW_THREADS` macros |
| **CPU-bound impact** | No parallelism; threads may be slower than single-threaded |
| **I/O-bound impact** | Threading works well because GIL is released during I/O waits |
| **Workarounds** | multiprocessing, GIL-releasing C extensions, asyncio, subinterpreters |
| **PEP 703** | Optional GIL removal via biased refcounting + per-object locks |
| **Free-threaded build** | Available since Python 3.13 (`--disable-gil`), experimental |

The GIL is a pragmatic engineering trade-off from 1992 that became deeply embedded in CPython's architecture. It made single-threaded Python fast, C extensions easy to write, and the interpreter simple to maintain -- at the cost of true multi-threaded parallelism. After decades of living with this trade-off, the Python community is finally within reach of a GIL-free future, one careful refactoring at a time.

## References

1. **CPython source -- ceval_gil.c** (GIL implementation): [github.com/python/cpython/blob/main/Python/ceval_gil.c](https://github.com/python/cpython/blob/main/Python/ceval_gil.c)
2. **CPython source -- ceval.c** (eval loop): [github.com/python/cpython/blob/main/Python/ceval.c](https://github.com/python/cpython/blob/main/Python/ceval.c)
3. **CPython source -- pycore_gil.h** (GIL struct): [github.com/python/cpython/blob/main/Include/internal/pycore_gil.h](https://github.com/python/cpython/blob/main/Include/internal/pycore_gil.h)
4. **David Beazley -- "Understanding the Python GIL"** (2009, updated 2010): [dabeaz.com/GIL](https://dabeaz.com/GIL/)
5. **David Beazley -- "Inside the Python GIL"** (PyCon 2009 talk): [dabeaz.com/python/GIL.pdf](https://dabeaz.com/python/GIL.pdf)
6. **Antoine Pitrou -- New GIL** (BPO-7946): [bugs.python.org/issue7946](https://bugs.python.org/issue7946)
7. **PEP 703 -- Making the Global Interpreter Lock Optional in CPython**: [peps.python.org/pep-0703](https://peps.python.org/pep-0703/)
8. **Sam Gross -- nogil project**: [github.com/colesbury/nogil](https://github.com/colesbury/nogil)
9. **PEP 554 -- Multiple Interpreters in the Stdlib**: [peps.python.org/pep-0554](https://peps.python.org/pep-0554/)
10. **"Python 3.13 Release Notes"** (free-threaded build): [docs.python.org/3.13/whatsnew/3.13.html](https://docs.python.org/3.13/whatsnew/3.13.html)
11. **Larry Hastings -- "Removing Python's GIL: The Gilectomy"** (PyCon 2016): [youtube.com/watch?v=P3AyI_u66Bw](https://www.youtube.com/watch?v=P3AyI_u66Bw)
12. **Greg Stein's free-threading patch** (1999): [mail.python.org/pipermail/python-dev](https://mail.python.org/pipermail/python-dev/1999-June/thread.html)
