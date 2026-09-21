---
author: JZ
pubDatetime: 2026-09-21T10:37:00Z
modDatetime: 2026-09-21T10:37:00Z
title: LeetCode 377 Combination Sum IV
featured: true
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 377, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 377](https://leetcode.com/problems/combination-sum-iv/description/)

Given an array of **distinct** integers `nums` and a target integer `target`, return the number of possible combinations that add up to `target`.

The test cases are generated so that the answer can fit in a **32-bit** integer.

**Note:** different sequences are counted as different combinations.

```
Example 1:

Input: nums = [1,2,3], target = 4
Output: 7
Explanation:
The possible combination ways are:
(1, 1, 1, 1)
(1, 1, 2)
(1, 2, 1)
(1, 3)
(2, 1, 1)
(2, 2)
(3, 1)

Example 2:

Input: nums = [9], target = 3
Output: 0

Constraints:

1 <= nums.length <= 200
1 <= nums[i] <= 1000
All the elements of nums are unique.
1 <= target <= 1000
```

**Follow up:** What if negative numbers are allowed? Repetition would lead to infinite answers (e.g., `[-2, 2]`, target `0` has infinitely many solutions). A limitation such as each element used at most once would be needed.

## Solution 1: Bottom-Up DP

### Idea

Define `dp[i]` as the number of ordered combinations that sum to `i`. Base case: `dp[0] = 1` (the empty combination). For each `i` from `1` to `target`, iterate through every `num` in `nums`: if `i >= num`, add `dp[i - num]` to `dp[i]`.

**Key difference from Coin Change II (LC 518):** here different orderings count as different combinations (permutations). We put the **target** in the outer loop and **nums** in the inner loop. In Coin Change II, which counts unordered combinations, it's the reverse — coins outer, amount inner.

```
nums = [1, 2, 3], target = 4

dp index:  0  1  2  3  4
init:      1  0  0  0  0

i=1: dp[1] += dp[1-1]=1                      -> dp[1]=1
i=2: dp[2] += dp[2-1]=1, dp[2-2]=1           -> dp[2]=2
i=3: dp[3] += dp[3-1]=2, dp[3-2]=1, dp[3-3]=1 -> dp[3]=4
i=4: dp[4] += dp[4-1]=4, dp[4-2]=2, dp[4-3]=1 -> dp[4]=7
                                                        ^-- answer
```

Complexity: Time $O(N \cdot T)$ — outer loop over target `T`, inner loop over `N` nums. Space $O(T)$ for the dp array.

#### Java

```java []
// O(N*T) time, O(T) space. N: nums.length, T: target.
public int combinationSum4I(int[] nums, int target) {
    int[] dp = new int[target + 1];
    dp[0] = 1;
    for (int i = 1; i <= target; i++) // O(T)
        for (int j = 0; j < nums.length; j++) // O(N)
            if (i >= nums[j])
                dp[i] += dp[i - nums[j]];
    return dp[target];
}
```

#### Python

```python []
# O(N*T) time, O(T) space. Bottom-up DP.
def combinationSum4(self, nums: List[int], target: int) -> int:
    dp = [0] * (target + 1)
    dp[0] = 1
    for i in range(1, target + 1):  # O(T)
        for num in nums:  # O(N)
            if i >= num:
                dp[i] += dp[i - num]
    return dp[target]
```

#### C++

```cpp []
// O(N*T) time, O(T) space. N: nums.size(), T: target.
int combinationSum4(vector<int> &nums, int target) {
    vector<unsigned long long> dp(target + 1, 0);
    dp[0] = 1;
    for (int i = 1; i <= target; i++) // O(T)
        for (int num: nums) // O(N)
            if (i >= num)
                dp[i] += dp[i - num];
    return (int) dp[target];
}
```

#### Rust

```rust []
/// Bottom-up DP. O(N*T) time, O(T) space.
pub fn combination_sum4(nums: Vec<i32>, target: i32) -> i32 {
    let t = target as usize;
    let mut dp = vec![0i32; t + 1];
    dp[0] = 1;
    for i in 1..=t {
        for &num in &nums {
            let n = num as usize;
            if i >= n {
                dp[i] += dp[i - n];
            }
        }
    }
    dp[t]
}
```

## Solution 2: Top-Down Memoization

### Idea

Recursively compute the count: for a given remaining target, try subtracting each `num` and recurse. Cache results in a memo table to avoid recomputation. This is equivalent to the bottom-up approach but sometimes easier to reason about.

```
dfs(4):
  dfs(3):          subtract 1
    dfs(2):        subtract 1
      dfs(1) -> 1
      dfs(0) -> 1
      return 2
    dfs(1):        subtract 2
      dfs(0) -> 1
      return 1
    dfs(0) -> 1    subtract 3
    return 4
  dfs(2):          subtract 2
    (cached) -> 2
  dfs(1):          subtract 3
    (cached) -> 1
  return 7
```

Complexity: Time $O(N \cdot T)$ — at most `T` unique states, each examining `N` nums. Space $O(T)$ for the memo.

#### Java

```java []
// O(N*T) time, O(N+T) space.
public int combinationSum4Cache(int[] nums, int target) {
    int[] dp = new int[target + 1];
    Arrays.fill(dp, -1);
    dp[0] = 1;
    return helper(nums, target, dp);
}

private int helper(int[] nums, int target, int[] dp) {
    if (dp[target] != -1) return dp[target];
    int res = 0;
    for (int i = 0; i < nums.length; i++)
        if (target >= nums[i]) res += helper(nums, target - nums[i], dp);
    dp[target] = res;
    return dp[target];
}
```

#### Python

```python []
# O(N*T) time, O(T) space. Top-down memoization.
def combinationSum4(self, nums: List[int], target: int) -> int:
    memo = {0: 1}

    def dfs(remain):
        if remain in memo:
            return memo[remain]
        res = 0
        for num in nums:  # O(N)
            if remain >= num:
                res += dfs(remain - num)
        memo[remain] = res
        return res

    return dfs(target)
```

#### C++

```cpp []
// O(N*T) time, O(T) space.
int combinationSum4(vector<int> &nums, int target) {
    vector<int> memo(target + 1, -1);
    return helper(nums, target, memo);
}

int helper(vector<int> &nums, int remain, vector<int> &memo) {
    if (remain == 0) return 1;
    if (memo[remain] != -1) return memo[remain];
    int count = 0;
    for (int num: nums)
        if (remain >= num)
            count += helper(nums, remain - num, memo);
    return memo[remain] = count;
}
```

#### Rust

```rust []
/// Top-down memoization. O(N*T) time, O(T) space.
pub fn combination_sum4_memo(nums: Vec<i32>, target: i32) -> i32 {
    let mut memo = HashMap::new();
    memo.insert(0, 1);
    Self::dfs(&nums, target, &mut memo)
}

fn dfs(nums: &[i32], target: i32, memo: &mut HashMap<i32, i32>) -> i32 {
    if let Some(&v) = memo.get(&target) {
        return v;
    }
    let mut count = 0;
    for &num in nums {
        if target >= num {
            count += Self::dfs(nums, target - num, memo);
        }
    }
    memo.insert(target, count);
    count
}
```
