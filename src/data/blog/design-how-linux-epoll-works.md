---
author: JZ
pubDatetime: 2026-05-01T06:00:00Z
modDatetime: 2026-05-01T06:00:00Z
title: System Design - How Linux epoll Works
tags:
  - design-system
  - design-concurrency
description:
  "How Linux epoll works: the evolution from select/poll, epoll's internal architecture with red-black trees and ready lists, level-triggered vs edge-triggered modes, and a source code walkthrough from the Linux kernel."
---

## Table of contents

## Context

Imagine you are building a chat server. Thousands of users are connected simultaneously, but at any given moment only a handful are actually sending messages. Your server needs to figure out which connections have data ready to read — without wasting CPU cycles checking every single one.

This is the **I/O multiplexing** problem: how does a single thread efficiently monitor many file descriptors (sockets, pipes, files) and react only when something happens?

Unix has offered solutions to this problem for decades: `select` (1983) and `poll` (1997). But both have a fundamental scalability issue — they require the kernel to scan **every** file descriptor on each call, even if only one is ready. With 10,000 connections, that's 10,000 checks per call, most returning "nothing happened."

```
   The Scalability Problem with select/poll

   Call: poll(fds, 10000, timeout)

   Kernel must check:
   fd[0]    -> not ready
   fd[1]    -> not ready
   fd[2]    -> READY!          <-- 1 out of 10,000
   fd[3]    -> not ready
   ...
   fd[9999] -> not ready

   Result: O(n) scan for O(1) events
   Next call: scan all 10,000 again
```

In 2002, Davide Libenzi introduced **epoll** into the Linux kernel (version 2.5.44). The key insight: instead of scanning all file descriptors on every call, **let the kernel track which descriptors are ready and hand you only those.** This turns the cost from O(n) per call to O(ready), where "ready" is typically a tiny fraction of the total.

Today, epoll is the backbone of virtually every high-performance Linux network server: nginx, Redis, Node.js (via libuv), Go's runtime netpoller, and Java's NIO.

## The Three System Calls

epoll's API is remarkably simple — just three system calls defined in [`fs/eventpoll.c`](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c):

```c
#include <sys/epoll.h>

// 1. Create an epoll instance
int epoll_create1(int flags);

// 2. Add, modify, or remove file descriptors
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);

// 3. Wait for events
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

Here is how they work together in a typical server:

```c
// Create the epoll instance
int epfd = epoll_create1(0);

// Tell epoll to watch the listening socket for incoming connections
struct epoll_event ev;
ev.events = EPOLLIN;          // interested in "readable" events
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// Event loop
struct epoll_event ready[64];
while (1) {
    int n = epoll_wait(epfd, ready, 64, -1);  // block until something happens
    for (int i = 0; i < n; i++) {
        if (ready[i].data.fd == listen_fd) {
            // New connection — accept it and add to epoll
            int client = accept(listen_fd, ...);
            ev.events = EPOLLIN;
            ev.data.fd = client;
            epoll_ctl(epfd, EPOLL_CTL_ADD, client, &ev);
        } else {
            // Existing connection has data — read it
            handle_client(ready[i].data.fd);
        }
    }
}
```

The critical difference from `select`/`poll`: you register interest **once** with `epoll_ctl`, and then each `epoll_wait` call returns **only the ready descriptors**. No repeated scanning.

## Internal Architecture

Inside the kernel, an epoll instance ([`struct eventpoll`](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c)) maintains two core data structures:

```
  +-----------------------------------------------+
  |            struct eventpoll                    |
  |                                                |
  |  +------------------+   +------------------+   |
  |  |   Red-Black Tree |   |    Ready List    |   |
  |  |    (rbr)         |   |    (rdllist)     |   |
  |  |                  |   |                  |   |
  |  |  All monitored   |   |  FDs that have   |   |
  |  |  file descriptors|   |  pending events  |   |
  |  |                  |   |                  |   |
  |  |  Keyed by (fd,   |   |  Doubly-linked   |   |
  |  |   file pointer)  |   |  list for O(1)   |   |
  |  |                  |   |  insertion        |   |
  |  |  O(log n) lookup |   |                  |   |
  |  +------------------+   +------------------+   |
  |                                                |
  |  lock: spinlock + mutex                        |
  |  wq: wait queue (sleeping epoll_wait callers)  |
  +-----------------------------------------------+
```

**Red-black tree (`rbr`):** Stores every file descriptor registered via `epoll_ctl`. Keyed by the combination of file descriptor number and file pointer, so lookups, insertions, and deletions are O(log n). When you call `epoll_ctl(EPOLL_CTL_ADD)`, the kernel creates an `epitem` node and inserts it here.

**Ready list (`rdllist`):** A doubly-linked list of `epitem` nodes that currently have events. When `epoll_wait` is called, the kernel simply drains this list and copies events to userspace — no scanning required.

The relevant kernel structures, simplified:

```c
struct eventpoll {
    spinlock_t lock;
    struct mutex mtx;
    wait_queue_head_t wq;       // processes blocked in epoll_wait
    struct rb_root_cached rbr;  // red-black tree of all monitored fds
    struct list_head rdllist;   // ready file descriptors
};

struct epitem {
    struct rb_node rbn;         // node in the red-black tree
    struct list_head rdllink;   // link in the ready list
    struct eventpoll *ep;       // back pointer to the epoll instance
    struct epoll_filefd ffd;    // the file descriptor being monitored
    struct epoll_event event;   // events the user is interested in
};
```

## How Events Flow: The Callback Mechanism

The magic of epoll's efficiency lies in a **callback-driven** design. Instead of the kernel scanning file descriptors, each file descriptor **notifies** the epoll instance when its state changes.

```
  How an event reaches epoll_wait

  1. Network card receives packet
     |
     v
  2. Kernel network stack processes packet,
     places data in socket receive buffer
     |
     v
  3. Socket calls its wait queue callback
     --> ep_poll_callback()
     |
     v
  4. ep_poll_callback:
     - Adds the epitem to rdllist (ready list)
     - Wakes up any process sleeping in epoll_wait
     |
     v
  5. epoll_wait wakes up, finds items on rdllist,
     copies events to userspace buffer
     |
     v
  6. Returns to application with ready fds
```

When `epoll_ctl(EPOLL_CTL_ADD)` is called, the kernel does two things:

1. Inserts an `epitem` into the red-black tree.
2. Registers a callback function (`ep_poll_callback`) on the file descriptor's wait queue.

From [`fs/eventpoll.c`](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c), the callback:

```c
static int ep_poll_callback(wait_queue_entry_t *wait, unsigned mode,
                            int sync, void *key)
{
    struct epitem *epi = ep_item_from_wait(wait);
    struct eventpoll *ep = epi->ep;
    __poll_t pollflags = key_to_poll(key);

    spin_lock_irqsave(&ep->lock, flags);

    // Add this item to the ready list if not already there
    if (!ep_is_linked(epi))
        list_add_tail(&epi->rdllink, &ep->rdllist);

    // Wake up anyone blocked in epoll_wait
    if (waitqueue_active(&ep->wq))
        wake_up_locked(&ep->wq);

    spin_unlock_irqrestore(&ep->lock, flags);
    return 1;
}
```

This is what makes epoll O(ready) instead of O(total): the kernel never scans. It just checks the ready list.

## epoll_wait: Harvesting Events

When your application calls `epoll_wait`, the kernel function `ep_poll` runs:

```
  ep_poll() flow

  +---------------------------+
  |  Is rdllist empty?        |
  +------------+--------------+
               |
       +-------+--------+
       |                 |
       v                 v
      YES               NO
       |                 |
       v                 v
  +----------+    +--------------+
  | Sleep on |    | Proceed to   |
  | wq until |    | ep_send_     |
  | timeout  |    | events()     |
  | or wake  |    +--------------+
  +----------+           |
       |                 v
       v          +------------------+
  (woken by       | Walk rdllist,    |
   callback)      | copy events to   |
       |          | userspace buffer |
       +--------->| up to maxevents  |
                  +------------------+
                         |
                         v
                  Return count of
                  ready events
```

The core of event delivery is `ep_send_events_proc`, which iterates the ready list:

```c
// Simplified from ep_send_events_proc
list_for_each_entry_safe(epi, tmp, &ep->rdllist, rdllink) {
    // Remove from ready list
    list_del_init(&epi->rdllink);

    // Poll the fd to get current events
    revents = ep_item_poll(epi, &pt, 1);
    if (!revents)
        continue;

    // Copy to userspace
    if (__put_user(revents, &uevent->events) ||
        __put_user(epi->event.data, &uevent->data))
        return error;

    eventcnt++;

    // Level-triggered: re-add to ready list if events persist
    if (!(epi->event.events & EPOLLET))
        list_add_tail(&epi->rdllink, &ep->rdllist);
}
```

Notice the last `if` statement — this is where level-triggered and edge-triggered behavior diverge.

## Level-Triggered vs. Edge-Triggered

epoll supports two notification modes, and understanding the difference is critical for building correct servers.

```
  Level-Triggered (LT)               Edge-Triggered (ET)
  Default mode                        Set with EPOLLET flag

  "Tell me whenever data              "Tell me once when data
   is available"                        becomes available"

  +--------+--------+--------+        +--------+--------+--------+
  |  wait  |  wait  |  wait  |        |  wait  |  wait  |  wait  |
  +---+----+---+----+---+----+        +---+----+---+----+---+----+
      |        |        |                 |        |        |
      v        v        v                 v        v        v
    READY    READY    READY             READY   (silent) (silent)
      |        |        |                 |
      v        v        v                 v
    read     read     read              read
   100 B    100 B    100 B             ALL data
   (partial)(partial)(done)            (must drain)

  Socket has 300 bytes.               Socket has 300 bytes.
  LT fires on every                   ET fires once. If you
  epoll_wait as long as               only read 100 bytes,
  buffer is non-empty.                epoll_wait won't fire
                                      again until NEW data
                                      arrives. The remaining
                                      200 bytes sit unread.
```

**Level-triggered (default):** After `epoll_wait` returns a ready fd, if you don't read all the data, the fd stays on the ready list. The next `epoll_wait` will report it again. This is forgiving — partial reads don't lose data.

**Edge-triggered (`EPOLLET`):** The callback fires only on state transitions (e.g., buffer goes from empty to non-empty). Once notified, you **must** read until `EAGAIN` to drain the buffer completely. If you stop early, no further notification comes until the next new data arrives.

Why use edge-triggered? It reduces the number of `epoll_wait` wakeups under high throughput. A busy socket that constantly has data would wake a level-triggered loop on every call, but an edge-triggered loop wakes only on transitions. The trade-off: your application code must be more careful.

```c
// Edge-triggered read loop: must drain completely
ev.events = EPOLLIN | EPOLLET;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// When epoll_wait reports this fd:
while (1) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n == -1) {
        if (errno == EAGAIN)
            break;   // buffer fully drained, safe to return to epoll_wait
        handle_error();
    }
    if (n == 0) {
        close(fd);   // peer closed connection
        break;
    }
    process(buf, n);
}
```

## EPOLLONESHOT: Single-Fire Mode

There is a third mode worth knowing: `EPOLLONESHOT`. After an event fires, the fd is automatically disabled — no more events until you explicitly re-arm it with `epoll_ctl(EPOLL_CTL_MOD)`.

This is useful in **multi-threaded** servers. Without it, two threads could both be woken by `epoll_wait` for the same fd, leading to race conditions. With `EPOLLONESHOT`, only one thread handles the fd at a time:

```
  Thread pool with EPOLLONESHOT

  Thread 1                Thread 2
     |                       |
     v                       v
  epoll_wait()            epoll_wait()
     |                       |
     v                       |
  fd 5 ready               (blocked, fd 5 is disabled)
     |                       |
  handle fd 5                |
     |                       |
  re-arm fd 5                |
  (EPOLL_CTL_MOD)            |
     |                       v
     |                    fd 5 ready (new event)
     |                       |
```

## Real-World Usage: How nginx Uses epoll

nginx is perhaps the most well-known epoll user. Its event loop in [`src/event/modules/ngx_epoll_module.c`](https://github.com/nginx/nginx/blob/master/src/event/modules/ngx_epoll_module.c) follows this pattern:

```
  nginx worker process (single-threaded)

  +---> epoll_wait(epfd, events, max, timer)
  |         |
  |         v
  |     For each ready event:
  |         |
  |     +---+---+---+---+
  |     |       |       |
  |     v       v       v
  |   accept  read    write
  |   new     from    to
  |   conn    client  client
  |     |       |       |
  |     +---+---+---+---+
  |         |
  |     Process timer events
  |         |
  +---------+
```

nginx uses **edge-triggered** mode with non-blocking sockets. Each worker process runs a single-threaded event loop, handling thousands of connections concurrently without threads. The worker:

1. Calls `epoll_wait` to collect ready events.
2. Processes each event (accept new connections, read requests, write responses).
3. Handles timer-based events (keepalive timeouts, upstream timeouts).
4. Loops back to `epoll_wait`.

This is why a single nginx worker can handle tens of thousands of concurrent connections with minimal memory and CPU overhead.

## Comparison: select vs. poll vs. epoll

```
  Feature          select            poll              epoll
  -------          ------            ----              -----
  Year             1983              1997              2002
  Max FDs          FD_SETSIZE        unlimited         unlimited
                   (typically 1024)
  Per-call cost    O(n)              O(n)              O(ready)
  Registration     re-register       re-register       register once
                   every call        every call        (persistent)
  Kernel impl      bitmap scan       array scan        callback + ready list
  Trigger mode     level only        level only        level or edge
  Memory copy      fd_set copied     pollfd array      events copied only
                   both ways         copied both ways  kernel -> user
  Portability      POSIX             POSIX             Linux only
```

The key differentiators are the persistent registration (no re-copying the entire fd set each call) and the callback-driven ready list (no kernel-side scan). Together, these give epoll O(1) per ready event regardless of total monitored count.

## Cross-Platform Alternatives

epoll is Linux-specific. Other operating systems have their own high-performance I/O multiplexers:

- **kqueue** (FreeBSD, macOS): Similar callback-driven design, supports file system events natively.
- **IOCP** (Windows): Completion-based model — you get notified after I/O completes, not when it's ready to start.
- **io_uring** (Linux 5.1+): The successor for high-throughput I/O. Uses shared ring buffers between kernel and userspace, reducing system call overhead.

Libraries like **libuv** (Node.js), **libevent**, and **libev** abstract over these differences, giving you a portable event loop that uses epoll on Linux, kqueue on macOS, and IOCP on Windows.

## References

1. Linux kernel epoll implementation [`fs/eventpoll.c`](https://github.com/torvalds/linux/blob/master/fs/eventpoll.c)
2. epoll(7) man page [man7.org](https://man7.org/linux/man-pages/man7/epoll.7.html)
3. epoll_create(2) man page [man7.org](https://man7.org/linux/man-pages/man2/epoll_create.2.html)
4. epoll_ctl(2) man page [man7.org](https://man7.org/linux/man-pages/man2/epoll_ctl.2.html)
5. epoll_wait(2) man page [man7.org](https://man7.org/linux/man-pages/man2/epoll_wait.2.html)
6. nginx epoll module [`src/event/modules/ngx_epoll_module.c`](https://github.com/nginx/nginx/blob/master/src/event/modules/ngx_epoll_module.c)
7. The C10K problem [kegel.com](http://www.kegel.com/c10k.html)
8. Scalable Event Multiplexing: epoll vs kqueue [kernel.org LWN](https://lwn.net/Articles/13918/)
9. io_uring and the future of async I/O [kernel.dk](https://kernel.dk/io_uring.pdf)
