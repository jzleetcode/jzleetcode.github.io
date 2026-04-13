---
author: JZ
pubDatetime: 2026-04-13T09:00:00Z
modDatetime: 2026-04-13T09:00:00Z
title: System Design - How Skip Lists Work
tags:
  - design-system
  - design-data-structure
description:
  "How skip lists work: the probabilistic data structure behind Redis sorted sets, LevelDB memtables, and Java's ConcurrentSkipListMap. Covers the layered linked-list architecture, search/insert/delete algorithms, probabilistic balancing, and real-world source code walkthrough."
---

## Table of contents

## Context

Imagine you have a sorted linked list. You can iterate it in order, but searching for a value takes $O(n)$ time because you must walk node by node from the head. A balanced binary search tree (BST) like a red-black tree gives you $O(\log n)$ search, but it requires complex rotation operations to stay balanced.

In 1990, William Pugh published a paper called [Skip Lists: A Probabilistic Alternative to Balanced Trees](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf). His idea was simple and elegant: instead of using tree rotations, **add express lanes** to a sorted linked list using randomness. The result is a data structure that matches the average-case performance of balanced BSTs while being far simpler to implement.

Skip lists are not just a textbook curiosity. They power some of the most widely used systems in the industry:

- **Redis** uses skip lists for its Sorted Set (`ZSET`) data type — the structure behind leaderboards, rate limiters, and priority queues.
- **LevelDB and RocksDB** (by Google and Meta) use skip lists as their in-memory **memtable**, the write buffer that sits in front of the on-disk LSM tree.
- **Java** provides `ConcurrentSkipListMap` and `ConcurrentSkipListSet` in its standard library as lock-free concurrent sorted containers.

Let's build up the intuition for how they work.

## From Linked List to Skip List

Start with a simple sorted linked list:

```
Level 0:  HEAD --> 3 --> 7 --> 12 --> 19 --> 26 --> 42 --> NIL
```

To find `26`, you walk through every node: 3, 7, 12, 19, 26. That's 5 comparisons. Now imagine adding a second level that skips every other node:

```
Level 1:  HEAD ----------> 7 ----------> 19 ----------> 42 --> NIL
              |            |              |              |
Level 0:  HEAD --> 3 --> 7 --> 12 --> 19 --> 26 --> 42 --> NIL
```

To find `26`, you start at Level 1: HEAD → 7 → 19 → 42 (too far!). Drop to Level 0 at 19, then step to 26. That's 4 comparisons. Add a third level:

```
Level 2:  HEAD ----------------------> 19 ---------------------> NIL
              |                         |                         |
Level 1:  HEAD ----------> 7 --------> 19 ----------> 42 -----> NIL
              |            |            |              |          |
Level 0:  HEAD --> 3 --> 7 --> 12 --> 19 --> 26 --> 42 -------> NIL
```

Now to find `26`: Level 2 HEAD → 19 → NIL (too far!). Drop to Level 1 at 19 → 42 (too far!). Drop to Level 0 at 19 → 26. Just 4 hops across three levels.

The key insight: **higher levels act as express lanes** that let you skip over large sections of the list, just like an express train skips local stops. When you overshoot, you drop down one level and continue with finer-grained steps.

## The Structure of a Skip List Node

Each node in a skip list has a key, an optional value, and an array of forward pointers — one for each level the node participates in:

```
  +------------------------------------------+
  |  Node                                    |
  |                                          |
  |  key:      the sorted key                |
  |  value:    associated data               |
  |  forward:  []*Node  (one per level)      |
  |                                          |
  |  forward[0] --> next node at level 0     |
  |  forward[1] --> next node at level 1     |
  |  forward[2] --> next node at level 2     |
  |  ...                                     |
  +------------------------------------------+
```

A node with `level = 3` participates in levels 0, 1, and 2. Every node appears at level 0 (the bottom). Higher levels contain progressively fewer nodes. The HEAD sentinel node has forward pointers for every possible level.

Here is how Redis defines a skip list node in [`src/server.h`](https://github.com/redis/redis/blob/unstable/src/server.h):

```c
typedef struct zskiplistNode {
    sds ele;                          // the member (string)
    double score;                     // the sort key
    struct zskiplistNode *backward;   // prev pointer (level 0 only)
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // next node at this level
        unsigned long span;             // distance to next node (for rank)
    } level[];                        // flexible array, one entry per level
} zskiplistNode;
```

Notice that Redis adds two extras: a `backward` pointer for reverse traversal, and a `span` field that tracks how many level-0 nodes each forward pointer skips over. The span is what makes `ZRANK` (get the rank of a member) an $O(\log n)$ operation instead of $O(n)$.

## The Search Algorithm

Searching a skip list is like navigating a city with express and local trains. Start at the highest level of the HEAD node, and move right as far as you can without overshooting. When you can't go further on the current level, drop down one level and continue.

```
  Search(list, target):
      node = list.head
      for level = list.maxLevel - 1 down to 0:
          while node.forward[level] != NIL
                and node.forward[level].key < target:
              node = node.forward[level]       // move right
          // can't go further at this level, drop down
      // now node.forward[0] is the candidate
      if node.forward[0] != NIL and node.forward[0].key == target:
          return node.forward[0]
      return NIL  // not found
```

Let's trace a search for `26` in our example:

```
  Level 2:  [HEAD] ===================> [19] =======================> [NIL]
                                          |
  Level 1:                               [19] ==========> [42]
                                          |                 ^
                                          |                 |
  Level 0:                               [19] --> [26]   too big!
                                                   ^
                                                 FOUND!

  Steps: HEAD --L2--> 19 --L2--> NIL (overshoot, drop)
         19 --L1--> 42 (overshoot, drop)
         19 --L0--> 26 (found!)
```

**Time complexity:** On average, search takes $O(\log n)$ time. At each level, you expect to examine a constant number of nodes before dropping down, and there are $O(\log n)$ levels.

## The Insert Algorithm

Insertion has two phases: (1) find where the new node belongs (same as search, but remember the path), and (2) randomly decide the new node's height and splice it in.

### Phase 1: Find the insertion point and record the "update" path

As you search, record the last node visited at each level. These are the nodes whose forward pointers will need to change:

```
  Insert(list, key, value):
      update = array of size maxLevel, all NIL
      node = list.head

      for level = list.maxLevel - 1 down to 0:
          while node.forward[level] != NIL
                and node.forward[level].key < key:
              node = node.forward[level]
          update[level] = node   // remember last node at this level
```

### Phase 2: Determine height and splice

The new node's height is determined by flipping a coin. Start at level 1. Flip: heads → add another level, tails → stop. With a fair coin (probability $p = 0.5$), this gives:

- 100% of nodes at level 0
- 50% at level 1
- 25% at level 2
- 12.5% at level 3
- ...

```
      newLevel = randomLevel()  // coin-flip loop

      // if newLevel exceeds current max, extend update array
      if newLevel > list.maxLevel:
          for level = list.maxLevel to newLevel - 1:
              update[level] = list.head
          list.maxLevel = newLevel

      newNode = createNode(key, value, newLevel)

      // splice newNode into each level
      for level = 0 to newLevel - 1:
          newNode.forward[level] = update[level].forward[level]
          update[level].forward[level] = newNode
```

Let's insert `15` with a random level of 2 into our list:

```
  Before:
  Level 2:  HEAD =====================> 19 ====================> NIL
  Level 1:  HEAD ========> 7 =========> 19 ========> 42 =======> NIL
  Level 0:  HEAD -> 3 -> 7 -> 12 -> 19 -> 26 -> 42 -> NIL

  update[0] = 12   (last node before 15 at level 0)
  update[1] = 7    (last node before 15 at level 1)

  After splicing 15 at levels 0 and 1:
  Level 2:  HEAD =============================> 19 ===============> NIL
  Level 1:  HEAD ========> 7 ======> [15] ====> 19 ====> 42 =====> NIL
  Level 0:  HEAD -> 3 -> 7 -> 12 -> [15] -> 19 -> 26 -> 42 -> NIL
```

The splice at each level is just rearranging two pointers — the same as inserting into a singly linked list. No rotations, no rebalancing. The randomness does the balancing for you, *in expectation*.

## The Delete Algorithm

Deletion mirrors insertion: find the node, record the update path, then unlink the node at every level it appears in.

```
  Delete(list, key):
      update = array of size maxLevel, all NIL
      node = list.head

      for level = list.maxLevel - 1 down to 0:
          while node.forward[level] != NIL
                and node.forward[level].key < key:
              node = node.forward[level]
          update[level] = node

      target = node.forward[0]
      if target == NIL or target.key != key:
          return  // not found

      for level = 0 to target.level - 1:
          if update[level].forward[level] == target:
              update[level].forward[level] = target.forward[level]

      // shrink maxLevel if top levels are now empty
      while list.maxLevel > 1 and list.head.forward[list.maxLevel-1] == NIL:
          list.maxLevel -= 1

      free(target)
```

Like insertion, deletion is $O(\log n)$ on average and requires no rebalancing.

## Why Randomness Works: Probabilistic Balancing

The magic of skip lists is that random level assignment produces a balanced structure *without any explicit balancing logic*. Here's the intuition.

With probability $p$ for promotion to the next level (typically $p = 0.5$ or $p = 0.25$), the expected number of nodes at level $k$ is:

$$n \cdot p^k$$

So the expected height of the skip list is $O(\log_{1/p} n)$. With $p = 0.5$ and $n = 1{,}000{,}000$ nodes, the expected max level is about $\log_2(1{,}000{,}000) \approx 20$.

At each level during a search, you expect to examine about $1/p$ nodes before dropping down. So the total expected search cost is:

$$\frac{\log n}{\log(1/p)} \cdot \frac{1}{p} = O(\log n)$$

The `randomLevel()` function is simple:

```c
// Redis implementation from src/t_zset.c
#define ZSKIPLIST_MAXLEVEL 32
#define ZSKIPLIST_P 0.25

int zslRandomLevel(void) {
    static const int threshold = ZSKIPLIST_P * RAND_MAX;
    int level = 1;
    while (random() < threshold)
        level += 1;
    return (level < ZSKIPLIST_MAXLEVEL) ? level : ZSKIPLIST_MAXLEVEL;
}
```

Redis uses $p = 0.25$ instead of $0.5$. This means fewer nodes get promoted to higher levels, resulting in **less memory overhead** (each node has ~1.33 forward pointers on average instead of 2) at the cost of slightly longer search paths. Pugh's original paper analyzed this trade-off and found $p = 0.25$ gives a good balance of speed and space.

```
  p = 0.5                            p = 0.25

  L3: 12.5% of nodes                 L3: 1.6% of nodes
  L2: 25%   of nodes                 L2: 6.25% of nodes
  L1: 50%   of nodes                 L1: 25%   of nodes
  L0: 100%  of nodes                 L0: 100%  of nodes

  Avg pointers/node: 2.0             Avg pointers/node: 1.33
  Search comparisons: ~2 log2(n)     Search comparisons: ~4/3 log4(n)
```

## Skip Lists in Redis: Sorted Sets

Redis Sorted Sets (`ZSET`) are one of the most popular Redis data types. Under the hood, a ZSET uses **both** a skip list and a hash table:

```
  +-------------------------------------------+
  |              Redis ZSET                    |
  |                                           |
  |  +------------------+  +---------------+  |
  |  |   Skip List      |  |   Hash Table  |  |
  |  |   (sorted by     |  |   (member -->  | |
  |  |    score)         |  |    score)     |  |
  |  +------------------+  +---------------+  |
  |                                           |
  |  Skip list enables:    Hash table enables:|
  |  - ZRANGE (by rank)    - ZSCORE O(1)     |
  |  - ZRANGEBYSCORE       - ZREM O(1) lookup|
  |  - ZRANK O(log n)      - member exists?  |
  +-------------------------------------------+
```

The skip list handles all sorted operations (range queries, rank lookups), while the hash table provides $O(1)$ point lookups by member name. This dual-index design gives Redis the best of both worlds.

The core insertion code in [`src/t_zset.c`](https://github.com/redis/redis/blob/unstable/src/t_zset.c) follows the algorithm we described:

```c
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
    zskiplistNode *update[ZSKIPLIST_MAXLEVEL], *x;
    unsigned long rank[ZSKIPLIST_MAXLEVEL];
    int i, level;

    x = zsl->header;
    // Phase 1: find insertion point, track update path and ranks
    for (i = zsl->level-1; i >= 0; i--) {
        rank[i] = (i == zsl->level-1) ? 0 : rank[i+1];
        while (x->level[i].forward &&
               (x->level[i].forward->score < score ||
                (x->level[i].forward->score == score &&
                 sdscmp(x->level[i].forward->ele, ele) < 0))) {
            rank[i] += x->level[i].span;
            x = x->level[i].forward;
        }
        update[i] = x;
    }

    // Phase 2: random level, create node, splice
    level = zslRandomLevel();
    if (level > zsl->level) {
        for (i = zsl->level; i < level; i++) {
            rank[i] = 0;
            update[i] = zsl->header;
            update[i]->level[i].span = zsl->length;
        }
        zsl->level = level;
    }

    x = zslCreateNode(level, score, ele);
    for (i = 0; i < level; i++) {
        x->level[i].forward = update[i]->level[i].forward;
        update[i]->level[i].forward = x;
        // update span values
        x->level[i].span = update[i]->level[i].span - (rank[0] - rank[i]);
        update[i]->level[i].span = (rank[0] - rank[i]) + 1;
    }
    // ...
    zsl->length++;
    return x;
}
```

Notice how Redis tracks `rank[]` alongside `update[]`. The rank array accumulates the distance traversed at each level, which is then used to update the `span` fields. This bookkeeping is what makes `ZRANK` efficient — to find the rank of any element, you just sum the spans along the search path.

## Skip Lists in LevelDB: The Memtable

LevelDB (and its successor RocksDB) uses a skip list as the **memtable** — the in-memory write buffer where all new writes land before being flushed to disk as sorted string tables (SSTables).

```
  Write path in LevelDB/RocksDB:

  Put(key, value)
       |
       v
  +------------------+
  |    Memtable       |      <-- skip list lives here
  |   (skip list)     |
  +--------+---------+
           |  (when full, ~64MB)
           v
  +------------------+
  | Immutable         |
  | Memtable          |      frozen, waiting for flush
  +--------+---------+
           |
           v
  +------------------+
  |  SSTable (L0)     |      on-disk sorted files
  +------------------+
  |  SSTable (L1)     |
  +------------------+
  |  ...              |
  +------------------+
```

Why a skip list instead of a red-black tree? The LevelDB authors (Jeff Dean and Sanjay Ghemawat at Google) chose a skip list because:

1. **Lock-free reads**: LevelDB's skip list allows concurrent reads without any locking. Reads just follow forward pointers, which are updated atomically. A red-black tree rotation touches multiple pointers and is harder to make lock-free.
2. **Simpler implementation**: No rotation logic, no color tracking. The entire skip list implementation in LevelDB is about 400 lines.
3. **Cache-friendly sequential access**: Iterating a skip list at level 0 is just walking a linked list — simple and predictable.

The LevelDB implementation in [`db/skiplist.h`](https://github.com/google/leveldb/blob/main/db/skiplist.h) uses atomic operations for the forward pointers:

```cpp
template <typename Key, class Comparator>
struct SkipList<Key, Comparator>::Node {
  Key const key;

  Node* Next(int n) {
    // Use acquire-load so that the read of next[n] observes
    // a fully initialized node written by Insert().
    return next_[n].load(std::memory_order_acquire);
  }

  void SetNext(int n, Node* x) {
    next_[n].store(x, std::memory_order_release);
  }

 private:
  std::atomic<Node*> next_[1];  // flexible array of forward pointers
};
```

The `memory_order_acquire` and `memory_order_release` fences ensure that when a reader follows a forward pointer, it sees the complete node that was written by the inserter. This gives lock-free reads with a single-writer (all writes go through the write-ahead log and are serialized).

## Skip List vs. Balanced BST: When to Choose What

```
  +--------------------+------------------------+------------------------+
  |                    |      Skip List         |   Balanced BST         |
  |                    |                        |   (Red-Black/AVL)      |
  +--------------------+------------------------+------------------------+
  | Search             | O(log n) expected      | O(log n) worst-case    |
  | Insert             | O(log n) expected      | O(log n) worst-case    |
  | Delete             | O(log n) expected      | O(log n) worst-case    |
  | Range query        | O(log n + k)           | O(log n + k)           |
  | Implementation     | Simple (~200 lines)    | Complex (~500+ lines)  |
  | Concurrent reads   | Easy (lock-free)       | Hard (rotations)       |
  | Memory overhead    | ~1.33 ptrs/node (p=¼)  | 3 ptrs/node + color    |
  | Worst case         | O(n) (astronomically   | O(log n) guaranteed    |
  |                    |  unlikely)              |                        |
  | Cache performance  | Pointer-chasing        | Pointer-chasing        |
  |                    | (similar to BST)       | (similar to skip list) |
  +--------------------+------------------------+------------------------+
```

**Choose a skip list when:**
- You need concurrent access (especially lock-free reads)
- Simplicity of implementation matters
- You're OK with probabilistic guarantees (the chance of pathological $O(n)$ behavior is roughly $p^n$ — negligible for any practical $n$)

**Choose a balanced BST when:**
- You need worst-case guarantees (real-time systems, adversarial inputs)
- Memory is extremely tight (with $p = 0.25$, skip lists use less memory than a BST, but with $p = 0.5$, they use more)

## Summary

Skip lists achieve the same $O(\log n)$ performance as balanced binary search trees through a beautifully simple idea: layer express lanes on top of a sorted linked list, with random promotion deciding which nodes appear in which lanes. The randomness replaces complex rebalancing logic with a coin flip, making the code easier to write, reason about, and adapt for concurrent access.

```
   Sorted Linked List              Skip List
   (linear search)                 (logarithmic search)

   O(n)                            O(log n)
   HEAD -> 1 -> 2 -> ... -> n      HEAD =============> n/2 =========> NIL
                                   HEAD =====> n/4 ===> n/2 ===> ... NIL
                                   HEAD -> 1 -> 2 -> 3 -> ... -> n -> NIL
                                         express lanes + local stops
```

The next time you use `ZADD` in Redis or write a key to RocksDB, a skip list is doing the work underneath — sorting your data with nothing more than a few pointer swaps and a random number generator.

## References

1. Skip Lists: A Probabilistic Alternative to Balanced Trees, William Pugh, 1990 [paper](https://15721.courses.cs.cmu.edu/spring2018/papers/08-oltpindexes1/pugh-skiplists-cacm1990.pdf)
2. Redis skip list implementation [`src/t_zset.c`](https://github.com/redis/redis/blob/unstable/src/t_zset.c)
3. Redis skip list node definition [`src/server.h`](https://github.com/redis/redis/blob/unstable/src/server.h)
4. LevelDB skip list implementation [`db/skiplist.h`](https://github.com/google/leveldb/blob/main/db/skiplist.h)
5. Java ConcurrentSkipListMap [Javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/ConcurrentSkipListMap.html)
6. Redis Sorted Set documentation [doc](https://redis.io/docs/data-types/sorted-sets/)
7. LevelDB implementation notes [doc](https://github.com/google/leveldb/blob/main/doc/impl.md)
