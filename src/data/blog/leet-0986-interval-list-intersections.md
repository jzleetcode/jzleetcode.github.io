---
author: JZ
pubDatetime: 2026-08-13T10:00:00Z
modDatetime: 2026-08-13T10:00:00Z
title: LeetCode 986 Interval List Intersections
featured: true
tags:
  - a-array
  - a-two-pointers
description:
  "Solutions for LeetCode 986, medium, tags: array, two pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 986](https://leetcode.com/problems/interval-list-intersections/description/)

You are given two lists of closed intervals, `firstList` and `secondList`, where `firstList[i] = [starti, endi]` and `secondList[j] = [startj, endj]`. Each list of intervals is pairwise disjoint and in sorted order.

Return the intersection of these two interval lists.

A closed interval `[a, b]` (with `a <= b`) denotes the set of real numbers `x` with `a <= x <= b`.

The intersection of two closed intervals is a set of real numbers that is either empty, or represented as a closed interval.

```
Example 1:

Input: firstList = [[0,2],[5,10],[13,23],[24,25]], secondList = [[1,5],[8,12],[15,24],[25,26]]
Output: [[1,2],[5,5],[8,10],[15,23],[24,24],[25,25]]

Example 2:

Input: firstList = [[1,3],[5,9]], secondList = []
Output: []

Constraints:

0 <= firstList.length, secondList.length <= 1000
firstList.length + secondList.length >= 1
0 <= starti < endi <= 10^9
0 <= startj < endj <= 10^9
starti < starti+1
startj < startj+1
```

## Solution

### Idea

**Two Pointers.** Both lists are already sorted and disjoint. We maintain one pointer per list and compute the intersection of the two current intervals. The intersection of `[a, b]` and `[c, d]` is `[max(a,c), min(b,d)]` — it's non-empty when `max(a,c) <= min(b,d)`. After processing a pair, we advance the pointer whose interval ends earlier (since it can't intersect anything else from the other list).

```
firstList  = [0,2]  [5,10]  [13,23]  [24,25]
secondList = [1,5]  [8,12]  [15,24]  [25,26]

i=0, j=0: [0,2]∩[1,5] → lo=1, hi=2 → [1,2]. first ends earlier → i++
i=1, j=0: [5,10]∩[1,5] → lo=5, hi=5 → [5,5]. second ends earlier → j++
i=1, j=1: [5,10]∩[8,12] → lo=8, hi=10 → [8,10]. first ends earlier → i++
i=2, j=1: [13,23]∩[8,12] → lo=13, hi=12 → empty. second ends earlier → j++
i=2, j=2: [13,23]∩[15,24] → lo=15, hi=23 → [15,23]. first ends earlier → i++
i=3, j=2: [24,25]∩[15,24] → lo=24, hi=24 → [24,24]. second ends earlier → j++
i=3, j=3: [24,25]∩[25,26] → lo=25, hi=25 → [25,25]. first ends earlier → i++
i=4: done.

Result: [[1,2],[5,5],[8,10],[15,23],[24,24],[25,25]]
```

Complexity: Time $O(m + n)$ — each pointer advances at most $m$ or $n$ times. Space $O(1)$ excluding output.

#### Java

```java []
public static int[][] intervalIntersection(int[][] firstList, int[][] secondList) {
    List<int[]> res = new ArrayList<>();
    int i = 0, j = 0; // O(1) space
    while (i < firstList.length && j < secondList.length) { // O(m+n)
        int lo = Math.max(firstList[i][0], secondList[j][0]);
        int hi = Math.min(firstList[i][1], secondList[j][1]);
        if (lo <= hi) res.add(new int[]{lo, hi});
        if (firstList[i][1] < secondList[j][1]) i++;
        else j++;
    }
    return res.toArray(new int[0][]); // Time O(m+n), Space O(1)
}
```

#### Python

```python []
class Solution:
    def intervalIntersection(self, firstList: list[list[int]], secondList: list[list[int]]) -> list[list[int]]:
        res = []
        i = j = 0  # O(1) space
        while i < len(firstList) and j < len(secondList):  # O(m+n)
            lo = max(firstList[i][0], secondList[j][0])
            hi = min(firstList[i][1], secondList[j][1])
            if lo <= hi:
                res.append([lo, hi])
            if firstList[i][1] < secondList[j][1]:
                i += 1
            else:
                j += 1
        return res  # Time O(m+n), Space O(1) excluding output
```

#### C++

```cpp []
class Solution {
public:
    vector<vector<int>> intervalIntersection(vector<vector<int>>& firstList, vector<vector<int>>& secondList) {
        vector<vector<int>> res;
        int i = 0, j = 0; // O(1) space
        while (i < (int)firstList.size() && j < (int)secondList.size()) { // O(m+n)
            int lo = max(firstList[i][0], secondList[j][0]);
            int hi = min(firstList[i][1], secondList[j][1]);
            if (lo <= hi) res.push_back({lo, hi});
            if (firstList[i][1] < secondList[j][1]) i++;
            else j++;
        }
        return res; // Time O(m+n), Space O(1)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn interval_intersection(
        first_list: Vec<Vec<i32>>,
        second_list: Vec<Vec<i32>>,
    ) -> Vec<Vec<i32>> {
        let mut res = vec![];
        let (mut i, mut j) = (0, 0); // O(1) space
        while i < first_list.len() && j < second_list.len() { // O(m+n)
            let lo = first_list[i][0].max(second_list[j][0]);
            let hi = first_list[i][1].min(second_list[j][1]);
            if lo <= hi {
                res.push(vec![lo, hi]);
            }
            if first_list[i][1] < second_list[j][1] {
                i += 1;
            } else {
                j += 1;
            }
        }
        res // Time O(m+n), Space O(1)
    }
}
```
