---
author: JZ
pubDatetime: 2026-10-07T19:11:05Z
modDatetime: 2026-10-07T19:11:05Z
title: LeetCode 1827 Minimum Operations to Make the Array Increasing
featured: true
tags:
  - a-array
  - a-greedy
description: "Solution for LeetCode 1827, easy, tags: array, greedy. One pass in Java, Python, C++, and Rust."
---

## Table of contents

## Description

For readers practicing greedy algorithms, this explanation shows why one left-to-right pass solves [LeetCode 1827: Minimum Operations to Make the Array Increasing](https://leetcode.com/problems/minimum-operations-to-make-the-array-increasing/) and implements it in Java, Python, C++, and Rust.

You receive an integer array `nums`. One operation increments one element by `1`. Return the minimum number of operations needed to make the array **strictly increasing**: every element must be greater than its predecessor. You may not reorder elements or decrement them. An array with one element is already strictly increasing.

**Example 1:** `nums = [1,1,1]` gives **3**. Increment the second element once and the third element twice to obtain `[1,2,3]`.

**Example 2:** `nums = [1,5,2,4,1]` gives **14**. The smallest feasible resulting array is `[1,5,6,7,8]`.

**Example 3:** `nums = [8]` gives **0**.

**Constraints:**

- `1 <= nums.length <= 5000`
- `1 <= nums[i] <= 10^4`

## Idea

### Greedy: keep each value as small as possible

Leave the first value unchanged. Making it larger would cost extra operations and only make the requirements for later values harder to satisfy.

For every remaining value, track `previous`, the **adjusted** value chosen for its predecessor. The current value must be at least its original value, because decrements are forbidden, and at least `previous + 1`, because the array must increase strictly.

Choose `adjusted = max(nums[index], previous + 1)`. Add `adjusted - nums[index]` to the total, then set `previous = adjusted`.

Keep this adjusted value in a variable rather than changing the array. All four implementations preserve their inputs. Rust borrows a slice, so callers can keep using their vectors afterward.

```text
Input: [1, 5, 2, 4, 1]

Index   Original   Previous   Adjusted   Added   Total
  0         1          -          1         0       0
  1         5          1          5         0       0
  2         2          5          6         4       4
  3         4          6          7         3       7
  4         1          7          8         7      14

Smallest feasible result: [1, 5, 6, 7, 8]
```

### Why this is optimal

Consider any valid final array. Its first value cannot be smaller than the original first value, which is exactly what the greedy algorithm chooses.

Suppose its previous value is at least the greedy previous value. Its current value must be greater than that previous value and cannot be smaller than the original current value. It is therefore at least `max(original, greedy_previous + 1)`, exactly the greedy choice.

This argument applies to every index. The greedy result is no larger at any position than any valid result, so its sum of increments is minimal. Choosing a larger value early cannot reduce the cost later.

### Common pitfalls and boundary cases

- **Strictly increasing is not nondecreasing.** Equal adjacent values need an increment; use `previous + 1`, not `previous`.
- **Carry adjustments forward.** With `[1,1,1]`, the third element must exceed the adjusted second element `2`, not the original `1`.
- **A larger original value resets the threshold.** With `[3,1,10,1]`, choose `[3,4,10,11]` for `13` operations.
- **Do not sort.** Sorting changes the order, which the operation does not allow.
- **Count increments directly.** Simulating one operation at a time makes runtime depend on the answer rather than just the array length.
- **The input limit does not cap adjusted values.** Two input values of `10000` become `[10000,10001]`.

### Complexity and integer width

Complexity: Time $O(n)$, Space $O(1)$ auxiliary, where `n` is the array length. Each element needs constant work, and the algorithm stores only the previous adjusted value and the running operation count. Rust's slice is a borrowed view, not a copy of the input.

At the maximum input length, every adjusted value is at most `10000 + 4999 = 14999`. Each of the `4999` adjustable positions needs at most `14998` increments, so even this loose upper bound is less than `75 million`. A signed 32-bit result is sufficient under the stated constraints. The tests also cover `[10000]` followed by `4999` ones, whose answer is `62482501`.

Only one solution is shown: the greedy pass is optimal and avoids unnecessary data structures. All implementations use the code committed and pushed to their respective repositories, including the enclosing classes, imports, and namespace where required.

### Java

[Committed implementation](https://github.com/JesseZhuang/algorithm-java/blob/85cacdfd105cc755732b2d99b909b21e6e163463/src/main/java/array/MinimumOperationsToMakeArrayIncreasing.java)

```java []
package array;

/**
 * LeetCode 1827, easy, tags: array, greedy.
 * <p>
 * Return the minimum number of increments needed to make nums strictly increasing.
 * The input array is not modified.
 * <p>
 * Constraints: 1 <= nums.length <= 5000, 1 <= nums[index] <= 10000.
 * The result fits in an int.
 */
public final class MinimumOperationsToMakeArrayIncreasing {

    private MinimumOperationsToMakeArrayIncreasing() {
    }

    /** Greedy single pass. O(n) time, O(1) extra space. */
    public static int minOperations(int[] nums) {
        int previous = nums[0];
        int operations = 0;
        for (int index = 1; index < nums.length; index++) {
            int original = nums[index];
            int adjusted = Math.max(original, previous + 1);
            operations += adjusted - original;
            previous = adjusted;
        }
        return operations;
    }
}
```

### Python

[Committed implementation](https://github.com/JesseZhuang/InCodeLearning-Python3/blob/42ab500555f473fc13d421e7205dc4b1df97b611/algorithm/jzarray/minimum_operations_to_make_array_increasing.py)

```python []
"""LeetCode 1827, easy. Tags: array, greedy."""


class Solution:
    """Keep the smallest feasible value at each index. O(n) time, O(1) space."""

    def minOperations(self, nums: list[int]) -> int:
        operations = 0
        previous = nums[0]

        for index in range(1, len(nums)):  # O(n) total, O(1) work per element.
            adjusted = max(nums[index], previous + 1)
            operations += adjusted - nums[index]
            previous = adjusted

        return operations
```

### C++

[Committed implementation](https://github.com/JesseZhuang/CSAPP/blob/2df7b791c4365d1f41b125ad422bf7dd0c5c8bdd/leetcode/src/array/MinimumOperationsToMakeArrayIncreasing.hpp)

```cpp []
#ifndef LEETCODE_MINIMUMOPERATIONSTOMAKEARRAYINCREASING_HPP
#define LEETCODE_MINIMUMOPERATIONSTOMAKEARRAYINCREASING_HPP

#include <algorithm>
#include <cstddef>
#include <vector>

namespace MinimumOperationsToMakeArrayIncreasing {

class Solution {
public:
    // Greedy pass: O(n) time, O(1) extra space.
    int minOperations(const std::vector<int>& nums) {
        int previous = nums[0];
        int operations = 0;
        for (std::size_t index = 1; index < nums.size(); ++index) {
            const int original = nums[index];
            const int adjusted = std::max(original, previous + 1);
            operations += adjusted - original;
            previous = adjusted;
        }
        return operations;
    }
};

}

#endif
```

### Rust

[Committed implementation](https://github.com/JesseZhuang/in_code_learning_rust/blob/f6c5daa7feb2c3e11f74678fb5fda7b8ba3d9290/crates/leet/src/array/minimum_operations_to_make_array_increasing.rs)

```rust []
pub struct Solution;

impl Solution {
    /// O(n) time and O(1) auxiliary space.
    pub fn min_operations(nums: &[i32]) -> i32 {
        let mut previous = nums[0];
        let mut operations = 0;

        for &original in &nums[1..] {
            let adjusted = original.max(previous + 1);
            operations += adjusted - original;
            previous = adjusted;
        }

        operations
    }
}
```
