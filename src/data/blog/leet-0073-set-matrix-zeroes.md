---
author: JZ
pubDatetime: 2026-06-13T06:00:00Z
modDatetime: 2026-06-13T06:00:00Z
title: LeetCode 73 Set Matrix Zeroes
featured: false
tags:
  - a-array
  - a-hash-table
  - a-matrix
description:
  "Solutions for LeetCode 73, medium, tags: array, hash table, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 73](https://leetcode.com/problems/set-matrix-zeroes/description/)

Given an `m x n` integer matrix, if an element is `0`, set its entire row and column to `0`'s.

You must do it **in place**.

```
Example 1:

Input: matrix = [[1,1,1],[1,0,1],[1,1,1]]
Output: [[1,0,1],[0,0,0],[1,0,1]]

Example 2:

Input: matrix = [[0,1,2,0],[3,4,5,2],[1,3,1,5]]
Output: [[0,0,0,0],[0,4,5,0],[0,3,1,0]]
```

**Constraints:**

- `m == matrix.length`
- `n == matrix[0].length`
- `1 <= m, n <= 200`
- `-2^31 <= matrix[i][j] <= 2^31 - 1`

**Follow up:**

- A straightforward solution using `O(mn)` space is probably a bad idea.
- A simple improvement uses `O(m + n)` space, but still not the best solution.
- Could you devise a constant space solution?

## Idea1

**Use first row and column as markers (O(1) space).** Instead of allocating extra arrays to record which rows and columns should be zeroed, reuse the first row and first column of the matrix itself.

```
Step 1: Scan and mark                   Step 2: Zero out (backward)
+-----+-----+-----+-----+              +-----+-----+-----+-----+
|flag | col1 | col2 | col3|  <-- row 0  | 0   |  0  |  0  |  0  |
+-----+-----+-----+-----+   markers    +-----+-----+-----+-----+
|row1 |      |      |     |             | 0   |  4  |  5  |  0  |
+-----+-----+-----+-----+             +-----+-----+-----+-----+
|row2 |      |      |     |             | 0   |  3  |  1  |  0  |
+-----+-----+-----+-----+             +-----+-----+-----+-----+
  ^
  col0 flag (separate boolean)
```

Key insight: `matrix[0][0]` serves as the marker for row 0. We need a separate boolean `col0` for column 0 since `matrix[0][0]` cannot serve both purposes.

Scan backward in phase 2 to avoid overwriting markers before they are consumed.

Complexity: Time $O(mn)$ — two passes over the matrix, Space $O(1)$ — only one boolean flag.

### Java

```java []
// lc 73, O(mn) time, O(1) space. Use first row/col as markers.
public void setZeroes(int[][] matrix) {
    int r = matrix.length, c = matrix[0].length;
    boolean setCol0 = false; // flag for col0, 0,0 used for row0 flag
    for (int i = 0; i < r; i++) { // O(m)
        if (matrix[i][0] == 0) setCol0 = true;
        for (int j = 1; j < c; j++) // O(n)
            if (matrix[i][j] == 0) matrix[i][0] = matrix[0][j] = 0;
    }
    for (int i = r - 1; i >= 0; i--) { // O(m)
        for (int j = c - 1; j >= 1; j--) // O(n)
            if (matrix[i][0] == 0 || matrix[0][j] == 0) matrix[i][j] = 0;
        if (setCol0) matrix[i][0] = 0;
    }
}
```

```python []
# lc 73, O(mn) time, O(1) space. Use first row/col as markers.
def setZeroes(self, matrix: List[List[int]]) -> None:
    m, n = len(matrix), len(matrix[0])
    col0 = False
    for i in range(m):  # O(m)
        if matrix[i][0] == 0:
            col0 = True
        for j in range(1, n):  # O(n)
            if matrix[i][j] == 0:
                matrix[i][0] = matrix[0][j] = 0
    for i in range(m - 1, -1, -1):  # O(m)
        for j in range(n - 1, 0, -1):  # O(n)
            if matrix[i][0] == 0 or matrix[0][j] == 0:
                matrix[i][j] = 0
        if col0:
            matrix[i][0] = 0
```

```cpp []
// lc 73, O(mn) time, O(1) space. Use first row/col as markers.
static void setZeroes(vector<vector<int>>& matrix) {
    int m = matrix.size(), n = matrix[0].size();
    bool col0 = false;
    for (int i = 0; i < m; i++) { // O(m)
        if (matrix[i][0] == 0) col0 = true;
        for (int j = 1; j < n; j++) // O(n)
            if (matrix[i][j] == 0) matrix[i][0] = matrix[0][j] = 0;
    }
    for (int i = m - 1; i >= 0; i--) { // O(m)
        for (int j = n - 1; j >= 1; j--) // O(n)
            if (matrix[i][0] == 0 || matrix[0][j] == 0) matrix[i][j] = 0;
        if (col0) matrix[i][0] = 0;
    }
}
```

```rust []
// lc 73, O(mn) time, O(1) space. Use first row/col as markers.
pub fn set_zeroes(matrix: &mut Vec<Vec<i32>>) {
    let m = matrix.len();
    let n = matrix[0].len();
    let mut col0_has_zero = false;
    for i in 0..m { // O(m)
        if matrix[i][0] == 0 { col0_has_zero = true; }
        for j in 1..n { // O(n)
            if matrix[i][j] == 0 {
                matrix[i][0] = 0;
                matrix[0][j] = 0;
            }
        }
    }
    for i in (0..m).rev() { // O(m)
        for j in (1..n).rev() { // O(n)
            if matrix[i][0] == 0 || matrix[0][j] == 0 {
                matrix[i][j] = 0;
            }
        }
        if col0_has_zero { matrix[i][0] = 0; }
    }
}
```

## Idea2

**HashSet approach (O(m+n) space).** Two-pass algorithm: first pass records which rows and columns contain zeros; second pass zeros out the marked rows and columns.

Simpler to reason about correctness — no risk of premature marker corruption — at the cost of extra space.

Complexity: Time $O(mn)$ — two full passes, Space $O(m+n)$ — sets for row and column indices.

### Java

```java []
// lc 73, O(mn) time, O(m+n) space. Use sets.
public void setZeroes(int[][] matrix) {
    int m = matrix.length, n = matrix[0].length;
    Set<Integer> rows = new HashSet<>(), cols = new HashSet<>();
    for (int i = 0; i < m; i++) // O(m*n) scan
        for (int j = 0; j < n; j++)
            if (matrix[i][j] == 0) { rows.add(i); cols.add(j); }
    for (int i = 0; i < m; i++) // O(m*n) zero out
        for (int j = 0; j < n; j++)
            if (rows.contains(i) || cols.contains(j)) matrix[i][j] = 0;
}
```

```python []
# lc 73, O(mn) time, O(m+n) space. Use sets.
def setZeroes(self, matrix: List[List[int]]) -> None:
    m, n = len(matrix), len(matrix[0])
    rows, cols = set(), set()
    for i in range(m):  # O(m*n)
        for j in range(n):
            if matrix[i][j] == 0:
                rows.add(i)
                cols.add(j)
    for i in range(m):  # O(m*n)
        for j in range(n):
            if i in rows or j in cols:
                matrix[i][j] = 0
```

```cpp []
// lc 73, O(mn) time, O(m+n) space. Use sets.
static void setZeroesV2(vector<vector<int>>& matrix) {
    int m = matrix.size(), n = matrix[0].size();
    unordered_set<int> rows, cols;
    for (int i = 0; i < m; i++) // O(m*n) scan
        for (int j = 0; j < n; j++)
            if (matrix[i][j] == 0) { rows.insert(i); cols.insert(j); }
    for (int i = 0; i < m; i++) // O(m*n) zero out
        for (int j = 0; j < n; j++)
            if (rows.count(i) || cols.count(j)) matrix[i][j] = 0;
}
```

```rust []
// lc 73, O(mn) time, O(m+n) space. Use HashSets.
pub fn set_zeroes_v2(matrix: &mut Vec<Vec<i32>>) {
    let m = matrix.len();
    let n = matrix[0].len();
    let mut zero_rows = HashSet::new();
    let mut zero_cols = HashSet::new();
    for i in 0..m { // O(m*n) scan
        for j in 0..n {
            if matrix[i][j] == 0 {
                zero_rows.insert(i);
                zero_cols.insert(j);
            }
        }
    }
    for i in 0..m { // O(m*n) zero out
        for j in 0..n {
            if zero_rows.contains(&i) || zero_cols.contains(&j) {
                matrix[i][j] = 0;
            }
        }
    }
}
```
