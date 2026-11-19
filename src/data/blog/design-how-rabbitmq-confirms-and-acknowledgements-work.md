---
author: JZ
pubDatetime: 2026-11-19T19:29:00Z
modDatetime: 2026-11-19T19:29:00Z
title: System Design - How RabbitMQ Confirms and Acknowledgements Work
tags:
  - design-system
  - design-distributed
description: "Follow a RabbitMQ message from publisher to worker: routing, publisher confirms, quorum queues, manual acknowledgements, prefetch, and why retries still require idempotent processing."
---

## Table of contents

## An order disappears between two successful operations

An online store accepts an order and publishes a message asking a warehouse worker to reserve inventory. The publisher writes to its network socket successfully. A worker later prints a log line saying it received the order. Yet after a machine failure, the inventory reservation is missing.

Both log lines can be true. Writing to a socket does not prove that RabbitMQ has taken responsibility for a message. Receiving a message does not prove that the worker has committed its database transaction.

RabbitMQ provides two separate handoffs to close these gaps: **publisher confirms** and **consumer acknowledgements**. Understanding where each handoff ends makes the difference between a queue that usually works and a workflow that survives failures.

This post follows RabbitMQ 4.1's AMQP 0-9-1 behavior, using an ordinary work queue. Other protocols and RabbitMQ Streams expose different APIs.

## First, follow the message's route

A publisher normally sends a message to an **exchange**, which uses bindings and a routing key to choose destination queues. A **binding** is a routing rule connecting an exchange to a queue. Consumers subscribe to queues, and RabbitMQ delivers queued messages to them.

```text
Publisher
    |
    | publish(exchange="orders", routing_key="reserve")
    v
+------------------+
| direct exchange  |
| orders           |
+--------+---------+
         | binding: reserve
         v
+------------------+     deliver      +------------------+
| queue            | ---------------->| inventory worker |
| inventory.jobs   |                  |                  |
+------------------+                  +--------+---------+
                                               |
                                               v
                                      inventory database
```

A direct exchange matches the routing key against binding keys. Other exchange types support patterns or fanout, but the two handoffs work the same way.

When several workers consume from one queue, RabbitMQ distributes deliveries among them. If two separate services must each receive the event, give them separate queues bound to the exchange. Two consumers of one queue are competing for work; they are not two independent subscriptions to every event.

## Two acknowledgements answer two different questions

The [RabbitMQ confirms guide](https://www.rabbitmq.com/docs/4.1/confirms) explicitly treats the features as independent:

| Signal                   | Direction             | What it tells the receiver                                                                |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| Publisher confirm        | RabbitMQ to publisher | The broker has handled the publish according to the destination queues' acceptance rules. |
| Consumer acknowledgement | Consumer to RabbitMQ  | This delivery can be considered handled and removed from the queue.                       |

Neither signal proves that the warehouse database contains a reservation. The application makes that connection by sending its consumer acknowledgement **after** committing the reservation.

```text
Publisher                 RabbitMQ                 Worker            Database
    |                         |                       |                  |
    | publish order 42        |                       |                  |
    |------------------------>|                       |                  |
    |                         | accept into queue     |                  |
    | publisher confirm       |                       |                  |
    |<------------------------|                       |                  |
    |                         | deliver order 42      |                  |
    |                         |---------------------->|                  |
    |                         |                       | reserve + commit |
    |                         |                       |----------------->|
    |                         |                       | committed        |
    |                         |                       |<-----------------|
    |                         | consumer ack          |                  |
    |                         |<----------------------|                  |
```

This is one possible sequence. A consumer can receive a message before the publisher receives its confirm. The two protocols do not impose an application-level ordering between those observations.

## Publisher confirms transfer responsibility to RabbitMQ

The publisher enables confirm mode on a channel using `confirm.select`. A **channel** is a logical AMQP conversation carried over a network connection. Each publish on that channel gets a sequence number, starting at 1.

RabbitMQ replies asynchronously with `basic.ack` for accepted publishes, or `basic.nack` when it cannot take responsibility. The confirm contains a sequence number and a `multiple` flag. For example:

```text
Outstanding publish sequence numbers: {101, 102, 103, 104}

basic.ack(tag=102, multiple=true)
    -> publishes 101 and 102 are confirmed
    -> outstanding: {103, 104}

basic.ack(tag=104, multiple=false)
    -> only publish 104 is confirmed
    -> outstanding: {103}
```

The publisher must track outstanding messages by sequence number. Confirms can cover a batch and can arrive in a different order from the publishes. A connection recovery also creates new channels, so an old channel's sequence number is not a permanent message identity.

For throughput, keep a bounded window of publishes in flight and process confirms asynchronously. Publishing one message and waiting for its confirm before sending the next makes every message pay the network and persistence latency separately. An unlimited outstanding window has the opposite problem: a slow broker can make the publisher retain an unbounded number of messages.

### What must happen before a confirm?

For a routable message, RabbitMQ confirms after all destination queues have accepted it. The acceptance condition depends on queue type and message settings:

- For a **persistent message routed to a durable queue**, confirmation includes persisting the message to disk.
- For a **quorum queue**, a quorum of replicas must accept and confirm the message to the elected leader.
- For a transient message, do not infer disk durability from a confirm.

A durable queue preserves the queue's definition across a restart. Publishing a persistent message asks for the corresponding message durability. With classic queues, use both settings and wait for confirms when restart survival matters. A single classic queue is not replicated just because its node belongs to a cluster.

Quorum queues are replicated queues built on Raft. With three members, a majority is two. They can tolerate one member being unavailable while a majority remains available; losing the majority prevents progress. Replication protects against member failures within that model. It cannot protect against every replica losing its storage.

## The surprising case: a confirmed message reaches no queue

Suppose someone deletes the `reserve` binding. The publisher still sends to the existing `orders` exchange, but the routing key matches no queue.

RabbitMQ can **positively confirm an unroutable message**. It has completed the routing decision, even though no queue accepted a copy.

If the publisher must detect this, publish with `mandatory=true` and handle `basic.return`. For an unroutable mandatory message, RabbitMQ sends the return before the publisher confirm. The publisher's completion logic must preserve the fact that the message was returned; a later positive confirm must not turn that attempt into a successful enqueue.

```text
Publisher                        RabbitMQ
    |                                |
    | publish(mandatory=true)        |
    |------------------------------->|
    |                                | no matching queue
    | basic.return(message)          |
    |<-------------------------------|
    | basic.ack(publish sequence)     |
    |<-------------------------------|
```

Track returns as well as confirms, using the client's supported correlation mechanism and a stable application message ID. `mandatory` detects that a message reached **no** queue; it does not prove that every queue your business expected was bound correctly.

## A lost confirm creates an uncertain outcome

Consider a connection failure after RabbitMQ persists a message but before the confirm reaches the publisher:

```text
Publisher                        RabbitMQ
    | publish event E                |
    |------------------------------->|
    |                                | persist E
    |          connection breaks     |
    |<------ X confirm               |
```

The publisher cannot distinguish this from a failure before RabbitMQ accepted the message. A timeout means the outcome is unknown. It does not prove rejection.

The usual reliability strategy is to reconnect and republish unconfirmed messages. That preserves the chance to deliver the work, but it can produce duplicates. Keep the same application event ID across attempts. RabbitMQ does not automatically deduplicate ordinary queue messages just because they share a `message_id` property.

If retries must survive a publisher process crash, its pending events also need durable storage. When the business write is in a database, a [transactional outbox](/posts/design-how-transactional-outbox-works) can commit the order and the pending event together. Publisher confirms then tell the outbox relay when RabbitMQ has accepted an attempt.

## Consumer acknowledgements transfer responsibility to the worker

In **automatic acknowledgement** mode, RabbitMQ considers a delivery successful when it sends it. A worker crash immediately afterward can lose the work from the application's perspective.

For inventory reservations, use manual acknowledgements:

```text
receive delivery
begin database transaction
record event ID and apply inventory change
commit database transaction
send basic.ack for this delivery
```

If the channel or connection closes before RabbitMQ receives the acknowledgement, the unacknowledged delivery is automatically requeued once the broker detects the failure. A replacement worker can process it.

Consumer delivery tags are scoped to the receiving channel. Acknowledge on that same channel. A tag is a handle for one delivery, not an event ID that remains valid across reconnects or redeliveries.

Consumer acknowledgements also have a `multiple` flag. With parallel processing, use it carefully: acknowledging tag 50 with `multiple=true` also acknowledges outstanding tags below 50, even if their tasks have not finished. A simple starting point is to acknowledge each completed delivery individually with `multiple=false`.

## Why committing before the ack still permits duplicates

There is another unavoidable gap:

```text
Worker                           Database              RabbitMQ
   |                                 |                     |
   | reserve inventory + commit      |                     |
   |-------------------------------->|                     |
   | committed                       |                     |
   |<--------------------------------|                     |
   |                                                       |
   X crash before ack                                      |
                                                           |
                           delivery becomes eligible again |
```

Acknowledging before the commit risks losing a reservation. Acknowledging after the commit risks repeating it. RabbitMQ and an independent database do not share an atomic transaction through an ordinary `basic.ack`.

Make the database operation **idempotent**: processing the same event again should preserve the intended result. One approach uses a unique key on `(consumer_name, event_id)` in a processed-events table. Inside one database transaction:

1. Attempt to insert the event ID.
2. If this transaction inserted it, apply the inventory change.
3. If the ID already exists, skip the change.
4. Commit, then acknowledge the delivery.

The insert and business change must commit together. Recording the event ID in one transaction and changing inventory in another simply creates a new crash gap.

For an external payment API, this database pattern cannot make the remote charge atomic. Pass an idempotency key supported by the payment service and design recovery around that service's guarantees.

RabbitMQ's `redelivered` flag is useful context, but it is not a substitute for the event ID. A publisher retry can create a second queue message whose first delivery has `redelivered=false`.

## Prefetch bounds unfinished work

With manual acknowledgements, the broker needs a limit on deliveries waiting for completion. **Prefetch** sets that limit.

For example, a consumer configured with a prefetch count of 20 can have up to 20 unacknowledged deliveries. Once it reaches the limit, RabbitMQ waits for acknowledgements before sending more.

```text
Queue: [waiting messages ...]
                  |
                  | prefetch = 20
                  v
Worker: [processing + locally buffered deliveries <= 20]
```

RabbitMQ normally applies a non-global prefetch count separately to each new consumer on the channel. Ten consumers with prefetch 20 can therefore hold about 200 unacknowledged deliveries in total. This setting does not apply to polling through `basic.get`.

Prefetch is a count of messages, not bytes or active threads. Twenty very large messages can still consume substantial memory, and one consumer callback can still process them sequentially. A small value can leave workers idle during delivery round trips; a large value can hoard work on slow consumers and increase recovery time after a crash. Start with a bounded value that matches the worker's actual processing capacity, then measure throughput, memory, and acknowledgement latency.

## Rejections need a recovery policy

A consumer can use `basic.reject` or `basic.nack` when processing fails:

| Choice          | Broker behavior                                     | Suitable situation                                        |
| --------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `requeue=true`  | Return the delivery to the queue.                   | A retry could succeed, subject to a bounded retry policy. |
| `requeue=false` | Dead-letter it if configured; otherwise discard it. | Invalid work or a failure that needs separate handling.   |

Immediate requeue is not a backoff mechanism. If every worker rejects an event because the inventory database is unavailable, the queue can repeatedly deliver the same event and consume CPU without making progress. Use a retry design with delay, a bounded attempt count, and a terminal destination for investigation.

Queue policies matter too. Expiration, maximum-length policies, and delivery limits can remove or dead-letter messages even though an earlier publish was confirmed. For quorum queues in RabbitMQ 4.1, account for the default delivery limit of 20; do not assume redelivery continues forever. Dead-letter transfer reliability also depends on the queue type and dead-letter configuration.

## Put the handoffs together

For the inventory workflow, the useful checks are concrete: the publisher retains an event until it has a suitable confirm and no routing return; the broker uses the required queue durability and replication; the worker commits an idempotent reservation before acknowledging; and prefetch plus retry policies keep failures from turning into unbounded work.

These mechanisms give each participant a clear point at which it can release responsibility. Duplicates remain part of the recovery protocol, so the business operation must be prepared to see the same event again.

## References

1. RabbitMQ 4.1: [Consumer Acknowledgements and Publisher Confirms](https://www.rabbitmq.com/docs/4.1/confirms).
2. RabbitMQ 4.1: [Reliability Guide](https://www.rabbitmq.com/docs/4.1/reliability).
3. RabbitMQ 4.1: [Quorum Queues](https://www.rabbitmq.com/docs/4.1/quorum-queues), including replication, poison-message handling, and delivery limits.
4. RabbitMQ 4.1: [Consumer Prefetch](https://www.rabbitmq.com/docs/4.1/consumer-prefetch).
