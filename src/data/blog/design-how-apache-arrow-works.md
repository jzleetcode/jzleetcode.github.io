---
author: JZ
pubDatetime: 2026-10-11T18:31:31Z
modDatetime: 2026-10-11T18:31:31Z
title: "System Design - How Apache Arrow Works: Columnar Data in Memory"
tags:
  - design-system
  - design-data
description: "A practical guide to Apache Arrow's in-memory columnar format: arrays, record batches, validity bitmaps, offsets, IPC, Flight, and when zero-copy data sharing is possible."
---

## Table of contents

- [Why agree on a memory layout?](#why-agree-on-a-memory-layout)
- [Rows become arrays](#rows-become-arrays)
- [A batch is a schema plus columns](#a-batch-is-a-schema-plus-columns)
- [Moving Arrow data](#moving-arrow-data)
- [What zero-copy really means](#what-zero-copy-really-means)
- [Arrow is not a database file format](#arrow-is-not-a-database-file-format)
- [References](#references)

## Why agree on a memory layout?

Imagine that a Python program reads a table from a database, sends it to a Java service, and then passes it to an analytics engine. If each system uses a different in-memory representation, every handoff may need to turn values into one format and then decode them into another. That conversion costs CPU and creates more short-lived objects to manage.

**Apache Arrow** is a shared, language-independent way to represent tabular data in memory. It defines how columns, nulls, nested values, and metadata are laid out in buffers. Libraries in different languages can agree on that layout instead of inventing a private one for every pair of systems.

Arrow is a format and a family of libraries, not a database or query engine. It tells software how data is represented; it does not decide which rows to query or where to store them permanently.

## Rows become arrays

Suppose a table contains three orders:

```text
order_id | region | amount
---------+--------+-------
101      | west   | 12.50
102      | east   |  8.00
103      | west   | 19.25
```

A row-oriented representation keeps the fields of each order together. Arrow instead groups values by column:

```text
order_id: [101, 102, 103]
region:   [west, east, west]
amount:   [12.50, 8.00, 19.25]
```

This makes a column a compact array rather than a collection of separately allocated row objects. If a query only needs `amount`, it can work on that column without decoding `region` and `order_id`. Consecutive values also give CPU-friendly code a chance to process several values in a tight loop.

An Arrow array is not always just one values buffer. Its buffers depend on the data type:

- A fixed-width integer array has a values buffer. If some values can be null, a validity bitmap marks which positions are present.
- A variable-length string array uses offsets to mark where each string begins and ends in a shared byte buffer. It can also have a validity bitmap.
- Nested types, such as lists and structs, are represented with child arrays and their own buffers rather than being flattened into opaque objects.

For example, a string column `west`, `east`, `west` can be represented by offsets `[0, 4, 8, 12]` and one UTF-8 byte buffer containing `westeastwest`. The offsets let a reader find each value without storing a separate pointer for every string.

## A batch is a schema plus columns

Arrow's basic unit of tabular work is a **record batch**. It combines a schema—which names each column and its type—with arrays that all have the same number of rows.

```text
Schema: order_id:int64, region:utf8, amount:decimal

RecordBatch (3 rows)
  order_id -> values buffer
  region   -> validity bitmap + offsets + UTF-8 bytes
  amount   -> values buffer
```

The schema is important because a buffer of bytes does not explain itself. The consumer needs to know, for instance, that one column is a 64-bit integer while another is a variable-length UTF-8 string. Nested schemas describe how child arrays fit together.

A larger Arrow table can be made from multiple record batches. That lets a producer stream manageable chunks instead of waiting until it has materialized one enormous table. Consumers can process each batch and release it as they go.

The columnar layout is useful for analytical work, but it is not automatically the best representation for every task. A program that repeatedly edits one tiny row may prefer a row-oriented structure. Arrow's advantage is greatest when systems scan, exchange, or process batches of typed values.

## Moving Arrow data

The in-memory format answers, “What do these arrays look like?” Arrow also defines ways to exchange them.

**Arrow IPC** packages schemas and record batches into streams or files. A stream can deliver batches incrementally; a file includes a footer that helps readers find its record batches. IPC is useful when Arrow data must cross a process boundary or be written for later reading, but it does not turn Arrow into a general-purpose table-storage engine.

**Arrow Flight** adds a client-server protocol for moving large Arrow datasets over a network. It uses gRPC and Arrow's data representation so a service can exchange batches without inventing a separate row-by-row application protocol.

```text
Database connector       Arrow arrays          Analytics engine
       |                       |                        |
       | builds typed columns  |                        |
       +---------------------->|                        |
       |                 RecordBatch ------------------->|
       |                 via memory, IPC, or Flight     |
```

When two libraries share Arrow-compatible buffers in one process, the receiver may be able to use those buffers directly. Across a network, bytes still have to travel; Arrow Flight makes the data exchange structured and efficient, but it does not make the network transfer disappear.

## What zero-copy really means

“Zero-copy” is often used as shorthand for avoiding a costly conversion of every value into a second, unrelated object layout. It is a possibility enabled by Arrow's specified buffers, not a promise that every handoff copies nothing.

A receiver can reuse a buffer only when the producer and consumer agree on the type layout and the buffer remains valid for the receiver's lifetime. A conversion to another type, decompression, alignment requirements, ownership rules, or a change to mutable data may still require work or a copy. Arrow's C Data Interface helps libraries written in different languages exchange Arrow arrays with explicit ownership and release callbacks, but applications still need to respect those lifetimes.

This distinction matters when evaluating performance. Arrow can remove serialization and object-allocation overhead, but an application should measure the complete path: producing arrays, transferring or mapping buffers, processing them, and releasing memory.

## Arrow is not a database file format

Arrow is commonly compared with formats such as Parquet because both are column-oriented, but they solve different problems. **Arrow** specifies an in-memory representation and exchange format. **Parquet** is designed as a compressed, persistent file format for analytics storage. A system can read Parquet into Arrow arrays for processing, then write results back to Parquet.

The useful mental model is: Arrow standardizes the shape of typed data while it is being processed or exchanged. Record batches provide the units of work, buffers hold the actual values, and IPC or Flight provides ways to move those batches.

## References

1. Apache Arrow Columnar Format [specification](https://arrow.apache.org/docs/format/Columnar.html)
2. Apache Arrow IPC [specification](https://arrow.apache.org/docs/format/IPC.html)
3. Apache Arrow Flight [documentation](https://arrow.apache.org/docs/format/Flight.html)
4. Arrow C Data Interface [documentation](https://arrow.apache.org/docs/format/CDataInterface.html)
5. Apache Arrow [project repository](https://github.com/apache/arrow)
