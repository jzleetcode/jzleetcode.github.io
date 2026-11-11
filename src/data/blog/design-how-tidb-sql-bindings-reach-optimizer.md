---
author: JZ
pubDatetime: 2026-11-11T19:35:37Z
modDatetime: 2026-11-11T19:39:53Z
title: System Design - How TiDB SQL Bindings Reach the Optimizer
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace a TiDB global SQL binding from CREATE BINDING through mysql.bind_info and per-instance caches to optimizer hint application."
---

## Table of contents

- [A query needs a predictable access path](#a-query-needs-a-predictable-access-path)
- [A binding connects SQL to a hint](#a-binding-connects-sql-to-a-hint)
- [Follow CREATE GLOBAL BINDING through TiDB](#follow-create-global-binding-through-tidb)
- [A later query looks up the binding](#a-later-query-looks-up-the-binding)
- [Settings that affect the path](#settings-that-affect-the-path)
- [What a binding does not promise](#what-a-binding-does-not-promise)
- [References](#references)

This walkthrough follows the public TiDB source at commit **6c452bbb** ([full commit](https://github.com/pingcap/tidb/commit/6c452bbb498a0fcc1449246d37a47352951b0faf)). It follows five pieces: **SQLBindExec**, **bindingOperator**, **Domain**, **bindingCacheUpdater**, and the planner's binding-match path. The SQL Plan Management documentation describes the user-facing behavior; the source links below show how that behavior is wired together.

## A query needs a predictable access path

Suppose an application repeatedly runs this query:

~~~sql
SELECT * FROM orders WHERE customer_id = 42;
~~~

When the table is small, the optimizer might choose a table scan. Later, after the table grows or statistics change, it may prefer a different index. If a measured workload needs a particular access path, an operator can create a binding that attaches an optimizer hint to the matching SQL without editing the application's query:

~~~sql
CREATE GLOBAL BINDING FOR
SELECT * FROM orders WHERE customer_id = 42
USING
SELECT /*+ USE_INDEX(orders, idx_customer_id) */ *
FROM orders WHERE customer_id = 42;
~~~

The FOR statement describes the application query. The USING statement supplies the SQL and hint TiDB should use when that query matches. GLOBAL makes the binding available across sessions; omitting the scope creates a session binding by default.

The binding is not a saved physical plan. TiDB stores the normalized SQL and the bound SQL, then uses the bound SQL's hint while it optimizes a matching query. Constants are normalized, so the example can match the same query with a different customer ID.

## A binding connects SQL to a hint

Two paths meet in TiDB: an administrative path that writes a binding and a query path that looks it up.

~~~text
CREATE GLOBAL BINDING ... USING ...
                 |
                 v
           SQLBindExec
                 |
                 v
  Domain.BindingHandle / bindingOperator
       | validate the hint
       | write mysql.bind_info
       v
  bindingCacheUpdater -----> this TiDB instance's LRU cache
       |                                  |
       | each instance refreshes          |
       | from mysql.bind_info              |
       +----------------------------------+

Application SELECT
       |
       v
planner.optimize -> MatchSQLBinding
       | normalize SQL and check session binding
       | then check global binding cache
       v
apply bound hint -> optimize a physical plan -> execute
~~~

The persistent system table is the shared record. Each TiDB server keeps a local binding cache so the optimizer can look up a match in memory while planning a query. A query does not issue a system-table read for every binding check.

## Follow CREATE GLOBAL BINDING through TiDB

The executor's **SQLBindExec.createSQLBind** turns the parsed binding details into **bindinfo.Binding** values. For a global binding, it calls the handle stored on the TiDB **Domain**; for a session binding, it uses the current session's handle. The executor itself chooses the scope and hands the details off rather than writing the system table directly.

**bindingOperator.CreateBinding** validates the hint and carries out the global write. It locks **mysql.bind_info** while coordinating with other TiDB instances, marks an older row for the same normalized SQL as deleted, and inserts the new binding. Once the write succeeds, it asks the cache updater to reload changed rows.

**Domain** owns the global binding handle. During startup it loads existing bindings, and its maintenance loop periodically reloads changes from storage. The **bindingCacheUpdater** reads rows from **mysql.bind_info**, selects the current binding for each SQL digest, and stores it in an LRU cache whose memory limit is configurable. This arrangement gives each TiDB instance a local read path while keeping the system table as the shared source of truth.

~~~text
SQLBindExec
    |
    | create bindinfo.Binding
    v
Domain.BindingHandle
    |
    v
bindingOperator.CreateBinding
    | validate hint
    | write mysql.bind_info
    | reload changed bindings
    v
bindingCacheUpdater -> per-instance LRU cache
~~~

## A later query looks up the binding

When TiDB optimizes a statement, **planner.optimize** calls **MatchSQLBinding**. The match function first checks **tidb_use_plan_baselines**; if it is off, the normal optimizer path proceeds without using a binding. If bindings are enabled, TiDB normalizes the SQL and collects its table names. It checks the current session's binding first, then asks the global handle for a match in the instance's cache.

On a hit, the planner attaches the saved hint to the statement and optimizes with it. The resulting physical plan still comes from the optimizer. In the example, **USE_INDEX** guides access-path selection; TiDB does not simply deserialize a prebuilt plan from **mysql.bind_info**.

The end-to-end path is:

~~~text
Original SQL
    |
    v
Normalize constants and identify tables
    |
    v
Session cache -- hit --> use session binding --+
    |                                           |
    +-- miss --> Global cache -- hit --> global binding
                     |                         |
                     +-- miss --> no binding --+
                                               |
                                               v
                              optimize with a hint if matched
                              otherwise optimize normally
                                               |
                                               v
                                      physical plan executes
                                               |
                                               v
                              TiKV runs pushed-down storage work
~~~

The last arrow is a boundary, not another part of binding lookup. The binding and plan choice live in TiDB. If the chosen plan pushes a scan or other supported operator down to TiKV, TiKV's coprocessor path handles that storage work.

## Settings that affect the path

Creating bindings requires the **SUPER** privilege. The SQL Plan Management documentation describes this requirement.

| Setting | Default and scope | Why it matters |
| --- | --- | --- |
| **tidb_use_plan_baselines** | **ON**; session or global | Enables matching and using bindings during optimization. |
| **tidb_capture_plan_baselines** | **OFF**; global | Enables automatic capture of frequently used plans from Statement Summary. |
| **tidb_mem_quota_binding_cache** | **64 MiB**; global | Limits the binding memory cache on each TiDB instance. Increase it if the cache cannot hold the bindings you need; run **ADMIN RELOAD BINDINGS** after changing it. |

Automatic capture is separate from manually creating a binding. It depends on Statement Summary being enabled and can create bindings for statements that appear repeatedly. If you only want to test the explicit example, leave automatic capture off and create one binding directly.

## What a binding does not promise

A binding guides the optimizer; it does not guarantee that the hinted plan will remain valid or fast for every data distribution. Check the resulting plan with **EXPLAIN** and inspect warnings if a binding cannot be used. A binding also cannot remove time spent in unrelated bottlenecks such as lock waits, TiKV storage stalls, or network delays. PingCAP's engineering write-up on [reducing P999 latency in TiDB 8.5](https://www.pingcap.com/blog/tidb-8-5-reduce-p999-latency-distributed-database/) shows why tail latency can involve work across both TiDB and TiKV.

For plan troubleshooting, this is also different from TiDB's prepared plan cache: a binding supplies hints to planning, while a plan cache can reuse a previously generated plan when its cache rules allow it. See [How TiDB Reuses Prepared Plans](/posts/design-how-tidb-prepared-plan-cache-works/).

## References

1. TiDB documentation, [SQL Plan Management](https://docs.pingcap.com/tidb/stable/sql-plan-management/).
2. TiDB documentation, [CREATE BINDING](https://docs.pingcap.com/tidb/stable/sql-statement-create-binding/).
3. TiDB documentation, [System Variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_use_plan_baselines-new-in-v40), including **tidb_use_plan_baselines**, **tidb_capture_plan_baselines**, and **tidb_mem_quota_binding_cache**.
4. TiDB source, [SQLBindExec.createSQLBind](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/executor/bind.go#L124-L156).
5. TiDB source, [bindingOperator.CreateBinding](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/bindinfo/binding_operator.go#L64-L74) and its [system-table insert](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/bindinfo/binding_operator.go#L120-L136).
6. TiDB source, [Domain startup and cache refresh](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/domain/domain.go#L1655-L1704) and [bindingCacheUpdater](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/bindinfo/binding_cache.go#L63-L134).
7. TiDB source, [MatchSQLBinding](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/bindinfo/binding.go#L137-L165), [session and global matching](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/bindinfo/binding.go#L214-L252), and [optimizer hint application](https://github.com/pingcap/tidb/blob/6c452bbb498a0fcc1449246d37a47352951b0faf/pkg/planner/optimize.go#L297-L359).
8. TiKV source, [Coprocessor endpoint](https://github.com/tikv/tikv/blob/3b72fdb6b9a74d34368ee18aeb01eef5a78a4c2a/src/coprocessor/endpoint.rs).
9. TiDB blog, [Reducing P999 Latency in Distributed Databases with TiDB 8.5](https://www.pingcap.com/blog/tidb-8-5-reduce-p999-latency-distributed-database/).
