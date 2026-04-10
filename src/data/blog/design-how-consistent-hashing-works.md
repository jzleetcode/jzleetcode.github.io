---
author: JZ
pubDatetime: 2026-04-10T06:00:00Z
modDatetime: 2026-04-10T06:00:00Z
title: System Design - How Consistent Hashing Works
tags:
  - design-system
  - design-concurrency
description:
  "How consistent hashing works: the problem with naive hashing, the hash ring, virtual nodes, real-world usage in DynamoDB and Memcached, and a source code walkthrough of Go's jump consistent hash and ketama implementations."
---

## Table of contents

## The Problem: Why Not Just Use Modulo?

Imagine you have a web application with three cache servers. You want to distribute cached items evenly across them. The simplest approach: hash the key and take modulo N.

```
server = hash(key) % 3
```

With keys "user:1" through "user:6", you might get:

```
  hash("user:1") % 3 = 0  --> Server A
  hash("user:2") % 3 = 1  --> Server B
  hash("user:3") % 3 = 2  --> Server C
  hash("user:4") % 3 = 0  --> Server A
  hash("user:5") % 3 = 1  --> Server B
  hash("user:6") % 3 = 2  --> Server C
```

This works perfectly until you add a fourth server. Now the formula is `hash(key) % 4`:

```
  Before (% 3)             After (% 4)

  hash("user:1") = 0 -> A  hash("user:1") = 1 -> B   MOVED
  hash("user:2") = 1 -> B  hash("user:2") = 2 -> C   MOVED
  hash("user:3") = 2 -> C  hash("user:3") = 3 -> D   MOVED
  hash("user:4") = 0 -> A  hash("user:4") = 0 -> A   stayed
  hash("user:5") = 1 -> B  hash("user:5") = 1 -> B   stayed
  hash("user:6") = 2 -> C  hash("user:6") = 2 -> C   stayed
```

Half the keys moved. In the worst case, adding one server to a cluster of N servers remaps **approximately (N-1)/N** of all keys. With 100 servers, adding one server remaps ~99% of keys. That means ~99% cache misses, a sudden flood of requests hitting your database, and potentially a cascading failure.

This is the **rehashing problem**, and it is exactly what consistent hashing was designed to solve.

## The Hash Ring

In 1997, David Karger and colleagues at MIT published a paper titled *Consistent Hashing and Random Trees* that introduced an elegant solution. Instead of mapping keys to server indices with modulo, map both keys **and** servers onto a circular ring (imagine a clock face, but with values from 0 to $2^{32} - 1$).

```
                    0 / 2^32
                      |
                 .----|----.
               /      |      \
             /        |        \
           /          |          \
          |     Server A (pos 100)|
  2^32 * 3/4         |           2^32 * 1/4
     -----+           |           +-----
          |           |          |
           \          |         /
            \ Server C (pos 800)
              \       |       /
               \      |      /
                 '----|----'
                      |
                  2^32 * 1/2
                Server B (pos 500)
```

Here is how it works:

1. **Hash each server** to a position on the ring using a hash function (e.g., `hash("ServerA") = 100`).
2. **Hash each key** to a position on the ring (e.g., `hash("user:42") = 350`).
3. **Walk clockwise** from the key's position until you hit a server. That server owns the key.

```
  Ring positions (simplified to 0-999):

       0                                           999
       |---A(100)-----*------B(500)------C(800)----|
                      350

  key "user:42" hashes to 350
  walk clockwise --> next server is B (at 500)
  so Server B owns "user:42"
```

### What happens when a server is added?

Suppose we add Server D at position 650:

```
       0                                           999
       |---A(100)-----*------B(500)--D(650)--C(800)----|
                      350

  Before:  keys in range (500, 800] --> C
  After:   keys in range (500, 650] --> D    (moved from C)
           keys in range (650, 800] --> C    (stayed)
```

Only the keys between B and D moved — from C to D. Every other key stays put. On average, adding one server to a ring with N servers only remaps **1/N** of the keys. With 100 servers, that is just ~1% of keys. Compare that to ~99% with naive modulo.

### What happens when a server is removed?

If Server B crashes (removed from position 500):

```
       0                                           999
       |---A(100)-----*-----------D(650)--C(800)----|
                      350

  "user:42" at 350: walk clockwise --> next server is D (at 650)
  keys that were on B now go to the next server clockwise (D)
```

Again, only the keys that belonged to B are remapped. Everyone else is unaffected.

## The Virtual Node Trick

There is a catch with the basic ring: if you only place each server at one position, the distribution can be uneven. With three servers at positions 100, 500, and 800, Server A owns the range (800, 100] — which wraps around and covers 300 units. Server B owns (100, 500] — 400 units. Server C owns (500, 800] — also 300 units. Not terrible, but with real hash functions and few servers, the imbalance can be much worse.

The solution is **virtual nodes** (vnodes). Instead of placing each server at one position, place it at many positions:

```
  Physical servers: A, B, C
  Virtual nodes (4 per server):

       0                                           999
       |--A1--B2--A3--C1--B1--A2--C3--B3--A4--C2--B4--C4--|
       50  120 200  310  400  480  550  630  720  790  870 950

  Each physical server appears 4 times on the ring.
  The arc each physical server covers is the union of its vnodes' arcs.
```

With more virtual nodes, the distribution converges toward perfectly even. In practice, systems use **100-200 virtual nodes per physical server**. The Dynamo paper (Amazon, 2007) reports that 200 virtual nodes per server achieves less than 5% load imbalance.

### How virtual nodes help with heterogeneous hardware

If Server A has twice the capacity of Server B, simply give A twice as many virtual nodes. Keys naturally distribute proportionally.

```
  Server A (powerful):   200 vnodes
  Server B (standard):   100 vnodes
  Server C (standard):   100 vnodes

  Server A handles ~50% of keys
  Server B handles ~25% of keys
  Server C handles ~25% of keys
```

## Implementation: Ketama (Memcached)

The most widely deployed consistent hashing implementation is **ketama**, originally written for Memcached by Last.fm engineers Richard Jones and Christian Meissl in 2007. It became the de facto standard and is used by `libmemcached`, `twemproxy` (Twitter's proxy for Memcached/Redis), and many other systems.

The algorithm works as follows:

1. For each server, generate multiple points on the ring by hashing `"server_address-index"` with MD5.
2. Store all points in a sorted array.
3. To look up a key, hash it, then binary search the sorted array for the next point clockwise.

Here is the core logic from [`twemproxy`](https://github.com/twitter/twemproxy)'s `nc_ketama.c`, simplified:

```c
// Step 1: Build the ring (called once at startup or when servers change)
void ketama_update(struct server_pool *pool) {
    // Each server gets 160 points on the ring (40 hashes * 4 points each)
    int points_per_server = 160;
    int total_points = num_servers * points_per_server;

    struct continuum *ring = allocate(total_points);
    int idx = 0;

    for (int s = 0; s < num_servers; s++) {
        // Generate 40 MD5 hashes per server
        for (int k = 0; k < 40; k++) {
            // Hash "server_addr-k"
            char buf[128];
            snprintf(buf, sizeof(buf), "%s-%d", server[s].addr, k);
            unsigned char digest[16];
            md5(buf, digest);

            // Each MD5 gives 16 bytes = 4 x 32-bit points
            for (int h = 0; h < 4; h++) {
                uint32_t point =
                    (digest[3 + h*4] << 24) |
                    (digest[2 + h*4] << 16) |
                    (digest[1 + h*4] <<  8) |
                    (digest[0 + h*4]);

                ring[idx].point  = point;
                ring[idx].server = &server[s];
                idx++;
            }
        }
    }

    // Sort by point value for binary search
    qsort(ring, total_points, sizeof(*ring), compare_points);
}

// Step 2: Look up which server owns a key
struct server *ketama_lookup(struct server_pool *pool, uint32_t hash) {
    struct continuum *ring = pool->ring;
    int n = pool->num_points;

    // Binary search for first point >= hash
    int lo = 0, hi = n - 1;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (ring[mid].point < hash)
            lo = mid + 1;
        else
            hi = mid;
    }

    // If hash > all points, wrap around to the first point
    if (ring[lo].point < hash)
        lo = 0;

    return ring[lo].server;
}
```

**Why 160 points per server?** MD5 produces 128 bits (16 bytes). Each hash gives 4 points (32 bits each). To get 160 points, you need 40 MD5 hashes per server. The number 160 was chosen empirically by the ketama authors as a good balance between ring uniformity and memory usage.

**Why MD5?** Speed and distribution quality. Cryptographic strength is irrelevant here — we just need uniform distribution. MD5 is fast and produces well-distributed output.

**Time complexity:**
- Building the ring: $O(N \cdot V \cdot \log(N \cdot V))$ where N is servers and V is vnodes per server (due to sorting).
- Lookup: $O(\log(N \cdot V))$ via binary search.
- Adding/removing a server: Rebuild the ring, $O(N \cdot V \cdot \log(N \cdot V))$.

## Implementation: Jump Consistent Hash (Google)

In 2014, John Lamping and Eric Veach at Google published a paper describing a remarkably simple algorithm called **Jump Consistent Hash**. The entire implementation fits in a few lines.

From the [original paper](https://arxiv.org/abs/1406.2294):

```go
// JumpHash maps a 64-bit key to one of num_buckets buckets.
// It returns a bucket number in [0, num_buckets).
func JumpHash(key uint64, num_buckets int) int {
    var b, j int64
    b = -1
    j = 0
    for j < int64(num_buckets) {
        b = j
        key = key*2862933555777941757 + 1  // LCG pseudorandom
        j = int64(float64(b+1) *
            (float64(int64(1)<<31) / float64((key>>33)+1)))
    }
    return int(b)
}
```

This is the complete algorithm. No ring, no virtual nodes, no sorted array. Just a loop with a pseudorandom number generator.

### How does it work?

The intuition is beautiful. Think of it as a coin-flipping game:

```
  Start: all keys are in bucket 0 (1 bucket)

  Add bucket 1:
    Each key "flips a coin" (deterministic, based on the key)
    Heads: stay in current bucket
    Tails: move to bucket 1

  Add bucket 2:
    Each key flips again
    Heads: stay
    Tails: move to bucket 2

  ... and so on for each bucket
```

The key insight is that when you go from N to N+1 buckets, each key has a **1/(N+1)** probability of moving to the new bucket. This is exactly the optimal redistribution — only 1/(N+1) of keys move, which matches the theoretical minimum.

The loop computes where the key would "jump" (move to a new bucket) as buckets are added one by one. It uses a linear congruential generator (LCG) seeded by the key to make the coin flips deterministic. The variable `j` tracks the next bucket the key would jump to. Once `j >= num_buckets`, the last bucket the key jumped to (`b`) is the answer.

### Trade-offs vs. ring-based hashing

```
  Feature              Ring (Ketama)           Jump Hash
  -------------------  ----------------------  ---------------------
  Memory               O(N * V)                O(1)
  Lookup time          O(log(N * V))           O(ln N)
  Add server           any position            must be at the end
  Remove server        any server              only the last one
  Weighted nodes       yes (more vnodes)       no (equal weight)
  Implementation       moderate                trivial
```

**Jump hash is ideal when** servers are numbered 0 to N-1 and you only add/remove at the end (e.g., scaling a shard cluster). **Ring-based hashing is better when** servers come and go unpredictably (e.g., a cache pool where any node can fail).

## Real-World Usage

### Amazon DynamoDB (Dynamo Paper, 2007)

DynamoDB uses consistent hashing as its core data partitioning strategy. Each node is assigned multiple virtual nodes on the ring. When a key is written, DynamoDB walks clockwise to find not just one but **N** distinct physical nodes (the "preference list") for replication:

```
  Ring with replication factor N = 3:

       A1---B1---C1---A2---D1---B2---C2---D2
            |
         key K hashes here
            |
            v
  Preference list for K:
    1. B  (first node clockwise = B1)
    2. C  (skip B's other vnodes, next distinct node = C1)
    3. A  (skip C's other vnodes, next distinct node = A2 -> physical A)

  K is replicated to B, C, and A
```

This ensures that even if one node fails, the replicas on other physical nodes keep the data available.

### Apache Cassandra

Cassandra adopted DynamoDB's design. Each node owns a token range on a ring of $2^{64}$ values. The **partitioner** (by default `Murmur3Partitioner`) hashes the partition key to determine which token range — and thus which node — owns the data.

Cassandra originally used manually assigned tokens but now defaults to **virtual nodes** (`num_tokens = 256` per node by default in `cassandra.yaml`). When a node joins, it takes over token ranges from existing nodes, and only the affected ranges are streamed.

### Memcached / Twemproxy

As described in the ketama section, Twemproxy (used heavily at Twitter) uses ketama consistent hashing to distribute cache keys across a pool of Memcached or Redis instances. When a cache node goes down, only its keys are redistributed to the next node on the ring — the rest of the cache stays warm.

### Content Delivery Networks (CDNs)

CDNs like Akamai (co-founded by David Karger, one of the consistent hashing paper authors) use consistent hashing to map URLs to edge servers. When an edge server goes offline, only its URLs need to be re-routed. The rest of the CDN cache remains intact.

## Bounded-Load Consistent Hashing (Google, 2017)

Standard consistent hashing can create **hot spots**. If one key is extremely popular, its owning server gets disproportionate load. In 2017, Mirrokni, Thorup, and Zadimoghaddam at Google published a refinement: **consistent hashing with bounded loads**.

The idea: set a capacity limit per server (e.g., 1.25x average load). When looking up a key, walk clockwise as usual, but if the target server is over capacity, continue to the next server on the ring.

```
  Lookup with bounded load:

  1. hash(key) --> position on ring
  2. Walk clockwise to server S
  3. If S.load < capacity_limit:
       assign key to S
     Else:
       continue clockwise to next server S'
       repeat step 3
```

This guarantees that no server is loaded more than (1 + epsilon) times the average, while still keeping the key-to-server mapping mostly stable. Google deployed this in their load balancers. The [paper](https://arxiv.org/abs/1608.01350) proves that the expected number of key remappings when adding/removing a server is $O(1/\epsilon^2)$ times the optimal.

The HAProxy load balancer implements this as the `hash-type consistent` option with `hash-balance-factor`.

## Putting It All Together

Consistent hashing solves one of distributed systems' fundamental problems: how to distribute data across a changing set of servers with minimal disruption. Here is the big picture:

```
  Problem: distribute keys across N servers
           that can join or leave at any time

                        |
          +-------------+-------------+
          |                           |
     Naive modulo               Consistent hashing
     hash(key) % N              hash ring + vnodes
          |                           |
     Adding 1 server            Adding 1 server
     remaps ~(N-1)/N keys      remaps ~1/N keys
          |                           |
     99% cache miss             1% cache miss
     (catastrophic)             (graceful)
```

The three key ideas to remember:

1. **The ring** maps both keys and servers to the same circular space, so adding or removing a server only affects its neighbors.
2. **Virtual nodes** ensure even distribution despite having few physical servers and enable weighted allocation.
3. **Binary search** (or jump hash) makes lookup fast — $O(\log N)$ or $O(\ln N)$.

These ideas, first published in 1997, now underpin some of the largest distributed systems in the world — from Amazon's shopping cart to Twitter's cache layer to Akamai's CDN serving trillions of requests.

## References

1. Karger, D. et al. "Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web." ACM STOC, 1997. [paper](https://dl.acm.org/doi/10.1145/258533.258660)
2. DeCandia, G. et al. "Dynamo: Amazon's Highly Available Key-value Store." ACM SOSP, 2007. [paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
3. Lamping, J. and Veach, E. "A Fast, Minimal Memory, Consistent Hash Algorithm." Google, 2014. [paper](https://arxiv.org/abs/1406.2294)
4. Mirrokni, V., Thorup, M., and Zadimoghaddam, M. "Consistent Hashing with Bounded Loads." Google, 2017. [paper](https://arxiv.org/abs/1608.01350)
5. Twemproxy ketama implementation [`src/hashkit/nc_ketama.c`](https://github.com/twitter/twemproxy/blob/master/src/hashkit/nc_ketama.c)
6. Go jump consistent hash [`github.com/lithammer/go-jump-consistent-hash`](https://github.com/lithammer/go-jump-consistent-hash)
7. Apache Cassandra architecture [doc](https://cassandra.apache.org/doc/latest/cassandra/architecture/overview.html)
8. HAProxy consistent hashing [doc](https://docs.haproxy.org/2.8/configuration.html#4-hash-type)
