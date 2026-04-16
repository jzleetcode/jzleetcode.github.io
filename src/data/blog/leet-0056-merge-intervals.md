---
author: JZ
pubDatetime: 2026-04-11T06:00:00Z
modDatetime: 2026-04-11T06:00:00Z
title: LeetCode 56 Merge Intervals
featured: false
tags:
  - a-array
  - a-sorting
description:
  "Solutions for LeetCode 56, medium, tags: array, sorting."
---

## Table of contents

## Description

Given an array of `intervals` where `intervals[i] = [starti, endi]`, merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.

```
Example 1:

Input: intervals = [[1,3],[2,6],[8,10],[15,18]]
Output: [[1,6],[8,10],[15,18]]
Explanation: Since intervals [1,3] and [2,6] overlap, merge them into [1,6].

Example 2:

Input: intervals = [[1,4],[4,5]]
Output: [[1,5]]
Explanation: Intervals [1,4] and [4,5] are considered overlapping.

Constraints:

1 <= intervals.length <= 10^4
intervals[i].length == 2
0 <= starti <= endi <= 10^4
```

## Solution

### Idea

**Sort then merge.** Sort the intervals by their start time. Then iterate through them: if the current interval overlaps with the last interval in our result (i.e., its start is ≤ the previous interval's end), extend the previous interval's end. Otherwise, append the current interval as a new non-overlapping interval.

```
Trace for [[1,3],[2,6],[8,10],[15,18]]:

After sorting (already sorted by start):
  [1,3]  [2,6]  [8,10]  [15,18]

Step 1: res = [[1,3]]
Step 2: [2,6] — 2 <= 3, merge → res = [[1,6]]
Step 3: [8,10] — 8 > 6, append → res = [[1,6],[8,10]]
Step 4: [15,18] — 15 > 10, append → res = [[1,6],[8,10],[15,18]]
```

Complexity: Time $O(n \log n)$ for sorting. Space $O(n)$ for the result.

#### Java

```java []
public int[][] merge(int[][] intervals) {
    Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0])); // O(n log n)
    List<int[]> res = new ArrayList<>();
    for (int[] cur : intervals) { // O(n)
        if (!res.isEmpty() && cur[0] <= res.getLast()[1]) {
            res.getLast()[1] = Math.max(res.getLast()[1], cur[1]);
        } else {
            res.add(new int[]{cur[0], cur[1]});
        }
    }
    return res.toArray(new int[0][]); // Time O(n log n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def merge(self, intervals: list[list[int]]) -> list[list[int]]:
        intervals.sort()  # O(n log n), sort by start then end
        res = [intervals[0]]
        for start, end in intervals[1:]:  # O(n)
            if start <= res[-1][1]:
                res[-1][1] = max(res[-1][1], end)
            else:
                res.append([start, end])
        return res  # Time O(n log n), Space O(n)
```

#### C++

```cpp []
class Solution {
public:
    vector<vector<int>> merge(vector<vector<int>> &intervals) {
        sort(intervals.begin(), intervals.end()); // O(n log n)
        vector<vector<int>> res;
        for (auto &iv : intervals) { // O(n)
            if (!res.empty() && iv[0] <= res.back()[1]) {
                res.back()[1] = max(res.back()[1], iv[1]);
            } else {
                res.push_back(iv);
            }
        }
        return res; // Time O(n log n), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn merge(mut intervals: Vec<Vec<i32>>) -> Vec<Vec<i32>> {
        intervals.sort_unstable_by_key(|v| v[0]); // O(n log n)
        let mut res: Vec<Vec<i32>> = Vec::new();
        for iv in intervals { // O(n)
            if let Some(last) = res.last_mut() {
                if iv[0] <= last[1] {
                    last[1] = last[1].max(iv[1]);
                    continue;
                }
            }
            res.push(iv);
        }
        res // Time O(n log n), Space O(n)
    }
}
```
