---
author: JZ
pubDatetime: 2026-10-07T18:05:00Z
modDatetime: 2026-10-07T18:05:00Z
title: System Design - How TiKV Scheduler Latches Protect TiDB Writes
tags:
  - design-system
  - design-database
  - design-concurrency
  - design-tidb
description: "Follow two competing TiDB storage commands through five TiKV latch types: sorted key hashes, per-command ownership, bucket queues, wakeup retries, completion, and the configuration knobs that do not remove hot-key contention."
---

This explanation is for engineers beginning to read TiDB and TiKV source. We will follow two storage commands that touch the same key, focusing on five TiKV types rather than the whole distributed transaction protocol.

The walkthrough uses **TiKV v8.5.0**, commit `a2c58c94f89cbb410e66d8f85c236308d6fc64f0`, and **TiDB v8.5.0**, commit `d13e52ed6e22cc5789bed7c64c861578cd2ed55b`. These are reproducible source snapshots, not a claim about the newest releases.

## Table of contents

## A transaction protocol still needs local coordination

Imagine two clients sending TiDB transactions that update the same account. By the time their storage work reaches TiKV, there can be two commands that need to inspect and change metadata for the same key.

The distributed transaction protocol decides whether transactions conflict and how they commit. But it does not mean two workers should independently race through the local check-and-write work for one key.

TiKV's **scheduler latches** coordinate that command-level access. They are short-lived, in-memory ownership records, not the transaction's durable MVCC lock records. The [scheduler's module documentation](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L3-L23) states the boundary explicitly: overlapping commands are serialized, but a transaction can consist of multiple commands.

Keep three responsibilities separate:

| Mechanism                                  | Question it answers                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Scheduler latch                            | Can this local command proceed on these keys now?                             |
| Transaction protocol and transaction locks | Is this transaction allowed to read or write this version, and can it commit? |
| Raft replication                           | How is the Region's replicated state kept consistent?                         |

The official [TiKV distributed-transaction introduction](https://tikv.org/deep-dive/distributed-transaction/introduction/) provides the broader context. We will stay inside the first row of the table.

## Where the TiDB code hands off responsibility

At the SQL-side boundary, TiDB exposes a [`kv.Transaction` interface](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/kv/kv.go#L218-L240). Its TiKV-backed driver's [`Commit()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/store/driver/txn/txn_driver.go#L113-L119) delegates to the embedded client transaction and translates its error.

That handoff is useful when reading the repositories: a Go SQL transaction is not the same object as a Rust scheduler task. The client layer produces storage requests; TiKV schedules individual commands. We are not tracing every RPC or every transaction phase here.

```text
TiDB SQL / kv.Transaction
          |
          v
TiDB TiKV driver -> client transaction layer
                              |
                        storage requests
                              |
                              v
                    TiKV TxnScheduler
                     command-level work
```

The latches discussed below live on the TiKV side. Do not confuse them with client-side coordination merely because both sides can use the word “latch.”

## Five types, one ownership pipeline

The core implementation is small enough to read as a collaboration between five types:

| Type           | Responsibility                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `TxnScheduler` | Admit commands, attempt latch acquisition, execute ready work, and arrange completion and wakeup. |
| `TaskContext`  | Retain a command's task, callback, latch state, and timing while it waits or runs.                |
| `Lock`         | Store sorted required key hashes and the size of the prefix already owned.                        |
| `Latches`      | Manage the array of synchronized buckets and implement acquisition and release.                   |
| `Latch`        | Store queued `(key_hash, command_id)` requests inside one bucket.                                 |

`TxnScheduler` and `TaskContext` live in [`scheduler.rs`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L118-L185). The other three live in [`latch.rs`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L16-L171).

```text
+--------------------+
| TxnScheduler       |
| run_cmd / schedule |
+---------+----------+
          | creates and retains
          v
+--------------------+          +----------------------+
| TaskContext        |--------->| Lock                 |
| task + callback    |          | required_hashes      |
| latch wait timer   |          | owned_count          |
+--------------------+          +-----------+----------+
                                           |
                                 acquire / release
                                           |
                                           v
                                +----------------------+
                                | Latches              |
                                | bucket array         |
                                +-----------+----------+
                                            |
                                 selects one bucket
                                            v
                                +----------------------+
                                | Mutex<Latch>         |
                                | queued hash + cid    |
                                +----------------------+
```

The `Lock` name is easy to misread. Here it is a per-command **latch acquisition plan**, not a row lock stored in TiKV's lock column family.

## A command first becomes a sorted list of hashes

[`run_cmd()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L524-L545) performs admission checks, allocates a command ID, and creates the task that will be scheduled. `TaskContext::new()` asks the command for its latch plan unless a prepared plan was supplied.

The command's [`gen_lock()` dispatch](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/commands/mod.rs#L827-L829) delegates key selection to the command implementation. The important result is a `Lock` built from the keys that this command needs to protect.

[`Lock::new()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L111-L134) hashes the keys, sorts the full hash values, removes duplicates, and starts `owned_count` at zero.

For an invented example, suppose the resulting hashes are:

```text
Before sorting: [20, 10, 20]
Required:       [10, 20]
Owned prefix:   []
owned_count:    0
```

These small numbers are teaching values, not actual outputs for particular TiKV keys. Real hashes are 64-bit values.

Sorting matters because commands acquire resources in a common order. Without that order, one command could hold resource 10 and wait for 20 while another held 20 and waited for 10. The sorted acquisition plan prevents that circular-wait pattern.

Deduplication avoids asking the same command to acquire one hash twice. Together, these rules turn “a set of keys” into a resumable acquisition sequence.

## A bucket is not the same thing as a conflicting key

`Latches` uses a fixed-size array of buckets. [`Latches::new()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L162-L171) rounds the requested bucket count up to a power of two. The [`bucket selection`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L265-L269) uses the low bits of the hash:

```text
bucket = key_hash & (bucket_count - 1)
```

With eight buckets, hashes `10` and `42` both select bucket 2. That does **not** automatically mean they must wait for one another's entire command.

The bucket stores the **full hash** beside each command ID. [`get_first_req_by_hash()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L40-L49) finds the first queued request matching that full hash, rather than blindly treating the physical front of the bucket queue as the owner of every key in the bucket.

```text
One bucket's queue:
  [(hash=10, cid=1), (hash=42, cid=3)]

First request for hash 10: cid 1
First request for hash 42: cid 3

Both can own their different hashes.
```

They still share a short mutex-protected queue operation when inspecting or modifying this bucket. But that mutex is not held across the whole storage command. A collision of bucket indexes and a collision of full hashes are different events. A full-hash collision can cause unnecessary serialization; the implementation does not compare original keys to distinguish it.

This distinction is essential when interpreting `scheduler-concurrency`. More buckets can distribute queue-access work; they cannot make two commands for the **same key** stop conflicting.

## Acquisition either finishes or parks at the first conflict

[`Latches::acquire()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L180-L202) starts at the first hash after the owned prefix.

For each required hash:

- If nobody has queued that hash, enqueue this command and count it as acquired.
- If this command is already first for the hash, count it as acquired.
- If another command is first, enqueue this command behind it and stop trying later hashes.

The command runs only when all its required hashes are owned. A failed acquisition attempt does not mean the command owns nothing.

For example, suppose command A owns hash `20`. Command B requires `[5, 20, 30]`:

```text
Command B:
  hash 5:  acquired
  hash 20: queued behind A
  hash 30: not attempted yet

owned_count = 1
```

B retains the acquired prefix while waiting. When it retries, it starts with hash `20`, not with `5`. The common sorted order is what makes retaining a prefix compatible with avoiding circular waits.

[`schedule_command()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L563-L605) bridges this ownership state to execution. If acquisition succeeds, it takes the task from `TaskContext` and calls `execute()`. Otherwise, the task remains retained for a later retry, with deadline handling rather than a worker spinning on the contested key.

## Release offers another attempt, not an execution ticket

Consider two commands with overlapping hashes:

```text
Command A requires [10, 20]
Command B requires [20, 30]
```

A acquires both hashes. B queues behind A for `20`. The ordinary completion path eventually releases A's latch ownership and discovers B as a candidate to wake.

```text
Command A          TxnScheduler             Latches          Command B
    |                    |                     |                 |
    | ready to schedule  |                     |                 |
    |------------------->| acquire [10,20]     |                 |
    |                    |-------------------->|                 |
    |                    |<------ ready -------|                 |
    | executes           |                     | schedule B      |
    |                    |<--------------------------------------|
    |                    | acquire [20,30]     |                 |
    |                    |-------------------->|                 |
    |                    |<------ wait --------|                 |
    | completion event   |                     |                 |
    |------------------->| release A           |                 |
    |                    |-------------------->|                 |
    |                    |<---- candidate B ---|                 |
    |                    | retry acquisition   |                 |
    |                    |-------------------->|                 |
    |                    |<------ ready -------|                 |
    |                    | execute B -------------------------------->
```

The last “ready” assumes no other command holds B's remaining hash `30`. If it does, B must wait again. **Wakeup is a chance to acquire the rest, not proof that all resources are already available.**

[`Latches::release()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L217-L261) removes the releasing command's owned requests and returns candidate command IDs. [`release_latches()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L547-L561) hands each candidate to [`try_to_wake_up()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L662-L683), which retries acquisition before executing anything.

The bucket may contain multiple different full hashes. Its removal logic can remove the first matching hash from the middle, leaving a hole, rather than removing an unrelated hash at the physical front. That is why `Latch.waiting` stores optional queue entries and includes cleanup logic.

## Completion belongs to a command, not the whole SQL transaction

For an ordinary write completion, [`on_write_finished()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L856-L971) eventually reaches the release path. The error path, [`finish_with_err()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L801-L834), also releases the recorded latch state.

Releasing a latch does **not** mean the SQL transaction has committed. It means the scheduler is done protecting this command's local work. Another command can subsequently inspect transaction metadata and discover a transaction-level conflict.

The implementation also supports a more specialized path: some acquired latches can be handed directly to a resumed pessimistic-lock command. `release()` accepts an optional next-command ownership plan, and the write-completion code uses it for that handoff. Therefore, the ordinary release-and-retry story is not a claim that every path is strict FIFO or releases every hash to unrelated work first.

Pipelining and asynchronous prewrite behavior add further completion distinctions. A client response, a scheduler completion event, and a replicated write's lifecycle should not be treated as interchangeable milestones.

This is a good place to stop the source walkthrough. TiDB's [optimistic transaction](https://docs.pingcap.com/tidb/v8.5/optimistic-transaction/) and [pessimistic transaction](https://docs.pingcap.com/tidb/v8.5/pessimistic-transaction/) documentation explain the transaction-level rules that latches deliberately do not replace.

## Three settings with three different jobs

The relevant settings live under `[storage]`. Here are two defaults as written in the pinned [configuration template](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/etc/config-template.toml#L270-L285):

```toml
[storage]
scheduler-concurrency = 524288
scheduler-pending-write-threshold = "100MB"
```

This is a source-reading example, not a recommendation to overwrite an existing cluster configuration.

| Setting                             | Meaning in this source snapshot                                                                         | What it does not do                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `scheduler-concurrency`             | Requested latch-bucket count; default `524288`, rounded to a power of two by `Latches::new()`.          | It is not the number of SQL transactions or scheduler worker threads. |
| `scheduler-worker-pool-size`        | Number of scheduler worker threads; the default is CPU-dependent.                                       | It does not allow competing commands to bypass same-key ownership.    |
| `scheduler-pending-write-threshold` | Pending-write-byte threshold used by scheduler admission; the template writes the default as `"100MB"`. | It is not a count of waiting transactions or a latch timeout.         |

In [`Config::default()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/config.rs#L22-L29), the bucket count is `1024 * 512`, and the pending-write limit is constructed from 100 readable-size megabytes. The worker-pool default is [eight threads at a CPU quota of at least 16; otherwise the quota is clamped between one and four before conversion](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/config.rs#L116-L131).

The public [TiKV configuration reference](https://docs.pingcap.com/tidb/v8.5/tikv-configuration-file/#scheduler-pending-write-threshold) describes the pending-write default as `100MiB`. Check the actual release and effective configuration instead of assuming a simplified documentation default captures CPU-dependent behavior.

Also, pending-write bytes are not the only admission condition. [`too_busy()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L366-L370) includes flow-control rejection, and `run_cmd()` can reject a task when its memory-quota allocation fails.

## What a high latch-wait signal actually tells you

The source registers [`tikv_scheduler_latch_wait_duration_seconds`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/metrics.rs#L516-L524), a histogram labeled by command type. [`TaskContext::on_schedule()`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs#L174-L184) records elapsed time from the context's latch timer when the command becomes schedulable.

That is useful evidence about delayed scheduling, not proof that the full delay was spent inside a bucket mutex or waiting on a SQL row lock.

When this signal grows, reason from the ownership model:

- Many requests for one logical key must still queue for the same full hash. Increasing the bucket count cannot remove that required serialization.
- Large multi-key commands can hold an acquired prefix while waiting for a later hash, delaying other commands that need an earlier hash.
- Slow command completion can lengthen how long later commands wait behind ownership already held. Look at the downstream write path as well as the latch array.

These are investigation directions derived from the code, not claims about a particular production incident. A change in worker count or admission capacity can move a bottleneck rather than eliminate it.

## Let the tests challenge the mental model

The pinned latch module includes four unit tests that are especially useful after reading the implementation:

- [`test_wakeup`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L279-L305) follows a waiter becoming ready after release.
- [`test_wakeup_by_multi_cmds`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L307-L348) exercises overlapping commands that need multiple releases and acquisition attempts.
- [`test_wakeup_by_small_latch_slot`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L350-L402) uses a deliberately small bucket array and distinguishes overlapping hashes from merely shared buckets.
- [`test_partially_releasing`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs#L550-L555) checks the more specialized ownership-handoff behavior.

All four passed when the unmodified upstream latch module was compiled in a small isolated Rust test harness. This checks the latch primitive, not a running TiDB/TiKV cluster or the entire scheduler's integration behavior.

The central idea is now compact: **a command owns an ordered set of key hashes; a bucket holds queue bookkeeping; a wakeup retries ownership; and a distributed transaction is still a larger protocol.** Keeping those four ideas separate makes the surrounding scheduler code much easier to read.

## References

1. [TiDB v8.5: Optimistic Transaction](https://docs.pingcap.com/tidb/v8.5/optimistic-transaction/).
2. [TiDB v8.5: Pessimistic Transaction](https://docs.pingcap.com/tidb/v8.5/pessimistic-transaction/).
3. [TiDB v8.5: TiKV Configuration File](https://docs.pingcap.com/tidb/v8.5/tikv-configuration-file/).
4. [TiKV deep dive: Distributed Transaction Introduction](https://tikv.org/deep-dive/distributed-transaction/introduction/).
5. [TiDB v8.5.0 source: Transaction interface](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/kv/kv.go#L218-L240).
6. [TiDB v8.5.0 source: TiKV transaction driver](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/store/driver/txn/txn_driver.go#L113-L119).
7. [TiKV v8.5.0 source: latch implementation and tests](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/latch.rs).
8. [TiKV v8.5.0 source: transaction scheduler](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/txn/scheduler.rs).
9. [TiKV v8.5.0 source: storage configuration](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/config.rs).
10. [TiKV v8.5.0 source: scheduler metrics](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/storage/metrics.rs#L516-L524).
