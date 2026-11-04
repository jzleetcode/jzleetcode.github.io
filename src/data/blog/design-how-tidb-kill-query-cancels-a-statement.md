---
author: JZ
pubDatetime: 2026-11-04T19:31:09Z
modDatetime: 2026-11-04T19:31:09Z
title: "System Design - How TiDB Cancels a Query with KILL QUERY"
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace TiDB's KILL QUERY path from SQL execution through global connection routing, session cancellation, and the SQLKiller signal."
---

## Table of contents

- [The query is running on another connection](#the-query-is-running-on-another-connection)
- [Four pieces carry the cancellation](#four-pieces-carry-the-cancellation)
- [Following KILL QUERY through TiDB](#following-kill-query-through-tidb)
- [A query kill is different from a connection kill](#a-query-kill-is-different-from-a-connection-kill)
- [Settings that affect the route](#settings-that-affect-the-route)
- [Cancellation is cooperative](#cancellation-is-cooperative)
- [References](#references)

This walkthrough follows TiDB's public source at commit [`8c6cb106`](https://github.com/pingcap/tidb/commit/8c6cb106410cd4f01944875235e3b34527b85224). The example uses the current global-kill path; configuration and command behavior can differ on older TiDB releases.

## The query is running on another connection

Suppose a report query is taking too long. It belongs to connection `8306449708033769879`, and an operator wants to stop just that statement while keeping the connection available for the next command:

```sql
SELECT ID, INSTANCE, INFO
FROM INFORMATION_SCHEMA.CLUSTER_PROCESSLIST
WHERE ID = 8306449708033769879;

KILL TIDB QUERY 8306449708033769879;
```

The first query shows the target connection across the cluster. The second is itself a SQL statement, executed on a separate connection. TiDB must locate the target session, interrupt its current statement, and report the interruption through the normal SQL response path.

## Four pieces carry the cancellation

The core path uses four pieces of TiDB:

1. **`SimpleExec.executeKillStmt`** handles the parsed `KILL` statement and decides whether its target connection is local or remote.
2. **`Server.kill`** looks up the target `clientConn` in the local connection map and distinguishes a query kill from a connection kill.
3. **`clientConn.dispatch`** gives each client command a cancellable Go context and keeps its cancel function where the server can reach it.
4. **`SQLKiller`** records the reason for cancellation and converts that reason into the SQL execution error.

```text
KILL TIDB QUERY <connection ID>
             |
             v
       SimpleExec.executeKillStmt
       parse owner from connection ID
          /                 \
 local connection          remote connection
       |                          |
       |                   TiDB-targeted request
       +------------+-------------+
                    v
                Server.kill
                    |
           +--------+---------+
           |                  |
     SQLKiller signal    cancelDispatch()
           |                  |
           +---------+--------+
                     v
           running statement returns
             query-interrupted error
```

These are functions and types in a few source files rather than separate microservices. The SQL killer and the context cancel serve related but different purposes: the killer remembers *why* the query stopped, while context cancellation tells in-flight work to stop waiting.

## Following KILL QUERY through TiDB

### 1. The executor resolves the connection ID

`SimpleExec.executeKillStmt` first handles the older local-only case. With global kill enabled, it parses the connection ID into a TiDB server ID and a local connection ID. If the server ID matches the current TiDB instance, it calls the local session manager. If it belongs to another instance, `killRemoteConn` builds a TiDB-targeted request containing the target connection ID and query/connection flag, then sends it to the owning server.

This is why a cluster-wide connection ID is useful: the node receiving the `KILL` statement can route it to the node that owns the session. The request still ends up invoking the normal local kill path on that owner.

Source: [`executeKillStmt` and `killRemoteConn`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/executor/simple.go#L3050-L3172).

### 2. The server finds the live client connection

The session manager's `Server.kill` method looks up the ID in `Server.clients`. For `KILL QUERY`, it leaves the connection status alone. For `KILL CONNECTION`, it marks the connection for shutdown and sets read and write deadlines so a client stuck in network I/O can be released. Both operations then call `killQuery` for the active statement.

Source: [`Server.kill` and `killQuery`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/server/server.go#L1074-L1129).

### 3. The server signals both cancellation paths

`killQuery` sends `QueryInterrupted` to the connection's `SQLKiller`, calls `clientConn.cancelDispatch`, and asks the active result set to finish. The result-set finish hook covers a query that is blocked while writing rows to the client; canceling a context alone cannot always release a stuck network write promptly.

Each protocol command entered through `clientConn.dispatch` gets a child context created with `context.WithCancel`. The connection stores that cancel function on itself, so `cancelDispatch` can cancel the context for the statement currently being dispatched.

Sources: [`dispatch` context setup](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/server/conn.go#L1444-L1469), [`cancelDispatch`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/server/conn.go#L2178-L2184).

### 4. Execution turns the signal into a SQL error

`SQLKiller.SendKillSignal` records the first signal atomically and wakes any code waiting on its kill-event channel. Execution code can call `HandleSignal`; when it sees `QueryInterrupted`, it returns TiDB's query-interrupted error. The request then unwinds through the normal connection handler, which sends the error to the client.

At the end of the protocol command, `dispatch` resets the killer. That matters because the same connection may run another SQL command after the canceled statement completes.

Source: [`SQLKiller` signals, errors, and reset](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/util/sqlkiller/sqlkiller.go#L141-L205), [`Reset`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/util/sqlkiller/sqlkiller.go#L263-L276).

## A query kill is different from a connection kill

Both operations interrupt whatever statement is currently active, but their connection behavior differs:

| Statement | Current SQL | Client connection |
| --- | --- | --- |
| `KILL TIDB QUERY id` | Interrupted | Remains available for another command |
| `KILL TIDB CONNECTION id` | Interrupted | Marked for shutdown and closed |

The difference is visible in `Server.kill`: the `!query` branch changes the connection status and expires its socket deadlines. The shared `killQuery` call handles the active statement for either command.

## Settings that affect the route

The main cluster-wide setting is `enable-global-kill`. It is enabled by default in current TiDB documentation. With global kill on, the connection ID identifies the owning instance, and `KILL` or `KILL TIDB` can be forwarded to it. This is useful behind a load balancer because the connection issuing the kill does not need to land on the same TiDB node as the target session.

`enable-32bits-connection-id` is also enabled by default. Together with global kill, it supports MySQL command-line `Ctrl+C` cancellation. If the cluster or connection count exceeds the 32-bit ID capacity, TiDB can move to 64-bit IDs.

`compatible-kill-query` only matters when `enable-global-kill` is disabled. It defaults to `false`; turning it on allows MySQL-style `KILL` behavior without the `TIDB` keyword for a local connection. The docs warn against enabling it behind a proxy: a MySQL client may open a new connection for `Ctrl+C`, and the proxy could route that command to a different TiDB node.

See the [KILL statement documentation](https://docs.pingcap.com/tidb/stable/sql-statement-kill/) and [TiDB configuration reference](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/) for version-specific behavior.

## Cancellation is cooperative

`KILL QUERY` is not a machine-level command that instantly destroys the goroutine running the SQL. TiDB marks the session as interrupted and cancels the statement context. Executors and storage requests observe those signals as their work progresses, return an error, and let the normal cleanup path run. A component that does not check cancellation while blocked can delay the response, which is one reason TiDB also has the result-set finish hook.

The two signals complement each other: context cancellation propagates through work that accepts a Go context, and `SQLKiller` preserves a database-specific reason that execution can turn into the right SQL error.

## References

1. TiDB documentation, [KILL](https://docs.pingcap.com/tidb/stable/sql-statement-kill/).
2. TiDB documentation, [TiDB Configuration File](https://docs.pingcap.com/tidb/stable/tidb-configuration-file/).
3. TiDB source, [`pkg/executor/simple.go`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/executor/simple.go#L3050-L3172).
4. TiDB source, [`pkg/server/server.go`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/server/server.go#L1074-L1129).
5. TiDB source, [`pkg/server/conn.go`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/server/conn.go#L1444-L1469).
6. TiDB source, [`pkg/util/sqlkiller/sqlkiller.go`](https://github.com/pingcap/tidb/blob/8c6cb106410cd4f01944875235e3b34527b85224/pkg/util/sqlkiller/sqlkiller.go#L141-L205).
