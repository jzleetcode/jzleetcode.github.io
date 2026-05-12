---
author: JZ
pubDatetime: 2026-05-12T06:23:00Z
modDatetime: 2026-05-12T06:23:00Z
title: System Design - How Column-Oriented Databases Work
tags:
  - design-system
  - design-database
description:
  "How column-oriented (columnar) databases work: row vs column storage layout, compression techniques, vectorized execution, and source code walkthrough from ClickHouse."
---

## Table of contents

## Context

Imagine you work at an e-commerce company. Your `orders` table has 500 million rows and 30 columns: order ID, customer name, address, product details, shipping info, timestamps, and more. A product analyst runs this query every morning:

```sql
SELECT product_category, SUM(revenue)
FROM orders
WHERE order_date >= '2026-01-01'
GROUP BY product_category;
```

This query only needs **3 columns** out of 30. In a traditional row-oriented database (MySQL, PostgreSQL), the storage engine must read entire rows from disk, loading all 30 columns just to use 3. That means ~90% of the I/O is wasted.

Column-oriented databases flip the storage layout: instead of storing all columns of one row together, they store all values of one column together. The same query now reads only the 3 columns it needs, dramatically reducing I/O.

```
  Row-Oriented Storage (MySQL, PostgreSQL)
  =========================================

  Disk block 1:   [ row1: id, name, category, revenue, date, addr, ... ]
  Disk block 2:   [ row2: id, name, category, revenue, date, addr, ... ]
  Disk block 3:   [ row3: id, name, category, revenue, date, addr, ... ]
         ...

  Reading 3 columns = reading ALL columns (entire rows loaded)


  Column-Oriented Storage (ClickHouse, Parquet, Redshift)
  ========================================================

  Column file "id":        [ 1,    2,    3,    4,    5,    ... ]
  Column file "name":      [ Alice, Bob,  Carol, Dave, Eve, ... ]
  Column file "category":  [ Books, Toys, Books, Food, Toys, ... ]
  Column file "revenue":   [ 29.99, 9.50, 14.00, 3.75, 22.10, ... ]
  Column file "date":      [ 2026-01, 2026-01, 2026-02, ... ]
  Column file "addr":      [ ...,  ...,  ..., ... ]

  Reading 3 columns = reading ONLY those 3 column files
```

This idea is not new. The earliest columnar systems appeared in the 1970s (Cantor, Statistics Canada's RAPID system). The modern wave began with the C-Store paper (2005) by Daniel Abadi, Samuel Madden, and others at MIT, which later became the commercial product Vertica. Today, columnar storage powers most analytical workloads: Amazon Redshift, Google BigQuery, Apache Parquet, DuckDB, and ClickHouse.

Let's walk through the key ideas that make columnar databases fast.

## Physical Layout on Disk

In a row store, each row occupies a contiguous chunk of bytes on disk. A table with N rows and C columns has N chunks, each containing C fields. The storage engine reads rows sequentially, which is great for queries like `SELECT * FROM orders WHERE id = 42` — you find the row and get all its columns in one read.

A column store inverts this. Each column is stored as its own file (or segment within a file). A table with N rows and C columns produces C files, each containing N values of one type.

```
  Row Store Disk Layout            Column Store Disk Layout
  ========================         ========================

  Page 0:                          File: "order_id.col"
  +--------------------------+     +---+---+---+---+---+---
  | r0: id|cat |rev |date|… |     | 1 | 2 | 3 | 4 | 5 |…
  | r1: id|cat |rev |date|… |     +---+---+---+---+---+---
  | r2: id|cat |rev |date|… |
  +--------------------------+     File: "category.col"
                                   +-----+-----+-----+-----
  Page 1:                          |Books|Toys |Books|Food |…
  +--------------------------+     +-----+-----+-----+-----
  | r3: id|cat |rev |date|… |
  | r4: id|cat |rev |date|… |     File: "revenue.col"
  | r5: id|cat |rev |date|… |     +------+-----+------+----
  +--------------------------+     |29.99 |9.50 |14.00 |3.75
                                   +------+-----+------+----
```

ClickHouse, one of the most popular open-source columnar databases, implements this layout through its **MergeTree** storage engine. When you insert data into a ClickHouse table, it creates a "data part" — a directory on disk. Inside each part, every column gets its own file:

```
# An actual ClickHouse MergeTree part on disk:
#
# /var/lib/clickhouse/data/mydb/orders/202601_1_1_0/
#   checksums.txt
#   columns.txt
#   count.txt
#   order_id.bin          <-- compressed column data
#   order_id.mrk2         <-- mark file (index into .bin)
#   category.bin
#   category.mrk2
#   revenue.bin
#   revenue.mrk2
#   order_date.bin
#   order_date.mrk2
#   primary.idx           <-- sparse primary index
```

Each `.bin` file contains compressed data for one column. Each `.mrk2` file (called a "mark file") stores offsets that map sparse index entries to positions within the `.bin` file, allowing the engine to skip directly to the right compressed block. This is what makes column pruning work at the I/O level — the engine literally opens only the `.bin` files for the columns your query references.

In the ClickHouse source code, the reading path for a MergeTree part starts in `MergeTreeReaderWide.cpp`. When a query asks for specific columns, the reader opens only those column files:

```cpp
// Simplified from src/Storages/MergeTree/MergeTreeReaderWide.cpp
//
// For each requested column, the reader creates a stream
// that reads from that column's .bin file on disk.
// Columns not in the query are never opened.

for (const auto & column : columns_to_read)
{
    auto stream = std::make_unique<MergeTreeReaderStream>(
        path + column.name + DATA_FILE_EXTENSION,   // e.g., "revenue.bin"
        path + column.name + MARKS_FILE_EXTENSION,   // e.g., "revenue.mrk2"
        marks_count,
        all_mark_ranges,
        settings
    );
    streams[column.name] = std::move(stream);
}
```

## Compression: Why Same-Type Values Compress Better

Storing a column's values together has a side effect that turns out to be hugely important: all values in one file share the same data type. A revenue column is all `Float64`. A category column is all short strings from a small set. This uniformity lets compression algorithms achieve ratios that row stores cannot match.

Consider a row store's disk block: it interleaves an integer, a string, a float, a date, another string, and so on. From a compressor's perspective, this is nearly random data — the patterns are short and mixed. A column file, by contrast, is a long sequence of same-typed values that often repeat, increment, or follow a narrow distribution. Compressors thrive on this.

### Run-Length Encoding (RLE)

If a column has long runs of the same value, RLE replaces each run with a (value, count) pair:

```
  Original category column (sorted by category):
  [Books, Books, Books, Books, Food, Food, Toys, Toys, Toys]

  After RLE:
  [(Books, 4), (Food, 2), (Toys, 3)]

  9 values compressed to 3 pairs
```

This works spectacularly well on sorted columns. If a table is sorted by `order_date`, the date column might compress 100:1 because consecutive rows share the same date.

### Dictionary Encoding

Low-cardinality columns (columns with few distinct values) benefit from dictionary encoding: replace each value with a short integer code.

```
  Dictionary:             Encoded column:
  0 -> "Books"            [0, 2, 0, 1, 2, 0, 1, 2, 0]
  1 -> "Food"
  2 -> "Toys"

  Original: 9 strings averaging 4 bytes = 36 bytes
  Encoded:  9 integers at 1 byte each   =  9 bytes + 15 byte dict = 24 bytes
```

With millions of rows, the dictionary is negligible and the savings are enormous. In ClickHouse, the `LowCardinality` column type wraps this concept into the type system. When you declare a column as `LowCardinality(String)`, ClickHouse automatically maintains a dictionary and stores integer codes:

```sql
-- ClickHouse DDL using LowCardinality for dictionary encoding
CREATE TABLE orders (
    order_id    UInt64,
    category    LowCardinality(String),  -- auto dictionary-encoded
    revenue     Float64,
    order_date  Date
) ENGINE = MergeTree()
ORDER BY order_date;
```

### Delta Encoding and Frame of Reference

For sorted numeric columns (timestamps, auto-incrementing IDs), delta encoding stores the difference between consecutive values instead of the values themselves:

```
  Original timestamps:    [1000, 1001, 1001, 1003, 1004, 1005]
  Deltas:                 [1000,    1,    0,    2,    1,    1]

  The deltas are small numbers that compress further with bit-packing.
  If most deltas fit in 2 bits, 32 values pack into a single 64-bit word.
```

ClickHouse supports multiple codec chains. You can explicitly stack encodings:

```sql
-- Stack delta encoding + ZSTD compression on a timestamp column
CREATE TABLE events (
    ts DateTime64(3) CODEC(Delta, ZSTD(1)),
    value Float64 CODEC(Gorilla, ZSTD(1))
) ENGINE = MergeTree()
ORDER BY ts;
```

The `Delta` codec computes differences; then `ZSTD` compresses the resulting small integers. For floating-point metrics, `Gorilla` (XOR-based encoding from Facebook's time-series paper) exploits the fact that consecutive sensor readings change very little.

## Vectorized Execution: Processing Columns in Batches

Reading less data from disk is only half the story. The other half is processing that data efficiently in the CPU. Column stores enable **vectorized execution**, which processes data in batches of values from one column rather than one row at a time.

### Why Row-at-a-Time is Slow

In a traditional row-at-a-time engine, the execution loop looks conceptually like this:

```
  for each row in table:
      1. Check: does row.date >= '2026-01-01'?     -- branch
      2. If yes, extract row.category               -- pointer chase
      3. Extract row.revenue                        -- pointer chase
      4. Look up category in hash table              -- hash + branch
      5. Add revenue to running sum                  -- arithmetic

  Each iteration: function calls, type dispatches, branch mispredictions
```

Each row goes through the full pipeline individually. The CPU spends most of its time on overhead: function call dispatch, type checking, hash table lookups, and branch prediction misses. The actual arithmetic (adding numbers) is a tiny fraction.

### Vectorized Approach

A vectorized engine processes a **batch** (typically 1024-8192 values) from one column at a time:

```
  Step 1: Load batch of 1024 dates
          Apply filter: date >= '2026-01-01'
          Result: a bitmask [1,1,0,1,0,1,1,1,0,0,1,...]

  Step 2: Load batch of 1024 categories
          Apply bitmask to keep only matching rows

  Step 3: Load batch of 1024 revenues
          Apply bitmask, then SUM the survivors

  Each step: tight loop, no branches, SIMD-friendly
```

The key insight is that each step becomes a tight loop over a contiguous array of same-typed values. Modern CPUs are extremely fast at this pattern because:

1. **No branch mispredictions** — the filter produces a bitmask rather than branching per row.
2. **SIMD instructions** — a single CPU instruction can compare or add 4, 8, or even 16 values simultaneously (e.g., AVX-256 processes 4 doubles at once).
3. **Cache locality** — the array of values fits neatly in CPU cache lines; no pointer-chasing to unrelated column data.
4. **Loop unrolling** — the compiler can aggressively optimize a simple loop over a flat array.

In ClickHouse, the unit of vectorized processing is a `Block`, which contains `ColumnVector` objects — contiguous arrays of typed values. Arithmetic and comparison functions operate on entire columns at once:

```cpp
// Simplified from src/Functions/FunctionsComparison.h
//
// This function compares an entire column of dates against a constant.
// It iterates over a contiguous array, producing a result array of UInt8 (0 or 1).
// The compiler auto-vectorizes this into SIMD instructions.

template <typename T>
void compareColumnConst(
    const T * data,
    size_t size,
    T constant,
    UInt8 * result)
{
    for (size_t i = 0; i < size; ++i)
        result[i] = data[i] >= constant;
}
```

This loop is what the compiler transforms into SIMD instructions. On an AVX-512 capable machine, it can compare 8 `Int64` values per clock cycle.

## Sparse Indexing: Finding Data Without Scanning Everything

A row-oriented database typically uses a B-tree index: a dense structure that maps individual key values to exact row locations. Column stores take a different approach because their access patterns are different — they scan large ranges rather than seeking individual rows.

ClickHouse's MergeTree uses a **sparse primary index**. Instead of indexing every row, it records one entry per **granule** (a block of 8192 rows by default). The index stores only the primary key values at each granule boundary:

```
  Sparse Index (primary.idx)        Column Data (revenue.bin)
  =============================     =============================

  Granule 0: key = 2026-01-01  -->  rows     0 -  8191
  Granule 1: key = 2026-01-05  -->  rows  8192 - 16383
  Granule 2: key = 2026-01-09  -->  rows 16384 - 24575
  Granule 3: key = 2026-01-14  -->  rows 24576 - 32767
  ...

  For 100 million rows:
    B-tree index:  100,000,000 entries (GBs of index)
    Sparse index:  ~12,200 entries     (fits in memory)
```

When a query filters on the primary key (e.g., `WHERE order_date >= '2026-01-01' AND order_date < '2026-02-01'`), ClickHouse does a binary search on this tiny index to find the relevant granules, then reads only those granules from each column file. The mark files (`.mrk2`) translate granule numbers to byte offsets within the compressed `.bin` files.

This explains why the `ORDER BY` clause in a ClickHouse table definition is so important — it determines the physical sort order, which determines how well the sparse index can skip data:

```sql
-- Good: queries filter on order_date, so sparse index can skip months of data
CREATE TABLE orders (...) ENGINE = MergeTree() ORDER BY order_date;

-- Bad: random UUID ordering means sparse index cannot skip anything
CREATE TABLE orders (...) ENGINE = MergeTree() ORDER BY order_id;
```

## Late Materialization: Delaying Row Assembly

In a row store, once you read a row from disk, you have all columns immediately. In a column store, "assembling" a row from separate column files is expensive because it requires reading and aligning multiple files. **Late materialization** delays this assembly as long as possible.

The idea: instead of assembling rows early and passing them through the query pipeline, pass position lists (or bitmasks) that identify which row positions survived each filter. Only at the very end, when the query needs to output results, do you gather values from the relevant columns at those positions.

```
  Query: SELECT category, SUM(revenue)
         FROM orders
         WHERE order_date >= '2026-01-01'
         GROUP BY category

  Early Materialization (row store style):
  =========================================
  1. Read date, category, revenue for ALL rows
  2. Filter rows by date
  3. Group and aggregate

  Late Materialization (column store style):
  =========================================
  1. Read ONLY date column
  2. Filter: produce position list [0, 1, 3, 5, 6, 7, ...]
  3. Read category column at ONLY those positions
  4. Read revenue column at ONLY those positions
  5. Group and aggregate
```

If the filter eliminates 80% of rows, late materialization avoids reading 80% of the category and revenue data. Combined with compression (the skipped portions never even get decompressed), the savings compound.

## Data Partitioning and Merge Operations

ClickHouse data arrives in **parts**, each a self-contained sorted chunk. Inserts create new parts, and a background process merges them — similar to how LSM-tree stores work.

```
  Insert batch 1  -->  Part: 202601_1_1_0/
  Insert batch 2  -->  Part: 202601_2_2_0/
  Insert batch 3  -->  Part: 202601_3_3_0/

  Background merge combines them:

  202601_1_1_0/ + 202601_2_2_0/ + 202601_3_3_0/
       |              |              |
       v              v              v
       +--------------+--------------+
                      |
                      v
              202601_1_3_1/       (merged part)
```

Each part is immutable once written. Merges produce a new, larger part and mark the source parts for deletion. The naming convention `<partition>_<min_block>_<max_block>_<level>` tracks the merge lineage. This append-only design means inserts never block on locks, making ClickHouse extremely fast for high-throughput ingestion.

Partitioning by a time column (month, day) allows the engine to drop entire partitions without rewriting data — `ALTER TABLE orders DROP PARTITION '202601'` is instantaneous because it just deletes the directory.

## When to Use (and Not Use) Column Stores

Column-oriented databases are not universally better. The storage layout creates a fundamental tradeoff:

```
  Workload              Row Store    Column Store
  ===================== ==========   ============
  Point lookup by PK    Fast         Slow (must read from many files)
  Insert single row     Fast         Moderate (write to many files)
  Full table scan       Slow         Fast (reads only needed columns)
  Aggregate queries     Slow         Fast (compression + vectorization)
  SELECT *              Fast         Slow (must reassemble from all files)
  Update single row     Fast         Slow (immutable parts, rewrite needed)
  Wide table analytics  Very slow    Fast (reads only queried columns)
```

The rule of thumb: **if your queries touch few columns across many rows, use a column store. If your queries touch few rows across all columns, use a row store.**

This is why most transactional systems (OLTP) use row stores — point lookups, inserts, and updates dominate. Analytical systems (OLAP) use column stores — aggregations across millions of rows dominate. Some modern systems (TiDB with TiFlash, CockroachDB, SingleStore) offer **hybrid** architectures: a row store for transactions and a synchronized column store replica for analytics.

## Putting It All Together

Let's trace our original query through a column-oriented engine:

```sql
SELECT product_category, SUM(revenue)
FROM orders
WHERE order_date >= '2026-01-01'
GROUP BY product_category;
```

```
  Step 1: Sparse Index Lookup
  ===========================
  Binary search primary.idx for '2026-01-01'
  Result: granules 0-15 match (out of 12,000 total)
  --> Skip 99.9% of data

  Step 2: Read Date Column
  ========================
  Open order_date.bin, seek to granule 0 using order_date.mrk2
  Decompress 15 granules (15 x 8192 = 122,880 values)
  Vectorized filter: date >= '2026-01-01'
  Result: bitmask with ~100,000 rows set

  Step 3: Read Category Column (late materialization)
  ===================================================
  Open category.bin at the same granule positions
  Decompress, apply bitmask to extract ~100,000 category codes
  (Dictionary-encoded: just integer lookups)

  Step 4: Read Revenue Column (late materialization)
  ==================================================
  Open revenue.bin at the same granule positions
  Decompress, apply bitmask to extract ~100,000 revenue values

  Step 5: Aggregation
  ===================
  Vectorized hash aggregation:
  For each batch of 1024 (category, revenue) pairs:
    - Hash category code (integer, fast)
    - Add revenue to running SUM in hash table

  Step 6: Return Result
  =====================
  Resolve dictionary codes back to strings
  Output: product_category | total_revenue
```

Out of 500 million rows and 30 columns, the engine read 3 columns from 122,880 rows — processing roughly **0.002%** of the total data on disk.

## References

1. Abadi, D., Madden, S., & Hachem, N. (2008). Column-Stores vs. Row-Stores: How Different Are They Really? *SIGMOD '08*. [paper](https://dl.acm.org/doi/10.1145/1376616.1376712)
2. Stonebraker, M. et al. (2005). C-Store: A Column-oriented DBMS. *VLDB '05*. [paper](https://vldb.org/archives/website/2005/program/paper/thu/p553-stonebraker.pdf)
3. ClickHouse documentation — MergeTree engine. [docs](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)
4. Pelkonen, T. et al. (2015). Gorilla: A Fast, Scalable, In-Memory Time Series Database. *VLDB '15*. [paper](https://www.vldb.org/pvldb/vol8/p1816-teller.pdf)
5. ClickHouse source code — MergeTreeReaderWide. [GitHub](https://github.com/ClickHouse/ClickHouse/blob/master/src/Storages/MergeTree/MergeTreeReaderWide.cpp)
6. Zukowski, M. et al. (2006). MonetDB/X100 - A DBMS in the CPU Cache. *IEEE Data Eng. Bull.* [paper](https://www.cidrdb.org/cidr2005/papers/P19.pdf)
