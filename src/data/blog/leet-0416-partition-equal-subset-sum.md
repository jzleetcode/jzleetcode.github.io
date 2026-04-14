---
author: JZ
pubDatetime: 2026-04-14T06:23:00Z
modDatetime: 2026-04-14T06:23:00Z
title: LeetCode 416 Partition Equal Subset Sum
featured: true
tags:
  - a-array
  - a-dynamic-programming
  - a-bit-manipulation
description:
  "Solutions for LeetCode 416, medium, tags: array, dynamic programming, bit manipulation."
---

## Table of contents

## Description

Question links: [LeetCode 416](https://leetcode.com/problems/partition-equal-subset-sum/description/).

Given an integer array `nums`, return `true` if you can partition the array into two subsets such that the sum of the elements in both subsets is equal or `false` otherwise.

```
Example 1:

Input: nums = [1,5,11,5]
Output: true
Explanation: The array can be partitioned as [1, 5, 5] and [11].

Example 2:

Input: nums = [1,2,3,5]
Output: false
Explanation: The array cannot be partitioned into equal sum subsets.
```

**Constraints:**

- `1 <= nums.length <= 200`
- `1 <= nums[i] <= 100`

## Idea1

This is essentially a 0/1 knapsack problem. We need to determine whether we can select a subset of `nums` that sums to `total / 2`. If the total sum is odd, we can immediately return `false`.

We use a 1D boolean DP array where `dp[j]` indicates whether sum `j` is achievable using a subset of the elements seen so far. We initialize `dp[0] = true` (empty subset sums to 0).

For each number `num`, we iterate **backward** from `target` down to `num`. This backward iteration ensures each element is used at most once (0/1 knapsack property). If we iterated forward, we might use the same element multiple times.

```
nums = [1, 5, 11, 5], total = 22, target = 11

dp initially: [T, F, F, F, F, F, F, F, F, F, F, F]
                0  1  2  3  4  5  6  7  8  9 10 11

After num=1:  [T, T, F, F, F, F, F, F, F, F, F, F]
After num=5:  [T, T, F, F, F, T, T, F, F, F, F, F]
After num=11: [T, T, F, F, F, T, T, F, F, F, F, T]  <- dp[11]=true
```

Complexity: Time $O(n \times target)$, Space $O(target)$, where $target = sum / 2$.

### Java

```java []
// dp boolean array. O(n*target) time, O(target) space.
public boolean canPartitionDP(int[] nums) {
    int sum = 0;
    for (int num : nums) sum += num; // O(n)
    if (sum % 2 != 0) return false;
    int target = sum / 2;
    boolean[] dp = new boolean[target + 1]; // dp[j]: whether sum j is reachable
    dp[0] = true;
    for (int num : nums) // O(n)
        for (int j = target; j >= num; j--) // O(target), iterate backward to avoid using num twice
            dp[j] = dp[j] || dp[j - num];
    return dp[target];
}
```

### Python

```python []
class Solution:
    """dp with boolean array, O(n*target) time, O(target) space."""

    def canPartition(self, nums: list[int]) -> bool:
        total = sum(nums)
        if total % 2 != 0:
            return False
        target = total // 2
        dp = [False] * (target + 1)  # O(target) space
        dp[0] = True
        for num in nums:  # O(n) outer loop
            for j in range(target, num - 1, -1):  # O(target) inner loop, iterate backward to avoid reuse
                dp[j] = dp[j] or dp[j - num]
        return dp[target]
```

### C++

```cpp []
// dp boolean vector. O(n*target) time, O(target) space.
bool canPartition(vector<int> &nums) {
    int sum = accumulate(nums.begin(), nums.end(), 0);
    if (sum % 2 != 0) return false;
    int target = sum / 2;
    vector<bool> dp(target + 1, false);
    dp[0] = true;
    for (int num : nums) // O(n)
        for (int j = target; j >= num; j--) // O(target), backward to avoid reuse
            dp[j] = dp[j] || dp[j - num];
    return dp[target];
}
```

### Rust

```rust []
/// DP boolean vec. O(n*target) time, O(target) space.
pub fn can_partition(nums: Vec<i32>) -> bool {
    let total: i32 = nums.iter().sum();
    if total % 2 != 0 {
        return false;
    }
    let target = total as usize / 2;
    let mut dp = vec![false; target + 1];
    dp[0] = true;
    for num in nums { // O(n) outer loop
        let num = num as usize;
        for j in (num..=target).rev() { // O(target) inner loop, backward
            dp[j] = dp[j] || dp[j - num];
        }
    }
    dp[target]
}
```

## Idea2

Instead of a boolean array, we can use a **bitset** where bit `j` being set means sum `j` is reachable. Shifting the bitset left by `num` and OR-ing it with itself achieves the same DP transition in one operation, leveraging hardware word-level parallelism.

```
nums = [1, 5, 11, 5], target = 11

bits initially:   ...00000000001  (bit 0 set)
bits |= bits<<1:  ...00000000011  (bits 0,1 set)
bits |= bits<<5:  ...00001100011  (bits 0,1,5,6 set)
bits |= bits<<11: ...10000001100011  (bits 0,1,5,6,11,... set)
bit 11 is set -> true
```

Complexity: Time $O(n \times target / w)$, Space $O(target / w)$, where $w$ is the word size (32 or 64).

### Java

```java []
// bitset. O(n*target) time, O(target) space.
public boolean canPartitionBitSet(int[] nums) {
    int sum = 0;
    for (int num : nums) sum += num; // O(n)
    if (sum % 2 != 0) return false;
    int target = sum / 2;
    BitSet bits = new BitSet(target + 1);
    bits.set(0);
    for (int num : nums) // O(n)
        bits.or(shiftLeft(bits, num, target)); // O(target), OR with shifted copy
    return bits.get(target);
}

private BitSet shiftLeft(BitSet bits, int shift, int limit) {
    BitSet shifted = new BitSet(limit + 1);
    for (int i = bits.nextSetBit(0); i >= 0 && i + shift <= limit; i = bits.nextSetBit(i + 1))
        shifted.set(i + shift);
    return shifted;
}
```

### Python

```python []
class Solution2:
    """dp with bitset (integer), O(n*target) time, O(target) space."""

    def canPartition(self, nums: list[int]) -> bool:
        total = sum(nums)
        if total % 2 != 0:
            return False
        target = total // 2
        bits = 1  # bit 0 is set, meaning sum 0 is reachable
        for num in nums:  # O(n) outer loop
            bits |= bits << num  # O(target) shift and or
        return bool(bits & (1 << target))
```

### C++

```cpp []
// bitset. O(n*target/w) time, O(target/w) space.
bool canPartition2(vector<int> &nums) {
    int sum = accumulate(nums.begin(), nums.end(), 0);
    if (sum % 2 != 0) return false;
    int target = sum / 2;
    bitset<10001> dp;
    dp.set(0);
    for (int num : nums) // O(n)
        dp |= (dp << num); // O(target/w), word-level parallelism
    return dp.test(target);
}
```

### Rust

```rust []
/// Bitwise bitset with Vec<u64>. O(n*target/64) time, O(target/64) space.
pub fn can_partition_bitset(nums: Vec<i32>) -> bool {
    let total: i32 = nums.iter().sum();
    if total % 2 != 0 {
        return false;
    }
    let target = total as usize / 2;
    let words = target / 64 + 1;
    let mut bits = vec![0u64; words];
    bits[0] = 1; // bit 0 set

    for num in nums { // O(n) outer loop
        let num = num as usize;
        let word_shift = num / 64;
        let bit_shift = num % 64;
        // OR bits with (bits << num), iterating from high to low
        for i in (0..words).rev() { // O(target/64)
            let mut val = 0u64;
            if i >= word_shift {
                let src = i - word_shift;
                val = bits[src] << bit_shift;
                if bit_shift > 0 && src > 0 {
                    val |= bits[src - 1] >> (64 - bit_shift);
                }
            }
            bits[i] |= val;
        }
    }
    bits[target / 64] & (1u64 << (target % 64)) != 0
}
```
