---
author: JZ
pubDatetime: 2026-10-11T18:31:31Z
modDatetime: 2026-10-11T18:31:31Z
title: System Design - How TiDB Tracks Query Memory in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow TiDB's memory trackers from StatementContext to the session quota and OOM action, with a focused walkthrough of the current source code and its key settings."
---

## Table of contents

- [The problem is larger than one operator](#the-problem-is-larger-than-one-operator)
- [Four pieces form the tracking path](#four-pieces-form-the-tracking-path)
- [From a SQL statement to a quota action](#from-a-sql-statement-to-a-quota-action)
- [Settings that change the outcome](#settings-that-change-the-outcome)
- [What this tracker does not control](#what-this-tracker-does-not-control)
- [References](#references)

## The problem is larger than one operator

A SQL query can hold memory in many places: a hash join keeps a build-side table, a sort keeps rows before ordering them, and a transaction may retain buffered changes. If every operator checks memory independently, TiDB cannot easily answer the practical question: “How much memory is this connection using, and what should happen when it grows too large?”

TiDB solves this with **memory trackers**. A tracker is a counter associated with a part of execution. Trackers can be attached into a parent-child tree, so a local allocation contributes both to the component that created it and to an ancestor that represents a larger scope.

This walkthrough follows the normal statement path in TiDB's public source at commit [`788ad516`](https://github.com/pingcap/tidb/commit/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6). The variable `tidb_mem_quota_query` kept its historical name, but its meaning changed: starting with TiDB v6.5.0, it sets a **session** memory quota, and transaction memory is included. Older releases used it as a per-query threshold, so check the version-specific documentation before applying older advice.

## Four pieces form the tracking path

The normal statement path is a small chain of cooperating components:

```text
Join, sort, and other execution allocations
                   |
                   | Consume(+bytes) / Consume(-bytes)
                   v
StatementContext.MemTracker
  per-statement accounting; no hard limit of its own
                   |
                   | AttachTo(session tracker)
                   v
SessionVars.MemTracker
  tidb_mem_quota_query + selected OOM action
                   |
                   +--> CANCEL: SQLKiller signal --> statement error
                   +--> LOG: warning, execution continues
```

The types to keep in mind are:

1. **`StatementContext`** owns a tracker for the current statement. Its `InitMemTracker` method initializes a reusable tracker with a label and byte limit.
2. **`SessionVars`** owns the session-level `MemTracker`. It is initialized with the session's quota and connected to the session's `SQLKiller`.
3. **`memory.Tracker`** records consumption and propagates each delta through its parent chain. Positive deltas count allocations; negative deltas account for released memory.
4. **`PanicOnExceed` and `LogOnExceed`** implement the two outcomes selected by `tidb_mem_oom_action`.

The statement tracker is useful for attributing usage to the active statement. Its parent is the session tracker, where the configured quota is enforced. That is why the quota is not simply a setting on every join or sort implementation.

## From a SQL statement to a quota action

The connection between those pieces happens in `ResetContextOfStmt`, called before TiDB executes a statement:

1. TiDB detaches the session tracker from any previous parent, clears its prior action, restores the configured byte limit, and resets its maximum-consumed statistic. It also associates the tracker's killer with the session's `SQLKiller`.
2. For an ordinary statement, `StatementContext` initializes a statement tracker with no independent hard quota, then attaches that tracker to `SessionVars.MemTracker`.
3. As executor components allocate or release memory, they call `Tracker.Consume`. The tracker walks from the local tracker through its parents, updating each counter and checking its limits.
4. When the session tracker crosses its hard limit, the action installed by `ResetContextOfStmt` runs. Under `CANCEL`, `PanicOnExceed` sends a query-memory kill signal and handles it as an execution error. Under `LOG`, `LogOnExceed` reports the overage but does not stop the query.

```text
ResetContextOfStmt
  |-- reset session quota + SQLKiller
  |-- initialize StatementContext tracker
  |-- attach statement tracker to session tracker
  `-- install PanicOnExceed or LogOnExceed

Executor allocation
  `-- Tracker.Consume(+bytes)
        |-- increment statement counter
        |-- increment session counter
        `-- if session quota is crossed, run its action
```

Because `Consume` also accepts a negative number, freeing a chunk or clearing an operator can reduce the tracked total. This accounting is only as accurate as the code paths that report their allocations and releases; it should not be mistaken for a direct measurement of all process RSS.

There is also a separate path for `ANALYZE`: `ResetContextOfStmt` attaches its tracker to an analyze-specific global tracker and removes the ordinary session quota for that work. This article stays focused on regular SQL execution rather than analyze jobs or TiDB's server-wide memory arbitration.

## Settings that change the outcome

The source path makes three controls especially useful to understand:

- **`tidb_mem_quota_query`** is a global/session integer measured in bytes. Its documented default is 1 GiB. Setting it to `0` or `-1` means no finite threshold; a positive value below 128 is normalized to 128. In TiDB v6.5.0 and later, the limit applies to session memory, including transaction memory.
- **`tidb_mem_oom_action`** is a global setting with `CANCEL` and `LOG` choices. The current source defines `CANCEL` as the default. `LOG` is useful for observing usage, but because it does not terminate the statement, it is not a hard safety boundary.
- **`tidb_enable_tmp_storage_on_oom`** enables temporary storage for supported operators that can spill. Spilling can reduce in-memory pressure before an OOM action is needed, but it does not mean every operator can spill or that disk usage is unlimited.

For example, a session-specific test limit can be set with:

```sql
SET SESSION tidb_mem_quota_query = 536870912;
```

That is 512 MiB. Choose a quota together with the workload's transaction patterns and the TiDB node's total memory budget; a per-session number does not itself reserve memory or guarantee the process stays below its operating-system limit.

## What this tracker does not control

These classes run inside the **TiDB SQL server**. They do not directly cap memory on a TiKV storage node. TiDB and TiKV have separate processes and configuration surfaces, so lowering `tidb_mem_quota_query` should not be treated as a TiKV memory setting.

The lasting mental model is a tree, not a single counter: executor components report local changes, the statement tracker gives those changes context, and the session tracker applies the configured quota and action. Once you understand where the parent link is installed, both the source code and the system-variable names become easier to interpret.

## References

1. TiDB `ResetContextOfStmt` [`pkg/executor/select.go`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/executor/select.go#L939-L1070)
2. TiDB `StatementContext.InitMemTracker` [`pkg/sessionctx/stmtctx/stmtctx.go`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/sessionctx/stmtctx/stmtctx.go#L1028-L1032)
3. TiDB `Tracker.Consume` [`pkg/util/memory/tracker.go`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/util/memory/tracker.go#L487-L625)
4. TiDB `PanicOnExceed` [`pkg/util/memory/action.go`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/util/memory/action.go#L149-L180)
5. TiDB system variables [`pkg/sessionctx/variable/sysvar.go`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/sessionctx/variable/sysvar.go#L1755-L1762) and [`tidb_mem_quota_query`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/sessionctx/variable/sysvar.go#L3199-L3214)
6. TiDB v6.5.0 release notes, session memory quota change [documentation](https://docs.pingcap.com/tidb/stable/release-6.5.0/)
7. TiDB memory control [documentation](https://docs.pingcap.com/tidb/stable/configure-memory-usage/)
8. TiDB system variables [`tidb_mem_quota_query`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_mem_quota_query), [`tidb_mem_oom_action`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_mem_oom_action), and [`tidb_enable_tmp_storage_on_oom`](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_tmp_storage_on_oom)
