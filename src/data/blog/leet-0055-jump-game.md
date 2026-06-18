---
author: JZ
pubDatetime: 2026-06-18T11:40:00Z
modDatetime: 2026-06-18T11:40:00Z
title: LeetCode 55 Jump Game
featured: true
tags:
  - a-greedy
  - a-dp
description:
  "Solutions for LeetCode 55, medium, tags: array, dynamic programming, greedy."
---

## Table of contents

## Description

You are given an integer array `nums`. You are initially positioned at the array's first index, and each element in the array represents your maximum jump length at that position.

Return `true` if you can reach the last index, or `false` otherwise.

**Example 1:**

> Input: nums = [2,3,1,1,4]
> Output: true
> Explanation: Jump 1 step from index 0 to 1, then 3 steps to the last index.

**Example 2:**

> Input: nums = [3,2,1,0,4]
> Output: false
> Explanation: You will always arrive at index 3 no matter what. Its maximum jump length is 0, which makes it impossible to reach the last index.

**Constraints:**

- `1 <= nums.length <= 10^4`
- `0 <= nums[i] <= 10^5`

[LeetCode 55](https://leetcode.com/problems/jump-game/)

## Idea

### Solution 1: Greedy Forward

Scan left to right, maintaining the farthest reachable index `reach`. At each position `i`, if `i > reach` we are stuck. Otherwise, update `reach = max(reach, i + nums[i])`.

```
index:  0   1   2   3   4
nums:  [2,  3,  1,  1,  4]
reach:  2   4   -   -   -  (reach >= 4, done)
```

Complexity: Time $O(n)$ — single pass. Space $O(1)$.

### Solution 2: Greedy Backward

Scan right to left, maintaining `target` — the smallest index that can reach the end. If `i + nums[i] >= target`, move `target = i`. After the scan, return `target == 0`.

```
index:  0   1   2   3   4
nums:  [2,  3,  1,  1,  4]
target: 4 → 3 → 2 → 1 → 0  ✓
```

Complexity: Time $O(n)$ — single pass. Space $O(1)$.

### Java

```java []
public class JumpGame {
    // solution 1, O(n) time, O(1) space, 2ms, 42.8Mb
    public boolean canJumpDP1(int[] nums) {
        for (int i = 0, reach = 0; i < nums.length && i <= reach; i++) { // O(n)
            reach = Math.max(reach, i + nums[i]);
            if (reach >= nums.length - 1) return true;
        }
        return false;
    }

    // solution 2, O(n) time, O(1) space, 1ms, 43Mb
    public boolean canJumpDP2(int[] nums) {
        int smallest = nums.length - 1;
        for (int i = nums.length - 2; i >= 0; i--) // O(n)
            if (i + nums[i] >= smallest) smallest = i;
        return smallest <= 0;
    }
}
```

### Python

```python []
class Solution:
    def canJump(self, nums: list[int]) -> bool:
        reach, i = 0, 0
        while i <= reach and i < len(nums):  # O(n)
            reach = max(reach, i + nums[i])
            if reach >= len(nums) - 1:
                return True
            i += 1
        return False
```

### C++

```cpp []
class JumpGame {
public:
    // O(n) time, O(1) space
    bool canJumpForward(vector<int>& nums) {
        int maxReach = 0;
        for (int i = 0; i < (int)nums.size(); i++) { // O(n)
            if (i > maxReach) return false;
            maxReach = max(maxReach, i + nums[i]);
        }
        return true;
    }

    // O(n) time, O(1) space
    bool canJumpBackward(vector<int>& nums) {
        int target = (int)nums.size() - 1;
        for (int i = target - 1; i >= 0; i--) { // O(n)
            if (i + nums[i] >= target) target = i;
        }
        return target == 0;
    }
};
```

### Rust

```rust []
use std::cmp::max;

impl Solution {
    /// O(n) time, O(1) space
    pub fn dp1(nums: Vec<i32>) -> bool {
        let mut reach = 0;
        for (i, num) in nums.iter().enumerate() { // O(n)
            if reach < i { return false; }
            reach = max(i + *num as usize, reach);
            if reach >= nums.len() - 1 { return true; }
        }
        true
    }

    /// O(n) time, O(1) space
    pub fn dp2(nums: Vec<i32>) -> bool {
        let mut smallest = nums.len() - 1;
        for i in (0..nums.len() - 1).rev() { // O(n)
            if i + nums[i] as usize >= smallest { smallest = i; }
        }
        smallest <= 0
    }
}
```
