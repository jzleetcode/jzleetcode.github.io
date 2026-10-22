---
author: JZ
pubDatetime: 2026-10-22T18:30:00Z
modDatetime: 2026-10-22T18:30:00Z
title: System Design - How Idempotency Keys Make Retries Safe
tags:
  - design-system
  - design-distributed
  - design-database
description: "Follow a payment request whose response is lost: how a stable request key, atomic result recording, and careful retry boundaries prevent a second charge."
---

## Table of contents

## The receipt that never arrived

You tap **Pay** for a $25 order. The server records the payment, but its response disappears when your phone loses its connection. Your app sees a timeout. Was the payment made? Sending the same `POST /payments` again might create another one; giving up might leave you with an order you think is unpaid.

HTTP distinguishes **idempotent methods** (repeating them has the same intended effect as doing them once) from methods such as `POST`, which have no such general guarantee. The [HTTP semantics specification](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) explains why an automatic retry is safe for the former but not generally for the latter. A payment API can give _one particular POST operation_ retry semantics by asking the caller to provide a stable **idempotency key**.

```text
Phone                          Payment API                 Database
  | POST /payments               |                           |
  | key: checkout-7d92 -------->|                           |
  |                              |-- save payment + result -->|
  |       response is lost       |<--------- commit ----------|
  X<-----------------------------|                           |
  |                              |                           |
  | POST /payments               |                           |
  | key: checkout-7d92 -------->|-- look up same key ------->|
  |<-- recorded outcome ---------|<-- existing result --------|
```

The key is not a magic HTTP header. It is an agreement between the client and the service: **"These attempts are the same operation."** The client generates a sufficiently unpredictable identifier for one checkout, keeps it across timeouts and retries, and uses a new identifier for a _new_ checkout. Amazon's [guidance on idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) calls this a client request identifier: the service must not guess whether two superficially identical requests express the same intent.

## What must the server remember?

Imagine the service keeps a record keyed by `(merchant_id, idempotency_key)`:

```text
Identity:      shop-4 / checkout-7d92
Fingerprint:   amount=25, currency=USD
Outcome:       payment_id=pay-81, status=201
```

The fingerprint represents the operation's _meaningful_ inputs: merchant, amount, currency, and any other values that distinguish one payment from another. A matching key with different inputs should be rejected, not silently replay the outcome of a different charge. The fingerprint need not be a hash if the stored inputs can be compared directly; canonicalization matters if you do hash them.

For the case where the payment and key record live in the **same transactional database**, the service can make a strong local guarantee:

1. Claim the scoped key with a uniqueness constraint. If another request is using it, wait for that transaction's decision or return a documented in-progress response.
2. Compare the incoming inputs with the saved inputs. A finished match returns its recorded outcome; a mismatch is an error.
3. On a new key, create the payment **and record the result in the same database transaction**. Commit both, or neither.

The uniqueness constraint, not a `SELECT`-then-`INSERT` check, closes the race between two workers. If the worker crashes before committing, neither its payment nor its finished key is visible and a retry may safely try again. If it commits but loses the HTTP response, a retry finds the finished record. This is the useful boundary of the guarantee: **one durable payment per key in that database**, provided every payment path uses the same constraint. A process-local cache cannot provide it across restarts or across server instances.

```text
                request with (merchant, key, inputs)
                               |
                               v
                  unique key claim / lookup
                     /         |           \
            new key       same inputs     different inputs
               |              |                 |
       payment + outcome   return saved      reject mismatch
       in one transaction   outcome
               |
       commit or roll back
```

**Concurrent duplicates** are a separate case from a replay after completion. A second worker may arrive while the first is still executing. It must not start a second payment. It can wait, or reply that the operation is still in progress and tell the client how to retry or retrieve the result. The [IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header) describes these situations, but an API's _actual_ conflict status and retention rules are its own contract.

## Follow the failure windows

| State of the first attempt                          | What a retry with the same key should do                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Before the transaction commits                      | Execute the operation, since the earlier attempt left no committed effect. |
| After commit, before the response reaches the phone | Return the saved outcome; do not create another payment.                   |
| While the first attempt is still running            | Wait or report an in-progress conflict; do not execute independently.      |
| New attempt has a changed amount or currency        | Reject the mismatch; do not reuse an earlier payment's result.             |

Notice why merely "remembering keys after success" is insufficient: a worker can commit the payment and crash _before_ it writes that separate key record. The database transaction must encompass both records, or the business payment row itself must carry a unique request identifier that the retry can query.

There is an important limit. If the service calls an **external** payment processor, a local database transaction cannot roll back a charge at the processor. A crash after the charge but before saving the local result is ambiguous again. Pass the same stable key to a processor that supports idempotent requests, and reconcile the processor's outcome before deciding to make a fresh charge. A transactional outbox can ensure a payment command is retried, but its consumer still needs this stable identity; an [outbox alone does not deduplicate a remote effect](/posts/design-how-transactional-outbox-works/).

## A real API's contract can surprise you

Stripe's [idempotent requests documentation](https://docs.stripe.com/api/idempotent_requests) illustrates why callers must read the provider's rules, not assume that all implementations behave alike:

- Stripe saves the _status code and body_ of the first request once endpoint execution begins, including a `500` response. Retrying the same key can therefore replay a failure; a retry does not necessarily mean "try the work again."
- Stripe compares subsequent parameters with those of the original request. Validation failures and requests that conflict with an executing request do **not** get a saved result, since execution has not begun.
- Keys can be removed after they are at least 24 hours old. Reusing a removed key starts a **new** request, so keep your own business identity and retention policy if you need protection beyond a provider's window.

These are _Stripe-specific behaviors_, not universal properties of the HTTP header. A service you design must document its key scope, payload comparison, concurrent-duplicate behavior, error replay, and expiry. Treat a timed-out request as **unknown**, not failed: ask for its result using the same identity before offering a new payment attempt.

## The small mental model

An idempotency key gives retries a name. A unique claim makes two workers agree on who owns that name. An atomic write ties the name to the business effect. And when the effect crosses another service boundary, the **same identity must cross that boundary too**. None of these mechanisms prevents a customer from intentionally making a second payment with a different key; that is a separate business rule.

## References

- [RFC 9110, section 9.2.2: Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) — what HTTP itself does and does not promise.
- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — a concrete provider's replay, mismatch, and expiry semantics.
- [AWS Builders' Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) — request identity versus apparently identical intent.
- [IETF HTTPAPI: Idempotency-Key HTTP Header (draft)](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header) — terminology for replay, fingerprint mismatch, and concurrent requests; check draft status before treating it as a standard.
