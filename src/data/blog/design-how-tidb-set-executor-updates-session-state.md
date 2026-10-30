---
author: JZ
pubDatetime: 2026-10-30T19:15:00Z
modDatetime: 2026-10-30T19:15:00Z
title: System Design - How TiDB SET Updates Session State in Source Code
tags:
  - design-system
  - design-database
description: "A focused TiDB source walkthrough of SET: how session.ExecuteStmt compiles a Set plan, how SetExecutor evaluates assignments, and how SessionVars validates and stores user, session, global, and instance variables."
---

## Table of contents

## Context

`SET` looks like one of SQL's smallest commands:

```sql
SET @region = 'us-west';
SET SESSION tidb_snapshot = '2026-10-30 12:00:00';
SET GLOBAL max_connections = 2000;
```

But these statements change the environment in which later SQL is interpreted. A user variable belongs to one connection. A session system variable changes that connection's behavior. A global or instance variable can require privileges and persistence beyond the current session.

This article follows TiDB's regular `SET` path at source commit [`49ad420278001b896de85fd7985b35ff49be877f`](https://github.com/pingcap/tidb/tree/49ad420278001b896de85fd7985b35ff49be877f). The source snapshot is intentional: the main branch changes, while a permalink lets a reader check every claim here.

We will stay focused on four pieces:

| Piece                  | Job                                                            |
| ---------------------- | -------------------------------------------------------------- |
| `session.session`      | Owns a client connection and starts statement execution.       |
| `executor.Compiler`    | Turns parsed SQL into a physical plan and an `ExecStmt`.       |
| `executor.SetExecutor` | Evaluates variable assignments and applies their scope rules.  |
| `variable.SessionVars` | Holds per-connection state and validates/stores system values. |

This is not a tour of every TiDB variable. It is the small control path that makes `SET` safe to run before a later `SELECT`, `INSERT`, or transaction.

## The important distinction: `SET` has no rows

TiDB uses executors for queries that return rows and commands that cause side effects. `SET` belongs to the second category. Its executor still follows the ordinary executor interface, but it returns an empty chunk after applying its assignments.

```text
client
  | SET SESSION tidb_snapshot = '...'
  v
session.ExecuteStmt
  |
  | reset per-statement context; prepare transaction context
  v
Compiler.Compile
  |
  | parser AST -> planner Set -> ExecStmt
  v
ExecStmt.Exec
  |
  | build SetExecutor; Open; run once because there are no result rows
  v
SetExecutor.Next
  |
  +--> evaluate assignment
  +--> validate scope and privileges
  +--> SessionVars.SetSystemVar / GlobalVarsAccessor
  v
empty successful result
```

This separation matters. TiDB cannot treat a setting as a string bag written by the client: some values alter snapshot-read safety, some are only meaningful globally, and some require dynamic privileges.

## 1. The session prepares statement-local state

[`session.ExecuteStmt`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/session/session.go#L2489-L2500) delegates to `executeStmtImpl`. Before compilation, that method prepares transaction context, loads common global variables when needed, and calls [`executor.ResetContextOfStmt`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/session/session.go#L2537-L2544).

Resetting the statement context is not busywork. Diagnostics, warnings, memory tracking, SQL digests, and cancellation state must describe this statement rather than the prior command on the same connection. The session then validates the statement against transaction and read-only rules before compiling it.

The session owns `SessionVars`, so it is the natural boundary between a network connection and SQL execution. A change made by `SET SESSION` is visible to later statements on that connection precisely because they will read the same `SessionVars` object.

## 2. The compiler makes a `Set` plan

At the heart of [`executeStmtImpl`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/session/session.go#L2663-L2669), the session calls `executor.Compiler.Compile`.

The compiler preprocesses and validates the parsed abstract syntax tree (AST), then asks the planner to optimize it into a physical plan. Its [`Compile`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/compiler.go#L52-L104) method packages that plan into an `ExecStmt`, which carries the plan, statement node, and execution context onward.

For `SET`, the planner creates a `plannercore.Set` plan containing normalized variable assignments. The executor builder recognizes that plan and constructs a [`SetExecutor`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/builder.go#L1177-L1184) with `v.VarAssigns`.

```text
SQL text                 parsed AST              physical plan
---------                ----------              -------------
SET @x = 1      --->     ast.SetStmt     --->    plannercore.Set
                                                    |
                                                    v
                                               SetExecutor{vars}
```

The planner stage is useful even for a simple assignment. It resolves names, represents expressions in a common form, and lets execution use the same interfaces as the rest of TiDB.

## 3. `ExecStmt` runs no-row plans immediately

[`ExecStmt.Exec`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/adapter.go#L656-L668) builds and opens the concrete executor. A `SELECT` can return a record set whose `Next` calls fetch rows lazily. A `SET` does not have a result stream, so TiDB identifies the plan as a no-delay plan and drives its executor during `Exec`.

The relevant classifier includes `*plannercore.Set` explicitly: [`isNoDelayExecutor`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/adapter.go#L632-L646). The name means TiDB does not postpone this work until a client asks for the first row. By the time the command reports success, the state change has either happened or the command has failed.

That gives an important contract to an application connection pool:

```text
SET SESSION ... succeeds
          |
          v
the next statement on the same TiDB session observes the new setting
```

It does **not** give that contract to another pooled connection. Session state belongs to a session, so a pool that needs a setting for every request must set it on the borrowed connection or use an appropriate global/instance configuration instead.

## 4. `SetExecutor.Next` walks each assignment once

[`SetExecutor.Next`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L53-L103) resets its output chunk, checks its `done` flag, and loops over `vars`. It sets `done = true` before processing, so calling `Next` again is harmless: the executor will not reapply the assignment.

There are three main branches:

```text
assignment
    |
    +-- SET NAMES / SET CHARACTER SET --> setCharset()
    |
    +-- @name = expression -----------> evaluate expression
    |                                    store or remove a user variable
    |
    +-- @@system_variable = value ----> setSysVariable()
                                         validate scope, privilege, and value
```

For a user variable, the executor evaluates the expression in the current session's evaluation context. A SQL `NULL` unsets the variable; otherwise TiDB stores both the value and its expression type. This is why `SET @x = NULL` and `SET @x = 0` are observably different.

Character-set commands get their own route because several variables must move together. [`setCharset`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L391-L435) resolves a default collation and synchronizes the appropriate connection/database character-set variables.

## 5. System variables have scope and policy

[`setSysVariable`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L105-L218) is the guardrail for `@@` variables. It first looks up the definition with `variable.GetSysVar(name)`. Unknown variables fail; removed compatibility variables can be parsed and ignored intentionally.

Before changing a protected variable, the method asks the privilege manager for the dynamic privileges required by that variable and scope. It also honors TiDB's security-enhanced mode restrictions. A client cannot turn a configuration command into an administrator command just by changing `SESSION` to `GLOBAL`.

Then scope decides where the value goes:

```text
SET scope                     destination
---------                     -----------
user variable (@x)            current SessionVars user-variable map
SESSION @@x                   current SessionVars
GLOBAL @@x                    GlobalVarsAccessor (cluster/global state)
INSTANCE @@x                  instance-scoped accessor
```

For a session variable, the executor obtains a value string, checks transaction-specific restrictions, and calls [`SessionVars.SetSystemVar`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L254-L291). Definitions can validate syntax, ranges, and inter-variable relationships through their hooks.

## A safety-critical example: `tidb_snapshot`

Some session settings affect which data a later query is allowed to read. `tidb_snapshot` chooses a historical snapshot timestamp for subsequent reads. That makes it a useful example of why `SET` is more than a map update.

After a session value is applied, `SetExecutor` checks whether `tidb_snapshot` or `tidb_txn_read_ts` changed. If it did, it validates the timestamp and, for `tidb_snapshot`, checks the GC safe point. On failure, it restores the previous snapshot value: see [`setSysVariable`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L256-L325).

```text
SET SESSION tidb_snapshot = T
              |
              v
      SessionVars.SetSystemVar
              |
              v
  is T a valid and retained snapshot?
        | yes                  | no
        v                      v
  keep new setting       restore old setting; return error
```

Without the rollback, a failed validation could leave the connection half-configured: later reads might use a timestamp the storage layer cannot safely serve.

## Configurations worth knowing

| Setting or rule                   | Why it matters in this path                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SET SESSION` versus `SET GLOBAL` | Determines whether a change is private to one connection or uses the global accessor and privilege checks.                 |
| `tidb_snapshot`                   | Requests historical reads and triggers timestamp plus GC-safe-point validation.                                            |
| `tidb_txn_read_ts`                | Controls stale-read timestamp behavior; it has restrictions while a transaction is active.                                 |
| `tidb_enable_noop_functions`      | Controls behavior for compatibility variables marked as no-ops; TiDB can warn rather than silently imply a feature exists. |
| security-enhanced mode            | Adds checks for protected system variables before a session can modify them.                                               |

Use the [TiDB system variables reference](https://docs.pingcap.com/tidb/stable/system-variables/) for the supported value, scope, default, and version-specific behavior of a particular variable. The source flow explains how a definition is enforced; the reference explains what that definition means to an operator.

## Takeaways

`SET` is small SQL with a wide blast radius, so TiDB gives it the same disciplined path as a query: session setup, compilation, an executor, and centralized variable policy. `SetExecutor` evaluates assignments once, distinguishes user and system state, and routes system variables by scope. The snapshot rollback path shows the design principle clearly: a connection should either acquire a valid new setting or keep its old coherent state.

## References

1. TiDB source, [`session.ExecuteStmt` and `executeStmtImpl`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/session/session.go#L2489-L2669)
2. TiDB source, [`Compiler.Compile`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/compiler.go#L52-L104)
3. TiDB source, [`ExecStmt.Exec` and no-delay plans](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/adapter.go#L632-L668)
4. TiDB source, [`SetExecutor`](https://github.com/pingcap/tidb/blob/49ad420278001b896de85fd7985b35ff49be877f/pkg/executor/set.go#L40-L325)
5. TiDB documentation, [System variables](https://docs.pingcap.com/tidb/stable/system-variables/)
6. TiDB documentation, [Stale read](https://docs.pingcap.com/tidb/stable/stale-read/)
