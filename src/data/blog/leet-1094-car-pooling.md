---
author: JZ
pubDatetime: 2026-09-29T10:07:00Z
modDatetime: 2026-09-29T10:07:00Z
title: LeetCode 1094 Car Pooling
featured: true
tags:
  - a-array
  - a-sorting
  - a-prefix-sum
description:
  "Solutions for LeetCode 1094, medium, tags: array, sorting, heap, simulation, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 1094](https://leetcode.com/problems/car-pooling/description/)

A vehicle has a given `capacity` of empty seats. The vehicle only drives east (i.e., it cannot turn around and drive west).

You are given an array `trips` where `trips[i] = [numPassengers_i, from_i, to_i]` indicates that the `i`th trip has `numPassengers_i` passengers and the locations to pick them up and drop them off are `from_i` and `to_i` respectively. The locations are given as the number of kilometers due east from the vehicle's initial location.

Return `true` if it is possible to pick up and drop off all passengers for all the given trips, or `false` otherwise.

```
Example 1:

Input: trips = [[2,1,5],[3,3,7]], capacity = 4
Output: false

Example 2:

Input: trips = [[2,1,5],[3,3,7]], capacity = 5
Output: true

Constraints:

1 <= trips.length <= 1000
trips[i].length == 3
1 <= numPassengers_i <= 100
0 <= from_i < to_i <= 1000
1 <= capacity <= 10^5
```

## Solution 1: Difference Array

### Idea

Since stop locations are bounded $[0, 1000]$, use a **difference array** of size 1001. For each trip, increment at the pickup stop and decrement at the drop-off stop. Then compute the prefix sum — if it ever exceeds capacity, return false.

Passengers are dropped off **before** new ones board at the same stop (subtract at `to`, add at `from`), so `to` is exclusive.

```
trips = [[2,1,5],[3,3,7]], capacity = 4

diff array (only non-zero shown):
  stop 1: +2
  stop 3: +3
  stop 5: -2
  stop 7: -3

prefix sum:
  stop 0:  0
  stop 1:  2   <= 4 ok
  stop 2:  2   <= 4 ok
  stop 3:  5   >  4 FAIL --> return false
```

Complexity: Time $O(n + 1001)$, Space $O(1001)$ — effectively $O(1)$ since the range is fixed.

#### Java

```java []
// see algorithm-java src/main/java/array/CarPooling.java for the full source.
public static boolean carPooling(int[][] trips, int capacity) {
    int[] diff = new int[1001]; // O(1001) space — stops bounded [0, 1000]
    for (int[] t : trips) { // O(n)
        diff[t[1]] += t[0]; // add passengers at pickup
        diff[t[2]] -= t[0]; // subtract passengers at drop-off
    }
    int curr = 0;
    for (int d : diff) { // O(1001)
        curr += d;
        if (curr > capacity) return false;
    }
    return true;
}
```

#### C++

```cpp []
bool carPooling(vector<vector<int>>& trips, int capacity) {
    int diff[1001] = {};
    for (auto& t : trips) { // O(n)
        diff[t[1]] += t[0];
        diff[t[2]] -= t[0];
    }
    int cur = 0;
    for (int i = 0; i <= 1000; ++i) { // O(1001)
        cur += diff[i];
        if (cur > capacity) return false;
    }
    return true;
}
```

#### Python

```python []
def carPooling(self, trips: list[list[int]], capacity: int) -> bool:
    stops = [0] * 1001  # O(1001) space, constraints: 0 <= from < to <= 1000
    for passengers, frm, to in trips:
        stops[frm] += passengers
        stops[to] -= passengers
    cur = 0
    for delta in stops:  # O(1001)
        cur += delta
        if cur > capacity:
            return False
    return True  # Time O(n+1001), Space O(1001)
```

#### Rust

```rust []
// see crates/leet/src/array/car_pooling.rs for the full source.
pub fn car_pooling(trips: Vec<Vec<i32>>, capacity: i32) -> bool {
    let mut diff = vec![0i32; 1001];
    for trip in &trips { // O(n)
        let (num, from, to) = (trip[0], trip[1] as usize, trip[2] as usize);
        diff[from] += num;
        diff[to] -= num;
    }
    let mut current = 0;
    for d in &diff { // O(1001)
        current += d;
        if current > capacity {
            return false;
        }
    }
    true
}
```

## Solution 2: Sorted Events Sweep

### Idea

Instead of a fixed-size array, create **(location, delta)** events for each trip: `+passengers` at pickup, `-passengers` at drop-off. Sort events by location (ties broken so negative deltas — drop-offs — come first). Sweep through and check if the running total ever exceeds capacity.

This approach generalizes to unbounded stop ranges and uses only $O(n)$ space proportional to the number of trips.

```
trips = [[2,1,5],[3,3,7]], capacity = 5

events: [(1,+2), (3,+3), (5,-2), (7,-3)]

sweep:
  (1, +2) -> cur = 2  <= 5 ok
  (3, +3) -> cur = 5  <= 5 ok
  (5, -2) -> cur = 3  <= 5 ok
  (7, -3) -> cur = 0  <= 5 ok
  --> return true
```

Complexity: Time $O(n \log n)$, Space $O(n)$.

#### Java

```java []
// see algorithm-java src/main/java/array/CarPooling.java for the full source.
public static boolean carPooling2(int[][] trips, int capacity) {
    int[][] events = new int[trips.length * 2][2]; // O(n) space
    int idx = 0;
    for (int[] t : trips) { // O(n)
        events[idx++] = new int[]{t[1], t[0]};  // pickup: +passengers
        events[idx++] = new int[]{t[2], -t[0]}; // drop-off: -passengers
    }
    // Sort by location; ties broken by delta so drop-offs come before pickups
    Arrays.sort(events, (a, b) -> a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]); // O(n log n)
    int curr = 0;
    for (int[] e : events) { // O(n)
        curr += e[1];
        if (curr > capacity) return false;
    }
    return true;
}
```

#### C++

```cpp []
bool carPooling2(vector<vector<int>>& trips, int capacity) {
    vector<pair<int,int>> events;
    for (auto& t : trips) { // O(n)
        events.emplace_back(t[1], t[0]);   // pick up
        events.emplace_back(t[2], -t[0]);  // drop off
    }
    sort(events.begin(), events.end()); // O(n log n)
    int cur = 0;
    for (auto& [loc, delta] : events) { // O(n)
        cur += delta;
        if (cur > capacity) return false;
    }
    return true;
}
```

#### Python

```python []
def carPooling(self, trips: list[list[int]], capacity: int) -> bool:
    events = []
    for passengers, frm, to in trips:  # O(n)
        events.append((frm, passengers))
        events.append((to, -passengers))
    events.sort()  # O(n log n)
    cur = 0
    for _, delta in events:  # O(n)
        cur += delta
        if cur > capacity:
            return False
    return True  # Time O(n log n), Space O(n)
```

#### Rust

```rust []
// see crates/leet/src/array/car_pooling.rs for the full source.
pub fn car_pooling_events(trips: Vec<Vec<i32>>, capacity: i32) -> bool {
    let mut events: Vec<(i32, i32)> = Vec::with_capacity(trips.len() * 2);
    for trip in &trips { // O(n)
        events.push((trip[1], trip[0]));
        events.push((trip[2], -trip[0]));
    }
    events.sort(); // O(n log n)
    let mut current = 0;
    for (_, delta) in &events { // O(n)
        current += delta;
        if current > capacity {
            return false;
        }
    }
    true
}
```
