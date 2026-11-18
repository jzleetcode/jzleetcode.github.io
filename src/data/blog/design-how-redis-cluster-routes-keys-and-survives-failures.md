---
author: JZ
pubDatetime: 2026-11-18T19:32:00Z
modDatetime: 2026-11-18T19:32:00Z
title: System Design - How Redis Cluster Routes Keys and Survives Failures
tags:
  - design-system
  - design-database
description: "A guided tour of Redis Cluster's hash slots, client routing, resharding redirects, gossip, replica elections, and write-safety trade-offs."
---

## Table of contents

## A key needs an address

Suppose an application asks Redis for `cart:42`. In a single Redis server, the key is right there in memory. In a cluster, the first question is which server owns it.

Redis Cluster answers that with a fixed map of **16,384 hash slots**. In a stable cluster, each primary owns a subset of those slots. A key is mapped to a slot with:

```text
slot = CRC16(key) mod 16384
```

The client can calculate that slot before sending the request. The cluster does not need a proxy in front of every request: clients that know the slot map can connect directly to the primary that owns the key.

A slot is a routing bucket, not a range of key names. If you add a node, Redis moves some slots and their keys to it. The number of slots stays fixed; only their owners change.

### Keep related keys together

A command such as `MGET` can touch more than one key, but Redis Cluster can execute a multi-key command only when all its keys map to the same slot. Hash tags give the application control over that placement. When a key contains a non-empty `{...}` substring, Redis hashes only the text inside the first valid pair of braces.

For example, `cart:{42}:items` and `cart:{42}:total` both hash the tag `42`, so they land in the same slot. This makes multi-key operations possible for one customer's cart. It also concentrates those keys on one primary: a very popular tag can create a hot slot even while other nodes have spare capacity.

## Clients follow the slot map

A client may start by connecting to any cluster node. If that node does not own the key's slot, it returns a `MOVED` response with the slot number and the correct endpoint:

```text
GET cart:42
-MOVED <slot> <primary-host>:<port>
```

The client retries the command at that endpoint and can update its cached slot map. It can also refresh the complete map with `CLUSTER SHARDS`. Once the map is current, normal requests go straight to the right primary.

This distinction matters during troubleshooting: a `MOVED` response is a routing update, not the node forwarding the command. Redis Cluster nodes do not proxy client requests to one another.

## Resharding uses a temporary detour

Now imagine moving slot 8 from primary A to primary B. During the move, A still owns the slot from the client's point of view, while B is marked as importing it. A may still have some of the slot's keys and B may already have others.

If a key is still on A, A can serve it. If the key has already moved, A answers with `ASK`, directing the client to B for this one request. The client sends `ASKING` to B on the same connection immediately before retrying the command. It should not yet change its permanent slot map: the migration is in progress, and A remains the published owner until the slot move finishes.

```text
Before migration:  client ---- key in slot 8 ----> A
During migration:  client ---- key still at A ----> A
                   client ---- key missing at A --> ASK B
                   client ---- ASKING + command --> B
After migration:   client ---- key in slot 8 ----> B
                   stale map <--- MOVED B -------- B
```

When the slot has a new owner, clients learn that with `MOVED` and can route there directly. The difference is practical: `ASK` is a temporary detour for a slot being moved; `MOVED` updates the slot-to-primary mapping.

## Gossip keeps the cluster's picture current

Clients use the Redis command port. Cluster nodes also talk to one another over a separate **cluster bus**. By default, its port is the command port plus 10,000, so a node listening for clients on 6379 uses 16379 for cluster traffic. Firewalls must allow this node-to-node traffic as well as client connections.

The cluster bus carries heartbeats and gossip. Each node learns about peers, their primary or replica roles, and the slots they serve. Gossip helps a node notice that a peer is unreachable and lets nodes share their observations without asking a central coordinator.

Failure detection has two stages:

1. A node marks a peer `PFAIL`, meaning “possibly failing,” when a ping has stayed unanswered for `cluster-node-timeout`. This is that node's local suspicion.
2. If a majority of primaries report the problem within the required time window, the suspicion becomes `FAIL` and is propagated through the cluster.

A replica of the failed primary can then try to become primary. The replica with the freshest replication progress gets a head start, but it still needs votes from a majority of primaries. On winning, it receives a newer configuration epoch and takes ownership of the failed primary's slots.

## What failover does and does not promise

Redis replication is asynchronous. A primary can reply that a write succeeded before a replica has received it. If the primary fails during that gap and a replica is promoted, the acknowledged write may be missing from the new primary. Redis Cluster aims to keep the cluster available when a majority of primaries can communicate and replicas can take over; it does not make every acknowledged write durable on multiple nodes before replying.

The client can use `WAIT` to ask how many replicas have acknowledged prior writes. That narrows some loss windows, but it is not a replacement for synchronous consensus or a guarantee that every acknowledged write survives every failure.

Two configuration choices affect the trade-off:

- `cluster-node-timeout` controls how long a peer can be unreachable before failure handling begins. A shorter timeout can speed up detection, but leaves less room for slow networks and brief pauses.
- `cluster-require-full-coverage yes` (the default) makes the cluster stop serving queries if any hash slot is uncovered. Setting it to `no` lets the covered portion keep serving, while keys in uncovered slots remain unavailable.

If a cluster seems healthy but a client gets repeated redirects, check whether the client's slot map is stale. If a primary failover seems slow, check the timeout and whether a sufficiently up-to-date replica can be elected. If a write disappeared after failover, remember that routing and replica promotion do not make replication synchronous.

## References

1. Redis, [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/).
2. Redis, [Redis Cluster tutorial](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/).
3. Redis, [CLUSTER SHARDS command](https://redis.io/docs/latest/commands/cluster-shards/).
4. Redis, [WAIT command](https://redis.io/docs/latest/commands/wait/).
5. Redis configuration file, [cluster timeout](https://github.com/redis/redis/blob/unstable/redis.conf#L1823-L1827) and [full slot coverage](https://github.com/redis/redis/blob/unstable/redis.conf#L1940-L1950).
