---
author: JZ
pubDatetime: 2026-05-11T10:00:00Z
modDatetime: 2026-05-11T10:00:00Z
title: System Design - How Linux io_uring Works
tags:
  - design-system
  - design-concurrency
description:
  "How Linux io_uring works: shared ring buffers between user space and kernel, submission and completion queues, zero-copy I/O without system call overhead, and how databases like RocksDB and TiKV use it for high-throughput storage."
---

## Table of contents

## Context

Imagine you are building a database storage engine. Every read and write to disk is a system call — `read()`, `write()`, `fsync()`. Each call crosses the boundary between your application (user space) and the operating system (kernel space). That boundary crossing is expensive: the CPU saves registers, switches privilege levels, copies data, and switches back. When your database handles millions of IOPS on fast NVMe SSDs, this overhead becomes the bottleneck — not the disk itself.

Linux has had asynchronous I/O before. The older `aio` (POSIX AIO) interface was limited: it only worked well with direct I/O (`O_DIRECT`), couldn't handle buffered I/O or network sockets, and still required system calls to submit and reap completions. Developers often fell back to thread pools to fake async I/O.

In 2019, Jens Axboe (the maintainer of the Linux block I/O layer) introduced **io_uring** in Linux 5.1. The core idea is deceptively simple: share two ring buffers between user space and the kernel so that I/O requests can be submitted and completed **without any system calls** in the fast path.

```
  Traditional I/O                           io_uring
  =============                             ========

  User space       Kernel                   User space        Kernel
  +--------+      +--------+               +--------+       +--------+
  |  app   |      |   OS   |               |  app   |       |   OS   |
  |        | ---> |        |               |        |       |        |
  | read() | syscall       |               |  push  |       |        |
  |        | <--- | result |               |  to SQ |------>| poll   |
  |        |      |        |               |        | shared| SQ     |
  | write()| ---> |        |               |  poll  | memory|        |
  |        | syscall       |               |  CQ    |<------| push   |
  |        | <--- | result |               |        |       | to CQ  |
  +--------+      +--------+               +--------+       +--------+

  2 syscalls for 2 ops                      0 syscalls in fast path
```

The result: io_uring can sustain **millions of IOPS** with near-zero system call overhead, making it the preferred I/O interface for high-performance databases, web servers, and storage engines on modern Linux.

## The Two Ring Buffers

The heart of io_uring is a pair of ring buffers (circular queues) that live in memory shared between your application and the kernel:

1. **Submission Queue (SQ):** Your application pushes I/O requests here.
2. **Completion Queue (CQ):** The kernel pushes completed results here.

```
                    Shared Memory Region
    +--------------------------------------------------+
    |                                                  |
    |   Submission Queue (SQ)                          |
    |   +----+----+----+----+----+----+----+----+      |
    |   | e0 | e1 | e2 | e3 |    |    |    |    |      |
    |   +----+----+----+----+----+----+----+----+      |
    |     ^              ^                             |
    |     |              |                             |
    |    tail           head                           |
    |   (app writes)   (kernel reads)                  |
    |                                                  |
    |   Completion Queue (CQ)                          |
    |   +----+----+----+----+----+----+----+----+      |
    |   | c0 | c1 |    |    |    |    |    |    |      |
    |   +----+----+----+----+----+----+----+----+      |
    |     ^         ^                                  |
    |     |         |                                  |
    |    head      tail                                |
    |   (app reads) (kernel writes)                    |
    |                                                  |
    +--------------------------------------------------+
```

The key insight is that each ring buffer has two pointers — a **head** and a **tail** — and only one side modifies each pointer. The app advances the SQ tail (to add entries) and the CQ head (to consume completions). The kernel advances the SQ head (to consume entries) and the CQ tail (to add completions). Because each pointer has a single writer, no locks are needed — just memory barriers to ensure visibility across CPU cores.

This is a classic **single-producer, single-consumer (SPSC) ring buffer** — the same lock-free pattern used in high-frequency trading systems and the Linux kernel's own `kfifo`.

## Submission Queue Entries (SQE)

Each slot in the submission queue holds a **Submission Queue Entry** (SQE), a 64-byte structure that describes one I/O operation. The kernel defines it in [`include/uapi/linux/io_uring.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/io_uring.h):

```c
struct io_uring_sqe {
    __u8    opcode;     // what operation: IORING_OP_READ, IORING_OP_WRITE, ...
    __u8    flags;      // per-request flags
    __u16   ioprio;     // I/O priority
    __s32   fd;         // file descriptor
    __u64   off;        // offset in file
    __u64   addr;       // pointer to buffer (user space address)
    __u32   len;        // buffer length
    // ... union of op-specific fields ...
    __u64   user_data;  // opaque value returned in CQE (your cookie)
};
```

The `opcode` field tells the kernel what to do. io_uring supports a wide range of operations:

```
  Opcode                     Description
  -------------------------  -----------------------------------
  IORING_OP_READ             read from file descriptor
  IORING_OP_WRITE            write to file descriptor
  IORING_OP_FSYNC            flush file to disk
  IORING_OP_READV / WRITEV   scatter-gather read/write
  IORING_OP_ACCEPT           accept incoming TCP connection
  IORING_OP_CONNECT          initiate TCP connection
  IORING_OP_SEND / RECV      send/receive on socket
  IORING_OP_OPENAT           open a file
  IORING_OP_CLOSE            close a file descriptor
  IORING_OP_STATX            stat a file
  IORING_OP_POLL_ADD         poll a file descriptor for events
```

The `user_data` field is critical: it is an opaque 64-bit value that the kernel copies unchanged into the completion entry. Your application uses this to match completions to requests — typically storing a pointer to a request context or a request ID.

## Completion Queue Entries (CQE)

When the kernel finishes an I/O operation, it writes a **Completion Queue Entry** (CQE) to the completion ring:

```c
struct io_uring_cqe {
    __u64   user_data;  // copied from the SQE you submitted
    __s32   res;        // result: bytes transferred, or negative errno
    __u32   flags;      // completion flags
};
```

Each CQE is only 16 bytes — deliberately small to maximize cache efficiency when your application scans completions. The `res` field works like the return value of the corresponding system call: positive for success (e.g., bytes read), negative for error (e.g., `-EAGAIN`).

## Lifecycle of an I/O Request

Here is the full journey of a single read request through io_uring:

```
  Application                    Kernel
  ===========                    ======

  1. Fill SQE in SQ array
     sqe->opcode = IORING_OP_READ
     sqe->fd = fd
     sqe->addr = buf
     sqe->len = 4096
     sqe->user_data = my_cookie
            |
            v
  2. Advance SQ tail
     (memory barrier)
            |
            v
  3. Notify kernel           -->  4. Kernel sees new SQ entry
     io_uring_enter()                reads SQE from SQ head
     (or kernel polls SQ)           advances SQ head
                                           |
                                           v
                                    5. Kernel performs read
                                       (may complete inline
                                        or queue to worker)
                                           |
                                           v
                                    6. Kernel writes CQE
                                       cqe->user_data = my_cookie
                                       cqe->res = 4096
                                       advances CQ tail
                                       (memory barrier)
            |                              |
            v                              v
  7. Application polls CQ head
     sees new CQE
     reads result
     advances CQ head
            |
            v
  8. Process completed I/O
     (buffer now has data)
```

Steps 2 and 7 are the fast path — just pointer bumps and memory barriers, no system calls. Step 3 (the `io_uring_enter()` call) is only needed if the kernel is not polling the SQ on its own (more on that below).

## Setting Up io_uring: The Three System Calls

io_uring uses only three system calls — and in the best case, you only need the first one after setup:

### `io_uring_setup`

Creates a new io_uring instance and returns a file descriptor:

```c
int io_uring_setup(unsigned entries, struct io_uring_params *params);
```

The `entries` parameter sets the SQ size (the CQ is typically double). The kernel allocates the shared memory region and returns offsets in `params` that your application uses to `mmap` the rings:

```c
// Setup
struct io_uring_params params = {0};
int ring_fd = io_uring_setup(256, &params);

// Map the SQ ring
void *sq_ptr = mmap(NULL, params.sq_off.array + params.sq_entries * sizeof(__u32),
                    PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE,
                    ring_fd, IORING_OFF_SQ_RING);

// Map the SQE array
void *sqe_ptr = mmap(NULL, params.sq_entries * sizeof(struct io_uring_sqe),
                     PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE,
                     ring_fd, IORING_OFF_SQES);

// Map the CQ ring
void *cq_ptr = mmap(NULL, params.cq_off.cqes + params.cq_entries * sizeof(struct io_uring_cqe),
                    PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE,
                    ring_fd, IORING_OFF_CQ_RING);
```

After these `mmap` calls, both your application and the kernel see the same memory. No copying needed.

### `io_uring_enter`

Tells the kernel to consume SQEs and optionally wait for CQEs:

```c
int io_uring_enter(int ring_fd, unsigned to_submit,
                   unsigned min_complete, unsigned flags);
```

- `to_submit`: number of new SQEs to consume from the SQ.
- `min_complete`: block until at least this many CQEs are available.
- `flags`: `IORING_ENTER_GETEVENTS` to wait, `IORING_ENTER_SQ_WAKEUP` to wake the kernel polling thread.

In polling mode (described next), you may never need to call this at all.

### `io_uring_register`

Pre-registers file descriptors or buffers with the kernel, avoiding repeated lookups:

```c
int io_uring_register(int ring_fd, unsigned opcode, void *arg, unsigned nr_args);
```

This is an optimization. Normally, for each SQE the kernel must look up the file descriptor in your process's file table and pin the user buffer pages. If you register them upfront, the kernel caches these lookups — saving cycles on every I/O.

## Polling Modes: Eliminating All System Calls

io_uring supports two polling modes that can eliminate system calls entirely:

### Kernel-side SQ Polling (`IORING_SETUP_SQPOLL`)

The kernel spawns a dedicated thread that continuously polls the submission queue for new entries:

```
  +------------------+          +------------------+
  |   Application    |          |     Kernel       |
  |                  |          |                  |
  |  fill SQE       |          |  sqpoll thread:  |
  |  bump SQ tail   |  shared  |  while (true) {  |
  |  (no syscall!)   |  memory  |    check SQ tail |
  |                  | -------> |    if new SQEs:  |
  |  check CQ head  |          |      process     |
  |  read results   |          |      them         |
  |  (no syscall!)   | <------- |    post CQEs     |
  |                  |          |  }               |
  +------------------+          +------------------+
```

With `SQPOLL`, your application never calls `io_uring_enter()` — it just writes to shared memory and reads from shared memory. The trade-off is a dedicated kernel thread burning CPU cycles polling, even when idle. After a configurable idle timeout, the thread sleeps and your app must call `io_uring_enter(IORING_ENTER_SQ_WAKEUP)` to restart it.

### I/O Polling (`IORING_SETUP_IOPOLL`)

Instead of using interrupts to signal I/O completion, the kernel busy-polls the storage device's completion queue. This shaves off interrupt latency (typically 2-5 microseconds) at the cost of CPU. NVMe SSDs support this natively through their hardware completion queues.

Combining both flags gives the absolute lowest latency: no system calls and no interrupts.

## SQ Indirection: Why There Are Two Arrays

There is a subtle design detail: the submission queue does not directly contain SQE structs. Instead, SQ entries are **indices** into a separate SQE array:

```
  Submission Queue (SQ ring)           SQE Array
  +---+---+---+---+---+---+           +-------+-------+-------+-------+
  | 2 | 0 | 3 |   |   |   |           | sqe_0 | sqe_1 | sqe_2 | sqe_3 |
  +---+---+---+---+---+---+           +-------+-------+-------+-------+
    |       |                             ^               ^       ^
    |       +-----------------------------+               |       |
    +-----------------------------------------------------+       |
            +-----------------------------------------------------+
```

Why the extra indirection? Two reasons:

1. **SQEs are 64 bytes.** Moving 64-byte structs around a ring buffer would be expensive (cache-line bouncing). Moving 4-byte indices is cheap.
2. **Flexible ordering.** Your application can prepare SQEs in any order and then submit them in a different order by arranging the indices. This is useful for chaining operations or implementing priority schemes.

## Linked Requests and Chains

io_uring can chain dependent operations so the kernel executes them in order without round-tripping to user space:

```c
// Chain: write data, then fsync, as one atomic sequence
struct io_uring_sqe *sqe1 = get_next_sqe();
io_uring_prep_write(sqe1, fd, buf, len, offset);
sqe1->flags |= IOSQE_IO_LINK;  // link to next SQE

struct io_uring_sqe *sqe2 = get_next_sqe();
io_uring_prep_fsync(sqe2, fd, 0);
// sqe2 only executes after sqe1 completes successfully
```

```
  Linked Chain Execution
  ========================

  SQE 1 (write)  --LINK-->  SQE 2 (fsync)
       |                         |
       v                         v
   execute write             wait for write
       |                         |
       v                         v
   write done  ------------> execute fsync
                                 |
                                 v
                             CQE 1 (write result)
                             CQE 2 (fsync result)
```

If any operation in a chain fails, subsequent linked operations are cancelled with `-ECANCELED`. This is perfect for database write-ahead logging: write the log record, then fsync, as one submission.

## The liburing Helper Library

Working with raw `mmap` offsets and memory barriers is error-prone. [liburing](https://github.com/axboe/liburing) wraps the low-level details:

```c
#include <liburing.h>

int main() {
    struct io_uring ring;
    io_uring_queue_init(256, &ring, 0);

    // Prepare a read
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    io_uring_prep_read(sqe, fd, buf, 4096, 0);
    io_uring_sqe_set_data(sqe, my_context);

    // Submit
    io_uring_submit(&ring);

    // Wait for completion
    struct io_uring_cqe *cqe;
    io_uring_wait_cqe(&ring, &cqe);

    // Process result
    int bytes_read = cqe->res;
    void *ctx = io_uring_cqe_get_data(cqe);
    io_uring_cqe_seen(&ring, cqe);

    io_uring_queue_exit(&ring);
}
```

Under the hood, `io_uring_submit()` calls `io_uring_enter()` only when necessary, and `io_uring_wait_cqe()` checks the CQ first before making any system call — staying on the fast path whenever possible.

## How Databases Use io_uring

### RocksDB

RocksDB (the storage engine behind TiKV, CockroachDB, and many others) added io_uring support for its `MultiRead` path. When reading multiple SST file blocks for a range scan, RocksDB submits all reads as a batch through io_uring instead of issuing individual `pread()` calls:

```
  Traditional pread() path          io_uring MultiRead path
  ========================          =======================

  for each block:                   for each block:
    pread(fd, buf, len, off)          fill SQE(fd, buf, len, off)
    // syscall + context switch
    // wait for completion            io_uring_submit_and_wait()
    // next iteration                 // one syscall for all reads
                                      // kernel processes in parallel

  N syscalls for N blocks           1 syscall for N blocks
```

This is especially effective on NVMe drives where the device can handle thousands of concurrent requests internally. The [`io_uring.cc`](https://github.com/facebook/rocksdb/blob/main/env/io_posix.cc) integration in RocksDB shows how `MultiRead` batches SQEs and reaps CQEs.

### TiKV

TiKV, the distributed storage layer of TiDB, uses RocksDB as its local storage engine. When io_uring is enabled in the underlying RocksDB, TiKV's read-heavy workloads (serving Coprocessor scans and point gets from SST files) benefit from batched I/O without any TiKV-level code changes.

### io_uring in Other Systems

- **PostgreSQL**: experimental patches for WAL writes and data file reads.
- **ScyllaDB**: uses io_uring through the Seastar framework for all disk and network I/O.
- **NGINX**: added io_uring support for serving static files, reducing syscall overhead under high concurrency.
- **Tokio (Rust)**: the `tokio-uring` crate provides an async runtime built on io_uring instead of epoll.

## io_uring vs. epoll vs. aio

```
  Feature              epoll              aio (libaio)        io_uring
  -------------------  -----------------  ------------------  ------------------
  I/O types            sockets, pipes,    block devices       everything: files,
                       files (readiness)  (O_DIRECT only)     sockets, timers,
                                                              FS operations

  Submission cost      epoll_wait() +     io_submit()         0 syscalls
                       read()/write()     (1 syscall)         (with SQPOLL)

  Completion model     readiness-based    completion-based    completion-based
                       (still need I/O    (callback)          (poll CQ ring)
                       syscall after)

  Buffered I/O         yes (readiness)    no                  yes

  Network I/O          yes                no                  yes

  Batching             no (one op at a    yes                 yes
                       time per fd)

  Kernel thread pool   no                 no                  yes (io-wq)

  Zero-copy submit     no                 no                  yes (shared mem)

  Min Linux version    2.6 (2004)         2.5 (2002)          5.1 (2019)
```

The key distinction: **epoll tells you when I/O is ready** (then you still do the actual I/O yourself), while **io_uring tells you when I/O is done** (the kernel does it for you). This completion-based model eliminates an entire round trip.

## Security Considerations

io_uring's power comes with risk. Because it lets user space trigger kernel operations without system calls, security monitoring tools that hook system calls (like `seccomp` and `strace`) initially could not see io_uring operations. An attacker could use io_uring to perform file reads, network connects, or even `openat` calls invisibly.

This led to restrictions:

- **Linux 5.12+**: `seccomp` can filter `io_uring_setup` and `io_uring_enter`.
- **Docker**: disabled io_uring in its default seccomp profile.
- **Google**: restricted io_uring on production servers until kernel hardening matured.
- **Linux 6.1+**: added per-operation restriction via `IORING_REGISTER_RESTRICTIONS`, letting administrators allowlist specific opcodes.

If you run containers in production, check whether your runtime allows io_uring before relying on it.

## References

1. Efficient IO with io_uring, Jens Axboe [pdf](https://kernel.dk/io_uring.pdf)
2. io_uring kernel source [`io_uring/io_uring.c`](https://github.com/torvalds/linux/blob/master/io_uring/io_uring.c)
3. io_uring UAPI header [`include/uapi/linux/io_uring.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/io_uring.h)
4. liburing library [github](https://github.com/axboe/liburing)
5. Lord of the io_uring tutorial [guide](https://unixism.net/loti/)
6. RocksDB io_uring integration [`env/io_posix.cc`](https://github.com/facebook/rocksdb/blob/main/env/io_posix.cc)
7. What is io_uring?, Linux man-pages [man](https://man7.org/linux/man-pages/man7/io_uring.7.html)
8. io_uring and security, Brendan Gregg [blog](https://www.brendangregg.com/blog/2022-05-31/io-uring.html)
9. How epoll works (companion post) [blog](/posts/design-how-linux-epoll-works)
