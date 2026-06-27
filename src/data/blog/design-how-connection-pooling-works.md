---
author: JZ
pubDatetime: 2026-06-27T06:23:00Z
modDatetime: 2026-06-27T06:23:00Z
title: System Design - How Database Connection Pooling Works
tags:
  - design-system
  - design-concurrency
description:
  "How database connection pooling works: the cost of raw connections, pool lifecycle, idle/active management, connection multiplexing modes, HikariCP internals, and PgBouncer architecture with source code walkthrough."
---

## Table of contents

## Context

Imagine a web application that serves 10,000 requests per second. Each request needs to query the database. Without connection pooling, each request would:

1. Open a TCP connection to the database server.
2. Complete a TLS handshake (if encrypted).
3. Authenticate (username, password, protocol negotiation).
4. Execute the query.
5. Close the connection.

Steps 1–3 alone take **5–30 milliseconds** depending on network latency. That is an enormous overhead when the actual query might take only 1–2 ms. Worse, each open connection consumes **5–10 MB of memory** on the database server (thread stack, buffers, sort areas). If 10,000 clients each hold a connection, the database needs 50–100 GB of RAM just for connection state — before it has stored a single row.

```
  Without Connection Pooling
  ~~~~~~~~~~~~~~~~~~~~~~~~~~

  Client 1 ─────── TCP+TLS+Auth ──────── DB   (5-30ms overhead)
  Client 2 ─────── TCP+TLS+Auth ──────── DB   (5-30ms overhead)
  Client 3 ─────── TCP+TLS+Auth ──────── DB   (5-30ms overhead)
     ...              ...                 ...
  Client N ─────── TCP+TLS+Auth ──────── DB   (5-30ms overhead)

  Total connections at DB: N (one per client)
  Memory at DB: N × 5-10 MB


  With Connection Pooling
  ~~~~~~~~~~~~~~~~~~~~~~~

  Client 1 ──┐
  Client 2 ──┤                          ┌──── DB connection 1
  Client 3 ──┼──── [ Pool (P conns) ] ──┼──── DB connection 2
     ...     │                          ├──── DB connection 3
  Client N ──┘                          └──── ...

  Total connections at DB: P (where P << N)
  Memory at DB: P × 5-10 MB
```

**Connection pooling** solves both problems. A pool maintains a small set of pre-established connections. Clients "borrow" a connection from the pool, use it, and return it. The expensive setup cost is paid once, then amortized across thousands of requests.

## Anatomy of a Connection Pool

Every connection pool, regardless of implementation language, manages the same core state:

```
  +----------------------------------------------------------+
  |                   Connection Pool                         |
  |                                                          |
  |  Configuration:                                          |
  |    minIdle       = 5      (always keep 5 ready)          |
  |    maxPoolSize   = 20     (never exceed 20)              |
  |    maxLifetime   = 30min  (replace after 30 min)         |
  |    idleTimeout   = 10min  (close if unused 10 min)       |
  |    connTimeout   = 5s     (wait max 5s for a conn)       |
  |                                                          |
  |  State:                                                  |
  |    totalConnections  = 12                                |
  |    activeConnections = 7   (checked out, in use)         |
  |    idleConnections   = 5   (in pool, waiting)            |
  |    waitingThreads    = 0   (blocked callers)             |
  |                                                          |
  |  Idle Queue (LIFO):                                      |
  |    [ conn_8, conn_5, conn_3, conn_11, conn_2 ]          |
  |                                                          |
  +----------------------------------------------------------+
```

The lifecycle of a pooled connection looks like this:

```
  ┌──────────┐    pool has idle?     ┌──────────┐
  │  Client  │ ───── yes ──────────> │  Borrow  │
  │ requests │                       │  (fast)  │
  │   conn   │ ───── no ─────┐      └────┬─────┘
  └──────────┘               │           │
                             v           │
                    ┌────────────────┐   │
                    │ totalConns <   │   │
                    │ maxPoolSize?   │   │
                    └───┬──────┬────┘   │
                    yes │      │ no     │
                        v      v        │
               ┌──────────┐  ┌──────┐  │
               │  Create   │  │ Wait │  │
               │  new conn │  │ (up  │  │
               │  (slow)   │  │ to   │  │
               └─────┬─────┘  │ 5s)  │  │
                     │        └──┬───┘  │
                     v           v      v
                 ┌───────────────────────────┐
                 │     Client uses conn      │
                 │  (executes SQL, etc.)      │
                 └─────────────┬─────────────┘
                               │
                               v
                 ┌───────────────────────────┐
                 │     Return to pool         │
                 │  - validate (alive?)       │
                 │  - reset state             │
                 │  - push to idle queue      │
                 └───────────────────────────┘
```

### Why LIFO, Not FIFO?

Most high-performance pools use a **LIFO** (last-in, first-out) idle queue. The most recently returned connection is handed out first. Why?

1. **Warm TCP connections.** A recently-used connection has buffers in the kernel's TCP stack still warm. The OS hasn't reclaimed the socket buffer memory.
2. **Allows idle connections to timeout.** If the pool keeps reusing the "top" connections, the ones at the bottom naturally age out and get closed when they hit `idleTimeout`. This self-sizes the pool to actual demand.
3. **Better cache locality on the database.** The DB server's thread that served this connection recently may still have relevant data in its CPU cache.

## HikariCP: The Fastest JVM Connection Pool

[HikariCP](https://github.com/brettwooldridge/HikariCP) is the default connection pool in Spring Boot and one of the most performance-optimized pool implementations. Let's walk through how it achieves sub-microsecond borrow times.

### The ConcurrentBag

HikariCP's secret weapon is `ConcurrentBag` — a custom lock-free data structure that avoids the contention of typical `BlockingQueue` implementations. Here is the simplified architecture:

```
  ConcurrentBag<PoolEntry>
  ~~~~~~~~~~~~~~~~~~~~~~~~

  +------------------------------------+
  |  ThreadLocal<List<PoolEntry>>      |  ← each thread caches
  |  threadList                        |    its own entries
  +------------------------------------+
  |  CopyOnWriteArrayList<PoolEntry>   |  ← shared list of all
  |  sharedList                        |    pool entries
  +------------------------------------+
  |  SynchronousQueue<PoolEntry>       |  ← handoff queue for
  |  handoffQueue                      |    waiting threads
  +------------------------------------+

  Borrow path (fast to slow):
  1. Check threadLocal list  → O(1), no lock
  2. Scan sharedList         → CAS on entry state
  3. Wait on handoffQueue    → park thread (timeout)
```

From [`com.zaxxer.hikari.util.ConcurrentBag`](https://github.com/brettwooldridge/HikariCP/blob/dev/src/main/java/com/zaxxer/hikari/util/ConcurrentBag.java):

```java
public T borrow(long timeout, final TimeUnit timeUnit) throws InterruptedException {
    // 1. Try thread-local steal
    final List<Object> list = threadList.get();
    for (int i = list.size() - 1; i >= 0; i--) {  // LIFO scan
        final Object entry = list.remove(i);
        final T bagEntry = weakThreadLocals ? ((WeakReference<T>) entry).get() : (T) entry;
        if (bagEntry != null && bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
            return bagEntry;
        }
    }

    // 2. Scan shared list
    final int waiting = waiters.incrementAndGet();
    try {
        for (T bagEntry : sharedList) {
            if (bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
                if (waiting > 1) {
                    listener.addBagItem(waiting - 1);  // signal: need more conns
                }
                return bagEntry;
            }
        }
        listener.addBagItem(waiting);  // all in use → create more

        // 3. Wait for handoff
        timeout = timeUnit.toNanos(timeout);
        do {
            final T bagEntry = handoffQueue.poll(timeout, NANOSECONDS);
            if (bagEntry == null || bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
                return bagEntry;  // null means timeout
            }
        } while (timeout > 0);
        return null;
    } finally {
        waiters.decrementAndGet();
    }
}
```

The key insight: **most borrows never leave step 1**. In a typical web server, each request-handling thread borrows and returns connections repeatedly. The thread-local cache means that thread gets "its own" connection back without touching any shared data structure or lock.

### Connection Health Checking

When a connection is borrowed, HikariCP must verify it's still alive. A dead connection (server closed it, network blip, idle timeout on the DB side) would cause the application query to fail. But health checks are expensive — executing `SELECT 1` or `JDBC4 isValid()` takes a network round-trip.

HikariCP's solution: **skip the check if the connection was used recently**.

```java
if (elapsedMillis(poolEntry.lastAccessed, now) > aliveBypassWindowMs) {
    // Connection sat idle too long — validate it
    if (!isConnectionAlive(poolEntry.connection)) {
        closeConnection(poolEntry, EVICTED_CONNECTION_MESSAGE);
        timeout -= elapsedNanos(startTime);
        continue;  // try next connection
    }
}
```

The default `aliveBypassWindowMs` is 500 ms. If a connection was returned less than 500 ms ago, HikariCP trusts it's still good. This eliminates validation round-trips for hot connections.

## PgBouncer: External Connection Multiplexer

While HikariCP lives inside the application, [PgBouncer](https://github.com/pgbouncer/pgbouncer) sits between applications and PostgreSQL as a lightweight proxy. It is written in C, uses event-driven I/O (libevent), and handles **thousands of client connections** with a single thread and minimal memory.

```
  Application Architecture with PgBouncer
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  App Server 1 ──┐
    (100 conns)  │
                 │
  App Server 2 ──┼───── PgBouncer ────── PostgreSQL
    (100 conns)  │     (20 server        (20 backends)
                 │      connections)
  App Server 3 ──┘
    (100 conns)

  300 client connections → 20 server connections
  Multiplexing ratio: 15:1
```

### Three Multiplexing Modes

PgBouncer offers three modes that trade off between compatibility and efficiency:

```
  Session Mode (most compatible, least efficient)
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Client connects ──── gets server conn ──── keeps it until disconnect

  Timeline:
  Client:  |===== session (minutes/hours) =====|
  Server:  |===== locked to this client ========|

  Use when: application uses session-level features (LISTEN/NOTIFY,
            prepared statements, temp tables, SET variables)


  Transaction Mode (best balance)
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Client connects ──── gets server conn per TXN ──── released after COMMIT

  Timeline:
  Client:  |──── idle ────|== TXN ==|──── idle ────|== TXN ==|
  Server:                  |== TXN ==|              |== TXN ==|
                           ↑ assigned    ↑ returned

  Use when: application uses simple queries without session state.
            Most common mode for web applications.


  Statement Mode (most efficient, most restrictive)
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Client gets server conn for a single statement, released immediately.

  Timeline:
  Client:  |─ idle ─|=stmt=|─ idle ─|=stmt=|─ idle ─|=stmt=|
  Server:            |=stmt=|         |=stmt=|         |=stmt=|

  Use when: autocommit workloads only. Multi-statement transactions
            are NOT supported.
```

### PgBouncer Internals: Event Loop

PgBouncer uses a single-threaded event loop. Every client and server socket is registered with `libevent`. When data arrives, PgBouncer reads the PostgreSQL protocol packets, decides where to route them, and writes them to the target socket.

From the source code, the main data structures in [`include/bouncer.h`](https://github.com/pgbouncer/pgbouncer/blob/master/include/bouncer.h):

```c
struct PgSocket {
    struct List      head;          // linked list node
    struct PgSocket *link;          // paired socket (client↔server)
    struct PgPool   *pool;          // which pool this belongs to

    SocketState      state;         // login, active, idle, etc.
    struct event     ev;            // libevent handle

    PktBuf          *sbuf;          // streaming packet buffer
    SBuf             sbuf_real;     // the actual buffer

    usec_t           connect_time;
    usec_t           request_time;
    usec_t           query_start;

    char             username[MAX_USERNAME];
    char             db_name[MAX_DBNAME];
};

struct PgPool {
    struct List      active_client_list;   // clients with queries running
    struct List      waiting_client_list;  // clients waiting for a server
    struct List      active_server_list;   // servers running queries
    struct List      idle_server_list;     // servers available for reuse
    struct List      used_server_list;     // servers recently returned

    PgDatabase      *db;
    PgUser          *user;
    PoolStats        stats;
};
```

The assignment logic (simplified from `janitor.c`):

```c
/* Called when a server connection becomes free */
static void release_server(PgSocket *server) {
    PgPool *pool = server->pool;
    PgSocket *client;

    /* Is anyone waiting? */
    client = first_socket(&pool->waiting_client_list);
    if (client) {
        /* Pair them immediately */
        list_del(&client->head);
        activate_client(client, server);
    } else {
        /* Nobody waiting — park server in idle list */
        list_append(&pool->idle_server_list, &server->head);
        server->state = SV_IDLE;
    }
}
```

This is the **handoff pattern**: when a server connection finishes a transaction (in transaction mode), PgBouncer checks if any client is waiting. If yes, the server is immediately paired with the next waiting client — zero idle time. If nobody is waiting, the server goes to the idle list.

## Connection Lifetime Management

Connections don't live forever. There are several reasons to rotate them:

```
  Connection Lifetime Events
  ~~~~~~~~~~~~~~~~~~~~~~~~~~

  Time ─────────────────────────────────────────────>

  │ created                                    maxLifetime reached
  │    │                                           │
  v    v                                           v
  ─────[====used====][idle][===used===][idle]──────X──── close & replace

                      │         │
                      │         └─── idleTimeout: if this idle gap
                      │              exceeds threshold, close it
                      │
                      └─── validation: on borrow, check if still alive
```

**Why `maxLifetime`?** Even healthy connections should be rotated because:

1. **DNS changes.** If the database endpoint is behind a load balancer or DNS record that changes (e.g., failover), old connections still point to the old server.
2. **Memory leaks.** Some database servers accumulate per-connection memory over time (prepared statement caches, temp table metadata).
3. **Server-side limits.** MySQL's `wait_timeout` kills connections after inactivity. If the pool doesn't rotate proactively, borrows hit dead connections.
4. **Rolling restarts.** During database upgrades, old connections to shutting-down nodes should drain naturally.

HikariCP adds **jitter** to `maxLifetime` to prevent all connections from expiring simultaneously (which would cause a "thundering herd" of new connection attempts):

```java
// From HikariCP's HouseKeeper task
final long variance = maxLifetime > 10_000 ? ThreadLocalRandom.current().nextLong(maxLifetime / 40)
                                           : 0;
final long lifetime = maxLifetime - variance;  // ±2.5% jitter
```

## Connection Pool Sizing: The Formula

How many connections should you have? More is not better. PostgreSQL's official recommendation is:

```
  connections = ((core_count * 2) + effective_spindle_count)
```

For a modern server with 16 cores and SSDs (no spindles):

```
  connections = (16 * 2) + 1 = 33
```

This is counterintuitive. Why would 33 connections outperform 500? Because of **context switching** and **lock contention** inside the database:

```
  With 33 connections (optimal):
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  CPU core 0: [query A][query B][query C]...  ← minimal switching
  CPU core 1: [query D][query E][query F]...
     ...
  Lock wait graph: mostly empty

  With 500 connections (too many):
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  CPU core 0: [A][ctx][B][ctx][C][ctx][D]...  ← constant switching
  CPU core 1: [E][ctx][F][ctx][G][ctx][H]...
     ...
  Lock wait graph: deep chains, deadlock risk ↑

  Throughput actually DECREASES with more connections!
```

The database has a fixed number of CPU cores. Each active connection is a thread (in PostgreSQL) or a thread from a thread pool (in MySQL). When there are more active threads than cores, the OS must context-switch between them. Each context switch costs **1–10 microseconds** and trashes CPU caches.

## Putting It Together: A Request's Journey

Let's trace a single HTTP request through a pooled system:

```
  1. HTTP request arrives at app server
     │
  2. App calls pool.getConnection()
     │
     ├── Pool checks thread-local cache (HikariCP)
     │   └── Found! CAS state NOT_IN_USE → IN_USE (< 100ns)
     │
  3. App executes: SELECT * FROM users WHERE id = 42
     │
     ├── Connection sends query over existing TCP socket
     │   (no handshake needed — already established)
     │
     ├── DB processes query (1-2ms)
     │
     ├── Result returned over same socket
     │
  4. App calls connection.close()  ← does NOT close the TCP socket!
     │
     ├── Pool intercepts close()
     ├── Resets connection state (clear warnings, autocommit=true)
     ├── Records lastAccessed = now
     ├── CAS state IN_USE → NOT_IN_USE
     └── Places in thread-local list (or handoff to waiting thread)

  Total overhead from pooling: ~100-500 nanoseconds
  Overhead without pooling:    ~5-30 milliseconds
  Speedup: 10,000x – 300,000x for connection acquisition
```

## Common Pitfalls

**1. Connection leaks.** If application code borrows a connection but never returns it (exception thrown before `close()`), the pool slowly drains. HikariCP detects this with `leakDetectionThreshold` — if a connection is held longer than N ms, it logs a stack trace of where it was borrowed.

**2. Pool exhaustion.** If all connections are in use and a thread waits longer than `connectionTimeout`, it gets a `SQLException`. This cascades: the HTTP request fails, the user retries, creating more load. Solution: set `maxPoolSize` based on the database formula above, and use circuit breakers to fail fast.

**3. Long transactions holding connections.** A single `BEGIN ... (long computation) ... COMMIT` holds a connection hostage for the entire duration. In transaction-mode PgBouncer, this blocks other clients from using that server connection. Keep transactions short.

**4. Misconfigured `maxLifetime`.** If your pool's `maxLifetime` is longer than the database's `wait_timeout` (MySQL default: 8 hours), the pool will hand out connections that the database has already closed. Set `maxLifetime` to **2–3 minutes less** than the DB timeout.

## References

1. HikariCP wiki — [About Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)
2. PgBouncer documentation — [pgbouncer.org](https://www.pgbouncer.org/)
3. PostgreSQL wiki — [Number Of Database Connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
4. HikariCP source — [ConcurrentBag.java](https://github.com/brettwooldridge/HikariCP/blob/dev/src/main/java/com/zaxxer/hikari/util/ConcurrentBag.java)
5. PgBouncer source — [bouncer.h](https://github.com/pgbouncer/pgbouncer/blob/master/include/bouncer.h)
6. Oracle — [JDBC Connection Pooling Best Practices](https://docs.oracle.com/en/database/)
