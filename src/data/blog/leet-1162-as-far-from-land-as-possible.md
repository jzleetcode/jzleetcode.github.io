---
author: JZ
pubDatetime: 2026-08-15T06:00:00Z
modDatetime: 2026-08-15T06:00:00Z
title: LeetCode 1162 As Far from Land as Possible
featured: true
tags:
  - a-bfs
  - a-dp
  - a-graph
description:
  "Solutions for LeetCode 1162, medium, tags: array, dynamic programming, breadth-first search, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 1162](https://leetcode.com/problems/as-far-from-land-as-possible/description/)

Given an `n x n` `grid` containing only values `0` and `1`, where `0` represents water and `1` represents land, find a water cell such that its distance to the nearest land cell is maximized, and return the distance. If no land or water exists in the grid, return `-1`.

The distance used in this problem is the Manhattan distance: the distance between two cells `(x0, y0)` and `(x1, y1)` is `|x0 - x1| + |y0 - y1|`.

```
Example 1:

Input: grid = [[1,0,1],[0,0,0],[1,0,1]]
Output: 2
Explanation: The cell (1, 1) is as far as possible from all the land with distance 2.

Example 2:

Input: grid = [[1,0,0],[0,0,0],[0,0,0]]
Output: 4
Explanation: The cell (2, 2) is as far as possible from all the land with distance 4.
```

**Constraints:**

- `n == grid.length`
- `n == grid[i].length`
- `1 <= n <= 100`
- `grid[i][j]` is `0` or `1`

## Idea1: Multi-source BFS

Start BFS simultaneously from all land cells. The BFS expands level by level — each level corresponds to distance 1 farther from land. The last level reached is the answer.

```
Grid:           BFS levels:
1 0 1           0 1 0
0 0 0    -->    1 2 1       answer = 2
1 0 1           0 1 0
```

Why this works: multi-source BFS is equivalent to adding a virtual source node connected to all land cells with edge weight 0. The BFS then finds shortest distances from this virtual source, which equals the minimum distance to any land cell for each water cell.

Algorithm:
1. Enqueue all land cells (value 1). If no land or no water exists, return -1.
2. BFS outward, marking each unvisited water cell with the current distance.
3. Return the distance of the last level processed.

Complexity: Time $O(n^2)$ — each cell is enqueued and dequeued at most once. Space $O(n^2)$ for the BFS queue.

## Idea2: Dynamic Programming (Two Passes)

Observe that the Manhattan distance from any water cell to the nearest land can be computed by considering paths that go only down/right and only up/left separately.

Pass 1 (top-left → bottom-right): For each cell, compute the minimum distance considering only paths from the top and left neighbors.

Pass 2 (bottom-right → top-left): Refine each cell's distance considering the bottom and right neighbors. Track the maximum.

```
Pass 1 (top+left):    Pass 2 (bottom+right):
0 1 0                 0 1 0
1 2 1          -->    1 2 1    max = 2
2 3 2                 0 1 0
(for grid [[1,0,1],[0,0,0],[1,0,1]])
```

Complexity: Time $O(n^2)$ — two passes over the grid. Space $O(1)$ extra — modifies the grid in-place.

### Java

```java []
// Multi-source BFS, O(n^2) time, O(n^2) space.
private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

public int maxDistance(int[][] grid) {
    int n = grid.length;
    Queue<int[]> queue = new LinkedList<>();
    // O(n^2) enqueue all land cells
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            if (grid[i][j] == 1) queue.offer(new int[]{i, j});
    if (queue.isEmpty() || queue.size() == n * n) return -1; // all water or all land
    // BFS level by level, mark water cells with distance
    int dist = 0;
    while (!queue.isEmpty()) {
        int size = queue.size();
        dist++;
        for (int k = 0; k < size; k++) {
            int[] cell = queue.poll();
            for (int[] d : DIRS) {
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nr >= n || nc < 0 || nc >= n || grid[nr][nc] != 0) continue;
                grid[nr][nc] = dist; // mark visited with distance
                queue.offer(new int[]{nr, nc});
            }
        }
    }
    return dist - 1; // last completed level
}
```
```java []
// DP two passes, O(n^2) time, O(1) extra space.
public int maxDistance(int[][] grid) {
    int n = grid.length;
    int inf = n * 2; // max possible distance is 2*(n-1), use n*2 as infinity
    // O(n^2) first pass: top-left to bottom-right
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            if (grid[i][j] == 1) {
                grid[i][j] = 0; // land has distance 0
            } else {
                grid[i][j] = inf;
                if (i > 0) grid[i][j] = Math.min(grid[i][j], grid[i - 1][j] + 1);
                if (j > 0) grid[i][j] = Math.min(grid[i][j], grid[i][j - 1] + 1);
            }
        }
    }
    // O(n^2) second pass: bottom-right to top-left, track max distance
    int max = 0;
    for (int i = n - 1; i >= 0; i--) {
        for (int j = n - 1; j >= 0; j--) {
            if (i < n - 1) grid[i][j] = Math.min(grid[i][j], grid[i + 1][j] + 1);
            if (j < n - 1) grid[i][j] = Math.min(grid[i][j], grid[i][j + 1] + 1);
            max = Math.max(max, grid[i][j]);
        }
    }
    return (max == 0 || max >= inf) ? -1 : max; // 0 means all land, >= inf means all water
}
```

### Python

```python []
# Multi-source BFS. O(n^2) time, O(n^2) space.
def maxDistance(self, grid: list[list[int]]) -> int:
    n = len(grid)
    q = deque()
    for r in range(n):  # O(n^2) enqueue all land cells
        for c in range(n):
            if grid[r][c] == 1:
                q.append((r, c))
    if len(q) == 0 or len(q) == n * n:
        return -1
    dirs = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    dist = -1
    while q:  # O(n^2) each cell dequeued once
        dist += 1
        for _ in range(len(q)):
            r, c = q.popleft()
            for dr, dc in dirs:  # O(4) per cell
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0:
                    grid[nr][nc] = 1
                    q.append((nr, nc))
    return dist
```
```python []
# DP two passes. O(n^2) time, O(1) space (in-place).
def maxDistance(self, grid: list[list[int]]) -> int:
    n = len(grid)
    INF = 2 * n
    has_land = has_water = False
    # top-left to bottom-right
    for r in range(n):  # O(n)
        for c in range(n):  # O(n)
            if grid[r][c] == 1:
                has_land = True
                grid[r][c] = 0
            else:
                has_water = True
                top = grid[r - 1][c] if r > 0 else INF
                left = grid[r][c - 1] if c > 0 else INF
                grid[r][c] = min(top, left) + 1
    if not has_land or not has_water:
        return -1
    # bottom-right to top-left
    res = 0
    for r in range(n - 1, -1, -1):  # O(n)
        for c in range(n - 1, -1, -1):  # O(n)
            if grid[r][c] > 0:
                bottom = grid[r + 1][c] if r < n - 1 else INF
                right = grid[r][c + 1] if c < n - 1 else INF
                grid[r][c] = min(grid[r][c], bottom + 1, right + 1)
                res = max(res, grid[r][c])
    return res
```

### C++

```cpp []
// Multi-source BFS. O(n^2) time, O(n^2) space.
int maxDistance(vector<vector<int>>& grid) {
    int n = grid.size();
    queue<pair<int, int>> q;
    for (int i = 0; i < n; i++) {          // O(n^2) initialization
        for (int j = 0; j < n; j++) {
            if (grid[i][j] == 1)
                q.push({i, j});
            else
                grid[i][j] = -1;
        }
    }
    if (q.empty() || (int)q.size() == n * n) return -1;
    int dirs[4][2] = {{0,1},{0,-1},{1,0},{-1,0}};
    int dist = -1;
    while (!q.empty()) {                   // O(n^2) each cell visited once
        int sz = q.size();
        dist++;
        for (int k = 0; k < sz; k++) {
            auto [x, y] = q.front(); q.pop();
            for (auto& d : dirs) {
                int nx = x + d[0], ny = y + d[1];
                if (nx >= 0 && nx < n && ny >= 0 && ny < n && grid[nx][ny] == -1) {
                    grid[nx][ny] = dist + 1;
                    q.push({nx, ny});
                }
            }
        }
    }
    return dist;
}
```
```cpp []
// DP two passes. O(n^2) time, O(1) extra space (in-place).
int maxDistance(vector<vector<int>>& grid) {
    int n = grid.size();
    int INF = 2 * n;
    // First pass (top-left to bottom-right): O(n^2)
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            if (grid[i][j] == 1) {
                grid[i][j] = 0;
            } else {
                grid[i][j] = INF;
                if (i > 0) grid[i][j] = min(grid[i][j], grid[i-1][j] + 1);
                if (j > 0) grid[i][j] = min(grid[i][j], grid[i][j-1] + 1);
            }
        }
    }
    int ans = 0;
    // Second pass (bottom-right to top-left): O(n^2)
    for (int i = n - 1; i >= 0; i--) {
        for (int j = n - 1; j >= 0; j--) {
            if (i < n - 1) grid[i][j] = min(grid[i][j], grid[i+1][j] + 1);
            if (j < n - 1) grid[i][j] = min(grid[i][j], grid[i][j+1] + 1);
            ans = max(ans, grid[i][j]);
        }
    }
    return (ans == 0 || ans >= INF) ? -1 : ans;
}
```

### Rust

```rust []
/// Multi-source BFS. O(n^2) time, O(n^2) space.
pub fn max_distance_bfs(mut grid: Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    let mut queue = VecDeque::new();
    for i in 0..n {
        for j in 0..n {
            if grid[i][j] == 1 {
                queue.push_back((i, j));
            } else {
                grid[i][j] = -1;
            }
        }
    }
    if queue.is_empty() || queue.len() == n * n {
        return -1;
    }
    let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
    let mut dist = 0;
    while !queue.is_empty() {
        dist += 1;
        let level_size = queue.len();
        for _ in 0..level_size {
            let (x, y) = queue.pop_front().unwrap();
            for &(dx, dy) in &dirs {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx >= 0 && nx < n as i32 && ny >= 0 && ny < n as i32 {
                    let (nx, ny) = (nx as usize, ny as usize);
                    if grid[nx][ny] == -1 {
                        grid[nx][ny] = dist;
                        queue.push_back((nx, ny));
                    }
                }
            }
        }
    }
    dist - 1
}
```
```rust []
/// DP two passes. O(n^2) time, O(1) extra space (in-place).
pub fn max_distance(mut grid: Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    let inf = (2 * n) as i32;
    // First pass (top-left to bottom-right): land=0, water=min(top, left)+1.
    for i in 0..n {
        for j in 0..n {
            if grid[i][j] == 1 {
                grid[i][j] = 0;
            } else {
                grid[i][j] = inf;
                if i > 0 {
                    grid[i][j] = grid[i][j].min(grid[i - 1][j] + 1);
                }
                if j > 0 {
                    grid[i][j] = grid[i][j].min(grid[i][j - 1] + 1);
                }
            }
        }
    }
    // Second pass (bottom-right to top-left): min(cur, bottom+1, right+1), track max.
    let mut ans = 0;
    for i in (0..n).rev() {
        for j in (0..n).rev() {
            if i + 1 < n {
                grid[i][j] = grid[i][j].min(grid[i + 1][j] + 1);
            }
            if j + 1 < n {
                grid[i][j] = grid[i][j].min(grid[i][j + 1] + 1);
            }
            ans = ans.max(grid[i][j]);
        }
    }
    if ans == 0 || ans >= inf { -1 } else { ans }
}
```
