---
author: JZ
pubDatetime: 2026-05-21T06:00:00Z
modDatetime: 2026-05-21T06:00:00Z
title: LeetCode 2462 Total Cost to Hire K Workers
featured: false
tags:
  - a-heap
  - a-two-pointers
description:
  "Solutions for LeetCode 2462, medium, tags: array, two pointers, heap (priority queue), simulation."
---

## Table of contents

## Description

Question Links: [LeetCode 2462](https://leetcode.com/problems/total-cost-to-hire-k-workers/description/)

You are given a **0-indexed** integer array `costs` where `costs[i]` is the cost of hiring the `i`th worker.

You are also given two integers `k` and `candidates`. We want to hire exactly `k` workers according to the following rules:

- You will run `k` sessions and hire exactly one worker in each session.
- In each hiring session, choose the worker with the lowest cost from either the first `candidates` workers or the last `candidates` workers. Break the tie by the smallest index.
  - If a chosen worker is from the first `candidates`, all workers from left to the chosen worker's index (inclusive) are no longer available for future sessions.
  - If a chosen worker is from the last `candidates`, all workers from the chosen worker's index to the last worker (inclusive) are no longer available for future sessions.
- If there are fewer than `candidates` workers remaining, choose the worker with the lowest cost among them. Break the tie by the smallest index.

Return the total cost to hire exactly `k` workers.

```
Example 1:

Input: costs = [17,12,10,2,7,2,11,20,8], k = 3, candidates = 4
Output: 11
Explanation: We hire 3 workers in total. The total cost is initially 0.
- In the 1st hiring round we choose from [17,12,10,2,7,2,11,20,8].
  The lowest cost is 2 from [2,7,2,11,20,8]. We hire worker at index 3 (cost=2).
  Total cost = 2.
- In the 2nd hiring round we choose from [17,12,10,7,2,11,20,8].
  The lowest cost is 2 from [2,11,20,8]. We hire worker at index 4 (cost=2).
  Total cost = 4.
- In the 3rd hiring round we choose from [17,12,10,7,11,20,8].
  The lowest cost is 7 from [17,12,10,7]. We hire worker at index 3 (cost=7).
  Total cost = 11.
  The total hiring cost is 11.

Example 2:

Input: costs = [1,2,4,1], k = 3, candidates = 3
Output: 4
Explanation: We hire 3 workers in total. The total cost is initially 0.
- In the 1st hiring round we choose from [1,2,4,1].
  The lowest cost is 1 from [1,2,4] (candidates=3 from front).
  We hire worker at index 0. Total cost = 1.
- In the 2nd hiring round we choose from [2,4,1].
  The lowest cost is 1 from [2,4,1].
  We hire worker at index 3. Total cost = 2.
- In the 3rd hiring round we choose from [2,4].
  The lowest cost is 2 from [2,4].
  We hire worker at index 1. Total cost = 4.
  The total hiring cost is 4.
```

**Constraints:**

- `1 <= costs.length <= 10^5`
- `1 <= costs[i] <= 10^5`
- `1 <= k, candidates <= costs.length`

## Idea1

Maintain **two min-heaps**: one for the first `candidates` workers (left window) and one for the last `candidates` workers (right window). Use two pointers `lo` and `hi` to track the boundary of unvisited workers in the middle.

Each round, compare the tops of both heaps. Pick the cheaper one (tie: prefer front/smaller index). After picking, if there are still unvisited workers in the middle, push the next one from the corresponding side.

```
costs = [17, 12, 10, 2, 7, 2, 11, 20, 8], k=3, candidates=4

Initial:
  front heap (indices 0-3): [2, 10, 12, 17]  min=2
  back  heap (indices 5-8): [2, 8, 11, 20]   min=2
  lo=4, hi=4  (index 4 = cost 7 still available)

Round 1: front min (2,idx3) <= back min (2,idx5) -> pick front
  total=2, pop idx3 from front, push costs[4]=7
  front: [7, 10, 12, 17], lo=5, hi=4 (no more middle)

Round 2: front min=7, back min=2 -> pick back (2,idx5)
  total=4, lo > hi so no refill

Round 3: front min=7, back min=8 -> pick front (7)
  total=11

Answer: 11
```

Complexity: Time $O((candidates + k) \log candidates)$ — initial heap build is $O(candidates)$, then $k$ iterations each doing $O(\log candidates)$ heap operations. Space $O(candidates)$.

### Java

```java []
// lc 2462, two PriorityQueues. O((candidates + k) log candidates) time, O(candidates) space.
static class Solution1 {
    public long totalCost(int[] costs, int k, int candidates) {
        int n = costs.length;
        PriorityQueue<int[]> front = new PriorityQueue<>((a, b) -> a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);
        PriorityQueue<int[]> back = new PriorityQueue<>((a, b) -> a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);
        int lo = 0, hi = n - 1;
        for (int i = 0; i < candidates && lo <= hi; i++) front.add(new int[]{costs[lo], lo++});
        for (int i = 0; i < candidates && lo <= hi; i++) back.add(new int[]{costs[hi], hi--});
        long total = 0;
        while (k-- > 0) {
            int[] f = front.peek(), b = back.peek();
            if (b == null || (f != null && f[0] <= b[0])) {
                total += front.poll()[0];
                if (lo <= hi) front.add(new int[]{costs[lo], lo++});
            } else {
                total += back.poll()[0];
                if (lo <= hi) back.add(new int[]{costs[hi], hi--});
            }
        }
        return total;
    }
}
```

```python []
# lc 2462, two min-heaps. O((candidates + k) log candidates) time, O(candidates) space.
class Solution:
    def totalCost(self, costs: list[int], k: int, candidates: int) -> int:
        n = len(costs)
        front, back = [], []
        lo, hi = 0, n - 1
        for _ in range(candidates):  # O(candidates log candidates)
            if lo <= hi:
                heapq.heappush(front, (costs[lo], lo))
                lo += 1
        for _ in range(candidates):
            if lo <= hi:
                heapq.heappush(back, (costs[hi], hi))
                hi -= 1
        total = 0
        for _ in range(k):  # O(k log candidates)
            if not back or (front and front[0] <= back[0]):
                cost, _ = heapq.heappop(front)
                total += cost
                if lo <= hi:
                    heapq.heappush(front, (costs[lo], lo))
                    lo += 1
            else:
                cost, _ = heapq.heappop(back)
                total += cost
                if lo <= hi:
                    heapq.heappush(back, (costs[hi], hi))
                    hi -= 1
        return total
```

```cpp []
// lc 2462, two min-heaps. O((candidates + k) log candidates) time, O(candidates) space.
long long totalCost(vector<int>& costs, int k, int candidates) {
    int n = costs.size();
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> left, right;
    int lo = 0, hi = n - 1;
    while (lo < candidates && lo <= hi) left.push({costs[lo], lo}), lo++;
    while (hi >= lo && (n - 1 - hi) < candidates) right.push({costs[hi], hi}), hi--;
    long long total = 0;
    for (int i = 0; i < k; i++) {
        int lv = left.empty() ? INT_MAX : left.top().first;
        int rv = right.empty() ? INT_MAX : right.top().first;
        if (lv <= rv) {
            total += lv;
            left.pop();
            if (lo <= hi) { left.push({costs[lo], lo}); lo++; }
        } else {
            total += rv;
            right.pop();
            if (lo <= hi) { right.push({costs[hi], hi}); hi--; }
        }
    }
    return total;
}
```

```rust []
// lc 2462, two BinaryHeaps (min-heap via Reverse). O((candidates + k) log candidates) time.
pub fn total_cost(costs: Vec<i32>, k: i32, candidates: i32) -> i64 {
    let n = costs.len();
    let (k, candidates) = (k as usize, candidates as usize);
    if candidates * 2 >= n {
        let mut sorted = costs.clone();
        sorted.sort_unstable();
        return sorted.iter().take(k).map(|&x| x as i64).sum();
    }
    let mut front: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    let mut back: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    let (mut lo, mut hi) = (0, n - 1);
    for _ in 0..candidates { front.push(Reverse((costs[lo], lo))); lo += 1; }
    for _ in 0..candidates { back.push(Reverse((costs[hi], hi))); hi -= 1; }
    let mut total: i64 = 0;
    for _ in 0..k {
        let pick_front = match (front.peek(), back.peek()) {
            (Some(&Reverse(f)), Some(&Reverse(b))) => f <= b,
            (Some(_), None) => true, _ => false,
        };
        if pick_front {
            let Reverse((cost, _)) = front.pop().unwrap();
            total += cost as i64;
            if lo <= hi { front.push(Reverse((costs[lo], lo))); lo += 1; }
        } else {
            let Reverse((cost, _)) = back.pop().unwrap();
            total += cost as i64;
            if lo <= hi { back.push(Reverse((costs[hi], hi))); hi -= 1; }
        }
    }
    total
}
```

## Idea2

Use a **single min-heap** storing `(cost, index)` pairs from both sides. After popping the minimum, determine which side it came from by comparing its index to the current `lo` boundary — if `index < lo` it was from the front window, otherwise from the back. Refill from the appropriate side.

This simplifies the comparison logic (the heap naturally orders by cost then index) at the cost of slightly more complex side-detection logic.

Complexity: same as Idea1 — Time $O((candidates + k) \log candidates)$, Space $O(candidates)$.

### Java

```java []
// lc 2462, single PriorityQueue. O((candidates + k) log candidates) time, O(candidates) space.
static class Solution2 {
    public long totalCost(int[] costs, int k, int candidates) {
        int n = costs.length;
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) ->
            a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);
        int lo = 0, hi = n - 1;
        for (int i = 0; i < candidates && lo <= hi; i++) pq.add(new int[]{costs[lo], lo++, 0});
        for (int i = 0; i < candidates && lo <= hi; i++) pq.add(new int[]{costs[hi], hi--, 1});
        long total = 0;
        while (k-- > 0) {
            int[] top = pq.poll();
            total += top[0];
            if (lo <= hi) {
                if (top[2] == 0) pq.add(new int[]{costs[lo], lo++, 0});
                else pq.add(new int[]{costs[hi], hi--, 1});
            }
        }
        return total;
    }
}
```

```python []
# lc 2462, single min-heap. O((candidates + k) log candidates) time, O(candidates) space.
class Solution2:
    def totalCost(self, costs: list[int], k: int, candidates: int) -> int:
        n = len(costs)
        heap = []
        lo, hi = 0, n - 1
        for _ in range(candidates):
            if lo <= hi:
                heapq.heappush(heap, (costs[lo], lo, 0))  # 0 = front
                lo += 1
        for _ in range(candidates):
            if lo <= hi:
                heapq.heappush(heap, (costs[hi], hi, 1))  # 1 = back
                hi -= 1
        total = 0
        for _ in range(k):
            cost, idx, side = heapq.heappop(heap)
            total += cost
            if lo <= hi:
                if side == 0:
                    heapq.heappush(heap, (costs[lo], lo, 0))
                    lo += 1
                else:
                    heapq.heappush(heap, (costs[hi], hi, 1))
                    hi -= 1
        return total
```

```cpp []
// lc 2462, single min-heap. O((candidates + k) log candidates) time, O(candidates) space.
long long totalCost(vector<int>& costs, int k, int candidates) {
    int n = costs.size();
    priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
    int lo = 0, hi = n - 1;
    for (int i = 0; i < candidates && lo <= hi; i++, lo++) pq.push({costs[lo], lo});
    for (int i = 0; i < candidates && lo <= hi; i++, hi--) pq.push({costs[hi], hi});
    long long total = 0;
    for (int i = 0; i < k; i++) {
        auto [cost, idx] = pq.top(); pq.pop();
        total += cost;
        if (idx < lo) {
            if (lo <= hi) { pq.push({costs[lo], lo}); lo++; }
        } else {
            if (lo <= hi) { pq.push({costs[hi], hi}); hi--; }
        }
    }
    return total;
}
```

```rust []
// lc 2462, single BinaryHeap. O((candidates + k) log candidates) time.
pub fn total_cost_v2(costs: Vec<i32>, k: i32, candidates: i32) -> i64 {
    let n = costs.len();
    let (k, candidates) = (k as usize, candidates as usize);
    if candidates * 2 >= n {
        let mut sorted = costs.clone();
        sorted.sort_unstable();
        return sorted.iter().take(k).map(|&x| x as i64).sum();
    }
    let mut heap: BinaryHeap<Reverse<(i32, usize)>> = BinaryHeap::new();
    let (mut lo, mut hi) = (0, n - 1);
    for _ in 0..candidates { heap.push(Reverse((costs[lo], lo))); lo += 1; }
    for _ in 0..candidates { heap.push(Reverse((costs[hi], hi))); hi -= 1; }
    let mut total: i64 = 0;
    for _ in 0..k {
        let Reverse((cost, idx)) = heap.pop().unwrap();
        total += cost as i64;
        if lo <= hi {
            if idx < lo { heap.push(Reverse((costs[lo], lo))); lo += 1; }
            else { heap.push(Reverse((costs[hi], hi))); hi -= 1; }
        }
    }
    total
}
```
