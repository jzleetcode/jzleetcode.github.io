---
author: JZ
pubDatetime: 2026-05-08T10:07:00Z
modDatetime: 2026-05-08T10:07:00Z
title: LeetCode 295 Find Median from Data Stream
featured: true
tags:
  - a-heap
  - a-design
  - a-sorted-set
description:
  "Solutions for LeetCode 295, hard, tags: two pointers, design, sorting, heap, data stream."
---

## Table of contents

## Description

The median is the middle value in an ordered integer list. If the size of the list is even, there is no middle value, and the median is the mean of the two middle values.

- For example, for `arr = [2,3,4]`, the median is `3`.
- For example, for `arr = [2,3]`, the median is `(2 + 3) / 2 = 2.5`.

Implement the `MedianFinder` class:

- `MedianFinder()` initializes the MedianFinder object.
- `void addNum(int num)` adds the integer `num` from the data stream to the data structure.
- `double findMedian()` returns the median of all elements so far.

**Example 1:**

```
Input: ["MedianFinder", "addNum", "addNum", "findMedian", "addNum", "findMedian"]
       [[], [1], [2], [], [3], []]
Output: [null, null, null, 1.5, null, 2.0]
```

**Constraints:**

- $-10^5 \leq \text{num} \leq 10^5$
- There will be at least one element in the data structure before calling `findMedian`.
- At most $5 \times 10^4$ calls will be made to `addNum` and `findMedian`.

Link: [LeetCode 295](https://leetcode.com/problems/find-median-from-data-stream/)

## Idea1: Two Heaps

Maintain two heaps that split the stream into two halves:

- **max-heap** (`left`): stores the smaller half, peek gives the largest of the small half.
- **min-heap** (`right`): stores the larger half, peek gives the smallest of the large half.

```
Stream: 1, 2, 3, 5, 4

After adding 1:        left=[1]  right=[]       median=1
After adding 2:        left=[1]  right=[2]      median=1.5
After adding 3:        left=[2,1] right=[3]     median=2
After adding 5:        left=[2,1] right=[3,5]   median=2.5
After adding 4:        left=[3,2,1] right=[4,5] median=3
```

Keep them balanced so sizes differ by at most 1. Each `addNum` pushes to one heap then rebalances by moving the top element, costing $O(\log n)$. `findMedian` just peeks the tops in $O(1)$.

Complexity: Time $O(\log n)$ add, $O(1)$ find. Space $O(n)$.

## Idea2: Sorted Container / Multiset with Iterators

Maintain a sorted data structure and track the median position with iterators or index access.

- **SortedList / multiset**: Insert is $O(\log n)$. Finding the median by index is $O(1)$ (Python SortedList) or $O(1)$ with iterator maintenance (C++ multiset).
- In C++, maintain two iterators `lo` and `hi` pointing to the median element(s). After each insertion, adjust the iterators based on whether the new element landed left or right of the current median.

Complexity: Time $O(\log n)$ add, $O(1)$ find. Space $O(n)$.

### Java

```java []
package heap;

import java.util.Comparator;
import java.util.PriorityQueue;

public class MedianFinder {
    PriorityQueue<Integer> left; // max heap
    PriorityQueue<Integer> right; // min heap, size difference 0 or 1
    boolean odd;

    // O(N) space.
    public MedianFinder() {
        left = new PriorityQueue<>(Comparator.reverseOrder());
        right = new PriorityQueue<>();
    }

    public void addNum(int num) { // O(log n)
        if (odd) {
            right.add(num);
            left.add(right.remove());
        } else {
            left.add(num);
            right.add(left.remove());
        }
        odd = !odd;
    }

    public double findMedian() { // O(1)
        return odd ? right.peek() : (left.peek() + right.peek()) / 2.0;
    }
}
```

### Python

```python []
from heapq import heappop, heappush


class MedianFinder:

    def __init__(self):
        self.left, self.right = [], []  # max, min heaps
        self.odd = False

    def addNum(self, num: int) -> None:  # O(log n)
        if self.odd:
            heappush(self.right, num)
            heappush(self.left, -heappop(self.right))
        else:
            heappush(self.left, -num)
            heappush(self.right, -heappop(self.left))
        self.odd = not self.odd

    def findMedian(self) -> float:  # O(1)
        if self.odd:
            return self.right[0]
        else:
            return (-self.left[0] + self.right[0]) / 2.0


class MedianFinderSorted:
    '''Using SortedList (balanced BST). O(log n) add, O(1) find median.'''

    def __init__(self):
        from sortedcontainers import SortedList
        self.sl = SortedList()

    def addNum(self, num: int) -> None:
        self.sl.add(num)  # O(log n)

    def findMedian(self) -> float:
        n = len(self.sl)
        mid = n // 2
        if n % 2 == 1:
            return self.sl[mid]  # O(1) index access
        else:
            return (self.sl[mid - 1] + self.sl[mid]) / 2.0
```

### C++

```cpp []
#include <queue>
#include <set>

using namespace std;

// Approach 1: Two Heaps. addNum O(log n), findMedian O(1).
class MedianFinderHeap {
    priority_queue<int> lo;                            // max-heap (lower half)
    priority_queue<int, vector<int>, greater<>> hi;    // min-heap (upper half)
public:
    void addNum(int num) {
        lo.push(num);
        hi.push(lo.top());
        lo.pop();
        if (lo.size() < hi.size()) {
            lo.push(hi.top());
            hi.pop();
        }
    }

    double findMedian() {
        if (lo.size() > hi.size()) return lo.top();
        return (lo.top() + hi.top()) / 2.0;
    }
};

// Approach 2: Multiset with two iterators (lo, hi). addNum O(log n), findMedian O(1).
class MedianFinderMultiset {
    multiset<int> data;
    multiset<int>::iterator lo, hi;
public:
    MedianFinderMultiset() : lo(data.end()), hi(data.end()) {}

    void addNum(int num) {
        int n = data.size();
        data.insert(num);
        if (n == 0) { lo = hi = data.begin(); return; }
        if (n % 2 == 1) {         // was odd, becomes even
            if (num < *lo) --lo;
            else ++hi;
        } else {                   // was even, becomes odd
            if (num < *lo) hi = lo;
            else if (num >= *hi) lo = hi;
            else lo = hi = next(lo);
        }
    }

    double findMedian() { return (*lo + *hi) / 2.0; }
};
```

### Rust

```rust []
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub struct MedianFinder {
    max_heap: BinaryHeap<i32>,           // left half
    min_heap: BinaryHeap<Reverse<i32>>,  // right half
}

impl MedianFinder {
    pub fn new() -> Self {
        Self { max_heap: BinaryHeap::new(), min_heap: BinaryHeap::new() }
    }

    pub fn add_num(&mut self, num: i32) { // O(log n)
        self.max_heap.push(num);
        self.min_heap.push(Reverse(self.max_heap.pop().unwrap()));
        if self.min_heap.len() > self.max_heap.len() {
            self.max_heap.push(self.min_heap.pop().unwrap().0);
        }
    }

    pub fn find_median(&self) -> f64 { // O(1)
        if self.max_heap.len() > self.min_heap.len() {
            *self.max_heap.peek().unwrap() as f64
        } else {
            (*self.max_heap.peek().unwrap() as f64 + self.min_heap.peek().unwrap().0 as f64) / 2.0
        }
    }
}
```
