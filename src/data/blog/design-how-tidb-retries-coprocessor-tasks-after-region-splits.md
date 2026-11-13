---
author: JZ
pubDatetime: 2026-11-13T19:33:14Z
modDatetime: 2026-11-13T19:33:14Z
title: System Design - How TiDB Retries Coprocessor Tasks After Region Splits
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace one TiDB coprocessor scan from key ranges to region tasks, then follow an EpochNotMatch response through the region cache and task rebuild."
---

## Table of contents

- [A scan can outlive a region map](#a-scan-can-outlive-a-region-map)
- [TiDB turns key ranges into tasks](#tidb-turns-key-ranges-into-tasks)
- [Workers send each task through the client](#workers-send-each-task-through-the-client)
- [A split turns one task into several](#a-split-turns-one-task-into-several)
- [The settings that shape this path](#the-settings-that-shape-this-path)
- [References](#references)

## A scan can outlive a region map

Imagine a query is scanning keys in the range [m, z). When TiDB plans the read, its region cache says that range belongs to Region 12. While the request is travelling to TiKV, the cluster splits Region 12 into two smaller regions:

```text
  Before the split:
      Region 12: [m, z)
      TiDB sends one task for [m, z)

  After the split:
      Region 17: [m, t)
      Region 18: [t, z)
      The old Region 12 route no longer describes the key space.
```

TiDB is a SQL layer over TiKV's distributed key-value storage. TiKV stores keys in **Regions**, each of which owns a key range. Region boundaries can change as the cluster splits or merges regions, so a route cached when a query began can become stale before a storage request arrives. TiDB's coprocessor client has to notice that mismatch and rebuild the work using the newer region map.

This post follows one **ordinary, non-batched TiKV coprocessor request** through that path. It focuses on five pieces: TiDB's **CopClient**, **copIterator**, and **copIteratorWorker**; client-go's **ClientHelper** and **RegionRequestSender**; and the TiKV Coprocessor endpoint that returns the response. The source snapshots are pinned to upstream commits so the line references stay useful:

- [pingcap/tidb at 7a158c6](https://github.com/pingcap/tidb/tree/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae)
- [tikv/client-go at 0e38031](https://github.com/tikv/client-go/tree/0e380315584852ad1080f2ee71f5e844464c8549)
- [tikv/tikv at 33aa721](https://github.com/tikv/tikv/tree/33aa721d01822e97d31b4fe409abd4d70850bff1)

```text
  SQL executor
      |
      | request: start timestamp + key ranges
      v
  TiDB CopClient
      |
      | split ranges with the region cache
      v
  copIterator --> task sender --> workers
                              |
                              | ClientHelper / RegionRequestSender
                              v
                         TiKV Coprocessor
                              |
                 +------------+-------------+
                 |                          |
             rows returned             RegionError
                 |                          |
                 v                          v
             SQL reader      refresh region cache, rebuild tasks,
                             and send the new region requests
```

## TiDB turns key ranges into tasks

The request builder gives the storage client a timestamp and one or more key ranges. **CopClient.Send** passes the request to **BuildCopIterator**, which prepares a **copIterator** and the tasks it will read. **BuildCopIterator** handles ranges partition by partition, then asks **buildCopTasks** to locate the pieces of each range in the region cache.

**buildCopTasks** uses the cached region locations to break a key range into work items. A task records both its key ranges and the region metadata that TiDB plans to contact. In the example, the initial cache turns [m, z) into one task for Region 12. The task is a unit of remote coprocessor work, not a new SQL plan. TiKV still runs the same DAG request over the same snapshot timestamp.

The code also splits ranges along bucket boundaries where needed, and can combine some work for efficient sending. Those details affect how many tasks are created, but not the key idea: each task includes a particular key range and the region version TiDB believes owns it. See [BuildCopIterator](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L124) and [buildCopTasks](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L529).

## Workers send each task through the client

When the iterator opens, it starts worker goroutines and a task sender. The sender feeds region tasks to the workers while limiting how many requests are in flight. Each worker turns one task into a Coprocessor request, including the transaction's start timestamp and that task's ranges, then sends it through **ClientHelper.SendReqCtx**.

**ClientHelper** is a small bridge in **tikv/client-go**. It attaches lock-resolution hints and delegates region-aware sending to **RegionRequestSender**. That sender selects a store and sends the RPC. Some problems, such as a leader change where the new leader is known, can be handled inside client-go by updating the cached leader and retrying.

On the TiKV side, the KV service receives the Coprocessor request and passes it to the Coprocessor endpoint. The endpoint evaluates the request and converts a region error into the structured **region_error** field of the response. The application can distinguish that from a successful response containing rows.

The main handoff is visible in TiDB's [copIterator.open and worker setup](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L1231), the worker's [handleTaskOnce](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L1762), client-go's [ClientHelper.SendReqCtx](https://github.com/tikv/client-go/blob/0e380315584852ad1080f2ee71f5e844464c8549/txnkv/txnsnapshot/client_helper.go#L141), and TiKV's [Coprocessor RPC handler](https://github.com/tikv/tikv/blob/33aa721d01822e97d31b4fe409abd4d70850bff1/src/server/service/kv.rs#L595). TiKV's [response conversion](https://github.com/tikv/tikv/blob/33aa721d01822e97d31b4fe409abd4d70850bff1/src/coprocessor/endpoint.rs#L1417) keeps a region error separate from a lock error or a general execution error.

## A split turns one task into several

The **region epoch** is a version stamp attached to region metadata. Its version changes when the key range is split or merged; its configuration version changes when the region's peer membership changes. The request carries the epoch TiDB saw when it built the task. If that stamp is old, the server can return **EpochNotMatch** along with the current regions so the client can refresh its map.

When TiKV reports that the request's region epoch is stale, client-go processes the region error. For an **EpochNotMatch** response that includes current region metadata, **RegionCache.OnRegionEpochNotMatch** replaces the old cache entry with the current regions. Client-go then returns the response to TiDB when the request needs to be split across the new region boundaries; retrying the same old region request would not be enough.

Back in TiDB, **copIteratorWorker.handleCopResponse** sees the region error, backs off under the region-miss category, and calls **buildCopTasks** again for the original task's key ranges. With the refreshed cache, the original [m, z) range becomes two tasks:

```text
  Original task:
      Region 12, ranges [m, z)

  Rebuilt tasks:
      Region 17, ranges [m, t)
      Region 18, ranges [t, z)
```

The worker puts those remaining tasks back into its work loop. The new requests use the same start timestamp and the same logical query; only the storage regions that receive the ranges have changed. As each response arrives, the iterator returns the result subsets to the SQL reader, preserving the requested order when the request requires it.

The retry is deliberately bounded. TiDB creates a backoff object per region, the normal query deadline can cancel the work, and the worker returns an error when it cannot finish within those limits. The code also has special handling for batched tasks, paging responses, and locks; they are outside the ordinary single-task path illustrated here. In particular, paging must track which part of a range has already been returned before deciding what remains to retry.

The key division of responsibility is:

1. **TiKV reports which region metadata is current.**
2. **Client-go refreshes the region cache and handles errors that it can retry on its own.**
3. **TiDB rebuilds the key-range tasks when the original request must be repartitioned.**

The relevant source is TiDB's [handleCopResponse](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L2236), client-go's [RegionRequestSender retry loop and epoch handling](https://github.com/tikv/client-go/blob/0e380315584852ad1080f2ee71f5e844464c8549/internal/locate/region_request.go#L981), and [RegionCache.OnRegionEpochNotMatch](https://github.com/tikv/client-go/blob/0e380315584852ad1080f2ee71f5e844464c8549/internal/locate/region_cache.go#L2888).

## The settings that shape this path

- **tidb_distsql_scan_concurrency** controls how many DistSQL scan workers TiDB can run for a request. Higher concurrency can keep more regions busy in parallel, but it can also increase concurrent requests and resource use. It is a global and session system variable. The request builder may reduce concurrency for a simple ordered scan when the default is in use; an explicit session setting is respected. See the [system variable reference](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_distsql_scan_concurrency), [variable definition](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/sessionctx/variable/sysvar.go#L2376), and [request builder](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/distsql/request_builder.go#L91).
- **tikv-client.copr-req-timeout** is the timeout for a single Coprocessor request. TiDB reads this timeout when creating the RPC. The current configuration reference says not to modify it, so treat it as an operational limit rather than a tuning suggestion. See the [configuration file reference](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/#copr-req-timeout) and the timeout use in [handleTaskOnce](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go#L1837).

The system variable changes the amount of work sent in parallel. The request timeout changes how long a single RPC may take. Neither turns a stale region into a SQL error by itself: region metadata refresh and task rebuilding are what let this scan continue.

## References

1. TiDB documentation, [TiDB Architecture](https://docs.pingcap.com/tidb/stable/tidb-architecture)
2. TiDB documentation, [System Variable Reference](https://docs.pingcap.com/tidb/stable/system-variables/)
3. TiDB documentation, [Configuration File Parameters](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/)
4. TiDB source, [pkg/store/copr/coprocessor.go](https://github.com/pingcap/tidb/blob/7a158c6afbea79d5f8da9cddb6e594bb1c7bfdae/pkg/store/copr/coprocessor.go)
5. TiKV client-go source, [txnkv/txnsnapshot/client_helper.go](https://github.com/tikv/client-go/blob/0e380315584852ad1080f2ee71f5e844464c8549/txnkv/txnsnapshot/client_helper.go) and [internal/locate/region_request.go](https://github.com/tikv/client-go/blob/0e380315584852ad1080f2ee71f5e844464c8549/internal/locate/region_request.go)
6. TiKV source, [src/server/service/kv.rs](https://github.com/tikv/tikv/blob/33aa721d01822e97d31b4fe409abd4d70850bff1/src/server/service/kv.rs) and [src/coprocessor/endpoint.rs](https://github.com/tikv/tikv/blob/33aa721d01822e97d31b4fe409abd4d70850bff1/src/coprocessor/endpoint.rs)
