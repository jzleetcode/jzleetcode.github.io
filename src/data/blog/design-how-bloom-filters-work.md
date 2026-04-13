---
author: JZ
pubDatetime: 2026-04-13T10:00:00Z
modDatetime: 2026-04-13T10:00:00Z
title: System Design - How Bloom Filters Work
tags:
  - design-system
  - design-database
description:
  "How Bloom filters work: the probabilistic data structure behind fast membership testing in databases, with a source code walkthrough of LevelDB and RocksDB implementations."
---

## Table of contents

## Context

Imagine you are building a key-value store on top of an LSM tree (like RocksDB, which powers TiKV). A read request arrives for key `user:42`. The LSM tree may have dozens of SST files on disk. In the worst case, you would open and binary-search every single file before concluding the key does not exist. Each file access means a disk seek — expensive even on SSDs.

What if, before touching the file at all, you could ask a tiny in-memory structure: "Could this key possibly be in this file?" If it says **no**, you skip the file entirely. If it says **maybe**, you do the disk read. That tiny structure is a **Bloom filter**.

```
  Read request: GET "user:42"
  
  SST File 1   SST File 2   SST File 3   SST File 4
  +----------+ +----------+ +----------+ +----------+
  | Bloom: NO| | Bloom: NO| |Bloom: YES| | Bloom: NO|
  +----------+ +----------+ +----------+ +----------+
      skip         skip       read disk!      skip

  Without Bloom filter: 4 disk reads
  With Bloom filter:    1 disk read + 3 cheap bit checks
```

Bloom filters are one of the most widely used probabilistic data structures in computer science. They show up in databases (RocksDB, Cassandra, HBase), networking (routers checking if a URL is malicious), distributed systems (Bigtable, Hadoop), and even web browsers (Chrome's safe browsing). The trade-off is elegant: **zero false negatives, small false positive rate, and constant-time operations**.

## The Basic Idea

A Bloom filter has two components:

1. **A bit array** of `m` bits, all initially set to 0.
2. **`k` hash functions**, each mapping a key to one of the `m` bit positions.

**Insert:** Hash the key with each of the `k` hash functions. Set those `k` bit positions to 1.

**Lookup:** Hash the key with the same `k` functions. If **all** `k` positions are 1, the key _might_ be in the set. If **any** position is 0, the key is **definitely not** in the set.

```
  Example: m=16 bits, k=3 hash functions

  Insert "apple":
    h1("apple") = 2, h2("apple") = 5, h3("apple") = 11

    Bit index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    Before:     0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
    After:      0  0  1  0  0  1  0  0  0  0  0  1  0  0  0  0
                      ^        ^                 ^

  Insert "banana":
    h1("banana") = 5, h2("banana") = 9, h3("banana") = 14

    After:      0  0  1  0  0  1  0  0  0  1  0  1  0  0  1  0
                      ^        ^        ^        ^        ^

  Lookup "cherry":
    h1("cherry") = 2, h2("cherry") = 9, h3("cherry") = 7
                                                         ^
    Bit 7 is 0 --> "cherry" is DEFINITELY NOT in the set

  Lookup "date":
    h1("date") = 5, h2("date") = 11, h3("date") = 9
    All bits are 1 --> "date" MIGHT be in the set (false positive!)
```

Notice that `"date"` was never inserted, but all three of its hash positions happen to be set by other keys. This is a **false positive**. Bloom filters never produce false negatives — if a key was inserted, all its bits are guaranteed to be set.

## The Math

The false positive probability depends on three parameters:

- `m` = number of bits in the filter
- `n` = number of keys inserted
- `k` = number of hash functions

After inserting `n` keys, the probability that a particular bit is still 0 is:

$$\left(1 - \frac{1}{m}\right)^{kn} \approx e^{-kn/m}$$

The false positive rate (all `k` bits happen to be 1 for a key not in the set) is:

$$\text{FP} = \left(1 - e^{-kn/m}\right)^k$$

The optimal number of hash functions that minimizes this rate is:

$$k_{\text{opt}} = \frac{m}{n} \ln 2 \approx 0.693 \times \frac{m}{n}$$

In practice, databases configure this as **bits per key** (`m/n`). Here is how the false positive rate varies:

```
  bits_per_key    optimal k     false positive rate
  ---------------------------------------------------
       4              3              ~14.7%
       8              6              ~2.2%
      10              7              ~0.82%
      12              8              ~0.31%
      16             11              ~0.046%
      20             14              ~0.0066%
```

RocksDB defaults to 10 bits per key, giving roughly a **1% false positive rate** — meaning 99 out of 100 unnecessary disk reads are avoided.

## LevelDB's Implementation: The Textbook Version

Google's LevelDB contains one of the cleanest Bloom filter implementations in any production codebase. The full source lives in [`util/bloom.cc`](https://github.com/google/leveldb/blob/main/util/bloom.cc) — it's under 60 lines.

### Computing k from bits_per_key

The constructor directly applies the optimal formula:

```cpp
explicit BloomFilterPolicy(int bits_per_key) : bits_per_key_(bits_per_key) {
  k_ = static_cast<size_t>(bits_per_key * 0.69);  // 0.69 ≈ ln(2)
  if (k_ < 1) k_ = 1;
  if (k_ > 30) k_ = 30;
}
```

The clamp to `[1, 30]` prevents degenerate cases. With `bits_per_key = 10`, this gives `k = 6`.

### Insert: CreateFilter

Here is the critical insight — LevelDB does **not** compute `k` independent hash functions. Instead, it computes **one** hash and derives the rest using a rotate-and-add trick:

```cpp
void CreateFilter(const Slice* keys, int n, std::string* dst) const override {
  size_t bits = n * bits_per_key_;
  if (bits < 64) bits = 64;

  size_t bytes = (bits + 7) / 8;
  bits = bytes * 8;
  dst->resize(init_size + bytes, 0);
  char* array = &(*dst)[init_size];

  for (int i = 0; i < n; i++) {
    uint32_t h = BloomHash(keys[i]);
    const uint32_t delta = (h >> 17) | (h << 15);  // rotate right 17 bits
    for (size_t j = 0; j < k_; j++) {
      const uint32_t bitpos = h % bits;
      array[bitpos / 8] |= (1 << (bitpos % 8));
      h += delta;
    }
  }
}
```

Let's trace through this step by step:

```
  Key: "user:42"
  h = BloomHash("user:42") = 0xA3B7C1D2  (example)
  delta = (h >> 17) | (h << 15) = 0xE8F4D1D3  (example)

  j=0: bitpos = h % bits         --> set bit
  j=1: h += delta; bitpos = h % bits --> set bit
  j=2: h += delta; bitpos = h % bits --> set bit
  ...and so on for k iterations

  Each "h += delta" produces a new probe position
  from the same single hash value.
```

Why is one hash enough? Kirsch and Mitzenmacher proved in 2006 that deriving `k` probe positions from two independent hash values — `g_i(x) = h1(x) + i * h2(x)` — gives the same asymptotic false positive rate as `k` truly independent hash functions. LevelDB goes one step further and derives both `h1` and `h2` from a single hash by using the original value and its rotation.

### Lookup: KeyMayMatch

The lookup mirrors insert exactly. Recompute the same probe positions; if any bit is 0, the key was never inserted:

```cpp
bool KeyMayMatch(const Slice& key, const Slice& bloom_filter) const override {
  const size_t len = bloom_filter.size();
  const char* array = bloom_filter.data();
  const size_t bits = (len - 1) * 8;  // last byte stores k

  const size_t k = array[len - 1];

  uint32_t h = BloomHash(key);
  const uint32_t delta = (h >> 17) | (h << 15);
  for (size_t j = 0; j < k; j++) {
    const uint32_t bitpos = h % bits;
    if ((array[bitpos / 8] & (1 << (bitpos % 8))) == 0) return false;
    h += delta;
  }
  return true;
}
```

Notice that `k` is stored as the **last byte** of the filter itself. This makes the filter self-describing — the reader doesn't need to know the original `bits_per_key` setting to decode it.

## RocksDB's Improvements: Cache-Friendly Bloom Filters

RocksDB (which evolved from LevelDB) went through three generations of Bloom filter design. The current default is called **FastLocalBloom**, and its key optimization targets CPU cache behavior.

### The Problem with LevelDB's Approach

In LevelDB, the `k` probe positions for a single key can scatter across the entire bit array. If the filter is large (say 1 MB for a big SST file), each probe might touch a different cache line, causing **cache misses**:

```
  LevelDB: probes scatter across memory

  Cache line 0    Cache line 1    Cache line 2    ...    Cache line N
  [............] [............] [............]         [............]
       ^                              ^                      ^
     probe 1                        probe 2                probe 3

  Each probe = potential L1/L2 cache miss
```

### FastLocalBloom: All Probes in One Cache Line

RocksDB's [`util/bloom_impl.h`](https://github.com/facebook/rocksdb/blob/main/util/bloom_impl.h) constrains all `k` probes for a given key to land within a single **64-byte cache line** (512 bits). The 64-bit hash is split into two 32-bit halves:

```
  64-bit hash of key
  +--------------------------------+--------------------------------+
  |          lower 32 bits         |          upper 32 bits         |
  +--------------------------------+--------------------------------+
           |                                    |
           v                                    v
  Selects which cache line              Generates probe positions
  (block) in the bit array             within that cache line
```

```cpp
// Lower 32 bits select the cache-line-sized block
static inline void PrepareHash(uint32_t h, uint32_t len_bytes,
                                const char* data, uint32_t* byte_offset) {
  // Map hash to a cache-line-aligned byte offset
  uint64_t a = uint64_t{h} * len_bytes;
  *byte_offset = static_cast<uint32_t>(a >> 32) & ~uint32_t{63};
}
```

Instead of LevelDB's rotate-and-add, probes within the block use **multiplicative hashing** with the golden ratio:

```cpp
// Upper 32 bits generate k probe positions within the block
h *= 0x9e3779b9;  // 2^32 / golden ratio
```

This constant (`0x9e3779b9`) is the integer part of `2^32 / phi` where `phi` is the golden ratio. Multiplying by this value scatters bits well across the 32-bit range, producing well-distributed probe positions within the 512-bit block.

```
  RocksDB FastLocalBloom: probes stay local

  Cache line 0    Cache line 1    Cache line 2    ...    Cache line N
  [............] [............] [^...^...^....]         [............]
                                 |   |   |
                               probe1 probe2 probe3

  One cache line fetch serves ALL probes --> fast!
```

### SIMD Batch Lookups

For bulk operations (like checking many keys during compaction), RocksDB goes further with a **two-phase batch lookup** that uses CPU prefetch instructions and optionally **AVX2 SIMD** to process eight probe positions in parallel:

```
  Phase 1: Compute byte offsets, trigger prefetch
  +-------------------------------------------+
  | for each key:                             |
  |   compute cache-line offset               |
  |   __builtin_prefetch(data + offset)       |
  +-------------------------------------------+
              |
              v  (memory is loading in background)
  Phase 2: Check bits (data is now in L1 cache)
  +-------------------------------------------+
  | for each key:                             |
  |   check k probe bits in the cache line    |
  |   may_match[i] = all bits set?            |
  +-------------------------------------------+
```

This prefetch-then-check pattern hides memory latency by overlapping data fetch with computation.

## How Bloom Filters Fit into an LSM Tree

Here is where Bloom filters sit in the read path of an LSM-tree storage engine like RocksDB:

```
  GET("user:42")
       |
       v
  +-----------+
  | MemTable  |  <-- in-memory, check directly
  +-----------+
       |  not found
       v
  +-----------+
  |Immutable  |  <-- in-memory, check directly
  | MemTable  |
  +-----------+
       |  not found
       v
  +---------------------------------------------+
  |  Level 0 SST Files (may overlap)            |
  |  +-------+ +-------+ +-------+              |
  |  |Bloom: | |Bloom: | |Bloom: |              |
  |  |  NO   | | YES   | |  NO   |              |
  |  +-------+ +---+---+ +-------+              |
  |     skip       |        skip                |
  +----------------|----------------------------+
                   v
             read index block
             binary search data block
             found? return value
                   |  not found
                   v
  +---------------------------------------------+
  |  Level 1 SST Files (non-overlapping)        |
  |  +-------+ +-------+ +-------+ +-------+   |
  |  |range: | |range: | |range: | |range: |   |
  |  |a-f    | |g-m    | |n-t    | |u-z    |   |
  |  +-------+ +-------+ +-------+ +--+----+   |
  |  skip      skip       skip        |         |
  |  (key range)                  Bloom check   |
  +----------------------------------------+----+
                                           |
                                     Bloom: YES
                                     read from disk
```

At each level, the Bloom filter acts as a gatekeeper. For a key that does **not** exist in the database (a common case — think cache miss checks), the Bloom filter can eliminate every SST file without a single disk read. RocksDB reports that Bloom filters typically reduce read amplification by **10x or more** for point lookups.

## Limitations and Variants

**No deletions.** You cannot remove a key from a standard Bloom filter — clearing a bit might affect other keys that hash to the same position. This is fine for SST files since they are immutable.

**Counting Bloom filters** replace each bit with a small counter (typically 4 bits), allowing deletions by decrementing. The trade-off is 4x the memory. RocksDB does not use counting filters since SST files are write-once.

**Ribbon filters** are a newer alternative that RocksDB also supports (since v7.0). They use less space for the same false positive rate but are slower to construct. The trade-off is build time (at compaction) vs. space savings. See [`util/ribbon_impl.h`](https://github.com/facebook/rocksdb/blob/main/util/ribbon_impl.h).

**Cuckoo filters** support deletion and have better space efficiency than counting Bloom filters, but are more complex to implement.

## Comparison: LevelDB vs RocksDB

```
  +---------------------+---------------------------+-------------------------------+
  |      Aspect         |        LevelDB            |   RocksDB (FastLocalBloom)    |
  +---------------------+---------------------------+-------------------------------+
  | Hash derivation     | rotate-and-add            | multiplicative (golden ratio) |
  |                     |   h += (h>>17 | h<<15)    |   h *= 0x9e3779b9             |
  +---------------------+---------------------------+-------------------------------+
  | Memory access       | probes scatter across     | all probes within one         |
  |                     | entire bit array          | 64-byte cache line            |
  +---------------------+---------------------------+-------------------------------+
  | Hash width          | 32-bit                    | 64-bit (split into halves)    |
  +---------------------+---------------------------+-------------------------------+
  | Batch lookup        | no                        | yes, with prefetch + SIMD     |
  +---------------------+---------------------------+-------------------------------+
  | Self-describing     | last byte stores k        | last byte stores k            |
  +---------------------+---------------------------+-------------------------------+
  | Bits per key        | configurable, commonly 10 | configurable, commonly 10     |
  +---------------------+---------------------------+-------------------------------+
```

## References

1. Space/Time Trade-offs in Hash Coding with Allowable Errors, Burton H. Bloom, 1970 [paper](https://dl.acm.org/doi/10.1145/362686.362692)
2. Less Hashing, Same Performance: Building a Better Bloom Filter, Kirsch & Mitzenmacher, 2006 [paper](https://www.eecs.harvard.edu/~michaelm/postscripts/rsa2008.pdf)
3. LevelDB Bloom filter implementation [`util/bloom.cc`](https://github.com/google/leveldb/blob/main/util/bloom.cc)
4. LevelDB filter policy interface [`include/leveldb/filter_policy.h`](https://github.com/google/leveldb/blob/main/include/leveldb/filter_policy.h)
5. RocksDB FastLocalBloom implementation [`util/bloom_impl.h`](https://github.com/facebook/rocksdb/blob/main/util/bloom_impl.h)
6. RocksDB Ribbon filter implementation [`util/ribbon_impl.h`](https://github.com/facebook/rocksdb/blob/main/util/ribbon_impl.h)
7. RocksDB Wiki: RocksDB Bloom Filter [wiki](https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter)
8. Network Applications of Bloom Filters: A Survey, Broder & Mitzenmacher, 2003 [paper](https://www.eecs.harvard.edu/~michaelm/postscripts/im2005b.pdf)
