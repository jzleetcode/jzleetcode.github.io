---
author: JZ
pubDatetime: 2026-10-16T19:02:03Z
modDatetime: 2026-10-16T19:02:03Z
title: LeetCode 1480 Running Sum of 1d Array
featured: true
tags:
  - a-array
  - a-prefix-sum
description: "Solutions for LeetCode 1480, easy, tags: array, prefix sum."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question Link: [LeetCode 1480](https://leetcode.com/problems/running-sum-of-1d-array/description/)

Given an integer array `nums`, return an array whose element at index `i` is the sum of `nums[0]` through `nums[i]`.

```text
Example 1:
Input: nums = [1, 2, 3, 4]
Output: [1, 3, 6, 10]

Example 2:
Input: nums = [1, 1, 1, 1, 1]
Output: [1, 2, 3, 4, 5]

Example 3:
Input: nums = [3, 1, 2, 10, 1]
Output: [3, 4, 6, 16, 17]
```

**Constraints:**

- `1 <= nums.length <= 1000`
- `-10^6 <= nums[i] <= 10^6`

## Idea

Use the input array to hold the running sums. The first number is already its own running sum. For each later index `i`, add the running sum at `i - 1` to the original value at `i`. Before this update, `nums[i - 1]` is the sum of every original value through `i - 1`, while `nums[i]` has not been changed yet.

```text
Original:     [1, 2, 3, 4]
After i = 1:  [1, 3, 3, 4]
After i = 2:  [1, 3, 6, 4]
After i = 3:  [1, 3, 6, 10]
```

The loop visits each element once: **time $O(n)$**. Python and Java modify the caller's array and return it; Rust modifies and returns the owned input vector. These three implementations need **$O(1)$ auxiliary space**. The C++ method also updates the input using $O(1)$ working space, but its standard `vector<int>` return type copies that vector, so its total additional space is **$O(n)$**.

Only one solution is needed: using an extra prefix-sum array would repeat the same algorithm and use more space.

### Java

```java []
public final class RunningSumOf1dArray {
    private RunningSumOf1dArray() {
    }

    public static int[] runningSum(int[] nums) {
        for (int index = 1; index < nums.length; index++) {
            nums[index] += nums[index - 1];
        }
        return nums;
    }
}
```

This is the repository's static utility-class convention. To submit on LeetCode, name the class `Solution` and make `runningSum` an instance method.

### Python

```python []
class Solution:
    """In-place prefix sums. O(n) time, O(1) auxiliary space."""

    def runningSum(self, nums: list[int]) -> list[int]:
        for index in range(1, len(nums)):  # O(n) prefix updates
            nums[index] += nums[index - 1]
        return nums
```

### C++

```cpp []
#include <vector>

using namespace std;

class Solution {
public:
    vector<int> runningSum(vector<int>& nums) {
        for (size_t index = 1; index < nums.size(); ++index) {
            nums[index] += nums[index - 1];
        }
        return nums;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn running_sum(mut nums: Vec<i32>) -> Vec<i32> {
        for index in 1..nums.len() {
            nums[index] += nums[index - 1];
        }
        nums
    }
}
```
