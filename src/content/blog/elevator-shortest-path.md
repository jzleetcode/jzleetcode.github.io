---
author: JZ
pubDatetime: 2024-11-21T06:23:00Z
modDatetime: 2024-11-21T07:23:00Z
title: Elevator Closest Floors (Shortest Path, Related to Shortest Seek Time First Disk Seek Algorithm)
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

This is a variant of the Traveling Salesperson Problem (TSP) but simplified for a single dimension (floors). The goal is to minimize the total distance the elevator travels while visiting all the required floors exactly once.

One key discovery for this question is that we actually do not want to greedily move the elevator to the closest floor even though the title of the question and/or the method implies that as a solution. If there are multiple floors on one or both sides, the elevator can stop at the intermediate floors on its way to the min or max floor.

So the key to solving this problem becomes comparing the starting floor with the two extremes.

1. We sort all the floors.
2. We perform binary search with the starting floor. Java's `Collections.binarySearch` will return a negative value because the starting floor is not in the list. We negate the negative value to get the index where the starting floor should be inserted to keep the list sorted.
3. We look at two sublist (views) of the sorted list divided by that index.
4. We reverse the first half (floors lower than the starting floor). If the first half is an empty list, no reverse will be done, and we do not have to handle the empty cases separately.
5. We compare the distance from the starting floor to the two ends and go to the closer end first.

Complexity: Time O(n*log*n), Space O(n+sort) or O(sort) not considering the result space.
For space needed for sorting, see [this page](../leet-2563-count-fair-pairs/#idea).


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

## Shortest Seek Time First (SSTS) Disk Seek Algorithm

### Idea

For a fun read, look for "shortest seek time first" (you can check some of the references below). The algorithm is similar to always getting to the closest floor and not minimizing the total distance traveled for the elevator problem.

The straightforward solution is to keep iterating to the closest until all are visited. The time complexity is O(n^2) and the space complexity is O(1) not considering the result space, such as the GFG and ECZ solutions below.

An improvement is to sort first, e.g., the Naukri solution below. However, the solution remove the closest pick from a sorted list, which is O(n) time complexity. So the overall time complexity is still O(n^2).

We can improve with an ordered list (allow duplicates) or ordered set (map) data structure.

Follow-Ups:

1. Support adding more pending seeking positions after the seeking started. The implementation below considers that.
2. What if all the pending seeking positions cannot fit in memory? Can consider use a message broker (message queue) service such as AWS SQS, Apache Kafka, or RabbitMQ. For real-time stream, consider AWS Kinesis, Apache Spark streaming, Apache Flink, Azure Stream Analytics. Basically distribute the data to multiple disks or machines while keep them sorted and aggregate as needed.

Complexity:

1. O(p) space where p is the number of pending seeking positions.
2. `add` O(n*log*p) time, where n is the number of positions to be added.
3. `next` O(*log*p) time.

#### Python

```python
from sortedcontainers import SortedList


class SSTFDisk:
    def __init__(self, start: int):
        self.s = start
        self.pl = SortedList()

    def add(self, positions: list[int]):
        """add positions to queue"""
        self.pl.update(positions)

    def next(self) -> int:
        """next position to seek"""
        if not self.pl:
            raise RuntimeError('no more positions to seek')
        idx = self.pl.bisect_right(self.s)
        if idx == 0:
            self.s = self.pl[0]
        elif idx == len(self.pl):
            self.s = self.pl[-1]
        else:
            dl, dr = self.s - self.pl[idx - 1], self.pl[idx] - self.s
            if dl == dr:  # pick the side has fewer tasks at the moment, may not be the requirement
                nl, nr = idx, len(self.pl) - idx
                self.s = self.pl[idx - 1] if nl < nr else self.pl[idx]
            elif dl > dr:
                self.s = self.pl[idx]
            else:
                self.s = self.pl[idx - 1]
        self.pl.remove(self.s)
        return self.s
```

Unit Test

```python
class TestSSTFDisk(TestCase):
    def setUp(self):
        self.tbt = SSTFDisk(0)

    def test_next(self):
        self.tbt.add([1, 2, 3])  # queue: [1,2,3], start: 0
        self.assertEqual(self.tbt.next(), 1)  # [2,3], 1
        self.assertEqual(self.tbt.next(), 2)  # [3], 2
        self.tbt.add([1, 2, 3])  # [1,2,3,3]
        self.assertEqual(self.tbt.next(), 2)  # [1,3,3], 2
        self.assertEqual(self.tbt.next(), 1)  # [3,3], 1
        self.assertEqual(self.tbt.next(), 3)  # [3], 3
        self.assertEqual(self.tbt.next(), 3)  # [], 3
        self.assertRaises(RuntimeError, self.tbt.next)
        self.tbt.add([1, 6])  # [1,6], 3
        self.assertEqual(self.tbt.next(), 1)  # [6], 1
```

### References

1. [GFG, disk scheduling algorithms](https://www.geeksforgeeks.org/disk-scheduling-algorithms/)
2. [GFG, SSTF, Multiple](https://www.geeksforgeeks.org/program-for-sstf-disk-scheduling-algorithm/)
3. [ECZ, SSTF, C](https://www.easycodingzone.com/2021/07/c-program-of-sstf-short-seek-time-first.html)
4. [Naukri, SSTF, Multiple](https://www.naukri.com/code360/library/sstf-disk-scheduling-algorithm)
