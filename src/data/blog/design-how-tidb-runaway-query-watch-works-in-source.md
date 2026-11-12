---
author: JZ
pubDatetime: 2026-11-12T19:32:48Z
modDatetime: 2026-11-12T19:32:48Z
title: System Design - How TiDB Runaway Query Watch Works in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow TiDB's runaway-query rules from SQL configuration through the local watch cache and per-query checker to the coprocessor request path."
---

## Table of contents

- [A slow query can become a repeating incident](#a-slow-query-can-become-a-repeating-incident)
- [Two ways to recognize a runaway query](#two-ways-to-recognize-a-runaway-query)
- [How the code pieces fit together](#how-the-code-pieces-fit-together)
- [The settings that matter](#the-settings-that-matter)
- [Inspecting watches and runaway records](#inspecting-watches-and-runaway-records)

This walkthrough follows the TiDB source at commit <code>c3adc8d</code>. It focuses on five pieces: the <code>QUERY WATCH</code> executor, the domain's runaway manager, the SQL adapter, the per-statement checker, and the coprocessor request path.

## A slow query can become a repeating incident

Imagine a report query that scans a large table and runs long enough to affect other work in its resource group. An operator cancels it, but the same SQL is sent again by a scheduled job a minute later. Stopping one execution does not prevent the next one.

TiDB's runaway-query feature gives the operator two choices. A **threshold rule** can identify a query after its elapsed time, resource-unit (RU) consumption, or processed-key count passes a limit. A **watch rule** can recognize a matching query quickly on a later execution, before it repeats the expensive work.

The difference matters:

| Mechanism | What it matches | When it acts |
| --- | --- | --- |
| <code>QUERY_LIMIT</code> | An execution threshold such as elapsed time, RUs, or processed keys | When the checker observes the threshold being exceeded |
| <code>WATCH</code> | Exact SQL text, a normalized SQL digest, or a plan digest | At the start of a later matching statement |

A <code>QUERY_LIMIT</code> can also include a <code>WATCH</code> clause. Then the first execution is detected by its threshold, and TiDB can add that query's signature to the watch list for the configured duration. Future matches can be acted on immediately.

## Two ways to recognize a runaway query

A resource group can carry threshold settings such as <code>EXEC_ELAPSED</code>, <code>PROCESSED_KEYS</code>, and <code>RU</code>. The docs apply <code>EXEC_ELAPSED</code> to read and write DML; <code>PROCESSED_KEYS</code> and <code>RU</code> limits apply to reads. When a configured limit is reached, the <code>ACTION</code> says what TiDB should do:

- <code>DRYRUN</code> records the event so an operator can tune a rule without changing execution.
- <code>COOLDOWN</code> lowers the priority of later coprocessor requests for the query.
- <code>KILL</code> interrupts the query.
- <code>SWITCH_GROUP</code> moves the query to another resource group.

The <code>WATCH</code> selector chooses how later executions are recognized. <code>EXACT</code> uses the SQL text, <code>SIMILAR</code> uses a normalized SQL digest that ignores literal values, and <code>PLAN</code> uses a plan digest. A duration limits how long an automatically generated watch remains active.

For example, this resource group kills statements that run for more than ten seconds and watches their normalized SQL shape for ten minutes:

~~~~sql
CREATE RESOURCE GROUP reports
  RU_PER_SEC = 500
  QUERY_LIMIT = (
    EXEC_ELAPSED = '10s',
    ACTION = KILL,
    WATCH = SIMILAR DURATION = '10m'
  );
~~~~

An operator can also add a watch directly, without waiting for a first threshold violation:

~~~~sql
QUERY WATCH ADD RESOURCE GROUP reports
  ACTION KILL
  SQL TEXT SIMILAR TO 'SELECT * FROM orders WHERE customer_id = 42';
~~~~

With <code>SIMILAR</code>, that SQL is normalized to its digest; a later query with different literal values can match the same pattern. <code>SQL TEXT EXACT</code> keeps the literal text, while <code>PLAN DIGEST</code> lets an operator target a physical plan. If the action is omitted from <code>QUERY WATCH</code>, TiDB uses the action configured for that resource group.

The <code>RU_PER_SEC</code> option in the example is the group's resource budget. It is separate from <code>QUERY_LIMIT</code>, which decides when an individual statement is considered runaway.

## How the code pieces fit together

<img src="/assets/blog/tidb-runaway-query-watch.svg" alt="UML sequence diagram showing TiDB syncing runaway watches and checking a statement before coprocessor requests" />

The sequence diagram highlights the fast path. Watch rows are copied into each TiDB server's local cache, so each query can be checked without reading a system table on the request path.

### 1. QUERY WATCH turns SQL into a signature

The <code>AddExecutor</code> in <code>pkg/executor/internal/querywatch/query_watch.go</code> converts the SQL options into a <code>QuarantineRecord</code>. For <code>SQL TEXT SIMILAR</code>, it parses the text and stores the normalized SQL digest. For <code>SQL TEXT PLAN</code>, it runs <code>EXPLAIN</code> and stores the resulting plan digest. It validates the resource group and action, then hands the record to the runaway manager.

The manager inserts a manual watch into <code>mysql.tidb_runaway_watch</code> in an internal transaction. That conversion is important because the hot path should compare a short signature, not parse every saved SQL string for every query.

### 2. The manager keeps a local watch cache

The <code>runaway.Manager</code> owns a TTL cache keyed by resource group plus watch signature. When a watch is added after a threshold violation, the manager can place it in the local cache immediately, then queue the record for persistence. Manually added watches are persisted to TiDB's <code>mysql.tidb_runaway_watch</code> table. A companion <code>mysql.tidb_runaway_watch_done</code> table carries removals.

The manager starts a background loop that syncs new and removed rows about once per second. Each TiDB instance refreshes its own cache from those tables. A query on one server can therefore make future matching queries fast to reject on another server after that server's next sync.

There is also a separate history path. The manager batches runaway records into <code>mysql.tidb_runaway_queries</code>; the query execution path only enqueues a record rather than waiting for that history write to finish.

### 3. The SQL adapter derives a checker for each statement

After TiDB has a plan, <code>pkg/executor/adapter.go</code> gets the statement's SQL digest and plan digest and calls <code>Manager.DeriveChecker</code>. The manager fetches the resource group's current <code>QUERY_LIMIT</code> settings from the resource-group controller. If the group has no runaway settings and no active watch, it returns no checker, keeping ordinary statements off this path.

Otherwise, the manager creates a <code>Checker</code> holding the resource group, SQL text, both digests, threshold settings, and the statement start time. The adapter puts that checker into the statement context and calls <code>BeforeExecutor()</code> before it builds the executor.

### 4. The checker matches and applies the action

<code>Checker.BeforeExecutor()</code> checks three possible signatures against the manager's local cache: exact SQL text, SQL digest, and plan digest. A <code>KILL</code> match returns an error before execution. A <code>SWITCH_GROUP</code> match returns the target group to the adapter. <code>DRYRUN</code> records the match and continues. <code>COOLDOWN</code> continues too, but the checker lowers the priority on later coprocessor requests.

Threshold checks happen as TiDB exchanges coprocessor requests and responses. The coprocessor worker calls <code>BeforeCopRequest()</code> before sending a request and <code>CheckThresholds()</code> after it receives execution details. The checker accumulates processed keys and compares the returned RU details and elapsed-time deadline against the group's settings. If the rule is <code>KILL</code>, it returns an interruption error. If a <code>WATCH</code> is configured, the first violation can also place the query's selected signature into the local watch cache and queue it for other TiDB instances to sync.

This split explains the feature's name: a threshold identifies a runaway execution, while a watch quarantines its repeated query shape.

## The settings that matter

Resource Control must be enabled for TiDB to attach these checkers. For self-managed clusters, check <code>tidb_enable_resource_control</code> on TiDB. TiKV's <code>resource-control.enabled</code> setting controls request scheduling based on resource-group priorities; it needs to be enabled for <code>COOLDOWN</code> to have its intended scheduling effect. TiDB documentation says both settings are enabled by default starting in TiDB v7.0.0, but verify the settings for the cluster version you operate.

For a first rollout, <code>DRYRUN</code> is a useful action: it records queries that would match while leaving them running. Review the records, choose thresholds that separate expected scans from runaway work, then switch to <code>COOLDOWN</code> or <code>KILL</code>. Give automatic watches a bounded <code>DURATION</code> so a query shape is not quarantined forever by accident.

The match type is a practical choice:

- Use <code>EXACT</code> when one literal SQL statement is the problem.
- Use <code>SIMILAR</code> when the same SQL template appears with changing parameter values.
- Use <code>PLAN</code> when only a particular physical plan should be watched.

## Inspecting watches and runaway records

Use <code>INFORMATION_SCHEMA.RUNAWAY_WATCHES</code> to see active signatures and their actions. Use <code>mysql.tidb_runaway_queries</code> to review identified statements, the match type, sample SQL, digests, and the reason a threshold was exceeded. Those views help answer whether the rule caught the intended query and whether its watch duration should be changed.

The important design choice is that the persistent tables are control-plane state, while the manager's local cache is the query fast path. A saved rule can be inspected and synchronized, but each statement is matched in memory before TiDB sends its work to TiKV.

## References

1. TiDB documentation, [Manage Queries That Consume More Resources Than Expected (Runaway Queries)](https://docs.pingcap.com/tidb/stable/tidb-resource-control-runaway-queries/).
2. TiDB documentation, [QUERY WATCH statement](https://docs.pingcap.com/tidb/stable/sql-statement-query-watch).
3. TiDB documentation, [Resource Control and resource groups](https://docs.pingcap.com/tidb/stable/tidb-resource-control-ru-groups/).
4. PingCAP blog, [Enhancing Database Stability in TiDB with Runaway Query Management](https://www.pingcap.com/blog/enhancing-database-stability-tidb-runaway-query-management/).
5. TiDB source at commit <code>c3adc8d</code>: [QUERY WATCH executor](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/executor/internal/querywatch/query_watch.go#L37-L195), [watch persistence](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/record.go#L408-L467), [SQL adapter](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/executor/adapter.go#L767-L787), [runaway checker](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/checker.go#L92-L230), [runaway manager](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/manager.go#L59-L125), [watch sync loop and cache updates](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/manager.go#L243-L288), [watch table scans](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/manager.go#L419-L505), [watch synchronization interval](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/resourcegroup/runaway/syncer.go#L37-L60), [coprocessor request hook](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/store/copr/coprocessor.go#L1853-L1893), and [threshold check after a response](https://github.com/pingcap/tidb/blob/c3adc8d/pkg/store/copr/coprocessor.go#L2875-L2882).
6. TiDB design note, [Runaway Queries Management](https://github.com/pingcap/tidb/blob/c3adc8d/docs/design/2023-06-16-runaway-queries-management.md).
