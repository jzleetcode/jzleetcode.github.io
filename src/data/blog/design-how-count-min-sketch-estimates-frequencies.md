---
author: JZ
pubDatetime: 2026-10-28T18:34:00Z
modDatetime: 2026-10-28T18:34:00Z
title: System Design - How a Count-Min Sketch Estimates Frequencies
tags:
  - design-system
  - design-database
description: "Follow a small stream through the counters of a count-min sketch, see why collisions only overestimate counts, and learn when its memory and error guarantees are useful."
---

## Table of contents

## A question from a busy service

This explanation is for engineers new to streaming data structures. Imagine a service receiving millions of product-view events. Someone asks, "How often did visitors view this product?" A map from every product ID to its exact count works until the number of distinct IDs makes the map too expensive to keep in memory.

A **count-min sketch** trades exact counts for a small, fixed-size table of counters. It can update a count as each event arrives and answer questions about an ID later. The answer may be too high, but, for a stream of nonnegative increments, it is never too low. The original [count-min sketch paper](https://doi.org/10.1016/j.jalgor.2003.12.001) gives the probabilistic error bound; [Redis's count-min sketch documentation](https://redis.io/docs/latest/develop/data-types/probabilistic/count-min-sketch/) shows the same idea as a production data type.

## A counter in each row

The sketch has a small array of counters in each of several rows. Each row uses its **own hash function** to choose a counter for a product ID. On an event for `A`, add one to the chosen counter in _every_ row:

```text
                         product A arrives
                                |
                 +--------------+--------------+
                 |              |              |
                 v              v              v
             hash row 0     hash row 1     hash row 2
                 |              |              |
                 v              v              v
             counter 7      counter 2      counter 4
                += 1           += 1           += 1
```

To estimate `A`, read those same counters and return the **minimum**. A collision with some other product can add extra counts to a counter. It cannot subtract counts from `A`, so every selected counter is at least `A`'s true count. Taking the minimum picks the row with the least collision noise.

## Watch a collision happen

Suppose the stream contains four `A` events, two `B` events, and one `C` event. Use two rows of four counters. These hash assignments are invented for illustration, not a particular hash implementation:

```text
                bucket 0    bucket 1    bucket 2    bucket 3
  row 0:            0          6           0           1
                            A:4+B:2                  C:1

  row 1:            5          0           2           0
                  A:4+C:1                  B:2
```

For `A`, row 0 reads `6` and row 1 reads `5`. The estimate is `min(6, 5) = 5`, one above the true `4`: `B` collides in one row, and `C` in the other. For `B`, the estimate is `min(6, 2) = 2`. For `C`, it is `min(1, 5) = 1`. Independent rows make a collision in _every_ useful position less likely, but they do not make it impossible.

There is no reverse lookup from these seven events to the original IDs. The sketch answers a question **about an ID you already know**; it cannot list all the products that appeared. To discover popular products, a system needs a separate way to retain candidate IDs and then ask the sketch about them.

## How much memory buys how much accuracy?

Let `N` be the total weight of the events added, `f(x)` the true count for a queried ID, and `estimate(x)` its sketch estimate. The paper's standard construction chooses approximately `e / ε` counters per row and `ln(1 / δ)` rows. For a **fixed queried ID**, with probability at least `1 - δ` over the choice of hash functions:

```text
f(x) <= estimate(x) <= f(x) + εN
```

For example, with `ε = 0.01`, `δ = 0.01`, and `N = 1,000,000`, use `ceil(e / 0.01) = 272` counters per row and `ceil(ln(100)) = 5` rows: **1,360 counters** in total. The bound says this particular estimate exceeds the true count by no more than `10,000` with at least 99% probability. If the counters are 32-bit and cannot overflow at this stream size, that is 5,440 bytes for the counters, excluding hashes and other bookkeeping. The bound is additive in **total stream weight**, not a promise of 1% relative error for each rare product.

Why does this work? The width makes the _average collision contribution_ to one row small. The depth gives the queried ID several chances to find a row without much extra traffic. The minimum keeps the luckiest row. Increasing width reduces the size of likely errors; increasing depth reduces the chance that all rows are unlucky. These are guarantees for the classic nonnegative-update construction and suitable independent hashing, **not** guarantees that every queried ID is simultaneously within the bound.

## Where the sketch fits and where it doesn't

The fixed table is attractive when a stream is large, keys are numerous, and an approximate point query is enough: for example, ranking candidate search terms or identifying which known cache keys are getting frequent requests. The sketch's memory depends on the chosen error parameters rather than the number of distinct IDs. Updates and queries touch one counter per row. See [Redis's `CMS.INITBYPROB` and `CMS.QUERY` reference](https://redis.io/docs/latest/commands/cms.initbyprob/) for a concrete interface that exposes error and probability settings.

It is a poor substitute for an exact billing counter or an inventory count. Rare IDs may have a large _relative_ error when `εN` is large. The ordinary guarantee assumes nonnegative updates; subtracting counts or allowing counters to overflow breaks the simple "never underestimate" argument. And because the table forgets the IDs, it cannot answer "which products were viewed?" by itself. If exact membership is the question, use an appropriate key store or a membership structure instead.

The mental model: **each row is a noisy count for the same ID; take the quietest row**. The table saves memory by letting unrelated IDs share counters, and its error bound tells you how much collision noise to budget for.

## References

1. [Graham Cormode and S. Muthukrishnan, "An improved data stream summary: the count-min sketch and its applications"](https://doi.org/10.1016/j.jalgor.2003.12.001) — construction, error analysis, and streaming applications.
2. [Redis, "Count-min sketch"](https://redis.io/docs/latest/develop/data-types/probabilistic/count-min-sketch/) — a practical frequency-estimation interface and its accuracy settings.
3. [Redis, `CMS.INITBYPROB`](https://redis.io/docs/latest/commands/cms.initbyprob/) — choosing an error rate and error probability for a sketch.
