---
author: JZ
pubDatetime: 2026-06-15T10:36:00Z
modDatetime: 2026-06-15T10:36:00Z
title: LeetCode 31 Next Permutation
featured: true
tags:
  - a-array
description:
  "Solutions for LeetCode 31, medium, tags: array, two pointers."
---

## Table of contents

## Description

A **permutation** of an array of integers is an arrangement of its members into a sequence or linear order.

The **next permutation** of an array of integers is the next lexicographically greater permutation of its integer. If such arrangement is not possible, the array must be rearranged as the lowest possible order (i.e., sorted in ascending order).

For example:
- `[1,2,3]` → `[1,3,2]`
- `[3,2,1]` → `[1,2,3]`
- `[1,1,5]` → `[1,5,1]`

The replacement must be **in place** and use only constant extra memory.

**Constraints:**

- `1 <= nums.length <= 100`
- `0 <= nums[i] <= 100`

Link: [31. Next Permutation](https://leetcode.com/problems/next-permutation/)

## Idea

The algorithm has three steps:

1. **Find the pivot**: Scan from right to left, find the first index `i` where `nums[i] < nums[i+1]`. The suffix after `i` is in non-increasing order.
2. **Find the successor**: Scan from right to left, find the first index `j` where `nums[j] > nums[i]`. Swap `nums[i]` and `nums[j]`.
3. **Reverse the suffix**: Reverse the subarray from `i+1` to the end.

If no pivot exists (entire array is non-increasing), reverse the whole array.

```
Example: [2, 3, 1, 3, 3]

Step 1: Scan right-to-left for nums[i] < nums[i+1]
         2  3  1  3  3
               ^        pivot i=2 (1 < 3)
         suffix [3, 3] is non-increasing ✓

Step 2: Find rightmost j where nums[j] > nums[i]=1
         2  3  1  3  3
                     ^  j=4, swap → [2, 3, 3, 3, 1]

Step 3: Reverse suffix after i=2
         2  3  3 |1  3| → reverse → [2, 3, 3, 1, 3]
```

Complexity: Time $O(n)$ — each step scans at most $n$ elements. Space $O(1)$ — in-place swaps and reverse.

### Java

```java []
public static void nextPermutation(int[] nums) {
    int n = nums.length;
    // Step 1: find pivot — rightmost element smaller than successor, O(n)
    int i = n - 2;
    while (i >= 0 && nums[i] >= nums[i + 1]) i--;
    if (i >= 0) {
        // Step 2: find rightmost element larger than pivot, O(n)
        int j = n - 1;
        while (nums[j] <= nums[i]) j--;
        swap(nums, i, j);
    }
    // Step 3: reverse suffix, O(n)
    // Total: O(n) time, O(1) space
    reverse(nums, i + 1);
}

private static void swap(int[] nums, int i, int j) {
    int tmp = nums[i];
    nums[i] = nums[j];
    nums[j] = tmp;
}

private static void reverse(int[] nums, int start) {
    int left = start, right = nums.length - 1;
    while (left < right) {
        swap(nums, left, right);
        left++;
        right--;
    }
}
```

### Python

```python []
def nextPermutation(self, nums: list[int]) -> None:
    n = len(nums)
    # Step 1: find pivot — rightmost element smaller than its successor, O(n)
    i = n - 2
    while i >= 0 and nums[i] >= nums[i + 1]:
        i -= 1
    if i >= 0:
        # Step 2: find rightmost element larger than pivot, O(n)
        j = n - 1
        while nums[j] <= nums[i]:
            j -= 1
        nums[i], nums[j] = nums[j], nums[i]
    # Step 3: reverse suffix after pivot position, O(n)
    # Total: O(n) time, O(1) space
    left, right = i + 1, n - 1
    while left < right:
        nums[left], nums[right] = nums[right], nums[left]
        left += 1
        right -= 1
```

### C++

```cpp []
void nextPermutation(vector<int>& nums) {
    int n = (int)nums.size();
    // Step 1: find pivot — rightmost element smaller than successor, O(n)
    int i = n - 2;
    while (i >= 0 && nums[i] >= nums[i + 1]) i--;
    if (i >= 0) {
        // Step 2: find rightmost element larger than pivot, O(n)
        int j = n - 1;
        while (nums[j] <= nums[i]) j--;
        swap(nums[i], nums[j]);
    }
    // Step 3: reverse suffix, O(n). Total: O(n) time, O(1) space
    reverse(nums.begin() + i + 1, nums.end());
}
```

### Rust

```rust []
pub fn next_permutation(nums: &mut Vec<i32>) {
    let n = nums.len();
    if n <= 1 { return; }
    // Step 1: find pivot — rightmost element smaller than successor, O(n)
    let pivot = (0..n - 1).rev().find(|&i| nums[i] < nums[i + 1]);
    if let Some(i) = pivot {
        // Step 2: find rightmost element larger than pivot, O(n)
        let j = (i + 1..n).rev().find(|&j| nums[j] > nums[i]).unwrap();
        nums.swap(i, j);
        // Step 3: reverse suffix, O(n). Total: O(n) time, O(1) space
        nums[i + 1..].reverse();
    } else {
        nums.reverse();
    }
}
```
