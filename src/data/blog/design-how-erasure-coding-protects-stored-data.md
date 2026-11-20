---
author: JZ
pubDatetime: 2026-11-20T19:28:26Z
modDatetime: 2026-11-20T19:28:26Z
title: System Design - How Erasure Coding Protects Stored Data
tags:
  - design-system
  - design-storage
  - design-database
description: "Learn how storage systems combine data and parity fragments to recover lost data, and why the space savings come with repair and placement trade-offs."
---

## Table of contents

## A storage bill with three copies

Suppose a photo archive keeps three complete copies of every object on different machines. If two copies disappear, a third can still serve the photo. For 600 MB of original data, though, the copies occupy roughly 1,800 MB before metadata and other overhead.

**Erasure coding** offers another way to add redundancy. Split the data into `k` equal-sized data fragments and calculate `m` additional parity fragments. An appropriate code lets the system reconstruct the original data from any `k` of the `k + m` fragments. This property assumes an erasure code designed for that guarantee, such as the Reed-Solomon codes used in many storage systems; it is not true of every possible parity scheme.

The idea is easier to see with a small, single-parity example first.

## One parity fragment: recovery with XOR

Imagine three one-byte data fragments. XOR (`^`) compares bits: equal bits produce `0`, different bits produce `1`.

```text
Data A = 1010 1100
Data B = 1100 1010
Data C = 1111 0000
Parity = A ^ B ^ C = 1001 0110
```

Place the four fragments in four independent failure domains. If B goes missing, the remaining fragments give us:

```text
A ^ C ^ Parity
= A ^ C ^ (A ^ B ^ C)
= B                         because X ^ X = 0 and X ^ 0 = X
```

The same calculation can recover any **one** missing fragment, including the parity fragment. It cannot generally recover two missing fragments: one parity equation does not determine two unknown data values. Real objects are much larger than one byte, but the XOR operation can be applied across corresponding bytes.

```text
 Original object
       |
       v
 +-----+-----+-----+       calculate
 |  A  |  B  |  C  | ----------------> P = A ^ B ^ C
 +--+--+--+--+--+--+
    |     |     |                       |
    v     v     v                       v
 machine machine machine              machine
    A     B     C                        P

 If B fails: read A, C, P -> reconstruct B
```

This example uses three data fragments and one parity fragment, often written `3+1`. The stored bytes are approximately `4/3` of the original size: about 33% redundancy overhead. It tolerates one lost fragment per stripe, whereas three full replicas tolerate two lost copies. Comparing them requires comparing the failure tolerance as well as the storage bill.

## From one loss to several: Reed-Solomon

To tolerate more than one missing fragment, a system needs multiple independent parity equations. Reed-Solomon coding computes those equations using arithmetic in a finite field; it is more than simply XORing all fragments multiple times. The decoder uses the surviving fragments to solve for the missing pieces.

For example, Apache HDFS documents a `6+3` arrangement: six data units and three parity units. For full-sized units, 600 MB of original data becomes nine 100 MB fragments, or about 900 MB total. A properly placed Reed-Solomon `6+3` stripe can lose any three of its nine fragments and still reconstruct from the other six. By contrast, 3x replication uses about 1,800 MB for the same original data and survives the loss of two copies. These are different redundancy guarantees, so neither byte count alone tells you which deployment is safer.

```text
 6 data fragments:   D0   D1   D2   D3   D4   D5
 3 parity fragments: P0   P1   P2
                     |    |    |    |    |    |    |    |    |
                     +---- place on separate failure domains ---+

 Example loss:       D1, D5, P0
 Survivors:          D0, D2, D3, D4, P1, P2  -> decode missing data
```

The formula `(k + m) / k` describes the **ideal** byte multiplier for a full stripe with equal-sized fragments. Real usage also includes metadata, checksums, padding, and possibly partially filled stripes. Small objects can therefore have a different effective overhead.

## The pieces must fail independently

The math counts lost **fragments**, not lost machines. If two fragments of the same stripe live on one server, losing that server consumes two of the stripe's loss budget. A rack, power supply, or availability-zone outage can remove many servers at once. Placement across the failure domains you want to survive is as important as the code's `m` value.

A typical write follows this path:

1. Split the data into a stripe of `k` data fragments and calculate `m` parity fragments.
2. Store the fragments on selected failure domains and record enough metadata to locate them.
3. When a fragment is unavailable or detected as corrupt, read enough verified survivors, reconstruct the missing fragment, and place a replacement.

Checksums help identify corrupted fragments so they can be treated as erasures. They do not make parity a substitute for backups: an accidental delete or an application writing bad data can be faithfully propagated to all fragments. Recovery also consumes network bandwidth, disk I/O, and CPU. Until repair completes, another failure has less remaining margin. A failure larger than the stripe's tolerance can make its data unavailable or unrecoverable.

## When is the trade-off useful?

Erasure coding is attractive for large, relatively cold objects where capacity matters and full-stripe access is common. Reading intact data may need only the relevant data fragments, but a degraded read must fetch additional survivors and decode. Small writes can be more expensive because parity must remain consistent with changed data; some implementations must read and rewrite more than the changed bytes. Performance depends on stripe size, workload, code, hardware, and implementation.

HDFS exposes erasure-coding **policies** with a codec, data/parity counts, and cell size. Ceph exposes erasure-code **profiles** and placement rules. These are product-specific choices, not interchangeable configuration names. Start by deciding which failures must be tolerated, then check whether the cluster has enough independent failure domains, capacity, and repair bandwidth to meet that goal. Benchmark normal and degraded reads, writes, and rebuilds before choosing a policy.

## References

1. [Apache HDFS: Erasure Coding](https://hadoop.apache.org/docs/stable/hadoop-project-dist/hadoop-hdfs/HDFSErasureCoding.html) — stripe layout, `6+3` example, policies, and limitations.
2. [Ceph: Erasure code](https://docs.ceph.com/en/latest/rados/operations/erasure-code/) — profiles, placement, overhead, and recovery.
3. [Backblaze: Reed-Solomon coding for storage](https://www.backblaze.com/blog/reed-solomon/) — an accessible introduction to the coding technique.
