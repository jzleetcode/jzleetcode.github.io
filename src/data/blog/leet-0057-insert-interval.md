---
author: JZ
pubDatetime: 2026-06-15T10:06:00Z
modDatetime: 2026-06-15T10:06:00Z
title: LeetCode 57 Insert Interval
featured: false
tags:
  - a-array
description:
  "Solutions for LeetCode 57, medium, tags: array."
---

## Table of contents

## Description

Question Links: [LeetCode 57](https://leetcode.com/problems/insert-interval/description/)

You are given an array of non-overlapping intervals `intervals` where `intervals[i] = [starti, endi]` represent the start and the end of the ith interval and `intervals` is sorted in ascending order by `starti`. You are also given an interval `newInterval = [start, end]` that represents the start and end of another interval.

Insert `newInterval` into `intervals` such that `intervals` is still sorted in ascending order by `starti` and `intervals` still does not have any overlapping intervals (merge overlapping intervals if necessary).

Return `intervals` after the insertion.

Note that you don't need to modify `intervals` in-place. You can make a new array and return it.

```
Example 1:

Input: intervals = [[1,3],[6,9]], newInterval = [2,5]
Output: [[1,5],[6,9]]

Example 2:

Input: intervals = [[1,2],[3,5],[6,7],[8,10],[12,16]], newInterval = [4,8]
Output: [[1,2],[3,10],[12,16]]
Explanation: Because the new interval [4,8] overlaps with [3,5],[6,7],[8,10].

Constraints:

0 <= intervals.length <= 10^4
intervals[i].length == 2
0 <= starti <= endi <= 10^5
intervals is sorted by starti in ascending order.
newInterval.length == 2
0 <= start <= end <= 10^5
```

## Solution

### Idea

**Three-phase linear scan.** Since the input is already sorted, we can process it in one pass with three phases:

1. Add all intervals that end before `newInterval` starts (no overlap).
2. Merge all intervals that overlap with `newInterval` by expanding `newInterval`'s bounds.
3. Add all remaining intervals that start after `newInterval` ends.

```
Trace for intervals = [[1,2],[3,5],[6,7],[8,10],[12,16]], newInterval = [4,8]:

Phase 1: intervals ending before newInterval starts (4)
  [1,2] — end 2 < 4, add to result
  res = [[1,2]]

Phase 2: intervals overlapping with [4,8] (start <= 8)
  [3,5] — start 3 <= 8, merge → newInterval = [3,8]
  [6,7] — start 6 <= 8, merge → newInterval = [3,8]
  [8,10] — start 8 <= 8, merge → newInterval = [3,10]
  Add merged [3,10]
  res = [[1,2],[3,10]]

Phase 3: remaining intervals
  [12,16] — add as-is
  res = [[1,2],[3,10],[12,16]]
```

Complexity: Time $O(n)$ — single pass. Space $O(n)$ — for the result (not counting input).

#### Java

```java []
public static int[][] insert(int[][] intervals, int[] newInterval) {
    List<int[]> result = new ArrayList<>();
    int i = 0;
    while (i < intervals.length && intervals[i][1] < newInterval[0]) { // O(n) phase 1
        result.add(intervals[i]);
        i++;
    }
    while (i < intervals.length && intervals[i][0] <= newInterval[1]) { // O(n) phase 2
        newInterval[0] = Math.min(intervals[i][0], newInterval[0]);
        newInterval[1] = Math.max(intervals[i][1], newInterval[1]);
        i++;
    }
    result.add(newInterval);
    while (i < intervals.length) { // O(n) phase 3
        result.add(intervals[i]);
        i++;
    }
    return result.toArray(new int[0][0]); // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def insert(self, intervals: list[list[int]], newInterval: list[int]) -> list[list[int]]:
        res = []
        i, n = 0, len(intervals)
        while i < n and intervals[i][1] < newInterval[0]:  # O(n) phase 1
            res.append(intervals[i])
            i += 1
        while i < n and intervals[i][0] <= newInterval[1]:  # O(n) phase 2
            newInterval[0] = min(intervals[i][0], newInterval[0])
            newInterval[1] = max(intervals[i][1], newInterval[1])
            i += 1
        res.append(newInterval)
        while i < n:  # O(n) phase 3
            res.append(intervals[i])
            i += 1
        return res  # Time O(n), Space O(n)
```

#### C++

```cpp []
class InsertIntervalSolution {
public:
    vector<vector<int>> insert(vector<vector<int>> &intervals, vector<int> &newInterval) {
        vector<vector<int>> res;
        int i = 0, n = intervals.size();
        while (i < n && intervals[i][1] < newInterval[0]) { // O(n) phase 1
            res.push_back(intervals[i]);
            i++;
        }
        while (i < n && intervals[i][0] <= newInterval[1]) { // O(n) phase 2
            newInterval[0] = min(newInterval[0], intervals[i][0]);
            newInterval[1] = max(newInterval[1], intervals[i][1]);
            i++;
        }
        res.push_back(newInterval);
        while (i < n) { // O(n) phase 3
            res.push_back(intervals[i]);
            i++;
        }
        return res; // Time O(n), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn insert(intervals: Vec<Vec<i32>>, new_interval: Vec<i32>) -> Vec<Vec<i32>> {
        let mut res: Vec<Vec<i32>> = Vec::new();
        let mut new = new_interval;
        let mut i = 0;
        let n = intervals.len();
        while i < n && intervals[i][1] < new[0] { // O(n) phase 1
            res.push(intervals[i].clone());
            i += 1;
        }
        while i < n && intervals[i][0] <= new[1] { // O(n) phase 2
            new[0] = new[0].min(intervals[i][0]);
            new[1] = new[1].max(intervals[i][1]);
            i += 1;
        }
        res.push(new);
        while i < n { // O(n) phase 3
            res.push(intervals[i].clone());
            i += 1;
        }
        res // Time O(n), Space O(n)
    }
}
```
