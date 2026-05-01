---
author: JZ
pubDatetime: 2024-11-15T06:12:00Z
modDatetime: 2025-05-01T07:22:00Z
title: LeetCode 862 LintCode 1507 Shortest Subarray with Sum at Least K
tags:
  - a-sliding-window
  - a-array
  - a-binary-search
  - a-queue
  - a-heap
  - a-prefix-sum
  - a-monotonic-queue
  - c-goldman-sachs
description:
  "Solutions for LeetCode 862, LintCode 1507, hard, tags: array, queue, sliding window, heap, monotonic queue, binary search, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 862](https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/description/), [LintCode 1507](https://www.lintcode.com/problem/1507/)

Given an integer array `nums` and an integer `k`, return _the length of the shortest non-empty **subarray** of_ `nums` _with a sum of at least_ `k`. If there is no such **subarray**, return `-1`.

A **subarray** is a **contiguous** part of an array.

```shell
Example 1:

Input: nums = [1], k = 1
Output: 1

Example 2:

Input: nums = [1,2], k = 4
Output: -1

Example 3:

Input: nums = [2,-1,2], k = 3
Output: 3

Constraints:

1 <= nums.length <= 10^5
-105 <= nums[i] <= 10^5
1 <= k <= 10^9
```

## Solution

### Idea

1. We could use a prefix sum array to calculate the range sum and keep the result updated to find the minimum range.
2. We could use a deque to keep a sliding window. The deque will keep the relevant indexes. The negative numbers will decrease the range sum and make the length of the subarray longer, so we can remove the index for the negative number.
3. When the range sum is >= k, we can remove the head of the deque and update result.

Let's use example 3 above to iterate through.

| i | deque          | res | note               |
|---|----------------|-----|--------------------|
| 0 | `[]->[0]`      | 4   | added 0            |
| 1 | `[0]->[0,1]`   | 4   | added 1            |
| 2 | `[0]->[0,2]`   | 4   | removed 1          |
| 3 | `[0,2]->[2,3]` | 3   | removed 0, added 3 |

Complexity: Time O(n), Space O(n).

Other ideas include:

1. heap
2. monotonic stack + binary search

Both have the same complexity: Time O(n*log*n), Space O(n).

#### Java

```java []
class Solution {
    public int shortestSubarray(int[] A, int K) {
        int N = A.length, res = N + 1;
        long[] sum = new long[N + 1];
        for (int i = 0; i < N; i++) sum[i + 1] = sum[i] + A[i];
        Deque<Integer> dq = new ArrayDeque<>();
        for (int i = 0; i < N + 1; i++) {
            while (!dq.isEmpty() && sum[i] - sum[dq.getFirst()] >= K) res = Math.min(res, i - dq.removeFirst());
            while (!dq.isEmpty() && sum[i] <= sum[dq.getLast()]) dq.removeLast();
            dq.addLast(i);
        }
        return res <= N ? res : -1;
    }
}
```

#### C++

```cpp []
class ShortestSubarrayK {
public:
    int shortestSubarray(vector<int> &nums, int k) {
        int n = nums.size(), res = n + 1;
        vector<long> prefix(n + 1, 0);
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];
        deque<int> dq;
        for (int i = 0; i <= n; i++) {
            while (!dq.empty() && prefix[i] - prefix[dq.front()] >= k) {
                res = min(res, i - dq.front());
                dq.pop_front();
            }
            while (!dq.empty() && prefix[i] <= prefix[dq.back()]) dq.pop_back();
            dq.push_back(i);
        }
        return res <= n ? res : -1;
    }
};
```

#### Python

```python []
class Solution:
    def shortestSubarray(self, nums: List[int], k: int) -> int:
        """O(n) time, O(n) space."""
        n = len(nums)
        res = n + 1
        prefix = [0] * (n + 1)
        for i in range(n):
            prefix[i + 1] = prefix[i] + nums[i]
        dq = deque()
        for i in range(n + 1):
            while dq and prefix[i] - prefix[dq[0]] >= k:
                res = min(res, i - dq.popleft())
            while dq and prefix[i] <= prefix[dq[-1]]:
                dq.pop()
            dq.append(i)
        return res if res <= n else -1
```

#### Rust

```rust []
impl Solution {
    pub fn shortest_subarray(nums: Vec<i32>, k: i32) -> i32 {
        let n = nums.len();
        let mut res = n + 1;
        let mut prefix = vec![0i64; n + 1];
        for i in 0..n { prefix[i + 1] = prefix[i] + nums[i] as i64; }
        let k = k as i64;
        let mut dq: VecDeque<usize> = VecDeque::new();
        for i in 0..=n {
            while let Some(&front) = dq.front() {
                if prefix[i] - prefix[front] >= k { res = res.min(i - dq.pop_front().unwrap()); }
                else { break; }
            }
            while let Some(&back) = dq.back() {
                if prefix[i] <= prefix[back] { dq.pop_back(); }
                else { break; }
            }
            dq.push_back(i);
        }
        if res <= n { res as i32 } else { -1 }
    }
}
```
