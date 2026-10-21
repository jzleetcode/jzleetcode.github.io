---
author: JZ
pubDatetime: 2026-10-21T18:00:00Z
modDatetime: 2026-10-21T18:00:00Z
title: System Design - How PostgreSQL Index-Only Scans Use the Visibility Map
tags:
  - design-system
  - design-database
description: "Why a covering index does not always avoid heap visits: follow one PostgreSQL index-only scan through the visibility map, VACUUM, and EXPLAIN's Heap Fetches counter."
---

## Table of contents

## The index already has the answer. Why read the table?

Imagine a large table of sensor readings. An application asks for readings from one device:

```sql
CREATE TABLE readings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id bigint NOT NULL,
  reading integer NOT NULL
);

CREATE INDEX readings_device_cover_idx
  ON readings (device_id) INCLUDE (reading);

SELECT reading FROM readings WHERE device_id = 7;
```

The B-tree can find `device_id = 7`, and its **included column** holds `reading`. Why would PostgreSQL visit the table (the **heap**) at all? Because finding a value is not the same as proving that its row version is visible to _this query's snapshot_. PostgreSQL keeps row-version visibility information in the heap, not in each index entry. The [index-only scan documentation](https://www.postgresql.org/docs/18/indexes-index-only-scans.html) calls this the remaining obstacle even when all requested columns are in the index.

The trick is a small, separate **visibility map**. It lets PostgreSQL avoid checking every row in the heap _when an entire heap page is known to be visible to everyone_. We will follow one index entry through that decision. The implementation links below are pinned to [PostgreSQL 18's `REL_18_STABLE` snapshot](https://github.com/postgres/postgres/tree/a5b925cfcc9b), commit `a5b925cfcc9b`; behavior on other versions may differ.

## Two conditions for skipping the heap

A covering index meets the first condition: the index must support returning values, and it must contain **every column needed by the query**. The search key `device_id` guides the lookup; `reading` is payload in the index, not an additional search key. `INCLUDE` can make this possible without changing which leading columns are searchable, but it makes the index larger and adds write work. In particular, changing an included value prevents a [HOT update](https://www.postgresql.org/docs/18/storage-hot.html) that would otherwise avoid updating this index.

The second condition is about time. Suppose the index points to a row version at heap page 12. Could a transaction that began earlier see that version? The index entry alone cannot tell us. The visibility map answers a stronger question: **are all row versions on heap page 12 visible to every transaction?** If its _all-visible_ bit is set, the answer is yes and no per-row heap check is needed. If the bit is clear, PostgreSQL must check the heap for this index entry, even if that row happens to be visible.

```text
  B-tree entry: device_id=7, reading=42, heap page=12
                         |
                         v
                visibility map, page 12
                   /               \
          all-visible=1        all-visible=0
               |                   |
      return index value     visit heap to check
      without heap visit     this row's visibility
```

This is a **page-level hint**, not a bit per row. PostgreSQL's [visibility-map documentation](https://www.postgresql.org/docs/18/storage-vm.html) describes two bits per heap page: _all-visible_ and _all-frozen_. The latter concerns transaction-ID freezing and is **not** the bit that decides whether this index-only scan can skip the heap. A clear all-visible bit is conservative: it does not prove any row is invisible.

## Trace an index entry through the executor

In [`IndexOnlyNext`](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/executor/nodeIndexonlyscan.c#L62-L71), PostgreSQL asks the index for the next tuple identifier. The [scan loop](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/executor/nodeIndexonlyscan.c#L119-L171) checks `VM_ALL_VISIBLE` for the tuple's heap page:

1. **Bit set:** the executor does not fetch the heap tuple. It can return the data from the index tuple.
2. **Bit clear:** it calls `index_fetch_heap` to check this row against the query's snapshot. If that row version is invisible, it continues to the next index entry.
3. **Either way:** the [returned value comes from the index tuple](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/executor/nodeIndexonlyscan.c#L191-L195), not from the heap copy. A visibility check is different from looking up a missing column.

That is why **index-only scan** describes a plan node and an opportunity, not a guarantee of zero heap accesses. The executor also contains careful synchronization around the map bit and concurrent inserts/deletes: the [source commentary](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/executor/nodeIndexonlyscan.c#L128-L160) explains why it can safely read the bit without locking the map page on each index hit. The optimization cannot be allowed to return a row that a snapshot should not see.

## Who turns the all-visible bit on and off?

[`visibilitymap.c`](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/access/heap/visibilitymap.c#L23-L51) describes the map as **conservative**: a set bit must be trustworthy; a clear bit may be an unnecessarily cautious answer. `VACUUM` can determine that a page is all-visible and [set its bit](https://www.postgresql.org/docs/18/storage-vm.html). An insert, update, or delete that makes that guarantee no longer true [clears it](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/access/heap/visibilitymap.c#L56-L72). Older transactions can keep a page from becoming all-visible yet, because those transactions might still need a different row version.

Picture a mostly unchanged history table: after vacuuming, many pages can stay all-visible, so a covering index is especially useful. On a frequently updated table, page bits are cleared repeatedly; the same index-only plan might perform many heap visibility checks. Vacuum is not an instruction to force an index-only plan—it maintains information the planner and executor can use when the conditions fit.

## Read the actual plan, not the plan you hoped for

With a **populated** table, try the following after loading data (ordinary tiny test tables may favor a sequential scan):

```sql
VACUUM (ANALYZE) readings;

EXPLAIN (ANALYZE, BUFFERS)
SELECT reading FROM readings WHERE device_id = 7;
```

Look for `Index Only Scan` and its `Heap Fetches` counter in the output. A low count means few index entries needed a heap visibility check; a high count often means many relevant heap pages are not marked all-visible. The counter is **not** a disk-read count: a fetched heap page may already be cached. `BUFFERS` adds context about page accesses. If the plan is instead `Seq Scan` or `Index Scan`, there is no index-only node to diagnose. The planner considers table size, selectivity, index coverage, and how much of the table is marked all-visible; the [PostgreSQL `EXPLAIN` guide](https://www.postgresql.org/docs/18/using-explain.html) shows how to inspect the chosen plan.

The practical takeaway is two-part: make the query coverable **and** give vacuum a chance to establish visibility on relatively stable pages. Neither part alone promises a heap-free query.

## References

- [PostgreSQL 18: Index-Only Scans and Covering Indexes](https://www.postgresql.org/docs/18/indexes-index-only-scans.html)
- [PostgreSQL 18: Visibility Map](https://www.postgresql.org/docs/18/storage-vm.html)
- [PostgreSQL 18: Using EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html)
- [PostgreSQL 18 source: `IndexOnlyNext`](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/executor/nodeIndexonlyscan.c#L62-L240)
- [PostgreSQL 18 source: visibility-map invariants](https://github.com/postgres/postgres/blob/a5b925cfcc9b/src/backend/access/heap/visibilitymap.c#L23-L72)
