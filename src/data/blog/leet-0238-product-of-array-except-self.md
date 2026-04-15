---
author: JZ
pubDatetime: 2026-04-15T06:23:00Z
modDatetime: 2026-04-15T06:23:00Z
title: LeetCode 238 Product of Array Except Self
featured: true
tags:
  - a-array
  - a-prefix-sum
description:
  "Solutions for LeetCode 238, medium, tags: array, prefix sum."
---

## Table of contents

## Description

Question link: [LeetCode 238](https://leetcode.com/problems/product-of-array-except-self/description/).

Given an integer array `nums`, return an array `answer` such that `answer[i]` is equal to the product of all the elements of `nums` except `nums[i]`.

The product of any prefix or suffix of `nums` is **guaranteed** to fit in a **32-bit** integer.

You must write an algorithm that runs in `O(n)` time and without using the division operation.

```
Example 1:

Input: nums = [1,2,3,4]
Output: [24,12,8,6]

Example 2:

Input: nums = [-1,1,0,-3,3]
Output: [0,0,9,0,0]
```

**Constraints:**

- `2 <= nums.length <= 10^5`
- `-30 <= nums[i] <= 30`
- The product of any prefix or suffix of `nums` is **guaranteed** to fit in a **32-bit** integer.

**Follow up:** Can you solve the problem in `O(1)` extra space complexity? (The output array does not count as extra space for space complexity analysis.)

## Idea1

We can solve this with two passes using prefix and suffix products built directly into the result array.

1. **Forward pass**: iterate left to right, maintaining a running `prefix` product. For each index `i`, set `res[i] = prefix` (the product of all elements before `i`), then update `prefix *= nums[i]`.
2. **Reverse pass**: iterate right to left, maintaining a running `suffix` product. For each index `i`, multiply `res[i] *= suffix` (the product of all elements after `i`), then update `suffix *= nums[i]`.

After both passes, `res[i] = product of all elements except nums[i]`.

```
nums:   [1,  2,  3,  4]

Forward pass (prefix products before index i):
  i=0: res[0]=1,         prefix=1*1=1
  i=1: res[1]=1,         prefix=1*2=2
  i=2: res[2]=2,         prefix=2*3=6
  i=3: res[3]=6,         prefix=6*4=24
  res = [1, 1, 2, 6]

Reverse pass (multiply suffix products after index i):
  i=3: res[3]=6*1=6,     suffix=1*4=4
  i=2: res[2]=2*4=8,     suffix=4*3=12
  i=1: res[1]=1*12=12,   suffix=12*2=24
  i=0: res[0]=1*24=24,   suffix=24*1=24
  res = [24, 12, 8, 6]
```

Complexity: Time $O(n)$, Space $O(1)$ extra (output array not counted).

### Java

```java []
// prefix/suffix in result array. O(n) time, O(1) extra space.
public int[] productExceptSelf(int[] nums) {
    int[] res = new int[nums.length];
    res[0] = 1;
    for (int i = 1; i < nums.length; i++) { // O(n) forward pass
        res[i] = res[i - 1] * nums[i - 1]; // prefix products: 1,1,2,6
    }
    int right = 1;
    for (int i = nums.length - 2; i >= 0; i--) { // O(n) reverse pass
        right *= nums[i + 1]; // accumulate product right of i
        res[i] *= right;
    }
    return res;
}
```

### Python

```python []
class Solution:
    """O(n) time, O(1) extra space (output array not counted)."""

    def productExceptSelf(self, nums: list[int]) -> list[int]:
        n = len(nums)
        res = [1] * n
        prefix = 1
        for i in range(n):  # O(n) build prefix products into res
            res[i] = prefix
            prefix *= nums[i]
        suffix = 1
        for i in range(n - 1, -1, -1):  # O(n) multiply suffix products
            res[i] *= suffix
            suffix *= nums[i]
        return res
```

### C++

```cpp []
// leet 238, O(n) time, O(1) extra space
vector<int> productExceptSelf(vector<int> &nums) {
    int n = nums.size();
    vector<int> res(n, 1);
    int prefix = 1;
    for (int i = 0; i < n; i++) { // O(n)
        res[i] = prefix;
        prefix *= nums[i];
    }
    int suffix = 1;
    for (int i = n - 1; i >= 0; i--) { // O(n)
        res[i] *= suffix;
        suffix *= nums[i];
    }
    return res;
}
```

### Rust

```rust []
// O(n) time, O(1) extra space
pub fn product_except_self(nums: Vec<i32>) -> Vec<i32> {
    let n = nums.len();
    let mut answer = vec![1; n];
    let mut prefix = 1;
    for i in 0..n { // O(n) forward pass
        answer[i] = prefix;
        prefix *= nums[i];
    }
    let mut suffix = 1;
    for i in (0..n).rev() { // O(n) reverse pass
        answer[i] *= suffix;
        suffix *= nums[i];
    }
    answer
}
```

## Idea2

A more explicit approach using separate prefix and suffix arrays. `prefix[i]` stores the product of all elements before index `i`, and `suffix[i]` stores the product of all elements after index `i`. The result is simply `prefix[i] * suffix[i]`.

This is easier to understand but uses $O(n)$ extra space for the two auxiliary arrays.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// separate prefix[] and suffix[] arrays. O(n) time, O(n) space.
public int[] productExceptSelf(int[] nums) {
    int n = nums.length;
    int[] prefix = new int[n]; // O(n) space, product of elements to the left
    int[] suffix = new int[n]; // O(n) space, product of elements to the right
    int[] result = new int[n];
    for (int i = 0; i < n; i++) { // O(n)
        prefix[i] = i > 0 ? prefix[i - 1] * nums[i - 1] : 1;
    }
    for (int i = n - 1; i >= 0; i--) { // O(n)
        suffix[i] = i == n - 1 ? 1 : suffix[i + 1] * nums[i + 1];
        result[i] = prefix[i] * suffix[i]; // O(n) combine
    }
    return result;
}
```

### Python

```python []
class Solution2:
    """O(n) time, O(n) space with separate prefix and suffix arrays."""

    def productExceptSelf(self, nums: list[int]) -> list[int]:
        n = len(nums)
        prefix = [1] * n  # O(n) space
        suffix = [1] * n  # O(n) space
        for i in range(1, n):  # O(n)
            prefix[i] = prefix[i - 1] * nums[i - 1]
        for i in range(n - 2, -1, -1):  # O(n)
            suffix[i] = suffix[i + 1] * nums[i + 1]
        return [prefix[i] * suffix[i] for i in range(n)]  # O(n)
```

### C++

```cpp []
// O(n) time, O(n) space
vector<int> productExceptSelf(vector<int> &nums) {
    int n = nums.size();
    vector<int> prefix(n, 1), suffix(n, 1); // O(n) space each
    for (int i = 1; i < n; i++) prefix[i] = prefix[i-1] * nums[i-1]; // O(n)
    for (int i = n-2; i >= 0; i--) suffix[i] = suffix[i+1] * nums[i+1]; // O(n)
    vector<int> res(n);
    for (int i = 0; i < n; i++) res[i] = prefix[i] * suffix[i]; // O(n)
    return res;
}
```

### Rust

```rust []
// O(n) time, O(n) space
pub fn product_except_self_v2(nums: Vec<i32>) -> Vec<i32> {
    let n = nums.len();
    let mut prefix = vec![1; n]; // O(n) space
    let mut suffix = vec![1; n]; // O(n) space
    for i in 1..n { // O(n)
        prefix[i] = prefix[i - 1] * nums[i - 1];
    }
    for i in (0..n - 1).rev() { // O(n)
        suffix[i] = suffix[i + 1] * nums[i + 1];
    }
    (0..n).map(|i| prefix[i] * suffix[i]).collect() // O(n)
}
```
