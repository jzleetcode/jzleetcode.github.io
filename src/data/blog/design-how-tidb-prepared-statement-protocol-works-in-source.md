---
author: JZ
pubDatetime: 2026-11-23T19:32:20Z
modDatetime: 2026-11-23T19:32:20Z
title: System Design - How TiDB Handles Prepared Statements in the MySQL Binary Protocol
tags:
  - design-system
  - design-database
  - design-tidb
description: "Follow COM_STMT_PREPARE, COM_STMT_EXECUTE, and COM_STMT_CLOSE through TiDB's connection, session, parameter decoder, and configuration."
---

## Table of contents

## One SQL shape, many executions

A service might repeatedly run a query like this, changing only the account ID:

~~~sql
SELECT name FROM account WHERE id = ?;
~~~

A MySQL client can send this as a prepared statement over the **binary protocol**. The driver prepares the SQL once, receives a statement ID and metadata, then sends that ID with parameter values on later executions.

This walkthrough follows that protocol through TiDB's current upstream source. The source links are pinned to TiDB commit [6775607e08c358fc4186d7001ea665954375016a](https://github.com/pingcap/tidb/commit/6775607e08c358fc4186d7001ea665954375016a). SQL commands such as **PREPARE ... FROM ...** provide another interface; the focus here is the driver's **COM_STMT_*** messages.

## Five pieces share the work

| Piece | Responsibility |
| --- | --- |
| <code>clientConn</code> | Dispatches MySQL command packets and sends responses. |
| <code>TiDBContext</code> | Connects protocol handling to one SQL session and keeps connection-level statement objects. |
| <code>TiDBStatement</code> | Holds binary-protocol details such as parameter types, long parameter data, and cursor state. |
| <code>session.PrepareStmt</code> | Builds the prepared SQL definition and returns its ID, parameter count, and result metadata. |
| <code>SessionVars.PreparedStmts</code> | Stores the session's prepared definitions and participates in the instance-wide statement count. |

The main flow looks like this:

~~~text
Driver                   clientConn / TiDBContext             session / SessionVars
  |                                 |                                   |
  |-- COM_STMT_PREPARE(sql) ------->|                                   |
  |                                 |-- Prepare(sql) ------------------>|
  |                                 |                         PrepareStmt(sql)
  |                                 |                         build SQL definition
  |                                 |                         store by statement ID
  |                                 |<-- ID, parameter and column info -|
  |<-- prepare response ------------|                                   |
  |                                 |                                   |
  |-- COM_STMT_EXECUTE(ID, values)->|                                   |
  |                                 | decode binary values              |
  |                                 |-- ExecuteStmt(bound SQL) -------->|
  |                                 |<-- result set or OK ---------------|
  |<-- execution response ----------|                                   |
  |                                 |                                   |
  |-- COM_STMT_CLOSE(ID) ---------->| release connection/session state   |
~~~

The same ID connects two kinds of state. <code>TiDBContext.stmts</code> maps it to a <code>TiDBStatement</code> with protocol state. The SQL session's <code>PreparedStmts</code> map stores the prepared definition used to execute the query. The protocol object is created by [TiDBContext.Prepare()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/driver_tidb.go#L392-L426), while the prepared definitions live in [SessionVars](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/sessionctx/variable/session.go#L827-L829).

## Prepare: parse once and return metadata

The command dispatcher in [clientConn.dispatch()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn.go#L1577-L1590) sends **COM_STMT_PREPARE** to [HandleStmtPrepare()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn_stmt.go#L69-L131). That handler asks TiDBContext to prepare the SQL, then returns the statement ID, parameter count, and result-column metadata to the client.

[TiDBContext.Prepare()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/driver_tidb.go#L392-L426) calls the SQL session's [PrepareStmt()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/session/session.go#L3335-L3428). The session uses executor.NewPrepareExec() to build the prepared definition, and the connection creates a TiDBStatement with space for the bound parameters. This is why the driver can refer to the SQL by ID on its next request rather than resending the full text.

Preparing does not produce query rows. It establishes the SQL definition and tells the client how to send parameters and interpret a result.

## Execute: decode the parameter packet

Each **COM_STMT_EXECUTE** packet starts with the statement ID. It also includes execution flags and, when parameters exist, a null bitmap, parameter type information, and binary values.

[handleStmtExecute()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn_stmt.go#L134-L229) looks up the connection's statement object, checks the flags, and parses the packet. The first execution can include the parameter types; TiDB saves them on TiDBStatement, and later packets can reuse them. A null bitmap marks parameters that are SQL **NULL**.

The lower-level [parseBinaryParams()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn_stmt_params.go#L37-L151) keeps each value's declared MySQL type with its encoded bytes. The SQL execution layer interprets those bytes according to the type—for example, as an integer or as text that needs the session's charset decoding.

Long values can arrive separately in **COM_STMT_SEND_LONG_DATA** packets. TiDBStatement buffers them and checks them against **max_allowed_packet** and the session's query memory quota before execution.

## The SQL layer still runs the query

After decoding, TiDB creates an <code>ast.ExecuteStmt</code> containing the prepared definition and this execution's values. The [binary-protocol execution path](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn_stmt.go#L250-L326) passes it to the SQL session's ordinary ExecuteStmt() method and returns an OK packet or result set.

This distinction matters:

- A prepared statement is a session-level SQL definition plus an ID and protocol state.
- A prepared **plan cache** is an optimization that may reuse an execution plan for that definition.
- Neither one caches the query's result rows.

The <code>tidb_enable_prepared_plan_cache</code> system variable controls plan reuse. Turning it off does not change the binary protocol's prepare and execute messages; it changes whether eligible prepared executions can reuse planning work. The plan-cache article in this blog covers those reuse checks in more detail.

## Close: release the handle and update the count

When the client sends **COM_STMT_CLOSE**, clientConn calls [TiDBStatement.Close()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/driver_tidb.go#L242-L273). The close path releases buffered long parameter data and cursor resources, removes the connection-level statement, and removes the session's prepared definition. If an active transaction is being retried, TiDB queues the removal and finishes it in [cleanRetryInfo()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/session/session.go#L340-L383) when retry bookkeeping is safe. The removal decrements the prepared-statement counter.

That count is enforced by [SessionVars.AddPreparedStmt()](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/sessionctx/variable/session.go#L3006-L3039): it atomically updates a process-wide counter and rejects new statements after the configured maximum is reached. The limit therefore protects a TiDB instance, rather than setting a separate quota for every session.

## Settings that affect the lifecycle

| Setting | What it controls |
| --- | --- |
| <code>max_prepared_stmt_count</code> | Global instance limit for active prepared statements. Its documented default is <code>-1</code> (no limit), with a maximum of 1,048,576. |
| <code>tidb_enable_prepared_plan_cache</code> | Whether eligible prepared statements can reuse execution plans. It is <code>ON</code> by default and does not turn the protocol itself on or off. |
| <code>max_allowed_packet</code> | Maximum packet size; TiDB also checks long parameter data against it. The documented default is 64 MiB. |
| <code>tidb_ignore_prepared_cache_close_stmt</code> | When <code>ON</code>, keep a plan-cache entry after COM_STMT_CLOSE or DEALLOCATE PREPARE. It does not keep the session statement handle or its count alive. |

These settings govern different resources: number of open definitions, plan reuse, parameter size, and cached-plan cleanup. They should not be treated as interchangeable prepared-statement limits.

## What to remember

The driver and TiDB cooperate through a small protocol lifecycle. clientConn routes messages, TiDBContext keeps the protocol view, TiDBStatement remembers parameter and cursor details, and the session stores the SQL definition. At execution time, TiDB decodes fresh parameter values and sends them through SQL execution.

That division explains both the performance opportunity and the resource boundary: the statement ID avoids repeatedly sending and preparing the same SQL text, while the plan cache can independently avoid some optimizer work. TiDB still evaluates the query against current data for every execution.

## References

1. TiDB, [PREPARE Statement](https://docs.pingcap.com/tidb/stable/sql-statement-prepare/).
2. TiDB, [System Variables](https://docs.pingcap.com/tidb/stable/system-variables/).
3. TiDB, [Prepared Plan Cache](https://docs.pingcap.com/tidb/stable/sql-prepared-plan-cache/).
4. MySQL, [COM_STMT_PREPARE Protocol](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_com_stmt_prepare.html).
5. MySQL, [COM_STMT_EXECUTE Protocol](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_com_stmt_execute.html).
6. TiDB source, [pkg/server/conn_stmt.go](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/conn_stmt.go), [pkg/server/driver_tidb.go](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/server/driver_tidb.go), and [pkg/session/session.go](https://github.com/pingcap/tidb/blob/6775607e08c358fc4186d7001ea665954375016a/pkg/session/session.go).
