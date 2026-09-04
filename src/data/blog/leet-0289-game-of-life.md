---
author: JZ
pubDatetime: 2026-09-04T12:00:00Z
modDatetime: 2026-09-04T12:00:00Z
title: LeetCode 289 Game of Life
featured: true
tags:
  - a-array
  - a-matrix
  - a-simulation
description:
  "Solutions for LeetCode 289, medium, tags: array, matrix, simulation."
---

## Table of contents

## Description

Question Links: [LeetCode 289](https://leetcode.com/problems/game-of-life/description/)

The board is made up of an `m x n` grid of cells, where each cell has an initial state: live (represented by a `1`) or dead (represented by a `0`). Each cell interacts with its eight neighbors (horizontal, vertical, diagonal) using the following four rules:

1. Any live cell with fewer than two live neighbors dies (under-population).
2. Any live cell with two or three live neighbors lives on to the next generation.
3. Any live cell with more than three live neighbors dies (over-population).
4. Any dead cell with exactly three live neighbors becomes a live cell (reproduction).

The next state is created by applying the above rules **simultaneously** to every cell. Given the current state of the `m x n` grid `board`, return the next state.

```
Example 1:

Input: board = [[0,1,0],[0,0,1],[1,1,1],[0,0,0]]
Output: [[0,0,0],[1,0,1],[0,1,1],[0,1,0]]

Example 2:

Input: board = [[1,1],[1,0]]
Output: [[1,1],[1,1]]
```

**Constraints:**

- `m == board.length`
- `n == board[i].length`
- `1 <= m, n <= 25`
- `board[i][j]` is `0` or `1`

## Idea 1: In-place State Encoding

The key insight is to encode both the current state and the next state in the same integer. Since cells are `0` or `1`, only the lowest bit is used. We can use the 2nd bit to store the next state.

```
Encoding: [next_state, current_state]
  00 (0) → dead  → dead
  01 (1) → alive → dead    (will become 0 after shift)
  10 (2) → dead  → alive   (will become 1 after shift)
  11 (3) → alive → alive   (will become 1 after shift)
```

**Pass 1**: For each cell, count live neighbors using `& 1` (reads only the current state, ignoring any next-state bits already set). A cell lives in the next generation if:
- It has exactly 3 live neighbors (works for both dead and alive cells), OR
- It is alive and has exactly 2 live neighbors.

A compact way to check: if `count == 3` or `count - board[r][c] == 3` (i.e., 3 neighbors excluding self, and self is alive → total count is 4 but self contributes 1, so `count` with self included = neighbors + self).

**Pass 2**: Right-shift every cell by 1 bit to extract the next state.

```
Original:             After Pass 1 (2nd bit set):     After Pass 2 (>>1):
  0  1  0               0  1  0                         0  0  0
  0  0  1               0  0  1                         1  0  1
  1  1  1               1  3  3                         0  1  1
  0  0  0               0  2  0                         0  1  0
```

Complexity: Time $O(m \cdot n)$, Space $O(1)$.

### Java

```java []
// O(mn) time, O(1) space.
public void gameOfLife(int[][] board) {
    int m = board.length, n = board[0].length;
    for (int r = 0; r < m; r++) { // O(m)
        for (int c = 0; c < n; c++) { // O(n)
            int count = 0;
            for (int i = Math.max(r - 1, 0); i < Math.min(r + 2, m); i++) // O(1), at most 3
                for (int j = Math.max(c - 1, 0); j < Math.min(c + 2, n); j++) // O(1), at most 3
                    count += board[i][j] & 1;
            // [2nd bit, 1st bit] use 2nd bit to store next state
            if (count == 3 || count - board[r][c] == 3) board[r][c] |= 2; // rules 2,4
        }
    }
    for (int r = 0; r < m; r++) // O(m)
        for (int c = 0; c < n; c++) // O(n)
            board[r][c] >>= 1;
}
```

### Python

```python []
class Solution:
    def gameOfLife(self, board: list[list[int]]) -> None:
        """In-place with state encoding. O(mn) time, O(1) space."""
        m, n = len(board), len(board[0])
        for r in range(m):  # O(m)
            for c in range(n):  # O(n)
                count = 0
                for i in range(max(r - 1, 0), min(r + 2, m)):  # O(1), at most 3
                    for j in range(max(c - 1, 0), min(c + 2, n)):  # O(1), at most 3
                        count += board[i][j] & 1
                if count == 3 or count - board[r][c] == 3:
                    board[r][c] |= 2
        for r in range(m):  # O(m)
            for c in range(n):  # O(n)
                board[r][c] >>= 1
```

### C++

```cpp []
// O(mn) time, O(1) space.
void gameOfLife(vector<vector<int>>& board) {
    int m = board.size(), n = board[0].size();
    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    for (int i = 0; i < m; ++i) { // O(m)
        for (int j = 0; j < n; ++j) { // O(n)
            int live = 0;
            for (auto& d : dirs) { // O(8) = O(1)
                int ni = i + d[0], nj = j + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n)
                    live += board[ni][nj] & 1;
            }
            if (live == 3 || (live == 2 && (board[i][j] & 1)))
                board[i][j] |= 2;
        }
    }
    for (int i = 0; i < m; ++i) // O(m)
        for (int j = 0; j < n; ++j) // O(n)
            board[i][j] >>= 1;
}
```

### Rust

```rust []
// O(mn) time, O(1) space.
pub fn game_of_life(board: &mut Vec<Vec<i32>>) {
    let m = board.len() as i32;
    let n = board[0].len() as i32;
    for i in 0..m { // O(m)
        for j in 0..n { // O(n)
            let mut live = 0;
            for di in -1..=1 { // O(1), 8 neighbors
                for dj in -1..=1 {
                    if di == 0 && dj == 0 { continue; }
                    let ni = i + di;
                    let nj = j + dj;
                    if ni >= 0 && ni < m && nj >= 0 && nj < n {
                        live += board[ni as usize][nj as usize] & 1;
                    }
                }
            }
            let cur = board[i as usize][j as usize] & 1;
            if (cur == 1 && (live == 2 || live == 3)) || (cur == 0 && live == 3) {
                board[i as usize][j as usize] |= 2;
            }
        }
    }
    for row in board.iter_mut() { // O(m)
        for cell in row.iter_mut() { // O(n)
            *cell >>= 1;
        }
    }
}
```

## Idea 2: Copy Board

Make a copy of the board. Count live neighbors from the copy and apply rules directly to the original board.

Complexity: Time $O(m \cdot n)$, Space $O(m \cdot n)$.

### Python

```python []
class Solution2:
    def gameOfLife(self, board: list[list[int]]) -> None:
        """Copy board. O(mn) time, O(mn) space."""
        m, n = len(board), len(board[0])
        copy = [row[:] for row in board]  # O(mn) space
        dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
        for r in range(m):  # O(m)
            for c in range(n):  # O(n)
                count = sum(
                    copy[r + dr][c + dc]
                    for dr, dc in dirs  # O(1), 8 directions
                    if 0 <= r + dr < m and 0 <= c + dc < n
                )
                if board[r][c] == 1 and (count < 2 or count > 3):
                    board[r][c] = 0
                elif board[r][c] == 0 and count == 3:
                    board[r][c] = 1
```
