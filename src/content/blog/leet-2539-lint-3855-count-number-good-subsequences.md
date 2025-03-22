---
author: JZ
pubDatetime: 2024-12-10T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: LeetCode 2539 LintCode 3855 Count the Number of Good Subsequences
featured: true
draft: true
tags:
  - leetcode-locked
  - a-hash
  - a-math
  - a-combinatorics
  - a-string
description:
  "Solutions for LeetCode 2539 LintCode 3855, hard, tags: enumerate, string, hash table, math, combinatorics, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 2539](https://leetcode.com/problems/count-the-number-of-good-subsequences/), [LintCode 3855](https://www.lintcode.com/problem/3855/description)

## Description

[](https://github.com/doocs/leetcode/blob/main/solution/2500-2599/2539.Count%20the%20Number%20of%20Good%20Subsequences/README_EN.md#description)

A **subsequence** of a string is good if it is not empty and the frequency of each one of its characters is the same.

Given a string `s`, return _the number of good subsequences of_ `s`. Since the answer may be too large, return it modulo `10^9 + 7`.

A **subsequence** is a string that can be derived from another string by deleting some or no characters without changing the order of the remaining characters.

```
Example 1:

Input: s = "aabb"
Output: 11
Explanation: The total number of subsequences is 24. There are five subsequences which are not good: "aabb", "aabb", "aabb", "aabb", and the empty subsequence. Hence, the number of good subsequences is 24-5 = 11.

Example 2:

Input: s = "leet"
Output: 12
Explanation: There are four subsequences which are not good: "leet", "leet", "leet", and the empty subsequence. Hence, the number of good subsequences is 24-4 = 12.
Example 3:

Input: s = "abcd"
Output: 15
Explanation: All of the non-empty subsequences are good subsequences. Hence, the number of good subsequences is 24-1 = 15.
```

**Constraints:**

-   `1 <= s.length <= 10^4`
-   `s` consists of only lowercase English letters.

## Idea

```rust
let n = s.length;
```

Let's consider example 1, the string "aabb".

1. We count the letters and get `{a:2, b:2}`.
2. We loop over all possible frequencies. For this example, the frequency could be 1 and 2.
3. For each frequency f, we could choose from the letters with frequency greater than f. We could choose f letters from there or none. We then remove one since empty string does not qualify.
4. For frequency 1, we calculate the number of ways we can form subsequences where each character ('a' and 'b') appears once. The combination for each character is `Comb(2, 1)+1 == 3` (choose one or none). The total possibilities is `3*3 - 1 == 8`.
5. For frequency 2, we can choose two or none, so the possibility is `Comb(2,2)+1 == 2`. The total is `2*2-1==3`.

We could precompute the results for calculating the combination function (n choose k).

Complexity: Time $O(n)$, Space $O(n)$.

### Python

```python
from collections import Counter

N = 10001
MOD = 10**9 + 7
f = [1] * N
g = [1] * N
for i in range(1, N):
    f[i] = f[i - 1] * i % MOD
    g[i] = pow(f[i], MOD - 2, MOD)


def comb(n, k):
    return f[n] * g[k] * g[n - k] % MOD


class Solution:
    """
    467 ms, 5.05 mb with Python math.comb()
    121 ms, 5.66 mb
    """
    def countGoodSubsequences(self, s: str) -> int:
        cnt = Counter(s)
        ans = 0
        for i in range(1, max(cnt.values()) + 1):
            x = 1
            for v in cnt.values():
                if v >= i:
                    x = x * (comb(v, i) + 1) % MOD
            ans = (ans + x - 1) % MOD
        return ans
```

## References

1. modular multiplicative inverse [wiki](https://en.wikipedia.org/wiki/Modular_multiplicative_inverse)
2. modular multiplicative inverse chinese [OI wiki](https://oi-wiki.org/math/number-theory/inverse/)
3. [algo monster](https://algo.monster/liteproblems/2539)
