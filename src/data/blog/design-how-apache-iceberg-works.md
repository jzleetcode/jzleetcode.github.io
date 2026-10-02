---
author: JZ
pubDatetime: 2026-10-02T00:00:00Z
modDatetime: 2026-10-02T00:00:00Z
title: System Design - How Apache Iceberg Works
tags:
  - design-system
  - design-database
description: "A beginner-friendly walkthrough of Apache Iceberg's catalog, metadata, snapshots, manifests, file pruning, commits, and the trade-offs of building reliable tables on object storage."
---

## Table of contents

Apache Iceberg helps data engineers and analytics developers treat files in object storage like a reliable table. This explanation follows one query and one write to show how Iceberg's metadata tree gives ordinary files snapshots, schema evolution, and efficient pruning.

## Why a folder of files is not yet a table

Imagine a table stored as Parquet files in object storage. A query engine can read those files, but the folder alone does not answer some important questions:

- Which files belong to the latest complete version of the table?
- What happens if a writer stops halfway through producing a new batch?
- How can a reader find files for one date without listing and opening everything?
- Which schema should be used if a column was renamed or a partitioning strategy changed?

Iceberg answers these questions with metadata stored alongside the data. The data files remain ordinary Parquet, ORC, or Avro files. Iceberg adds a versioned map that tells readers which files form a table at a particular point in time.

## Follow one query

The query engine starts with a table name, not a guessed file path. A **catalog** resolves that name to the table's current metadata file. The metadata file describes the table and identifies its current snapshot. From there, the engine follows a small tree of metadata files to discover the data files it needs:

```text
SQL table name
      |
      v
  Catalog ----------------------> current metadata file (JSON)
                                         |
                                         | current snapshot
                                         v
                              snapshot's manifest list (Avro)
                                  /                 \
                                 v                   v
                         manifest (Avro)      manifest (Avro)
                           |       |                 |
                           |       +-- file metrics   +-- partition summary
                           v
                    data files (Parquet / ORC / Avro)
```

The catalog is a name-to-metadata pointer. It is not the place where the table's rows live, and Iceberg does not require one particular catalog product.

The metadata file records table-level information such as schemas, partition specifications, snapshots, and table properties. A snapshot points to a **manifest list**. That list names **manifest files**, and each manifest describes data files or delete files. A manifest entry includes information such as the file path, partition values, record count, and optional column-level metrics.

That hierarchy is useful because the engine can often skip metadata before it reads any large data file. The manifest list has summaries about the partitions represented by each manifest. Within a selected manifest, file-level bounds and counts can eliminate files that cannot match a filter. The engine still evaluates the query's row predicate on the files it does read; metadata is a pruning map, not a substitute for query execution.

## What a snapshot means

A snapshot is a consistent view of the table's files. It identifies one manifest list, which in turn identifies the data and delete files visible in that view. A query that resolves its table to a snapshot can therefore read a stable set of files even while another writer is preparing a newer version.

Snapshots make time travel possible: a reader can select an earlier snapshot instead of the current one. They also let Iceberg reuse unchanged manifests and data files between versions. A small update does not need to rewrite every file in a large table; it can add new files and publish a new snapshot that refers to both the new files and still-valid old ones.

This is why a snapshot is more than a timestamp in a log. It is a durable pointer to a complete table state. The metadata records the snapshot history and references, while the files themselves remain immutable from the table format's point of view.

## How a write becomes visible

Suppose a batch job wants to append rows. It first writes new data files. It then creates manifests describing those files, a manifest list for the new snapshot, and a new metadata file that makes that snapshot current. The final step is a catalog commit that atomically advances the table's metadata pointer.

```text
Writer                 Object storage                  Catalog
  |                           |                            |
  |-- write new data files -> |                            |
  |-- write manifests ------> |                            |
  |-- write manifest list --> |                            |
  |-- write new metadata ---> |                            |
  |                           |                            |
  |-- commit new pointer --------------------------------->|
  |                           |       old -> new metadata  |
```

Until the commit succeeds, readers still follow the old pointer and see the old snapshot. They do not mistake a partly written batch for a finished table update. Once the commit succeeds, new readers discover the new snapshot through the catalog.

Two writers can start from the same table version. Because the files they write are not published just by existing in the bucket, the catalog commit is the point where their changes compete. Iceberg catalogs provide an atomic commit operation; if another writer has already advanced the table, an operation may need to retry against the newer metadata or report a conflict. The exact retry and conflict policy depends on the writer operation and catalog.

## Why the metadata is split into layers

A single directory listing becomes a poor table index when a table has many files. Iceberg's layers let an engine skip work at different scales:

1. The snapshot selects a complete version of the table.
2. The manifest list helps skip manifests using partition summaries.
3. A manifest helps skip individual files using partition values and metrics.
4. The query engine reads and filters only the remaining data files.

Separating these layers also makes partition evolution practical. A table can change how future files are partitioned without forcing old files to be rewritten into the new layout. Each manifest records the partition specification relevant to its entries, so readers can interpret older and newer files together.

## Costs and trade-offs

Iceberg replaces fragile directory conventions with a metadata tree, but that tree also needs care. Many tiny data files still mean more file opens and more manifest entries. A busy table can accumulate metadata and snapshots. Table maintenance commonly compacts small data files, rewrites manifests, expires snapshots that are no longer needed, and removes orphan files left by failed writes.

Those operations have trade-offs. Expiring snapshots can make older table states unavailable, and orphan cleanup must not remove files that a valid snapshot still references. The format provides the structure for safe table state; operators still need retention and maintenance policies that fit their recovery requirements.

The core idea is simple: **the catalog points to metadata, metadata points to a snapshot, and the snapshot points through manifests to data files**. That indirection costs some metadata reads, but it gives engines a consistent table view without requiring data files to be rewritten in place.

## References

- [Apache Iceberg specification](https://iceberg.apache.org/spec/)
- [Apache Iceberg documentation](https://iceberg.apache.org/docs/latest/)
- [Apache Iceberg: Evolution](https://iceberg.apache.org/docs/latest/evolution/)
