---
author: JZ
pubDatetime: 2026-04-08T06:23:00Z
modDatetime: 2026-04-08T06:23:00Z
title: LeetCode 378 LintCode 1272 Kth Smallest Element in a Sorted Matrix
draft: true
featured: true
tags:
  - a-array
  - a-binary-search
  - a-heap
  - a-matrix
description:
  "Solutions for LeetCode 378 and LintCode 1272, medium, tags: array, binary search, heap, matrix."
---

## Table of contents

## Description

Question links: [LeetCode 378](https://leetcode.com/problems/kth-smallest-element-in-a-sorted-matrix/description/), [LintCode 1272](https://www.lintcode.com/problem/1272/)

LeetCode 378 and LintCode 1272 are the same question.

Given an `n x n` matrix where each row and each column is sorted in ascending order, return the `k`th smallest element in the matrix.

This is the `k`th smallest element in sorted order, not the `k`th distinct element.

```
Example 1:

Input:
matrix = [
  [1, 5, 9],
  [10, 11, 13],
  [12, 13, 15]
]
k = 8
Output: 13

Example 2:

Input:
matrix = [
  [-5]
]
k = 1
Output: -5
```

**Constraints:**

-   `n == matrix.length == matrix[i].length`
-   `1 <= n <= 300`
-   `-10^9 <= matrix[i][j] <= 10^9`
-   Each row and column is sorted in non-decreasing order
-   `1 <= k <= n^2`

**Challenge:**

-   If `k << n^2`, what is the best algorithm?
-   If `k ~ n^2`, what is the best algorithm?

## Idea1

Use binary search on the answer value.

For Example 1:

```text
matrix = [
  [1,  5,  9],
  [10, 11, 13],
  [12, 13, 15]
]
k = 8
```

The search range starts from the smallest and largest values in the matrix.

```text
      c0   c1   c2
  r0 [ 1]   5    9
  r1  10   11   13
  r2  12   13  [15]

left  = matrix[0][0] = 1
right = matrix[2][2] = 15
```

At each iteration:

1. Compute `mid = left + (right - left) // 2`
2. Count how many values are `<= mid`
3. If that count is `< k`, move `left = mid + 1`
4. Otherwise move `right = mid`

### Iteration 1

```text
      c0   c1   c2
  r0 [ 1]   5    9
  r1  10   11   13
  r2  12   13  [15]

left  = 1
right = 15
mid   = 8
```

Now count how many values are `<= 8`.

The helper starts from bottom-left and moves only `up` or `right`.

```text
count walk for mid = 8

step 1: examine [12]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2 [12]  13   15

12 > 8, move up
count = 0
```

```text
step 2: examine [10]

      c0   c1   c2
  r0   1    5    9
  r1 [10]  11   13
  r2  12   13   15

10 > 8, move up
count = 0
```

```text
step 3: examine [1]

      c0   c1   c2
  r0 [ 1]   5    9
  r1  10   11   13
  r2  12   13   15

1 <= 8, add row + 1 = 1
move right
count = 1
```

```text
step 4: examine [5]

      c0   c1   c2
  r0   1  [ 5]   9
  r1  10   11   13
  r2  12   13   15

5 <= 8, add row + 1 = 1
move right
count = 2
```

```text
step 5: examine [9]

      c0   c1   c2
  r0   1    5  [ 9]
  r1  10   11   13
  r2  12   13   15

9 > 8, move up and stop
final count = 2
```

Since `2 < 8`, the answer must be larger than `8`.

```text
next range:

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12   13  [15]

left  = 9
right = 15
```

### Iteration 2

```text
      c0   c1   c2
  r0   1    5  [ 9]
  r1  10   11   13
  r2  12   13  [15]

left  = 9
right = 15
mid   = 12
```

Count how many values are `<= 12`.

```text
count walk for mid = 12

step 1: examine [12]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2 [12]  13   15

12 <= 12, add row + 1 = 3
move right
count = 3
```

```text
step 2: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12  [13]  15

13 > 12, move up
count = 3
```

```text
step 3: examine [11]

      c0   c1   c2
  r0   1    5    9
  r1  10  [11]  13
  r2  12   13   15

11 <= 12, add row + 1 = 2
move right
count = 5
```

```text
step 4: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

13 > 12, move up
count = 5
```

```text
step 5: examine [9]

      c0   c1   c2
  r0   1    5  [ 9]
  r1  10   11   13
  r2  12   13   15

9 <= 12, add row + 1 = 1
move right and stop
final count = 6
```

Since `6 < 8`, the answer must be larger than `12`.

```text
next range:

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12   13  [15]

left  = 13
right = 15
```

### Iteration 3

```text
      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13  [15]

left  = 13
right = 15
mid   = 14
```

Count how many values are `<= 14`.

```text
count walk for mid = 14

step 1: examine [12]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2 [12]  13   15

12 <= 14, add row + 1 = 3
move right
count = 3
```

```text
step 2: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12  [13]  15

13 <= 14, add row + 1 = 3
move right
count = 6
```

```text
step 3: examine [15]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12   13  [15]

15 > 14, move up
count = 6
```

```text
step 4: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

13 <= 14, add row + 1 = 2
move right and stop
final count = 8
```

Since `8 >= 8`, `14` could be the answer, but we should keep searching the smaller half.

```text
next range:

      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

left  = 13
right = 14
```

### Iteration 4

```text
      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

left  = 13
right = 14
mid   = 13
```

Count how many values are `<= 13`.

```text
count walk for mid = 13

step 1: examine [12]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2 [12]  13   15

12 <= 13, add row + 1 = 3
move right
count = 3
```

```text
step 2: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12  [13]  15

13 <= 13, add row + 1 = 3
move right
count = 6
```

```text
step 3: examine [15]

      c0   c1   c2
  r0   1    5    9
  r1  10   11   13
  r2  12   13  [15]

15 > 13, move up
count = 6
```

```text
step 4: examine [13]

      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

13 <= 13, add row + 1 = 2
move right and stop
final count = 8
```

Since `8 >= 8`, keep the smaller half again.

```text
next range:

      c0   c1   c2
  r0   1    5    9
  r1  10   11  [13]
  r2  12   13   15

left  = 13
right = 13
```

Now `left == right == 13`, so the answer is `13`.


Complexity: Time $O(n \log(\text{maxValue} - \text{minValue}))$, Space $O(1)$.

This is the best general solution, especially when `k` is large.

## Idea2

Use a min heap and treat each row like a sorted list.

1. Put the first element from each row into the min heap.
2. Pop the smallest element.
3. Push the next element from the same row.
4. Repeat `k` times.

This is the same idea as merging `n` sorted lists, except each row contributes at most one active candidate to the heap at a time.

Complexity: Time $O(k \log n)$, Space $O(n)$.

This is especially good when `k << n^2`.

## Java

```java
public class KthSmallestMatrix {
    int m, n;

    public int kthSmallest(int[][] matrix, int k) {
        m = matrix.length;
        n = matrix[0].length;
        int left = matrix[0][0], right = matrix[m - 1][n - 1];
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (countLessOrEqual(matrix, mid) >= k) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        return left;
    }

    int countLessOrEqual(int[][] matrix, int x) {
        int cnt = 0, c = n - 1;
        for (int r = 0; r < m; ++r) {
            while (c >= 0 && matrix[r][c] > x) --c;
            cnt += c + 1;
        }
        return cnt;
    }

    public int kthSmallestHeap(int[][] matrix, int k) {
        int m = matrix.length, n = matrix[0].length, ans = -1;
        PriorityQueue<int[]> minHeap = new PriorityQueue<>(Comparator.comparingInt(o -> o[0]));
        for (int r = 0; r < Math.min(m, k); ++r) {
            minHeap.offer(new int[]{matrix[r][0], r, 0});
        }

        for (int i = 1; i <= k; ++i) {
            int[] top = minHeap.poll();
            int r = top[1], c = top[2];
            ans = top[0];
            if (c + 1 < n) {
                minHeap.offer(new int[]{matrix[r][c + 1], r, c + 1});
            }
        }
        return ans;
    }
}
```

## Python

```python
import heapq
from typing import List


class Solution:
    def kthSmallest(self, matrix: List[List[int]], k: int) -> int:
        left, right = matrix[0][0], matrix[-1][-1]
        while left < right:
            mid = left + (right - left) // 2
            if self._count_less_equal(matrix, mid) >= k:
                right = mid
            else:
                left = mid + 1
        return left

    def kthSmallestHeap(self, matrix: List[List[int]], k: int) -> int:
        n = len(matrix)
        heap = [(matrix[row][0], row, 0) for row in range(min(n, k))]
        heapq.heapify(heap)

        value = matrix[0][0]
        for _ in range(k):
            value, row, col = heapq.heappop(heap)
            if col + 1 < len(matrix[row]):
                heapq.heappush(heap, (matrix[row][col + 1], row, col + 1))
        return value

    @staticmethod
    def _count_less_equal(matrix: List[List[int]], target: int) -> int:
        n = len(matrix)
        row, col = n - 1, 0
        count = 0
        while row >= 0 and col < n:
            if matrix[row][col] <= target:
                count += row + 1
                col += 1
            else:
                row -= 1
        return count
```

## C++

```cpp
class Solution {
public:
    int kthSmallest(vector<vector<int>>& matrix, int k) {
        int left = matrix.front().front();
        int right = matrix.back().back();
        while (left < right) {
            int mid = left + (right - left) / 2;
            if (countLessEqual(matrix, mid) >= k) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        return left;
    }

    int kthSmallestHeap(vector<vector<int>>& matrix, int k) {
        priority_queue<tuple<int, int, int>, vector<tuple<int, int, int>>, greater<>> min_heap;
        int rows = static_cast<int>(matrix.size());
        for (int row = 0; row < min(rows, k); ++row) {
            min_heap.emplace(matrix[row][0], row, 0);
        }

        int value = matrix[0][0];
        for (int i = 0; i < k; ++i) {
            auto [cur, row, col] = min_heap.top();
            min_heap.pop();
            value = cur;
            if (col + 1 < static_cast<int>(matrix[row].size())) {
                min_heap.emplace(matrix[row][col + 1], row, col + 1);
            }
        }
        return value;
    }

private:
    int countLessEqual(const vector<vector<int>>& matrix, int target) {
        int row = static_cast<int>(matrix.size()) - 1;
        int col = 0;
        int count = 0;
        while (row >= 0 && col < static_cast<int>(matrix[0].size())) {
            if (matrix[row][col] <= target) {
                count += row + 1;
                ++col;
            } else {
                --row;
            }
        }
        return count;
    }
};
```

## Rust

```rust
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub struct Solution;

impl Solution {
    pub fn kth_smallest(matrix: Vec<Vec<i32>>, k: i32) -> i32 {
        let (mut left, mut right) = (matrix[0][0], matrix[matrix.len() - 1][matrix[0].len() - 1]);
        while left < right {
            let mid = left + (right - left) / 2;
            if Self::count_less_equal(&matrix, mid) >= k {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        left
    }

    pub fn kth_smallest_heap(matrix: Vec<Vec<i32>>, k: i32) -> i32 {
        let rows = matrix.len();
        let mut heap = BinaryHeap::new();
        for (row, values) in matrix.iter().enumerate().take(rows.min(k as usize)) {
            heap.push((Reverse(values[0]), row, 0usize));
        }

        let mut value = matrix[0][0];
        for _ in 0..k {
            let (Reverse(cur), row, col) = heap.pop().unwrap();
            value = cur;
            if col + 1 < matrix[row].len() {
                heap.push((Reverse(matrix[row][col + 1]), row, col + 1));
            }
        }
        value
    }

    fn count_less_equal(matrix: &[Vec<i32>], target: i32) -> i32 {
        let mut row = matrix.len() as i32 - 1;
        let mut col = 0usize;
        let mut count = 0i32;
        while row >= 0 && col < matrix[0].len() {
            if matrix[row as usize][col] <= target {
                count += row + 1;
                col += 1;
            } else {
                row -= 1;
            }
        }
        count
    }
}
```
