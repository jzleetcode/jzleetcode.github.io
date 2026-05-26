---
author: JZ
pubDatetime: 2026-05-20T06:00:00Z
modDatetime: 2026-05-20T06:00:00Z
title: LeetCode 994 Rotting Oranges
featured: false
tags:
  - a-bfs
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 994, medium, tags: array, breadth-first search, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 994](https://leetcode.com/problems/rotting-oranges/description/)

You are given an `m x n` grid where each cell can have one of three values:

- `0` representing an empty cell,
- `1` representing a fresh orange, or
- `2` representing a rotten orange.

Every minute, any fresh orange that is **4-directionally adjacent** to a rotten orange becomes rotten.

Return _the minimum number of minutes that must elapse until no cell has a fresh orange_. If this is impossible, return `-1`.

```
Example 1:

Input: grid = [[2,1,1],[1,1,0],[0,1,1]]
Output: 4

Example 2:

Input: grid = [[2,1,1],[0,1,1],[1,0,1]]
Output: -1
Explanation: The orange in the bottom left corner (row 2, column 0) is never
reached because rotting only spreads 4-directionally.

Example 3:

Input: grid = [[0,2]]
Output: 0
Explanation: Since there are already no fresh oranges at minute 0, the answer is 0.
```

**Constraints:**

- `m == grid.length`
- `n == grid[i].length`
- `1 <= m, n <= 10`
- `grid[i][j]` is `0`, `1`, or `2`.

## Idea

This is a classic **multi-source BFS** problem. All rotten oranges spread simultaneously, so we enqueue all initially rotten cells and expand layer by layer. Each BFS layer represents one minute.

```
minute 0:        minute 1:        minute 2:        minute 3:        minute 4:
2  1  1          2  2  1          2  2  2          2  2  2          2  2  2
1  1  0          2  1  0          2  2  0          2  2  0          2  2  0
0  1  1          0  1  1          0  2  1          0  2  2          0  2  2
                 ^rotten spreads   ^next layer      ^next layer      ^done!
```

Algorithm:
1. Scan the grid: enqueue all rotten cells, count fresh oranges.
2. BFS level by level. For each level, process all cells in the queue. For each cell, rot adjacent fresh oranges (decrement `fresh`, mark as `2`, enqueue).
3. After each non-empty level, increment the time counter.
4. If `fresh == 0`, return time. Otherwise return `-1`.

Complexity: Time $O(m \cdot n)$ — each cell is visited at most once. Space $O(m \cdot n)$ — in the worst case all cells are rotten and in the queue.

### Java

```java []
private static final int[][] DIRS = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

// lc 994, multi-source BFS, O(m*n) time, O(m*n) space.
public static int orangesRotting(int[][] grid) {
    int m = grid.length, n = grid[0].length, fresh = 0, res = 0;
    Queue<int[]> q = new LinkedList<>();
    for (int i = 0; i < m; i++)              // O(m*n) scan
        for (int j = 0; j < n; j++) {
            if (grid[i][j] == 2) q.offer(new int[]{i, j});
            else if (grid[i][j] == 1) fresh++;
        }
    while (!q.isEmpty() && fresh > 0) {      // BFS layer by layer
        res++;
        for (int size = q.size(); size > 0; size--) {  // process one layer
            int[] cell = q.poll();
            for (int[] d : DIRS) {
                int nx = cell[0] + d[0], ny = cell[1] + d[1];
                if (nx < 0 || nx >= m || ny < 0 || ny >= n) continue;
                if (grid[nx][ny] != 1) continue;
                fresh--;
                grid[nx][ny] = 2;            // mark rotten (serves as visited)
                q.offer(new int[]{nx, ny});
            }
        }
    }
    return fresh == 0 ? res : -1;
}
```

```python []
# lc 994, multi-source BFS, O(m*n) time, O(m*n) space.
class Solution:
    def orangesRotting(self, grid: list[list[int]]) -> int:
        (m, n), fresh, q, res = map(len, (grid, grid[0])), 0, deque(), 0
        for r in range(m):                   # O(m*n) scan
            for c in range(n):
                if grid[r][c] == 2:
                    q.append((r, c))
                elif grid[r][c] == 1:
                    fresh += 1
        while q and fresh > 0:               # BFS layer by layer
            res += 1
            for _ in range(len(q)):          # process one layer
                x, y = q.popleft()
                for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    nx, ny = x + dx, y + dy
                    if nx < 0 or nx == m or ny < 0 or ny == n: continue
                    if grid[nx][ny] == 0 or grid[nx][ny] == 2: continue
                    fresh -= 1
                    grid[nx][ny] = 2         # mark rotten (serves as visited)
                    q.append((nx, ny))
        return res if fresh == 0 else -1
```

```cpp []
// lc 994, multi-source BFS, O(m*n) time, O(m*n) space.
int orangesRotting(vector<vector<int>> &grid) {
    int m = grid.size(), n = grid[0].size(), fresh = 0, res = 0;
    queue<pair<int, int>> q;
    for (int i = 0; i < m; i++)              // O(m*n) scan
        for (int j = 0; j < n; j++) {
            if (grid[i][j] == 2) q.push({i, j});
            else if (grid[i][j] == 1) fresh++;
        }
    int dirs[][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
    while (!q.empty() && fresh > 0) {        // BFS layer by layer
        res++;
        for (int sz = q.size(); sz > 0; sz--) {  // process one layer
            auto [x, y] = q.front(); q.pop();
            for (auto &d : dirs) {
                int nx = x + d[0], ny = y + d[1];
                if (nx < 0 || nx >= m || ny < 0 || ny >= n) continue;
                if (grid[nx][ny] != 1) continue;
                fresh--;
                grid[nx][ny] = 2;            // mark rotten (serves as visited)
                q.push({nx, ny});
            }
        }
    }
    return fresh == 0 ? res : -1;
}
```

```rust []
// lc 994, multi-source BFS, O(m*n) time, O(m*n) space.
impl Solution {
    pub fn oranges_rotting(mut grid: Vec<Vec<i32>>) -> i32 {
        let (m, n, mut res, mut fresh, mut q) =
            (grid.len(), grid[0].len(), 0, 0, VecDeque::new());
        for i in 0..m {                      // O(m*n) scan
            for j in 0..n {
                match grid[i][j] {
                    2 => q.push_back((i, j)),
                    1 => fresh += 1,
                    _ => {}
                }
            }
        }
        while !q.is_empty() && fresh > 0 {   // BFS layer by layer
            for _ in 0..q.len() {            // process one layer
                let (x, y) = q.pop_front().expect("not empty");
                for (dx, dy) in vec![(0, usize::MAX), (usize::MAX, 0), (0, 1), (1, 0)] {
                    let (nx, ny) = (x + dx, y + dy);  // wrapping add for -1
                    if nx > m - 1 || ny > n - 1 || grid[nx][ny] == 2 || grid[nx][ny] == 0 {
                        continue;
                    }
                    fresh -= 1;
                    grid[nx][ny] = 2;        // mark rotten (serves as visited)
                    q.push_back((nx, ny));
                }
            }
            res += 1;
        }
        if fresh == 0 { res } else { -1 }
    }
}
```
