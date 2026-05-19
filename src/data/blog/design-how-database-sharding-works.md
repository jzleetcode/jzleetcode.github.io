---
author: JZ
pubDatetime: 2026-05-19T06:23:00Z
modDatetime: 2026-05-19T06:23:00Z
title: System Design - How Database Sharding Works
tags:
  - design-system
  - design-database
description:
  "How database sharding works: partitioning strategies (hash, range, directory), routing mechanisms, resharding challenges, and how real systems (Vitess, TiDB, DynamoDB, CockroachDB) implement it."
---

## Table of contents

## Context

A single database server has hard limits: disk capacity, memory for indexes, CPU for queries, and network bandwidth. When your data or traffic outgrows one machine, you have two options:

- **Vertical scaling** — buy a bigger machine (expensive, has a ceiling)
- **Horizontal scaling** — spread data across multiple machines

Sharding is the technique of splitting a single logical database into multiple pieces (**shards**), each living on a different server. Each shard holds a subset of the data and handles a subset of the queries.

```
              Single Database (before sharding)

  +-------------------------------------------------------+
  |                    All 100M rows                       |
  |                    All queries                         |
  |                   (one machine)                        |
  +-------------------------------------------------------+

              Sharded Database (after)

  +------------------+  +------------------+  +------------------+
  |   Shard 0        |  |   Shard 1        |  |   Shard 2        |
  |   rows 0-33M    |  |   rows 34M-66M   |  |   rows 67M-100M  |
  |   (machine A)    |  |   (machine B)    |  |   (machine C)    |
  +------------------+  +------------------+  +------------------+
```

Sharding sounds simple in principle, but the devil is in the details: how do you decide which row goes where? How do you handle queries that span shards? What happens when you add or remove shards?

## Partitioning Strategies

The **shard key** (or partition key) is the column used to determine which shard holds a given row. Choosing the right shard key is the single most important sharding decision.

### Hash-Based Partitioning

Compute a hash of the shard key and map it to a shard number:

```
  shard_id = hash(shard_key) % num_shards

  Example with 4 shards:
  hash("user_123") = 7849201  -->  7849201 % 4 = 1  -->  Shard 1
  hash("user_456") = 2938471  -->  2938471 % 4 = 3  -->  Shard 3
  hash("user_789") = 5520000  -->  5520000 % 4 = 0  -->  Shard 0
```

**Pros:**
- Even distribution (assuming a good hash function)
- Simple to compute
- No hotspot from sequential keys (e.g., auto-increment IDs won't all land on one shard)

**Cons:**
- Range queries become expensive (need to scatter to all shards)
- Adding/removing shards requires rehashing most keys (unless using consistent hashing)

**Who uses it:** DynamoDB, Redis Cluster, Cassandra (with Murmur3 partitioner)

### Range-Based Partitioning

Assign contiguous ranges of the shard key to each shard:

```
  Shard 0:  user_id [0, 1000000)
  Shard 1:  user_id [1000000, 2000000)
  Shard 2:  user_id [2000000, 3000000)

  Or for strings:
  Shard 0:  last_name [A-H]
  Shard 1:  last_name [I-P]
  Shard 2:  last_name [Q-Z]
```

**Pros:**
- Range queries on the shard key are efficient (hit one shard or a small number)
- Easy to understand and debug
- Splitting a hot shard is straightforward (just split the range)

**Cons:**
- Hotspots if access patterns cluster (e.g., recent timestamps always hit the last shard)
- Data can become skewed if the key distribution is uneven

**Who uses it:** TiDB/TiKV (Regions are contiguous key ranges), CockroachDB (ranges), Google Spanner, HBase

### Directory-Based Partitioning

Maintain a lookup table that maps each shard key (or group of keys) to a shard:

```
  +------------------+----------+
  | Shard Key Range  | Shard ID |
  +------------------+----------+
  | user_1 - user_99 |    0     |
  | user_100 - 500   |    1     |
  | user_501 - 999   |    2     |
  | user_1000 - 5000 |    0     |  <-- wraps around
  +------------------+----------+

  The directory itself is stored in a metadata service
  (ZooKeeper, etcd, a config database, etc.)
```

**Pros:**
- Maximum flexibility — can move individual keys between shards
- Can handle uneven data distribution by assigning more ranges to less-loaded shards

**Cons:**
- Directory is a single point of failure (must be highly available)
- Extra lookup on every query
- Directory can become a bottleneck under high traffic

**Who uses it:** Vitess (VSchema), MongoDB (config servers), Azure Cosmos DB

### Compound / Hierarchical Keys

Many systems use a two-level key: a **partition key** (determines the shard) plus a **sort key** (determines order within the shard):

```
  DynamoDB example:
  +---------------------+------------------+--------+
  | Partition Key       | Sort Key         | Value  |
  +---------------------+------------------+--------+
  | user_123           | order_2024_001   | {...}  |
  | user_123           | order_2024_002   | {...}  |
  | user_123           | order_2024_003   | {...}  |
  | user_456           | order_2024_001   | {...}  |
  +---------------------+------------------+--------+

  All items for user_123 live on the same shard
  --> efficient range queries within a user
  --> but user_123 can become a hotspot if very active
```

## Routing: How Queries Find Their Shard

Once data is partitioned, the system needs to route each query to the correct shard. There are three common patterns:

```
  Pattern 1: Client-side routing

  +--------+                    +----------+
  | Client |---knows routing--->| Shard 2  |
  +--------+    table           +----------+
  (client library holds the mapping, e.g., Redis Cluster)


  Pattern 2: Proxy-based routing

  +--------+     +-------+     +----------+
  | Client |---->| Proxy  |---->| Shard 2  |
  +--------+     +-------+     +----------+
  (proxy knows the mapping, e.g., Vitess VTGate, ProxySQL)


  Pattern 3: Node-level routing (gossip)

  +--------+     +----------+     +----------+
  | Client |---->| Any Node |---->| Shard 2  |
  +--------+     +----------+     +----------+
  (any node can redirect to the correct shard, e.g., Cassandra)
```

### Vitess: A proxy-based example

Vitess (used by YouTube, Slack, GitHub) routes MySQL queries through **VTGate**:

```
  Application
      |
      v
  +----------+    VSchema (mapping rules)
  | VTGate   |----+
  +----+-----+    |  "users table sharded by user_id,
       |          |   hash-based, 256 shards"
       v          |
  +----+-----+    |
  | VTTablet |<---+  (one per shard, wraps a MySQL instance)
  +----------+

  Query: SELECT * FROM users WHERE user_id = 123
  1. VTGate looks up VSchema: users is sharded by user_id
  2. Computes shard: hash(123) % 256 = shard_42
  3. Forwards query to VTTablet for shard_42
  4. Returns result to application
```

For queries that span multiple shards:

```
  Query: SELECT * FROM users WHERE age > 30

  VTGate must:
  1. Send query to ALL 256 shards (scatter)
  2. Collect partial results from each
  3. Merge and return to client (gather)

  This is expensive -- O(num_shards) fanout
  --> this is why shard key choice matters so much
```

### TiDB: Automatic range-based sharding

TiDB shards data transparently. The SQL layer (TiDB server) is stateless; the storage layer (TiKV) holds data in **Regions** (contiguous key ranges, typically 96-256MB each):

```
  TiDB Server (stateless SQL)
      |
      v
  +----------+
  |    PD    |  <-- metadata: which Region holds which key range
  +----------+
      |
      v
  +--------+  +--------+  +--------+  +--------+
  |Region 1|  |Region 2|  |Region 3|  |Region 4|  ...
  |[a, f)  |  |[f, m)  |  |[m, t)  |  |[t, z)  |
  +--------+  +--------+  +--------+  +--------+

  When Region 2 grows > 256MB, PD splits it:
  Region 2a: [f, j)    Region 2b: [j, m)

  When Regions are small and adjacent, PD merges them.
  This happens automatically -- applications never think about shards.
```

The key encoding for a table row in TiKV:

```
  Key format: t{tableID}_r{rowID}

  Table 42, row 1000: t42_r1000
  Table 42, row 1001: t42_r1001

  These are lexicographically ordered, so rows with adjacent
  IDs land in the same Region (range-based partitioning).

  Index entries:
  t{tableID}_i{indexID}_{indexValue}_{rowID}
```

## The Cross-Shard Problem

Sharding creates challenges when operations span multiple shards.

### Cross-shard queries

```
  Query: SELECT u.name, o.total
         FROM users u JOIN orders o ON u.id = o.user_id
         WHERE o.created_at > '2026-01-01'

  If users and orders are sharded by user_id:
  --> Join is local (same shard has both user and their orders)
  --> The WHERE on created_at still needs scatter-gather

  If users is sharded by user_id and orders by order_id:
  --> Join requires cross-shard lookup for every row
  --> Much more expensive
```

**Co-location** (putting related data on the same shard) is the primary strategy to avoid cross-shard joins. This is why shard key selection is so critical — it determines which queries are efficient.

### Cross-shard transactions

A single transaction that touches multiple shards requires a distributed commit protocol (usually two-phase commit):

```
  Transaction: transfer $100 from user A (shard 1) to user B (shard 3)

  Coordinator (e.g., TiDB server)
       |
       +---> Shard 1: PREPARE (lock A's row, deduct $100)
       |         |
       +---> Shard 3: PREPARE (lock B's row, add $100)
       |         |
       |    both respond "PREPARED"
       |         |
       +---> Shard 1: COMMIT
       +---> Shard 3: COMMIT

  If either shard fails to prepare --> ABORT both
```

Cross-shard transactions are significantly slower than single-shard ones (2-5x latency overhead due to extra network round-trips and lock holding time). Systems optimize by:
- Encouraging shard-local transactions via co-location
- Using optimistic concurrency control to reduce lock duration
- Batching commits across shards

## Resharding: Adding and Removing Shards

The hardest operational challenge in sharding is changing the number of shards. With naive hash partitioning (`hash % N`), changing N remaps almost every key.

### Consistent Hashing

Maps keys to a ring rather than a fixed modulus:

```
  Hash ring (0 to 2^32)

         Shard A
           |
     0 ----+---- 2^32
    /                \
   /                  \
  Shard D          Shard B
   \                  /
    \                /
     \              /
      +----+----+
           |
         Shard C

  Adding Shard E between B and C:
  - Only keys between B and E move to E
  - All other keys stay put
  - Minimal data movement (~1/N of total keys)
```

See the [consistent hashing post](/posts/design-how-consistent-hashing-works) for the full algorithm.

### TiDB's approach: automatic splitting

TiDB avoids the resharding problem entirely by using very small ranges (Regions) that split and merge automatically:

```
  Step 1: Data grows
  Region [a, z): 300MB  -->  too large

  Step 2: PD splits at midpoint
  Region [a, m): 150MB
  Region [m, z): 150MB

  Step 3: PD schedules the new Region to a less-loaded TiKV node
  (Raft group membership change moves data)

  No "resharding event" -- it's continuous and automatic
```

### Vitess resharding

Vitess supports online resharding without downtime using a workflow called **VReplication**:

```
  Before: 2 shards [-80, 80-]
  After:  4 shards [-40, 40-80, 80-c0, c0-]

  1. Create target shards (empty)
  2. Start VReplication streams: copy existing data + replicate changes
  3. Once caught up, do a brief write pause (< 1 second)
  4. Switch reads to new shards
  5. Switch writes to new shards
  6. Delete old shards

  +----------+     +---------+  +---------+
  | Shard -80|---->|Shard -40|  |Shard    |
  |          |---->|         |  |40-80    |
  +----------+     +---------+  +---------+

  +----------+     +---------+  +---------+
  |Shard 80- |---->|Shard    |  |Shard    |
  |          |---->|80-c0    |  |c0-      |
  +----------+     +---------+  +---------+
```

## Shard Key Selection Guide

Choosing the wrong shard key leads to hotspots, expensive cross-shard queries, or data skew. Here's a decision framework:

```
  +--------------------------------------------------+
  |  What are your most frequent queries?            |
  +--------------------------------------------------+
           |
           v
  +--------------------------------------------------+
  |  Which column appears in WHERE/JOIN most often?  |
  |  That's your shard key candidate.                |
  +--------------------------------------------------+
           |
           v
  +--------------------------------------------------+
  |  Does it have high cardinality?                  |
  |  (many distinct values)                          |
  |  Low cardinality = skewed shards                 |
  +--------------------------------------------------+
           |
           v
  +--------------------------------------------------+
  |  Is the access pattern uniform?                  |
  |  (celebrity problem: one key = 80% of traffic)   |
  |  If not, consider composite key or key salting   |
  +--------------------------------------------------+
```

| Workload | Good shard key | Bad shard key | Why |
|---|---|---|---|
| Social media (user-centric) | user_id | post_id | Most queries are per-user |
| E-commerce | customer_id | order_date | Customer's orders stay together |
| Time-series / IoT | device_id + time bucket | timestamp alone | Timestamp = all writes hit latest shard |
| Multi-tenant SaaS | tenant_id | auto-increment id | Tenant isolation, no cross-tenant joins |

### The celebrity problem

If one shard key value has disproportionate traffic (e.g., a viral post, a mega-tenant), that shard becomes a hotspot:

```
  Normal distribution:
  Shard 0: |||||||  (1000 QPS)
  Shard 1: |||||||  (1000 QPS)
  Shard 2: |||||||  (1000 QPS)

  With celebrity user on Shard 1:
  Shard 0: |||||||  (1000 QPS)
  Shard 1: |||||||||||||||||||||||||  (50,000 QPS)  <-- overwhelmed
  Shard 2: |||||||  (1000 QPS)
```

Solutions:
- **Key salting:** Append a random suffix (`user_123_0`, `user_123_1`, ...) to spread one key across shards. Reads must scatter-gather.
- **Dedicated shard:** Move the hot key to its own, beefier shard.
- **Caching:** Put a cache layer in front (Redis, Memcached) to absorb read traffic.
- **Application-level splitting:** Split the hot entity's data into sub-entities.

## Sharding vs. Replication

These are complementary, not alternatives:

```
  Sharding = splits DATA across nodes (each shard has different data)
  Replication = copies DATA across nodes (each replica has same data)

  Typical production setup: BOTH

  +------------------+  +------------------+  +------------------+
  |   Shard 0        |  |   Shard 1        |  |   Shard 2        |
  | +-----------+    |  | +-----------+    |  | +-----------+    |
  | | Primary   |    |  | | Primary   |    |  | | Primary   |    |
  | +-----------+    |  | +-----------+    |  | +-----------+    |
  | | Replica 1 |    |  | | Replica 1 |    |  | | Replica 1 |    |
  | +-----------+    |  | +-----------+    |  | +-----------+    |
  | | Replica 2 |    |  | | Replica 2 |    |  | | Replica 2 |    |
  | +-----------+    |  | +-----------+    |  | +-----------+    |
  +------------------+  +------------------+  +------------------+

  Sharding gives: write scalability, storage scalability
  Replication gives: read scalability, fault tolerance
```

## Summary

```
  When to shard:
  - Single node can't hold all data
  - Single node can't handle write throughput
  - You need geographic data locality

  When NOT to shard:
  - You can still vertically scale (cheaper, simpler)
  - Read replicas solve your problem (read-heavy workload)
  - Your data fits in one node with room to grow
  - You need lots of cross-shard queries (sharding won't help)
```

Sharding adds significant complexity: cross-shard queries, distributed transactions, resharding operations, and operational overhead. The systems that do it well (TiDB, CockroachDB, Vitess, DynamoDB) invest heavily in automating these challenges so application developers can focus on their domain logic rather than data placement.

## References

1. Designing Data-Intensive Applications, Ch. 6 (Kleppmann) [book](https://dataintensive.net/)
2. Vitess architecture and VReplication [docs](https://vitess.io/docs/concepts/vtgate/)
3. DynamoDB partition key design [docs](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html)
4. TiDB Region splitting and scheduling [docs](https://docs.pingcap.com/tidb/stable/tidb-scheduling)
5. CockroachDB range partitioning [docs](https://www.cockroachlabs.com/docs/stable/architecture/distribution-layer)
6. Consistent hashing (Karger et al.) [paper](https://dl.acm.org/doi/10.1145/258533.258660)
7. Cassandra data partitioning [docs](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html)
8. MongoDB sharding architecture [docs](https://www.mongodb.com/docs/manual/sharding/)
