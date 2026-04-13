---
author: JZ
pubDatetime: 2026-04-07T08:00:00Z
modDatetime: 2026-04-07T08:00:00Z
title: LeetCode 3653 XOR After Range Multiplication Queries I
featured: false
tags:
  - a-array
  - a-simulation
description:
  "Solutions for LeetCode 3653, medium, tags: array, simulation."
---

## Table of contents

## Description

You have an integer array `nums` of length `n` and a 2D integer array `queries` of size `q`, where `queries[i] = [lᵢ, rᵢ, kᵢ, vᵢ]`.

For each query, apply these operations in order:

1. Set `idx = lᵢ`
2. While `idx ≤ rᵢ`:
   - Update: `nums[idx] = (nums[idx] * vᵢ) % (10⁹ + 7)`
   - Set `idx += kᵢ`

Return the bitwise XOR of all elements in `nums` after processing all queries.

```
Example 1:

Input: nums = [1,1,1], queries = [[0,2,1,4]]
Output: 4
Explanation: Query multiplies every element (indices 0–2) by 4, yielding [4,4,4].
XOR result: 4 ^ 4 ^ 4 = 4.

Example 2:

Input: nums = [2,3,1,5,4], queries = [[1,4,2,3],[0,2,1,2]]
Output: 31
Explanation: After first query: [2,9,1,15,4]. After second query: [4,18,2,15,4].
XOR: 4 ^ 18 ^ 2 ^ 15 ^ 4 = 31.
```

**Constraints:**

- `1 ≤ n = nums.length ≤ 10³`
- `1 ≤ nums[i] ≤ 10⁹`
- `1 ≤ q = queries.length ≤ 10³`
- `0 ≤ lᵢ ≤ rᵢ < n`
- `1 ≤ kᵢ ≤ n`
- `1 ≤ vᵢ ≤ 10⁵`

## Idea

Given the small constraints ($n, q \le 10^3$), we can directly simulate each query. For each query `[l, r, k, v]`, iterate from index `l` to `r` with step `k`, multiplying the element at each index by `v` modulo $10^9 + 7$. After processing all queries, XOR all elements together.

```
nums = [2, 3, 1, 5, 4]

Query 1: l=1, r=4, k=2, v=3
  idx=1: nums[1] = 3*3 = 9
  idx=3: nums[3] = 5*3 = 15
  → [2, 9, 1, 15, 4]

Query 2: l=0, r=2, k=1, v=2
  idx=0: nums[0] = 2*2 = 4
  idx=1: nums[1] = 9*2 = 18
  idx=2: nums[2] = 1*2 = 2
  → [4, 18, 2, 15, 4]

XOR: 4 ^ 18 ^ 2 ^ 15 ^ 4 = 31
```

Note: use 64-bit integers for the multiplication before taking the modulo to avoid overflow in statically typed languages.

Complexity: Time $O(q \cdot n)$, Space $O(1)$.

### Java

```java
// 1ms, 45.7mb. simulation, q*n time, 1 space.
static final long MOD = 1_000_000_007L;

public static int xorAfterRangeMultiplicationQueries(int[] nums, int[][] queries) {
    for (int[] q : queries) {
        int l = q[0], r = q[1], k = q[2], v = q[3];
        for (int idx = l; idx <= r; idx += k) {
            nums[idx] = (int) ((long) nums[idx] * v % MOD);
        }
    }
    int res = 0;
    for (int x : nums) {
        res ^= x;
    }
    return res;
}
```

### Python

```python
class Solution:
    """O(q*n) time, O(1) space. n: nums length, q: queries length."""

    def xorAfterRangeMultiplicationQueries(self, nums: list[int], queries: list[list[int]]) -> int:
        for l, r, k, v in queries:
            for idx in range(l, r + 1, k):
                nums[idx] = nums[idx] * v % MOD
        res = 0
        for x in nums:
            res ^= x
        return res
```

### C++

```cpp
// simulation, q*n time, 1 space.
static constexpr long long MOD = 1'000'000'007;

int xorAfterRangeMultiplicationQueries(vector<int> &nums, vector<vector<int>> &queries) {
    for (auto &q : queries) {
        int l = q[0], r = q[1], k = q[2], v = q[3];
        for (int idx = l; idx <= r; idx += k)
            nums[idx] = (long long)nums[idx] * v % MOD;
    }
    int res = 0;
    for (int x : nums)
        res ^= x;
    return res;
}
```

### Rust

```rust
// lc 3653, simulation, O(q*n) time, O(1) space.
pub fn xor_after_range_multiplication_queries(mut nums: Vec<i32>, queries: Vec<Vec<i32>>) -> i32 {
    for q in &queries {
        let (l, r, k, v) = (q[0] as usize, q[1] as usize, q[2] as usize, q[3] as i64);
        let mut idx = l;
        while idx <= r {
            nums[idx] = (nums[idx] as i64 * v % MOD) as i32;
            idx += k;
        }
    }
    nums.iter().fold(0, |acc, &x| acc ^ x)
}
```
