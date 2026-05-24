---
author: JZ
pubDatetime: 2026-05-24T10:36:00Z
modDatetime: 2026-05-24T10:36:00Z
title: LeetCode 74 Search a 2D Matrix
featured: true
tags:
  - a-array
  - a-binary-search
  - a-matrix
description:
  "Solutions for LeetCode 74, medium, tags: array, binary search, matrix."
---

## Table of contents

## Description

Question Link: [LeetCode 74](https://leetcode.com/problems/search-a-2d-matrix/description/)

You are given an `m x n` integer matrix `matrix` with the following two properties:

- Each row is sorted in non-decreasing order.
- The first integer of each row is greater than the last integer of the previous row.

Given an integer `target`, return `true` if `target` is in `matrix` or `false` otherwise.

You must write a solution in `O(log(m * n))` time complexity.

Constraints:

- `m == matrix.length`
- `n == matrix[i].length`
- `1 <= m, n <= 100`
- `-10^4 <= matrix[i][j], target <= 10^4`

## Idea1

Since each row is sorted and the first element of each row is greater than the last of the previous row, the entire matrix is a sorted sequence when read left-to-right, top-to-bottom. We can map a 1D index `mid` to 2D coordinates `(mid / n, mid % n)` and run a standard binary search.

```
Matrix (3x4):
[ 1,  3,  5,  7]
[10, 11, 16, 20]
[23, 30, 34, 60]

Flattened view:
index: 0  1  2  3  4  5   6   7   8   9  10  11
value: 1  3  5  7  10 11  16  20  23  30  34  60

mid=5 -> row=5/4=1, col=5%4=1 -> matrix[1][1]=11
```

Complexity: Time $O(\log(m \cdot n))$, Space $O(1)$.

### Java

```java []
public static boolean searchMatrix1(int[][] matrix, int target) {
    int m = matrix.length, n = matrix[0].length;
    int lo = 0, hi = m * n - 1;
    // O(log(m*n)) binary search over virtual flattened array
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        int val = matrix[mid / n][mid % n];
        if (val == target) return true;
        else if (val < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}
```

### Python

```python []
def searchMatrix(self, matrix: List[List[int]], target: int) -> bool:
    """O(log(m*n)) time, O(1) space."""
    m, n = len(matrix), len(matrix[0])
    lo, hi = 0, m * n - 1
    while lo <= hi:  # O(log(m*n))
        mid = (lo + hi) // 2
        val = matrix[mid // n][mid % n]
        if val == target:
            return True
        elif val < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False
```

### C++

```cpp []
bool searchMatrix1(vector<vector<int>>& matrix, int target) {
    int m = matrix.size(), n = matrix[0].size();
    int lo = 0, hi = m * n - 1;
    // O(log(m*n)) iterations
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        int val = matrix[mid / n][mid % n];
        if (val == target) return true;
        else if (val < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}
```

### Rust

```rust []
pub fn search_matrix(matrix: Vec<Vec<i32>>, target: i32) -> bool {
    let m = matrix.len();
    let n = matrix[0].len();
    let mut lo: i32 = 0;
    let mut hi: i32 = (m * n) as i32 - 1;
    // O(log(m*n)) iterations
    while lo <= hi {
        let mid = lo + (hi - lo) / 2;
        let val = matrix[mid as usize / n][mid as usize % n];
        if val == target { return true; }
        else if val < target { lo = mid + 1; }
        else { hi = mid - 1; }
    }
    false
}
```

## Idea2

Alternatively, we can do two binary searches: first find the correct row, then search within that row. This makes the logic more modular.

1. Binary search rows: find the row where `matrix[row][0] <= target <= matrix[row][n-1]`.
2. Binary search within that row for the target.

Complexity: Time $O(\log m + \log n)$, Space $O(1)$.

Note: $O(\log m + \log n) = O(\log(m \cdot n))$ by logarithm properties, so both approaches have the same asymptotic complexity.

### Java

```java []
public static boolean searchMatrix2(int[][] matrix, int target) {
    int m = matrix.length, n = matrix[0].length;
    // O(log m) binary search for the row
    int lo = 0, hi = m - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (matrix[mid][0] <= target && target <= matrix[mid][n - 1]) {
            return binarySearch(matrix[mid], target);
        } else if (matrix[mid][0] > target) {
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return false;
}

// O(log n) binary search within a single row
private static boolean binarySearch(int[] row, int target) {
    int lo = 0, hi = row.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (row[mid] == target) return true;
        else if (row[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return false;
}
```

### Python

```python []
def searchMatrix2(self, matrix: List[List[int]], target: int) -> bool:
    """O(log m + log n) time, O(1) space."""
    m, n = len(matrix), len(matrix[0])
    lo, hi = 0, m - 1
    while lo <= hi:  # O(log m)
        mid = (lo + hi) // 2
        if matrix[mid][0] <= target <= matrix[mid][n - 1]:
            break
        elif matrix[mid][0] > target:
            hi = mid - 1
        else:
            lo = mid + 1
    else:
        return False
    row = (lo + hi) // 2
    lo, hi = 0, n - 1
    while lo <= hi:  # O(log n)
        mid = (lo + hi) // 2
        if matrix[row][mid] == target:
            return True
        elif matrix[row][mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return False
```

### C++

```cpp []
bool searchMatrix2(vector<vector<int>>& matrix, int target) {
    int m = matrix.size(), n = matrix[0].size();
    // O(log m) — find the row
    int lo = 0, hi = m - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (matrix[mid][0] <= target && target <= matrix[mid][n - 1]) {
            int left = 0, right = n - 1;
            // O(log n) — search within the row
            while (left <= right) {
                int col = left + (right - left) / 2;
                if (matrix[mid][col] == target) return true;
                else if (matrix[mid][col] < target) left = col + 1;
                else right = col - 1;
            }
            return false;
        } else if (matrix[mid][0] > target) {
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return false;
}
```

### Rust

```rust []
pub fn search_matrix_two_pass(matrix: Vec<Vec<i32>>, target: i32) -> bool {
    let m = matrix.len();
    let n = matrix[0].len();
    let mut lo = 0i32;
    let mut hi = m as i32 - 1;
    // O(log m) — find the row
    while lo <= hi {
        let mid = lo + (hi - lo) / 2;
        let row = &matrix[mid as usize];
        if target < row[0] {
            hi = mid - 1;
        } else if target > row[n - 1] {
            lo = mid + 1;
        } else {
            let mut clo = 0i32;
            let mut chi = n as i32 - 1;
            // O(log n) — search within the row
            while clo <= chi {
                let cmid = clo + (chi - clo) / 2;
                let val = row[cmid as usize];
                if val == target { return true; }
                else if val < target { clo = cmid + 1; }
                else { chi = cmid - 1; }
            }
            return false;
        }
    }
    false
}
```
