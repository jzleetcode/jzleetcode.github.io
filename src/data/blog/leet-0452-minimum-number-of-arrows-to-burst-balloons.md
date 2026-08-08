---
author: JZ
pubDatetime: 2026-08-08T10:07:00Z
modDatetime: 2026-08-08T10:07:00Z
title: LeetCode 452 Minimum Number of Arrows to Burst Balloons
featured: true
tags:
  - a-array
  - a-greedy
  - a-sorting
description:
  "Solutions for LeetCode 452, medium, tags: array, greedy, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 452](https://leetcode.com/problems/minimum-number-of-arrows-to-burst-balloons/description/)

There are some spherical balloons taped onto a flat wall that represents the XY-plane. The balloons are represented as a 2D integer array `points` where `points[i] = [x_start, x_end]` denotes a balloon whose horizontal diameter stretches between `x_start` and `x_end`. You do not know the exact y-coordinates of the balloons.

Arrows can be shot up directly vertically (in the positive y-direction) from different points along the x-axis. A balloon with `x_start` and `x_end` is burst by an arrow shot at `x` if `x_start <= x <= x_end`. There is no limit to the number of arrows that can be shot. A shot arrow keeps traveling up infinitely, bursting any balloons in its path.

Given the array `points`, return the minimum number of arrows that must be shot to burst all balloons.

```
Example 1:

Input: points = [[10,16],[2,8],[1,6],[7,12]]
Output: 2
Explanation: The balloons can be burst by 2 arrows:
- Shoot an arrow at x = 6, bursting the balloons [2,8] and [1,6].
- Shoot an arrow at x = 11, bursting the balloons [10,16] and [7,12].

Example 2:

Input: points = [[1,2],[3,4],[5,6],[7,8]]
Output: 4
Explanation: One arrow needs to be shot for each balloon for a total of 4 arrows.

Example 3:

Input: points = [[1,2],[2,3],[3,4],[4,5]]
Output: 2
Explanation: The balloons can be burst by 2 arrows:
- Shoot an arrow at x = 2, bursting the balloons [1,2] and [2,3].
- Shoot an arrow at x = 4, bursting the balloons [3,4] and [4,5].

Constraints:

1 <= points.length <= 10^5
points[i].length == 2
-2^31 <= x_start < x_end <= 2^31 - 1
```

## Solution 1: Sort by End (Greedy)

### Idea

Sort balloons by their **end** coordinate. Shoot an arrow at the end of the first balloon. Any subsequent balloon whose start is still `<= arrowPos` is already burst. When we encounter a balloon that starts after the arrow position, we need a new arrow.

This works because the arrow at the earliest possible rightmost point maximizes the number of overlapping balloons it can burst.

```
Trace for [[10,16],[2,8],[1,6],[7,12]]:

After sort by end: [1,6] [2,8] [7,12] [10,16]

arrow at 6, arrows = 1
[2,8]:  start 2 <= 6 → already burst
[7,12]: start 7 > 6  → new arrow at 12. arrows = 2
[10,16]: start 10 <= 12 → already burst

Answer: 2
```

Complexity: Time $O(n \log n)$ for sorting. Space $O(\log n)$ for the sort stack.

## Solution 2: Sort by Start (Merge Overlapping)

### Idea

Sort balloons by **start** coordinate. Maintain the common overlap region's end (`overlapEnd`). If the next balloon's start `<= overlapEnd`, it overlaps — shrink the overlap region to `min(overlapEnd, current_end)`. Otherwise, a new arrow is needed.

This is equivalent to merging overlapping intervals and counting the number of merged groups.

```
Trace for [[10,16],[2,8],[1,6],[7,12]]:

After sort by start: [1,6] [2,8] [7,12] [10,16]

overlapEnd = 6, arrows = 1
[2,8]:  start 2 <= 6 → overlap. overlapEnd = min(6,8) = 6
[7,12]: start 7 > 6  → new group. overlapEnd = 12, arrows = 2
[10,16]: start 10 <= 12 → overlap. overlapEnd = min(12,16) = 12

Answer: 2
```

Complexity: Time $O(n \log n)$ for sorting. Space $O(\log n)$ for the sort stack.

#### Java

```java []
// solution 1, sort by end, greedy arrow placement. O(n log n) time, O(log n) space.
public static int findMinArrowShots(int[][] points) {
    Arrays.sort(points, (a, b) -> Integer.compare(a[1], b[1])); // O(n log n)
    int arrows = 1;
    int arrowPos = points[0][1];
    for (int i = 1; i < points.length; i++) { // O(n)
        if (points[i][0] > arrowPos) {
            arrows++;
            arrowPos = points[i][1];
        }
    }
    return arrows;
}

// solution 2, sort by start, track shrinking overlap. O(n log n) time, O(log n) space.
public static int findMinArrowShots2(int[][] points) {
    Arrays.sort(points, (a, b) -> Integer.compare(a[0], b[0])); // O(n log n)
    int arrows = 1;
    int overlapEnd = points[0][1];
    for (int i = 1; i < points.length; i++) { // O(n)
        if (points[i][0] > overlapEnd) {
            arrows++;
            overlapEnd = points[i][1];
        } else {
            overlapEnd = Math.min(overlapEnd, points[i][1]);
        }
    }
    return arrows;
}
```

#### Python

```python []
def findMinArrowShots(self, points: List[List[int]]) -> int:
    """Sort by end, greedy arrow placement. O(n log n) time, O(log n) space."""
    points.sort(key=lambda x: x[1])  # O(n log n)
    arrows = 1
    end = points[0][1]
    for i in range(1, len(points)):  # O(n)
        if points[i][0] > end:
            arrows += 1
            end = points[i][1]
    return arrows

def findMinArrowShots2(self, points: List[List[int]]) -> int:
    """Sort by start, track shrinking overlap. O(n log n) time, O(log n) space."""
    points.sort(key=lambda x: x[0])  # O(n log n)
    arrows = 1
    end = points[0][1]
    for i in range(1, len(points)):  # O(n)
        if points[i][0] <= end:
            end = min(end, points[i][1])
        else:
            arrows += 1
            end = points[i][1]
    return arrows
```

#### C++

```cpp []
// Sort by end, greedy arrow. O(n log n) time, O(log n) space.
int findMinArrowShots(vector<vector<int>>& points) {
    sort(points.begin(), points.end(), [](const vector<int>& a, const vector<int>& b) {
        return a[1] < b[1];
    }); // O(n log n)
    int arrows = 1, arrowPos = points[0][1];
    for (int i = 1; i < (int)points.size(); ++i) { // O(n)
        if (points[i][0] > arrowPos) {
            ++arrows;
            arrowPos = points[i][1];
        }
    }
    return arrows;
}

// Sort by start, track shrinking overlap. O(n log n) time, O(log n) space.
int findMinArrowShots2(vector<vector<int>>& points) {
    sort(points.begin(), points.end(), [](const vector<int>& a, const vector<int>& b) {
        return a[0] < b[0];
    }); // O(n log n)
    int arrows = 1, overlapEnd = points[0][1];
    for (int i = 1; i < (int)points.size(); ++i) { // O(n)
        if (points[i][0] <= overlapEnd) {
            overlapEnd = min(overlapEnd, points[i][1]);
        } else {
            ++arrows;
            overlapEnd = points[i][1];
        }
    }
    return arrows;
}
```

#### Rust

```rust []
// Sort by end, greedy arrow. O(n log n) time, O(1) space.
pub fn find_min_arrow_shots(points: &mut Vec<Vec<i32>>) -> i32 {
    points.sort_by_key(|p| p[1]);
    let mut arrows = 1;
    let mut arrow_pos = points[0][1];
    for i in 1..points.len() { // O(n)
        if points[i][0] > arrow_pos {
            arrows += 1;
            arrow_pos = points[i][1];
        }
    }
    arrows
}

// Sort by start, track shrinking overlap. O(n log n) time, O(1) space.
pub fn find_min_arrow_shots2(points: &mut Vec<Vec<i32>>) -> i32 {
    points.sort_by_key(|p| p[0]);
    let mut arrows = 1;
    let mut overlap_end = points[0][1];
    for i in 1..points.len() { // O(n)
        if points[i][0] <= overlap_end {
            overlap_end = overlap_end.min(points[i][1]);
        } else {
            arrows += 1;
            overlap_end = points[i][1];
        }
    }
    arrows
}
```
