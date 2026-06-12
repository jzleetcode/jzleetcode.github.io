---
author: JZ
pubDatetime: 2026-06-12T10:36:00Z
modDatetime: 2026-06-12T10:36:00Z
title: LeetCode 516 Longest Palindromic Subsequence
featured: true
tags:
  - a-dp
  - a-string
description:
  "Solutions for LeetCode 516, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 516](https://leetcode.com/problems/longest-palindromic-subsequence/description/)

Given a string `s`, find the longest palindromic subsequence's length in `s`.

A subsequence is a sequence that can be derived from another sequence by deleting some or no elements without changing the order of the remaining elements.

```
Example 1:

Input: s = "bbbab"
Output: 4
Explanation: One possible longest palindromic subsequence is "bbbb".

Example 2:

Input: s = "cbbd"
Output: 2
Explanation: One possible longest palindromic subsequence is "bb".
```

**Constraints:**

- `1 <= s.length <= 1000`
- `s` consists only of lowercase English letters.

## Idea1

**2D Dynamic Programming.** Define `dp[i][j]` as the length of the longest palindromic subsequence in `s[i..j]`. If `s[i] == s[j]`, then `dp[i][j] = dp[i+1][j-1] + 2`. Otherwise, `dp[i][j] = max(dp[i+1][j], dp[i][j-1])`. We fill the table from shorter substrings to longer ones (bottom-up by `i` from right to left).

```
s = "bbbab"

dp table (only upper-right triangle matters):
     b  b  b  a  b
  b [1, 2, 3, 3, 4]
  b [0, 1, 2, 2, 3]
  b [0, 0, 1, 1, 3]
  a [0, 0, 0, 1, 1]
  b [0, 0, 0, 0, 1]

dp[0][4] = 4 -> "bbbb"
```

Complexity: Time $O(n^2)$ — two nested loops over `i` and `j`. Space $O(n^2)$ — 2D table.

### Java

```java []
// lc 516, 2D DP. O(n^2) time, O(n^2) space.
public static int longestPalindromeSubseq(String s) {
    int n = s.length();
    int[][] dp = new int[n][n];
    for (int i = n - 1; i >= 0; i--) { // O(n)
        dp[i][i] = 1;
        for (int j = i + 1; j < n; j++) { // O(n), together O(n^2)
            if (s.charAt(i) == s.charAt(j)) {
                dp[i][j] = dp[i + 1][j - 1] + 2;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[0][n - 1];
}
```

```python []
# lc 516, 2D DP. O(n^2) time, O(n^2) space.
def longest_palindrome_subseq(self, s: str) -> int:
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):  # O(n)
        dp[i][i] = 1
        for j in range(i + 1, n):  # O(n), together O(n^2)
            if s[i] == s[j]:
                dp[i][j] = dp[i + 1][j - 1] + 2
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j - 1])
    return dp[0][n - 1]
```

```cpp []
// lc 516, 2D DP. O(n^2) time, O(n^2) space.
static int longestPalindromeSubseq(const string& s) {
    int n = s.size();
    vector<vector<int>> dp(n, vector<int>(n, 0));
    for (int i = n - 1; i >= 0; i--) { // O(n)
        dp[i][i] = 1;
        for (int j = i + 1; j < n; j++) { // O(n), together O(n^2)
            if (s[i] == s[j]) {
                dp[i][j] = dp[i + 1][j - 1] + 2;
            } else {
                dp[i][j] = max(dp[i + 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[0][n - 1];
}
```

```rust []
// lc 516, 2D DP. O(n^2) time, O(n^2) space.
pub fn longest_palindrome_subseq(s: String) -> i32 {
    let s = s.as_bytes();
    let n = s.len();
    let mut dp = vec![vec![0i32; n]; n];
    for i in 0..n { dp[i][i] = 1; }
    for len in 2..=n { // O(n^2) iterations total
        for i in 0..=n - len {
            let j = i + len - 1;
            if s[i] == s[j] {
                dp[i][j] = dp[i + 1][j - 1] + 2;
            } else {
                dp[i][j] = dp[i + 1][j].max(dp[i][j - 1]);
            }
        }
    }
    dp[0][n - 1]
}
```

## Idea2

**Space-optimized 1D DP.** Notice that when computing row `i`, we only need values from row `i+1` (the previous row). We can compress the 2D table into a 1D array. We use a variable `prev` to hold `dp[i+1][j-1]` before it gets overwritten.

```
Processing i=3 (s[3]='a'):
  dp before: [0, 0, 0, 0, 1]  (this is row i+1 = row 4)
  dp[3] = 1 (base case)
  j=4: s[3]='a' != s[4]='b', dp[4] = max(dp[4], dp[3]) = max(1, 1) = 1
  dp after:  [0, 0, 0, 1, 1]

Processing i=2 (s[2]='b'):
  dp[2] = 1 (base case)
  j=3: s[2]='b' != s[3]='a', dp[3] = max(1, 1) = 1
  j=4: s[2]='b' == s[4]='b', dp[4] = prev + 2 = 1 + 2 = 3
  dp after:  [0, 0, 1, 1, 3]
```

Complexity: Time $O(n^2)$, Space $O(n)$.

### Java

```java []
// lc 516, 1D DP (space-optimized). O(n^2) time, O(n) space.
public static int longestPalindromeSubseqOptimized(String s) {
    int n = s.length();
    int[] dp = new int[n];
    for (int i = n - 1; i >= 0; i--) { // O(n)
        dp[i] = 1;
        int prev = 0;
        for (int j = i + 1; j < n; j++) { // O(n), together O(n^2)
            int temp = dp[j];
            if (s.charAt(i) == s.charAt(j)) {
                dp[j] = prev + 2;
            } else {
                dp[j] = Math.max(dp[j], dp[j - 1]);
            }
            prev = temp;
        }
    }
    return dp[n - 1];
}
```

```python []
# lc 516, 1D DP (space-optimized). O(n^2) time, O(n) space.
def longest_palindrome_subseq(self, s: str) -> int:
    n = len(s)
    dp = [0] * n
    for i in range(n - 1, -1, -1):  # O(n)
        dp[i] = 1
        prev = 0
        for j in range(i + 1, n):  # O(n), together O(n^2)
            temp = dp[j]
            if s[i] == s[j]:
                dp[j] = prev + 2
            else:
                dp[j] = max(dp[j], dp[j - 1])
            prev = temp
    return dp[n - 1]
```

```cpp []
// lc 516, 1D DP (space-optimized). O(n^2) time, O(n) space.
static int longestPalindromeSubseqOptimized(const string& s) {
    int n = s.size();
    vector<int> dp(n, 0);
    for (int i = n - 1; i >= 0; i--) { // O(n)
        dp[i] = 1;
        int prev = 0;
        for (int j = i + 1; j < n; j++) { // O(n), together O(n^2)
            int temp = dp[j];
            if (s[i] == s[j]) {
                dp[j] = prev + 2;
            } else {
                dp[j] = max(dp[j], dp[j - 1]);
            }
            prev = temp;
        }
    }
    return dp[n - 1];
}
```

```rust []
// lc 516, 1D DP (space-optimized). O(n^2) time, O(n) space.
pub fn longest_palindrome_subseq_optimized(s: String) -> i32 {
    let s = s.as_bytes();
    let n = s.len();
    let mut dp = vec![0i32; n];
    for i in (0..n).rev() { // O(n)
        dp[i] = 1;
        let mut prev = 0;
        for j in (i + 1)..n { // O(n), together O(n^2)
            let temp = dp[j];
            if s[i] == s[j] {
                dp[j] = prev + 2;
            } else {
                dp[j] = dp[j].max(dp[j - 1]);
            }
            prev = temp;
        }
    }
    dp[n - 1]
}
```
