---
author: JZ
pubDatetime: 2026-05-12T06:00:00Z
modDatetime: 2026-05-12T06:00:00Z
title: LeetCode 198 House Robber
featured: true
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 198, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 198](https://leetcode.com/problems/house-robber/description/)

You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed, the only constraint stopping you from robbing each of them is that adjacent houses have security systems connected and **it will automatically contact the police if two adjacent houses were broken into on the same night**.

Given an integer array `nums` representing the amount of money of each house, return the maximum amount of money you can rob tonight **without alerting the police**.

```
Example 1:

Input: nums = [1,2,3,1]
Output: 4
Explanation: Rob house 1 (money = 1) and then rob house 3 (money = 3).
Total amount you can rob = 1 + 3 = 4.

Example 2:

Input: nums = [2,7,9,3,1]
Output: 12
Explanation: Rob house 1 (money = 2), rob house 3 (money = 9) and rob house 5 (money = 1).
Total amount you can rob = 2 + 9 + 1 = 12.

Constraints:

1 <= nums.length <= 100
0 <= nums[i] <= 400
```

## Solution 1: DP with Two Variables (Space-Optimized)

### Idea

At each house, we track two states: `robPrev` (max money if we robbed the previous house) and `nRobPrev` (max money if we did not rob the previous house).

For the current house:
- If we rob it: `robCur = nRobPrev + nums[i]` (must not have robbed previous)
- If we skip it: `nRobPrev = max(nRobPrev, robPrev)` (best of either state)

```
nums = [2, 7, 9, 3, 1]

house:       0    1    2    3    4
nums[i]:     2    7    9    3    1

robPrev:     2    7   11   11   12
nRobPrev:    0    2    7   11   11

answer = max(robPrev, nRobPrev) = max(12, 11) = 12

Robbed houses: 0(2) + 2(9) + 4(1) = 12
```

Complexity: Time $O(N)$ — single pass through the array. Space $O(1)$ — only two variables.

#### Java

```java []
// O(N) time, O(1) space.
public static int rob(int[] nums) {
    int robPrev = 0, nRobPrev = 0;
    for (int k = 0; k < nums.length; k++) { // O(N)
        int currRobbed = nRobPrev + nums[k];
        nRobPrev = Math.max(nRobPrev, robPrev);
        robPrev = currRobbed;
    }
    return Math.max(robPrev, nRobPrev);
}
```

#### Python

```python []
class Solution:
    """DP with two variables. O(N) time, O(1) space."""

    def rob(self, nums: list[int]) -> int:
        rob_prev, n_rob_prev = 0, 0
        for n in nums:  # O(N)
            rob_cur = n_rob_prev + n
            n_rob_prev = max(rob_prev, n_rob_prev)
            rob_prev = rob_cur
        return max(rob_prev, n_rob_prev)
```

#### C++

```cpp []
// O(N) time, O(1) space.
int rob(vector<int> &nums) {
    int robPrev = 0, nRobPrev = 0;
    for (int n: nums) { // O(N)
        int robCur = nRobPrev + n;
        nRobPrev = max(nRobPrev, robPrev);
        robPrev = robCur;
    }
    return max(robPrev, nRobPrev);
}
```

#### Rust

```rust []
/// DP with two variables. O(N) time, O(1) space.
pub fn rob(nums: Vec<i32>) -> i32 {
    let (mut rob_prev, mut n_rob_prev) = (0, 0);
    for &n in &nums { // O(N)
        let rob_cur = n_rob_prev + n;
        n_rob_prev = n_rob_prev.max(rob_prev);
        rob_prev = rob_cur;
    }
    rob_prev.max(n_rob_prev)
}
```

## Solution 2: DP with Array

### Idea

Define `dp[i]` as the maximum money we can rob from houses `0..=i`. The recurrence is:

$$dp[i] = \max(dp[i-1],\; dp[i-2] + nums[i])$$

At each house, we either skip it (take `dp[i-1]`) or rob it (take `dp[i-2] + nums[i]`).

```
nums = [2, 7, 9, 3, 1]

index:   0   1   2   3   4
dp:      2   7  11  11  12
              |       |
              |       max(dp[2]=11, dp[1]+3=10) = 11
              max(dp[-1]=0, dp[-2]+7=7) = 7

answer = dp[4] = 12
```

Complexity: Time $O(N)$ — single pass. Space $O(N)$ for the dp array.

#### Java

```java []
// O(N) time, O(N) space.
public static int robDPArray(int[] nums) {
    int n = nums.length;
    if (n == 0) return 0;
    if (n == 1) return nums[0];
    int[] dp = new int[n]; // dp[i]: max money robbing from houses 0..i
    dp[0] = nums[0];
    dp[1] = Math.max(nums[0], nums[1]);
    for (int i = 2; i < n; i++) // O(N)
        dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i]);
    return dp[n - 1];
}
```

#### Python

```python []
class Solution2:
    """DP with array. O(N) time, O(N) space."""

    def rob(self, nums: list[int]) -> int:
        n = len(nums)
        if n == 0:
            return 0
        if n == 1:
            return nums[0]
        dp = [0] * n  # dp[i]: max money robbing from houses 0..i
        dp[0] = nums[0]
        dp[1] = max(nums[0], nums[1])
        for i in range(2, n):  # O(N)
            dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
        return dp[n - 1]
```

#### C++

```cpp []
// O(N) time, O(N) space.
int rob(vector<int> &nums) {
    int n = nums.size();
    if (n == 0) return 0;
    if (n == 1) return nums[0];
    vector<int> dp(n); // dp[i]: max money robbing from houses 0..i
    dp[0] = nums[0];
    dp[1] = max(nums[0], nums[1]);
    for (int i = 2; i < n; i++) // O(N)
        dp[i] = max(dp[i - 1], dp[i - 2] + nums[i]);
    return dp[n - 1];
}
```

#### Rust

```rust []
/// DP with array. O(N) time, O(N) space.
pub fn rob_dp_array(nums: Vec<i32>) -> i32 {
    let n = nums.len();
    if n == 0 { return 0; }
    if n == 1 { return nums[0]; }
    let mut dp = vec![0; n]; // dp[i]: max money robbing from houses 0..=i
    dp[0] = nums[0];
    dp[1] = nums[0].max(nums[1]);
    for i in 2..n { // O(N)
        dp[i] = dp[i - 1].max(dp[i - 2] + nums[i]);
    }
    dp[n - 1]
}
```
