---
author: JZ
pubDatetime: 2026-11-16T19:30:00Z
modDatetime: 2026-11-16T19:30:00Z
title: System Design - How TiKV Checks and Splits Large Regions
tags:
  - design-system
  - design-tikv
  - design-database
description:
  "Trace TiKV's classic Raftstore split check from an encoded TiDB key to a validated BatchSplit request, including the worker, thresholds, and key configs."
---

## Table of contents

- [The growing key range](#the-growing-key-range)
- [Who does what](#who-does-what)
- [Following one split check](#following-one-split-check)
- [How the worker chooses a split key](#how-the-worker-chooses-a-split-key)
- [Settings that shape the work](#settings-that-shape-the-work)
- [References](#references)

## The growing key range

A TiDB table is stored as keys and values in TiKV. TiDB's [table codec builds record keys](https://github.com/pingcap/tidb/blob/573231acda6bd2638b61cd417579b6ea98299b80/pkg/tablecodec/tablecodec.go#L105-L116) from a table prefix and a row handle; for example, keys for records in the same table share a table prefix and sort by their encoded handle. TiKV does not split a SQL table object. It divides the whole ordered key space into half-open intervals called **Regions**, such as [a, m) and [m, z): the left boundary is included and the right boundary is excluded.

This distinction matters when a table grows. A Region may hold only part of one table, or keys from multiple tables. TiKV can split a large Region at an interior key so the resulting key ranges can be replicated and scheduled independently.

This walkthrough follows the **classic Raftstore** split-check path in TiKV source at commit c2de14f. It focuses on the peer tick, split-check worker, and size/key checkers. TiKV also has a separate raftstore-v2 implementation; its default split-size behavior differs, so check the version and Raftstore mode before applying a config value.

## Who does what

    TiDB tablecodec
      encodes a row key such as t[table ID]_r[row handle]
                    |
                    v
    TiKV Region leader: PeerFsm
      tracks approximate size change and runs a periodic check
                    |
                    | SplitCheckTask
                    v
    Split-check worker: Runner
      reads Region statistics, scans or samples keys
                    |
                    | candidate split key(s)
                    v
    PeerFsm validates leader + Region epoch
                    |
                    | AskBatchSplit
                    v
    PD allocates child Region IDs and returns a BatchSplit request
                    |
                    v
    TiKV proposes and applies the split through the Region's Raft group
                    |
                    v
             [start, key)  [key, end)

The worker is not allowed to change Region metadata on its own. It suggests a key. The leader validates that suggestion, asks PD for the child Region identities, and then applies a Raft admin command so the Region replicas agree on the new boundaries.

## Following one split check

The [PeerFsm split-check tick](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/fsm/peer.rs#L6687-L6761) is the first stop. As write commands are applied, TiKV accumulates a size-difference hint on the Region's Peer. A periodic split-check tick runs on the leader. It can skip a new check when the difference since the last check is below the configured threshold, or while a prior worker task is still busy.

The tick also avoids checks while a Region is already splitting or during data import. If a snapshot is being generated, it can defer a few checks to reduce the chance that a large snapshot becomes stale before it is sent. Otherwise, it schedules a SplitCheckTask and resets its trigger hints.

The [split-check Runner](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/worker/split_check.rs#L691-L823) receives that task and constructs a SplitCheckerHost. The host asks registered checkers whether they need work. The size checker starts with an approximate Region size from the key-value engine; the key checker can also compare an approximate key count. If neither threshold is reached, the worker does not scan for a size split. If a threshold is reached, the worker gets split candidates by scanning or by using approximate split-key samples from the engine.

When it finds one or more candidates, the worker sends the keys and the current Region epoch back to the peer. The peer's [on_prepare_split_region path](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/fsm/peer.rs#L6764-L6821) checks that it is still the leader and that the Region epoch is current, then schedules an AskBatchSplit task. The [PD worker](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/worker/pd.rs#L1377-L1438) asks PD to allocate IDs for the new Regions and builds a BatchSplit admin request. TiKV proposes that request through the Region's Raft group; the replicas apply the same boundary change.

    PeerFsm           Split worker          PD worker / PD          Raft group
       |                    |                      |                    |
       | tick: leader?      |                      |                    |
       | size changed?      |                      |                    |
       |------------------->|                      |                    |
       |                    | estimate / scan      |                    |
       |                    | candidate key        |                    |
       |<-------------------|                      |                    |
       | validate epoch     |                      |                    |
       |------------------------------------------>| allocate Region IDs|
       |<------------------------------------------| BatchSplit request  |
       | propose admin command ---------------------------------------->|
       |<------------------------------------------------ apply split ---|

## How the worker chooses a split key

The [size checker](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/coprocessor/split_check/size.rs#L17-L82) walks keys in order and accumulates each entry's size. When the running total passes the target split size, it records that key as a candidate boundary and starts counting the next output Region. The final piece is kept large enough to avoid creating a tiny trailing Region. A batch limit caps how many split keys one check can produce.

There is a second guard for workloads with many small values: the [key-count checker](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/coprocessor/split_check/keys.rs#L45-L80) counts committed versions and can choose boundaries by number of keys. A Region can therefore be eligible because it is large in bytes, large in keys, or both. For a sufficiently large Region, the checker can use approximate split keys from engine range properties instead of scanning every entry. If that approximate path fails, the worker falls back to a scan.

TiKV can also register a table-boundary checker. It is controlled by split-region-on-table and is disabled by default in the config template. That option can align boundaries with tables, but a cluster with many short-lived tables can create many small Regions. It is separate from the basic size and key checks.

A candidate key is not automatically a new Region. The worker validates candidates and reports them with the Region's epoch. The peer rechecks leadership and epoch because the Region may have changed while the background scan was running. This keeps stale work from splitting a Region using an old boundary.

## Settings that shape the work

The names below follow the current [TiKV configuration reference](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/) and config template. Defaults can vary with the release and Raftstore implementation.

| Setting | What it controls |
| --- | --- |
| raftstore.split-region-check-tick-interval | How often the peer considers another split check. The template default is 10 seconds. |
| raftstore.region-split-check-diff | How much size change is enough to make another check worthwhile. The template shows 16 MiB and recommends about one-sixteenth of region-split-size. |
| coprocessor.region-split-size and region-max-size | The target size for child Regions and the threshold that makes a Region eligible. The current classic path uses a 256 MiB split target and a 1.5x max size; current docs list 256 MiB for v8.4.0 and later, and 96 MiB before v8.4.0. The config template shows 256 MiB and 384 MiB. |
| coprocessor.region-split-keys and region-max-keys | The matching key-count thresholds. The default split-key count is estimated from split size using an assumed average key-value size of 100 bytes. Current docs list 2,560,000 keys, or 960,000 before v8.4.0. |
| coprocessor.batch-split-limit | Caps the number of split keys returned in one batch; the template default is 10. |

A check runs periodically, and Region sizes are estimates. A Region can grow past its threshold before the next check finishes. That is expected: split settings balance work size against the overhead of having too many Regions. A TiKV operations post discusses how a very high Region count can burden Raftstore; making Regions smaller is not free.

The 256 MiB classic default needs a version note. In the pinned source, the classic raftstore configuration uses a 256 MiB split-size default; the separate raftstore-v2 config has a 10 GiB fallback. The config template and documentation for the deployed TiKV release should take precedence over values in this source walkthrough.

## References

1. TiDB documentation, [TiDB storage architecture](https://docs.pingcap.com/tidb/stable/tidb-storage/), including the Region key-range model, and [TiKV configuration reference](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/).
2. TiKV community post, [TiKV Performance Tuning with Massive Regions](https://tikv.org/blog/tune-with-massive-regions-in-tikv/). It explains why Region count affects Raftstore workload; its tuning values are from an older release.
3. TiDB source at commit [573231a](https://github.com/pingcap/tidb/commit/573231acda6bd2638b61cd417579b6ea98299b80), [tablecodec.go](https://github.com/pingcap/tidb/blob/573231acda6bd2638b61cd417579b6ea98299b80/pkg/tablecodec/tablecodec.go#L105-L116).
4. TiKV source at commit [c2de14f](https://github.com/tikv/tikv/commit/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1): [PeerFsm split-check tick](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/fsm/peer.rs#L6687-L6761), [split-check trigger state](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/peer.rs#L617-L727), [worker and candidate routing](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/worker/split_check.rs#L691-L963), [size checker](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/coprocessor/split_check/size.rs#L126-L234), [PD batch-split request](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/worker/pd.rs#L1377-L1438), and [split configuration defaults](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/coprocessor/config.rs#L72-L142).
5. TiKV, [config-template.toml](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/etc/config-template.toml#L508-L627), [store config fields and tick default](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/config.rs#L157-L161) and [derived size-change threshold](https://github.com/tikv/tikv/blob/c2de14f5a79a7c10f2e0ac2b332d7e50524d9ad1/components/raftstore/src/store/config.rs#L1085-L1100).
