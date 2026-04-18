---
author: JZ
pubDatetime: 2026-04-12T06:00:00Z
modDatetime: 2026-04-12T06:00:00Z
title: LeetCode 1848 Minimum Distance to the Target Element
featured: false
tags:
  - a-array
description:
  "Solutions for LeetCode 1848, easy, tags: array."
---

## Table of contents

## Description

Given a 0-indexed integer array `nums` and two integers `target` and `start`, find an index `i` such that `nums[i] == target` and `abs(i - start)` is **minimized**. Return `abs(i - start)`.

It is **guaranteed** that `target` exists in `nums`.

```
Example 1:

Input: nums = [1,2,3,4,5], target = 5, start = 3
Output: 1
Explanation: nums[4] = 5, distance = abs(4 - 3) = 1.

Example 2:

Input: nums = [1], target = 1, start = 0
Output: 0
Explanation: nums[0] = 1, distance = abs(0 - 0) = 0.

Example 3:

Input: nums = [1,1,1,1,1,1,1,1,1,1], target = 1, start = 0
Output: 0
Explanation: Every index has nums[i] = 1, so we pick index 0 with distance 0.
```

**Constraints:**

- `1 <= nums.length <= 1000`
- `1 <= nums[i] <= 10^4`
- `0 <= start < nums.length`
- `target` is in `nums`

## Idea

Walk through the array once. Whenever we find an element equal to `target`, compute `abs(i - start)` and keep the running minimum.

```
nums = [1, 2, 3, 4, 5], target = 5, start = 3

i  nums[i]  == target?  abs(i - start)  best
0    1        no            —             ∞
1    2        no            —             ∞
2    3        no            —             ∞
3    4        no            —             ∞
4    5        yes        abs(4-3) = 1     1

Answer: 1
```

Complexity: Time $O(n)$ — single pass over the array. Space $O(1)$ — only a variable for the running minimum.

### Java

```java []
// lc 1848, linear scan. O(n) time, O(1) space.
public int getMinDistance(int[] nums, int target, int start) {
    int res = nums.length;
    for (int i = 0; i < nums.length; i++) // O(n)
        if (nums[i] == target) res = Math.min(res, Math.abs(i - start));
    return res;
}
```

```python []
# lc 1848, linear scan. O(n) time, O(1) space.
class Solution:
    def getMinDistance(self, nums: list[int], target: int, start: int) -> int:
        res = len(nums)  # upper bound
        for i, v in enumerate(nums):  # O(n)
            if v == target:
                res = min(res, abs(i - start))
        return res
```

```cpp []
// lc 1848, linear scan. O(n) time, O(1) space.
int getMinDistance(vector<int>& nums, int target, int start) {
    int res = INT_MAX;
    for (int i = 0; i < nums.size(); i++) { // O(n)
        if (nums[i] == target) {
            res = min(res, abs(i - start));
        }
    }
    return res;
}
```

```rust []
// lc 1848, linear scan. O(n) time, O(1) space.
pub fn get_min_distance(nums: Vec<i32>, target: i32, start: i32) -> i32 {
    nums.iter()
        .enumerate()
        .filter(|&(_, &v)| v == target)       // keep matching elements
        .map(|(i, _)| (i as i32 - start).abs()) // compute distance
        .min()
        .unwrap()
}
```
