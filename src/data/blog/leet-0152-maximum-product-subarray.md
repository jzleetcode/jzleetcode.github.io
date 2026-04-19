---
author: JZ
pubDatetime: 2026-04-13T06:23:00Z
modDatetime: 2026-04-13T06:23:00Z
title: LeetCode 152 Maximum Product Subarray
featured: false
tags:
  - a-array
  - a-dp
description:
  "Solutions for LeetCode 152, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Given an integer array `nums`, find a subarray that has the largest product, and return the product.

The test cases are generated so that the answer will fit in a 32-bit integer.

```
Example 1:

Input: nums = [2,3,-2,4]
Output: 6
Explanation: [2,3] has the largest product 6.

Example 2:

Input: nums = [-2,0,-1]
Output: 0
Explanation: The result cannot be 2, because [-2,-1] is not a subarray.
```

**Constraints:**

- `1 <= nums.length <= 2 * 10^4`
- `-10 <= nums[i] <= 10`
- The product of any prefix or suffix of nums is guaranteed to fit in a 32-bit integer.

## Idea

This problem is a variant of [Kadane's algorithm](https://en.wikipedia.org/wiki/Maximum_subarray_problem#Kadane's_algorithm) (LeetCode 53 Maximum Subarray). The key difference is that a negative number can flip a large product to a small one and vice versa. So we track both the **maximum** and **minimum** product ending at the current position.

At each step, we compute two candidate products **before** updating:

```
p1 = maxHere * nums[i]
p2 = minHere * nums[i]
```

Then:

```
maxHere = max(nums[i], p1, p2)
minHere = min(nums[i], p1, p2)
result  = max(result, maxHere)
```

Why track `minHere`? A very negative product times a negative number can become the new maximum.

```
nums:    [ 2,  3, -2,  4]
maxHere:   2   6  -2   4
minHere:   2   3 -12 -48
result:    2   6   6   6
```

Complexity: Time $O(n)$ — single pass, Space $O(1)$ — three variables.

### Java

```java []
public class MaxProductSubarray {
    /** solution 1, Kadane's algorithm. DP. O(N) time, O(1) space. */
    public int maxProduct(int[] nums) { // [2,3,-2,4]
        int maxEndingHere = 1, minEndingHere = 1, maxSoFar = Integer.MIN_VALUE, n = nums.length;
        for (int i = 0; i < n; i++) {
            // important, must not update maxEndingHere yet, calculate two products first
            int prod1 = maxEndingHere * nums[i], prod2 = minEndingHere * nums[i];
            maxEndingHere = Math.max(nums[i], Math.max(prod1, prod2));
            minEndingHere = Math.min(nums[i], Math.min(prod1, prod2));
            maxSoFar = Math.max(maxEndingHere, maxSoFar);
        }
        return maxSoFar;
    }
}
```

### Python

```python []
class Solution:
    def maxProduct(self, nums: list[int]) -> int:
        """O(n) time, O(1) space."""
        max_here, min_here = 1, 1
        res = -inf
        for n in nums:
            # important to calc two products before update
            p1, p2 = max_here * n, min_here * n
            max_here = max(n, p1, p2)
            min_here = min(n, p1, p2)
            res = max(max_here, res)
        return res
```

### C++

```cpp []
class Solution {
public:
    // Kadane's variant. O(n) time, O(1) space.
    int maxProduct(vector<int> &nums) {
        int maxHere = 1, minHere = 1, res = INT_MIN;
        for (int n: nums) {
            int p1 = maxHere * n, p2 = minHere * n; // compute before update
            maxHere = max({n, p1, p2});
            minHere = min({n, p1, p2});
            res = max(res, maxHere);
        }
        return res;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Kadane's variant. O(n) time, O(1) space.
    pub fn max_product(nums: Vec<i32>) -> i32 {
        let (mut max_here, mut min_here, mut res) = (1, 1, i32::MIN);
        for n in nums {
            let (p1, p2) = (max_here * n, min_here * n); // compute before update
            max_here = max(n, max(p1, p2));
            min_here = min(n, min(p1, p2));
            res = max(res, max_here);
        }
        res
    }
}
```
