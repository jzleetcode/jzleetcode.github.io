---
author: JZ
pubDatetime: 2024-12-30T06:23:00Z
modDatetime: 2024-12-30T06:23:00Z
title: LeetCode 1422 Maximum Score After Splitting a String
featured: true
tags:
  - a-string
  - a-prefix-sum
description:
  "Solutions for LeetCode 1422, easy, tags: string, prefix sum."
---

## Table of contents

## Description
Given a string `s` of zeros and ones, _return the maximum score after splitting the string into two **non-empty** substrings_ (i.e. **left** substring and **right** substring).

The score after splitting a string is the number of **zeros** in the **left** substring plus the number of **ones** in the **right** substring.

```
Example 1:

Input: s = "011101"
Output: 5
Explanation:
All possible ways of splitting s into two non-empty substrings are:
left = "0" and right = "11101", score = 1 + 4 = 5
left = "01" and right = "1101", score = 1 + 3 = 4
left = "011" and right = "101", score = 1 + 2 = 3
left = "0111" and right = "01", score = 1 + 1 = 2
left = "01110" and right = "1", score = 2 + 1 = 3

Example 2:

Input: s = "00111"
Output: 5

Explanation: When left = "00" and right = "111", we get the maximum score = 2 + 3 = 5
Example 3:

Input: s = "1111"
Output: 3
```

**Constraints:**

-   `2 <= s.length <= 500`
-   The string `s` consists of characters `'0'` and `'1'` only.

Hint 1

Precompute a prefix sum of ones ('1').

Hint 2

Iterate from left to right counting the number of zeros ('0'), then use the precomputed prefix sum for counting ones ('1'). Update the answer.

## Idea

We could iterate through the characters in the string and keep updating the maximum score. We count all the ones in the string and decrement the count as we see a `1` during the iteration. In each iteration,

1. We update the zero's count
2. We update the remaining one's count
3. We update the maximum score

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
class Solution:
    """0 ms, 17.80 mb"""

    def maxScore(self, s: str) -> int:
        res, zero, r1 = 0, 0, s.count('1')
        for i in range(len(s) - 1):
            zero += s[i] == '0'  # zeros count
            r1 -= s[i] == '1'  # remaining ones count
            res = max(res, zero + r1)
        return res
```
