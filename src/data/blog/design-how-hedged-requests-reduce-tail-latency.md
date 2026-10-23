---
author: JZ
pubDatetime: 2026-10-23T18:30:00Z
modDatetime: 2026-10-23T18:30:00Z
title: System Design - How Hedged Requests Reduce Tail Latency
tags:
  - design-system
  - design-distributed
description: "Follow a slow read through a hedged RPC, from the delayed second attempt to cancellation, deadlines, and the cost of duplicate work."
---

## Table of contents

## One slow dependency can make the whole page slow

Imagine a home page that asks 30 independent services for recommendations, prices, and profile details. Most replies arrive quickly. One storage node pauses for a moment, and the page waits for that last answer. Improving _average_ RPC latency may barely change what the person experiences: the page completes when its slowest required request completes.

Even a small slow tail becomes noticeable with fan-out. If each of 100 independent requests has a 1% chance of being slow, the chance that **at least one** is slow is `1 - 0.99^100`, about 63%. This is a teaching example, not a prediction for a real service: correlated delays, caching, and requests that are not all required change the result. Dean and Barroso describe why this sort of tail amplification matters in [_The Tail at Scale_](https://research.google/pubs/the-tail-at-scale/).

The question is: once a request _looks_ unusually slow, do we have to keep waiting for that particular copy?

## Send a backup before the first attempt fails

A **hedged request** is a second attempt launched while the first is still in flight. The client accepts the first successful answer and cancels the other attempt. Unlike an ordinary retry, the backup does not wait for an error.

```text
time       client                     backend A             backend B
 0 ms      |--- read object --------->|                       |
40 ms      |  still waiting           |                       |
           |--- same read ----------------------------------->|
65 ms      |<--------------------------- successful answer ---|
           |--- cancel ------------->|                       |
```

Suppose A would have taken 300 ms and B finishes 25 ms after the hedge starts. The caller gets an answer at about 65 ms instead of 300 ms. These numbers illustrate the mechanism, not a guaranteed latency improvement. The client must still pay for the extra attempt, and cancellation may arrive after A has already done some work.

With one optional hedge sent after delay `d`, and ignoring errors and deadlines, the fraction of requests that make a second attempt is roughly `P(original latency > d)`. If only 5% of original attempts exceed the delay, average attempts are about `1 + 0.05 = 1.05`, _not_ two on every request. If a shared outage makes every request slow, however, the backup can add load precisely when the system can least afford it.

## How the client decides when to stop

The [gRPC hedging guide](https://grpc.io/docs/guides/request-hedging/) provides a concrete implementation model. Its per-method service configuration includes:

```json
{
  "hedgingPolicy": {
    "maxAttempts": 2,
    "hedgingDelay": "0.040s",
    "nonFatalStatusCodes": ["UNAVAILABLE"]
  }
}
```

Here the first attempt starts immediately. If it has not succeeded after 40 ms, the client can start a second one. `maxAttempts` includes the original. The example treats `UNAVAILABLE` as non-fatal so another attempt can proceed; whether that status is suitable depends on the operation and service. If an attempt returns a _fatal_ status, the client returns the error and cancels outstanding attempts instead of pretending every error is worth hedging. A non-fatal response can also bring the next hedge forward without waiting out its delay. Omitting `hedgingDelay` in gRPC sends the configured attempts together, which can greatly increase work.

All attempts share the **call deadline**. Hedging does not grant a fresh full timeout to every copy. If the deadline expires first, the call fails even if a backend is still working. A server can also send [retry pushback](https://grpc.io/docs/guides/request-hedging/#server-pushback) to postpone or prevent additional attempts, and gRPC's [retry throttling policy](https://grpc.io/docs/guides/request-hedging/#throttling-hedged-rpcs) can suppress backups as failures mount.

```text
application call + one deadline
            |
      hedging client
       /          \
  attempt A     attempt B (only after delay, if still needed)
       \          /
       first success -> application; cancel remaining attempts
       fatal error   -> application; cancel remaining attempts
```

## Why a duplicate read is not just a duplicate write

For a read that can safely run twice, two attempts should produce answers with the same meaning. A charge-card RPC is different: canceling a second request does **not** roll back a payment already processed. Only hedge a write if the service has explicit duplicate protection, such as a durable idempotency key that both copies share, and you have checked the operation's semantics. The [idempotency-key walkthrough](/posts/design-how-idempotency-keys-make-retries-safe/) explains that protection separately.

Even reads can observe different values if the replicas are at different points in time. A successful answer from a lagging replica is not automatically acceptable for a read requiring strong consistency. Hedging is a latency policy, not a substitute for the storage system's consistency contract.

The two attempts also need a realistic chance of **independent** progress. If both go to the same overloaded backend, or both share the same congested network link, duplication can make the tail worse. The client should route according to the service's load-balancing and consistency rules; a hedge is not a guarantee that a different server will receive the copy.

## Choosing a delay without starting a storm

A tiny delay sends almost every request twice. A huge delay rarely helps before the deadline. A useful starting point is to measure the ordinary latency distribution and choose a delay near a tail percentile, leaving enough time before the call deadline for the backup to finish. Treat this as an experiment, not a universal percentile prescription.

Compare end-to-end p95/p99 latency **and** attempts per logical request. Also watch backend queue depth, request rate, cancellation rate, errors, and whether the slow attempts share a common cause. Put a small cap on attempts; keep server pushback and throttling enabled where supported. If the root problem is saturation, adding duplicate work is not a cure.

The mental model is simple: **pay a small, measured amount of spare capacity to avoid waiting for an unusually slow copy**. The hard part is keeping that spare work safe, bounded, and actually independent.

## References

1. [Jeffrey Dean and Luiz André Barroso, _The Tail at Scale_ (2013)](https://research.google/pubs/the-tail-at-scale/).
2. [gRPC: Request Hedging](https://grpc.io/docs/guides/request-hedging/) — attempt scheduling, status handling, deadlines, throttling, and pushback.
3. [gRPC: Retry](https://grpc.io/docs/guides/retry/) — contrast with retries that follow failures.
4. [gRPC: Service Config](https://github.com/grpc/grpc/blob/master/doc/service_config.md) — configuration fields and scope.
