---
author: JZ
pubDatetime: 2026-11-09T19:34:52Z
modDatetime: 2026-11-09T19:34:52Z
title: System Design - How TiDB AUTO_RANDOM IDs Work in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
description: "A small TiDB source walkthrough of AUTO_RANDOM: how an insert combines a shard prefix with an allocated counter, and how that changes clustered row keys."
---

## Table of contents

- [The problem: a busy key range](#the-problem-a-busy-key-range)
- [Put shard bits before the counter](#put-shard-bits-before-the-counter)
- [Follow one insert through TiDB](#follow-one-insert-through-tidb)
- [The row key must reach different regions](#the-row-key-must-reach-different-regions)
- [Options to understand](#options-to-understand)
- [What AUTO_RANDOM does not promise](#what-auto_random-does-not-promise)
- [References](#references)

## The Problem: A Busy Key Range

Imagine an event table that receives thousands of inserts per second. With a normal ascending primary key, the newest keys are close together. In a distributed key-value store, that can make many new writes compete in the same part of the key space.

TiDB's `AUTO_RANDOM` keeps the primary key unique while putting a shard value in its higher bits. A monotonically allocated counter remains in the lower bits. The resulting numbers look random, so recent rows are spread across more key ranges.

```sql
CREATE TABLE events (
  id BIGINT PRIMARY KEY CLUSTERED AUTO_RANDOM(5),
  payload JSON
);
```

`AUTO_RANDOM` is supported on a clustered `BIGINT` primary-key column. The primary key is the row handle, so its value participates directly in the record key TiDB stores. This is why a different generated ID can change where the row lands.

## Put Shard Bits Before the Counter

For a signed `BIGINT` with the default 64-bit range and five shard bits, the simplified layout is:

```text
  Bit 63                 Bits 62..58              Bits 57..0
  +----------------------+------------------------+---------------------------+
  | sign bit (kept zero) | 5 shard bits           | 58 incremental bits       |
  +----------------------+------------------------+---------------------------+
```

Five bits can represent 32 shard values. Two generated IDs can have very different high bits even when their lower counters are close:

```text
  ID A: [0][00101][...counter 1201]
  ID B: [0][11010][...counter 1202]
```

The counter still advances through the allocator. The shard bits make nearby counter values land at different numeric positions. `AUTO_RANDOM(5)` sets the shard-bit count; an optional second argument can limit the range of bits used, as in `AUTO_RANDOM(5, 54)`.

## Follow One Insert Through TiDB

The source path is small enough to follow from table metadata to the final integer:

```text
CREATE TABLE ... AUTO_RANDOM(5)
          |
          v
TableInfo stores shard bits and range bits
          |
          v
NewAllocatorsFromTblInfo creates AutoRandomType allocator
          |
          v
InsertValues allocates the next counter suffix
          |
          +--> RowIDShardGenerator chooses a shard value
          |
          v
ShardIDFormat.Compose(shard, counter) returns the primary-key value
```

The table metadata model stores `AutoRandomBits` and `AutoRandomRangeBits`. `NewAllocatorsFromTblInfo` sees that the table has auto-random bits and adds an allocator with type `AutoRandomType`. This is a distinct allocator slot from the ordinary row-ID and `AUTO_INCREMENT` allocators.

When an insert leaves the column empty or sets it to `NULL`, `InsertValues.adjustAutoRandomDatum` reaches `allocAutoRandomID`. That method asks the auto-random allocator for a counter value, then asks the session's `RowIDShardGenerator` for a shard. The generator derives shard values from a pseudo-random stream; the current source seeds that stream from the transaction start timestamp.

`ShardIDFormat` computes the available incremental bits from the column type, range bits, and shard bits. For a signed integer it leaves the sign bit clear. Its `Compose` method masks the shard to the configured width, shifts it above the counter, and combines the two parts:

```go
func (s *ShardIDFormat) Compose(shard int64, id int64) int64 {
    return ((shard & ((1 << s.ShardBits) - 1)) << s.IncrementalBits) | id
}
```

The counter allocator makes the lower part unique for that table. The shard generator supplies the higher part and can change it after its configured allocation step. `Compose` turns both into the integer stored in the primary-key column.

## The Row Key Must Reach Different Regions

TiDB encodes a clustered row handle into a record key together with the table ID. TiKV stores keys in Regions, each responsible for a contiguous range from its start key up to (but not including) its end key.

```text
  AUTO_RANDOM primary key
          |
          v
  TiDB record key: table prefix + encoded handle
          |
          v
  TiKV key ranges: [start, end) [start, end) [start, end) ...
```

Random-looking prefixes give keys a chance to fall into different Region ranges instead of sending every new row to one ascending edge. The bit pattern alone does not create Region boundaries. For a new table, TiDB's `PRE_SPLIT_REGIONS` table option can pre-split key ranges using the sharding bits. The DDL split code uses the same shard format to calculate split keys, then asks the storage layer to split those Regions.

That distinction matters during a high-volume import: `AUTO_RANDOM` changes the keys; region splitting determines how the key space is divided among TiKV peers. Check the actual Region layout with TiDB's region inspection tools when tuning write distribution.

## Options to Understand

- **`AUTO_RANDOM(n[, range_bits])` is a column attribute.** `n` is the number of shard bits. The current TiDB source defaults it to 5 and limits it to 15. More shard bits offer more prefixes, while leaving fewer bits for the counter.
- **The column must be a clustered `BIGINT` primary key.** A nonclustered primary key does not place the row by that key, so the same distribution benefit does not apply to the record key.
- **`tidb_shard_allocate_step` controls shard reuse.** The session system variable sets the maximum number of consecutive shard allocations that use one shard within a transaction. The current source default is very large, so the shard is normally reused for a long run.
- **Explicit IDs are disabled by default.** `@@allow_auto_random_explicit_insert` must be enabled to insert a nonzero value directly. Explicit values can overlap with counters cached on other TiDB nodes; avoid them for ordinary application writes.
- **`AUTO_RANDOM_BASE` changes the counter's starting point.** PingCAP describes this option as an internal interface. Use the documented rebase procedure when importing data rather than setting a base casually.
- **`PRE_SPLIT_REGIONS` is about the key space, not the ID format.** It can create Region boundaries for a fresh table. It does not change how many bits the allocator uses.

## What AUTO_RANDOM Does Not Promise

The complete ID is not a timestamp or a global ordering of inserts. The low counter advances, but the high shard bits vary, so sorting by the whole ID does not reliably recover insert time. Use a timestamp column or TiDB's transaction timestamp for chronology.

`AUTO_RANDOM` also does not guarantee that each shard value maps to a different store. Region boundaries and replica placement determine which TiKV nodes own the keys. Its job is to spread generated keys through the key space; TiDB and TiKV's Region layout determine how much write parallelism that produces.

## References

1. TiDB documentation, [AUTO_RANDOM](https://docs.pingcap.com/tidb/stable/auto-random/), including its allocation rules and explicit-insert restrictions.
2. TiDB documentation, [Best Practices for High-Concurrency Writes](https://docs.pingcap.com/best-practices/high-concurrency-best-practices/).
3. PingCAP, [Understanding MVCC in TiDB for High-Concurrency Applications](https://www.pingcap.com/article/understanding-mvcc-in-tidb-for-high-concurrency-applications/), for broader transaction and concurrency context.
4. TiDB source at revision [`c9f7aed`](https://github.com/pingcap/tidb/tree/c9f7aed139f6ab2398f54e9021843380f63145e4): [`TableInfo` auto-random metadata](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/meta/model/table.go#L170-L176), [bit defaults and normalization](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/meta/autoid/autoid.go#L80-L118), [allocator selection](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/meta/autoid/autoid.go#L684-L705), and [shard ID layout and `Compose`](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/meta/autoid/autoid.go#L1231-L1273).
5. TiDB source: [`InsertValues.adjustAutoRandomDatum` and `allocAutoRandomID`](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/executor/insert_common.go#L1231-L1317), and [the session shard generator](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/sessionctx/variable/session.go#L275-L328).
6. TiDB source: [AUTO_RANDOM Region pre-splitting](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/ddl/split_region.go#L110-L160) and [record-key encoding](https://github.com/pingcap/tidb/blob/c9f7aed139f6ab2398f54e9021843380f63145e4/pkg/tablecodec/tablecodec.go#L105-L116).
7. TiKV source at revision [`96033a2`](https://github.com/tikv/tikv/tree/96033a26bb4b5427deadc6168a3d210a5cd2b6ae): [`check_key_in_region` and Region key ranges](https://github.com/tikv/tikv/blob/96033a26bb4b5427deadc6168a3d210a5cd2b6ae/components/tikv_util/src/store/region.rs#L4-L26).
