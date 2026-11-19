---
author: JZ
pubDatetime: 2026-11-19T19:29:00Z
modDatetime: 2026-11-19T19:29:00Z
title: System Design - How TiDB ADMIN CHECKSUM TABLE Works in Source
tags:
  - design-system
  - design-database
description: "Trace TiDB's ADMIN CHECKSUM TABLE through five structs in TiDB and TiKV: snapshot selection, table and index tasks, CRC64-XOR scanning, result reduction, and concurrency settings."
---

## Table of contents

## A small result can hide a large scan

After importing a table, an engineer wants a compact description of the stored data. Counting rows would miss a changed value. Downloading every row to a client would be expensive. TiDB exposes an administrative command that returns a checksum, a key-value count, and a byte count:

```sql
ADMIN CHECKSUM TABLE shop.orders;
```

The result contains the columns `Db_name`, `Table_name`, `Checksum_crc64_xor`, `Total_kvs`, and `Total_bytes`. It looks like a small metadata query, but computing it requires scanning table and index key ranges.

This walkthrough follows **TiDB and TiKV v8.5.0**, with source links pinned to TiDB commit `d13e52ed6e22cc5789bed7c64c861578cd2ed55b` and TiKV commit `a2c58c94f89cbb410e66d8f85c236308d6fc64f0`. We will use one nonpartitioned table with an ordinary secondary index. The focus is five structs and their handoffs, rather than the full SQL planner or backup system.

## What is being checksummed?

TiDB stores a SQL table as **key-value pairs** in TiKV. A record key identifies a row; separate index keys support secondary-index lookups. Those encoded keys include identifiers such as table IDs and index IDs.

Consider this table in a test database:

```sql
CREATE TABLE shop.orders (
    id BIGINT PRIMARY KEY CLUSTERED,
    external_ref VARCHAR(32) NOT NULL,
    UNIQUE KEY uk_external_ref (external_ref)
);

INSERT INTO shop.orders VALUES
    (1, 'web-001'),
    (2, 'web-002'),
    (3, 'web-003');
```

For this simple schema, three rows produce three record KVs and three secondary-index KVs. The clustered primary key is represented by the record key, rather than another separate secondary-index entry. Thus `Total_kvs` covers more than the SQL row count.

For the ordinary request we will follow, TiKV computes:

```text
checksum    = CRC64(key_1 || value_1)
            XOR CRC64(key_2 || value_2)
            XOR ...

total_kvs   = number of visible key-value pairs scanned
total_bytes = sum of encoded key lengths + value lengths

|| means byte concatenation
```

CRC64 is a 64-bit cyclic redundancy check: it maps bytes to a compact value useful for detecting accidental changes. XOR combines two values bit by bit, producing 1 where their bits differ. Its useful property here is that partial results can be combined in any order.

These are the encoded KVs visible at a read timestamp. They are not a hash of the SQL text, all historical versions maintained by [MVCC](/posts/design-how-mvcc-works), or the compressed sorted-table files (SSTs) on disk.

The [SQL reference](https://docs.pingcap.com/tidb/v8.5/sql-statement-admin-checksum-table/) points out a practical consequence: two tables with identical SQL values but different table IDs get different checksums. A checksum is meaningful only when the compared representations and snapshots are compatible. It is not a general-purpose comparison of two independently created SQL tables.

## Five structs divide the work

Four of the structs live in TiDB's [`pkg/executor/checksum.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go). The fifth lives in TiKV's [`src/coprocessor/checksum.rs`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/coprocessor/checksum.rs).

| Struct                    | Responsibility                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| TiDB `ChecksumTableExec`  | Own the tables, run workers, collect results, and emit SQL rows.                         |
| TiDB `checksumContext`    | Keep one table's metadata, read timestamp, and accumulated response; build scan tasks.   |
| TiDB `checksumTask`       | Describe one table-record or index-range request, with IDs used to attribute the result. |
| TiDB `checksumResult`     | Carry a task's response or error back to the coordinator.                                |
| TiKV `ChecksumContext<S>` | Read a snapshot through a range scanner and calculate a partial checksum.                |

The two similarly named contexts serve different purposes. TiDB's lowercase `checksumContext` organizes a SQL table. TiKV's Rust `ChecksumContext<S>` executes one storage-side request; `S` is the snapshot implementation supplied to it.

```text
TiDB SQL node
+---------------------------------------------------------------+
| ChecksumTableExec                                             |
|   tables[table ID] -> checksumContext                          |
|                         |                                     |
|                         | build table + index requests         |
|                         v                                     |
|                checksumTask -> taskCh -> checksumWorker        |
|                                             |                 |
|   checksumContext <- merge <- resultCh <- checksumResult       |
+---------------------------------------------+-----------------+
                                              |
                                  distsql.Checksum / KV client
                                              |
                             split ranges into Region requests
                                              |
                      +-----------------------+----------------+
                      v                                        v
             TiKV Region request                      TiKV Region request
             ChecksumContext<S>                       ChecksumContext<S>
                      |                                        |
                snapshot scanner                         snapshot scanner
                      |                                        |
                      +------ checksum / KV count / bytes ------+
```

A **Region** is TiKV's unit of key-range distribution. One TiDB task can cover ranges spanning many Regions, so a task is not the same thing as a single storage RPC.

## Step 1: choose one snapshot before distributing work

The executor builder's [`buildChecksumTable`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/builder.go#L724-L739) creates the executor, calls `getSnapshotTS()`, and passes that timestamp to every table context:

```go
// Excerpt from buildChecksumTable; error handling omitted.
startTs, err := b.getSnapshotTS()
for _, t := range v.Tables {
    e.tables[t.TableInfo.ID] = newChecksumContext(
        t.DBInfo, t.TableInfo, startTs,
    )
}
```

The shared timestamp matters because the work runs concurrently. Without it, one scan might observe the table before an update while another observes an index after that update. Their combined digest would describe no single database snapshot.

Later, both table and index requests call `SetStartTS(c.startTs)`. TiKV receives that timestamp and uses MVCC to read the versions visible at that point. A later write does not automatically become part of a scan just because that worker starts later.

This also explains why two separate executions can produce different checksums on an actively changing table. Each execution can be internally consistent while observing different committed states.

## Step 2: turn table metadata into record and index tasks

[`checksumContext.buildTasks`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L219-L273) calls `appendRequest4PhysicalTable`. That helper adds a record-range request, then one request for each index whose schema state is `StatePublic`.

For our nonpartitioned example:

```text
Logical table: orders

checksumTask A
    tableID         = orders table ID
    physicalTableID = orders table ID
    indexID         = -1                 <- sentinel for record scan
    request         = full record-key range

checksumTask B
    tableID         = orders table ID
    physicalTableID = orders table ID
    indexID         = uk_external_ref index ID
    request         = full index-key range
```

The logical table ID tells the coordinator which SQL result to update. The physical table ID identifies the key space to scan. The code keeps these separately because partitioned tables introduce additional physical IDs; `buildTasks` also loops over partition definitions. Partition and global-index layouts deserve separate analysis, so this example stays with a nonpartitioned table.

[`buildTableRequest` and `buildIndexRequest`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L275-L316) set three important properties:

- The scan target is table records or index entries.
- The algorithm is `ChecksumAlgorithm_Crc64_Xor`.
- The request carries the shared timestamp and distributed scan concurrency.

They use full handle or index ranges. This command has no predicate selecting only recent orders.

The request builder's [`SetChecksumRequest`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/distsql/request_builder.go#L215-L224) sets `ReqTypeChecksum`, serializes the checksum request, and sets `NotFillCache=true`. The cache flag helps prevent a large verification scan from filling the storage block cache with data read once. It does not make the scan free of I/O, CPU, or all caching effects.

## Step 3: Open does the expensive work

Many executors do most of their work during repeated `Next()` calls. Here, [`ChecksumTableExec.Open`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L45-L95) performs the distributed scan and waits for all task results.

It reads the checksum worker concurrency, builds the tasks, starts workers, and sends tasks through `taskCh`. Both task and result channels have capacity equal to the number of tasks.

```text
Open()
  |
  +-- build tasks
  +-- start N checksumWorker goroutines
  +-- enqueue tasks and close taskCh
  +-- receive exactly one checksumResult per task
  +-- merge successes; remember any error
  +-- return an error if any task failed
```

Each [`checksumWorker`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L137-L186) calls `handleChecksumRequest` and puts its result on `resultCh`. The handler sends through `distsql.Checksum`, then repeatedly calls `NextRaw()` to receive serialized partial responses from the distributed request.

The handler unmarshals each response, merges it into a task-local accumulator, and checks the session's SQL kill signal before the request and between returned pieces. This is a concrete cancellation check; it is not a promise that every storage operation stops instantly.

Workers produce results, but the coordinator updates each table accumulator as it drains `resultCh`. That arrangement avoids multiple workers simultaneously mutating the same table checksum.

If a task fails, `Open()` remembers the error and continues collecting the remaining task results before returning an error. Although successful partial values may already have been accumulated internally, the command does not report that incomplete aggregate as a successful checksum row.

## Step 4: TiKV scans the snapshot and hashes each KV

The checksum branch of TiKV's [coprocessor endpoint](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/coprocessor/endpoint.rs#L369-L378) constructs `ChecksumContext<S>` using the request, key ranges, read timestamp, and storage snapshot.

[`ChecksumContext::new`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/coprocessor/checksum.rs#L25-L53) wraps the snapshot in `SnapshotStore`, passing `start_ts`. It then creates a `RangesScanner` with forward scanning and `is_key_only=false`. Values must be read because they contribute to the checksum and byte count.

[`handle_request`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/coprocessor/checksum.rs#L56-L97) rejects unsupported algorithms and iterates through visible KVs. The core helper is short enough to read directly:

```rust
pub fn checksum_crc64_xor(
    checksum: u64,
    mut digest: crc64fast::Digest,
    k_suffix: &[u8],
    v: &[u8],
) -> u64 {
    digest.write(k_suffix);
    digest.write(v);
    checksum ^ digest.sum64()
}
```

For a normal `ADMIN CHECKSUM TABLE` request, the key-prefix rewrite rule is absent. The initial digest is empty, and `k_suffix` is the full scanned key. Each KV therefore contributes `CRC64(key || value)`.

The TiKV handler also supports an optional rewrite rule: it verifies and removes a new key prefix, then hashes an old prefix followed by the remaining key bytes and value. It adjusts the byte count for the prefix-length difference. The SQL request constructors shown earlier do not populate that rule. Recognizing this branch prevents mistaking specialized key rewriting for the ordinary command's behavior.

After scanning, TiKV serializes just three aggregate values into `ChecksumResponse`. It sends those values back rather than returning every row to TiDB for hashing. Errors from the scanner propagate out of the handler.

## Step 5: XOR makes partial results easy to combine

Suppose one task spans two Regions. Region A scans two KVs, while Region B scans one:

```text
Region A: checksum_A = hash(KV1) XOR hash(KV2)
Region B: checksum_B = hash(KV3)

Task:     checksum   = checksum_A XOR checksum_B
                       = hash(KV1) XOR hash(KV2) XOR hash(KV3)
```

XOR is associative and commutative, so completion order does not affect the result. TiDB can combine responses as they arrive. The same operation works again when combining record and index tasks for a table.

The shared Go helper [`updateChecksumResponse`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L332-L336) expresses this reduction:

```go
func updateChecksumResponse(resp, update *tipb.ChecksumResponse) {
    resp.Checksum ^= update.Checksum
    resp.TotalKvs += update.TotalKvs
    resp.TotalBytes += update.TotalBytes
}
```

There are two aggregation levels on the TiDB side: raw partial responses into a task result, then task results into the table context. The helper works at both levels because the representation is closed under the same merge operation.

This requires the distributed scan to cover the intended KVs correctly. XOR is not a deduplication scheme: combining the same partial checksum twice cancels it out, while the counts would still be added twice. Correct range coverage and request handling remain necessary.

Finally, [`Next()`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go#L97-L112) emits one row per table from the already accumulated responses and sets `done=true`. Subsequent calls produce no further rows. Much of the time a client spends waiting for this command has already been spent in `Open()`.

## Two settings control different layers of concurrency

The v8.5.0 [variable defaults](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/tidb_vars.go#L1246-L1255) and [system-variable reference](https://docs.pingcap.com/tidb/v8.5/system-variables/) identify two relevant controls:

| Setting                           | Default | Scope           | Role in this path                                                     |
| --------------------------------- | ------- | --------------- | --------------------------------------------------------------------- |
| `tidb_checksum_table_concurrency` | `4`     | SESSION         | Number of checksum worker goroutines started by `Open()`.             |
| `tidb_distsql_scan_concurrency`   | `15`    | SESSION, GLOBAL | Distributed scan concurrency attached to each table or index request. |

Both accept values from 1 to 256 in this version. They control different layers: how many tasks the executor can work on, and how much distributed scan parallelism each request can use.

For our table with one secondary index, only two tasks exist, so starting four workers cannot create four independent table/index tasks. Conversely, a table with many indexes can have several active tasks, each scanning multiple Regions. Multiplying the settings gives a rough indication of possible fanout, not an exact count of simultaneous RPCs.

For a session running a deliberate verification scan, a conservative starting point might be:

```sql
SELECT @@SESSION.tidb_checksum_table_concurrency,
       @@SESSION.tidb_distsql_scan_concurrency;

SET SESSION tidb_checksum_table_concurrency = 2;
SET SESSION tidb_distsql_scan_concurrency = 4;

ADMIN CHECKSUM TABLE shop.orders;
```

Those values are an example, not universal tuning recommendations. More concurrency can reduce elapsed time while increasing TiKV read load and competing with foreground queries. Compare scan throughput, TiKV CPU and I/O, and application latency before raising it.

## What a matching checksum can establish

CRC64-XOR is a compact integrity signal, not a cryptographic proof. Collisions are possible, and the algebra deliberately discards ordering. The KV and byte counts add useful checks but cannot make equality mathematically conclusive.

The command also does not walk an index entry and verify that its referenced row contains the corresponding indexed values. It hashes the record and index key spaces. A structural consistency investigation needs the appropriate tools, such as `ADMIN CHECK TABLE`, rather than treating one combined checksum as an index-to-row validation report.

Backup tooling illustrates the cost tradeoff. PingCAP's [post on backup verification](https://www.pingcap.com/blog/optimizing-backup-verification-enhancing-performance-reliability-tidb/) explains that BR v8.5 disables the additional full-table checksum verification by default during backup, while retaining other validation mechanisms. That BR policy is separate from explicitly executing `ADMIN CHECKSUM TABLE`; both make sense once we recognize that the small checksum result still requires substantial scanning.

When reading this code again, follow the data in order: one snapshot timestamp, full record/index ranges, task workers, storage-side CRC64-XOR, then two levels of reduction. Those handoffs explain both the command's compact output and its operational cost.

## References

1. TiDB v8.5: [`ADMIN CHECKSUM TABLE`](https://docs.pingcap.com/tidb/v8.5/sql-statement-admin-checksum-table/), including result columns and the effect of table IDs.
2. TiDB v8.5.0: [`pkg/executor/checksum.go`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/checksum.go), the four TiDB structs, worker loop, and aggregation.
3. TiDB v8.5.0: [`buildChecksumTable`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/executor/builder.go#L724-L739), snapshot setup.
4. TiDB v8.5.0: [`SetChecksumRequest`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/distsql/request_builder.go#L215-L224) and [`distsql.Checksum`](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/distsql/distsql.go#L180-L195), request construction and dispatch.
5. TiKV v8.5.0: [`src/coprocessor/checksum.rs`](https://github.com/tikv/tikv/blob/a2c58c94f89cbb410e66d8f85c236308d6fc64f0/src/coprocessor/checksum.rs), snapshot scanner, optional prefix rewriting, and CRC64-XOR implementation.
6. TiDB v8.5: [System Variables](https://docs.pingcap.com/tidb/v8.5/system-variables/#tidb_checksum_table_concurrency) and v8.5.0 [variable registration](https://github.com/pingcap/tidb/blob/d13e52ed6e22cc5789bed7c64c861578cd2ed55b/pkg/sessionctx/variable/sysvar.go#L251), configuration scopes and limits.
7. PingCAP: [Optimizing Backup Verification: How to Enhance Performance and Reliability in TiDB](https://www.pingcap.com/blog/optimizing-backup-verification-enhancing-performance-reliability-tidb/), context on full-table scan cost and BR v8.5 defaults.
