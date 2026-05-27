---
author: JZ
pubDatetime: 2026-05-27T10:06:00Z
modDatetime: 2026-05-27T10:06:00Z
title: LeetCode 162 Find Peak Element
featured: true
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 162, medium, tags: array, binary search."
---

## Table of contents

## Description

Question Link: [LeetCode 162](https://leetcode.com/problems/find-peak-element/description/)

A peak element is an element that is strictly greater than its neighbors.

Given a **0-indexed** integer array `nums`, find a peak element and return its index. If the array contains multiple peaks, return the index to **any** of the peaks.

You may imagine that `nums[-1] = nums[n] = -∞`. In other words, an element is always considered to be strictly greater than a neighbor that is outside the array.

You must write an algorithm that runs in `O(log n)` time.

**Constraints:**

- `1 <= nums.length <= 1000`
- $-2^{31}$ `<= nums[i] <=` $2^{31} - 1$
- `nums[i] != nums[i + 1]` for all valid `i`.

## Idea1: Binary Search

Since `nums[i] != nums[i+1]` and boundaries are $-\infty$, a peak is guaranteed to exist. At each binary search step, compare `nums[mid]` with `nums[mid+1]`:

- If `nums[mid] < nums[mid+1]`, the right side must contain a peak (the values are rising), so move `lo = mid + 1`.
- Otherwise, the left side (including `mid`) contains a peak, so move `hi = mid`.

When `lo == hi`, we've found a peak.

```
nums: [1, 2, 1, 3, 5, 6, 4]

       lo=0          hi=6       mid=3, nums[3]=3 < nums[4]=5 → lo=4
                lo=4  hi=6      mid=5, nums[5]=6 > nums[6]=4 → hi=5
                lo=4  hi=5      mid=4, nums[4]=5 < nums[5]=6 → lo=5
                      lo=hi=5   peak at index 5, value=6 ✓
```

Complexity: Time $O(\log n)$, Space $O(1)$.

## Idea2: Linear Scan

Walk the array. The first index `i` where `nums[i] > nums[i+1]` is a peak (since all previous elements were ascending). If no such index exists, the last element is the peak.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
// binary search, O(log n) time, O(1) space
public int findPeakElementIter(int[] nums) {
    int l = 0, r = nums.length - 1;
    while (l < r) {
        int mid = l + (r - l) / 2;
        if (nums[mid] > nums[mid + 1])
            r = mid;
        else
            l = mid + 1;
    }
    return l;
}
```
```java []
// recursive binary search, O(log n) time and stack space
public int findPeakElementRecur(int[] nums) {
    return search(nums, 0, nums.length - 1);
}

public int search(int[] nums, int l, int r) {
    if (l == r) return l;
    int mid = l + (r - l) / 2;
    if (nums[mid] > nums[mid + 1]) return search(nums, l, mid);
    return search(nums, mid + 1, r);
}
```

### Python

```python []
class Solution:
    def find_peak_element(self, nums: list[int]) -> int:
        """Binary search. O(log n) time, O(1) space."""
        lo, hi = 0, len(nums) - 1
        while lo < hi:  # O(log n)
            mid = lo + (hi - lo) // 2
            if nums[mid] > nums[mid + 1]:
                hi = mid
            else:
                lo = mid + 1
        return lo
```
```python []
class Solution:
    def find_peak_element_linear(self, nums: list[int]) -> int:
        """Linear scan. O(n) time, O(1) space."""
        for i in range(len(nums) - 1):  # O(n)
            if nums[i] > nums[i + 1]:
                return i
        return len(nums) - 1
```

### C++

```cpp []
// O(log n) time, O(1) space
int findPeakElementBinarySearch(vector<int>& nums) {
    int left = 0, right = (int)nums.size() - 1;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] < nums[mid + 1])
            left = mid + 1;
        else
            right = mid;
    }
    return left;
}
```
```cpp []
// O(n) time, O(1) space
int findPeakElementLinear(vector<int>& nums) {
    for (int i = 0; i < (int)nums.size() - 1; ++i) {
        if (nums[i] > nums[i + 1])
            return i;
    }
    return (int)nums.size() - 1;
}
```

### Rust

```rust []
impl Solution {
    // O(log n) time, O(1) space
    pub fn find_peak_element(nums: Vec<i32>) -> i32 {
        let (mut lo, mut hi) = (0, nums.len() - 1);
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if nums[mid] < nums[mid + 1] {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        lo as i32
    }
}
```
```rust []
impl Solution {
    // O(n) time, O(1) space
    pub fn find_peak_element_linear(nums: Vec<i32>) -> i32 {
        for i in 0..nums.len() - 1 {
            if nums[i] > nums[i + 1] {
                return i as i32;
            }
        }
        (nums.len() - 1) as i32
    }
}
```
