---
author: JZ
pubDatetime: 2026-09-28T10:00:00Z
modDatetime: 2026-09-28T10:00:00Z
title: LeetCode 983 Minimum Cost For Tickets
featured: true
tags:
  - a-dp
description:
  "Solutions for LeetCode 983, medium, tags: dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 983](https://leetcode.com/problems/minimum-cost-for-tickets/description/)

You have planned some train traveling one year in advance. The days of the year in which you will travel are given as an integer array `days`. Each day is an integer from `1` to `365`.

Train tickets are sold in **three different ways**:

- a **1-day** pass is sold for `costs[0]` dollars,
- a **7-day** pass is sold for `costs[1]` dollars, and
- a **30-day** pass is sold for `costs[2]` dollars.

The passes allow that many days of consecutive travel.

Return _the minimum number of dollars you need to travel every day in the given list of days_.

```
Example 1:

Input: days = [1,4,6,7,8,20], costs = [2,7,15]
Output: 11
Explanation: For example, here is one way to buy passes that lets you travel your travel plan:
On day 1, you bought a 1-day pass for costs[0] = $2, which covered day 1.
On day 3, you bought a 7-day pass for costs[1] = $7, which covered days 3-9. Note day 3 is not a travel day.
On day 20, you bought a 1-day pass for costs[0] = $2, which covered day 20.
In total, you spent $11 and covered all the days of your travel.

Example 2:

Input: days = [1,2,3,4,5,6,7,8,9,10,30,31], costs = [2,7,15]
Output: 17
Explanation: For example, here is one way to buy passes that lets you travel your travel plan:
On day 1, you bought a 30-day pass for costs[2] = $15, which covered days 1-30.
On day 31, you bought a 1-day pass for costs[0] = $2, which covered day 31.
In total, you spent $17 and covered all the days of your travel.
```

**Constraints:**

- `1 <= days.length <= 365`
- `1 <= days[i] <= 365`
- `days` is in strictly increasing order.
- `costs.length == 3`
- `1 <= costs[i] <= 1000`

## Idea 1: DP on Calendar Days

Define `dp[d]` as the minimum cost to cover all travel days from day 1 to day `d`.

- If day `d` is **not** a travel day: `dp[d] = dp[d-1]` (no pass needed).
- If day `d` **is** a travel day: try all three pass types and take the minimum:

$$dp[d] = \min(dp[d-1] + c_1,\; dp[\max(0, d-7)] + c_7,\; dp[\max(0, d-30)] + c_{30})$$

```
days = [1, 4, 6, 7, 8, 20],  costs = [2, 7, 15]

day:   1   2   3   4   5   6   7   8  ...  20
       T           T       T   T   T       T     (T = travel day)
dp:    2   2   2   4   4   7   7   7  ...  11

dp[1] = min(0+2, 0+7, 0+15) = 2    (buy 1-day)
dp[4] = min(2+2, 0+7, 0+15) = 4    (buy 1-day)
dp[6] = min(4+2, 0+7, 0+15) = 6→7? actually min(6, 7, 15) but wait...
        dp[5]+2=6, dp[max(0,6-7)]+7=0+7=7, dp[max(0,6-30)]+15=0+15=15
        = min(6, 7, 15) = 6... let's retrace:
dp[6] = min(dp[5]+2, dp[0]+7, dp[0]+15) = min(4+2, 0+7, 0+15) = 6
dp[7] = min(dp[6]+2, dp[0]+7, dp[0]+15) = min(6+2, 0+7, 0+15) = 7
dp[8] = min(dp[7]+2, dp[1]+7, dp[0]+15) = min(7+2, 2+7, 0+15) = 9
        hmm that gives 9, but we expect the 7-day pass from day 3-9...
        the DP handles this: a 7-day pass bought on day 8 covers days 2-8.
        dp[max(0,8-7)] = dp[1] = 2, so 2+7=9.
dp[20]= min(dp[19]+2, dp[13]+7, dp[0]+15) = min(9+2, 9+7, 0+15) = 11
```

Complexity: Time $O(L)$ where $L$ is the last travel day ($\le 365$), Space $O(L)$.

### Java

```java []
// O(lastDay) time, O(lastDay) space.
public int mincostTickets(int[] days, int[] costs) {
    int lastDay = days[days.length - 1];
    int dp[] = new int[lastDay + 1];
    Arrays.fill(dp, 0);
    int i = 0;
    for (int day = 1; day <= lastDay; day++) {  // O(lastDay)
        if (day < days[i]) {
            dp[day] = dp[day - 1];
        } else {
            i++;
            dp[day] = Math.min(dp[day - 1] + costs[0],             // 1-day
                    Math.min(dp[Math.max(0, day - 7)] + costs[1],   // 7-day
                            dp[Math.max(0, day - 30)] + costs[2])); // 30-day
        }
    }
    return dp[lastDay];
}
```

### Python

```python []
class Solution:
    """DP on calendar days. O(last_day) time, O(last_day) space."""

    def mincostTickets(self, days: list[int], costs: list[int]) -> int:
        travel = set(days)
        last_day = days[-1]
        dp = [0] * (last_day + 1)  # dp[d]: min cost to cover days 1..d
        for d in range(1, last_day + 1):  # O(last_day)
            if d not in travel:
                dp[d] = dp[d - 1]
            else:
                dp[d] = min(
                    dp[d - 1] + costs[0],                  # 1-day pass
                    dp[max(0, d - 7)] + costs[1],          # 7-day pass
                    dp[max(0, d - 30)] + costs[2],         # 30-day pass
                )
        return dp[last_day]
```

### C++

```cpp []
// O(lastDay) time, O(lastDay) space.
int mincostTickets(vector<int> &days, vector<int> &costs) {
    int lastDay = days.back();
    unordered_set<int> travelDays(days.begin(), days.end());
    vector<int> dp(lastDay + 1, 0);
    for (int d = 1; d <= lastDay; d++) {  // O(lastDay)
        if (travelDays.find(d) == travelDays.end()) {
            dp[d] = dp[d - 1];
        } else {
            dp[d] = min({dp[d - 1] + costs[0],           // 1-day
                         dp[max(0, d - 7)] + costs[1],    // 7-day
                         dp[max(0, d - 30)] + costs[2]}); // 30-day
        }
    }
    return dp[lastDay];
}
```

### Rust

```rust []
// O(lastDay) time, O(lastDay) space.
pub fn mincost_tickets(days: Vec<i32>, costs: Vec<i32>) -> i32 {
    let last = *days.last().unwrap() as usize;
    let mut is_travel = vec![false; last + 1];
    for &d in &days {
        is_travel[d as usize] = true;
    }
    let mut dp = vec![0; last + 1];
    for d in 1..=last {  // O(lastDay)
        if !is_travel[d] {
            dp[d] = dp[d - 1];
        } else {
            dp[d] = dp[d - 1] + costs[0];                          // 1-day
            dp[d] = dp[d].min(dp[d.saturating_sub(7)] + costs[1]);  // 7-day
            dp[d] = dp[d].min(dp[d.saturating_sub(30)] + costs[2]); // 30-day
        }
    }
    dp[last]
}
```

## Idea 2: DP on Travel Day Indices

Instead of iterating over every calendar day, define `dp[i]` as the minimum cost to cover travel from `days[i]` onward. Work backwards from the last travel day. For each index `i`, try each pass type and find the next uncovered travel day index `j`:

$$dp[i] = \min_{k \in \{0,1,2\}} \bigl( costs[k] + dp[j_k] \bigr)$$

where $j_k$ is the first index such that $days[j_k] \ge days[i] + duration_k$.

This approach only visits `n` travel days instead of up to 365 calendar days.

Complexity: Time $O(n)$, Space $O(n)$, where $n$ is the number of travel days.

### Java

```java []
// O(n) time, O(n) space. n = days.length.
public int mincostTickets(int[] days, int[] costs) {
    int n = days.length;
    int[] durations = {1, 7, 30};
    int[] dp = new int[n + 1]; // dp[n] = 0
    for (int i = n - 1; i >= 0; i--) {
        dp[i] = Integer.MAX_VALUE;
        int j = i + 1;
        for (int k = 0; k < 3; k++) {  // O(3)
            while (j < n && days[j] < days[i] + durations[k]) j++;
            dp[i] = Math.min(dp[i], costs[k] + dp[j]);
        }
    }
    return dp[0];
}
```

### Python

```python []
class Solution2:
    """DP on travel day indices with recursion + memo. O(n) time, O(n) space."""

    def mincostTickets(self, days: list[int], costs: list[int]) -> int:
        n = len(days)
        durations = [1, 7, 30]
        memo = {}

        def dp(i: int) -> int:
            if i >= n:
                return 0
            if i in memo:
                return memo[i]
            res = float('inf')
            j = i
            for cost, dur in zip(costs, durations):  # O(3)
                while j < n and days[j] < days[i] + dur:
                    j += 1
                res = min(res, cost + dp(j))
            memo[i] = res
            return res

        return dp(0)
```

### C++

```cpp []
// O(n) time, O(n) space. n = days.size().
int mincostTickets(vector<int> &days, vector<int> &costs) {
    int n = days.size();
    vector<int> memo(n, -1);
    return solve(days, costs, 0, memo);
}
int solve(vector<int> &days, vector<int> &costs, int i, vector<int> &memo) {
    if (i >= (int)days.size()) return 0;
    if (memo[i] != -1) return memo[i];
    int res = costs[0] + solve(days, costs, i + 1, memo);        // 1-day
    int j = i;
    while (j < (int)days.size() && days[j] < days[i] + 7) j++;
    res = min(res, costs[1] + solve(days, costs, j, memo));      // 7-day
    j = i;
    while (j < (int)days.size() && days[j] < days[i] + 30) j++;
    res = min(res, costs[2] + solve(days, costs, j, memo));      // 30-day
    return memo[i] = res;
}
```

### Rust

```rust []
// O(n) time, O(n) space. n = days.len(). Bottom-up tabulation.
pub fn mincost_tickets2(days: Vec<i32>, costs: Vec<i32>) -> i32 {
    let n = days.len();
    let durations = [1, 7, 30];
    let mut dp = vec![0; n + 1]; // dp[n] = 0 (no more days to cover)
    for i in (0..n).rev() {
        dp[i] = i32::MAX;
        for (k, &dur) in durations.iter().enumerate() {
            let target = days[i] + dur;
            let mut j = i + 1;
            while j < n && days[j] < target {
                j += 1;
            }
            dp[i] = dp[i].min(costs[k] + dp[j]);
        }
    }
    dp[0]
}
```
