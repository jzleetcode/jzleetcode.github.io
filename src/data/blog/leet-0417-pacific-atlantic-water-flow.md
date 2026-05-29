---
author: JZ
pubDatetime: 2026-05-29T06:00:00Z
modDatetime: 2026-05-29T06:00:00Z
title: LeetCode 417 Pacific Atlantic Water Flow
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 417, medium, tags: array, depth-first search, breadth-first search, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 417](https://leetcode.com/problems/pacific-atlantic-water-flow/description/)

There is an `m x n` rectangular island that borders both the Pacific Ocean and Atlantic Ocean. The Pacific Ocean touches the island's left and top edges, and the Atlantic Ocean touches the island's right and bottom edges.

The island is partitioned into a grid of square cells. You are given an `m x n` integer matrix `heights` where `heights[r][c]` represents the height above sea level of the cell at coordinate `(r, c)`.

The island receives a lot of rain, and the rain water can flow to neighboring cells directly north, south, east, and west if the neighboring cell's height is **less than or equal to** the current cell's height. Water can flow from any cell adjacent to an ocean into the ocean.

Return a 2D list of grid coordinates `result` where `result[i] = [ri, ci]` denotes that rain water can flow from cell `(ri, ci)` to **both** the Pacific and Atlantic oceans.

```
Example 1:

Input: heights = [[1,2,2,3,5],[3,2,3,4,4],[2,4,5,3,1],[6,7,1,4,5],[5,1,1,2,4]]
Output: [[0,4],[1,3],[1,4],[2,2],[3,0],[3,1],[4,0]]

Example 2:

Input: heights = [[1]]
Output: [[0,0]]
```

**Constraints:**

- `m == heights.length`
- `n == heights[r].length`
- `1 <= m, n <= 200`
- `0 <= heights[r][c] <= 10^5`

## Idea1

Instead of checking whether each cell can reach both oceans (expensive forward search), we **reverse the flow** — start from each ocean's border and traverse inward to cells with height ≥ current (water could flow downhill from them to the border). Run DFS from:
- Pacific borders (top row + left column)
- Atlantic borders (bottom row + right column)

The answer is the intersection of cells reachable from both oceans.

```
Pacific Ocean
 ~  ~  ~  ~  ~  ~
~ [1  2  2  3  5] ~
~ [3  2  3  4  4]  A
~ [2  4  5  3  1]  t
~ [6  7  1  4  5]  l
~ [5  1  1  2  4]  a
   ~  ~  ~  ~  ~   n
  Atlantic Ocean    t
                    i
                    c

Pacific-reachable:       Atlantic-reachable:
 1  1  1  1  1            0  0  0  0  1
 1  1  1  1  1            0  0  0  1  1
 0  1  1  0  0            0  0  1  0  1
 1  1  0  0  0            1  1  0  1  1
 1  0  0  0  0            1  1  1  1  1

Intersection (both):
 0  0  0  0  1   -> (0,4)
 0  0  0  1  1   -> (1,3), (1,4)
 0  0  1  0  0   -> (2,2)
 1  1  0  0  0   -> (3,0), (3,1)
 1  0  0  0  0   -> (4,0)
```

Each cell is visited at most twice (once per ocean). The DFS explores V + E where V = m·n and E = 4·m·n.

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$ for the visited matrices and recursion stack.

### Java

```java []
private static final int[][] dirs = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

// lc 417, DFS from ocean borders, O(m*n) time, O(m*n) space.
public List<List<Integer>> pacificAtlanticDFS(int[][] heights) {
    int m = heights.length, n = heights[0].length;
    boolean[][] visitedP = new boolean[m][n];
    boolean[][] visitedA = new boolean[m][n];
    List<List<Integer>> res = new ArrayList<>();
    for (int i = 0; i < m; i++) {
        dfs(heights, visitedP, i, 0, 0, m, n);       // left edge: pacific
        dfs(heights, visitedA, i, n - 1, 0, m, n);   // right edge: atlantic
    }
    for (int j = 0; j < n; j++) {
        dfs(heights, visitedP, 0, j, 0, m, n);       // top edge: pacific
        dfs(heights, visitedA, m - 1, j, 0, m, n);   // bottom edge: atlantic
    }
    for (int i = 0; i < m; i++)                       // O(m*n) collect intersection
        for (int j = 0; j < n; j++)
            if (visitedP[i][j] && visitedA[i][j])
                res.add(Arrays.asList(i, j));
    return res;
}

private void dfs(int[][] heights, boolean[][] visited, int r, int c, int prevHeight, int m, int n) {
    if (r < 0 || r >= m || c < 0 || c >= n) return;
    if (visited[r][c] || heights[r][c] < prevHeight) return;  // < not <=
    visited[r][c] = true;
    for (int[] d : dirs)
        dfs(heights, visited, r + d[0], c + d[1], heights[r][c], m, n);
}
```

```python []
# lc 417, DFS from ocean borders, O(m*n) time, O(m*n) space.
class Solution:
    def pacificAtlantic(self, heights: list[list[int]]) -> list[list[int]]:
        if not heights:
            return []
        m, n = len(heights), len(heights[0])
        pacific, atlantic = set(), set()

        def dfs(r, c, visited, prev_height):
            if (r, c) in visited or r < 0 or r >= m or c < 0 or c >= n:
                return
            if heights[r][c] < prev_height:
                return
            visited.add((r, c))
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                dfs(r + dr, c + dc, visited, heights[r][c])

        for i in range(m):  # O(m)
            dfs(i, 0, pacific, 0)       # left edge -> pacific
            dfs(i, n - 1, atlantic, 0)  # right edge -> atlantic
        for j in range(n):  # O(n)
            dfs(0, j, pacific, 0)       # top edge -> pacific
            dfs(m - 1, j, atlantic, 0)  # bottom edge -> atlantic

        return [[r, c] for r, c in pacific & atlantic]
```

```cpp []
// lc 417, DFS from ocean borders, O(m*n) time, O(m*n) space.
vector<vector<int>> pacificAtlanticDFS(vector<vector<int>> &heights) {
    int m = heights.size(), n = heights[0].size();
    vector<vector<bool>> pacific(m, vector<bool>(n, false));
    vector<vector<bool>> atlantic(m, vector<bool>(n, false));
    for (int i = 0; i < m; i++) {
        dfs(heights, pacific, i, 0, m, n);
        dfs(heights, atlantic, i, n - 1, m, n);
    }
    for (int j = 0; j < n; j++) {
        dfs(heights, pacific, 0, j, m, n);
        dfs(heights, atlantic, m - 1, j, m, n);
    }
    vector<vector<int>> result;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (pacific[i][j] && atlantic[i][j])
                result.push_back({i, j});
    return result;
}

void dfs(vector<vector<int>> &heights, vector<vector<bool>> &visited, int i, int j, int m, int n) {
    if (visited[i][j]) return;
    visited[i][j] = true;
    int dirs[] = {0, 1, 0, -1, 0};
    for (int d = 0; d < 4; d++) {
        int ni = i + dirs[d], nj = j + dirs[d + 1];
        if (ni >= 0 && ni < m && nj >= 0 && nj < n && !visited[ni][nj] &&
            heights[ni][nj] >= heights[i][j])
            dfs(heights, visited, ni, nj, m, n);
    }
}
```

```rust []
// lc 417, DFS from ocean borders, O(m*n) time, O(m*n) space.
pub fn pacific_atlantic(heights: &Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    let m = heights.len();
    if m == 0 { return vec![]; }
    let n = heights[0].len();
    let mut pacific = vec![vec![false; n]; m];
    let mut atlantic = vec![vec![false; n]; m];

    for i in 0..m {
        Self::dfs(heights, &mut pacific, i, 0, m, n);
        Self::dfs(heights, &mut atlantic, i, n - 1, m, n);
    }
    for j in 0..n {
        Self::dfs(heights, &mut pacific, 0, j, m, n);
        Self::dfs(heights, &mut atlantic, m - 1, j, m, n);
    }

    let mut result = Vec::new();
    for i in 0..m {
        for j in 0..n {
            if pacific[i][j] && atlantic[i][j] {
                result.push(vec![i as i32, j as i32]);
            }
        }
    }
    result
}

fn dfs(heights: &[Vec<i32>], visited: &mut Vec<Vec<bool>>, i: usize, j: usize, m: usize, n: usize) {
    if visited[i][j] { return; }
    visited[i][j] = true;
    for (dx, dy) in [(0i32, 1i32), (1, 0), (0, -1), (-1, 0)] {
        let (ni, nj) = (i as i32 + dx, j as i32 + dy);
        if ni >= 0 && ni < m as i32 && nj >= 0 && nj < n as i32 {
            let (ni, nj) = (ni as usize, nj as usize);
            if heights[ni][nj] >= heights[i][j] {
                Self::dfs(heights, visited, ni, nj, m, n);
            }
        }
    }
}
```

## Idea2

We can replace DFS with **multi-source BFS**. Seed two queues with all border cells for each ocean, then expand layer by layer into cells with height ≥ current. This avoids deep recursion and is iterative.

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$ for the visited matrices and queues.

### Java

```java []
// lc 417, BFS from ocean borders, O(m*n) time, O(m*n) space.
public List<List<Integer>> pacificAtlanticBFS(int[][] heights) {
    int m = heights.length, n = heights[0].length;
    boolean[][] visitedP = new boolean[m][n];
    boolean[][] visitedA = new boolean[m][n];
    Queue<int[]> pq = new ArrayDeque<>(), aq = new ArrayDeque<>();
    for (int i = 0; i < m; i++) {
        visitedP[i][0] = true; pq.offer(new int[]{i, 0});
        visitedA[i][n - 1] = true; aq.offer(new int[]{i, n - 1});
    }
    for (int j = 0; j < n; j++) {
        visitedP[0][j] = true; pq.offer(new int[]{0, j});
        visitedA[m - 1][j] = true; aq.offer(new int[]{m - 1, j});
    }
    bfs(heights, visitedP, pq, m, n);
    bfs(heights, visitedA, aq, m, n);
    List<List<Integer>> res = new ArrayList<>();
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (visitedP[i][j] && visitedA[i][j])
                res.add(Arrays.asList(i, j));
    return res;
}

private void bfs(int[][] heights, boolean[][] visited, Queue<int[]> q, int m, int n) {
    while (!q.isEmpty()) {
        int[] cell = q.poll();
        for (int[] d : dirs) {
            int nr = cell[0] + d[0], nc = cell[1] + d[1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n &&
                !visited[nr][nc] && heights[nr][nc] >= heights[cell[0]][cell[1]]) {
                visited[nr][nc] = true;                  // mark before enqueue
                q.offer(new int[]{nr, nc});
            }
        }
    }
}
```

```python []
# lc 417, BFS from ocean borders, O(m*n) time, O(m*n) space.
from collections import deque

class Solution2:
    def pacificAtlantic(self, heights: list[list[int]]) -> list[list[int]]:
        if not heights:
            return []
        m, n = len(heights), len(heights[0])

        def bfs(starts):
            visited = set(starts)
            q = deque(starts)
            while q:  # O(m*n) total
                r, c = q.popleft()
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < m and 0 <= nc < n and (nr, nc) not in visited:
                        if heights[nr][nc] >= heights[r][c]:
                            visited.add((nr, nc))
                            q.append((nr, nc))
            return visited

        pacific_starts = [(i, 0) for i in range(m)] + [(0, j) for j in range(n)]
        atlantic_starts = [(i, n - 1) for i in range(m)] + [(m - 1, j) for j in range(n)]
        return [[r, c] for r, c in bfs(pacific_starts) & bfs(atlantic_starts)]
```

```cpp []
// lc 417, BFS from ocean borders, O(m*n) time, O(m*n) space.
vector<vector<int>> pacificAtlanticBFS(vector<vector<int>> &heights) {
    int m = heights.size(), n = heights[0].size();
    vector<vector<bool>> pacific(m, vector<bool>(n, false));
    vector<vector<bool>> atlantic(m, vector<bool>(n, false));
    queue<pair<int, int>> pq, aq;
    for (int i = 0; i < m; i++) {
        pq.push({i, 0}); pacific[i][0] = true;
        aq.push({i, n - 1}); atlantic[i][n - 1] = true;
    }
    for (int j = 0; j < n; j++) {
        pq.push({0, j}); pacific[0][j] = true;
        aq.push({m - 1, j}); atlantic[m - 1][j] = true;
    }
    bfs(heights, pacific, pq, m, n);
    bfs(heights, atlantic, aq, m, n);
    vector<vector<int>> result;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (pacific[i][j] && atlantic[i][j])
                result.push_back({i, j});
    return result;
}

void bfs(vector<vector<int>> &heights, vector<vector<bool>> &visited,
         queue<pair<int, int>> &q, int m, int n) {
    int dirs[] = {0, 1, 0, -1, 0};
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dirs[d], nc = c + dirs[d + 1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && !visited[nr][nc] &&
                heights[nr][nc] >= heights[r][c]) {
                visited[nr][nc] = true;
                q.push({nr, nc});
            }
        }
    }
}
```

```rust []
// lc 417, BFS from ocean borders, O(m*n) time, O(m*n) space.
use std::collections::VecDeque;

pub fn pacific_atlantic_bfs(heights: &Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    let m = heights.len();
    if m == 0 { return vec![]; }
    let n = heights[0].len();
    let mut pacific = vec![vec![false; n]; m];
    let mut atlantic = vec![vec![false; n]; m];
    let mut pq = VecDeque::new();
    let mut aq = VecDeque::new();

    for i in 0..m {
        pacific[i][0] = true; pq.push_back((i, 0));
        atlantic[i][n - 1] = true; aq.push_back((i, n - 1));
    }
    for j in 0..n {
        if !pacific[0][j] { pacific[0][j] = true; pq.push_back((0, j)); }
        if !atlantic[m - 1][j] { atlantic[m - 1][j] = true; aq.push_back((m - 1, j)); }
    }

    Self::bfs(heights, &mut pacific, &mut pq, m, n);
    Self::bfs(heights, &mut atlantic, &mut aq, m, n);

    let mut result = Vec::new();
    for i in 0..m {
        for j in 0..n {
            if pacific[i][j] && atlantic[i][j] {
                result.push(vec![i as i32, j as i32]);
            }
        }
    }
    result
}

fn bfs(heights: &[Vec<i32>], visited: &mut Vec<Vec<bool>>,
       queue: &mut VecDeque<(usize, usize)>, m: usize, n: usize) {
    while let Some((i, j)) = queue.pop_front() {
        for (dx, dy) in [(0i32, 1i32), (1, 0), (0, -1), (-1, 0)] {
            let (ni, nj) = (i as i32 + dx, j as i32 + dy);
            if ni >= 0 && ni < m as i32 && nj >= 0 && nj < n as i32 {
                let (ni, nj) = (ni as usize, nj as usize);
                if !visited[ni][nj] && heights[ni][nj] >= heights[i][j] {
                    visited[ni][nj] = true;
                    queue.push_back((ni, nj));
                }
            }
        }
    }
}
```
