---
author: JZ
pubDatetime: 2026-09-01T06:00:00Z
modDatetime: 2026-09-01T06:00:00Z
title: LeetCode 120 Triangle
featured: true
tags:
  - a-array
  - a-dynamic-programming
description:
  "Solutions for LeetCode 120, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 120](https://leetcode.com/problems/triangle/description/)

Given a `triangle` array, return the minimum path sum from top to bottom.

For each step, you may move to an adjacent number of the row below. More formally, if you are on index `i` on the current row, you may move to either index `i` or index `i + 1` on the next row.

```
Example 1:

Input: triangle = [[2],[3,4],[6,5,7],[4,1,8,3]]
Output: 11
Explanation: The minimum path sum from top to bottom is 2 + 3 + 5 + 1 = 11.

Example 2:

Input: triangle = [[-10]]
Output: -10

Constraints:

1 <= triangle.length <= 200
triangle[0].length == 1
triangle[i].length == triangle[i - 1].length + 1
-10^4 <= triangle[i][j] <= 10^4
```

## Solution 1: Bottom-Up DP with O(n) Space

### Idea

Work from the bottom row upward. Maintain a 1-D `dp` array initialized to the last row. For each row above, update `dp[j]` to be the current element plus the minimum of its two children (`dp[j]` and `dp[j+1]`). When we reach the top, `dp[0]` holds the answer.

```
triangle:           dp evolution (bottom to top):

    [2]             start dp = [4, 1, 8, 3]
   [3, 4]
  [6, 5, 7]        row 2: dp[0] = 6+min(4,1)=7
 [4, 1, 8, 3]             dp[1] = 5+min(1,8)=6
                           dp[2] = 7+min(8,3)=10
                           dp = [7, 6, 10, 3]

                    row 1: dp[0] = 3+min(7,6)=9
                           dp[1] = 4+min(6,10)=10
                           dp = [9, 10, 10, 3]

                    row 0: dp[0] = 2+min(9,10)=11
                           dp = [11, 10, 10, 3]

                    answer: dp[0] = 11
```

Complexity: Time $O(n^2)$ — we visit each element once, and the triangle has $1 + 2 + \ldots + n = O(n^2)$ elements. Space $O(n)$ for the `dp` array.

#### Java

```java []
public int minimumTotal(List<List<Integer>> triangle) {
    int n = triangle.size();
    int[] dp = new int[n];
    for (int j = 0; j < n; j++) dp[j] = triangle.get(n - 1).get(j); // O(n) copy last row
    for (int i = n - 2; i >= 0; i--) // O(n) rows bottom to top
        for (int j = 0; j <= i; j++) // O(i) columns
            dp[j] = triangle.get(i).get(j) + Math.min(dp[j], dp[j + 1]);
    return dp[0];
}
```

#### Python

```python []
class Solution2:
    def minimumTotal(self, triangle: list[list[int]]) -> int:
        dp = triangle[-1][:]  # O(n) space, copy last row
        for i in range(len(triangle) - 2, -1, -1):  # O(n) rows bottom to top
            for j in range(len(triangle[i])):  # O(i) columns
                dp[j] = triangle[i][j] + min(dp[j], dp[j + 1])
        return dp[0]
```

#### C++

```cpp []
int minimumTotal(vector<vector<int>> &triangle) {
    int n = triangle.size();
    vector<int> dp(triangle.back()); // O(n) copy last row
    for (int i = n - 2; i >= 0; i--) // O(n) rows bottom to top
        for (int j = 0; j <= i; j++) // O(i) columns
            dp[j] = triangle[i][j] + min(dp[j], dp[j + 1]);
    return dp[0];
}
```

#### Rust

```rust []
pub fn minimum_total(triangle: Vec<Vec<i32>>) -> i32 {
    let n = triangle.len();
    let mut dp = triangle[n - 1].clone(); // O(n) copy last row
    for i in (0..n - 1).rev() { // O(n) rows bottom to top
        for j in 0..=i { // O(i) columns
            dp[j] = triangle[i][j] + dp[j].min(dp[j + 1]);
        }
    }
    dp[0]
}
```

## Solution 2: In-Place / Top-Down Memoization

### Idea

Two alternative approaches that avoid the extra `dp` array:

**In-place (Python, C++, Rust):** Same recurrence as Solution 1, but modify the triangle itself bottom-up. Each element becomes itself plus the minimum of its two children. Space $O(1)$ extra.

**Top-down memoization (Java):** DFS from `(0,0)` with a memo table. At each cell, recurse into the two children below and cache the result. Space $O(n^2)$ for the memo table.

Both run in $O(n^2)$ time.

#### Java

```java []
public int minimumTotalMemo(List<List<Integer>> triangle) {
    int n = triangle.size();
    Integer[][] memo = new Integer[n][n];
    return dfs(triangle, 0, 0, memo);
}

private int dfs(List<List<Integer>> triangle, int i, int j, Integer[][] memo) {
    if (i == triangle.size()) return 0;
    if (memo[i][j] != null) return memo[i][j];
    memo[i][j] = triangle.get(i).get(j)
        + Math.min(dfs(triangle, i + 1, j, memo), dfs(triangle, i + 1, j + 1, memo));
    return memo[i][j];
}
```

#### Python

```python []
class Solution:
    def minimumTotal(self, triangle: list[list[int]]) -> int:
        for i in range(len(triangle) - 2, -1, -1):  # O(n) rows bottom to top
            for j in range(len(triangle[i])):  # O(i) columns
                triangle[i][j] += min(triangle[i + 1][j], triangle[i + 1][j + 1])
        return triangle[0][0]
```

#### C++

```cpp []
int minimumTotal(vector<vector<int>> &triangle) {
    for (int i = triangle.size() - 2; i >= 0; i--) // O(n) rows bottom to top
        for (int j = 0; j <= i; j++) // O(i) columns
            triangle[i][j] += min(triangle[i + 1][j], triangle[i + 1][j + 1]);
    return triangle[0][0];
}
```

#### Rust

```rust []
pub fn minimum_total_in_place(mut triangle: Vec<Vec<i32>>) -> i32 {
    let n = triangle.len();
    for i in (0..n - 1).rev() { // O(n) rows bottom to top
        for j in 0..=i { // O(i) columns
            triangle[i][j] += triangle[i + 1][j].min(triangle[i + 1][j + 1]);
        }
    }
    triangle[0][0]
}
```
