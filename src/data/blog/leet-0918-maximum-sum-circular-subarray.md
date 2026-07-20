---
author: JZ
pubDatetime: 2026-06-24T08:00:00Z
modDatetime: 2026-06-24T08:00:00Z
title: LeetCode 918 Maximum Sum Circular Subarray
featured: false
tags:
  - a-dp
  - a-kadane
  - a-deque
description:
  "Solutions for LeetCode 918, medium, tags: array, dynamic programming, divide and conquer, queue, monotonic queue."
---

## Table of contents

## Description

Question Links: [LeetCode 918](https://leetcode.com/problems/maximum-sum-circular-subarray/description/)

Given a **circular** integer array `nums` of length `n`, return the maximum possible sum of a non-empty **subarray** of `nums`.

A **circular array** means the end of the array connects to the beginning of the array. Formally, the next element of `nums[n-1]` is `nums[0]`, and the previous element of `nums[0]` is `nums[n-1]`.

A **subarray** may only include each element of the fixed buffer `nums` at most once. Formally, for a subarray `nums[i], nums[i+1], ..., nums[j]`, there does not exist `i <= k1, k2 <= j` with `k1 != k2` such that `nums[k1 % n] == nums[k2 % n]`.

```
Example 1:

Input: nums = [1,-2,3,-2]
Output: 3
Explanation: Subarray [3] has maximum sum 3.

Example 2:

Input: nums = [5,-3,5]
Output: 10
Explanation: Subarray [5,5] (wrapping around) has maximum sum 5 + 5 = 10.

Example 3:

Input: nums = [-3,-2,-3]
Output: -2
Explanation: Subarray [-2] has maximum sum -2.
```

**Constraints:**

- `n == nums.length`
- `1 <= n <= 3 * 10⁴`
- `-3 * 10⁴ <= nums[i] <= 3 * 10⁴`

## Idea1: Kadane's Max + Min

The key insight is that the maximum circular subarray sum is either:
1. A normal (non-wrapping) subarray — found by standard Kadane's max.
2. A wrapping subarray — equivalent to `total - min_subarray_sum`.

```
Case 1 (non-wrapping):
[  ...  |max subarray|  ...  ]
         ^^^^^^^^^^^^

Case 2 (wrapping):
[suffix |   min subarray   | prefix]
 ^^^^^^^                     ^^^^^^^
 = total - min_subarray
```

We compute both `max_sum` and `min_sum` in a single pass. The answer is `max(max_sum, total - min_sum)`.

**Edge case:** If all elements are negative, `total - min_sum = 0`, but a subarray must be non-empty. In that case `max_sum` (the largest negative element) is the answer. We detect this when `max_sum < 0` (or equivalently `total == min_sum`).

Complexity: Time $O(n)$, Space $O(1)$.

## Idea2: Prefix Sum + Monotonic Deque

Treat the array as doubled: `nums[0..2n-1]` where `nums[i] = nums[i % n]`. Any circular subarray of length $\le n$ maps to a contiguous subarray in this doubled array.

Build prefix sums `P[0..2n]`. The answer is $\max_{j-i \le n}(P[j] - P[i])$, which is a sliding-window minimum problem solvable with a monotonic deque.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// Solution 1: Kadane's max+min, O(n) time, O(1) space.
public static int maxSubarraySumCircularKadane(int[] nums) {
    int totalSum = 0;
    int maxSum = Integer.MIN_VALUE;
    int minSum = Integer.MAX_VALUE;
    int curMax = 0;
    int curMin = 0;

    for (int num : nums) { // O(n)
        curMax = Math.max(curMax + num, num);
        maxSum = Math.max(maxSum, curMax);
        curMin = Math.min(curMin + num, num);
        minSum = Math.min(minSum, curMin);
        totalSum += num;
    }

    return maxSum < 0 ? maxSum : Math.max(maxSum, totalSum - minSum);
}
```
```java []
// Solution 2: Monotonic deque on prefix sums, O(n) time, O(n) space.
public static int maxSubarraySumCircularDeque(int[] nums) {
    int n = nums.length;
    long[] prefix = new long[2 * n + 1];
    for (int i = 0; i < 2 * n; i++) { // O(n) build prefix sums
        prefix[i + 1] = prefix[i] + nums[i % n];
    }

    int ans = Integer.MIN_VALUE;
    Deque<Integer> deque = new ArrayDeque<>();
    deque.addLast(0);

    for (int j = 1; j <= 2 * n; j++) { // O(n) sliding window
        while (!deque.isEmpty() && deque.peekFirst() < j - n) {
            deque.pollFirst();
        }
        ans = Math.max(ans, (int) (prefix[j] - prefix[deque.peekFirst()]));
        while (!deque.isEmpty() && prefix[deque.peekLast()] >= prefix[j]) {
            deque.pollLast();
        }
        deque.addLast(j);
    }

    return ans;
}
```

### Python

```python []
class Solution:
    """Kadane's for max and min subarrays. O(n) time, O(1) space."""

    def maxSubarraySumCircular(self, nums: list[int]) -> int:
        total = 0
        max_sum = cur_max = nums[0]
        min_sum = cur_min = nums[0]
        total = nums[0]
        for i in range(1, len(nums)):  # O(n)
            x = nums[i]
            cur_max = max(x, cur_max + x)
            max_sum = max(max_sum, cur_max)
            cur_min = min(x, cur_min + x)
            min_sum = min(min_sum, cur_min)
            total += x
        if total == min_sum:
            return max_sum
        return max(max_sum, total - min_sum)
```
```python []
class Solution2:
    """Prefix sum + monotonic deque. O(n) time, O(n) space."""

    def maxSubarraySumCircular(self, nums: list[int]) -> int:
        from collections import deque
        n = len(nums)
        prefix = [0] * (2 * n + 1)
        for i in range(2 * n):  # O(n)
            prefix[i + 1] = prefix[i] + nums[i % n]
        res = nums[0]
        dq = deque([0])  # O(n) space
        for j in range(1, 2 * n + 1):  # O(n)
            while dq and dq[0] < j - n:
                dq.popleft()
            res = max(res, prefix[j] - prefix[dq[0]])
            while dq and prefix[dq[-1]] >= prefix[j]:
                dq.pop()
            dq.append(j)
        return res
```

### C++

```cpp
// Kadane's max+min, O(n) time, O(1) space.
static int maxSubarraySumCircular(vector<int>& nums) {
    int total = 0;
    int maxSum = nums[0], curMax = 0;
    int minSum = nums[0], curMin = 0;

    for (int x : nums) { // O(n)
        total += x;
        curMax = max(curMax + x, x);
        maxSum = max(maxSum, curMax);
        curMin = min(curMin + x, x);
        minSum = min(minSum, curMin);
    }

    return maxSum < 0 ? maxSum : max(maxSum, total - minSum);
}
```

### Rust

```rust
// Kadane's max+min, O(n) time, O(1) space.
pub fn max_subarray_sum_circular(nums: Vec<i32>) -> i32 {
    let mut max_sum = nums[0];
    let mut min_sum = nums[0];
    let mut cur_max = 0;
    let mut cur_min = 0;
    let mut total = 0;

    for &x in &nums { // O(n)
        cur_max = x.max(cur_max + x);
        max_sum = max_sum.max(cur_max);
        cur_min = x.min(cur_min + x);
        min_sum = min_sum.min(cur_min);
        total += x;
    }

    if total == min_sum {
        max_sum
    } else {
        max_sum.max(total - min_sum)
    }
}
```
