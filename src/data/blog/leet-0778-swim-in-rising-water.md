---
author: JZ
pubDatetime: 2026-08-05T06:00:00Z
modDatetime: 2026-08-05T06:00:00Z
title: LeetCode 778 Swim in Rising Water
featured: true
tags:
  - a-binary-search
  - a-bfs
  - a-graph
  - a-heap
description:
  "Solutions for LeetCode 778, hard, tags: array, binary search, depth-first search, breadth-first search, union find, heap (priority queue), matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 778](https://leetcode.com/problems/swim-in-rising-water/description/)

You are given an `n x n` integer matrix `grid` where each value `grid[i][j]` represents the elevation at that point `(i, j)`.

The rain starts to fall. At time `t`, the depth of the water everywhere is `t`. You can swim from a square to another 4-directionally adjacent square if and only if the elevation of both squares individually are at most `t`. You can swim infinite distances in zero time. Of course, you must stay within the boundaries of the grid during your swim.

Return the least time until you can reach the bottom right square `(n - 1, n - 1)` starting from the top left square `(0, 0)`.

```
Example 1:

Input: grid = [[0,2],[1,3]]
Output: 3
Explanation: At time 3, the water level lets us swim from (0,0) to (1,0) to (1,1).

Example 2:

Input: grid = [[0,1,2,3,4],[24,23,22,21,5],[12,13,14,15,16],[11,17,18,19,20],[10,9,8,7,6]]
Output: 16
Explanation: The optimal path follows the right edge down and the bottom edge left:
(0,0)->(0,1)->(0,2)->(0,3)->(0,4)->(1,4)->(2,4)->(3,4)->(4,4)->(4,3)->(4,2)->(4,1)->(4,0)
The max elevation on this path is 16.
```

**Constraints:**

- `n == grid.length`
- `n == grid[i].length`
- `1 <= n <= 50`
- `0 <= grid[i][j] < n^2`
- Each value `grid[i][j]` is unique.

## Idea1: Min-Heap (Dijkstra-like)

The key insight: we want to find a path from `(0,0)` to `(n-1,n-1)` that minimizes the **maximum elevation** along the path. This is a variant of Dijkstra's algorithm where the "distance" is the maximum cell value encountered.

```
Grid:               Traversal order (heap pops):

 0  2               Pop (0,0,0) -> push (2,0,1),(1,1,0)
 1  3               Pop (1,1,0) -> push (3,1,1)
                    Pop (2,0,1) -> (0,1) already visited
                    Pop (3,1,1) -> destination! return 3
```

Algorithm:
1. Push `(grid[0][0], 0, 0)` into a min-heap.
2. Pop the element with smallest max-elevation.
3. If it's the destination, return the elevation.
4. Push unvisited neighbors with `max(current_elevation, grid[nr][nc])`.

Complexity: Time $O(n^2 \log n)$ — each of $n^2$ cells is pushed/popped once, each heap operation is $O(\log(n^2)) = O(\log n)$. Space $O(n^2)$ for the visited array and heap.

## Idea2: Binary Search + BFS

Binary search on the answer `t`. For a given `t`, we can BFS/DFS to check if a path exists from `(0,0)` to `(n-1,n-1)` using only cells with elevation $\leq t$.

```
Binary search: lo=max(grid[0][0], grid[n-1][n-1]), hi=n*n-1

t=8:  Can we reach (4,4) using only cells <= 8?
      BFS from (0,0): 0->1->2->3->4->5->6->7->8 ✓

t=7:  Only cells <= 7 available
      Path blocked at elevation 8 ✗

Answer = 8 (first t where path exists)
```

Algorithm:
1. Binary search `t` in `[max(grid[0][0], grid[n-1][n-1]), n*n-1]`.
2. For each mid, BFS only through cells with elevation $\leq$ mid.
3. If reachable, shrink upper bound; otherwise raise lower bound.

Complexity: Time $O(n^2 \log n)$ — $O(\log(n^2))$ binary search iterations, each with $O(n^2)$ BFS. Space $O(n^2)$ for the BFS visited array.

### Java

```java []
private static final int[][] DIRS = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};

// lc 778, Min-Heap Dijkstra-like. Time O(n^2 log n), Space O(n^2).
public static int swimInWater(int[][] grid) {
    int n = grid.length;
    boolean[][] visited = new boolean[n][n];
    // PQ stores {maxElevation, row, col}
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]); // O(n^2) elements max
    pq.offer(new int[]{grid[0][0], 0, 0});
    visited[0][0] = true;

    while (!pq.isEmpty()) {
        int[] cur = pq.poll(); // O(log(n^2)) = O(log n) per poll
        int t = cur[0], r = cur[1], c = cur[2];
        if (r == n - 1 && c == n - 1) return t;
        for (int[] d : DIRS) { // O(4) neighbors
            int nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc]) {
                visited[nr][nc] = true;
                pq.offer(new int[]{Math.max(t, grid[nr][nc]), nr, nc});
            }
        }
    }
    return -1;
}

// lc 778, Binary Search + BFS. Time O(n^2 log n), Space O(n^2).
public static int swimInWater2(int[][] grid) {
    int n = grid.length;
    int lo = Math.max(grid[0][0], grid[n - 1][n - 1]);
    int hi = n * n - 1;

    while (lo < hi) { // O(log(n^2)) = O(log n) iterations
        int mid = lo + (hi - lo) / 2;
        if (canReach(grid, n, mid)) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    return lo;
}

private static boolean canReach(int[][] grid, int n, int t) {
    if (grid[0][0] > t) return false;
    boolean[][] visited = new boolean[n][n];
    Queue<int[]> queue = new ArrayDeque<>();
    queue.offer(new int[]{0, 0});
    visited[0][0] = true;

    while (!queue.isEmpty()) {
        int[] cur = queue.poll();
        int r = cur[0], c = cur[1];
        if (r == n - 1 && c == n - 1) return true;
        for (int[] d : DIRS) { // O(4) neighbors
            int nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc] && grid[nr][nc] <= t) {
                visited[nr][nc] = true;
                queue.offer(new int[]{nr, nc});
            }
        }
    }
    return false;
}
```

```python []
# lc 778, Min-Heap Dijkstra-like. Time O(n^2 log n), Space O(n^2).
class Solution:
    def swimInWater(self, grid: list[list[int]]) -> int:
        n = len(grid)
        visited = [[False] * n for _ in range(n)]
        # (max elevation along path, row, col)
        heap = [(grid[0][0], 0, 0)]
        visited[0][0] = True
        while heap:
            t, r, c = heapq.heappop(heap)           # O(log n) per pop
            if r == n - 1 and c == n - 1:
                return t
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):  # O(4)
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and not visited[nr][nc]:
                    visited[nr][nc] = True
                    heapq.heappush(heap, (max(t, grid[nr][nc]), nr, nc))
        return -1

# lc 778, Binary Search + BFS. Time O(n^2 log n), Space O(n^2).
class Solution2:
    def swimInWater(self, grid: list[list[int]]) -> int:
        n = len(grid)

        def can_reach(t: int) -> bool:
            if grid[0][0] > t:
                return False
            visited = [[False] * n for _ in range(n)]
            visited[0][0] = True
            queue = deque([(0, 0)])
            while queue:                            # O(n^2) BFS
                r, c = queue.popleft()
                if r == n - 1 and c == n - 1:
                    return True
                for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < n and 0 <= nc < n and not visited[nr][nc] and grid[nr][nc] <= t:
                        visited[nr][nc] = True
                        queue.append((nr, nc))
            return False

        lo, hi = max(grid[0][0], grid[n - 1][n - 1]), n * n - 1
        while lo < hi:                              # O(log n) iterations
            mid = (lo + hi) // 2
            if can_reach(mid):
                hi = mid
            else:
                lo = mid + 1
        return lo
```

```cpp []
// lc 778, Min-Heap Dijkstra-like. Time O(n^2 log n), Space O(n^2).
int swimInWater(vector<vector<int>>& grid) {
    int n = grid.size();
    vector<vector<bool>> visited(n, vector<bool>(n, false));
    // {max_elevation_along_path, row, col}
    priority_queue<tuple<int, int, int>, vector<tuple<int, int, int>>, greater<>> pq;
    pq.emplace(grid[0][0], 0, 0);
    visited[0][0] = true;

    int dirs[] = {0, 1, 0, -1, 0};
    while (!pq.empty()) {
        auto [t, r, c] = pq.top();
        pq.pop();                               // O(log n) per pop
        if (r == n - 1 && c == n - 1) return t;
        for (int d = 0; d < 4; d++) {           // O(4) neighbors
            int nr = r + dirs[d], nc = c + dirs[d + 1];
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc]) {
                visited[nr][nc] = true;
                pq.emplace(max(t, grid[nr][nc]), nr, nc);
            }
        }
    }
    return -1;
}

// lc 778, Binary Search + BFS. Time O(n^2 log n), Space O(n^2).
int swimInWaterBS(vector<vector<int>>& grid) {
    int n = grid.size();
    int lo = grid[0][0], hi = n * n - 1;
    int dirs[] = {0, 1, 0, -1, 0};

    auto canReach = [&](int t) -> bool {
        if (grid[0][0] > t) return false;
        vector<vector<bool>> visited(n, vector<bool>(n, false));
        queue<pair<int, int>> q;
        q.emplace(0, 0);
        visited[0][0] = true;
        while (!q.empty()) {                    // O(n^2) BFS
            auto [r, c] = q.front(); q.pop();
            if (r == n - 1 && c == n - 1) return true;
            for (int d = 0; d < 4; d++) {
                int nr = r + dirs[d], nc = c + dirs[d + 1];
                if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr][nc] && grid[nr][nc] <= t) {
                    visited[nr][nc] = true;
                    q.emplace(nr, nc);
                }
            }
        }
        return false;
    };

    while (lo < hi) {                           // O(log n) iterations
        int mid = (lo + hi) / 2;
        if (canReach(mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}
```

```rust []
// lc 778, Min-Heap Dijkstra-like. Time O(n^2 log n), Space O(n^2).
pub fn swim_in_water(grid: Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    let mut dist = vec![vec![i32::MAX; n]; n];
    let mut heap = BinaryHeap::new();
    dist[0][0] = grid[0][0];
    heap.push(Reverse((grid[0][0], 0usize, 0usize)));

    let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];

    while let Some(Reverse((cost, r, c))) = heap.pop() {  // O(log n)
        if r == n - 1 && c == n - 1 {
            return cost;
        }
        if cost > dist[r][c] {
            continue;
        }
        for (dr, dc) in &dirs {                            // O(4)
            let nr = r as i32 + dr;
            let nc = c as i32 + dc;
            if nr < 0 || nr >= n as i32 || nc < 0 || nc >= n as i32 {
                continue;
            }
            let (nr, nc) = (nr as usize, nc as usize);
            let new_cost = cost.max(grid[nr][nc]);
            if new_cost < dist[nr][nc] {
                dist[nr][nc] = new_cost;
                heap.push(Reverse((new_cost, nr, nc)));
            }
        }
    }
    -1
}

// lc 778, Binary Search + BFS. Time O(n^2 log n), Space O(n^2).
pub fn swim_in_water_bs(grid: Vec<Vec<i32>>) -> i32 {
    let n = grid.len();
    let max_val = n as i32 * n as i32 - 1;

    let can_reach = |t: i32| -> bool {
        if grid[0][0] > t || grid[n - 1][n - 1] > t {
            return false;
        }
        let mut visited = vec![vec![false; n]; n];
        let mut queue = VecDeque::new();
        visited[0][0] = true;
        queue.push_back((0usize, 0usize));
        let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
        while let Some((r, c)) = queue.pop_front() {       // O(n^2)
            if r == n - 1 && c == n - 1 { return true; }
            for (dr, dc) in &dirs {
                let nr = r as i32 + dr;
                let nc = c as i32 + dc;
                if nr < 0 || nr >= n as i32 || nc < 0 || nc >= n as i32 { continue; }
                let (nr, nc) = (nr as usize, nc as usize);
                if !visited[nr][nc] && grid[nr][nc] <= t {
                    visited[nr][nc] = true;
                    queue.push_back((nr, nc));
                }
            }
        }
        false
    };

    let mut lo = grid[0][0].max(grid[n - 1][n - 1]);
    let mut hi = max_val;
    while lo < hi {                                         // O(log n)
        let mid = lo + (hi - lo) / 2;
        if can_reach(mid) { hi = mid; } else { lo = mid + 1; }
    }
    lo
}
```
