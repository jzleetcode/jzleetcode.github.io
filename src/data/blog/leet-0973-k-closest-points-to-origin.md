---
author: JZ
pubDatetime: 2026-05-28T06:00:00Z
modDatetime: 2026-05-28T06:00:00Z
title: LeetCode 973 K Closest Points to Origin
featured: false
tags:
  - a-array
  - a-heap
  - a-divide-and-conquer
  - a-quickselect
  - a-geometry
description:
  "Solutions for LeetCode 973, medium, tags: array, math, divide and conquer, geometry, sorting, heap, quickselect."
---

## Table of contents

## Description

Question Links: [LeetCode 973](https://leetcode.com/problems/k-closest-points-to-origin/description/)

Given an array of `points` where `points[i] = [xi, yi]` represents a point on the X-Y plane and an integer `k`, return the `k` closest points to the origin `(0, 0)`.

The distance between two points on the X-Y plane is the Euclidean distance (i.e., `sqrt(x^2 + y^2)`).

You may return the answer in any order. The answer is guaranteed to be unique (except for the order that it is in).

```
Example 1:

Input: points = [[1,3],[-2,2]], k = 1
Output: [[-2,2]]
Explanation: The distance between (1, 3) and the origin is sqrt(10).
The distance between (-2, 2) and the origin is sqrt(8).
Since sqrt(8) < sqrt(10), (-2, 2) is closer to the origin.
We only want the closest k = 1 points from the origin, so the answer is just [[-2,2]].

Example 2:

Input: points = [[3,3],[5,-1],[-2,4]], k = 2
Output: [[3,3],[-2,4]]

Constraints:

1 <= k <= points.length <= 10^4
-10^4 <= xi, yi <= 10^4
```

## Solution 1: Max-Heap of Size K

### Idea

Maintain a max-heap of size `k` keyed by squared distance. For each point, push it onto the heap; when the heap exceeds size `k`, pop the farthest point. After processing all points the heap contains exactly the `k` closest.

We compare squared distances to avoid floating-point `sqrt`.

```
Input: points = [[3,3],[5,-1],[-2,4]], k = 2

Process each point with max-heap (size limit = 2):
  push (dist=18, [3,3])  -> heap: [(18,[3,3])]           size=1 <= k
  push (dist=26, [5,-1]) -> heap: [(26,[5,-1]),(18,[3,3])] size=2 <= k
  push (dist=20, [-2,4]) -> heap: [(26,[5,-1]),(20,[-2,4]),(18,[3,3])] size=3 > k
    pop max (26,[5,-1])  -> heap: [(20,[-2,4]),(18,[3,3])]  size=2 = k

Result: [[3,3],[-2,4]]
```

Complexity: Time $O(n \log k)$ — iterate $n$ points, each heap push/pop is $O(\log k)$. Space $O(k)$ for the heap.

#### Java

```java []
public static int[][] kClosestHeap(int[][] points, int k) {
    // max-heap by squared distance; evict farthest when size exceeds k
    PriorityQueue<int[]> maxHeap = new PriorityQueue<>(
            (a, b) -> distSq(b) - distSq(a)
    );
    for (int[] p : points) { // O(n log k): iterate n, each heap op O(log k)
        maxHeap.offer(p);
        if (maxHeap.size() > k) maxHeap.poll(); // evict farthest, keep k closest
    }
    int[][] result = new int[k][2];
    for (int i = 0; i < k; i++) result[i] = maxHeap.poll();
    return result;
}

private static int distSq(int[] point) {
    return point[0] * point[0] + point[1] * point[1];
}
```

#### Python

```python []
class Solution:
    """max-heap of size k. O(n log k) time, O(k) space."""

    def kClosest(self, points: list[list[int]], k: int) -> list[list[int]]:
        heap: list[tuple[int, list[int]]] = []
        for p in points:  # O(n log k): iterate n points, each heap op O(log k)
            dist = p[0] * p[0] + p[1] * p[1]
            heappush(heap, (-dist, p))
            if len(heap) > k:
                heappop(heap)  # evict farthest
        return [p for _, p in heap]
```

#### C++

```cpp []
vector<vector<int>> kClosest(vector<vector<int>> &points, int k) {
    // max-heap by squared distance
    auto cmp = [](const vector<int> &a, const vector<int> &b) {
        return a[0] * a[0] + a[1] * a[1] < b[0] * b[0] + b[1] * b[1];
    };
    priority_queue<vector<int>, vector<vector<int>>, decltype(cmp)> pq(cmp);
    for (auto &p : points) { // O(n log k)
        pq.push(p);
        if ((int) pq.size() > k) pq.pop(); // evict farthest
    }
    vector<vector<int>> res;
    while (!pq.empty()) {
        res.push_back(pq.top());
        pq.pop();
    }
    return res;
}
```

#### Rust

```rust []
pub fn k_closest(points: Vec<Vec<i32>>, k: i32) -> Vec<Vec<i32>> {
    let k = k as usize;
    // Max-heap keyed by squared distance
    let mut heap: BinaryHeap<(i64, usize)> = BinaryHeap::new();
    for (i, p) in points.iter().enumerate() {
        let dist = (p[0] as i64) * (p[0] as i64) + (p[1] as i64) * (p[1] as i64);
        heap.push((dist, i));
        if heap.len() > k {
            heap.pop(); // evict farthest point
        }
    }
    heap.into_iter().map(|(_, i)| points[i].clone()).collect()
}
```

## Solution 2: Quickselect

### Idea

Use quickselect (partition-based selection) to partially sort the array such that the first `k` elements are the `k` closest — without fully sorting. Pick a random pivot, partition points by distance relative to the pivot, then recurse into the appropriate side.

```
Input: points = [[3,3],[5,-1],[-2,4]], k = 2
Distances:       18     26     20

Quickselect with pivot index 2 (point [-2,4], dist=20):
  Partition around dist=20:
    [3,3] dist=18 < 20 -> left
    [5,-1] dist=26 >= 20 -> right
  After partition: [[3,3], [-2,4], [5,-1]]
                    ^^^^^^^^^^^^^^
                    pivot at index 1

  pivot_index=1 < k=2, so search right half: lo=2
  Only one element left, done.

Result: points[:2] = [[3,3],[-2,4]]
```

Complexity: Time $O(n)$ average — each partition halves the search space geometrically, so total work is $n + n/2 + n/4 + ... = O(n)$. Worst case $O(n^2)$ with adversarial input. Space $O(1)$ extra (in-place partitioning).

#### Java

```java []
public static int[][] kClosestQuickSelect(int[][] points, int k) {
    Random rand = new Random();
    int lo = 0, hi = points.length - 1;
    while (lo < hi) { // O(n) average: each partition halves search space
        int pi = partition(points, lo, hi, rand);
        if (pi == k) break;
        else if (pi < k) lo = pi + 1;
        else hi = pi - 1;
    }
    int[][] result = new int[k][2];
    System.arraycopy(points, 0, result, 0, k);
    return result;
}

private static int partition(int[][] points, int lo, int hi, Random rand) {
    int pivotIdx = lo + rand.nextInt(hi - lo + 1);
    int pivotDist = distSq(points[pivotIdx]);
    swap(points, pivotIdx, hi); // move pivot to end
    int storeIdx = lo;
    for (int i = lo; i < hi; i++) {
        if (distSq(points[i]) < pivotDist) {
            swap(points, storeIdx++, i);
        }
    }
    swap(points, storeIdx, hi); // move pivot to final position
    return storeIdx;
}
```

#### Python

```python []
class Solution2:
    """quickselect. O(n) average time, O(1) space."""

    def kClosest(self, points: list[list[int]], k: int) -> list[list[int]]:
        def dist(p: list[int]) -> int:
            return p[0] * p[0] + p[1] * p[1]

        def partition(lo: int, hi: int, pivot_idx: int) -> int:
            pivot_dist = dist(points[pivot_idx])
            points[pivot_idx], points[hi] = points[hi], points[pivot_idx]
            store = lo
            for i in range(lo, hi):  # O(hi - lo)
                if dist(points[i]) < pivot_dist:
                    points[store], points[i] = points[i], points[store]
                    store += 1
            points[store], points[hi] = points[hi], points[store]
            return store

        lo, hi = 0, len(points) - 1
        while lo < hi:  # O(n) average across all iterations
            pivot_idx = random.randint(lo, hi)
            mid = partition(lo, hi, pivot_idx)
            if mid == k:
                break
            elif mid < k:
                lo = mid + 1
            else:
                hi = mid - 1
        return points[:k]
```

#### C++

```cpp []
vector<vector<int>> kClosest(vector<vector<int>> &points, int k) {
    // nth_element uses introselect: O(n) average, O(n) worst case
    nth_element(points.begin(), points.begin() + k, points.end(),
                [](const vector<int> &a, const vector<int> &b) {
                    return a[0] * a[0] + a[1] * a[1] < b[0] * b[0] + b[1] * b[1];
                });
    return vector<vector<int>>(points.begin(), points.begin() + k);
}
```

#### Rust

```rust []
pub fn k_closest(points: Vec<Vec<i32>>, k: i32) -> Vec<Vec<i32>> {
    let k = k as usize;
    let mut points = points;
    let n = points.len();
    Self::quickselect(&mut points, 0, n - 1, k);
    points.truncate(k);
    points
}

fn dist(p: &[i32]) -> i64 {
    (p[0] as i64) * (p[0] as i64) + (p[1] as i64) * (p[1] as i64)
}

fn quickselect(points: &mut Vec<Vec<i32>>, lo: usize, hi: usize, k: usize) {
    if lo >= hi { return; }
    let pivot_idx = Self::partition(points, lo, hi);
    let count = pivot_idx - lo + 1;
    if k < count {
        Self::quickselect(points, lo, pivot_idx.saturating_sub(1), k);
    } else if k > count {
        Self::quickselect(points, pivot_idx + 1, hi, k);
    }
}

fn partition(points: &mut Vec<Vec<i32>>, lo: usize, hi: usize) -> usize {
    let pivot_dist = Self::dist(&points[hi]);
    let mut store = lo;
    for i in lo..hi {
        if Self::dist(&points[i]) <= pivot_dist {
            points.swap(store, i);
            store += 1;
        }
    }
    points.swap(store, hi);
    store
}
```
