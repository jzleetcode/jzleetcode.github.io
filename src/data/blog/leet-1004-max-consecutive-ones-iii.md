---
author: JZ
pubDatetime: 2026-09-08T06:00:00Z
modDatetime: 2026-09-08T06:00:00Z
title: LeetCode 1004 Max Consecutive Ones III
featured: true
tags:
  - a-sliding-window
  - a-binary-search
  - a-prefix-sum
description:
  "Solutions for LeetCode 1004, medium, tags: array, binary search, sliding window, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 1004](https://leetcode.com/problems/max-consecutive-ones-iii/description/)

Given a binary array `nums` and an integer `k`, return _the maximum number of consecutive_ `1`_'s in the array if you can flip at most_ `k` `0`_'s_.

```
Example 1:

Input: nums = [1,1,1,0,0,0,1,1,1,1,0], k = 2
Output: 6
Explanation: [1,1,1,0,0,1,1,1,1,1,1]
                      ^^^^^^^^^^^
Bolded numbers were flipped from 0 to 1.
The longest subarray is underlined.

Example 2:

Input: nums = [0,0,1,1,0,0,1,1,1,0,1,1,0,0,0,1,1,1,1], k = 3
Output: 10
Explanation: [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1]
                 ^^^^^^^^^^^^^^^^^^^^^
Bolded numbers were flipped from 0 to 1.
The longest subarray is underlined.
```

**Constraints:**

- $1 \leq \text{nums.length} \leq 10^5$
- `nums[i]` is either `0` or `1`.
- $0 \leq k \leq \text{nums.length}$

## Idea1: Sliding Window

Instead of actually flipping zeros, reframe the problem: find the longest subarray containing **at most `k` zeros**.

Maintain a window `[left, right]` and a counter `zeros` for zeros inside the window. Expand `right` one step at a time. When `zeros > k`, shrink from `left` until the window is valid again.

```
nums: [1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0]   k = 2

       l              r
      [1, 1, 1, 0, 0, 0, ...]    zeros=3 > k=2, shrink left
          l           r
      [   1, 1, 0, 0, 0, ...]    zeros=3 > k=2, shrink left
             l        r
      [      1, 0, 0, 0, ...]    zeros=3 > k=2, shrink left
                l     r
      [         0, 0, 0, ...]    zeros=2 <= k=2, valid!  (left skipped a 0)
                            ...keep expanding right...
                   l              r
      [            0, 1, 1, 1, 1, 0]  zeros=2, window size=6  <-- answer
```

Each element is visited at most twice (once by `right`, once by `left`), so the total work is $O(n)$.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
// solution 1, sliding window. O(n) time, O(1) space.
public static int longestOnes(int[] nums, int k) {
    int left = 0, res = 0, zeros = 0;
    for (int right = 0; right < nums.length; right++) { // O(n) expand right
        if (nums[right] == 0) zeros++;
        while (zeros > k) {         // shrink left until window valid
            if (nums[left] == 0) zeros--;
            left++;
        }
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

```python []
# solution 1, sliding window. O(n) time, O(1) space.
def longestOnes(self, nums: list[int], k: int) -> int:
    left, zeros = 0, 0
    res = 0
    for right in range(len(nums)):  # O(n)
        if nums[right] == 0:
            zeros += 1
        while zeros > k:  # O(1) amortized, left moves at most n total
            if nums[left] == 0:
                zeros -= 1
            left += 1
        res = max(res, right - left + 1)
    return res
```

```cpp []
// leet 1004, sliding window. O(n) time, O(1) space.
int longestOnes(vector<int> &nums, int k) {
    int l = 0, r = 0, n = nums.size();
    while (r < n) {
        if (nums[r++] == 0) --k;
        if (k < 0 && nums[l++] == 0) ++k;
    }
    return r - l;
}
```

```rust []
// solution 1, sliding window. O(n) time, O(1) space.
pub fn longest_ones(nums: Vec<i32>, k: i32) -> i32 {
    let mut zeros = 0;
    let mut l = 0usize;
    let mut res = 0;
    for r in 0..nums.len() {
        if nums[r] == 0 { zeros += 1; }
        while zeros > k {
            if nums[l] == 0 { zeros -= 1; }
            l += 1;
        }
        if r >= l { res = res.max(r - l + 1); }
    }
    res as i32
}
```

## Idea2: Binary Search + Prefix Sum

Binary search on the answer (window size). For a candidate size `mid`, check if **any** window of that size contains at most `k` zeros. Use a prefix sum of zeros to compute the zero count of any window in $O(1)$.

If a window of size `mid` is feasible, try larger (`lo = mid`); otherwise try smaller (`hi = mid - 1`).

Complexity: Time $O(n \log n)$ — $O(\log n)$ binary search iterations, each scanning $O(n)$ windows. Space $O(n)$ — for the prefix sum array.

### Java

```java []
// solution 2, binary search + prefix sum. O(n log n) time, O(n) space.
public static int longestOnes2(int[] nums, int k) {
    int n = nums.length;
    int[] zeroPrefix = new int[n + 1]; // zeroPrefix[i]: zeros in nums[0..i-1]
    for (int i = 0; i < n; i++)
        zeroPrefix[i + 1] = zeroPrefix[i] + (nums[i] == 0 ? 1 : 0);
    int res = 0, lo = 0, hi = n;     // O(log n) binary search
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (canFit(zeroPrefix, mid, k)) { res = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return res;
}

private static boolean canFit(int[] zeroPrefix, int size, int k) {
    for (int r = size; r < zeroPrefix.length; r++) // O(n) slide window
        if (zeroPrefix[r] - zeroPrefix[r - size] <= k) return true;
    return false;
}
```

```python []
# solution 2, binary search + prefix sum. O(n log n) time, O(n) space.
def longestOnes(self, nums: list[int], k: int) -> int:
    n = len(nums)
    prefix = [0] * (n + 1)
    for i in range(n):  # O(n)
        prefix[i + 1] = prefix[i] + (1 if nums[i] == 0 else 0)

    def feasible(size: int) -> bool:
        for i in range(size, n + 1):  # O(n)
            if prefix[i] - prefix[i - size] <= k:
                return True
        return False

    lo, hi = 0, n  # O(log n) binary search on answer
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if feasible(mid): lo = mid
        else: hi = mid - 1
    return lo
```

```cpp []
// leet 1004, binary search + prefix sum. O(n log n) time, O(n) space.
int longestOnes(vector<int> &nums, int k) {
    int n = nums.size();
    vector<int> prefix(n + 1, 0);
    for (int i = 0; i < n; ++i)
        prefix[i + 1] = prefix[i] + (nums[i] == 0);
    int lo = 0, hi = n, ans = 0;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        bool found = false;
        for (int i = 0; i + mid <= n; ++i)
            if (prefix[i + mid] - prefix[i] <= k) { found = true; break; }
        if (found) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return ans;
}
```

```rust []
// solution 2, binary search + prefix sum. O(n log n) time, O(n) space.
pub fn longest_ones(nums: Vec<i32>, k: i32) -> i32 {
    let n = nums.len();
    let mut prefix = vec![0i32; n + 1];
    for i in 0..n { prefix[i + 1] = prefix[i] + (1 - nums[i]); }
    let mut res = 0;
    for r in 0..n {
        let (mut lo, mut hi) = (0, r + 1);
        while lo < hi {
            let mid = (lo + hi) / 2;
            let zeros = prefix[r + 1] - prefix[mid];
            if zeros <= k { hi = mid; } else { lo = mid + 1; }
        }
        if lo <= r { res = res.max(r - lo + 1); }
    }
    res as i32
}
```
