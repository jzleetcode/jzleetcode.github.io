---
author: JZ
pubDatetime: 2026-10-20T18:34:14Z
modDatetime: 2026-10-20T18:34:14Z
title: System Design - How Sagas Coordinate Distributed Transactions
tags:
  - design-system
  - design-database
  - design-distributed
description: "Follow an order through inventory reservation, payment, and compensation to understand what a saga guarantees, what it cannot undo, and how to make retries safe."
---

## Table of contents

## An order that crosses three databases

A customer presses **Place order**. Our order service records the order, the inventory service reserves a laptop, and the payment service charges a card. These are three separate databases. What happens if the charge fails after the laptop has already been reserved?

One database transaction cannot roll back work committed in the other two. Keeping a transaction open while calling remote services would also make checkout fragile. A **saga** instead treats checkout as a sequence of short, local transactions, with a business action to compensate for each completed step if the overall operation cannot finish. The original [Sagas paper by García-Molina and Salem](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf) introduced this idea for long-lived transactions; the familiar cross-service workflow is a modern application of it.

```text
Customer       Orders DB        Inventory DB        Payments DB
   |               |                  |                  |
   | place order   |                  |                  |
   +-------------->| save PENDING     |                  |
   |               +----------------->| reserve laptop   |
   |               |                  +----------------->| charge card
   |               |                  |                  |
   |               |<-----------------+<-----------------+ success?
   |               | save CONFIRMED   |                  |
```

The arrows describe **business steps**, not one distributed database transaction. Each step commits independently, so other requests can observe intermediate state.

## Give each step an escape route

For our example, name the forward steps and their compensations:

| Forward transaction | Successful effect              | Compensation if checkout fails later     |
| ------------------- | ------------------------------ | ---------------------------------------- |
| Create order        | Persist `PENDING` order        | Mark order `REJECTED`                    |
| Reserve inventory   | Hold one laptop for this order | Release **this order's** reservation     |
| Charge payment      | Record a successful charge     | Issue a refund, if business rules permit |

Suppose payment declines before any charge occurs. Inventory has already committed its reservation, so the coordinator requests `release(order_id)` and then marks the order rejected. It does not run `ROLLBACK` across both databases: those commits are over. If a later step fails _after_ a real charge, the policy must decide whether to retry that step or issue a refund and release the reservation. A refund is a **new transaction**, not time travel: the customer may see a charge and a refund, and the refund itself may fail temporarily.

The compensation must target what this saga changed. Releasing an arbitrary laptop, or blindly adding one unit to stock without identifying the reservation, could undo another customer's order. Microsoft's [Saga pattern guidance](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga) calls out both compensable steps and the limits of isolation between them.

## Who decides which step is next?

There are two common ways to coordinate the same business flow:

```text
Orchestration (one coordinator owns the workflow)

                    +--------------------+
                    | Checkout workflow  |
                    | state: CHARGING     |
                    +----+----------+----+
                         |          |
                  reserve|          |charge
                         v          v
                     Inventory    Payments

Choreography (services react to events)

Orders --OrderCreated--> Inventory --StockReserved--> Payments
   ^                         |
   +--ReservationFailed------+
```

With **orchestration**, a durable workflow records which step is in progress, issues a command to a service, and chooses the next command or compensation after the result. The central state machine makes recovery and operator inspection easier, but the orchestrator is another component to build and operate.

With **choreography**, each service commits its local step and publishes an event; another service reacts. It avoids a central coordinator but makes the complete flow and failure paths harder to see as the number of steps grows. Neither model eliminates the need for durable messages, retries, or compensations. Chris Richardson's [Saga pattern description](https://microservices.io/patterns/data/saga.html) illustrates both approaches.

## The crash between a commit and a reply

Imagine payment charges the card, then its reply times out. The checkout workflow cannot tell whether it should charge again or proceed. If it blindly retries with a new identity, the customer might be charged twice.

Give the saga a stable `saga_id` and each command a stable step identity, such as `(saga_id, "charge")`. The payment service must record the result against that idempotency key and return the **same outcome** for a duplicate command. The workflow persists its state before it sends work and records the result when it arrives. On restart, it can retry an unfinished command or ask the payment service for the outcome using that same identity.

```text
persist CHARGING -> send charge(saga_id) -> payment commits
                                           |
                                           +-- reply lost

restart -> resend charge(saga_id) -> return recorded result, no second charge
```

There is another gap: a service might commit its database change but crash before publishing the event that advances the saga. A [transactional outbox](/posts/design-how-transactional-outbox-works/) can record the business change and its outgoing event in the **same local transaction**; the relay publishes later, possibly more than once. Idempotent consumers still matter. The outbox solves reliable event publication at a single service boundary; the saga coordinates the larger business process. They solve different problems.

Retries need a policy: use backoff for transient failures, distinguish a definite business rejection from an unknown result, and surface an operation that cannot be compensated for human intervention. Store enough state to answer, “Which steps actually committed?” before starting the reverse path.

## Consistency is a business rule, not a magic rollback

During the saga, another customer might see inventory reserved while the order is still `PENDING`. Treat `PENDING` as a real state: do not ship from it or promise a final charge until the workflow reaches `CONFIRMED`. Time-limited reservations and application-level guards can keep partially completed checkouts from blocking stock forever. There is **no automatic isolation** across these local transactions.

This is the key difference from [two-phase commit](/posts/design-how-two-phase-commit-works/). Two-phase commit coordinates an atomic commit decision across participating resource managers, at the cost of coordination and potentially long-held resources. A saga lets individual steps commit and uses business-specific compensations if the larger operation fails. When a step cannot meaningfully be reversed, a saga may be the wrong fit, or the workflow needs a deliberate point of no return followed by retryable completion steps.

The practical test is not “Can we draw the happy path?” It is “For every committed step, can we identify its result after a crash, retry without duplicating it, and either finish or make the partial effect right?”

## References

- [Héctor García-Molina and Kenneth Salem, “Sagas”](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf) — original long-lived-transaction model and compensations.
- [Microsoft Azure Architecture Center: Saga pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga) — compensations, orchestration/choreography, and isolation concerns.
- [Chris Richardson: Saga pattern](https://microservices.io/patterns/data/saga.html) — cross-service local transactions and coordination styles.
- [Transactional outbox walkthrough](/posts/design-how-transactional-outbox-works/) — how a local database change and an outgoing event can be recorded together.
