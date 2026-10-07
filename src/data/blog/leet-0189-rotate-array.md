---
author: JZ
pubDatetime: 2026-09-27T10:37:00Z
modDatetime: 2026-09-27T10:37:00Z
title: LeetCode 189 Rotate Array
featured: false
tags:
  - a-array
  - a-math
  - a-two-pointers
description:
  "Solutions for LeetCode 189, medium, tags: array, math, two pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 189](https://leetcode.com/problems/rotate-array/description/)

Given an integer array `nums`, rotate the array to the right by `k` steps, where `k` is non-negative.

```
Example 1:

Input: nums = [1,2,3,4,5,6,7], k = 3
Output: [5,6,7,1,2,3,4]
Explanation:
rotate 1 steps to the right: [7,1,2,3,4,5,6]
rotate 2 steps to the right: [6,7,1,2,3,4,5]
rotate 3 steps to the right: [5,6,7,1,2,3,4]

Example 2:

Input: nums = [-1,-100,3,99], k = 2
Output: [3,99,-1,-100]
Explanation:
rotate 1 steps to the right: [99,-1,-100,3]
rotate 2 steps to the right: [3,99,-1,-100]
```

**Constraints:**

- `1 <= nums.length <= 10^5`
- `-2^31 <= nums[i] <= 2^31 - 1`
- `0 <= k <= 10^5`

**Follow up:**

- Try to come up with as many solutions as you can. There are at least three different ways to solve this problem.
- Could you do it in-place with $O(1)$ extra space?

## Idea 1: Triple Reverse

The key insight is that rotating right by `k` positions is the same as:

1. Reverse the entire array.
2. Reverse the first `k` elements.
3. Reverse the remaining `n - k` elements.

```
Example: nums = [1, 2, 3, 4, 5, 6, 7], k = 3

Step 0:  [1, 2, 3, 4, 5, 6, 7]   original
Step 1:  [7, 6, 5, 4, 3, 2, 1]   reverse all
Step 2:  [5, 6, 7, 4, 3, 2, 1]   reverse first k=3
Step 3:  [5, 6, 7, 1, 2, 3, 4]   reverse last n-k=4
```

Why does this work? After reversing all, the last `k` elements are now at the front but in reversed order. Reversing each segment restores the correct internal order within both halves.

Normalize `k %= n` first to handle `k >= n`.

Complexity: Time $O(n)$ — three passes through the array (each reverse is $O(n)$ total). Space $O(1)$ — all swaps are in-place.

## Idea 2: Extra Array Copy

Copy the original array, then place each element at its rotated position `(i + k) % n`.

```
Example: nums = [1, 2, 3, 4, 5, 6, 7], k = 3

tmp = [1, 2, 3, 4, 5, 6, 7]  (copy)

i=0: nums[(0+3) % 7] = nums[3] = tmp[0] = 1
i=1: nums[(1+3) % 7] = nums[4] = tmp[1] = 2
i=2: nums[(2+3) % 7] = nums[5] = tmp[2] = 3
i=3: nums[(3+3) % 7] = nums[6] = tmp[3] = 4
i=4: nums[(4+3) % 7] = nums[0] = tmp[4] = 5
i=5: nums[(5+3) % 7] = nums[1] = tmp[5] = 6
i=6: nums[(6+3) % 7] = nums[2] = tmp[6] = 7

result: [5, 6, 7, 1, 2, 3, 4]
```

Complexity: Time $O(n)$ — one pass to copy, one pass to place. Space $O(n)$ — extra array for the copy.

### Java

```java []
// Solution 1: triple reverse. O(n) time, O(1) space.
public static void rotate(int[] nums, int k) {
    int n = nums.length;
    k %= n;
    reverse(nums, 0, n - 1);
    reverse(nums, 0, k - 1);
    reverse(nums, k, n - 1);
}

private static void reverse(int[] nums, int left, int right) {
    while (left < right) {
        int tmp = nums[left];
        nums[left] = nums[right];
        nums[right] = tmp;
        left++;
        right--;
    }
}
```

```java []
// Solution 2: extra array copy. O(n) time, O(n) space.
public static void rotate2(int[] nums, int k) {
    int n = nums.length;
    int[] tmp = new int[n];
    for (int i = 0; i < n; i++) tmp[(i + k) % n] = nums[i];
    System.arraycopy(tmp, 0, nums, 0, n);
}
```

### Python

```python []
# Solution 1: triple reverse. O(n) time, O(1) space.
def rotate(self, nums: list[int], k: int) -> None:
    n = len(nums)
    k %= n
    self._reverse(nums, 0, n - 1)      # O(n) reverse all
    self._reverse(nums, 0, k - 1)      # O(k) reverse first k
    self._reverse(nums, k, n - 1)      # O(n-k) reverse rest

@staticmethod
def _reverse(nums: list[int], lo: int, hi: int) -> None:
    while lo < hi:
        nums[lo], nums[hi] = nums[hi], nums[lo]
        lo += 1
        hi -= 1
```

```python []
# Solution 2: extra array copy. O(n) time, O(n) space.
def rotate(self, nums: list[int], k: int) -> None:
    n = len(nums)
    k %= n
    tmp = nums[:]             # O(n) copy
    for i in range(n):        # O(n) place each element
        nums[(i + k) % n] = tmp[i]
```

### C++

```cpp []
// Solution 1: triple reverse. O(n) time, O(1) space.
void rotate(vector<int>& nums, int k) {
    int n = nums.size();
    k %= n;
    reverse(nums.begin(), nums.end());           // O(n) reverse all
    reverse(nums.begin(), nums.begin() + k);     // O(k) reverse first k
    reverse(nums.begin() + k, nums.end());       // O(n-k) reverse last n-k
}
```

```cpp []
// Solution 2: extra array copy. O(n) time, O(n) space.
void rotate(vector<int>& nums, int k) {
    int n = nums.size();
    vector<int> tmp(n);          // O(n) extra space
    for (int i = 0; i < n; i++) // O(n) copy to shifted positions
        tmp[(i + k) % n] = nums[i];
    nums = tmp;
}
```

### Rust

```rust []
// Solution 1: triple reverse. O(n) time, O(1) space.
pub fn rotate(nums: &mut Vec<i32>, k: i32) {
    let n = nums.len();
    if n == 0 { return; }
    let k = k as usize % n;
    if k == 0 { return; }
    nums.reverse();           // reverse all
    nums[..k].reverse();      // reverse first k
    nums[k..].reverse();      // reverse last n-k
}
```

```rust []
// Solution 2: extra array copy. O(n) time, O(n) space.
pub fn rotate_extra(nums: &mut Vec<i32>, k: i32) {
    let n = nums.len();
    if n == 0 { return; }
    let k = k as usize % n;
    let copy = nums.clone(); // O(n) space
    for i in 0..n {          // O(n) time
        nums[(i + k) % n] = copy[i];
    }
}
```
