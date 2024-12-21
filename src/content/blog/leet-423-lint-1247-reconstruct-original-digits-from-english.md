---
author: JZ
pubDatetime: 2024-12-19T06:23:00Z
modDatetime: 2024-12-19T06:23:00Z
title: LeetCode 423 LintCode 1247 Reconstruct Original Digits from English
featured: true
tags:
  - a-hash
  - a-simulation
  - a-math
  - a-string
description:
  "Solutions for LeetCode 423 LintCode 1247, medium, tags: hash table, simulation, math, string."
---

## Table of contents

## Description

Given a string `s` containing an out-of-order English representation of digits `0-9`, return _the digits in **ascending** order_.

```
Example 1:

Input: s = "owoztneoer"
Output: "012"

Example 2:

Input: s = "fviefuro"
Output: "45"
```

**Constraints:**

-   `1 <= s.length <= 10^5`
-   `s[i]` is one of the characters `["e","g","f","i","h","o","n","s","r","u","t","w","v","x","z"]`.
-   `s` is **guaranteed** to be valid.

## Idea1

This question requires some case study of the english words for digits zero to nine.
We first counter the letters in the input string and the zero to nine digit words with hashmap or counter.

-   Let us look at word `zero`: symbol `z` only can come from this word, so total number of times we have `z` in string is number of times we have word `zero` inside. So we keep global counter `cnt` and subtract all frequencies, corresponding to letters `z`, `e`, `r`, `o`.
-   Look at word `two`, we have symbol `w` only in this word, remove all letters in `two`.
-   Look at word `four`, we have symbol `u` only in this word, remove all letters in `four`.
-   Look at word `six`, we have symbol `x` only in this word, remove all `six`.
-   Look at word `eight`, we have symbol `g` only in this word, remove all `eight`.
-   Look at word `one`, we have symbol `o` only in this word, remove all `one`.
-   Look at word `three`, we have symbol `t` only in this word, remove all `three`.
-   Look at word `five`, we have symbol `f` only in this word, remove all `five`.
-   Look at word `seven`, we have symbol `s` only in this word, remove all `seven`.
-   Look at word `nine`, we have symbol `n` only in this word, remove all `nine`.

When we check the number of each digit in the input string, we could take the minimum of the division between the counters. For example, if there is only one `zero` in the input string, one of the divisions for letters `z`, `e`, `r`, `o` should return the result 1. We can then remove the word `zero` from the input string counter so it does not affect the calculation of the other digits.

The sequence/order is important, consider `nine` is after `seven` and `one`. Letter `n` can only be from `nine` after we remove `one` and `seven` from the input string.

Complexity: Time $O(n)$, Space $O(1)$. Space is constant because the combination of all the letters in the 10 digit words is bound by a constant. The constraint specifies the fifteen letters that are valid.

### Python

```python
class Solution:
    """11 ms, 18.28 mb"""

    def originalDigits(self, s):
        cnt = Counter(s)  # O(n)
        d_s = ["zero", "two", "four", "six", "eight", "one", "three", "five", "seven", "nine"]
        d = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]
        cnts = [Counter(d) for d in d_s]
        d_cnt = [0] * 10
        for it, c in enumerate(cnts):  # O(5*10)
            k = min(cnt[x] // c[x] for x in c)
            for i in c.keys(): c[i] *= k
            cnt -= c
            d_cnt[d[it]] = k
        return "".join([str(i) * d_cnt[i] for i in range(10)])  # O(10)
```

## Idea2

We could observe that the even numbers can be identified uniquely by a letter. So we could determine the count by the hashmap/counter of the input string.

For the odd numbers, we could remove the duplicate letters from previously determined even numbers. For example, for `five`, we could determine its count by subtract the count of `four` from the total count of letter `f`.

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
class Solution2:
    """10 ms, 18.24 mb"""

    def originalDigits(self, s: str) -> str:
        cnt = Counter(s)  # O(n)
        res = [0 for _ in range(10)]
        # map, get even count
        res[0] = cnt['z']
        res[2] = cnt['w']
        res[4] = cnt['u']
        res[6] = cnt['x']
        res[8] = cnt['g']
        # get odd count
        res[1] = cnt['o'] - (res[0] + res[2] + res[4])
        res[3] = cnt['r'] - (res[0] + res[4])
        res[5] = cnt['f'] - res[4]
        res[7] = cnt['s'] - res[6]
        res[9] = cnt['i'] - (res[5] + res[6] + res[8])
        return ''.join(str(i) * c for i, c in enumerate(res))
```
