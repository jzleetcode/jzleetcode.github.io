---
author: JZ
pubDatetime: 2026-10-19T18:38:00Z
modDatetime: 2026-10-19T18:38:00Z
title: System Design - How HyperLogLog Counts Distinct Values
tags:
  - design-system
  - design-database
description: "Follow a visitor from a hash to a HyperLogLog register, then see how Redis estimates and merges distinct counts without keeping the visitors themselves."
---

## Table of contents

## The visitor counter that cannot remember visitors

This explanation is for engineers meeting approximate counting for the first time. Imagine a site that wants to report _unique_ visitors each day. Counting visits is easy; counting visitors once requires remembering which identifiers have already appeared. An exact set grows with the number of visitors. What if you only need a useful estimate, not an exact answer?

**HyperLogLog (HLL)** keeps a fixed number of small counters, called **registers**, instead of a set of identifiers. Each incoming identifier changes at most one register. The registers can later be combined across days or servers. The price is that the result is an estimate: you cannot ask the sketch which visitors it saw.

Redis exposes the idea through `PFADD`, `PFCOUNT`, and `PFMERGE`:

```text
PFADD visitors:monday alice bob alice
PFADD visitors:tuesday bob cara
PFCOUNT visitors:monday
PFCOUNT visitors:monday visitors:tuesday
PFMERGE visitors:both visitors:monday visitors:tuesday
```

The first count estimates Monday's distinct visitors; the multi-key count estimates the _union_, so Bob must not count twice. These are not exact counts, even when a tiny example happens to return the expected integer. See the [Redis HyperLogLog guide](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/) and [`PFCOUNT` command reference](https://redis.io/docs/latest/commands/pfcount/) for command behavior.

## An unlikely pattern becomes a clue

Hash each visitor identifier into a uniformly distributed bit string. Ignore the original identifier from then on. If the unused part of a hash begins with a `1`, that is ordinary. Seeing `0001` is rarer: approximately one in sixteen uniformly distributed bit strings starts that way. A long run of zeroes hints that you have seen many different hashes.

One longest zero run alone is noisy. HLL uses some hash bits to choose a register and the remaining bits to measure a zero run. Each register remembers only the _largest_ observed run length for its bucket. Repeated identifiers hash to the same value and cannot increase that maximum a second time.

```text
                   hash(visitor)
                         |
               +---------+----------+
               | bucket bits | rest |
               +---------+----------+
                    |             |
              select register    count zeroes until the first 1
                    |             |
                    +------ max(register, rank)

       registers: [0, 0, 3, 0, 1, ...]
```

This is a conceptual split, not a diagram of Redis's bit order. [Redis selects a register from low hash bits](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L468-L488) and counts trailing zeroes in the remaining bits. The statistical idea is the same: split a well-distributed hash into a bucket and a rank.

Consider a toy sketch with four registers. An identifier lands in bucket 2 and has a rank of 3, so register 2 becomes 3. The same identifier arrives again; it leaves register 2 at 3. A different identifier with a rank of 5 in that bucket raises it to 5. Registers store evidence about _how many_ distinct hashes may have arrived, not a reversible list of _which_ hashes arrived. Redis's [`hllDenseAdd` and `hllSparseAdd`](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L519-L525) use the same hash-and-max update (the sparse wrapper appears [later in the file](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L951-L957)).

## From registers to an estimate

If a register reaches rank `r`, a pattern with roughly `r - 1` zeroes was observed. Larger ranks are less likely from a small set of independent hashes. HLL combines information from _all_ registers rather than turning one extreme run directly into a count. Empty registers are particularly informative when the set is small.

The [original HyperLogLog analysis](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf) derives an estimator and an approximate relative standard error of `1.04 / sqrt(m)`, where `m` is the register count. That is an accuracy _scale across repeated estimates_, not a guarantee that every individual result is within that percentage of the truth. A good hash distribution is essential; correlated or adversarially chosen hashes invalidate the simple intuition.

Redis uses `2^14 = 16,384` registers of 6 bits each: `16,384 × 6 / 8 = 12,288` bytes of packed register data, plus a header. That yields a theoretical relative standard error of about **0.81%** under the usual assumptions. Sparse encoding can use less space when many registers are still zero. These layout choices are visible in the [Redis constants and representation description](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L37-L62) and [register definitions](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L190-L204).

One implementation detail matters: **Redis's current estimator is not simply the original paper's formula**. Its [`hllCount` implementation](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L1080-L1123) uses a register histogram and the estimator from [Otmar Ertl's cardinality-estimation paper](https://arxiv.org/abs/1702.01284). The hash-and-register story explains the data structure without pretending that a few lines of the original formula reproduce Redis's exact outputs.

## Why merging works and deleting does not

Suppose one server's register 2 holds `3` and another server's register 2 holds `5`. The union has the same evidence as if both streams had been processed together: register 2 becomes `max(3, 5) = 5`. Do that for every register and estimate the union from the resulting sketch. [Redis's merge implementation](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c#L1340-L1397) applies this register-wise rule.

```text
     day A: [0, 3, 1, 0]
     day B: [2, 1, 1, 4]
            ------------  register-wise maximum
     union: [2, 3, 1, 4]
```

The same rule explains a limitation. If you remove a visitor who was responsible for the maximum rank, a register has no record of the _next_-highest rank. You cannot undo an addition or subtract one sketch from another. Keep separate sketches for time windows you may need to query, or use an exact set when deletion and precise membership are requirements.

## The mental model

HLL exchanges identity for evidence. Each hash contributes to one bucket's highest observed zero run; many buckets together estimate distinct cardinality. Duplicate additions do not change the evidence, and independent sketches merge by taking per-register maxima. That makes HLL useful for large-scale approximate `COUNT(DISTINCT ...)`-style questions, but unsuitable for retrieving individual members or demanding exact answers.

## References

- [Redis documentation: HyperLogLog](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/), [`PFCOUNT`](https://redis.io/docs/latest/commands/pfcount/), and [`PFMERGE`](https://redis.io/docs/latest/commands/pfmerge/).
- [Redis source: `src/hyperloglog.c` at commit `64a436e`](https://github.com/redis/redis/blob/64a436ed0f5107623f2b8507af1ea1a9e63f9d0f/src/hyperloglog.c).
- [Flajolet et al., _HyperLogLog: the analysis of a near-optimal cardinality estimation algorithm_](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf).
- [Ertl, _New cardinality estimation algorithms for HyperLogLog sketches_](https://arxiv.org/abs/1702.01284).
