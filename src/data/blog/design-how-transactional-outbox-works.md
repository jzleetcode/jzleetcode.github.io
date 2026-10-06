---
author: JZ
pubDatetime: 2026-10-06T18:35:00Z
modDatetime: 2026-10-06T18:35:00Z
title: System Design - How the Transactional Outbox Works
tags:
  - design-system
  - design-database
  - design-distributed
description: "Why saving a database row and publishing an event can fail, and how a transactional outbox connects PostgreSQL, Debezium, Kafka, and an idempotent consumer without pretending delivery happens exactly once."
---

This explanation is for engineers new to distributed systems who want to understand how a service can reliably announce a database change. We will follow one order through a PostgreSQL transaction, an event relay, and a consumer, then examine the failures each boundary still permits.

## Table of contents

## One order, two places to write

Imagine building a shopping service. When a customer places order 42, the order service must save it in a database and tell the fulfillment service to prepare a shipment.

A first implementation might do this:

```text
Order service
    |
    +-- INSERT order 42 into PostgreSQL
    |
    +-- publish OrderCreated to Kafka
```

The happy path is simple. The crash path is not.

If the database commit succeeds but the process crashes before publication, the order exists and fulfillment never hears about it. If we publish first, the database transaction might fail afterward. Fulfillment then receives an event for an order that does not exist.

Putting both calls inside a function does not make them atomic. PostgreSQL controls its transaction; Kafka controls its own writes. Neither automatically rolls back the other's work.

The **transactional outbox** changes where we draw the atomic boundary: save the business change and the intention to publish in the **same database transaction**. Publish that intention afterward. Debezium's [outbox architecture](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html) separates these responsibilities into the application, its outbox table, and a relay.

## Move the promise into the database

An outbox is an ordinary table beside the business tables. One row represents one event, not one mutable summary of an order.

Here is a small PostgreSQL example using the column names expected by Debezium's default outbox mapping:

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    status TEXT NOT NULL
);

CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    aggregatetype VARCHAR(255) NOT NULL,
    aggregateid VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL
);

BEGIN;

INSERT INTO orders (id, status)
VALUES (42, 'created');

INSERT INTO outbox (id, aggregatetype, aggregateid, type, payload)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'Order',
    '42',
    'OrderCreated',
    '{"order_id": 42, "schema_version": 1}'::jsonb
);

COMMIT;
```

The fixed UUID makes the example reproducible. A real producer allocates a unique event ID and preserves that identity when the same event is retried.

PostgreSQL's [transaction guarantee](https://www.postgresql.org/docs/17/tutorial-transactions.html) now covers both inserts: they become visible together, or neither becomes visible. A failed outbox insert must abort the business transaction, not be caught and ignored while the order commits.

The promise is deliberately limited: a committed order has a committed event record. It does **not** promise that Kafka has already received the event or that fulfillment has already acted on it.

```text
                     one PostgreSQL transaction
                  +------------------------------+
Client ---------->| orders: order 42              |
                  | outbox: event for order 42    |
                  +---------------+--------------+
                                  |
                         committed change log
                                  v
                         Debezium connector
                                  |
                         Outbox Event Router
                                  v
                      Kafka: outbox.event.Order
                                  |
                                  v
                      Fulfillment consumer
```

This separation also changes availability. An order can commit while Kafka is temporarily unavailable, provided the database can retain the pending changes and the relay eventually recovers. A permanent relay failure still means permanent delivery failure; an outbox is not a substitute for operating the relay.

## How the relay discovers the event

There are two common relay designs.

### Poll the outbox table

A polling worker reads unpublished rows, sends them to the broker, and marks or removes them after a successful acknowledgment. Multiple workers need a claim protocol so they do not all select the same pending batch.

PostgreSQL's [`SKIP LOCKED`](https://www.postgresql.org/docs/17/sql-select.html) can help workers divide queue-like work: a worker skips rows already locked by another worker. It is not appropriate when a query needs a complete, consistent view of all rows.

The claim is not the delivery guarantee. A worker can hold a row lock, publish the event, and crash before committing the database update that records publication. Another worker can then publish the event again. If a design commits a claim before sending, it also needs a lease or another recovery mechanism for abandoned claims.

Polling is often a reasonable first implementation. Its cost is additional table queries and application-owned scheduling, claiming, and cleanup logic.

### Read the database change log

**Change data capture**, or CDC, reads database changes instead of repeatedly asking which outbox rows are new. PostgreSQL exposes changes through [logical decoding](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html), and a Debezium PostgreSQL connector translates them into change events.

The connector and the event router have different jobs:

- The **connector** follows the database log and represents an inserted outbox row as a change record.
- The **Outbox Event Router** reshapes that record into an application event and chooses its Kafka destination.
- The **consumer** interprets the event and changes its own state.

The router does not make the original transaction atomic. That already happened inside PostgreSQL.

With Debezium's documented default mapping, `aggregatetype = 'Order'` routes to `outbox.event.Order`; `aggregateid = '42'` becomes the Kafka record key; `id` becomes the event-identity header; and `payload` supplies the event body. The `type` column is not automatically an event-type header: an additional-field mapping can place it there.

Treat this mapping as a connector contract, not as magic embedded in SQL. Scope the transformation to the intended outbox records; heartbeat, schema, and unrelated table messages are not business outbox events. The [Event Router reference](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html) describes both field mappings and selective application.

For this CDC design, outbox event rows are immutable after insertion. The router expects inserts and filters out deletes. A polling design's mutable `published` flag is a different relay protocol; do not casually combine the two.

## Replay is part of the design

Consider a relay recovering from a crash:

```text
Database             Relay                    Kafka
   |                   |                        |
   | committed event   |                        |
   |------------------>|                        |
   |                   | publish event          |
   |                   |----------------------->|
   |                   | acknowledgment         |
   |                   |<-----------------------|
   |                   X crash before durable progress
   |                   |                        |
   | event replayed    | restart                |
   |------------------>| publish same event     |
   |                   |----------------------->|
```

Whether this specific boundary can replay depends on the connector's offset and transaction configuration. PostgreSQL itself warns that a logical slot can resend recent changes after a crash because its position is persisted at checkpoints. Consumers therefore need a defined duplicate policy rather than assuming every deployment has end-to-end exactly-once delivery.

An **idempotent consumer** produces the same intended database effect when it sees the same event again. The event ID identifies the event; the aggregate ID identifies the order. They are different because one order can produce many events.

One implementation records the event ID in the same transaction as its effect:

```sql
CREATE TABLE consumed_events (
    consumer_name TEXT NOT NULL,
    event_id UUID NOT NULL,
    PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE fulfillment_requests (
    order_id BIGINT PRIMARY KEY
);

BEGIN;

WITH accepted AS (
    INSERT INTO consumed_events (consumer_name, event_id)
    VALUES (
        'fulfillment',
        '11111111-1111-4111-8111-111111111111'
    )
    ON CONFLICT DO NOTHING
    RETURNING event_id
)
INSERT INTO fulfillment_requests (order_id)
SELECT 42 FROM accepted;

COMMIT;
```

For a new event, `accepted` returns one row and the shipment request is inserted. For a duplicate, it returns no rows, so the effect is skipped. PostgreSQL documents this behavior in [`INSERT ... ON CONFLICT` and `RETURNING`](https://www.postgresql.org/docs/17/sql-insert.html).

If inserting the fulfillment request fails, the transaction rolls back the deduplication row too. A later retry is still allowed. Recording the event ID in a separate, earlier transaction would create a dangerous gap: a crash could leave an event marked consumed without its effect.

Acknowledge the message or commit the consumer offset **after** the database transaction succeeds. Crashing between database commit and acknowledgment then causes a harmless replay for this handler.

This protects an effect inside that database. It does not atomically protect an email, payment API, or other external call. Such an effect needs its own idempotency key or another durable handoff. A producer-side outbox also does not deduplicate repeated client requests automatically; request identity belongs in the business transaction as well.

## Ordering has a smaller scope than it sounds

Using the order ID as the Kafka key keeps an order's events on the same partition while the partitioning arrangement stays fixed. Kafka orders records within a partition, not across the whole topic. Keeping the same key is useful, but does not fix upstream reordering by concurrent publishers.

For example, `OrderCreated` and `OrderCancelled` must have a sensible order before the relay publishes them. A polling relay with several workers must preserve the required per-order publication order, not just claim arbitrary pending rows. When business state changes can race, the producer also needs a concurrency rule, and an aggregate version can help the consumer detect stale or missing updates.

Kafka's [delivery-semantics discussion](https://kafka.apache.org/41/design/design/#message-delivery-semantics) distinguishes guarantees inside Kafka from coordination with an external system. An idempotent Kafka producer is helpful, but it does not deduplicate every business event replayed by a restarted application or make a separate database transaction part of Kafka's transaction.

## The backlog is now an operational responsibility

The outbox removes one correctness gap by introducing durable backlog. Monitor that backlog, not just whether the application is healthy:

- **Delivery delay:** how old is the oldest event not yet delivered?
- **Relay health:** is the connector advancing, and is the consumer catching up?
- **Retained storage:** are outbox rows or database log files accumulating?
- **Recovery behavior:** what happens after a relay outage longer than the retention budget?

A polling relay usually retains pending table rows until delivery is recorded. A CDC relay tracks progress through its log position, so an outbox table's row count alone does not say how much is undelivered.

PostgreSQL [replication slots](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html#LOGICALDECODING-REPLICATION-SLOTS) can retain WAL needed by a lagging consumer. A stalled slot can consume storage; a retention cap can instead make an old position unavailable. Configure retention and recovery together, and plan outbox-table cleanup separately from connector progress.

CDC also has a startup and snapshot phase. Cleanup must leave enough durable history for the recovery and bootstrap strategy you actually use. Deleting table rows is not itself proof that the relay delivered their events.

## The mental model to keep

The outbox does not turn two independent systems into one transaction. It turns a fragile dual write into **one atomic database write followed by a recoverable delivery process**.

Think about three separate responsibilities:

1. The producer commits the business change and event together.
2. The relay eventually publishes committed events, with a defined replay policy.
3. The consumer applies its effect safely even when delivery repeats.

Once those boundaries are explicit, crashes stop being surprising exceptions and become cases the design already knows how to handle.

## References

1. PostgreSQL 17: [Transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html).
2. Debezium: [Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html).
3. PostgreSQL 17: [Logical decoding and replication slots](https://www.postgresql.org/docs/17/logicaldecoding-explanation.html).
4. PostgreSQL 17: [`SELECT` locking and `SKIP LOCKED`](https://www.postgresql.org/docs/17/sql-select.html).
5. PostgreSQL 17: [`INSERT`, `ON CONFLICT`, and `RETURNING`](https://www.postgresql.org/docs/17/sql-insert.html).
6. Apache Kafka 4.1: [Message delivery semantics](https://kafka.apache.org/41/design/design/#message-delivery-semantics).
