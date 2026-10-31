---
author: JZ
pubDatetime: 2026-10-20T18:53:47Z
modDatetime: 2026-10-20T18:53:47Z
title: LeetCode 2574 Left and Right Sum Differences
featured: false
tags:
  - a-array
  - a-prefix-sum
description: "Solution for LeetCode 2574, easy, tags: array, prefix sum."
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

Question link: [LeetCode 2574: Left and Right Sum Differences](https://leetcode.com/problems/left-and-right-sum-differences/description/)

For each index `i` of `nums`, calculate the absolute difference between the sum of values **before** `i` and the sum of values **after** `i`. An empty side has sum zero. Return all differences in a new array.

```text
nums = [10, 4, 8, 3]  ->  [15, 1, 11, 22]
nums = [1]            ->  [0]
```

**Constraints:**

- `1 <= nums.length <= 1000`
- `1 <= nums[i] <= 10^5`

## Idea

First sum the whole array to obtain the initial `right_sum`. Maintain `left_sum = 0`. At each position, subtract the current value from `right_sum` **before** computing the answer; the current element belongs to neither side. Then record `abs(left_sum - right_sum)` and add the current value to `left_sum` for the next position.

```text
nums:           10   4   8   3
index:           0   1   2   3
left_sum:        0  10  14  22
right_sum:      15  11   3   0
absolute diff:  15   1  11  22
```

After processing each index, `left_sum` contains exactly the earlier elements and `right_sum` contains exactly the later elements. That invariant proves the recorded difference is correct. We need only this approach: building separate left- and right-prefix arrays would repeat the same idea with more working space.

## Complexity

Let `n = nums.length`. Summing the input and scanning it each take $O(n)$ time, so total **time is $O(n)$**. The returned array takes **$O(n)$ space**; apart from that output, the two running sums use **$O(1)$ auxiliary space**. Under the given constraints, the largest sum is $10^8$, which fits a 32-bit signed integer.

### Java

```java []
public final class LeftAndRightSumDifferences {
    private LeftAndRightSumDifferences() {
    }

    public static int[] leftRightDifference(int[] nums) {
        int right = 0;
        for (int value : nums) {
            right += value;
        }

        int left = 0;
        int[] result = new int[nums.length];
        for (int index = 0; index < nums.length; index++) {
            int value = nums[index];
            right -= value;
            result[index] = Math.abs(left - right);
            left += value;
        }
        return result;
    }
}
```

The repository uses a static utility method. For LeetCode, place the method in `class Solution` as an instance method.

### Python

```python []
class Solution:
    """Compute differences in O(n) time and O(n) output space."""

    def leftRightDifference(self, nums: list[int]) -> list[int]:
        right_sum = sum(nums)
        left_sum = 0
        differences = []
        for value in nums:  # O(n) total; O(1) extra space beyond the output
            right_sum -= value
            differences.append(abs(left_sum - right_sum))
            left_sum += value
        return differences
```

### C++

```cpp []
#include <cstdlib>
#include <vector>

using namespace std;

class Solution {
public:
    vector<int> leftRightDifference(vector<int>& nums) {
        int right = 0;
        for (int num : nums) {
            right += num;
        }

        int left = 0;
        vector<int> result(nums.size());
        for (size_t index = 0; index < nums.size(); ++index) {
            right -= nums[index];
            result[index] = abs(left - right);
            left += nums[index];
        }
        return result;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn left_right_difference(nums: Vec<i32>) -> Vec<i32> {
        let mut right_sum: i32 = nums.iter().sum();
        let mut left_sum = 0;
        let mut differences = Vec::with_capacity(nums.len());

        for value in nums {
            right_sum -= value;
            differences.push((left_sum - right_sum).abs());
            left_sum += value;
        }

        differences
    }
}
```
