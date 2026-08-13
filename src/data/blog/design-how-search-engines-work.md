---
author: JZ
pubDatetime: 2026-08-13T10:00:00Z
modDatetime: 2026-08-13T10:00:00Z
title: System Design - How Search Engines Work (Inverted Indexes and Ranking)
tags:
  - design-system
  - design-search
description:
  "How search engines work: inverted indexes, TF-IDF/BM25 scoring, query processing with skip pointers, distributed scatter-gather, and how Lucene organizes segments for near-real-time search."
---

## Table of contents

## Context

Imagine you have 10 million documents and a user types "distributed consensus algorithm". A naive approach — scanning every document for those words — is O(N) in the number of documents. At 10 million docs averaging 1 KB each, that's 10 GB of text to scan per query. Even at memory speeds, that takes seconds. At web scale (billions of pages), it's completely impossible.

Search engines solve this with an **inverted index** — a data structure that maps every word to the list of documents containing it. Instead of scanning all documents for your query terms, you look up each term and intersect the results. This turns a linear scan into a near-constant-time lookup per term.

```
  Naive Search (grep-style)          Inverted Index Lookup
  ========================          =====================

  Query: "consensus"                Query: "consensus"

  Doc 1: scan all words... no            "consensus" --> [3, 7, 42, 99, 1001]
  Doc 2: scan all words... no                           ^
  Doc 3: scan all words... YES!          jump directly to posting list
  Doc 4: scan all words... no            O(1) dictionary lookup +
  ...                                    O(k) results, k << N
  Doc N: scan all words... maybe

  Time: O(N * avg_doc_length)       Time: O(1) lookup + O(k) postings
```

Every major search system — Google, Elasticsearch, Apache Solr, Meilisearch, Typesense — is built on inverted indexes. Understanding how they work is fundamental to system design interviews and to building any application that needs full-text search.

## The Inverted Index

An inverted index "inverts" the relationship between documents and terms. Instead of storing "Document 3 contains words [the, raft, consensus, algorithm, ...]", it stores "consensus appears in documents [3, 7, 42, 99, 1001]".

### Structure

The index has two main components:

1. **Term Dictionary** — a sorted mapping from every unique term to its posting list location
2. **Posting Lists** — for each term, an ordered list of document IDs (and optionally positions, frequencies, and payloads)

```
  Term Dictionary                    Posting Lists
  ===============                    =============

  "algorithm"  --> [offset_A] -----> DocIDs: [3, 7, 15, 42, 200, 1001]
  "consensus"  --> [offset_B] -----> DocIDs: [3, 7, 42, 99, 1001]
  "distributed"--> [offset_C] -----> DocIDs: [3, 5, 7, 10, 42, 50, 88, 1001]
  "paxos"      --> [offset_D] -----> DocIDs: [7, 42, 300]
  "raft"       --> [offset_E] -----> DocIDs: [3, 42, 99, 500, 1001]
  ...

  Each posting can also store:
  - Term frequency (tf): how many times the term appears in that doc
  - Positions: [3, 7, 42] means word positions 3, 7, and 42
  - Offsets: character start/end for highlighting
```

### How It's Built: The Indexing Pipeline

Building an inverted index involves three stages: **tokenization**, **normalization**, and **index construction**.

**Step 1: Tokenization** — Split raw text into tokens (words).

```
  Input:  "The Raft Consensus Algorithm (2014)"
  Tokens: ["The", "Raft", "Consensus", "Algorithm", "(2014)"]
```

**Step 2: Normalization** — Transform tokens into standard forms.

```
  Lowercasing:     "The" -> "the", "Raft" -> "raft"
  Punctuation:     "(2014)" -> "2014"
  Stop-word removal: "the" -> (removed)
  Stemming:        "algorithms" -> "algorithm", "running" -> "run"

  Final terms:     ["raft", "consensus", "algorithm", "2014"]
```

**Step 3: Index Construction** — For each document, add its terms to the posting lists.

```python
# Simplified indexing logic (conceptual)
# Real implementation: Lucene's DocumentsWriter
# https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/index/DocumentsWriter.java

inverted_index = defaultdict(list)  # term -> posting list

for doc_id, document in enumerate(corpus):
    terms = tokenize_and_normalize(document)
    for position, term in enumerate(terms):
        inverted_index[term].append(Posting(doc_id, position))
```

### Storage on Disk: FST and Compressed Postings

In memory, a hash map works fine. On disk, search engines use specialized structures:

**Term Dictionary: Finite State Transducer (FST)**

Lucene stores its term dictionary as an FST — a compact automaton that maps term bytes to metadata (like the offset of the posting list on disk). An FST is similar to a trie but shares both prefixes AND suffixes, making it extremely memory-efficient.

```
  Trie (shares prefixes)           FST (shares prefixes AND suffixes)

       root                              root
      / | \                             / | \
     c  r   p                          c  r   p
     |  |   |                          |  |   |
     o  a   a                          o  a   a
     |  |   |                          |  |   |
     n  f   x                          n  f   x
     |  |   |                          |  |    \
     s  t   o                          s  t     o
     |       |                          \  |   /
     e       s                           shared-suffix: "s"
     |
     n
     |
     s       "raft"                  Much less memory for large
     |       "paxos"                 term dictionaries (millions of terms)
     u
     s       "consensus"
```

Lucene's FST implementation:
[`org.apache.lucene.util.fst`](https://github.com/apache/lucene/tree/main/lucene/core/src/java/org/apache/lucene/util/fst)

**Posting List Compression**

Posting lists are sorted arrays of document IDs. Instead of storing raw IDs, Lucene stores **gaps** (delta encoding) and compresses them:

```
  Raw DocIDs:     [3, 7, 42, 99, 1001]
  Delta-encoded:  [3, 4, 35, 57, 902]   (differences between consecutive IDs)
  VByte-encoded:  each gap fits in fewer bytes since most gaps are small

  Compression techniques:
  - Variable-byte (VByte) encoding: small numbers use 1 byte, large use more
  - PFOR (Patched Frame of Reference): block-based, SIMD-friendly
  - Roaring Bitmaps: for very dense posting lists
```

Lucene uses a format called `FOR` (Frame of Reference) with patching, implemented in:
[`org.apache.lucene.codecs.lucene101.ForUtil`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/codecs/lucene101/ForUtil.java)

## Scoring: TF-IDF and BM25

Finding documents that contain query terms is only half the problem. You need to **rank** them — the most relevant documents should appear first. This is where scoring functions come in.

### TF-IDF: The Foundation

**TF-IDF** (Term Frequency - Inverse Document Frequency) captures two intuitions:

1. **Term Frequency (TF)**: A document mentioning "consensus" 10 times is probably more relevant to a query about consensus than one mentioning it once.
2. **Inverse Document Frequency (IDF)**: A term appearing in almost every document (like "the") is less informative than a rare term (like "consensus").

```
  TF-IDF(term, document) = TF(term, doc) * IDF(term)

  where:
    TF(t, d)  = number of times term t appears in document d
    IDF(t)    = log(N / df(t))
    N         = total number of documents in the collection
    df(t)     = number of documents containing term t

  Example:
    N = 10,000,000 documents
    "the" appears in 9,500,000 docs  -> IDF = log(10M/9.5M) = 0.02  (useless)
    "consensus" appears in 5,000 docs -> IDF = log(10M/5000) = 7.6   (valuable)
```

### BM25: The Industry Standard

**BM25** (Best Matching 25) is an improvement over TF-IDF used by virtually every modern search engine, including Elasticsearch, Solr, and Lucene (default since Lucene 6.0). It addresses TF-IDF's main flaw: unbounded term frequency. In TF-IDF, a document mentioning "consensus" 100 times scores 10x higher than one mentioning it 10 times. BM25 applies **saturation** — after a certain point, more occurrences barely increase the score.

```
  BM25 formula:

  score(D, Q) = SUM over each term t in Q:
                  IDF(t) * ( tf(t,D) * (k1 + 1) )
                           ---------------------------
                           tf(t,D) + k1 * (1 - b + b * |D|/avgdl)

  Variables:
  ----------
  D         = document being scored
  Q         = query (set of terms)
  tf(t,D)   = frequency of term t in document D
  |D|       = length of document D (in words)
  avgdl     = average document length in the collection
  k1        = term frequency saturation parameter (typically 1.2)
  b         = length normalization parameter (typically 0.75)
  IDF(t)    = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
```

**Intuition for each component:**

```
  1. IDF(t): Rare terms matter more. Same as TF-IDF.

  2. tf saturation:
     As tf grows:        tf * (k1+1)            converges to (k1+1)
                     -------------------
                     tf + k1*(...)

     tf=1:  score ~ 1.0 * (k1+1) / (1 + k1*(...))   = meaningful boost
     tf=10: score ~ 10 * 2.2 / (10 + 1.2*(...))     = diminishing returns
     tf=100: barely higher than tf=10                 = saturated

     Score
      ^
      |          ..........(saturates)
      |       ...
      |     ..
      |   ..
      |  .
      | .
      |.________________________> term frequency
            k1 controls how fast saturation happens

  3. Length normalization (b parameter):
     A 50-word abstract mentioning "consensus" 3 times is probably more
     relevant than a 10,000-word paper mentioning it 3 times.

     b=0: no length normalization
     b=1: full normalization (score scales inversely with doc length)
     b=0.75: default — partial normalization
```

Lucene's BM25 implementation:
[`BM25Similarity.java`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/search/similarities/BM25Similarity.java)

```java
// From Lucene's BM25Similarity.java (simplified)
// https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/search/similarities/BM25Similarity.java

@Override
public float score(int doc, float freq) throws IOException {
  float tf = (float) (freq / (freq + k1 * (1 - b + b * docLen / avgDocLen)));
  return boost * idf * tf;
}
```

## Query Processing

When a user searches for "distributed consensus algorithm", the search engine must:
1. Look up each term's posting list
2. Combine them (intersection for AND, union for OR)
3. Score matching documents
4. Return the top-K results

### DAAT vs TAAT

Two fundamental strategies exist for processing multi-term queries:

```
  TAAT (Term-At-A-Time)               DAAT (Document-At-A-Time)
  ========================            ==========================

  Process one term completely,        Process one document at a time,
  accumulate partial scores:          scoring all terms together:

  Step 1: "distributed"              Doc 3:  score("distributed", 3)
    doc3 += 2.1                             + score("consensus", 3)
    doc5 += 2.1                             + score("algorithm", 3)
    doc7 += 2.1                             = 7.5  (add to top-K heap)
    ...
                                     Doc 5:  score("distributed", 5)
  Step 2: "consensus"                       + score("algorithm", 5)
    doc3 += 3.4                             = 4.2  (add to top-K heap)
    doc7 += 3.4
    doc42 += 3.4                     Doc 7:  score("distributed", 7)
    ...                                     + score("consensus", 7)
                                            + score("algorithm", 7)
  Step 3: "algorithm"                       = 8.1  (add to top-K heap)
    doc3 += 2.0
    ...                              Advantage: can skip docs early,
                                     memory-efficient (no accumulators
  Needs N accumulators in memory     for all docs), better for AND queries
```

Modern search engines (including Lucene) use **DAAT** because it allows early termination and uses less memory.

### Skip Pointers for Fast Intersection

For an AND query, we need to intersect posting lists. Naive intersection of two sorted lists takes O(m + n). Skip pointers accelerate this by allowing jumps over irrelevant sections:

```
  Posting list for "distributed" (with skip pointers every 4 docs):
  [3, 5, 7, 10, | 42, 50, 88, 100, | 200, 350, 400, 500, | ...]
   ^skip=42        ^skip=200           ^skip=600

  Posting list for "consensus":
  [3, 7, 42, 99, 1001, ...]

  Intersection algorithm:
  - Current position in "distributed": 3, "consensus": 3  -> MATCH (3)
  - Advance both: "distributed": 5, "consensus": 7
  - 5 < 7, advance "distributed": 7, "consensus": 7      -> MATCH (7)
  - Advance both: "distributed": 10, "consensus": 42
  - 10 < 42, can we skip? skip pointer says next block starts at 42.
    Jump! "distributed": 42, "consensus": 42              -> MATCH (42)
  - Skipped docs [10, 50, 88, 100] without reading them!
```

Lucene's skip list implementation for posting lists:
[`Lucene101SkipReader.java`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/codecs/lucene101/Lucene101SkipReader.java)

### Top-K with Priority Queues

You usually don't need all matching documents — just the top 10 or 20. A **min-heap** (priority queue) of size K efficiently tracks the best results:

```
  Processing documents in DAAT order:

  Min-heap (K=3):         Action:
  []                      Doc 3: score=7.5, heap not full -> push
  [7.5]                   Doc 5: score=4.2, heap not full -> push
  [4.2, 7.5]             Doc 7: score=8.1, heap not full -> push
  [4.2, 7.5, 8.1]        Doc 42: score=9.0 > min(4.2) -> replace min
  [7.5, 8.1, 9.0]        Doc 99: score=3.1 < min(7.5) -> skip
  [7.5, 8.1, 9.0]        Doc 200: score=7.8 > min(7.5) -> replace min
  [7.8, 8.1, 9.0]        ...

  Final top-3: [9.0, 8.1, 7.8]

  With WAND (Weak AND) optimization:
  - Track threshold = min score in heap (7.5 after heap is full)
  - Skip documents whose max possible score < threshold
  - Dramatically reduces docs that need full scoring
```

Lucene's `MaxScoreBulkScorer` uses the Block-Max WAND algorithm to skip entire blocks of postings that cannot possibly enter the top-K:
[`MaxScoreBulkScorer.java`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/search/MaxScoreBulkScorer.java)

## Distributed Search

A single machine can index maybe 10-50 million documents with acceptable latency. For billions of documents, you need to distribute the index across many machines using a **scatter-gather** (also called fan-out) pattern.

### The Scatter-Gather Pattern

```
        User Query: "distributed consensus"
                    |
                    v
          +------------------+
          |   Coordinator    |   (also called "broker" or "router")
          +------------------+
           /    |    |    \         SCATTER phase:
          /     |    |     \        send query to all shards
         v      v    v      v
  +------+ +------+ +------+ +------+
  |Shard1| |Shard2| |Shard3| |Shard4|    each shard searches its
  | 0-2M | | 2-4M | | 4-6M | | 6-8M |    local inverted index
  +------+ +------+ +------+ +------+
         \     |    |     /
          \    |    |    /         GATHER phase:
           \   |    |   /          collect top-K from each shard
            v  v    v  v
          +------------------+
          |   Coordinator    |   merge K results from S shards
          |   (merge sort)   |   into global top-K
          +------------------+
                    |
                    v
          Top-K results to user
```

### Sharding Strategies

**Document-based sharding** (most common): Each shard holds a subset of documents and has a complete inverted index for those documents.

```
  Document-based sharding:

  Shard 1: docs [0..2M]     -> full inverted index for these docs
  Shard 2: docs [2M..4M]    -> full inverted index for these docs
  Shard 3: docs [4M..6M]    -> full inverted index for these docs

  Query goes to ALL shards (every shard might have relevant docs)
  Each shard returns its local top-K
  Coordinator merges S*K candidates into global top-K

  Pros: balanced load, easy to add shards, one shard failure = partial results
  Cons: every query hits every shard (fan-out), scoring needs collection-wide stats
```

**Term-based sharding** (rare in practice): Each shard holds posting lists for a subset of terms.

```
  Term-based sharding:

  Shard 1: terms [a-f]  -> all posting lists for terms starting with a-f
  Shard 2: terms [g-m]  -> all posting lists for terms starting with g-m
  Shard 3: terms [n-z]  -> all posting lists for terms starting with n-z

  Query "distributed consensus":
    "distributed" -> Shard 1
    "consensus"   -> Shard 1
    Intersection happens on Shard 1 (lucky: same shard)

  But "machine learning":
    "machine"  -> Shard 2
    "learning" -> Shard 2 (lucky again)

  "raft consensus":
    "raft"      -> Shard 3
    "consensus" -> Shard 1
    Must transfer posting lists between shards for intersection!

  Pros: some queries only hit 1 shard
  Cons: unbalanced (common terms = hot shards), multi-term queries
        often need cross-shard posting list transfer
```

### Merge and Coordination

The coordinator must solve several challenges:

1. **Global scoring**: BM25 needs collection-wide statistics (N, avgdl, df). Each shard computes local approximations, or stats are pre-distributed.
2. **Merge-sort of results**: Merge S sorted lists of size K into a single top-K. This is O(S*K * log S) using a heap.
3. **Pagination**: For page 2 (results 11-20), each shard must return top-20, not top-10.

Elasticsearch's distributed search implementation uses a two-phase approach:
- **Query phase**: Each shard returns only doc IDs + scores (lightweight)
- **Fetch phase**: Coordinator asks specific shards to return full documents for the final top-K

```
  Phase 1: QUERY                    Phase 2: FETCH
  ============                      ============

  Coordinator -> all shards:        Coordinator -> specific shards:
    "give me top-10 IDs+scores"       "give me full docs for these IDs"

  Shard 1: [(doc42, 9.1),           Shard 1: {doc42: "full text..."}
            (doc18, 8.5), ...]       Shard 3: {doc5M+3: "full text..."}
  Shard 2: [(doc2M+7, 8.9), ...]
  Shard 3: [(doc5M+3, 9.5), ...]    Only fetch docs that made the
                                     global top-K (saves bandwidth)
  Merge into global top-10
```

## Real-World: How Lucene Organizes Segments

Apache Lucene (the library powering Elasticsearch and Solr) doesn't maintain a single monolithic inverted index. Instead, it uses a **segmented architecture** that enables near-real-time search while maintaining high write throughput.

### Segments Are Mini-Indexes

Each segment is a complete, **immutable** inverted index. New documents are buffered in memory, then flushed to disk as a new segment.

```
  Write path:

  New docs arrive
       |
       v
  +------------------+
  | In-Memory Buffer |  (DocumentsWriter)
  | (RAM, mutable)   |
  +------------------+
       |  flush (when buffer full or refresh called)
       v
  +---------+  +---------+  +---------+  +---------+
  |  Seg 0  |  |  Seg 1  |  |  Seg 2  |  |  Seg 3  |  <- immutable on disk
  | 500 docs|  | 500 docs|  | 2K docs |  | 10K docs|
  +---------+  +---------+  +---------+  +---------+

  Each segment contains:
  - Its own term dictionary (FST)
  - Its own posting lists
  - Stored fields (original document content)
  - Doc values (columnar data for sorting/aggregation)
  - Norms (document length factors for BM25)
```

### Search Across Segments

A search query hits **every segment** and merges results:

```
  Query: "consensus"
       |
       +---> Seg 0: posting list [3, 7]
       +---> Seg 1: posting list [42, 99]
       +---> Seg 2: posting list [200, 350, 400]
       +---> Seg 3: posting list [1001, 5000, 5002, 8000]
       |
       v
  Merge results: [3, 7, 42, 99, 200, 350, 400, 1001, 5000, 5002, 8000]
  Score and return top-K
```

### Merge Policy

Too many small segments hurt search performance (more segments = more seeking). Lucene periodically merges segments using a **tiered merge policy**:

```
  Before merge:                     After merge:
  [Seg0: 500] [Seg1: 500]          [Seg0_1: 1000]
  [Seg2: 2K]  [Seg3: 2K]           [Seg2_3: 4K]
  [Seg4: 10K]                       [Seg4: 10K]

  Tiered merge policy:
  - Group segments of similar size
  - Merge groups that exceed a threshold count
  - Never merge segments above max_merge_size (e.g., 5 GB)
  - Background thread handles merging without blocking searches
```

Lucene's tiered merge policy:
[`TieredMergePolicy.java`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/index/TieredMergePolicy.java)

### Near-Real-Time (NRT) Search

Lucene supports **near-real-time** search by "refreshing" — making newly flushed segments visible to readers without a full commit:

```
  Timeline:
  =========
  t=0s: Doc A indexed (in memory buffer)
  t=0s: Search for A -> NOT FOUND (not yet visible)
  t=1s: Refresh! Buffer flushed to new segment, new reader opened
  t=1s: Search for A -> FOUND (segment now searchable)
  t=30s: Commit! Segment metadata written to disk (durable)

  refresh interval (default 1s in Elasticsearch)
  = time between indexing a doc and it being searchable
  != commit interval (durability, can be less frequent)
```

### Deletes: Tombstones and LiveDocs

Since segments are immutable, deletes are handled with a **liveDocs** bitset:

```
  Segment 2 (2000 docs):

  Posting list for "consensus": [200, 350, 400, 800, 1200]

  LiveDocs bitset: [1,1,1,...,0,...,1,...,0,...,1,1]
                                ^         ^
                            doc 350    doc 800
                            (deleted)  (deleted)

  Search "consensus" in Seg 2:
    Raw matches: [200, 350, 400, 800, 1200]
    After liveDocs filter: [200, 400, 1200]  (skip deleted docs)

  Updates = delete old version + insert new version (in new segment)

  Deleted docs are physically removed during segment merges:
    Merge(Seg2 + Seg3) -> new segment without deleted docs
```

Lucene's liveDocs implementation:
[`Lucene101LiveDocsFormat.java`](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/codecs/lucene101/Lucene101LiveDocsFormat.java)

## References

1. C. D. Manning, P. Raghavan, H. Schutze, "Introduction to Information Retrieval" (2008) — the standard textbook for IR [free online](https://nlp.stanford.edu/IR-book/)
2. S. Robertson, H. Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond" (2009) [paper](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)
3. Apache Lucene source code [GitHub](https://github.com/apache/lucene)
4. Lucene's `BM25Similarity.java` [source](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/search/similarities/BM25Similarity.java)
5. Lucene's FST package [source](https://github.com/apache/lucene/tree/main/lucene/core/src/java/org/apache/lucene/util/fst)
6. Lucene's `TieredMergePolicy.java` [source](https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/index/TieredMergePolicy.java)
7. Elasticsearch "Distributed Search" documentation [doc](https://www.elastic.co/guide/en/elasticsearch/reference/current/search-your-data.html)
8. Stefan Buttcher, Charles Clarke, Gordon Cormack, "Information Retrieval: Implementing and Evaluating Search Engines" (2010) — covers postings compression and query processing
9. Jimmy Lin, "The Role of BM25 in Text Retrieval" [slides](https://cs.uwaterloo.ca/~jimmylin/publications/Lin_etal_SIGIR2021.pdf)
