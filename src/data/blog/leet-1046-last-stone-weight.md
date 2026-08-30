---
author: JZ
pubDatetime: 2026-08-30T06:00:00Z
modDatetime: 2026-08-30T06:00:00Z
title: LeetCode 1046 Last Stone Weight
featured: true
tags:
  - a-heap
description:
  "Solutions for LeetCode 1046, easy, tags: array, heap, simulation."
---

## Table of contents

## Description

Question Links: [LeetCode 1046](https://leetcode.com/problems/last-stone-weight/description/)

You are given an array of integers `stones` where `stones[i]` is the weight of the `i`th stone.

We are playing a game with the stones. On each turn, we choose the **heaviest** two stones and smash them together. Suppose the heaviest two stones have weights `x` and `y` with `x <= y`. The result of this smash is:

- If `x == y`, both stones are destroyed, and
- If `x != y`, the stone of weight `x` is destroyed, and the stone of weight `y` has new weight `y - x`.

At the end of the game, there is **at most one** stone left.

Return the weight of the last remaining stone. If there are no stones left, return `0`.

```
Example 1:

Input: stones = [2,7,4,1,8,1]
Output: 1
Explanation:
We combine 7 and 8 to get 1, so the array converts to [2,4,1,1,1].
We combine 2 and 4 to get 2, so the array converts to [2,1,1,1].
We combine 2 and 1 to get 1, so the array converts to [1,1,1].
We combine 1 and 1 to get 0, so the array converts to [1].
That's the weight of the last remaining stone.

Example 2:

Input: stones = [1]
Output: 1

Constraints:

1 <= stones.length <= 30
1 <= stones[i] <= 1000
```

## Solution 1: Max-Heap

### Idea

We need to repeatedly extract the two largest elements. A **max-heap** (priority queue) is the natural choice — it gives us the maximum in $O(\log n)$ time.

```
stones = [2, 7, 4, 1, 8, 1]

Build max-heap:
         8
        / \
       7   4
      / \ /
     1  2 1

Round 1: pop 8 and 7 → diff = 1, push 1
         4
        / \
       2   1
      / \
     1   1

Round 2: pop 4 and 2 → diff = 2, push 2
         2
        / \
       1   1
      /
     1

Round 3: pop 2 and 1 → diff = 1, push 1
         1
        / \
       1   1

Round 4: pop 1 and 1 → equal, both destroyed
         1

Result: 1
```

The heap is built in $O(n)$. Each round does at most 2 pops and 1 push, each $O(\log n)$. There are at most $n - 1$ rounds (each round removes at least one stone), so total time is $O(n \log n)$.

Complexity: Time $O(n \log n)$, Space $O(n)$.

#### Java

```java []
// solution 1, max-heap. O(n log n) time, O(n) space.
public static int lastStoneWeightHeap(int[] stones) {
    PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
    for (int s : stones) maxHeap.offer(s);
    while (maxHeap.size() > 1) {
        int first = maxHeap.poll();
        int second = maxHeap.poll();
        if (first != second) maxHeap.offer(first - second);
    }
    return maxHeap.isEmpty() ? 0 : maxHeap.peek();
}
```

#### Python

```python []
class Solution:
    """Max-heap approach, O(n log n) time, O(n) space."""

    def lastStoneWeight(self, stones: list[int]) -> int:
        heap = [-s for s in stones]  # O(n), negate for max-heap
        heapq.heapify(heap)  # O(n)
        while len(heap) > 1:
            first = -heapq.heappop(heap)  # O(log n)
            second = -heapq.heappop(heap)  # O(log n)
            if first != second:
                heapq.heappush(heap, -(first - second))  # O(log n)
        return -heap[0] if heap else 0
```

#### C++

```cpp []
// Time O(n log n), Space O(n)
int lastStoneWeight(vector<int>& stones) {
    priority_queue<int> pq(stones.begin(), stones.end()); // max-heap
    while (pq.size() > 1) {
        int a = pq.top(); pq.pop(); // heaviest
        int b = pq.top(); pq.pop(); // second heaviest
        if (a != b)
            pq.push(a - b);
    }
    return pq.empty() ? 0 : pq.top();
}
```

#### Rust

```rust []
/// BinaryHeap (max-heap) approach.
/// Time: O(n log n), Space: O(n)
pub fn last_stone_weight(stones: Vec<i32>) -> i32 {
    let mut heap = BinaryHeap::from(stones); // O(n) heapify
    while heap.len() > 1 {
        let a = heap.pop().unwrap(); // heaviest
        let b = heap.pop().unwrap(); // second heaviest
        if a != b {
            heap.push(a - b); // O(log n) insert
        }
    }
    heap.pop().unwrap_or(0)
}
```

## Solution 2: Sorted List

### Idea

An alternative approach uses a **sorted list**. Sort the array, then repeatedly pop the two largest from the end (both $O(1)$), and if there's a remainder, insert it back in sorted position using binary search ($O(\log n)$ to find position, but $O(n)$ to shift elements).

This approach uses a different data structure and is simpler conceptually, though less efficient. The insertion step costs $O(n)$ per round due to element shifting, giving $O(n^2)$ total.

Complexity: Time $O(n^2)$, Space $O(n)$.

#### Java

```java []
// solution 2, sorted list with insertion. O(n^2) time, O(n) space.
public static int lastStoneWeightSort(int[] stones) {
    List<Integer> list = new ArrayList<>();
    for (int s : stones) list.add(s);
    Collections.sort(list);
    while (list.size() > 1) {
        int first = list.remove(list.size() - 1);
        int second = list.remove(list.size() - 1);
        int diff = first - second;
        if (diff > 0) {
            int pos = Collections.binarySearch(list, diff);
            if (pos < 0) pos = -(pos + 1);
            list.add(pos, diff); // O(n) shift
        }
    }
    return list.isEmpty() ? 0 : list.get(0);
}
```

#### Python

```python []
class Solution2:
    """Sorted list with bisect insort, O(n^2) time, O(n) space."""

    def lastStoneWeight(self, stones: list[int]) -> int:
        stones = sorted(stones)  # O(n log n)
        while len(stones) > 1:
            first = stones.pop()  # O(1), largest
            second = stones.pop()  # O(1), second largest
            if first != second:
                bisect.insort(stones, first - second)  # O(n) shift
        return stones[0] if stones else 0
```

#### C++

```cpp []
// Time O(n^2), Space O(n)
int lastStoneWeight(vector<int>& stones) {
    sort(stones.begin(), stones.end()); // sort ascending
    while (stones.size() > 1) {
        int a = stones.back(); stones.pop_back(); // heaviest
        int b = stones.back(); stones.pop_back(); // second heaviest
        if (a != b) {
            int diff = a - b;
            auto it = lower_bound(stones.begin(), stones.end(), diff);
            stones.insert(it, diff); // O(n) shift
        }
    }
    return stones.empty() ? 0 : stones[0];
}
```

#### Rust

```rust []
/// Sorted Vec approach: sort, pop two largest, insort remainder.
/// Time: O(n^2), Space: O(n)
pub fn last_stone_weight_sorted(mut stones: Vec<i32>) -> i32 {
    stones.sort_unstable(); // O(n log n) initial sort
    while stones.len() > 1 {
        let a = stones.pop().unwrap(); // largest
        let b = stones.pop().unwrap(); // second largest
        let diff = a - b;
        if diff > 0 {
            // Binary search insert to maintain sorted order — O(n) shift
            let pos = stones.partition_point(|&x| x < diff);
            stones.insert(pos, diff);
        }
    }
    stones.pop().unwrap_or(0)
}
```
