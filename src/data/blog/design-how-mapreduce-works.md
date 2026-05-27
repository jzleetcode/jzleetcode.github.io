---
author: JZ
pubDatetime: 2026-05-27T06:23:00Z
modDatetime: 2026-05-27T06:23:00Z
title: System Design - How MapReduce Works
tags:
  - design-system
  - design-concurrency
description:
  "How Google's MapReduce programming model works: the map and reduce phases, data shuffling, fault tolerance, locality optimization, and a walkthrough of the execution model with real code examples."
---

## Table of contents

## Context

It's 2003 at Google. The web index is growing exponentially. Engineers keep writing the same pattern: read a mountain of input data, extract something interesting from each piece (parsing URLs, counting words, building inverted indexes), then aggregate the results. Each program is different in the details, but the structure is always the same — and each one needs to handle parallelization, fault tolerance, data distribution, and load balancing.

Jeff Dean and Sanjay Ghemawat noticed this pattern and asked: "What if we hide all the distributed systems complexity behind a simple interface that only requires the programmer to write two functions?" The result was **MapReduce**, published at OSDI 2004. It became the foundation for an entire era of large-scale data processing.

```
  The MapReduce Idea

  Input Data             Map              Shuffle            Reduce           Output
  (chunks)           (extract)         (group by key)     (aggregate)

  +--------+         +--------+                           +--------+
  | chunk1 | ------> | map()  |---+                   +-->| reduce |---> output1
  +--------+         +--------+   |   +----------+    |   +--------+
                                  +-->| sort &   |----+
  +--------+         +--------+   |   | group    |    |   +--------+
  | chunk2 | ------> | map()  |---+   | by key   |----+-->| reduce |---> output2
  +--------+         +--------+   |   +----------+    |   +--------+
                                  |                    |
  +--------+         +--------+   |                    |   +--------+
  | chunk3 | ------> | map()  |---+                    +-->| reduce |---> output3
  +--------+         +--------+                            +--------+
```

The programmer writes just two functions:
- **Map**: takes one input record and emits zero or more (key, value) pairs
- **Reduce**: takes a key and all values associated with that key, then combines them into a final result

The framework handles everything else: splitting input, scheduling work across thousands of machines, handling failures, and sorting intermediate data.

## A Concrete Example: Word Count

The "hello world" of MapReduce. Given millions of documents, count how many times each word appears.

```python
def map(document_name, document_content):
    """Called once per input document."""
    for word in document_content.split():
        emit(word, 1)

def reduce(word, counts):
    """Called once per unique word, with all its counts."""
    emit(word, sum(counts))
```

Here's what happens with three documents:

```
  Input Documents:
    doc1: "the cat sat"
    doc2: "the cat"
    doc3: "sat"

  === MAP PHASE ===

  Worker 1 (doc1):  emit("the", 1)  emit("cat", 1)  emit("sat", 1)
  Worker 2 (doc2):  emit("the", 1)  emit("cat", 1)
  Worker 3 (doc3):  emit("sat", 1)

  === SHUFFLE PHASE ===

  "cat" --> [1, 1]
  "sat" --> [1, 1]
  "the" --> [1, 1]

  === REDUCE PHASE ===

  Reducer A ("cat", [1, 1]) --> emit("cat", 2)
  Reducer B ("sat", [1, 1]) --> emit("sat", 2)
  Reducer C ("the", [1, 1]) --> emit("the", 2)

  Output: {"cat": 2, "sat": 2, "the": 2}
```

The programmer never thinks about how data is distributed across machines. They just define what to extract (map) and how to combine (reduce).

## Execution Model

Google's MapReduce runs on a cluster of commodity machines. Let's trace through a full execution:

```
                          +------------------+
                          |     Master       |
                          | (coordinator)    |
                          +--------+---------+
                                   |
                  assigns map      |     assigns reduce
                  and reduce       |     tasks
                  tasks            |
         +------------+----+-------+------+----------+
         |            |         |         |          |
         v            v         v         v          v
  +-----------+ +-----------+  ...  +-----------+ +-----------+
  | Worker 1  | | Worker 2  |       | Worker R1 | | Worker R2 |
  | (map)     | | (map)     |       | (reduce)  | | (reduce)  |
  +-----------+ +-----------+       +-----------+ +-----------+
       |              |                   ^            ^
       v              v                   |            |
  +--------+    +--------+         (read intermediate files
  | local  |    | local  |          from map workers' disks)
  | disk   |    | disk   |
  +--------+    +--------+
```

### Step by Step

1. **Input splitting**: The framework splits the input into M pieces (typically 16-64 MB each, matching the GFS block size). This creates M map tasks.

2. **Task assignment**: The master picks idle workers and assigns each one a map or reduce task.

3. **Map execution**: A map worker reads its input split, parses (key, value) pairs from the raw data, passes each to the user's Map function, and buffers the output in memory.

4. **Partitioning and local write**: Periodically, the buffered map output is partitioned into R regions (one per reduce task) using a partitioning function (default: `hash(key) mod R`). These are written to the map worker's **local disk**. The locations are reported back to the master.

5. **Shuffle**: When a reduce worker is ready, the master tells it where to find its partition files. The reduce worker reads its partition from every map worker's local disk via RPC.

6. **Sort**: The reduce worker sorts all intermediate (key, value) pairs by key. This groups all values for the same key together.

7. **Reduce execution**: The reduce worker iterates over the sorted data. For each unique key, it passes the key and its list of values to the user's Reduce function. The output is appended to a final output file on the distributed file system (GFS).

8. **Completion**: When all map and reduce tasks finish, the master wakes up the user program. The output is available in R output files.

### Why Local Disk for Intermediate Data?

Map output goes to **local disk**, not the distributed file system. This is deliberate:

```
  Why intermediate data is stored locally:

  GFS write:  data --> local disk --> 2 replicas over network
              (3x bandwidth cost, 3x disk I/O)

  Local write: data --> local disk only
               (1x bandwidth, 1x disk I/O)

  Intermediate data is TEMPORARY. If a worker fails, the master
  just re-executes the map task. No need to replicate.
```

The trade-off: if a map worker dies after producing output but before reduce workers read it, the map task must be re-executed. But this is rare and cheap compared to always tripling the I/O.

## The Partitioning Function

The partition function determines which reduce worker gets which keys:

```
  Partition function: hash(key) mod R

  Example with R=3 reducers:

  hash("apple") mod 3 = 0  --> Reducer 0
  hash("banana") mod 3 = 1 --> Reducer 1
  hash("cherry") mod 3 = 0 --> Reducer 0
  hash("date") mod 3 = 2   --> Reducer 2

  +----------+      +----------+      +----------+
  | Reducer 0|      | Reducer 1|      | Reducer 2|
  | apple    |      | banana   |      | date     |
  | cherry   |      |          |      |          |
  +----------+      +----------+      +----------+
```

Users can supply a custom partition function. For example, if the keys are URLs, you might partition by hostname (`hash(hostname(url)) mod R`) so that all URLs from the same site end up at the same reducer — useful for building per-site statistics.

## Fault Tolerance

MapReduce runs on thousands of commodity machines. Failures are not exceptional — they're routine. The paper reports that in one large job, 1,600 out of 1,800 machines were killed partway through, and the job still completed.

### Worker Failure

The master pings every worker periodically. If a worker doesn't respond:

```
  Worker Failure Handling

  Master                Worker A (map, died)         Worker B (idle)
    |                        |                           |
    | ping                   |                           |
    |-----X (no response)--->|                           |
    | ping                   |                           |
    |-----X (no response)--->|                           |
    |                        |                           |
    | (mark worker A as failed)                          |
    |                                                    |
    | re-assign A's map tasks to B                       |
    |--------------------------------------------------->|
    |                                                    |
    |                                    Worker B re-executes
    |                                    map task from scratch
    |                                    (reads input from GFS)
```

**Map tasks** from a failed worker must always be re-executed, even if they completed — because their output was on the failed worker's local disk, which is now inaccessible.

**Reduce tasks** that completed do NOT need re-execution — their output was written to the distributed file system (GFS) and is safely replicated.

### Master Failure

The original Google MapReduce took the simple approach: if the master dies, the entire job aborts and the client must retry. Since there's only one master and it's rare for a single machine to fail in the short time it takes to run a job, this was pragmatic. (Later systems like Hadoop improved on this.)

### Semantics Under Failure

With deterministic map and reduce functions, MapReduce guarantees that the output is **identical** to what a sequential execution would produce — even in the presence of failures. This is achieved through atomic commits:

- Map workers write output to temporary files, then atomically rename them upon completion
- Reduce workers write to a temporary file, then atomically rename it to the final output name
- If a task is re-executed, its output overwrites any partial output from a previous attempt

## Data Locality

Moving computation to data is far cheaper than moving data to computation. On a cluster with thousands of machines, network bandwidth is a shared bottleneck.

```
  Without locality:
  +--------+                              +--------+
  | GFS    | ======= 64 MB ============> | Worker |
  | chunk  |  (network transfer)          |        |
  | server |                              |        |
  +--------+                              +--------+
  Cost: saturates network, slow

  With locality:
  +--------+--------+
  | GFS    | Worker |  (same machine!)
  | chunk  |        |
  | server |        |
  +--------+--------+
  Cost: local disk read only, fast
```

The master knows where each input chunk is stored (from GFS metadata). When scheduling a map task, it preferentially assigns it to a worker that has a **local copy** of the input data. If that machine is busy, it tries a nearby machine (same rack/switch). This optimization saves enormous network bandwidth — most map input is read locally.

## Combiner: Local Pre-Aggregation

Consider word count. If a document contains "the" 1,000 times, the map worker emits ("the", 1) one thousand times. All those pairs travel across the network to the reducer. Wasteful.

The **combiner** is an optional optimization: a reduce-like function that runs locally on the map worker's output before it's sent to reducers:

```
  Without combiner:
  Map worker output:  ("the", 1), ("the", 1), ("the", 1), ... x1000
  Network sends:      1000 pairs for key "the"

  With combiner (sum):
  Map worker output:  ("the", 1), ("the", 1), ("the", 1), ... x1000
  After combiner:     ("the", 1000)
  Network sends:      1 pair for key "the"
```

The combiner is typically the same function as the reducer (when the reduce function is commutative and associative). It dramatically reduces network traffic for operations like sum, count, max, and min.

## Handling Stragglers

In a large cluster, some machines are slower than others (bad disks, competing workloads, hardware issues). A single slow map task can delay the entire job.

MapReduce uses **backup tasks**: when the job is close to completion, the master launches duplicate executions of the remaining in-progress tasks. Whichever copy finishes first "wins" — the other is killed.

```
  Backup Task Execution

  Time ------------------------------------------------->

  Task X (slow worker):  [============================.........
                                                       still running

  Task X (backup, fast): .........[==========]
                                              ^
                                              done first!

  Master: "Task X complete (backup won). Kill original."
```

Google's paper reports that disabling backup tasks increased job completion time by 44%. Stragglers are a real problem.

## Beyond Word Count: Real Applications

The paper describes several applications that ran at Google:

### Distributed Grep

```python
def map(filename, content):
    for line in content.split('\n'):
        if re.search(pattern, line):
            emit(line, "")

def reduce(line, _):
    emit(line, "")
```

### Inverted Index (Web Search)

```python
def map(doc_id, content):
    """Emit each word mapped to the document it appears in."""
    for word in parse_words(content):
        emit(word, doc_id)

def reduce(word, doc_ids):
    """Produce a sorted posting list for each word."""
    emit(word, sorted(set(doc_ids)))
```

This is literally how Google built its search index. Each reduce output is a posting list — given a word, here are all the documents containing it.

### URL Access Frequency

```python
def map(log_entry_key, log_entry):
    """Parse web server logs."""
    url = extract_url(log_entry)
    emit(url, 1)

def reduce(url, counts):
    emit(url, sum(counts))
```

### Reverse Web-Link Graph

```python
def map(source_url, page_content):
    """For each outgoing link, emit (target, source)."""
    for target_url in extract_links(page_content):
        emit(target_url, source_url)

def reduce(target_url, source_urls):
    """All pages that link to this target."""
    emit(target_url, list(source_urls))
```

## Performance: A Real Benchmark

The paper benchmarks on a cluster of 1,800 machines, each with:
- 2x 2GHz Xeon processors
- 4GB RAM
- Two 160GB IDE disks
- Gigabit Ethernet

**Grep job** (scan 10^10 100-byte records for a rare 3-character pattern):
- Input: 1 TB
- M = 15,000 map tasks (64MB splits)
- R = 1 reducer
- Completion time: ~150 seconds
- Peak throughput: ~30 GB/s input scanning rate

```
  Grep: 1TB scan, peak rate ~30 GB/s

  Rate (GB/s)
  30 |         ****
     |       **    **
  20 |     **        **
     |    *            **
  10 |  **               ***
     | *                    ****
   0 |*                         ********
     +----+----+----+----+----+----+-----> Time (sec)
     0   20   40   60   80  100  120  150
```

The ramp-up is from the startup overhead (assigning tasks, opening files). The tail is the last few stragglers finishing.

**Sort job** (sort 10^10 100-byte records):
- Input: 1 TB
- M = 15,000 map tasks
- R = 4,000 reducers
- Completion time: ~891 seconds (normal), ~1,283 seconds with 200 workers killed mid-job

## MapReduce's Legacy

MapReduce was eventually superseded at Google by systems like FlumeJava, Dremel, and internal successors. In the open-source world, Apache Hadoop implemented MapReduce, which then led to Apache Spark (in-memory, iterative computation), Apache Flink (streaming), and others.

The key insights that survived:

1. **Simple programming model**: Hide distributed complexity behind familiar functional primitives (map, reduce, filter)
2. **Move computation to data**: Don't ship terabytes across the network
3. **Assume failures are normal**: Re-execution as the primary recovery mechanism
4. **Horizontal scaling**: Add machines, not bigger machines

```
  Evolution of Large-Scale Data Processing

  2004: MapReduce (batch, disk-based, Google)
         |
  2006: Hadoop (open-source MapReduce)
         |
  2009: Spark (in-memory, iterative)
         |
  2011: Dremel/BigQuery (interactive SQL on huge data)
         |
  2014: Flink (stream processing, exactly-once)
         |
  2020+: Lakehouse architectures (Delta Lake, Iceberg)
```

## Limitations

MapReduce has well-known limitations that motivated its successors:

1. **Disk I/O between stages**: Every map-reduce step writes intermediate data to disk. Iterative algorithms (like PageRank, ML training) that chain many steps pay enormous I/O costs.

2. **Rigid two-phase model**: Many computations don't naturally fit into a single map-reduce step. Complex pipelines require chaining multiple MapReduce jobs, each materializing to disk.

3. **High latency**: Startup overhead, task scheduling, and disk I/O make MapReduce unsuitable for interactive or low-latency queries.

4. **No native iteration**: Algorithms that iterate (gradient descent, graph algorithms) must re-read and re-write the entire dataset each iteration.

Spark addressed most of these by keeping data in memory between stages (RDDs — Resilient Distributed Datasets) and supporting arbitrary DAGs of operations rather than just map-then-reduce.

## References

1. Dean, Jeffrey and Ghemawat, Sanjay. "MapReduce: Simplified Data Processing on Large Clusters." OSDI 2004. [Paper](https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/)
2. Ghemawat, Sanjay, Gobioff, Howard, and Leung, Shun-Tak. "The Google File System." SOSP 2003. [Paper](https://research.google/pubs/the-google-file-system/)
3. Apache Hadoop MapReduce. [Source](https://github.com/apache/hadoop/tree/trunk/hadoop-mapreduce-project)
4. Zaharia, Matei et al. "Resilient Distributed Datasets: A Fault-Tolerant Abstraction for In-Memory Cluster Computing." NSDI 2012. [Paper](https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf)
5. Dean, Jeffrey. "MapReduce: A Flexible Data Processing Tool." Communications of the ACM, 2010. [Article](https://dl.acm.org/doi/10.1145/1629175.1629198)
6. FlumeJava: Easy, Efficient Data-Parallel Pipelines. PLDI 2010. [Paper](https://research.google/pubs/flumejava-easy-efficient-data-parallel-pipelines/)
