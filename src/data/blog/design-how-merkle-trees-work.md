---
author: JZ
pubDatetime: 2026-06-12T07:00:00Z
modDatetime: 2026-06-12T07:00:00Z
title: System Design - How Merkle Trees Work
tags:
  - design-system
  - design-distributed
description:
  "How Merkle trees work: hash tree structure, efficient data verification, applications in git, blockchains, distributed databases (Cassandra, DynamoDB), and certificate transparency."
---

## Table of contents

## Context

Imagine you download a 4 GB file from the internet. How do you know it arrived intact? The simplest approach is to hash the entire file and compare against a known checksum. But what if only one byte in the middle is corrupted — do you re-download all 4 GB?

This is the problem **Ralph Merkle** solved in 1979 with a data structure now called a **Merkle tree** (or hash tree). The idea is elegant: organize your data into a binary tree where every leaf is a hash of a data block, and every internal node is the hash of its children. The single hash at the root — the **Merkle root** — acts as a fingerprint of the entire dataset.

```
                    Merkle Tree (4 data blocks)

                         +----------+
                         | Root Hash|
                         |  H(AB|CD)|
                         +----+-----+
                              |
                +-------------+-------------+
                |                           |
           +----+----+                +-----+----+
           |  H(AB)  |                |  H(CD)   |
           | H(A|B)  |                | H(C|D)   |
           +----+----+                +-----+----+
                |                           |
          +-----+-----+              +------+-----+
          |           |              |            |
       +--+--+     +--+--+       +--+--+      +--+--+
       | H(A)|     | H(B)|       | H(C)|      | H(D)|
       +--+--+     +--+--+       +--+--+      +--+--+
          |           |              |            |
       +--+--+     +--+--+       +--+--+      +--+--+
       |Blk A|     |Blk B|       |Blk C|      |Blk D|
       +-----+     +-----+       +-----+      +-----+
```

If block C is corrupted, you don't need to re-verify or re-download blocks A, B, and D. You only need to check the path from block C up to the root — that's $O(\log n)$ hashes instead of $O(n)$.

## How the Hash Tree is Built

Building a Merkle tree is a bottom-up process:

**Step 1: Partition data into blocks.** Split your data into fixed-size chunks (e.g., 256 KB each). Each chunk is a leaf.

**Step 2: Hash each leaf.** Apply a cryptographic hash function (SHA-256, for instance) to each block:

```
H(A) = SHA256(block_A)
H(B) = SHA256(block_B)
H(C) = SHA256(block_C)
H(D) = SHA256(block_D)
```

**Step 3: Pair and hash upward.** Concatenate adjacent hashes and hash again:

```
H(AB) = SHA256( H(A) || H(B) )
H(CD) = SHA256( H(C) || H(D) )
```

**Step 4: Repeat until one root remains:**

```
Root = SHA256( H(AB) || H(CD) )
```

If the number of leaves is odd, the last leaf is duplicated (or carried up alone, depending on the implementation).

## Merkle Proofs: Verifying Without the Full Tree

The power of a Merkle tree is that you can prove a specific block belongs to the dataset by providing only $O(\log n)$ hashes — called a **Merkle proof** (or inclusion proof).

Suppose a client knows the Merkle root and wants to verify block C is authentic. The server provides:

```
Proof for block C:
  1. H(D)   — sibling at leaf level
  2. H(AB)  — sibling at the next level up

Verification:
  1. Compute H(C) = SHA256(block_C)
  2. Compute H(CD) = SHA256( H(C) || H(D) )
  3. Compute Root' = SHA256( H(AB) || H(CD) )
  4. Compare Root' == known Root
```

```
              Root ← compare this
             /    \
          H(AB)    H(CD) ← compute this
          [given]  /    \
                H(C)    H(D)
                 ↑      [given]
              compute
              from data
```

With 1 million blocks, verification requires only ~20 hashes (since $\log_2(1{,}000{,}000) \approx 20$). This makes Merkle proofs extremely efficient for large datasets.

## Application 1: Git Object Storage

Git stores everything (blobs, trees, commits) as content-addressed objects. A **tree object** in git is essentially a Merkle tree node:

```
$ git cat-file -p HEAD^{tree}
100644 blob a1b2c3d4...   README.md
100644 blob e5f6a7b8...   main.go
040000 tree 9c8d7e6f...   pkg/
```

Each blob hash is a leaf (SHA-1 of the file content). Each tree hash is computed from its entries. The commit hash includes the root tree hash.

```
     commit abc123
         |
     tree def456  (root of file tree)
     /         \
  tree 9c8d..   blob a1b2..   blob e5f6..
  (pkg/)        (README.md)   (main.go)
   /    \
 blob..  blob..
```

When you `git push`, the remote can quickly determine which objects it already has by comparing tree hashes top-down. If the root tree hash matches, nothing changed. If it differs, git walks down only the branches that changed — transferring minimal data.

## Application 2: Bitcoin Block Verification

Every Bitcoin block header contains a Merkle root of all transactions in that block. This enables **Simplified Payment Verification (SPV)** — lightweight clients can verify a transaction was included in a block without downloading every transaction:

```
     Block Header
  +------------------+
  | prev_block_hash  |
  | timestamp        |
  | nonce            |
  | merkle_root -----+---> Root of transaction tree
  +------------------+

  Transactions in block (as Merkle leaves):
  tx0, tx1, tx2, tx3, tx4, tx5, tx6, tx7
```

An SPV client stores only block headers (~80 bytes each). To verify tx5 was included, it requests a Merkle proof from a full node: about 3 sibling hashes for a block of 8 transactions. The client computes up to the root and compares against the block header's `merkle_root`.

Bitcoin uses double-SHA256: `SHA256(SHA256(data))` at each level, and duplicates the last element when the count is odd.

## Application 3: Anti-Entropy in Distributed Databases

Distributed databases like Apache Cassandra and Amazon DynamoDB use Merkle trees for **anti-entropy repair** — detecting and fixing data inconsistencies between replicas.

```
  Replica A                           Replica B
  +--------+                          +--------+
  | Root_A | -------- compare ------> | Root_B |
  +---+----+                          +---+----+
      |           Root_A != Root_B        |
  +---+----+                          +---+----+
  |H(AB)_A |        H(AB) match      |H(AB)_B |  ← skip this subtree
  +--------+                          +--------+
  |H(CD)_A |       H(CD) mismatch    |H(CD)_B |  ← drill down
  +---+----+                          +---+----+
      |                                   |
  +---+---+                           +---+---+
  |H(C)_A | mismatch                  |H(C)_B |  ← sync block C
  +-------+                           +-------+
  |H(D)_A | match                     |H(D)_B |  ← skip
  +-------+                           +-------+
```

Each replica builds a Merkle tree over its key ranges. They exchange only root hashes first. If roots match, the replicas are consistent — zero data transfer needed. If not, they walk down the tree, exchanging hashes at each level until they find exactly which key ranges differ.

From Cassandra's source ([`MerkleTree.java`](https://github.com/apache/cassandra/blob/trunk/src/java/org/apache/cassandra/utils/MerkleTree.java)):

```java
public class MerkleTree implements Serializable {
    private Hashable root;
    private final int hashdepth; // max depth of tree
    private final long maxsize; // max number of leaves

    // Each inner node stores hash of its children
    static class Inner extends Hashable {
        private Hashable left;
        private Hashable right;

        @Override
        public void hash(byte[] hashes) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(left.hash());
            md.update(right.hash());
            this.digest = md.digest();
        }
    }
}
```

## Application 4: Certificate Transparency

Google's Certificate Transparency (CT) project uses Merkle trees to create a public, append-only log of TLS certificates. Anyone can verify that a certificate was logged (inclusion proof) or that the log hasn't been tampered with (consistency proof).

A **consistency proof** shows that a new tree is an extension of an older tree — no entries were modified or removed:

```
  Old tree (4 leaves):          New tree (6 leaves):

       R_old                         R_new
      /     \                      /       \
   H(AB)   H(CD)              H(ABCD)     H(EF)
   / \     / \                /    \       / \
  A   B   C   D           H(AB)  H(CD)   E   F
                           / \    / \
                          A   B  C   D
```

The consistency proof from old root to new root requires only a few hashes — proving the first 4 leaves are unchanged in the new tree.

## Complexity Summary

| Operation | Time | Space for proof |
|-----------|------|----------------|
| Build tree | $O(n)$ | — |
| Compute root | $O(n)$ | — |
| Generate inclusion proof | $O(\log n)$ | $O(\log n)$ hashes |
| Verify inclusion proof | $O(\log n)$ | — |
| Generate consistency proof | $O(\log n)$ | $O(\log n)$ hashes |
| Find differing blocks (anti-entropy) | $O(k \cdot \log n)$ | — |

Where $n$ = number of leaves, $k$ = number of differing blocks.

## A Minimal Implementation

Here's a simplified Merkle tree in Python to make the algorithm concrete:

```python
import hashlib

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

def build_merkle_tree(blocks: list[bytes]) -> list[list[bytes]]:
    """Build tree bottom-up. Returns list of levels (leaves first)."""
    if not blocks:
        return []

    # Level 0: hash each block
    current_level = [sha256(b) for b in blocks]
    tree = [current_level]

    # Build upward until one root
    while len(current_level) > 1:
        next_level = []
        for i in range(0, len(current_level), 2):
            left = current_level[i]
            # Duplicate last if odd number
            right = current_level[i + 1] if i + 1 < len(current_level) else left
            next_level.append(sha256(left + right))
        current_level = next_level
        tree.append(current_level)

    return tree

def get_merkle_proof(tree: list[list[bytes]], index: int) -> list[tuple[bytes, str]]:
    """Return sibling hashes needed to verify leaf at index."""
    proof = []
    for level in tree[:-1]:  # skip root level
        if index % 2 == 0:
            sibling_idx = index + 1
            direction = "right"
        else:
            sibling_idx = index - 1
            direction = "left"
        if sibling_idx < len(level):
            proof.append((level[sibling_idx], direction))
        else:
            proof.append((level[index], "right"))  # duplicate
        index //= 2
    return proof

def verify_proof(block: bytes, proof: list[tuple[bytes, str]], root: bytes) -> bool:
    """Verify a block belongs to the tree with the given root."""
    current = sha256(block)
    for sibling, direction in proof:
        if direction == "right":
            current = sha256(current + sibling)
        else:
            current = sha256(sibling + current)
    return current == root
```

Usage:

```python
blocks = [b"tx0", b"tx1", b"tx2", b"tx3"]
tree = build_merkle_tree(blocks)
root = tree[-1][0]

# Prove tx2 is in the tree
proof = get_merkle_proof(tree, 2)
assert verify_proof(b"tx2", proof, root)  # True

# Tampered data fails
assert not verify_proof(b"tx2_fake", proof, root)  # False
```

## Why Not Just Hash Everything Together?

You might wonder: why not concatenate all blocks and hash once? That gives a single checksum too. The difference is granularity:

```
  Flat hash:   H(A || B || C || D)
  - Verify: must have ALL data, O(n) work
  - Pinpoint corruption: impossible without all data
  - Sync: must transfer everything

  Merkle tree:  H( H(A|B) || H(C|D) )
  - Verify one block: O(log n) proof
  - Pinpoint corruption: walk the tree O(log n)
  - Sync: transfer only differing blocks
```

The tree structure gives you **logarithmic verification** and **surgical data repair** — critical when your dataset is terabytes across thousands of machines.

## References

1. Merkle, R. (1979). ["A Certified Digital Signature"](https://link.springer.com/chapter/10.1007/0-387-34805-0_21). Advances in Cryptology — CRYPTO '89.
2. Nakamoto, S. (2008). [Bitcoin: A Peer-to-Peer Electronic Cash System](https://bitcoin.org/bitcoin.pdf). Section 8: Simplified Payment Verification.
3. DeCandia, G. et al. (2007). ["Dynamo: Amazon's Highly Available Key-value Store"](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf). SOSP '07.
4. Laurie, B. et al. (2013). [RFC 6962 — Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962). IETF.
5. Apache Cassandra source: [`MerkleTree.java`](https://github.com/apache/cassandra/blob/trunk/src/java/org/apache/cassandra/utils/MerkleTree.java).
6. Git internals: [Pro Git — Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).
