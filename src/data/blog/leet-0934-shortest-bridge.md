---
author: JZ
pubDatetime: 2026-08-11T06:00:00Z
modDatetime: 2026-08-11T06:00:00Z
title: LeetCode 934 Shortest Bridge
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 934, medium, tags: array, depth-first search, breadth-first search, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 934](https://leetcode.com/problems/shortest-bridge/description/)

You are given an `n x n` binary matrix `grid` where `1` represents land and `0` represents water.

An **island** is a 4-directionally connected group of `1`'s not connected to any other `1`'s. There are **exactly two islands** in `grid`.

You may change `0`'s to `1`'s to connect the two islands to form **one island**.

Return _the smallest number of_ `0`_'s you must flip to connect the two islands_.

```
Example 1:

Input: grid = [[0,1],[1,0]]
Output: 1

Example 2:

Input: grid = [[0,1,0],[0,0,0],[0,0,1]]
Output: 2

Example 3:

Input: grid = [[1,1,1,1,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]]
Output: 1
```

**Constraints:**

- `n == grid.length == grid[i].length`
- `2 <= n <= 100`
- `grid[i][j]` is either `0` or `1`.
- There are exactly two islands in `grid`.

## Idea

The key insight is to treat this as a **shortest path** problem from one island to the other. We use a two-phase approach:

1. **DFS** — Find and mark all cells of the first island (change `1` → `2`), adding each cell to a queue.
2. **Multi-source BFS** — Expand from all cells of the first island simultaneously, layer by layer, until we reach a cell belonging to the second island (still `1`). The number of BFS layers equals the answer.

```
Step 1 (DFS marks first island as 2):

0  1  0         0  2  0
0  0  0    →    0  0  0
0  0  1         0  0  1

Step 2 (BFS expands from island 2, layer by layer):

layer 0:   layer 1:   layer 2 (hit!):
0  2  0    2  2  2    2  2  2
0  0  0    0  2  0    2  2  2
0  0  1    0  0  1    0  2 [1] ← found! return 2
```

Why BFS guarantees the shortest path: BFS explores all cells at distance `d` before any cell at distance `d+1`. The first time we encounter the second island is at the minimum distance.

Complexity: Time $O(n^2)$ — each cell is visited at most once by DFS and once by BFS. Space $O(n^2)$ — queue can hold all cells in the worst case.

### Java

```java []
package graph;

import java.util.LinkedList;
import java.util.Queue;

// lc 934, DFS + multi-source BFS, O(n^2) time, O(n^2) space.
private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

public int shortestBridge(int[][] grid) {
    int n = grid.length;
    Queue<int[]> queue = new LinkedList<>();
    boolean found = false;
    for (int i = 0; i < n && !found; i++)           // find first island cell
        for (int j = 0; j < n && !found; j++)
            if (grid[i][j] == 1) {
                dfs(grid, i, j, queue);             // DFS marks island as 2
                found = true;
            }
    int steps = 0;
    while (!queue.isEmpty()) {                       // BFS layer by layer
        int size = queue.size();
        for (int i = 0; i < size; i++) {            // process one layer, O(n^2) total
            int[] cell = queue.poll();
            for (int[] d : DIRS) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nr >= n || nc < 0 || nc >= n || grid[nr][nc] == 2) continue;
                if (grid[nr][nc] == 1) return steps;
                grid[nr][nc] = 2;
                queue.offer(new int[]{nr, nc});
            }
        }
        steps++;
    }
    return -1;
}

private void dfs(int[][] grid, int r, int c, Queue<int[]> queue) {
    int n = grid.length;
    if (r < 0 || r >= n || c < 0 || c >= n || grid[r][c] != 1) return;
    grid[r][c] = 2;
    queue.offer(new int[]{r, c});
    for (int[] d : DIRS) dfs(grid, r + d[0], c + d[1], queue);
}
```

```python []
# lc 934, DFS + multi-source BFS, O(n^2) time, O(n^2) space.
class Solution:
    def shortestBridge(self, grid: list[list[int]]) -> int:
        n = len(grid)
        dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        queue = deque()

        def dfs(r, c):
            grid[r][c] = 2                           # mark visited
            queue.append((r, c))
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 1:
                    dfs(nr, nc)

        found = False
        for i in range(n):                           # find first island
            if found: break
            for j in range(n):
                if grid[i][j] == 1:
                    dfs(i, j)                        # DFS marks island as 2
                    found = True
                    break

        steps = 0
        while queue:                                 # BFS layer by layer
            for _ in range(len(queue)):              # O(n^2) total across all layers
                r, c = queue.popleft()
                for dr, dc in dirs:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < n and 0 <= nc < n:
                        if grid[nr][nc] == 1: return steps
                        if grid[nr][nc] == 0:
                            grid[nr][nc] = 2
                            queue.append((nr, nc))
            steps += 1
        return -1
```

```cpp []
// lc 934, DFS + multi-source BFS, O(n^2) time, O(n^2) space.
int shortestBridge(vector<vector<int>>& grid) {
    int n = grid.size();
    queue<pair<int,int>> q;
    bool found = false;
    for (int i = 0; i < n && !found; i++)           // find first island cell
        for (int j = 0; j < n && !found; j++)
            if (grid[i][j] == 1) { dfs(grid, i, j, n, q); found = true; }
    int dirs[] = {0,1,0,-1,0};
    int steps = 0;
    while (!q.empty()) {                             // BFS layer by layer
        int sz = q.size();
        while (sz--) {                               // process one layer
            auto [x, y] = q.front(); q.pop();
            for (int d = 0; d < 4; d++) {
                int nx = x + dirs[d], ny = y + dirs[d+1];
                if (nx < 0 || nx >= n || ny < 0 || ny >= n || grid[nx][ny] == 2) continue;
                if (grid[nx][ny] == 1) return steps;
                grid[nx][ny] = 2;
                q.push({nx, ny});
            }
        }
        steps++;
    }
    return -1;
}

void dfs(vector<vector<int>>& grid, int i, int j, int n, queue<pair<int,int>>& q) {
    if (i < 0 || i >= n || j < 0 || j >= n || grid[i][j] != 1) return;
    grid[i][j] = 2;
    q.push({i, j});
    dfs(grid, i+1, j, n, q); dfs(grid, i-1, j, n, q);
    dfs(grid, i, j+1, n, q); dfs(grid, i, j-1, n, q);
}
```

```rust []
// lc 934, DFS + multi-source BFS, O(n^2) time, O(n^2) space.
impl Solution {
    pub fn shortest_bridge(grid: &mut Vec<Vec<i32>>) -> i32 {
        let n = grid.len();
        let mut queue = VecDeque::new();
        'outer: for i in 0..n {                      // find first island cell
            for j in 0..n {
                if grid[i][j] == 1 {
                    Self::dfs(grid, i as i32, j as i32, n, &mut queue);
                    break 'outer;
                }
            }
        }
        let dirs = [(0i32, 1i32), (0, -1), (1, 0), (-1, 0)];
        let mut steps = 0;
        while !queue.is_empty() {                    // BFS layer by layer
            let size = queue.len();
            for _ in 0..size {                       // process one layer
                let (x, y) = queue.pop_front().unwrap();
                for (dx, dy) in &dirs {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx >= 0 && nx < n as i32 && ny >= 0 && ny < n as i32 {
                        let (ni, nj) = (nx as usize, ny as usize);
                        if grid[ni][nj] == 1 { return steps; }
                        if grid[ni][nj] == 0 {
                            grid[ni][nj] = 2;
                            queue.push_back((nx, ny));
                        }
                    }
                }
            }
            steps += 1;
        }
        steps
    }

    fn dfs(grid: &mut Vec<Vec<i32>>, x: i32, y: i32, n: usize, queue: &mut VecDeque<(i32, i32)>) {
        if x < 0 || x >= n as i32 || y < 0 || y >= n as i32 { return; }
        let (i, j) = (x as usize, y as usize);
        if grid[i][j] != 1 { return; }
        grid[i][j] = 2;
        queue.push_back((x, y));
        Self::dfs(grid, x+1, y, n, queue); Self::dfs(grid, x-1, y, n, queue);
        Self::dfs(grid, x, y+1, n, queue); Self::dfs(grid, x, y-1, n, queue);
    }
}
```
