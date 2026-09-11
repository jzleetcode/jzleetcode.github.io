---
author: JZ
pubDatetime: 2026-09-11T06:00:00Z
modDatetime: 2026-09-11T06:00:00Z
title: LeetCode 96 Unique Binary Search Trees
featured: true
tags:
  - a-dp
  - a-math
  - a-tree
  - a-binary-search-tree
description:
  "Solutions for LeetCode 96, medium, tags: math, dynamic programming, tree, binary search tree."
---

## Table of contents

## Description

Question Links: [LeetCode 96](https://leetcode.com/problems/unique-binary-search-trees/description/)

Given an integer `n`, return the number of structurally unique **BST's** (binary search trees) which has exactly `n` nodes of unique values from `1` to `n`.

```
Example 1:

Input: n = 3
Output: 5

Example 2:

Input: n = 1
Output: 1
```

**Constraints:**

- `1 <= n <= 19`

## Idea1

This is the [Catalan number](https://en.wikipedia.org/wiki/Catalan_number) problem. For `n` nodes, pick each node `i` (1..n) as the root. The left subtree has `i-1` nodes and the right subtree has `n-i` nodes. The total count is the product of the two subtree counts, summed over all choices of root:

$$G(n) = \sum_{i=1}^{n} G(i-1) \cdot G(n-i)$$

Base case: $G(0) = G(1) = 1$.

```
n = 3, nodes {1, 2, 3}:

root=1:  1        root=2:    2      root=3:    3
          \                / \              /
          {2,3}          1     3        {1,2}
        (2 trees)      (1 tree)       (2 trees)

G(3) = G(0)*G(2) + G(1)*G(1) + G(2)*G(0)
     = 1*2 + 1*1 + 2*1
     = 5
```

We build up the `dp` table bottom-up from 0 to n.

Complexity: Time $O(n^2)$, Space $O(n)$.

### Java

```java []
public static int numTreesDP(int n) {
    int[] dp = new int[n + 1];
    dp[0] = 1;
    if (n >= 1) dp[1] = 1;
    // O(n^2) time, O(n) space
    for (int nodes = 2; nodes <= n; nodes++) {
        for (int root = 1; root <= nodes; root++) {
            dp[nodes] += dp[root - 1] * dp[nodes - root];
        }
    }
    return dp[n];
}
```

### Python

```python []
def numTrees(self, n: int) -> int:
    if n <= 1:
        return 1
    dp = [0] * (n + 1)
    dp[0] = dp[1] = 1
    for nodes in range(2, n + 1):  # O(n)
        for root in range(1, nodes + 1):  # O(n) — pick each node as root
            dp[nodes] += dp[root - 1] * dp[nodes - root]
    return dp[n]
```

### C++

```cpp []
int numTrees(int n) {
    vector<int> dp(n + 1, 0);
    dp[0] = 1;
    for (int i = 1; i <= n; i++) // O(n)
        for (int j = 1; j <= i; j++) // O(n)
            dp[i] += dp[j - 1] * dp[i - j];
    return dp[n];
}
```

### Rust

```rust []
pub fn num_trees(n: i32) -> i32 {
    let n = n as usize;
    let mut dp = vec![0i32; n + 1];
    dp[0] = 1;
    if n >= 1 {
        dp[1] = 1;
    }
    // O(n^2): for each node count, sum over all possible roots
    for nodes in 2..=n {
        for root in 1..=nodes {
            dp[nodes] += dp[root - 1] * dp[nodes - root];
        }
    }
    dp[n]
}
```

## Idea2

The Catalan number has a closed-form formula:

$$C(n) = \frac{C(2n, n)}{n+1} = \frac{(2n)!}{(n+1)! \cdot n!}$$

We can compute this iteratively without factorials by using the recurrence:

$$C(n) = C(n-1) \cdot \frac{2(2n-1)}{n+1}$$

which rearranges to `c = c * 2 * (2*i + 1) / (i + 2)` when iterating `i` from 0 to n-1. This avoids overflow by keeping divisions exact at each step (Catalan numbers are always integers).

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public static int numTreesCatalan(int n) {
    long c = 1;
    // O(n) time, O(1) space
    for (int i = 0; i < n; i++) {
        c = c * 2 * (2 * i + 1) / (i + 2);
    }
    return (int) c;
}
```

### Python

```python []
def numTrees(self, n: int) -> int:
    c = 1
    for i in range(n):  # O(n)
        c = c * 2 * (2 * i + 1) // (i + 2)
    return c
```

### C++

```cpp []
int numTrees(int n) {
    long long result = 1;
    for (int i = 0; i < n; i++) {
        result = result * (2 * n - i) / (i + 1);
    }
    return static_cast<int>(result / (n + 1));
}
```

### Rust

```rust []
pub fn num_trees_catalan(n: i32) -> i32 {
    let mut c: i64 = 1;
    // O(n): iterative Catalan computation
    for i in 0..n as i64 {
        c = c * 2 * (2 * i + 1) / (i + 2);
    }
    c as i32
}
```
