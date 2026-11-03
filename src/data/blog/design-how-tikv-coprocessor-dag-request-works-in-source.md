---
author: JZ
pubDatetime: 2026-11-03T19:45:00Z
modDatetime: 2026-11-03T19:45:00Z
title: System Design - How a TiKV Coprocessor DAG Request Works in Source
tags:
  - design-database
  - design-system
description: "A source-code tour of TiKV's coprocessor DAG read path: KvService receives the RPC, Endpoint validates and schedules it, and DagHandlerBuilder turns a protobuf plan plus snapshot into execution."
---

## Table of contents

## A small journey through a distributed read

Consider this query:

```sql
SELECT name FROM users WHERE id BETWEEN 100 AND 110;
```

TiDB parses SQL and creates a physical plan. For ranges that belong in TiKV, it sends a protobuf **coprocessor request**. The request contains a compact DAG (directed acyclic graph) of operations such as table scan, filter, and projection. TiKV executes that work near the data and sends back rows, rather than sending every raw row to TiDB first.

This post follows the unary DAG read path in the current `tikv/tikv` source. It deliberately stays focused on three cooperating pieces:

1. `KvService::coprocessor` receives the gRPC call.
2. `Endpoint` parses, validates, schedules, and protects the request.
3. `dag::DagHandlerBuilder` constructs a handler that runs the requested operators over a snapshot.

```
 TiDB                         TiKV
 ----                         -------------------------------------------
  physical plan
       |  coprocessor::Request (DAG + key ranges + start_ts)
       +--------------------> KvService::coprocessor
                                     |
                                     v
                                Endpoint
                         parse / validate / snapshot / limits
                                     |
                                     v
                           DagHandlerBuilder -> RequestHandler
                                     |
                                     v
                           scan, filter, project on local data
                                     |
       <--------------------- coprocessor::Response (rows or error)
```

The word **DAG** is about the request's executor pipeline, not about TiKV's Raft replication graph. It describes the computation TiKV should perform for this read.

## 1. `KvService` starts an asynchronous request

The gRPC entry point is [`KvService::coprocessor`](https://github.com/tikv/tikv/blob/master/src/server/service/kv.rs). The method first rejects a request whose cluster ID does not match the server. It records resource-group information and starts a timer, then hands the request to `future_copr`.

```rust
let begin_instant = Instant::now();
let future = future_copr(&self.copr, Some(ctx.peer()), req);
let task = async move {
    let resp = future.await?.consume();
    sink.success(resp).await?;
    // Record duration and request-source metrics.
    ServerResult::Ok(())
};
ctx.spawn(task);
```

The RPC thread does not synchronously scan RocksDB. `ctx.spawn(task)` lets gRPC continue serving other connections while the future waits for the coprocessor endpoint. When the work finishes, the task writes either a normal protobuf response or an error to the unary response sink.

The source also charges a configured resource group before executing. This matters in a shared cluster: expensive analytical reads should not be able to hide among short transactional reads simply because both use the same RPC method.

## 2. `Endpoint` turns bytes into a safe plan

`future_copr` reaches TiKV's [`Endpoint`](https://github.com/tikv/tikv/blob/master/src/coprocessor/endpoint.rs), the owner of the read pool and request guards. Its `parse_request_and_check_memory_locks` path selects the API version, then the DAG branch decodes `coppb::Request.data` into `DagRequest`.

The endpoint does more than deserialization:

- It preserves the request's key ranges and MVCC `start_ts` in a `ReqContext`. If `start_ts` was omitted at the outer level, it uses the DAG fallback timestamp.
- It identifies a table scan or index scan for metrics and records whether the scan is descending.
- It calls `check_memory_locks`. A pessimistic transaction may have a lock visible in TiKV's in-memory concurrency manager; a read that conflicts must not quietly return an invalid snapshot result.
- It sets the protobuf recursion limit before parsing. Malformed or deeply nested input must not make parsing consume unbounded resources.

At this stage, the endpoint has intentionally not taken a storage snapshot. It has built a recipe—a `RequestHandlerBuilder` closure—and a context describing the limits and consistency point for that future handler.

```
raw protobuf request
        |
        v
Endpoint parses DagRequest
        |
        +--> ReqContext: ranges, start_ts, deadline, isolation level
        |
        +--> RequestHandlerBuilder: how to make a DAG handler later
        |
        v
schedule onto the coprocessor read pool
```

This separation is useful. Queueing can take time, so a snapshot should be taken only when the request is ready to run; otherwise a queued request could use an unnecessarily old view and spend part of its deadline before execution starts.

## 3. Snapshot first, then build the DAG handler

Inside `Endpoint::handle_unary_request_impl`, TiKV marks the request as scheduled and checks its deadline. It asynchronously obtains an in-memory snapshot through the read engine, checks the deadline again, and compares bucket metadata carried by the request with the snapshot's current bucket version. A mismatch becomes a region-style error so the caller can refresh routing metadata.

Only then does the endpoint invoke the builder. In the normal path it creates a `SnapshotStore` configured with the snapshot, `start_ts`, isolation level, cache setting, and lock access lists. It passes that store to `dag::DagHandlerBuilder` together with ranges, a deadline, batch-row limits, paging limits, and the quota limiter.

```rust
dag::DagHandlerBuilder::<_, _, F>::new(
    dag,
    req_ctx.ranges.clone(),
    store,
    extra_store_accessor,
    req_ctx.deadline,
    batch_row_limit,
    is_streaming,
    req.get_is_cache_enabled(),
    paging_size,
    max_keys_read,
    paging_size_bytes,
    quota_limiter,
)
.data_version(data_version)
.build()
```

The result implements TiKV's `RequestHandler` interface. `handle_unary_request_impl` calls `handler.handle_request()`, wraps the future with deadline checking, tracking, and optional concurrency limiting, then materializes a protobuf response.

That is the heart of the collaboration: `KvService` owns network lifetime, `Endpoint` owns admission and consistency protections, and the DAG handler owns query-specific execution. Each layer can change without turning the RPC method into one enormous function.

## The important protection rails

The source makes several operational choices visible.

| Guard                 | Why it exists                                                  | Where it appears                        |
| --------------------- | -------------------------------------------------------------- | --------------------------------------- |
| Deadline              | A request that waited in a queue should not run forever.       | `ReqContext` and `check_deadline`       |
| Read-pool semaphore   | Prevents too many expensive requests from executing at once.   | `Endpoint` shared/background semaphores |
| Memory lock check     | Preserves correct behavior with pessimistic transactions.      | `check_memory_locks` before scheduling  |
| Snapshot + `start_ts` | Gives MVCC reads a stable version of data.                     | `SnapshotStore::new`                    |
| Bucket-version check  | Detects stale region/routing metadata.                         | `handle_unary_request_impl`             |
| Quota limiter         | Makes resource control part of execution, not just accounting. | `DagHandlerBuilder` input               |

One easy-to-miss branch is the cache path. If a request supplies `cache_match_version` and that version matches the snapshot's data version, the endpoint builds a `CachedRequestHandler` instead of invoking the ordinary DAG builder. The version comparison is what prevents a cached result from being reused after relevant data changed.

## Configuration knobs worth knowing

The endpoint obtains several values from TiKV's coprocessor configuration when it is created. The most consequential ones for this path are:

- `coprocessor.max-concurrency`: bounds ordinary coprocessor read concurrency.
- `coprocessor.max-bg-concurrency`: can give `ANALYZE` requests a separate, limited lane so background work does not crowd out foreground reads.
- `coprocessor.max-handler-duration`: becomes the soft request handling deadline used by `ReqContext`.
- `coprocessor.batch-row-limit` and `coprocessor.stream-batch-row-limit`: control how many rows a handler returns in a batch.
- `coprocessor.end-point-stream-channel-size`: bounds buffering for streaming requests; unary reads still share the surrounding endpoint machinery.

Names and defaults can change between TiKV releases, so treat the current [TiKV configuration template](https://github.com/tikv/tikv/blob/master/etc/config-template.toml) as the authority before tuning a production cluster. Raising concurrency may improve throughput only until CPU, storage, or memory becomes the new bottleneck.

## A debugging mental model

When a TiDB query is slow, this path suggests a useful order of questions:

1. Did TiDB create a large range or an expensive DAG?
2. Did the request wait for the coprocessor read pool or semaphore?
3. Did snapshot acquisition or lock checking wait?
4. Did the DAG scan too many keys before filtering, hit a paging limit, or exceed its deadline?
5. Did TiKV return a bucket or region error because TiDB's metadata was stale?

That sequence prevents a common mistake: assuming every slow SQL statement is a storage scan. The request may be waiting for admission, retrying after a topology change, or doing exactly the work that its pushed-down plan asked for.

## References

1. TiKV [`KvService` coprocessor RPC source](https://github.com/tikv/tikv/blob/master/src/server/service/kv.rs)
2. TiKV [`Endpoint` source](https://github.com/tikv/tikv/blob/master/src/coprocessor/endpoint.rs)
3. TiKV [configuration template](https://github.com/tikv/tikv/blob/master/etc/config-template.toml)
4. TiDB documentation, [TiKV coprocessor cache](https://docs.pingcap.com/tidb/stable/coprocessor-cache/)
5. TiDB documentation, [SQL execution plan overview](https://docs.pingcap.com/tidb/stable/explain-overview/)
