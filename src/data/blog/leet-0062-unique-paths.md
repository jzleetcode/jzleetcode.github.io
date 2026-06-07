---
author: JZ
pubDatetime: 2026-06-01T10:36:00Z
modDatetime: 2026-06-01T10:36:00Z
title: LeetCode 62 Unique Paths
featured: false
tags:
  - a-dp
  - a-math
description:
  "Solutions for LeetCode 62, medium, tags: math, dynamic programming, combinatorics."
---

## Table of contents

## Description

There is a robot on an `m x n` grid. The robot is initially located at the top-left corner (i.e., `grid[0][0]`). The robot tries to move to the bottom-right corner (i.e., `grid[m - 1][n - 1]`). The robot can only move either down or right at any point in time.

Given the two integers `m` and `n`, return the number of possible unique paths that the robot can take to reach the bottom-right corner.

The test cases are generated so that the answer will be less than or equal to $2 \times 10^9$.

**Example 1:**

```
Input: m = 3, n = 7
Output: 28
```

**Example 2:**

```
Input: m = 3, n = 2
Output: 3
Explanation: From the top-left corner, there are a total of 3 ways to reach the bottom-right corner:
1. Right -> Down -> Down
2. Down -> Down -> Right
3. Down -> Right -> Down
```

**Constraints:**

- `1 <= m, n <= 100`

Link: [LeetCode 62](https://leetcode.com/problems/unique-paths/)

## Idea

### Approach 1: Rolling 1D DP

We observe that `dp[i][j] = dp[i-1][j] + dp[i][j-1]` (reach from top or left). We can compress the 2D table to 1D since each row only depends on itself and the previous row.

```
Grid (3x7):                dp array after each column:
+---+---+---+---+---+---+---+    col 0: [1,1,1]
| S |   |   |   |   |   |   |    col 1: [1,2,3]
+---+---+---+---+---+---+---+    col 2: [1,3,6]
|   |   |   |   |   |   |   |    ...
+---+---+---+---+---+---+---+    col 6: [1,7,28]
|   |   |   |   |   |   | E |
+---+---+---+---+---+---+---+
```

Complexity: Time $O(mn)$, Space $O(\min(m,n))$.

### Approach 2: Combinatorics

The robot must take exactly `m-1` steps down and `n-1` steps right — a total of `m+n-2` steps. We choose which `m-1` are down:

$$\binom{m+n-2}{m-1} = \frac{(m+n-2)!}{(m-1)!(n-1)!}$$

We compute this iteratively to avoid overflow: multiply numerator terms and divide denominator terms one at a time.

Complexity: Time $O(\min(m,n))$, Space $O(1)$.

### Java

```java []
public class UniquePaths {
    // O(mn) time, O(min(m,n)) space, 0ms, 38.9 Mb.
    public int uniquePathsDP(int m, int n) {
        if (m > n) return uniquePathsDP(n, m);
        int[] dp = new int[m + 1]; // dp[0] dummy
        dp[1] = 1; // dummy 0, so initialize dp[1]
        for (int i = 0; i < n; i++)        // O(n)
            for (int j = 1; j <= m; j++)    // O(m)
                dp[j] += dp[j - 1]; // reach here from left(dp[j]) or top (dp[j-1])
        return dp[m];
    }

    // O(min(m,n)) time, O(1) space. 0ms, 39.3 Mb.
    public int uniquePathsCombination(int m, int n) {
        if (m > n) return uniquePathsCombination(n, m);
        long res = 1;
        for (int i = m + n - 2, j = 1; i >= n; i--, j++) // O(min(m,n))
            res = res * i / j;
        return (int) res;
    }
}
```

### Python

```python []
class Solution:
    """O(mn) time, O(min(m,n)) space. Rolling 1D DP."""

    def uniquePaths(self, m: int, n: int) -> int:
        if m > n:
            return self.uniquePaths(n, m)
        dp = [0] * (m + 1)
        dp[1] = 1
        for i in range(n):  # O(n)
            for j in range(1, m + 1):  # O(m)
                dp[j] += dp[j - 1]
        return dp[m]


class Solution2:
    """O(min(m,n)) time, O(1) space. Combinatorics: C(m+n-2, m-1)."""

    def uniquePaths(self, m: int, n: int) -> int:
        if m > n:
            return self.uniquePaths(n, m)
        res, j = 1, 1
        for i in range(m + n - 2, n - 1, -1):  # O(min(m,n))
            res = res * i // j
            j += 1
        return res
```

### C++

```cpp []
#include <algorithm>
#include <vector>

using namespace std;

class UniquePaths {
public:
    // O(mn) time, O(min(m,n)) space. Rolling 1D DP.
    static int dp(int m, int n) {
        if (m > n) swap(m, n);
        vector<int> row(m + 1, 0);
        row[1] = 1;
        for (int i = 0; i < n; i++)        // O(n)
            for (int j = 1; j <= m; j++)    // O(m)
                row[j] += row[j - 1];
        return row[m];
    }

    // O(min(m,n)) time, O(1) space. Combinatorics: C(m+n-2, m-1).
    static int combination(int m, int n) {
        if (m > n) swap(m, n);
        long res = 1;
        for (int i = m + n - 2, j = 1; i >= n; i--, j++) // O(min(m,n))
            res = res * i / j;
        return (int) res;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// O(mn) time, O(min(m,n)) space. Rolling 1D DP.
    pub fn unique_paths_dp(m: i32, n: i32) -> i32 {
        let (m, n) = if m > n { (n as usize, m as usize) } else { (m as usize, n as usize) };
        let mut dp = vec![0i32; m + 1];
        dp[1] = 1;
        for _ in 0..n { // O(n)
            for j in 1..=m { // O(m)
                dp[j] += dp[j - 1];
            }
        }
        dp[m]
    }

    /// O(min(m,n)) time, O(1) space. Combinatorics: C(m+n-2, m-1).
    pub fn unique_paths_comb(m: i32, n: i32) -> i32 {
        let (m, n) = if m > n { (n as i64, m as i64) } else { (m as i64, n as i64) };
        let mut res: i64 = 1;
        let mut j: i64 = 1;
        for i in (n..=(m + n - 2)).rev() { // O(min(m,n))
            res = res * i / j;
            j += 1;
        }
        res as i32
    }
}
```
