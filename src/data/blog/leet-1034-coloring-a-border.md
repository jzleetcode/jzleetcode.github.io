---
author: JZ
pubDatetime: 2026-10-25T18:47:58Z
modDatetime: 2026-10-25T18:47:58Z
title: "LeetCode 1034 Coloring A Border"
featured: true
tags:
  - a-array
  - a-bfs
  - a-matrix
description: "Iterative BFS solution for LeetCode 1034, Coloring A Border."
---

## Table of contents

## Description

Question Link: [LeetCode 1034](https://leetcode.com/problems/coloring-a-border/description/)

You are given an `m x n` integer matrix `grid` and a starting cell `(row, col)`. A connected component consists of cells with the starting cell's color that connect horizontally or vertically. A cell is on the component's border if it touches the edge of the grid or has a neighbor with a different color. Recolor only the border cells with `color` and return the grid.

**Constraints:**

- `m == grid.length`
- `n == grid[i].length`
- `1 <= m, n <= 50`
- `1 <= grid[i][j], color <= 1000`
- `0 <= row < m`
- `0 <= col < n`

## Idea: BFS, Then Recolor

Start a breadth-first search at `(row, col)` and visit only cells with the original color. For each visited cell, inspect its four neighbors. An out-of-bounds neighbor or a neighbor of another color makes that cell a border; otherwise, enqueue the unvisited same-color neighbor.

**Wait until the traversal finishes before changing any colors.** Recoloring a border cell during BFS would make an adjacent cell see a _new_ color and potentially mark an interior cell as a border. Store border coordinates and recolor them afterward. A separate `visited` grid ensures that every cell is processed at most once; disconnected regions of the same color are never visited.

```text
Original grid        Border recolored to 2
1 1 1                 2 2 2
1 1 1        --->     2 1 2
1 1 1                 2 2 2
```

Complexity: Time $O(m \times n)$, since each component cell is visited once and each border cell is recolored once. Space $O(m \times n)$ for visited cells, the BFS queue, and the border list. The grid is modified in place in Java, Python, and C++; Rust takes ownership of the input grid and returns it.

### Java

```java []
package graph;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

/** LeetCode 1034 - Coloring A Border. */
public final class ColoringABorder {
    private static final int[][] DIRECTIONS = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};

    private ColoringABorder() {
    }

    /**
     * Finds the four-directionally connected component using BFS, then recolors its border.
     * Keeps the original grid intact until border detection is complete.
     *
     * Time: O(m * n); space: O(m * n) for visited cells, the queue, and border cells.
     * Mutates and returns {@code grid}, where m and n are its row and column counts.
     */
    public static int[][] colorBorder(int[][] grid, int row, int col, int color) {
        int originalColor = grid[row][col];
        if (originalColor == color) return grid;

        int rows = grid.length;
        int cols = grid[0].length;
        boolean[][] visited = new boolean[rows][cols];
        Queue<int[]> queue = new ArrayDeque<>();
        List<int[]> borders = new ArrayList<>();
        visited[row][col] = true;
        queue.offer(new int[]{row, col});

        while (!queue.isEmpty()) {
            int[] cell = queue.poll();
            boolean isBorder = false;
            for (int[] direction : DIRECTIONS) {
                int nextRow = cell[0] + direction[0];
                int nextCol = cell[1] + direction[1];
                if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols
                        || grid[nextRow][nextCol] != originalColor) {
                    isBorder = true;
                } else if (!visited[nextRow][nextCol]) {
                    visited[nextRow][nextCol] = true;
                    queue.offer(new int[]{nextRow, nextCol});
                }
            }
            if (isBorder) borders.add(cell);
        }

        for (int[] cell : borders) {
            grid[cell[0]][cell[1]] = color;
        }
        return grid;
    }
}
```

### Python

```python []
"""LeetCode 1034: Coloring A Border."""

from collections import deque


class Solution:
    def colorBorder(self, grid: list[list[int]], row: int, col: int, color: int) -> list[list[int]]:
        """BFS, O(m*n) time and O(m*n) auxiliary space."""
        original = grid[row][col]
        if original == color:
            return grid

        rows, cols = len(grid), len(grid[0])
        seen = [[False] * cols for _ in range(rows)]
        seen[row][col] = True
        queue = deque([(row, col)])
        border = []

        while queue:  # O(m*n): each cell in the component is visited once.
            current_row, current_col = queue.popleft()
            is_border = False
            for delta_row, delta_col in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                next_row, next_col = current_row + delta_row, current_col + delta_col
                if not (0 <= next_row < rows and 0 <= next_col < cols):
                    is_border = True
                elif grid[next_row][next_col] != original:
                    is_border = True
                elif not seen[next_row][next_col]:
                    seen[next_row][next_col] = True
                    queue.append((next_row, next_col))
            if is_border:
                border.append((current_row, current_col))

        for border_row, border_col in border:  # O(m*n) worst case; colors change only after BFS.
            grid[border_row][border_col] = color
        return grid
```

### C++

```cpp []
#pragma once

#include <queue>
#include <utility>
#include <vector>

using namespace std;

// 1034. Coloring A Border
// O(m*n) time, O(m*n) space.
class ColoringABorder {
public:
    vector<vector<int>> colorBorder(vector<vector<int>>& grid, int row, int col, int color) {
        int originalColor = grid[row][col];
        if (originalColor == color) return grid;

        int rows = grid.size(), cols = grid[0].size();
        vector<vector<bool>> visited(rows, vector<bool>(cols, false));
        queue<pair<int, int>> cells;
        vector<pair<int, int>> border;
        int directions[] = {0, 1, 0, -1, 0};

        visited[row][col] = true;
        cells.push({row, col});
        while (!cells.empty()) {
            auto [currentRow, currentCol] = cells.front();
            cells.pop();
            bool isBorder = false;

            for (int direction = 0; direction < 4; direction++) {
                int nextRow = currentRow + directions[direction];
                int nextCol = currentCol + directions[direction + 1];
                if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
                    isBorder = true;
                } else if (grid[nextRow][nextCol] != originalColor) {
                    isBorder = true;
                } else if (!visited[nextRow][nextCol]) {
                    visited[nextRow][nextCol] = true;
                    cells.push({nextRow, nextCol});
                }
            }

            if (isBorder) border.push_back({currentRow, currentCol});
        }

        for (auto [borderRow, borderCol] : border)
            grid[borderRow][borderCol] = color;
        return grid;
    }
};
```

### Rust

```rust []
use std::collections::VecDeque;

pub struct Solution;

impl Solution {
    /// Time: O(m * n), Space: O(m * n) for visited cells, the queue, and borders.
    pub fn color_border(mut grid: Vec<Vec<i32>>, row: i32, col: i32, color: i32) -> Vec<Vec<i32>> {
        let (rows, cols) = (grid.len() as i32, grid[0].len() as i32);
        let original_color = grid[row as usize][col as usize];
        let mut visited = vec![vec![false; cols as usize]; rows as usize];
        let mut queue = VecDeque::new();
        let mut borders = Vec::new();
        visited[row as usize][col as usize] = true;
        queue.push_back((row, col));

        while let Some((current_row, current_col)) = queue.pop_front() {
            let mut is_border = false;
            for (delta_row, delta_col) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                let next_row = current_row + delta_row;
                let next_col = current_col + delta_col;
                if next_row < 0 || next_row >= rows || next_col < 0 || next_col >= cols {
                    is_border = true;
                    continue;
                }

                let (next_row_index, next_col_index) = (next_row as usize, next_col as usize);
                if grid[next_row_index][next_col_index] != original_color {
                    is_border = true;
                } else if !visited[next_row_index][next_col_index] {
                    visited[next_row_index][next_col_index] = true;
                    queue.push_back((next_row, next_col));
                }
            }
            if is_border {
                borders.push((current_row as usize, current_col as usize));
            }
        }

        for (border_row, border_col) in borders {
            grid[border_row][border_col] = color;
        }
        grid
    }
}
```
