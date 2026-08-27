---
author: JZ
pubDatetime: 2026-08-27T06:00:00Z
modDatetime: 2026-08-27T06:00:00Z
title: LeetCode 97 Interleaving String
featured: true
tags:
  - a-string
  - a-dynamic-programming
description:
  "Solutions for LeetCode 97, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 97](https://leetcode.com/problems/interleaving-string/description/)

Given strings `s1`, `s2`, and `s3`, find whether `s3` is formed by an **interleaving** of `s1` and `s2`.

An **interleaving** of two strings `s` and `t` is a configuration where `s` and `t` are divided into `n` and `m` substrings respectively, such that:

- `s = s1 + s2 + ... + sn`
- `t = t1 + t2 + ... + tm`
- `|n - m| <= 1`
- The interleaving is `s1 + t1 + s2 + t2 + ...` or `t1 + s1 + t2 + s2 + ...`

The relative order of characters from each string is preserved.

```
Example 1:

Input: s1 = "aabcc", s2 = "dbbca", s3 = "aadbbcbcac"
Output: true
Explanation: One way to obtain s3:
  s1 = aa|b|cc
  s2 = d|bbc|a
  s3 = aa d bbc b c a c
       s1 s2  s2 s1 s2 s1

Example 2:

Input: s1 = "aabcc", s2 = "dbbca", s3 = "aadbbbaccc"
Output: false

Example 3:

Input: s1 = "", s2 = "", s3 = ""
Output: true

Constraints:

0 <= s1.length, s2.length <= 100
0 <= s3.length <= 200
s1, s2, and s3 consist of lowercase English letters.
```

## Solution 1: 1D DP (Space-Optimized)

### Idea

Define `dp[j]` as whether `s3[0..i+j-1]` can be formed by interleaving `s1[0..i-1]` and `s2[0..j-1]`. Since each row only depends on the current row and previous row values, we compress the 2D table to a 1D array of size `n+1`.

At each cell `(i, j)`, we can reach it either from above (taking a character from `s1`) or from the left (taking a character from `s2`):

```
dp[j] = (dp[j] && s1[i-1] == s3[i+j-1])       // from above: s1 contributes
      || (dp[j-1] && s2[j-1] == s3[i+j-1])     // from left: s2 contributes
```

```
s1 = "aabcc", s2 = "dbbca", s3 = "aadbbcbcac"
m = 5, n = 5

        ""    d     b     b     c     a
  "" [  T     F     F     F     F     F  ]
   a [  T     F     F     F     F     F  ]
   a [  T     T     T     T     T     F  ]
   b [  F     T     T     F     T     F  ]
   c [  F     F     T     T     T     T  ]
   c [  F     F     F     T     F     T  ]

dp[5] = True -> answer is True
```

Complexity: Time $O(mn)$ — two nested loops over `m` rows and `n` columns. Space $O(n)$ for the 1D dp array.

#### Java

```java []
public static boolean isInterleave(String s1, String s2, String s3) {
    int m = s1.length(), n = s2.length();
    if (m + n != s3.length()) return false;
    boolean[] dp = new boolean[n + 1];
    dp[0] = true;
    for (int j = 1; j <= n; j++) dp[j] = dp[j - 1] && s2.charAt(j - 1) == s3.charAt(j - 1); // base case
    for (int i = 1; i <= m; i++) { // O(m) rows
        dp[0] = dp[0] && s1.charAt(i - 1) == s3.charAt(i - 1);
        for (int j = 1; j <= n; j++) { // O(n) cols
            dp[j] = (dp[j] && s1.charAt(i - 1) == s3.charAt(i + j - 1))
                    || (dp[j - 1] && s2.charAt(j - 1) == s3.charAt(i + j - 1));
        }
    }
    return dp[n];
}
```

#### Python

```python []
class Solution:
    def isInterleave(self, s1: str, s2: str, s3: str) -> bool:
        m, n = len(s1), len(s2)
        if m + n != len(s3):
            return False
        dp = [False] * (n + 1)
        for i in range(m + 1):  # O(m) rows
            for j in range(n + 1):  # O(n) cols
                if i == 0 and j == 0:
                    dp[j] = True
                elif i == 0:
                    dp[j] = dp[j - 1] and s2[j - 1] == s3[j - 1]
                elif j == 0:
                    dp[j] = dp[j] and s1[i - 1] == s3[i - 1]
                else:
                    dp[j] = (
                        (dp[j] and s1[i - 1] == s3[i + j - 1])
                        or (dp[j - 1] and s2[j - 1] == s3[i + j - 1])
                    )
        return dp[n]
```

#### C++

```cpp []
bool isInterleave(string s1, string s2, string s3) {
    int m = s1.size(), n = s2.size();
    if (m + n != (int)s3.size()) return false;
    vector<bool> dp(n + 1, false);
    for (int j = 0; j <= n; j++) {
        dp[j] = (j == 0) || (dp[j - 1] && s2[j - 1] == s3[j - 1]);
    }
    for (int i = 1; i <= m; i++) {
        dp[0] = dp[0] && (s1[i - 1] == s3[i - 1]);
        for (int j = 1; j <= n; j++) { // O(n) per row
            dp[j] = (dp[j] && s1[i - 1] == s3[i + j - 1]) ||
                     (dp[j - 1] && s2[j - 1] == s3[i + j - 1]);
        }
    }
    return dp[n];
}
```

#### Rust

```rust []
pub fn is_interleave(s1: String, s2: String, s3: String) -> bool {
    let a: Vec<char> = s1.chars().collect();
    let b: Vec<char> = s2.chars().collect();
    let c: Vec<char> = s3.chars().collect();
    let (m, n) = (a.len(), b.len());
    if m + n != c.len() {
        return false;
    }
    let mut dp = vec![false; n + 1];
    for j in 0..=n {
        dp[j] = b[..j] == c[..j];
    }
    for i in 1..=m {
        dp[0] = dp[0] && a[i - 1] == c[i - 1];
        for j in 1..=n {
            dp[j] = (dp[j] && a[i - 1] == c[i + j - 1])
                || (dp[j - 1] && b[j - 1] == c[i + j - 1]);
        }
    }
    dp[n]
}
```

## Solution 2: 2D DP

### Idea

Use a full 2D table where `dp[i][j]` represents whether `s3[0..i+j-1]` can be formed by interleaving `s1[0..i-1]` and `s2[0..j-1]`.

Base cases:
- `dp[0][0] = true` (empty strings interleave to empty)
- `dp[i][0]`: only `s1` contributes, so check prefix match
- `dp[0][j]`: only `s2` contributes, so check prefix match

Transition: at cell `(i, j)`, check if we can extend from above (using `s1[i-1]`) or from left (using `s2[j-1]`):

```
dp[i][j] = (dp[i-1][j] && s1[i-1] == s3[i+j-1])
         || (dp[i][j-1] && s2[j-1] == s3[i+j-1])
```

Complexity: Time $O(mn)$ — two nested loops. Space $O(mn)$ for the 2D dp table.

#### Java

```java []
public static boolean isInterleave2(String s1, String s2, String s3) {
    int m = s1.length(), n = s2.length();
    if (m + n != s3.length()) return false;
    boolean[][] dp = new boolean[m + 1][n + 1];
    dp[0][0] = true;
    for (int i = 1; i <= m; i++) dp[i][0] = dp[i - 1][0] && s1.charAt(i - 1) == s3.charAt(i - 1); // O(m) rows
    for (int j = 1; j <= n; j++) dp[0][j] = dp[0][j - 1] && s2.charAt(j - 1) == s3.charAt(j - 1); // O(n) cols
    for (int i = 1; i <= m; i++) { // O(m) rows
        for (int j = 1; j <= n; j++) { // O(n) cols
            dp[i][j] = (dp[i - 1][j] && s1.charAt(i - 1) == s3.charAt(i + j - 1))
                    || (dp[i][j - 1] && s2.charAt(j - 1) == s3.charAt(i + j - 1));
        }
    }
    return dp[m][n];
}
```

#### Python

```python []
class Solution2:
    def isInterleave(self, s1: str, s2: str, s3: str) -> bool:
        m, n = len(s1), len(s2)
        if m + n != len(s3):
            return False
        dp = [[False] * (n + 1) for _ in range(m + 1)]  # O(mn) space
        dp[0][0] = True
        for i in range(1, m + 1):  # O(m) first column
            dp[i][0] = dp[i - 1][0] and s1[i - 1] == s3[i - 1]
        for j in range(1, n + 1):  # O(n) first row
            dp[0][j] = dp[0][j - 1] and s2[j - 1] == s3[j - 1]
        for i in range(1, m + 1):  # O(m) rows
            for j in range(1, n + 1):  # O(n) cols
                dp[i][j] = (
                    (dp[i - 1][j] and s1[i - 1] == s3[i + j - 1])
                    or (dp[i][j - 1] and s2[j - 1] == s3[i + j - 1])
                )
        return dp[m][n]
```

#### C++

```cpp []
bool isInterleave(string s1, string s2, string s3) {
    int m = s1.size(), n = s2.size();
    if (m + n != (int)s3.size()) return false;
    vector<vector<bool>> dp(m + 1, vector<bool>(n + 1, false));
    dp[0][0] = true;
    for (int i = 1; i <= m; i++) {
        dp[i][0] = dp[i - 1][0] && (s1[i - 1] == s3[i - 1]);
    }
    for (int j = 1; j <= n; j++) {
        dp[0][j] = dp[0][j - 1] && (s2[j - 1] == s3[j - 1]);
    }
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) { // O(n) per row
            dp[i][j] = (dp[i - 1][j] && s1[i - 1] == s3[i + j - 1]) ||
                        (dp[i][j - 1] && s2[j - 1] == s3[i + j - 1]);
        }
    }
    return dp[m][n];
}
```

#### Rust

```rust []
pub fn is_interleave_2d(s1: String, s2: String, s3: String) -> bool {
    let a: Vec<char> = s1.chars().collect();
    let b: Vec<char> = s2.chars().collect();
    let c: Vec<char> = s3.chars().collect();
    let (m, n) = (a.len(), b.len());
    if m + n != c.len() {
        return false;
    }
    let mut dp = vec![vec![false; n + 1]; m + 1];
    dp[0][0] = true;
    for i in 1..=m {
        dp[i][0] = dp[i - 1][0] && a[i - 1] == c[i - 1];
    }
    for j in 1..=n {
        dp[0][j] = dp[0][j - 1] && b[j - 1] == c[j - 1];
    }
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = (dp[i - 1][j] && a[i - 1] == c[i + j - 1])
                || (dp[i][j - 1] && b[j - 1] == c[i + j - 1]);
        }
    }
    dp[m][n]
}
```
