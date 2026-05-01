---
author: JZ
pubDatetime: 2026-03-17T08:00:00Z
modDatetime: 2026-03-17T08:00:00Z
title: LeetCode 3070 Count Submatrices With Top-Left Element and Sum <= k
draft: true
featured: false
tags:
  - a-array
  - a-matrix
  - a-prefix-sum
description:
  "Solutions for LeetCode 3070, medium, tags: array, matrix, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 3070](https://leetcode.com/problems/count-submatrices-with-top-left-element-and-sum-less-than-or-equal-to-k/description/)

Given an `m x n` grid `grid` and an integer `k`, consider all submatrices whose top-left corner is the grid's top-left cell `(0,0)`. Count how many of those submatrices have sum `<= k`.

Example

```
Input: grid = [[7,6,3],[6,6,1]], k = 18
Output: 4
Explanation: The valid bottom-right corners are (0,0), (0,1), (1,0), (0,2).
```

## Idea

Each submatrix is uniquely determined by its bottom-right corner `(i,j)` since the top-left is fixed at `(0,0)`. We want the sum of `(0,0) -> (i,j)` for every cell. A convenient way is to build prefix sums row by row:

- Maintain `col_sum[j] = grid[0][j] + grid[1][j] + ... + grid[i][j]` for the current row `i`.
- As we scan columns left to right, keep `row_sum = col_sum[0] + ... + col_sum[j]`, which equals the submatrix sum for bottom-right `(i,j)`.

Update rules:

```
col_sum[j] += grid[i][j]
row_sum += col_sum[j]
```

If `row_sum <= k`, we count it. Since all values are non-negative, `row_sum` only increases as `j` moves right, so once `row_sum > k` we can `break` the inner loop early.

This is equivalent to the classic 2D prefix sum:

```
prefix(i,j) = grid(i,j)
            + prefix(i-1,j)
            + prefix(i,j-1)
            - prefix(i-1,j-1)
```

ASCII view (prefix sums are built left-to-right, top-to-bottom):

```
original grid:          prefix sum grid:
[ a  b  c ]             [ a  a+b  a+b+c ]
[ d  e  f ]     -->     [ a+d  a+b+d+e  a+b+c+d+e+f ]
```

Complexity: Time $O(mn)$, Space $O(n)$ extra for `col_sum` (the Java version uses in-place prefix sums for $O(1)$ extra space).

### Java

```java
package array;

/**
 * LeetCode 3070, medium, tags: array, matrix, prefix sum.
 * <p>
 * Given an m x n grid and an integer k, return the number of submatrices that have the top-left element at
 * grid[0][0] and a sum less than or equal to k.
 */
public class CountSubmatricesTopLeft {
    // O(mn) time, O(1) extra space (in-place prefix sum).
    // 6ms, 161.22Mb.
    static class Solution {
        public int countSubmatrices(int[][] grid, int k) {
            int m = grid.length;
            int n = grid[0].length;
            int res = 0;
            for (int r = 0; r < m; r++) {
                for (int c = 0; c < n; c++) {
                    int up = r > 0 ? grid[r - 1][c] : 0;
                    int left = c > 0 ? grid[r][c - 1] : 0;
                    int diag = (r > 0 && c > 0) ? grid[r - 1][c - 1] : 0;
                    grid[r][c] += up + left - diag;
                    if (grid[r][c] <= k) {
                        res++;
                    } else {
                        break;
                    }
                }
            }
            return res;
        }
    }
}
```

### C++

```cpp
#ifndef LEETCODE_COUNTSUBMATRICESWITHTOPLEFTELEMENT_HPP
#define LEETCODE_COUNTSUBMATRICESWITHTOPLEFTELEMENT_HPP

#include <vector>

using namespace std;

class Solution {
public:
    // 6ms, 91.18Mb.
    int resSubmatrices(vector<vector<int>> &grid, int k) {
        int res = 0;
        int m = static_cast<int>(grid.size()), n = static_cast<int>(grid[0].size());
        vector<int> col_sum(n);
        for (int i = 0; i < m; ++i) {
            long long row_sum = 0;
            for (int j = 0; j < n; ++j) {
                col_sum[j] += grid[i][j];
                row_sum += col_sum[j];
                if (row_sum <= k) {
                    ++res;
                } else {
                    break;
                }
            }
        }
        return res;
    }
};

#endif // LEETCODE_COUNTSUBMATRICESWITHTOPLEFTELEMENT_HPP
```

### Python

```python
"""leetcode 3070, medium"""
from typing import List


class Solution:
    """123 ms, 55.70 mb"""
    def countSubmatrices(self, grid: List[List[int]], k: int) -> int:
        m, n = len(grid), len(grid[0])
        res, col_sum = 0, [0] * n
        for i in range(m):
            cur = 0
            for j in range(n):
                col_sum[j] += grid[i][j]
                cur += col_sum[j]
                if cur <= k:
                    res += 1
                else:
                    break
        return res
```

### Rust

```rust
/// LeetCode 3070 - Count Submatrices With Top-Left Element and Sum Less Than or Equal to K
struct Solution;

impl Solution {
    // 0ms, 9mb
    pub fn count_submatrices(mut grid: Vec<Vec<i32>>, k: i32) -> i32 {
        let (m, n) = (grid.len(), grid[0].len());
        let (mut res, mut col_sum) = (0i32, vec![0i32; n]);
        for i in 0..m {
            let mut cur = 0;
            for j in 0..n {
                col_sum[j] += grid[i][j];
                cur += col_sum[j];
                if cur <= k {
                    res += 1;
                } else {
                    break;
                }
            }
        }
        res
    }
}

#[cfg(test)]
mod tests {
    use super::Solution;

    #[test]
    fn example_1() {
        let grid = vec![vec![7, 6, 3], vec![6, 6, 1]];
        assert_eq!(4, Solution::count_submatrices(grid, 18));
    }

    #[test]
    fn example_2() {
        let grid = vec![vec![7, 2, 9], vec![1, 5, 0], vec![2, 6, 6]];
        assert_eq!(6, Solution::count_submatrices(grid, 20));
    }

    #[test]
    fn edge_single_cell() {
        let grid = vec![vec![5]];
        assert_eq!(1, Solution::count_submatrices(grid, 5));
    }
}
```
