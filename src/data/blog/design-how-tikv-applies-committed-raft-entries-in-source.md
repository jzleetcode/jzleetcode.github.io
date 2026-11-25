---
author: JZ
pubDatetime: 2026-11-25T19:29:55Z
modDatetime: 2026-11-25T19:29:55Z
title: System Design - How TiKV Applies Committed Raft Entries in Source Code
tags:
  - design-system
  - design-database
  - design-tikv
description: "Trace a committed TiKV Raft entry through the Peer, ApplyFsm, ApplyDelegate, and KV engine, including the apply index and worker settings."
---

## Table of contents

- [Consensus has committed the log; the data still needs to catch up](#consensus-has-committed-the-log-the-data-still-needs-to-catch-up)
- [Five types carry the entry through apply](#five-types-carry-the-entry-through-apply)
- [From a Raft Ready to an apply task](#from-a-raft-ready-to-an-apply-task)
- [The apply worker runs commands in order](#the-apply-worker-runs-commands-in-order)
- [The data and apply index share one write batch](#the-data-and-apply-index-share-one-write-batch)
- [Settings that affect apply work](#settings-that-affect-apply-work)

This walkthrough follows TiKV at commit <code>2c38416</code> (2026-11-24). It focuses on five types: <code>Peer</code>, <code>ApplyFsm</code>, <code>ApplyDelegate</code>, <code>ApplyContext</code>, and <code>PeerFsmDelegate</code>. The path starts after Raft has committed entries for a Region and follows them through TiKV's local state machine.

## Consensus has committed the log; the data still needs to catch up

TiKV splits its key space into **Regions**. Each Region has a Raft group whose peers keep replicated copies of that Region's data. The leader proposes writes, Raft replicates the log, and an entry becomes committed after the group reaches consensus.

Commit and apply are two different steps. A committed entry is safe for the state machine to process, but a particular peer may not yet have executed it against its local key/value data. TiKV tracks that progress with an **applied index**: the index of the last Raft entry the peer has applied.

The code path looks like this:

```text
Raft Ready contains committed entries
                |
                v
Peer::handle_raft_committed_entries
  packages entries, commit metadata, and proposal callbacks
                |
                v
ApplyRouter -> ApplyFsm::handle_apply
                |
                v
ApplyDelegate applies entries in index order
  ApplyContext builds a KV write batch
                |
                v
KV RocksDB: command changes + Raft apply state
                |
                +---- command callbacks after the write
                |
                v
ApplyRes -> PeerFsmDelegate::on_apply_res
  updates the peer's applied state and results
```

The earlier Raft work and this apply work use separate storage roles. TiKV stores Raft logs separately from Region key/value data. The apply index belongs with the key/value changes because it describes how far that local state machine has progressed.

## Five types carry the entry through apply

| Type                         | Role in this path                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- |
| <code>Peer</code>            | Owns the Region's Raft state and schedules committed entries for apply.       |
| <code>ApplyFsm</code>        | Receives apply messages through the apply batch system.                       |
| <code>ApplyDelegate</code>   | Holds one peer's Region state and applies entries in index order.             |
| <code>ApplyContext</code>    | Provides the KV engine write batch, tracks apply results, and flushes writes. |
| <code>PeerFsmDelegate</code> | Handles the asynchronous result after apply finishes.                         |

The important boundary is the message from <code>Peer</code> to <code>ApplyFsm</code>. The Raft-facing code can keep handling its own work while the apply system processes commands.

## From a Raft Ready to an apply task

When the Raft library reports committed entries in a Ready result, <code>Peer::handle_raft_committed_entries</code> gathers proposal callbacks that match those entries. These callbacks let TiKV finish the original request after its command has been applied.

The method builds an <code>Apply</code> value with the Region and peer IDs, term, commit index and term, entries, and callbacks. It then sends an <code>ApplyTask::apply</code> through the apply router for that Region. The commit index included in the task is capped at the Raft log's persisted index, so TiKV does not forward commit metadata beyond the locally persisted Raft position.

The router delivers that task to the matching <code>ApplyFsm</code>. During handling, the FSM uses cached entries when available and can fetch an entry range from the Raft engine when it needs to. It records the task's commit state, associates the proposal callbacks with their entries, and hands the entries to its <code>ApplyDelegate</code>.

That separation helps keep the Raft polling path responsive. It does not mean a single Region can apply entries out of order: its delegate checks that every next entry is exactly one greater than the previous applied index.

## The apply worker runs commands in order

For each entry, <code>ApplyDelegate::handle_raft_committed_entries</code> checks the expected index. A normal entry contains a serialized Raft command. The delegate parses the command and calls <code>process_raft_cmd</code>, which runs the command through TiKV's apply path and records the response for its callback.

Configuration-change entries use a separate branch because they change Raft membership. Both branches advance the Region's apply state only as entries are handled. If the peer is being removed, or an operation must wait for another Region, the delegate stops or yields instead of pretending later entries have been applied.

<code>ApplyContext</code> holds the KV engine's write batch while commands execute. Several operations can be collected before the worker writes that batch. The batch may also include metadata changes, so apply is more than copying a value into a key/value map.

```text
ApplyDelegate (Region 7)
  expected index: 104
       |
       +-- entry 104: decode command, update KV write batch
       +-- entry 105: decode command, update KV write batch
       +-- entry 106: decode command, update KV write batch
       |
       v
ApplyContext writes one batch and invokes ready callbacks
```

The example numbers are illustrative. The source enforces the ordering by comparing each entry index with <code>apply_state.applied_index + 1</code>.

## The data and apply index share one write batch

For crash recovery, a peer must not restart believing it applied an entry when the corresponding key/value changes are absent. TiKV addresses this by writing the Raft <code>apply_state</code> into the KV engine's <code>CF_RAFT</code> column family in the same write batch as the command's KV changes.

The source comment in <code>ApplyDelegate</code> explains why: if the apply index were stored in the separate Raft RocksDB, a power failure could leave that index persisted while the KV data write was not. Keeping both in the KV write batch ties the state-machine progress to the state-machine data.

After the batch is written to the KV engine, <code>ApplyContext::write_to_db</code> invokes the command callbacks. The apply context then flushes an <code>ApplyRes</code> through its notifier. <code>PeerFsmDelegate::on_apply_res</code> processes the result and updates the peer using <code>post_apply</code>.

The two result paths have separate jobs: command callbacks complete their requests after the KV batch write, while <code>ApplyRes</code> carries applied state, metrics, and execution results back to the peer. A successful engine write is distinct from a forced disk sync; the latter depends on TiKV's sync-log settings and the operation.

## Settings that affect apply work

The <code>[raftstore]</code> configuration controls how apply work is scheduled and how long one worker turn can run:

| Setting                             | Default in this source | What it controls                                                                                                                                                 |
| ----------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>apply-pool-size</code>        | <code>2</code>         | Number of threads that handle log apply. More threads can let different Regions apply concurrently, but they also use more CPU and compete for engine resources. |
| <code>apply-yield-write-size</code> | <code>32KB</code>      | A write-size budget after which an apply FSM yields so other work can run. The check happens after a write, so one turn can exceed the configured value.         |
| <code>apply-yield-duration</code>   | <code>500ms</code>     | A time budget used by the apply path before yielding after a write.                                                                                              |

These settings influence throughput and fairness. They do not change which entries Raft commits or the order in which one Region applies them. The defaults and option names are visible in TiKV's source; the configuration template also documents <code>apply-pool-size</code> as the number of threads for log apply.

## References

1. PingCAP, [TiKV Overview](https://docs.pingcap.com/tidb/stable/tikv-overview/).
2. PingCAP, [A TiKV Source Code Walkthrough - Raft in TiKV](https://www.pingcap.com/blog/raft-in-tikv/).
3. TiKV source at [commit 2c38416](https://github.com/tikv/tikv/commit/2c38416a1ff57dc9eddaf627d862d4295e3a5347):
   - [Peer::handle_raft_committed_entries](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/peer.rs#L3324-L3463)
   - [ApplyDelegate and ordered command application](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/fsm/apply.rs#L1095-L1390)
   - [ApplyDelegate::process_raft_cmd](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/fsm/apply.rs#L1490-L1533)
   - [ApplyContext write batch and callbacks](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/fsm/apply.rs#L553-L742)
   - [ApplyFsm::handle_apply](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/fsm/apply.rs#L4130-L4210)
   - [PeerFsmDelegate::on_apply_res](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/fsm/peer.rs#L2806-L2846)
   - [Raftstore apply configuration fields](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/config.rs#L381-L426), [defaults](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/components/raftstore/src/store/config.rs#L703-L723), and [TiKV configuration template](https://github.com/tikv/tikv/blob/2c38416a1ff57dc9eddaf627d862d4295e3a5347/etc/config-template.toml#L591-L595).
4. PingCAP, [TiKV Configuration File](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/).
