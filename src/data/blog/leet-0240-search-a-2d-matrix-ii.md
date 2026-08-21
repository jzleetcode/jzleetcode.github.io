---
author: JZ
pubDatetime: 2026-08-21T08:00:00Z
modDatetime: 2026-08-21T08:00:00Z
title: LeetCode 240 Search a 2D Matrix II
featured: true
tags:
  - a-array
  - a-binary-search
  - a-matrix
  - a-divide-and-conquer
description:
  "Solutions for LeetCode 240, medium, tags: array, binary search, matrix, divide and conquer."
---

## Table of contents

## Description

Question Link: [LeetCode 240](https://leetcode.com/problems/search-a-2d-matrix-ii/description/)

Write an efficient algorithm that searches for a value `target` in an `m x n` integer matrix. This matrix has the following properties:

- Integers in each row are sorted in ascending from left to right.
- Integers in each column are sorted in ascending from top to bottom.

Constraints:

- `m == matrix.length`
- `n == matrix[i].length`
- `1 <= n, m <= 300`
- `-10^9 <= matrix[i][j] <= 10^9`
- All the integers in each row are sorted in ascending order.
- All the integers in each column are sorted in ascending order.
- `-10^9 <= target <= 10^9`

## Idea1

Start from the top-right corner. At position `(r, c)`:
- If the value equals `target`, return true.
- If the value is greater than `target`, move left (eliminate current column).
- If the value is less than `target`, move down (eliminate current row).

Each step eliminates either a row or a column, so we make at most `m + n` steps.

```
Matrix (5x5), target = 14:

  1   4   7  11 [15]  <- start here
  2   5   8  12  19
  3   6   9  16  22
 10  13  14  17  24
 18  21  23  26  30

15 > 14 -> move left
11 < 14 -> move down
12 < 14 -> move down
16 > 14 -> move left
 9 < 14 -> move down
14 == 14 -> found!
```

Complexity: Time $O(m + n)$, Space $O(1)$.

### Java

```java []
// solution 1, search from top right, O(m+n) time, O(1) space.
public boolean searchMatrix1(int[][] matrix, int target) {
    int r = 0, c = matrix[0].length - 1;
    while (c >= 0 && r < matrix.length) { // O(m+n) iterations
        int v = matrix[r][c];
        if (target == v) return true;
        else if (target < v) c--;
        else r++;
    }
    return false;
}
```

### Python

```python []
def searchMatrix(self, matrix: list[list[int]], target: int) -> bool:
    """Staircase search from top-right corner. O(m+n) time, O(1) space."""
    m, n = len(matrix), len(matrix[0])
    r, c = 0, n - 1  # O(m+n) iterations at most
    while r < m and c >= 0:
        if matrix[r][c] == target:
            return True
        elif matrix[r][c] > target:
            c -= 1
        else:
            r += 1
    return False
```

### C++

```cpp []
// Staircase from top-right: O(m+n) time, O(1) space
bool searchMatrix(vector<vector<int>>& matrix, int target) {
    if (matrix.empty() || matrix[0].empty()) return false;
    int m = matrix.size(), n = matrix[0].size();
    int row = 0, col = n - 1;
    while (row < m && col >= 0) { // O(m+n) iterations
        if (matrix[row][col] == target) return true;
        else if (matrix[row][col] < target) row++;
        else col--;
    }
    return false;
}
```

### Rust

```rust []
/// Staircase search from top-right corner.
/// Time: O(m + n), Space: O(1)
pub fn search_matrix(matrix: Vec<Vec<i32>>, target: i32) -> bool {
    if matrix.is_empty() || matrix[0].is_empty() {
        return false;
    }
    let m = matrix.len();
    let n = matrix[0].len();
    let mut row = 0i32;
    let mut col = n as i32 - 1;

    while row < m as i32 && col >= 0 { // O(m+n) iterations
        let val = matrix[row as usize][col as usize];
        if val == target {
            return true;
        } else if val < target {
            row += 1;
        } else {
            col -= 1;
        }
    }
    false
}
```

## Idea2

Binary search each row independently. For each of the `m` rows, run a standard binary search in $O(\log n)$. We can skip a row early if `target` is outside the row's `[first, last]` range.

Complexity: Time $O(m \log n)$, Space $O(1)$.

### Java

```java []
// solution 2, divide and conquer, O(mn ^ log_4 3) time, O(log_4 mn) stack space.
public boolean searchMatrix(int[][] matrix, int target) {
    int r = matrix.length, c = matrix[0].length;
    return searchMatrix(matrix, 0, 0, r - 1, c - 1, target);
}

private boolean searchMatrix(int[][] matrix, int r1, int c1, int r2, int c2, int target) {
    if (r2 < r1 || c2 < c1 || r1 >= matrix.length || c1 >= matrix[0].length) return false;
    int rMid = (r1 + r2) / 2;
    int cMid = (c1 + c2) / 2;
    int v = matrix[rMid][cMid];
    if (v < target) {
        return searchMatrix(matrix, r1, cMid + 1, rMid, c2, target) // top right
                || searchMatrix(matrix, rMid + 1, c1, r2, cMid, target) // bottom left
                || searchMatrix(matrix, rMid + 1, cMid + 1, r2, c2, target); // bottom right
    } else if (v > target) {
        return searchMatrix(matrix, r1, c1, rMid, cMid - 1, target) // top left
                || searchMatrix(matrix, r1, cMid, rMid - 1, c2, target) // top right
                || searchMatrix(matrix, rMid + 1, c1, r2, cMid - 1, target); // bottom left
    } else return true;
}
```

### Python

```python []
def searchMatrix2(self, matrix: list[list[int]], target: int) -> bool:
    """Binary search each row. O(m log n) time, O(1) space."""
    from bisect import bisect_left
    for row in matrix:  # O(m) rows
        j = bisect_left(row, target)  # O(log n) per row
        if j < len(row) and row[j] == target:
            return True
    return False
```

### C++

```cpp []
// Binary search per row: O(m log n) time, O(1) space
bool searchMatrix2(vector<vector<int>>& matrix, int target) {
    if (matrix.empty() || matrix[0].empty()) return false;
    for (auto& row : matrix) { // O(m) rows
        if (row[0] > target) break;
        if (row.back() < target) continue;
        int lo = 0, hi = (int)row.size() - 1;
        while (lo <= hi) { // O(log n)
            int mid = lo + (hi - lo) / 2;
            if (row[mid] == target) return true;
            else if (row[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return false;
}
```

### Rust

```rust []
/// Binary search per row.
/// Time: O(m log n), Space: O(1)
pub fn search_matrix_binary(matrix: Vec<Vec<i32>>, target: i32) -> bool {
    for row in &matrix { // O(m) rows
        if row.is_empty() {
            continue;
        }
        if row[0] > target || *row.last().unwrap() < target {
            continue;
        }
        if row.binary_search(&target).is_ok() { // O(log n)
            return true;
        }
    }
    false
}
```
