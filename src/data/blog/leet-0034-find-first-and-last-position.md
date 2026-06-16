---
author: JZ
pubDatetime: 2026-06-10T10:00:00Z
modDatetime: 2026-06-10T10:00:00Z
title: LeetCode 34 Find First and Last Position of Element in Sorted Array
featured: false
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 34, medium, tags: array, binary search."
---

## Table of contents

## Description

Question Links: [LeetCode 34](https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/description/)

Given an array of integers `nums` sorted in non-decreasing order, find the starting and ending position of a given `target` value.

If `target` is not found in the array, return `[-1, -1]`.

You must write an algorithm with $O(\log n)$ runtime complexity.

```
Example 1:

Input: nums = [5,7,7,8,8,10], target = 8
Output: [3,4]

Example 2:

Input: nums = [5,7,7,8,8,10], target = 6
Output: [-1,-1]

Example 3:

Input: nums = [], target = 0
Output: [-1,-1]

Constraints:

0 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9
nums is a non-decreasing array.
-10^9 <= target <= 10^9
```

## Solution 1: Two Binary Searches (Lower and Upper Bound)

### Idea

Run two binary searches independently — one to find the leftmost occurrence and one for the rightmost.

**Left boundary:** standard lower-bound search. When `nums[mid] >= target`, move right pointer to `mid`; otherwise move left pointer to `mid + 1`. After the loop, check if the element at `left` equals `target`.

**Right boundary:** when `nums[mid] <= target`, move left to `mid` (biasing mid upward with `(lo + hi + 1) / 2` to avoid infinite loop); otherwise move right to `mid - 1`.

```
nums = [5, 7, 7, 8, 8, 10], target = 8

Left boundary search:
lo=0 hi=6  mid=3  nums[3]=8 >= 8  → hi=3
lo=0 hi=3  mid=1  nums[1]=7 <  8  → lo=2
lo=2 hi=3  mid=2  nums[2]=7 <  8  → lo=3
lo=3 hi=3  → left=3, nums[3]=8 ✓

Right boundary search:
lo=3 hi=5  mid=4  nums[4]=8 <= 8  → lo=4
lo=4 hi=5  mid=5  nums[5]=10 > 8  → hi=4
lo=4 hi=4  → right=4

Result: [3, 4]
```

Complexity: Time $O(\log n)$ — two passes of binary search. Space $O(1)$.

#### Java

```java []
// O(log n) time, O(1) space.
// Two binary searches: one for left boundary, one for right boundary.
static class Solution {
    public static int[] searchRange(int[] nums, int target) {
        int[] result = {-1, -1};
        if (nums == null || nums.length == 0) return result;

        // Find left boundary
        int left = findBoundary(nums, target, true);
        if (left == -1) return result;

        // Find right boundary
        int right = findBoundary(nums, target, false);

        result[0] = left;
        result[1] = right;
        return result;
    }

    private static int findBoundary(int[] nums, int target, boolean findLeft) {
        int l = 0, r = nums.length - 1;
        int boundary = -1;

        while (l <= r) { // O(log n)
            int m = l + (r - l) / 2;
            if (nums[m] == target) {
                boundary = m;
                if (findLeft) {
                    r = m - 1; // continue searching left
                } else {
                    l = m + 1; // continue searching right
                }
            } else if (nums[m] < target) {
                l = m + 1;
            } else {
                r = m - 1;
            }
        }

        return boundary;
    }
}
```

#### Python

```python []
class Solution:
    def search_range(self, nums: list[int], target: int) -> list[int]:
        """Two binary searches for left and right boundaries. O(log n) time, O(1) space."""
        left = self._lower_bound(nums, target)
        if left == len(nums) or nums[left] != target:
            return [-1, -1]
        right = self._upper_bound(nums, target)
        return [left, right]

    def _lower_bound(self, nums: list[int], target: int) -> int:
        """Find first index where nums[i] >= target. O(log n)"""
        lo, hi = 0, len(nums)
        while lo < hi:  # O(log n)
            mid = lo + (hi - lo) // 2
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid
        return lo

    def _upper_bound(self, nums: list[int], target: int) -> int:
        """Find last index where nums[i] == target. O(log n)"""
        lo, hi = 0, len(nums) - 1
        while lo < hi:  # O(log n)
            mid = lo + (hi - lo + 1) // 2
            if nums[mid] <= target:
                lo = mid
            else:
                hi = mid - 1
        return lo
```

#### C++

```cpp []
// O(log n) time, O(1) space. Two binary searches.
class SearchRange {
public:
    vector<int> searchRange(vector<int>& nums, int target) {
        if (nums.empty()) return {-1, -1};
        int left = findLeft(nums, target);
        if (left == -1) return {-1, -1};
        int right = findRight(nums, target);
        return {left, right};
    }

private:
    int findLeft(vector<int>& nums, int target) {
        int left = 0, right = (int)nums.size() - 1;
        int result = -1;
        while (left <= right) { // O(log n)
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) {
                result = mid;
                right = mid - 1;
            } else if (nums[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return result;
    }

    int findRight(vector<int>& nums, int target) {
        int left = 0, right = (int)nums.size() - 1;
        int result = -1;
        while (left <= right) { // O(log n)
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) {
                result = mid;
                left = mid + 1;
            } else if (nums[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution {
    // O(log n) time, O(1) space. Two binary searches.
    pub fn search_range(nums: Vec<i32>, target: i32) -> Vec<i32> {
        if nums.is_empty() {
            return vec![-1, -1];
        }
        let left = Self::find_left_boundary(&nums, target);
        if left == -1 {
            return vec![-1, -1];
        }
        let right = Self::find_right_boundary(&nums, target);
        vec![left, right]
    }

    fn find_left_boundary(nums: &[i32], target: i32) -> i32 {
        let mut left = 0;
        let mut right = nums.len(); // O(log n)
        while left < right {
            let mid = left + (right - left) / 2;
            if nums[mid] < target {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        if left < nums.len() && nums[left] == target {
            left as i32
        } else {
            -1
        }
    }

    fn find_right_boundary(nums: &[i32], target: i32) -> i32 {
        let mut left = 0;
        let mut right = nums.len(); // O(log n)
        while left < right {
            let mid = left + (right - left) / 2;
            if nums[mid] <= target {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        (left - 1) as i32
    }
}
```

## Solution 2: Using Built-in bisect (Python)

### Idea

Use `bisect_left` and `bisect_right` from the standard library which implement the same lower/upper bound logic. This is a practical shortcut in interviews if the interviewer allows library usage.

Complexity: Time $O(\log n)$, Space $O(1)$.

#### Python

```python []
from bisect import bisect_left, bisect_right

class Solution2:
    def search_range(self, nums: list[int], target: int) -> list[int]:
        """Using bisect_left and bisect_right. O(log n) time, O(1) space."""
        left = bisect_left(nums, target)  # O(log n)
        if left == len(nums) or nums[left] != target:
            return [-1, -1]
        right = bisect_right(nums, target) - 1  # O(log n)
        return [left, right]
```
