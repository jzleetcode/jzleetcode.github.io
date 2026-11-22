---
author: JZ
pubDatetime: 2026-11-22T19:31:00Z
modDatetime: 2026-11-22T19:33:51Z
title: System Design - How Webhooks Deliver Events Reliably
tags:
  - design-system
  - design-api
description:
  "Follow an order event from a producer to a webhook receiver, then learn how durable queues, signatures, acknowledgments, retries, deduplication, and replay make delivery dependable."
---

## Table of contents

## A completed order needs to tell another service

Imagine a store that has just charged a customer's card. A fulfillment company needs to hear about the paid order so it can ship the package.

The store could ask the fulfillment company for updates every few seconds. That is **polling**: the receiver keeps asking, "Is there anything new?" Polling works, but it adds requests even when nothing has changed, and the receiver only learns about an order on its next poll.

A **webhook** reverses the direction. The store sends an HTTP request to a URL that the fulfillment company registered. The request says that something happened, such as `order.paid`. The fulfillment company can react soon after the event is created.

```text
Polling:
  Fulfillment company  --->  Store: "Anything new?"
  Fulfillment company  --->  Store: "Anything new?"
  Fulfillment company  --->  Store: "Anything new?"

Webhook:
  Store  --->  Fulfillment company: "Order 42 was paid"
```

The HTTP `POST` is the easy part. The hard part is making sure a temporary network failure does not make the event disappear.

## A webhook is a delivery pipeline

For an important event, the producer first needs a durable copy of what it plans to send. A common design writes the business change and an outbox record in one database transaction. A worker reads that record and creates a delivery for each subscribed endpoint.

```text
 Store database/outbox       Delivery worker                  Receiver
        |                          |                              |
        | order + event            |                              |
        +------------------------->|                              |
                                   | POST /hook ------------------->|
                                   |                               | verify + save
                                   |<---------------------- 2xx ---|
                                   | mark delivery complete        |
                                   |                               |
                                   +-- timeout/error: retry later  |
```

The outbox is not required for every webhook system, but it closes an important gap. If the store commits the order and then crashes before putting a message on a queue, the fulfillment company would never hear about the order. Saving both the order and the event intention together gives a worker something durable to resume after a crash.

A delivery record usually needs enough information to retry one endpoint without recreating the business event:

- A stable event ID and event type, such as `evt_8f...` and `order.paid`.
- The destination URL and the event payload or a reference to it.
- An attempt count, next-attempt time, and current delivery status.
- The last response code or error, so an operator can see what happened.

If one event goes to three endpoints, keep three delivery states. One partner's outage should not hold the other two partners behind it.

## The receiver should acknowledge quickly

The receiver's endpoint should do only the work needed to accept the delivery safely. It can check the signature, write the event to its own durable queue, and return a success response. A separate worker can then call a slow shipping API or update another service.

```text
HTTP request
    |
    v
Verify signature and event type
    |
    v
Durably enqueue event ------> return 2xx
    |
    v
Process order asynchronously
```

This keeps the sender from waiting while the receiver performs slow work. GitHub, for example, recommends responding with a `2xx` status within 10 seconds; a slower response is treated as a failed delivery. Other providers set their own deadlines, so an endpoint should respond much faster than the provider's limit.

The receiver should send `2xx` only after it has safely accepted the event. If it returns success and then loses the event before storing it, the sender believes delivery succeeded and may not try again. The success response is an acknowledgment of receipt, not proof that the order has completed every downstream action.

## Retries make delivery at least once

Suppose the receiver stores the event, but the network drops its `200 OK` response. The sender cannot tell whether the receiver processed the request, so it retries. The same event may arrive twice.

This is why reliable webhook consumers should expect **duplicate deliveries**. Many providers retry after a timeout or a server error, and their retry schedules differ. A webhook design therefore usually aims for at-least-once delivery: keep retrying a recoverable failure until it succeeds or reaches an operator-visible terminal state.

The receiver can make its effect idempotent by remembering event IDs:

```sql
CREATE TABLE received_webhook_events (
    event_id   TEXT PRIMARY KEY,
    received_at TIMESTAMP NOT NULL
);
```

When the same event arrives again, the unique key shows that it was already accepted. The consumer can return success without applying the business action a second time. For an operation such as charging a card, the event ID or a separate business idempotency key should also protect the payment call itself.

There is no single HTTP retry schedule used by every provider. A sender commonly retries network errors, timeouts, and selected server errors with exponential backoff and jitter. Jitter spreads attempts out so many struggling receivers do not all get hit at once. The sender should keep the event available for manual replay after automated retries stop.

An operator needs to be able to answer three questions: which event failed, which endpoint failed, and can it be retried safely? A dead-letter state or delivery history is more useful than silently discarding the last failed attempt.

## Delivery order needs its own rule

The sender may deliver two events at the same time. If `order.paid` is delayed and `order.refunded` succeeds first, the receiver might see them in the opposite order from when the store created them. A retry can make this more likely.

If order matters, include an aggregate version or sequence number, such as `order_version: 17`, and have the receiver reject stale updates or wait for a missing version. The receiver can also fetch the current order from the store's API when it needs authoritative state. Timestamps can help with debugging, but they are not a substitute for a defined ordering rule.

## Signatures prove who sent the request

Anyone who discovers a public webhook URL could try to send a fake `order.paid` request. The sender should sign each request with a secret shared with the receiver. The receiver verifies the signature over the original request body before trusting its contents.

For example, a provider might send a signature header computed from a timestamp and the raw body:

```text
signature = HMAC_SHA256(endpoint_secret, timestamp + "." + raw_body)
```

The exact header and signed bytes are provider-specific. Stripe's documentation requires using the unmodified request body for verification; parsing and re-serializing JSON first changes the bytes and makes the signature check fail. Comparing signatures in constant time and rejecting timestamps that are too old helps reduce forgery and replay risks.

Use HTTPS, keep endpoint secrets out of source code, and plan how to rotate them. A receiver should also check the event type and action it subscribed to instead of treating every validly signed request as an instruction to perform work.

## What to monitor

The sender and receiver should both expose enough information to recover from problems:

- The age of the oldest event waiting to be delivered.
- Success rate, retry count, and response codes by endpoint.
- Events waiting for replay or past the automatic retry limit.
- Receiver queue depth and the age of its oldest unprocessed event.

Useful delivery settings include the request timeout, retry schedule, maximum attempts before manual intervention, and per-endpoint concurrency. Raising concurrency can improve throughput, but it can also overload a receiver that is already unhealthy. Rate limits and retry backoff should be part of the endpoint's configuration.

The central idea is simple: a webhook is not just a `POST`. It is a durable event, an authenticated request, a quick acknowledgment, and a delivery process designed for retries and duplicates.

## References

1. Red Hat, [What is a webhook?](https://www.redhat.com/en/topics/automation/what-is-a-webhook).
2. GitHub Docs, [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks).
3. Stripe Docs, [Webhooks](https://docs.stripe.com/webhooks).
4. Stripe Docs, [Handle duplicate events](https://docs.stripe.com/webhooks#handle-duplicate-events).
5. [How the transactional outbox works](/posts/design-how-transactional-outbox-works/), for the producer-side database-to-queue handoff.
