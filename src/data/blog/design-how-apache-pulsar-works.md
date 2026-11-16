---
author: JZ
pubDatetime: 2026-11-16T19:30:00Z
modDatetime: 2026-11-16T19:30:00Z
title: System Design - How Apache Pulsar Stores and Delivers Messages
tags:
  - design-system
  - design-messaging
description:
  "Follow a message through Apache Pulsar's broker, BookKeeper ledger, and subscription cursor to see how durable storage and independent consumers fit together."
---

## Table of contents

- [The story: one event, several teams](#the-story-one-event-several-teams)
- [The pieces in a Pulsar cluster](#the-pieces-in-a-pulsar-cluster)
- [A message's trip through Pulsar](#a-messages-trip-through-pulsar)
- [Subscriptions keep their own place](#subscriptions-keep-their-own-place)
- [Why split brokers from storage?](#why-split-brokers-from-storage)
- [References](#references)

## The story: one event, several teams

Imagine an online store that publishes an “order placed” event. The billing service needs it, the warehouse needs it, and an analytics job wants to keep a long history. The store should publish the event once. Each team should be able to read it at its own pace, including after a short outage.

A basic queue usually removes a message after a worker consumes it. That works when one worker group owns the work. It is less convenient when several independent groups need their own copy of progress.

Apache Pulsar models this with a **topic** and one or more **subscriptions**. Producers append messages to a topic. Each subscription tracks where its consumers have read and acknowledged. Billing can be caught up while the warehouse is offline, and neither team's progress moves the other's cursor.

This post follows persistent topics: messages are written to durable storage. Pulsar also supports non-persistent topics, which do not use the same durable path.

## The pieces in a Pulsar cluster

A Pulsar cluster separates the service that handles client connections from the system that stores the message log:

    Producer
       |
       | publish to a topic
       v
    +------------------------+        metadata store
    | Pulsar broker           | <---- topic ownership,
    | PersistentTopic         |       cluster metadata
    +-----------+------------+
                |
                | append entry
                v
    +------------------------+
    | Managed ledger          |  one topic's ordered log
    +-----------+------------+
                |
                | replicated writes
                v
    +------------------------+
    | BookKeeper bookies      |  durable ledger entries
    +------------------------+

    Broker dispatches entries to consumers using each subscription's cursor:
       billing cursor  ------> billing consumers
       warehouse cursor -----> warehouse consumers

A **broker** accepts producer and consumer connections, routes topics to their owning broker, dispatches messages, and coordinates with the metadata store. It is designed so brokers can be added to serve more topics and clients.

**Apache BookKeeper** is the storage layer. It stores append-only logs called **ledgers** across bookies. A topic's **managed ledger** organizes those BookKeeper ledgers over time and connects the message stream to its consumers' cursors. When a ledger is full or its writer fails, the managed ledger can roll to a new ledger.

The metadata store keeps coordination data such as topic ownership and cluster metadata. It helps a client find a broker; it does not carry every message payload.

## A message's trip through Pulsar

Suppose the producer publishes an order to a persistent topic.

1. **Find the topic owner.** The client looks up the topic and connects to the broker that currently owns it. If ownership changes later, the client can look up the topic again.
2. **Accept the publish.** The broker's persistent-topic path validates the message and passes it to the topic's managed ledger. In Pulsar source, [PersistentTopic.publishMessage and asyncAddEntry](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/pulsar-broker/src/main/java/org/apache/pulsar/broker/service/persistent/PersistentTopic.java#L696-L764) lead to the topic's ledger path; the transaction buffer can preserve publish order.
3. **Append to storage.** [ManagedLedgerImpl.asyncAddEntry](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/managed-ledger/src/main/java/org/apache/bookkeeper/mledger/impl/ManagedLedgerImpl.java#L1001-L1021) hands the entry to a batching append pipeline. BookKeeper appends it to a ledger and replicates it to the ledger's configured bookies.
4. **Return a position.** When the write is accepted, the ledger position identifies the entry, commonly as a ledger ID and entry ID. The broker acknowledges the publish to the producer.

The path looks like this:

    Producer       Broker          Managed ledger       BookKeeper
       |              |                   |                  |
       | publish      |                   |                  |
       |------------->|                   |                  |
       |              | append entry      |                  |
       |              |------------------>|                  |
       |              |                   | write + replicate |
       |              |                   |----------------->|
       |              |                   | position         |
       |              |                   |<-----------------|
       |              | publish ack       |                  |
       |<-------------|                   |                  |

The separation between “accept the message” and “read it later” is useful. The broker can acknowledge a durable append without waiting for every consumer to be ready. If a consumer is behind, the entry remains available for that subscription.

## Subscriptions keep their own place

A subscription is more than a label. Pulsar keeps a **cursor** for it: a position in the managed ledger, together with acknowledgement state. When a consumer acknowledges a message, its cursor records that acknowledgement and advances the mark-delete position once the acknowledged prefix is contiguous. [ManagedCursorImpl.asyncMarkDelete](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/managed-ledger/src/main/java/org/apache/bookkeeper/mledger/impl/ManagedCursorImpl.java#L2610-L2670) handles that position update. If a consumer disconnects before acknowledging, Pulsar can deliver the message again when the consumer reconnects.

Each subscription has its own cursor:

    Ledger entries:  ... [41] [42] [43] [44] [45] [46] ...
                                  ^                ^
                                  |                |
                       billing cursor       warehouse cursor

Billing has acknowledged through entry 42. The warehouse has only acknowledged through entry 45. Their reads are independent, so one subscription cannot make another skip an entry.

Pulsar offers subscription types for different work patterns:

| Type | What it does |
| --- | --- |
| Exclusive | One consumer receives messages for the subscription. |
| Failover | One consumer is active; another can take over if it fails. |
| Shared | Multiple consumers share delivery work. This increases parallelism but does not promise order across consumers. |
| Key_Shared | Multiple consumers share work while messages with the same key stay assigned together, preserving per-key order. |

The cursor also explains how Pulsar can reclaim storage. Acknowledging one entry does not immediately erase it from a bookie. Managed-ledger cleanup can remove a whole ledger after subscriptions no longer need its entries and retention rules allow deletion. If a subscription falls behind, its cursor holds back cleanup. A configured retention policy can also keep acknowledged messages for replay.

This is the main operational trade-off: independent replay is convenient, but a slow or abandoned subscription can create a backlog and retain storage. Subscription lag and retention settings therefore matter when operating a Pulsar cluster.

## Why split brokers from storage?

Keeping brokers and BookKeeper as separate services gives each layer a different scaling job:

- Add brokers when client connections, topic ownership, or dispatch work is the bottleneck.
- Add bookies when durable storage capacity or write throughput is the bottleneck.
- Add subscriptions when another application needs an independent view of the stream.

It also adds more moving parts: the broker tier, BookKeeper, and metadata coordination need their own monitoring and capacity planning. For a small workload, a simpler broker-and-storage design may be easier to operate. Pulsar's architecture pays off when many topics, independent consumers, replay, and storage growth are important.

## References

1. Apache Pulsar documentation, [Architecture overview](https://pulsar.apache.org/docs/4.0.x/concepts-architecture-overview/) and [Messaging concepts](https://pulsar.apache.org/docs/4.0.x/concepts-messaging/).
2. Apache Pulsar source at commit [fb5a3ab](https://github.com/apache/pulsar/commit/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593): [PersistentTopic.java](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/pulsar-broker/src/main/java/org/apache/pulsar/broker/service/persistent/PersistentTopic.java#L696-L764), [ManagedLedgerImpl.java](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/managed-ledger/src/main/java/org/apache/bookkeeper/mledger/impl/ManagedLedgerImpl.java#L1001-L1021), and [ManagedCursorImpl.java](https://github.com/apache/pulsar/blob/fb5a3ab261f7929fd83a5cf80bfe8dce73d3c593/managed-ledger/src/main/java/org/apache/bookkeeper/mledger/impl/ManagedCursorImpl.java#L2610-L2670).
