---
author: JZ
pubDatetime: 2025-01-10T06:23:00Z
modDatetime: 2025-01-10T06:23:00Z
title: LeetCode Meeting Rooms Derivative Question
featured: true
tags:
  - a-line-sweep
  - a-heap
  - a-ordered-map
  - c-salesforce
description:
  "Solutions for meeting rooms derivative question, hard, tags: heap, line sweep, ordered map; companies: salesforce."
---

## Table of contents

## Description

You are building an event scheduling system where multiple events are scheduled to occur at specific times, but with certain constraints:

1. Each event has a start time and an end time.
2. Each resource has a maximum capacity (e.g., max number of events it can handle simultaneously)

Minimize the number of resources required to schedule all the events.

Write a function or class to solve the following:

```
Input:
    A list of events, where each event is represented as [startTime, endTime].
    A capacity c maximum simultaneous events per resource.
Output:
    Minimum number of resources needed to schedule all events without violating the capacity constraint.

Sample input:

events = [[1,4], [2,5], [6,8], [1,3], [3,6]]
capacity = 2

Sample Output: 2
```

## Idea

This question is a derivative of the LeetCode meeting rooms questions. Specifically closely related to [253 meeting rooms ii](https://leetcode.com/problems/meeting-rooms-ii/description/).

We could solve the question with the sweep line algorithm.

1. We add all the time points to an ordered map as keys. For start time, we add the value of 1. For end time, we add the value of -1.
2. We iterate through the ordered map and keep track of the total count of the ongoing meetings. We could calculate that by taking a sum of all the values in the map seen so far.
3. We could calculate the rooms needed by taking the ceiling of `count/capacity`. This could be calculated with `math ceil` or `(count-1)//capacity +1`. We keep the maximum of the rooms needed, which correspond to the time when the maximum number of conflicting meetings.

Complexity: Time $O(n \log n)$, Space $O(n)$.

### Java

```java
class Solution {
    static int minResources(int[][] events, int capacity) {
        int count = 0, res = 0;
        TreeMap<Integer, Integer> map1 = new TreeMap<>();
        for (int[] e : events) {
            map1.merge(e[0], 1, Integer::sum);
            map1.merge(e[1], -1, Integer::sum);
        }
        for (int t : map1.keySet()) {
            count += map1.get(t);
            res = Math.max(res, (int) Math.ceil(count / (double) capacity));
        }
        return res;
    }
}
```

### Python

```python
def roomsNeeded(meetings: list[list[int]], k: int) -> int:
    res, count = 0, 0
    sd = SortedDict()
    for m in meetings:
        sd.setdefault(m[0], 0)
        sd.setdefault(m[1], 0)
        sd[m[0]] += 1
        sd[m[1]] -= 1
    for c in sd.values():
        count += c
        # res = max(res, ceil(count / k))
        res = max(res, (count - 1) // k + 1)
    return res
```

Unit Test

```python
class Test(TestCase):
    def test_rooms_needed(self):
        test_cases = [
            ([[1, 4], [2, 5], [6, 8], [1, 3], [3, 6]], 2, 2),
            ([[1, 4], [2, 5], [6, 8], [1, 3], [3, 6]], 1, 3),
            ([[1, 4], [2, 5], [6, 8], [1, 3], [3, 6]], 3, 1),
            ([[1, 2], [1, 2], [1, 2], [1, 2], [1, 2]], 3, 2),
            ([[1, 2], [1, 2], [1, 2], [1, 2], [1, 2]], 2, 3),
        ]
        for meetings, k, exp in test_cases:
            self.assertEqual(exp, roomsNeeded(meetings, k))
```
