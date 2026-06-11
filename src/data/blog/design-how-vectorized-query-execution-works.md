---
author: JZ
pubDatetime: 2026-06-11T07:00:00Z
modDatetime: 2026-06-11T07:00:00Z
title: System Design - How Vectorized Query Execution Works
tags:
  - design-system
  - design-database
description:
  "How vectorized query execution works in modern databases: the Volcano model's limitations, batch-at-a-time processing, columnar memory layout, SIMD exploitation, and source code walkthrough from DuckDB and Apache DataFusion."
---

## Table of contents

## Context

Every SQL database needs a **query execution engine** — the component that actually runs your query plan and produces results. For decades, the dominant design was the **Volcano model** (also called the iterator model), introduced by Goetz Graefe in 1994. In this model, each operator (scan, filter, join, aggregate) produces one row at a time by calling `next()` on its child operator.

The Volcano model is elegant and composable. But on modern hardware, it leaves enormous performance on the table. Why? Because calling a virtual function for every single row creates:

1. **Function call overhead** — millions of virtual dispatch calls per query.
2. **Poor branch prediction** — the CPU cannot predict which operator's `next()` will be called.
3. **Cache misses** — row-at-a-time processing scatters data access patterns.
4. **No SIMD utilization** — processing one value at a time cannot exploit vector CPU instructions.

**Vectorized execution** solves these problems by processing data in **batches** (called vectors or chunks) of typically 1,024 to 2,048 rows at a time. Instead of one `next()` call per row, operators call `next_batch()` and receive a column-oriented chunk of data. Tight loops over arrays of the same type allow the CPU to prefetch, pipeline, and auto-vectorize.

```
              Volcano Model                    Vectorized Model
         (row-at-a-time)                  (batch-at-a-time)

    +--------+                          +--------+
    | Output |  next() -> 1 row         | Output |  next_batch() -> 1024 rows
    +---+----+                          +---+----+
        |                                   |
    +---+----+                          +---+----+
    | Filter |  next() -> 1 row         | Filter |  next_batch() -> 1024 rows
    +---+----+                          +---+----+
        |                                   |
    +---+----+                          +---+----+
    |  Scan  |  next() -> 1 row         |  Scan  |  next_batch() -> 1024 rows
    +--------+                          +--------+

    For 1M rows:                        For 1M rows:
    1,000,000 virtual calls             ~1,000 virtual calls
    per operator                        per operator
```

This idea was formalized in the 2005 paper ["MonetDB/X100: Hyper-Pipelining Query Execution"](https://www.cidrdb.org/cidr2005/papers/P19.pdf) by Peter Boncz, Marcin Zukowski, and Niels Nes. Today, nearly every high-performance analytical database uses this approach: DuckDB, ClickHouse, Apache DataFusion, Velox (Meta), TiDB (TiFlash), and Snowflake.

## The Volcano Model: What We're Replacing

To appreciate vectorized execution, let's first see what the Volcano model looks like in code. Here is a simplified iterator-style filter operator:

```python
class FilterOperator:
    def __init__(self, child, predicate):
        self.child = child
        self.predicate = predicate

    def next(self):
        while True:
            row = self.child.next()  # virtual call
            if row is None:
                return None
            if self.predicate(row):  # branch per row
                return row
```

For a query like `SELECT * FROM orders WHERE amount > 100`, scanning 10 million rows means:
- 10 million calls to `scan.next()`
- 10 million predicate evaluations (each a branch)
- 10 million calls through the filter's `next()`

The CPU spends more time in call/return overhead and branch mispredictions than doing actual computation.

## Columnar Chunks: The Core Data Structure

Vectorized engines organize data in **columnar chunks** (also called vectors or batches). A chunk holds N rows, but stored column-by-column:

```
               Row-oriented (Volcano)         Column-oriented (Vectorized)

    Row 0:  | id=1 | name="Alice" | amt=50  |
    Row 1:  | id=2 | name="Bob"   | amt=150 |     id:   [1, 2, 3, 4, ...]     <- contiguous int64[]
    Row 2:  | id=3 | name="Carol" | amt=200 |     name: ["Alice","Bob",...]    <- contiguous str[]
    Row 3:  | id=4 | name="Dave"  | amt=75  |     amt:  [50, 150, 200, 75,...] <- contiguous int64[]
                                                   valid: [1, 1, 1, 1, ...]    <- null bitmap

                                                   Chunk size: 2048 rows
```

Each column vector is a flat, typed array — exactly what CPUs love. When the filter operator evaluates `amt > 100`, it iterates over a contiguous `int64[]` array. The CPU can:

1. **Prefetch** the next cache line while processing the current one.
2. **Auto-vectorize** the comparison loop using SIMD instructions (SSE/AVX on x86, NEON on ARM).
3. **Avoid branch misprediction** by producing a selection vector instead of branching per row.

Here is how DuckDB defines its core `Vector` type in [`src/include/duckdb/common/types/vector.hpp`](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/types/vector.hpp):

```cpp
class Vector {
public:
    VectorType vector_type;     // FLAT, CONSTANT, DICTIONARY, SEQUENCE
    LogicalType type;           // INT32, VARCHAR, TIMESTAMP, etc.
    data_ptr_t data;            // pointer to the raw data array
    ValidityMask validity;      // null bitmap (1 bit per row)
    // ...
};
```

A `DataChunk` groups multiple vectors together:

```cpp
class DataChunk {
public:
    vector<Vector> data;        // one Vector per column
    idx_t count;                // number of rows (up to STANDARD_VECTOR_SIZE = 2048)
    // ...
};
```

The `STANDARD_VECTOR_SIZE` of 2048 is chosen to fit comfortably in L1/L2 cache. For 8-byte integers, one vector is 16 KB — well within the typical 32-64 KB L1 data cache.

## Selection Vectors: Branch-Free Filtering

A key insight in vectorized execution is the **selection vector**. Instead of physically removing rows that don't match a filter (which requires copying), operators produce a selection vector — an array of indices into the chunk that passed the predicate:

```
    Input chunk (amt column):  [50, 150, 200, 75, 300, 40, 180, 90]
    Predicate: amt > 100

    Selection vector:          [1, 2, 4, 6]     (indices that passed)
    Selected count:            4

    Downstream operators only process indices in the selection vector.
    No data is copied or moved.
```

The filter kernel itself is a tight loop with no branches in the hot path:

```cpp
// Simplified from DuckDB's comparison operators
template <class T>
idx_t SelectGreaterThan(T *data, T constant, idx_t count, sel_t *result) {
    idx_t result_count = 0;
    for (idx_t i = 0; i < count; i++) {
        result[result_count] = i;
        result_count += (data[i] > constant);  // no branch! arithmetic on boolean
    }
    return result_count;
}
```

The line `result_count += (data[i] > constant)` is the trick. The comparison produces 0 or 1. We always write `i` to `result[result_count]`, but only advance the count when the condition is true. Modern compilers turn this into a conditional move (`cmov`) instruction — no branch, no misprediction.

## How Operators Work in Vectorized Mode

Let's trace through a query to see how operators interact:

```sql
SELECT customer_id, SUM(amount)
FROM orders
WHERE status = 'shipped'
GROUP BY customer_id
```

The plan is: `Scan -> Filter -> HashAggregate -> Project`

```
    +---------------------+
    |      Project        |  Extracts customer_id, sum columns
    +----------+----------+
               |
    +----------+----------+
    |   HashAggregate     |  Groups by customer_id, sums amount
    +----------+----------+
               |
    +----------+----------+
    |      Filter         |  status = 'shipped'
    +----------+----------+
               |
    +----------+----------+
    |       Scan          |  Reads columnar chunks from storage
    +---------------------+

    Data flow (each arrow is a DataChunk of ~2048 rows):

    Scan:
    +-----------+-----------+-----------+
    | customer  |  amount   |  status   |  chunk of 2048 rows
    | int32[]   |  int64[]  |  varchar[]|
    +-----------+-----------+-----------+
         |
         v
    Filter (produces selection vector):
    +-----------+-----------+-----------+----------+
    | customer  |  amount   |  status   | sel_vec  |  same chunk, fewer valid rows
    | int32[]   |  int64[]  |  varchar[]| [0,3,7..]|
    +-----------+-----------+-----------+----------+
         |
         v
    HashAggregate (processes only selected rows):
    For each selected row: hash(customer_id) -> bucket -> accumulate amount
         |
         v
    Project:
    +-----------+-----------+
    | customer  |    sum    |  final result chunk
    | int32[]   |  int64[]  |
    +-----------+-----------+
```

### The Scan Operator

The scan reads data from storage in chunk-sized portions. If the underlying storage is already columnar (like Parquet files or DuckDB's native format), this is nearly zero-cost — just point the vector's `data` pointer at the storage buffer.

### The Filter Operator

```cpp
// Simplified DuckDB filter execution
void FilterExecutor::Execute(DataChunk &input, SelectionVector &sel, idx_t &count) {
    // Evaluate the expression "status = 'shipped'" over the chunk
    // Result: a SelectionVector of row indices that passed
    for (auto &expr : expressions) {
        count = expr.Select(input, sel, count);
    }
    // input.Slice(sel, count) makes downstream see only matching rows
}
```

The filter does not copy data. It produces a selection vector that subsequent operators respect.

### The Hash Aggregate Operator

The hash aggregate maintains a hash table. For each batch, it:
1. Computes hashes of the group-by keys (vectorized: hash an entire `int32[]` at once).
2. Probes the hash table for each row in the batch.
3. Updates aggregation states (sum, count, etc.) in bulk.

```cpp
// Simplified hash aggregate from DataFusion (Rust)
// Source: apache/datafusion/datafusion/physical-plan/src/aggregates/row_hash.rs
fn update_batch(&mut self, batch: &RecordBatch) -> Result<()> {
    let group_values = self.evaluate_group_by(batch)?;
    let hashes = create_hashes(&group_values)?;  // vectorized hashing

    for row_idx in 0..batch.num_rows() {
        let hash = hashes[row_idx];
        let entry = self.map.get_or_insert(hash, &group_values, row_idx);
        self.accumulators[entry].update(&batch, row_idx);
    }
    Ok(())
}
```

Even the hash computation benefits from vectorization — computing murmur3 or xxhash over a contiguous array of integers is highly SIMD-friendly.

## SIMD: Explicit Vectorization

Beyond compiler auto-vectorization, databases can use **explicit SIMD** (Single Instruction, Multiple Data) for critical operations. A single AVX-512 instruction processes 16 x 32-bit integers simultaneously:

```
    Scalar comparison (1 element per cycle):

    amt[0] > 100  ->  true
    amt[1] > 100  ->  false
    amt[2] > 100  ->  true
    ...
    (8 cycles for 8 elements)

    AVX-256 comparison (8 elements per cycle):

    +-----+-----+-----+-----+-----+-----+-----+-----+
    | 150 | 50  | 200 | 75  | 300 | 40  | 180 | 90  |  <- amt[0..7]
    +-----+-----+-----+-----+-----+-----+-----+-----+
              VCMPGTD (compare greater than, 32-bit)
    +-----+-----+-----+-----+-----+-----+-----+-----+
    | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 |  <- broadcast constant
    +-----+-----+-----+-----+-----+-----+-----+-----+
              =
    +-----+-----+-----+-----+-----+-----+-----+-----+
    | 0xFF| 0x0 |0xFF | 0x0 |0xFF | 0x0 |0xFF | 0x0 |  <- result mask
    +-----+-----+-----+-----+-----+-----+-----+-----+
    (1 cycle for 8 elements)
```

DuckDB and ClickHouse use SIMD extensively for:
- String comparisons and searches
- Hash computation
- Aggregate functions (sum, min, max)
- Null bitmap operations
- Dictionary decoding

## Adaptive Execution: Morsel-Driven Parallelism

Vectorized execution also pairs naturally with **parallelism**. The [HyPer database paper](https://db.in.tum.de/~leis/papers/morsels.pdf) (2014) introduced **morsel-driven parallelism**: the table is divided into fixed-size "morsels" (e.g., 100,000 rows each), and worker threads dynamically claim morsels from a shared work queue.

```
    Table: orders (10M rows)
    Morsel size: 100,000 rows
    -> 100 morsels

    +--------+  +--------+  +--------+  +--------+
    |Thread 1|  |Thread 2|  |Thread 3|  |Thread 4|
    +---+----+  +---+----+  +---+----+  +---+----+
        |           |           |           |
        v           v           v           v
    +-------------------------------------------------+
    | Morsel Queue: [M0][M1][M2]...[M99]              |
    | (each morsel = 100K rows, processed in chunks   |
    |  of 2048 within the thread)                     |
    +-------------------------------------------------+

    Each thread:
    1. Claims a morsel from the queue (atomic fetch-and-add)
    2. Processes the morsel in chunks of 2048 rows
    3. Writes results to thread-local state
    4. Claims next morsel
    5. Final merge when all morsels done
```

This design achieves near-linear scalability because:
- No global locks during processing (thread-local aggregation states).
- Load balancing is automatic (fast threads just claim more morsels).
- Each chunk of 2048 rows stays in L1 cache within a single thread.

## Real-World Performance: Why It Matters

The MonetDB/X100 paper showed **10-100x speedups** over the Volcano model on analytical queries. Modern systems confirm this:

| System | Model | TPC-H SF10 (Q1) |
|--------|-------|------------------|
| PostgreSQL 16 | Volcano (row) | ~3.2 sec |
| DuckDB 1.0 | Vectorized (columnar) | ~0.08 sec |

The 40x difference comes from:
- **~10x** from eliminating per-row function call overhead
- **~2-4x** from cache-friendly sequential access
- **~2-4x** from SIMD auto-vectorization and explicit intrinsics

## Putting It All Together: DuckDB's Execution Pipeline

Here is a simplified view of how DuckDB executes a query from plan to result:

```
    SQL Query
        |
        v
    +-------------------+
    |  Parser/Binder    |
    +--------+----------+
             |
             v
    +--------+----------+
    |  Optimizer         |  (produces physical plan)
    +--------+----------+
             |
             v
    +--------+----------+
    |  Pipeline Builder  |  Splits plan into pipelines
    +--------+----------+
             |
             v
    Pipeline 1:  Scan -> Filter -> HashAggregate (build side)
    Pipeline 2:  HashAggregate (scan) -> Project -> Result

    Each pipeline:
    +------------------------------------------------------------+
    |  Source       Operator      Operator       Sink             |
    |  (produces    (transforms   (transforms    (consumes        |
    |   chunks)     chunks)       chunks)        chunks)          |
    |                                                            |
    |  while source.has_more():                                  |
    |      chunk = source.GetChunk()    // 2048 rows             |
    |      chunk = op1.Execute(chunk)   // filter                |
    |      sink.Sink(chunk)             // aggregate             |
    +------------------------------------------------------------+
    ```

The pipeline concept eliminates materialization between operators. Data flows through the entire pipeline in register/cache without ever being written back to main memory (until it hits a "pipeline breaker" like a hash join build side or sort).

## Comparison: Vectorized vs. Compiled Execution

There is an alternative to vectorized execution: **query compilation** (used by HyPer/Umbra, and partially by Spark's Tungsten). Instead of interpreting a plan with vectorized operators, the database JIT-compiles the entire query into native machine code:

```
    Vectorized (DuckDB, ClickHouse):
    - Interprets plan, but in efficient batches
    - Fast startup (no compilation step)
    - Easier to debug and profile
    - Good for both short and long queries

    Compiled (HyPer, Spark Tungsten):
    - Generates custom machine code per query
    - Eliminates ALL interpretation overhead
    - Slow startup (compilation takes ms)
    - Best for long-running analytical queries
    - Harder to debug (generated code)

    Hybrid (Photon/Databricks, some DuckDB paths):
    - Vectorized by default
    - Hot loops compiled on the fly
    - Best of both worlds but complex to implement
```

In practice, vectorized execution wins for most workloads because the compilation overhead (even with LLVM) is noticeable for sub-second queries, and the vectorized approach already gets within 2-3x of fully compiled code thanks to SIMD and cache efficiency.

## Source Code Tour

To explore vectorized execution in real systems:

| Component | DuckDB | Apache DataFusion |
|-----------|--------|-------------------|
| Vector/Chunk | [`src/include/duckdb/common/types/vector.hpp`](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/types/vector.hpp) | [`arrow-rs/arrow-array`](https://github.com/apache/arrow-rs/tree/master/arrow-array/src) |
| Selection Vector | [`src/include/duckdb/common/types/selection_vector.hpp`](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/types/selection_vector.hpp) | Built into Arrow's `BooleanArray` filter |
| Filter Execution | [`src/execution/operator/filter`](https://github.com/duckdb/duckdb/tree/main/src/execution/operator/filter) | [`datafusion/physical-plan/src/filter.rs`](https://github.com/apache/datafusion/blob/main/datafusion/physical-plan/src/filter.rs) |
| Hash Aggregate | [`src/execution/operator/aggregate`](https://github.com/duckdb/duckdb/tree/main/src/execution/operator/aggregate) | [`datafusion/physical-plan/src/aggregates`](https://github.com/apache/datafusion/tree/main/datafusion/physical-plan/src/aggregates) |
| Pipeline Executor | [`src/parallel/pipeline_executor.cpp`](https://github.com/duckdb/duckdb/blob/main/src/parallel/pipeline_executor.cpp) | [`datafusion/physical-plan/src/execution_plan.rs`](https://github.com/apache/datafusion/blob/main/datafusion/physical-plan/src/execution_plan.rs) |

## References

1. MonetDB/X100: Hyper-Pipelining Query Execution [paper](https://www.cidrdb.org/cidr2005/papers/P19.pdf) — the foundational vectorized execution paper (2005)
2. Volcano — An Extensible and Parallel Query Evaluation System [paper](https://paperhub.s3.amazonaws.com/dace52a42c07f7f8348b08dc2b186061.pdf) — Graefe's original iterator model (1994)
3. Morsel-Driven Parallelism: A NUMA-Aware Query Evaluation Framework [paper](https://db.in.tum.de/~leis/papers/morsels.pdf) — HyPer's parallelism model (2014)
4. Everything You Always Wanted to Know About Compiled and Vectorized Queries But Were Afraid to Ask [paper](https://www.vldb.org/pvldb/vol11/p2209-kersten.pdf) — head-to-head comparison (2018)
5. DuckDB source code [`github.com/duckdb/duckdb`](https://github.com/duckdb/duckdb)
6. Apache DataFusion source code [`github.com/apache/datafusion`](https://github.com/apache/datafusion)
7. ClickHouse vectorized execution [docs](https://clickhouse.com/docs/en/development/architecture#vectorized-query-execution)
8. Andy Pavlo's CMU Database Systems course, Lecture 12: Query Execution II [video](https://www.youtube.com/watch?v=2pmJ2StgvL4)
