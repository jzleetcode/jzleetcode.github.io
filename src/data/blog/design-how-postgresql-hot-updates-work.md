---
author: JZ
pubDatetime: 2026-10-07T18:00:00Z
modDatetime: 2026-10-07T18:00:00Z
title: System Design - How PostgreSQL HOT Updates Work
tags:
  - design-system
  - design-database
description: "Why PostgreSQL can sometimes update a row without adding new index entries: heap pages, HOT chains, snapshot visibility, pruning, fillfactor, and the source-code checks that make the optimization safe."
---

This explanation is for engineers who know basic SQL and want to understand why some PostgreSQL updates are cheaper than others. We will follow one account row through a **heap-only tuple**, or **HOT**, update and see how PostgreSQL saves index work without sacrificing old readers' view of the data.

The implementation links use **PostgreSQL 17.0**, commit `d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e`. The SQL example was checked on PostgreSQL 17.11. These are explicit reference versions, not a claim about the newest PostgreSQL release.

## Table of contents

## The balance changed, so why touch the email index?

Imagine an accounts table with three columns:

```text
id: 42       email: ada@example.net       balance: 100
```

There is a primary-key index on `id` and a unique index on `email`. A deposit changes the balance to `125`. Neither indexed value changes.

It sounds as though the database could replace `100` with `125` and leave both indexes alone. But PostgreSQL uses **multi-version concurrency control**, or **MVCC**: an update creates a new row version so that a reader with an older snapshot can still see the previous version. The [system-column documentation](https://www.postgresql.org/docs/17/ddl-system-columns.html) explains the transaction metadata and physical identifiers attached to those versions.

An ordinary non-HOT update gives the new version a different physical location and needs new index entries, even for indexes whose key values did not change. The problem is the changed row-version address, not just the changed account balance.

HOT asks a narrower question:

> Can the existing index entries remain an entrance to the new row version?

The answer can be yes, but only when PostgreSQL can keep that entrance valid and the relevant row versions on one heap page.

## A heap page is a small room with numbered seats

PostgreSQL stores ordinary table rows in a **heap**: page-based storage that is not ordered by an index key. This is unrelated to the heap used for memory allocation.

Each page has a small array of **line pointers** and a separate area holding tuple bytes. A line pointer identifies a tuple's position inside the page. The bytes can be compacted without changing that line pointer's number. PostgreSQL's [page-layout documentation](https://www.postgresql.org/docs/17/storage-page-layout.html) describes these two areas.

An index entry's tuple identifier, or **TID**, contains a page number and a line-pointer number. For example, `(7, 1)` means line pointer 1 on page 7, not byte offset 1.

```text
Primary-key index                         Heap page 7
+------------------+                     +----------------------+
| id=42 -> (7, 1)  |-------------------->| line pointer 1       |
+------------------+                     |        |             |
                                         |        v             |
                                         | version A            |
                                         | balance=100          |
                                         +----------------------+
```

The `email` index has its own entry pointing to the same tuple identifier. The diagram shows just one index so that the pointer relationship stays easy to follow.

This extra level of indirection is the key to HOT: the index's destination can remain stable even when the tuple bytes behind it change.

## Two conditions make HOT possible

For the ordinary heap-table updates discussed here, PostgreSQL needs both of these conditions:

- The update must not change a column referenced by an index that stores individual tuple references.
- The new tuple version must fit on the **same heap page** as the old version.

These are the eligibility rules in the [HOT documentation](https://www.postgresql.org/docs/17/storage-hot.html). The implementation's decisive check is in [`heap_update()`](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/heapam.c#L3866-L3893): the old and new buffers must be the same, and the changed-attribute set must not overlap the HOT-blocking attribute set.

“Referenced by an index” is broader than “written directly in its search key.” Expressions, partial-index predicates, and included columns can also make a column relevant to an index. Adding an index can therefore change which application updates qualify for HOT.

There is an important exception: **summarizing indexes**, such as BRIN, summarize page ranges rather than pointing to each individual row version. In this PostgreSQL version, changes to columns referenced only by summarizing indexes do not automatically block HOT. Their summaries might still need updating. Do not turn “HOT” into the claim that absolutely no index-related work occurs.

For our accounts table, changing `balance` is a candidate. Changing `email` is not. A balance update that has to move to another page is also not HOT.

## The existing index entry becomes a doorway to a chain

Suppose the balance update fits on page 7. PostgreSQL creates version B on that page and links the older version to it:

```text
Primary-key index                         Heap page 7
+------------------+                     +--------------------------+
| id=42 -> (7, 1)  |-------------------->| line pointer 1           |
+------------------+                     |        |                 |
                                         |        v                 |
                                         | version A: balance=100   |
                                         | HOT-updated               |
                                         |        | t_ctid           |
                                         |        v                 |
                                         | version B: balance=125   |
                                         | heap-only                 |
                                         | at line pointer 2        |
                                         +--------------------------+
```

Two tuple-header flags express different responsibilities:

- `HEAP_HOT_UPDATED` marks the old version as having a HOT successor.
- `HEAP_ONLY_TUPLE` marks the new version as not having its own ordinary index entries.

The flags are defined in [`htup_details.h`](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/include/access/htup_details.h#L279-L285). Their assignment and the update's index-maintenance result are visible in [`heap_update()`](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/heapam.c#L3923-L3931) and its [`update_indexes` decision](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/heapam.c#L4046-L4060).

An index lookup starts at the existing entry and searches the chain for a version visible to its snapshot. An older reader may need version A; a newer reader may need version B. The chain does not tell every reader to return the newest version regardless of transaction visibility.

That traversal is implemented by [`heap_hot_search_buffer()`](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/heapam.c#L1631-L1745). Keeping the chain on one page means following a HOT successor does not require fetching a different heap page.

The useful mental model is **one entrance per ordinary index for this HOT chain**, not “one index entry forever for every version of the logical row.” When a later update is not HOT, PostgreSQL needs a new index-reachable version.

## Pruning keeps the doorway while removing an empty room

Eventually, version A is no longer needed by any relevant snapshot. PostgreSQL would like to reclaim its bytes. However, the indexes still point to line pointer 1.

Deleting that line pointer immediately would break the entrance. Instead, page pruning can turn it into a **redirect**:

```text
Index entry: id=42 -> (7, 1)

Heap page 7 after pruning:
  line pointer 1: REDIRECT to line pointer 2
  line pointer 2: version B, balance=125

  version A's tuple bytes are reusable
```

A redirect occupies a line-pointer entry, not a copy of the old row. The index stays unchanged while its original destination leads to a surviving tuple.

Later heap-only versions can also be removed once they are no longer needed. An intermediate line pointer without an index reference can become reusable rather than being preserved as a root. The source's [`heap_prune_chain()` discussion](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/pruneheap.c#L977-L1015) explains the distinction between the root and other chain members.

Pruning is an opportunity to reclaim space locally. It is not a promise that every update immediately removes all obsolete versions. Visibility and buffer-locking conditions still matter; [`heap_page_prune_opt()`](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/pruneheap.c#L193-L273) is explicitly an opportunistic path.

This is why a long-lived snapshot can defeat an otherwise attractive plan. If it still needs older tuple versions, the page cannot simply recycle their space. A page with ample room at the start can run out of room after repeated updates.

## Fillfactor buys room, not a HOT guarantee

The table's **fillfactor** controls how tightly insertions initially pack its pages. For a heap table, a lower setting leaves more room for updated versions. The [table-storage parameters](https://www.postgresql.org/docs/17/sql-createtable.html#SQL-CREATETABLE-STORAGE-PARAMETERS) document a default fillfactor of `100` and the update-space trade-off.

Think of fillfactor `70` as asking insertions to target roughly 70 percent page occupancy, leaving room for later work. It does not reserve a private 30-percent compartment for each row, and it does not force every new version onto the original page.

Here is a complete, small example:

```sql
CREATE TABLE hot_accounts (
    id BIGINT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    balance BIGINT NOT NULL
) WITH (fillfactor = 70);

INSERT INTO hot_accounts VALUES (42, 'ada@example.net', 100);
SELECT ctid, id, email, balance FROM hot_accounts;

UPDATE hot_accounts SET balance = 125 WHERE id = 42;
SELECT ctid, id, email, balance FROM hot_accounts;

UPDATE hot_accounts SET email = 'ada.new@example.net' WHERE id = 42;
SELECT ctid, id, email, balance FROM hot_accounts;
```

In the isolated check, the tuple locations were `(0,1)`, `(0,2)`, and `(0,3)`. The first update was HOT; the email update was not. **Both updates stayed on the same page.** Same-page placement is necessary, but by itself it does not prove an update was HOT.

Also notice that `ctid` changed after the HOT update. HOT does not make `ctid` a permanent application-level row identifier. Use the primary key for that purpose.

The trade-off is straightforward: extra room can reduce index maintenance, but a less densely packed table can require more pages, more cache space, and more scanning work. A write-heavy table and a mostly read-only table need not make the same choice.

## Measure the saved work, not just the row's new address

PostgreSQL exposes update counters through `pg_stat_user_tables`:

```sql
SELECT
    relname,
    n_tup_upd,
    n_tup_hot_upd,
    n_tup_newpage_upd,
    round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS hot_percent
FROM pg_stat_user_tables
WHERE relname = 'hot_accounts';
```

The [statistics-view documentation](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ALL-TABLES-VIEW) defines these counters:

- `n_tup_upd` counts updates, including HOT updates.
- `n_tup_hot_upd` counts HOT updates.
- `n_tup_newpage_upd` counts updates whose successor moved to another heap page.

The isolated example reported two updates, one HOT update, and zero new-page updates. Statistics are cumulative and can be delayed; a production diagnosis should compare counter changes over a representative interval instead of treating one lifetime ratio as a benchmark.

For example, suppose HOT's share drops after a schema change. Ask whether a new index now references a frequently changed column before immediately lowering fillfactor. Conversely, if updates increasingly leave the original page, investigate page space, tuple growth, and cleanup pressure.

These are diagnostic hypotheses, not guarantees about which setting will improve a particular workload.

## What HOT deliberately does not solve

HOT reduces redundant ordinary index entries. It does not turn PostgreSQL into an in-place-update engine or remove transaction visibility rules.

There are still new heap tuples, and ordinary logged-table updates still need WAL. An eligible update is not a “no storage write” operation.

HOT is also not a replacement for vacuum. PostgreSQL still needs maintenance for non-HOT versions, index cleanup, transaction-ID freezing, and visibility information. The [routine-vacuuming documentation](https://www.postgresql.org/docs/17/routine-vacuuming.html) explains those responsibilities.

Finally, avoiding new index entries does not guarantee an **index-only scan**. PostgreSQL still uses the visibility map to decide whether it can avoid checking the heap for visibility. That is a separate optimization described in [index-only scans](https://www.postgresql.org/docs/17/indexes-index-only-scans.html).

The design is valuable precisely because it is constrained: keep a stable index entrance, keep the chain local, and reclaim only versions that are safe to discard.

## A short source-reading route

If you want to connect the story to code, follow three questions:

1. **Why is this update eligible?** Read the same-buffer and changed-attribute checks in `heap_update()`.
2. **How does an index lookup find the right version?** Read `heap_hot_search_buffer()` and its snapshot checks.
3. **How can old bytes disappear without changing the index?** Read the root-redirection logic in `heap_prune_chain()`.

The important connection is not a clever flag by itself. It is the agreement between the writer, the index-driven reader, and the page-pruning code about what a stable line pointer means.

## References

1. [PostgreSQL 17: Heap-Only Tuples](https://www.postgresql.org/docs/17/storage-hot.html).
2. [PostgreSQL 17: Database Page Layout](https://www.postgresql.org/docs/17/storage-page-layout.html).
3. [PostgreSQL 17: System Columns](https://www.postgresql.org/docs/17/ddl-system-columns.html).
4. [PostgreSQL 17: CREATE TABLE storage parameters](https://www.postgresql.org/docs/17/sql-createtable.html#SQL-CREATETABLE-STORAGE-PARAMETERS).
5. [PostgreSQL 17: table statistics](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ALL-TABLES-VIEW).
6. [PostgreSQL 17: Routine Vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html).
7. [PostgreSQL 17: Index-Only Scans](https://www.postgresql.org/docs/17/indexes-index-only-scans.html).
8. [PostgreSQL 17.0 source: HOT design notes](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/README.HOT).
9. [PostgreSQL 17.0 source: heap updates and HOT lookup](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/heapam.c).
10. [PostgreSQL 17.0 source: page pruning](https://github.com/postgres/postgres/blob/d7ec59a63d745ba74fba0e280bbf85dc6d1caa3e/src/backend/access/heap/pruneheap.c).
