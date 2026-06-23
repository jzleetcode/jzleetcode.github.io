---
author: JZ
pubDatetime: 2026-06-23T06:00:00Z
modDatetime: 2026-06-23T06:00:00Z
title: LeetCode 518 Coin Change II
featured: true
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 518, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 518](https://leetcode.com/problems/coin-change-ii/description/)

You are given an integer array `coins` representing coins of different denominations and an integer `amount` representing a total amount of money.

Return the number of combinations that make up that amount. If that amount of money cannot be made up by any combination of the coins, return `0`.

You may assume that you have an infinite number of each kind of coin.

The answer is **guaranteed** to fit into a signed 32-bit integer.

```
Example 1:

Input: amount = 5, coins = [1,2,5]
Output: 4
Explanation: there are four ways to make up the amount:
5=5
5=2+2+1
5=2+1+1+1
5=1+1+1+1+1

Example 2:

Input: amount = 3, coins = [2]
Output: 0
Explanation: the amount of 3 cannot be made up just with coins of 2.

Example 3:

Input: amount = 0, coins = [7]
Output: 1

Constraints:

1 <= coins.length <= 300
1 <= coins[i] <= 5000
0 <= amount <= 5000
```

## Solution 1: 1D Bottom-Up DP

### Idea

Define `dp[i]` as the number of combinations to make amount `i`. Initialize `dp[0] = 1` (one way to make zero: pick nothing). For each coin in the outer loop, scan amounts from `coin` to `amount` and accumulate: `dp[i] += dp[i - coin]`.

The key insight is the **outer loop must be over coins** — this ensures each combination is counted once. If the outer loop were over amounts, we'd count permutations instead (e.g., `{1,2}` and `{2,1}` as separate). This is the classic **unbounded knapsack** pattern: iterating coins outside and amounts inside allows unlimited reuse of each coin while avoiding duplicates.

```
coins = [1, 2, 5], amount = 5

dp index:     0  1  2  3  4  5
init:         1  0  0  0  0  0

after coin=1: 1  1  1  1  1  1    (only 1s: one way per amount)
after coin=2: 1  1  2  2  3  3    (add combos with 2)
after coin=5: 1  1  2  2  3  4    (add combo 5=5)
                                    ^-- answer: 4
```

Complexity: Time $O(N \cdot M)$ — outer loop over `N` coins, inner loop over `M` amounts. Space $O(M)$ for the dp array.

#### Java

```java []
// O(N*M) time, O(M) space. N: coins length, M: amount.
public static int change(int amount, int[] coins) {
    int[] dp = new int[amount + 1]; // dp[i]: number of combinations for amount i
    dp[0] = 1;
    for (int coin : coins) // outer loop on coins avoids counting permutations
        for (int i = coin; i <= amount; i++) // O(M)
            dp[i] += dp[i - coin];
    return dp[amount];
}
```

#### Python

```python []
class Solution:
    """Bottom-up DP. O(N*M) time, O(M) space. N: len(coins), M: amount."""

    def change(self, amount: int, coins: list[int]) -> int:
        dp = [0] * (amount + 1)  # dp[i]: number of combinations for amount i
        dp[0] = 1
        for coin in coins:  # O(N) outer loop on coins to avoid counting permutations
            for i in range(coin, amount + 1):  # O(M)
                dp[i] += dp[i - coin]
        return dp[amount]
```

#### C++

```cpp []
// O(N*M) time, O(M) space. N: coins.size(), M: amount.
int change(int amount, vector<int> &coins) {
    vector<int> dp(amount + 1, 0);
    dp[0] = 1;
    for (auto coin : coins)          // outer loop on coins avoids counting permutations
        for (int i = coin; i <= amount; i++)
            dp[i] += dp[i - coin];
    return dp[amount];
}
```

#### Rust

```rust []
/// 1D DP. O(N*M) time, O(M) space. N: coins.len(), M: amount.
pub fn change(amount: i32, coins: Vec<i32>) -> i32 {
    let m = amount as usize;
    let mut dp = vec![0; m + 1]; // dp[i]: number of combinations for amount i
    dp[0] = 1;
    for &coin in &coins { // O(N)
        let c = coin as usize;
        for i in c..=m { // O(M)
            dp[i] += dp[i - c];
        }
    }
    dp[m]
}
```

## Solution 2: 2D DP

### Idea

Use a 2D table `dp[i][j]` = number of combinations using the first `i` coins to make amount `j`. The recurrence is:

- **Don't use coin `i`**: `dp[i][j] = dp[i-1][j]`
- **Use coin `i` at least once**: `dp[i][j] += dp[i][j - coins[i-1]]` (note: `dp[i]` not `dp[i-1]`, since coin `i` is unbounded)

Base case: `dp[i][0] = 1` for all `i` — there's exactly one way to make amount 0.

This formulation makes the state transition explicit and is equivalent to Solution 1 before space optimization.

Complexity: Time $O(N \cdot M)$. Space $O(N \cdot M)$ for the 2D table.

#### Java

```java []
// O(N*M) time, O(N*M) space. dp[i][j]: combinations using first i coins for amount j.
public static int change2D(int amount, int[] coins) {
    int n = coins.length;
    int[][] dp = new int[n + 1][amount + 1];
    for (int i = 0; i <= n; i++) dp[i][0] = 1; // one way to make amount 0: use no coins
    for (int i = 1; i <= n; i++) // O(N)
        for (int j = 1; j <= amount; j++) { // O(M)
            dp[i][j] = dp[i - 1][j]; // not using coin i
            if (j >= coins[i - 1])
                dp[i][j] += dp[i][j - coins[i - 1]]; // using coin i at least once
        }
    return dp[n][amount];
}
```

#### Python

```python []
class Solution2:
    """2D DP. O(N*M) time, O(N*M) space. N: len(coins), M: amount."""

    def change(self, amount: int, coins: list[int]) -> int:
        n = len(coins)
        # dp[i][j]: combinations using first i coins for amount j
        dp = [[0] * (amount + 1) for _ in range(n + 1)]
        for i in range(n + 1):  # O(N)
            dp[i][0] = 1  # one way to make amount 0: use no coins
        for i in range(1, n + 1):  # O(N)
            for j in range(1, amount + 1):  # O(M)
                dp[i][j] = dp[i - 1][j]  # skip coin i
                if j >= coins[i - 1]:
                    dp[i][j] += dp[i][j - coins[i - 1]]  # use coin i (unbounded)
        return dp[n][amount]
```

#### C++

```cpp []
// O(N*M) time, O(N*M) space.
// dp[i][j] = number of combinations using first i coins to make amount j.
int change(int amount, vector<int> &coins) {
    int n = coins.size();
    vector<vector<int>> dp(n + 1, vector<int>(amount + 1, 0));
    for (int i = 0; i <= n; i++)
        dp[i][0] = 1; // one way to make amount 0: use no coins
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= amount; j++) {
            dp[i][j] = dp[i - 1][j]; // skip coin i
            if (j >= coins[i - 1])
                dp[i][j] += dp[i][j - coins[i - 1]]; // use coin i
        }
    return dp[n][amount];
}
```

#### Rust

```rust []
/// 2D DP. O(N*M) time, O(N*M) space.
/// dp[i][j] = number of combinations using first i coins for amount j.
pub fn change_2d(amount: i32, coins: Vec<i32>) -> i32 {
    let n = coins.len();
    let m = amount as usize;
    let mut dp = vec![vec![0; m + 1]; n + 1];
    for i in 0..=n {
        dp[i][0] = 1; // one way to make amount 0: use no coins
    }
    for i in 1..=n { // O(N)
        let c = coins[i - 1] as usize;
        for j in 1..=m { // O(M)
            dp[i][j] = dp[i - 1][j]; // don't use coin i
            if j >= c {
                dp[i][j] += dp[i][j - c]; // use coin i (unlimited)
            }
        }
    }
    dp[n][m]
}
```
