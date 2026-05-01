---
author: JZ
pubDatetime: 2026-05-01T06:00:00Z
modDatetime: 2026-05-01T06:00:00Z
title: LeetCode 322 Coin Change
featured: true
tags:
  - a-dynamic-programming
  - a-bfs
description:
  "Solutions for LeetCode 322, medium, tags: array, dynamic programming, breadth-first search."
---

## Table of contents

## Description

Question Links: [LeetCode 322](https://leetcode.com/problems/coin-change/description/)

You are given an integer array `coins` representing coins of different denominations and an integer `amount` representing a total amount of money.

Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return `-1`.

You may assume that you have an infinite number of each kind of coin.

```
Example 1:

Input: coins = [1,2,5], amount = 11
Output: 3
Explanation: 11 = 5 + 5 + 1

Example 2:

Input: coins = [2], amount = 3
Output: -1

Example 3:

Input: coins = [1], amount = 0
Output: 0

Constraints:

1 <= coins.length <= 12
1 <= coins[i] <= 2^31 - 1
0 <= amount <= 10^4
```

## Solution 1: Bottom-Up DP

### Idea

Define `dp[i]` as the minimum number of coins needed to make amount `i`. Initialize `dp[0] = 0` and all others to infinity. For each coin, scan amounts from `coin` to `amount`: if `dp[i - coin]` is reachable, update `dp[i] = min(dp[i], dp[i - coin] + 1)`.

This is an **unbounded knapsack** variant — we iterate coins in the outer loop and amounts in the inner loop, allowing each coin to be used multiple times.

```
coins = [1, 2, 5], amount = 11

dp index:  0  1  2  3  4  5  6  7  8  9  10  11
init:      0  .  .  .  .  .  .  .  .  .   .   .

after coin=1:  0  1  2  3  4  5  6  7  8  9  10  11
after coin=2:  0  1  1  2  2  3  3  4  4  5   5   6
after coin=5:  0  1  1  2  2  1  2  2  3  3   2   3
                                                   ^-- answer: 3
```

Note: a greedy approach (always pick the largest coin) fails here. For `coins = [1, 5, 6], amount = 15`, greedy gives `6+6+1+1+1 = 5` coins, but optimal is `5+5+5 = 3` coins.

Complexity: Time $O(N \cdot M)$ — outer loop over `N` coins, inner loop over `M` amounts. Space $O(M)$ for the dp array.

#### Java

```java []
// O(N*M) time, O(M) space. N: coins length, M: amount.
public int coinChangeDP1(int[] coins, int amount) {
    int[] dp = new int[amount + 1]; // dp[i]: min coins for amount i
    for (int i = 1; i < dp.length; i++) dp[i] = Integer.MAX_VALUE; // dp[0]=0
    // dp[i]=min(dp[i-coins[j])+1, j:[0,n-1] i>=coins[j]
    for (int coin : coins) // O(N)
        for (int i = coin; i <= amount; i++) // O(M)
            if (dp[i - coin] != Integer.MAX_VALUE) // visited previously
                dp[i] = Math.min(dp[i], dp[i - coin] + 1);
    return dp[amount] == Integer.MAX_VALUE ? -1 : dp[amount];
}
```

#### Python

```python []
class Solution:
    """Bottom-up DP. O(N*M) time, O(M) space. N: len(coins), M: amount."""

    def coinChange(self, coins: list[int], amount: int) -> int:
        dp = [0] + [float('inf')] * amount  # dp[i]: min coins for amount i
        for coin in coins:  # O(N)
            for i in range(coin, amount + 1):  # O(M)
                if dp[i - coin] != float('inf'):
                    dp[i] = min(dp[i], dp[i - coin] + 1)
        return dp[amount] if dp[amount] != float('inf') else -1
```

#### C++

```cpp []
// O(N*M) time, O(M) space. N: coins.size(), M: amount.
int coinChange(vector<int> &coins, int amount) {
    vector<int> dp(amount + 1, INT_MAX);
    dp[0] = 0;
    for (int c: coins) // O(N)
        for (int i = c; i <= amount; i++) // O(M)
            if (dp[i - c] != INT_MAX)
                dp[i] = min(dp[i], dp[i - c] + 1);
    return dp[amount] == INT_MAX ? -1 : dp[amount];
}
```

#### Rust

```rust []
/// Bottom-up DP. O(N*M) time, O(M) space. N: coins.len(), M: amount.
pub fn coin_change(coins: Vec<i32>, amount: i32) -> i32 {
    let m = amount as usize;
    let mut dp = vec![i32::MAX; m + 1]; // dp[i]: min coins for amount i
    dp[0] = 0;
    for &coin in &coins { // O(N)
        let c = coin as usize;
        for i in c..=m { // O(M)
            if dp[i - c] != i32::MAX {
                dp[i] = dp[i].min(dp[i - c] + 1);
            }
        }
    }
    if dp[m] == i32::MAX { -1 } else { dp[m] }
}
```

## Solution 2: BFS (Shortest Path)

### Idea

Model the problem as a shortest-path search. Start from `amount`, and at each step subtract each coin to reach a new amount. The first time we reach `0`, the number of BFS levels traversed equals the minimum number of coins.

```
coins = [1, 2, 5], amount = 11

Level 0: {11}
Level 1: {10, 9, 6}           subtract 1, 2, 5
Level 2: {9, 8, 5, 7, 4, 1}   (skip visited)
Level 3: {8, 7, 3, 6, 2, 0}   found 0 at level 3 -> answer: 3
                           ^
```

A `visited` array prevents revisiting the same amount, ensuring $O(M)$ states are explored.

Complexity: Time $O(N \cdot M)$ — each of the `M` states is dequeued once, and for each we try `N` coins. Space $O(M)$ for the visited array and queue.

#### Java

```java []
// O(M*N) time, O(M) space for visited, average space for queue < M.
public int coinChangeBFS(int[] coins, int amount) {
    int count = 0;
    Deque<Integer> q = new ArrayDeque<>();
    boolean[] visited = new boolean[amount + 1];
    q.add(amount);
    visited[amount] = true;
    while (!q.isEmpty()) {
        int size = q.size();
        while (size-- > 0) { // O(size)
            int cur = q.remove();
            if (cur == 0) return count;
            for (int coin : coins) { // O(N)
                int next = cur - coin;
                if (next < 0 || visited[next]) continue;
                q.add(next);
                visited[next] = true;
            }
        }
        count++; // ++ after explored all coins with all in the q
    }
    return -1;
}
```

#### Python

```python []
class Solution2:
    """BFS shortest path. O(N*M) time, O(M) space. N: len(coins), M: amount."""

    def coinChange(self, coins: list[int], amount: int) -> int:
        if amount == 0:
            return 0
        visited = [False] * (amount + 1)
        visited[amount] = True
        q = deque([amount])
        count = 0
        while q:
            for _ in range(len(q)):  # O(level size)
                cur = q.popleft()
                if cur == 0:
                    return count
                for coin in coins:  # O(N)
                    nxt = cur - coin
                    if 0 <= nxt and not visited[nxt]:
                        q.append(nxt)
                        visited[nxt] = True
            count += 1
        return -1
```

#### C++

```cpp []
// O(N*M) time, O(M) space.
int coinChange(vector<int> &coins, int amount) {
    if (amount == 0) return 0;
    vector<bool> visited(amount + 1, false);
    queue<int> q;
    q.push(amount);
    visited[amount] = true;
    int count = 0;
    while (!q.empty()) {
        int sz = q.size();
        while (sz-- > 0) { // O(level size)
            int cur = q.front();
            q.pop();
            if (cur == 0) return count;
            for (int coin: coins) { // O(N)
                int nxt = cur - coin;
                if (nxt >= 0 && !visited[nxt]) {
                    q.push(nxt);
                    visited[nxt] = true;
                }
            }
        }
        count++;
    }
    return -1;
}
```

#### Rust

```rust []
/// BFS shortest path. O(N*M) time, O(M) space.
pub fn coin_change_bfs(coins: Vec<i32>, amount: i32) -> i32 {
    if amount == 0 { return 0; }
    let m = amount as usize;
    let mut visited = vec![false; m + 1];
    let mut q = VecDeque::new();
    q.push_back(amount);
    visited[m] = true;
    let mut count = 0;
    while !q.is_empty() {
        let sz = q.len();
        for _ in 0..sz { // O(level size)
            let cur = q.pop_front().unwrap();
            if cur == 0 { return count; }
            for &coin in &coins { // O(N)
                let nxt = cur - coin;
                if nxt >= 0 && !visited[nxt as usize] {
                    q.push_back(nxt);
                    visited[nxt as usize] = true;
                }
            }
        }
        count += 1;
    }
    -1
}
```
