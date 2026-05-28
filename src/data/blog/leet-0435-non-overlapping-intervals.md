---
author: JZ
pubDatetime: 2026-05-23T06:00:00Z
modDatetime: 2026-05-23T06:00:00Z
title: LeetCode 435 Non-overlapping Intervals
featured: false
tags:
  - a-array
  - a-greedy
  - a-sorting
description:
  "Solutions for LeetCode 435, medium, tags: array, dynamic programming, greedy, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 435](https://leetcode.com/problems/non-overlapping-intervals/description/), [Wikipedia: Interval Scheduling](https://en.wikipedia.org/wiki/Interval_scheduling#Interval_Scheduling_Maximization)

Given an array of intervals where `intervals[i] = [starti, endi]`, return the minimum number of intervals you need to remove to make the rest of the intervals non-overlapping.

Note that intervals which only touch at a point are non-overlapping. For example, `[1, 2]` and `[2, 3]` are non-overlapping.

```
Example 1:

Input: intervals = [[1,2],[2,3],[3,4],[1,3]]
Output: 1
Explanation: [1,3] can be removed and the rest of the intervals are non-overlapping.

Example 2:

Input: intervals = [[1,2],[1,2],[1,2]]
Output: 2
Explanation: You need to remove two [1,2] to make the rest of the intervals non-overlapping.

Example 3:

Input: intervals = [[1,2],[2,3]]
Output: 0
Explanation: You don't need to remove any of the intervals since they're already non-overlapping.

Constraints:

1 <= intervals.length <= 10^5
intervals[i].length == 2
-5 * 10^4 <= starti < endi <= 5 * 10^4
```

## Solution 1: Sort by End (Greedy)

### Idea

This is the classic **interval scheduling maximization** problem. The key insight: to keep the maximum number of non-overlapping intervals, always pick the interval that ends earliest — this leaves the most room for future intervals.

1. Sort intervals by their **end time**.
2. Greedily keep intervals: if the current interval's start is `>= end` of the last kept interval, keep it.
3. Answer = total intervals - number of kept intervals.

```
Trace for [[1,2],[2,3],[3,4],[1,3]]:

After sort by end: [1,2] [2,3] [1,3] [3,4]

end = 2, keep = 1
[2,3]: start 2 >= end 2 → keep it. end = 3, keep = 2
[1,3]: start 1 < end 3 → skip (overlap)
[3,4]: start 3 >= end 3 → keep it. end = 4, keep = 3

Answer: 4 - 3 = 1
```

Complexity: Time $O(n \log n)$ for sorting. Space $O(\log n)$ for the sort stack.

## Solution 2: Sort by Start (Greedy)

### Idea

Sort by **start time**. When two intervals overlap, remove the one with the **larger end** — it is more likely to cause future overlaps.

1. Sort intervals by start.
2. Track the `end` of the last kept interval.
3. If current start `< end`, overlap exists — increment removal count, update `end = min(end, current_end)`.
4. Otherwise, update `end` to current interval's end.

```
Trace for [[1,2],[2,3],[3,4],[1,3]]:

After sort by start: [1,2] [1,3] [2,3] [3,4]

end = 2, removals = 0
[1,3]: start 1 < end 2 → overlap. removals = 1. end = min(2,3) = 2
[2,3]: start 2 >= end 2 → no overlap. end = 3
[3,4]: start 3 >= end 3 → no overlap. end = 4

Answer: 1
```

Complexity: Time $O(n \log n)$ for sorting. Space $O(\log n)$ for the sort stack.

#### Java

```java []
// solution 1, sort by end, count overlapping. O(n log n) time, O(log n) space.
public int eraseOverlapIntervals2(int[][] intervals) {
    Arrays.sort(intervals, Comparator.comparingInt(i -> i[1])); // O(n log n)
    int end = intervals[0][1];
    int count = 0;
    for (int i = 1; i < intervals.length; i++) { // O(n)
        if (intervals[i][0] < end) count++;
        else end = intervals[i][1];
    }
    return count;
}

// solution 2, sort by start, keep smaller end on overlap. O(n log n) time, O(log n) space.
public int eraseOverlapIntervals3(int[][] intervals) {
    Arrays.sort(intervals, Comparator.comparingInt(i -> i[0])); // O(n log n)
    int count = 0, pre = 0;
    for (int i = 1; i < intervals.length; i++) { // O(n)
        if (intervals[i][0] < intervals[pre][1]) {
            count++;
            if (intervals[i][1] < intervals[pre][1]) pre = i;
        } else pre = i;
    }
    return count;
}
```

#### Python

```python []
def eraseOverlapIntervals(self, intervals: List[List[int]]) -> int:
    """Sort by end, count overlapping. O(n log n) time, O(log n) space."""
    intervals.sort(key=lambda x: x[1])  # O(n log n)
    end = intervals[0][1]
    count = 0
    for i in range(1, len(intervals)):  # O(n)
        if intervals[i][0] < end:
            count += 1
        else:
            end = intervals[i][1]
    return count

def eraseOverlapIntervals2(self, intervals: List[List[int]]) -> int:
    """Sort by start, keep smaller end on overlap. O(n log n) time, O(log n) space."""
    intervals.sort(key=lambda x: x[0])  # O(n log n)
    count = 0
    pre = 0
    for i in range(1, len(intervals)):  # O(n)
        if intervals[i][0] < intervals[pre][1]:
            count += 1
            if intervals[i][1] < intervals[pre][1]:
                pre = i
        else:
            pre = i
    return count
```

#### C++

```cpp []
// Sort by end, count overlapping. O(n log n) time, O(log n) space.
static int eraseOverlapIntervals(vector<vector<int>>& intervals) {
    sort(intervals.begin(), intervals.end(),
         [](const vector<int>& a, const vector<int>& b) {
             return a[1] < b[1];
         }); // O(n log n)
    int count = 0, end = intervals[0][1];
    for (int i = 1; i < (int)intervals.size(); ++i) { // O(n)
        if (intervals[i][0] < end) ++count;
        else end = intervals[i][1];
    }
    return count;
}

// Sort by start, keep smaller end on overlap. O(n log n) time, O(log n) space.
static int eraseOverlapIntervals2(vector<vector<int>>& intervals) {
    sort(intervals.begin(), intervals.end()); // O(n log n)
    int count = 0, end = intervals[0][1];
    for (int i = 1; i < (int)intervals.size(); ++i) { // O(n)
        if (intervals[i][0] < end) {
            ++count;
            end = min(end, intervals[i][1]);
        } else {
            end = intervals[i][1];
        }
    }
    return count;
}
```

#### Rust

```rust []
// Sort by end, count non-overlapping then subtract. O(n log n) time, O(log n) space.
pub fn erase_overlap_intervals(mut intervals: Vec<Vec<i32>>) -> i32 {
    intervals.sort_unstable_by_key(|v| v[1]); // O(n log n)
    let mut end = intervals[0][1];
    let mut non_overlap = 1;
    for i in 1..intervals.len() { // O(n)
        if intervals[i][0] >= end {
            non_overlap += 1;
            end = intervals[i][1];
        }
    }
    (intervals.len() as i32) - non_overlap
}

// Sort by start, keep smaller end on overlap. O(n log n) time, O(log n) space.
pub fn erase_overlap_intervals_v2(mut intervals: Vec<Vec<i32>>) -> i32 {
    intervals.sort_unstable_by_key(|v| v[0]); // O(n log n)
    let mut end = intervals[0][1];
    let mut removals = 0;
    for i in 1..intervals.len() { // O(n)
        if intervals[i][0] < end {
            removals += 1;
            end = end.min(intervals[i][1]);
        } else {
            end = intervals[i][1];
        }
    }
    removals
}
```
