---
author: JZ
pubDatetime: 2026-11-11T19:35:36Z
modDatetime: 2026-11-11T19:39:53Z
title: System Design - How Temporal Durable Execution Works
tags:
  - design-system
  - design-temporal
description: "Follow a long-running Temporal workflow through event history, worker replay, activities, retries, and durable timers."
---

## Table of contents

- [A purchase is more than one request](#a-purchase-is-more-than-one-request)
- [Workers run your workflow code](#workers-run-your-workflow-code)
- [Event history makes replay possible](#event-history-makes-replay-possible)
- [Activities are where side effects happen](#activities-are-where-side-effects-happen)
- [A timer is a saved wait](#a-timer-is-a-saved-wait)
- [A few rules keep workflows recoverable](#a-few-rules-keep-workflows-recoverable)
- [References](#references)

## A purchase is more than one request

Imagine an online store checking inventory, waiting for a fraud review, charging a card, and sending a receipt. Those steps cross several services and may take minutes or days. A normal web request cannot keep one process alive for that whole time. If the process crashes after reserving inventory, the application needs some other place to remember what happened and what should happen next.

Temporal lets an application describe this process as a **Workflow Execution**. The workflow code says which step follows which. The Temporal Service stores the execution's history and makes sure work is scheduled again after a worker or machine fails. Your application still owns the business logic; Temporal supplies the durable orchestration around it.

The important boundary is that the Temporal Service does not run your application code. **Workers** run the code, while the service records events and hands work to workers through task queues.

~~~text
                 start workflow / send signal
  Application ------------------------------------+
                                                  v
                                         +------------------+
                                         | Temporal Service |
                                         | history + queues |
                                         +---+----------+---+
                                             |          ^
                                  tasks      |          | results
                                             v          |
                                      +------+----------+------+
                                      | Worker process         |
                                      | workflow + activities  |
                                      +----------+-------------+
                                                 |
                                      calls external systems
                                                 v
                                      payment, inventory, email
~~~

## Workers run your workflow code

A client starts a Workflow Execution with an input such as an order ID. The service records that start event and places a Workflow Task on a task queue. A worker polling that queue picks up the task and runs the workflow function.

When the workflow reaches work that belongs outside deterministic workflow code, it asks Temporal to schedule an **Activity**. An Activity is an ordinary function for a specific action, such as reserving inventory or calling a payment provider. A worker polls for the Activity Task, performs the action, and reports a result or failure to the service.

Here is the shape of one checkout:

~~~text
Client        Temporal Service       Workflow Worker       Activity Worker
  |                   |                     |                     |
  | Start(order 42)   |                     |                     |
  |------------------>|                     |                     |
  |                   | record start event  |                     |
  |                   | enqueue task        |                     |
  |                   |-------------------->| run checkout        |
  |                   |                     | schedule reserve    |
  |                   |<--------------------|                     |
  |                   | enqueue activity    |                     |
  |                   |------------------------------------------->|
  |                   |                     |   reserve inventory |
  |                   |<-------------------------------------------|
  |                   | record result       |                     |
  |                   | enqueue task        |                     |
  |                   |-------------------->| continue checkout   |
  |                   |                     | schedule payment    |
  |                   |                     | ...                 |
~~~

The task queue is a durable handoff point. If no worker is available, work waits there. If a worker disappears while handling a task, Temporal can make the task available again after its timeout. Workflow workers and Activity workers can run in separate processes and scale independently.

## Event history makes replay possible

Temporal does not save a snapshot of every local variable in the workflow function. Instead, it records an **Event History**: the workflow start, the commands it requested, and the outcomes the service observed. When a worker needs to resume an execution without its in-memory state, it runs the workflow code again from the beginning and compares the commands it produces with the recorded history.

This is called **replay**. For example, if history says that the inventory Activity completed with a reservation ID, replay supplies that recorded result to the workflow. The workflow rebuilds its local state and continues to the next step. It does not reserve the same inventory again merely because the workflow code was replayed.

~~~text
Recorded history                         Workflow code during replay
----------------                         ---------------------------
Workflow started                         run checkout(orderID)
Reserve Activity scheduled       <----   request reserve Activity
Reserve Activity completed              receive recorded reservation ID
Payment Activity scheduled      <----   request payment Activity
~~~

The correspondence matters: replayed workflow code must make the same decisions, in the same order, for events that already exist. Use the SDK's workflow-safe time, timer, and random APIs instead of reading wall-clock time or calling external services directly from workflow code. A code change that alters old decisions needs the SDK's versioning or patching mechanisms so existing histories can still replay.

## Activities are where side effects happen

An Activity is the right place to call a database, payment provider, email service, or another API. Temporal tracks the Activity's schedule, attempt, and result, and can retry an Activity after a timeout or failure.

Retries create an important edge case. A payment service might charge the card successfully, but the Activity worker could crash before reporting success to Temporal. The service cannot know whether the charge happened, so it may schedule another attempt. Make the external operation **idempotent**: pass a stable key such as the order ID to the payment provider, and have the provider return the same result for a repeated request.

Long-running Activities can send heartbeats. If an Activity later fails and retries, the worker can use the last heartbeat details to continue from a checkpoint instead of repeating all of its work. Break large jobs into clear Activities so each operation has an appropriate timeout, retry policy, and recovery point.

## A timer is a saved wait

Suppose a checkout needs to wait until a customer confirms an order. A regular program might keep a thread asleep or write its own scheduled-job record. A Temporal workflow can request a timer and yield. The service records the timer, and the worker is free to process other tasks.

When the timer fires, the service records the timer event and schedules another Workflow Task. A worker replays the history, observes that the timer has completed, and runs the next part of the workflow. The wait can span a worker restart or a long period when no worker is running.

External events can resume a workflow too. A customer confirmation can arrive as a Signal. The service records the Signal and schedules work so the workflow can inspect it.

## A few rules keep workflows recoverable

Treat workflow code as a repeatable description of decisions. Put network calls and other unpredictable effects in Activities. Give Activities timeouts that match their expected duration, and use retry limits and idempotency keys when they can change external state. For long-running executions, use **Continue-As-New** to begin a fresh history while carrying forward the small amount of state the next run needs.

Durable execution handles worker and process failures; it does not make every external system transactional with the workflow. A payment may already have succeeded when a worker loses its response. Idempotency and reconciliation are still needed at that boundary.

## References

1. Temporal documentation, [Workflow Execution and Replay](https://docs.temporal.io/workflow-execution.md).
2. Temporal documentation, [Activities, retries, and heartbeats](https://docs.temporal.io/activities.md).
3. Temporal documentation, [Workers and task queues](https://docs.temporal.io/workers.md).
4. Temporal blog, [What Is Durable Execution?](https://temporal.io/blog/what-is-durable-execution).
5. Temporal documentation, [Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new).
