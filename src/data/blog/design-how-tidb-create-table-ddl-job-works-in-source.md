---
author: JZ
pubDatetime: 2026-11-14T19:32:46Z
modDatetime: 2026-11-14T19:32:46Z
title: TiDB Source Walkthrough - How CREATE TABLE Becomes a DDL Job
tags:
  - database
  - tidb
  - design-source-code
description:
  "Trace a regular TiDB CREATE TABLE statement through DDLExec, job submission, the DDL owner scheduler, metadata changes, and schema synchronization."
---

## Table of contents

## A table definition has to reach every TiDB server

Suppose an application sends this statement to one TiDB server:

```sql
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    customer_id BIGINT,
    total DECIMAL(10, 2)
);
```

The server must make the table definition durable and make every TiDB server aware of it. The SQL statement arrives at one node, but clients may send later queries to any node in the cluster.

TiDB handles this work as a DDL job. The SQL connection prepares the job and waits for its completion; a cluster DDL owner schedules the job, and a worker applies the metadata change. This walkthrough follows an ordinary, non-temporary table without foreign keys in the current pingcap/tidb source. Foreign-key tables take a related but separate path.

## The main pieces

Five types are enough to follow the request:

1. `DDLExec` recognizes the parsed `CREATE TABLE` statement and calls the DDL API.
2. `executor` in `pkg/ddl` validates the definition and builds a DDL job.
3. `JobSubmitter` batches incoming jobs and persists them.
4. `jobScheduler` runs on the DDL owner and dispatches runnable jobs.
5. `worker` applies a job step and updates schema metadata.

```text
SQL connection
    |
    v
DDLExec  --->  DDL executor
                   |
                   v
              JobSubmitter
                   |
                   v
          mysql.tidb_ddl_job
                   |
                   v
       DDL owner: jobScheduler
                   |
                   v
                 worker
                   |
                   v
    table metadata + schema version
                   |
                   v
     TiDB servers refresh InfoSchema
                   |
                   v
       SQL statement returns success
```

The `model.Job` object is the message that connects the pieces. It contains the job type and schema/table context; its arguments carry the built table definition.

## 1. The SQL executor hands off the statement

The SQL parser has already turned the text into an AST node by the time `DDLExec.Next` runs. For an `ast.CreateTableStmt`, DDLExec calls `executeCreateTable`, which delegates to `ddl.Executor.CreateTable`.

The concrete DDL executor checks the current schema, builds a `TableInfo` from the AST, and validates the definition. `TableInfo` is TiDB's metadata representation of the table: its columns, indexes, options, and other schema details.

The DDL executor then creates a job with the action type `ActionCreateTable`. `DoDDLJobWrapper` sends the job wrapper to the submitter channel. It first waits for the submission acknowledgement, then checks job history until the job is complete and its schema version is synchronized. This is why a DDL statement can look like one SQL call while doing work in a background cluster loop.

## 2. The submitter stores a durable job

`JobSubmitter.submitLoop` receives job wrappers from the shared channel. It can collect several arrivals into a batch. `addBatchDDLJobs` assigns IDs and calls `jobsubmit.SubmitBatch`, which inserts the job records into the internal `mysql.tidb_ddl_job` table in a transaction.

The queue row is important for two reasons:

- A DDL owner can pick up the work even though a different TiDB server received the SQL.
- If ownership changes, the next owner can resume from durable job metadata rather than relying on the original connection's memory.

After the insert commits, the submitter notifies the DDL owner. When the submitting TiDB is itself the owner, it can notify the local scheduler directly.

## 3. The owner scheduler chooses a worker

Only the DDL owner runs `jobScheduler`. Its scheduling loop reads queued jobs from `mysql.tidb_ddl_job` in job ID order, checks whether each job can run, and assigns it to an available worker pool.

TiDB tracks which schema objects a job involves. This lets the scheduler avoid running conflicting jobs at the same time while still making progress on independent work. A basic `CREATE TABLE` uses a general DDL worker; jobs that reorganize existing data, such as adding an index, use a reorganization path.

The scheduler does not run the whole operation in the SQL connection's goroutine. The worker owns a session and repeatedly advances the persisted job until it reaches a final state.

## 4. The worker publishes the table definition

`worker.runOneJobStep` dispatches on the job's action type. For `ActionCreateTable`, it calls `worker.onCreateTable`.

The create-table path checks that the schema, table name, constraints, and referenced metadata are valid. For a regular table without foreign keys, the helper moves its metadata from `StateNone` to `StatePublic` and writes it through TiDB's metadata mutator. It then updates the schema version and finishes the job step.

This is a metadata operation. It does not scan old rows or build an index over existing data; a newly created table has no old rows to reorganize. A later `INSERT` writes row data using the table's metadata. Adding an index to an existing table is a different DDL workflow because it has to process existing records.

TiDB commits the table metadata and the corresponding job-state update together. If the step cannot commit, neither half should become visible as a completed step.

## 5. Schema synchronization completes the SQL request

After a worker advances the job, the scheduler updates the global schema version and waits for the cluster's TiDB servers to synchronize. Each server maintains an in-memory `InfoSchema`; it must refresh that view before clients can safely use the new table definition.

The submitter's SQL connection checks the job history until the job reaches the synchronized state. Only then does the DDL executor return success. If validation fails, or the job is cancelled, the connection gets an error instead.

That wait explains the user-visible guarantee: a successful CREATE TABLE response means the schema change has progressed through durable job storage, metadata publication, and schema synchronization.

## Configuration worth knowing

### `tidb_enable_fast_create_table`

This global Boolean system variable enables merging compatible table-creation jobs. In the current source it is on by default. When several eligible CREATE TABLE jobs for the same schema arrive together, the submitter can merge them into a batch job; the implementation caps each merged batch at eight tables. The optimization does not apply to jobs with foreign keys or preallocated IDs.

This setting is useful when creating many tables. It reduces job-submission overhead; it does not change the meaning of an individual table definition.

### `tidb_ddl_reorg_worker_cnt`

This setting controls the number of workers used by DDL reorganization work, such as processing existing table data while adding an index. It is not the knob for an ordinary CREATE TABLE, which has no existing rows to backfill.

## What to remember

The SQL node that receives a DDL statement does not need to be the node that schedules its work. TiDB turns the request into durable job metadata, lets the DDL owner dispatch it, and keeps the SQL connection waiting until the new schema is synchronized.

The key handoff is:

```text
SQL AST
  -> DDL job
  -> mysql.tidb_ddl_job
  -> owner scheduler
  -> worker metadata transaction
  -> cluster schema-version sync
```

Once this path is clear, the contrast with `ADD INDEX` is easier to understand: both begin as DDL jobs, but index creation needs reorganization workers and additional data-processing steps, while a plain table creation publishes metadata.

## References

1. TiDB documentation, [DDL Introduction](https://docs.pingcap.com/tidb/stable/ddl-introduction)
2. TiDB documentation, [System Variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_fast_create_table)
3. TiDB source: [DDLExec](https://github.com/pingcap/tidb/blob/master/pkg/executor/ddl.go)
4. TiDB source: [DDL executor and job submission](https://github.com/pingcap/tidb/blob/master/pkg/ddl/executor.go)
5. TiDB source: [JobSubmitter](https://github.com/pingcap/tidb/blob/master/pkg/ddl/job_submitter.go)
6. TiDB source: [job persistence](https://github.com/pingcap/tidb/blob/master/pkg/ddl/jobsubmit/submit.go)
7. TiDB source: [jobScheduler](https://github.com/pingcap/tidb/blob/master/pkg/ddl/job_scheduler.go)
8. TiDB source: [worker job steps](https://github.com/pingcap/tidb/blob/master/pkg/ddl/job_worker.go)
9. TiDB source: [onCreateTable](https://github.com/pingcap/tidb/blob/master/pkg/ddl/create_table.go)
10. TiDB source: [system variable implementation](https://github.com/pingcap/tidb/blob/master/pkg/sessionctx/variable/sysvar.go)
11. TiDB source: [DDL reorganization workers](https://github.com/pingcap/tidb/blob/master/pkg/ddl/backfilling.go)
12. PingCAP Blog, [In-Depth Analysis of TiDB DDL Framework Optimizations](https://www.pingcap.com/blog/tidb-ddl-optimizations-unleashing-50x-performance-increases/)
