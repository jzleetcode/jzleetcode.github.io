---
author: JZ
pubDatetime: 2026-06-04T06:00:00Z
modDatetime: 2026-06-04T06:00:00Z
title: LeetCode 1143 Longest Common Subsequence
featured: false
tags:
  - a-string
  - a-dynamic-programming
description:
  "Solutions for LeetCode 1143, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 1143](https://leetcode.com/problems/longest-common-subsequence/description/)

Given two strings `text1` and `text2`, return the length of their longest common subsequence. If there is no common subsequence, return `0`.

A subsequence of a string is a new string generated from the original string with some characters (can be none) deleted without changing the relative order of the remaining characters.

For example, `"ace"` is a subsequence of `"abcde"`.

A common subsequence of two strings is a subsequence that is common to both strings.

```
Example 1:

Input: text1 = "abcde", text2 = "ace"
Output: 3
Explanation: The longest common subsequence is "ace" and its length is 3.

Example 2:

Input: text1 = "abc", text2 = "abc"
Output: 3
Explanation: The longest common subsequence is "abc" and its length is 3.

Example 3:

Input: text1 = "abc", text2 = "def"
Output: 0
Explanation: There is no such common subsequence, so the result is 0.

Constraints:

1 <= text1.length, text2.length <= 1000
text1 and text2 consist of only lowercase English characters.
```

## Solution 1: 1D DP (Space-Optimized)

### Idea

Define `dp[j]` as the LCS length of `text1[0..i]` and `text2[0..j]`. Since each cell only depends on the current row and the previous row, we can compress the 2D table into a 1D array of size `min(m,n)+1`. We keep a `pr` variable for the value from the previous row at `j+1`, and `prpc` for the diagonal (previous row, previous column).

```
text1 = "abcde", text2 = "ace"
let m = 5, n = 3

Initialize dp = [0, 0, 0, 0]

i=0 (a):  dp = [0, 1, 0, 0]   match at j=0
i=1 (b):  dp = [0, 1, 0, 0]   no match
i=2 (c):  dp = [0, 1, 2, 0]   match at j=1
i=3 (d):  dp = [0, 1, 2, 0]   no match
i=4 (e):  dp = [0, 1, 2, 3]   match at j=2 -> answer: 3
```

Complexity: Time $O(m \cdot n)$ — two nested loops, outer O(m), inner O(n). Space $O(\min(m,n))$ for the 1D dp array (swap if `m < n`).

#### Java

```java []
public int longestCommonSubsequence(String text1, String text2) {
    int m = text1.length(), n = text2.length();
    if (m < n) return longestCommonSubsequence(text2, text1); // ensure m>=n
    int[] dp = new int[n + 1];
    for (int i = 0; i < m; ++i) { // O(m)
        for (int j = 0, pr = 0, prpc; j < n; ++j) { // O(n)
            prpc = pr; // dp[i][j]: prev row prev col (diagonal)
            pr = dp[j + 1]; // dp[i][j+1]: prev row current col
            dp[j + 1] = text1.charAt(i) == text2.charAt(j) ? prpc + 1 : Math.max(dp[j], pr);
        }
    }
    return dp[n];
}
```

#### Python

```python []
class Solution:
    def longestCommonSubsequence(self, text1: str, text2: str) -> int:
        m, n = len(text1), len(text2)
        if m < n:
            return self.longestCommonSubsequence(text2, text1)
        dp = [0] * (n + 1)
        for char1 in text1:  # O(m)
            pr, prpc = 0, 0
            for j, char2 in enumerate(text2):  # O(n)
                prpc = pr
                pr = dp[j + 1]
                dp[j + 1] = prpc + 1 if char1 == char2 else max(dp[j], pr)
        return dp[-1]
```

#### C++

```cpp []
int longestCommonSubsequence(string text1, string text2) {
    int m = text1.size(), n = text2.size();
    if (m < n) return longestCommonSubsequence(text2, text1);
    vector<int> dp(n + 1, 0);
    for (int i = 0; i < m; i++) { // O(m)
        int pr = 0, prpc;
        for (int j = 0; j < n; j++) { // O(n)
            prpc = pr;
            pr = dp[j + 1];
            dp[j + 1] = text1[i] == text2[j] ? prpc + 1 : max(dp[j], pr);
        }
    }
    return dp[n];
}
```

#### Rust

```rust []
pub fn longest_common_subsequence(text1: String, text2: String) -> i32 {
    let (m, n) = (text1.len(), text2.len());
    if m < n { return Solution::longest_common_subsequence(text2, text1); }
    let vec1: Vec<char> = text1.chars().collect();
    let vec2: Vec<char> = text2.chars().collect();
    let mut dp = vec![0; n + 1];
    for i in 0..m { // O(m)
        let mut pr = 0;
        let mut prpc;
        for j in 0..n { // O(n)
            prpc = pr;
            pr = dp[j + 1];
            dp[j + 1] = if vec1[i] == vec2[j] { prpc + 1 } else { max(dp[j], pr) }
        }
    }
    dp[n]
}
```

## Solution 2: 2D DP

### Idea

Use a full 2D table `dp[i][j]` representing the LCS length of `text1[0..i]` and `text2[0..j]`. If characters match at position `(i,j)`, extend the diagonal: `dp[i+1][j+1] = dp[i][j] + 1`. Otherwise take the maximum of excluding either character: `dp[i+1][j+1] = max(dp[i][j+1], dp[i+1][j])`.

```
         ""  a  c  e
    ""  [ 0  0  0  0 ]
     a  [ 0  1  1  1 ]
     b  [ 0  1  1  1 ]
     c  [ 0  1  2  2 ]
     d  [ 0  1  2  2 ]
     e  [ 0  1  2  3 ]

dp[5][3] = 3
```

Complexity: Time $O(m \cdot n)$ — two nested loops, outer O(m), inner O(n). Space $O(m \cdot n)$ for the 2D dp table.

#### Java

```java []
public int longestCommonSubsequence(String text1, String text2) {
    int[][] dp = new int[text1.length() + 1][text2.length() + 1];
    for (int i = 0; i < text1.length(); ++i) // O(m)
        for (int j = 0; j < text2.length(); ++j) // O(n)
            if (text1.charAt(i) == text2.charAt(j)) dp[i + 1][j + 1] = 1 + dp[i][j];
            else dp[i + 1][j + 1] = Math.max(dp[i][j + 1], dp[i + 1][j]);
    return dp[text1.length()][text2.length()];
}
```

#### Python

```python []
class Solution2:
    def longestCommonSubsequence(self, text1: str, text2: str) -> int:
        m, n = len(text1), len(text2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]  # O(m*n) space
        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                if text1[i] == text2[j]:
                    dp[i + 1][j + 1] = dp[i][j] + 1
                else:
                    dp[i + 1][j + 1] = max(dp[i][j + 1], dp[i + 1][j])
        return dp[m][n]
```

#### C++

```cpp []
int longestCommonSubsequence(string text1, string text2) {
    int m = text1.size(), n = text2.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0)); // O(m*n) space
    for (int i = 0; i < m; i++) // O(m)
        for (int j = 0; j < n; j++) // O(n)
            dp[i + 1][j + 1] = text1[i] == text2[j]
                ? dp[i][j] + 1
                : max(dp[i][j + 1], dp[i + 1][j]);
    return dp[m][n];
}
```

#### Rust

```rust []
pub fn longest_common_subsequence_2d(text1: String, text2: String) -> i32 {
    let vec1: Vec<char> = text1.chars().collect();
    let vec2: Vec<char> = text2.chars().collect();
    let (m, n) = (vec1.len(), vec2.len());
    let mut dp = vec![vec![0; n + 1]; m + 1]; // O(m*n) space
    for i in 0..m { // O(m)
        for j in 0..n { // O(n)
            dp[i + 1][j + 1] = if vec1[i] == vec2[j] {
                dp[i][j] + 1
            } else {
                dp[i][j + 1].max(dp[i + 1][j])
            };
        }
    }
    dp[m][n]
}
```
