---
author: JZ
pubDatetime: 2026-11-21T19:31:03Z
modDatetime: 2026-11-21T19:31:03Z
title: System Design - How TiDB Implements SHOW WARNINGS
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace a TiDB diagnostic from StatementContext through its warning handler into SHOW WARNINGS, including SQL mode, warning counts, and the ShowExec output path."
---

## Table of contents

- [A conversion that succeeds with a warning](#a-conversion-that-succeeds-with-a-warning)
- [Where a statement keeps its diagnostics](#where-a-statement-keeps-its-diagnostics)
- [How SHOW WARNINGS turns entries into rows](#how-show-warnings-turns-entries-into-rows)
- [The warning count and the saved list](#the-warning-count-and-the-saved-list)
- [Settings and troubleshooting](#settings-and-troubleshooting)
- [References](#references)

## A conversion that succeeds with a warning

Consider an application that imports text into an integer column. With non-strict SQL mode, TiDB can convert a bad value and finish the statement while recording a warning:

```sql
CREATE TABLE show_warnings (a INT);
SET SESSION sql_mode = '';
INSERT INTO show_warnings VALUES ('a');
SHOW WARNINGS;
```

The result includes a row like this:

```text
+---------+------+--------------------------------------------------+
| Level   | Code | Message                                          |
+---------+------+--------------------------------------------------+
| Warning | 1366 | Incorrect int value: 'a' for column 'a' at row 1 |
+---------+------+--------------------------------------------------+
```

That row is not produced by re-running the `INSERT`. TiDB records a diagnostic while executing the statement. The later `SHOW WARNINGS` statement reads those recorded diagnostics and turns them into SQL result rows.

## Where a statement keeps its diagnostics

TiDB's `StatementContext` holds state for one statement, including warnings and errors. Executors and other statement code can call `StatementContext.AppendWarning(err)`. That method passes the error to a `WarnHandler`.

The usual handler is `StaticWarnHandler` in `pkg/util/context/warn.go`. It stores entries as `SQLWarn` values: each entry pairs a level such as `Warning`, `Error`, or `Note` with the underlying Go error. The handler also protects the list while concurrent work appends or reads it.

```text
INSERT executor
     |
     | AppendWarning(err)
     v
StatementContext ----------------------> WarnHandler
  statement-local state                  StaticWarnHandler
                                               |
                                               | stores SQLWarn{level, err}
                                               v
                                         warning list
```

The important boundary is the statement context: warnings do not live in a cluster-wide warning table. A warning-producing path must append its diagnostic to the statement context for `SHOW WARNINGS` to see it.

## How SHOW WARNINGS turns entries into rows

`ShowExec` handles the SQL statement. When its `fetchAll` method sees `ast.ShowWarnings`, it calls `fetchShowWarnings(false)`. That method reads `StmtCtx.GetWarnings()` and creates one result row for each entry.

For a TiDB SQL error type, the executor unwraps the error and converts it to a MySQL-compatible SQL error. It then adds the diagnostic's level, error code, and message to the result chunk. For an error value without a TiDB SQL error code, the code uses the unknown-error code and the Go error text.

The same method handles `SHOW ERRORS`: it receives `errOnly = true` and skips entries whose level is not `Error`. `SHOW WARNINGS` keeps all levels, which is why it can display warning, note, and error diagnostics.

```text
Previous statement                 Current SHOW statement
------------------                 ----------------------
executor appends err               SelectExec preserves the warning list
        |                                       |
        v                                       v
StatementContext.WarnHandler ---> ShowExec.fetchShowWarnings(false)
                                            |
                                            | unwrap and format each entry
                                            v
                                     Level | Code | Message
```

The code path is small enough to follow through a handful of files:

1. `StatementContext.AppendWarning` delegates to the warning handler.
2. `StaticWarnHandler.AppendWarning` records an entry at level `Warning`.
3. Before a `SHOW WARNINGS` or `SHOW ERRORS` statement is executed, `SelectExec` marks the context as being in a warning-display statement and keeps the existing warning list.
4. `ShowExec.fetchShowWarnings` formats the list for the client.

## The warning count and the saved list

TiDB also exposes `@@warning_count` and `@@error_count`, as well as `SHOW COUNT(*) WARNINGS` and `SHOW COUNT(*) ERRORS`. These answer a different question from `SHOW WARNINGS`: the count forms return a number, while the non-count form returns diagnostic details.

One implementation detail can look surprising in a debugger. `StatementContext.WarningCount()` returns zero while `InShowWarning` is true. That prevents the act of displaying warnings from reporting the previous statement's warning count as if it belonged to the `SHOW` statement. The warning list itself is still available through `GetWarnings()`. TiDB's executor test demonstrates that it can run `SHOW WARNINGS` twice and receive the same saved row both times.

## Settings and troubleshooting

`sql_mode` is the setting that matters most when reproducing a warning. TiDB's default mode includes `STRICT_TRANS_TABLES`, which can reject an invalid value with an error. The example clears the session mode so the invalid value can be adjusted and recorded as a warning. Check `SELECT @@sql_mode` before comparing results between sessions or releases.

MySQL users may also look for `max_error_count`. TiDB currently registers that name in its no-op system-variable list, with a compatibility default of `64`; it is not the limit used by the warning handler. The handler's normal append path records diagnostics independently of that variable.

If a warning you expect is missing, check which execution path evaluated the expression and which TiDB version is running. For example, a public TiDB issue reports missing warnings in one TiFlash expression-pushdown scenario. `SHOW WARNINGS` can display entries already present in the statement context; it cannot reconstruct a diagnostic that an execution path did not add there.

## References

1. TiDB SQL statement reference, [SHOW WARNINGS](https://docs.pingcap.com/tidb/stable/sql-statement-show-warnings/) — syntax, examples, and MySQL compatibility.
2. TiDB SQL reference, [SQL mode](https://docs.pingcap.com/tidb/stable/sql-mode/) — strict and non-strict conversion behavior.
3. TiDB system variables, [`warning_count`](https://docs.pingcap.com/tidb/stable/system-variables/#warning_count).
4. TiDB source, [`StatementContext` warning methods](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/sessionctx/stmtctx/stmtctx.go#L1184-L1224).
5. TiDB source, [`StaticWarnHandler`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/util/context/warn.go#L141-L250).
6. TiDB source, [`ShowExec.fetchShowWarnings`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/show.go#L2166-L2192).
7. TiDB source, [`SelectExec` handling for SHOW WARNINGS](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/select.go#L1218-L1230).
8. TiDB source, [`max_error_count` compatibility variable](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/sessionctx/variable/noop.go#L188-L197).
9. TiDB source test, [`TestShowWarnings`](https://github.com/pingcap/tidb/blob/bf712cf67f6f711117d8246d46586e47ad851b6b/pkg/executor/test/showtest/show_test.go#L245-L278).
10. TiDB issue, [missing warnings for an expression pushed to TiFlash](https://github.com/pingcap/tidb/issues/58607) — a reported edge case in warning production outside the formatting path.
