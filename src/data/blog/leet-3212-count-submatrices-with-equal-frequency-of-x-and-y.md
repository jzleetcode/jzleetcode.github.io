---
author: JZ
pubDatetime: 2026-03-19T08:00:00Z
modDatetime: 2026-03-19T08:00:00Z
title: LeetCode 3212 Count Submatrices With Equal Frequency of X and Y
featured: true
tags:
  - a-array
  - a-matrix
  - a-prefix-sum
description:
  "Solutions for LeetCode 3212, medium, tags: array, matrix, prefix sum."
---

## Table of contents

## Description

Given a 2D character matrix `grid` containing `'X'`, `'Y'`, and `'.'`, return the number of submatrices that contain:

- `grid[0][0]` (top-left corner fixed at `(0,0)`)
- an **equal** frequency of `'X'` and `'Y'`
- **at least one** `'X'`

### Constraints

- `1 <= grid.length, grid[0].length <= 1000`
- `grid[i][j]` is either `'X'`, `'Y'`, or `'.'`.

### Examples

```
Input: grid = [["X","Y","."],["Y",".","."]]
Output: 3
Explanation: submatrices (0,0)→(0,1), (0,0)→(1,0), (0,0)→(1,1)
have equal X and Y counts and at least one X.
```

```
Input: grid = [["X","X"],["X","Y"]]
Output: 0
Explanation: no submatrix has equal X and Y frequency.
```

## Idea

Each submatrix is anchored at `(0,0)`, so it is uniquely determined by its bottom-right corner `(i,j)`. We need the count of `'X'` and `'Y'` in every such submatrix.

Instead of building a full 2D prefix-sum matrix ($O(mn)$ space), we use a rolling column-sum technique that only requires $O(n)$ extra space:

- `col_x[j]` accumulates `X` counts in column `j` from row `0` to the current row `i`.
- `col_y[j]` does the same for `Y`.
- As we scan columns left to right, `row_x` and `row_y` accumulate the total X and Y counts for the submatrix `(0,0) → (i,j)`.

```
For row i:
  row_x = row_y = 0
  For col j:
    col_x[j] += (grid[i][j] == 'X')
    col_y[j] += (grid[i][j] == 'Y')
    row_x += col_x[j]        ← total X in (0,0)→(i,j)
    row_y += col_y[j]        ← total Y in (0,0)→(i,j)
    if row_x == row_y and row_x > 0:
      count += 1
```

The key insight: `row_x = Σ col_x[0..j]` where `col_x[j] = Σ (grid[0..i][j]=='X')`. This is the same as the 2D prefix sum:

$$\text{prefix\_x}(i,j) = \sum_{r=0}^{i}\sum_{c=0}^{j} [grid[r][c] = \text{X}]$$

ASCII diagram — building column sums row by row, left to right:

```
grid:                col_x after row 0:    col_x after row 1:
[ X  Y  . ]          [1, 0, 0]             [1, 0, 0]
[ Y  .  . ]                                 ↓
                                            [1, 0, 0]

row_x scan (row 0):  1 → 1 → 1
row_y scan (row 0):  0 → 1 → 1
                          ✓       (1==1, >0)

row_x scan (row 1):  1 → 1 → 1
row_y scan (row 1):  1 → 1 → 1
                      ✓   ✓       (1==1, >0)

Total valid submatrices: 3
```

Complexity: Time $O(mn)$, Space $O(n)$.

### Java

```java
package array;

/**
 * LeetCode 3212. Medium.
 * <p>
 * Given a 2D char grid of 'X', 'Y', and '.', count submatrices with top-left at (0,0)
 * where the number of X equals the number of Y and that count is positive.
 * <p>
 * Column sums for X and Y; for each row, accumulate running sums over columns.
 * O(m * n) time, O(n) space.
 */
public class CountSubmatricesEqualFreqXY {

    // 18ms, 206.18mb
    public int numberOfSubmatrices(char[][] grid) {
        int m = grid.length;
        int n = grid[0].length;
        int res = 0;
        int[] colX = new int[n];
        int[] colY = new int[n];
        for (int i = 0; i < m; i++) {
            int rowX = 0;
            int rowY = 0;
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 'X') {
                    colX[j]++;
                }
                if (grid[i][j] == 'Y') {
                    colY[j]++;
                }
                rowX += colX[j];
                rowY += colY[j];
                if (rowX == rowY && rowX > 0) {
                    res++;
                }
            }
        }
        return res;
    }
}
```

### C++

```cpp
#ifndef LEETCODE_COUNTSUBMATRICESEQUALFREQXY_HPP
#define LEETCODE_COUNTSUBMATRICESEQUALFREQXY_HPP

#include <vector>

using namespace std;

class Solution {
public:
    // 15ms, 101.15Mb.
    int numberOfSubmatrices(vector<vector<char>> &grid) {
        const int m = static_cast<int>(grid.size());
        const int n = static_cast<int>(grid[0].size());
        int res = 0;
        vector<int> col_x(n, 0), col_y(n, 0);
        for (int i = 0; i < m; ++i) {
            int row_x = 0, row_y = 0;
            for (int j = 0; j < n; ++j) {
                col_x[j] += (grid[i][j] == 'X');
                col_y[j] += (grid[i][j] == 'Y');
                row_x += col_x[j];
                row_y += col_y[j];
                if (row_x == row_y && row_x > 0) {
                    ++res;
                }
            }
        }
        return res;
    }
};

#endif // LEETCODE_COUNTSUBMATRICESEQUALFREQXY_HPP
```

### Python

```python
"""leetcode 3212, medium"""
from typing import List


class Solution:
    # 351ms, 103.60mb
    def numberOfSubmatrices(self, grid: List[List[str]]) -> int:
        m, n = len(grid), len(grid[0])
        res = 0
        col_x, col_y = [0] * n, [0] * n
        for i in range(m):
            row_x = row_y = 0
            for j in range(n):
                col_x[j] += (grid[i][j] == 'X')
                col_y[j] += (grid[i][j] == 'Y')
                row_x += col_x[j]
                row_y += col_y[j]
                if row_x == row_y and row_x > 0:
                    res += 1
        return res
```

### Rust

```rust
/// LeetCode 3212 - Count Submatrices With Equal Frequency of X and Y
struct Solution;

impl Solution {
    // 19ms, 66.84mb
    pub fn number_of_submatrices(grid: Vec<Vec<char>>) -> i32 {
        let (m, n) = (grid.len(), grid[0].len());
        let (mut res, mut col_x, mut col_y) = (0i32, vec![0i32; n], vec![0i32; n]);
        for i in 0..m {
            let (mut row_x, mut row_y) = (0i32, 0i32);
            for j in 0..n {
                match grid[i][j] {
                    'X' => col_x[j] += 1,
                    'Y' => col_y[j] += 1,
                    _ => {}
                }
                row_x += col_x[j];
                row_y += col_y[j];
                if row_x == row_y && row_x > 0 {
                    res += 1;
                }
            }
        }
        res
    }
}
```
