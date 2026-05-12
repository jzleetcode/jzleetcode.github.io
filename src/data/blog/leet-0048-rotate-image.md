---
author: JZ
pubDatetime: 2026-05-12T06:00:00Z
modDatetime: 2026-05-12T06:00:00Z
title: LeetCode 48 Rotate Image
featured: true
tags:
  - a-array
  - a-matrix
description:
  "Solutions for LeetCode 48, medium, tags: array, math, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 48](https://leetcode.com/problems/rotate-image/description/)

You are given an `n x n` 2D `matrix` representing an image, rotate the image by **90 degrees** (clockwise).

You have to rotate the image **in-place**, which means you have to modify the input 2D matrix directly. DO NOT allocate another 2D matrix and do the rotation.

```
Example 1:

Input: matrix = [[1,2,3],[4,5,6],[7,8,9]]
Output: [[7,4,1],[8,5,2],[9,6,3]]

Example 2:

Input: matrix = [[5,1,9,11],[2,4,8,10],[13,3,6,7],[15,14,12,16]]
Output: [[15,13,2,5],[14,3,4,1],[12,6,8,9],[16,7,10,11]]

Constraints:

n == matrix.length == matrix[i].length
1 <= n <= 20
-1000 <= matrix[i][j] <= 1000
```

## Solution 1: Transpose + Reflect

### Idea

**Transpose** the matrix (swap rows and columns), then **reflect** each row horizontally (mirror left-right). The transpose maps `(i,j) → (j,i)`, and the reflection maps `(i,j) → (i, n-1-j)`. Composing these gives the 90° clockwise rotation: `(i,j) → (j, n-1-i)`.

```
Original:        Transpose:       Reflect L-R:
1  2  3           1  4  7          7  4  1
4  5  6    →      2  5  8    →     8  5  2
7  8  9           3  6  9          9  6  3
```

Complexity: Time $O(n^2)$, Space $O(1)$.

#### Java

```java []
// solution 1, transpose then reflect. O(n^2) time, O(1) space.
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

#### Python

```python []
class Solution:
    """Transpose then reflect. O(n^2) time, O(1) space."""

    def rotate(self, matrix: list[list[int]]) -> None:
        n = len(matrix)
        for i in range(n):  # O(n^2) transpose
            for j in range(i + 1, n):
                matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
        for i in range(n):  # O(n^2) reflect left-right
            for j in range(n // 2):
                matrix[i][j], matrix[i][n - 1 - j] = matrix[i][n - 1 - j], matrix[i][j]
```

#### C++

```cpp []
class Solution48 {
public:
    void rotate(vector<vector<int>>& matrix) {
        int n = matrix.size();
        for (int i = 0; i < n; i++) // O(n^2) transpose
            for (int j = i + 1; j < n; j++)
                swap(matrix[i][j], matrix[j][i]);
        for (int i = 0; i < n; i++) // O(n^2) reflect left-right
            for (int j = 0; j < n / 2; j++)
                swap(matrix[i][j], matrix[i][n - 1 - j]);
    }
};
```

#### Rust

```rust []
impl Solution {
    /// Transpose then reflect. O(n^2) time, O(1) space.
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
}
```

## Solution 2: Four-Way Swap (Layer by Layer)

### Idea

Process the matrix layer by layer from outside in. For each element in a layer, perform a **four-way cyclic swap** rotating four corresponding cells simultaneously:

```
For a 4x4 matrix, layer 0 processes elements marked *:

 *  *  *  .         top → right → bottom → left → top
 *  .  .  *         Each * moves to its 90°-rotated position
 *  .  .  *         in a single 4-element cycle.
 .  *  *  *

Cycle for element (0,0) in a 4x4:
  (0,0) ← (3,0) ← (3,3) ← (0,3)
    5   ←   15  ←   16  ←   11
```

Complexity: Time $O(n^2)$, Space $O(1)$.

#### Java

```java []
// solution 2, four-way swap layer by layer. O(n^2) time, O(1) space.
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

#### Python

```python []
class Solution2:
    """Rotate four cells at a time, layer by layer. O(n^2) time, O(1) space."""

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

#### C++

```cpp []
class Solution48FourWay {
public:
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
};
```

#### Rust

```rust []
impl Solution {
    /// Rotate four cells at a time, layer by layer. O(n^2) time, O(1) space.
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
}
```
