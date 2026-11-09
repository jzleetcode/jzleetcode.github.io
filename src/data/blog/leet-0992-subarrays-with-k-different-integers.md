---
author: JZ
pubDatetime: 2026-11-09T19:57:17Z
modDatetime: 2026-11-09T19:57:17Z
title: LeetCode 992 Subarrays with K Different Integers
featured: true
tags:
  - a-array
  - a-hash-table
  - a-sliding-window
description:
  "Count subarrays with exactly k distinct values by subtracting two sliding-window counts."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 992: Subarrays with K Different Integers](https://leetcode.com/problems/subarrays-with-k-different-integers/description/)

Given an integer array `nums` and an integer `k`, return the number of **non-empty subarrays** that contain exactly `k` distinct integers. A subarray is a contiguous, non-empty part of the array.

**Example 1:**

```text
Input: nums = [1, 2, 1, 2, 3], k = 2
Output: 7
Explanation: The seven subarrays are [1,2], [2,1], [1,2], [1,2,1],
[2,1,2], [1,2,1,2], and [2,3].
```

**Example 2:**

```text
Input: nums = [1, 2, 1, 3, 4], k = 3
Output: 3
Explanation: [1,2,1,3], [2,1,3], and [1,3,4] each contain exactly three distinct integers.
```

**Constraints:**

- `1 <= nums.length <= 2 * 10^4`
- `1 <= nums[i] <= nums.length`
- `1 <= k <= nums.length`

## Idea

Counting subarrays with **at most** `k` distinct values is easier than counting exactly `k`. The two counts are related:

```text
exactly(k) = atMost(k) - atMost(k - 1)
```

Every subarray with at most `k` distinct values either has exactly `k` or at most `k - 1`. Subtracting the latter leaves the subarrays with exactly `k`.

To calculate `atMost(limit)`, slide a window across the array and keep a frequency map for its values. Move the right boundary forward one index at a time. If the window has more than `limit` distinct values, advance the left boundary and decrement those values' frequencies until the window is valid again. For a fixed right boundary, every start between `left` and `right` produces a valid subarray, so add `right - left + 1` to the count.

For Example 1 with `k = 2`, the number added at each right boundary is:

| Right value | Valid window for at most 2 | Count | Valid window for at most 1 | Count | Difference |
| ---: | :--- | ---: | :--- | ---: | ---: |
| 1 | `[1]` | 1 | `[1]` | 1 | 0 |
| 2 | `[1, 2]` | 2 | `[2]` | 1 | 1 |
| 1 | `[1, 2, 1]` | 3 | `[1]` | 1 | 2 |
| 2 | `[1, 2, 1, 2]` | 4 | `[2]` | 1 | 3 |
| 3 | `[2, 3]` | 2 | `[3]` | 1 | 1 |

The differences sum to `0 + 1 + 2 + 3 + 1 = 7`.

Each boundary moves forward at most `n` times in one pass. The two `atMost` passes therefore take **O(n)** expected time with a hash map and use **O(n)** space in the worst case.

### Java

```java []
package sliding;

import java.util.HashMap;
import java.util.Map;

/**
 * LeetCode 992, hard, tags: array, hash table, sliding window.
 * <p>
 * Return the number of subarrays containing exactly k distinct integers.
 */
@SuppressWarnings("unused")
public final class SubarraysWithKDistinct {

    private SubarraysWithKDistinct() {
    }

    // O(n) time, O(n) space: each window boundary moves at most n positions.
    public static int subarraysWithKDistinct(int[] nums, int k) {
        return atMostDistinct(nums, k) - atMostDistinct(nums, k - 1);
    }

    // Counts subarrays with at most k distinct integers. O(n) time and O(n) space.
    private static int atMostDistinct(int[] nums, int k) {
        if (k <= 0) return 0;

        Map<Integer, Integer> frequencies = new HashMap<>();
        int left = 0, count = 0;
        for (int right = 0; right < nums.length; right++) {
            frequencies.merge(nums[right], 1, Integer::sum);
            while (frequencies.size() > k) {
                int leftValue = nums[left++];
                frequencies.merge(leftValue, -1, Integer::sum);
                if (frequencies.get(leftValue) == 0) frequencies.remove(leftValue);
            }
            count += right - left + 1;
        }
        return count;
    }
}
```

### Python

```python []
class Solution:
    def subarraysWithKDistinct(self, nums: list[int], k: int) -> int:
        """Count subarrays with exactly k distinct values in O(n) expected time and O(n) space."""
        return self._count_at_most_k(nums, k) - self._count_at_most_k(nums, k - 1)

    @staticmethod
    def _count_at_most_k(nums: list[int], k: int) -> int:
        if k == 0:
            return 0

        frequencies: dict[int, int] = {}
        left = 0
        total = 0

        for right, value in enumerate(nums):  # O(n) right-boundary advances
            frequencies[value] = frequencies.get(value, 0) + 1

            # Each left-boundary advance removes one item, so all shrinking is O(n) total.
            while len(frequencies) > k:
                left_value = nums[left]
                frequencies[left_value] -= 1
                if frequencies[left_value] == 0:
                    del frequencies[left_value]
                left += 1

            total += right - left + 1  # every start in [left, right] is valid

        return total
```

### C++

```cpp []
#ifndef SUBARRAYS_WITH_K_DISTINCT_HPP
#define SUBARRAYS_WITH_K_DISTINCT_HPP

#include <vector>
#include <unordered_map>
using namespace std;

// LeetCode 992. Sliding window with atMost(K) - atMost(K - 1).
// O(n) time, O(n) space.
class SubarraysWithKDistinct {
public:
    static int subarraysWithKDistinct(const vector<int>& nums, int k) {
        auto atMost = [&nums](int distinctLimit) {
            if (distinctLimit < 0) return 0LL;

            unordered_map<int, int> freq;
            long long count = 0;
            int left = 0;
            for (int right = 0; right < (int)nums.size(); ++right) {
                if (++freq[nums[right]] == 1) distinctLimit--;
                while (distinctLimit < 0) {
                    if (--freq[nums[left]] == 0) {
                        freq.erase(nums[left]);
                        distinctLimit++;
                    }
                    left++;
                }
                count += right - left + 1;
            }
            return count;
        };

        return (int)(atMost(k) - atMost(k - 1));
    }
};

#endif
```

### Rust

```rust []
use std::collections::HashMap;

pub struct Solution;

impl Solution {
    /// Sliding window + HashMap approach.
    /// O(n) time, O(n) space.
    /// The number of subarrays with exactly k distinct values is
    /// at_most(k) - at_most(k - 1).
    pub fn subarrays_with_k_distinct(nums: Vec<i32>, k: i32) -> i32 {
        let k = k as usize;
        Self::at_most(&nums, k) - Self::at_most(&nums, k - 1)
    }

    fn at_most(nums: &[i32], distinct_limit: usize) -> i32 {
        if distinct_limit == 0 {
            return 0;
        }

        let mut frequencies: HashMap<i32, usize> = HashMap::new();
        let mut left = 0usize;
        let mut count = 0usize;

        for right in 0..nums.len() {
            *frequencies.entry(nums[right]).or_insert(0) += 1;

            while frequencies.len() > distinct_limit {
                let left_value = nums[left];
                let frequency = frequencies.get_mut(&left_value).unwrap();
                *frequency -= 1;
                if *frequency == 0 {
                    frequencies.remove(&left_value);
                }
                left += 1;
            }

            count += right - left + 1;
        }

        count as i32
    }
}
```
