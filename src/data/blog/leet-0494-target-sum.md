---
author: JZ
pubDatetime: 2026-06-24T10:00:00Z
modDatetime: 2026-06-24T10:00:00Z
title: LeetCode 494 Target Sum
featured: true
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 494, medium, tags: array, dynamic programming, backtracking."
---

## Table of contents

## Description

Question Links: [LeetCode 494](https://leetcode.com/problems/target-sum/description/)

You are given an integer array `nums` and an integer `target`.

You want to build an expression out of nums by adding one of the symbols `'+'` and `'-'` before each integer in nums and then concatenate all the integers.

For example, if `nums = [2, 1]`, you can add a `'+'` before `2` and a `'-'` before `1` and concatenate them to build the expression `"+2-1"`.

Return the number of different expressions that you can build, which evaluates to `target`.

```
Example 1:

Input: nums = [1,1,1,1,1], target = 3
Output: 5
Explanation: There are 5 ways to assign symbols to make the sum of nums be target 3.
-1 + 1 + 1 + 1 + 1 = 3
+1 - 1 + 1 + 1 + 1 = 3
+1 + 1 - 1 + 1 + 1 = 3
+1 + 1 + 1 - 1 + 1 = 3
+1 + 1 + 1 + 1 - 1 = 3

Example 2:

Input: nums = [1], target = 1
Output: 1

Constraints:

1 <= nums.length <= 20
0 <= nums[i] <= 1000
0 <= sum(nums[i]) <= 1000
-1000 <= target <= 1000
```

## Solution 1: Subset Sum DP (0/1 Knapsack)

### Idea

Let $P$ = sum of elements assigned `'+'`, $N$ = sum of elements assigned `'-'`.

$$P + N = \text{total},\quad P - N = \text{target}$$

Solving: $P = \frac{\text{total} + \text{target}}{2}$.

The problem reduces to: **count subsets of `nums` that sum to $P$** — a classic 0/1 knapsack counting problem.

Early return `0` if `(total + target)` is odd (no integer solution) or `abs(target) > total` (unreachable).

```
nums = [1, 1, 1, 1, 1], target = 3
total = 5, P = (5+3)/2 = 4

dp index:  0  1  2  3  4
init:      1  0  0  0  0
num=1:     1  1  0  0  0
num=1:     1  2  1  0  0
num=1:     1  3  3  1  0
num=1:     1  4  6  4  1
num=1:     1  5 10 10  5  <-- dp[4] = 5
```

Complexity: Time $O(n \cdot P)$ where $P = \frac{\text{total}+\text{target}}{2}$. Space $O(P)$.

#### Java

```java []
// O(n*P) time, O(P) space. P = (total + target) / 2.
public static int findTargetSumWays(int[] nums, int target) {
    int total = 0;
    for (int n : nums) total += n;
    if (Math.abs(target) > total || (total + target) % 2 != 0) return 0;
    int p = (total + target) / 2;
    int[] dp = new int[p + 1]; // dp[j]: number of subsets summing to j
    dp[0] = 1;
    for (int num : nums) { // O(n) iterations
        for (int j = p; j >= num; j--) { // O(P) iterations, reverse to avoid reuse
            dp[j] += dp[j - num]; // accumulate ways
        }
    }
    return dp[p];
}
```

#### Python

```python []
class Solution:
    """Subset sum DP. O(n*s) time, O(s) space. n: len(nums), s: sum(nums)."""

    def findTargetSumWays(self, nums: list[int], target: int) -> int:
        total = sum(nums)
        if (total + target) % 2 != 0 or abs(target) > total:
            return 0
        p = (total + target) // 2  # sum of elements assigned '+'
        dp = [0] * (p + 1)  # dp[j]: ways to reach sum j
        dp[0] = 1
        for num in nums:  # O(n)
            for j in range(p, num - 1, -1):  # O(s), reverse to avoid reuse
                dp[j] += dp[j - num]
        return dp[p]
```

#### C++

```cpp []
// O(n*P) time, O(P) space. P=(total+target)/2.
int findTargetSumWays(vector<int>& nums, int target) {
    int total = accumulate(nums.begin(), nums.end(), 0);
    if (abs(target) > total || (total + target) % 2 != 0) return 0;
    int P = (total + target) / 2;
    vector<int> dp(P + 1, 0);
    dp[0] = 1;
    for (int num : nums)           // O(n)
        for (int j = P; j >= num; j--) // O(P)
            dp[j] += dp[j - num];
    return dp[P];
}
```

#### Rust

```rust []
/// Subset sum DP. O(n * P) time, O(P) space.
pub fn find_target_sum_ways(nums: Vec<i32>, target: i32) -> i32 {
    let total: i32 = nums.iter().sum();
    if target.abs() > total || (total + target) % 2 != 0 {
        return 0;
    }
    let p = ((total + target) / 2) as usize;
    let mut dp = vec![0i32; p + 1]; // dp[j]: # ways to form sum j
    dp[0] = 1;
    for &num in &nums { // O(n)
        let n = num as usize;
        for j in (n..=p).rev() { // O(P), iterate backwards to avoid reuse
            dp[j] += dp[j - n];
        }
    }
    dp[p]
}
```

## Solution 2: DFS + Memoization

### Idea

Recursively assign `+` or `-` to each element, tracking the running sum. Use memoization on `(index, currentSum)` to prune repeated subproblems.

At each index, branch into two choices: add or subtract `nums[index]`. Base case: if we've processed all elements, check if the accumulated sum equals the target.

Complexity: Time $O(n \cdot s)$ where $s$ is the range of achievable sums (at most $2 \cdot \text{total} + 1$). Space $O(n \cdot s)$ for the memo table.

#### Java

```java []
// O(n*s) time, O(n*s) space. s = sum range.
public static int findTargetSumWays2(int[] nums, int target) {
    int total = 0;
    for (int n : nums) total += n;
    if (Math.abs(target) > total) return 0;
    Map<Long, Integer> memo = new HashMap<>();
    return dfs(nums, 0, target, memo);
}

private static int dfs(int[] nums, int index, int remaining, Map<Long, Integer> memo) {
    if (index == nums.length) return remaining == 0 ? 1 : 0;
    long key = (long) index * 2001 + remaining + 1000;
    if (memo.containsKey(key)) return memo.get(key);
    int ways = dfs(nums, index + 1, remaining - nums[index], memo)
            + dfs(nums, index + 1, remaining + nums[index], memo);
    memo.put(key, ways);
    return ways;
}
```

#### Python

```python []
class Solution2:
    """DFS + memoization. O(n*s) time, O(n*s) space."""

    def findTargetSumWays(self, nums: list[int], target: int) -> int:
        from functools import cache

        @cache
        def dfs(i: int, cur: int) -> int:  # O(n*s) states
            if i == len(nums):
                return 1 if cur == target else 0
            return dfs(i + 1, cur + nums[i]) + dfs(i + 1, cur - nums[i])

        return dfs(0, 0)
```

#### C++

```cpp []
// O(n*s) time, O(n*s) space. s=sum range.
class TargetSumDFS {
public:
    int findTargetSumWays(vector<int>& nums, int target) {
        int total = accumulate(nums.begin(), nums.end(), 0);
        if (abs(target) > total) return 0;
        unordered_map<long, int> memo;
        return dfs(nums, 0, target, memo);
    }
private:
    int dfs(vector<int>& nums, int idx, int remain, unordered_map<long, int>& memo) {
        if (idx == (int)nums.size()) return remain == 0 ? 1 : 0;
        long key = (long)idx * 100001 + remain + 50000;
        if (memo.count(key)) return memo[key];
        int res = dfs(nums, idx + 1, remain - nums[idx], memo)
                + dfs(nums, idx + 1, remain + nums[idx], memo);
        return memo[key] = res;
    }
};
```

#### Rust

```rust []
/// DFS + memoization. O(n * s) time/space, s = range of reachable sums.
pub fn find_target_sum_ways_dfs(nums: Vec<i32>, target: i32) -> i32 {
    let total: i32 = nums.iter().sum();
    if target.abs() > total { return 0; }
    let mut memo = HashMap::new();
    dfs(&nums, 0, target, &mut memo)
}

fn dfs(nums: &[i32], idx: usize, remain: i32, memo: &mut HashMap<(usize, i32), i32>) -> i32 {
    if idx == nums.len() { return if remain == 0 { 1 } else { 0 }; }
    if let Some(&v) = memo.get(&(idx, remain)) { return v; }
    let res = dfs(nums, idx + 1, remain - nums[idx], memo)  // +nums[idx]
            + dfs(nums, idx + 1, remain + nums[idx], memo); // -nums[idx]
    memo.insert((idx, remain), res);
    res
}
```
