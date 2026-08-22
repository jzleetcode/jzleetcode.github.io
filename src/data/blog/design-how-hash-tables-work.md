---
author: JZ
pubDatetime: 2026-08-22T06:23:00Z
modDatetime: 2026-08-22T06:23:00Z
title: System Design - How Hash Tables Work Internally
tags:
  - design-system
  - design-data-structures
description:
  "How hash tables work under the hood: hash functions, collision resolution (chaining vs open addressing), load factors, resizing strategies, Robin Hood hashing, and a source code walkthrough of Go's built-in map."
---

## Table of contents

## Context

You use hash tables every day. Python's `dict`, Java's `HashMap`, Go's `map`, C++'s `std::unordered_map` — they all promise O(1) average-case lookups. But how does a computer turn an arbitrary key into a position in memory, and what happens when two keys land in the same spot?

This article walks through the internals step by step: from the math of hash functions to the engineering of real-world implementations. By the end, you'll understand why hash tables are fast, when they become slow, and how modern languages have evolved their designs to squeeze out every last nanosecond.

## The Big Idea

A hash table is an array combined with a function that converts keys into array indices:

```
  Key: "alice"
       |
       v
  hash("alice") = 0x4A3B...  (some large number)
       |
       v
  index = hash % array_length  -->  e.g., 5
       |
       v
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   | * |   |   |   array (buckets)
  +---+---+---+---+---+---+---+---+
    0   1   2   3   4   5   6   7
                          ^
                    "alice" -> "engineer"
```

Two operations matter:
1. **Hash** — convert the key to a number.
2. **Index** — map that number into the array bounds.

If every key mapped to a unique index, we'd be done. But keys are infinite and arrays are finite, so **collisions** are inevitable. The rest of hash table design is about handling collisions efficiently.

## Hash Functions

A hash function takes arbitrary-length input and returns a fixed-size integer. For a hash table, we need:

- **Determinism:** Same input always produces same output.
- **Uniform distribution:** Outputs spread evenly across the range.
- **Speed:** Must be fast since we hash on every operation.

We do *not* need cryptographic security (like SHA-256). Hash table functions prioritize speed over collision resistance against adversaries.

### Common Hash Functions

| Function | Bits | Speed | Use case |
|----------|------|-------|----------|
| FNV-1a | 32/64 | Very fast | General purpose |
| MurmurHash3 | 32/128 | Fast | General purpose |
| SipHash | 64 | Moderate | Hash-DoS resistant (Python, Rust) |
| AES-based (aHash) | 64 | Very fast (with AES-NI) | Rust's `HashMap` default |
| wyhash | 64 | Very fast | Go's `map` (since Go 1.22) |

### How FNV-1a Works

FNV-1a is one of the simplest non-trivial hash functions:

```c
uint64_t fnv1a(const uint8_t *data, size_t len) {
    uint64_t hash = 0xcbf29ce484222325;  // FNV offset basis
    for (size_t i = 0; i < len; i++) {
        hash ^= data[i];          // XOR with byte
        hash *= 0x100000001b3;    // multiply by FNV prime
    }
    return hash;
}
```

Each byte of input XORs into the hash, then a multiplication "avalanches" the bits — changing one input byte affects many output bits. The offset basis ensures that empty input doesn't produce zero.

### Hash-DoS and Keyed Hashing

In 2011, researchers showed that an attacker could craft inputs that all hash to the same bucket, turning O(1) lookups into O(n). This denial-of-service attack affected PHP, Java, Python, and Ruby web frameworks.

The fix: **keyed hash functions** like SipHash. A random seed is chosen at program startup, so attackers cannot predict which keys will collide:

```
hash = SipHash(random_seed, key)
```

Python, Rust, and Go all use randomized hashing by default.

## Collision Resolution: Two Families

When `hash(key_a) % size == hash(key_b) % size`, we have a collision. Two fundamental strategies exist:

```
        Collision Resolution
               |
       +-------+-------+
       |               |
   Chaining      Open Addressing
   (separate     (store everything
    lists)        in the array itself)
       |               |
   +---+---+     +-----+-----+
   |       |     |     |     |
 Linked  Trees  Linear Quadr- Robin
  List          Probe  atic   Hood
```

### Strategy 1: Separate Chaining

Each bucket holds a pointer to a linked list (or other container) of entries:

```
  Buckets:
  +---+    +-------------+    +-------------+
  | 0 |--->| "bob": 42   |--->| "eve": 7    |
  +---+    +-------------+    +-------------+
  | 1 |
  +---+    +-------------+
  | 2 |--->| "alice": 99 |
  +---+    +-------------+
  | 3 |
  +---+    +-------------+    +-------------+    +-------------+
  | 4 |--->| "carol": 5  |--->| "dave": 13  |--->| "frank": 8  |
  +---+    +-------------+    +-------------+    +-------------+
  | 5 |
  +---+
```

**Lookup:** Hash the key, go to that bucket, walk the chain comparing keys until found.

**Pros:**
- Simple to implement.
- Load factor can exceed 1.0 (more entries than buckets).
- Deletion is trivial (just unlink the node).

**Cons:**
- Pointer chasing destroys CPU cache locality.
- Each entry needs a `next` pointer (memory overhead).
- Chains can become long if the hash function is poor.

### Strategy 2: Open Addressing (Linear Probing)

All entries live directly in the array. On collision, probe forward until finding an empty slot:

```
  Insert "carol" at index 2 (occupied by "alice"):
  
  +-------+-------+-------+-------+-------+-------+
  | "bob" |       |"alice"|"carol"|       | "eve" |   
  |  @0   |       |  @2   |  @3   |       |  @5   |
  +-------+-------+-------+-------+-------+-------+
    0       1       2       3       4       5
                    ^       ^
              wanted here, placed here (next empty)
```

**Lookup:** Hash to index, compare keys. If mismatch, move to next slot. Repeat until key found or empty slot reached.

**Pros:**
- Excellent cache locality (sequential memory access).
- No pointer overhead.
- Faster than chaining for low load factors.

**Cons:**
- **Clustering:** occupied slots bunch together, making probes longer.
- Load factor must stay below 1.0 (typically < 0.75).
- Deletion is complex (must use tombstones or backward-shift).

### The Clustering Problem

Linear probing suffers from **primary clustering**: a run of occupied slots acts like a magnet, attracting more insertions to the same region.

```
  Cluster grows:
  
  Before:  [ ][ ][X][X][X][ ][ ][ ]
  Insert:  [ ][ ][X][X][X][*][ ][ ]   <-- new entry extends cluster
  Insert:  [ ][ ][X][X][X][X][*][ ]   <-- cluster grows further
  
  Probability of hitting a cluster of length k is proportional to k,
  so big clusters grow faster than small ones.
```

**Quadratic probing** (probe positions: +1, +4, +9, +16, ...) and **double hashing** (second hash function determines step size) reduce clustering but sacrifice some cache benefit.

## Robin Hood Hashing

Robin Hood hashing (1986, Celis) is an elegant improvement to open addressing. The idea: when inserting, if the new element has traveled farther from its ideal position than the current occupant, **steal the slot** (like Robin Hood taking from the rich).

```
  Displacement = current_position - ideal_position

  Inserting key with displacement 3:
  
  Slot:  [d=0] [d=1] [d=0] [d=1] [d=2] [ empty ]
                                    ^
                            We arrive here with d=3.
                            Current occupant has d=2.
                            3 > 2, so we swap!
  
  After: [d=0] [d=1] [d=0] [d=1] [NEW,d=3] [old,d=3]
                                              ^ displaced element
                                                continues probing
```

**Why it helps:** It equalizes probe distances. Instead of some lookups being fast and others catastrophically slow, all lookups take roughly the same time. The worst-case probe length drops dramatically.

**Variance comparison** (load factor 0.9):
- Linear probing: average 5.5 probes, worst-case can exceed 100.
- Robin Hood: average 5.5 probes, worst-case ~20.

Rust's standard `HashMap` used Robin Hood hashing until 2019 (when it switched to Swiss Table for better SIMD utilization).

## Swiss Table: The Modern Approach

Google's Swiss Table (2017, open-sourced as [Abseil's `flat_hash_map`](https://github.com/abseil/abseil-cpp/blob/master/absl/container/internal/raw_hash_set.h)) uses SIMD instructions to check multiple slots in parallel:

```
  Memory layout per group (16 slots):
  
  +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+
  | c0 | c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8 | c9 |c10 |c11 |c12 |c13 |c14 |c15 |
  +----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+----+
  Control bytes (1 byte each): top 7 bits of hash + flags
  
  +------+------+------+------+------+------+------+------+------+...
  | key0 | key1 | key2 | key3 | key4 | key5 | key6 | key7 | ...
  +------+------+------+------+------+------+------+------+------+...
  Slots (key-value pairs, stored separately)
```

**How a lookup works:**

1. Compute `hash(key)`.
2. Use lower bits to find the **group** (group index = hash % num_groups).
3. Extract top 7 bits of hash as the **control byte** (`H2`).
4. Use a single SIMD instruction (`_mm_cmpeq_epi8`) to compare `H2` against all 16 control bytes simultaneously.
5. The SIMD result is a bitmask. Each `1` bit is a *potential* match.
6. For each potential match, compare the actual key.

```
  SIMD comparison (SSE2 on x86):

  Control bytes:  [0x4A][0x7F][0x4A][0x00][0x4A][0xFF][0x23][0x4A]...
  Looking for H2: [0x4A][0x4A][0x4A][0x4A][0x4A][0x4A][0x4A][0x4A]...
                    ^           ^           ^                 ^
  Match bitmask:   1     0     1     0     1     0     0     1  ...
  
  Only slots 0, 2, 4, 7 need full key comparison.
```

This turns 16 sequential comparisons into one SIMD operation. At a typical load factor of 87.5%, most lookups need only one or two groups.

## Load Factor and Resizing

The **load factor** is `n / capacity` where `n` is the number of stored entries. As it increases, collisions become more frequent:

```
  Performance vs Load Factor (open addressing):
  
  Avg probes
      |
   10 |                                          *
      |                                     *
    5 |                                *
      |                          *
    2 |                  *   *
    1 |  *   *   *   *
      +--+---+---+---+---+---+---+---+---+---
         0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8 0.9
                     Load factor
```

Most implementations trigger a **resize** (typically doubling the array) when the load factor crosses a threshold:

| Implementation | Strategy | Max load factor |
|---------------|----------|-----------------|
| Java HashMap | Chaining | 0.75 |
| Python dict | Open addressing | 0.67 |
| Go map | Chaining (buckets of 8) | 0.65 (6.5 avg per bucket) |
| C++ unordered_map | Chaining | 1.0 |
| Rust HashMap | Swiss Table | 0.875 |

### Resizing (Rehash)

When the table grows, every existing entry must be rehashed into the new array:

```
  Old table (capacity 4):        New table (capacity 8):
  +---+---+---+---+             +---+---+---+---+---+---+---+---+
  | A | B |   | C |             |   | A |   | C |   | B |   |   |
  +---+---+---+---+             +---+---+---+---+---+---+---+---+
    0   1   2   3                 0   1   2   3   4   5   6   7
                                      ^       ^       ^
                                  A:h%8=1  C:h%8=3  B:h%8=5
```

Resizing is O(n) — every key is rehashed. This makes a single insertion occasionally expensive, but **amortized** over many insertions, the average cost stays O(1). The proof: each element is rehashed at most O(log n) times total across all resizes.

### Incremental Resizing

Some implementations avoid the O(n) spike by resizing **incrementally**. Go's map does this: during growth, both old and new arrays coexist, and a few entries are migrated on each operation:

```
  During incremental resize:
  
  Lookup:   check new table first, then old table
  Insert:   always into new table
  Each op:  migrate one bucket from old -> new
  
  After all buckets migrated: free old table
```

This spreads the cost over many operations, avoiding latency spikes in latency-sensitive applications.

## Go's Map Implementation: A Walkthrough

Go's built-in `map` (source: [`runtime/map.go`](https://github.com/golang/go/blob/master/src/runtime/map.go)) uses a unique hybrid design. Let's trace through its structure.

### The hmap Structure

```go
type hmap struct {
    count     int       // number of live entries
    flags     uint8     // iterator state, writing flag
    B         uint8     // log2 of number of buckets (can hold 2^B buckets)
    noverflow uint16    // approximate number of overflow buckets
    hash0     uint32    // random hash seed

    buckets    unsafe.Pointer  // array of 2^B buckets
    oldbuckets unsafe.Pointer  // previous bucket array (during growth)
    nevacuate  uintptr         // progress counter for evacuation

    extra *mapextra  // overflow bucket storage
}
```

Key design choices:
- `B` stores log2 of bucket count (so `1 << B` = number of buckets).
- `hash0` is a random seed set at map creation — prevents hash-DoS.
- `oldbuckets` is non-nil only during incremental resizing.

### Bucket Layout

Each bucket holds 8 key-value pairs plus a pointer to an overflow bucket:

```
  One bucket (bmap):
  
  +----+----+----+----+----+----+----+----+
  | t0 | t1 | t2 | t3 | t4 | t5 | t6 | t7 |   tophash (8 bytes)
  +----+----+----+----+----+----+----+----+
  | key0 | key1 | key2 | key3 | key4 | key5 | key6 | key7 |
  +------+------+------+------+------+------+------+------+
  | val0 | val1 | val2 | val3 | val4 | val5 | val6 | val7 |
  +------+------+------+------+------+------+------+------+
  | overflow *bmap |
  +----------------+
```

The **tophash** array stores the top 8 bits of each key's hash. This is Go's version of the Swiss Table trick: before comparing full keys (which might be expensive strings), first check the 1-byte tophash. Most mismatches are caught with a single byte comparison.

```
  Lookup for key "alice" (hash = 0x4A3B7F21...):
  
  1. bucket_index = hash & (2^B - 1)    // low bits select bucket
  2. tophash_to_find = hash >> (64 - 8)  // high bits = 0x4A
  3. Scan tophash[0..7] for 0x4A
     - tophash[0] = 0x7F  -> skip
     - tophash[1] = 0x4A  -> potential match!
  4. Compare key1 with "alice"
     - Match! Return val1.
```

### Why Keys and Values Are Stored Separately

Notice that all 8 keys are grouped together, followed by all 8 values. This seems odd (compared to interleaving key-value pairs) but saves memory due to **alignment padding**:

```
  Interleaved (wasteful):         Grouped (compact):
  [key1: 1B][pad: 7B][val1: 8B]  [key1][key2]...[key8] // 8 bytes
  [key2: 1B][pad: 7B][val2: 8B]  [val1][val2]...[val8] // 64 bytes
  ...                              No padding needed!
  (8 bytes wasted per entry)
```

For a `map[int8]int64`, interleaving would add 7 bytes of padding per entry. Grouping eliminates this waste entirely.

## Deletion: The Tombstone Problem

In open addressing, you cannot simply clear a deleted slot. Other entries may have been placed after it during insertion, relying on the slot being occupied during their probe:

```
  Insert order: A(idx 3), B(idx 3->4), C(idx 3->4->5)
  
  [   ][ A ][ B ][ C ][   ]
    2    3    4    5    6
  
  Delete B naively (set to empty):
  
  [   ][ A ][   ][ C ][   ]
    2    3    4    5    6
  
  Lookup C: hash(C)%size = 3, probe 3(A, skip), probe 4(EMPTY, stop).
  C not found! BUG.
```

**Solutions:**

1. **Tombstones:** Mark deleted slots with a special flag. Lookups skip tombstones; insertions can reuse them.
   - Downside: tombstones accumulate, degrading performance over time.

2. **Backward-shift deletion:** After removing an entry, shift subsequent entries backward if they're displaced from their ideal position.
   - Eliminates tombstones but makes deletion O(cluster_length).

3. **Chaining:** Simply unlink the node from the list. No tombstone needed.

Go's map uses chaining with overflow buckets, so deletion just clears the tophash flag and zeroes the key/value slots.

## Real-World Performance Considerations

### CPU Cache Effects

The most important factor in hash table performance on modern hardware is **cache behavior**, not algorithmic complexity:

```
  Memory hierarchy latency:
  
  L1 cache:    ~1 ns    (32-64 KB)
  L2 cache:    ~4 ns    (256 KB - 1 MB)
  L3 cache:    ~12 ns   (4-32 MB)
  Main memory: ~100 ns  (GB)
  
  One cache miss during a lookup can cost more
  than 50 hash computations.
```

This is why open addressing (sequential memory) often beats chaining (pointer chasing) despite having worse theoretical collision behavior. Each cache line is typically 64 bytes — a linear probe touching 4-8 adjacent slots fits in one or two cache lines.

### String Hashing Optimization

For string keys, computing the hash is often the bottleneck. Modern implementations use tricks:

- **Short string optimization:** For strings < 32 bytes, the entire string fits in a few registers. Use a simple mixer.
- **Partial hashing:** For very long strings, only hash a prefix + suffix + length. Trades collision rate for speed.
- **Hash caching:** Store the hash alongside the key so rehashing doesn't recompute it (Java's `String.hashCode()` is cached).

### Power-of-Two vs Prime Table Sizes

Using `hash % prime_size` distributes entries more uniformly but requires an expensive division. Using `hash & (power_of_two - 1)` is a single bitwise AND but makes the table sensitive to hash function quality.

Modern hash tables (Go, Rust, Abseil) use power-of-two sizes with high-quality hash functions. Older designs (C++ libstdc++ `unordered_map`) use prime sizes to compensate for weaker hash functions.

## Comparison of Real Implementations

| | Java HashMap | Python dict | Go map | Rust HashMap | Abseil flat_hash |
|--|--|--|--|--|--|
| Strategy | Chaining (list/tree) | Open addressing | Chaining (8-slot buckets) | Swiss Table | Swiss Table |
| Resize at | 0.75 | 0.67 | 6.5/bucket | 0.875 | 0.875 |
| Hash function | Object.hashCode() | SipHash | wyhash + seed | SipHash/aHash | Built-in mixer |
| SIMD | No | No | No (tophash scan) | Yes (SSE2/NEON) | Yes (SSE2/NEON) |
| Growth | 2x | 4x (small), 2x (large) | 2x (incremental) | 2x | 2x |
| Tree fallback | Yes (Java 8+, >8 entries) | No | No | No | No |

Java 8 introduced **tree bins**: when a single bucket's chain exceeds 8 entries, it converts from a linked list to a red-black tree (O(log n) worst case instead of O(n)). This defends against hash-DoS without needing a keyed hash function.

## Putting It All Together

Here's a simplified but complete hash table implementation in Python showing the core mechanics of open addressing with Robin Hood hashing:

```python
class RobinHoodHashTable:
    def __init__(self, capacity=8):
        self.capacity = capacity
        self.size = 0
        self.keys = [None] * capacity
        self.values = [None] * capacity
        self.distances = [0] * capacity  # displacement from ideal slot

    def _hash(self, key):
        return hash(key) & 0xFFFFFFFF

    def _probe_distance(self, hash_val, slot):
        return (slot - hash_val % self.capacity) % self.capacity

    def insert(self, key, value):
        if self.size >= self.capacity * 0.7:
            self._resize()

        h = self._hash(key)
        idx = h % self.capacity
        dist = 0

        while True:
            if self.keys[idx] is None:
                # Empty slot: place here
                self.keys[idx] = key
                self.values[idx] = value
                self.distances[idx] = dist
                self.size += 1
                return
            if self.keys[idx] == key:
                # Key exists: update value
                self.values[idx] = value
                return
            if dist > self.distances[idx]:
                # Robin Hood: steal from the rich
                self.keys[idx], key = key, self.keys[idx]
                self.values[idx], value = value, self.values[idx]
                self.distances[idx], dist = dist, self.distances[idx]

            idx = (idx + 1) % self.capacity
            dist += 1

    def get(self, key):
        h = self._hash(key)
        idx = h % self.capacity
        dist = 0

        while True:
            if self.keys[idx] is None:
                return None
            if dist > self.distances[idx]:
                return None  # Would have been placed here if it existed
            if self.keys[idx] == key:
                return self.values[idx]
            idx = (idx + 1) % self.capacity
            dist += 1

    def _resize(self):
        old_keys, old_values = self.keys, self.values
        self.capacity *= 2
        self.keys = [None] * self.capacity
        self.values = [None] * self.capacity
        self.distances = [0] * self.capacity
        self.size = 0
        for k, v in zip(old_keys, old_values):
            if k is not None:
                self.insert(k, v)
```

Notice the `get` method's early termination: if our probe distance exceeds the stored distance at a slot, the key cannot exist further ahead. This is the key insight of Robin Hood hashing — displacement information enables faster negative lookups.

## Summary

```
  Evolution of hash table design:
  
  1953  Chaining (Luhn)
    |
  1954  Linear probing (Peterson)
    |
  1963  Quadratic probing (Maurer)
    |
  1986  Robin Hood hashing (Celis)
    |
  2003  Cuckoo hashing (Pagh & Rodler)
    |
  2017  Swiss Table (Google) -- SIMD-accelerated
    |
  2024  Modern: all major languages use randomized seeds
        + either Swiss Table or 8-slot bucket chaining
```

The hash table is a story of trading off memory, speed, and implementation complexity. The fundamentals haven't changed since the 1950s — hash a key, find a slot, handle collisions — but the engineering has evolved to exploit modern CPU features: SIMD instructions, cache line alignment, branch-free control flow, and hardware-accelerated hash functions.

## References

1. Knuth, D. "The Art of Computer Programming, Vol. 3: Sorting and Searching" — the foundational analysis of hashing.
2. Celis, P. "Robin Hood Hashing" (1986) — [University of Waterloo thesis](https://cs.uwaterloo.ca/research/tr/1986/CS-86-14.pdf).
3. Abseil Swiss Table design notes — [abseil.io/about/design/swisstables](https://abseil.io/about/design/swisstables).
4. Go runtime map implementation — [github.com/golang/go/src/runtime/map.go](https://github.com/golang/go/blob/master/src/runtime/map.go).
5. Rust hashbrown (Swiss Table port) — [github.com/rust-lang/hashbrown](https://github.com/rust-lang/hashbrown).
6. Crosby & Wallach, "Denial of Service via Algorithmic Complexity Attacks" (2003) — [USENIX Security](https://www.usenix.org/conference/12th-usenix-security-symposium/denial-service-algorithmic-complexity-attacks).
