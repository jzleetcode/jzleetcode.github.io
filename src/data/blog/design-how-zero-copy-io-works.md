---
author: JZ
pubDatetime: 2026-06-06T07:00:00Z
modDatetime: 2026-06-06T07:00:00Z
title: System Design - How Zero-Copy I/O Works
tags:
  - design-system
description:
  "How zero-copy I/O works in Linux: the cost of traditional read/write, how sendfile() and splice() eliminate copies, how mmap fits in, and why Kafka and nginx are fast — with ASCII diagrams and kernel source code references."
---

## Table of contents

## Context

Imagine you're building a file server. A client connects, asks for a file, and you send it over the network. The naive approach in C looks like:

```c
char buf[4096];
int n = read(fd, buf, sizeof(buf));   // read from disk
write(sockfd, buf, n);                // write to socket
```

This looks simple — two system calls, one buffer. But under the hood, the kernel is doing far more work than you'd expect. That hidden work is why systems like Kafka and nginx invented "zero-copy" techniques that can double or triple throughput for I/O-heavy workloads.

## The Cost of Traditional I/O

When you call `read()` followed by `write()`, here's what actually happens at the hardware level:

```
   Traditional read() + write() — 4 copies, 4 context switches

   User space                          Kernel space
   +----------+                        +------------------+
   |          |  1. read() syscall     |                  |
   |          |----------------------->|  context switch  |
   |          |                        |                  |
   |          |                        |  DMA copy:       |
   |          |                        |  disk -> kernel  |
   |          |                        |  buffer (page    |
   |          |                        |  cache)          |
   |          |                        |        |         |
   |          |  2. CPU copy:          |        v         |
   |  user    |<-----------------------+  kernel buffer   |
   |  buffer  |  kernel buf -> user buf|                  |
   |          |                        |                  |
   |          |  3. write() syscall    |                  |
   |          |----------------------->|  context switch  |
   |          |                        |                  |
   |          |  4. CPU copy:          |                  |
   |          |----------------------->|  socket buffer   |
   |          |  user buf -> socket buf|        |         |
   |          |                        |        v         |
   |          |                        |  DMA copy:       |
   |          |                        |  socket buf ->   |
   |          |                        |  NIC             |
   +----------+                        +------------------+

   Total: 2 DMA copies + 2 CPU copies + 4 context switches
```

Let's count:
1. **DMA copy**: disk controller copies data from disk to kernel page cache (no CPU involved).
2. **CPU copy**: kernel copies data from page cache to your user-space buffer.
3. **CPU copy**: kernel copies data from user-space buffer to the socket send buffer.
4. **DMA copy**: NIC copies data from socket buffer out to the network.

There are also **4 context switches** — each `read()` and `write()` requires a switch from user mode to kernel mode and back.

The two CPU copies in the middle are pure waste. The data passes through user space but the application never modifies it — it's just a relay. For a file server sending gigabytes, those copies burn CPU cycles, pollute the CPU cache, and consume memory bandwidth that could be used for real work.

## sendfile(): The First Zero-Copy

Linux 2.2 (1999) introduced `sendfile()` — a system call that transfers data directly from one file descriptor to another without ever touching user space:

```c
#include <sys/sendfile.h>

// Send 'count' bytes from 'in_fd' starting at 'offset' to 'out_fd'
ssize_t sendfile(int out_fd, int in_fd, off_t *offset, size_t count);
```

Here's what happens inside:

```
   sendfile() — eliminates user-space copies

   User space                          Kernel space
   +----------+                        +------------------+
   |          |  1. sendfile() syscall |                  |
   |          |----------------------->|  context switch  |
   |          |                        |                  |
   |          |                        |  DMA copy:       |
   |  (no     |                        |  disk -> page    |
   |   user   |                        |  cache           |
   |   buffer |                        |       |          |
   |   needed)|                        |       v          |
   |          |                        |  CPU copy:       |
   |          |                        |  page cache ->   |
   |          |                        |  socket buffer   |
   |          |                        |       |          |
   |          |                        |       v          |
   |          |                        |  DMA copy:       |
   |          |                        |  socket buf ->   |
   |          |  2. return             |  NIC             |
   |          |<-----------------------|                  |
   +----------+                        +------------------+

   Total: 2 DMA copies + 1 CPU copy + 2 context switches
```

We eliminated one CPU copy and two context switches. But there's still one CPU copy from the page cache to the socket buffer. Can we remove that too?

## sendfile() with DMA Scatter-Gather

If the NIC supports **scatter-gather DMA** (most modern NICs do), the kernel can do even better. Instead of copying data from the page cache to the socket buffer, it just passes the NIC a list of memory locations to read from directly:

```
   sendfile() with scatter-gather — true zero CPU copy

   User space                          Kernel space
   +----------+                        +------------------+
   |          |  1. sendfile() syscall |                  |
   |          |----------------------->|  context switch  |
   |          |                        |                  |
   |          |                        |  DMA copy:       |
   |  (no     |                        |  disk -> page    |
   |   buffer)|                        |  cache           |
   |          |                        |       |          |
   |          |                        |       | (no CPU  |
   |          |                        |       |  copy!)  |
   |          |                        |       v          |
   |          |                        |  socket buffer   |
   |          |                        |  gets only       |
   |          |                        |  descriptors     |
   |          |                        |  (offset+length) |
   |          |                        |       |          |
   |          |                        |       v          |
   |          |                        |  DMA gather:     |
   |          |                        |  NIC reads from  |
   |          |                        |  page cache      |
   |          |  2. return             |  directly        |
   |          |<-----------------------|                  |
   +----------+                        +------------------+

   Total: 2 DMA copies + 0 CPU copies + 2 context switches
```

Zero CPU copies! The data never gets copied by the processor. It goes from disk to page cache (DMA), then directly from page cache to the network (DMA scatter-gather). The CPU only sets up descriptors — tiny metadata that says "read 4096 bytes from this memory address."

## splice() and the Pipe Trick

Linux 2.6.17 (2006) added `splice()` — a more general zero-copy primitive that moves data between a file descriptor and a pipe without user-space copying:

```c
#include <fcntl.h>

ssize_t splice(int fd_in, off_t *off_in, int fd_out, off_t *off_out,
               size_t len, unsigned int flags);
```

`splice()` works by manipulating kernel buffer references instead of copying data. A pipe in Linux is just a ring of page pointers. `splice()` from a file into a pipe adds the file's page cache pages to the pipe's ring — no copy. `splice()` from the pipe to a socket sends those same pages to the NIC — again no copy.

```
   splice() — file to socket via pipe (zero copy)

   int pipe_fds[2];
   pipe(pipe_fds);

   // Move data from file into pipe (no copy - shares page cache pages)
   splice(file_fd, &offset, pipe_fds[1], NULL, len, SPLICE_F_MOVE);

   // Move data from pipe into socket (no copy - DMA from page cache)
   splice(pipe_fds[0], NULL, socket_fd, NULL, len, SPLICE_F_MOVE);
```

Why use `splice()` over `sendfile()`? Because `splice()` is composable. You can chain transformations: splice from file to pipe, apply in-kernel transformations (like checksumming with `tee()`), then splice from pipe to socket. It's also not limited to file-to-socket — it works between any combination of pipes and file descriptors.

## mmap(): A Different Approach

`mmap()` maps a file directly into your virtual address space, allowing you to access file contents through memory pointers:

```c
void *addr = mmap(NULL, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
write(sockfd, addr, file_size);
munmap(addr, file_size);
```

```
   mmap() + write() — 3 copies, 4 context switches

   User space                          Kernel space
   +----------+                        +------------------+
   |          |  mmap()                |                  |
   |  virtual |<==== shared mapping ==>|  page cache      |
   |  address |                        |       |          |
   |          |  write() syscall       |       |          |
   |          |----------------------->|       v          |
   |          |                        |  CPU copy:       |
   |          |                        |  page cache ->   |
   |          |                        |  socket buffer   |
   |          |                        |       |          |
   |          |                        |       v          |
   |          |                        |  DMA copy:       |
   |          |  return                |  socket -> NIC   |
   |          |<-----------------------|                  |
   +----------+                        +------------------+

   Total: 1 DMA (disk->cache on fault) + 1 CPU copy + 1 DMA (NIC)
```

`mmap()` eliminates the read-side copy because user space shares the page cache directly. But you still pay one CPU copy into the socket buffer, and you get the overhead of page faults and TLB management. For random access patterns, `mmap()` can be great. For sequential streaming, `sendfile()` usually wins.

## How Kafka Uses Zero-Copy

Apache Kafka is famous for its high throughput — a single broker can push multiple GB/s to consumers. A key reason is its use of `sendfile()` for consumer fetches.

When a consumer reads messages, Kafka's broker doesn't deserialize or transform the data. Messages are stored on disk in the exact wire format they'll be sent over the network. So the broker can use `sendfile()` to transfer directly from the log file to the consumer's socket:

```
   Kafka Consumer Fetch — zero-copy path

   Producer                    Broker                     Consumer
      |                          |                          |
      |   produce(messages)      |                          |
      |------------------------->|                          |
      |                          |  append to log           |
      |                          |  (page cache)            |
      |                          |                          |
      |                          |       fetch(offset)      |
      |                          |<-------------------------|
      |                          |                          |
      |                          |  sendfile(log_fd,        |
      |                          |    offset,               |
      |                          |    socket_fd)            |
      |                          |                          |
      |                          |  [DMA: disk->page cache  |
      |                          |   DMA: page cache->NIC]  |
      |                          |                          |
      |                          |  zero CPU copies!        |
      |                          |------------------------->|
      |                          |                          |
```

The relevant code is in Kafka's Java layer using `FileChannel.transferTo()`, which maps to `sendfile()` on Linux:

```java
// From kafka/server/src/main/java/.../log/UnifiedLog.scala (simplified)
// FileRecords.java delegates to FileChannel.transferTo()
public long writeTo(GatheringByteChannel channel, long position, int length) {
    return channel.transferFrom(this.channel, position, length);
}
```

Java's `FileChannel.transferTo()` is documented to use OS-level zero-copy when available — on Linux that means `sendfile()`.

## How nginx Uses Zero-Copy

nginx uses `sendfile()` for serving static files. It's enabled with a single directive:

```nginx
http {
    sendfile on;          # use sendfile() for static files
    tcp_nopush on;        # combine headers + file body in one TCP segment
}
```

When `sendfile` is `on`, nginx calls the OS-level `sendfile()` instead of the naive read-into-buffer-then-write approach. Combined with `tcp_nopush` (which maps to `TCP_CORK`), nginx can send HTTP headers and file data in a single TCP segment, reducing packet overhead.

In the source code ([`src/os/unix/ngx_linux_sendfile_chain.c`](https://github.com/nginx/nginx/blob/master/src/os/unix/ngx_linux_sendfile_chain.c)):

```c
static ssize_t
ngx_linux_sendfile(ngx_connection_t *c, ngx_buf_t *file, size_t size)
{
    ssize_t  n;
    off_t    offset = file->file_pos;

    n = sendfile(c->fd, file->file->fd, &offset, size);
    // ... error handling ...
    return n;
}
```

## The Kernel Implementation

In Linux, `sendfile()` is implemented in [`fs/read_write.c`](https://github.com/torvalds/linux/blob/master/fs/read_write.c). The core logic calls `do_splice_direct()` internally — meaning `sendfile()` is actually built on top of the splice infrastructure since Linux 2.6.23:

```c
// Simplified from fs/read_write.c
SYSCALL_DEFINE4(sendfile64, int, out_fd, int, in_fd, loff_t __user *, offset,
                size_t, count)
{
    // ... setup ...
    ret = do_splice_direct(in_file, &pos, out_file, &out_pos, count, 0);
    // ... cleanup ...
}
```

`do_splice_direct()` creates an internal pipe, splices from the input file into the pipe (moving page references, no copy), then splices from the pipe to the output socket. The pipe is just a temporary holder for the page pointers.

## When to Use What

| Technique | Best for | Limitation |
|---|---|---|
| `sendfile()` | File → socket transfers (static serving, streaming) | Only file-to-socket (or file-to-file) |
| `splice()` | Composable zero-copy between any FDs via pipe | Requires pipe as intermediary |
| `mmap()` | Random-access reads, shared memory | Page fault overhead, TLB pressure |
| `read()`+`write()` | Small transfers, data needing transformation | 2 extra copies |

General rules:
- If you're **relaying data unmodified** between a file and network: use `sendfile()`.
- If you need to **chain multiple I/O sources** or do kernel-space manipulation: use `splice()`.
- If you need **random-access** to file contents or shared memory between processes: use `mmap()`.
- If you need to **inspect or transform** the data in user space: no zero-copy technique helps — you need the data in your buffer.

## Summary

Zero-copy I/O is about eliminating redundant copies between kernel and user space when the application is just relaying data without modifying it. The core insight: if data is already in the kernel's page cache and you just want to send it somewhere else the kernel can reach (like a NIC), there's no reason to bounce it through user space.

The progression:
1. **Traditional**: 4 copies, 4 context switches — wasteful for relay.
2. **sendfile()**: 2 DMA + 1 CPU copy, 2 context switches — good.
3. **sendfile() + scatter-gather**: 2 DMA + 0 CPU copies — optimal.
4. **splice()**: same efficiency, more flexible composition.

This is why Kafka can saturate a 10 Gbps NIC from a single broker, and why nginx can serve static files faster than most application servers can stream "Hello World."

## References

- [Linux man page: sendfile(2)](https://man7.org/linux/man-pages/man2/sendfile.2.html)
- [Linux man page: splice(2)](https://man7.org/linux/man-pages/man2/splice.2.html)
- ["Zero Copy I: User-Mode Perspective"](https://developer.ibm.com/articles/j-zerocopy/) — IBM DeveloperWorks
- [Linux kernel source: fs/read_write.c](https://github.com/torvalds/linux/blob/master/fs/read_write.c)
- [Linux kernel source: fs/splice.c](https://github.com/torvalds/linux/blob/master/fs/splice.c)
- [Kafka design: efficiency](https://kafka.apache.org/documentation/#maximizingefficiency) — official docs on zero-copy
- [nginx source: ngx_linux_sendfile_chain.c](https://github.com/nginx/nginx/blob/master/src/os/unix/ngx_linux_sendfile_chain.c)
