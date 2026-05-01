---
author: JZ
pubDatetime: 2026-04-10T06:00:00Z
modDatetime: 2026-04-10T06:00:00Z
title: LeetCode 200 Number of Islands
featured: false
tags:
  - a-dfs
  - a-bfs
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 200, medium, tags: array, depth-first search, breadth-first search, union find, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 200](https://leetcode.com/problems/number-of-islands/description/)

Given an `m x n` 2D binary grid `grid` which represents a map of `'1'`s (land) and `'0'`s (water), return _the number of islands_.

An **island** is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.

```
Example 1:

Input: grid = [
  ["1","1","1","1","0"],
  ["1","1","0","1","0"],
  ["1","1","0","0","0"],
  ["0","0","0","0","0"]
]
Output: 1

Example 2:

Input: grid = [
  ["1","1","0","0","0"],
  ["1","1","0","0","0"],
  ["0","0","1","0","0"],
  ["0","0","0","1","1"]
]
Output: 3
```

**Constraints:**

- `m == grid.length`
- `n == grid[i].length`
- `1 <= m, n <= 300`
- `grid[i][j]` is `'0'` or `'1'`.

## Idea1

We can solve this with **DFS (depth-first search)**. Scan every cell in the grid. When we find an unvisited `'1'`, increment the island count and launch a DFS to mark all connected land cells as `'0'` (visited). The DFS recurses in 4 directions (up, down, left, right).

```
grid:                after marking island 1:
1 1 0 0 0            0 0 0 0 0
1 1 0 0 0     DFS    0 0 0 0 0
0 0 1 0 0   ------>  0 0 1 0 0   (count = 1)
0 0 0 1 1            0 0 0 1 1

continue scan, find '1' at (2,2):
0 0 0 0 0            0 0 0 0 0
0 0 0 0 0     DFS    0 0 0 0 0
0 0 1 0 0   ------>  0 0 0 0 0   (count = 2)
0 0 0 1 1            0 0 0 1 1

continue scan, find '1' at (3,3):
0 0 0 0 0     DFS    0 0 0 0 0
0 0 0 0 0   ------>  0 0 0 0 0   (count = 3)
0 0 0 0 0            0 0 0 0 0
0 0 0 1 1            0 0 0 0 0
```

Each cell is visited at most once by the outer scan and at most once by DFS, so total work is $O(m \cdot n)$.

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$ worst case for the recursion stack (e.g., a grid that is entirely land and forms a single long snake).

### Java

```java []
private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

// lc 200, DFS flood-fill, O(m*n) time, O(m*n) space.
public static int numIslandsDFS(char[][] grid) {
    if (grid == null || grid.length == 0) return 0;
    char[][] g = deepCopy(grid);                    // avoid mutating caller's grid
    int m = g.length, n = g[0].length;
    int count = 0;
    for (int i = 0; i < m; i++) {                   // O(m * n) scan
        for (int j = 0; j < n; j++) {
            if (g[i][j] == '1') {
                count++;
                dfs(g, i, j, m, n);                 // mark entire island visited
            }
        }
    }
    return count;
}

private static void dfs(char[][] g, int r, int c, int m, int n) {
    if (r < 0 || r >= m || c < 0 || c >= n || g[r][c] != '1') return;
    g[r][c] = '0';                                  // mark visited
    for (int[] d : DIRS) {                           // explore 4 neighbors
        dfs(g, r + d[0], c + d[1], m, n);
    }
}

private static char[][] deepCopy(char[][] grid) {
    char[][] copy = new char[grid.length][];
    for (int i = 0; i < grid.length; i++) copy[i] = grid[i].clone();
    return copy;
}
```

```python []
# lc 200, DFS flood-fill, O(m*n) time, O(m*n) space.
class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        if not grid:
            return 0
        m, n = len(grid), len(grid[0])
        res = 0

        def dfs(r, c):
            if r < 0 or r >= m or c < 0 or c >= n or grid[r][c] != '1':
                return
            grid[r][c] = '0'  # mark visited
            dfs(r + 1, c)
            dfs(r - 1, c)
            dfs(r, c + 1)
            dfs(r, c - 1)

        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                if grid[i][j] == '1':
                    res += 1
                    dfs(i, j)  # O(m*n) total across all calls
        return res
```

```cpp []
// lc 200, DFS flood-fill, O(m*n) time, O(m*n) space.
int numIslandsDFS(vector<vector<char>> &grid) {
    int m = grid.size(), n = grid[0].size(), count = 0;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (grid[i][j] == '1') {
                dfs(grid, i, j, m, n);
                count++;
            }
    return count;
}

void dfs(vector<vector<char>> &grid, int i, int j, int m, int n) {
    if (i < 0 || i >= m || j < 0 || j >= n || grid[i][j] != '1') return;
    grid[i][j] = '0';
    dfs(grid, i + 1, j, m, n);
    dfs(grid, i - 1, j, m, n);
    dfs(grid, i, j + 1, m, n);
    dfs(grid, i, j - 1, m, n);
}
```

```rust []
// lc 200, DFS flood-fill, O(m*n) time, O(m*n) space.
impl Solution {
    pub fn num_islands(grid: &mut Vec<Vec<char>>) -> i32 {
        let (m, n) = (grid.len(), grid[0].len());
        let mut count = 0;
        for i in 0..m {
            for j in 0..n {
                if grid[i][j] == '1' {
                    count += 1;
                    Self::dfs(grid, i, j, m, n);
                }
            }
        }
        count
    }

    fn dfs(grid: &mut Vec<Vec<char>>, i: usize, j: usize, m: usize, n: usize) {
        if i >= m || j >= n || grid[i][j] != '1' { return; }
        grid[i][j] = '0';
        Self::dfs(grid, i + 1, j, m, n);
        if i > 0 { Self::dfs(grid, i - 1, j, m, n); }
        Self::dfs(grid, i, j + 1, m, n);
        if j > 0 { Self::dfs(grid, i, j - 1, m, n); }
    }
}
```

## Idea2

We can also use **BFS (breadth-first search)** with a queue. When we find a `'1'`, enqueue it, mark it as `'0'`, and process the queue — for each cell, enqueue unvisited `'1'` neighbors. This explores the island layer by layer.

BFS avoids deep recursion, and the queue holds at most one "frontier layer" which is bounded by $\min(m, n)$.

Complexity: Time $O(m \cdot n)$, Space $O(\min(m, n))$ for the queue.

### Java

```java []
// lc 200, BFS flood-fill, O(m*n) time, O(min(m,n)) space.
public static int numIslandsBFS(char[][] grid) {
    if (grid == null || grid.length == 0) return 0;
    char[][] g = deepCopy(grid);
    int m = g.length, n = g[0].length;
    int count = 0;
    for (int i = 0; i < m; i++) {
        for (int j = 0; j < n; j++) {
            if (g[i][j] == '1') {
                count++;
                bfs(g, i, j, m, n);
            }
        }
    }
    return count;
}

private static void bfs(char[][] g, int r, int c, int m, int n) {
    Queue<int[]> queue = new LinkedList<>();
    queue.offer(new int[]{r, c});
    g[r][c] = '0';                                  // mark visited immediately
    while (!queue.isEmpty()) {
        int[] cell = queue.poll();
        for (int[] d : DIRS) {
            int nr = cell[0] + d[0], nc = cell[1] + d[1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && g[nr][nc] == '1') {
                g[nr][nc] = '0';                     // mark before enqueue
                queue.offer(new int[]{nr, nc});      // O(min(m, n)) queue size
            }
        }
    }
}
```

```python []
# lc 200, BFS flood-fill, O(m*n) time, O(min(m,n)) space.
class Solution2:
    def numIslands(self, grid: list[list[str]]) -> int:
        if not grid:
            return 0
        m, n = len(grid), len(grid[0])
        res = 0
        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                if grid[i][j] == '1':
                    res += 1
                    grid[i][j] = '0'
                    q = deque([(i, j)])
                    while q:  # O(m*n) total across all calls
                        r, c = q.popleft()
                        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < m and 0 <= nc < n and grid[nr][nc] == '1':
                                grid[nr][nc] = '0'
                                q.append((nr, nc))
        return res
```

```cpp []
// lc 200, BFS flood-fill, O(m*n) time, O(min(m,n)) space.
int numIslandsBFS(vector<vector<char>> &grid) {
    int m = grid.size(), n = grid[0].size(), count = 0;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (grid[i][j] == '1') {
                bfs(grid, i, j, m, n);
                count++;
            }
    return count;
}

void bfs(vector<vector<char>> &grid, int i, int j, int m, int n) {
    queue<pair<int, int>> q;
    grid[i][j] = '0';
    q.push({i, j});
    int dirs[] = {0, 1, 0, -1, 0};
    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dirs[d], nc = c + dirs[d + 1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && grid[nr][nc] == '1') {
                grid[nr][nc] = '0';
                q.push({nr, nc});
            }
        }
    }
}
```

```rust []
// lc 200, BFS flood-fill, O(m*n) time, O(min(m,n)) space.
pub fn num_islands_bfs(grid: &mut Vec<Vec<char>>) -> i32 {
    let (m, n) = (grid.len(), grid[0].len());
    let mut count = 0;
    let mut q = VecDeque::new();
    for i in 0..m {
        for j in 0..n {
            if grid[i][j] == '1' {
                count += 1;
                grid[i][j] = '0';
                q.push_back((i, j));
                while let Some((x, y)) = q.pop_front() {
                    for (dx, dy) in [(0, 1), (1, 0), (0, usize::MAX), (usize::MAX, 0)] {
                        let (nx, ny) = (x.wrapping_add(dx), y.wrapping_add(dy));
                        if nx < m && ny < n && grid[nx][ny] == '1' {
                            grid[nx][ny] = '0';
                            q.push_back((nx, ny));
                        }
                    }
                }
            }
        }
    }
    count
}
```
