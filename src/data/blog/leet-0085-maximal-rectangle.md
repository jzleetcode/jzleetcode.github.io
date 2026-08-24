---
author: JZ
pubDatetime: 2026-08-24T06:00:00Z
modDatetime: 2026-08-24T06:00:00Z
title: LeetCode 85 Maximal Rectangle
featured: true
tags:
  - a-array
  - a-dynamic-programming
  - a-stack
  - a-matrix
  - a-monotonic-stack
description:
  "Solutions for LeetCode 85, hard, tags: array, dynamic programming, stack, matrix, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 85](https://leetcode.com/problems/maximal-rectangle/description/)

Given a `rows x cols` binary matrix filled with `'0'`s and `'1'`s, find the largest rectangle containing only `'1'`s and return its area.

```
Example 1:

Input: matrix = [["1","0","1","0","0"],
                 ["1","0","1","1","1"],
                 ["1","1","1","1","1"],
                 ["1","0","0","1","0"]]
Output: 6
Explanation: The maximal rectangle is shown below (the 3x2 block of 1s in rows 1-2, cols 2-4).

Example 2:

Input: matrix = [["0"]]
Output: 0

Example 3:

Input: matrix = [["1"]]
Output: 1

Constraints:

rows == matrix.length
cols == matrix[i].length
1 <= rows, cols <= 200
matrix[i][j] is '0' or '1'.
```

## Solution 1: Histogram + Monotonic Stack

### Idea

This builds on [LeetCode 84 Largest Rectangle in Histogram](/posts/leet-0084-largest-rectangle-in-histogram). For each row, we compute a histogram where `heights[j]` = number of consecutive `'1'`s ending at that row in column `j`. Then we apply the largest-rectangle-in-histogram algorithm.

```
matrix:            histogram heights by row:
1 0 1 0 0         row 0: [1, 0, 1, 0, 0] → max rect = 1
1 0 1 1 1         row 1: [2, 0, 2, 1, 1] → max rect = 3
1 1 1 1 1         row 2: [3, 1, 3, 2, 2] → max rect = 6  ← answer
1 0 0 1 0         row 3: [4, 0, 0, 1, 0] → max rect = 4

For row 2, heights = [3, 1, 3, 2, 2]:
  Using monotonic stack: rectangle of height 2, width 3 (cols 2-4) gives area 6.
```

Complexity: Time $O(m \cdot n)$, Space $O(n)$.

The outer loop iterates `m` rows. For each row, updating heights is $O(n)$ and the monotonic stack processes each column at most twice (push + pop), so it is $O(n)$.

#### Java

```java []
public static int maximalRectangle(char[][] matrix) {
    if (matrix == null || matrix.length == 0 || matrix[0].length == 0) return 0;
    int m = matrix.length, n = matrix[0].length;
    int[] heights = new int[n];
    int maxArea = 0;
    for (int i = 0; i < m; i++) { // O(m) rows
        for (int j = 0; j < n; j++) { // O(n), build histogram for current row
            heights[j] = matrix[i][j] == '1' ? heights[j] + 1 : 0;
        }
        maxArea = Math.max(maxArea, largestRectangleInHistogram(heights));
    }
    return maxArea;
}

private static int largestRectangleInHistogram(int[] heights) {
    int n = heights.length;
    Stack<Integer> stack = new Stack<>();
    int maxArea = 0;
    for (int i = 0; i <= n; i++) { // O(n), each index pushed/popped once
        int h = i == n ? 0 : heights[i];
        while (!stack.isEmpty() && h < heights[stack.peek()]) {
            int curHeight = heights[stack.pop()];
            int prevIndex = stack.isEmpty() ? -1 : stack.peek();
            int area = curHeight * (i - prevIndex - 1);
            maxArea = Math.max(maxArea, area);
        }
        stack.push(i);
    }
    return maxArea;
}
```

#### Python

```python []
class Solution:
    def maximalRectangle(self, matrix: list[list[str]]) -> int:
        if not matrix or not matrix[0]:
            return 0
        m, n = len(matrix), len(matrix[0])
        heights = [0] * n
        max_area = 0
        for i in range(m):  # O(m)
            for j in range(n):  # O(n)
                heights[j] = heights[j] + 1 if matrix[i][j] == '1' else 0
            max_area = max(max_area, self._largest_rect(heights))
        return max_area  # Time O(m*n), Space O(n)

    def _largest_rect(self, heights: list[int]) -> int:
        n = len(heights)
        stack = []  # monotonic increasing stack of indices
        max_area = 0
        for i in range(n + 1):  # O(n), each index pushed/popped once
            h = 0 if i == n else heights[i]
            while stack and h < heights[stack[-1]]:
                cur_height = heights[stack.pop()]
                width = i if not stack else i - stack[-1] - 1
                max_area = max(max_area, cur_height * width)
            stack.append(i)
        return max_area
```

#### C++

```cpp []
class Solution {
public:
    int maximalRectangle(vector<vector<char>>& matrix) {
        if (matrix.empty() || matrix[0].empty()) return 0;
        int m = static_cast<int>(matrix.size());
        int n = static_cast<int>(matrix[0].size());
        vector<int> heights(n, 0);
        int maxArea = 0;
        for (int i = 0; i < m; i++) { // O(m) rows
            for (int j = 0; j < n; j++) { // O(n), update histogram
                heights[j] = matrix[i][j] == '1' ? heights[j] + 1 : 0;
            }
            maxArea = max(maxArea, largestRectangleArea(heights));
        }
        return maxArea; // Total: O(m*n)
    }

private:
    int largestRectangleArea(vector<int>& heights) {
        int n = static_cast<int>(heights.size());
        stack<int> st; // monotonic increasing stack of indices
        int maxArea = 0;
        for (int i = 0; i <= n; i++) { // O(n), each index pushed/popped once
            int h = i == n ? 0 : heights[i];
            while (!st.empty() && h < heights[st.top()]) {
                int curHeight = heights[st.top()];
                st.pop();
                int width = st.empty() ? i : i - st.top() - 1;
                maxArea = max(maxArea, curHeight * width);
            }
            st.push(i);
        }
        return maxArea;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn maximal_rectangle(matrix: Vec<Vec<char>>) -> i32 {
        if matrix.is_empty() || matrix[0].is_empty() {
            return 0;
        }
        let cols = matrix[0].len();
        let mut heights = vec![0i32; cols];
        let mut max_area = 0;
        for row in &matrix { // O(m)
            for j in 0..cols { // O(n), update histogram
                heights[j] = if row[j] == '1' { heights[j] + 1 } else { 0 };
            }
            max_area = max_area.max(Self::largest_rectangle_area(&heights));
        }
        max_area
    }

    fn largest_rectangle_area(heights: &[i32]) -> i32 {
        let n = heights.len();
        let mut stack: Vec<usize> = Vec::new();
        let mut max_area = 0;
        for i in 0..=n { // O(n), each index pushed/popped once
            let cur_h = if i == n { 0 } else { heights[i] };
            while let Some(&top) = stack.last() {
                if heights[top] <= cur_h { break; }
                stack.pop();
                let h = heights[top];
                let w = if let Some(&left) = stack.last() {
                    i as i32 - left as i32 - 1
                } else {
                    i as i32
                };
                max_area = max_area.max(h * w);
            }
            stack.push(i);
        }
        max_area
    }
}
```

## Solution 2: DP (Height / Left / Right)

### Idea

For each cell `(i, j)`, maintain three values:
- `height[j]`: number of consecutive `'1'`s ending at row `i` in column `j`
- `left[j]`: leftmost column where the rectangle of `height[j]` can extend
- `right[j]`: one past the rightmost column (exclusive boundary)

The area at `(i, j)` is `height[j] * (right[j] - left[j])`.

```
matrix:
1 0 1 0 0
1 0 1 1 1
1 1 1 1 1
1 0 0 1 0

Row 2 state:
height: [3, 1, 3, 2, 2]
left:   [0, 0, 2, 2, 2]    ← left boundary constrained by current and previous rows
right:  [1, 5, 5, 5, 5]    ← right boundary constrained by current and previous rows

Areas:  3*(1-0)=3, 1*(5-0)=5, 3*(5-2)=9? No — let's trace carefully:
  j=0: height=3, left=0, right=1, area=3*1=3
  j=1: height=1, left=0, right=5, area=1*5=5
  j=2: height=3, left=2, right=5, area=3*3=9? Actually right is constrained...

Actually the answer 6 comes from row 1 or 2. Let me trace row 1:
height: [2, 0, 2, 1, 1]
left:   [0, 0, 2, 2, 2]
right:  [1, 5, 5, 5, 5]    (right resets to n=5 at j=1 since matrix[1][1]='0')

j=3: height=1, left=2, right=5, area=1*3=3
j=2: height=2, left=2, right=5, area=2*3=6  ← answer
```

Complexity: Time $O(m \cdot n)$, Space $O(n)$.

Three passes per row (left→right for height+left, right→left for right, left→right for area), each $O(n)$.

#### Java

```java []
public static int maximalRectangleDP(char[][] matrix) {
    if (matrix == null || matrix.length == 0 || matrix[0].length == 0) return 0;
    int m = matrix.length, n = matrix[0].length;
    int[] height = new int[n];
    int[] left = new int[n];
    int[] right = new int[n];
    java.util.Arrays.fill(right, n);
    int maxArea = 0;
    for (int i = 0; i < m; i++) { // O(m) rows
        int curLeft = 0, curRight = n;
        for (int j = 0; j < n; j++) { // O(n), update height and left
            if (matrix[i][j] == '1') {
                height[j]++;
                left[j] = Math.max(left[j], curLeft);
            } else {
                height[j] = 0;
                left[j] = 0;
                curLeft = j + 1;
            }
        }
        for (int j = n - 1; j >= 0; j--) { // O(n), update right
            if (matrix[i][j] == '1') {
                right[j] = Math.min(right[j], curRight);
            } else {
                right[j] = n;
                curRight = j;
            }
        }
        for (int j = 0; j < n; j++) { // O(n), compute area
            maxArea = Math.max(maxArea, height[j] * (right[j] - left[j]));
        }
    }
    return maxArea;
}
```

#### Python

```python []
class Solution2:
    def maximalRectangle(self, matrix: list[list[str]]) -> int:
        if not matrix or not matrix[0]:
            return 0
        m, n = len(matrix), len(matrix[0])
        height = [0] * n
        left = [0] * n
        right = [n] * n
        max_area = 0
        for i in range(m):  # O(m)
            cur_left, cur_right = 0, n
            for j in range(n):  # O(n), update height and left
                if matrix[i][j] == '1':
                    height[j] += 1
                    left[j] = max(left[j], cur_left)
                else:
                    height[j] = 0
                    left[j] = 0
                    cur_left = j + 1
            for j in range(n - 1, -1, -1):  # O(n), update right
                if matrix[i][j] == '1':
                    right[j] = min(right[j], cur_right)
                else:
                    right[j] = n
                    cur_right = j
            for j in range(n):  # O(n), compute area
                max_area = max(max_area, height[j] * (right[j] - left[j]))
        return max_area  # Time O(m*n), Space O(n)
```

#### C++

```cpp []
class Solution2 {
public:
    int maximalRectangle(vector<vector<char>>& matrix) {
        if (matrix.empty() || matrix[0].empty()) return 0;
        int m = static_cast<int>(matrix.size());
        int n = static_cast<int>(matrix[0].size());
        vector<int> height(n, 0), left(n, 0), right(n, n);
        int maxArea = 0;
        for (int i = 0; i < m; i++) { // O(m) rows
            int curLeft = 0, curRight = n;
            for (int j = 0; j < n; j++) { // O(n), update height and left
                if (matrix[i][j] == '1') {
                    height[j]++;
                    left[j] = max(left[j], curLeft);
                } else {
                    height[j] = 0;
                    left[j] = 0;
                    curLeft = j + 1;
                }
            }
            for (int j = n - 1; j >= 0; j--) { // O(n), update right
                if (matrix[i][j] == '1') {
                    right[j] = min(right[j], curRight);
                } else {
                    right[j] = n;
                    curRight = j;
                }
            }
            for (int j = 0; j < n; j++) { // O(n), compute area
                maxArea = max(maxArea, height[j] * (right[j] - left[j]));
            }
        }
        return maxArea; // Total: O(m*n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn maximal_rectangle_dp(matrix: Vec<Vec<char>>) -> i32 {
        if matrix.is_empty() || matrix[0].is_empty() {
            return 0;
        }
        let rows = matrix.len();
        let cols = matrix[0].len();
        let mut height = vec![0i32; cols];
        let mut left = vec![0i32; cols];
        let mut right = vec![cols as i32; cols];
        let mut max_area = 0;
        for i in 0..rows { // O(m)
            let mut cur_left = 0i32;
            let mut cur_right = cols as i32;
            for j in 0..cols { // O(n), update heights and left
                if matrix[i][j] == '1' {
                    height[j] += 1;
                    left[j] = left[j].max(cur_left);
                } else {
                    height[j] = 0;
                    left[j] = 0;
                    cur_left = j as i32 + 1;
                }
            }
            for j in (0..cols).rev() { // O(n), update right
                if matrix[i][j] == '1' {
                    right[j] = right[j].min(cur_right);
                } else {
                    right[j] = cols as i32;
                    cur_right = j as i32;
                }
            }
            for j in 0..cols { // O(n), compute area
                max_area = max_area.max(height[j] * (right[j] - left[j]));
            }
        }
        max_area
    }
}
```
