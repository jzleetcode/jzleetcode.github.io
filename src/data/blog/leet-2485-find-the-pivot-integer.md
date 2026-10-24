---
author: JZ
pubDatetime: 2026-10-24T18:47:33Z
modDatetime: 2026-10-24T18:47:33Z
title: LeetCode 2485 Find the Pivot Integer
featured: true
tags:
  - a-math
  - a-prefix-sum
description: "Solutions for LeetCode 2485, easy, tags: math, prefix sum."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question Link: [LeetCode 2485](https://leetcode.com/problems/find-the-pivot-integer/description/)

Given a positive integer `n`, find an integer `x` such that the sum of the integers from `1` to `x` equals the sum of the integers from `x` to `n`. Both sums **include** `x`. Return `x` if it exists; otherwise return `-1`.

```text
Example 1:
Input: n = 8
Output: 6
Explanation: 1 + 2 + 3 + 4 + 5 + 6 = 6 + 7 + 8 = 21.

Example 2:
Input: n = 1
Output: 1

Example 3:
Input: n = 4
Output: -1

Constraints:
1 <= n <= 1000
```

## Idea

### Solution 1: Perfect Square

Let `total = n * (n + 1) / 2`. For a candidate `x`, the left sum is `x * (x + 1) / 2`, while the right sum is `total - x * (x - 1) / 2`. Setting them equal and simplifying gives `x * x = total`.

Therefore, the answer is the integer square root of `total` **only if its square equals `total`**; otherwise there is no pivot. For `n = 8`, `total = 36`, so the pivot is `6`. For `n = 4`, `total = 10` is not a perfect square.

Complexity: Time `O(1)` and extra space `O(1)` for the bounded integer inputs in this problem.

### Solution 2: Running Prefix and Suffix Sums

Start with `prefix = 0` and `suffix = total`. Visit each possible pivot in order, adding it to `prefix`. At that point, `suffix` still includes the pivot, so compare the two sums **before** subtracting the pivot from `suffix` for the next iteration. In Python, the same suffix sum is calculated directly as `total - prefix + pivot`.

```text
n = 8, pivot = 6
prefix: 1 + 2 + 3 + 4 + 5 + 6 = 21
suffix:                     6 + 7 + 8 = 21
```

Complexity: Time `O(n)` and extra space `O(1)`.

### Java

```java []
package math;

/**
 * LeetCode 2485, easy, tags: math, prefix sum.
 */
public final class FindThePivotInteger {
    private FindThePivotInteger() {}

    /** O(1) time and O(1) space: the pivot squared equals the sum from 1 to n. */
    public static int pivotInteger(int n) {
        long total = (long) n * (n + 1) / 2;
        int pivot = (int) Math.sqrt(total);
        return (long) pivot * pivot == total ? pivot : -1;
    }

    /** O(n) time and O(1) space: compare running left and right sums. */
    public static int pivotIntegerPrefixSum(int n) {
        int left = 0;
        int right = n * (n + 1) / 2;
        // O(n) time, O(1) space.
        for (int pivot = 1; pivot <= n; pivot++) {
            left += pivot;
            if (left == right) return pivot;
            right -= pivot;
        }
        return -1;
    }
}
```

### Python

```python []
"""LeetCode 2485 Find the Pivot Integer."""

from math import isqrt


class Solution:
    def pivotInteger(self, n: int) -> int:
        """Check whether the total sum is a perfect square. O(1) time and space."""
        total = n * (n + 1) // 2
        candidate = isqrt(total)
        return candidate if candidate * candidate == total else -1

    def pivotIntegerPrefixSum(self, n: int) -> int:
        """Compare inclusive sums on both sides. O(n) time, O(1) space."""
        total = n * (n + 1) // 2
        prefix = 0
        for candidate in range(1, n + 1):  # O(n) candidates, O(1) work each
            prefix += candidate
            suffix = total - prefix + candidate
            if prefix == suffix:
                return candidate
        return -1
```

### C++

```cpp []
#ifndef LEETCODE_FINDTHEPIVOTINTEGER_HPP
#define LEETCODE_FINDTHEPIVOTINTEGER_HPP

#include <cmath>

class Solution {
public:
    // O(1) time, O(1) space: the pivot squared equals the total sum.
    int pivotInteger(int n) {
        long long total = 1LL * n * (n + 1LL) / 2;
        long long pivot = static_cast<long long>(std::sqrt(total));
        return pivot * pivot == total ? static_cast<int>(pivot) : -1;
    }

    // O(n) time, O(1) space: track the sums on both sides of each pivot.
    int pivotIntegerPrefixSum(int n) {
        long long prefix = 0;
        long long suffix = 1LL * n * (n + 1LL) / 2;
        for (int value = 1; value <= n; ++value) { // O(n) iterations
            prefix += value;
            if (prefix == suffix) return value;
            suffix -= value;
        }
        return -1;
    }
};

#endif
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// O(1) time and space: the pivot's prefix sum equals the total suffix sum.
    pub fn pivot_integer(n: i32) -> i32 {
        if n < 1 {
            return -1;
        }

        let n = i64::from(n);
        let total = n * (n + 1) / 2;
        let pivot = (total as f64).sqrt().round() as i64;
        if pivot * pivot == total {
            pivot as i32
        } else {
            -1
        }
    }

    /// O(n) time and O(1) space with running prefix and suffix sums.
    pub fn pivot_integer_prefix_sum(n: i32) -> i32 {
        let n = i64::from(n);
        let mut prefix = 0;
        let mut suffix = n * (n + 1) / 2;

        // O(n) iterations; each pivot advances both sums in constant time.
        for pivot in 1..=n {
            prefix += pivot;
            if prefix == suffix {
                return pivot as i32;
            }
            suffix -= pivot;
        }
        -1
    }
}
```
