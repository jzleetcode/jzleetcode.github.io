---
author: JZ
pubDatetime: 2026-06-14T06:00:00Z
modDatetime: 2026-06-14T06:00:00Z
title: LeetCode 115 Distinct Subsequences
featured: false
tags:
  - a-dp
  - a-string
description:
  "Solutions for LeetCode 115, hard, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 115](https://leetcode.com/problems/distinct-subsequences/description/)

Given two strings `s` and `t`, return the number of distinct subsequences of `s` which equals `t`.

The test cases are generated so that the answer fits on a 32-bit signed integer.

```
Example 1:

Input: s = "rabbbit", t = "rabbit"
Output: 3
Explanation:
As shown below, there are 3 ways you can generate "rabbit" from s.
rabb_bit
rab_bbit
ra_bbbit
  ^  ^  (underscores mark the skipped 'b')

Example 2:

Input: s = "babgbag", t = "bag"
Output: 5
Explanation:
ba__b_g
ba____g
b__gb_g
___b__g  (wait, need 'b','a','g')
babgbag -> pick indices (0,1,6), (0,1,5?... let me just state: 5 ways)
```

**Constraints:**

- `0 <= s.length, t.length <= 1000`
- `s` and `t` consist of English letters.

## Idea1

Define `dp[i][j]` = number of distinct subsequences of `s[0..i]` that equal `t[0..j]`.

**Recurrence:**
- If `s[i-1] == t[j-1]`: `dp[i][j] = dp[i-1][j-1] + dp[i-1][j]`
  - We can either use `s[i-1]` to match `t[j-1]`, or skip it.
- Otherwise: `dp[i][j] = dp[i-1][j]`
  - We must skip `s[i-1]`.

**Base case:** `dp[i][0] = 1` for all `i` — empty `t` is always a subsequence.

```
    ""  b  a  g
""   1  0  0  0
b    1  1  0  0
a    1  1  1  0
b    1  2  1  0
g    1  2  1  1
b    1  3  1  1
a    1  3  4  1
g    1  3  4  5
         ^
  s = "babgbag", t = "bag", answer = dp[7][3] = 5
```

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$.

### Java

```java []
public static int numDistinct2D(String s, String t) {
    int m = s.length(), n = t.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = 1; // empty t can always be formed
    for (int i = 1; i <= m; i++) { // O(m) outer loop over s
        for (int j = 1; j <= n; j++) { // O(n) inner loop over t, together O(m*n)
            dp[i][j] = dp[i - 1][j]; // skip s[i-1]
            if (s.charAt(i - 1) == t.charAt(j - 1)) {
                dp[i][j] += dp[i - 1][j - 1]; // use s[i-1] to match t[j-1]
            }
        }
    }
    return dp[m][n];
}
```

### Python

```python []
def numDistinct(self, s: str, t: str) -> int:
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):  # O(m)
        dp[i][0] = 1
    for i in range(1, m + 1):  # O(m)
        for j in range(1, n + 1):  # O(n), together O(m*n)
            dp[i][j] = dp[i - 1][j]
            if s[i - 1] == t[j - 1]:
                dp[i][j] += dp[i - 1][j - 1]
    return dp[m][n]
```

### C++

```cpp []
int numDistinct(string s, string t) {
    int m = s.size(), n = t.size();
    if (m < n) return 0;
    vector<vector<unsigned long long>> dp(m + 1, vector<unsigned long long>(n + 1, 0));
    for (int i = 0; i <= m; i++) dp[i][0] = 1;
    for (int i = 1; i <= m; i++) { // O(m*n) fill table row by row
        for (int j = 1; j <= n; j++) { // O(n) per row
            dp[i][j] = dp[i - 1][j]; // skip s[i-1]
            if (s[i - 1] == t[j - 1]) {
                dp[i][j] += dp[i - 1][j - 1]; // use s[i-1] to match t[j-1]
            }
        }
    }
    return static_cast<int>(dp[m][n]);
}
```

### Rust

```rust []
pub fn num_distinct(s: String, t: String) -> i32 {
    let s = s.as_bytes();
    let t = t.as_bytes();
    let m = s.len();
    let n = t.len();
    let mut dp = vec![vec![0u64; n + 1]; m + 1];
    for i in 0..=m {
        dp[i][0] = 1;
    }
    for i in 1..=m { // O(m*n) nested iteration
        for j in 1..=n {
            dp[i][j] = dp[i - 1][j];
            if s[i - 1] == t[j - 1] {
                dp[i][j] += dp[i - 1][j - 1];
            }
        }
    }
    dp[m][n] as i32
}
```

## Idea2

Space-optimized 1D DP. Since each row only depends on the previous row, we can use a single array and traverse `j` in **reverse** to avoid overwriting values we still need.

```
dp[j] represents the number of ways to form t[0..j] from the portion of s seen so far.

Traverse j from n down to 1:
  if s[i-1] == t[j-1]:  dp[j] += dp[j-1]

Reverse traversal ensures dp[j-1] still holds the "previous row" value.
```

Complexity: Time $O(m \cdot n)$, Space $O(n)$.

### Java

```java []
public static int numDistinct(String s, String t) {
    int m = s.length(), n = t.length();
    int[] dp = new int[n + 1];
    dp[0] = 1; // base case: empty t
    for (int i = 1; i <= m; i++) { // O(m) outer loop over s
        for (int j = Math.min(i, n); j >= 1; j--) { // O(n) inner loop, reverse to avoid overwrite
            if (s.charAt(i - 1) == t.charAt(j - 1)) {
                dp[j] += dp[j - 1]; // accumulate from previous state
            }
        }
    }
    return dp[n];
}
```

### Python

```python []
def numDistinct(self, s: str, t: str) -> int:
    m, n = len(s), len(t)
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, m + 1):  # O(m)
        for j in range(n, 0, -1):  # O(n), reverse to use previous row values
            if s[i - 1] == t[j - 1]:
                dp[j] += dp[j - 1]
    return dp[n]
```

### C++

```cpp []
int numDistinct(string s, string t) {
    int m = s.size(), n = t.size();
    if (m < n) return 0;
    vector<unsigned long long> dp(n + 1, 0);
    dp[0] = 1; // empty t is a subsequence of any prefix of s
    for (int i = 1; i <= m; i++) { // O(m*n): for each char in s, update dp in reverse
        for (int j = min(i, n); j >= 1; j--) { // O(n) per iteration
            if (s[i - 1] == t[j - 1]) {
                dp[j] += dp[j - 1];
            }
        }
    }
    return static_cast<int>(dp[n]);
}
```

### Rust

```rust []
pub fn num_distinct_optimized(s: String, t: String) -> i32 {
    let s = s.as_bytes();
    let t = t.as_bytes();
    let m = s.len();
    let n = t.len();
    let mut dp = vec![0u64; n + 1];
    dp[0] = 1; // empty t always matches
    for i in 1..=m { // O(m*n) — for each char in s, update dp in reverse order of j
        for j in (1..=n).rev() { // reverse ensures dp[j-1] holds previous row value
            if s[i - 1] == t[j - 1] {
                dp[j] += dp[j - 1];
            }
        }
    }
    dp[n] as i32
}
```
