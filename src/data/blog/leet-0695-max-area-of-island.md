---
author: JZ
pubDatetime: 2026-06-14T06:23:00Z
modDatetime: 2026-06-14T06:23:00Z
title: LeetCode 695 Max Area of Island
featured: false
tags:
  - a-array
  - a-dfs
  - a-bfs
  - a-matrix
description:
  "Solutions for LeetCode 695, medium, tags: array, depth-first search, breadth-first search, union find, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 695](https://leetcode.com/problems/max-area-of-island/description/)

You are given an `m x n` binary matrix `grid`. An island is a group of `1`'s (representing land) connected 4-directionally (horizontal or vertical). You may assume all four edges of the grid are surrounded by water.

The area of an island is the number of cells with a value `1` in the island.

Return the maximum area of an island in `grid`. If there is no island, return `0`.

**Constraints:**

- `m == grid.length`
- `n == grid[i].length`
- `1 <= m, n <= 50`
- `grid[i][j]` is either `0` or `1`.

## Idea1: DFS

For each unvisited land cell, run DFS to compute the island area by recursively visiting all 4 neighbors. Mark cells as visited by setting them to `0`. Track the maximum area seen.

```
Grid:              DFS from (2,1):
0 0 1 0 0          visits (2,1)->(3,1)->(4,1)->(4,2)->(3,2)
0 0 0 0 0          area = 5
0 1 1 0 0
0 1 1 0 0
0 1 0 0 0
```

Complexity: Time $O(m \times n)$ — each cell visited once. Space $O(m \times n)$ — recursion stack worst case (all land in a snake pattern).

## Idea2: BFS

Same traversal logic but iterative with a queue. For each unvisited land cell, enqueue it and expand level by level, counting area.

Complexity: Time $O(m \times n)$. Space $O(\min(m, n))$ — queue size bounded by the shorter dimension for a rectangular island front.

### Java

```java []
public final class MaxAreaOfIsland {

    private MaxAreaOfIsland() {
    }

    private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

    // DFS. O(m*n) time, O(m*n) space.
    public static int maxAreaDFS(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        int max = 0;
        for (int i = 0; i < m; i++) {           // O(m)
            for (int j = 0; j < n; j++) {       // O(n)
                if (grid[i][j] == 1) {
                    max = Math.max(max, dfs(grid, i, j, m, n));
                }
            }
        }
        return max;
    }

    private static int dfs(int[][] grid, int i, int j, int m, int n) {
        if (i < 0 || i >= m || j < 0 || j >= n || grid[i][j] != 1) return 0;
        grid[i][j] = 0;
        int area = 1;
        for (int[] d : DIRS) { // O(m*n) total across all calls
            area += dfs(grid, i + d[0], j + d[1], m, n);
        }
        return area;
    }
}
```
```java []
import java.util.LinkedList;
import java.util.Queue;

public final class MaxAreaOfIsland {

    private MaxAreaOfIsland() {
    }

    private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

    // BFS. O(m*n) time, O(min(m,n)) space.
    public static int maxAreaBFS(int[][] grid) {
        int m = grid.length, n = grid[0].length;
        int max = 0;
        Queue<int[]> q = new LinkedList<>();
        for (int i = 0; i < m; i++) {           // O(m)
            for (int j = 0; j < n; j++) {       // O(n)
                if (grid[i][j] == 1) {
                    grid[i][j] = 0;
                    q.offer(new int[]{i, j});
                    int area = 0;
                    while (!q.isEmpty()) {      // O(m*n) total
                        int[] cell = q.poll();
                        area++;
                        for (int[] d : DIRS) {
                            int nr = cell[0] + d[0], nc = cell[1] + d[1];
                            if (nr >= 0 && nr < m && nc >= 0 && nc < n && grid[nr][nc] == 1) {
                                grid[nr][nc] = 0;
                                q.offer(new int[]{nr, nc});
                            }
                        }
                    }
                    max = Math.max(max, area);
                }
            }
        }
        return max;
    }
}
```

### Python

```python []
class Solution:
    """DFS. O(m*n) time, O(m*n) space."""

    def maxAreaOfIsland(self, grid: List[List[int]]) -> int:
        m, n = len(grid), len(grid[0])
        res = 0

        def dfs(r, c) -> int:
            if r < 0 or r >= m or c < 0 or c >= n or grid[r][c] != 1:
                return 0
            grid[r][c] = 0
            return 1 + dfs(r + 1, c) + dfs(r - 1, c) + dfs(r, c + 1) + dfs(r, c - 1)  # O(m*n) total

        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                if grid[i][j] == 1:
                    res = max(res, dfs(i, j))
        return res
```
```python []
from collections import deque

class Solution2:
    """BFS. O(m*n) time, O(min(m,n)) space."""

    def maxAreaOfIsland(self, grid: List[List[int]]) -> int:
        m, n = len(grid), len(grid[0])
        res = 0
        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                if grid[i][j] == 1:
                    area = 0
                    grid[i][j] = 0
                    q = deque([(i, j)])
                    while q:  # O(m*n) total
                        r, c = q.popleft()
                        area += 1
                        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < m and 0 <= nc < n and grid[nr][nc] == 1:
                                grid[nr][nc] = 0
                                q.append((nr, nc))
                    res = max(res, area)
        return res
```

### C++

```cpp []
// DFS. O(m*n) time, O(m*n) space.
class Solution {
public:
    int maxAreaOfIsland(vector<vector<int>> &grid) {
        int m = grid.size(), n = grid[0].size(), res = 0;
        for (int i = 0; i < m; i++)        // O(m)
            for (int j = 0; j < n; j++)    // O(n)
                if (grid[i][j] == 1)
                    res = max(res, dfs(grid, i, j, m, n));
        return res;
    }

private:
    int dfs(vector<vector<int>> &grid, int i, int j, int m, int n) {
        if (i < 0 || i >= m || j < 0 || j >= n || grid[i][j] != 1) return 0;
        grid[i][j] = 0;
        return 1 + dfs(grid, i + 1, j, m, n) + dfs(grid, i - 1, j, m, n)
                 + dfs(grid, i, j + 1, m, n) + dfs(grid, i, j - 1, m, n);
    }
};
```
```cpp []
// BFS. O(m*n) time, O(min(m,n)) space.
class Solution {
public:
    int maxAreaOfIsland(vector<vector<int>> &grid) {
        int m = grid.size(), n = grid[0].size(), res = 0;
        int dirs[] = {0, 1, 0, -1, 0};
        for (int i = 0; i < m; i++)
            for (int j = 0; j < n; j++)
                if (grid[i][j] == 1) {
                    int area = 0;
                    queue<pair<int, int>> q;
                    grid[i][j] = 0;
                    q.push({i, j});
                    while (!q.empty()) {
                        auto [r, c] = q.front();
                        q.pop();
                        area++;
                        for (int d = 0; d < 4; d++) {
                            int nr = r + dirs[d], nc = c + dirs[d + 1];
                            if (nr >= 0 && nr < m && nc >= 0 && nc < n && grid[nr][nc] == 1) {
                                grid[nr][nc] = 0;
                                q.push({nr, nc});
                            }
                        }
                    }
                    res = max(res, area);
                }
        return res;
    }
};
```

### Rust

```rust []
// DFS. O(m*n) time, O(m*n) space.
impl Solution {
    pub fn max_area_of_island(grid: &mut Vec<Vec<i32>>) -> i32 {
        let (m, n) = (grid.len(), grid[0].len());
        let mut res = 0;
        for i in 0..m {
            for j in 0..n {
                if grid[i][j] == 1 {
                    res = res.max(Self::dfs(grid, i, j, m, n));
                }
            }
        }
        res
    }

    fn dfs(grid: &mut Vec<Vec<i32>>, i: usize, j: usize, m: usize, n: usize) -> i32 {
        if i >= m || j >= n || grid[i][j] != 1 { return 0; }
        grid[i][j] = 0;
        let mut area = 1;
        area += Self::dfs(grid, i + 1, j, m, n);
        if i > 0 { area += Self::dfs(grid, i - 1, j, m, n); }
        area += Self::dfs(grid, i, j + 1, m, n);
        if j > 0 { area += Self::dfs(grid, i, j - 1, m, n); }
        area
    }
}
```
```rust []
// BFS. O(m*n) time, O(min(m,n)) space.
use std::collections::VecDeque;

impl Solution {
    pub fn max_area_of_island_bfs(grid: &mut Vec<Vec<i32>>) -> i32 {
        let (m, n) = (grid.len(), grid[0].len());
        let mut res = 0;
        let mut q = VecDeque::new();
        for i in 0..m {
            for j in 0..n {
                if grid[i][j] == 1 {
                    let mut area = 0;
                    grid[i][j] = 0;
                    q.push_back((i, j));
                    while let Some((x, y)) = q.pop_front() {
                        area += 1;
                        for (dx, dy) in [(0, 1), (1, 0), (0, usize::MAX), (usize::MAX, 0)] {
                            let (nx, ny) = (x.wrapping_add(dx), y.wrapping_add(dy));
                            if nx < m && ny < n && grid[nx][ny] == 1 {
                                grid[nx][ny] = 0;
                                q.push_back((nx, ny));
                            }
                        }
                    }
                    res = res.max(area);
                }
            }
        }
        res
    }
}
```
