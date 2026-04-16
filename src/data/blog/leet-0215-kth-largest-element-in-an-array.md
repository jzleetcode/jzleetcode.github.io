---
author: JZ
pubDatetime: 2026-04-11T06:00:00Z
modDatetime: 2026-04-11T06:00:00Z
title: LeetCode 215 Kth Largest Element in an Array
featured: false
tags:
  - a-heap
  - a-quick-select
description:
  "Solutions for LeetCode 215, medium, tags: array, divide and conquer, sorting, heap, quick select."
---

## Table of contents

## Description

Given an integer array `nums` and an integer `k`, return the **kth largest** element in the array.

Note that it is the kth largest element in the sorted order, not the kth distinct element.

Can you solve it without sorting?

```
Example 1:

Input: nums = [3,2,1,5,6,4], k = 2
Output: 5

Example 2:

Input: nums = [3,2,3,1,2,4,5,5,6], k = 4
Output: 4
```

**Constraints:**

- `1 <= k <= nums.length <= 10^5`
- `-10^4 <= nums[i] <= 10^4`

## Idea1

Use a **min-heap** of size `k`. Iterate through every element — push it into the heap, and if the heap exceeds size `k`, pop the smallest. After processing all elements the heap contains the `k` largest values, and the top (minimum) is the kth largest.

```
nums = [3, 2, 1, 5, 6, 4], k = 2

step  push  heap (min on top)   action
  1     3   [3]                 size <= k, keep
  2     2   [2, 3]              size == k, keep
  3     1   [1, 2, 3]           size > k, pop 1 -> [2, 3]
  4     5   [2, 3, 5]           size > k, pop 2 -> [3, 5]
  5     6   [3, 5, 6]           size > k, pop 3 -> [5, 6]
  6     4   [4, 5, 6]           size > k, pop 4 -> [5, 6]

Answer: heap top = 5
```

Complexity: Time $O(n \log k)$ — each of the $n$ elements does one push and at most one pop, each $O(\log k)$. Space $O(k)$ for the heap.

### Java

```java []
// lc 215, min-heap. O(n log k) time, O(k) space.
public static int findKthLargestHeap(int[] nums, int k) {
    PriorityQueue<Integer> minHeap = new PriorityQueue<>(); // min-heap of size k
    for (int num : nums) {
        minHeap.offer(num);
        if (minHeap.size() > k) minHeap.poll(); // evict smallest, keep k largest
    }
    return minHeap.peek(); // smallest of the k largest is the kth largest
}
```

```python []
# lc 215, min-heap. O(n log k) time, O(k) space.
class Solution:
    def findKthLargest(self, nums: list[int], k: int) -> int:
        heap = []
        for num in nums:  # O(n)
            heapq.heappush(heap, num)  # O(log k)
            if len(heap) > k:
                heapq.heappop(heap)  # O(log k)
        return heap[0]
```

```cpp []
// lc 215, min-heap. O(n log k) time, O(k) space.
int findKthLargest(vector<int> &nums, int k) {
    priority_queue<int, vector<int>, greater<>> pq; // min-heap of size k
    for (int n : nums) {
        pq.push(n);
        if ((int)pq.size() > k)
            pq.pop();
    }
    return pq.top();
}
```

```rust []
// lc 215, min-heap. O(n log k) time, O(k) space.
pub fn find_kth_largest_heap(nums: Vec<i32>, k: i32) -> i32 {
    let k = k as usize;
    let mut heap: BinaryHeap<Reverse<i32>> = BinaryHeap::with_capacity(k + 1);
    for &num in &nums {
        heap.push(Reverse(num));
        if heap.len() > k {
            heap.pop();
        }
    }
    heap.peek().unwrap().0
}
```

## Idea2

Use **quickselect** — the selection variant of quicksort. The kth largest element is the element at index `n - k` in a sorted array. Pick a random pivot, partition the array so that elements smaller than the pivot go left and larger go right. If the pivot lands at position `n - k`, we found the answer. Otherwise recurse into the half that contains the target index.

```
nums = [3, 2, 1, 5, 6, 4], k = 2, target index = 4

pick pivot = 4, partition:
  [3, 2, 1] 4 [5, 6]     pivot at index 3, target = 4 > 3
                           -> search right [5, 6]

pick pivot = 5, partition:
  [5] 6                   pivot at index 5, but target = 4
                           -> search left [5]

  index 4 holds 5         -> answer = 5
```

Unlike quicksort which recurses into both halves, quickselect only recurses into one half each time, giving average linear time.

Complexity: Time $O(n)$ average — each partition reduces the problem by roughly half: $n + n/2 + n/4 + \ldots = O(n)$. Worst case $O(n^2)$ if pivots are always extreme. Space $O(1)$ iterative.

### Java

```java []
// lc 215, quickselect. O(n) average time, O(n^2) worst, O(1) space.
public static int findKthLargestQuickSelect(int[] nums, int k) {
    Random rand = new Random();
    int target = nums.length - k; // kth largest == (n-k)th smallest (0-indexed)
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int pi = partition(nums, lo, hi, rand);
        if (pi == target) return nums[pi];
        else if (pi < target) lo = pi + 1;
        else hi = pi - 1;
    }
    return nums[lo];
}

private static int partition(int[] nums, int lo, int hi, Random rand) {
    int pi = lo + rand.nextInt(hi - lo + 1); // random pivot
    int pivot = nums[pi];
    swap(nums, pi, hi); // move pivot to end
    int store = lo;
    for (int i = lo; i < hi; i++) {
        if (nums[i] < pivot) swap(nums, store++, i);
    }
    swap(nums, store, hi); // move pivot to final position
    return store;
}

private static void swap(int[] nums, int i, int j) {
    int tmp = nums[i];
    nums[i] = nums[j];
    nums[j] = tmp;
}
```

```python []
# lc 215, quickselect. O(n) average time, O(n^2) worst, O(1) space.
class Solution2:
    def findKthLargest(self, nums: list[int], k: int) -> int:
        target = len(nums) - k  # kth largest = (n-k)th smallest in 0-indexed
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            pivot_idx = random.randint(lo, hi)
            pivot_idx = self._partition(nums, lo, hi, pivot_idx)
            if pivot_idx == target:
                return nums[pivot_idx]
            elif pivot_idx < target:
                lo = pivot_idx + 1  # search right half
            else:
                hi = pivot_idx - 1  # search left half
        return -1  # unreachable

    @staticmethod
    def _partition(nums: list[int], lo: int, hi: int, pivot_idx: int) -> int:
        pivot = nums[pivot_idx]
        nums[pivot_idx], nums[hi] = nums[hi], nums[pivot_idx]  # move pivot to end
        store = lo
        for i in range(lo, hi):  # O(hi - lo)
            if nums[i] < pivot:
                nums[store], nums[i] = nums[i], nums[store]
                store += 1
        nums[store], nums[hi] = nums[hi], nums[store]  # place pivot in final position
        return store
```

```cpp []
// lc 215, quickselect. O(n) average time, O(n^2) worst, O(1) space.
int findKthLargest(vector<int> &nums, int k) {
    int target = (int)nums.size() - k;
    int lo = 0, hi = (int)nums.size() - 1;
    while (lo < hi) {
        int pivotIdx = lo + rand() % (hi - lo + 1);
        swap(nums[pivotIdx], nums[hi]);
        int pivot = nums[hi];
        int store = lo;
        for (int i = lo; i < hi; i++) {
            if (nums[i] <= pivot)
                swap(nums[i], nums[store++]);
        }
        swap(nums[store], nums[hi]);
        if (store == target) return nums[store];
        else if (store < target) lo = store + 1;
        else hi = store - 1;
    }
    return nums[lo];
}
```

```rust []
// lc 215, quickselect. O(n) average time, O(n^2) worst, O(1) space.
pub fn find_kth_largest(nums: Vec<i32>, k: i32) -> i32 {
    let mut nums = nums;
    let n = nums.len();
    let target = n - k as usize;
    Self::quickselect(&mut nums, 0, n - 1, target)
}

fn quickselect(nums: &mut [i32], lo: usize, hi: usize, target: usize) -> i32 {
    if lo == hi { return nums[lo]; }
    let pivot_idx = lo + (nums[lo] as usize ^ nums[hi] as usize ^ lo ^ hi) % (hi - lo + 1);
    nums.swap(pivot_idx, hi);
    let pivot = nums[hi];
    let mut store = lo;
    for i in lo..hi {
        if nums[i] < pivot {
            nums.swap(i, store);
            store += 1;
        }
    }
    nums.swap(store, hi);
    if store == target { nums[store] }
    else if target < store { Self::quickselect(nums, lo, store.saturating_sub(1), target) }
    else { Self::quickselect(nums, store + 1, hi, target) }
}
```
