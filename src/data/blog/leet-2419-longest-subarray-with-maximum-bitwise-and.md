---
author: JZ
pubDatetime: 2026-10-17T18:56:12Z
modDatetime: 2026-10-17T18:56:12Z
title: LeetCode 2419 Longest Subarray With Maximum Bitwise AND
featured: true
tags:
  - a-array
  - a-bit
description: "Solution for LeetCode 2419, medium, tags: array, bit manipulation."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 2419: Longest Subarray With Maximum Bitwise AND](https://leetcode.com/problems/longest-subarray-with-maximum-bitwise-and/description/)

Given an array `nums`, consider all non-empty contiguous subarrays. Find the largest bitwise AND achievable by any of them, then return the **length of the longest subarray** achieving that value.

Examples:

- `nums = [1, 2, 3, 3, 2, 2]` → `2` (`[3, 3]` has AND `3`).
- `nums = [1, 2, 3, 4]` → `1` (`[4]` has AND `4`).

Constraints:

- `1 <= nums.length <= 10^5`
- `1 <= nums[i] <= 10^6`

## Idea

Bitwise AND cannot be greater than any of its operands. A single-element subarray containing the array maximum, `M`, achieves AND `M`, so `M` is the largest possible AND. To get AND `M` from a longer subarray, **every element must equal `M`**: each element is at most `M`, and AND cannot exceed it. The problem is therefore to find the longest consecutive run of the maximum number.

Track the largest number seen so far, the current run of that number, and the longest such run. A new maximum makes every previous run irrelevant, so reset both lengths to one. An equal number extends the current run; a smaller number ends it.

```text
nums:           4  4  4  2  6  6  3
maximum seen:   4  4  4  4  6  6  6
current run:    1  2  3  0  1  2  0
longest run:    1  2  3  3  1  2  2
                            ^ new maximum resets the old best
```

Only this single-pass solution is needed; a separate pass to find the maximum would use the same algorithmic idea without improving its complexity.

## Complexity

For `n = nums.length`, **time is $O(n)$** because we visit each number once. **Extra space is $O(1)$** for three counters.

### Java

The repository uses a static utility class in its `bit` package. To submit on LeetCode, rename it `Solution` and use an instance method.

```java []
package bit;

/**
 * LeetCode 2419, medium. For nonnegative values, a subarray's bitwise AND cannot exceed any of
 * its elements, so the largest possible AND is the array maximum. Only a run of that maximum
 * can attain it. O(n) time and O(1) space.
 */
public final class LongestSubarrayWithMaximumBitwiseAnd {

    private LongestSubarrayWithMaximumBitwiseAnd() {
    }

    public static int longestSubarray(int[] nums) {
        int maximum = Integer.MIN_VALUE;
        int run = 0;
        int best = 0;

        for (int num : nums) {
            if (num > maximum) {
                maximum = num;
                run = 1;
                best = 1;
            } else if (num == maximum) {
                run++;
                best = Math.max(best, run);
            } else {
                run = 0;
            }
        }

        return best;
    }
}
```

### Python

```python []
from typing import List


class Solution:
    def longestSubarray(self, nums: List[int]) -> int:
        maximum = 0
        current_run = 0
        longest = 0

        for number in nums:  # O(n) time; O(1) extra space.
            if number > maximum:
                maximum = number
                current_run = 1
                longest = 1
            elif number == maximum:
                current_run += 1
                longest = max(longest, current_run)
            else:
                current_run = 0

        return longest
```

### C++

```cpp []
#ifndef LEETCODE_LONGESTSUBARRAYWITHMAXIMUMBITWISEAND_HPP
#define LEETCODE_LONGESTSUBARRAYWITHMAXIMUMBITWISEAND_HPP

#include <vector>

using namespace std;

class Solution {
public:
    int longestSubarray(vector<int> &nums) {
        int maximum = nums[0];
        int currentStreak = 0;
        int bestStreak = 0;

        // One scan: O(n) time, O(1) space.
        for (int value : nums) {
            if (value > maximum) {
                maximum = value;
                currentStreak = 1;
                bestStreak = 1;
            } else if (value == maximum) {
                ++currentStreak;
                if (currentStreak > bestStreak) bestStreak = currentStreak;
            } else {
                currentStreak = 0;
            }
        }

        return bestStreak;
    }
};

#endif
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn longest_subarray(nums: Vec<i32>) -> i32 {
        let mut maximum = i32::MIN;
        let mut run = 0;
        let mut best = 0;

        // O(n) time, O(1) extra space.
        for num in nums {
            if num > maximum {
                maximum = num;
                run = 1;
                best = 1;
            } else if num == maximum {
                run += 1;
                best = best.max(run);
            } else {
                run = 0;
            }
        }

        best
    }
}
```
