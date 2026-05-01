---
author: JZ
pubDatetime: 2026-04-13T10:00:00Z
modDatetime: 2026-04-13T10:00:00Z
title: LeetCode 42 Trapping Rain Water
featured: false
tags:
  - a-array
  - a-two-pointers
  - a-stack
  - a-monotonic-stack
description:
  "Solutions for LeetCode 42, hard, tags: array, two pointers, dynamic programming, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 42](https://leetcode.com/problems/trapping-rain-water/description/)

Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.

```
Example 1:

Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]
Output: 6
Explanation: The above elevation map is represented by array [0,1,0,2,1,0,1,3,2,1,2,1].
In this case, 6 units of rain water are being trapped.

Example 2:

Input: height = [4,2,0,3,2,5]
Output: 9

Constraints:

n == height.length
1 <= n <= 2 * 10^4
0 <= height[i] <= 10^5
```

## Solution 1: Two Pointers

### Idea

The key insight: water trapped at any position depends on the minimum of the tallest bar to its left and the tallest bar to its right, minus the height at that position. Instead of precomputing these with DP arrays, we can use two pointers converging from both ends.

We maintain `leftMax` and `rightMax` as we move inward. At each step, we process the shorter side because we know the water there is bounded by the shorter max — the other side is guaranteed to be at least as tall.

```
height = [0,1,0,2,1,0,1,3,2,1,2,1]

L                         R       leftMax=0, rightMax=0
  L                       R       leftMax=1, rightMax=1
  L                     R         rightMax=2, water+=2-1=1
    L                   R         leftMax=1, water+=1-0=1
      L                 R         leftMax=2, rightMax=2
      L               R           rightMax=2, water+=2-1=1
        L             R           leftMax=2, water+=2-1=1
          L           R           leftMax=2, water+=2-0=2
            L         R           leftMax=2, water+=2-1=1 (incorrect trace)
```

More precisely, let's trace on Example 2: `height = [4,2,0,3,2,5]`

```
L=0, R=5: h[0]=4 < h[5]=5 → leftMax=4, water+=4-4=0. L=1
L=1, R=5: h[1]=2 < h[5]=5 → leftMax=4, water+=4-2=2. L=2
L=2, R=5: h[2]=0 < h[5]=5 → leftMax=4, water+=4-0=4. L=3
L=3, R=5: h[3]=3 < h[5]=5 → leftMax=4, water+=4-3=1. L=4
L=4, R=5: h[4]=2 < h[5]=5 → leftMax=4, water+=4-2=2. L=5
Total: 0+2+4+1+2 = 9 ✓
```

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
// O(n) time, O(1) space. Two pointers tracking left max and right max walls.
static class Solution {
    public int trap(int[] height) {
        if (height == null || height.length < 3) return 0;
        int left = 0, right = height.length - 1;
        int leftMax = 0, rightMax = 0, res = 0;
        while (left < right) { // converge from both ends
            if (height[left] < height[right]) { // process shorter side
                if (height[left] >= leftMax) leftMax = height[left]; // update left wall
                else res += leftMax - height[left]; // water trapped at left
                left++;
            } else {
                if (height[right] >= rightMax) rightMax = height[right]; // update right wall
                else res += rightMax - height[right]; // water trapped at right
                right--;
            }
        }
        return res;
    }
}
```

#### Python

```python []
class Solution:
    def trap(self, height: list[int]) -> int:
        """Two pointers approach. Time O(n), Space O(1)."""
        l, r = 0, len(height) - 1  # O(1)
        l_max, r_max, res = 0, 0, 0
        while l < r:  # O(n), each element visited at most once
            if height[l] <= height[r]:
                l_max = max(l_max, height[l])
                res += l_max - height[l]  # water trapped at index l
                l += 1
            else:
                r_max = max(r_max, height[r])
                res += r_max - height[r]  # water trapped at index r
                r -= 1
        return res
```

#### C++

```cpp []
// Solution 1: Two Pointers - Time O(n), Space O(1)
class Solution {
public:
    int trap(vector<int>& height) {
        int n = height.size();
        if (n <= 2) return 0;
        int left = 0, right = n - 1;       // O(1) two boundary pointers
        int leftMax = 0, rightMax = 0;      // O(1) track max from each side
        int water = 0;
        while (left < right) {              // O(n) single pass from both ends
            if (height[left] < height[right]) {
                if (height[left] >= leftMax)
                    leftMax = height[left]; // update left max boundary
                else
                    water += leftMax - height[left]; // trapped = leftMax - current
                ++left;
            } else {
                if (height[right] >= rightMax)
                    rightMax = height[right]; // update right max boundary
                else
                    water += rightMax - height[right]; // trapped = rightMax - current
                --right;
            }
        }
        return water;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn trap(height: Vec<i32>) -> i32 {
        if height.len() < 3 { return 0; }
        let mut left = 0usize;
        let mut right = height.len() - 1;
        let mut left_max = height[left]; // tallest bar seen from the left
        let mut right_max = height[right]; // tallest bar seen from the right
        let mut water = 0i32;
        while left < right {
            if left_max <= right_max {
                // water at `left` is bounded by left_max (the shorter side)
                left += 1;
                left_max = left_max.max(height[left]);
                water += left_max - height[left]; // O(1) per position
            } else {
                // water at `right` is bounded by right_max
                right -= 1;
                right_max = right_max.max(height[right]);
                water += right_max - height[right]; // O(1) per position
            }
        }
        water
    }
}
```

## Solution 2: Monotonic Stack

### Idea

We maintain a **monotonic decreasing stack** of indices. When we encounter a bar taller than the stack top, we have found a right wall for the valley. We pop the bottom of the pool, and if there's a left wall remaining on the stack, we compute the rectangular area of water trapped between the left wall, right wall (current bar), and the bottom.

Each index is pushed and popped at most once, so the total work is $O(n)$.

```
height = [0,1,0,2,1,0,1,3,2,1,2,1]

i=0: h=0, stack=[]       → push 0.              stack=[0]
i=1: h=1, stack=[0]      → 1>0, pop 0, no left wall. push 1.  stack=[1]
i=2: h=0, stack=[1]      → 0<1, push 2.         stack=[1,2]
i=3: h=2, stack=[1,2]    → 2>0, pop 2: bottom=0, left=1 (h=1), width=3-1-1=1
                            bounded=min(2,1)-0=1, water+=1×1=1
                            2>1, pop 1: no left wall. push 3. stack=[3]
i=4: h=1, stack=[3]      → 1<2, push 4.         stack=[3,4]
i=5: h=0, stack=[3,4]    → 0<1, push 5.         stack=[3,4,5]
i=6: h=1, stack=[3,4,5]  → 1>0, pop 5: bottom=0, left=4 (h=1), width=6-4-1=1
                            bounded=min(1,1)-0=1, water+=1×1=1
                            1=1 at top, stop. push 6.  stack=[3,4,6]
i=7: h=3, stack=[3,4,6]  → 3>1, pop 6: bottom=1, left=4 (h=1), width=7-4-1=2
                            bounded=min(3,1)-1=0, water+=0
                            3>1, pop 4: bottom=1, left=3 (h=2), width=7-3-1=3
                            bounded=min(3,2)-1=1, water+=3×1=3
                            3>2, pop 3: no left wall. push 7. stack=[7]
i=8..11: no pops produce water (heights ≤ 3 but no valley bottom)
Total water: 1+1+1+3 = 6 ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
// O(n) time, O(n) space. Monotonic decreasing stack of indices.
static class Solution2 {
    public int trap(int[] height) {
        if (height == null || height.length < 3) return 0;
        Deque<Integer> stack = new ArrayDeque<>(); // stores indices, monotonic decreasing
        int res = 0;
        for (int i = 0; i < height.length; i++) {
            while (!stack.isEmpty() && height[i] > height[stack.peek()]) { // current bar is taller
                int bottom = stack.pop(); // bottom of the trapped water
                if (stack.isEmpty()) break; // no left wall
                int width = i - stack.peek() - 1; // distance between left and right wall
                int bounded = Math.min(height[i], height[stack.peek()]) - height[bottom];
                res += width * bounded; // accumulate trapped water for this layer
            }
            stack.push(i); // push current index
        }
        return res;
    }
}
```

#### Python

```python []
class Solution2:
    def trap(self, height: list[int]) -> int:
        """Monotonic stack approach. Time O(n), Space O(n)."""
        stack = []  # O(n) space, stores indices
        res = 0
        for i, h in enumerate(height):  # O(n), each index pushed and popped at most once
            while stack and height[stack[-1]] < h:
                mid = stack.pop()
                if not stack:
                    break
                width = i - stack[-1] - 1
                bounded_height = min(h, height[stack[-1]]) - height[mid]
                res += width * bounded_height
            stack.append(i)
        return res
```

#### C++

```cpp []
// Solution 2: Monotonic Stack - Time O(n), Space O(n)
class Solution2 {
public:
    int trap(vector<int>& height) {
        int n = height.size();
        if (n <= 2) return 0;
        stack<int> stk;                     // O(n) stack of indices, decreasing height
        int water = 0;
        for (int i = 0; i < n; ++i) {      // O(n) each index pushed/popped at most once
            while (!stk.empty() && height[i] > height[stk.top()]) {
                int bottom = stk.top();     // valley bottom index
                stk.pop();
                if (stk.empty()) break;     // no left wall, water spills
                int left = stk.top();
                int width = i - left - 1;                           // horizontal span
                int bounded = min(height[left], height[i]) - height[bottom]; // vertical depth
                water += width * bounded;   // rectangular area of trapped water
            }
            stk.push(i);
        }
        return water;
    }
};
```

#### Rust

```rust []
impl Solution2 {
    pub fn trap(height: Vec<i32>) -> i32 {
        let mut stack: Vec<usize> = Vec::new(); // stores indices; heights are non-increasing
        let mut water = 0i32;
        for i in 0..height.len() {
            // pop shorter bars and accumulate horizontal water layers
            while let Some(&top) = stack.last() {
                if height[i] <= height[top] { break; }
                stack.pop(); // pop the bottom of the "pool"
                if let Some(&left) = stack.last() {
                    let bounded_height = height[i].min(height[left]) - height[top];
                    let width = (i - left - 1) as i32; // horizontal span
                    water += bounded_height * width; // area of this horizontal layer
                }
            }
            stack.push(i); // O(1) amortized — each index pushed once
        }
        water
    }
}
```
