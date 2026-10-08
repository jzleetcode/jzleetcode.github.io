---
author: JZ
pubDatetime: 2026-10-08T18:00:00Z
modDatetime: 2026-10-08T18:00:00Z
title: System Design - How TiDB Prepared Plan Cache Reuses Plans Safely
tags:
  - design-system
  - design-database
description: "A source walkthrough of TiDB's prepared plan cache: PlanCacheStmt, LRUPlanCache, PlanCacheValue, environment keys, parameter-type matching, range rebuilding, and the configurations that control reuse."
---

## Table of contents

## Context

This post follows one prepared statement through TiDB's plan cache. It is for engineers who know basic SQL and want to see how a database reuses work without reusing the wrong answer.

Imagine a service repeatedly asking for customers within an age range:

```sql
SELECT customer_id FROM customers WHERE age >= ? AND age < ?;
```

One request supplies `(30, 40)`, and another supplies `(18, 20)`. The query has the same structure, but its result and the storage ranges it must read are different.

The attractive shortcut is to reuse the **execution plan**: the operator tree describing how to get the rows. The dangerous shortcut is to reuse yesterday's parameter-dependent ranges or yesterday's result rows. TiDB's prepared plan cache takes the first shortcut and checks the second one carefully.

**Source baseline:** all implementation links below point to [TiDB v8.5.0, commit `d13e52ed6e22cc5789bed7c64c861578cd2ed55b`](https://github.com/pingcap/tidb/tree/d13e52ed6e22cc5789bed7c64c861578cd2ed55b). This is a release-specific walkthrough, not a claim about the newest branch. We focus on the session-level cache, with instance-level caching disabled, and leave the specialized Point Get executor shortcut out of scope.

## The five pieces we will follow

The story stays within three main structs and two coordinating functions:

| Piece                      | Responsibility                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `PlanCacheStmt`            | Holds the prepared AST, parameter markers, schema information, and statement metadata. |
| `GetPlanFromPlanCache()`   | Coordinates parameter binding, cache lookup, reuse, and fallback optimization.         |
| `LRUPlanCache`             | Stores candidate plans in per-key buckets and evicts old entries.                      |
| `PlanCacheValue`           | Wraps a physical plan, output-column names, parameter types, and statement hints.      |
| `RebuildPlan4CachedPlan()` | Refreshes parameter-dependent ranges and rejects unsafe reuse.                         |

An **AST**, or abstract syntax tree, represents the parsed SQL. A physical plan represents chosen execution operators. They are related, but they are not the same object.

```text
                 prepared statement + current parameters
                                  |
                                  v
                  GetPlanFromPlanCache()
                  reads PlanCacheStmt
                  binds parameters / checks schema
                                  |
                       NewPlanCacheKey()
                                  |
                                  v
                  LRUPlanCache.Get(key, types)
                                  |
                       +----------+----------+
                       | hit                 | miss
                       v                     |
                 PlanCacheValue              |
                       |                     |
                       v                     |
             RebuildPlan4CachedPlan()        |
                       |                     |
                 +-----+---------+           |
                 | safe          | rejected  |
                 v               +---------->|
            return plan                      v
                                       run optimizer
                                             |
                                 optionally cache new value
                                             |
                                      return fresh plan
```

TiDB owns this cache in its SQL layer. TiKV does not choose the cached SQL plan; storage execution comes later, after this planning decision.

## A prepared statement is the starting point, not a cached result

[`PlanCacheStmt`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L545-L587) carries the parsed statement and the metadata needed to interpret it again. Important fields include `PreparedAst`, `Params`, `SchemaVersion`, `RelateVersion`, and `StmtCacheable`.

The `Params` slice identifies the `?` positions. `SchemaVersion` and the related-table revision map help distinguish statements interpreted against different table definitions. Cacheability metadata records whether this statement can participate in reuse.

[`PlanCacheValue`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L423-L447) is the cached product of planning. It contains the plan, output-column metadata, parameter types, and hints. It does **not** contain the query's result rows.

Therefore, a hit still executes against the data visible to the current statement or transaction. This is a planning shortcut, not a result cache.

## Execution begins by binding the current parameters

The first call inside [`GetPlanFromPlanCache()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go#L183-L235) is `planCachePreprocess()`.

Before lookup, the [preprocessing code](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go#L57-L159) checks the parameter count and installs the new values in the parameter markers and session context. It also handles metadata locking and schema checks. If the schema no longer matches, it preprocesses the statement against the applicable schema again rather than blindly trusting old resolved objects.

Only then does the coordinator decide whether this execution may use the cache, build a key, and derive the parameter types.

The ordering matters: **a cached operator tree must see this execution's parameters before its ranges are rebuilt.**

## Why the cache key contains more than SQL

The query text alone is not enough to decide whether two executions may share a plan.

For example, identical SQL prepared in different databases can refer to different tables. TiDB [captures the statement database in `StmtDB` during preparation](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L207-L218); the key uses that value, falling back to `CurrentDB` only when it is empty. Changing `USE` does not by itself retarget an existing prepared statement. SQL mode and collation can change expression behavior. A schema change can invalidate earlier column or index choices.

[`NewPlanCacheKey()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L256-L339) includes statement text and environmental information such as:

- Authenticated user and host, plus the statement database.
- Schema version and revisions of related tables.
- SQL mode, time-zone offset, connection charset, and collation.
- Eligible read engines and partition-pruning mode.
- Matched SQL bindings and other planning-sensitive settings.

Later in the function, [statistics and transaction-related information](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L380-L413) also participate. Fresh statistics affect the key when their invalidation switch is enabled; dirty tables and transaction state can affect it too.

This is a selected explanation, not a complete key-field reference. Ordinary predicate values such as the two age bounds are not simply pasted into the key. Parameterized `LIMIT` clauses, among other special cases, have additional rules.

The key expresses: "This is the same statement in an environment where the previous planning decision may still apply."

## One key can contain more than one parameter-type variant

The [`LRUPlanCache` struct](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_lru.go#L43-L61) uses a map from key strings to **buckets**. A bucket can contain multiple cached values.

```text
environment key K
       |
       v
  +------------------------------------------------+
  | bucket                                         |
  | candidate A: integer parameters -> plan A       |
  | candidate B: string parameters  -> plan B       |
  +------------------------------------------------+
       |
       | current parameter types choose a compatible value
       v
  cache-wide LRU list records recency of each entry
```

These are illustrative variants, not a guarantee that every query caches both plans. [`Get()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_lru.go#L81-L94) finds the bucket and asks `pickFromBucket()` for a compatible value. A hit moves that entry toward the most-recently-used end of the list.

The [type-compatibility check](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go#L605-L636) considers type, charset, collation, integer signedness, and relevant decimal precision and scale. Compatibility is not identical to comparing every field of a type object, nor is it unrestricted conversion between arbitrary types.

On insertion, [`Put()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_lru.go#L96-L125) updates a compatible entry or adds another. When the entry count exceeds capacity, it removes the oldest entry. Separate [memory-pressure logic](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_lru.go#L228-L249) can also evict entries.

## A lookup hit is only a candidate for reuse

Suppose the optimizer originally chose an index scan on `age`. Its conceptual range was:

```text
first execution:   age >= 30 AND age < 40   -> [30, 40)
next execution:    age >= 18 AND age < 20   -> [18, 20)

Reusable:          the index-scan operator structure
Must refresh:      the parameter-dependent range
Not cached here:   customer rows returned by the scan
```

These are mathematical intervals, not TiKV's encoded byte keys. The physical plan may differ depending on the table, statistics, and optimizer choices. The lesson is the relationship between the operator and its current bounds.

After lookup, [`adjustCachedPlan()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go#L259-L283) handles the reuse path, including the applicable privilege check. It calls `RebuildPlan4CachedPlan()` before reporting a successful cache hit.

[`RebuildPlan4CachedPlan()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_rebuild.go#L30-L49) invokes the range rebuilder. The [operator dispatch](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_rebuild.go#L77-L125) descends through reader operators and refreshes table or index scan ranges. This is not a fresh cost-based search through every possible plan.

If rebuilding fails, the function appends a warning and returns `false`. If range rebuilding disables caching for safety, it also returns `false`. The coordinator then falls back to the optimizer.

**A reusable plan is a structure plus checks and refresh work, not a frozen object that bypasses correctness.**

## Why some parameter changes must reject reuse

There is a deeper trap than stale bounds: optimization can discard work that appears redundant for one set of parameter values.

Imagine a predicate `age = ? AND age = ?`. Equal values and unequal values have different implications. A plan must retain enough information to evaluate the current request; reusing an overly specialized earlier plan is not always safe.

The [range safety helpers](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_rebuild.go#L393-L434) check whether the rebuilt access conditions remain safe. Related regression tests illustrate why "same SQL" is not sufficient.

Two useful upstream tests to read are:

- [`TestIssue38269`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_test.go#L268-L296): changes the parameters of an index-join query, checks a cache hit, and checks that the displayed range uses the new values.
- [`TestIssue38533`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_test.go#L298-L315): checks a query with repeated equality predicates whose plan is not reused.

These are source-reading examples. They are not a claim that we ran TiDB's upstream integration suite or a live cluster for this post.

## What happens after a miss

The [fallback path](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go#L286-L323) calls `OptimizeAstNode()`. It then checks whether the produced plan is cacheable before wrapping and storing it.

An uncacheable statement can still execute normally. Caching is an optional optimization, not permission to run the SQL.

```text
Cache miss or rejected candidate
               |
               v
      optimize current statement
               |
         plan cacheable?
          /          \
        yes           no
         |             |
    cache value        |
         |             |
         +------+------+
                |
                v
          return fresh plan
```

Likewise, saving optimizer work does not eliminate storage reads, RPCs, joins, or result construction. A high hit rate cannot make an expensive execution plan cheap by itself.

## The configuration knobs that explain observed behavior

These defaults are read from the pinned release's [constants](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/tidb_vars.go#L1442-L1472) and [variable registration](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go#L1323-L1399), not assumed from the newest documentation.

| Variable                                      | v8.5.0 default  | Why it matters here                                                          |
| --------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `tidb_enable_prepared_plan_cache`             | `ON`            | Enables this optimization for eligible prepared executions.                  |
| `tidb_session_plan_cache_size`                | `100`           | Limits session-cache entries; it is not a byte budget or a result-row count. |
| `tidb_plan_cache_max_plan_size`               | `2097152` bytes | Admission threshold for estimated physical-plan size; `0` disables it.       |
| `tidb_plan_cache_invalidation_on_fresh_stats` | `ON`            | Lets updated statistics change the cache key and trigger replanning.         |
| `tidb_enable_instance_plan_cache`             | `OFF`           | Selects a different, shared-cache path when enabled.                         |

The statistics default is also explicit in [its constant](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/tidb_vars.go#L1533) and [registration](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go#L3069-L3072). The [maximum-plan-size check](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cacheable_checker.go#L558-L561) is an admission check against estimated physical-plan memory, not a continuously enforced budget for the complete cached object.

Session-cache contents belong to a session. That helps explain why connection-pool behavior matters: warming one connection does not warm every other connection's session cache.

Instance caching changes the ownership story. The [lookup path](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go#L245-L256) clones a shared cached plan for the session, because its ranges and other plan fields are mutable. We do not follow that cache's separate eviction implementation here.

The public [prepared plan cache overview](https://docs.pingcap.com/tidb/stable/sql-prepared-plan-cache/) and [system-variable reference](https://docs.pingcap.com/tidb/stable/system-variables/) provide operational context. Match the documentation version to the TiDB version you actually run.

## Reading a cache-hit indicator correctly

`@@last_plan_from_cache` reports whether the previous statement used a cached plan. Read it immediately after the execution being investigated, not after several unrelated SQL statements. The upstream tests above use that same observation.

In this source path, `FoundInPlanCache` becomes true only after successful adjustment and rebuilding. A bucket lookup that finds a candidate but fails rebuilding does not become a reported successful reuse.

If repeated executions miss, the source gives you a small decision tree: Is caching enabled? Is the statement eligible? Did the environment key change? Are the parameter types compatible? Was the old value evicted? Did rebuilding reject it?

That is more actionable than assuming that "prepared" means "always cached."

## The mental model to keep

TiDB stores a planning decision, looks it up under compatible environmental and type conditions, and refreshes its parameter-dependent parts before use. It replans when those conditions do not hold.

The central lesson is simple: **cache the expensive structure, but re-establish the assumptions that make it correct.**

## References

1. [TiDB prepared plan cache overview](https://docs.pingcap.com/tidb/stable/sql-prepared-plan-cache/).
2. [TiDB system variables](https://docs.pingcap.com/tidb/stable/system-variables/), for release-specific operational settings.
3. [Pinned coordinator: `pkg/planner/core/plan_cache.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache.go).
4. [Pinned statement/value structs, cache key, and type checks: `plan_cache_utils.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_utils.go).
5. [Pinned session LRU: `plan_cache_lru.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_lru.go).
6. [Pinned range rebuilding: `plan_cache_rebuild.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_rebuild.go).
7. [Pinned regression tests: `plan_cache_test.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/planner/core/plan_cache_test.go).
8. [Pinned variable defaults: `tidb_vars.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/tidb_vars.go) and [registration: `sysvar.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go).
