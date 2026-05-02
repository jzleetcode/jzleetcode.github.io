---
author: JZ
pubDatetime: 2026-04-19T10:00:00Z
modDatetime: 2026-04-19T10:00:00Z
title: LeetCode 33 Search in Rotated Sorted Array
featured: false
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 33, medium, tags: array, binary search."
---

## Table of contents

## Description

Question Links: [LeetCode 33](https://leetcode.com/problems/search-in-rotated-sorted-array/description/)

There is an integer array `nums` sorted in ascending order (with distinct values).

Prior to being passed to your function, `nums` is possibly rotated at an unknown pivot index `k` (`1 <= k < nums.length`) such that the resulting array is `[nums[k], nums[k+1], ..., nums[n-1], nums[0], nums[1], ..., nums[k-1]]` (0-indexed). For example, `[0,1,2,4,5,6,7]` might be rotated at pivot index 3 and become `[4,5,6,7,0,1,2]`.

Given the array `nums` after the possible rotation and an integer `target`, return the index of `target` if it is in `nums`, or `-1` if it is not in `nums`.

You must write an algorithm with $O(\log n)$ runtime complexity.

```
Example 1:

Input: nums = [4,5,6,7,0,1,2], target = 0
Output: 4

Example 2:

Input: nums = [4,5,6,7,0,1,2], target = 3
Output: -1

Example 3:

Input: nums = [1], target = 0
Output: -1

Constraints:

1 <= nums.length <= 5000
-10^4 <= nums[i] <= 10^4
All values of nums are unique.
nums is an ascending array that is possibly rotated.
-10^4 <= target <= 10^4
```

## Solution 1: Single-Pass Modified Binary Search

### Idea

At each step of binary search, one of the two halves `[l..m]` or `[m..r]` must be sorted (because at most one rotation break can fall in a half). We check which half is sorted, then determine whether the target lies in that sorted range.

- If `nums[l] <= nums[m]`, the left half is sorted. If `nums[l] <= target < nums[m]`, search left; otherwise search right.
- Otherwise, the right half is sorted. If `nums[m] < target <= nums[r]`, search right; otherwise search left.

```
nums = [4, 5, 6, 7, 0, 1, 2], target = 0

l=0  r=6  m=3  nums[m]=7  left sorted [4,5,6,7]  0 not in [4,7) → l=4
l=4  r=6  m=5  nums[m]=1  right sorted [1,2]     0 not in (1,2] → r=4
l=4  r=4  m=4  nums[m]=0  found → return 4
```

Complexity: Time $O(\log n)$, Space $O(1)$.

#### Java

```java []
// O(log n) time, O(1) space.
static class Solution {
    public static int search(int[] nums, int target) {
        int l = 0, r = nums.length - 1;
        while (l <= r) {
            int m = (l + r) / 2;
            if (nums[m] == target) return m;
            if (nums[l] <= nums[m]) { // left half sorted
                if (nums[l] <= target && target < nums[m]) r = m - 1;
                else l = m + 1;
            } else { // right half sorted
                if (nums[m] < target && target <= nums[r]) l = m + 1;
                else r = m - 1;
            }
        }
        return -1;
    }
}
```

#### Python

```python []
class Solution:
    """Modified binary search, single pass. O(log n) time, O(1) space."""

    def search(self, nums: list[int], target: int) -> int:
        l, r = 0, len(nums) - 1
        while l <= r:  # O(log n) iterations
            m = l + (r - l) // 2
            if nums[m] == target:
                return m
            if nums[l] <= nums[m]:  # left half [l..m] is sorted
                if nums[l] <= target < nums[m]:  # target in sorted left half
                    r = m - 1
                else:
                    l = m + 1
            else:  # right half [m..r] is sorted
                if nums[m] < target <= nums[r]:  # target in sorted right half
                    l = m + 1
                else:
                    r = m - 1
        return -1
```

#### C++

```cpp []
// leet 33, single-pass modified binary search, O(log n) time, O(1) space.
class Solution {
public:
    int search(vector<int> &nums, int target) {
        int l = 0, r = (int) nums.size() - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (nums[m] == target) return m;
            if (nums[l] <= nums[m]) { // left sorted
                if (nums[l] <= target && target < nums[m]) r = m - 1;
                else l = m + 1;
            } else { // right sorted
                if (nums[m] < target && target <= nums[r]) l = m + 1;
                else r = m - 1;
            }
        }
        return -1;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn search(nums: Vec<i32>, target: i32) -> i32 {
        let mut l: i32 = 0;
        let mut r: i32 = nums.len() as i32 - 1;
        while l <= r {
            let m = l + (r - l) / 2;
            let mi = m as usize;
            if nums[mi] == target {
                return m;
            }
            if nums[l as usize] <= nums[mi] {
                // left half is sorted
                if nums[l as usize] <= target && target < nums[mi] {
                    r = m - 1;
                } else {
                    l = m + 1;
                }
            } else {
                // right half is sorted
                if nums[mi] < target && target <= nums[r as usize] {
                    l = m + 1;
                } else {
                    r = m - 1;
                }
            }
        }
        -1
    }
}
```

## Solution 2: Two-Pass (Find Pivot + Binary Search)

### Idea

First, find the rotation pivot (index of the minimum element) using binary search. If `nums[m] > nums[r]`, the minimum is in the right half; otherwise it is in the left half (including `m`).

Then determine which half the target belongs to and run a standard binary search there.

```
nums = [4, 5, 6, 7, 0, 1, 2], target = 0

Pass 1 — find pivot:
l=0 r=6 m=3 nums[3]=7 > nums[6]=2 → l=4
l=4 r=6 m=5 nums[5]=1 < nums[6]=2 → r=5
l=4 r=5 m=4 nums[4]=0 < nums[5]=1 → r=4
pivot=4

Pass 2 — binary search [4,6]:
target=0 >= nums[4]=0 and <= nums[6]=2 → search [4,6]
l=4 r=6 m=5 nums[5]=1 > 0 → r=4
l=4 r=4 m=4 nums[4]=0 → found, return 4
```

Complexity: Time $O(\log n)$, Space $O(1)$.

#### Java

```java []
// O(log n) time, O(1) space. Two-pass: find pivot then binary search.
static class Solution2 {
    public static int search(int[] nums, int target) {
        int n = nums.length;
        // find pivot (index of minimum element)
        int l = 0, r = n - 1;
        while (l < r) {
            int m = (l + r) / 2;
            if (nums[m] > nums[r]) l = m + 1;
            else r = m;
        }
        int pivot = l;
        // binary search in the correct half
        if (target >= nums[pivot] && target <= nums[n - 1]) {
            l = pivot;
            r = n - 1;
        } else {
            l = 0;
            r = pivot - 1;
        }
        while (l <= r) {
            int m = (l + r) / 2;
            if (nums[m] == target) return m;
            else if (nums[m] < target) l = m + 1;
            else r = m - 1;
        }
        return -1;
    }
}
```

#### Python

```python []
class Solution2:
    """Two-pass: find pivot then binary search. O(log n) time, O(1) space."""

    def search(self, nums: list[int], target: int) -> int:
        n = len(nums)
        # pass 1: find index of minimum element (pivot), O(log n)
        l, r = 0, n - 1
        while l < r:
            m = l + (r - l) // 2
            if nums[m] > nums[r]:
                l = m + 1
            else:
                r = m
        pivot = l
        # pass 2: binary search in the correct half, O(log n)
        if target >= nums[pivot] and target <= nums[-1]:
            l, r = pivot, n - 1
        else:
            l, r = 0, pivot - 1
        while l <= r:
            m = l + (r - l) // 2
            if nums[m] == target:
                return m
            elif nums[m] < target:
                l = m + 1
            else:
                r = m - 1
        return -1
```

#### C++

```cpp []
// Two-pass, find pivot then binary search, O(log n) time, O(1) space.
class Solution2 {
public:
    int search(vector<int> &nums, int target) {
        int n = (int) nums.size();
        // find the index of the minimum element (pivot)
        int l = 0, r = n - 1;
        while (l < r) {
            int m = l + (r - l) / 2;
            if (nums[m] > nums[r]) l = m + 1;
            else r = m;
        }
        int pivot = l;
        // binary search in the correct half
        if (target >= nums[pivot] && target <= nums[n - 1]) {
            l = pivot;
            r = n - 1;
        } else {
            l = 0;
            r = pivot - 1;
        }
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (nums[m] == target) return m;
            else if (nums[m] < target) l = m + 1;
            else r = m - 1;
        }
        return -1;
    }
};
```

#### Rust

```rust []
impl Solution2 {
    pub fn search(nums: Vec<i32>, target: i32) -> i32 {
        let n = nums.len() as i32;
        if n == 0 { return -1; }
        // find pivot (index of smallest element)
        let mut l: i32 = 0;
        let mut r: i32 = n - 1;
        while l < r {
            let m = l + (r - l) / 2;
            if nums[m as usize] > nums[r as usize] {
                l = m + 1;
            } else {
                r = m;
            }
        }
        let pivot = l;
        // determine which half to search
        if target >= nums[pivot as usize] && target <= nums[(n - 1) as usize] {
            l = pivot;
            r = n - 1;
        } else {
            l = 0;
            r = pivot - 1;
        }
        // standard binary search
        while l <= r {
            let m = l + (r - l) / 2;
            let val = nums[m as usize];
            if val == target { return m; }
            else if val < target { l = m + 1; }
            else { r = m - 1; }
        }
        -1
    }
}
```
