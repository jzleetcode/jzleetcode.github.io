---
author: JZ
pubDatetime: 2026-09-28T12:00:00Z
modDatetime: 2026-09-28T12:00:00Z
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

According to Wikipedia's article: "The Game of Life, also known simply as Life, is a cellular automaton devised by the British mathematician John Horton Conway in 1970."

The board is made up of an `m x n` grid of cells, where each cell has an initial state: live (represented by a `1`) or dead (represented by a `0`). Each cell interacts with its eight neighbors (horizontal, vertical, diagonal) using the following four rules:

1. Any live cell with fewer than two live neighbors dies as if caused by under-population.
2. Any live cell with two or three live neighbors lives on to the next generation.
3. Any live cell with more than three live neighbors dies, as if by over-population.
4. Any dead cell with exactly three live neighbors becomes a live cell, as if by reproduction.

The next state is created by applying the above rules **simultaneously** to every cell in the current state. Given the current state of the `m x n` grid `board`, return the next state.

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
- `board[i][j]` is `0` or `1`.

**Follow up:**

- Could you solve it in-place? Remember that the board needs to be updated simultaneously.
- In principle, the board is infinite. How would you address live cells reaching the border?

## Idea 1: In-place State Encoding

The key challenge is that all cells must update simultaneously — we cannot overwrite a cell's value before its neighbors have read it. The trick is to encode both the current and next state in the same integer using two bits:

- Bit 0 (least significant): current state
- Bit 1: next state

```
Encoding scheme:

  Value  |  Bit 1 (next)  |  Bit 0 (current)  |  Meaning
  -------+----------------+--------------------+------------------
    0    |       0        |        0           |  dead  → dead
    1    |       0        |        1           |  alive → dead
    2    |       1        |        0           |  dead  → alive
    3    |       1        |        1           |  alive → alive
```

**Pass 1:** For each cell, count live neighbors using `& 1` (reads only the current state, ignoring any next-state bit already set on processed neighbors). If the cell should be alive next generation, set bit 1 with `|= 2`.

A cell lives in the next generation if:
- It has exactly 3 live neighbors (works for both alive and dead cells), OR
- It is alive and has exactly 2 live neighbors.

The Python solution includes `board[r][c]` in `count` (it counts itself). So the condition becomes: `count == 3` (dead cell with 3 neighbors, or alive with 2 neighbors) or `count - board[r][c] == 3` (alive cell with 3 neighbors).

**Pass 2:** Right-shift every cell by 1 to move the next state into the current-state position.

Complexity: Time $O(mn)$ — two passes over the board, each cell checks at most 8 neighbors. Space $O(1)$ — in-place, no extra board needed.

## Idea 2: Copy Board

Make a full copy of the board. Read neighbor values from the copy (which never changes), write updates to the original board. Straightforward application of the four rules.

Complexity: Time $O(mn)$ — one pass, each cell checks 8 neighbors. Space $O(mn)$ — the copy.

### Java

```java []
// Solution 1: in-place state encoding. O(mn) time, O(1) space.
public void gameOfLife(int[][] board) {
    int m = board.length, n = board[0].length;
    for (int r = 0; r < m; r++) {
        for (int c = 0; c < n; c++) {
            int count = 0;
            for (int i = Math.max(r - 1, 0); i < Math.min(r + 2, m); i++) // O(1), at most 3
                for (int j = Math.max(c - 1, 0); j < Math.min(c + 2, n); j++) // O(1), at most 3
                    count += board[i][j] & 1;
            // [2nd bit, 1st bit] use 2nd bit to store next state
            if (count == 3 || count - board[r][c] == 3) board[r][c] |= 2; // rules 2,4
        }
    }
    for (int r = 0; r < m; r++)
        for (int c = 0; c < n; c++)
            board[r][c] >>= 1;
}
```

### Python

```python []
# Solution 1: in-place state encoding. O(mn) time, O(1) space.
def gameOfLife(self, board: list[list[int]]) -> None:
    m, n = len(board), len(board[0])
    for r in range(m):  # O(m)
        for c in range(n):  # O(n)
            count = 0
            for i in range(max(r - 1, 0), min(r + 2, m)):  # O(1), at most 3
                for j in range(max(c - 1, 0), min(c + 2, n)):  # O(1), at most 3
                    count += board[i][j] & 1
            # count includes board[r][c] itself
            if count == 3 or count - board[r][c] == 3:
                board[r][c] |= 2  # set next state to alive
    for r in range(m):  # O(m)
        for c in range(n):  # O(n)
            board[r][c] >>= 1
```

```python []
# Solution 2: copy board. O(mn) time, O(mn) space.
def gameOfLife(self, board: list[list[int]]) -> None:
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

### C++

```cpp []
// Solution 1: in-place state encoding. O(mn) time, O(1) space.
void gameOfLife(vector<vector<int>>& board) {
    int m = board.size(), n = board[0].size();
    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    // O(mn) first pass: compute next state and store in 2nd bit
    for (int i = 0; i < m; ++i) {
        for (int j = 0; j < n; ++j) {
            int live = 0;                           // O(1) neighbor count
            for (auto& d : dirs) {                  // O(8) = O(1) check all 8 neighbors
                int ni = i + d[0], nj = j + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n)
                    live += board[ni][nj] & 1;      // read current state from 1st bit
            }
            // Cell lives if: exactly 3 neighbors, or alive with exactly 2 neighbors
            if (live == 3 || (live == 2 && (board[i][j] & 1)))
                board[i][j] |= 2;                   // set 2nd bit for next state
        }
    }
    // O(mn) second pass: shift to get next state
    for (int i = 0; i < m; ++i)
        for (int j = 0; j < n; ++j)
            board[i][j] >>= 1;
}
```

```cpp []
// Solution 2: copy board. O(mn) time, O(mn) space.
void gameOfLife(vector<vector<int>>& board) {
    int m = board.size(), n = board[0].size();
    vector<vector<int>> copy = board;               // O(mn) space for board copy
    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    // O(mn) iterate every cell
    for (int i = 0; i < m; ++i) {
        for (int j = 0; j < n; ++j) {
            int live = 0;                           // O(1) neighbor count
            for (auto& d : dirs) {                  // O(8) = O(1) check all 8 neighbors
                int ni = i + d[0], nj = j + d[1];
                if (ni >= 0 && ni < m && nj >= 0 && nj < n)
                    live += copy[ni][nj];
            }
            if (copy[i][j] == 1 && (live < 2 || live > 3))
                board[i][j] = 0;                    // under/over-population: dies
            else if (copy[i][j] == 0 && live == 3)
                board[i][j] = 1;                    // reproduction: becomes alive
        }
    }
}
```

### Rust

```rust []
// Solution 1: in-place state encoding. O(mn) time, O(1) space.
pub fn game_of_life(board: &mut Vec<Vec<i32>>) {
    if board.is_empty() || board[0].is_empty() { return; }
    let m = board.len() as i32;
    let n = board[0].len() as i32;
    for i in 0..m {
        for j in 0..n {
            let mut live = 0;
            for di in -1..=1 {
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
    for row in board.iter_mut() {
        for cell in row.iter_mut() {
            *cell >>= 1;
        }
    }
}
```
