---
author: JZ
pubDatetime: 2026-04-19T06:00:00Z
modDatetime: 2026-04-19T06:00:00Z
title: System Design - How Database Query Optimization Works
tags:
  - design-system
  - design-database
description:
  "How database query optimizers work: parsing SQL into trees, generating candidate plans, cost estimation, join ordering with dynamic programming and genetic algorithms, and a source code walkthrough of the PostgreSQL optimizer."
---

## Table of contents

## Context

When you type `SELECT * FROM orders JOIN customers ON orders.cust_id = customers.id WHERE orders.total > 100`, you are stating **what** data you want, not **how** to get it. The database's **query optimizer** is the component that figures out the "how." It decides which indexes to use, what order to join tables, whether to sort or hash, and dozens of other choices that can mean the difference between a query finishing in 5 milliseconds or 5 minutes.

Query optimization is one of the oldest and most studied problems in database systems. IBM's System R (1979) introduced the first cost-based optimizer, and the core ideas — enumerate candidate plans, estimate their cost, pick the cheapest — remain the foundation of every major database today.

We will use **PostgreSQL** as our reference implementation. Its optimizer is well-documented, written in readable C, and freely available. The concepts transfer directly to MySQL, TiDB, CockroachDB, and other systems.

```
                        Query Processing Pipeline

   SQL text
      |
      v
  +--------+     +----------+     +-----------+     +----------+
  | Parser | --> | Analyzer | --> | Optimizer | --> | Executor |
  +--------+     +----------+     +-----------+     +----------+
      |               |                |                  |
   raw parse      resolved          cheapest           result
    tree          names/types        plan tree           rows
```

The optimizer sits between the analyzer (which resolves table names, column types, and permissions) and the executor (which actually runs the plan). Its job is to transform a **logical query tree** into the most efficient **physical execution plan**.

## From SQL to Parse Tree

The parser converts SQL text into a tree of nodes. For our example query:

```sql
SELECT o.id, c.name, o.total
FROM orders o
  JOIN customers c ON o.cust_id = c.id
WHERE o.total > 100
ORDER BY o.total DESC;
```

The parser produces a tree like this:

```
            SelectStmt
           /    |     \
     target  fromClause  sortClause
     list                   |
      |         |        SortBy
   [o.id,   JoinExpr      (o.total DESC)
   c.name,   /    \
   o.total] /      \
        orders  customers
        (o)       (c)
                   |
              ON o.cust_id = c.id

     whereClause: o.total > 100
```

The parser does **no** optimization. It simply checks syntax and builds a faithful representation of what the user wrote. The analyzer then resolves `orders` to a real table OID, checks that `cust_id` exists, and annotates each node with type information.

## The Optimizer's Three Big Questions

Once the analyzer hands off a resolved query tree, the optimizer must answer three questions:

1. **Access paths:** For each table, how should we read the rows? Sequential scan? Index scan? Bitmap scan?
2. **Join order:** If the query touches N tables, in what order should we join them? (N tables can be joined in $\frac{(2N-2)!}{(N-1)!}$ different tree shapes.)
3. **Join method:** For each pair of relations we join, should we use a nested loop, hash join, or merge join?

The optimizer explores combinations of these choices, estimates the cost of each, and picks the cheapest one. Let's trace through each step.

## Step 1: Generating Access Paths

For every base table in the query, PostgreSQL generates a set of **paths** — candidate ways to retrieve the rows. The entry point is [`set_plain_rel_pathlist()`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/allpaths.c):

```c
static void set_plain_rel_pathlist(PlannerInfo *root,
                                   RelOptInfo *rel,
                                   RangeTblEntry *rte)
{
    /* Consider sequential scan */
    add_path(rel, create_seqscan_path(root, rel, ...));

    /* Consider index scans */
    if (rel->indexlist != NIL)
        create_index_paths(root, rel);

    /* Consider TID scans, parallel scans, etc. */
    create_tidscan_paths(root, rel);
}
```

For our `orders` table, suppose there is a B-tree index on `total` and another on `cust_id`. PostgreSQL generates these candidate paths:

```
  orders table (est. 1,000,000 rows)
  +-------------------------------------------+
  | Path                      | Est. Cost     |
  |---------------------------|---------------|
  | Sequential Scan           | 14,425        |
  |   + Filter: total > 100   |               |
  |                           |               |
  | Index Scan (idx_total)    | 8,230         |
  |   range: total > 100      |               |
  |                           |               |
  | Bitmap Index Scan         | 9,100         |
  |   + Bitmap Heap Scan      |               |
  |   range: total > 100      |               |
  +-------------------------------------------+
```

Each path is a lightweight struct storing the estimated `startup_cost` (work before the first row) and `total_cost` (work for all rows). The optimizer does **not** execute anything yet — it only estimates.

### How Costs Are Estimated

The cost model lives in [`costsize.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/costsize.c). At its core, the cost of any plan is:

$$\text{cost} = (\text{pages read} \times \text{page\_cost}) + (\text{tuples processed} \times \text{cpu\_tuple\_cost}) + (\text{operators evaluated} \times \text{cpu\_operator\_cost})$$

PostgreSQL defines these tunable constants:

```
  Parameter              Default     What it represents
  ---------------------  ---------   --------------------------------
  seq_page_cost          1.0         reading one page sequentially
  random_page_cost       4.0         reading one page randomly (seek)
  cpu_tuple_cost         0.01        processing one tuple
  cpu_operator_cost      0.0025      evaluating one operator/function
  parallel_tuple_cost    0.1         passing a tuple to parallel worker
  parallel_setup_cost    1000.0      launching a parallel worker
```

The `random_page_cost` being 4x `seq_page_cost` reflects the physical reality of spinning disks: random I/O requires a disk seek, which is far slower than sequential reads. On SSDs, many DBAs lower `random_page_cost` to 1.1–1.5.

For a sequential scan on `orders` (1,000,000 rows, ~7,000 pages):

```
  startup_cost = 0
  total_cost   = (7000 pages × 1.0)           -- disk I/O
               + (1,000,000 tuples × 0.01)     -- CPU per tuple
               + (1,000,000 × 0.0025)          -- evaluating "total > 100"
               = 7000 + 10000 + 2500
               = 19,500
```

For an index scan on `idx_total` where the predicate `total > 100` selects 30% of rows (300,000 rows), the cost factors in random I/O for heap fetches:

```
  startup_cost = index_descent_cost  (small, ~2-3 levels)
  total_cost   = (index pages read × 1.0)                -- sequential index read
               + (300,000 heap pages × random_page_cost)  -- random heap fetches
               + (300,000 × cpu_tuple_cost)
               ...
```

If the index has good **correlation** with the physical table order (the table is clustered on `total`), the heap fetches become mostly sequential, dramatically reducing cost. PostgreSQL tracks this correlation in `pg_statistic`.

### Where Do the Row Estimates Come From?

The optimizer cannot compute exact costs without knowing how many rows each operation produces. These estimates come from **table statistics** maintained by `ANALYZE`:

```
  pg_statistic / pg_stats
  +---------------------------------------------------+
  | Column     | Stored Statistics                     |
  |------------|---------------------------------------|
  | total      | n_distinct: -0.95 (95% unique)        |
  |            | most_common_vals: {0, 50, 99, ...}    |
  |            | most_common_freqs: {0.01, 0.008, ...} |
  |            | histogram_bounds: {0,10,25,50,...,9999}|
  |            | null_frac: 0.0                        |
  |            | correlation: 0.85                     |
  +---------------------------------------------------+
```

For a predicate like `total > 100`, PostgreSQL uses the histogram to estimate **selectivity** — the fraction of rows that match. It interpolates within the histogram bucket containing 100 to get a precise estimate.

Bad statistics lead to bad plans. This is why `ANALYZE` (or `autovacuum` which runs it automatically) is critical for query performance.

## Step 2: Join Ordering with Dynamic Programming

With access paths for each table computed, the optimizer must decide **in what order to join them**. This is the hardest part of query optimization because the search space explodes combinatorially.

For our two-table query, there are only two orders: `orders JOIN customers` or `customers JOIN orders`. But with more tables:

```
  Tables    Possible Join Orders
  ------    --------------------
     2                 2
     3                12
     4               120
     5             1,680
     8        17,297,280
    12    ≈ 1.7 × 10^13
```

PostgreSQL uses **dynamic programming** (bottom-up enumeration) to explore this space efficiently. The algorithm, implemented in [`joinrels.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/joinrels.c), works level by level:

```
  Level 1: base relations (individual tables)
  +-------+    +----------+    +--------+
  | orders|    | customers|    | items  |
  +-------+    +----------+    +--------+

  Level 2: all valid 2-table joins
  +------------------+  +------------------+  +------------------+
  | orders ⋈ customers|  | orders ⋈ items  |  | customers ⋈ items|
  +------------------+  +------------------+  +------------------+

  Level 3: all valid 3-table joins (built from level 1 + level 2)
  +------------------------------+
  | (orders ⋈ customers) ⋈ items |
  | (orders ⋈ items) ⋈ customers |
  | ...                          |
  +------------------------------+

  At each level, only the cheapest paths survive.
```

The key function is `join_search_one_level()`:

```c
void join_search_one_level(PlannerInfo *root, int level)
{
    // Phase 1: join level-(k-1) relations with base relations
    foreach(r, joinrels[level - 1]) {
        foreach(other, joinrels[1]) {
            if (have_relevant_joinclause(root, r, other))
                make_join_rel(root, r, other);
        }
    }

    // Phase 2: "bushy" plans (e.g., 2-way join ⋈ 2-way join)
    for (k = 2; k + k <= level; k++) {
        foreach(r, joinrels[k]) {
            foreach(other, joinrels[level - k]) {
                if (have_relevant_joinclause(root, r, other))
                    make_join_rel(root, r, other);
            }
        }
    }

    // Phase 3: cartesian products (last resort)
    if (joinrels[level] == NIL)
        make_cartesian_product_joins(root, level);
}
```

**The crucial insight:** at each level, PostgreSQL keeps only the **cheapest path(s)** for each set of joined relations. If joining `{orders, customers}` via a hash join costs 5,000 and via a nested loop costs 50,000, the nested loop path is pruned. This prevents the search space from exploding.

### When Dynamic Programming Is Too Slow: GEQO

For queries with many tables (default threshold: 12), even dynamic programming becomes too slow. PostgreSQL switches to the **Genetic Query Optimizer** ([GEQO](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/geqo/geqo_main.c)), which treats join ordering as a variant of the **Traveling Salesman Problem**:

```
  Dynamic Programming          vs.        GEQO
  (exhaustive, optimal)                   (heuristic, near-optimal)
                                          
  Tables: 2-11                            Tables: 12+
  Time: O(3^n) with pruning              Time: O(generations × pool_size)
  Result: guaranteed cheapest             Result: good but not guaranteed
                                          
  Algorithm:                              Algorithm:
  1. enumerate all subsets                1. random population of join orders
  2. build up level by level              2. evaluate fitness (plan cost)
  3. prune dominated paths                3. crossover best individuals
  4. return cheapest at top               4. mutate and repeat
                                          5. return fittest individual
```

The GEQO threshold is configurable via `geqo_threshold` (default 12). In practice, queries joining 12+ tables are uncommon in OLTP workloads, so most queries use the dynamic programming path.

## Step 3: Choosing Join Methods

For each join the optimizer considers, it evaluates three physical join algorithms:

### Nested Loop Join

The simplest strategy: for each row in the outer table, scan the inner table for matches.

```
  for each row r in outer:          Cost:
      for each row s in inner:        O(|outer| × |inner|)
          if r.key == s.key:          Good when:
              emit (r, s)               - inner table is small
                                        - inner has an index on join key
                                        - outer has very few rows
```

With an index on the inner table's join key, the inner loop becomes an index lookup instead of a full scan, making this $O(|outer| \times \log|inner|)$.

### Hash Join

Build a hash table on the smaller relation, then probe it with the larger one.

```
  Phase 1 - Build:                  Cost:
  for each row r in smaller:          O(|smaller| + |larger|)
      insert r into hash_table        Good when:
                                        - no useful indexes
  Phase 2 - Probe:                      - join on equality (=)
  for each row s in larger:             - enough memory for hash table
      lookup s.key in hash_table
      if found:
          emit (match, s)
```

Hash joins cannot handle non-equality predicates (like `a.val > b.val`). They also need enough `work_mem` to hold the hash table; if the build side is too large, PostgreSQL spills to disk in batches.

### Merge Join

Sort both inputs on the join key, then walk through them in tandem.

```
  Phase 1 - Sort both sides        Cost:
  sort outer by join key              O(N log N + M log M + N + M)
  sort inner by join key              Good when:
                                        - inputs already sorted (index)
  Phase 2 - Merge:                      - result needs to be sorted
  while both have rows:                 - large inputs, both sides
      if outer.key == inner.key:
          emit matches
      elif outer.key < inner.key:
          advance outer
      else:
          advance inner
```

If either input is already sorted (e.g., from an index scan), the sort phase is free, making merge join very attractive.

### Putting It Together: EXPLAIN

You can see the optimizer's choices with `EXPLAIN`:

```sql
EXPLAIN SELECT o.id, c.name, o.total
FROM orders o JOIN customers c ON o.cust_id = c.id
WHERE o.total > 100
ORDER BY o.total DESC;
```

```
 Sort  (cost=15234.56..15534.78 rows=120088 width=48)
   Sort Key: o.total DESC
   ->  Hash Join  (cost=1245.00..8923.45 rows=120088 width=48)
         Hash Cond: (o.cust_id = c.id)
         ->  Index Scan using idx_orders_total on orders o
               (cost=0.42..5678.90 rows=120088 width=16)
               Index Cond: (total > 100)
         ->  Hash  (cost=820.00..820.00 rows=50000 width=36)
               ->  Seq Scan on customers c
                     (cost=0.00..820.00 rows=50000 width=36)
```

Reading this bottom-up:

```
  Execution Order (bottom-up):

  1. Seq Scan customers        Read all 50,000 customers
         |
         v
  2. Hash (build)              Build hash table on c.id
         |                     (50,000 entries)
         v
  3. Index Scan orders         Scan orders where total > 100
         |                     using idx_orders_total
         v                     (~120,088 rows)
  4. Hash Join (probe)         For each order row, probe hash
         |                     table to find matching customer
         v
  5. Sort                      Sort result by o.total DESC
         |
         v
      Result rows
```

The optimizer chose this plan because:
- **Index scan** on `orders`: the predicate `total > 100` is selective enough that an index scan beats a sequential scan.
- **Hash join**: the `customers` table fits easily in memory as a hash table, and the join is on equality (`cust_id = id`).
- **Sort**: no index provides the required `DESC` order on `total` post-join, so an explicit sort is needed.

## The Full Planning Pipeline

Zooming out, here is how all the pieces connect inside PostgreSQL's [`planner()`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/plan/planner.c):

```
  planner()
    |
    v
  standard_planner()
    |
    v
  subquery_planner()                    -- preprocess the query
    |
    |-- flatten join aliases
    |-- pull up subqueries where possible
    |-- simplify constant expressions
    |-- expand inherited tables (partitioning)
    |
    v
  grouping_planner()                    -- plan upper-level operations
    |
    |-- query_planner()                 -- plan the FROM/WHERE part
    |     |
    |     |-- make_one_rel()            -- build join tree
    |     |     |
    |     |     |-- set_base_rel_sizes()      -- estimate row counts
    |     |     |-- set_base_rel_pathlists()  -- generate access paths
    |     |     |                              for each table
    |     |     |
    |     |     |-- join_search_one_level()   -- DP join enumeration
    |     |     |   (or geqo() if >= 12 tables)
    |     |     |
    |     |     +-- return best join path
    |     |
    |     +-- return cheapest path
    |
    |-- plan aggregation, grouping, HAVING
    |-- plan window functions
    |-- plan DISTINCT
    |-- plan ORDER BY, LIMIT
    |
    v
  create_plan()                         -- convert path -> executable plan
    |
    v
  PlannedStmt                           -- handed to executor
```

Each stage narrows the search space. By the time `create_plan()` runs, a single cheapest path has been selected, and it is translated into the concrete `Plan` node tree that the executor will run.

## Common Pitfalls and How to Debug Them

### 1. Stale Statistics

The most common cause of bad plans. If `ANALYZE` hasn't run recently, the optimizer's row estimates will be wrong, leading to poor join order and method choices.

```sql
-- Check when stats were last updated
SELECT relname, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'orders';

-- Force a statistics update
ANALYZE orders;
```

### 2. Misestimated Selectivity

Even with fresh statistics, the optimizer can misestimate selectivity for **correlated columns**. If customers in region "US" almost always have `status = 'active'`, but the optimizer treats these as independent:

```
  Estimated selectivity: P(region='US') × P(status='active')
                       = 0.3 × 0.9 = 0.27

  Actual selectivity:    0.29  (almost the same, lucky)

  But if the correlation is stronger:
  Estimated: 0.1 × 0.05 = 0.005  (1 in 200)
  Actual:    0.08                  (1 in 12.5)
  --> 16x underestimate --> optimizer picks wrong plan
```

PostgreSQL 10+ supports **multivariate statistics** (`CREATE STATISTICS`) to help with correlated columns.

### 3. Reading EXPLAIN ANALYZE

`EXPLAIN` shows estimates. `EXPLAIN ANALYZE` actually **runs** the query and shows real numbers:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...
```

```
 Hash Join  (cost=1245..8923 rows=120088 width=48)
            (actual time=12.3..89.5 rows=115000 loops=1)
   Buffers: shared hit=4523 read=1200
   ...
```

Compare `rows=120088` (estimated) with `rows=115000` (actual). If these diverge by 10x or more, the optimizer is working with bad information. Run `ANALYZE` or create extended statistics.

### 4. Forcing Plan Choices (Last Resort)

When the optimizer consistently picks a bad plan, you can hint at better behavior:

```sql
-- Disable hash join to force nested loop or merge join
SET enable_hashjoin = off;

-- Disable sequential scan to force index usage
SET enable_seqscan = off;

-- These are session-level and should be used sparingly
```

These are blunt instruments. Prefer fixing the root cause (statistics, indexes, query rewriting) over disabling plan choices.

## How Other Databases Compare

The core ideas are universal, but implementations differ:

```
  Database       Join Ordering       Cost Model          Unique Feature
  -----------    -----------------   -----------------   --------------------
  PostgreSQL     DP + GEQO (12+)     I/O + CPU costs     Genetic algorithm
                                                          fallback

  MySQL/InnoDB   Greedy heuristic    I/O-centric          Simpler optimizer,
                 (limited DP)         (older versions)    improving since 8.0

  TiDB           DP + greedy         Adapted from         Distributed cost
                 heuristic            statistics           model (network I/O)

  CockroachDB    DP (Cascades        Unified cost         Memo-based search
                 framework)           model                (top-down)

  Oracle         DP + heuristics     CPU + I/O +          Adaptive plans
                                      network              (change mid-execution)
```

PostgreSQL and CockroachDB do exhaustive search for small queries. MySQL has historically used a simpler greedy approach, though recent versions added more sophisticated optimization. TiDB, being distributed, adds network transfer cost to the model — shipping data between TiKV nodes is expensive, so the optimizer considers data locality.

## References

1. Access Path Selection in a Relational Database Management System (Selinger et al., 1979) — the System R paper that introduced cost-based optimization [paper](https://courses.cs.duke.edu/compsci516/cps216/spring03/papers/selinger-etal-1979.pdf)
2. PostgreSQL optimizer source: planner.c [`src/backend/optimizer/plan/planner.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/plan/planner.c)
3. PostgreSQL cost model: costsize.c [`src/backend/optimizer/path/costsize.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/costsize.c)
4. PostgreSQL path generation: allpaths.c [`src/backend/optimizer/path/allpaths.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/allpaths.c)
5. PostgreSQL join enumeration: joinrels.c [`src/backend/optimizer/path/joinrels.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/joinrels.c)
6. PostgreSQL genetic optimizer: geqo_main.c [`src/backend/optimizer/geqo/geqo_main.c`](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/geqo/geqo_main.c)
7. PostgreSQL EXPLAIN documentation [doc](https://www.postgresql.org/docs/current/using-explain.html)
8. PostgreSQL multivariate statistics [doc](https://www.postgresql.org/docs/current/multivariate-statistics-examples.html)
9. How the PostgreSQL Query Optimizer Works — Bruce Momjian [presentation](https://momjian.us/main/writings/pgsql/optimizer.pdf)
