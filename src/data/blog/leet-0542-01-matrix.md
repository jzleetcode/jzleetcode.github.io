---
author: JZ
pubDatetime: 2026-09-22T10:37:00Z
modDatetime: 2026-09-22T10:37:00Z
title: LeetCode 542 01 Matrix
featured: true
tags:
  - a-bfs
  - a-dp
  - a-matrix
  - a-array
description:
  "Solutions for LeetCode 542, medium, tags: array, dynamic programming, bfs, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 542](https://leetcode.com/problems/01-matrix/description/)

Given an `m x n` binary matrix `mat`, return the distance of the nearest `0` for each cell.

The distance between two cells sharing a common edge is `1`.

```
Example 1:

Input: mat = [[0,0,0],[0,1,0],[0,0,0]]
Output: [[0,0,0],[0,1,0],[0,0,0]]

Example 2:

Input: mat = [[0,0,0],[0,1,0],[1,1,1]]
Output: [[0,0,0],[0,1,0],[1,2,1]]

Constraints:

m == mat.length
n == mat[i].length
1 <= m, n <= 10^4
1 <= m * n <= 10^4
mat[i][j] is either 0 or 1.
There is at least one 0 in mat.
```

## Solution 1: DP Two-Pass

### Idea

A cell's nearest-zero distance can only come from one of four directions. We split the four directions into two passes:

1. **Top-left → bottom-right**: each cell takes `min(top, left) + 1`.
2. **Bottom-right → top-left**: each cell takes `min(current, bottom + 1, right + 1)`.

After both passes every cell has seen all four neighbors transitively. We initialize 1-cells to `INF = m + n` (an upper bound on any possible distance) so the `min` operations converge correctly.

```
mat:              pass 1 (↘):       pass 2 (↖):
0 0 0             0 0 0             0 0 0
0 1 0      →      0 1 0      →      0 1 0
1 1 1             1 2 1             1 2 1
```

Complexity: Time $O(m \cdot n)$ — two passes. Space $O(1)$ — modifies `mat` in-place.

#### Java

```java []
// see algorithm-java src/main/java/graph/ZeroOneMatrix.java for the full source.
public int[][] updateMatrix(int[][] mat) {
    int m = mat.length, n = mat[0].length;
    int INF = m + n;
    for (int r = 0; r < m; r++) { // O(m*n) top-left to bottom-right
        for (int c = 0; c < n; c++) {
            if (mat[r][c] > 0) {
                int top = r > 0 ? mat[r - 1][c] : INF;
                int left = c > 0 ? mat[r][c - 1] : INF;
                mat[r][c] = Math.min(top, left) + 1;
            }
        }
    }
    for (int r = m - 1; r >= 0; r--) { // O(m*n) bottom-right to top-left
        for (int c = n - 1; c >= 0; c--) {
            if (mat[r][c] > 0) {
                int bottom = r < m - 1 ? mat[r + 1][c] : INF;
                int right = c < n - 1 ? mat[r][c + 1] : INF;
                mat[r][c] = Math.min(mat[r][c], Math.min(bottom + 1, right + 1));
            }
        }
    }
    return mat; // Time O(m*n), Space O(1)
}
```

#### C++

```cpp []
vector<vector<int>> updateMatrix(vector<vector<int>> &mat) {
    int m = mat.size(), n = mat[0].size();
    int INF = m + n;
    for (int r = 0; r < m; r++) { // O(m*n) top-left to bottom-right
        for (int c = 0; c < n; c++) {
            if (mat[r][c] > 0) {
                int top = r > 0 ? mat[r - 1][c] : INF;
                int left = c > 0 ? mat[r][c - 1] : INF;
                mat[r][c] = min(top, left) + 1;
            }
        }
    }
    for (int r = m - 1; r >= 0; r--) { // O(m*n) bottom-right to top-left
        for (int c = n - 1; c >= 0; c--) {
            if (mat[r][c] > 0) {
                int bottom = r < m - 1 ? mat[r + 1][c] : INF;
                int right = c < n - 1 ? mat[r][c + 1] : INF;
                mat[r][c] = min(mat[r][c], min(bottom + 1, right + 1));
            }
        }
    }
    return mat; // Time O(m*n), Space O(1)
}
```

#### Python

```python []
def updateMatrix(self, mat: list[list[int]]) -> list[list[int]]:
    m, n = len(mat), len(mat[0])
    INF = m + n
    for r in range(m):  # O(m*n) top-left to bottom-right
        for c in range(n):
            if mat[r][c] > 0:
                top = mat[r - 1][c] if r > 0 else INF
                left = mat[r][c - 1] if c > 0 else INF
                mat[r][c] = min(top, left) + 1
    for r in range(m - 1, -1, -1):  # O(m*n) bottom-right to top-left
        for c in range(n - 1, -1, -1):
            if mat[r][c] > 0:
                bottom = mat[r + 1][c] if r < m - 1 else INF
                right = mat[r][c + 1] if c < n - 1 else INF
                mat[r][c] = min(mat[r][c], bottom + 1, right + 1)
    return mat  # Time O(m*n), Space O(1)
```

#### Rust

```rust []
// see crates/leet/src/graph/zero_one_matrix.rs for the full source.
pub fn update_matrix(mut mat: Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    let m = mat.len();
    let n = mat[0].len();
    let inf = (m + n) as i32;
    for r in 0..m { // O(m*n) top-left to bottom-right
        for c in 0..n {
            if mat[r][c] > 0 {
                let top = if r > 0 { mat[r - 1][c] } else { inf };
                let left = if c > 0 { mat[r][c - 1] } else { inf };
                mat[r][c] = top.min(left) + 1;
            }
        }
    }
    for r in (0..m).rev() { // O(m*n) bottom-right to top-left
        for c in (0..n).rev() {
            if mat[r][c] > 0 {
                let bottom = if r < m - 1 { mat[r + 1][c] } else { inf };
                let right = if c < n - 1 { mat[r][c + 1] } else { inf };
                mat[r][c] = mat[r][c].min(bottom + 1).min(right + 1);
            }
        }
    }
    mat // Time O(m*n), Space O(1)
}
```

## Solution 2: Multi-Source BFS

### Idea

Treat every `0` cell as a source and run BFS simultaneously from all sources. This is equivalent to adding a virtual super-source connected to all `0` cells with distance `0`, then doing a single BFS.

1. Enqueue all `0` cells. Mark all `1` cells as `-1` (unvisited).
2. BFS: for each dequeued cell, check its 4 neighbors. If a neighbor is `-1`, set its distance to `current + 1` and enqueue it.

Each cell is enqueued and dequeued exactly once, so the total work is linear.

```
Initial:          After BFS:
 0  0  0           0  0  0
 0 -1  0    →      0  1  0
-1 -1 -1           1  2  1
```

Complexity: Time $O(m \cdot n)$. Space $O(m \cdot n)$ — the BFS queue can hold up to all cells.

#### Java

```java []
// see algorithm-java src/main/java/graph/ZeroOneMatrix.java Solution2 for the full source.
public int[][] updateMatrix(int[][] mat) {
    int m = mat.length, n = mat[0].length;
    int[][] dist = new int[m][n]; // O(m*n) space
    Queue<int[]> queue = new ArrayDeque<>();
    for (int r = 0; r < m; r++) { // O(m*n) enqueue all zeros
        for (int c = 0; c < n; c++) {
            if (mat[r][c] == 0) queue.offer(new int[]{r, c});
            else dist[r][c] = -1;
        }
    }
    int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    while (!queue.isEmpty()) { // O(m*n) total
        int[] cell = queue.poll();
        for (int[] d : dirs) {
            int nr = cell[0] + d[0], nc = cell[1] + d[1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && dist[nr][nc] == -1) {
                dist[nr][nc] = dist[cell[0]][cell[1]] + 1;
                queue.offer(new int[]{nr, nc});
            }
        }
    }
    return dist; // Time O(m*n), Space O(m*n)
}
```

#### C++

```cpp []
vector<vector<int>> updateMatrix(vector<vector<int>> &mat) {
    int m = mat.size(), n = mat[0].size();
    queue<pair<int, int>> q; // O(m*n) space
    for (int r = 0; r < m; r++) { // O(m*n) enqueue all zeros
        for (int c = 0; c < n; c++) {
            if (mat[r][c] == 0) q.push({r, c});
            else mat[r][c] = -1;
        }
    }
    int dirs[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    while (!q.empty()) { // O(m*n) total
        auto [r, c] = q.front();
        q.pop();
        for (auto &d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && mat[nr][nc] == -1) {
                mat[nr][nc] = mat[r][c] + 1;
                q.push({nr, nc});
            }
        }
    }
    return mat; // Time O(m*n), Space O(m*n)
}
```

#### Python

```python []
def updateMatrix(self, mat: list[list[int]]) -> list[list[int]]:
    m, n = len(mat), len(mat[0])
    q = deque()
    for r in range(m):  # O(m*n) enqueue all zeros
        for c in range(n):
            if mat[r][c] == 0:
                q.append((r, c))
            else:
                mat[r][c] = -1
    while q:  # O(m*n) total
        r, c = q.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and mat[nr][nc] == -1:
                mat[nr][nc] = mat[r][c] + 1
                q.append((nr, nc))
    return mat  # Time O(m*n), Space O(m*n)
```

#### Rust

```rust []
// see crates/leet/src/graph/zero_one_matrix.rs Solution2 for the full source.
pub fn update_matrix(mut mat: Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    use std::collections::VecDeque;
    let m = mat.len();
    let n = mat[0].len();
    let mut queue = VecDeque::new(); // O(m*n) space
    for r in 0..m { // O(m*n) enqueue all zeros
        for c in 0..n {
            if mat[r][c] == 0 {
                queue.push_back((r, c));
            } else {
                mat[r][c] = -1;
            }
        }
    }
    let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
    while let Some((r, c)) = queue.pop_front() { // O(m*n) total
        for (dr, dc) in &dirs {
            let nr = r as i32 + dr;
            let nc = c as i32 + dc;
            if nr >= 0 && nr < m as i32 && nc >= 0 && nc < n as i32 {
                let (nr, nc) = (nr as usize, nc as usize);
                if mat[nr][nc] == -1 {
                    mat[nr][nc] = mat[r][c] + 1;
                    queue.push_back((nr, nc));
                }
            }
        }
    }
    mat // Time O(m*n), Space O(m*n)
}
```
