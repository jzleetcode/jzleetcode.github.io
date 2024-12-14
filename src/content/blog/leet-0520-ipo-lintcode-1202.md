---
author: JZ
pubDatetime: 2024-12-12T06:23:00Z
modDatetime: 2024-12-12T06:23:00Z
title: LeetCode 520 LintCode 1202 IPO
featured: true
tags:
  - a-sorting
  - a-heap
  - a-greedy
  - a-array
  - a-binary-search
  - a-dp
  - a-quick-select
description:
  "Solutions for LeetCode 520 LintCode 1202, hard, tags: array, heap, greedy, sorting, binary search, dynamic programming, quick select."
---

## Table of contents

## Description

Suppose LeetCode will start its **IPO** soon. In order to sell a good price of its shares to Venture Capital, LeetCode would like to work on some projects to increase its capital before the **IPO**. Since it has limited resources, it can only finish at most `k` distinct projects before the **IPO**. Help LeetCode design the best way to maximize its total capital after finishing at most `k` distinct projects.

You are given `n` projects where the `ith` project has a pure profit `profits[i]` and a minimum capital of `capital[i]` is needed to start it.

Initially, you have `w` capital. When you finish a project, you will obtain its pure profit and the profit will be added to your total capital.

Pick a list of **at most** `k` distinct projects from given projects to **maximize your final capital**, and return _the final maximized capital_.

The answer is guaranteed to fit in a 32-bit signed integer.

```
Example 1:

Input: k = 2, w = 0, profits = [1,2,3], capital = [0,1,1]
Output: 4
Explanation: Since your initial capital is 0, you can only start the project indexed 0.
After finishing it you will obtain profit 1 and your capital becomes 1.
With capital 1, you can either start the project indexed 1 or the project indexed 2.
Since you can choose at most 2 projects, you need to finish the project indexed 2 to get the maximum capital.
Therefore, output the final maximized capital, which is 0 + 1 + 3 = 4.

Example 2:

Input: k = 3, w = 0, profits = [1,2,3], capital = [0,1,2]
Output: 6
```

**Constraints:**

-   `1 <= k <= 10^5`
-   `0 <= w <= 10^9`
-   `n == profits.length`
-   `n == capital.length`
-   `1 <= n <= 10^5`
-   `0 <= profits[i] <= 10^4`
-   `0 <= capital[i] <= 10^9`

## Idea

Each time we try to pick a project, we can greedily perform the following.

1. Find all projects with capital less than or equal to the current capital `w`.
2. Pick the project with the maximum profit from the list of projects in step above. update the capital. we could use a max heap to keep the pending projects with cost that we could afford so it would be convenient to pick the maximum from that collection.

After `k` iterations, we return the capital at the end.

Complexity: Time $O(n \log n+k \log n)$, Space $O(n)$.

### Python

```python
class Solution:
    """286 ms, 42.4 mb"""

    def findMaximizedCapital(self, k: int, w: int, profits: list[int], capital: list[int]) -> int:
        pq, i = [], 0
        p = sorted(zip(capital, profits))
        for _ in range(k):
            while i < len(p) and p[i][0] <= w:
                heappush(pq, -p[i][1])
                i += 1
            if pq: w -= heappop(pq)
        return w
```
