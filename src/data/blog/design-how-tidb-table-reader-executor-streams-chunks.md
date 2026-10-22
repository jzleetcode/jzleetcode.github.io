---
author: JZ
pubDatetime: 2026-10-22T18:31:00Z
modDatetime: 2026-10-22T18:31:00Z
title: System Design - How TiDB's Table Reader Streams Rows from TiKV
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow one TiKV range scan from TiDB's TableReader builder through a DAG request, SelectResult, ordered result handler, and output chunks."
---

## Table of contents

## A parcel list that spans storage nodes

Suppose a delivery service wants the parcels numbered 101 through 160:

```sql
CREATE TABLE parcels (
    id BIGINT PRIMARY KEY CLUSTERED,
    zone VARCHAR(16)
);

EXPLAIN SELECT id, zone FROM parcels WHERE id BETWEEN 101 AND 160;
```

TiDB may choose a `TableReader` at the server's **root** layer above a `TableRangeScan` in a `cop[tikv]` task. The exact plan depends on schema, statistics, optimizer choices, and version: check your own `EXPLAIN` rather than assume the sketch is the output. PingCAP's [EXPLAIN guide](https://docs.pingcap.com/tidb/stable/explain-overview/) distinguishes these tasks. Here we follow that _particular_ TiKV table-scan path, not an index double-read, TiFlash MPP plan, or a point get.

The mystery is not how to write the SQL. It is how a Go executor in TiDB turns the scan's logical ranges into storage requests and hands rows upward a batch at a time.

This walkthrough pins the source to [`pingcap/tidb` v8.5.8, commit `8b857ef`](https://github.com/pingcap/tidb/tree/8b857efa20363d50a8fa2ea7dd9809a85a61b115). We will focus on three types: **`TableReaderExecutor`**, its **`tableResultHandler`**, and the **`distsql.SelectResult`** interface. The builder is the bridge from a `PhysicalTableReader` plan to those runtime objects, not a fourth scanning worker.

## Three objects and a request

```text
                TiDB server                                     TiKV

  PhysicalTableReader + PhysicalTableScan
                |
                v
       executorBuilder.buildTableReader
                |
                v
       TableReaderExecutor -- kv.Request (ranges + DAG) -------> scan
                |                                                  |
                |<----- distsql.SelectResult <--- response -------+
                |
         tableResultHandler
                |
                v
          parent.Next(chunk)
```

Think of a **Chunk** as TiDB's reusable batch of rows. A parent executor supplies an empty-or-reusable Chunk to `Next`; the reader fills it and returns. It is _not_ an eager list containing the entire table. A **DAG request** describes the operators that the storage-side coprocessor should perform; the reader also supplies key ranges and a snapshot timestamp.

In [`buildNoRangeTableReader`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/builder.go#L3670-L3739), the builder constructs the coprocessor DAG from the table plans, obtains the snapshot timestamp, and creates `TableReaderExecutor` with the chosen table, ordering flags, columns, store type, and paging preference. The enclosing [`buildTableReader`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/builder.go#L3829-L3884) attaches the scan's ranges and handles alternative paths such as TiFlash MPP and partitioned tables. In other words: the builder describes **what** to scan; the executor owns **when** to request and consume it.

## Open: turn ranges into a storage request

[`TableReaderExecutor.Open`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L229-L350) prepares its memory tracker, refreshes correlated expressions if necessary, and groups the scan's ranges. It also splits ranges around the signed/unsigned `BIGINT` boundary when needed. That branch matters when a scan with an unsigned handle needs to preserve order; it is not an extra network round trip for every ordinary query.

For the ordinary TiKV case, `Open` passes the ranges to [`buildRespForGroupedRanges`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L396-L465). Each resulting request is assembled by [`buildKVReq`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L576-L630): it encodes handle ranges, attaches the DAG and snapshot timestamp, and passes through plan properties such as descending scan and `keepOrder`. The request builder applies session settings and targets the selected storage engine.

Then the reader calls [`SelectWithRuntimeStats`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/distsql.go#L161-L174). That wrapper attaches plan IDs for runtime statistics to a [`SelectResult` returned by `Select`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/distsql.go#L58-L137); `Select` sends the request through the KV client. Sending during `Open` does **not** mean all rows have already been decoded into TiDB Chunks. The result is an iterator for consuming responses.

## Next: ask for the next batch

```text
Parent              TableReaderExecutor     tableResultHandler      SelectResult
  | Next(empty Chunk)       |                       |                   |
  |------------------------>|                       |                   |
  |                         | nextChunk(Chunk)      |                   |
  |                         |---------------------->| Next(Chunk)       |
  |                         |                       |------------------>|
  |                         |                       |<-- decoded rows --|
  |                         |<--- filled Chunk ------|                   |
  |<-- rows or empty Chunk --|                       |                   |
```

[`TableReaderExecutor.Next`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L353-L378) delegates the fill to `tableResultHandler.nextChunk`, then computes virtual generated-column values if the output schema needs them. In the common case, the handler has one result and forwards `Next` to it. When the scan has split signed and unsigned ranges, the handler consumes its optional result first and only then reads the other result ([handler implementation](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L652-L684)).

Underneath, [`selectResult.Next`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/select_result.go#L490-L514) resets the supplied Chunk, fetches another partial response when needed, and decodes its response format into rows. An empty Chunk with no error means there is no next batch. `Next` is an _iterator boundary_, not necessarily one network request per Chunk: a response may carry data for more than one batch, and a single Chunk may need more data to fill it.

Finally, [`TableReaderExecutor.Close`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L380-L394) closes the handler's results and clears the stored KV ranges. A parent that stops early must still close its child; it cannot rely on reading until exhaustion to release result resources.

## Two knobs, and an ordering trap

The source shows exactly where two session settings enter this path:

- **`tidb_distsql_scan_concurrency`** feeds the request's DistSQL concurrency through [`RequestBuilder.SetFromSessionVars`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/request_builder.go#L339-L363). This controls parallel storage-side requests up to other request limits; it is **not** a count of `TableReaderExecutor` instances.
- **`tidb_enable_paging`** becomes the reader's paging preference in the [executor builder](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/builder.go#L3690-L3718) and reaches the [KV request](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L596-L628). It permits an eligible scan to use paging; setting it is not a promise that every scan pages or becomes faster.

Check the [system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) for availability, scope, and defaults in _your_ TiDB version before tuning. Neither knob changes the SQL guarantee about row order. `keepOrder` is a **physical plan property** passed to the KV request, while SQL results without `ORDER BY` have no ordering guarantee. The handler's two-part signed/unsigned ordering is an implementation detail for an ordered scan, not a substitute for `ORDER BY` in your query.

The mental model is: **the builder supplies a plan and snapshot; `Open` constructs storage requests; `Next` decodes only the next available batch; `Close` releases the result**. That is a useful route through the source whenever `EXPLAIN` shows a root `TableReader` reading a `cop[tikv]` scan.

## References

- [TiDB v8.5.8 source: `buildNoRangeTableReader` and `buildTableReader`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/builder.go#L3670-L3884) — plan-to-executor setup and alternate engine paths.
- [TiDB v8.5.8 source: `TableReaderExecutor` and `tableResultHandler`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/executor/table_reader.go#L136-L698) — request lifecycle, iteration, and ordered split ranges.
- [TiDB v8.5.8 source: `distsql.Select` and `SelectResult`](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/distsql.go#L58-L174) — transport and runtime-statistics wrapper; see [response decoding](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/select_result.go#L72-L95).
- [TiDB v8.5.8 source: DistSQL request builder](https://github.com/pingcap/tidb/blob/8b857efa20363d50a8fa2ea7dd9809a85a61b115/pkg/distsql/request_builder.go#L339-L369) — how scan concurrency and paging enter a request.
- [PingCAP: EXPLAIN overview](https://docs.pingcap.com/tidb/stable/explain-overview/) and [system variables](https://docs.pingcap.com/tidb/stable/system-variables/) — execution locations and release-specific settings.
