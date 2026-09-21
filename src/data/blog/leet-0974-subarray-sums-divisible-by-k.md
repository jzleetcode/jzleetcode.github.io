---
author: JZ
pubDatetime: 2026-09-15T10:08:00Z
modDatetime: 2026-09-15T10:08:00Z
title: LeetCode 974 Subarray Sums Divisible by K
featured: false
tags:
  - a-hash
  - a-prefix-sum
description:
  "Solutions for LeetCode 974, medium, tags: array, hash table, prefix sum."
---

## Table of contents

## Description

Given an integer array `nums` and an integer `k`, return the number of non-empty subarrays that have a sum divisible by `k`.

A subarray is a contiguous part of an array.

### Constraints

- $1 \leq \text{nums.length} \leq 3 \times 10^4$
- $-10^4 \leq \text{nums}[i] \leq 10^4$
- $2 \leq k \leq 10^4$

Link: [LeetCode 974](https://leetcode.com/problems/subarray-sums-divisible-by-k/)

## Idea

This problem builds on the prefix sum technique from [LeetCode 560](/posts/leet-0560-subarray-sum-equals-k). Instead of checking if a subarray sums to exactly `k`, we check if it sums to a multiple of `k`.

**Key Insight:** If two prefix sums have the same remainder when divided by `k`, then the subarray between them has a sum divisible by `k`.

$$\text{prefix}[j] \equiv \text{prefix}[i] \pmod{k} \implies (prefix[j] - prefix[i]) \bmod k = 0$$

```
nums:       [4,  5,  0, -2, -3,  1]
prefix:     [4,  9,  9,  7,  4,  5]
prefix % 5: [4,  4,  4,  2,  4,  0]
             ^   ^   ^       ^
             these four share remainder 4
             → C(4,2) = 6 subarrays among them
             plus remainder 0 at index 4 → 1 subarray (from start)
             total = 6 + 1 = 7
```

**Algorithm:**
1. Initialize a hash map with `{0: 1}` (empty prefix has remainder `0`).
2. Maintain a running prefix sum. At each step, compute `remainder = prefix % k`.
3. For languages where `%` can return negative (Java, C++, Rust), normalize: `remainder = ((prefix % k) + k) % k`. Python's `%` always returns non-negative for positive `k`.
4. Add the count of previous prefixes with the same remainder to the result.
5. Increment the count for the current remainder.

Complexity: Time $O(n)$, Space $O(k)$ — at most `k` distinct remainders.

### Java

```java []
public int subarraysDivByK(int[] nums, int k) {
    Map<Integer, Integer> remainderCount = new HashMap<>(); // O(k) space
    remainderCount.put(0, 1);
    int prefix = 0;
    int count = 0;
    for (int num : nums) { // O(n)
        prefix += num;
        int remainder = ((prefix % k) + k) % k; // normalize negative mod
        count += remainderCount.getOrDefault(remainder, 0);
        remainderCount.merge(remainder, 1, Integer::sum);
    }
    return count;
}
```

### Python

```python []
def subarraysDivByK(self, nums: list[int], k: int) -> int:
    cnt, prefix, res = defaultdict(int), 0, 0
    cnt[0] = 1  # empty prefix
    for n in nums:  # O(n)
        prefix += n
        rem = prefix % k  # Python mod always non-negative for positive k
        res += cnt[rem]  # subarrays ending here with sum divisible by k
        cnt[rem] += 1  # O(k) space
    return res
```

### C++

```cpp []
int subarraysDivByK(vector<int> &nums, int k) {
    unordered_map<int, int> prefixCount; // O(k) space
    prefixCount[0] = 1;
    int sum = 0, count = 0;
    for (int num : nums) { // O(n)
        sum += num;
        int remainder = ((sum % k) + k) % k; // normalize negative mod
        if (prefixCount.count(remainder)) {
            count += prefixCount[remainder];
        }
        prefixCount[remainder]++;
    }
    return count;
}
```

### Rust

```rust []
pub fn subarrays_div_by_k(nums: Vec<i32>, k: i32) -> i32 {
    let mut map = HashMap::new(); // O(k) space
    map.insert(0, 1);
    let (mut prefix, mut count) = (0, 0);
    for n in nums { // O(n)
        prefix += n;
        let rem = ((prefix % k) + k) % k; // normalize negative mod
        if let Some(&c) = map.get(&rem) {
            count += c;
        }
        *map.entry(rem).or_insert(0) += 1;
    }
    count
}
```
