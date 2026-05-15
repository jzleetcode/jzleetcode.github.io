---
author: JZ
pubDatetime: 2026-05-15T12:00:00Z
modDatetime: 2026-05-15T12:00:00Z
title: System Design - How Linux io_uring Works
tags:
  - design-system
  - design-linux
description:
  "How Linux io_uring works: the submission and completion ring buffers, zero-copy I/O without system call overhead, kernel polling mode, and source code walkthrough from the liburing library."
---

## Table of contents

## Context

Every time your program reads a file or accepts a network connection, it makes a **system call** — a request to the kernel. The kernel does the actual I/O, then returns the result. This context switch between user space and kernel space has a cost: saving and restoring registers, flushing CPU pipelines, and crossing security boundaries. For a database doing millions of small reads per second, this overhead adds up fast.

Linux has evolved through several I/O models to reduce this cost:

```
  Evolution of Linux I/O

  1991  blocking I/O        one thread per connection
          |
  2002  epoll               event-driven, many connections per thread
          |                  (but still one syscall per I/O operation)
          |
  2019  io_uring            batched, async I/O with shared memory
                             (amortize syscall cost across many operations)
```

[epoll](/posts/design-how-linux-epoll-works/) solved the problem of monitoring many file descriptors efficiently. But epoll only tells you *when* a file descriptor is ready — you still need separate `read()` or `write()` system calls to actually do the I/O. For workloads that perform millions of small operations per second, the system call overhead of each individual `read`/`write` becomes the bottleneck.

**io_uring**, introduced by Jens Axboe in Linux 5.1 (2019), takes a fundamentally different approach. Instead of making one system call per I/O operation, the application and kernel share two ring buffers in memory. The application writes I/O requests into one ring; the kernel writes completions into the other. In the best case, no system calls are needed at all — the kernel polls the submission ring directly.

io_uring is used in production by databases (RocksDB, ScyllaDB), web servers (Nginx via patches), and runtimes (Rust's tokio-uring, C++'s Seastar). Let's look at how it works.

## The Big Idea: Two Shared Ring Buffers

io_uring's core design is simple: the application and kernel communicate through two lock-free ring buffers mapped into shared memory.

```
  User Space                              Kernel Space
  +------------------+                    +------------------+
  |   Application    |                    |     Kernel       |
  |                  |                    |                  |
  |  1. Fill SQE     |                    |  3. Process SQE  |
  |     (what I/O    |                    |     (do the I/O) |
  |      to do)      |                    |                  |
  |                  |                    |  4. Post CQE     |
  |  2. Advance SQ   |                    |     (result)     |
  |     tail         |                    |                  |
  |                  |                    |                  |
  |  5. Read CQE     |                    |                  |
  |     (get result) |                    |                  |
  +--------+---------+                    +--------+---------+
           |                                       |
           |          Shared Memory (mmap)          |
           |  +----------------------------------+  |
           |  |                                  |  |
           +->|  Submission Queue (SQ)           |<-+
              |  [SQE][SQE][SQE][SQE]...        |
              |  head-->          <--tail         |
              |                                  |
              |  Completion Queue (CQ)           |
              |  [CQE][CQE][CQE][CQE]...        |
              |  head-->          <--tail         |
              |                                  |
              +----------------------------------+
```

- **Submission Queue (SQ):** The application writes I/O requests here. Each request is a **Submission Queue Entry (SQE)**.
- **Completion Queue (CQ):** The kernel writes results here. Each result is a **Completion Queue Entry (CQE)**.

Both are circular buffers with head and tail pointers. The producer advances the tail; the consumer advances the head. Because they're in shared memory, no data copying is needed — both sides read and write the same memory.

## The Submission Queue Entry (SQE)

Each SQE describes one I/O operation. From the kernel header [`io_uring.h`](https://github.com/axboe/liburing/blob/master/src/include/liburing/io_uring.h):

```c
struct io_uring_sqe {
    __u8    opcode;      // what operation (read, write, accept, ...)
    __u8    flags;       // per-SQE flags (link, drain, async, ...)
    __u16   ioprio;      // I/O priority
    __s32   fd;          // file descriptor to operate on
    __u64   off;         // offset within the file
    __u64   addr;        // pointer to buffer (for read/write)
    __u32   len;         // length of the buffer
    __u64   user_data;   // opaque value returned in CQE
    // ... additional union fields for specific operations
};
```

The `opcode` field selects from over 60 supported operations:

```c
enum io_uring_op {
    IORING_OP_NOP,          // no-op (for benchmarking)
    IORING_OP_READV,        // vectored read
    IORING_OP_WRITEV,       // vectored write
    IORING_OP_READ,         // simple read
    IORING_OP_WRITE,        // simple write
    IORING_OP_FSYNC,        // fsync
    IORING_OP_ACCEPT,       // accept a connection
    IORING_OP_CONNECT,      // connect to a server
    IORING_OP_SEND,         // send data on socket
    IORING_OP_RECV,         // receive data from socket
    IORING_OP_OPENAT,       // open a file
    IORING_OP_CLOSE,        // close a file descriptor
    IORING_OP_STATX,        // stat a file
    // ... 50+ more operations
};
```

The `user_data` field is crucial — it's an opaque 64-bit value that the application sets. The kernel copies it unchanged into the CQE. This is how the application matches completions to their original requests (usually by storing a pointer to a context struct).

## The Completion Queue Entry (CQE)

The CQE is intentionally tiny — just the result and the identifier:

```c
struct io_uring_cqe {
    __u64   user_data;   // copied from the SQE
    __s32   res;         // result (bytes transferred, or -errno)
    __u32   flags;       // CQE flags (e.g., buffer ID)
};
```

That's 16 bytes. The `res` field works like a system call return value: positive for success (e.g., number of bytes read), negative for error (e.g., `-EAGAIN`).

## The Lifecycle of an I/O Operation

Here is what happens step by step when an application reads a file using io_uring:

```
  Application                  Shared Memory              Kernel
      |                            |                        |
  1.  | io_uring_get_sqe()         |                        |
      |  get next free SQE ------->|                        |
      |                            |                        |
  2.  | io_uring_prep_read()       |                        |
      |  fill in opcode=READ,      |                        |
      |  fd, buf, len, offset ---->|                        |
      |                            |                        |
  3.  | io_uring_sqe_set_data()    |                        |
      |  set user_data ----------->|                        |
      |                            |                        |
  4.  | io_uring_submit()          |                        |
      |  advance SQ tail,          |                        |
      |  syscall: io_uring_enter() |                        |
      |  (or kernel polls SQ) -----+----------------------->|
      |                            |                        |
  5.  |                            |         kernel reads   |
      |                            |         SQE, performs  |
      |                            |         the read()     |
      |                            |                        |
  6.  |                            |<---- post CQE ---------|
      |                            |      (user_data,       |
      |                            |       res=bytes_read)  |
      |                            |                        |
  7.  | io_uring_wait_cqe()        |                        |
      |  read CQE <----------------|                        |
      |                            |                        |
  8.  | io_uring_cqe_seen()        |                        |
      |  advance CQ head --------->|                        |
      |                            |                        |
```

### Code example

Here is a complete example using the [liburing](https://github.com/axboe/liburing) helper library:

```c
#include <liburing.h>
#include <fcntl.h>
#include <stdio.h>

int main() {
    struct io_uring ring;
    char buf[4096];

    // Initialize io_uring with 32 SQ entries
    io_uring_queue_init(32, &ring, 0);

    // Open a file
    int fd = open("data.txt", O_RDONLY);

    // Step 1: Get a free SQE
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);

    // Step 2: Prepare a read operation
    io_uring_prep_read(sqe, fd, buf, sizeof(buf), 0);

    // Step 3: Tag it so we can identify it in the CQE
    io_uring_sqe_set_data(sqe, (void *)42);

    // Step 4: Submit to the kernel
    io_uring_submit(&ring);

    // Step 7: Wait for completion
    struct io_uring_cqe *cqe;
    io_uring_wait_cqe(&ring, &cqe);

    // Check result
    if (cqe->res < 0)
        printf("Error: %d\n", cqe->res);
    else
        printf("Read %d bytes, tag=%lld\n",
               cqe->res, (long long)cqe->user_data);

    // Step 8: Tell the kernel we're done with this CQE
    io_uring_cqe_seen(&ring, cqe);

    close(fd);
    io_uring_queue_exit(&ring);
    return 0;
}
```

## Why Ring Buffers? The Memory Layout

The ring buffers are mapped into user space via `mmap`, so both the application and kernel access the same physical memory pages. No copying. No context switching to read or write entries.

```
  Memory layout after io_uring_setup():

  +--------------------------------------------------+
  |  SQ Ring (mapped via mmap)                       |
  |                                                  |
  |  head  [kernel writes, app reads]                |
  |  tail  [app writes, kernel reads]                |
  |  mask  (ring_size - 1, for wrapping)             |
  |  array [index into SQE array]                    |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |  SQE Array (mapped via mmap, separate offset)    |
  |                                                  |
  |  [SQE 0][SQE 1][SQE 2]...[SQE N-1]            |
  +--------------------------------------------------+

  +--------------------------------------------------+
  |  CQ Ring (mapped via mmap)                       |
  |                                                  |
  |  head  [app writes, kernel reads]                |
  |  tail  [kernel writes, app reads]                |
  |  mask                                            |
  |  cqes  [CQE 0][CQE 1]...[CQE M-1]             |
  +--------------------------------------------------+
```

There's an indirection layer: the SQ ring doesn't contain SQEs directly — it contains **indices** into the SQE array. This allows the application to prepare SQEs out of order and submit them in any order.

The head and tail pointers use **memory barriers** (not locks) for synchronization:

```
  Submission (application is producer):

  1. Write SQE at sqes[sq.tail & sq.mask]
  2. Memory barrier (ensure SQE is visible)
  3. Increment sq.tail
  4. Memory barrier (ensure tail is visible to kernel)

  Completion (kernel is producer):

  1. Write CQE at cqes[cq.tail & cq.mask]
  2. Memory barrier
  3. Increment cq.tail
  4. Memory barrier
```

This lock-free design means neither the application nor the kernel ever blocks waiting for the other to release a lock.

## Batching: Amortizing System Call Cost

The real power of io_uring is **batching**. With traditional I/O, 1000 reads require 1000 `read()` system calls. With io_uring, you can fill 1000 SQEs and submit them all with a single `io_uring_enter()` call:

```
  Traditional I/O (1000 reads):

  User: read()  -> Kernel: do read -> User: read()  -> Kernel: ...
        ~~~~~~            ~~~~~            ~~~~~~
        syscall           work             syscall
        overhead          done             overhead

  1000 syscalls, 1000 context switches

  io_uring (1000 reads):

  User: fill 1000 SQEs -> io_uring_enter() -> Kernel: do 1000 reads
                           ~~~~~~~~~~~~~~
                           ONE syscall

  1 syscall, 1 context switch, 1000 operations
```

The `io_uring_submit()` function in liburing handles this:

```c
IOURINGINLINE struct io_uring_sqe *io_uring_get_sqe(struct io_uring *ring)
{
    return _io_uring_get_sqe(ring);
}
```

You can call `io_uring_get_sqe()` repeatedly to fill multiple SQEs, then call `io_uring_submit()` once. The kernel processes all of them.

## Kernel Polling Mode (SQPOLL)

io_uring can go even further: with `IORING_SETUP_SQPOLL`, the kernel spawns a dedicated thread that continuously polls the submission queue. The application never needs to make a system call at all — it just writes SQEs to shared memory and reads CQEs back:

```
  Normal mode:                    SQPOLL mode:

  App writes SQE                  App writes SQE
       |                               |
       v                               v
  io_uring_enter()               (no syscall needed!)
  (syscall)                            |
       |                               v
       v                         Kernel poll thread
  Kernel processes               sees new SQE tail,
  SQE                            processes SQE
       |                               |
       v                               v
  Posts CQE                       Posts CQE
       |                               |
       v                               v
  App reads CQE                   App reads CQE
```

```c
// Initialize with kernel polling
struct io_uring_params params = {
    .flags = IORING_SETUP_SQPOLL,
    .sq_thread_idle = 2000,  // kernel thread sleeps after 2s idle
};
io_uring_queue_init_params(32, &ring, &params);
```

The trade-off: SQPOLL dedicates a CPU core to polling. This is worth it for high-throughput workloads (databases, storage engines) but wasteful for low-throughput applications.

## Linked Operations

SQEs can be **linked** together, forming a chain where each operation starts only after the previous one completes. If any operation in the chain fails, the rest are cancelled:

```
  Linked chain: open -> read -> close

  SQE 0: OPENAT  (flags |= IOSQE_IO_LINK)
     |
     v  (only if open succeeds)
  SQE 1: READ    (flags |= IOSQE_IO_LINK)
     |
     v  (only if read succeeds)
  SQE 2: CLOSE   (no link flag — end of chain)
```

```c
// Open file
sqe = io_uring_get_sqe(&ring);
io_uring_prep_openat(sqe, AT_FDCWD, "data.txt", O_RDONLY, 0);
sqe->flags |= IOSQE_IO_LINK;

// Read from the fd returned by open
sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, 0, buf, sizeof(buf), 0);
sqe->flags |= IOSQE_IO_LINK | IOSQE_FIXED_FILE;

// Close the fd
sqe = io_uring_get_sqe(&ring);
io_uring_prep_close(sqe, 0);

io_uring_submit(&ring);
```

This lets you express multi-step I/O workflows without round-tripping to user space between steps. The entire open-read-close sequence happens in kernel space.

## Fixed Buffers and Fixed Files

Two more optimizations reduce per-operation overhead:

### Fixed buffers

Normally, the kernel must map and unmap user-space buffer addresses for each I/O operation. With `io_uring_register_buffers()`, you pre-register a set of buffers. The kernel maps them once and reuses the mapping, saving significant overhead for repeated I/O to the same buffers:

```
  Normal read:                    Fixed buffer read:

  Each SQE:                       One-time setup:
    kernel maps buf addr            io_uring_register_buffers()
    performs read                    kernel maps all bufs once
    kernel unmaps buf addr
                                  Each SQE:
  Cost: map + unmap per op          kernel uses pre-mapped buf
                                    performs read

                                  Cost: zero mapping per op
```

### Fixed files

Similarly, `io_uring_register_files()` pre-registers file descriptors. Instead of the kernel looking up the `fd` in the process's file table for each operation, it uses a pre-resolved reference. SQEs use the `IOSQE_FIXED_FILE` flag and an index into the registered array instead of an actual fd.

## Comparing I/O Models

```
  +------------------+------------------+------------------+
  |   Blocking I/O   |     epoll        |    io_uring      |
  +------------------+------------------+------------------+
  | 1 thread per fd  | 1 thread, many   | 1 thread, many   |
  |                  | fds              | fds              |
  +------------------+------------------+------------------+
  | Blocks on each   | Notifies when    | Submits I/O      |
  | read()/write()   | fd is ready,     | requests in      |
  |                  | then you call    | batch, kernel    |
  |                  | read()/write()   | does I/O async   |
  +------------------+------------------+------------------+
  | 1 syscall per    | 1 epoll_wait +   | 1 syscall for    |
  | operation        | 1 syscall per op | N operations     |
  |                  |                  | (or 0 with       |
  |                  |                  |  SQPOLL)         |
  +------------------+------------------+------------------+
  | Simple code      | Event-driven     | Ring buffer      |
  |                  | callbacks        | producer/consumer|
  +------------------+------------------+------------------+
  | Scales poorly    | Scales to 100K+  | Scales to        |
  | (threads)        | connections      | millions of IOPS |
  +------------------+------------------+------------------+
```

The key insight: epoll eliminates the *monitoring* cost (which fds are ready?) but not the *operation* cost (doing the actual I/O). io_uring eliminates both by batching operations through shared memory.

## Where io_uring is Used

| System | How it uses io_uring |
|--------|---------------------|
| **RocksDB** | Async file reads in `MultiGet` for reduced read latency |
| **ScyllaDB** | All disk and network I/O through io_uring via Seastar |
| **Nginx** (patches) | Async file serving without thread pools |
| **tokio-uring** | Rust async runtime backed by io_uring |
| **fio** | Benchmark tool, io_uring is the highest-performing engine |
| **PostgreSQL** (in progress) | Async I/O for WAL writes and buffer pool reads |

For databases, io_uring is particularly valuable because it allows submitting many small random reads (common in index lookups) in a single batch, dramatically reducing the per-read system call overhead.

## Performance: How Much Faster?

Jens Axboe (io_uring's author) published benchmarks showing:

- **Raw IOPS with polling**: io_uring with `SQPOLL` and `IOPOLL` achieves ~1.6M random read IOPS on NVMe, compared to ~1.1M with `libaio` — a **45% improvement**.
- **System call reduction**: A workload doing 100K IOPS drops from 100K `read()` syscalls/sec to roughly 1K `io_uring_enter()` calls/sec (with batching) or zero (with SQPOLL).
- **Latency**: P99 tail latency improves because there's no system call jitter — the hot path stays in user space.

The improvement is most dramatic on fast storage (NVMe SSDs) where the I/O device is fast enough that the system call overhead becomes a significant fraction of total latency. On slow storage (spinning disks), the I/O time dominates and the system call savings matter less.

## References

1. Axboe, J. *Efficient IO with io_uring* [document](https://kernel.dk/io_uring.pdf)
2. liburing — helper library for io_uring [repo](https://github.com/axboe/liburing)
3. io_uring kernel header [`io_uring.h`](https://github.com/axboe/liburing/blob/master/src/include/liburing/io_uring.h)
4. liburing user header [`liburing.h`](https://github.com/axboe/liburing/blob/master/src/include/liburing.h)
5. Lord of the io_uring — tutorial [guide](https://unixism.net/loti/)
6. How Linux epoll works [post](/posts/design-how-linux-epoll-works/)
7. io_uring man page — `io_uring_setup(2)` [man](https://man7.org/linux/man-pages/man2/io_uring_setup.2.html)
8. RocksDB MultiGet with io_uring [blog](https://rocksdb.org/blog/2022/10/07/asynchronous-io-in-rocksdb.html)
