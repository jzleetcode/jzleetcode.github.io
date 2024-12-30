---
author: JZ
pubDatetime: 2024-12-28T06:23:00Z
modDatetime: 2024-12-28T06:23:00Z
title: LeetCode 2466 LintCode 3854 Count Ways to Build Good Strings (Number of Good Binary Strings)
featured: true
tags:
  - a-dp
description:
  "Solutions for LeetCode 2466 LintCode 3854, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Given the integers `zero`, `one`, `low`, and `high`, we can construct a string by starting with an empty string, and then at each step perform either of the following:

-   Append the character `'0'` `zero` times.
-   Append the character `'1'` `one` times.

This can be performed any number of times.

A **good** string is a string constructed by the above process having a **length** between `low` and `high` (**inclusive**).

Return _the number of **different** good strings that can be constructed satisfying these properties._ Since the answer can be large, return it **modulo** `10^9 + 7`.

```
Example 1:

Input: low = 3, high = 3, zero = 1, one = 1
Output: 8
Explanation:
One possible valid good string is "011".
It can be constructed as follows: "" -> "0" -> "01" -> "011".
All binary strings from "000" to "111" are good strings in this example.

Example 2:

Input: low = 2, high = 3, zero = 1, one = 2
Output: 5
Explanation: The good strings are "00", "11", "000", "110", and "011".
```

**Constraints:**

-   `1 <= low <= high <= 10^5`
-   `1 <= zero, one <= low`

Hint 1

Calculate the number of good strings with length less or equal to some constant x.

Hint 2

Apply dynamic programming using the group size of consecutive zeros and ones.

## Idea

We could use dynamic programming (induction, 数学 归纳法). We use an array `dp` to calculate the result and `dp[i]` represents the number of ways for a good string with length `i`.

Let's use example 1 above.

1. When `i==0`, there is only one way (empty string).
2. When `i==1`, we could either append `0` or `1` to the empty string. So `dp[1]==2`.
3. When `i==2`, we could start from `dp[1]` (string of length 2) and append `0` (`dp[1]`) or `1` (`dp[1]`). So `dp[2]==dp[1]+dp[1] == 4`.

Complexity: Time $O(high)$, Space $O(high)$.

### Python

```python
class Solution:
    """87 ms, 22.22 mb"""

    def countGoodStrings(self, low: int, high: int, zero: int, one: int) -> int:
        dp, mod = [1] + [0] * high, 10 ** 9 + 7  # res with length i
        for i in range(1, high + 1):
            if i >= zero:
                dp[i] += dp[i - zero]  # appending zero '0' on top of dp[i-zero]
            if i >= one:
                dp[i] += dp[i - one]  # appending one '1' on top of dp[i-one]
            dp[i] %= mod
        return sum(dp[low: high + 1]) % mod
```
