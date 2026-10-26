---
author: JZ
pubDatetime: 2026-10-26T18:32:33Z
modDatetime: 2026-10-26T18:32:33Z
title: System Design - How Fencing Tokens Stop Stale Lock Holders
tags:
  - design-system
  - design-concurrency
description: "Why a distributed lease cannot stop a paused worker from writing, and how ordered fencing tokens let a storage system reject stale requests."
---

## Table of contents

## The worker that woke up too late

This is an explanation for engineers new to distributed coordination. Imagine two workers updating the same report in object storage. They use a lock service so that only one worker _intends_ to write at a time. The lock has a lease: if its holder disappears, another worker may take over. What happens if the first worker is not dead, just paused?

```text
Time       Lock service             Worker A            Worker B       Storage
 t1        grants lease to A        reads old report
 t2                                pauses (GC, VM stall)
 t3        A's lease expires
 t4        grants lease to B                            writes new report -> new
 t5                                wakes; writes old report -----------> old!
```

Worker A may have checked its lease _before_ pausing. When it resumes, that earlier check says nothing about whether the lease is still valid. Even checking once more before a network request leaves a gap: the lease could expire while the request is in flight. A lease controls who the coordinator currently considers the holder; by itself, it cannot erase packets from a former holder. [Martin Kleppmann's distributed-locking analysis](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) uses precisely this pause-and-resume failure to motivate fencing.

## Make each turn carry a number

Instead of handing out only a lock, the coordinator assigns a **monotonically increasing fencing token** on each new acquisition. Worker A gets `41`; after its lease expires, worker B gets `42`. Both include their token in every write to the protected resource. The storage system remembers the highest token it has accepted for that resource and rejects a request with a lower token.

```text
                 coordinator                  protected storage
              +----------------+             +-------------------------+
 Worker A <----| lease A, #41   |--- #41 --->| highest_seen = 41       |
              | A expires      |             |                         |
 Worker B <----| lease B, #42   |--- #42 --->| highest_seen = 42; write|
              +----------------+             |                         |
 Worker A (wakes) -------- #41, old write -->| 41 < 42: reject         |
                                             +-------------------------+
```

The receiver's comparison is the crucial part. The workers cannot enforce fencing merely by promising to check the lock themselves. The comparison and data mutation must be **atomic**: if two requests race, the receiver must not check the high-water mark for both and then apply their writes in the wrong order. A conceptual storage transaction looks like this:

```text
begin transaction for report-7
  if request.token < report-7.highest_seen: reject
  report-7.highest_seen = request.token
  report-7.contents = request.contents
commit
```

The high-water mark must survive a storage restart. It belongs to the resource being protected, or to a shared namespace with an equivalent ordering guarantee. An arbitrary UUID tells you _which_ owner sent a request, but not which acquisition came later. A timestamp from each worker's local clock is also a poor substitute for an ordered token minted by the coordinator.

## A subtle limit: the receiver must learn about the new holder

Fencing guarantees that **after** storage has observed token `42`, a delayed write with token `41` cannot overwrite it. If A's delayed request reaches storage _after its lease expires but before B's first request with `42`_, a high-water mark of `41` alone cannot tell that A is stale. A design that must reject _every_ post-expiry write needs an additional mechanism, such as checking live lease state at the receiver or establishing a durable fence at storage before B starts work. Fencing is about ordered acceptance at the side-effect boundary, not a magic message sent when a lease expires.

This also explains why an external API that cannot inspect a token is difficult to protect with fencing. If it accepts an email, payment, or file write without an atomic token check, attaching `42` to a separate metadata record does not make the side effect safe. You may instead need an idempotent workflow, a single writer at the side-effect boundary, or an API with conditional updates.

## Where can the number come from?

A coordination system can issue a counter that increases with each successful acquisition. Some systems expose ordered revisions that can be used as building blocks: etcd's [API describes `create_revision`, `mod_revision`, and leases](https://etcd.io/docs/v3.5/learning/api/). That does **not** mean that attaching an etcd lease to a lock automatically fences an unrelated database: you still need to check that your chosen number advances on _every acquisition_ and that the destination enforces it. ZooKeeper's [lock recipe](https://zookeeper.apache.org/doc/current/recipes.html) similarly uses ordered, ephemeral-sequential nodes to decide who owns a lock; ordering at the coordinator alone is not enforcement at an external receiver.

If all you need is to avoid duplicate cache recomputation, an expiring lock may be adequate. If a stale worker could corrupt authoritative data, ask two separate questions: **who currently holds the lease?** and **which worker's requests will the destination still accept?** Fencing tokens answer the second question only when the destination participates.

## References

1. [Martin Kleppmann, "How to do distributed locking"](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) — paused clients, fencing tokens, and the receiver's role.
2. [etcd v3 API reference](https://etcd.io/docs/v3.5/learning/api/) — revision and lease primitives; not an external fencing implementation.
3. [Apache ZooKeeper recipes: locks](https://zookeeper.apache.org/doc/current/recipes.html) — ordered ephemeral-sequential lock contenders.
