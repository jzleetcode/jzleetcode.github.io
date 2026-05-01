---
author: JZ
pubDatetime: 2026-04-26T06:00:00Z
modDatetime: 2026-04-26T06:00:00Z
title: LeetCode 72 Edit Distance
featured: true
tags:
  - a-string
  - a-dynamic-programming
description:
  "Solutions for LeetCode 72, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 72](https://leetcode.com/problems/edit-distance/description/)

Given two strings `word1` and `word2`, return the minimum number of operations required to convert `word1` to `word2`.

You have the following three operations permitted on a word:

- Insert a character
- Delete a character
- Replace a character

```
Example 1:

Input: word1 = "horse", word2 = "ros"
Output: 3
Explanation:
horse -> rorse (replace 'h' with 'r')
rorse -> rose (remove 'r')
rose -> ros (remove 'e')

Example 2:

Input: word1 = "intention", word2 = "execution"
Output: 5
Explanation:
intention -> inention (remove 't')
inention -> enention (replace 'i' with 'e')
enention -> exention (replace 'n' with 'x')
exention -> exection (replace 'n' with 'c')
exection -> execution (insert 'u')

Constraints:

0 <= word1.length, word2.length <= 500
word1 and word2 consist of lowercase English letters.
```

## Solution 1: 1D DP (Space-Optimized)

### Idea

Define `dp[j]` as the edit distance from `word1[0..i]` to `word2[0..j]`. Since each cell only depends on the current row and the previous row, we can compress the 2D table into a 1D array of size `n+1`, keeping a `prev` variable for the diagonal.

```
word1 = "horse", word2 = "ros"
let m = 5, n = 3

Initialize dp = [0, 1, 2, 3]  (base: converting "" to word2[0..j])

i=1 (h):  dp = [1, 1, 2, 3]
i=2 (o):  dp = [2, 2, 1, 2]
i=3 (r):  dp = [3, 2, 2, 2]
i=4 (s):  dp = [4, 3, 3, 2]
i=5 (e):  dp = [5, 4, 4, 3]  -> answer: dp[3] = 3
```

Complexity: Time $O(mn)$ — two nested loops over `m` rows and `n` columns. Space $O(n)$ for the 1D dp array.

#### Java

```java []
public static int minDistance(String word1, String word2) {
    int m = word1.length(), n = word2.length();
    int[] dp = new int[n + 1];
    for (int j = 0; j <= n; j++) dp[j] = j; // base case: empty word1
    for (int i = 1; i <= m; i++) { // O(m) rows
        int prev = dp[0]; // diagonal from previous row
        dp[0] = i;
        for (int j = 1; j <= n; j++) { // O(n) columns
            int temp = dp[j];
            if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                dp[j] = prev;
            } else {
                dp[j] = 1 + Math.min(prev, Math.min(dp[j], dp[j - 1]));
                // prev=replace, dp[j]=delete, dp[j-1]=insert
            }
            prev = temp;
        }
    }
    return dp[n];
}
```

#### Python

```python []
class Solution:
    def minDistance(self, word1: str, word2: str) -> int:
        m, n = len(word1), len(word2)
        dp = list(range(n + 1))  # O(n) space: base case dp[j] = j
        for i in range(1, m + 1):  # O(m) rows
            prev = dp[0]
            dp[0] = i
            for j in range(1, n + 1):  # O(n) cols
                temp = dp[j]
                if word1[i - 1] == word2[j - 1]:
                    dp[j] = prev
                else:
                    dp[j] = 1 + min(prev, dp[j], dp[j - 1])  # replace, delete, insert
                prev = temp
        return dp[n]
```

#### C++

```cpp []
int minDistance(string word1, string word2) {
    int m = word1.size(), n = word2.size();
    vector<int> dp(n + 1);
    for (int j = 0; j <= n; j++) dp[j] = j;
    for (int i = 1; i <= m; i++) {
        int prev = dp[0];
        dp[0] = i;
        for (int j = 1; j <= n; j++) {
            int temp = dp[j];
            if (word1[i - 1] == word2[j - 1]) {
                dp[j] = prev;
            } else {
                dp[j] = 1 + min({prev, dp[j], dp[j - 1]});
            }
            prev = temp;
        }
    }
    return dp[n];
}
```

#### Rust

```rust []
pub fn min_distance(word1: String, word2: String) -> i32 {
    let a: Vec<char> = word1.chars().collect();
    let b: Vec<char> = word2.chars().collect();
    let (m, n) = (a.len(), b.len());
    let mut dp = (0..=n as i32).collect::<Vec<i32>>();
    for i in 1..=m {
        let mut prev = dp[0];
        dp[0] = i as i32;
        for j in 1..=n {
            let tmp = dp[j];
            if a[i - 1] == b[j - 1] {
                dp[j] = prev;
            } else {
                dp[j] = 1 + prev.min(dp[j]).min(dp[j - 1]);
            }
            prev = tmp;
        }
    }
    dp[n]
}
```

## Solution 2: 2D DP

### Idea

Use a full 2D table `dp[i][j]` representing the edit distance from `word1[0..i]` to `word2[0..j]`. Base cases: `dp[i][0] = i` (delete all) and `dp[0][j] = j` (insert all). For each cell, if characters match, carry forward the diagonal; otherwise take the minimum of replace, delete, or insert plus one.

```
         ""  r  o  s
    ""  [ 0  1  2  3 ]
     h  [ 1  1  2  3 ]
     o  [ 2  2  1  2 ]
     r  [ 3  2  2  2 ]
     s  [ 4  3  3  2 ]
     e  [ 5  4  4  3 ]

dp[5][3] = 3
```

Complexity: Time $O(mn)$ — two nested loops. Space $O(mn)$ for the 2D dp table.

#### Java

```java []
public static int minDistance2D(String word1, String word2) {
    int m = word1.length(), n = word2.length();
    int[][] dp = new int[m + 1][n + 1];
    for (int i = 0; i <= m; i++) dp[i][0] = i; // base case: empty word2
    for (int j = 0; j <= n; j++) dp[0][j] = j; // base case: empty word1
    for (int i = 1; i <= m; i++) { // O(m) rows
        for (int j = 1; j <= n; j++) { // O(n) columns
            if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], Math.min(dp[i - 1][j], dp[i][j - 1]));
                // dp[i-1][j-1]=replace, dp[i-1][j]=delete, dp[i][j-1]=insert
            }
        }
    }
    return dp[m][n];
}
```

#### Python

```python []
class Solution2:
    def minDistance(self, word1: str, word2: str) -> int:
        m, n = len(word1), len(word2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]  # O(mn) space
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j
        for i in range(1, m + 1):  # O(m) rows
            for j in range(1, n + 1):  # O(n) cols
                if word1[i - 1] == word2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(
                        dp[i - 1][j - 1],  # replace
                        dp[i - 1][j],  # delete
                        dp[i][j - 1],  # insert
                    )
        return dp[m][n]
```

#### C++

```cpp []
int minDistance(string word1, string word2) {
    int m = word1.size(), n = word2.size();
    vector<vector<int>> dp(m + 1, vector<int>(n + 1));
    for (int i = 0; i <= m; i++) dp[i][0] = i;
    for (int j = 0; j <= n; j++) dp[0][j] = j;
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++) {
            if (word1[i - 1] == word2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + min({dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]});
            }
        }
    }
    return dp[m][n];
}
```

#### Rust

```rust []
pub fn min_distance_2d(word1: String, word2: String) -> i32 {
    let a: Vec<char> = word1.chars().collect();
    let b: Vec<char> = word2.chars().collect();
    let (m, n) = (a.len(), b.len());
    let mut dp = vec![vec![0i32; n + 1]; m + 1];
    for i in 0..=m {
        dp[i][0] = i as i32;
    }
    for j in 0..=n {
        dp[0][j] = j as i32;
    }
    for i in 1..=m {
        for j in 1..=n {
            if a[i - 1] == b[j - 1] {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + dp[i - 1][j - 1].min(dp[i - 1][j]).min(dp[i][j - 1]);
            }
        }
    }
    dp[m][n]
}
```
