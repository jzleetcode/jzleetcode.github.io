---
author: JZ
pubDatetime: 2026-05-07T10:00:00Z
modDatetime: 2026-05-07T10:00:00Z
title: LeetCode 11 Container With Most Water
featured: false
tags:
  - a-array
  - a-two-pointers
  - a-greedy
description:
  "Solutions for LeetCode 11, medium, tags: array, two pointers, greedy."
---

## Table of contents

## Description

Question Links: [LeetCode 11](https://leetcode.com/problems/container-with-most-water/description/)

You are given an integer array `height` of length `n`. There are `n` vertical lines drawn such that the two endpoints of the ith line are `(i, 0)` and `(i, height[i])`.

Find two lines that together with the x-axis form a container, such that the container contains the most water.

Return the maximum amount of water a container can store. Notice that you may not slant the container.

```
Example 1:

Input: height = [1,8,6,2,5,4,8,3,7]
Output: 49
Explanation: The above vertical lines are represented by array [1,8,6,2,5,4,8,3,7].
In this case, the max area of water the container can contain is 49.

Example 2:

Input: height = [1,1]
Output: 1

Constraints:

n == height.length
2 <= n <= 10^5
0 <= height[i] <= 10^4
```

## Solution 1: Two Pointers (with skip)

### Idea

The area between two lines at positions `l` and `r` is `min(height[l], height[r]) * (r - l)`. A brute force approach checks all pairs in $O(n^2)$. We optimize with two pointers converging from both ends.

Key insight: always move the pointer with the shorter height inward. The shorter line is the bottleneck — keeping it and moving the taller one can only decrease width without increasing height, so it can never improve the result.

The skip optimization goes further: after computing the area at the current `min(height[l], height[r])`, skip all lines no taller than the current minimum since they cannot improve the result.

```
height = [1, 8, 6, 2, 5, 4, 8, 3, 7]

L=0, R=8: h=min(1,7)=1, area=1*8=8.   Skip L (h[0]=1<=1) → L=1
L=1, R=8: h=min(8,7)=7, area=7*7=49.  Skip R (h[8]=7<=7) → R=7
L=1, R=7: h=min(8,3)=3, area=3*6=18.  Skip R (h[7]=3<=3) → R=6
L=1, R=6: h=min(8,8)=8, area=8*5=40.  Skip both → L=2, R=5 (actually L stops at 2 since 6<8? no, 6<=8)
...converges...

Answer: 49 ✓
```

Complexity: Time $O(n)$ — each pointer moves at most $n$ steps total, Space $O(1)$.

#### Java

```java []
// O(n) time, O(1) space. Two pointers with skip.
public int maxArea(int[] height) {
    int res = 0, l = 0, r = height.length - 1;
    while (l < r) {
        int h = Math.min(height[l], height[r]);
        res = Math.max(res, (r - l) * h);
        while (height[l] <= h && l < r) l++; // skip lines no taller than current min
        while (height[r] <= h && l < r) r--;
    }
    return res;
}
```

#### Python

```python []
class Solution:
    # O(n) time, O(1) space. Two pointers with skip optimization.
    def maxArea(self, height: list[int]) -> int:
        res, l, r = 0, 0, len(height) - 1
        while l < r:
            h = min(height[l], height[r])
            res = max(res, (r - l) * h)
            while l < r and height[l] <= h:  # O(n) total moves across all iterations
                l += 1
            while l < r and height[r] <= h:
                r -= 1
        return res
```

#### C++

```cpp []
// O(n) time, O(1) space. Two pointers with skip.
int maxArea(vector<int>& height) {
    int left = 0, right = (int)height.size() - 1;
    int res = 0;
    while (left < right) {
        int h = min(height[left], height[right]);
        res = max(res, (right - left) * h);
        while (left < right && height[left] <= h) ++left;
        while (left < right && height[right] <= h) --right;
    }
    return res;
}
```

#### Rust

```rust []
impl Solution {
    // O(n) time, O(1) space. Two pointers with skip.
    pub fn max_area(height: Vec<i32>) -> i32 {
        let (mut left, mut right) = (0usize, height.len() - 1);
        let mut res = 0i32;
        while left < right {
            let h = height[left].min(height[right]);
            res = res.max((right - left) as i32 * h);
            while left < right && height[left] <= h { left += 1; }
            while left < right && height[right] <= h { right -= 1; }
        }
        res
    }
}
```

## Solution 2: Two Pointers (simple)

### Idea

Same two-pointer approach without the skip optimization. Move one pointer per iteration — always the shorter side. Slightly simpler code, same $O(n)$ time, $O(1)$ space.

#### Java

```java []
// O(n) time, O(1) space. Two pointers, simpler version.
public int maxArea2(int[] height) {
    int res = 0;
    int l = 0, r = height.length - 1;
    while (l < r) {
        res = Math.max(res, (r - l) * Math.min(height[l], height[r]));
        if (height[l] < height[r]) l++;
        else r--;
    }
    return res;
}
```

#### Python

```python []
class Solution2:
    # O(n) time, O(1) space. Two pointers, simpler version.
    def maxArea(self, height: list[int]) -> int:
        res, l, r = 0, 0, len(height) - 1
        while l < r:
            res = max(res, (r - l) * min(height[l], height[r]))
            if height[l] < height[r]:
                l += 1
            else:
                r -= 1
        return res
```

#### C++

```cpp []
// O(n) time, O(1) space. Two pointers, simpler.
int maxArea(vector<int>& height) {
    int left = 0, right = (int)height.size() - 1;
    int res = 0;
    while (left < right) {
        int area = min(height[left], height[right]) * (right - left);
        res = max(res, area);
        if (height[left] < height[right])
            ++left;
        else
            --right;
    }
    return res;
}
```

#### Rust

```rust []
impl Solution {
    // O(n) time, O(1) space. Two pointers, simpler.
    pub fn max_area(height: Vec<i32>) -> i32 {
        let mut left = 0usize;
        let mut right = height.len() - 1;
        let mut max_water = 0i32;
        while left < right {
            let w = (right - left) as i32;
            let h = height[left].min(height[right]);
            max_water = max_water.max(w * h);
            if height[left] < height[right] {
                left += 1;
            } else {
                right -= 1;
            }
        }
        max_water
    }
}
```
