---
author: JZ
pubDatetime: 2026-11-02T19:40:00Z
modDatetime: 2026-11-02T19:40:00Z
title: System Design - How TiKV Raftstore's Batch System Dispatches Messages
tags:
  - design-system
  - design-database
  - design-concurrency
  - design-tidb
description: "A source-code walk through TiKV Raftstore's BatchSystem, RaftPoller, StoreFsm, and PeerFsm: how messages become bounded batches of per-Region work without one busy Region starving the rest."
---

## Table of contents

## One TiKV store, many independent Raft groups

A TiKV node can host thousands of **Regions**. Each Region is a separate Raft group with its own log, leader, and local replica state. A network Raft message, a client proposal, a timer tick, or an apply result must eventually reach the Region that owns it.

It would be tempting to make one operating-system thread per Region. That wastes threads for mostly idle Regions and makes bursts difficult to balance. It would also be tempting to put all Regions behind one giant lock and one loop. That makes a hot Region delay unrelated Regions.

TiKV's Raftstore uses a reusable **batch system** between those extremes. This post follows four collaborating types in the current `master` source tree:

| Type          | File                                          | Job in this story                                                            |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `BatchSystem` | `components/batch-system/src/batch.rs`        | Owns queues and a bounded pool of poller threads.                            |
| `RaftPoller`  | `components/raftstore/src/store/fsm/store.rs` | Drains a batch and supplies Raftstore-specific handling.                     |
| `StoreFsm`    | `store/fsm/store.rs`                          | Handles store-wide control messages, including Region creation/routing work. |
| `PeerFsm`     | `store/fsm/peer.rs`                           | Holds the state and mailbox for one Region peer.                             |

This is not a complete Raft implementation tutorial. We will trace the **dispatch boundary**: how already-addressed work reaches a Region state machine and why the scheduler revisits the queue between batches.

## The cast: normal Region work and control work

The generic batch system has two FSM (finite-state-machine) types:

```text
BatchSystem<normal FSM, control FSM>
             |             |
             |             +--> StoreFsm: store-wide messages
             |
             +----------------> PeerFsm: one Region's messages
```

`PeerFsm` contains a TiKV `Peer`, a receiver for `PeerMsg`, a `stopped` flag, and an optional `BasicMailbox`. Its `Fsm` implementation gives the generic scheduler the two operations it needs at this layer: determine whether it stopped and attach or remove its mailbox. The peer itself contains much more Raft and Region logic, but that detail is deliberately below this post's line.

`StoreFsm` owns a receiver for `StoreMsg` and the `Store` metadata. It is the control FSM because some work has to be handled at the store level before it can become ordinary peer work. For example, a Raft message for a missing Region may need validation and peer creation; a message cannot be put in a Region mailbox until that mailbox exists.

## Creation wires the pieces together

`create_raft_batch_system` in [`store.rs`](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/store.rs#L2236-L2268) creates a `StoreFsm`, then calls the generic [`batch_system::create_system`](https://github.com/tikv/tikv/blob/master/components/batch-system/src/batch.rs#L727-L773). The result is wrapped as a `RaftRouter` and a `RaftBatchSystem`.

```text
create_raft_batch_system(config)
        |
        +--> StoreFsm::new(config) -> store message sender + StoreFsm
        |
        +--> create_system(store_batch_system config, StoreFsm)
        |       |
        |       +--> BatchRouter<PeerFsm, StoreFsm>
        |       +--> BatchSystem<PeerFsm, StoreFsm>
        |
        +--> RaftRouter { router }
        +--> RaftBatchSystem { system, router, apply system, ... }
```

The router is important because callers should not reach into a `PeerFsm` directly. A router looks up the relevant mailbox, sends a message, and schedules the FSM when it becomes runnable. This separation lets producers be concurrent while the poller decides which batch of state machines executes next.

During startup, `RaftBatchSystem` builds a `RaftPollerBuilder`; that builder initializes existing peers from local metadata and later produces a `RaftPoller` per worker. The generic `BatchSystem::spawn` starts `pool_size` normal-priority pollers, not one poller per Region.

## A message's trip through the system

Consider a Raft message that targets Region 42, whose peer already exists:

```text
transport / client / timer
          |
          v
      RaftRouter
          |
          v
 BasicMailbox<PeerFsm(42)>
          |     (enqueue PeerMsg; schedule if needed)
          v
 batch-system normal-FSM queue
          |
          v
 RaftPoller worker takes PeerFsm(42) into a batch
          |
          v
 PeerFsmDelegate handles queued messages and advances peer work
```

The mailbox is the handoff point. The `PeerFsm` implementation's `set_mailbox` and `take_mailbox` methods are not business logic; they let the generic layer maintain the association while it schedules and retires FSMs. Its `receiver` is the peer-local inbox. A producer need not acquire the peer's long-lived execution context to deliver a message.

For a message that does not yet have a peer, the flow first goes through `StoreFsm`:

```text
incoming RaftMessage
       |
       v
StoreFsm / StoreFsmDelegate
       |
       +--> validate message and locate or create peer
       |
       v
PeerFsm mailbox
```

That is why it is useful to keep `StoreFsm` and `PeerFsm` separate: the control plane can safely decide what a message means before the data-plane peer tries to process it.

## What the poller actually batches

The generic [`Poller::poll`](https://github.com/tikv/tikv/blob/master/components/batch-system/src/batch.rs#L382-L518) repeatedly fetches runnable FSMs into a `Batch`, calls handler hooks, and processes the normal FSMs. It does **not** take one Region and run it forever.

The essential loop has this shape:

```text
fetch a bounded set of runnable PeerFsms
        |
        v
handle StoreFsm control work if present
        |
        v
handle each PeerFsm in the batch
        |
        +--> stopped? remove its mailbox / retire it
        +--> still runnable? reschedule it under fairness rules
        |
        v
fetch again from the shared queue
```

The source comments explain a subtle fairness choice: after every round it fetches a new batch, so hot Regions do not monopolize a worker simply because they are always ready. `max_batch_size` bounds the ordinary batch, while the code can still admit already-fetched work needed to avoid stranding it.

`RaftPoller` implements [`PollHandler<PeerFsm, StoreFsm>`](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/store.rs#L1139-L1420). Its `begin` hook refreshes online batch configuration and resets per-round accounting. Its `handle_control` drains a bounded number of `StoreMsg` values from `StoreFsm.receiver`, then delegates them to `StoreFsmDelegate`. The peer-handling portion uses `PeerFsmDelegate`, the object that connects the peer FSM to the poller's engines, transport, timers, metrics, and worker schedulers.

The batch system therefore batches **scheduling and polling**, not Raft consensus itself. Each Region still has independent Raft state; batching amortizes queue and worker-loop overhead while keeping the execution unit a Region peer.

## Why rescheduling exists

One of the easiest mistakes when reading a work queue is to assume that an item gets one turn and disappears. A Region can still have ready Raft work after one poll: more messages may have arrived, a proposal may produce follow-up work, or a timer may be due.

The generic poller records whether an FSM needs another turn. A hot FSM that has consumed at least `reschedule_duration` is eligible to be sent back through the scheduler instead of remaining in the current batch forever. The implementation deliberately reschedules only part of eligible hot FSMs in one pass, reducing the chance that the next batch is entirely the same hot Regions.

```text
Round 1: [Region 7 (hot), Region 42, Region 99]
                 |
                 +--> Region 7 still has work and used its time slice
                              |
                              v
                    enqueue Region 7 for a later round

Round 2 can include newly ready Regions rather than only Region 7.
```

This is fairness, not a strict promise that every Region receives equal CPU time. CPU pressure, long individual operations, I/O, and the number of worker threads all affect observed latency. The point is that the scheduler has an explicit place to yield a hot Region back to the shared queue.

## The configuration knobs worth reading first

The Raftstore [`Config`](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/config.rs#L199-L205) has several related settings. They tune different boundaries:

| Setting                                  |           Default in source | Meaning                                                                                                         |
| ---------------------------------------- | --------------------------: | --------------------------------------------------------------------------------------------------------------- |
| `store-batch-system.pool-size`           |     platform/config default | Number of normal Raftstore poller workers. More is not automatically better: peers still share engines and CPU. |
| `store-batch-system.max-batch-size`      |   derived during validation | Maximum number of runnable FSMs a poller normally processes in a batch.                                         |
| `store-batch-system.reschedule-duration` | batch-system config default | Time budget used by the generic poller when deciding whether hot FSMs should yield.                             |
| `notify-capacity`                        |                      40,960 | Capacity used when `StoreFsm::new` creates the loose-bounded store-message channel.                             |
| `messages-per-tick`                      |                       4,096 | Upper bound that `RaftPoller::handle_control` uses while draining store control messages in a round.            |

Do not tune these numbers as a first response to one slow query. They affect Raftstore-wide scheduling. First determine whether the bottleneck is a hot Region, Raft log/apply pressure, CPU saturation, disk latency, network delay, or a workload that concentrates writes on one key range. The source's validation also constrains `store_batch_system.pool_size` to be positive and no greater than the available CPU limit.

The names are implementation-facing and may change between releases. Check the configuration reference and the source version deployed in the cluster before applying a value copied from an article.

## The mental model to keep

`PeerFsm` is the per-Region unit of work; `StoreFsm` is the store-wide control gate; `BatchSystem` owns shared queues and worker loops; and `RaftPoller` supplies the Raftstore-specific processing context. Mailboxes let producers make a peer runnable without directly executing it. Batches amortize scheduling overhead, and rescheduling gives other ready Regions a chance to run.

That division is why TiKV can manage many mostly idle Regions efficiently without letting a permanently busy Region become the only Region a worker ever sees.

## References

1. TiKV source, [`create_raft_batch_system`, `RaftBatchSystem`, and `RaftPoller`](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/store.rs#L1139-L1420).
2. TiKV source, [`StoreFsm` and `RaftRouter`](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/store.rs#L391-L423) and [`StoreFsm`'s `Fsm` implementation](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/store.rs#L876-L916).
3. TiKV source, [`PeerFsm` and its mailbox-bearing `Fsm` implementation](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/peer.rs#L137-L180) and [the implementation](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/fsm/peer.rs#L689-L721).
4. TiKV source, [`BatchSystem`, `Poller`, and `create_system`](https://github.com/tikv/tikv/blob/master/components/batch-system/src/batch.rs#L336-L518).
5. TiKV source, [Raftstore configuration](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/config.rs#L199-L205) and [defaults](https://github.com/tikv/tikv/blob/master/components/raftstore/src/store/config.rs#L574-L615).
6. PingCAP documentation, [TiKV configuration file reference](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/).
