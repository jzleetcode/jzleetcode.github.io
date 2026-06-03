---
author: JZ
pubDatetime: 2026-06-03T06:00:00Z
modDatetime: 2026-06-03T06:00:00Z
title: LeetCode 312 Burst Balloons
featured: true
tags:
  - a-dynamic-programming
  - a-array
description:
  "Solutions for LeetCode 312, hard, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 312](https://leetcode.com/problems/burst-balloons/description/)

You are given `n` balloons, indexed from `0` to `n - 1`. Each balloon is painted with a number on it represented by an array `nums`. You are asked to burst all the balloons.

If you burst the `i`th balloon, you will get `nums[i - 1] * nums[i] * nums[i + 1]` coins. If `i - 1` or `i + 1` goes out of bounds of the array, then treat it as if there is a balloon with a `1` painted on it.

Return the maximum coins you can collect by bursting the balloons wisely.

```
Example 1:

Input: nums = [3,1,5,8]
Output: 167
Explanation:
nums = [3,1,5,8] --> [3,5,8] --> [3,8] --> [8] --> []
coins =  3*1*5    +   3*5*8   +  1*3*8  + 1*8*1 = 167

Example 2:

Input: nums = [1,5]
Output: 10

Constraints:

n == nums.length
1 <= n <= 300
0 <= nums[i] <= 100
```

## Solution 1: Bottom-up Interval DP

### Idea

The key insight is to think about which balloon to burst **last** in a given range rather than which to burst first. If balloon `k` is the last to burst in the open interval `(i, j)`, then `val[i]` and `val[j]` are still present as boundaries when `k` pops.

We pad the original array with `1` on both sides: `val = [1] + nums + [1]`. Define `dp[i][j]` as the maximum coins obtainable by bursting all balloons in the open interval `(i, j)`.

```
Transition: dp[i][j] = max over k in (i+1..j-1) of:
    val[i] * val[k] * val[j]  +  dp[i][k]  +  dp[k][j]

val = [1, 3, 1, 5, 8, 1]   (indices 0..5)

Interval lengths from small to large:
len=2: dp[0][2]=3, dp[1][3]=5, dp[2][4]=5, dp[3][5]=40
len=3: dp[0][3]=15, dp[1][4]=40, dp[2][5]=48
len=4: dp[0][4]=120, dp[1][5]=88
len=5: dp[0][5]=167  <-- answer
```

Complexity: Time $O(n^3)$ — three nested loops (length, left endpoint, last-to-burst). Space $O(n^2)$ for the dp table.

#### Java

```java []
public int maxCoins(int[] nums) {
    int n = nums.length;
    int[][] rec = new int[n + 2][n + 2];
    int[] val = new int[n + 2];
    val[0] = val[n + 1] = 1;
    for (int i = 1; i <= n; i++) {
        val[i] = nums[i - 1];
    }
    for (int i = n - 1; i >= 0; i--) { // O(n) left endpoints
        for (int j = i + 2; j <= n + 1; j++) { // O(n) right endpoints
            for (int k = i + 1; k < j; k++) { // O(n) last balloon to burst
                int sum = val[i] * val[k] * val[j];
                sum += rec[i][k] + rec[k][j];
                rec[i][j] = Math.max(rec[i][j], sum);
            }
        }
    }
    return rec[0][n + 1];
}
```

#### Python

```python []
class Solution:
    """Interval DP (bottom-up). O(n^3) time, O(n^2) space."""

    def maxCoins(self, nums: list[int]) -> int:
        n = len(nums)
        val = [1] + nums + [1]  # O(n) space for padded array
        dp = [[0] * (n + 2) for _ in range(n + 2)]  # O(n^2) space
        for length in range(2, n + 2):  # O(n) lengths
            for i in range(0, n + 2 - length):  # O(n) left endpoints
                j = i + length
                for k in range(i + 1, j):  # O(n) last balloon to burst
                    coins = val[i] * val[k] * val[j] + dp[i][k] + dp[k][j]
                    dp[i][j] = max(dp[i][j], coins)
        return dp[0][n + 1]
```

#### C++

```cpp []
int maxCoins(vector<int>& nums) {
    int n = nums.size();
    vector<int> balloons(n + 2);
    balloons[0] = 1;
    balloons[n + 1] = 1;
    for (int i = 0; i < n; i++) {
        balloons[i + 1] = nums[i];
    }
    vector<vector<int>> dp(n + 2, vector<int>(n + 2, 0));
    for (int len = 1; len <= n; len++) { // O(n) interval lengths
        for (int i = 0; i + len + 1 < n + 2; i++) { // O(n) left endpoints
            int j = i + len + 1;
            for (int k = i + 1; k < j; k++) { // O(n) last balloon to burst
                int coins = balloons[i] * balloons[k] * balloons[j];
                coins += dp[i][k] + dp[k][j];
                dp[i][j] = max(dp[i][j], coins);
            }
        }
    }
    return dp[0][n + 1];
}
```

#### Rust

```rust []
pub fn max_coins(nums: Vec<i32>) -> i32 {
    let n = nums.len();
    let mut val = vec![1];
    val.extend(&nums);
    val.push(1);
    let mut dp = vec![vec![0; n + 2]; n + 2]; // O(n^2) space
    for length in 2..=n + 1 { // O(n) lengths
        for i in 0..=n + 1 - length { // O(n) left endpoints
            let j = i + length;
            for k in i + 1..j { // O(n) last balloon to burst
                let coins = val[i] * val[k] * val[j] + dp[i][k] + dp[k][j];
                dp[i][j] = dp[i][j].max(coins);
            }
        }
    }
    dp[0][n + 1]
}
```

## Solution 2: Top-down Memoization

### Idea

Same interval DP formulation but implemented recursively with memoization. For each subproblem `(left, right)`, try every balloon `k` in the range as the last to burst and cache the result. This avoids computing intervals that are never needed (though for this problem, all intervals get explored anyway).

Complexity: Time $O(n^3)$ — same number of subproblems and transitions. Space $O(n^2)$ for the memo table plus $O(n)$ recursion stack.

#### Python

```python []
class Solution2:
    """Interval DP (top-down with memoization). O(n^3) time, O(n^2) space."""

    def maxCoins(self, nums: list[int]) -> int:
        val = [1] + nums + [1]
        n = len(val)
        memo = {}

        def dp(left: int, right: int) -> int:
            if right - left < 2:
                return 0
            if (left, right) in memo:
                return memo[(left, right)]
            res = 0
            for k in range(left + 1, right):  # O(n) choices for last burst
                coins = val[left] * val[k] * val[right] + dp(left, k) + dp(k, right)
                res = max(res, coins)
            memo[(left, right)] = res
            return res

        return dp(0, n - 1)
```
