---
author: JZ
pubDatetime: 2026-10-09T18:43:20Z
modDatetime: 2026-10-09T18:43:20Z
title: System Design - How TiDB GC Safe Points Protect MVCC Reads
tags:
  - design-system
  - design-database
  - design-tidb
description: "A source-code walkthrough of TiDB's MVCC garbage collection: how GCWorker advances a safe point and how TiKV turns it into region cleanup."
---

## Table of contents

## The old version might still be someone's present

Suppose a row had value `blue` at timestamp 100 and changed to `green` at timestamp 160. A transaction that reads at timestamp 150 must still see `blue`, even if the current value is `green`.

TiDB and TiKV use MVCC (Multi-Version Concurrency Control) to keep versions so reads can select the version visible at their snapshot timestamp. Those old versions take space, so garbage collection must remove history without breaking snapshots that are still allowed to read it.

The boundary is the **GC safe point**. If the safe point is 150, snapshots at or after 150 must remain consistent. A reader at 150 still needs the `blue` version as its anchor; versions that cannot affect any allowed snapshot can eventually be removed. Snapshots older than the safe point are no longer guaranteed to work.

```text
timestamp:     100              150             160
                |----------------|---------------|
row value:     blue          safe point         green

At safe point 150, keep blue as the version visible at 150,
plus green because it is newer than the safe point.
```

The safe point is a timestamp boundary, not a command to erase every version with a smaller timestamp. TiKV needs the last version at or before the boundary to reconstruct the row at the boundary.

## One timestamp passes two safety gates

The current TiDB `GCWorker.runGCJob` comments distinguish a **transaction safe point** from a **GC safe point**. These are two roles in one ordered workflow, not two independent clocks:

- The transaction safe point prevents transactions that start too far in the past from continuing as if their history were still available.
- The GC safe point tells storage components that older snapshots can be discarded.

Why not publish the GC safe point immediately? A transaction could have started before it, still hold a lock, and later try to commit after TiKV has already discarded the history it depends on. TiDB first advances and synchronizes the candidate in its transaction-safe role, then resolves old locks, and only then publishes that boundary in its GC-safe role.

The main components are a TiDB `GCWorker`, which coordinates the lifecycle, and a TiKV `GcManager`, which notices the published safe point and schedules cleanup on the storage node.

```text
TiDB GCWorker                 PD                    TiKV GcManager
     |                         |                           |
     |-- advance txn safe point -------------------------->|
     |                         |                           |
     |  wait for propagation   |                           |
     |  resolve older locks    |                           |
     |  process delete ranges  |                           |
     |                         |                           |
     |-- publish GC safe point ->|                          |
     |                         |<--- poll safe point -------|
     |                         |                           |
     |                         |     GC local leader       |
     |                         |     regions, or let       |
     |                         |     compaction filters    |
     |                         |     reclaim old versions |
```

This diagram compresses keyspace and service-safepoint details into one flow. Current TiDB code has keyspace-aware paths as well; the safety rule remains the same: storage must not clean history until the relevant transaction boundary is safe.

## From retention time to a transaction boundary

The GC worker first calculates a target from the current time and the configured history-retention interval. In the pinned source, `calcNewTxnSafePoint` computes `now - lifeTime`, converts it to a timestamp, and asks PD to advance the transaction safe point.

```go
target := oracle.GoTimeToTS(now.Add(-*lifeTime))
newTxnSafePoint, err := w.advanceTxnSafePoint(ctx, target)
```

That target is only a candidate. PD can return a lower safe point when an older transaction blocks progress. The worker logs a blocker description and skips GC when the safe point did not advance. This is why an old transaction can make retained history grow beyond the configured lifetime.

## Why TiDB waits before announcing garbage

`runGCJob` uses the chosen timestamp in two stages. First it waits for the transaction safe point to propagate to the components that need to know about it. Then it resolves locks belonging to transactions that started before that boundary. In `resolveLocks`, TiDB passes `txnSafePoint - 1` as the maximum lock start timestamp, so transactions whose start timestamp equals the safe point remain eligible to proceed.

Only after those protections does the worker process delete ranges and publish the GC safe point. Delete ranges handle large contiguous regions of data created by operations such as dropping or truncating a table or index. They are a separate cleanup mechanism from removing obsolete versions of individual rows.

The key ordering is therefore:

1. Advance and synchronize the transaction safe point.
2. Resolve locks from transactions that must no longer proceed.
3. Handle queued delete ranges.
4. Publish the GC safe point for storage cleanup.

The code for [`calcNewTxnSafePoint` and `advanceTxnSafePoint`](https://github.com/pingcap/tidb/blob/f0d8dc13c5df69f20bf7ff70203f278da0242527/pkg/store/gcworker/gc_worker.go#L665-L720), [`runGCJob`](https://github.com/pingcap/tidb/blob/f0d8dc13c5df69f20bf7ff70203f278da0242527/pkg/store/gcworker/gc_worker.go#L753-L853), and [`resolveLocks`](https://github.com/pingcap/tidb/blob/f0d8dc13c5df69f20bf7ff70203f278da0242527/pkg/store/gcworker/gc_worker.go#L1250-L1271) shows this ordering directly.

## TiKV turns the boundary into local work

TiDB does not scan every row itself. It publishes the GC safe point through PD, and TiKV's `GcManager` polls the safe-point provider. When the safe point advances, `GcManager` can schedule a GC round over the Regions whose leaders are on that TiKV node.

The pinned TiKV source also shows an alternate path: when the compaction filter is allowed, `GcManager` skips its explicit region-GC round. The RocksDB compaction filter can then discard obsolete MVCC records during compaction. Either way, the safe point is the rule that says which history is no longer needed; it is not a promise that disk space will shrink immediately.

That distinction explains a common surprise: GC can advance successfully while disk usage remains high. TiKV still has to process the affected Regions or compact the relevant RocksDB files before the freed space is reflected in storage metrics.

See [`GcManager.run_impl` and safe-point polling](https://github.com/tikv/tikv/blob/b5fc0614fc69ef64de4231c21ae6c2f601ccd0c3/src/server/gc_worker/gc_manager.rs#L318-L377) and [`GcManager.gc_a_round`](https://github.com/tikv/tikv/blob/b5fc0614fc69ef64de4231c21ae6c2f601ccd0c3/src/server/gc_worker/gc_manager.rs#L443-L520).

## Configuration knobs worth knowing

These settings affect when the candidate moves and how quickly TiDB performs the coordination work. The defaults below come from the stable system-variable reference; check the reference for your deployed version before changing them.

| Setting                                           | What it changes                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tidb_gc_life_time` (default `10m0s`)             | How far back the candidate safe point tries to retain history. Increasing it preserves more versions, at the cost of storage and later cleanup work. |
| `tidb_gc_run_interval` (default `10m0s`)          | How often the GC worker considers another run.                                                                                                       |
| `tidb_gc_max_wait_time` (default `86400` seconds) | Caps how long an active transaction can hold back GC safe-point advancement.                                                                         |
| `tidb_gc_concurrency` (default `-1`)              | The concurrency used for GC work such as resolving locks and processing delete ranges; `-1` selects automatic concurrency.                           |
| TiKV `gc.enable-compaction-filter`                | Selects whether eligible cleanup is performed through RocksDB compaction filters rather than an explicit region-GC round.                            |

Do not lower the retention interval just to make old versions disappear faster. First check whether an active transaction or a protected read needs that history. A safe point is a correctness contract shared by TiDB and storage—not merely a storage-cleanup tuning knob.

## References

1. TiDB Developer Guide, [MVCC garbage collection](https://pingcap.github.io/tidb-dev-guide/understand-tidb/mvcc-garbage-collection.html).
2. TiDB documentation, [System variables](https://docs.pingcap.com/tidb/stable/system-variables/) (`tidb_gc_life_time`, `tidb_gc_run_interval`, `tidb_gc_max_wait_time`, and `tidb_gc_concurrency`).
3. PingCAP Community, [TiKV GC: Physical Space Reclamation Principles and Common Issues](https://dev.to/tidbcommunity/tikv-component-gc-physical-space-reclamation-principles-and-common-issues-3paj).
4. TiDB source, [`GCWorker` safe-point calculation and GC job](https://github.com/pingcap/tidb/blob/f0d8dc13c5df69f20bf7ff70203f278da0242527/pkg/store/gcworker/gc_worker.go).
5. TiKV source, [`GcManager`](https://github.com/tikv/tikv/blob/b5fc0614fc69ef64de4231c21ae6c2f601ccd0c3/src/server/gc_worker/gc_manager.rs).
6. TiKV source, [`WriteCompactionFilterFactory`](https://github.com/tikv/tikv/blob/b5fc0614fc69ef64de4231c21ae6c2f601ccd0c3/src/server/gc_worker/compaction_filter.rs#L205-L250).
