---
author: JZ
pubDatetime: 2026-04-11T06:23:00Z
modDatetime: 2026-04-11T06:23:00Z
title: System Design - How B+ Trees Power Every Database Index
tags:
  - design-system
  - design-database
description:
  "How B+ trees work: node structure, search, insertion with splits, deletion with merges, disk I/O optimization, and why virtually every relational database uses them for indexing."
---

## Table of contents

## Context

When you run `SELECT * FROM users WHERE id = 42`, the database doesn't scan every row. It uses an **index** — a data structure that turns a full-table scan into a targeted lookup. The most common index structure in production databases is the **B+ tree**.

B+ trees power indexes in MySQL/InnoDB, PostgreSQL, SQLite, Oracle, SQL Server, and TiKV (TiDB's storage engine). If you've ever created a PRIMARY KEY or added an INDEX, you've created a B+ tree.

Why not just use a binary search tree or a hash table? The answer comes down to how disks work. RAM access takes ~100 nanoseconds. A single SSD read takes ~100 microseconds — **1,000x slower**. A spinning disk seek is ~10 milliseconds — **100,000x slower**. When your data lives on disk, the number of disk reads per query determines performance, not CPU cycles.

A binary search tree with 1 million keys has depth ~20, meaning 20 disk reads per lookup. A B+ tree with the same keys and a branching factor of 200 has depth ~3. That's the difference between "unusable" and "instant."

```
  Binary Search Tree               B+ Tree (branching factor = 4)
  (depth = O(log2 N))             (depth = O(log_m N), m >> 2)

         50                              [  30  |  60  |  90  ]
        /  \                            /    |       |      \
      25    75                    [10|20] [30|40|50] [60|70|80] [90|95|99]
     / \   / \                      |       |          |          |
   10  30 60  90                    v       v          v          v
   ...20 nodes deep           leaf--->leaf--->leaf--->leaf  (linked list)
   for 1M keys                   3 levels deep for 1M+ keys
```

## What is a B+ Tree?

A B+ tree is a self-balancing tree data structure that maintains sorted data and allows searches, insertions, and deletions in **O(log n)** time. It is a variation of the B-tree (invented by Rudolf Bayer and Edward McCreight at Boeing in 1970) with one critical difference: **all data lives in the leaves**.

### Properties

For a B+ tree of order **m** (maximum number of children per node):

1. Every internal node has between **ceil(m/2)** and **m** children (except the root, which can have as few as 2).
2. Every internal node with **k** children has **k - 1** keys.
3. All leaves are at the **same depth** (the tree is perfectly balanced).
4. Leaf nodes are linked together in a **doubly-linked list** (or singly-linked in some implementations).
5. **All actual data (or pointers to data) lives in leaf nodes.** Internal nodes only store keys for routing.

### B-tree vs B+ tree

```
  B-tree: data in EVERY node          B+ tree: data ONLY in leaves

       [  30* | 60*  ]                     [  30  |  60  ]
      /    |       \                      /    |       \
  [10*|20*] [40*|50*] [70*|80*]      [10|20] [40|50] [70|80]
                                        |  --> |  -->  |       linked leaves
                                       data   data   data

  (* = key + data stored here)        (internal nodes = routing only)
```

The B+ tree has two advantages:

1. **Higher fanout**: internal nodes don't carry data, so more keys fit per node. More keys per node means fewer levels, which means fewer disk reads.
2. **Efficient range scans**: leaves are linked, so `SELECT * FROM users WHERE age BETWEEN 20 AND 30` just follows the linked list. In a B-tree, you'd need an in-order traversal bouncing up and down the tree.

## Node Structure

Let's look at how nodes are laid out in memory (and on disk). A B+ tree node fits inside a **page** — a fixed-size block, typically 4 KB, 8 KB, or 16 KB. InnoDB uses 16 KB pages.

### Internal Node

```
  Page (e.g., 16 KB)
  +------------------------------------------------------+
  |  header  |  P0  K1  P1  K2  P2  K3  P3  ...  Kn  Pn |
  +------------------------------------------------------+

  P0 = pointer to child where all keys < K1
  P1 = pointer to child where K1 <= keys < K2
  P2 = pointer to child where K2 <= keys < K3
  ...
  Pn = pointer to child where keys >= Kn

  With 16 KB pages, 8-byte keys, 6-byte pointers:
  ~16000 / (8 + 6) = ~1,140 keys per node
  That means ~1,141 children per internal node
```

### Leaf Node

```
  Page (e.g., 16 KB)
  +------------------------------------------------------+
  |  header  |  K1 V1  K2 V2  K3 V3  ...  Kn Vn  | prev | next |
  +------------------------------------------------------+

  Ki = key (e.g., primary key value)
  Vi = value (the actual row data, or a pointer to it)
  prev/next = pointers to sibling leaf pages (linked list)
```

In InnoDB's **clustered index**, the leaf nodes store the entire row. In a **secondary index**, the leaf nodes store the primary key value, which you then use to look up the clustered index (a "bookmark lookup").

## Search

Searching a B+ tree is like binary search, but at each level you pick which child to follow instead of going left or right.

```
  Search for key = 45

  Level 0 (root):    [  30  |  60  |  90  ]
                           |
                    30 <= 45 < 60, follow P1
                           |
                           v
  Level 1:          [  35  |  42  |  50  ]
                                 |
                          42 <= 45 < 50, follow P2
                                 |
                                 v
  Level 2 (leaf):   [ 42 | 43 | 45 | 48 ]
                                 ^
                          found key = 45!
```

The algorithm at each internal node:

```
function search(node, key):
    if node is leaf:
        binary search for key in node.keys
        return found entry or NOT_FOUND

    // Internal node: find which child to follow
    i = 0
    while i < node.num_keys and key >= node.keys[i]:
        i++
    return search(node.children[i], key)
```

**Disk I/O cost**: one page read per level. For a table with 1 billion rows and 1,000 keys per node:

$$\text{depth} = \lceil \log_{1000}(10^9) \rceil = \lceil 3 \rceil = 3$$

Three disk reads to find any row among a billion. The root node is almost always cached in the buffer pool, so in practice it's **2 disk reads**.

## Insertion

Insertion always happens at the leaf level. If the leaf has room, we just insert. If it's full, we **split** it.

### Case 1: Leaf has room

```
  Insert key = 25 into this leaf (capacity = 4):

  Before:  [ 10 | 20 | 30 |    ]     (3 keys, room for 1 more)
                        ^
                  shift 30 right

  After:   [ 10 | 20 | 25 | 30 ]     (inserted in sorted position)
```

### Case 2: Leaf is full — split

```
  Insert key = 25 into this full leaf (capacity = 4):

  Before:  [ 10 | 20 | 30 | 40 ]     (full!)

  Step 1: Create a new leaf, distribute keys evenly:

  Left leaf:   [ 10 | 20 | 25 |    ]    (first ceil(5/2) = 3 keys)
  Right leaf:  [ 30 | 40 |    |    ]    (remaining keys)
                 ^
                 this key gets "pushed up" to the parent

  Step 2: Insert the separator key (30) into the parent:

  Parent before:  [ ... | 20 | P_old | 50 | ... ]
  Parent after:   [ ... | 20 | P_left | 30 | P_right | 50 | ... ]
```

If the parent is also full, it splits too, and the process cascades upward. If the root splits, a new root is created — this is the **only** way a B+ tree grows taller.

```
  Root split: the tree grows one level

  Before (root is full, must split):

       [ 20 | 40 | 60 | 80 ]        <- root (full)
      /   |     |     |    \

  After:
              [ 40 ]                  <- new root
             /      \
      [ 20 |    ]   [ 60 | 80 ]      <- old root split into two
     /   |    |     /    |     \
```

This bottom-up growth is why B+ trees are always perfectly balanced. Every leaf is always the same distance from the root.

### Insertion in source code

Here is how SQLite implements B+ tree leaf insertion in [`btree.c`](https://github.com/sqlite/sqlite/blob/master/src/btree.c). The function `insertCell` places a cell into a page, and `balance` handles splits when a page overflows:

```c
// Simplified from SQLite's btree.c
static int insertCell(
  MemPage *pPage,    // page to insert into
  int i,             // index where cell goes
  u8 *pCell,         // content of the cell
  int sz             // size of the cell
){
  if( pPage->nFree < sz ){
    // Not enough space: defragment the page first
    defragmentPage(pPage);
    if( pPage->nFree < sz ){
      return SQLITE_FULL;  // triggers a split via balance()
    }
  }
  // Shift existing cells right to make room
  memmove(&pPage->aCell[i+1], &pPage->aCell[i],
          (pPage->nCell - i) * sizeof(pPage->aCell[0]));
  // Insert the new cell
  memcpy(&pPage->aCell[i], pCell, sz);
  pPage->nCell++;
  return SQLITE_OK;
}
```

After insertion, SQLite calls `balance()` which checks if the page overflowed and performs a split if needed. The split redistributes cells across sibling pages and pushes a divider key up to the parent.

## Deletion

Deletion is the trickiest operation. We remove the key from the leaf, then check if the leaf still has enough keys (at least **ceil(m/2) - 1**). If not, we try to **redistribute** from a sibling. If redistribution isn't possible, we **merge** two nodes.

### Case 1: Simple delete (leaf stays valid)

```
  Delete key = 30 from this leaf (min keys = 2):

  Before:  [ 10 | 20 | 30 | 40 ]     (4 keys, above minimum)
  After:   [ 10 | 20 | 40 |    ]     (3 keys, still valid)
```

### Case 2: Redistribute from sibling

```
  Delete key = 40, leaf underflows (min keys = 2):

  Before:
  Parent:        [ ... | 40 | ... ]
                      /       \
  Left sibling: [ 10 | 20 | 30 ]     Right (target): [ 40 | 50 ]
                                                      delete 40 -> underflow!

  After redistribution (borrow from left sibling):
  Parent:        [ ... | 30 | ... ]    <- separator updated
                      /       \
  Left sibling: [ 10 | 20 |    ]      Right: [ 30 | 50 ]
```

### Case 3: Merge

```
  Delete key = 50, redistribution not possible:

  Before:
  Parent:        [ ... | 40 | ... ]
                      /       \
  Left:         [ 10 | 20 ]           Right: [ 50 ]  <- delete 50, now empty!

  After merge (combine left + right + separator from parent):
  Parent:        [ ... |    | ... ]    <- separator 40 removed
                      |
  Merged leaf:  [ 10 | 20 | 40 ]

  (If parent underflows, cascade upward)
```

If merges cascade all the way to the root and the root becomes empty, the tree shrinks by one level — the only way a B+ tree gets shorter.

## Disk I/O Optimization: Why Pages Matter

The entire design of B+ trees is optimized for disk I/O. Here's how the pieces fit together:

```
  Memory Hierarchy and B+ Tree Design

  +------------------+
  |    CPU Cache      |   ~1 ns
  +------------------+
  |    RAM            |   ~100 ns     <- buffer pool caches hot pages
  +------------------+
  |    SSD            |   ~100 us     <- one B+ tree page = one disk read
  +------------------+
  |    HDD            |   ~10 ms      <- sequential reads via linked leaves
  +------------------+

  Design principle: minimize random disk reads
  +---------------------------------------------------------+
  | 1. Large nodes (= page size) -> high fanout -> short    |
  |    tree -> fewer disk reads per lookup                  |
  | 2. Linked leaves -> range scans = sequential I/O        |
  | 3. Internal nodes are small -> more fit in buffer pool  |
  | 4. Splits/merges are local -> writes are bounded        |
  +---------------------------------------------------------+
```

### Buffer pool interaction

Databases keep a **buffer pool** — a cache of recently-accessed pages in RAM. The root and top-level internal nodes are almost always in the buffer pool because every query touches them. This means a lookup in a 3-level B+ tree typically requires only **1 physical disk read** (the leaf page).

```
  Query: SELECT * FROM users WHERE id = 42

  Buffer Pool (RAM):
  +----------------------------------+
  |  [root page]  [level-1 pages]   |   already cached
  +----------------------------------+
             |
             v
  Disk:   [leaf page for id=42]          1 disk read
             |
             v
  Result: row data for id = 42
```

### InnoDB page layout

MySQL's InnoDB stores the B+ tree physically as 16 KB pages on disk. Each page has a header, directory slots for binary search, and the actual records:

```
  InnoDB 16 KB Page Layout
  +----------------------------------------------------------+
  |  File Header (38 bytes)                                  |
  |    - page number, checksum, prev/next page pointers      |
  +----------------------------------------------------------+
  |  Page Header (56 bytes)                                  |
  |    - number of records, free space pointer, level         |
  +----------------------------------------------------------+
  |  Infimum / Supremum records (26 bytes)                   |
  |    - virtual min/max records for the page                |
  +----------------------------------------------------------+
  |  User Records                                            |
  |    - actual key-value pairs stored as a singly-linked    |
  |      list in key order within the page                   |
  |    ...                                                   |
  +----------------------------------------------------------+
  |  Free Space                                              |
  +----------------------------------------------------------+
  |  Page Directory (variable)                               |
  |    - sparse index of slots for binary search within page |
  +----------------------------------------------------------+
  |  File Trailer (8 bytes)                                  |
  |    - checksum for crash recovery                         |
  +----------------------------------------------------------+
```

The page directory enables binary search within a page, so even within a 16 KB page containing hundreds of records, lookup is fast.

## B+ Trees in TiKV (RocksDB + LSM Tree)

TiKV, the storage engine for TiDB, takes a different approach. Instead of B+ trees directly, TiKV uses **RocksDB**, which is based on **LSM trees** (Log-Structured Merge Trees). However, inside RocksDB, the SSTable (Sorted String Table) files use a **block-based index** that is conceptually similar to a B+ tree:

```
  TiKV Storage Stack

  +-------------------+
  |      TiKV         |
  +-------------------+
  |     RocksDB       |
  +-------------------+
  |                   |
  |  MemTable (RAM)   |   writes go here first
  |       |           |
  |       v flush     |
  |  Level 0 SSTables |
  |       |           |
  |       v compact   |
  |  Level 1 SSTables |   each SSTable has a block index
  |       |           |   (similar to a B+ tree leaf scan)
  |       v compact   |
  |  Level 2+ ...     |
  +-------------------+

  Inside each SSTable:
  +------------------------------------------+
  |  Data Block 1  |  Data Block 2  | ...    |   sorted key-value pairs
  +------------------------------------------+
  |  Index Block                              |   maps key ranges to blocks
  +------------------------------------------+
  |  Filter Block (Bloom filter)              |   avoids unnecessary reads
  +------------------------------------------+
```

The trade-off: LSM trees optimize for **write throughput** (all writes are sequential appends), while B+ trees optimize for **read throughput** (data is always in sorted position). This is why MySQL (OLTP with balanced read/write) uses B+ trees, while systems expecting heavy write loads (like TiKV, Cassandra, LevelDB) prefer LSM trees.

## Concurrency: Latch Crabbing

In a multi-threaded database, many queries access the B+ tree concurrently. The classic approach is **latch crabbing** (also called latch coupling):

```
  Latch Crabbing Protocol (search):

  1. Acquire shared latch on root
  2. Acquire shared latch on child
  3. Release latch on parent         <- "crab" forward
  4. Repeat until leaf is reached

  Thread A (searching):        Thread B (searching):
  latch root  ----+
  latch child     |  latch root  ----+
  release root    |  latch child     |
  latch leaf      |  release root    |
  release child   |  latch leaf      |
  read leaf       |  release child   |
  release leaf    |  read leaf       |
                     release leaf    |

  No deadlock: always acquire top-down, release bottom-up
```

For insertions/deletions that might cause splits or merges, the protocol uses **exclusive latches** and only releases the parent's latch when the child is confirmed to be "safe" (won't split or merge):

```
  Latch Crabbing Protocol (insert):

  1. Acquire exclusive latch on root
  2. Acquire exclusive latch on child
  3. If child is SAFE (not full), release ALL ancestor latches
  4. Repeat until leaf

  A node is "safe" if:
    - For insert: node is not full (won't split)
    - For delete: node is more than half full (won't merge)
```

This is pessimistic but correct. Modern databases like InnoDB use **optimistic latch crabbing**: assume no split will happen, take only shared latches going down, and restart with exclusive latches only if a split is actually needed.

## Putting it All Together

Here is the full picture of how a B+ tree serves a query:

```
  SELECT * FROM orders WHERE customer_id = 7 AND order_date > '2026-01-01'

  Assume: index on (customer_id, order_date)

  Step 1: Traverse internal nodes        (2 page reads, likely cached)
           +-----[  5  | 10 | 15  ]-----+
           |          |                  |
           v          v                  v
     [1|3|5]    [5|7|10]          [10|12|15]
                  |
                  v
  Step 2: Land on leaf for customer_id=7  (1 page read from disk)
          [ (7, 2025-12-01, ...) |
            (7, 2026-01-15, ...) |    <- start here
            (7, 2026-02-20, ...) |    <- include
            (7, 2026-03-10, ...) ]    <- include

  Step 3: Follow linked list to next leaf if more rows exist
          --> [ (7, 2026-04-01, ...) | (8, ...) | ... ]
                                       ^ stop: customer_id changed

  Total: ~2-3 page reads for an exact match + range scan
```

## Summary Table

```
  +-------------------+----------------------------------+
  | Operation         | Time Complexity                  |
  +-------------------+----------------------------------+
  | Search            | O(log_m N)  ~3-4 disk reads      |
  | Insert            | O(log_m N)  + possible split     |
  | Delete            | O(log_m N)  + possible merge     |
  | Range scan        | O(log_m N)  + O(K) sequential    |
  |                   |   (K = number of results)        |
  +-------------------+----------------------------------+
  | Space per node    | = 1 page (4-16 KB)               |
  | Fanout            | ~100-1000 children per node      |
  | Tree depth        | 3-4 for billions of rows         |
  +-------------------+----------------------------------+
```

The B+ tree is one of those designs where every detail — large nodes, data only in leaves, linked leaf lists, page-aligned storage — exists for a specific, practical reason: **minimizing disk I/O.** It has been the dominant index structure for over 50 years, and it remains so because the fundamental constraint (disk is slow, RAM is fast) hasn't changed.

## References

1. R. Bayer, E. McCreight, "Organization and Maintenance of Large Ordered Indexes" (1970) [paper](https://infolab.usc.edu/csci585/Spring2010/den_ar/indexing.pdf)
2. CMU 15-445 Database Systems — B+ Tree Indexes [lecture](https://15445.courses.cs.cmu.edu/fall2024/notes/07-trees1.pdf)
3. SQLite B-tree implementation [`btree.c`](https://github.com/sqlite/sqlite/blob/master/src/btree.c)
4. MySQL InnoDB index page structure [doc](https://dev.mysql.com/doc/refman/8.0/en/innodb-physical-structure.html)
5. InnoDB page layout internals [blog](https://blog.jcole.us/2013/01/07/the-physical-structure-of-innodb-index-pages/)
6. TiKV storage architecture [doc](https://docs.pingcap.com/tidb/stable/tikv-overview)
7. RocksDB SSTable format [wiki](https://github.com/facebook/rocksdb/wiki/Rocksdb-BlockBasedTable-Format)
8. "Database Internals" by Alex Petrov, O'Reilly (2019) — chapters on B-trees and LSM trees
9. CMU 15-445 — Tree Index Concurrency Control [lecture](https://15445.courses.cs.cmu.edu/fall2024/notes/09-indexconcurrency.pdf)
