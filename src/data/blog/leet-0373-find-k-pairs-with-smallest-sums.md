---
author: JZ
pubDatetime: 2026-07-26T06:00:00Z
modDatetime: 2026-07-26T06:00:00Z
title: LeetCode 373 Find K Pairs with Smallest Sums
featured: false
tags:
  - a-array
  - a-heap
description:
  "Solutions for LeetCode 373, medium, tags: array, heap."
---

## Table of contents

## Description

Question Links: [LeetCode 373](https://leetcode.com/problems/find-k-pairs-with-smallest-sums/description/)

You are given two integer arrays `nums1` and `nums2` sorted in **non-decreasing order** and an integer `k`.

Define a pair `(u, v)` which consists of one element from the first array and one element from the second array.

Return the `k` pairs `(u1, v1), (u2, v2), ..., (uk, vk)` with the smallest sums.

```
Example 1:

Input: nums1 = [1,7,11], nums2 = [2,4,6], k = 3
Output: [[1,2],[1,4],[1,6]]
Explanation: The first 3 pairs are returned from the sequence:
[1,2],[1,4],[1,6],[7,2],[7,4],[11,2],[7,6],[11,4],[11,6]

Example 2:

Input: nums1 = [1,1,2], nums2 = [1,2,3], k = 2
Output: [[1,1],[1,1]]
Explanation: The first 2 pairs are returned from the sequence:
[1,1],[1,1],[1,2],[2,1],[1,2],[2,2],[1,3],[1,3],[2,3]

Example 3:

Input: nums1 = [1,2], nums2 = [3], k = 3
Output: [[1,3],[2,3]]
Explanation: All possible pairs are returned.

Constraints:

1 <= nums1.length, nums2.length <= 10^5
-10^9 <= nums1[i], nums2[j] <= 10^9
nums1 and nums2 are sorted in non-decreasing order.
1 <= k <= 10^4
```

## Solution 1: Min-Heap (Column Advance)

### Idea

Think of the pairs as an `m × n` matrix where entry `(i, j)` has sum `nums1[i] + nums2[j]`. Each row is sorted (since `nums2` is sorted). We only need the `k` smallest entries.

Seed a min-heap with the first element from each row (column 0) for the first `min(k, m)` rows. Pop the smallest, and push the next element in that same row (advance the column index).

```
nums1 = [1, 7, 11], nums2 = [2, 4, 6], k = 3

Matrix of sums:
       j=0  j=1  j=2
i=0  [  3    5    7  ]
i=1  [  9   11   13  ]
i=2  [ 13   15   17  ]

Heap init: [(3,0,0), (9,1,0), (13,2,0)]

Pop (3,0,0) → result: [1,2], push (5,0,1)
Pop (5,0,1) → result: [1,4], push (7,0,2)
Pop (7,0,2) → result: [1,6], done (k=3 reached)
```

Complexity: Time $O(k \log k)$ — at most $k$ pops/pushes, heap size bounded by $k$. Space $O(k)$ for the heap.

#### Java

```java []
public static List<List<Integer>> kSmallestPairs(int[] nums1, int[] nums2, int k) {
    List<List<Integer>> res = new ArrayList<>();
    if (nums1 == null || nums2 == null || nums1.length == 0 || nums2.length == 0 || k <= 0) return res;
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
    int rows = Math.min(k, nums1.length); // O(k) initial entries
    for (int i = 0; i < rows; i++) {
        pq.offer(new int[]{nums1[i] + nums2[0], i, 0});
    }
    while (!pq.isEmpty() && res.size() < k) { // O(k log k) total pops
        int[] cur = pq.poll();
        int i = cur[1], j = cur[2];
        res.add(List.of(nums1[i], nums2[j]));
        if (j + 1 < nums2.length) { // advance column
            pq.offer(new int[]{nums1[i] + nums2[j + 1], i, j + 1});
        }
    }
    return res;
}
```

#### Python

```python []
def kSmallestPairs(self, nums1: List[int], nums2: List[int], k: int) -> List[List[int]]:
    if not nums1 or not nums2:
        return []
    res = []
    heap = []
    for i in range(min(k, len(nums1))):  # O(k) initial entries
        heapq.heappush(heap, (nums1[i] + nums2[0], i, 0))
    while heap and len(res) < k:  # O(k) pops, each O(log k)
        total, i, j = heapq.heappop(heap)
        res.append([nums1[i], nums2[j]])
        if j + 1 < len(nums2):
            heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))
    return res
```

#### C++

```cpp []
static vector<vector<int>> kSmallestPairsHeap(vector<int>& nums1, vector<int>& nums2, int k) {
    vector<vector<int>> res;
    if (nums1.empty() || nums2.empty() || k <= 0) return res;
    int n1 = nums1.size(), n2 = nums2.size();
    auto cmp = [](const tuple<int,int,int>& a, const tuple<int,int,int>& b) {
        return get<0>(a) > get<0>(b); // min-heap by sum
    };
    priority_queue<tuple<int,int,int>, vector<tuple<int,int,int>>, decltype(cmp)> pq(cmp);
    for (int i = 0; i < min(k, n1); ++i) { // O(k) initial entries
        pq.emplace(nums1[i] + nums2[0], i, 0);
    }
    while (k-- > 0 && !pq.empty()) { // O(k log k) total
        auto [sum, i, j] = pq.top();
        pq.pop();
        res.push_back({nums1[i], nums2[j]});
        if (j + 1 < n2) {
            pq.emplace(nums1[i] + nums2[j + 1], i, j + 1); // advance column
        }
    }
    return res;
}
```

#### Rust

```rust []
pub fn k_smallest_pairs(nums1: Vec<i32>, nums2: Vec<i32>, k: i32) -> Vec<Vec<i32>> {
    let k = k as usize;
    if nums1.is_empty() || nums2.is_empty() {
        return vec![];
    }
    let mut heap: BinaryHeap<Reverse<(i64, usize, usize)>> = BinaryHeap::new(); // O(k) space
    for i in 0..nums1.len().min(k) { // O(k) initial entries
        heap.push(Reverse((nums1[i] as i64 + nums2[0] as i64, i, 0)));
    }
    let mut result = Vec::with_capacity(k);
    while let Some(Reverse((_, i, j))) = heap.pop() { // O(k log k) total
        result.push(vec![nums1[i], nums2[j]]);
        if result.len() == k {
            break;
        }
        if j + 1 < nums2.len() { // advance column
            heap.push(Reverse((nums1[i] as i64 + nums2[j + 1] as i64, i, j + 1)));
        }
    }
    result
}
```

## Solution 2: BFS-Like Expansion

### Idea

View the `(i, j)` index space as a grid. Start from `(0, 0)` — the globally smallest pair. From each popped cell, expand to two neighbors: right `(i, j+1)` and down `(i+1, j)`. Use a visited set to avoid duplicates.

```
Start: (0,0) → sum=3

Pop (0,0): expand → (0,1) sum=5, (1,0) sum=9
Pop (0,1): expand → (0,2) sum=7, (1,1) sum=11
Pop (0,2): done (k=3)
```

Complexity: Time $O(k \log k)$ — each pop/push is $O(\log k)$, at most $2k$ entries pushed. Space $O(k)$ for heap and visited set.

#### Java

```java []
public static List<List<Integer>> kSmallestPairsBFS(int[] nums1, int[] nums2, int k) {
    List<List<Integer>> res = new ArrayList<>();
    if (nums1 == null || nums2 == null || nums1.length == 0 || nums2.length == 0 || k <= 0) return res;
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
    Set<Long> visited = new HashSet<>(); // O(k) space
    pq.offer(new int[]{nums1[0] + nums2[0], 0, 0});
    visited.add(0L);
    while (!pq.isEmpty() && res.size() < k) { // O(k log k) total
        int[] cur = pq.poll();
        int i = cur[1], j = cur[2];
        res.add(List.of(nums1[i], nums2[j]));
        if (j + 1 < nums2.length) { // expand right
            long key = (long) i * nums2.length + (j + 1);
            if (visited.add(key)) {
                pq.offer(new int[]{nums1[i] + nums2[j + 1], i, j + 1});
            }
        }
        if (i + 1 < nums1.length) { // expand down
            long key = (long) (i + 1) * nums2.length + j;
            if (visited.add(key)) {
                pq.offer(new int[]{nums1[i + 1] + nums2[j], i + 1, j});
            }
        }
    }
    return res;
}
```

#### Python

```python []
def kSmallestPairsBFS(self, nums1: List[int], nums2: List[int], k: int) -> List[List[int]]:
    if not nums1 or not nums2:
        return []
    res = []
    visited = {(0, 0)}
    heap = [(nums1[0] + nums2[0], 0, 0)]
    while heap and len(res) < k:
        _, i, j = heapq.heappop(heap)
        res.append([nums1[i], nums2[j]])
        if i + 1 < len(nums1) and (i + 1, j) not in visited:  # expand down
            visited.add((i + 1, j))
            heapq.heappush(heap, (nums1[i + 1] + nums2[j], i + 1, j))
        if j + 1 < len(nums2) and (i, j + 1) not in visited:  # expand right
            visited.add((i, j + 1))
            heapq.heappush(heap, (nums1[i] + nums2[j + 1], i, j + 1))
    return res
```

#### C++

```cpp []
static vector<vector<int>> kSmallestPairsBFS(vector<int>& nums1, vector<int>& nums2, int k) {
    vector<vector<int>> res;
    if (nums1.empty() || nums2.empty() || k <= 0) return res;
    int n1 = nums1.size(), n2 = nums2.size();
    auto cmp = [](const tuple<int,int,int>& a, const tuple<int,int,int>& b) {
        return get<0>(a) > get<0>(b); // min-heap
    };
    priority_queue<tuple<int,int,int>, vector<tuple<int,int,int>>, decltype(cmp)> pq(cmp);
    set<pair<int,int>> visited; // O(k) space
    pq.emplace(nums1[0] + nums2[0], 0, 0);
    visited.insert({0, 0});
    while (k-- > 0 && !pq.empty()) { // O(k) iterations
        auto [sum, i, j] = pq.top();
        pq.pop();
        res.push_back({nums1[i], nums2[j]});
        if (j + 1 < n2 && visited.find({i, j + 1}) == visited.end()) { // expand right
            pq.emplace(nums1[i] + nums2[j + 1], i, j + 1);
            visited.insert({i, j + 1});
        }
        if (i + 1 < n1 && visited.find({i + 1, j}) == visited.end()) { // expand down
            pq.emplace(nums1[i + 1] + nums2[j], i + 1, j);
            visited.insert({i + 1, j});
        }
    }
    return res;
}
```

#### Rust

```rust []
pub fn k_smallest_pairs_bfs(nums1: Vec<i32>, nums2: Vec<i32>, k: i32) -> Vec<Vec<i32>> {
    let k = k as usize;
    if nums1.is_empty() || nums2.is_empty() {
        return vec![];
    }
    let mut heap: BinaryHeap<Reverse<(i64, usize, usize)>> = BinaryHeap::new();
    let mut visited: HashSet<(usize, usize)> = HashSet::new(); // O(k) space
    heap.push(Reverse((nums1[0] as i64 + nums2[0] as i64, 0, 0)));
    visited.insert((0, 0));
    let mut result = Vec::with_capacity(k);
    while let Some(Reverse((_, i, j))) = heap.pop() {
        result.push(vec![nums1[i], nums2[j]]);
        if result.len() == k {
            break;
        }
        if j + 1 < nums2.len() && visited.insert((i, j + 1)) { // expand right
            heap.push(Reverse((nums1[i] as i64 + nums2[j + 1] as i64, i, j + 1)));
        }
        if i + 1 < nums1.len() && visited.insert((i + 1, j)) { // expand down
            heap.push(Reverse((nums1[i + 1] as i64 + nums2[j] as i64, i + 1, j)));
        }
    }
    result
}
```
