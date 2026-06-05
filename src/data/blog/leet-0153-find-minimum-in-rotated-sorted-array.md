---
author: JZ
pubDatetime: 2026-06-05T06:00:00Z
modDatetime: 2026-06-05T06:00:00Z
title: LeetCode 153 Find Minimum in Rotated Sorted Array
featured: true
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 153, medium, tags: array, binary search."
---

## Table of contents

## Description

Question Links: [LeetCode 153](https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/description/)

Suppose an array of length `n` sorted in ascending order is rotated between 1 and `n` times. For example, the array `nums = [0,1,2,4,5,6,7]` might become:

- `[4,5,6,7,0,1,2]` if it was rotated 4 times.
- `[0,1,2,4,5,6,7]` if it was rotated 7 times.

Notice that rotating an array `[a[0], a[1], a[2], ..., a[n-1]]` 1 time results in the array `[a[n-1], a[0], a[1], a[2], ..., a[n-2]]`.

Given the sorted rotated array `nums` of **unique** elements, return the minimum element of this array.

You must write an algorithm that runs in $O(\log n)$ time.

```
Example 1:

Input: nums = [3,4,5,1,2]
Output: 1
Explanation: The original array was [1,2,3,4,5] rotated 3 times.

Example 2:

Input: nums = [4,5,6,7,0,1,2]
Output: 0
Explanation: The original array was [0,1,2,4,5,6,7] and it was rotated 4 times.

Example 3:

Input: nums = [11,13,15,17]
Output: 11
Explanation: The original array was [11,13,15,17] and it was rotated 4 times.

Constraints:

n == nums.length
1 <= n <= 5000
-5000 <= nums[i] <= 5000
All the integers of nums are unique.
nums is sorted and rotated between 1 and n times.
```

## Solution 1: Binary Search (Compare Mid with Right)

### Idea

The minimum element is the only element that is smaller than its predecessor. In a rotated sorted array, we can use binary search by comparing `nums[mid]` with `nums[hi]`:

- If `nums[mid] > nums[hi]`, the rotation point (minimum) must be in the right half `(mid, hi]`, so `lo = mid + 1`.
- Otherwise, the minimum is at `mid` or to its left, so `hi = mid`.

When `lo == hi`, we've found the minimum.

```
Array:  [4, 5, 6, 7, 0, 1, 2]
Index:   0  1  2  3  4  5  6

Step 1: lo=0, hi=6, mid=3 → nums[3]=7 > nums[6]=2 → lo=4
Step 2: lo=4, hi=6, mid=5 → nums[5]=1 < nums[6]=2 → hi=5
Step 3: lo=4, hi=5, mid=4 → nums[4]=0 < nums[5]=1 → hi=4
Result: lo=hi=4 → nums[4]=0 ✓
```

Complexity: Time $O(\log n)$, Space $O(1)$.

### Java

```java []
public int findMin(int[] nums) {
    int lo = 0, hi = nums.length - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] > nums[hi]) lo = mid + 1; // min must be on the right half
        else hi = mid; // min must be on left half including mid
    }
    return nums[lo];
}
```

### Python

```python []
def findMin(self, nums: list[int]) -> int:
    lo, hi = 0, len(nums) - 1
    while lo < hi:  # O(log n) iterations
        mid = lo + (hi - lo) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid
    return nums[lo]
```

### C++

```cpp []
int findMin(vector<int>& nums) {
    int lo = 0, hi = nums.size() - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] > nums[hi]) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return nums[lo];
}
```

### Rust

```rust []
pub fn find_min(nums: Vec<i32>) -> i32 {
    let (mut lo, mut hi) = (0usize, nums.len() - 1);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if nums[mid] > nums[hi] {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    nums[lo]
}
```

## Solution 2: Binary Search (Compare Mid with First Element)

### Idea

If the array is not rotated (`nums[0] <= nums[n-1]`), return `nums[0]` directly.

Otherwise, compare `nums[mid]` with `nums[0]`:
- If `nums[mid] >= nums[0]`, then `mid` is in the left sorted portion, so the minimum is to the right: `lo = mid + 1`.
- Otherwise, `mid` is in the right sorted portion, so the minimum is at `mid` or further left: `hi = mid`.

Complexity: Time $O(\log n)$, Space $O(1)$.

### Java

```java []
public int findMin(int[] nums) {
    int lo = 0, hi = nums.length - 1;
    if (nums[lo] <= nums[hi]) return nums[lo]; // not rotated
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] >= nums[0]) lo = mid + 1;
        else hi = mid;
    }
    return nums[lo];
}
```

### Python

```python []
def findMin(self, nums: list[int]) -> int:
    lo, hi = 0, len(nums) - 1
    if nums[lo] <= nums[hi]:
        return nums[lo]
    while lo < hi:  # O(log n) iterations
        mid = lo + (hi - lo) // 2
        if nums[mid] >= nums[0]:
            lo = mid + 1
        else:
            hi = mid
    return nums[lo]
```

### C++

```cpp []
int findMin(vector<int>& nums) {
    int n = nums.size();
    if (nums[0] <= nums[n - 1]) return nums[0];
    int lo = 0, hi = n - 1;
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (nums[mid] >= nums[0]) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return nums[lo];
}
```

### Rust

```rust []
pub fn find_min_v2(nums: Vec<i32>) -> i32 {
    let n = nums.len();
    if n == 1 || nums[0] <= nums[n - 1] {
        return nums[0];
    }
    let (mut lo, mut hi) = (0usize, n - 1);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if nums[mid] >= nums[0] {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    nums[lo]
}
```
