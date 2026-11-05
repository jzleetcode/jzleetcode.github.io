---
author: JZ
pubDatetime: 2026-11-05T19:30:00Z
modDatetime: 2026-11-05T19:30:00Z
title: System Design - How TiDB AUTO_INCREMENT Cache Works in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
description: "A focused TiDB source walkthrough of AUTO_ID_CACHE=1: how table metadata selects the allocator service, how it reserves ID ranges, and why failover can leave gaps."
---

## Table of contents

- [The question: who gives out the next ID?](#the-question-who-gives-out-the-next-id)
- [From table metadata to an allocator](#from-table-metadata-to-an-allocator)
- [How the allocator reserves IDs](#how-the-allocator-reserves-ids)
- [Why the setting can still leave gaps](#why-the-setting-can-still-leave-gaps)
- [Configuration to know](#configuration-to-know)
- [References](#references)

## The Question: Who Gives Out the Next ID?

Suppose two TiDB servers receive inserts into the same table at nearly the same time. If each server invents its own next `AUTO_INCREMENT` value, both might choose the same number. If each server holds a large private range, values stay unique, but switching between servers can make the visible sequence jump forward and backward.

TiDB has a table option for applications that need IDs to remain strictly increasing across TiDB instances. This post follows that option through a small part of the current source: table metadata, the client-side allocator, and the elected allocator service.

```sql
CREATE TABLE orders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  description VARCHAR(100)
) AUTO_ID_CACHE 1;
```

The simplified path is:

```text
INSERT on any TiDB server
          |
          v
table metadata -> NewAllocatorsFromTblInfo
          |
          v
singlePointAlloc -> find service owner through etcd
          |
          v
AutoID service leader -> in-memory range for this table
          |
          +---- enough IDs? return the requested range
          |
          +---- cache empty? reserve a new range in KV metadata
```

This setting also appears in real migration work: PingCAP's [Bling database migration case study](https://www.pingcap.com/blog/mysql-to-tidb-migration-how-bling-scaled-25tb-database/) mentions using `auto_id_cache=1` for sequential IDs. The source walkthrough below explains how TiDB implements that option and why it still cannot promise a gap-free sequence.

## From Table Metadata to an Allocator

In `pkg/meta/autoid/autoid.go`, `NewAllocatorsFromTblInfo` reads `TableInfo.AutoIDCache` and passes it to `NewAllocator` as a cache-step option. It also looks at the table metadata version and the kind of ID being allocated.

For a separate auto-increment allocator, `NewAllocator` takes the centralized path when the cache step is `1` and the table metadata version is new enough. Instead of returning the ordinary allocator that reserves ranges directly through its local storage handle, it constructs a `singlePointAlloc`.

The distinction matters: the option is about the SQL table's `AUTO_INCREMENT` values. The source deliberately keeps a row-ID allocator's cache behavior separate, so `AUTO_ID_CACHE=1` does not mean every internal row identifier is allocated one at a time.

The `singlePointAlloc` implements the same `Allocator` interface as the ordinary allocator. Its `Alloc` method sends a request containing the database ID, table ID, requested count, increment, offset, and keyspace ID. The `ClientDiscover` helper looks up the service owner in etcd and creates a gRPC client for that owner.

## How the Allocator Reserves IDs

The receiving `Service` checks that the request belongs to its keyspace and that it still owns the service role. It keeps an `autoIDValue` for each database-and-table pair. A lock protects that value while the service serves concurrent requests for the same table.

The first request, or a request that uses up the current in-memory range, reaches `autoIDValue.alloc4Signed`. In a KV transaction, the service reads the table's persisted high-water mark and advances it before returning IDs. The in-memory `base` and `end` then describe which values this service can hand out without another storage transaction.

For example, when a fresh service receives a request for three IDs, it can reserve a block in persistent metadata and return the first three values from that block. Later requests use the rest of the in-memory block. If an insert statement needs more than the normal refill size, the service reserves a block large enough for that statement.

The current source defines that normal refill size as `4000`. This is why `AUTO_ID_CACHE=1` does not mean the allocator writes a metadata transaction for every inserted row. The SQL option selects the globally coordinated behavior; the service still reserves a range so it can serve ordinary requests from memory.

The high-water mark is advanced before values are handed out. That ordering is the safety property: after a service loses its in-memory cache, another owner will not reissue IDs from a range that may already have been returned.

## Why the Setting Can Still Leave Gaps

When the allocator service changes owners, the new owner cannot safely reuse the old owner's unconsumed in-memory values. The `OnBecomeOwner` callback clears the service's allocation map. The next request starts from persisted KV metadata and reserves a fresh range beyond the previous high-water mark.

That means a crash or failover can abandon the unused tail of a reserved range. The next ID can jump, but the service avoids returning the same number twice. The official TiDB documentation describes `AUTO_ID_CACHE=1` as providing unique, strictly increasing IDs across TiDB instances with fewer gaps than the default cache mode; it also lists failover and rolling upgrades as situations where gaps can remain.

This is an allocation order, not a commit timestamp. An auto-increment value is not a promise that its row committed before every row with a larger value, and it is not a gap-free sequence for billing numbers or event ordering.

## Configuration to Know

- **`AUTO_ID_CACHE` is a table option.** Set it when creating the table, for example `AUTO_ID_CACHE 1`. It is not a session setting that changes all tables.
- **`AUTO_ID_CACHE=1` requests the MySQL-compatible increasing mode.** The default mode (`AUTO_ID_CACHE 0`) caches 30,000 values and can show larger jumps when different TiDB instances allocate IDs.
- **The implementation depends on table metadata and TiDB version.** Current source only selects `singlePointAlloc` for compatible table metadata and the separate auto-increment allocator. The implementation has also changed over time; the docs note that TiDB 6.4.0 introduced the centralized in-memory service path.
- **Do not depend on gap-free values.** Failed inserts, rollbacks, reserved but unused values, and failover can all leave holes.

The key idea is that monotonic allocation comes from one active service owner and a persisted high-water mark. Memory makes the common case fast; advancing durable metadata before returning an ID makes ownership changes safe.

## References

1. TiDB documentation, [AUTO_INCREMENT and `AUTO_ID_CACHE`](https://docs.pingcap.com/tidb/stable/auto-increment/).
2. PingCAP blog, [How Bling Migrated a Mission-Critical 25TB MySQL Database to TiDB](https://www.pingcap.com/blog/mysql-to-tidb-migration-how-bling-scaled-25tb-database/).
3. TiDB source at revision [`4fb7a0c`](https://github.com/pingcap/tidb/tree/4fb7a0cda191e6a47721c1fd3ed1ee5e5d88cf95): [`NewAllocator` and `NewAllocatorsFromTblInfo`](https://github.com/pingcap/tidb/blob/4fb7a0cda191e6a47721c1fd3ed1ee5e5d88cf95/pkg/meta/autoid/autoid.go#L630-L705).
4. TiDB source: [`singlePointAlloc.Alloc` and `ClientDiscover.GetClient`](https://github.com/pingcap/tidb/blob/4fb7a0cda191e6a47721c1fd3ed1ee5e5d88cf95/pkg/meta/autoid/autoid_service.go#L293-L413).
5. TiDB source: [`Service.AllocAutoID` and `autoIDValue.alloc4Signed`](https://github.com/pingcap/tidb/blob/4fb7a0cda191e6a47721c1fd3ed1ee5d88cf95/pkg/autoid_service/autoid.go#L134-L203).
6. TiDB source: [`batch` refill size, `Service.allocAutoID`, and ownership change handling](https://github.com/pingcap/tidb/blob/4fb7a0cda191e6a47721c1fd3ed1ee5d88cf95/pkg/autoid_service/autoid.go#L427-L520) and [`OnBecomeOwner`](https://github.com/pingcap/tidb/blob/4fb7a0cda191e6a47721c1fd3ed1ee5d88cf95/pkg/autoid_service/autoid.go#L603-L612).
