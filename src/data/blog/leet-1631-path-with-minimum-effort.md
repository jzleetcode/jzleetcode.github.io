---
author: JZ
pubDatetime: 2026-06-22T06:23:00Z
modDatetime: 2026-06-22T06:23:00Z
title: LeetCode 1631 Path With Minimum Effort
featured: true
tags:
  - a-graph
  - a-binary-search
  - a-bfs
  - a-heap
  - a-matrix
description:
  "Solutions for LeetCode 1631, medium, tags: array, binary search, depth-first search, breadth-first search, union find, heap (priority queue), matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 1631](https://leetcode.com/problems/path-with-minimum-effort/description/)

You are a hiker preparing for an upcoming hike. You are given `heights`, a 2D array of size `rows x cols`, where `heights[row][col]` represents the height of cell `(row, col)`. You are situated in the top-left cell `(0, 0)`, and you hope to travel to the bottom-right cell `(rows-1, cols-1)`. You can move up, down, left, or right, and you wish to find a route that requires the minimum **effort**.

A route's **effort** is the maximum absolute difference in heights between two consecutive cells of the route.

Return the minimum effort required to travel from the top-left cell to the bottom-right cell.

```
Example 1:

Input: heights = [[1,2,2],[3,8,2],[5,3,5]]
Output: 2
Explanation: The route [1,3,5,3,5] has a maximum absolute difference of 2.

Example 2:

Input: heights = [[1,2,3],[3,8,4],[5,3,5]]
Output: 1
Explanation: The route [1,2,3,4,5] has a maximum absolute difference of 1.

Example 3:

Input: heights = [[1,2,1,1,1],[1,2,1,2,1],[1,2,1,2,1],[1,2,1,2,1],[1,1,1,2,1]]
Output: 0
Explanation: This route does not require any effort.
```

**Constraints:**

- `rows == heights.length`
- `cols == heights[i].length`
- `1 <= rows, cols <= 100`
- `1 <= heights[i][j] <= 10^6`

## Idea1: Dijkstra

This is a shortest-path problem where the "distance" is defined as the maximum edge weight along a path — a minimax path problem. We can solve it with a modified Dijkstra: use a min-heap of `(effort, row, col)`, and for each neighbor compute `new_effort = max(current_effort, |heights[r][c] - heights[nr][nc]|)`. Update `dist[nr][nc]` if we find a smaller effort.

```
heights:         dist after Dijkstra:
1  2  2          0  1  1
3  8  2          2  6  1
5  3  5          2  2  2   <- answer is dist[2][2] = 2

Path: (0,0)->(0,1)->(0,2)->  edges: |1-2|=1, |2-2|=0
      (1,2)->                 edge:  |2-2|=0
      (2,2)                   edge:  |2-5|=3? No, better path:
                              (0,0)->(1,0)->(2,0)->(2,1)->(2,2)
                              edges: 2, 2, 2, 2 -> max = 2
```

Complexity: Time $O(m \cdot n \cdot \log(m \cdot n))$ — each cell pushed to heap at most once with improvement. Space $O(m \cdot n)$ — dist array and heap.

## Idea2: Binary Search + BFS

Binary search on the answer in range $[0, 10^6]$. For a given threshold `mid`, use BFS to check if there exists a path from `(0,0)` to `(rows-1, cols-1)` where every edge has `|diff| <= mid`. If reachable, search lower; otherwise search higher.

```
heights = [[1,2,2],[3,8,2],[5,3,5]]

mid = 1: BFS from (0,0) can reach (0,1),(0,2),(1,2) but not (2,2). Fail.
mid = 2: BFS from (0,0) can reach (1,0),(2,0),(2,1),(2,2). Success!
Answer = 2.
```

Complexity: Time $O(m \cdot n \cdot \log(\text{max\_height}))$ — $\log(10^6) \approx 20$ BFS passes. Space $O(m \cdot n)$ — visited array and queue.

### Java

```java []
// Dijkstra. O(m*n*log(m*n)) time, O(m*n) space.
public static int minimumEffortPathDijkstra(int[][] heights) {
    int rows = heights.length, cols = heights[0].length;
    int[][] dist = new int[rows][cols];
    for (int[] row : dist) Arrays.fill(row, Integer.MAX_VALUE);
    dist[0][0] = 0;
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
    pq.offer(new int[]{0, 0, 0});
    int[][] directions = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
    while (!pq.isEmpty()) {
        int[] curr = pq.poll();
        int effort = curr[0], row = curr[1], col = curr[2];
        if (row == rows - 1 && col == cols - 1) return effort;
        if (effort > dist[row][col]) continue;
        for (int[] dir : directions) { // O(4) neighbors
            int nr = row + dir[0], nc = col + dir[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            int newEffort = Math.max(effort, Math.abs(heights[nr][nc] - heights[row][col]));
            if (newEffort < dist[nr][nc]) { // relaxation
                dist[nr][nc] = newEffort;
                pq.offer(new int[]{newEffort, nr, nc});
            }
        }
    }
    return dist[rows - 1][cols - 1];
}
```
```java []
// Binary search + BFS. O(m*n*log(max_height)) time, O(m*n) space.
public static int minimumEffortPathBinarySearch(int[][] heights) {
    int left = 0, right = 1_000_000;
    while (left < right) { // O(log(10^6)) iterations
        int mid = left + (right - left) / 2;
        if (canReachWithEffort(heights, mid)) right = mid; // O(m*n) BFS
        else left = mid + 1;
    }
    return left;
}

private static boolean canReachWithEffort(int[][] heights, int maxEffort) {
    int rows = heights.length, cols = heights[0].length;
    boolean[][] visited = new boolean[rows][cols];
    Queue<int[]> queue = new ArrayDeque<>();
    queue.offer(new int[]{0, 0});
    visited[0][0] = true;
    int[][] directions = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
    while (!queue.isEmpty()) {
        int[] curr = queue.poll();
        int r = curr[0], c = curr[1];
        if (r == rows - 1 && c == cols - 1) return true;
        for (int[] dir : directions) {
            int nr = r + dir[0], nc = c + dir[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
            if (Math.abs(heights[nr][nc] - heights[r][c]) <= maxEffort) {
                visited[nr][nc] = true;
                queue.offer(new int[]{nr, nc});
            }
        }
    }
    return false;
}
```

### Python

```python []
# Dijkstra. O(m*n*log(m*n)) time, O(m*n) space.
import heapq

class Solution:
    def minimumEffortPath(self, heights: list[list[int]]) -> int:
        rows, cols = len(heights), len(heights[0])
        dist = [[float('inf')] * cols for _ in range(rows)]
        dist[0][0] = 0
        heap = [(0, 0, 0)]  # (effort, row, col)
        while heap:
            effort, r, c = heapq.heappop(heap)
            if r == rows - 1 and c == cols - 1:
                return effort
            if effort > dist[r][c]:
                continue
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):  # O(4) neighbors
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    new_effort = max(effort, abs(heights[r][c] - heights[nr][nc]))
                    if new_effort < dist[nr][nc]:  # relaxation
                        dist[nr][nc] = new_effort
                        heapq.heappush(heap, (new_effort, nr, nc))
        return 0
```
```python []
# Binary search + BFS. O(m*n*log(max_height)) time, O(m*n) space.
from collections import deque

class Solution2:
    def minimumEffortPath(self, heights: list[list[int]]) -> int:
        rows, cols = len(heights), len(heights[0])

        def can_reach(threshold: int) -> bool:
            visited = [[False] * cols for _ in range(rows)]
            visited[0][0] = True
            queue = deque([(0, 0)])
            while queue:
                r, c = queue.popleft()
                if r == rows - 1 and c == cols - 1:
                    return True
                for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and not visited[nr][nc]:
                        if abs(heights[r][c] - heights[nr][nc]) <= threshold:
                            visited[nr][nc] = True
                            queue.append((nr, nc))
            return False

        lo, hi = 0, 10**6  # O(log(10^6)) iterations
        while lo < hi:
            mid = (lo + hi) // 2
            if can_reach(mid):  # O(m*n) BFS
                hi = mid
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
// Dijkstra. O(m*n*log(m*n)) time, O(m*n) space.
int dijkstra(vector<vector<int>>& heights) {
    int rows = heights.size(), cols = heights[0].size();
    vector<vector<int>> dist(rows, vector<int>(cols, INT_MAX));
    dist[0][0] = 0;
    using State = tuple<int, int, int>;
    priority_queue<State, vector<State>, greater<State>> pq;
    pq.push({0, 0, 0});
    int dirs[4][2] = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
    while (!pq.empty()) {
        auto [effort, r, c] = pq.top(); pq.pop();
        if (r == rows - 1 && c == cols - 1) return effort;
        if (effort > dist[r][c]) continue;
        for (auto& d : dirs) { // O(4) neighbors
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            int newEffort = max(effort, abs(heights[nr][nc] - heights[r][c]));
            if (newEffort < dist[nr][nc]) { // relaxation
                dist[nr][nc] = newEffort;
                pq.push({newEffort, nr, nc});
            }
        }
    }
    return dist[rows - 1][cols - 1];
}
```
```cpp []
// Binary search + BFS. O(m*n*log(max_height)) time, O(m*n) space.
int binarySearch(vector<vector<int>>& heights) {
    int rows = heights.size(), cols = heights[0].size();
    int left = 0, right = 1000000;
    while (left < right) { // O(log(10^6)) iterations
        int mid = left + (right - left) / 2;
        if (canReach(heights, mid)) right = mid; // O(m*n) BFS
        else left = mid + 1;
    }
    return left;
}

bool canReach(vector<vector<int>>& heights, int maxEffort) {
    int rows = heights.size(), cols = heights[0].size();
    int dirs[4][2] = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
    vector<vector<bool>> visited(rows, vector<bool>(cols, false));
    queue<pair<int, int>> q;
    q.push({0, 0}); visited[0][0] = true;
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        if (r == rows - 1 && c == cols - 1) return true;
        for (auto& d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
            if (abs(heights[nr][nc] - heights[r][c]) <= maxEffort) {
                visited[nr][nc] = true;
                q.push({nr, nc});
            }
        }
    }
    return false;
}
```

### Rust

```rust []
// Dijkstra. O(m*n*log(m*n)) time, O(m*n) space.
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub fn minimum_effort_path_dijkstra(heights: Vec<Vec<i32>>) -> i32 {
    let (rows, cols) = (heights.len(), heights[0].len());
    let mut dist = vec![vec![i32::MAX; cols]; rows];
    dist[0][0] = 0;
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((0, 0, 0)));
    let directions = [(0, 1), (1, 0), (0, -1), (-1, 0)];
    while let Some(Reverse((effort, r, c))) = heap.pop() {
        if r == rows - 1 && c == cols - 1 { return effort; }
        if effort > dist[r][c] { continue; }
        for &(dr, dc) in &directions { // O(4) neighbors
            let (nr, nc) = (r as i32 + dr, c as i32 + dc);
            if nr >= 0 && nr < rows as i32 && nc >= 0 && nc < cols as i32 {
                let (nr, nc) = (nr as usize, nc as usize);
                let new_effort = effort.max((heights[r][c] - heights[nr][nc]).abs());
                if new_effort < dist[nr][nc] { // relaxation
                    dist[nr][nc] = new_effort;
                    heap.push(Reverse((new_effort, nr, nc)));
                }
            }
        }
    }
    dist[rows - 1][cols - 1]
}
```
```rust []
// Binary search + BFS. O(m*n*log(max_height)) time, O(m*n) space.
use std::collections::VecDeque;

pub fn minimum_effort_path_binary_search(heights: Vec<Vec<i32>>) -> i32 {
    let (rows, cols) = (heights.len(), heights[0].len());
    let (mut lo, mut hi) = (0, 1_000_000);
    while lo < hi { // O(log(10^6)) iterations
        let mid = lo + (hi - lo) / 2;
        if can_reach(mid, &heights, rows, cols) { hi = mid; } // O(m*n) BFS
        else { lo = mid + 1; }
    }
    lo
}

fn can_reach(max_effort: i32, heights: &[Vec<i32>], rows: usize, cols: usize) -> bool {
    let mut visited = vec![vec![false; cols]; rows];
    let mut queue = VecDeque::new();
    queue.push_back((0, 0));
    visited[0][0] = true;
    let directions = [(0, 1), (1, 0), (0, -1), (-1, 0)];
    while let Some((r, c)) = queue.pop_front() {
        if r == rows - 1 && c == cols - 1 { return true; }
        for &(dr, dc) in &directions {
            let (nr, nc) = (r as i32 + dr, c as i32 + dc);
            if nr >= 0 && nr < rows as i32 && nc >= 0 && nc < cols as i32 {
                let (nr, nc) = (nr as usize, nc as usize);
                if !visited[nr][nc] && (heights[r][c] - heights[nr][nc]).abs() <= max_effort {
                    visited[nr][nc] = true;
                    queue.push_back((nr, nc));
                }
            }
        }
    }
    false
}
```
