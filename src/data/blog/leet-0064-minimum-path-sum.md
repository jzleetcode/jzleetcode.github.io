---
author: JZ
pubDatetime: 2026-09-01T10:07:00Z
modDatetime: 2026-09-01T10:07:00Z
title: LeetCode 64 Minimum Path Sum
featured: true
tags:
  - a-dp
  - a-matrix
description:
  "Solutions for LeetCode 64, medium, tags: array, dynamic programming, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 64](https://leetcode.com/problems/minimum-path-sum/description/)

Given an `m x n` `grid` filled with non-negative numbers, find a path from top left to bottom right, which minimizes the sum of all numbers along its path.

**Note:** You can only move either down or right at any point in time.

```
Example 1:

Input: grid = [[1,3,1],[1,5,1],[4,2,1]]
Output: 7
Explanation: Because the path 1 → 3 → 1 → 1 → 1 minimizes the sum.

Example 2:

Input: grid = [[1,2,3],[4,5,6]]
Output: 12
```

**Constraints:**

- `m == grid.length`
- `n == grid[i].length`
- `1 <= m, n <= 200`
- `0 <= grid[i][j] <= 200`

## Idea1: In-place DP

Since we can only move right or down, the minimum cost to reach cell `(i, j)` is:

$$dp[i][j] = grid[i][j] + \min(dp[i-1][j],\ dp[i][j-1])$$

The first row can only be reached from the left, and the first column can only be reached from above, so they reduce to prefix sums.

```
grid:              dp (in-place):
1  3  1            1  4  5
1  5  1     ->     2  7  6
4  2  1            6  8  7  <- answer
```

We can modify the grid in place since each cell is visited exactly once and only depends on cells already computed.

Complexity: Time $O(m \cdot n)$, Space $O(1)$ extra (modifies input).

## Idea2: 1D DP

If we cannot modify the input, we use a 1D array of size `n`. When processing row `i`, `dp[j]` holds the value from the previous row (the "top" neighbor) before we update it, and `dp[j-1]` is already updated to the current row (the "left" neighbor).

Complexity: Time $O(m \cdot n)$, Space $O(n)$.

### Java

```java []
// solution 1, in-place DP. O(m*n) time, O(1) extra space.
public int minPathSumDP(int[][] grid) {
    int r = grid.length;
    int c = grid[0].length;
    for (int i = 1; i < c; i++) {
        grid[0][i] += grid[0][i - 1];
    }
    for (int i = 1; i < r; i++) {
        grid[i][0] += grid[i - 1][0];
        for (int j = 1; j < c; j++) {
            grid[i][j] += Math.min(grid[i][j - 1], grid[i - 1][j]);
        }
    }
    return grid[r - 1][c - 1];
}
```

### Python

```python []
class Solution:
    """In-place DP. O(m*n) time, O(1) extra space (modifies input)."""

    def minPathSum(self, grid: list[list[int]]) -> int:
        m, n = len(grid), len(grid[0])
        for i in range(1, n):  # O(n) first row prefix sum
            grid[0][i] += grid[0][i - 1]
        for i in range(1, m):  # O(m) rows
            grid[i][0] += grid[i - 1][0]
            for j in range(1, n):  # O(n) cols
                grid[i][j] += min(grid[i - 1][j], grid[i][j - 1])
        return grid[m - 1][n - 1]
```
```python []
class Solution2:
    """1D DP without modifying input. O(m*n) time, O(n) space."""

    def minPathSum(self, grid: list[list[int]]) -> int:
        m, n = len(grid), len(grid[0])
        dp = [0] * n
        dp[0] = grid[0][0]
        for j in range(1, n):  # O(n) first row
            dp[j] = dp[j - 1] + grid[0][j]
        for i in range(1, m):  # O(m) rows
            dp[0] += grid[i][0]
            for j in range(1, n):  # O(n) cols
                dp[j] = min(dp[j], dp[j - 1]) + grid[i][j]
        return dp[n - 1]
```

### C++

```cpp []
// solution 1, in-place DP. O(m*n) time, O(1) extra space.
int minPathSum(vector<vector<int>> &grid) {
    int m = grid.size(), n = grid[0].size();
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            if (i == 0 && j == 0) continue;
            else if (i == 0) grid[i][j] += grid[i][j - 1];
            else if (j == 0) grid[i][j] += grid[i - 1][j];
            else grid[i][j] += min(grid[i - 1][j], grid[i][j - 1]);
        }
    }
    return grid[m - 1][n - 1];
}
```
```cpp []
// solution 2, 1D DP. O(m*n) time, O(n) space.
int minPathSum(const vector<vector<int>> &grid) {
    int m = grid.size(), n = grid[0].size();
    vector<int> dp(n, 0);
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            if (i == 0 && j == 0) dp[j] = grid[0][0];
            else if (i == 0) dp[j] = dp[j - 1] + grid[i][j];
            else if (j == 0) dp[j] = dp[j] + grid[i][j];
            else dp[j] = min(dp[j], dp[j - 1]) + grid[i][j];
        }
    }
    return dp[n - 1];
}
```

### Rust

```rust []
/// In-place DP modifying grid. O(m*n) time, O(1) extra space.
pub fn min_path_sum(grid: &mut Vec<Vec<i32>>) -> i32 {
    let m = grid.len();
    let n = grid[0].len();
    for i in 0..m {
        for j in 0..n {
            if i == 0 && j == 0 {
                continue;
            }
            let top = if i > 0 { grid[i - 1][j] } else { i32::MAX };
            let left = if j > 0 { grid[i][j - 1] } else { i32::MAX };
            grid[i][j] += top.min(left);
        }
    }
    grid[m - 1][n - 1]
}
```
```rust []
/// 1D DP without modifying input. O(m*n) time, O(n) space.
pub fn min_path_sum_1d(grid: Vec<Vec<i32>>) -> i32 {
    let m = grid.len();
    let n = grid[0].len();
    let mut dp = vec![i32::MAX; n];
    dp[0] = 0;
    for i in 0..m {
        dp[0] += grid[i][0];
        for j in 1..n {
            dp[j] = dp[j].min(dp[j - 1]) + grid[i][j];
        }
    }
    dp[n - 1]
}
```
