---
author: JZ
pubDatetime: 2026-05-20T06:00:00Z
modDatetime: 2026-05-20T06:00:00Z
title: LeetCode 48 Rotate Image
featured: true
tags:
  - a-array
  - a-math
  - a-matrix
description:
  "Solutions for LeetCode 48, medium, tags: array, math, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 48](https://leetcode.com/problems/rotate-image/description/)

You are given an `n x n` 2D matrix representing an image, rotate the image by **90 degrees** (clockwise).

You have to rotate the image **in-place**, which means you have to modify the input 2D matrix directly. DO NOT allocate another 2D matrix and do the rotation.

```
Example 1:

Input: matrix = [[1,2,3],[4,5,6],[7,8,9]]
Output: [[7,4,1],[8,5,2],[9,6,3]]

Example 2:

Input: matrix = [[5,1,9,11],[2,4,8,10],[13,3,6,7],[15,14,12,16]]
Output: [[15,13,2,5],[14,3,4,1],[12,6,8,9],[16,7,10,11]]
```

**Constraints:**

- `n == matrix.length == matrix[i].length`
- `1 <= n <= 20`
- `-1000 <= matrix[i][j] <= 1000`

## Idea1

**Transpose then reflect.** A 90-degree clockwise rotation is equivalent to two simple operations:

1. **Transpose** the matrix (swap `matrix[i][j]` with `matrix[j][i]` for all `i < j`).
2. **Reflect** each row horizontally (reverse each row, i.e., swap columns `j` and `n-1-j`).

```
Original        Transpose       Reflect (left-right)
1  2  3         1  4  7         7  4  1
4  5  6   -->   2  5  8   -->   8  5  2
7  8  9         3  6  9         9  6  3
```

Why this works: transposing swaps rows and columns (`(i,j) -> (j,i)`), then reflecting horizontally maps `(j,i) -> (j, n-1-i)`. Combined: `(i,j) -> (j, n-1-i)`, which is exactly the 90-degree clockwise rotation formula.

Complexity: Time $O(n^2)$ — two passes over the matrix, Space $O(1)$ — in-place swaps.

### Java

```java []
// lc 48, transpose + reflect, O(n^2) time, O(1) space.
public void rotate(int[][] matrix) {
    int n = matrix.length;
    for (int i = 0; i < n; i++) // O(n^2) transpose
        for (int j = i + 1; j < n; j++) {
            int temp = matrix[i][j];
            matrix[i][j] = matrix[j][i];
            matrix[j][i] = temp;
        }
    for (int i = 0; i < n; i++) // O(n^2) reflect left-right
        for (int j = 0; j < n / 2; j++) {
            int temp = matrix[i][j];
            matrix[i][j] = matrix[i][n - 1 - j];
            matrix[i][n - 1 - j] = temp;
        }
}
```

```python []
# lc 48, transpose + reflect, O(n^2) time, O(1) space.
def rotate(self, matrix: list[list[int]]) -> None:
    n = len(matrix)
    for i in range(n):  # O(n^2) transpose
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for i in range(n):  # O(n^2) reflect left-right
        for j in range(n // 2):
            matrix[i][j], matrix[i][n - 1 - j] = matrix[i][n - 1 - j], matrix[i][j]
```

```cpp []
// lc 48, transpose + reflect, O(n^2) time, O(1) space.
void rotate(vector<vector<int>>& matrix) {
    int n = matrix.size();
    for (int i = 0; i < n; i++) // O(n^2) transpose
        for (int j = i + 1; j < n; j++)
            swap(matrix[i][j], matrix[j][i]);
    for (int i = 0; i < n; i++) // O(n^2) reflect left-right
        for (int j = 0; j < n / 2; j++)
            swap(matrix[i][j], matrix[i][n - 1 - j]);
}
```

```rust []
// lc 48, transpose + reflect, O(n^2) time, O(1) space.
pub fn rotate(matrix: &mut Vec<Vec<i32>>) {
    let n = matrix.len();
    for i in 0..n { // O(n^2) transpose
        for j in (i + 1)..n {
            let tmp = matrix[i][j];
            matrix[i][j] = matrix[j][i];
            matrix[j][i] = tmp;
        }
    }
    for i in 0..n { // O(n^2) reflect left-right
        for j in 0..n / 2 {
            matrix[i].swap(j, n - 1 - j);
        }
    }
}
```

## Idea2

**Rotate four cells at a time, layer by layer.** Process the matrix from the outermost layer inward. For each layer, pick four cells that form a rotation cycle and rotate their values in one pass using a single temp variable.

```
Layer 0 (outermost) of 4x4:          Cycle for position (0,1):
+--+--+--+--+                        matrix[0][1] <- matrix[2][0]
|  |  |  |  |  <-- layer 0           matrix[2][0] <- matrix[3][2]
+--+--+--+--+                        matrix[3][2] <- matrix[1][3]
|  |##|##|  |                        matrix[1][3] <- matrix[0][1] (saved in tmp)
+--+--+--+--+
|  |##|##|  |  <-- layer 1 (inner)
+--+--+--+--+
|  |  |  |  |
+--+--+--+--+
```

For cell `(i, j)`, the four positions in the cycle are:
- `(i, j)` <- `(n-1-j, i)` <- `(n-1-i, n-1-j)` <- `(j, n-1-i)` <- `(i, j)`

Complexity: Time $O(n^2)$ — each cell visited exactly once, Space $O(1)$ — only one temp variable.

### Java

```java []
// lc 48, four-way rotation, O(n^2) time, O(1) space.
public void rotate(int[][] matrix) {
    int n = matrix.length;
    for (int i = 0; i < n / 2; i++) // O(n/2) layers
        for (int j = i; j < n - i - 1; j++) { // O(n) elements per layer
            int temp = matrix[i][j];
            matrix[i][j] = matrix[n - j - 1][i];
            matrix[n - j - 1][i] = matrix[n - i - 1][n - j - 1];
            matrix[n - i - 1][n - j - 1] = matrix[j][n - i - 1];
            matrix[j][n - i - 1] = temp;
        }
}
```

```python []
# lc 48, four-way rotation, O(n^2) time, O(1) space.
def rotate(self, matrix: list[list[int]]) -> None:
    n = len(matrix)
    for i in range(n // 2):  # O(n/2) layers
        for j in range(i, n - i - 1):  # O(n) elements per layer
            tmp = matrix[i][j]
            matrix[i][j] = matrix[n - j - 1][i]
            matrix[n - j - 1][i] = matrix[n - i - 1][n - j - 1]
            matrix[n - i - 1][n - j - 1] = matrix[j][n - i - 1]
            matrix[j][n - i - 1] = tmp
```

```cpp []
// lc 48, four-way rotation, O(n^2) time, O(1) space.
void rotate(vector<vector<int>>& matrix) {
    int n = matrix.size();
    for (int i = 0; i < n / 2; i++) // O(n/2) layers
        for (int j = i; j < n - i - 1; j++) { // O(n) elements per layer
            int tmp = matrix[i][j];
            matrix[i][j] = matrix[n - j - 1][i];
            matrix[n - j - 1][i] = matrix[n - i - 1][n - j - 1];
            matrix[n - i - 1][n - j - 1] = matrix[j][n - i - 1];
            matrix[j][n - i - 1] = tmp;
        }
}
```

```rust []
// lc 48, four-way rotation, O(n^2) time, O(1) space.
pub fn rotate_four_way(matrix: &mut Vec<Vec<i32>>) {
    let n = matrix.len();
    for i in 0..n / 2 { // O(n/2) layers
        for j in i..n - i - 1 { // O(n) elements per layer
            let tmp = matrix[i][j];
            matrix[i][j] = matrix[n - j - 1][i];
            matrix[n - j - 1][i] = matrix[n - i - 1][n - j - 1];
            matrix[n - i - 1][n - j - 1] = matrix[j][n - i - 1];
            matrix[j][n - i - 1] = tmp;
        }
    }
}
```
