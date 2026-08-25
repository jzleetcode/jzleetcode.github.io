---
author: JZ
pubDatetime: 2026-08-20T06:00:00Z
modDatetime: 2026-08-20T06:00:00Z
title: LeetCode 253 Meeting Rooms II
featured: false
tags:
  - a-heap
  - a-sorting
  - a-sweep-line
description:
  "Solutions for LeetCode 253, medium, tags: array, sorting, heap, sweep line."
---

## Table of contents

## Description

Question Links: [LeetCode 253](https://leetcode.com/problems/meeting-rooms-ii/description/)

Given an array of meeting time intervals `intervals` where `intervals[i] = [start_i, end_i]`, return the minimum number of conference rooms required.

```
Example 1:

Input: intervals = [[0,30],[5,10],[15,20]]
Output: 2

Example 2:

Input: intervals = [[7,10],[2,4]]
Output: 1

Constraints:

1 <= intervals.length <= 10^4
0 <= start_i < end_i <= 10^6
```

## Solution 1: Min-Heap

### Idea

Sort intervals by start time. Maintain a min-heap of end times representing rooms in use. For each meeting, if the earliest ending room finishes before or when this meeting starts, reuse it (pop the heap). Always push the current meeting's end time. The heap size at the end is the answer.

```
intervals = [[0,30],[5,10],[15,20]]  (already sorted by start)

Process [0,30]:  heap = [30]           rooms = 1
Process [5,10]:  30 > 5, can't reuse.  heap = [10,30]   rooms = 2
Process [15,20]: 10 <= 15, reuse!      heap = [20,30]   rooms = 2

Answer: 2
```

Complexity: Time $O(n \log n)$, Space $O(n)$.

- Sorting: $O(n \log n)$
- Each interval: one heap push $O(\log n)$, at most one heap pop $O(\log n)$
- Total: $O(n \log n)$ time, $O(n)$ space for the heap (worst case all meetings overlap)

#### Java

```java []
public int minMeetingRoomsHeap(int[][] intervals) {
    Arrays.sort(intervals, Comparator.comparingInt(i -> i[0])); // O(n log n)
    Queue<Integer> heap = new PriorityQueue<>();
    heap.add(intervals[0][1]);
    for (int i = 1; i < intervals.length; i++) { // O(n)
        if (intervals[i][0] >= heap.peek()) heap.remove(); // O(log n)
        heap.add(intervals[i][1]); // O(log n)
    }
    return heap.size();
}
```

#### Python

```python []
class Solution:
    def minMeetingRooms(self, intervals: List[List[int]]) -> int:
        intervals.sort()  # O(n log n)
        used = []

        for start, end in intervals:  # O(n)
            if used and used[0] <= start:
                heappop(used)  # O(log n)
            heappush(used, end)  # O(log n)

        return len(used)
```

#### C++

```cpp []
int minMeetingRoomsHeap(vector<vector<int>> &intervals) {
    sort(intervals.begin(), intervals.end()); // O(n log n)
    priority_queue<int, vector<int>, greater<>> pq; // min-heap of end times

    for (auto &iv: intervals) { // O(n)
        if (!pq.empty() && pq.top() <= iv[0]) pq.pop(); // O(log n)
        pq.push(iv[1]); // O(log n)
    }

    return (int) pq.size();
}
```

#### Rust

```rust []
pub fn min_meeting_rooms(intervals: Vec<Vec<i32>>) -> i32 {
    let mut intervals = intervals;
    intervals.sort_unstable(); // O(n log n)
    let mut heap: BinaryHeap<Reverse<i32>> = BinaryHeap::new();

    for iv in &intervals { // O(n)
        if let Some(&Reverse(earliest_end)) = heap.peek() {
            if earliest_end <= iv[0] {
                heap.pop(); // O(log n)
            }
        }
        heap.push(Reverse(iv[1])); // O(log n)
    }

    heap.len() as i32
}
```

## Solution 2: Sweep Line (Chronological Ordering)

### Idea

Separate start times and end times into two sorted arrays. Use two pointers to sweep through events chronologically. A start event means we need a room; an end event means one is freed. If the current start is before the earliest unprocessed end, we need one more room. Otherwise, we reuse a room (advance end pointer).

```
intervals = [[0,30],[5,10],[15,20]]

starts = [0, 5, 15]   (sorted)
ends   = [10, 20, 30] (sorted)

i=0: start=0  < end=10  -> rooms++ = 1, endPtr=0
i=1: start=5  < end=10  -> rooms++ = 2, endPtr=0
i=2: start=15 >= end=10 -> reuse,       endPtr=1

Answer: 2
```

Complexity: Time $O(n \log n)$, Space $O(n)$.

- Two sorts of $n$ elements: $O(n \log n)$
- Single pass with two pointers: $O(n)$

#### Java

```java []
public int minMeetingRoomsSort(int[][] intervals) {
    int[] starts = new int[intervals.length], ends = new int[intervals.length];
    for (int i = 0; i < intervals.length; i++) { // O(n)
        starts[i] = intervals[i][0];
        ends[i] = intervals[i][1];
    }
    Arrays.sort(starts); // O(n log n)
    Arrays.sort(ends); // O(n log n)
    int rooms = 0, endPointer = 0;
    for (int i = 0; i < intervals.length; i++) { // O(n)
        if (starts[i] < ends[endPointer]) rooms++;
        else endPointer++;
    }
    return rooms;
}
```

#### Python

```python []
class Solution2:
    def minMeetingRooms(self, intervals: List[List[int]]) -> int:
        starts = sorted(i[0] for i in intervals)  # O(n log n)
        ends = sorted(i[1] for i in intervals)  # O(n log n)
        rooms, end_ptr = 0, 0

        for i in range(len(intervals)):  # O(n)
            if starts[i] < ends[end_ptr]:
                rooms += 1
            else:
                end_ptr += 1

        return rooms
```

#### C++

```cpp []
int minMeetingRoomsSweep(vector<vector<int>> &intervals) {
    int n = (int) intervals.size();
    vector<int> starts(n), ends(n);
    for (int i = 0; i < n; i++) { // O(n)
        starts[i] = intervals[i][0];
        ends[i] = intervals[i][1];
    }
    sort(starts.begin(), starts.end()); // O(n log n)
    sort(ends.begin(), ends.end()); // O(n log n)

    int rooms = 0, endPtr = 0;
    for (int i = 0; i < n; i++) { // O(n)
        if (starts[i] < ends[endPtr]) rooms++;
        else endPtr++;
    }

    return rooms;
}
```

#### Rust

```rust []
pub fn min_meeting_rooms(intervals: Vec<Vec<i32>>) -> i32 {
    let n = intervals.len();
    let mut starts: Vec<i32> = intervals.iter().map(|iv| iv[0]).collect();
    let mut ends: Vec<i32> = intervals.iter().map(|iv| iv[1]).collect();
    starts.sort_unstable(); // O(n log n)
    ends.sort_unstable(); // O(n log n)

    let mut rooms = 0;
    let mut end_ptr = 0;

    for i in 0..n { // O(n)
        if starts[i] < ends[end_ptr] {
            rooms += 1;
        } else {
            end_ptr += 1;
        }
    }

    rooms
}
```
