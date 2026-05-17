---
author: JZ
pubDatetime: 2026-05-07T06:00:00Z
modDatetime: 2026-05-07T06:00:00Z
title: LeetCode 84 Largest Rectangle in Histogram
featured: false
tags:
  - a-array
  - a-stack
  - a-monotonic-stack
description:
  "Solutions for LeetCode 84, hard, tags: array, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 84](https://leetcode.com/problems/largest-rectangle-in-histogram/description/)

Given an array of integers `heights` representing the histogram's bar height where the width of each bar is 1, return the area of the largest rectangle in the histogram.

```
Example 1:

Input: heights = [2,1,5,6,2,3]
Output: 10
Explanation: The largest rectangle has an area = 10 units (formed by heights[2]=5 and heights[3]=6, width=2... actually the rectangle of height 2, width 5 from index 1-5 is also 10. The max is from height 5, width 2).

Example 2:

Input: heights = [2,4]
Output: 4

Constraints:

1 <= heights.length <= 10^5
0 <= heights[i] <= 10^4
```

## Solution 1: Monotonic Stack

### Idea

We iterate through the histogram. For each bar, we use a **monotonic increasing stack** of indices. When we encounter a bar shorter than the top of the stack, we pop and calculate the area for the popped bar. The width extends from the new stack top (left boundary) to the current index (right boundary).

To handle remaining bars, we append a virtual bar of height 0 at index `n`.

```
heights = [2,1,5,6,2,3], virtual 0 appended

i=0: h=2, stack=[]      → push 0.         stack=[0]
i=1: h=1, stack=[0]     → 1<2, pop 0.
       height=2, width=1 (stack empty, width=i=1), area=2. push 1. stack=[1]
i=2: h=5, stack=[1]     → 5>1, push 2.    stack=[1,2]
i=3: h=6, stack=[1,2]   → 6>5, push 3.    stack=[1,2,3]
i=4: h=2, stack=[1,2,3] → 2<6, pop 3.
       height=6, width=4-2-1=1, area=6.
     → 2<5, pop 2.
       height=5, width=4-1-1=2, area=10.   ← max so far
     → 2>=1, push 4.    stack=[1,4]
i=5: h=3, stack=[1,4]   → 3>2, push 5.    stack=[1,4,5]
i=6: h=0 (virtual)      → pop 5: height=3, width=6-4-1=1, area=3.
     → pop 4: height=2, width=6-1-1=4, area=8.
     → pop 1: height=1, width=6 (empty), area=6.

Result: max_area = 10
```

Complexity: Time $O(n)$, Space $O(n)$.

Each index is pushed and popped at most once.

#### Java

```java []
public static int largestRectangleAreaStack(int[] heights) {
    int n = heights.length;
    Stack<Integer> stack = new Stack();
    int maxArea = 0;
    for (int i = 0; i <= n; i++) { // O(n)
        int h = i == n ? 0 : heights[i];
        while (!stack.isEmpty() && h < heights[stack.peek()]) { // each index pushed/popped once, O(n) total
            int curHeight = heights[stack.pop()];
            int prevIndex = stack.isEmpty() ? -1 : stack.peek();
            int area = curHeight * (i - prevIndex - 1);
            maxArea = Math.max(maxArea, area);
        }
        stack.push(i);
    }
    return maxArea; // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def largestRectangleArea(self, heights: list[int]) -> int:
        n = len(heights)
        stack = []  # monotonic increasing stack of indices
        max_area = 0
        for i in range(n + 1):  # O(n)
            h = 0 if i == n else heights[i]
            while stack and h < heights[stack[-1]]:  # each index pushed/popped once, O(n) total
                cur_height = heights[stack.pop()]
                width = i if not stack else i - stack[-1] - 1
                max_area = max(max_area, cur_height * width)
            stack.append(i)
        return max_area  # Time O(n), Space O(n)
```

#### C++

```cpp []
class Solution84 {
public:
    int largestRectangleAreaStack(vector<int> &heights) {
        int n = static_cast<int>(heights.size());
        stack<int> st; // monotonic increasing stack of indices
        int maxArea = 0;
        for (int i = 0; i <= n; i++) { // O(n)
            int h = i == n ? 0 : heights[i];
            while (!st.empty() && h < heights[st.top()]) { // each index pushed/popped once, O(n) total
                int curHeight = heights[st.top()];
                st.pop();
                int width = st.empty() ? i : i - st.top() - 1;
                maxArea = max(maxArea, curHeight * width);
            }
            st.push(i);
        }
        return maxArea; // Time O(n), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn largest_rectangle_area(heights: Vec<i32>) -> i32 {
        let n = heights.len();
        let mut stack: Vec<usize> = Vec::new(); // monotonic increasing stack of indices
        let mut max_area = 0i64;
        for i in 0..=n { // O(n)
            let h = if i == n { 0 } else { heights[i] };
            while let Some(&top) = stack.last() { // each index pushed/popped once, O(n) total
                if h < heights[top] {
                    stack.pop();
                    let width = if stack.is_empty() { i } else { i - stack.last().unwrap() - 1 };
                    max_area = max_area.max(heights[top] as i64 * width as i64);
                } else {
                    break;
                }
            }
            stack.push(i);
        }
        max_area as i32 // Time O(n), Space O(n)
    }
}
```

## Solution 2: Left/Right Wall Arrays

### Idea

For each bar `i`, find the nearest bar to the left that is shorter (`left_wall[i]`) and the nearest bar to the right that is shorter (`right_wall[i]`). The rectangle with height `heights[i]` has width `right_wall[i] - left_wall[i] - 1`.

We compute these arrays in $O(n)$ amortized time by "jumping" through previously computed walls — if `heights[p] >= heights[i]`, we know that everything between `left_wall[p]` and `p` is also `>= heights[i]`, so we jump to `left_wall[p]`.

```
heights = [2, 1, 5, 6, 2, 3]

left_wall:  [-1, -1,  1,  2,  1,  4]
right_wall: [ 1,  6,  4,  4,  6,  6]

areas:  2*(1-(-1)-1)=2, 1*(6-(-1)-1)=6, 5*(4-1-1)=10, 6*(4-2-1)=6, 2*(6-1-1)=8, 3*(6-4-1)=3
max = 10
```

Complexity: Time $O(n)$, Space $O(n)$.

The while loops are amortized $O(n)$ total because each "jump" moves past at least one element that won't be visited again.

#### Java

```java []
public int largestRectangleAreaArray(int[] heights) {
    int[] leftWall = new int[heights.length];
    int[] rightWall = new int[heights.length];
    rightWall[heights.length - 1] = heights.length;
    leftWall[0] = -1;
    for (int i = 1; i < heights.length; i++) { // O(n) amortized
        int p = i - 1;
        while (p >= 0 && heights[p] >= heights[i]) p = leftWall[p];
        leftWall[i] = p;
    }
    for (int i = heights.length - 2; i >= 0; i--) { // O(n) amortized
        int p = i + 1;
        while (p < heights.length && heights[p] >= heights[i]) p = rightWall[p];
        rightWall[i] = p;
    }
    int maxArea = 0;
    for (int i = 0; i < heights.length; i++) // O(n)
        maxArea = Math.max(maxArea, heights[i] * (rightWall[i] - leftWall[i] - 1));
    return maxArea; // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution2:
    def largestRectangleArea(self, heights: list[int]) -> int:
        n = len(heights)
        left_wall = [-1] * n
        right_wall = [n] * n
        for i in range(1, n):  # O(n) amortized
            p = i - 1
            while p >= 0 and heights[p] >= heights[i]:
                p = left_wall[p]
            left_wall[i] = p
        for i in range(n - 2, -1, -1):  # O(n) amortized
            p = i + 1
            while p < n and heights[p] >= heights[i]:
                p = right_wall[p]
            right_wall[i] = p
        max_area = 0
        for i in range(n):  # O(n)
            max_area = max(max_area, heights[i] * (right_wall[i] - left_wall[i] - 1))
        return max_area  # Time O(n), Space O(n)
```

#### C++

```cpp []
int largestRectangleAreaArray(vector<int> &heights) {
    int n = static_cast<int>(heights.size());
    vector<int> leftWall(n, -1), rightWall(n, n);
    for (int i = 1; i < n; i++) { // O(n) amortized
        int p = i - 1;
        while (p >= 0 && heights[p] >= heights[i]) p = leftWall[p];
        leftWall[i] = p;
    }
    for (int i = n - 2; i >= 0; i--) { // O(n) amortized
        int p = i + 1;
        while (p < n && heights[p] >= heights[i]) p = rightWall[p];
        rightWall[i] = p;
    }
    int maxArea = 0;
    for (int i = 0; i < n; i++) // O(n)
        maxArea = max(maxArea, heights[i] * (rightWall[i] - leftWall[i] - 1));
    return maxArea; // Time O(n), Space O(n)
}
```

#### Rust

```rust []
pub fn largest_rectangle_area_array(heights: Vec<i32>) -> i32 {
    let n = heights.len();
    let mut left_wall = vec![-1i64; n];
    let mut right_wall = vec![n as i64; n];
    for i in 1..n { // O(n) amortized
        let mut p = i as i64 - 1;
        while p >= 0 && heights[p as usize] >= heights[i] {
            p = left_wall[p as usize];
        }
        left_wall[i] = p;
    }
    for i in (0..n.saturating_sub(1)).rev() { // O(n) amortized
        let mut p = i as i64 + 1;
        while p < n as i64 && heights[p as usize] >= heights[i] {
            p = right_wall[p as usize];
        }
        right_wall[i] = p;
    }
    let mut max_area: i64 = 0;
    for i in 0..n { // O(n)
        max_area = max_area.max(heights[i] as i64 * (right_wall[i] - left_wall[i] - 1));
    }
    max_area as i32 // Time O(n), Space O(n)
}
```
