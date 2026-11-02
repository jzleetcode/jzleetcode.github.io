---
author: JZ
pubDatetime: 2026-11-02T19:35:00Z
modDatetime: 2026-11-02T19:35:00Z
title: System Design - How Structured Concurrency Works
tags:
  - design-system
  - design-concurrency
description: "Structured concurrency makes concurrent tasks belong to a lexical scope: the scope waits for them, propagates failure, and cancels unfinished siblings so work cannot quietly outlive its request."
---

## Table of contents

## A request with a hidden afterlife

Imagine a product page that needs a price, available inventory, and a recommendation ribbon. A straightforward server handler starts three asynchronous operations and then waits for all three:

```text
request
  ├── fetch price
  ├── fetch inventory
  └── fetch recommendations
```

The page is useful only if price and inventory are current. If inventory fails, keeping the recommendation call alive is usually wasteful. Worse, if the client disconnects or the handler returns early, a background task can keep consuming a connection, CPU time, memory, and logs after nobody can use its answer.

**Structured concurrency** gives that work a visible lifetime. Tasks are children of a scope; the scope has an owner and cannot finish while its children are still running. A child failure and a cancellation are part of the scope's defined policy instead of afterthoughts scattered through callbacks.

It is a design discipline, not one particular runtime. Java's [`StructuredTaskScope`](https://openjdk.org/jeps/505), Kotlin's [`coroutineScope`](https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html#scope-and-coroutine-builder), and Python's [`asyncio.TaskGroup`](https://docs.python.org/3/library/asyncio-task.html#task-groups) expose versions of the same idea.

## The shape: a tree instead of a loose pile

A traditional "fire and forget" design creates work that is hard to locate later:

```text
HTTP handler ---- starts ----> task A
     |
     +------- starts ----> task B
     |
     +------- returns

task A and task B may still be running; their owner is no longer obvious.
```

In a structured design, the handler opens a scope and creates tasks only inside it:

```text
HTTP handler
     |
     v
+---------------------- task scope -----------------------+
|  child: fetch price                                      |
|  child: fetch inventory                                  |
|  child: fetch recommendations                            |
+---------------------------------------------------------+
     |
     v
handler returns only after the scope's closing policy runs
```

The word _structured_ is borrowed from structured programming. An `if` or `while` has a clear entry and exit in the source code. A task scope should have the same property: start children here, collect or stop them here, and leave no accidental children behind.

This does not mean all concurrency must be short-lived. A server's process-wide scheduler, message consumer, or metrics exporter can be intentionally long-lived. The key is to give that work an explicit long-lived owner rather than pretending it belongs to one request.

## What a scope promises

A useful task scope has three linked rules.

1. **Joining:** closing the scope waits until its children reach a terminal state, unless its policy deliberately interrupts them.
2. **Failure handling:** the owner can see failures at the join point instead of discovering an exception in an unrelated log later.
3. **Cancellation propagation:** when the owner is cancelled—or when the policy says one child failure makes the result impossible—the scope asks remaining children to stop.

The combined effect is easier to reason about than each rule alone. If a request times out, its scope propagates cancellation. If child code cooperates with cancellation, it releases its resources. The parent joins, so it does not report completion while children are still changing state.

```text
Parent timeout
      |
      v
cancel task scope
      |
      +--> child A observes cancellation, cleans up, ends
      +--> child B observes cancellation, cleans up, ends
      +--> child C was already complete
      |
      v
parent joins children, then returns timeout response
```

Cancellation is normally a **request**, not a magical kill switch. A task waiting for cancellation-aware I/O can stop promptly; code that blocks in an uninterruptible call or loops without checking its cancellation signal may not. That boundary is important when reviewing a system's timeout story.

## Two policies: fail fast and collect outcomes

The right failure policy depends on the question the parent is asking.

### Fail fast when every result is required

For a checkout calculation, a missing tax calculation can make the combined answer unsafe. The scope can stop sibling work on the first failure:

```text
start tax, shipping, promotion
             |
             +--> promotion service fails
                        |
                        v
           cancel tax and shipping if unfinished
                        |
                        v
           join all children and report the failure
```

Java's `StructuredTaskScope.ShutdownOnFailure` is an example of this policy. It prevents the common bug where a parent has already decided to fail but other children continue as expensive, irrelevant work.

### Collect results when partial answers are meaningful

For a search page, one source may fail while others are still useful. A scope can wait for all children and return a result per source:

```text
query catalog, reviews, and help articles
  catalog: success
  reviews: timeout
  help:    success

render catalog + help, with a degraded-state signal if appropriate
```

This is still structured concurrency. The important difference is the declared policy: a failed child is data the parent handles, not an abandoned exception. Do not use fail-fast merely because it is simpler if users need partial results.

## A small Python example

Python 3.11's `asyncio.TaskGroup` makes the scope concrete. The block is not allowed to finish normally while its tasks are unfinished:

```python
async def load_page(product_id: str):
    async with asyncio.TaskGroup() as group:
        price = group.create_task(fetch_price(product_id))
        stock = group.create_task(fetch_inventory(product_id))
        recs = group.create_task(fetch_recommendations(product_id))

    # The TaskGroup has joined here. If a child failed, the block raises
    # an ExceptionGroup rather than silently returning partial task objects.
    return Page(price.result(), stock.result(), recs.result())
```

If `fetch_inventory` raises, `TaskGroup` cancels unfinished siblings and then raises an `ExceptionGroup` after their cleanup. The parent can choose a different policy by catching and inspecting that group, or by representing expected failures as ordinary result values.

The code is intentionally incomplete as production code: real handlers also need a request deadline, error classification, and observability. Its lesson is ownership. The variables refer to tasks created by this exact scope; there is no detached task hidden behind the page response.

## Deadlines belong at the boundary

Structured concurrency works especially well with a deadline passed from parent to child.

```text
client deadline: 800 ms
        |
        v
HTTP handler scope: 800 ms total
        |
        +--> price RPC gets remaining budget
        +--> inventory RPC gets remaining budget
        +--> recommendation RPC gets remaining budget
```

Do not give each child a fresh 800 ms timeout after the parent has already spent 500 ms parsing, authenticating, or waiting in a queue. That can turn one 800 ms client promise into more than 1.3 seconds of backend work. A monotonic deadline (an absolute cutoff measured by a monotonic clock) lets each child derive its _remaining_ budget.

Also distinguish three terms that are often conflated:

| Term         | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| Deadline     | The latest time the parent is willing to wait.       |
| Timeout      | A duration used to construct a deadline.             |
| Cancellation | The signal that asks currently running work to stop. |

A deadline commonly causes cancellation, but a user navigation, server shutdown, or fail-fast sibling error can cancel work before a deadline expires.

## The important escape hatch is explicit

Sometimes work must outlive its caller: sending an audit record, running a scheduled cleanup, or serving a queue. The disciplined version is not to detach a child casually. Instead, hand the work to a component with its own lifecycle and durable contract.

```text
request scope -- writes durable job --> queue / outbox --> worker service scope
```

Now the worker service owns retries, shutdown, metrics, and idempotency. If the handoff is not durable, a request that returns successfully can still lose the work during a process crash. Structured concurrency makes this design decision visible: either work remains a child and must finish or be cancelled with the request, or it is transferred to a real new owner.

## A review checklist

When reading concurrent application code, ask:

- Who owns this task, and where does that owner join it?
- What happens to sibling tasks when one fails?
- How does cancellation reach blocking I/O and cleanup code?
- Is a deadline propagated as remaining budget?
- If work intentionally outlives the request, what durable component now owns it?

The practical benefit is not fewer threads or fewer `async` keywords. It is a program whose concurrent work has a lifetime that matches the user-visible operation. That makes shutdown, error reporting, resource cleanup, and incident debugging much less mysterious.

## References

1. OpenJDK, [JEP 505: Structured Concurrency](https://openjdk.org/jeps/505).
2. Kotlin documentation, [Coroutine context and dispatchers: scopes and coroutine builders](https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html#scope-and-coroutine-builder).
3. Python documentation, [`asyncio.TaskGroup`](https://docs.python.org/3/library/asyncio-task.html#task-groups).
4. Nathaniel J. Smith, [Notes on structured concurrency, or: Go statement considered harmful](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/).
