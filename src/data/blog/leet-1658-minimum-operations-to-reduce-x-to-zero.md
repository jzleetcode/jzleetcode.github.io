---
author: JZ
pubDatetime: 2026-11-14T19:44:16Z
modDatetime: 2026-11-14T19:44:16Z
title: LeetCode 1658 Minimum Operations to Reduce X to Zero
featured: false
tags:
  - a-array
  - a-sliding-window
  - a-prefix-sum
  - a-hash-table
description: "Solutions for LeetCode 1658, medium, tags: array, sliding window, prefix sum, hash table."
---

## Table of contents

## Description

Question Link: [LeetCode 1658](https://leetcode.com/problems/minimum-operations-to-reduce-x-to-zero/description/)

Given an integer array `nums` and an integer `x`, one operation removes either the leftmost or rightmost value and subtracts it from `x`. Return the fewest operations needed to make `x` exactly zero, or `-1` if that is impossible.

**Constraints:**

- $1 \leq nums.length \leq 10^5$
- $1 \leq nums[i] \leq 10^4$
- $1 \leq x \leq 10^9$

## Idea

Every set of removals takes a prefix from the left and a suffix from the right. Instead of choosing those pieces, keep the longest contiguous subarray whose sum is `sum(nums) - x`. The number removed is `nums.length - kept.length`. If `sum(nums) - x` is negative, no such subarray can exist and the answer is `-1`.

For `nums = [1, 1, 4, 2, 3]` and `x = 5`, the total is 11, so keep a subarray summing to 6:

```text
nums:     1  1  4 | 2  3
kept:    [--- 6 ---]
removed:             2 + 3 = 5
```

The kept prefix has length 3, so two operations remove the suffix.

### Sliding window

All `nums[i]` are positive, so expanding the right edge only increases the window sum. Whenever the sum exceeds the target, move the left edge until the sum is small enough. Record the longest window equal to the target. Each index enters and leaves the window at most once.

Complexity: Time $O(n)$, Space $O(1)$.

### Prefix sum map

Scan prefix sums and remember the earliest index for each sum. If the current prefix is `p`, a subarray ending here sums to the target when the map contains `p - target`. Keeping the earliest index maximizes that subarray's length. The hash map stores at most one entry per prefix and gives an expected constant-time lookup for each index.

Complexity: Time $O(n)$ expected, Space $O(n)$.

### Java

```java []
package sliding;

import java.util.HashMap;
import java.util.Map;

/**
 * LeetCode 1658, medium, tags: array, hash table, sliding window, prefix sum.
 * Remove elements from either end of a positive integer array to reduce x to zero.
 * Keeping the longest subarray with sum total - x minimizes the number removed.
 */
@SuppressWarnings("unused")
public final class MinimumOperationsToReduceXToZero {

    private MinimumOperationsToReduceXToZero() {
    }

    // Positive-number sliding window. O(n) time, O(1) extra space.
    public static int minOperations(int[] nums, int x) {
        int target = -x;
        for (int num : nums) target += num;
        if (target < 0) return -1;
        if (target == 0) return nums.length;

        int left = 0, sum = 0, longest = -1;
        for (int right = 0; right < nums.length; right++) {
            sum += nums[right];
            while (sum > target) sum -= nums[left++];
            if (sum == target) longest = Math.max(longest, right - left + 1);
        }
        return longest == -1 ? -1 : nums.length - longest;
    }

    // Earliest prefix indices maximize the retained length. O(n) time, O(n) extra space.
    public static int minOperationsByPrefixSum(int[] nums, int x) {
        int target = -x;
        for (int num : nums) target += num;
        if (target < 0) return -1;
        if (target == 0) return nums.length;

        Map<Integer, Integer> earliest = new HashMap<>();
        earliest.put(0, -1);
        int prefix = 0, longest = -1;
        for (int right = 0; right < nums.length; right++) {
            prefix += nums[right];
            Integer left = earliest.get(prefix - target);
            if (left != null) longest = Math.max(longest, right - left);
            earliest.putIfAbsent(prefix, right);
        }
        return longest == -1 ? -1 : nums.length - longest;
    }
}
```

### Python

```python []
class Solution:
    def minOperations(self, nums: list[int], x: int) -> int:
        target = sum(nums) - x
        if target < 0:
            return -1

        left = 0
        window_sum = 0
        longest = -1
        # O(n) time: each index enters and leaves the window once; O(1) extra space.
        for right, value in enumerate(nums):
            window_sum += value
            while window_sum > target:
                window_sum -= nums[left]
                left += 1
            if window_sum == target:
                longest = max(longest, right - left + 1)

        return -1 if longest < 0 else len(nums) - longest


class Solution2:
    def minOperations(self, nums: list[int], x: int) -> int:
        target = sum(nums) - x
        if target < 0:
            return -1

        earliest_index = {0: -1}
        prefix_sum = 0
        longest = 0 if target == 0 else -1
        # O(n) time and O(n) extra space for the earliest index of each prefix sum.
        for index, value in enumerate(nums):
            prefix_sum += value
            needed = prefix_sum - target
            if needed in earliest_index:
                longest = max(longest, index - earliest_index[needed])
            earliest_index.setdefault(prefix_sum, index)

        return -1 if longest < 0 else len(nums) - longest
```

### C++

```cpp []
#pragma once
#include <algorithm>
#include <numeric>
#include <unordered_map>
#include <vector>

using namespace std;

class SolutionMinimumOperationsToReduceXToZero {
public:
    // LeetCode 1658: keep the longest window summing to total - x.
    // Positive elements allow a sliding window: O(n) time, O(1) extra space.
    static int minOperations(const vector<int>& nums, int x) {
        const int target = accumulate(nums.begin(), nums.end(), 0) - x;
        if (target < 0) return -1;

        const int n = static_cast<int>(nums.size());
        int left = 0, sum = 0, longest = target == 0 ? 0 : -1;
        for (int right = 0; right < n; ++right) {
            sum += nums[right];
            while (left <= right && sum > target) sum -= nums[left++];
            if (sum == target) longest = max(longest, right - left + 1);
        }
        return longest < 0 ? -1 : n - longest;
    }

    // Keep the earliest index of each prefix to maximize the retained window.
    // O(n) expected time, O(n) extra space.
    static int minOperationsByPrefixSum(const vector<int>& nums, int x) {
        const int target = accumulate(nums.begin(), nums.end(), 0) - x;
        if (target < 0) return -1;

        const int n = static_cast<int>(nums.size());
        unordered_map<int, int> earliest{{0, -1}};
        int prefix = 0, longest = target == 0 ? 0 : -1;
        for (int i = 0; i < n; ++i) {
            prefix += nums[i];
            auto found = earliest.find(prefix - target);
            if (found != earliest.end()) longest = max(longest, i - found->second);
            earliest.emplace(prefix, i);
        }
        return longest < 0 ? -1 : n - longest;
    }
};
```

### Rust

```rust []
use std::collections::HashMap;

/// LeetCode 1658: Minimum Operations to Reduce X to Zero.
pub struct Solution;

impl Solution {
    /// Keep the longest window summing to total - x; nums contains positive values.
    /// O(n) time and O(1) extra space.
    pub fn min_operations(nums: &[i32], x: i32) -> i32 {
        let target = nums.iter().map(|&num| i64::from(num)).sum::<i64>() - i64::from(x);
        if target < 0 {
            return -1;
        }
        if target == 0 {
            return nums.len() as i32;
        }

        let (mut left, mut sum, mut longest) = (0, 0_i64, None);
        for (right, &num) in nums.iter().enumerate() {
            sum += i64::from(num);
            while sum > target {
                sum -= i64::from(nums[left]);
                left += 1;
            }
            if sum == target {
                longest = Some(longest.unwrap_or(0).max(right + 1 - left));
            }
        }
        longest.map_or(-1, |length| (nums.len() - length) as i32)
    }

    /// Earliest prefix indices maximize the retained subarray's length.
    /// O(n) expected time and O(n) extra space.
    pub fn min_operations_by_prefix_sum(nums: &[i32], x: i32) -> i32 {
        let target = nums.iter().map(|&num| i64::from(num)).sum::<i64>() - i64::from(x);
        if target < 0 {
            return -1;
        }

        let mut earliest = HashMap::from([(0_i64, 0_usize)]);
        let mut prefix = 0_i64;
        let mut longest = if target == 0 { Some(0) } else { None };
        for (index, &num) in nums.iter().enumerate() {
            prefix += i64::from(num);
            if let Some(&start) = earliest.get(&(prefix - target)) {
                longest = Some(longest.unwrap_or(0).max(index + 1 - start));
            }
            earliest.entry(prefix).or_insert(index + 1);
        }
        longest.map_or(-1, |length| (nums.len() - length) as i32)
    }
}
```
