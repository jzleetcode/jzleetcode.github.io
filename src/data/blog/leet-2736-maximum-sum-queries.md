---
author: JZ
pubDatetime: 2026-11-12T20:09:42Z
modDatetime: 2026-11-12T20:09:42Z
title: LeetCode 2736 Maximum Sum Queries
featured: true
tags:
  - a-array
  - a-line-sweep
  - a-sorting
description: "Solutions for LeetCode 2736, hard, tags: array, sorting, offline queries, Fenwick tree."
---

## Table of contents

## Description

Question Links: [LeetCode 2736](https://leetcode.com/problems/maximum-sum-queries/description/)

You are given two arrays, `nums1` and `nums2`, with the same length. Each query `[x, y]` asks for the largest sum `nums1[i] + nums2[i]` among indices where `nums1[i] >= x` and `nums2[i] >= y`. Return `-1` when no index satisfies both conditions.

Example 1:

```text
Input: nums1 = [4, 3, 1, 2], nums2 = [2, 4, 9, 5], queries = [[4, 1], [1, 3], [2, 5]]
Output: [6, 10, 7]
```

Example 2:

```text
Input: nums1 = [3, 2, 5], nums2 = [2, 3, 4], queries = [[4, 4], [3, 2], [1, 1]]
Output: [9, 9, 9]
```

Example 3:

```text
Input: nums1 = [2, 1], nums2 = [2, 3], queries = [[3, 3]]
Output: [-1]
```

Constraints:

- `nums1.length == nums2.length`
- `n == nums1.length`
- `1 <= n <= 10^5`
- `1 <= nums1[i], nums2[i] <= 10^9`
- `1 <= queries.length <= 10^5`
- `queries[i].length == 2`
- `queries[i] = [x_i, y_i]`
- `1 <= x_i, y_i <= 10^9`

## Idea

Treat each index as a point `(a, b)` with score `a + b`. Sort the points by `a` from largest to smallest, and sort the queries by `x` in the same order. While processing a query, add every point with `a >= x` to a Fenwick tree. Since these points remain eligible as `x` decreases, each point is inserted only once.

The tree is indexed by compressed `b` values and stores the largest score at each Fenwick position. Queries ask for the best score with `b >= y`, which is a suffix over ascending `b` coordinates. Reverse the compressed ranks so that this suffix becomes a Fenwick prefix query:

```text
b (ascending):       2       4       9
Fenwick index:        3       2       1
query y = 4 includes:         [2       1]  -> prefix maximum through index 2
```

The lower-bound position of `y` also handles thresholds between stored coordinates. If no point qualifies, the Fenwick query returns `-1`. Save each answer at the query's original index because the sweep processes queries in sorted order.

For Example 1, the queries are processed by descending `x`:

```text
query [4, 1]: add (4, 2), best sum 6
query [2, 5]: add (3, 4) and (2, 5), best sum 7
query [1, 3]: add (1, 9), best sum 10
```

Those results are written back in the input order, producing `[6, 10, 7]`.

Sorting costs `O(n log n + q log q)`. Each point update and query uses `O(log n)` Fenwick operations. Total time is `O(n log n + q log q + (n + q) log n)`, and auxiliary space is `O(n + q)`.

### Java

```java []
package array;

import java.util.Arrays;

/**
 * LeetCode 2736. Hard. Tags: array, sorting, binary indexed tree.
 * Offline descending sweep with a Fenwick tree of maximum sums.
 * Sorting costs O(n log n + q log q); the sweep costs O((n + q) log n).
 * O(n + q) extra space.
 */
public final class MaximumSumQueries {

    private MaximumSumQueries() {
    }

    public static int[] maximumSumQueries(int[] nums1, int[] nums2, int[][] queries) {
        int n = nums1.length;
        int[][] points = new int[n][2];
        for (int i = 0; i < n; i++) {
            points[i][0] = nums1[i];
            points[i][1] = nums2[i];
        }
        Arrays.sort(points, (a, b) -> Integer.compare(b[0], a[0]));

        int[] coordinates = nums2.clone();
        Arrays.sort(coordinates);
        int distinct = 0;
        for (int coordinate : coordinates) {
            if (distinct == 0 || coordinate != coordinates[distinct - 1]) {
                coordinates[distinct++] = coordinate;
            }
        }

        Integer[] order = new Integer[queries.length];
        for (int i = 0; i < order.length; i++) {
            order[i] = i;
        }
        Arrays.sort(order, (a, b) -> Integer.compare(queries[b][0], queries[a][0]));

        int[] maxima = new int[distinct + 1];
        Arrays.fill(maxima, -1);
        int[] answers = new int[queries.length];
        Arrays.fill(answers, -1);
        int next = 0;
        for (int queryIndex : order) {
            int[] query = queries[queryIndex];
            // Each point enters once; reversed ranks make b >= y a prefix query.
            while (next < n && points[next][0] >= query[0]) {
                int[] point = points[next++];
                int rank = distinct - lowerBound(coordinates, distinct, point[1]);
                int sum = point[0] + point[1];
                // Fenwick maximum update visits O(log n) ancestors.
                for (int i = rank; i <= distinct; i += i & -i) {
                    maxima[i] = Math.max(maxima[i], sum);
                }
            }
            int rank = distinct - lowerBound(coordinates, distinct, query[1]);
            // Prefix maximum visits O(log n) disjoint Fenwick ranges.
            for (int i = rank; i > 0; i -= i & -i) {
                answers[queryIndex] = Math.max(answers[queryIndex], maxima[i]);
            }
        }
        return answers;
    }

    // First coordinate >= target in O(log n), including targets absent from nums2.
    private static int lowerBound(int[] coordinates, int length, int target) {
        int left = 0;
        int right = length;
        while (left < right) {
            int middle = left + (right - left) / 2;
            if (coordinates[middle] < target) {
                left = middle + 1;
            } else {
                right = middle;
            }
        }
        return left;
    }
}
```

### Python

```python []
from bisect import bisect_left


class _FenwickMax:
    def __init__(self, size):
        self.tree = [-1] * (size + 1)

    def update(self, index, value):
        # Each point update visits O(log n) Fenwick nodes.
        while index < len(self.tree):
            self.tree[index] = max(self.tree[index], value)
            index += index & -index

    def query(self, index):
        # Each prefix maximum query visits O(log n) Fenwick nodes.
        best = -1
        while index > 0:
            best = max(best, self.tree[index])
            index -= index & -index
        return best


class Solution:
    def maximum_sum_queries(self, nums1, nums2, queries):
        # Sorting points and queries costs O(n log n + q log q).
        points = sorted(
            ((a, b, a + b) for a, b in zip(nums1, nums2)),
            key=lambda point: point[0],
            reverse=True,
        )
        query_order = sorted(
            range(len(queries)), key=lambda i: queries[i][0], reverse=True
        )

        coords = sorted(set(nums2))
        fenwick = _FenwickMax(len(coords))
        answers = [-1] * len(queries)
        point_index = 0

        # Each point is inserted once and each query is answered once, with
        # O(log n) Fenwick work per operation.
        for query_index in query_order:
            min_a, min_b = queries[query_index]
            while point_index < len(points) and points[point_index][0] >= min_a:
                a, b, total = points[point_index]
                # Reversing compressed b-ranks turns b >= min_b into a prefix.
                rank = bisect_left(coords, b)
                fenwick.update(len(coords) - rank, total)
                point_index += 1

            prefix_length = len(coords) - bisect_left(coords, min_b)
            answers[query_index] = fenwick.query(prefix_length)

        # Total time: O(n log n + q log q + (n + q) log n).
        # Auxiliary space: O(n + q) for points, coordinates, and query order.
        return answers
```

### C++

```cpp []
#ifndef LEETCODE_MAXIMUMSUMQUERIES_HPP
#define LEETCODE_MAXIMUMSUMQUERIES_HPP

#include <algorithm>
#include <numeric>
#include <utility>
#include <vector>

using namespace std;

class Solution {
public:
    vector<int> maximumSumQueries(vector<int> &nums1, vector<int> &nums2,
                                 vector<vector<int>> &queries) {
        const int n = static_cast<int>(nums1.size());
        vector<pair<int, int>> points;
        points.reserve(n);
        for (int i = 0; i < n; ++i) {
            points.emplace_back(nums1[i], nums2[i]);
        }
        sort(points.begin(), points.end(), [](const auto &a, const auto &b) {
            return a.first > b.first;
        });

        vector<int> coordinates = nums2;
        sort(coordinates.begin(), coordinates.end());
        coordinates.erase(unique(coordinates.begin(), coordinates.end()), coordinates.end());
        const int m = static_cast<int>(coordinates.size());

        vector<int> order(queries.size());
        iota(order.begin(), order.end(), 0);
        sort(order.begin(), order.end(), [&](int a, int b) {
            return queries[a][0] > queries[b][0];
        });

        // Reversed compressed coordinates turn b >= y into a prefix maximum.
        vector<int> fenwick(m + 1, -1);
        vector<int> result(queries.size(), -1);
        int next = 0;
        for (int qi : order) {
            const int x = queries[qi][0], y = queries[qi][1];
            while (next < n && points[next].first >= x) {
                const auto [a, b] = points[next++];
                const int rank = static_cast<int>(lower_bound(coordinates.begin(), coordinates.end(), b)
                                                  - coordinates.begin());
                for (int i = m - rank; i <= m; i += i & -i) {
                    fenwick[i] = max(fenwick[i], a + b);
                }
            }
            const int rank = static_cast<int>(lower_bound(coordinates.begin(), coordinates.end(), y)
                                              - coordinates.begin());
            for (int i = m - rank; i > 0; i -= i & -i) {
                result[qi] = max(result[qi], fenwick[i]);
            }
        }
        // Time: O(n log n + q log q + (n + q) log n), including query sorting.
        // Auxiliary space: O(n + q). Valid sums fit in int (at most 2,000,000,000).
        return result;
    }
};

#endif //LEETCODE_MAXIMUMSUMQUERIES_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Sweeps points and queries by descending x, with reversed compressed y
    /// coordinates turning a suffix maximum into a Fenwick prefix maximum.
    /// Time: O(n log n + q log q + (n + q) log n); space: O(n + q).
    pub fn maximum_sum_queries(
        nums1: Vec<i32>,
        nums2: Vec<i32>,
        queries: Vec<Vec<i32>>,
    ) -> Vec<i32> {
        let mut coordinates = nums2.clone();
        coordinates.sort_unstable();
        coordinates.dedup();
        let m = coordinates.len();

        let mut points: Vec<(i32, i32)> = nums1.into_iter().zip(nums2).collect();
        points.sort_unstable_by_key(|point| std::cmp::Reverse(point.0));
        let mut query_order: Vec<usize> = (0..queries.len()).collect();
        query_order.sort_unstable_by_key(|&i| std::cmp::Reverse(queries[i][0]));

        let mut tree = vec![-1; m + 1];
        let mut answers = vec![-1; queries.len()];
        let mut next_point = 0;
        for query_index in query_order {
            let x = queries[query_index][0];
            let y = queries[query_index][1];
            while next_point < points.len() && points[next_point].0 >= x {
                let (a, b) = points[next_point];
                // Larger b values have smaller, one-based Fenwick indices.
                let mut index = m - coordinates.binary_search(&b).unwrap();
                while index <= m {
                    tree[index] = tree[index].max(a + b);
                    index += index & index.wrapping_neg();
                }
                next_point += 1;
            }

            // The reversed prefix includes exactly the coordinates >= y.
            let mut index = m - coordinates.partition_point(|&b| b < y);
            while index > 0 {
                answers[query_index] = answers[query_index].max(tree[index]);
                index &= index - 1;
            }
        }
        answers
    }
}

#[cfg(test)]
mod tests {
    use super::Solution;

    #[test]
    fn official_example_one_preserves_query_order() {
        assert_eq!(
            Solution::maximum_sum_queries(
                vec![4, 3, 1, 2],
                vec![2, 4, 9, 5],
                vec![vec![4, 1], vec![1, 3], vec![2, 5]],
            ),
            vec![6, 10, 7]
        );
    }

    #[test]
    fn official_example_two_uses_the_best_qualifying_sum() {
        assert_eq!(
            Solution::maximum_sum_queries(
                vec![3, 2, 5],
                vec![2, 3, 4],
                vec![vec![4, 4], vec![3, 2], vec![1, 1]],
            ),
            vec![9, 9, 9]
        );
    }

    #[test]
    fn official_example_three_has_no_qualifying_point() {
        assert_eq!(
            Solution::maximum_sum_queries(vec![2, 1], vec![2, 3], vec![vec![3, 3]]),
            vec![-1]
        );
    }

    #[test]
    fn no_qualifying_x_or_y_returns_negative_one() {
        assert_eq!(
            Solution::maximum_sum_queries(
                vec![3, 5],
                vec![7, 2],
                vec![vec![6, 1], vec![1, 8], vec![4, 3], vec![3, 6]],
            ),
            vec![-1, -1, -1, 10]
        );
    }

    #[test]
    fn duplicate_coordinates_and_inclusive_boundaries_keep_the_maximum() {
        assert_eq!(
            Solution::maximum_sum_queries(
                vec![4, 7, 7, 2],
                vec![5, 5, 3, 9],
                vec![vec![7, 5], vec![7, 3], vec![4, 6], vec![2, 9], vec![1, 4]],
            ),
            vec![12, 12, -1, 11, 12]
        );
    }

    #[test]
    fn maximum_values_support_sums_up_to_two_billion() {
        assert_eq!(
            Solution::maximum_sum_queries(
                vec![1_000_000_000, 999_999_999],
                vec![1_000_000_000, 1_000_000_000],
                vec![vec![1_000_000_000, 1_000_000_000]],
            ),
            vec![2_000_000_000]
        );
    }
}
```
