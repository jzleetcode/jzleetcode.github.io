---
author: JZ
pubDatetime: 2026-03-17T10:57:34Z
modDatetime: 2026-03-17T10:57:34Z
title: LeetCode 1727 Largest Submatrix With Rearrangements
featured: true
tags:
  - a-array
  - a-matrix
  - a-sorting
description:
  "Solutions for LeetCode 1727, medium, tags: array, matrix, sorting."
---

## Table of contents

## Description

Link to Question: [LeetCode 1727](https://leetcode.com/problems/largest-submatrix-with-rearrangements/)

You are given a binary matrix. You can rearrange the columns in each row independently. Return the area of the largest submatrix with all 1s after rearrangements.

```
Example 1:
Input: matrix = [[0,0,1],[1,1,1],[1,0,1]]
Output: 4
Explanation: Rearranging columns to [[1,0,0],[1,1,1],[1,1,0]] gives the largest 2x2 submatrix of 1s.

Example 2:
Input: matrix = [[1,0,1,0,1]]
Output: 3
```

**Constraints:**

-   `1 <= m, n <= 100`
-   `matrix[i][j]` is `0` or `1`

## Idea1 (Sort Heights Per Row)

Treat each row as the “bottom” of a histogram. Let `heights[c]` be the number of consecutive 1s ending at the current row in column `c`. For each row, sort `heights` descending, then the best area using this row as the bottom is:

-   width = `k + 1`
-   height = `sorted[k]`
-   area = `sorted[k] * (k + 1)`

Example snapshot for a row:

```
heights: [2,0,3,1]
sorted : [3,2,1,0]
areas  : 3*1, 2*2, 1*3, 0*4
```

```
Why area = sorted[k] * (k+1)?

After sorting descending, at index k we have height = sorted[k].
All columns [0..k] have height ≥ sorted[k], forming width k+1.

Example: sorted = [3, 2, 1, 0]

   ┌───┐                                        ┌───┬───┐
   │ 3 │                                        │ 2 │ 2 │
   ├───┼───┐                                    ├───┼───┤
   │ 3 │ 2 │                                    │ 2 │ 2 │
   ├───┼───┼───┐                                └───┴───┘
   │ 3 │ 2 │ 1 │                                 height=2
   └───┴───┴───┴───┘                             width=2
   col0 col1 col2 col3
   h=3  h=2  h=1  h=0                            area = 2*2 = 4 ✓

For k=0: col0 only → h=3, w=1 → area=3
For k=1: col0,1 → h=2 (col1 limits), w=2 → area=4
For k=2: col0,1,2 → h=1 (col2 limits), w=3 → area=3

```

Complexity: Time $O(m n \log n)$, Space $O(n)$.

### Java

```java
// Solution A: sort heights per row. O(r * c log c) time, O(c) extra space.
// 13ms, 114.70mb
public int largestSubmatrixSort(int[][] matrix) {
    int r = matrix.length, c = matrix[0].length;
    int[] heights = new int[c];
    int[] sorted = new int[c];
    int best = 0;
    for (int i = 0; i < r; i++) {
        for (int j = 0; j < c; j++) {
            if (matrix[i][j] == 1) heights[j] += 1;
            else heights[j] = 0;
        }
        System.arraycopy(heights, 0, sorted, 0, c);
        Arrays.sort(sorted); // ascending
        for (int j = 0; j < c; j++) {
            int h = sorted[j];
            if (h == 0) continue;
            int width = c - j;
            best = Math.max(best, h * width);
        }
    }
    return best;
}
```

### C++

```cpp
// LeetCode 1727
class Solution {
public:
    // 72ms, 93.48mb
    int largestSubmatrix(vector<vector<int>> &matrix) {
        int m = matrix.size();
        int n = matrix[0].size();
        vector<int> heights(n, 0);
        int best = 0;
        for (int i = 0; i < m; ++i) {
            for (int j = 0; j < n; ++j) {
                heights[j] = matrix[i][j] == 0 ? 0 : heights[j] + 1;
            }
            vector<int> row = heights;
            sort(row.rbegin(), row.rend());
            for (int k = 0; k < n; ++k) {
                if (row[k] == 0) break;
                best = max(best, row[k] * (k + 1));
            }
        }
        return best;
    }
};
```

### Python

```python
class Solution1:
    """Sort heights per row."""

    # 129ms, 33.62mb
    def largestSubmatrix(self, matrix: list[list[int]]) -> int:
        m, n = len(matrix), len(matrix[0])
        heights = [0] * n
        res = 0
        for i in range(m):
            row = matrix[i]
            for j in range(n):
                if row[j] == 1:
                    heights[j] += 1
                else:
                    heights[j] = 0
            sorted_heights = sorted(heights, reverse=True)
            for k, h in enumerate(sorted_heights):
                if h == 0:
                    break
                res = max(h * (k + 1), res)
        return res
```

### Rust

```rust
/// LeetCode 1727 - Largest Submatrix With Rearrangements
///
/// Solution A: sort heights per row
/// Solution B: counting sort heights per row
struct Solution;

impl Solution {
    // 4ms, 8mb
    pub fn largest_submatrix(matrix: Vec<Vec<i32>>) -> i32 {
        let m = matrix.len();
        let n = matrix[0].len();
        let mut heights = vec![0usize; n];
        let mut best = 0i32;

        for i in 0..m {
            for j in 0..n {
                if matrix[i][j] == 1 {
                    heights[j] += 1;
                } else {
                    heights[j] = 0;
                }
            }
            let mut sorted = heights.clone();
            sorted.sort_unstable_by(|a, b| b.cmp(a));
            for (k, h) in sorted.iter().enumerate() {
                if *h == 0 {
                    break;
                }
                let area = (*h as i32) * ((k + 1) as i32);
                if area > best {
                    best = area;
                }
            }
        }
        best
    }
}
```

## Idea2 (Incremental Sorted Heights)

We can avoid sorting each row. Keep `prev_heights` as a list of `(height, col)` sorted by height descending. For the next row:

-   For each `(height, col)` in `prev_heights`, if `matrix[row][col] == 1`, push `(height + 1, col)` into `heights`.
-   For columns not seen in `prev_heights` but with a `1`, append `(1, col)`.

Because all existing heights are incremented in order, the list remains sorted. Newly added `(1, col)` values go to the end, preserving order. Then the area at index `i` is `heights[i].height * (i + 1)`.

Complexity: Time $O(m n)$, Space $O(n)$.

### Java

```java
// Solution B: maintain sorted heights incrementally. O(r * c) time, O(c) extra space.
// 7ms, 112.01mb
public int largestSubmatrixCounting(int[][] matrix) {
    int r = matrix.length, c = matrix[0].length;
    int[] prevHeights = new int[c];
    int[] prevCols = new int[c];
    int[] curHeights = new int[c];
    int[] curCols = new int[c];
    boolean[] seen = new boolean[c];
    int prevLen = 0;
    int best = 0;
    for (int i = 0; i < r; i++) {
        Arrays.fill(seen, false);
        int curLen = 0;
        for (int k = 0; k < prevLen; k++) {
            int col = prevCols[k];
            if (matrix[i][col] == 1) {
                curHeights[curLen] = prevHeights[k] + 1;
                curCols[curLen] = col;
                seen[col] = true;
                curLen++;
            }
        }
        for (int col = 0; col < c; col++) {
            if (!seen[col] && matrix[i][col] == 1) {
                curHeights[curLen] = 1;
                curCols[curLen] = col;
                curLen++;
            }
        }
        for (int k = 0; k < curLen; k++) {
            best = Math.max(best, curHeights[k] * (k + 1));
        }
        int[] tmpHeights = prevHeights;
        prevHeights = curHeights;
        curHeights = tmpHeights;
        int[] tmpCols = prevCols;
        prevCols = curCols;
        curCols = tmpCols;
        prevLen = curLen;
    }
    return best;
}
```

### C++

```cpp
class Solution1 {
public:
    // 9ms, 85.21mb
    int largestSubmatrix(vector<vector<int>> &matrix) {
        int m = matrix.size();
        int n = matrix[0].size();
        vector<pair<int, int>> prev;
        vector<pair<int, int>> cur;
        vector<char> seen(n, 0);
        int best = 0;
        for (int i = 0; i < m; ++i) {
            fill(seen.begin(), seen.end(), 0);
            cur.clear();
            for (const auto &item: prev) {
                int h = item.first, col = item.second;
                if (matrix[i][col] == 1) {
                    cur.push_back({h + 1, col});
                    seen[col] = 1;
                }
            }
            for (int col = 0; col < n; ++col) {
                if (!seen[col] && matrix[i][col] == 1) {
                    cur.push_back({1, col});
                }
            }
            for (int k = 0; k < static_cast<int>(cur.size()); ++k) {
                best = max(best, cur[k].first * (k + 1));
            }
            prev.swap(cur);
        }
        return best;
    }
};
```

### Python

```python
class Solution2:
    """Maintain sorted heights incrementally without per-row sort."""

    # 159ms, 33.84mb
    def largestSubmatrix(self, matrix: list[list[int]]) -> int:
        m, n = len(matrix), len(matrix[0])
        prev_heights: list[tuple[int, int]] = []
        res = 0

        for row in range(m):
            heights: list[tuple[int, int]] = []
            seen = [False] * n

            for height, col in prev_heights:
                if matrix[row][col] == 1:
                    heights.append((height + 1, col))
                    seen[col] = True

            for col in range(n):
                if not seen[col] and matrix[row][col] == 1:
                    heights.append((1, col))

            for i, (h, _) in enumerate(heights):
                res = max(res, h * (i + 1))

            prev_heights = heights

        return res
```

### Rust

```rust
impl Solution {
    // 7ms, 8.62mb
    pub fn largest_submatrix_counting(matrix: Vec<Vec<i32>>) -> i32 {
        let m = matrix.len();
        let n = matrix[0].len();
        let mut prev: Vec<(usize, usize)> = Vec::new();
        let mut best = 0i32;

        for i in 0..m {
            let mut cur: Vec<(usize, usize)> = Vec::new();
            let mut seen = vec![false; n];

            for &(h, col) in prev.iter() {
                if matrix[i][col] == 1 {
                    cur.push((h + 1, col));
                    seen[col] = true;
                }
            }

            for col in 0..n {
                if !seen[col] && matrix[i][col] == 1 {
                    cur.push((1, col));
                }
            }

            for (idx, (h, _)) in cur.iter().enumerate() {
                let area = (*h as i32) * ((idx + 1) as i32);
                if area > best {
                    best = area;
                }
            }

            prev = cur;
        }
        best
    }
}
```
