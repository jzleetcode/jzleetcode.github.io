---
author: JZ
pubDatetime: 2026-11-11T19:00:00Z
modDatetime: 2026-11-11T19:00:00Z
title: LeetCode 2012 Sum of Beauty in the Array
featured: true
tags:
  - a-array
description: "Solutions for LeetCode 2012, medium, tags: array, prefix maximum, suffix minimum."
---

## Table of contents

## Description

Question Links: [LeetCode 2012](https://leetcode.com/problems/sum-of-beauty-in-the-array/description/)

You are given a 0-indexed integer array `nums`. For every interior index `i` (`1 <= i <= nums.length - 2`), its beauty is:

- `2` if every value to its left is smaller than `nums[i]` and every value to its right is larger.
- `1` if the global condition above is false, but `nums[i - 1] < nums[i] < nums[i + 1]`.
- `0` otherwise.

Return the sum of the beauties of all interior values.

Example 1:

```text
Input: nums = [1, 2, 3]
Output: 2
```

Example 2:

```text
Input: nums = [2, 4, 6, 4]
Output: 1
```

Example 3:

```text
Input: nums = [3, 2, 1]
Output: 0
```

Constraints:

- `3 <= nums.length <= 10^5`
- `1 <= nums[i] <= 10^5`

## Idea

The global condition asks about every value on both sides of `i`. Keep the largest value seen before `i` as `leftMax`, and precompute the smallest value in every suffix. Then the full condition becomes `leftMax < nums[i] < suffixMin[i + 1]`.

If that condition fails, the adjacent check determines whether the value still earns one point. Check the global rule first because it awards two points; after scoring `i`, include `nums[i]` in `leftMax` for the next position.

```text
Global beauty: [1] | 3 | [4, 5]
               leftMax  x   suffixMin
               1 < 3 < 4  -> 2 points

Local beauty:  [4, 2] | 3 | [5]
               leftMax  x   suffixMin
               4 < 3 is false, but 2 < 3 < 5 -> 1 point
```

Complexity: Time `O(n)`, Space `O(n)` for the suffix minima.

### Java

```java []
package array;

/**
 * LeetCode 2012. Sum of Beauty in the Array.
 * Uses a running prefix maximum and suffix minima: O(n) time, O(n) extra space.
 */
public final class SumOfBeautyInArray {

    private SumOfBeautyInArray() {
    }

    public static int sumOfBeauties(int[] nums) {
        int n = nums.length;
        int[] suffixMin = new int[n];
        suffixMin[n - 1] = nums[n - 1];
        for (int i = n - 2; i >= 0; i--) {
            suffixMin[i] = Math.min(nums[i], suffixMin[i + 1]);
        }

        int prefixMax = nums[0];
        int beauty = 0;
        for (int i = 1; i < n - 1; i++) {
            if (prefixMax < nums[i] && nums[i] < suffixMin[i + 1]) {
                beauty += 2;
            } else if (nums[i - 1] < nums[i] && nums[i] < nums[i + 1]) {
                beauty++;
            }
            prefixMax = Math.max(prefixMax, nums[i]);
        }
        return beauty;
    }
}
```

### Python

```python []
class Solution:

    def sumOfBeauties(self, nums):
        n = len(nums)
        suffix_min = [0] * n
        suffix_min[n - 1] = nums[n - 1]

        # Build suffix minima in O(n) time using O(n) extra space.
        for i in range(n - 2, -1, -1):
            suffix_min[i] = min(nums[i], suffix_min[i + 1])

        total_beauty = 0
        left_max = nums[0]
        # Each inner index is checked once, so this pass is O(n) time.
        for i in range(1, n - 1):
            if left_max < nums[i] < suffix_min[i + 1]:
                total_beauty += 2
            elif nums[i - 1] < nums[i] < nums[i + 1]:
                total_beauty += 1
            left_max = max(left_max, nums[i])

        return total_beauty
```

### C++

```cpp []
#ifndef LEETCODE_SUMOFBEAUTYINARRAY_HPP
#define LEETCODE_SUMOFBEAUTYINARRAY_HPP

#include <algorithm>
#include <vector>

namespace SumOfBeautyInArray {

class Solution {
public:
    // Prefix maximum and suffix minima: O(n) time, O(n) extra space.
    int sumOfBeauties(std::vector<int>& nums) {
        const int n = static_cast<int>(nums.size());
        std::vector<int> suffixMin(n);
        suffixMin[n - 1] = nums[n - 1];
        for (int i = n - 2; i >= 0; --i) {
            suffixMin[i] = std::min(nums[i], suffixMin[i + 1]);
        }

        int prefixMax = nums[0];
        int beauty = 0;
        for (int i = 1; i < n - 1; ++i) {
            if (prefixMax < nums[i] && nums[i] < suffixMin[i + 1]) {
                beauty += 2;
            } else if (nums[i - 1] < nums[i] && nums[i] < nums[i + 1]) {
                ++beauty;
            }
            prefixMax = std::max(prefixMax, nums[i]);
        }
        return beauty;
    }
};

}

#endif
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Uses a running prefix maximum and precomputed suffix minima.
    /// Time: O(n); auxiliary space: O(n).
    pub fn sum_of_beauties(nums: Vec<i32>) -> i32 {
        let n = nums.len();
        let mut suffix_min = vec![0; n];
        suffix_min[n - 1] = nums[n - 1];
        for i in (0..n - 1).rev() {
            suffix_min[i] = nums[i].min(suffix_min[i + 1]);
        }

        let mut prefix_max = nums[0];
        let mut sum = 0;
        for i in 1..n - 1 {
            if prefix_max < nums[i] && nums[i] < suffix_min[i + 1] {
                sum += 2;
            } else if nums[i - 1] < nums[i] && nums[i] < nums[i + 1] {
                sum += 1;
            }
            prefix_max = prefix_max.max(nums[i]);
        }

        sum
    }
}
```
