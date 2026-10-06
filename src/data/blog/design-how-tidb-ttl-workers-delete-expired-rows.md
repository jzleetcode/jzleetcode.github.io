---
author: JZ
pubDatetime: 2026-10-06T18:35:00Z
modDatetime: 2026-10-06T18:35:00Z
title: System Design - How TiDB TTL Workers Delete Expired Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow an expired row through five TiDB TTL worker types: key-range scanning, the delete-task channel, guarded DELETE transactions, retry handling, and the settings that control their impact on TiKV."
---

This explanation is for engineers starting to read TiDB source code. We will follow one expired row through five Go types in the TTL worker package, focusing on how scanning, deletion, and transaction-level safety fit together.

The walkthrough is pinned to **TiDB v8.5.3**, commit `dc2548aac79a712265e831cff2a3a896bc0a5a38`. The final storage boundary uses **TiKV v8.5.3**, commit `13b9af5c34ad0dd62b5ae5ee02e05806e6d31e0b`. These are reproducible source snapshots, not a claim about the newest releases.

## Table of contents

## Expiration is a rule, not an alarm clock

Imagine an application that stores temporary session records. Records older than 30 days should eventually be removed:

```sql
CREATE TABLE session_events (
    id BIGINT PRIMARY KEY CLUSTERED,
    created_at DATETIME NOT NULL
) TTL = created_at + INTERVAL 30 DAY TTL_ENABLE = 'ON';
```

**Time to live**, or TTL, gives TiDB a rule for deciding whether a row is old enough to delete. It does not install a timer on every row. Background jobs find expired rows and delete them later, so expiration does not immediately make a row disappear from queries. The [TTL documentation](https://docs.pingcap.com/tidb/v8.5/time-to-live/) describes this asynchronous cleanup model.

For our example, imagine a job with an expiration cutoff of `2026-09-06 00:00:00`. Its scan searches for rows whose `created_at` is earlier than that cutoff. The cutoff is carried with the task rather than recomputed as a moving boundary for each delete batch.

The broader scheduler decides when to create jobs and how to distribute key ranges. We will start after it has assigned one range to a worker. That keeps the scope small: no timer-service, ownership, or full task-recovery walkthrough.

## Five types, one pipeline

The types live in [`pkg/ttl/ttlworker`](https://github.com/pingcap/tidb/tree/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker). None is a general-purpose storage engine; they coordinate ordinary internal SQL work.

| Type              | Responsibility                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| `ttlScanWorker`   | Accept one scan task, run it, and expose its result to the manager.        |
| `ttlScanTask`     | Scan a key range in batches and turn expired row keys into delete work.    |
| `ttlDeleteTask`   | Carry row keys and the expiration cutoff; execute smaller delete batches.  |
| `ttlDeleteWorker` | Receive delete tasks, reuse a session, and manage retryable failures.      |
| `ttlTableSession` | Execute work in a transaction and validate the TTL metadata before commit. |

```text
             assigned key range + expiration cutoff
                              |
                              v
                     +-----------------+
                     | ttlScanWorker   |
                     | one current task|
                     +--------+--------+
                              |
                              v
                     +-----------------+
                     | ttlScanTask     |
                     | SELECT row keys |
                     +--------+--------+
                              |
                    ttlDeleteTask over delCh
                              |
                              v
                     +-----------------+
                     | ttlDeleteWorker |
                     | retries + session|
                     +--------+--------+
                              |
                              v
                     +-----------------+
                     | ttlDeleteTask   |
                     | batched DELETE  |
                     +--------+--------+
                              |
                              v
                     +-----------------+
  scan SQL also ---->| ttlTableSession |
                     | transaction +   |
                     | metadata checks |
                     +--------+--------+
                              |
                       TiDB SQL execution
                              |
                              v
                         TiKV storage
```

The scan and delete sides share a channel, not a giant in-memory list of every expired row. In this release, the manager creates `delCh` with `make(chan *ttlDeleteTask)`, so it is **unbuffered**. A scan handoff waits until a delete worker receives the batch. You can see the channel creation and wiring in [`task_manager.go`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/task_manager.go#L122-L155).

This provides **backpressure**: if deleters are busy, scanners pause at dispatch rather than piling unlimited batches into that channel. It does not mean the whole subsystem has zero buffering; delete workers also maintain retry state.

## The scan worker owns the task lifecycle

[`ttlScanWorker.Schedule`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/scan.go#L301-L348) refuses work if the worker is stopped, already has a task, or still holds an uncollected previous result. This keeps its state understandable: one current task and one result slot.

Its loop receives the task and calls `handleScanTask`, which invokes `task.doScan`. After scanning, it stores the result and tries to notify the manager. The result remains available for polling even though the notification send is nonblocking. The control flow is in [`scan.go`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/scan.go#L357-L420).

That distinction matters: the worker handles lifecycle bookkeeping, while the task performs the actual SQL loop.

## The scan task asks for keys, not whole rows

[`ttlScanTask.doScan`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/scan.go#L132-L211) borrows an internal session, checks that the task's expiration cutoff is safe for the current table rule, and creates a scan-query generator. It temporarily sets that session's `tidb_distsql_scan_concurrency` to `1` and restores the previous value afterward.

That is a useful detail when reading configuration: this path deliberately controls each task's SQL scan concurrency. Increasing the general session default is not the same as increasing the number of TTL scan workers.

For a single-column integer primary key, a continuation query looks conceptually like this:

```sql
SELECT id
FROM session_events
WHERE id > 1200
  AND id < 5000
  AND created_at < '2026-09-06 00:00:00'
ORDER BY id
LIMIT 500;
```

This is a readable equivalent, not a verbatim dump of generated SQL. The actual builder handles quoting, partitions, composite keys, and the assigned range's initial inclusive lower bound. It renders the expiration timestamp with `FROM_UNIXTIME` and continues after the last returned key. See the [scan-query generator](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/sqlbuilder/sql.go#L339-L455).

The important idea is **keyset continuation**, not increasing `OFFSET`. An offset describes a position in a changing result set. A last-seen key describes where the scan has progressed, even while deletion changes the table.

The batch limit bounds returned candidate rows, not necessarily all storage work. If expired rows are sparse, a primary-key scan can inspect many non-expired rows before finding one batch. TTL is not automatically a cheap lookup merely because `LIMIT` is small.

The task converts returned keys into datum values, creates a `ttlDeleteTask`, and sends it through `delCh`. The task includes the same table, cutoff, and shared statistics. That handoff is visible in [`scan.go`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/scan.go#L230-L293).

## The delete task rechecks expiration

Suppose the scanner found row 1307 because its `created_at` was old. Before a delete worker handles it, the application refreshes that timestamp.

Deleting by primary key alone would be unsafe. The row's identity has not changed, but its eligibility has.

[`ttlDeleteTask.doDelete`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/del.go#L111-L192) splits the candidate keys into smaller batches and builds SQL that contains **both** the key match and the expiration predicate:

```sql
DELETE FROM session_events
WHERE id IN (1307, 1311, 1320)
  AND created_at < '2026-09-06 00:00:00'
LIMIT 3;
```

The [delete builder](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/sqlbuilder/sql.go#L458-L481) puts the cutoff in every delete statement. If the timestamp refresh commits before the delete transaction's view, the row no longer matches. If writes race, ordinary transaction conflict handling still matters; the scan result is not a lock or a promise that deletion will win.

```text
Scan task         Application          Delete task / session
    |                  |                         |
    | finds id=1307    |                         |
    | old timestamp    |                         |
    |                  | refresh created_at      |
    |                  | commit                  |
    |                  |                         |
    |--------------- candidate key ------------>|
    |                  |                         | DELETE by key
    |                  |                         | AND old timestamp
    |                  |                         |
    |                  |                 row no longer matches
```

The delete task counts a successfully executed batch's candidate keys as success. That is not necessarily the SQL affected-row count: a refreshed or already-deleted row can be a successful no-op. Read those worker statistics with that distinction in mind.

## The table session protects the commit boundary

The row predicate handles changed row data. What about changed table metadata?

A user might disable TTL, drop and recreate a table with the same name, or lengthen the retention interval while work is running. The old task must not keep deleting under a rule that is no longer safe.

[`ttlTableSession.ExecuteSQLWithCheck`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/session.go#L203-L257) checks the global TTL-job enable flag, aligns the session time zone, and executes the SQL inside an optimistic transaction. It then validates the TTL metadata **after the statement executes but before the transaction commits**.

The placement is intentional. The source explains that TiDB must first execute a query to establish the transaction's metadata view under metadata locking. If validation fails, the transaction fails too; an executed delete is not the same as a committed delete.

The [validation function](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/session.go#L259-L309) checks identities and TTL properties when the metadata has changed. It rejects incompatible changes such as a different table or physical-table ID, disabled table TTL, or a different time column. For a changed retention interval, it recomputes the current safe cutoff and rejects a task cutoff that would delete too much.

Not every metadata change requires aborting. The goal is to preserve the deletion rule, not to ban all concurrent DDL.

## The delete worker retries selectively

[`ttlDeleteWorker.loop`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/del.go#L304-L394) obtains a session and reuses it while receiving tasks. A task returns the subset of candidate keys whose deletion should be retried. The worker records that subset in its retry buffer and uses a timer to revisit it.

There are two different failure classes:

- A retryable SQL or transaction failure can leave keys for another attempt.
- A TTL metadata validation failure is marked non-retryable for this work, so a stale task does not repeatedly execute an unsafe delete.

Retries are bounded. A worker can ultimately report errors rather than promise that this particular job removes every candidate. The guarded delete predicate also makes retrying an already-completed deletion harmless when the row no longer exists or is no longer expired.

## The settings map directly to the pipeline

These are **v8.5.3 defaults**, verified in [`tidb_vars.go`](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/sessionctx/variable/tidb_vars.go#L1539-L1556) and the [v8.5 system-variable reference](https://docs.pingcap.com/tidb/v8.5/system-variables/). Check your deployed version and current values before tuning.

| Setting                        | Default | Meaning in this walkthrough                                            |
| ------------------------------ | ------- | ---------------------------------------------------------------------- |
| `tidb_ttl_job_enable`          | `ON`    | Global enable switch checked before worker SQL.                        |
| `tidb_ttl_scan_worker_count`   | `4`     | Scan workers on each TiDB node.                                        |
| `tidb_ttl_delete_worker_count` | `4`     | Delete workers on each TiDB node.                                      |
| `tidb_ttl_scan_batch_size`     | `500`   | Maximum candidate rows returned by a scan query.                       |
| `tidb_ttl_delete_batch_size`   | `100`   | Maximum candidate keys in one delete batch.                            |
| `tidb_ttl_delete_rate_limit`   | `0`     | Delete statements per second per TiDB node; zero means no limiter cap. |

The last setting is easy to misread. It limits **statements, not rows**. The [limiter call](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/del.go#L73-L108) consumes a token once for each delete batch, and the limiter is shared by delete workers in that TiDB process.

For example, a limit of 20 statements per second with batches of up to 100 keys gives a nominal rate budget of about 2,000 candidate-key attempts per second per node. It is not a sustained-throughput guarantee: batches can be smaller, predicates can match fewer rows, retries consume work, and storage latency can dominate. Three active TiDB nodes do not share one cluster-wide 20-statement budget.

Table-level `TTL_ENABLE`, the job interval, and the global scheduling window determine whether and when cleanup runs. Worker and batch settings determine how an already-running pipeline uses resources. Raising the worker counts does not fix a closed scheduling window.

## Why expiration does not immediately reclaim disk

The worker submits SQL deletes through TiDB, so TTL cleanup uses the normal transactional storage path into TiKV. It is not a direct removal of keys from RocksDB by a TTL-specific storage thread.

At the TiKV boundary, [`commit.rs`](https://github.com/tikv/tikv/blob/13b9af5c34ad0dd62b5ae5ee02e05806e6d31e0b/src/storage/txn/actions/commit.rs#L95-L117) creates an MVCC write record from the lock's write type at the commit timestamp. The same file's [transaction tests](https://github.com/tikv/tikv/blob/13b9af5c34ad0dd62b5ae5ee02e05806e6d31e0b/src/storage/txn/actions/commit.rs#L202-L218) include a committed `WriteType::Delete`.

This is a logical deletion in a versioned database. Older versions can still be needed by snapshots; TiKV garbage collection and subsequent storage compaction govern physical reclamation. See the [TiDB garbage-collection overview](https://docs.pingcap.com/tidb/v8.5/garbage-collection-overview/) for that separate lifecycle.

There are therefore three different moments: the row qualifies as expired, a delete transaction commits, and obsolete storage is eventually reclaimed. They should not be treated as one instant.

## How to reason about a slow TTL job

The component boundaries give you a useful diagnostic model:

- A scanner spending much of its time in **dispatch** is waiting for a delete worker to accept work.
- Delete workers spending much of their time **idle** can indicate that scanning is not feeding them fast enough.
- Delete workers spending time in **waitToken** are encountering the configured delete-rate limiter.
- SQL execution and retries need separate investigation; increasing concurrency can make storage contention worse.

Those phase names appear in the scan and delete loops we followed. They are clues rather than proof of a single root cause. Compare them with TiDB CPU, TiKV CPU and disk activity, the table's expiration distribution, and other foreground workload.

The central design is small: scan keys in bounded batches, hand them to independent deleters, recheck the expiration predicate, and validate metadata before commit. Understanding those five types makes both the safety rules and the tuning knobs much less mysterious.

## References

1. PingCAP: [Time to Live, TiDB v8.5](https://docs.pingcap.com/tidb/v8.5/time-to-live/).
2. PingCAP: [System variables, TiDB v8.5](https://docs.pingcap.com/tidb/v8.5/system-variables/).
3. TiDB v8.5.3: [Scan task and worker](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/scan.go).
4. TiDB v8.5.3: [Delete task, worker, and rate limiter](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/del.go).
5. TiDB v8.5.3: [Table-session transaction and metadata checks](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/ttlworker/session.go).
6. TiDB v8.5.3: [Scan and delete SQL builders](https://github.com/pingcap/tidb/blob/dc2548aac79a712265e831cff2a3a896bc0a5a38/pkg/ttl/sqlbuilder/sql.go).
7. TiKV v8.5.3: [MVCC commit action](https://github.com/tikv/tikv/blob/13b9af5c34ad0dd62b5ae5ee02e05806e6d31e0b/src/storage/txn/actions/commit.rs).
8. PingCAP: [Garbage collection overview, TiDB v8.5](https://docs.pingcap.com/tidb/v8.5/garbage-collection-overview/).
