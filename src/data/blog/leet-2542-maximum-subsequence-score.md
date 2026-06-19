---
author: JZ
pubDatetime: 2026-06-19T10:37:00Z
modDatetime: 2026-06-19T10:37:00Z
title: LeetCode 2542 Maximum Subsequence Score
featured: true
tags:
  - a-greedy
  - a-heap
description:
  "Solutions for LeetCode 2542, medium, tags: array, greedy, sorting, heap (priority queue)."
---

## Table of contents

## Description

You are given two **0-indexed** integer arrays `nums1` and `nums2` of equal length `n` and a positive integer `k`. You must choose a subsequence of indices from `nums1` of length `k`.

For chosen indices $i_0, i_1, ..., i_{k-1}$, your **score** is defined as:

- The sum of the selected elements from `nums1` multiplied with the **minimum** of the selected elements from `nums2`.
- It can be defined simply as: `(nums1[i0] + nums1[i1] +...+ nums1[ik - 1]) * min(nums2[i0], nums2[i1], ... ,nums2[ik - 1])`.

Return the **maximum** possible score.

**Example 1:**

> Input: nums1 = [1,3,3,2], nums2 = [2,1,3,4], k = 3
> Output: 12
> Explanation: The four possible subsequence scores are:
> - We can choose the indices 0, 1, and 2 with score = (1+3+3) * min(2,1,3) = 7.
> - We can choose the indices 0, 1, and 3 with score = (1+3+2) * min(2,1,4) = 6.
> - We can choose the indices 0, 2, and 3 with score = (1+3+2) * min(2,3,4) = 12.
> - We can choose the indices 1, 2, and 3 with score = (3+3+2) * min(1,3,4) = 8.
> Therefore, we return the max score, which is 12.

**Example 2:**

> Input: nums1 = [4,2,3,1,1], nums2 = [7,5,10,9,6], k = 1
> Output: 30
> Explanation: Choosing index 2 is optimal: nums1[2] * nums2[2] = 3 * 10 = 30 is the maximum possible score.

**Constraints:**

- `n == nums1.length == nums2.length`
- `1 <= n <= 10^5`
- `0 <= nums1[i], nums2[i] <= 10^5`
- `1 <= k <= n`

[LeetCode 2542](https://leetcode.com/problems/maximum-subsequence-score/)

## Idea

### Sort by nums2 Descending + Min-Heap

The key insight: if we fix which element provides the **minimum** from `nums2`, we want the **largest** possible sum from `nums1` among elements whose `nums2` value is >= that minimum.

```
Algorithm:
1. Pair elements and sort by nums2 descending
2. Iterate: each nums2[j] is the candidate minimum
3. Maintain a min-heap of size k on nums1 values
   - Always keep the k largest nums1 values seen so far
4. When heap has k elements: score = sum * current_nums2

Example: nums1=[1,3,3,2], nums2=[2,1,3,4], k=3
Sorted by nums2 desc:
  (4,2) (3,3) (2,1) (1,3)
   ^nums2 ^nums1

Step 1: push 2, heap=[2], sum=2, size<3
Step 2: push 3, heap=[2,3], sum=5, size<3
Step 3: push 1, heap=[1,2,3], sum=6, size==3
         score = 6 * 2 = 12
Step 4: push 3, heap=[1,2,3,3], sum=9, size>3
         pop 1, heap=[2,3,3], sum=8, size==3
         score = 8 * 1 = 8
Answer: max(12, 8) = 12
```

Complexity: Time $O(n \log n)$ — sorting + n heap operations each $O(\log k)$. Space $O(n)$.

### Java

```java []
public final class MaximumSubsequenceScore {

    private MaximumSubsequenceScore() {
    }

    // O(n log n) time, O(n) space
    public static long maxScore(int[] nums1, int[] nums2, int k) {
        int n = nums1.length;
        Integer[] indices = new Integer[n];
        for (int i = 0; i < n; i++) indices[i] = i;
        java.util.Arrays.sort(indices, (a, b) -> nums2[b] - nums2[a]); // O(n log n)

        java.util.PriorityQueue<Integer> minHeap = new java.util.PriorityQueue<>();
        long sum = 0, result = 0;

        for (int idx : indices) { // O(n)
            sum += nums1[idx];
            minHeap.offer(nums1[idx]); // O(log k)
            if (minHeap.size() > k) sum -= minHeap.poll(); // O(log k)
            if (minHeap.size() == k) result = Math.max(result, sum * nums2[idx]);
        }
        return result;
    }
}
```

### Python

```python []
import heapq

class Solution:
    def maxScore(self, nums1: list[int], nums2: list[int], k: int) -> int:
        """Sort by nums2 descending, maintain min-heap of size k on nums1 values.
        Time O(n log n), Space O(n)."""
        pairs = sorted(zip(nums2, nums1), reverse=True)  # O(n log n)
        heap = []
        total = 0
        res = 0
        for min_val, sum_val in pairs:  # O(n)
            heapq.heappush(heap, sum_val)  # O(log k)
            total += sum_val
            if len(heap) > k:
                total -= heapq.heappop(heap)  # O(log k)
            if len(heap) == k:
                res = max(res, total * min_val)
        return res
```

### C++

```cpp []
#include <vector>
#include <queue>
#include <algorithm>
#include <numeric>
using namespace std;

class Solution {
public:
    // O(n log n) time, O(n) space
    long long maxScore(vector<int>& nums1, vector<int>& nums2, int k) {
        int n = nums1.size();
        vector<int> idx(n);
        iota(idx.begin(), idx.end(), 0);
        sort(idx.begin(), idx.end(), [&](int a, int b) { // O(n log n)
            return nums2[a] > nums2[b];
        });

        priority_queue<int, vector<int>, greater<>> pq; // min-heap
        long long sum = 0, ans = 0;
        for (int i = 0; i < n; i++) { // O(n)
            int j = idx[i];
            sum += nums1[j];
            pq.push(nums1[j]); // O(log k)
            if ((int)pq.size() > k) { sum -= pq.top(); pq.pop(); } // O(log k)
            if ((int)pq.size() == k) ans = max(ans, sum * nums2[j]);
        }
        return ans;
    }
};
```

### Rust

```rust []
use std::collections::BinaryHeap;
use std::cmp::Reverse;

impl Solution {
    /// O(n log n) time, O(n) space
    pub fn max_score(nums1: Vec<i32>, nums2: Vec<i32>, k: i32) -> i64 {
        let k = k as usize;
        let n = nums1.len();
        let mut pairs: Vec<(i32, i32)> = (0..n).map(|i| (nums2[i], nums1[i])).collect();
        pairs.sort_unstable_by(|a, b| b.0.cmp(&a.0)); // O(n log n)

        let mut heap: BinaryHeap<Reverse<i64>> = BinaryHeap::new();
        let mut sum: i64 = 0;
        let mut ans: i64 = 0;

        for (min_val, n1) in pairs { // O(n)
            let n1 = n1 as i64;
            sum += n1;
            heap.push(Reverse(n1)); // O(log k)
            if heap.len() > k {
                if let Some(Reverse(smallest)) = heap.pop() { sum -= smallest; } // O(log k)
            }
            if heap.len() == k { ans = ans.max(sum * min_val as i64); }
        }
        ans
    }
}
```
