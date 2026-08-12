---
author: JZ
pubDatetime: 2026-08-12T08:00:00Z
modDatetime: 2026-08-12T08:00:00Z
title: LeetCode 221 Maximal Square
featured: true
tags:
  - a-dp
  - a-matrix
description:
  "Solutions for LeetCode 221, medium, tags: dynamic programming, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 221](https://leetcode.com/problems/maximal-square/description/)

Given an `m x n` binary matrix filled with `0`'s and `1`'s, find the largest square containing only `1`'s and return its area.

```
Example 1:

Input: matrix = [["1","0","1","0","0"],
                 ["1","0","1","1","1"],
                 ["1","1","1","1","1"],
                 ["1","0","0","1","0"]]
Output: 4

Example 2:

Input: matrix = [["0","1"],["1","0"]]
Output: 1

Example 3:

Input: matrix = [["0"]]
Output: 0
```

**Constraints:**

- `m == matrix.length`
- `n == matrix[i].length`
- `1 <= m, n <= 300`
- `matrix[i][j]` is `'0'` or `'1'`

## Idea

Define `dp[i][j]` as the side length of the largest square whose bottom-right corner is at `(i, j)`. If `matrix[i][j] == '1'`, the square at `(i, j)` is limited by the smallest of its three neighbors (top, left, top-left diagonal):

$$dp[i][j] = \min(dp[i-1][j],\ dp[i][j-1],\ dp[i-1][j-1]) + 1$$

The answer is `max(dp[i][j])²`.

```
matrix:           dp:
1 0 1 0 0        1 0 1 0 0
1 0 1 1 1        1 0 1 1 1
1 1 1 1 1        1 1 1 2 2   <-- dp[2][3] = min(1,1,1)+1 = 2
1 0 0 1 0        1 0 0 1 0

max side = 2, area = 4
```

Since each row only depends on the previous row, we optimize from a 2D table to a 1D array, keeping track of the "top-left diagonal" value in a variable.

Complexity: Time $O(m \cdot n)$, Space $O(n)$.

### Java

```java []
// O(m*n) time, O(n) space.
public static int maximalSquare(char[][] matrix) {
    if (matrix == null || matrix.length == 0 || matrix[0].length == 0) return 0;
    int m = matrix.length, n = matrix[0].length;
    int[] dp = new int[n + 1];
    int maxSide = 0;
    for (int i = 0; i < m; i++) {
        int prev = 0; // dp[i-1][j-1]
        for (int j = 1; j <= n; j++) {
            int temp = dp[j];
            if (matrix[i][j - 1] == '1') {
                dp[j] = Math.min(Math.min(dp[j], dp[j - 1]), prev) + 1;
                maxSide = Math.max(maxSide, dp[j]);
            } else {
                dp[j] = 0;
            }
            prev = temp;
        }
    }
    return maxSide * maxSide;
}
```

### Python

```python []
class Solution:
    """DP. O(m*n) time, O(n) space."""

    def maximalSquare(self, matrix: list[list[str]]) -> int:
        if not matrix or not matrix[0]:
            return 0
        m, n = len(matrix), len(matrix[0])
        dp = [0] * (n + 1)  # O(n) space
        max_side = 0
        for i in range(m):  # O(m)
            new_dp = [0] * (n + 1)
            for j in range(n):  # O(n)
                if matrix[i][j] == '1':
                    new_dp[j + 1] = min(dp[j], dp[j + 1], new_dp[j]) + 1
                    max_side = max(max_side, new_dp[j + 1])
            dp = new_dp
        return max_side * max_side
```

### C++

```cpp []
// O(m*n) time, O(n) space.
int maximalSquare(vector<vector<char>>& matrix) {
    if (matrix.empty() || matrix[0].empty()) return 0;
    int m = matrix.size(), n = matrix[0].size();
    vector<int> dp(n, 0);
    int maxSide = 0;
    for (int i = 0; i < m; i++) {
        vector<int> prev_dp = dp;
        for (int j = 0; j < n; j++) {
            if (matrix[i][j] == '1') {
                if (i == 0 || j == 0)
                    dp[j] = 1;
                else
                    dp[j] = min({prev_dp[j], dp[j - 1], prev_dp[j - 1]}) + 1;
                maxSide = max(maxSide, dp[j]);
            } else {
                dp[j] = 0;
            }
        }
    }
    return maxSide * maxSide;
}
```

### Rust

```rust []
// O(m*n) time, O(n) space.
pub fn maximal_square(matrix: Vec<Vec<char>>) -> i32 {
    if matrix.is_empty() || matrix[0].is_empty() {
        return 0;
    }
    let m = matrix.len();
    let n = matrix[0].len();
    let mut dp = vec![0i32; n];
    let mut max_side = 0i32;

    for i in 0..m {
        let mut prev = 0i32; // top-left diagonal
        for j in 0..n {
            let old = dp[j]; // save top before overwrite
            if matrix[i][j] == '1' {
                if i == 0 || j == 0 {
                    dp[j] = 1;
                } else {
                    dp[j] = dp[j - 1].min(old).min(prev) + 1;
                }
                max_side = max_side.max(dp[j]);
            } else {
                dp[j] = 0;
            }
            prev = old;
        }
    }

    max_side * max_side
}
```
