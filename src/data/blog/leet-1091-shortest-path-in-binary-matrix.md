---
author: JZ
pubDatetime: 2026-06-01T06:00:00Z
modDatetime: 2026-06-01T06:00:00Z
title: LeetCode 1091 Shortest Path in Binary Matrix
featured: true
tags:
  - a-bfs
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 1091, medium, tags: array, breadth-first search, matrix, shortest path."
---

## Table of contents

## Description

Question Links: [LeetCode 1091](https://leetcode.com/problems/shortest-path-in-binary-matrix/description/)

Given an `n x n` binary matrix `grid`, return _the length of the shortest **clear path** in the matrix_. If there is no clear path, return `-1`.

A **clear path** in a binary matrix is a path from the **top-left** cell (i.e., `(0, 0)`) to the **bottom-right** cell (i.e., `(n - 1, n - 1)`) such that:

- All the visited cells of the path are `0`.
- All the adjacent cells of the path are **8-directionally** connected (i.e., they are different and they share an edge or a corner).

The **length of a clear path** is the number of visited cells of this path.

```
Example 1:

Input: grid = [[0,1],[1,0]]
Output: 2

Example 2:

Input: grid = [[0,0,0],[1,1,0],[1,1,0]]
Output: 4

Example 3:

Input: grid = [[1,0,0],[1,1,0],[1,1,0]]
Output: -1
Explanation: Start cell (0,0) is blocked.
```

**Constraints:**

- `n == grid.length`
- `n == grid[i].length`
- `1 <= n <= 100`
- `grid[i][j]` is `0` or `1`.

## Idea1: BFS

Standard BFS on a grid. Since all edge costs are uniform (1 per step), BFS guarantees the shortest path. We explore all 8 neighbors for each cell, marking visited cells to avoid re-processing.

```
Grid:              BFS expansion:
0  0  0            1  2  3
1  1  0            .  .  3
1  1  0            .  .  4  <-- answer = 4
                   (numbers = distance from start)
```

Algorithm:
1. If `grid[0][0] != 0` or `grid[n-1][n-1] != 0`, return `-1`.
2. Enqueue `(0, 0)` with distance `1`. Mark it visited.
3. BFS: for each cell, explore 8 neighbors. If neighbor is `(n-1, n-1)`, return `dist + 1`. Otherwise mark visited, enqueue.
4. If queue empties, return `-1`.

Complexity: Time $O(n^2)$ — each cell visited at most once. Space $O(n^2)$ — queue size.

## Idea2: A* with Chebyshev Heuristic

A* improves average-case performance by prioritizing cells closer to the goal. For 8-directional movement, the **Chebyshev distance** $h(r,c) = \max(n{-}1{-}r,\; n{-}1{-}c)$ is an admissible heuristic (never overestimates).

We use a min-heap ordered by $f = g + h$ where $g$ is the actual distance from start.

Complexity: Time $O(n^2 \log n)$ — priority queue operations over at most $n^2$ cells. Space $O(n^2)$ — distance array and heap.

### Java

```java []
private static final int[][] DIRS = {
    {-1, -1}, {-1, 0}, {-1, 1},
    {0, -1},           {0, 1},
    {1, -1},  {1, 0},  {1, 1}
};

// lc 1091, BFS, O(n^2) time, O(n^2) space.
public static int bfs(int[][] grid) {
    int n = grid.length;
    if (grid[0][0] != 0 || grid[n - 1][n - 1] != 0) return -1;
    if (n == 1) return 1;

    boolean[][] visited = new boolean[n][n];
    Queue<int[]> queue = new ArrayDeque<>();
    queue.offer(new int[]{0, 0});
    visited[0][0] = true;
    int dist = 1;

    while (!queue.isEmpty()) {
        int size = queue.size();                  // process level by level
        for (int i = 0; i < size; i++) {
            int[] cell = queue.poll();
            for (int[] d : DIRS) {               // O(8) neighbors
                int nr = cell[0] + d[0], nc = cell[1] + d[1];
                if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
                if (visited[nr][nc] || grid[nr][nc] != 0) continue;
                if (nr == n - 1 && nc == n - 1) return dist + 1;
                visited[nr][nc] = true;
                queue.offer(new int[]{nr, nc});
            }
        }
        dist++;
    }
    return -1;
}

// lc 1091, A* with Chebyshev heuristic, O(n^2 log n) time, O(n^2) space.
public static int aStar(int[][] grid) {
    int n = grid.length;
    if (grid[0][0] != 0 || grid[n - 1][n - 1] != 0) return -1;
    if (n == 1) return 1;

    int[][] dist = new int[n][n];
    for (int[] row : dist) java.util.Arrays.fill(row, Integer.MAX_VALUE);
    dist[0][0] = 1;

    // PQ entries: [f-cost, row, col] where f = g + h
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
    pq.offer(new int[]{1 + Math.max(n - 1, n - 1), 0, 0});

    while (!pq.isEmpty()) {
        int[] cur = pq.poll();
        int r = cur[1], c = cur[2], g = dist[r][c];
        if (r == n - 1 && c == n - 1) return g;
        if (cur[0] > g + Math.max(n - 1 - r, n - 1 - c)) continue; // stale

        for (int[] d : DIRS) {
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
            if (grid[nr][nc] != 0) continue;
            int newG = g + 1;
            if (newG < dist[nr][nc]) {
                dist[nr][nc] = newG;
                pq.offer(new int[]{newG + Math.max(n-1-nr, n-1-nc), nr, nc});
            }
        }
    }
    return -1;
}
```

```python []
# lc 1091, BFS, O(n^2) time, O(n^2) space.
class Solution:
    def shortestPathBinaryMatrix(self, grid: list[list[int]]) -> int:
        n = len(grid)
        if grid[0][0] != 0 or grid[n - 1][n - 1] != 0:
            return -1
        q = deque([(0, 0, 1)])
        grid[0][0] = 1                          # mark visited
        dirs = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
        while q:
            r, c, dist = q.popleft()
            if r == n - 1 and c == n - 1:
                return dist
            for dr, dc in dirs:                 # O(8) per cell
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0:
                    grid[nr][nc] = 1
                    q.append((nr, nc, dist + 1))
        return -1


# lc 1091, A* with Chebyshev heuristic, O(n^2 log n) time, O(n^2) space.
class Solution2:
    def shortestPathBinaryMatrix(self, grid: list[list[int]]) -> int:
        import heapq
        n = len(grid)
        if grid[0][0] != 0 or grid[n - 1][n - 1] != 0:
            return -1
        heap = [(n - 1, 1, 0, 0)]              # (f, g, row, col)
        grid[0][0] = 1
        dirs = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
        while heap:
            _, dist, r, c = heapq.heappop(heap)
            if r == n - 1 and c == n - 1:
                return dist
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0:
                    grid[nr][nc] = 1
                    h = max(n - 1 - nr, n - 1 - nc)  # Chebyshev distance
                    heapq.heappush(heap, (dist + 1 + h, dist + 1, nr, nc))
        return -1
```

```cpp []
// lc 1091, BFS, O(n^2) time, O(n^2) space.
static int bfs(vector<vector<int>>& grid) {
    int n = grid.size();
    if (grid[0][0] != 0 || grid[n - 1][n - 1] != 0) return -1;
    if (n == 1) return 1;

    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    queue<pair<int,int>> q;
    q.push({0, 0});
    grid[0][0] = 1;                              // store distance

    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        for (auto& d : dirs) {                   // O(8) neighbors
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
            if (grid[nr][nc] != 0) continue;
            grid[nr][nc] = grid[r][c] + 1;      // distance from start
            if (nr == n - 1 && nc == n - 1) return grid[nr][nc];
            q.push({nr, nc});
        }
    }
    return -1;
}

// lc 1091, A* with Chebyshev heuristic, O(n^2 log n) time, O(n^2) space.
static int aStar(vector<vector<int>>& grid) {
    int n = grid.size();
    if (grid[0][0] != 0 || grid[n - 1][n - 1] != 0) return -1;
    if (n == 1) return 1;

    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    auto h = [&](int r, int c) { return max(n - 1 - r, n - 1 - c); };

    vector<vector<int>> dist(n, vector<int>(n, INT_MAX));
    dist[0][0] = 1;
    using State = tuple<int, int, int>;          // (f, row, col)
    priority_queue<State, vector<State>, greater<State>> pq;
    pq.push({1 + h(0, 0), 0, 0});

    while (!pq.empty()) {
        auto [f, r, c] = pq.top(); pq.pop();
        if (r == n - 1 && c == n - 1) return dist[r][c];
        if (dist[r][c] + h(r, c) < f) continue; // stale entry
        for (auto& d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
            if (grid[nr][nc] != 0) continue;
            int newDist = dist[r][c] + 1;
            if (newDist < dist[nr][nc]) {
                dist[nr][nc] = newDist;
                pq.push({newDist + h(nr, nc), nr, nc});
            }
        }
    }
    return -1;
}
```

```rust []
// lc 1091, BFS, O(n^2) time, O(n^2) space.
pub fn shortest_path_bfs(grid: &mut Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    if grid[0][0] != 0 || grid[n - 1][n - 1] != 0 { return -1; }
    if n == 1 { return 1; }

    let dirs: [(i32, i32); 8] = [
        (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1),
    ];
    let mut queue = VecDeque::new();
    queue.push_back((0usize, 0usize, 1i32));
    grid[0][0] = 1;                              // mark visited

    while let Some((r, c, dist)) = queue.pop_front() {
        for &(dr, dc) in &dirs {                 // O(8) per cell
            let (nr, nc) = (r as i32 + dr, c as i32 + dc);
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let (nr, nc) = (nr as usize, nc as usize);
            if grid[nr][nc] != 0 { continue; }
            if nr == n - 1 && nc == n - 1 { return dist + 1; }
            grid[nr][nc] = 1;
            queue.push_back((nr, nc, dist + 1));
        }
    }
    -1
}

// lc 1091, A* with Chebyshev heuristic, O(n^2 log n) time, O(n^2) space.
pub fn shortest_path_a_star(grid: &mut Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    if grid[0][0] != 0 || grid[n - 1][n - 1] != 0 { return -1; }
    if n == 1 { return 1; }

    let dirs: [(i32, i32); 8] = [
        (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1),
    ];
    let heuristic = |r: usize, c: usize| -> i32 {
        std::cmp::max((n - 1 - r) as i32, (n - 1 - c) as i32)
    };

    let mut heap = BinaryHeap::new();
    heap.push(Reverse((1 + heuristic(0, 0), 1i32, 0usize, 0usize)));
    grid[0][0] = 1;

    while let Some(Reverse((_f, g, r, c))) = heap.pop() {
        for &(dr, dc) in &dirs {
            let (nr, nc) = (r as i32 + dr, c as i32 + dc);
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let (nr, nc) = (nr as usize, nc as usize);
            if grid[nr][nc] != 0 { continue; }
            let new_g = g + 1;
            if nr == n - 1 && nc == n - 1 { return new_g; }
            grid[nr][nc] = 1;
            heap.push(Reverse((new_g + heuristic(nr, nc), new_g, nr, nc)));
        }
    }
    -1
}
```
