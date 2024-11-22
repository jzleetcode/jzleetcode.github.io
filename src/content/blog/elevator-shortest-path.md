---
author: JZ
pubDatetime: 2024-11-21T06:23:00Z
modDatetime: 2024-11-21T07:23:00Z
title: Elevator Closest Floors (Shortest Path)
featured: true
tags:
  - a-array
  - a-binary-search
  - c-LTK
description:
  "Solutions for Elevator Shortest Path, medium, tags: array, binary search."
---

## Table of contents

## Description

Find the overall shortest path for an elevator given all the floors that the elevator needs to go to and a starting floor. Please return a list of the floors in the sequence that the elevator should go to. The goal is to minimize the total distance that the elevator has to travel.

```java
// floors, start, expected
Arguments.of(new ArrayList<>(List.of(2, 1, 9, 8, 7, 3)), 6, List.of(7, 8, 9, 3, 2, 1)),
Arguments.of(new ArrayList<>(List.of(-1, 1, 9, 8, 7, 3)), 0, List.of(-1, 1, 3, 7, 8, 9)),
Arguments.of(new ArrayList<>(List.of(1, 9, 8, 7, 3)), 0, List.of(1, 3, 7, 8, 9)),
Arguments.of(new ArrayList<>(List.of(1, 9, 8, 7, 3)), 12, List.of(9, 8, 7, 3, 1))
```

Constraints

- `start` is not in the `floors` list
- there is no duplicates in `floors`

If you have seen this question on LeetCode or a similar platform, please provide the link or the information where we can find it in the comment section below.

If you have seen this question during a company interview and would like to share, please comment the company name at the bottom and feel free to add relevant info.

Thank you.

## Solution

### Idea

One key discovery for this question is that we actually do not want to greedily move the elevator to the closest floor even though the title of the question and/or the method implies that as a solution. If there are multiple floors on one or both sides, the elevator can stop at the intermediate floors on its way to the min or max floor.

So the key to solving this problem becomes comparing the starting floor with the two extremes.

1. We sort all the floors.
2. We perform binary search with the starting floor. Java's `Collections.binarySearch` will return a negative value because the starting floor is not in the list. We negate the negative value to get the index where the starting floor should be inserted to keep the list sorted.
3. We look at two sublist (views) of the sorted list divided by that index.
4. We reverse the first half (floors lower than the starting floor). If the first half is an empty list, no reverse will be done, and we do not have to handle the empty cases separately.
5. We compare the distance from the starting floor to the two ends and go to the closer end first.

Complexity: Time O(n*log*n), Space O(n+sort) or O(sort) not considering the result space. For space needed for sorting, see [this page](../leet-2563-count-fair-pairs#idea).

#### Java

```java
class Solution {
    public List<Integer> closestFloors(List<Integer> floors, int start) {
        Collections.sort(floors);
        int idx = ~Collections.binarySearch(floors, start), l = 0, r = floors.size() - 1;
        List<Integer> lower = floors.subList(0, idx), higher = floors.subList(idx, r + 1);
        Collections.reverse(lower);
        List<Integer> res = new ArrayList<>();
        if (idx - l <= r - idx) {
            res.addAll(lower);
            res.addAll(higher);
        } else {
            res.addAll(higher);
            res.addAll(lower);
        }
        return res;
    }
}
```
