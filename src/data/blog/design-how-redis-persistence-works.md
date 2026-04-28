---
author: JZ
pubDatetime: 2026-04-28T12:02:00Z
modDatetime: 2026-04-28T12:02:00Z
title: System Design - How Redis Persistence Works
tags:
  - design-system
  - design-storage
description:
  "How Redis persists data to disk: RDB snapshots via fork() and copy-on-write, AOF (Append Only File) logging, fsync policies, AOF rewriting, and the hybrid RDB+AOF approach. Source code walkthrough from the redis/redis repository."
---

## Table of contents

## Context

Redis is an in-memory data store. Every key and value lives in RAM, which is what makes Redis fast — reads and writes take microseconds, not milliseconds. But RAM is volatile. If the Redis process crashes or the machine loses power, everything in memory disappears.

To survive restarts, Redis needs a way to write data to disk. This is called **persistence**. Redis offers two mechanisms that solve the problem from different angles, and a hybrid mode that combines them:

```
                   Redis Persistence Options

  +-------------------+    +-------------------+    +-------------------+
  |       RDB         |    |       AOF         |    |   RDB + AOF      |
  |   (snapshots)     |    | (append-only log) |    |    (hybrid)      |
  +-------------------+    +-------------------+    +-------------------+
  |                   |    |                   |    |                   |
  | Point-in-time     |    | Logs every write  |    | AOF file starts  |
  | binary dump of    |    | command to a file |    | with an RDB       |
  | all data          |    |                   |    | snapshot, then    |
  |                   |    |                   |    | appends commands  |
  | Compact file      |    | Near-zero data    |    |                   |
  | Fast to load      |    | loss possible     |    | Best of both      |
  | Some data loss    |    | Larger file       |    | worlds            |
  +-------------------+    +-------------------+    +-------------------+
```

Let's start with RDB, the original persistence mechanism.

## RDB: Point-in-Time Snapshots

An RDB file is a compact binary representation of the entire Redis dataset at a specific moment. Think of it as a photograph of memory — everything frozen in one frame.

### When does Redis create an RDB snapshot?

Redis can trigger a snapshot in several ways:

1. **Automatic save rules** — configured via `save <seconds> <changes>`. For example, `save 900 1` means "create a snapshot if at least 1 key changed in the last 900 seconds."
2. **Manual commands** — `BGSAVE` (background save) or `SAVE` (blocking save).
3. **Shutdown** — Redis creates a final snapshot before exiting cleanly.
4. **Replication** — when a replica connects, the primary creates an RDB to send over.

### The fork() trick

The interesting question is: how does Redis write a consistent snapshot to disk while continuing to serve requests? If Redis paused to write everything, it would block clients for seconds on large datasets.

Redis solves this with `fork()`, a Unix system call that creates a child process. The child is an almost-exact copy of the parent — same memory, same data structures, same everything. But thanks to the operating system's **copy-on-write (COW)** mechanism, the child doesn't actually duplicate any memory pages. Parent and child share the same physical pages until one of them modifies a page:

```
   Before fork()
   +------------------+
   | Redis process     |
   | (parent)          |
   |                   |
   | Page A [ hash1 ]  |----> Physical page 0x1000
   | Page B [ list1 ]  |----> Physical page 0x2000
   | Page C [ str1  ]  |----> Physical page 0x3000
   +------------------+


   After fork()  (copy-on-write)
   +------------------+         +------------------+
   | Redis parent      |         | Redis child       |
   | (serves clients)  |         | (writes RDB)      |
   |                   |         |                   |
   | Page A [ hash1 ]  |--+  +--| Page A [ hash1 ]  |
   | Page B [ list1 ]  |--+--+--| Page B [ list1 ]  |
   | Page C [ str1  ]  |--+--+--| Page C [ str1  ]  |
   +------------------+  | |  +------------------+
                          | |
                          v v
                   Physical pages (shared)
                   0x1000, 0x2000, 0x3000


   Parent writes to Page A (COW triggers)
   +------------------+         +------------------+
   | Redis parent      |         | Redis child       |
   |                   |         |                   |
   | Page A [ hash2 ]  |----> 0x4000 (new copy)     |
   | Page B [ list1 ]  |--+     | Page A [ hash1 ]  |----> 0x1000 (original)
   | Page C [ str1  ]  |--+--+--| Page B [ list1 ]  |
   +------------------+  |  |  | Page C [ str1  ]  |
                          |  |  +------------------+
                          v  v
                   0x2000, 0x3000 (still shared)
```

The child process sees a frozen snapshot of the data as it was at the moment of `fork()`. The parent continues modifying data, but those modifications only affect the parent's copy of the changed pages. The child iterates over its frozen view and writes everything to an RDB file.

### Source code: rdbSaveBackground

The entry point for background saves is in [`src/rdb.c`](https://github.com/redis/redis/blob/unstable/src/rdb.c):

```c
int rdbSaveBackground(int req, char *filename, rdbSaveInfo *rsi) {
    if (hasActiveChildProcess()) return C_ERR;

    server.dirty_before_bgsave = server.dirty;
    server.lastbgsave_try = time.time;

    if ((childpid = redisFork(CHILD_TYPE_RDB)) == 0) {
        /* Child process */
        redisSetProcTitle("redis-rdb-bgsave");
        retval = rdbSave(req, filename, rsi);
        if (retval == C_OK) {
            sendChildCowInfo(CHILD_INFO_TYPE_RDB, "RDB");
        }
        exitFromChild((retval == C_OK) ? 0 : 1);
    } else {
        /* Parent process */
        if (childpid == -1) {
            server.lastbgsave_status = C_ERR;
            return C_ERR;
        }
        server.rdb_child_type = RDB_CHILD_TYPE_DISK;
        return C_OK;
    }
    return C_OK;
}
```

After `redisFork()`, the child calls `rdbSave()` which walks every database and every key, serializing them into the compact RDB binary format. The parent records that a background save is in progress and goes back to serving clients.

### RDB file format

The RDB format is designed for compactness and fast loading. Here is its high-level structure:

```
  +-------+----------+---------+------+------+-----+------+-----+---+----------+
  | REDIS  | version  |  aux    | DB 0       ...    | DB N       ... | checksum |
  | magic  |  (4B)    | fields  | selector + keys   | selector + keys|  (8B)    |
  +-------+----------+---------+------+------+-----+------+-----+---+----------+
   5 bytes             metadata   per-database data                    CRC-64

  Per-database section:
  +------------+--------+---------+-------+--------+-------+-----+
  | DB selector| db num | resize  | type  | key    | value | ... |
  |  (0xFE)    |        | info    |       |        |       |     |
  +------------+--------+---------+-------+--------+-------+-----+

  Each key-value entry:
  +------+-----+-------+-----+-------+
  | type | TTL | key   | len | value |
  | (1B) |(opt)| (str) |     | (enc) |
  +------+-----+-------+-----+-------+
```

Integers are length-encoded to save space. A small number like `5` takes 1 byte instead of 8. Strings can be LZF-compressed if that saves space. This encoding makes RDB files significantly smaller than the in-memory representation.

### Trade-offs of RDB

**Pros:**
- Compact single file — easy to back up, copy to another server, or ship to S3.
- Fast restart — loading an RDB file is much faster than replaying thousands of commands.
- No runtime overhead between snapshots — Redis runs at full speed.

**Cons:**
- Data loss window — if Redis crashes between snapshots, all changes since the last snapshot are lost. With `save 900 1`, you could lose up to 15 minutes of data.
- `fork()` cost — on large datasets (tens of GB), `fork()` can take hundreds of milliseconds and cause a latency spike. COW also means memory usage can temporarily double in the worst case (if every page gets modified).

## AOF: Append-Only File

The AOF takes a completely different approach. Instead of periodically photographing the entire dataset, it **logs every write command** as it happens. To recover, Redis simply replays the log from beginning to end.

### How AOF logging works

When a client runs a write command like `SET user:1 "alice"`, Redis:

1. Executes the command (modifies in-memory data).
2. Appends the command to the AOF buffer.
3. Eventually writes (and optionally fsyncs) the buffer to disk.

```
  Client           Redis Server              Disk (AOF file)
    |                    |                         |
    | SET user:1 alice   |                         |
    |------------------->|                         |
    |                    |                         |
    |                    | 1. Execute in memory     |
    |                    | 2. Append to aof_buf     |
    |                    |                         |
    |    OK              |                         |
    |<-------------------|                         |
    |                    |                         |
    |                    | (event loop cycle ends)  |
    |                    |                         |
    |                    | 3. Write aof_buf to fd   |
    |                    |------------------------>|
    |                    | 4. fsync (policy-based)  |
    |                    |------------------------>|
    |                    |                         |

  AOF file contents (RESP protocol format):
  *3\r\n$3\r\nSET\r\n$6\r\nuser:1\r\n$5\r\nalice\r\n
```

Notice that Redis logs the command **after** executing it, not before. This is called **write-after** logging (as opposed to a write-ahead log like in PostgreSQL or MySQL). The advantage is that Redis never logs a command that failed to execute. The downside is that if Redis crashes between executing and logging, that one command is lost.

### fsync policies

The critical question for AOF durability is: **when does data actually reach disk?** Calling `write()` puts data in the OS page cache, but a power failure can still lose it. Only `fsync()` guarantees the data is on physical storage.

Redis offers three policies, configured via `appendfsync`:

```
  Policy          When fsync() runs           Data loss risk
  --------------- --------------------------- -------------------
  always          After every write command    Minimal (1 command)
                                              but slowest

  everysec        Once per second (default)   Up to 1 second of
                  via background thread        data; good balance

  no              Never (let OS decide)        OS-dependent; could
                                              lose minutes of data
                                              but fastest
```

The implementation in [`src/aof.c`](https://github.com/redis/redis/blob/unstable/src/aof.c) runs at the end of each event loop iteration:

```c
void flushAppendOnlyFile(int force) {
    ssize_t nwritten;

    if (sdslen(server.aof_buf) == 0) {
        /* Try to fsync even if buf is empty, for everysec policy */
        if (server.aof_fsync == AOF_FSYNC_EVERYSEC &&
            server.aof_last_fsync < server.unixtime)
        {
            goto try_fsync;
        }
        return;
    }

    /* Write the buffer to the AOF fd */
    nwritten = aofWrite(server.aof_fd, server.aof_buf, sdslen(server.aof_buf));

    /* ... error handling ... */

    server.aof_current_size += nwritten;

    /* Reuse or free the buffer */
    if (sdslen(server.aof_buf) < 4000) {
        sdsclear(server.aof_buf);
    } else {
        sdsfree(server.aof_buf);
        server.aof_buf = sdsempty();
    }

try_fsync:
    if (server.aof_fsync == AOF_FSYNC_ALWAYS) {
        redis_fsync(server.aof_fd);
        server.aof_last_fsync = server.unixtime;
    } else if (server.aof_fsync == AOF_FSYNC_EVERYSEC) {
        if (server.aof_last_fsync < server.unixtime) {
            aof_background_fsync(server.aof_fd);
            server.aof_last_fsync = server.unixtime;
        }
    }
    /* AOF_FSYNC_NO: OS will flush when it wants */
}
```

For `everysec`, Redis spawns a background thread to call `fsync()`. This avoids blocking the main event loop — `fsync()` on a busy system can take tens of milliseconds because the kernel has to wait for the disk to acknowledge the write.

### AOF rewriting: keeping the file small

Here is the problem with logging every command: the AOF file grows without bound. If a key was updated 10,000 times, the AOF contains 10,000 `SET` commands for that key, but only the last one matters.

AOF rewriting solves this. Redis creates a new, minimal AOF that contains only the commands needed to reconstruct the current dataset. For a key that was updated 10,000 times, the rewritten AOF has just one command.

```
  Before rewrite (bloated AOF):

  SET counter 1
  INCR counter        -> 2
  INCR counter        -> 3
  INCR counter        -> 4
  ...
  INCR counter        -> 10000
  SET user:1 alice
  SET user:1 bob
  SET user:1 charlie

  After rewrite (compact AOF):

  SET counter 10000
  SET user:1 charlie
```

Like RDB, AOF rewriting uses `fork()` to create a child process. The child iterates over every key and writes the equivalent command to a new temporary file. But here's the tricky part: while the child is rewriting, the parent is still accepting writes. Those new writes must end up in the rewritten file too.

Redis solves this with an **AOF rewrite buffer**. During rewriting, every new write command gets appended to both the regular AOF buffer and the rewrite buffer:

```
  +------------------+          +------------------+
  | Redis parent      |          | Redis child       |
  | (main event loop) |          | (AOF rewriter)    |
  |                   |          |                   |
  |  new write cmd    |          | iterating keys... |
  |       |           |          | writing temp AOF  |
  |       +---> aof_buf (normal AOF)                 |
  |       |           |          |                   |
  |       +---> aof_rewrite_buf  |                   |
  |              (accumulates)   |                   |
  |                   |          |                   |
  |                   |          | ... done!         |
  |                   |          | signals parent    |
  +------------------+          +------------------+
           |
           v
  parent appends rewrite_buf to child's temp file
  renames temp file -> final AOF
  done: new compact AOF includes everything
```

After the child finishes, the parent appends the rewrite buffer to the new file and atomically renames it to replace the old AOF. This entire operation is transparent to clients.

### Source code: rewriteAppendOnlyFileBackground

The rewrite trigger in [`src/aof.c`](https://github.com/redis/redis/blob/unstable/src/aof.c):

```c
int rewriteAppendOnlyFileBackground(void) {
    if (hasActiveChildProcess()) return C_ERR;

    if ((childpid = redisFork(CHILD_TYPE_AOF)) == 0) {
        /* Child */
        redisSetProcTitle("redis-aof-rewrite");
        snprintf(tmpfile, 256, "temp-rewriteaof-bg-%d.aof", (int)getpid());
        if (rewriteAppendOnlyFile(tmpfile) == C_OK) {
            sendChildCowInfo(CHILD_INFO_TYPE_AOF, "AOF rewrite");
            exitFromChild(0);
        }
        exitFromChild(1);
    } else {
        /* Parent */
        server.aof_rewrite_scheduled = 0;
        server.aof_rewrite_time_start = time(NULL);
        return C_OK;
    }
    return C_OK;
}
```

You can trigger a rewrite manually with `BGREWRITEAOF`, or let Redis do it automatically when the AOF file grows past a configured threshold (`auto-aof-rewrite-percentage` and `auto-aof-rewrite-min-size`).

## Hybrid Persistence: RDB + AOF

Since Redis 4.0, there is a third option that combines both mechanisms. When `aof-use-rdb-preamble yes` is set (the default since Redis 5.0), AOF rewriting produces a file that starts with an RDB snapshot followed by AOF commands:

```
  Hybrid AOF file structure:

  +------------------------+----------------------------------+
  |    RDB preamble        |      AOF tail                    |
  | (binary snapshot of    | (RESP commands for writes        |
  |  all data at rewrite   |  that happened during and        |
  |  time)                 |  after the rewrite)              |
  +------------------------+----------------------------------+
   fast to load              captures recent changes
```

This gives you:

- **Fast loading** — the RDB portion loads in bulk, much faster than replaying individual commands.
- **Minimal data loss** — the AOF tail captures writes that happened after the last rewrite, limited only by your `appendfsync` policy.
- **Compact file** — the RDB binary format is much smaller than equivalent RESP text commands.

### Multi-part AOF (Redis 7.0+)

Redis 7.0 introduced a **multi-part AOF** structure that replaces the single AOF file with a manifest and multiple files:

```
  appendonlydir/
  +-- appendonly.aof.1.base.rdb     <- RDB base (from last rewrite)
  +-- appendonly.aof.1.incr.aof     <- incremental AOF (old)
  +-- appendonly.aof.2.incr.aof     <- incremental AOF (current)
  +-- appendonly.aof.manifest       <- manifest listing active files
```

The manifest tracks which files are current. During rewriting, Redis creates a new base file and a new incremental file, then atomically updates the manifest. Old files are cleaned up afterward. This eliminates the risk of corruption from renaming large files and makes the rewrite process cleaner.

## How Redis Loads Data on Startup

When Redis starts, it needs to rebuild the in-memory dataset from disk. The loading priority is:

```
                      Redis Startup
                          |
                          v
                  +----------------+
                  | AOF enabled?   |
                  +-------+--------+
                    yes   |   no
                    |     |     |
                    v     |     v
              Load AOF    |   +----------------+
              (hybrid or  |   | RDB file       |
               plain)     |   | exists?        |
                          |   +-------+--------+
                          |     yes   |   no
                          |     |     |     |
                          |     v     |     v
                          |   Load   |   Start
                          |   RDB    |   empty
                          |          |
                          +----------+
```

If AOF is enabled, Redis always prefers it because it typically has less data loss. The loading code in [`src/server.c`](https://github.com/redis/redis/blob/unstable/src/server.c) handles this:

```c
void loadDataFromDisk(void) {
    if (server.aof_state == AOF_ON) {
        int ret = loadAppendOnlyFiles(server.aof_manifest);
        if (ret == AOF_FAILED || ret == AOF_OPEN_ERR)
            exit(1);
    } else {
        rdbSaveInfo rsi = RDB_SAVE_INFO_INIT;
        if (rdbLoad(server.rdb_filename, &rsi, RDBFLAGS_NONE) == C_OK) {
            /* loaded successfully */
        } else if (errno != ENOENT) {
            exit(1);
        }
    }
}
```

For a hybrid AOF, the loader first processes the RDB preamble (fast bulk load), then replays the remaining AOF commands. This is significantly faster than replaying the entire history as text commands.

## Performance Considerations

### fork() and memory

The `fork()` system call is fast on Linux — even for a process using 50 GB of RAM, `fork()` typically takes 10-30 milliseconds because it only copies page tables, not actual data. But there are caveats:

- **Transparent Huge Pages (THP):** If enabled, COW operates on 2 MB pages instead of 4 KB pages. A single byte change triggers a 2 MB copy. Redis strongly recommends disabling THP:
  ```bash
  echo never > /sys/kernel/mm/transparent_hugepage/enabled
  ```
- **Memory overcommit:** The child process appears to use as much memory as the parent. If `vm.overcommit_memory = 0`, the kernel may refuse `fork()` if free memory looks insufficient, even though COW means actual usage is minimal. Redis recommends setting `vm.overcommit_memory = 1`.
- **Peak memory:** During a save, if the workload is write-heavy, COW can cause up to 2x memory usage as modified pages get duplicated.

### Choosing a persistence strategy

```
  Use case                          Recommended strategy
  --------------------------------  ---------------------------------
  Cache (data loss acceptable)      RDB only, or no persistence

  Session store (some loss OK)      AOF with everysec fsync

  Primary database (minimal loss)   AOF with always fsync, or
                                    hybrid AOF (default since 5.0)

  Maximum safety                    AOF + periodic RDB backups
                                    shipped offsite
```

The default Redis 7.x configuration enables hybrid AOF with `appendfsync everysec`, which is a good balance for most use cases — you get at most ~1 second of data loss with good performance.

## Putting It All Together

Here is a timeline showing how the persistence mechanisms interact during normal operation:

```
  Time ------>
  |                                                              |
  | Event loop    Event loop    Event loop    Event loop         |
  | iteration 1   iteration 2   iteration 3   iteration N       |
  |     |              |              |              |           |
  |     v              v              v              v           |
  | +--------+    +--------+    +--------+    +--------+        |
  | |process |    |process |    |process |    |process |        |
  | |commands|    |commands|    |commands|    |commands|        |
  | +---+----+    +---+----+    +---+----+    +---+----+        |
  |     |              |              |              |           |
  |     v              v              v              v           |
  | append to      append to      append to      append to     |
  | aof_buf        aof_buf        aof_buf        aof_buf       |
  |     |              |              |              |           |
  |     v              v              v              v           |
  | flush AOF      flush AOF      flush AOF      flush AOF     |
  | to disk        to disk        to disk        to disk       |
  |                    |                                        |
  |                    v                                        |
  |              fsync (everysec timer fires)                   |
  |                                                              |
  |         serverCron checks save conditions:                  |
  |         dirty >= 1 && time since last save >= 900?          |
  |                    |                                        |
  |                    v                                        |
  |              fork() -> child writes RDB                     |
  |              parent continues serving                       |
  |                                                              |
  |         AOF file too big?                                   |
  |                    |                                        |
  |                    v                                        |
  |              fork() -> child rewrites AOF                   |
  |              parent buffers new commands                    |
  |              child done -> parent appends buffer            |
  |                           -> atomic rename                  |
```

The `serverCron` function (Redis's periodic timer, running at 10 Hz by default) checks whether it's time to trigger an RDB save or AOF rewrite. These background operations are mutually exclusive — Redis only runs one child process at a time to avoid doubling the COW memory overhead.

## References

1. Redis persistence documentation [doc](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
2. Redis RDB implementation [`src/rdb.c`](https://github.com/redis/redis/blob/unstable/src/rdb.c)
3. Redis AOF implementation [`src/aof.c`](https://github.com/redis/redis/blob/unstable/src/aof.c)
4. Redis server main loop [`src/server.c`](https://github.com/redis/redis/blob/unstable/src/server.c)
5. Redis configuration for persistence [doc](https://redis.io/docs/latest/operate/oss_and_stack/management/config/)
6. Understanding fork() and copy-on-write [article](https://man7.org/linux/man-pages/man2/fork.2.html)
7. Redis latency problems — fork [doc](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/#latency-due-to-fork)
8. Redis 7.0 Multi-Part AOF [blog](https://redis.io/blog/redis-7-aof-multi-part/)
