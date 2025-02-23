---
author: JZ
pubDatetime: 2025-02-20T06:23:00Z
modDatetime: 2025-02-22T06:23:00Z
title: LeetCode 2450 LintCode 3841 Number of Distinct Binary Strings After Applying Operations
featured: true
tags:
  - a-math
  - a-string
  - leetcode-locked
description:
  "Solutions for LeetCode 2450 LintCode 3841, medium, tags: math, string."
---

## Table of contents

## Description

You are given a **binary** string `s` and a positive integer `k`.

You can apply the following operation on the string **any** number of times:

-   Choose any substring of size `k` from `s` and **flip** all its characters, that is, turn all `1`'s into `0`'s, and all `0`'s into `1`'s.

Return _the number of **distinct** strings you can obtain_. Since the answer may be too large, return it **modulo** `10^9 + 7`.

**Note** that:

-   A binary string is a string that consists **only** of the characters `0` and `1`.
-   A substring is a contiguous part of a string.


```
Example 1:

Input: s = "1001", k = 3
Output: 4
Explanation: We can obtain the following strings:
- Applying no operation on the string gives s = "1001".
- Applying one operation on the substring starting at index 0 gives s = "0111".
- Applying one operation on the substring starting at index 1 gives s = "1110".
- Applying one operation on both the substrings starting at indices 0 and 1 gives s = "0000".
It can be shown that we cannot obtain any other string, so the answer is 4.

Example 2:

Input: s = "10110", k = 5
Output: 2
Explanation: We can obtain the following strings:
- Applying no operation on the string gives s = "10110".
- Applying one operation on the whole string gives s = "01001".
It can be shown that we cannot obtain any other string, so the answer is 2.
```

**Constraints:**

-   `1 <= k <= s.length <= 10^5`
-   `s[i]` is either `0` or `1`.

## Idea

`let n = s.length`

There are `n-k+1` substrings of length `k`, and each substring can be flipped, so there are $2^{n-k+1}$ ways to flip.

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
class Solution:
    """81 ms, 5.32 mb"""

    def count_distinct_strings(self, s: str, k: int) -> int:
        return pow(2, len(s) - k + 1) % (10 ** 9 + 7)
```

### Java

```java
class Solution {
    public static final int MOD = (int) 1e9 + 7;

    public int countDistinctStrings(String s, int k) {
        int ans = 1;
        for (int i = 0; i < s.length() - k + 1; i++) ans = (ans * 2) % MOD;
        return ans;
    }
}
```

### C++

```cpp
class Solution {
public:
    const int mod = 1e9 + 7;

    int countDistinctStrings(string s, int k) {
        int ans = 1;
        for (int i = 0; i < s.size() - k + 1; ++i) ans = (ans * 2) % mod;
        return ans;
    }
};
```
