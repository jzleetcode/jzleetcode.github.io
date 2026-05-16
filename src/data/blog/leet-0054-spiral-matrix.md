---
author: JZ
pubDatetime: 2026-05-16T10:07:00Z
modDatetime: 2026-05-16T10:07:00Z
title: LeetCode 54 Spiral Matrix
featured: true
tags:
  - a-array
  - a-matrix
  - a-simulation
description:
  "Solutions for LeetCode 54, medium, tags: array, matrix, simulation."
---

## Table of contents

## Description

Question Links: [LeetCode 54](https://leetcode.com/problems/spiral-matrix/description/)

Given an `m x n` matrix, return all elements of the matrix in spiral order.

```
Example 1:

Input: matrix = [[1,2,3],[4,5,6],[7,8,9]]
Output: [1,2,3,6,9,8,7,4,5]

Example 2:

Input: matrix = [[1,2,3,4],[5,6,7,8],[9,10,11,12]]
Output: [1,2,3,4,8,12,11,10,9,5,6,7]

Constraints:

m == matrix.length
n == matrix[i].length
1 <= m, n <= 10
-100 <= matrix[i][j] <= 100
```

## Solution 1: Direction Simulation

### Idea

We simulate the spiral traversal using four directions: right, down, left, up. We track two limits — one for horizontal moves and one for vertical moves. After completing all steps in one direction, we shrink the corresponding limit by one and rotate to the next direction.

The key insight is starting at position `(0, -1)` (outside the matrix), so the first move lands on `(0, 0)`. The limits array `[n, m-1]` alternates: horizontal directions (right/left) share `limits[0]`, vertical directions (down/up) share `limits[1]`.

```
Matrix 3x4:     Direction cycle and limits:

 1  2  3  4     → right (limit=4): visit 1,2,3,4    limits=[4,2] → [3,2]
 5  6  7  8     ↓ down  (limit=2): visit 8,12       limits=[3,2] → [3,1]
 9 10 11 12     ← left  (limit=3): visit 11,10,9    limits=[3,1] → [2,1]
                ↑ up    (limit=1): visit 5           limits=[2,1] → [2,0]
                → right (limit=2): visit 6,7         limits=[2,0] → [1,0]
                ↓ down  (limit=0): stop
```

Complexity: Time $O(m \cdot n)$, Space $O(1)$ (excluding the output list).

#### Java

```java []
public List<Integer> spiralOrder(int[][] matrix) {
    int r = matrix.length, c = matrix[0].length;
    int[][] dirs = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
    int[] limits = {c, r - 1};
    List<Integer> res = new ArrayList<>();
    int iDir = 0, cr = 0, cc = -1; // start outside the matrix
    while (limits[iDir % 2] != 0) { // O(m*n) total iterations
        for (int i = 0; i < limits[iDir % 2]; i++) {
            cr += dirs[iDir][0];
            cc += dirs[iDir][1];
            res.add(matrix[cr][cc]);
        }
        limits[iDir % 2]--;
        iDir = (iDir + 1) % 4;
    }
    return res;
}
```

#### Python

```python []
class Solution:
    def spiralOrder(self, matrix: List[List[int]]) -> List[int]:
        m, n = len(matrix), len(matrix[0])
        dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)]
        limits = [n, m - 1]  # O(1) space for bounds tracking
        res = []
        d, r, c = 0, 0, -1
        while limits[d % 2] > 0:  # O(m*n) total iterations
            for _ in range(limits[d % 2]):
                r += dirs[d][0]
                c += dirs[d][1]
                res.append(matrix[r][c])
            limits[d % 2] -= 1
            d = (d + 1) % 4
        return res
```

#### C++

```cpp []
class Solution {
public:
    vector<int> spiralOrder(vector<vector<int>>& matrix) {
        int m = matrix.size(), n = matrix[0].size();
        int dirs[4][2] = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
        int limits[2] = {n, m - 1};
        vector<int> res;
        int d = 0, r = 0, c = -1;
        while (limits[d % 2] > 0) { // O(m*n) total iterations
            for (int i = 0; i < limits[d % 2]; i++) {
                r += dirs[d][0];
                c += dirs[d][1];
                res.push_back(matrix[r][c]);
            }
            limits[d % 2]--;
            d = (d + 1) % 4;
        }
        return res;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn spiral_order(matrix: Vec<Vec<i32>>) -> Vec<i32> {
        let (m, n) = (matrix.len(), matrix[0].len());
        let dirs: [(i32, i32); 4] = [(0, 1), (1, 0), (0, -1), (-1, 0)];
        let mut limits = [n as i32, m as i32 - 1];
        let mut res = Vec::with_capacity(m * n);
        let (mut d, mut r, mut c) = (0usize, 0i32, -1i32);
        while limits[d % 2] > 0 { // O(m*n) total iterations
            for _ in 0..limits[d % 2] {
                r += dirs[d].0;
                c += dirs[d].1;
                res.push(matrix[r as usize][c as usize]);
            }
            limits[d % 2] -= 1;
            d = (d + 1) % 4;
        }
        res
    }
}
```

## Solution 2: Layer-by-Layer Peeling

### Idea

We peel the matrix layer by layer from the outside in. For each layer, we traverse four edges: top row left→right, right column top→bottom, bottom row right→left, left column bottom→top. After each full layer, we shrink the boundaries inward.

Special care for single-row or single-column remaining layers to avoid double-counting.

```
Layer 0 (outer):          Layer 1 (inner):

 1 → 2 → 3 → 4           6 → 7
           ↓
 5        8           (single row, no bottom/left pass)
 ↑         ↓
 9 ← 10← 11  12
```

Complexity: Time $O(m \cdot n)$, Space $O(1)$ (excluding the output list).

#### Python

```python []
class Solution2:
    def spiralOrder(self, matrix: List[List[int]]) -> List[int]:
        res = []
        top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
        while top <= bottom and left <= right:  # O(min(m,n)/2) layers
            for c in range(left, right + 1):  # O(n) top row
                res.append(matrix[top][c])
            for r in range(top + 1, bottom + 1):  # O(m) right column
                res.append(matrix[r][right])
            if top < bottom:
                for c in range(right - 1, left - 1, -1):  # O(n) bottom row
                    res.append(matrix[bottom][c])
            if left < right:
                for r in range(bottom - 1, top, -1):  # O(m) left column
                    res.append(matrix[r][left])
            top += 1
            bottom -= 1
            left += 1
            right -= 1
        return res
```
