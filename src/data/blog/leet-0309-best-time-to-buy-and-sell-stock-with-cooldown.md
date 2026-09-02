---
author: JZ
pubDatetime: 2026-09-02T10:37:00Z
modDatetime: 2026-09-02T10:37:00Z
title: LeetCode 309 Best Time to Buy and Sell Stock with Cooldown
featured: true
tags:
  - a-array
  - a-dp
description:
  "Solutions for LeetCode 309, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 309](https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-cooldown/description/)

You are given an array `prices` where `prices[i]` is the price of a given stock on the `i`th day.

Find the maximum profit you can achieve. You may complete as many transactions as you like (i.e., buy one and sell one share of the stock multiple times) with the following restrictions:

- After you sell your stock, you cannot buy stock on the next day (i.e., cooldown one day).

**Note:** You may not engage in multiple transactions simultaneously (i.e., you must sell the stock before you buy again).

```
Example 1:

Input: prices = [1,2,3,0,2]
Output: 3
Explanation: transactions = [buy, sell, cooldown, buy, sell]

Example 2:

Input: prices = [1]
Output: 0
```

**Constraints:**

- `1 <= prices.length <= 5000`
- `0 <= prices[i] <= 1000`

## Idea1

Model the problem as a state machine with three states:

- **hold**: we own a share of stock
- **sold**: we just sold (must cooldown next day)
- **rest**: we are idle (cooldown finished, or never bought)

On each day, transitions are:

```
         buy
 rest ---------> hold
  ^               |
  |               | sell
  | cooldown      v
  +----------- sold
```

The recurrences on day `i` with price `p`:

- `hold = max(hold, rest - p)` — keep holding, or buy from rest
- `sold = hold + p` — sell what we hold
- `rest = max(rest, sold)` — stay idle, or transition from sold (cooldown done)

All three update simultaneously from previous-day values. The answer is `max(sold, rest)` — we never want to end holding stock.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
// solution 1, 0ms 40.5 Mb. O(n) time O(1) space.
public int maxProfitDP2(int[] prices) {
    int l = prices.length;
    if (l < 2) return 0;
    // initializing assuming index at 2, b1, b0 represent buy[i - 1], buy[i]
    int b2 = -prices[0], b1 = Math.max(-prices[0], -prices[1]), b0;
    // s2, s1, s0 represent sell[i - 2], sell[i - 1], sell[i]
    int s2 = 0, s1 = Math.max(s2, b2 + prices[1]), s0 = Integer.MIN_VALUE;
    if (l == 2) return s1; // edge case
    for (int i = 2; i < prices.length; i++) {
        b0 = Math.max(b1, s2 - prices[i]);
        s0 = Math.max(s1, b1 + prices[i]);
        b1 = b0; // i++, b1 -> b0
        s2 = s1;
        s1 = s0;
    }
    return s0;
}
```

### Python

```python []
def maxProfit(self, prices: List[int]) -> int:
    hold, sold, rest = float('-inf'), 0, 0
    for p in prices:  # O(n)
        hold, sold, rest = max(hold, rest - p), hold + p, max(rest, sold)
    return max(sold, rest)
```

### C++

```cpp []
static int maxProfitStateMachine(const vector<int>& prices) {
    int hold = INT_MIN, sold = 0, rest = 0;
    for (int p : prices) { // O(n)
        int prevSold = sold;
        sold = hold + p;
        hold = max(hold, rest - p);
        rest = max(rest, prevSold);
    }
    return max(sold, rest);
}
```

### Rust

```rust []
pub fn max_profit(prices: Vec<i32>) -> i32 {
    let (mut hold, mut sold, mut rest) = (i32::MIN, 0, 0);
    for p in prices { // O(n)
        let prev_hold = hold;
        hold = max(hold, rest - p);
        rest = max(rest, sold);
        sold = prev_hold + p;
    }
    max(sold, rest)
}
```

## Idea2

Use two DP arrays `buy[i]` and `sell[i]`:

- `buy[i]` — max profit ending with a buy (holding stock) on day `i`
- `sell[i]` — max profit ending with a sell (no stock) on day `i`

Recurrences:

- `buy[i] = max(buy[i-1], sell[i-2] - prices[i])` — keep previous buy, or buy today after cooldown from sell two days ago
- `sell[i] = max(sell[i-1], buy[i-1] + prices[i])` — keep previous sell, or sell today what we bought on or before yesterday

Base cases: `buy[0] = -prices[0]`, `sell[0] = 0`, `buy[1] = max(-prices[0], -prices[1])`, `sell[1] = max(0, buy[0] + prices[1])`.

```
prices = [1, 2, 3, 0, 2]

day      0    1    2    3    4
buy     -1   -1   -1    0   -1
sell     0    1    2    2    3   <-- answer
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// solution 2, O(n) time and space, 1ms, 40.1 Mb.
public int maxProfitDP1(int[] prices) {
    int len = prices.length;
    if (len < 2) return 0;
    int[] sell = new int[len]; // O(n) space
    int[] buy = new int[len];
    buy[0] = -prices[0];
    sell[0] = 0;
    buy[1] = -Math.min(prices[0], prices[1]);
    sell[1] = Math.max(0, buy[0] + prices[1]);
    for (int i = 2; i < len; i++) { // O(n)
        buy[i] = Math.max(buy[i - 1], sell[i - 2] - prices[i]);
        sell[i] = Math.max(sell[i - 1], buy[i - 1] + prices[i]);
    }
    return sell[len - 1];
}
```

### Python

```python []
def maxProfit(self, prices: List[int]) -> int:
    n = len(prices)
    if n < 2:
        return 0
    buy = [0] * n  # O(n) space
    sell = [0] * n
    buy[0] = -prices[0]
    buy[1] = max(-prices[0], -prices[1])
    sell[1] = max(0, buy[0] + prices[1])
    for i in range(2, n):  # O(n)
        buy[i] = max(buy[i - 1], sell[i - 2] - prices[i])
        sell[i] = max(sell[i - 1], buy[i - 1] + prices[i])
    return sell[n - 1]
```

### C++

```cpp []
static int maxProfitDPArray(const vector<int>& prices) {
    int n = (int)prices.size();
    if (n < 2) return 0;
    vector<int> buy(n), sell(n); // O(n) space
    buy[0] = -prices[0];
    sell[0] = 0;
    buy[1] = max(buy[0], -prices[1]);
    sell[1] = max(sell[0], buy[0] + prices[1]);
    for (int i = 2; i < n; ++i) { // O(n)
        buy[i] = max(buy[i - 1], sell[i - 2] - prices[i]);
        sell[i] = max(sell[i - 1], buy[i - 1] + prices[i]);
    }
    return sell[n - 1];
}
```

### Rust

```rust []
pub fn max_profit_dp(prices: Vec<i32>) -> i32 {
    let n = prices.len();
    if n < 2 { return 0; }
    let mut buy = vec![0; n]; // O(n) space
    let mut sell = vec![0; n];
    buy[0] = -prices[0];
    buy[1] = max(-prices[0], -prices[1]);
    sell[1] = max(0, prices[1] - prices[0]);
    for i in 2..n { // O(n)
        buy[i] = max(buy[i - 1], sell[i - 2] - prices[i]);
        sell[i] = max(sell[i - 1], buy[i - 1] + prices[i]);
    }
    sell[n - 1]
}
```
