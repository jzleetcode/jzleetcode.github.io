---
author: JZ
pubDatetime: 2026-08-30T10:00:00Z
modDatetime: 2026-08-30T10:00:00Z
title: LeetCode 213 House Robber II
featured: true
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 213, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 213](https://leetcode.com/problems/house-robber-ii/description/)

You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed. All houses at this place are **arranged in a circle**. That means the first house is the neighbor of the last one. Meanwhile, adjacent houses have a security system connected, and **it will automatically contact the police if two adjacent houses were broken into on the same night**.

Given an integer array `nums` representing the amount of money of each house, return the maximum amount of money you can rob tonight **without alerting the police**.

```
Example 1:

Input: nums = [2,3,2]
Output: 3
Explanation: You cannot rob house 1 (money = 2) and then rob house 3 (money = 2),
because they are adjacent houses.

Example 2:

Input: nums = [1,2,3,1]
Output: 4
Explanation: Rob house 1 (money = 1) and then rob house 3 (money = 3).
Total amount you can rob = 1 + 3 = 4.

Example 3:

Input: nums = [1,2,3]
Output: 3

Constraints:

1 <= nums.length <= 100
0 <= nums[i] <= 1000
```

## Solution 1: Two Linear Sub-Problems

### Idea

Since the houses are arranged in a circle, house `0` and house `n-1` are adjacent — we cannot rob both. This gives us a clean decomposition:

- **Case A**: exclude the last house → rob from `[0, n-2]`
- **Case B**: exclude the first house → rob from `[1, n-1]`

Each case is a standard linear [House Robber](/posts/leet-0198-house-robber/) problem. The answer is the maximum of the two.

```
houses (circle):    [2, 3, 2]
                     ^     ^--- these two are neighbors

Case A: [2, 3]    → rob house 1 → 3
Case B: [3, 2]    → rob house 1 → 3
answer: max(3, 3) = 3
```

```
houses (circle):    [1, 2, 3, 1]

Case A: [1, 2, 3]  → rob houses 0,2 → 1+3 = 4
Case B: [2, 3, 1]  → rob house 1    → 3
answer: max(4, 3) = 4
```

For each linear sub-problem, we use the two-variable DP from House Robber I:

- `robPrev`: max money if we robbed the previous house
- `nRobPrev`: max money if we skipped the previous house

Complexity: Time $O(n)$ — two passes over the array. Space $O(1)$ — two variables per pass.

#### Java

```java []
// O(n) time, O(1) space.
public int rob(int[] nums) {
    if (nums.length == 1) return nums[0];
    return Math.max(
        HouseRobber.rob(nums, 0, nums.length - 1),
        HouseRobber.rob(nums, 1, nums.length)
    );
}

// HouseRobber.rob — linear house robber on range [i, j)
public static int rob(int[] nums, int i, int j) {
    int robPrev = 0, nRobPrev = 0;
    for (int k = i; k < j; k++) { // O(n)
        int currRobbed = nRobPrev + nums[k];
        nRobPrev = Math.max(nRobPrev, robPrev);
        robPrev = currRobbed;
    }
    return Math.max(robPrev, nRobPrev);
}
```

#### Python

```python []
# O(n) time, O(1) space.
class Solution:
    def rob(self, nums: list[int]) -> int:
        def simple_rob(nums, l, r):
            did_not, robbed = 0, 0
            for i in range(l, r):  # O(n)
                t = did_not + nums[i]
                did_not = max(did_not, robbed)
                robbed = t
            return max(robbed, did_not)

        if len(nums) == 1:
            return nums[0]
        return max(simple_rob(nums, 0, len(nums) - 1),
                   simple_rob(nums, 1, len(nums)))
```

#### C++

```cpp []
// O(n) time, O(1) space.
class HouseRobberII {
    int robRange(vector<int> &nums, int lo, int hi) {
        int robPrev = 0, nRobPrev = 0;
        for (int i = lo; i < hi; i++) { // O(n)
            int robCur = nRobPrev + nums[i];
            nRobPrev = max(nRobPrev, robPrev);
            robPrev = robCur;
        }
        return max(robPrev, nRobPrev);
    }
public:
    int rob(vector<int> &nums) {
        int n = nums.size();
        if (n == 1) return nums[0];
        return max(robRange(nums, 0, n - 1), robRange(nums, 1, n));
    }
};
```

#### Rust

```rust []
/// O(n) time, O(1) space.
pub fn rob(nums: Vec<i32>) -> i32 {
    let n = nums.len();
    if n == 0 { return 0; }
    if n == 1 { return nums[0]; }
    Self::rob_linear(&nums[..n - 1]).max(Self::rob_linear(&nums[1..]))
}

fn rob_linear(nums: &[i32]) -> i32 {
    let (mut rob_prev, mut n_rob_prev) = (0, 0);
    for &n in nums { // O(n)
        let rob_cur = n_rob_prev + n;
        n_rob_prev = n_rob_prev.max(rob_prev);
        rob_prev = rob_cur;
    }
    rob_prev.max(n_rob_prev)
}
```
