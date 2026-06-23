---
author: JZ
pubDatetime: 2026-06-23T10:07:00Z
modDatetime: 2026-06-23T10:07:00Z
title: LeetCode 130 Surrounded Regions
featured: true
tags:
  - a-bfs
  - a-union-find
  - a-matrix
  - a-graph
description:
  "Solutions for LeetCode 130, medium, tags: array, depth-first search, breadth-first search, union find, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 130](https://leetcode.com/problems/surrounded-regions/description/)

Given an `m x n` matrix `board` containing `'X'` and `'O'`, capture all regions that are 4-directionally surrounded by `'X'`.

A region is captured by flipping all `'O'`s into `'X'`s in that surrounded region.

```
Example 1:

Input: board = [["X","X","X","X"],["X","O","O","X"],["X","X","O","X"],["X","O","X","X"]]
Output: [["X","X","X","X"],["X","X","X","X"],["X","X","X","X"],["X","O","X","X"]]
Explanation: Notice that an 'O' should not be flipped if:
- It is on the border, or
- It is adjacent to an 'O' that should not be flipped.
The bottom 'O' is on the border, so it is not flipped.
The other three 'O's form a surrounded region, so they are flipped.

Example 2:

Input: board = [["X"]]
Output: [["X"]]
```

**Constraints:**

- `m == board.length`
- `n == board[i].length`
- `1 <= m, n <= 200`
- `board[i][j]` is `'X'` or `'O'`.

## Idea1

Instead of finding surrounded O's directly, we find O's that are **not** surrounded — those connected to any border cell. We use **BFS from the boundary**: enqueue all border O's, mark them as safe (`*`), then BFS inward marking all connected O's. After BFS, remaining O's are surrounded (flip to X), and `*` cells revert to O.

```
board:                 after BFS from border:     final:
X X X X               X X X X                    X X X X
X O O X    mark '*'   X O O X     flip O->X      X X X X
X X O X   -------->   X X O X    ---------->     X X X X
X O X X               X * X X    *->O            X O X X

border O at (3,1) marked '*', not connected to inner O's.
Inner O's at (1,1),(1,2),(2,2) remain 'O' after BFS -> flipped to 'X'.
```

Complexity: Time $O(m \cdot n)$ — each cell visited at most once. Space $O(m \cdot n)$ — queue can hold all cells in worst case.

### Java

```java []
// lc 130, DFS from boundary, O(mn) time, O(mn) space.
public void solveDfs(char[][] board) {
    if (board.length < 2 || board[0].length < 2) return;
    int m = board.length, n = board[0].length;
    for (int i = 0; i < m; i++) {
        boundaryDFS(board, i, 0);
        boundaryDFS(board, i, n - 1);
    }
    for (int j = 0; j < n; j++) {
        boundaryDFS(board, 0, j);
        boundaryDFS(board, m - 1, j);
    }
    for (int i = 0; i < m; i++)        // O(mn)
        for (int j = 0; j < n; j++) {
            if (board[i][j] == 'O') board[i][j] = 'X';
            else if (board[i][j] == '*') board[i][j] = 'O';
        }
}

private void boundaryDFS(char[][] board, int i, int j) {
    if (i < 0 || i > board.length - 1 || j < 0 || j > board[0].length - 1 || board[i][j] != 'O') return;
    board[i][j] = '*';
    boundaryDFS(board, i - 1, j);
    boundaryDFS(board, i + 1, j);
    boundaryDFS(board, i, j - 1);
    boundaryDFS(board, i, j + 1);
}
```

```python []
# lc 130, BFS from boundary, O(mn) time, O(mn) space.
def solve(self, board: list[list[str]]) -> None:
    if not board or not board[0]:
        return
    m, n = len(board), len(board[0])
    queue = deque()
    for i in range(m):
        for j in range(n):
            if (i == 0 or i == m - 1 or j == 0 or j == n - 1) and board[i][j] == 'O':
                queue.append((i, j))
                board[i][j] = '*'
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n and board[nr][nc] == 'O':
                board[nr][nc] = '*'
                queue.append((nr, nc))
    for i in range(m):  # O(mn)
        for j in range(n):
            if board[i][j] == 'O':
                board[i][j] = 'X'
            elif board[i][j] == '*':
                board[i][j] = 'O'
```

```cpp []
// lc 130, BFS from boundary, O(mn) time, O(mn) space.
void solveBfs(vector<vector<char>>& board) {
    int m = board.size();
    if (m == 0) return;
    int n = board[0].size();
    queue<pair<int, int>> q;
    for (int i = 0; i < m; i++) {
        if (board[i][0] == 'O') { board[i][0] = '#'; q.push({i, 0}); }
        if (board[i][n - 1] == 'O') { board[i][n - 1] = '#'; q.push({i, n - 1}); }
    }
    for (int j = 1; j < n - 1; j++) {
        if (board[0][j] == 'O') { board[0][j] = '#'; q.push({0, j}); }
        if (board[m - 1][j] == 'O') { board[m - 1][j] = '#'; q.push({m - 1, j}); }
    }
    int dirs[] = {0, 1, 0, -1, 0};
    while (!q.empty()) {
        auto [r, c] = q.front(); q.pop();
        for (int d = 0; d < 4; d++) {
            int nr = r + dirs[d], nc = c + dirs[d + 1];
            if (nr >= 0 && nr < m && nc >= 0 && nc < n && board[nr][nc] == 'O') {
                board[nr][nc] = '#';
                q.push({nr, nc});
            }
        }
    }
    for (int i = 0; i < m; i++)     // O(mn)
        for (int j = 0; j < n; j++) {
            if (board[i][j] == '#') board[i][j] = 'O';
            else if (board[i][j] == 'O') board[i][j] = 'X';
        }
}
```

```rust []
// lc 130, BFS from boundary, O(mn) time, O(mn) space.
pub fn solve_bfs(board: &mut Vec<Vec<char>>) {
    if board.is_empty() || board[0].is_empty() { return; }
    let m = board.len();
    let n = board[0].len();
    let mut queue = VecDeque::new();
    for i in 0..m {
        for j in 0..n {
            if (i == 0 || i == m - 1 || j == 0 || j == n - 1) && board[i][j] == 'O' {
                queue.push_back((i, j));
                board[i][j] = '*';
            }
        }
    }
    let dirs: [(i32, i32); 4] = [(-1, 0), (1, 0), (0, -1), (0, 1)];
    while let Some((x, y)) = queue.pop_front() {
        for (dx, dy) in &dirs {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0 && nx < m as i32 && ny >= 0 && ny < n as i32 {
                let (nx, ny) = (nx as usize, ny as usize);
                if board[nx][ny] == 'O' {
                    board[nx][ny] = '*';
                    queue.push_back((nx, ny));
                }
            }
        }
    }
    for i in 0..m {     // O(mn)
        for j in 0..n {
            match board[i][j] {
                'O' => board[i][j] = 'X',
                '*' => board[i][j] = 'O',
                _ => {}
            }
        }
    }
}
```

## Idea2

**Union-Find** approach: create a virtual "dummy" node representing the border. For every O cell on the border, union it with the dummy. For every O cell adjacent to another O, union them. After processing, any O whose root ≠ dummy's root is surrounded → flip to X.

```
index layout (4x4, dummy = 16):
 0  1  2  3
 4  5  6  7
 8  9 10 11
12 13 14 15    dummy=16

board[3][1]='O' on border -> union(13, 16)
board[1][1]='O' adjacent to board[1][2]='O' -> union(5, 6)
board[2][2]='O' adjacent to board[1][2]='O' -> union(10, 6)
None of {5, 6, 10} connected to 16 -> flip all to 'X'
Cell 13 connected to 16 -> keep as 'O'
```

Complexity: Time $O(m \cdot n \cdot \alpha(m \cdot n))$ ≈ $O(m \cdot n)$. Space $O(m \cdot n)$ for the parent/rank arrays.

### Java

```java []
// lc 130, Union-Find, O(mn * alpha(mn)) time, O(mn) space.
int[] parent, rank;

public void solveUF(char[][] board) {
    if (board.length < 2 || board[0].length < 2) return;
    int m = board.length, n = board[0].length;
    int dummy = m * n;
    parent = new int[m * n + 1];
    rank = new int[m * n + 1];
    for (int i = 0; i <= m * n; i++) parent[i] = i;

    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) {
            if (board[i][j] != 'O') continue;
            int idx = i * n + j;
            if (i == 0 || i == m - 1 || j == 0 || j == n - 1) union(idx, dummy);
            if (i > 0 && board[i - 1][j] == 'O') union(idx, (i - 1) * n + j);
            if (j > 0 && board[i][j - 1] == 'O') union(idx, i * n + j - 1);
        }

    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (board[i][j] == 'O' && find(i * n + j) != find(dummy))
                board[i][j] = 'X';
}

private int find(int x) {
    while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
}

private void union(int x, int y) {
    int px = find(x), py = find(y);
    if (px == py) return;
    if (rank[px] < rank[py]) { int t = px; px = py; py = t; }
    parent[py] = px;
    if (rank[px] == rank[py]) rank[px]++;
}
```

```python []
# lc 130, Union-Find, O(mn * alpha(mn)) time, O(mn) space.
def solve(self, board: list[list[str]]) -> None:
    if not board or not board[0]:
        return
    m, n = len(board), len(board[0])
    parent = list(range(m * n + 1))
    rank = [0] * (m * n + 1)
    dummy = m * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px == py: return
        if rank[px] < rank[py]: px, py = py, px
        parent[py] = px
        if rank[px] == rank[py]: rank[px] += 1

    for i in range(m):
        for j in range(n):
            if board[i][j] != 'O': continue
            idx = i * n + j
            if i == 0 or i == m - 1 or j == 0 or j == n - 1:
                union(idx, dummy)
            if i > 0 and board[i - 1][j] == 'O':
                union(idx, (i - 1) * n + j)
            if j > 0 and board[i][j - 1] == 'O':
                union(idx, i * n + j - 1)

    for i in range(m):
        for j in range(n):
            if board[i][j] == 'O' and find(i * n + j) != find(dummy):
                board[i][j] = 'X'
```

```cpp []
// lc 130, Union-Find, O(mn * alpha(mn)) time, O(mn) space.
void solveUF(vector<vector<char>>& board) {
    int m = board.size();
    if (m == 0) return;
    int n = board[0].size();
    int total = m * n, dummy = total;
    vector<int> par(total + 1), rnk(total + 1, 0);
    for (int i = 0; i <= total; i++) par[i] = i;

    function<int(int)> find = [&](int x) -> int {
        while (par[x] != x) { par[x] = par[par[x]]; x = par[x]; }
        return x;
    };
    auto unite = [&](int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return;
        if (rnk[a] < rnk[b]) swap(a, b);
        par[b] = a;
        if (rnk[a] == rnk[b]) rnk[a]++;
    };

    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++) {
            if (board[i][j] != 'O') continue;
            int idx = i * n + j;
            if (i == 0 || i == m - 1 || j == 0 || j == n - 1) unite(idx, dummy);
            if (i + 1 < m && board[i + 1][j] == 'O') unite(idx, (i + 1) * n + j);
            if (j + 1 < n && board[i][j + 1] == 'O') unite(idx, i * n + j + 1);
        }

    for (int i = 0; i < m; i++)
        for (int j = 0; j < n; j++)
            if (board[i][j] == 'O' && find(i * n + j) != find(dummy))
                board[i][j] = 'X';
}
```

```rust []
// lc 130, Union-Find, O(mn * alpha(mn)) time, O(mn) space.
pub fn solve_union_find(board: &mut Vec<Vec<char>>) {
    if board.is_empty() || board[0].is_empty() { return; }
    let m = board.len();
    let n = board[0].len();
    let dummy = m * n;
    let mut uf = UnionFind::new(m * n + 1);

    for i in 0..m {
        for j in 0..n {
            if board[i][j] != 'O' { continue; }
            let idx = i * n + j;
            if i == 0 || i == m - 1 || j == 0 || j == n - 1 {
                uf.union(idx, dummy);
            }
            if i + 1 < m && board[i + 1][j] == 'O' { uf.union(idx, (i + 1) * n + j); }
            if j + 1 < n && board[i][j + 1] == 'O' { uf.union(idx, i * n + j + 1); }
        }
    }

    for i in 0..m {
        for j in 0..n {
            if board[i][j] == 'O' && !uf.connected(i * n + j, dummy) {
                board[i][j] = 'X';
            }
        }
    }
}
```
