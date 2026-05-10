---
author: JZ
pubDatetime: 2026-05-10T12:00:00Z
modDatetime: 2026-05-10T12:00:00Z
title: System Design - How Vector Databases Work
tags:
  - design-system
  - design-database
description:
  "How vector databases work: embedding vectors, similarity search, indexing with HNSW and IVF, distance metrics, quantization, and a look at how Milvus organizes its storage engine."
---

## Table of contents

## Context

Traditional databases are built around exact matching. You ask for `WHERE id = 42` or `WHERE name LIKE 'Alice%'` and the engine walks a B-tree or hash index to find the answer. But what if your question is "find me images that look like this photo" or "find documents that mean something similar to this sentence"? There is no column to match on — the similarity lives in the *meaning* of the data.

This is where **vector databases** come in. They store data as high-dimensional numerical vectors (arrays of floats) and answer a fundamentally different question: *which stored vectors are closest to this query vector?* This operation is called **approximate nearest neighbor (ANN) search**, and it is the backbone of recommendation systems, semantic search, retrieval-augmented generation (RAG) for LLMs, image search, and anomaly detection.

```
    Traditional Database                    Vector Database

    Query: WHERE id = 42                    Query: "cute puppy playing"
                                                     |
    +--------+                                       v
    | B-Tree | --> exact row              [ 0.12, -0.45, 0.78, ... ]  (embedding)
    +--------+                                       |
                                                     v
                                            +------------------+
                                            | ANN Index (HNSW) |
                                            +------------------+
                                                     |
                                              top-K nearest
                                              vectors returned
```

The key insight: machine learning models (called **embedding models**) convert raw data — text, images, audio — into fixed-length vectors where **similar items land near each other** in the vector space. The database's job is to find the nearest neighbors efficiently, even across billions of vectors.

## From Raw Data to Vectors: Embeddings

An **embedding** is a dense numerical representation of data. A sentence like "The cat sat on the mat" might become a 768-dimensional vector. Two sentences with similar meaning will have vectors that point in roughly the same direction.

```
   "The cat sat on the mat"
         |
         v
   Embedding Model (e.g., BERT, OpenAI text-embedding-3-small)
         |
         v
   [ 0.023, -0.117, 0.892, 0.045, ..., -0.331 ]   (768 floats)
```

Popular embedding dimensions range from 384 to 3072 floats. Each vector takes `d * 4` bytes in float32 — a 768-dimensional vector is about 3 KB. At 100 million vectors, that alone is ~300 GB of raw vector data, which is why efficient indexing matters so much.

## Distance Metrics: How "Close" Are Two Vectors?

Before we can search, we need to define what "close" means. The three most common distance metrics are:

**Euclidean distance (L2):** Straight-line distance between two points. Smaller is more similar.

$$d(a, b) = \sqrt{\sum_{i=1}^{n} (a_i - b_i)^2}$$

**Cosine similarity:** Measures the angle between two vectors, ignoring magnitude. A value of 1.0 means identical direction.

$$\text{cosine}(a, b) = \frac{a \cdot b}{\|a\| \cdot \|b\|}$$

**Inner product (dot product):** Like cosine similarity but sensitive to magnitude. Useful when vector length carries meaning (e.g., popularity).

$$\text{IP}(a, b) = \sum_{i=1}^{n} a_i \cdot b_i$$

```
         Cosine Similarity                    Euclidean Distance

           ^                                     ^
           |   /  A                               |   * A
           |  /                                   |
           | / ) theta                            |         * B
           |/________>                            |___________>

     measures angle                          measures straight-line
     between vectors                         distance between points
```

Most text-based applications use cosine similarity because embedding models are trained to encode meaning in the *direction* of the vector, not its length.

## The Brute-Force Baseline

The simplest approach is **flat search**: compare the query vector against every stored vector and return the top-K closest ones.

```python
import numpy as np

def brute_force_search(query, vectors, k=10):
    # vectors shape: (N, D), query shape: (D,)
    distances = np.linalg.norm(vectors - query, axis=1)  # L2 distance
    top_k_indices = np.argpartition(distances, k)[:k]
    return top_k_indices[np.argsort(distances[top_k_indices])]
```

This is `O(N * D)` for each query. At 1 billion vectors with 768 dimensions, a single query would require ~3 trillion floating-point operations. On a modern CPU doing ~50 GFLOPS, that is about 60 seconds per query — far too slow for production.

The solution: **approximate nearest neighbor (ANN) indexes** that trade a tiny amount of accuracy for orders-of-magnitude speedup.

## Index Type 1: IVF (Inverted File Index)

IVF partitions the vector space into clusters using k-means, then only searches the nearest clusters at query time.

**Build phase:** Run k-means on all vectors to create `nlist` centroids (typically 256–65536). Assign each vector to its nearest centroid.

**Search phase:** Compare the query to all centroids, pick the `nprobe` closest clusters, then do brute-force search only within those clusters.

```
    Building the IVF Index (k-means clustering)

    +-------------------------------------------------------+
    |                    Vector Space                        |
    |                                                        |
    |    Cluster 0          Cluster 1          Cluster 2     |
    |   +----------+      +----------+      +----------+    |
    |   | * * *    |      |  * *     |      | * * * *  |    |
    |   |  * C0 *  |      | * C1 *   |      |* C2  *   |    |
    |   | *  *  *  |      |  * * *   |      | * *  * * |    |
    |   +----------+      +----------+      +----------+    |
    |                                                        |
    |    Cluster 3          Cluster 4                        |
    |   +----------+      +----------+                      |
    |   | *  *  *  |      | * * *    |                      |
    |   | * C3  *  |      |  C4 * *  |                      |
    |   |  * *     |      |  *  *    |                      |
    |   +----------+      +----------+                      |
    +-------------------------------------------------------+

    Search: query Q arrives
      1. Compare Q to C0..C4       --> closest are C1, C2
      2. nprobe = 2, so scan only Cluster 1 and Cluster 2
      3. Return top-K from those clusters
```

The tradeoff: increasing `nprobe` improves recall (accuracy) but slows the search. With `nlist = 4096` and `nprobe = 64`, you scan only ~1.5% of the data while typically achieving 95%+ recall.

## Index Type 2: HNSW (Hierarchical Navigable Small World)

HNSW is the most popular ANN index in production vector databases. It builds a multi-layer graph where each vector is a node, and edges connect nearby vectors. The search works like a skip list: start from the top layer (sparse, long-range connections) and greedily walk toward the query, dropping to denser layers as you get closer.

```
    HNSW Multi-Layer Graph

    Layer 2 (sparse)      A -----------------------> F
                          |                           |
                          |                           |
    Layer 1 (medium)      A -------> C -------> F --> G
                          |          |          |     |
                          |          |          |     |
    Layer 0 (dense)       A -> B -> C -> D -> E -> F -> G -> H
                              *    *    *    *    *    *    *
                          (all vectors live here with short-range links)

    Search for query Q:
      1. Enter at Layer 2, start at node A
      2. Greedy walk: A -> F (F is closer to Q)
      3. Drop to Layer 1: F -> G (G is closer)
      4. Drop to Layer 0: G -> H -> ... refine among neighbors
      5. Return top-K closest nodes found
```

**Key parameters:**
- `M` — max edges per node (typically 16–64). Higher M = better recall, more memory.
- `efConstruction` — beam width during build. Higher = better graph quality, slower build.
- `efSearch` — beam width during search. Higher = better recall, slower query.

**Why HNSW works so well:**
- **O(log N)** average query time — the layered structure provides logarithmic scaling.
- No training phase (unlike IVF which needs k-means). Vectors can be inserted one at a time.
- Excellent recall (>99%) at reasonable speed.

The downside: HNSW requires the entire graph in memory. Each vector needs ~`M * 2 * 8` bytes for edge storage on top of the vector data itself. At M=16, that is 256 extra bytes per vector, adding ~25 GB overhead for 100 million vectors.

## Quantization: Shrinking Vectors

When raw vectors don't fit in memory, **quantization** compresses them. The two main approaches:

**Product Quantization (PQ):** Split each D-dimensional vector into `m` sub-vectors, then replace each sub-vector with the ID of its nearest centroid from a learned codebook. A 768-dim float32 vector (3072 bytes) can be compressed to 96 bytes with `m=96` sub-quantizers — a 32x reduction.

```
    Product Quantization

    Original vector (768 dims, 3072 bytes):
    [ 0.12, -0.45, 0.78, 0.03, ..., -0.11, 0.56, 0.22, -0.89 ]
      |___ sub-vec 0 ___|  |___ sub-vec 1 ___|      |_ sub-vec 95 _|

    Each sub-vector (8 dims) --> nearest centroid ID (1 byte)

    Compressed (96 bytes):
    [ 42, 117, 3, 255, ..., 88, 201, 7, 156 ]

    Distance computation uses lookup tables built from the codebook,
    so it stays fast despite compression.
```

**Scalar Quantization (SQ):** Simply convert float32 to int8 or float16 per dimension. Less aggressive but simpler and faster to encode/decode.

In practice, systems combine approaches: **IVF-PQ** uses IVF clustering with PQ-compressed vectors inside each cluster. **HNSW-SQ** uses HNSW navigation with scalar-quantized vectors for distance computation, then re-ranks the top candidates against full-precision vectors stored on disk.

## Inside Milvus: A Production Vector Database

[Milvus](https://github.com/milvus-io/milvus) is one of the most widely deployed open-source vector databases. Its architecture shows how these indexing ideas fit into a real system.

```
    Milvus Architecture (Simplified)

    +------------------+
    |   SDK / Client   |
    +--------+---------+
             |
             v
    +------------------+     +------------------+
    |   Proxy Layer    |---->|   Query Coord    |
    | (load balancing, |     | (manages query   |
    |  authentication) |     |  node assignment) |
    +--------+---------+     +--------+---------+
             |                        |
             v                        v
    +------------------+     +------------------+
    |   Data Coord     |     |   Query Nodes    |
    | (segment mgmt,   |     | (execute search, |
    |  compaction)      |     |  load indexes)   |
    +--------+---------+     +------------------+
             |                        ^
             v                        |
    +------------------+              |
    |  Object Storage  |--------------+
    | (S3 / MinIO)     |   (segments + indexes)
    +------------------+

    +------------------+
    |   etcd           |   metadata, schema, coordination
    +------------------+

    +------------------+
    |   Message Queue  |   write-ahead log (Pulsar / Kafka)
    | (Pulsar/Kafka)   |
    +------------------+
```

**Key design choices in Milvus:**

1. **Segments as the unit of storage.** Data is organized into immutable segments (similar to LSM-tree SSTables). New inserts go into a growing segment; once it reaches a size threshold, it is sealed and an ANN index is built on it. This separation means writes never block reads.

2. **Write-ahead log via message queue.** Milvus uses Pulsar or Kafka as its WAL. Inserts are written to the message queue first, then consumed by data nodes that flush segments to object storage. This provides durability and allows replaying events for recovery.

3. **Disaggregated compute and storage.** Query nodes load segments and indexes from S3/MinIO into memory. You can scale query nodes independently of storage — add more query nodes to handle more concurrent searches without duplicating data.

4. **Hybrid search.** Milvus supports filtering by scalar fields (e.g., `category = 'electronics' AND price < 100`) combined with vector similarity search. Internally, it applies the scalar filter first using a bitmap, then runs ANN search only on matching vectors.

The search execution within a query node looks like this:

```
    Query Node: Search Execution

    Query arrives: { vector: [0.1, ...], top_k: 10, filter: "year > 2023" }
         |
         v
    +---------------------+
    | Apply scalar filter  |  --> bitmap: [1,0,1,1,0,1,...]
    | (inverted index on   |
    |  scalar fields)      |
    +----------+----------+
               |
               v
    +---------------------+
    | ANN search on        |  search only vectors where bitmap = 1
    | filtered segments    |  using HNSW / IVF index
    +----------+----------+
               |
               v
    +---------------------+
    | Merge results from   |  each segment returns local top-K,
    | multiple segments    |  merge into global top-K
    +----------+----------+
               |
               v
         Return top-K results with IDs, distances, and metadata
```

You can explore how Milvus implements HNSW search in its [knowhere](https://github.com/zilliztech/knowhere) library, which wraps [hnswlib](https://github.com/nmslib/hnswlib) and adds GPU acceleration. The core graph traversal happens in [`hnswlib/hnswalg.h`](https://github.com/nmslib/hnswlib/blob/master/hnswlib/hnswalg.h), specifically in the `searchBaseLayerST` method:

```cpp
// Simplified from hnswlib/hnswalg.h — greedy search on the base layer
std::priority_queue<pair<dist_t, tableint>> searchBaseLayerST(
    tableint ep_id,         // entry point node
    const void *data_point, // query vector
    size_t ef               // beam width
) {
    // visited_list tracks which nodes we've already checked
    auto *visited = visited_list_pool_->getFreeVisitedList();

    // candidates: min-heap of (distance, node_id) — nodes to explore
    // top_candidates: max-heap — current best results
    std::priority_queue<pair<dist_t, tableint>, vector<...>, CompareByFirst>
        candidates;
    std::priority_queue<pair<dist_t, tableint>>
        top_candidates;

    dist_t dist = fstdistfunc_(data_point, getDataByInternalId(ep_id), ...);
    top_candidates.emplace(dist, ep_id);
    candidates.emplace(-dist, ep_id);  // negated for min-heap behavior

    while (!candidates.empty()) {
        auto [cand_dist, cand_id] = candidates.top();
        // If closest candidate is farther than our worst result, stop
        if (-cand_dist > top_candidates.top().first) break;
        candidates.pop();

        // Scan all neighbors of this candidate
        int *neighbors = get_linklist0(cand_id);  // adjacency list
        size_t num_neighbors = getListCount(neighbors);
        for (size_t j = 0; j < num_neighbors; j++) {
            int neighbor_id = *(neighbors + j + 1);
            if (visited->mass[neighbor_id]) continue;
            visited->mass[neighbor_id] = true;

            dist_t d = fstdistfunc_(data_point,
                                     getDataByInternalId(neighbor_id), ...);
            if (d < top_candidates.top().first || top_candidates.size() < ef) {
                candidates.emplace(-d, neighbor_id);
                top_candidates.emplace(d, neighbor_id);
                if (top_candidates.size() > ef) top_candidates.pop();
            }
        }
    }
    return top_candidates;
}
```

The algorithm is a **beam search** on the graph: maintain a priority queue of the best `ef` candidates found so far, and expand the most promising candidate at each step by visiting its neighbors. The search terminates when the closest unexplored candidate is farther than the worst result in the beam — meaning no neighbor can improve the result set.

## Putting It All Together: A RAG Pipeline

The most common use of vector databases today is in **Retrieval-Augmented Generation (RAG)** — giving LLMs access to your private data without retraining. Here is how the pieces fit:

```
    RAG Pipeline with Vector Database

    Offline (indexing):

    Documents                 Embedding Model              Vector DB
    +---------+              +----------------+           +----------+
    | "TiDB   | -- chunk --> | text-embedding | -- vec -> | Store +  |
    |  uses   |              | -3-small       |           | Index    |
    |  Raft"  |              +----------------+           +----------+
    +---------+

    Online (query):

    User: "How does TiDB replicate data?"
         |
         v
    +----------------+
    | text-embedding |  -->  query vector [0.23, -0.11, ...]
    | -3-small       |
    +-------+--------+
            |
            v
    +----------+
    | Vector DB |  -->  top-5 relevant chunks:
    | ANN search|      "TiDB uses Raft consensus for replication..."
    +-------+--+       "Each TiKV region has 3 replicas..."
            |
            v
    +-------+--------+
    |  LLM (Claude)  |  Prompt: context chunks + user question
    |                 |  --> "TiDB replicates data using the Raft
    +----------------+       consensus protocol. Each region..."
```

The vector database bridges the gap between unstructured knowledge and the LLM's context window. Without it, you would have to stuff your entire document corpus into the prompt (impossible for large datasets) or fine-tune the model (expensive and inflexible).

## Performance Comparison

Different index types suit different scenarios:

```
    +----------+--------+---------+---------+----------+-----------+
    | Index    | Build  | Query   | Memory  | Recall   | Best For  |
    |          | Time   | Time    |         | @top-10  |           |
    +----------+--------+---------+---------+----------+-----------+
    | Flat     | O(1)   | O(N*D)  | O(N*D)  | 100%     | <100K     |
    |          |        |         |         |          | vectors   |
    +----------+--------+---------+---------+----------+-----------+
    | IVF-Flat | O(N*D) | O(N/    | O(N*D)  | 95-99%   | 1M-100M   |
    |          |        | nlist)  |         |          | vectors   |
    +----------+--------+---------+---------+----------+-----------+
    | IVF-PQ   | O(N*D) | O(N/    | O(N*m)  | 90-95%   | 100M+     |
    |          |        | nlist)  |  (small)|          | memory-   |
    |          |        |         |         |          | limited   |
    +----------+--------+---------+---------+----------+-----------+
    | HNSW     | O(N*   | O(log N)| O(N*    | 97-99%+  | <50M,     |
    |          | log N) |         | (D+M))  |          | low       |
    |          |        |         |         |          | latency   |
    +----------+--------+---------+---------+----------+-----------+
    | DiskANN  | O(N*D) | O(log N)| O(N*m)  | 95-99%   | Billions, |
    |          |        | + disk  |  (small)|          | SSD-based |
    +----------+--------+---------+---------+----------+-----------+
```

HNSW dominates when the dataset fits in memory and low latency matters. IVF-PQ wins when memory is the constraint. DiskANN (developed by Microsoft Research) extends graph-based search to disk, enabling billion-scale search on a single machine with SSDs.

## References

1. Malkov, Y.A. and Yashunin, D.A. "Efficient and Robust Approximate Nearest Neighbor using Hierarchical Navigable Small World Graphs." IEEE TPAMI, 2018. [arXiv:1603.09320](https://arxiv.org/abs/1603.09320)
2. Jégou, H., Douze, M., and Schmid, C. "Product Quantization for Nearest Neighbor Search." IEEE TPAMI, 2011. [paper](https://ieeexplore.ieee.org/document/5432202)
3. Subramanya, S.J. et al. "DiskANN: Fast Accurate Billion-point Nearest Neighbor Search on a Single Node." NeurIPS, 2019. [paper](https://proceedings.neurips.cc/paper/2019/hash/09853c7fb1d3f8ee67a61b6bf4a7f8e6-Abstract.html)
4. Milvus documentation. [milvus.io/docs](https://milvus.io/docs)
5. hnswlib — Header-only C++ HNSW implementation. [github.com/nmslib/hnswlib](https://github.com/nmslib/hnswlib)
6. FAISS — Facebook AI Similarity Search library. [github.com/facebookresearch/faiss](https://github.com/facebookresearch/faiss)
