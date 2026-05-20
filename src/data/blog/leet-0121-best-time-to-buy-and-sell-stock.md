---
author: JZ
pubDatetime: 2026-05-14T10:06:00Z
modDatetime: 2026-05-14T10:06:00Z
title: LeetCode 121 Best Time to Buy and Sell Stock
featured: false
tags:
  - a-array
  - a-dp
description:
  "Solutions for LeetCode 121, easy, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 121](https://leetcode.com/problems/best-time-to-buy-and-sell-stock/description/)

You are given an array `prices` where `prices[i]` is the price of a given stock on the `i`th day.

You want to maximize your profit by choosing a **single day** to buy one stock and choosing a **different day in the future** to sell that stock.

Return _the maximum profit you can achieve from this transaction_. If you cannot achieve any profit, return `0`.

```
Example 1:

Input: prices = [7,1,5,3,6,4]
Output: 5
Explanation: Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 6-1 = 5.
Note that buying on day 2 and selling on day 1 is not allowed because you must buy before you sell.

Example 2:

Input: prices = [7,6,4,3,1]
Output: 0
Explanation: In this case, no transactions are done and the max profit = 0.
```

**Constraints:**

- `1 <= prices.length <= 10^5`
- `0 <= prices[i] <= 10^4`

## Idea1

We scan through the array once, keeping track of the minimum price seen so far. At each index, the best profit we could make by selling at the current price is `price - minSoFar`. We take the maximum across all indices.

```
prices:   [7, 1, 5, 3, 6, 4]
minSoFar: [7, 1, 1, 1, 1, 1]
profit:   [0, 0, 4, 2, 5, 3]  -> max = 5
```

Complexity: Time $O(n)$ — single pass, Space $O(1)$ — two variables.

### Java

```java []
public class BuySellStock {
    // O(n) time, O(1) space.
    public int maxProfitMinPrice(int[] prices) {
        int res = 0, minSoFar = Integer.MAX_VALUE;
        for (int price : prices) {
            minSoFar = Math.min(minSoFar, price);
            res = Math.max(res, price - minSoFar); // max profit if sold at current index
        }
        return res;
    }
}
```

### Python

```python []
class Solution:
    def maxProfit(self, prices: list[int]) -> int:
        """One pass tracking min price. O(n) time, O(1) space."""
        res, min_seen = 0, inf
        for p in prices:  # O(n)
            min_seen = min(p, min_seen)
            res = max(res, p - min_seen)
        return res
```

### C++

```cpp []
class SolutionBuySellStock {
public:
    // One pass tracking min price seen so far. Time O(n), Space O(1).
    int maxProfitMinPrice(const vector<int>& prices) {
        int minPrice = INT_MAX, maxProfit = 0;
        for (int p : prices) {
            minPrice = min(minPrice, p);
            maxProfit = max(maxProfit, p - minPrice);
        }
        return maxProfit;
    }
};
```

### Rust

```rust []
use std::cmp::{max, min};

impl Solution {
    /// One pass tracking min price. O(n) time, O(1) space.
    pub fn max_profit(prices: Vec<i32>) -> i32 {
        let (mut min_price, mut profit) = (i32::MAX, 0);
        for p in prices {
            min_price = min(min_price, p);
            profit = max(profit, p - min_price);
        }
        profit
    }
}
```

## Idea2

We can also view this problem as finding the maximum subarray sum, where the "array" is the daily price changes (deltas). This is a direct application of Kadane's algorithm.

```
prices: [7, 1, 5, 3, 6, 4]
deltas: [  -6, 4,-2, 3,-2]
Kadane: [   0, 4, 2, 5, 3]  -> max = 5

maxHere resets to 0 when cumulative gain turns negative (equivalent to choosing a new buy day).
```

Complexity: Time $O(n)$ — single pass, Space $O(1)$ — two variables.

### Java

```java []
public class BuySellStock {
    // O(n) time, O(1) space.
    public int maxProfitKadane(int[] prices) {
        int maxHere = 0, res = 0;
        for (int i = 1; i < prices.length; i++) {
            maxHere = Math.max(0, maxHere + (prices[i] - prices[i - 1]));
            res = Math.max(maxHere, res);
        }
        return res;
    }
}
```

### Python

```python []
class Solution2:
    def maxProfit(self, prices: list[int]) -> int:
        """Kadane's algorithm on daily price changes. O(n) time, O(1) space."""
        max_here = res = 0
        for i in range(1, len(prices)):  # O(n)
            max_here = max(0, max_here + prices[i] - prices[i - 1])
            res = max(res, max_here)
        return res
```

### C++

```cpp []
class SolutionBuySellStock {
public:
    // Kadane's algorithm on daily price changes. Time O(n), Space O(1).
    int maxProfitKadane(const vector<int>& prices) {
        int maxProfit = 0, curMax = 0;
        for (int i = 1; i < (int)prices.size(); ++i) {
            curMax = max(0, curMax + prices[i] - prices[i - 1]);
            maxProfit = max(maxProfit, curMax);
        }
        return maxProfit;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Kadane's algorithm on daily price changes. O(n) time, O(1) space.
    pub fn max_profit_kadane(prices: Vec<i32>) -> i32 {
        let (mut max_here, mut res) = (0, 0);
        for i in 1..prices.len() {
            max_here = max(0, max_here + prices[i] - prices[i - 1]);
            res = max(res, max_here);
        }
        res
    }
}
```
