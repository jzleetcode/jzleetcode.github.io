---
author: JZ
pubDatetime: 2026-06-23T06:23:00Z
modDatetime: 2026-06-23T06:23:00Z
title: System Design - How Coroutines and Async/Await Work Under the Hood
tags:
  - design-concurrency
  - design-system
description:
  "How coroutines power async/await: the difference between stackful and stackless coroutines, how Python transforms async functions into state machines, how Go's goroutines use stack-copying, and how the event loop ties it all together."
---

## Table of contents

## Context

You have probably written code like this in Python:

```python
async def fetch_user(user_id):
    row = await db.query(f"SELECT * FROM users WHERE id = {user_id}")
    return row
```

Or something like this in Go:

```go
go func() {
    resp, err := http.Get("https://api.example.com/users/1")
    // ...
}()
```

Both snippets let you write code that *looks* sequential but *runs* concurrently. The magic behind them is the **coroutine** — a function that can pause its execution, hand control back to a scheduler, and later resume exactly where it left off.

But how does a function "pause" in the middle? Where does its local state go? And why do Python and Go take such different approaches?

This article peels back the abstraction layer by layer.

## What Is a Coroutine?

A normal function (also called a **subroutine**) has one entry point and one exit point. When you call it, it runs to completion:

```
Subroutine:

    caller ---call---> function
                         |
                         | (runs to completion)
                         |
    caller <--return--- function
```

A **coroutine** (cooperative routine) can suspend itself in the middle and be resumed later:

```
Coroutine:

    caller ---call---> coroutine
                         |
                         | (runs partway)
                         |
    caller <--yield---- coroutine  (suspended, state preserved)
       |
       | (does other work)
       |
    caller ---resume--> coroutine  (picks up where it left off)
                         |
                         | (runs to completion)
                         |
    caller <--return--- coroutine
```

The key insight: **a coroutine preserves its local variables, instruction pointer, and stack frame across suspensions.** The question is: where does that state live?

## Two Families: Stackful vs. Stackless

There are two fundamentally different ways to implement coroutines:

```
+---------------------------+-----------------------------+
|     Stackless             |       Stackful              |
|     (Python, Rust, C#)    |       (Go, Lua, Java Loom) |
+---------------------------+-----------------------------+
| Compiler transforms the   | Each coroutine gets its own |
| function into a state     | stack (initially small).    |
| machine. Local vars are   | Suspend/resume just swaps  |
| stored in a heap object.  | the stack pointer.          |
+---------------------------+-----------------------------+
| Can only suspend at       | Can suspend at ANY point    |
| explicit await/yield      | in the call chain (even     |
| points.                   | deep in library code).      |
+---------------------------+-----------------------------+
| Zero extra memory per     | 2-8 KB initial stack per    |
| suspension beyond the     | goroutine (grows as needed).|
| state object.             |                             |
+---------------------------+-----------------------------+
| Must mark every function  | No function coloring. Any   |
| in the chain as async     | function can be called from |
| ("function coloring").    | a goroutine without change. |
+---------------------------+-----------------------------+
```

Let's look at each approach in detail.

## Stackless Coroutines: Python's async/await

### Step 1: The Compiler Transforms Your Function

When Python compiles an `async def` function, it does **not** produce a normal function. Instead, it produces a **coroutine object** — essentially a state machine.

Consider this function:

```python
async def download_and_save(url):
    data = await http_get(url)        # suspension point 1
    path = f"/tmp/{hash(data)}.bin"
    await file_write(path, data)      # suspension point 2
    return path
```

Conceptually, the compiler transforms it into something like:

```python
class _download_and_save_coroutine:
    def __init__(self, url):
        self.url = url
        self.state = 0          # which suspension point we're at
        # locals stored as instance attributes:
        self.data = None
        self.path = None

    def send(self, value):
        if self.state == 0:
            # First entry: start http_get, suspend
            self.state = 1
            return http_get(self.url)   # returns a future/awaitable

        elif self.state == 1:
            # Resumed after http_get completed
            self.data = value           # value = result of http_get
            self.path = f"/tmp/{hash(self.data)}.bin"
            self.state = 2
            return file_write(self.path, self.data)

        elif self.state == 2:
            # Resumed after file_write completed
            raise StopIteration(self.path)  # "return" in generator protocol
```

The key things to notice:

1. **Local variables become object attributes** on the heap (not the C stack).
2. **The function body is split at each `await`** into numbered states.
3. **Each call to `send()`** advances the state machine by one step.

### Step 2: The Event Loop Drives the State Machine

The coroutine object doesn't run by itself. Something must call `send()` on it repeatedly. That something is the **event loop** (like `asyncio` in Python):

```
+------------------------------------------------------------------+
|                         Event Loop                                 |
|                                                                    |
|   ready queue:  [ coro_A, coro_B, coro_C, ... ]                   |
|                                                                    |
|   while ready_queue or io_waiting:                                 |
|       1. Pick next ready coroutine (coro_A)                        |
|       2. Call coro_A.send(result_from_last_await)                  |
|       3. coro_A runs until next 'await', returns a Future          |
|       4. Register Future's I/O with OS (epoll/kqueue)              |
|       5. When I/O completes, put coro_A back in ready queue        |
|                                                                    |
+------------------------------------------------------------------+
          |                                          ^
          | register fd for read/write               | fd ready
          v                                          |
    +------------------------------------------+
    |       OS Kernel (epoll / kqueue / IOCP)   |
    +------------------------------------------+
```

In CPython, the actual implementation lives in [`Lib/asyncio/events.py`](https://github.com/python/cpython/blob/main/Lib/asyncio/events.py) and the selector is in [`Lib/selectors.py`](https://github.com/python/cpython/blob/main/Lib/selectors.py).

### Step 3: The "Coloring" Problem

Because stackless coroutines can only suspend at explicit `await` points, **every function in the call chain** between the event loop and the actual I/O operation must be declared `async`:

```python
# This works:
async def get_user_name(user_id):
    user = await fetch_user(user_id)   # OK, we're async
    return user.name

# This does NOT work:
def get_user_name(user_id):
    user = await fetch_user(user_id)   # SyntaxError! Can't await in non-async
    return user.name
```

This is called **function coloring** (from Bob Nystrom's famous [blog post](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/)). Red (async) functions can call blue (sync) functions, but blue functions cannot call red functions. This forces `async` to spread virally through your codebase.

## Stackful Coroutines: Go's Goroutines

Go takes a completely different approach. Every goroutine gets its own **stack** — a contiguous block of memory where local variables and return addresses live, just like a real OS thread.

### Step 1: Small Stacks That Grow

When you write `go myFunc()`, the Go runtime allocates a goroutine with an initial stack of just **2 KB** (compared to an OS thread's default 1-8 MB). As the goroutine calls deeper functions, the runtime detects when the stack is about to overflow and **copies the entire stack to a larger allocation**:

```
Initial state (2 KB stack):

    +------------------+
    |   frame: main()  |
    +------------------+
    |   frame: foo()   |
    +------------------+
    |   frame: bar()   |  <-- stack pointer
    +------------------+
    |   (free space)   |  <-- only 100 bytes left!
    +------------------+

After growth (4 KB stack, copied):

    +------------------+
    |   frame: main()  |  (same content, new address)
    +------------------+
    |   frame: foo()   |
    +------------------+
    |   frame: bar()   |  <-- stack pointer
    +------------------+
    |                  |
    |   (free space)   |  <-- now 2148 bytes free
    |                  |
    +------------------+
```

The stack growth check is a tiny prologue the compiler inserts at the start of every function. In Go's assembly, it looks like:

```asm
TEXT ·myFunc(SB), NOSPLIT, $0
    // Stack check prologue (inserted by compiler):
    MOVQ  (TLS), CX          // load goroutine struct (g)
    CMPQ  SP, 16(CX)         // compare SP with g.stackguard0
    JLS   morestack          // if SP < stackguard, grow stack
    // ... function body ...
```

The implementation lives in [`runtime/stack.go`](https://github.com/golang/go/blob/master/src/runtime/stack.go) — see `newstack()` and `copystack()`.

### Step 2: Cooperative Scheduling via Function Calls

Go goroutines are **not** preemptively scheduled at arbitrary instructions (well, mostly — Go 1.14 added async preemption via signals, but the primary mechanism is still cooperative). A goroutine yields control at specific points:

- Channel operations (`<-ch`)
- System calls (file I/O, network I/O)
- Function calls (the stack-check prologue is also a scheduling point)
- Explicit `runtime.Gosched()`

When a goroutine suspends (e.g., blocks on a channel read), the Go scheduler saves its **stack pointer** and **program counter**, then loads another goroutine's stack pointer and PC. This is essentially a **context switch** — but in user space, much cheaper than an OS context switch:

```
Go Scheduler (M:N threading):

    +-------+  +-------+  +-------+
    |  G1   |  |  G2   |  |  G3   |     Goroutines (thousands)
    +---+---+  +---+---+  +---+---+
        |          |          |
        v          v          |
    +------+   +------+      |
    |  P0  |   |  P1  |      |          Processors (= GOMAXPROCS)
    +--+---+   +--+---+      |
       |          |           |
       v          v           v
    +------+   +------+   (queued in P's local run queue)
    |  M0  |   |  M1  |                 OS Threads (few)
    +------+   +------+

    P = logical processor (holds the run queue)
    M = OS thread (machine)
    G = goroutine
```

The scheduler code lives in [`runtime/proc.go`](https://github.com/golang/go/blob/master/src/runtime/proc.go). The key function is `schedule()`, which picks the next runnable G and calls `execute()`.

### Step 3: No Function Coloring

Because every goroutine has its own stack, any function — including deeply nested library code — can block without infecting the caller with special syntax:

```go
func getUserName(userID int) string {
    user := fetchUser(userID)  // this can block internally, no async needed
    return user.Name
}

// Works the same whether called from a goroutine or not.
// fetchUser can do network I/O internally; the goroutine just
// gets parked and another one runs.
```

This is why Go doesn't have `async`/`await` keywords. The downside? You cannot tell by reading a function signature whether it might block. In Python, `async def` serves as documentation.

## A Concrete Comparison

Let's fetch 100 URLs concurrently in both styles:

**Python (stackless):**

```python
import asyncio
import aiohttp

async def fetch_one(session, url):
    async with session.get(url) as resp:
        return await resp.text()

async def fetch_all(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_one(session, url) for url in urls]
        return await asyncio.gather(*tasks)

results = asyncio.run(fetch_all(urls))
```

**Go (stackful):**

```go
func fetchAll(urls []string) []string {
    results := make([]string, len(urls))
    var wg sync.WaitGroup

    for i, url := range urls {
        wg.Add(1)
        go func(i int, url string) {
            defer wg.Done()
            resp, _ := http.Get(url)
            body, _ := io.ReadAll(resp.Body)
            results[i] = string(body)
        }(i, url)
    }

    wg.Wait()
    return results
}
```

Memory usage comparison for 100,000 concurrent tasks:

```
+---------------------+-------------------+---------------------+
|                     | Python asyncio    | Go goroutines       |
+---------------------+-------------------+---------------------+
| Per-task overhead   | ~480 bytes        | ~2,048 bytes        |
|                     | (state machine    | (initial stack)     |
|                     |  heap object)     |                     |
+---------------------+-------------------+---------------------+
| 100K tasks          | ~48 MB            | ~200 MB             |
+---------------------+-------------------+---------------------+
| Context switch cost | Very cheap        | Cheap (but more     |
|                     | (advance state    | than Python: must   |
|                     |  machine index)   | save/restore regs)  |
+---------------------+-------------------+---------------------+
| Deepcall stack      | Each await in     | Automatic. Deep     |
| support             | the chain must    | stacks just grow    |
|                     | be async          | transparently       |
+---------------------+-------------------+---------------------+
```

## How Rust Does It (Bonus: Zero-Cost Stackless)

Rust takes Python's stackless approach but goes further: the state machine struct is computed **at compile time** with no heap allocation unless you explicitly `Box::pin` it. The compiler determines the exact size of the state machine and inlines it:

```rust
async fn example() -> i32 {
    let x = fetch_data().await;   // suspension point 1
    let y = process(x).await;     // suspension point 2
    x + y
}

// Compiler generates (conceptually):
enum ExampleStateMachine {
    State0 { /* initial state */ },
    State1 { x: Data, /* waiting for process() */ },
    Done,
}
// Size known at compile time: max(size of each variant)
```

This gives Rust async the memory efficiency of Python (no per-coroutine stack) with zero runtime overhead from heap allocations — at the cost of an even stricter coloring requirement and more complex lifetime rules.

## The Lifecycle of an await

Let's trace exactly what happens when Python executes `data = await http_get(url)`:

```
Step 1: Coroutine calls http_get(url)
        http_get returns a Future object (not the result!)

Step 2: The coroutine yields the Future to the event loop
        (state machine advances: self.state = WAITING_FOR_HTTP)

Step 3: Event loop inspects the Future:
        - Extracts the socket file descriptor
        - Registers it with epoll/kqueue for "readable" events
        - Moves on to run other coroutines

Step 4: ... time passes, other coroutines run ...

Step 5: OS signals that the socket is readable
        (data arrived from the network)

Step 6: Event loop reads the data, resolves the Future

Step 7: Event loop calls coroutine.send(data)
        State machine picks up at state 1:
        self.data = value  # value is the HTTP response

Step 8: Coroutine continues to the next await or returns
```

## Performance: Why Not Just Use Threads?

If OS threads already give us concurrency, why invent coroutines?

```
Cost of context switching (approximate, x86-64 Linux):

    OS thread switch:    ~1-5 microseconds
                         (save/restore all registers, TLB flush,
                          kernel mode transition)

    Goroutine switch:    ~100-300 nanoseconds
                         (save/restore ~15 registers, no kernel,
                          no TLB flush, same address space)

    Python coro switch:  ~50-100 nanoseconds
                         (increment state integer, look up in dict)


Memory per unit of concurrency:

    OS thread:           1-8 MB stack (pre-allocated)
    Goroutine:           2-8 KB stack (grows on demand)
    Python coroutine:    ~480 bytes (heap state machine)
```

At 100,000 concurrent connections (think: a web server), OS threads would need 100-800 GB of stack space alone. Coroutines make million-connection servers practical.

## Summary

```
+-----------------------------------------------------+
|            How Coroutines Work: The Key Ideas        |
+-----------------------------------------------------+
|                                                     |
|  1. A coroutine is a function that can pause and    |
|     resume, preserving its local state.             |
|                                                     |
|  2. Stackless (Python, Rust): compiler transforms   |
|     the function into a state machine. Locals go    |
|     on the heap. Can only pause at await points.    |
|                                                     |
|  3. Stackful (Go, Java Loom): each coroutine gets   |
|     a real (small) stack. Can pause anywhere.       |
|     Runtime copies/grows stacks as needed.          |
|                                                     |
|  4. An event loop (or scheduler) drives all the     |
|     coroutines: picks one, runs it until it         |
|     suspends, then picks another.                   |
|                                                     |
|  5. The OS kernel handles actual I/O waiting        |
|     (epoll/kqueue/IOCP). The event loop just        |
|     dispatches completions to the right coroutine.  |
|                                                     |
+-----------------------------------------------------+
```

## References

- [PEP 492 — Coroutines with async and await syntax](https://peps.python.org/pep-0492/)
- [CPython asyncio source](https://github.com/python/cpython/tree/main/Lib/asyncio)
- [Go runtime scheduler design doc](https://docs.google.com/document/d/1TTj4T2JO42uD5ID9e89oa0sLKhJYD0Y_kqxDv3I3XMw/edit)
- [Go runtime/proc.go](https://github.com/golang/go/blob/master/src/runtime/proc.go)
- [Go runtime/stack.go](https://github.com/golang/go/blob/master/src/runtime/stack.go)
- [Bob Nystrom — What Color is Your Function?](https://journal.stuffwithstuff.com/2015/02/01/what-color-is-your-function/)
- [Rust async book](https://rust-lang.github.io/async-book/)
- [Without Boats — Stackless Coroutines](https://without.boats/blog/why-async-rust/)
- [Kavya Joshi — Understanding Channels (GopherCon 2017)](https://www.youtube.com/watch?v=KBZlN0izeiY)
