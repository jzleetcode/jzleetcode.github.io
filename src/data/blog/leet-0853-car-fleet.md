---
author: JZ
pubDatetime: 2026-05-24T06:00:00Z
modDatetime: 2026-05-24T06:00:00Z
title: LeetCode 853 Car Fleet
featured: false
tags:
  - a-array
  - a-sorting
  - a-monotonic-stack
description:
  "Solutions for LeetCode 853, medium, tags: array, sorting, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 853](https://leetcode.com/problems/car-fleet/description/)

There are `n` cars at given miles away from the starting mile 0, traveling to reach the mile `target`.

You are given two integer arrays `position` and `speed`, both of length `n`, where `position[i]` is the starting mile of the ith car and `speed[i]` is the speed of the ith car in miles per hour.

A car cannot pass another car, but it can catch up and then travel next to it at the speed of the slower car.

A car fleet is a car or cars driving next to each other. The speed of the car fleet is the minimum speed of any car in the fleet.

If a car catches up to a car fleet at the mile target, it will still be considered as part of the car fleet.

Return the number of car fleets that will arrive at the destination.

```
Example 1:

Input: target = 12, position = [10,8,0,5,3], speed = [2,4,1,1,3]
Output: 3
Explanation:
The cars starting at 10 (speed 2) and 8 (speed 4) become a fleet, meeting each other at 12.
The car starting at 0 (speed 1) does not catch up to any other car, so it is a fleet by itself.
The cars starting at 5 (speed 1) and 3 (speed 3) become a fleet, meeting each other at 6.

Example 2:

Input: target = 10, position = [3], speed = [3]
Output: 1

Example 3:

Input: target = 100, position = [0,2,4], speed = [4,2,1]
Output: 1
Explanation:
The cars starting at 0 (speed 4) and 2 (speed 2) become a fleet, meeting each other at 4.
The car starting at 4 (speed 1) travels to 5.
Then, the fleet at 4 (speed 2) and the car at position 5 (speed 1) become one fleet,
meeting each other at 6. The fleet moves at speed 1 until it reaches target.

Constraints:

n == position.length == speed.length
1 <= n <= 10^5
0 < target <= 10^6
0 <= position[i] < target
All the values of position are unique.
0 < speed[i] <= 10^6
```

## Solution: Sort by Position + Greedy Scan

### Idea

The key insight is: a car can only form a fleet with the car directly ahead of it. If we sort cars by position in descending order (closest to target first), we can compute the time each car needs to reach the target. If a car behind reaches the target in less time than the car ahead, it catches up and merges into that fleet. Otherwise, it starts a new fleet.

```
target = 12, position = [10,8,0,5,3], speed = [2,4,1,1,3]

Sort by position (descending):
  pos=10, speed=2 -> time = (12-10)/2 = 1.0
  pos=8,  speed=4 -> time = (12-8)/4  = 1.0   <= 1.0, merges with above
  pos=5,  speed=1 -> time = (12-5)/1  = 7.0   > 1.0, new fleet (cur=7.0)
  pos=3,  speed=3 -> time = (12-3)/3  = 3.0   <= 7.0, merges
  pos=0,  speed=1 -> time = (12-0)/1  = 12.0  > 7.0, new fleet (cur=12.0)

Result: 3 fleets
```

We iterate once through the sorted list, keeping track of the current maximum time (`cur`). Each time we see a car whose time exceeds `cur`, it cannot be absorbed by any fleet ahead, so it starts a new fleet.

Complexity: Time $O(n \log n)$ for sorting. Space $O(n)$.

#### Java

```java []
public int carFleet(int target, int[] position, int[] speed) {
    TreeMap<Integer, Double> m = new TreeMap<>();
    for (int i = 0; i < position.length; ++i) // O(n log n)
        m.put(-position[i], (double) (target - position[i]) / speed[i]);
    int res = 0;
    double cur = 0;
    for (double time : m.values()) { // O(n)
        if (time <= cur) continue;
        cur = time;
        res++;
    }
    return res; // Time O(n log n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def carFleet(self, target: int, position: list[int], speed: list[int]) -> int:
        times = [(target - p) / s for p, s in sorted(zip(position, speed))]  # O(n log n)
        cur, res = 0, 0
        for t in times[::-1]:  # O(n), iterate from closest to target
            if t <= cur:
                continue
            cur = t
            res += 1
        return res  # Time O(n log n), Space O(n)
```

#### C++

```cpp []
int carFleet(int target, vector<int> &position, vector<int> &speed) {
    int n = static_cast<int>(position.size());
    vector<int> idx(n);
    iota(idx.begin(), idx.end(), 0);
    sort(idx.begin(), idx.end(), [&](int a, int b) { // O(n log n)
        return position[a] > position[b];
    });
    int res = 0;
    double cur = 0;
    for (int i : idx) { // O(n)
        double time = (double) (target - position[i]) / speed[i];
        if (time > cur) {
            cur = time;
            res++;
        }
    }
    return res; // Time O(n log n), Space O(n)
}
```

#### Rust

```rust []
pub fn car_fleet(target: i32, position: Vec<i32>, speed: Vec<i32>) -> i32 {
    let mut cars: Vec<(i32, i32)> = position.into_iter().zip(speed).collect();
    cars.sort_unstable_by(|a, b| b.0.cmp(&a.0)); // sort by position descending, O(n log n)
    let mut res = 0;
    let mut cur: f64 = 0.0;
    for (p, s) in cars { // O(n)
        let time = (target - p) as f64 / s as f64;
        if time > cur {
            cur = time;
            res += 1;
        }
    }
    res // Time O(n log n), Space O(n)
}
```
