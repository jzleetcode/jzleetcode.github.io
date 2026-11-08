---
author: JZ
pubDatetime: 2026-11-08T19:30:48Z
modDatetime: 2026-11-08T19:30:48Z
title: System Design - How Redis Streams and Consumer Groups Work
tags:
  - design-system
  - design-distributed
  - design-storage
description: "Follow a Redis Stream from XADD through consumer-group delivery, pending entries, acknowledgements, and recovery after a worker fails."
---

## Table of contents

## A queue that remembers what happened

Imagine an order service that publishes events for billing. If a billing worker is offline for a few minutes, it still needs to process those orders after it comes back. Redis Pub/Sub does not keep messages for a disconnected subscriber. A Redis list can hold items, but a blocking pop removes an item before the worker has finished its work. Redis Streams provide a different shape: an ordered log of entries, plus consumer-group bookkeeping for who has received each entry and who has acknowledged it.

A stream is a Redis key. Each entry has an ID and a set of field-value pairs:

```text
XADD orders * order_id 541 total 89.00
```

The `*` asks Redis to generate an ID. An ID looks like `1710000000000-0`: a millisecond time component followed by a sequence number. Entries in one stream are ordered by these IDs. The ID is useful for finding a position in the log, but it is not itself a consumer group's progress record.

## One stream, separate groups

A stream can serve different applications at the same time. Each consumer group has its own delivery position and pending-entry list. Within one group, consumers share the work: Redis gives different entries to different consumers in that group.

```text
                      XADD
  order service -----------------> orders stream
                                        |
                         +--------------+--------------+
                         |                             |
                  group: billing                group: analytics
                  its own progress              its own progress
                  and pending list              and pending list
                         |
                 +-------+-------+
                 |               |
            worker-1         worker-2
             XACK              XACK
```

Creating a group at `0` lets it begin with the earliest entries still in the stream. Creating it at `$` starts at the current end, so it sees new entries but skips the existing history:

```text
XGROUP CREATE orders billing 0 MKSTREAM
```

`MKSTREAM` creates the key if it does not exist. This choice matters: a service that must process already-written orders needs a different starting point from one that only wants future events.

## Delivery creates a pending entry

A consumer asks its group for new entries with `XREADGROUP`:

```text
XREADGROUP GROUP billing worker-1 COUNT 10 BLOCK 5000 STREAMS orders >
```

The `>` means “give me entries that have not yet been delivered to a consumer in this group.” Redis advances the group's last-delivered position and records each delivered ID in the group's **pending entries list** (PEL), associated with the consumer that received it. The application can now work on the returned order.

A PEL record is a delivery receipt, not a completed order. If the worker succeeds, it acknowledges the ID:

```text
XACK orders billing 1710000000000-0
```

Acknowledging removes that ID from the group's PEL. It does **not** delete the entry from the stream. Stream retention and consumer acknowledgement solve different problems: the group tracks work status, while commands such as `XTRIM` control how much history the stream keeps.

## Recovering work from a failed consumer

Suppose `worker-1` receives an order and then crashes before acknowledging it. The order remains pending under `worker-1`; a regular `XREADGROUP ... >` call will not hand that same pending entry to `worker-2` as new work.

A service can inspect pending IDs with `XPENDING` and transfer an entry that has been idle long enough with `XAUTOCLAIM`:

```text
XAUTOCLAIM orders billing worker-2 60000 0-0 COUNT 10
```

Here, `60000` is the minimum idle time in milliseconds. Redis changes the pending entry's consumer to `worker-2`, which can retry the work and acknowledge it after success. `XAUTOCLAIM` returns a cursor too, so a caller that has more pending entries can continue its scan.

The idle threshold is an operational decision. Set it shorter than a normal job and a slow but healthy worker can lose ownership while it is still processing. Set it too long and recovery waits longer after a crash. Either way, a worker might finish a side effect and crash before `XACK`; a retry can then perform that side effect again. Make handlers idempotent when duplicate processing would matter.

This is why consumer groups are often described as supporting **at-least-once processing** when applications retry pending entries. An acknowledgement says that one consumer finished the work; it cannot make a database update and a Redis command happen as one atomic operation.

## Order, history, and retention are separate concerns

The stream gives entries an ordered history. A group distributes that history among consumers, but parallel consumers can finish out of order. If a business rule requires completion order, limit concurrency or add an ordering mechanism at the application level.

A stream can also grow indefinitely unless the application chooses a retention policy. For example, `XADD` supports a maximum length, and `XTRIM` can trim by length or ID. Choose a retention window that allows expected consumer outages and retries. Trimming old entries is not the same as acknowledging them; check the stream documentation's consumer-group-aware trimming options before deleting entries that may still be pending.

Finally, a stream being stored in Redis does not by itself define what survives a machine failure. Persistence depends on the Redis deployment's RDB and AOF settings. See [how Redis persistence works](/posts/design-how-redis-persistence-works/) for that separate part of the system.

## The useful mental model

Think of a Redis Stream as an ordered notebook and each consumer group as a separate reading team. `XADD` writes a new line. `XREADGROUP` assigns unread lines to team members and marks them pending. `XACK` clears a completed line from the team's pending list, while `XAUTOCLAIM` lets another member take over work that has been idle too long. The stream keeps its history until a separate retention command removes it.

## References

1. Redis, [Streams data type guide](https://redis.io/docs/latest/develop/data-types/streams/) (stream entries, groups, pending messages, and retention).
2. Redis command reference, [`XADD`](https://redis.io/docs/latest/commands/xadd/), [`XREADGROUP`](https://redis.io/docs/latest/commands/xreadgroup/), and [`XACK`](https://redis.io/docs/latest/commands/xack/).
3. Redis command reference, [`XPENDING`](https://redis.io/docs/latest/commands/xpending/) and [`XAUTOCLAIM`](https://redis.io/docs/latest/commands/xautoclaim/) (observing and recovering pending work).
4. Redis command reference, [`XTRIM`](https://redis.io/docs/latest/commands/xtrim/) (stream retention).
