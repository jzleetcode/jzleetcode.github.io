---
author: JZ
pubDatetime: 2026-08-28T06:00:00Z
modDatetime: 2026-08-28T06:00:00Z
title: LeetCode 2251 Number of Flowers in Full Bloom
featured: true
tags:
  - a-array
  - a-binary-search
  - a-sorting
  - a-prefix-sum
description:
  "Solutions for LeetCode 2251, hard, tags: array, binary search, sorting, prefix sum, ordered set."
---

## Table of contents

## Description

Question Links: [LeetCode 2251](https://leetcode.com/problems/number-of-flowers-in-full-bloom/description/)

You are given a **0-indexed** 2D integer array `flowers`, where `flowers[i] = [start_i, end_i]` means the `i`th flower will be in **full bloom** from `start_i` to `end_i` (**inclusive**). You are also given a **0-indexed** integer array `people`, where `people[i]` is the time that the `i`th person will arrive to see the flowers.

Return _an integer array_ `answer` _of size_ `people.length`, _where_ `answer[i]` _is the number of flowers that are in full bloom when the_ `i`th _person arrives_.

```
Example 1:

Input: flowers = [[1,6],[3,7],[9,12],[4,13]], people = [2,3,7,11]
Output: [1,2,2,2]
Explanation:
- At time 2, only flower [1,6] is in bloom. So answer[0] = 1.
- At time 3, flowers [1,6] and [3,7] are in bloom. So answer[1] = 2.
- At time 7, flowers [3,7] and [4,13] are in bloom. So answer[2] = 2.
- At time 11, flowers [9,12] and [4,13] are in bloom. So answer[3] = 2.

Example 2:

Input: flowers = [[1,10],[3,3]], people = [3,3,2]
Output: [2,2,1]
Explanation:
- At time 3, flowers [1,10] and [3,3] are blooming.
- At time 2, only flower [1,10] is blooming.

Constraints:

1 <= flowers.length <= 5 * 10^4
flowers[i].length == 2
1 <= start_i <= end_i <= 10^9
1 <= people.length <= 5 * 10^4
1 <= people[i] <= 10^9
```

## Solution 1: Binary Search

### Idea

The key insight is that at any time `t`, the number of flowers in bloom equals:

$$\text{bloom}(t) = |\{i : start_i \le t\}| - |\{i : end_i < t\}|$$

In other words: (flowers that have started by time `t`) minus (flowers that have ended before time `t`).

We sort the `starts` and `ends` arrays separately, then for each query time `t`:
- `bisect_right(starts, t)` gives the count of flowers with `start <= t`
- `bisect_left(ends, t)` gives the count of flowers with `end < t`

```
sorted starts: [1, 3, 4, 9]
sorted ends:   [6, 7, 12, 13]

Query t=7:
  started = bisect_right(starts, 7) = 3   (flowers 1,3,4 started)
  ended   = bisect_left(ends, 7)    = 1   (flower with end=6 ended)
  bloom   = 3 - 1 = 2
```

Complexity: Time $O((n+q) \log n)$, Space $O(n)$.

- Sorting starts and ends: $O(n \log n)$
- Each binary search query: $O(\log n)$, repeated $q$ times

#### Java

```java []
public static int[] fullBloomFlowers(int[][] flowers, int[] people) {
    int n = flowers.length;
    int[] starts = new int[n];
    int[] ends = new int[n];
    for (int i = 0; i < n; i++) { // O(n)
        starts[i] = flowers[i][0];
        ends[i] = flowers[i][1];
    }
    Arrays.sort(starts); // O(n log n)
    Arrays.sort(ends);   // O(n log n)

    int q = people.length;
    int[] result = new int[q];
    for (int i = 0; i < q; i++) { // O(q log n)
        int t = people[i];
        int started = bisectRight(starts, t);
        int ended = bisectLeft(ends, t);
        result[i] = started - ended;
    }
    return result;
}

private static int bisectRight(int[] arr, int val) {
    int lo = 0, hi = arr.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] <= val) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

private static int bisectLeft(int[] arr, int val) {
    int lo = 0, hi = arr.length;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] < val) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
```

#### Python

```python []
class Solution:
    def fullBloomFlowers(self, flowers: List[List[int]], people: List[int]) -> List[int]:
        """Binary Search. O((n + q) log n) time, O(n) space."""
        starts = sorted(s for s, _ in flowers)  # O(n log n)
        ends = sorted(e for _, e in flowers)  # O(n log n)
        res = []
        for t in people:  # O(q) iterations
            started = bisect_right(starts, t)  # O(log n), flowers with start <= t
            ended = bisect_left(ends, t)  # O(log n), flowers with end < t
            res.append(started - ended)
        return res
```

#### C++

```cpp []
class Solution {
public:
    vector<int> fullBloomFlowers(vector<vector<int>>& flowers, vector<int>& people) {
        int n = flowers.size();
        vector<int> starts(n), ends(n);
        for (int i = 0; i < n; i++) { // O(n)
            starts[i] = flowers[i][0];
            ends[i] = flowers[i][1];
        }
        sort(starts.begin(), starts.end()); // O(n log n)
        sort(ends.begin(), ends.end());

        int q = people.size();
        vector<int> result(q);
        for (int i = 0; i < q; i++) { // O(q log n)
            int t = people[i];
            int started = upper_bound(starts.begin(), starts.end(), t) - starts.begin();
            int ended = lower_bound(ends.begin(), ends.end(), t) - ends.begin();
            result[i] = started - ended;
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn full_bloom_flowers(flowers: Vec<Vec<i32>>, people: Vec<i32>) -> Vec<i32> {
        let mut starts: Vec<i32> = flowers.iter().map(|f| f[0]).collect();
        let mut ends: Vec<i32> = flowers.iter().map(|f| f[1]).collect();
        starts.sort_unstable(); // O(n log n)
        ends.sort_unstable();

        people.iter().map(|&t| { // O(q log n)
            let started = starts.partition_point(|&s| s <= t) as i32;
            let ended = ends.partition_point(|&e| e < t) as i32;
            started - ended
        }).collect()
    }
}
```

## Solution 2: Sweep Line

### Idea

An alternative approach uses the sweep line technique:
1. For each flower `[start, end]`, create two events: `(start, +1)` and `(end+1, -1)`.
2. Sort all events by time.
3. Sort queries (people) by arrival time, preserving original indices.
4. Sweep through events and queries together, maintaining a running count of blooming flowers.

```
flowers = [[1,6],[3,7],[9,12],[4,13]]
events: (1,+1), (7,-1), (3,+1), (8,-1), (9,+1), (13,-1), (4,+1), (14,-1)
sorted: (1,+1), (3,+1), (4,+1), (7,-1), (8,-1), (9,+1), (13,-1), (14,-1)

Query t=3: process events up to 3 → count = 1+1 = 2 ✓
Query t=7: process events up to 7 → count = 1+1+1-1 = 2 ✓
```

Complexity: Time $O((n+q) \log(n+q))$, Space $O(n+q)$.

- Sorting events: $O(n \log n)$
- Sorting queries: $O(q \log q)$
- Sweep: $O(n + q)$ total (each event and query visited once)

#### Java

```java []
public static int[] fullBloomFlowersSweep(int[][] flowers, int[] people) {
    int n = flowers.length, q = people.length;
    int[][] events = new int[2 * n][2]; // O(n) space
    for (int i = 0; i < n; i++) {
        events[2 * i] = new int[]{flowers[i][0], 1};
        events[2 * i + 1] = new int[]{flowers[i][1] + 1, -1};
    }
    Arrays.sort(events, (a, b) -> a[0] != b[0] ? Integer.compare(a[0], b[0]) : Integer.compare(a[1], b[1]));

    Integer[] indices = new Integer[q]; // O(q) space
    for (int i = 0; i < q; i++) indices[i] = i;
    Arrays.sort(indices, (a, b) -> Integer.compare(people[a], people[b])); // O(q log q)

    int[] result = new int[q];
    int ei = 0, count = 0;
    for (int idx : indices) { // O(n + q) total
        int t = people[idx];
        while (ei < events.length && events[ei][0] <= t) {
            count += events[ei][1];
            ei++;
        }
        result[idx] = count;
    }
    return result;
}
```

#### Python

```python []
class Solution2:
    def fullBloomFlowers(self, flowers: List[List[int]], people: List[int]) -> List[int]:
        """Sweep Line. O((n + q) log(n + q)) time, O(n + q) space."""
        events = []
        for s, e in flowers:  # O(n)
            events.append((s, 1))
            events.append((e + 1, -1))
        events.sort()  # O(n log n)

        indexed_people = sorted(enumerate(people), key=lambda x: x[1])  # O(q log q)
        res = [0] * len(people)
        count = 0
        ei = 0
        for orig_idx, t in indexed_people:  # O(q) iterations, O(n) events total
            while ei < len(events) and events[ei][0] <= t:
                count += events[ei][1]
                ei += 1
            res[orig_idx] = count
        return res
```

#### C++

```cpp []
class SolutionSweepLine {
public:
    vector<int> fullBloomFlowers(vector<vector<int>>& flowers, vector<int>& people) {
        int n = flowers.size(), q = people.size();
        vector<pair<int, int>> events;
        events.reserve(2 * n);
        for (auto& f : flowers) { // O(n)
            events.push_back({f[0], 1});
            events.push_back({f[1] + 1, -1});
        }
        sort(events.begin(), events.end()); // O(n log n)

        vector<int> idx(q);
        iota(idx.begin(), idx.end(), 0);
        sort(idx.begin(), idx.end(), [&](int a, int b) { // O(q log q)
            return people[a] < people[b];
        });

        vector<int> result(q);
        int blooming = 0, ei = 0;
        for (int i : idx) { // O(n + q) sweep
            int t = people[i];
            while (ei < (int)events.size() && events[ei].first <= t) {
                blooming += events[ei].second;
                ei++;
            }
            result[i] = blooming;
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn full_bloom_flowers_sweep(flowers: Vec<Vec<i32>>, people: Vec<i32>) -> Vec<i32> {
        let mut events: Vec<(i32, i32)> = Vec::with_capacity(flowers.len() * 2);
        for f in &flowers { // O(n)
            events.push((f[0], 1));
            events.push((f[1] + 1, -1));
        }
        events.sort_unstable(); // O(n log n)

        let mut queries: Vec<(i32, usize)> = people.iter().enumerate()
            .map(|(i, &t)| (t, i)).collect();
        queries.sort_unstable(); // O(q log q)

        let mut result = vec![0i32; people.len()];
        let mut bloom_count = 0i32;
        let mut ei = 0;
        for (time, orig_idx) in queries { // O(n + q) sweep
            while ei < events.len() && events[ei].0 <= time {
                bloom_count += events[ei].1;
                ei += 1;
            }
            result[orig_idx] = bloom_count;
        }
        result
    }
}
```
