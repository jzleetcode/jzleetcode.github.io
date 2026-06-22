---
author: JZ
pubDatetime: 2026-06-22T10:06:00Z
modDatetime: 2026-06-22T10:06:00Z
title: LeetCode 75 Sort Colors
featured: true
tags:
  - a-array
  - a-two-pointer
  - a-sorting
description:
  "Solutions for LeetCode 75, medium, tags: array, two pointers, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 75](https://leetcode.com/problems/sort-colors/description/)

Given an array `nums` with `n` objects colored red, white, or blue, sort them **in-place** so that objects of the same color are adjacent, with the colors in the order red (0), white (1), and blue (2).

You must solve this problem without using the library's sort function.

**Constraints:**

- `n == nums.length`
- `1 <= n <= 300`
- `nums[i]` is either `0`, `1`, or `2`.

**Follow up:** Could you come up with a one-pass algorithm using only constant extra space?

## Idea1: Dutch National Flag

Maintain three pointers that partition the array into four regions:

```
 [0..lo)    = all 0s
 [lo..mid)  = all 1s
 [mid..hi]  = unexamined
 (hi..n-1]  = all 2s

 ┌───────┬───────┬─────────────┬───────┐
 │  0s   │  1s   │ unexamined  │  2s   │
 └───────┴───────┴─────────────┴───────┘
 0      lo      mid            hi     n-1
```

At each step, examine `nums[mid]`:
- If `0`: swap with `nums[lo]`, advance both `lo` and `mid`.
- If `1`: just advance `mid`.
- If `2`: swap with `nums[hi]`, shrink `hi` (don't advance `mid` — swapped element needs inspection).

Single pass through the array. Each element is examined at most twice (once when `mid` reaches it, once if it was swapped back from `hi`).

Complexity: Time $O(n)$, Space $O(1)$.

## Idea2: Counting Sort

Two passes:
1. Count occurrences of 0, 1, and 2.
2. Overwrite the array with the counted values in order.

Simpler but requires two passes.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public final class SortColors {

    private SortColors() {
    }

    // Dutch National Flag algorithm. O(n) single pass, O(1) space.
    public static void sortColors(int[] nums) {
        int lo = 0, mid = 0, hi = nums.length - 1;
        while (mid <= hi) {
            if (nums[mid] == 0) {
                swap(nums, lo, mid);
                lo++;
                mid++;
            } else if (nums[mid] == 2) {
                swap(nums, mid, hi);
                hi--;
            } else {
                mid++;
            }
        }
    }

    // Counting sort. O(n) two passes, O(1) space.
    public static void sortColors2(int[] nums) {
        int count0 = 0, count1 = 0, count2 = 0;
        for (int num : nums) {
            if (num == 0) count0++;
            else if (num == 1) count1++;
            else count2++;
        }
        int i = 0;
        while (count0-- > 0) nums[i++] = 0;
        while (count1-- > 0) nums[i++] = 1;
        while (count2-- > 0) nums[i++] = 2;
    }

    private static void swap(int[] nums, int i, int j) {
        int tmp = nums[i];
        nums[i] = nums[j];
        nums[j] = tmp;
    }
}
```

### Python

```python []
class Solution:
    """Dutch National Flag - three-way partition."""

    def sortColors(self, nums: List[int]) -> None:
        lo, mid, hi = 0, 0, len(nums) - 1  # O(1) space
        while mid <= hi:  # O(n) time, single pass
            if nums[mid] == 0:
                nums[lo], nums[mid] = nums[mid], nums[lo]
                lo += 1
                mid += 1
            elif nums[mid] == 1:
                mid += 1
            else:
                nums[mid], nums[hi] = nums[hi], nums[mid]
                hi -= 1


class Solution2:
    """Two-pass counting sort."""

    def sortColors(self, nums: List[int]) -> None:
        counts = [0, 0, 0]
        for n in nums:  # O(n) time first pass
            counts[n] += 1
        i = 0
        for color in range(3):  # O(n) time second pass
            for _ in range(counts[color]):
                nums[i] = color
                i += 1
```

### C++

```cpp []
class SortColors {
public:
    // Dutch National Flag — single pass O(n) time, O(1) space
    void sortColors(vector<int>& nums) {
        int lo = 0, mid = 0, hi = (int)nums.size() - 1;
        while (mid <= hi) {
            if (nums[mid] == 0) {
                swap(nums[lo++], nums[mid++]);
            } else if (nums[mid] == 1) {
                ++mid;
            } else {
                swap(nums[mid], nums[hi--]);
            }
        }
    }

    // Counting sort — two pass O(n) time, O(1) space
    void sortColors2(vector<int>& nums) {
        int count[3] = {0, 0, 0};
        for (int x : nums) ++count[x];
        int idx = 0;
        for (int c = 0; c < 3; ++c)
            for (int i = 0; i < count[c]; ++i)
                nums[idx++] = c;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Dutch National Flag — three pointers. O(n) time, O(1) space.
    pub fn sort_colors(nums: &mut Vec<i32>) {
        let n = nums.len();
        if n <= 1 { return; }
        let (mut lo, mut mid, mut hi) = (0, 0, n - 1);
        while mid <= hi {
            match nums[mid] {
                0 => { nums.swap(lo, mid); lo += 1; mid += 1; }
                1 => { mid += 1; }
                2 => {
                    nums.swap(mid, hi);
                    if hi == 0 { break; }
                    hi -= 1;
                }
                _ => unreachable!(),
            }
        }
    }

    /// Counting sort. O(n) time, O(1) space.
    pub fn sort_colors_counting(nums: &mut Vec<i32>) {
        let mut counts = [0usize; 3];
        for &v in nums.iter() { counts[v as usize] += 1; }
        let mut idx = 0;
        for (color, &cnt) in counts.iter().enumerate() {
            for _ in 0..cnt { nums[idx] = color as i32; idx += 1; }
        }
    }
}
```
