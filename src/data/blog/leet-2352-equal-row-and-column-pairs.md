---
author: JZ
pubDatetime: 2026-10-08T19:15:40Z
modDatetime: 2026-10-08T19:15:40Z
title: LeetCode 2352 Equal Row and Column Pairs
featured: true
tags:
  - a-array
  - a-hash-table
  - a-matrix
description: "Solutions for LeetCode 2352, medium, tags: array, hash table, matrix."
---

## Table of contents

## Description

Link to Question: [LeetCode 2352](https://leetcode.com/problems/equal-row-and-column-pairs/description/)

Given an `n x n` integer matrix `grid`, return the number of pairs `(row, column)` whose row and column contain the same sequence of elements.

**Example 1**

```text
Input: grid = [[3,2,1],[1,7,6],[2,7,7]]
Output: 1
Explanation: The third row [2,7,7] equals the second column [2,7,7].
```

**Example 2**

```text
Input: grid = [[3,1,2,2],[1,4,4,5],[2,4,2,2],[2,4,2,2]]
Output: 3
Explanation: Row 0 equals column 0. Rows 2 and 3 each equal column 2.
```

**Constraints:**

- `1 <= n == grid.length == grid[i].length <= 200`
- `1 <= grid[i][j] <= 10^5`

## Idea

A row and a column are equal when their values match in order. Store each row as a tuple (or equivalent sequence key) and count how often it occurs. Then build each column from top to bottom and add the number of rows with the same key.

```text
grid row 2: [2, 7, 7]  -> row-key count = 1
grid col 1: [2, 7, 7]  -> add that count to the answer
```

Counting frequencies matters: if a row appears multiple times, each copy forms a separate pair with every matching column.

Complexity: The hash-map solution takes expected time $O(n^2)$ and extra space $O(n^2)$: storing `n` row keys uses $O(n^2)$ space, and each column key uses $O(n)$ transient space. The direct-comparison alternative takes time $O(n^3)$ and extra space $O(1)$.

### Java

```java []
package hash;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** LeetCode 2352. Medium. Tags: array, hash table, matrix. */
public final class EqualRowAndColumnPairs {

    private EqualRowAndColumnPairs() {
    }

    /** Expected O(n^2) time and O(n^2) space for the row-frequency map. */
    public static int equalPairs(int[][] grid) {
        int n = grid.length;
        Map<List<Integer>, Integer> rowFrequencies = new HashMap<>();
        for (int[] row : grid) { // n rows, each converted and hashed in O(n).
            List<Integer> rowKey = Arrays.stream(row).boxed().toList();
            rowFrequencies.merge(rowKey, 1, Integer::sum);
        }

        int pairs = 0;
        for (int columnIndex = 0; columnIndex < n; columnIndex++) { // n columns, each built in O(n).
            List<Integer> columnKey = new ArrayList<>(n);
            for (int rowIndex = 0; rowIndex < n; rowIndex++) {
                columnKey.add(grid[rowIndex][columnIndex]);
            }
            pairs += rowFrequencies.getOrDefault(columnKey, 0);
        }
        return pairs;
    }

    /** O(n^3) time and O(1) extra space. */
    public static int equalPairsBruteForce(int[][] grid) {
        int n = grid.length;
        int pairs = 0;
        for (int rowIndex = 0; rowIndex < n; rowIndex++) { // n rows * n columns * n values.
            for (int columnIndex = 0; columnIndex < n; columnIndex++) {
                boolean matches = true;
                for (int valueIndex = 0; valueIndex < n; valueIndex++) {
                    if (grid[rowIndex][valueIndex] != grid[valueIndex][columnIndex]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    pairs++;
                }
            }
        }
        return pairs;
    }
}
```

### Python

```python []
"""LeetCode 2352, medium, tags: array, hash table, matrix."""

from collections import Counter
from typing import List


class Solution:

    def equalPairs(self, grid: List[List[int]]) -> int:
        size = len(grid)
        # O(n^2) expected time and O(n^2) space for row and column signatures.
        row_counts = Counter(tuple(row) for row in grid)

        matches = 0
        for column_index in range(size):
            column = tuple(grid[row_index][column_index] for row_index in range(size))
            matches += row_counts[column]
        return matches

    def equalPairsBruteForce(self, grid: List[List[int]]) -> int:
        size = len(grid)
        matches = 0
        # O(n^3) time: compare each of the n^2 row-column pairs across n cells; O(1) extra space.
        for row_index in range(size):
            for column_index in range(size):
                for offset in range(size):
                    if grid[row_index][offset] != grid[offset][column_index]:
                        break
                else:
                    matches += 1
        return matches
```

### C++

```cpp []
#ifndef EQUALROWANDCOLUMNPAIRS_HPP
#define EQUALROWANDCOLUMNPAIRS_HPP

#include <string>
#include <unordered_map>
#include <vector>

using namespace std;

class SolutionEqualRowAndColumnPairs {
public:
    // Expected O(n^2) time and O(n^2) space for row signatures.
    int equalPairs(vector<vector<int>>& grid) {
        unordered_map<string, int> rowFrequencies;
        for (const vector<int>& row : grid)
            rowFrequencies[signature(row)]++;

        int pairs = 0;
        vector<int> column(grid.size());
        for (int columnIndex = 0; columnIndex < grid.size(); columnIndex++) {
            for (int rowIndex = 0; rowIndex < grid.size(); rowIndex++)
                column[rowIndex] = grid[rowIndex][columnIndex];
            pairs += rowFrequencies[signature(column)];
        }
        return pairs;
    }

    // O(n^3) time and O(1) space by comparing every row-column pair.
    int equalPairsBruteForce(vector<vector<int>>& grid) {
        int pairs = 0;
        for (int rowIndex = 0; rowIndex < grid.size(); rowIndex++)
            for (int columnIndex = 0; columnIndex < grid.size(); columnIndex++) {
                int elementIndex = 0;
                while (elementIndex < grid.size()
                       && grid[rowIndex][elementIndex] == grid[elementIndex][columnIndex])
                    elementIndex++;
                if (elementIndex == grid.size())
                    pairs++;
            }
        return pairs;
    }

private:
    static string signature(const vector<int>& values) {
        string result;
        for (int value : values)
            result += to_string(value) + ',';
        return result;
    }
};

#endif
```

### Rust

```rust []
/// leet 2352

use std::collections::HashMap;

pub struct Solution;

impl Solution {
    /// Expected O(n^2) time and O(n^2) space for the row-frequency map and column vectors.
    pub fn equal_pairs(grid: Vec<Vec<i32>>) -> i32 {
        let mut row_counts = HashMap::new();
        for row in &grid {
            *row_counts.entry(row.clone()).or_insert(0) += 1;
        }

        (0..grid.len())
            .map(|column| {
                let values = grid.iter().map(|row| row[column]).collect::<Vec<_>>();
                row_counts.get(&values).copied().unwrap_or(0)
            })
            .sum()
    }

    /// O(n^3) time and O(1) extra space by comparing every row with every column directly.
    pub fn equal_pairs_brute_force(grid: Vec<Vec<i32>>) -> i32 {
        let size = grid.len();
        let mut pairs = 0;

        for row in 0..size {
            for column in 0..size {
                if (0..size).all(|index| grid[row][index] == grid[index][column]) {
                    pairs += 1;
                }
            }
        }

        pairs
    }
}
```
