---
author: JZ
pubDatetime: 2026-11-24T19:33:00Z
modDatetime: 2026-11-24T19:33:00Z
title: System Design - How Java Virtual Threads Work
tags:
  - design-system
  - design-concurrency
description: "How Java virtual threads let blocking request code handle more concurrent I/O by parking on a small set of carrier threads, and where CPU work, pinning, and resource limits still matter."
---

## Table of contents

## The request that is waiting

Imagine a web server with one thread assigned to each request. A request reads a row from a database, calls a payment service, and then returns a response. While the database or network is replying, the request thread mostly waits.

With a platform thread, that wait still occupies an operating-system thread. A pool of a few hundred threads can therefore become a ceiling on how many requests the server can have in progress, even when the CPU and downstream services have room for more work.

There are two common responses. We can keep requests on threads and accept that ceiling, or we can rewrite the request flow around asynchronous callbacks so a thread can do other work during I/O. Java virtual threads offer another option: keep ordinary, sequential Java code, but let the runtime move a waiting thread off the operating-system thread it was using.

Virtual threads became a permanent Java feature in JDK 21. They are designed for applications with many concurrent tasks that spend much of their time waiting, such as web services and database clients.

## One Java thread can move between carriers

A **platform thread** is the familiar Java thread backed by an operating-system thread. A **virtual thread** is still a Java `Thread`, but it is not permanently attached to one operating-system thread. The Java runtime schedules many virtual threads over a smaller set of platform threads.

The platform thread currently running a virtual thread is called its **carrier**. A virtual thread can run on one carrier, pause, and later resume on a different carrier.

```text
  Request A (virtual thread)             Request B (virtual thread)
              |                                      |
              v                                      v
      +-------------------+                  +-------------------+
      | Carrier 1         |                  | Carrier 2         |
      | platform thread   |                  | platform thread   |
      +---------+---------+                  +---------+---------+
                |                                      |
         socket read blocks                    calculate response
                |
                v
       virtual thread parks
       its call state in heap
                |
                +---- Carrier 1 is now free for another request
```

The Java code for a request can keep its local variables and call stack as it waits. When a supported blocking operation is reached, the runtime saves the virtual thread's continuation and unmounts it from its carrier. The carrier can run another virtual thread. When the I/O is ready, the scheduler makes the paused virtual thread runnable again; it may resume on a different carrier.

This is different from application-managed asynchronous I/O. The application can still write a sequence such as “read from the database, then call the payment service, then build a response.” The JDK handles the parking and resumption for blocking operations that it can make non-blocking underneath.

## The scheduler's job

The JDK's virtual-thread scheduler assigns virtual threads to carrier platform threads. In JDK 21, the scheduler is a work-stealing `ForkJoinPool` in FIFO mode. The carriers, in turn, are scheduled by the operating system.

```text
 Java request code
       |
       v
 Virtual thread A -- waits for I/O --> parked continuation
       |                                      ^
       v                                      | I/O becomes ready
 JDK scheduler -------------------------------+
       |
       v
 Carrier platform thread --> operating-system thread --> CPU core
```

The virtual thread does not need to yield explicitly. When the JDK recognizes a blocking operation, such as a socket read, it parks the virtual thread and returns its carrier to the scheduler. When the operation can continue, the virtual thread becomes runnable and waits for a carrier.

Virtual thread stacks are stored as stack-chunk objects in the garbage-collected heap. They grow as a call stack deepens and shrink as frames return, rather than reserving a large fixed native stack for every thread. A parked thread still needs memory for its saved state; “cheap” does not mean free.

## Creating one virtual thread per task

The API encourages creating a new virtual thread for each task instead of pooling virtual threads. A simple request handler might start two independent service calls like this:

```java
UserPage loadUserPage(String userId) throws InterruptedException, ExecutionException {
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
        Future<Profile> profile = executor.submit(() -> profileClient.fetch(userId));
        Future<List<Order>> orders = executor.submit(() -> orderClient.fetch(userId));

        return new UserPage(profile.get(), orders.get());
    }
}
```

`newVirtualThreadPerTaskExecutor()` starts a virtual thread for each submitted task. The calls to `get()` wait in the normal, sequential style. If a future is not ready, the current virtual thread can park instead of holding a carrier just to wait.

Pooling virtual threads would reintroduce a limit that the model is meant to remove. A pool is still useful for scarce resources such as database connections. If the database has 80 connections, making 10,000 virtual threads does not create 10,000 database connections. The application needs a connection pool or another admission limit around that dependency.

## Where virtual threads help

Virtual threads can raise throughput when many requests are in flight and spend much of their time waiting for network or other supported blocking I/O. They make thread-per-request code practical at a larger concurrency level, which can simplify code that would otherwise use callbacks or reactive pipelines.

They do not make an individual thread run faster. If every request spends its time compressing images or multiplying large matrices, the CPU cores remain the limit. Running far more CPU-bound virtual threads than there are cores does not increase the amount of computation the machine can complete.

The practical split is:

| Workload                                           | What virtual threads change                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Many requests waiting on sockets or database calls | A waiting request can give up its carrier, allowing another request to run. |
| CPU-heavy calculations                             | They do not add CPU capacity or make calculations faster.                   |
| A bounded database or remote API                   | The downstream limit still applies; use a pool, semaphore, or rate limit.   |

Virtual threads also retain familiar thread behavior. Exceptions, stack traces, interruption, and thread-local values work as thread-based code expects. But a `ThreadLocal` value is now created once per virtual thread. A large thread-local cache that was affordable with a small number of platform threads can use a lot of memory when there are many virtual threads.

## Pinning: when a virtual thread holds onto its carrier

Virtual threads help only when the runtime can unmount them while they wait. If a virtual thread cannot unmount, its carrier is stuck too. This is called **pinning**.

In JDK 21 through JDK 23, a virtual thread could be pinned when it blocked inside a `synchronized` method or block. This mattered most when code held a monitor while performing potentially slow I/O. Native calls and some operating-system or JVM operations can also prevent unmounting.

JDK 24 changed monitor handling through [JEP 491](https://openjdk.org/jeps/491). A virtual thread can now unmount while it holds or waits for a Java monitor, so ordinary `synchronized` code no longer causes that form of pinning. Some native or foreign-function calls and certain JVM operations can still pin a virtual thread. JDK Flight Recorder can report `jdk.VirtualThreadPinned` events to help identify remaining cases.

This version detail matters when diagnosing an application: guidance written for JDK 21 may recommend replacing `synchronized` with `ReentrantLock` to avoid pinning. JDK 24 removes the need for that migration in the general case. Choose a lock based on the coordination behavior the program needs, and avoid doing long blocking work while holding a lock when possible.

## Scheduler settings and sensible limits

The scheduler has two notable system properties:

| Property                                 | Purpose                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jdk.virtualThreadScheduler.parallelism` | Number of platform threads the scheduler uses to run virtual threads. By default it follows the number of available processors.                                   |
| `jdk.virtualThreadScheduler.maxPoolSize` | Upper bound on scheduler platform threads, including temporary compensation for some blocking operations that cannot unmount. JEP 444 documents a default of 256. |

These settings tune the carrier scheduler; they do not cap the number of virtual threads. Most applications should first measure a real bottleneck instead of raising them. They cannot make CPU-bound work run faster or remove limits in a database, network service, or file system.

## A useful mental model

Think of a virtual thread as a lightweight Java thread whose execution state can be parked in the heap. A small scheduler assigns runnable virtual threads to carrier threads. When a supported blocking operation happens, the runtime parks the virtual thread, frees the carrier, and resumes the virtual thread when it is ready.

That model preserves straightforward thread-per-request code while avoiding the rule that every waiting request must occupy its own operating-system thread. It works best for high-concurrency, I/O-heavy services, and it still needs sensible limits around memory, CPU, databases, and other shared resources.

## References

1. OpenJDK, [JEP 444: Virtual Threads](https://openjdk.org/jeps/444), delivered in JDK 21.
2. OpenJDK, [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491), delivered in JDK 24.
3. Java 21 API, [`Thread.Builder.OfVirtual`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Thread.Builder.OfVirtual.html).
4. Java 21 API, [`Executors.newVirtualThreadPerTaskExecutor`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Executors.html#newVirtualThreadPerTaskExecutor()>).
5. OpenJDK 21 source, [`VirtualThread.java`](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/lang/VirtualThread.java) and [`Executors.java`](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/java.base/share/classes/java/util/concurrent/Executors.java).
