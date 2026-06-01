---
author: JZ
pubDatetime: 2026-06-01T06:00:00Z
modDatetime: 2026-06-01T06:00:00Z
title: System Design - How Columnar Storage Works
tags:
  - design-system
  - design-database
description:
  "How columnar storage works: row vs column layout, compression techniques, vectorized execution, Apache Parquet internals, and why modern analytics engines like ClickHouse and DuckDB are so fast."
---

## Table of contents

## Context

When you run a query like this on a table with 100 columns and a billion rows:

```sql
SELECT city, AVG(purchase_amount)
FROM orders
WHERE year = 2025
GROUP BY city;
```

You only need 3 columns: `city`, `purchase_amount`, and `year`. A traditional row-oriented database (MySQL, PostgreSQL) stores data like a bookshelf — each row is a book sitting next to other books. To find the 3 columns you need, the database must pull entire rows off disk, then throw away 97% of the data it just read.

Columnar storage flips this on its head: instead of storing rows together, it stores each column in its own contiguous block. Now the query above reads only 3 columns, skipping the other 97 entirely.

This single idea — **store columns together, not rows** — is the foundation of every modern analytics engine: Apache Parquet, Apache Arrow, ClickHouse, DuckDB, Google BigQuery, Amazon Redshift, and Snowflake.

## Row Store vs Column Store

### Row-Oriented Layout (Traditional)

```
  Disk Layout (row store):

  Row 1: | id=1 | name="Alice"   | city="NYC"  | year=2025 | amount=42.50 | ... 97 more cols |
  Row 2: | id=2 | name="Bob"     | city="LA"   | year=2025 | amount=18.00 | ... 97 more cols |
  Row 3: | id=3 | name="Charlie" | city="NYC"  | year=2024 | amount=95.20 | ... 97 more cols |
  Row 4: | id=4 | name="Diana"   | city="CHI"  | year=2025 | amount=33.10 | ... 97 more cols |
  ...
  (1 billion rows)
```

Reading `city` + `amount` + `year` means scanning the entire table — every byte of every row — because the columns you want are interleaved with columns you don't.

### Column-Oriented Layout

```
  Disk Layout (column store):

  Column "id":     | 1 | 2 | 3 | 4 | ... (1 billion values, contiguous)
  Column "name":   | "Alice" | "Bob" | "Charlie" | "Diana" | ...
  Column "city":   | "NYC" | "LA" | "NYC" | "CHI" | ...
  Column "year":   | 2025 | 2025 | 2024 | 2025 | ...
  Column "amount": | 42.50 | 18.00 | 95.20 | 33.10 | ...
  ... (97 more columns, each stored separately)
```

Now reading `city` + `amount` + `year` reads exactly 3 columns. If each column is 8 bytes per value: 3 columns × 8 bytes × 1B rows = 24 GB read, versus 100 columns × 8 bytes × 1B rows = 800 GB for the row store. That's a **33x reduction** in I/O.

## Why Columns Compress Better

When values of the same type and semantic meaning are stored together, they exhibit strong patterns. Compression algorithms exploit these patterns:

```
  Column "year" (original):    [2025, 2025, 2025, 2024, 2025, 2025, 2024, 2025, ...]

  Run-Length Encoding (RLE):   [(2025, 3), (2024, 1), (2025, 2), (2024, 1), (2025, 1), ...]
                                 value x count

  If sorted first:             [2024, 2024, 2024, ..., 2025, 2025, 2025, ...]
  RLE on sorted:               [(2024, 400M), (2025, 600M)]   <-- two integers!
```

Common compression techniques in columnar stores:

```
  +---------------------+---------------------------+----------------------------+
  | Technique           | Best For                  | Example                    |
  +---------------------+---------------------------+----------------------------+
  | Run-Length Encoding  | Sorted/repeated values    | [AAA...BBB...] -> (A,n)(B,m)|
  | Dictionary Encoding | Low-cardinality strings   | ["NYC","LA","NYC"] -> [0,1,0]|
  | Delta Encoding      | Monotonic sequences       | [100,101,103] -> [100,1,2] |
  | Bit-Packing         | Small integers            | values 0-7 in 3 bits each |
  | Frame of Reference  | Clustered values          | [1000,1002,1001] -> base=1000|
  +---------------------+---------------------------+----------------------------+
```

### Dictionary Encoding in Detail

For a column like `city` with maybe 10,000 unique values across a billion rows:

```
  Dictionary:
    0 -> "New York"
    1 -> "Los Angeles"
    2 -> "Chicago"
    3 -> "Houston"
    ... (10,000 entries)

  Column data (original):  ["New York", "Los Angeles", "New York", "Chicago", ...]
                            (avg 10 bytes each × 1B = 10 GB)

  Column data (encoded):   [0, 1, 0, 2, ...]
                            (14 bits each × 1B = 1.75 GB)

  Compression ratio: ~5.7x just from dictionary encoding alone
```

In practice, columnar formats layer multiple techniques: dictionary encode first, then bit-pack the dictionary indices, then apply general-purpose compression (LZ4/Zstd) on top. Apache Parquet routinely achieves 5–20x compression ratios on real-world data.

## Apache Parquet: The Industry Standard

Apache Parquet is the most widely-used columnar file format. It was created at Twitter in 2013 (inspired by Google's Dremel paper) and is now the default format for data lakes, Spark jobs, and ML pipelines.

### File Structure

```
  Parquet File Layout

  +---------------------------+
  | Magic: "PAR1" (4 bytes)   |
  +---------------------------+
  | Row Group 0               |
  |   +-- Column Chunk: id    |    <-- all "id" values for rows 0-999,999
  |   |     Page 0 (data)     |
  |   |     Page 1 (data)     |
  |   +-- Column Chunk: name  |    <-- all "name" values for rows 0-999,999
  |   |     Page 0 (data)     |
  |   |     Page 1 (data)     |
  |   +-- Column Chunk: city  |
  |   |     ...               |
  +---------------------------+
  | Row Group 1               |
  |   +-- Column Chunk: id    |    <-- all "id" values for rows 1,000,000-1,999,999
  |   |     ...               |
  |   +-- Column Chunk: name  |
  |   |     ...               |
  +---------------------------+
  |  ...more row groups...    |
  +---------------------------+
  | Footer                    |
  |   - Schema                |
  |   - Row group metadata    |
  |   - Column chunk offsets  |
  |   - Min/max statistics    |
  +---------------------------+
  | Footer length (4 bytes)   |
  +---------------------------+
  | Magic: "PAR1" (4 bytes)   |
  +---------------------------+
```

Key design choices:

- **Row Groups** (~128 MB each): horizontal partitions of the table. Each row group contains all columns for a subset of rows. This allows parallel processing — different threads handle different row groups.
- **Column Chunks**: one per column per row group. Each chunk is stored contiguously, enabling column pruning (skip columns not in the query).
- **Pages** (~1 MB each): the unit of compression and encoding within a column chunk. Each page is independently compressed.
- **Footer**: metadata at the end of the file includes min/max statistics per column chunk, enabling predicate pushdown (skip entire row groups where `year` max < 2025).

### Predicate Pushdown with Statistics

```
  Query: WHERE year = 2025

  Row Group 0 metadata: year min=2020, max=2023  --> SKIP (no 2025 here)
  Row Group 1 metadata: year min=2023, max=2025  --> READ (might have 2025)
  Row Group 2 metadata: year min=2025, max=2026  --> READ (might have 2025)
  Row Group 3 metadata: year min=2026, max=2027  --> SKIP (no 2025 here)

  Result: only read 2 of 4 row groups = 50% I/O reduction before decompression
```

From the Parquet source code ([`parquet-format/src/main/thrift/parquet.thrift`](https://github.com/apache/parquet-format/blob/master/src/main/thrift/parquet.thrift)):

```thrift
struct ColumnMetaData {
  1: required Type type
  2: required list<Encoding> encodings
  3: required list<string> path_in_schema
  4: required CompressionCodec codec
  5: required i64 num_values
  6: required i64 total_uncompressed_size
  7: required i64 total_compressed_size
  8: required i64 data_page_offset
  9: optional i64 dictionary_page_offset
  10: optional Statistics statistics   // <-- min, max, null_count, distinct_count
}
```

## Vectorized Execution: Processing Columns at CPU Speed

Reading columns is only half the story. Columnar engines also process data in **vectors** (batches of ~1024 values at a time) rather than row-by-row. This matters because of how modern CPUs work:

```
  Row-at-a-time (traditional):

  for each row:
      if row.year == 2025:          # branch prediction miss (random pattern)
          sum += row.amount          # cache miss (row data scattered)
          count += 1

  Vector-at-a-time (columnar):

  # Step 1: Filter the year column (tight loop, no branches needed)
  mask = simd_compare_eq(year_vector, 2025)    # processes 8 values per CPU cycle

  # Step 2: Apply mask to amount column
  filtered_amounts = apply_mask(amount_vector, mask)

  # Step 3: Sum the filtered amounts
  total = simd_sum(filtered_amounts)           # processes 4 doubles per cycle
```

Why vectorized execution is faster:

```
  +-------------------+---------------------+-----------------------------+
  | Factor            | Row-at-a-time       | Vectorized                  |
  +-------------------+---------------------+-----------------------------+
  | Function calls    | 1 per row per op    | 1 per vector (1024 rows)    |
  | Cache behavior    | Random access       | Sequential scan (prefetch)  |
  | SIMD utilization  | None                | 4-8 values per instruction  |
  | Branch prediction | Unpredictable       | Branchless (bitmask ops)    |
  | CPU pipeline      | Frequent stalls     | Steady throughput           |
  +-------------------+---------------------+-----------------------------+
```

DuckDB's execution engine processes data in vectors of 2048 values. From [`src/include/duckdb/common/vector_size.hpp`](https://github.com/duckdb/duckdb/blob/main/src/include/duckdb/common/vector_size.hpp):

```cpp
#ifndef STANDARD_VECTOR_SIZE
#define STANDARD_VECTOR_SIZE 2048
#endif
```

Each operator in DuckDB's query plan produces and consumes these fixed-size vectors, making the entire pipeline cache-friendly and SIMD-ready.

## ClickHouse: A Column Store Built for Speed

ClickHouse (created at Yandex in 2016) is one of the fastest open-source analytics databases. Its storage engine is a prime example of columnar design in production.

### MergeTree Storage Engine

```
  ClickHouse MergeTree Layout (on disk)

  /var/lib/clickhouse/data/mydb/orders/
  ├── 20250101_1_5_1/                  <-- "part" (merged from inserts 1-5)
  │   ├── id.bin                        <-- compressed column data
  │   ├── id.mrk3                       <-- mark file (index into .bin)
  │   ├── name.bin
  │   ├── name.mrk3
  │   ├── city.bin
  │   ├── city.mrk3
  │   ├── year.bin
  │   ├── year.mrk3
  │   ├── amount.bin
  │   ├── amount.mrk3
  │   ├── primary.idx                   <-- sparse primary index
  │   ├── minmax_year.idx               <-- partition min/max
  │   └── checksums.txt
  ├── 20250101_6_10_1/                  <-- another part
  │   ├── ...
```

Each column gets its own `.bin` file (compressed data) and `.mrk3` file (marks that map primary key ranges to byte offsets in the `.bin` file). This design allows:

1. **Column pruning**: only open `.bin` files for columns in the query
2. **Granule skipping**: the primary index points to granules (8192 rows by default); skip granules that can't match the WHERE clause
3. **Background merges**: small parts from recent inserts get merged into larger parts (like an LSM tree, but per-column)

### Sparse Primary Index

Unlike B-tree indexes that store every key, ClickHouse's primary index stores one entry per granule:

```
  Primary Index (sparse):
  
  Granule 0: first key = (2024-01-01, "user:1")     --> marks row 0
  Granule 1: first key = (2024-01-01, "user:8193")  --> marks row 8192
  Granule 2: first key = (2024-01-02, "user:100")   --> marks row 16384
  ...

  Query: WHERE date = '2024-01-02'
  Binary search primary index --> granule 2 is first match
  Read only granules 2+ from the .bin files
```

The entire primary index for a billion-row table fits in RAM (1B / 8192 granules × ~16 bytes per key ≈ 2 MB). This makes ClickHouse startlingly fast for point lookups on the primary key too.

## Trade-offs: When NOT to Use Columnar

Columnar storage excels at analytics but struggles with other workloads:

```
  +-------------------+--------------------+--------------------+
  | Workload          | Row Store          | Column Store       |
  +-------------------+--------------------+--------------------+
  | SELECT *          | Fast (one seek)    | Slow (reassemble   |
  |   WHERE id = 42   |                    | from N columns)    |
  +-------------------+--------------------+--------------------+
  | INSERT single row | Fast (one append)  | Slow (write to N   |
  |                   |                    | column files)      |
  +-------------------+--------------------+--------------------+
  | UPDATE one field  | Fast (in-place)    | Slow (rewrite      |
  |                   |                    | column segment)    |
  +-------------------+--------------------+--------------------+
  | SELECT 3 cols     | Slow (read all     | Fast (read only    |
  |   FROM wide table |  columns per row)  | 3 columns)         |
  +-------------------+--------------------+--------------------+
  | Aggregation       | Slow (process all  | Fast (sequential   |
  |   (SUM, AVG, etc) |  row overhead)     | scan + SIMD)       |
  +-------------------+--------------------+--------------------+
```

This is why:
- **OLTP** (transactions, web apps) uses row stores: MySQL, PostgreSQL, TiDB
- **OLAP** (analytics, reporting) uses column stores: ClickHouse, BigQuery, Redshift
- **Hybrid (HTAP)** tries both: TiDB (TiKV for rows + TiFlash for columns), SingleStore, AlloyDB

## The Complete Picture

```
  Query: SELECT city, SUM(amount) FROM orders WHERE year=2025 GROUP BY city

  +------- File/Table Level -------+
  | Skip row groups/partitions     |  (min/max stats: year max < 2025? skip)
  +--------------------------------+
               |
               v
  +------- Column Pruning ---------+
  | Read only: city, amount, year  |  (ignore 97 other columns)
  +--------------------------------+
               |
               v
  +------- Decompression ----------+
  | Dictionary decode city         |  (integers -> strings, only at end)
  | Bit-unpack year                |
  | LZ4 decompress amount         |
  +--------------------------------+
               |
               v
  +------- Vectorized Filter ------+
  | SIMD: year_vector == 2025      |  (produces bitmask)
  +--------------------------------+
               |
               v
  +------- Vectorized Aggregate ---+
  | Hash group by city (dict IDs)  |  (operate on integers, not strings)
  | SIMD sum on masked amounts     |
  +--------------------------------+
               |
               v
  +------- Materialize Result -----+
  | Decode city dict IDs -> names  |
  | Return: [("NYC", 1.2M), ...]  |
  +--------------------------------+
```

Each layer reduces the work for the next. Statistics eliminate entire files. Column pruning eliminates 97% of I/O. Compression reduces bytes read by 5-20x. Vectorized execution processes what remains at near-memory-bandwidth speeds.

This is why a ClickHouse query over a billion rows can finish in under a second on commodity hardware — while the same query on a row-oriented database might take minutes.

## References

1. Abadi, D. et al. (2013). *The Design and Implementation of Modern Column-Oriented Database Systems*. Foundations and Trends in Databases.
2. Apache Parquet format specification — [github.com/apache/parquet-format](https://github.com/apache/parquet-format)
3. Melnik, S. et al. (2010). *Dremel: Interactive Analysis of Web-Scale Datasets*. Google Research.
4. ClickHouse MergeTree documentation — [clickhouse.com/docs/en/engines/table-engines/mergetree-family](https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree)
5. DuckDB: An Embeddable Analytical Database — [duckdb.org/why_duckdb](https://duckdb.org/why_duckdb)
6. Stonebraker, M. et al. (2005). *C-Store: A Column-oriented DBMS*. VLDB.
