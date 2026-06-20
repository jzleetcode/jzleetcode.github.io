---
author: JZ
pubDatetime: 2026-06-20T06:00:00Z
modDatetime: 2026-06-20T06:00:00Z
title: LeetCode 329 Longest Increasing Path in a Matrix
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-matrix
  - a-graph
  - a-topological-sort
  - a-memoization
description:
  "Solutions for LeetCode 329, hard, tags: array, dynamic programming, depth-first search, breadth-first search, graph, topological sort, memoization, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 329](https://leetcode.com/problems/longest-increasing-path-in-a-matrix/description/)

Given an `m x n` integers matrix, return the length of the **longest increasing path** in matrix.

From each cell, you can either move in four directions: left, right, up, or down. You **may not** move **diagonally** or move **outside the boundary** (i.e., wrap-around is not allowed).

```
Example 1:

Input: matrix = [[9,9,4],[6,6,8],[2,1,1]]
Output: 4
Explanation: The longest increasing path is [1, 2, 6, 9].

Example 2:

Input: matrix = [[3,4,5],[3,2,6],[2,2,1]]
Output: 4
Explanation: The longest increasing path is [3, 4, 5, 6]. Moving diagonally is not allowed.

Example 3:

Input: matrix = [[1]]
Output: 1
```

**Constraints:**

- `m == matrix.length`
- `n == matrix[i].length`
- `1 <= m, n <= 200`
- `0 <= matrix[i][j] <= 2^31 - 1`

## Idea1

We model the matrix as a **DAG** (directed acyclic graph): from each cell, draw an edge to each neighbor with a strictly larger value. Since edges always go from smaller to larger, there are no cycles.

**DFS + Memoization:** For each cell, compute the longest path starting from it via DFS. Cache results in a `memo[m][n]` table so each cell is computed exactly once.

```
matrix:            longest path from each cell (memo):
 9  9  4           1  1  2
 6  6  8           2  2  1
 2  1  1           3  4  2

Longest: 4  (path: 1 -> 2 -> 6 -> 9)
```

The key insight: since we only move to strictly larger values, recursion always terminates (no cycles), and memoization ensures $O(m \cdot n)$ total work.

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$.

### Java

```java []
private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

// lc 329, DFS + memoization, O(m*n) time, O(m*n) space.
public static int longestIncreasingPathDFS(int[][] matrix) {
    if (matrix == null || matrix.length == 0 || matrix[0].length == 0) return 0;
    int m = matrix.length, n = matrix[0].length;
    int[][] memo = new int[m][n]; // O(m*n) space
    int result = 1;
    for (int i = 0; i < m; i++) { // O(m*n) iterate all cells
        for (int j = 0; j < n; j++) {
            result = Math.max(result, dfs(matrix, memo, i, j, m, n));
        }
    }
    return result;
}

private static int dfs(int[][] matrix, int[][] memo, int i, int j, int m, int n) {
    if (memo[i][j] != 0) return memo[i][j];
    int longest = 1;
    for (int[] d : DIRS) { // O(1) 4-direction check
        int ni = i + d[0], nj = j + d[1];
        if (ni >= 0 && ni < m && nj >= 0 && nj < n && matrix[ni][nj] > matrix[i][j]) {
            longest = Math.max(longest, 1 + dfs(matrix, memo, ni, nj, m, n));
        }
    }
    memo[i][j] = longest;
    return longest;
}
```

```python []
# lc 329, DFS + memoization, O(m*n) time, O(m*n) space.
class SolutionDFS:
    def longestIncreasingPath(self, matrix: List[List[int]]) -> int:
        dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        m, n = len(matrix), len(matrix[0])

        @lru_cache(maxsize=None)  # memoize: each cell computed once, O(m*n) total
        def dfs(r, c):
            steps = 1
            for d in dirs:  # O(4) directions
                nr, nc = r + d[0], c + d[1]
                if nr < 0 or nr >= m or nc < 0 or nc >= n or matrix[nr][nc] <= matrix[r][c]:
                    continue
                steps = max(steps, 1 + dfs(nr, nc))
            return steps

        res = 1
        for r in range(m):  # O(m)
            for c in range(n):  # O(n)
                res = max(res, dfs(r, c))
        return res
```

```cpp []
// lc 329, DFS + memoization, O(m*n) time, O(m*n) space.
int dirs[4][2] = {{0,1},{0,-1},{1,0},{-1,0}};

int dfs(vector<vector<int>>& matrix, vector<vector<int>>& memo, int i, int j) {
    if (memo[i][j] != 0) return memo[i][j]; // O(1) memo lookup
    int m = matrix.size(), n = matrix[0].size();
    int best = 1;
    for (auto& d : dirs) {
        int ni = i + d[0], nj = j + d[1];
        if (ni >= 0 && ni < m && nj >= 0 && nj < n && matrix[ni][nj] > matrix[i][j]) {
            best = max(best, 1 + dfs(matrix, memo, ni, nj)); // O(m*n) total DFS calls
        }
    }
    return memo[i][j] = best;
}

int longestIncreasingPathDFS(vector<vector<int>>& matrix) {
    if (matrix.empty()) return 0;
    int m = matrix.size(), n = matrix[0].size();
    vector<vector<int>> memo(m, vector<int>(n, 0)); // O(m*n) space
    int ans = 0;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            ans = max(ans, dfs(matrix, memo, i, j)); // each cell visited once due to memo
    return ans;
}
```

```rust []
// lc 329, DFS + memoization, O(m*n) time, O(m*n) space.
impl Solution {
    pub fn longest_increasing_path_dfs(matrix: Vec<Vec<i32>>) -> i32 {
        let m = matrix.len();
        if m == 0 { return 0; }
        let n = matrix[0].len();
        let mut memo = vec![vec![0i32; n]; m]; // O(m*n) space
        let mut ans = 1;
        for i in 0..m {
            for j in 0..n {
                ans = ans.max(Self::dfs(&matrix, &mut memo, i, j, m, n));
            }
        }
        ans
    }

    fn dfs(matrix: &[Vec<i32>], memo: &mut [Vec<i32>], i: usize, j: usize, m: usize, n: usize) -> i32 {
        if memo[i][j] != 0 { return memo[i][j]; } // O(1) cached lookup
        let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
        let mut best = 1;
        for &(di, dj) in &dirs {
            let ni = i as i32 + di;
            let nj = j as i32 + dj;
            if ni >= 0 && ni < m as i32 && nj >= 0 && nj < n as i32 {
                let (ni, nj) = (ni as usize, nj as usize);
                if matrix[ni][nj] > matrix[i][j] {
                    best = best.max(1 + Self::dfs(matrix, memo, ni, nj, m, n));
                }
            }
        }
        memo[i][j] = best;
        best
    }
}
```

## Idea2

**Topological Sort (BFS / Kahn's algorithm):** Model the same DAG but process it with BFS layer peeling. Build an in-degree array: for each cell, count how many of its 4 neighbors have a strictly smaller value (those are edges pointing into this cell). Start BFS from all cells with in-degree 0 (local minima). Each BFS layer represents one step in the increasing path. The total number of layers is the answer.

```
matrix:            indegree:         BFS layers (each = 1 step):
 9  9  4            3  2  0          Layer 0: cells with indegree 0 = [4, (2,1), (2,2)]
 6  6  8            1  1  2          Layer 1: [8, (0,0) stays queued...]
 2  1  1            1  0  0          Layer 2: [6's]
                                     Layer 3: [9's]
                                     Answer: 4 layers
```

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$.

### Java

```java []
private static final int[][] DIRS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

// lc 329, topological sort BFS, O(m*n) time, O(m*n) space.
public static int longestIncreasingPathBFS(int[][] matrix) {
    if (matrix == null || matrix.length == 0 || matrix[0].length == 0) return 0;
    int m = matrix.length, n = matrix[0].length;
    int[][] inDegree = new int[m][n]; // O(m*n) space

    for (int i = 0; i < m; i++) { // O(m*n) build in-degree
        for (int j = 0; j < n; j++) {
            for (int[] d : DIRS) {
                int ni = i + d[0], nj = j + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n && matrix[ni][nj] < matrix[i][j]) {
                    inDegree[i][j]++;
                }
            }
        }
    }

    Queue<int[]> queue = new ArrayDeque<>();
    for (int i = 0; i < m; i++) { // O(m*n)
        for (int j = 0; j < n; j++) {
            if (inDegree[i][j] == 0) {
                queue.offer(new int[]{i, j}); // start BFS from local minima
            }
        }
    }

    int layers = 0;
    while (!queue.isEmpty()) { // O(m*n) total across all layers
        int size = queue.size();
        layers++;
        for (int k = 0; k < size; k++) {
            int[] cell = queue.poll();
            for (int[] d : DIRS) {
                int ni = cell[0] + d[0], nj = cell[1] + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n && matrix[ni][nj] > matrix[cell[0]][cell[1]]) {
                    if (--inDegree[ni][nj] == 0) {
                        queue.offer(new int[]{ni, nj});
                    }
                }
            }
        }
    }
    return layers;
}
```

```python []
# lc 329, topological sort BFS, O(m*n) time, O(m*n) space.
class SolutionBFS:
    def longestIncreasingPath(self, matrix: List[List[int]]) -> int:
        m, n = len(matrix), len(matrix[0])
        indegree = [[0] * n for _ in range(m)]
        dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]]
        for r in range(m):  # O(m*n) build indegree
            for c in range(n):
                for d in dirs:
                    nr, nc = r + d[0], c + d[1]
                    if 0 <= nr < m and 0 <= nc < n and matrix[nr][nc] < matrix[r][c]:
                        indegree[r][c] += 1
        q = deque()
        for r in range(m):
            for c in range(n):
                if indegree[r][c] == 0:  # local minima as BFS sources
                    q.append([r, c])
        res = 0
        while len(q) > 0:  # each level = one step in longest path
            s = len(q)
            for i in range(s):
                r, c = q.popleft()
                for d in dirs:
                    nr, nc = r + d[0], c + d[1]
                    if 0 <= nr < m and 0 <= nc < n and matrix[nr][nc] > matrix[r][c]:
                        indegree[nr][nc] -= 1
                        if indegree[nr][nc] == 0:
                            q.append([nr, nc])
            res += 1
        return res
```

```cpp []
// lc 329, topological sort BFS, O(m*n) time, O(m*n) space.
int longestIncreasingPathBFS(vector<vector<int>>& matrix) {
    if (matrix.empty()) return 0;
    int m = matrix.size(), n = matrix[0].size();
    int dirs[4][2] = {{0,1},{0,-1},{1,0},{-1,0}};
    vector<vector<int>> indegree(m, vector<int>(n, 0)); // O(m*n) space

    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            for (auto& d : dirs) {
                int ni = i + d[0], nj = j + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n && matrix[ni][nj] < matrix[i][j])
                    indegree[i][j]++; // edge from smaller neighbor to this cell
            }

    queue<pair<int,int>> q;
    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (indegree[i][j] == 0)
                q.push({i, j}); // start BFS from local minima

    int layers = 0;
    while (!q.empty()) {
        int sz = q.size();
        layers++; // each BFS layer = one step in longest path
        while (sz--) {
            auto [x, y] = q.front(); q.pop();
            for (auto& d : dirs) {
                int nx = x + d[0], ny = y + d[1];
                if (nx >= 0 && nx < m && ny >= 0 && ny < n && matrix[nx][ny] > matrix[x][y]) {
                    if (--indegree[nx][ny] == 0)
                        q.push({nx, ny});
                }
            }
        }
    }
    return layers;
}
```

```rust []
// lc 329, topological sort BFS, O(m*n) time, O(m*n) space.
pub fn longest_increasing_path_bfs(matrix: Vec<Vec<i32>>) -> i32 {
    let m = matrix.len();
    if m == 0 { return 0; }
    let n = matrix[0].len();
    let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];

    let mut indegree = vec![vec![0u32; n]; m]; // O(m*n) space
    for i in 0..m {
        for j in 0..n {
            for &(di, dj) in &dirs {
                let ni = i as i32 + di;
                let nj = j as i32 + dj;
                if ni >= 0 && ni < m as i32 && nj >= 0 && nj < n as i32 {
                    let (ni, nj) = (ni as usize, nj as usize);
                    if matrix[ni][nj] < matrix[i][j] {
                        indegree[i][j] += 1;
                    }
                }
            }
        }
    }

    let mut queue = VecDeque::new();
    for i in 0..m {
        for j in 0..n {
            if indegree[i][j] == 0 {
                queue.push_back((i, j)); // local minima
            }
        }
    }

    let mut layers = 0;
    while !queue.is_empty() {
        layers += 1;
        for _ in 0..queue.len() {
            let (i, j) = queue.pop_front().unwrap();
            for &(di, dj) in &dirs {
                let ni = i as i32 + di;
                let nj = j as i32 + dj;
                if ni >= 0 && ni < m as i32 && nj >= 0 && nj < n as i32 {
                    let (ni, nj) = (ni as usize, nj as usize);
                    if matrix[ni][nj] > matrix[i][j] {
                        indegree[ni][nj] -= 1;
                        if indegree[ni][nj] == 0 {
                            queue.push_back((ni, nj));
                        }
                    }
                }
            }
        }
    }
    layers
}
```
