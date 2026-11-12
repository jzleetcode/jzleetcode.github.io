---
author: JZ
pubDatetime: 2026-11-01T11:31:31Z
modDatetime: 2026-11-01T11:31:31Z
title: LeetCode 1013 Partition Array Into Three Parts With Equal Sum
featured: false
tags:
  - a-array
  - a-greedy
  - a-prefix-sum
description: "Solutions for LeetCode 1013, easy, tags: array, greedy, prefix sum."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question Link: [LeetCode 1013](https://leetcode.com/problems/partition-array-into-three-parts-with-equal-sum/description/)

Given an integer array `arr`, return `true` when it can be split into three **non-empty**, contiguous parts whose sums are equal. Otherwise, return `false`.

```text
Example 1:
Input: arr = [0,2,1,-6,6,-7,9,1,2,0,1]
Output: true
Explanation: [0,2,1,-6,6], [-7,9,1], [2,0,1] each sum to 3.

Example 2:
Input: arr = [0,2,1,-6,6,7,9,-1,2,0,1]
Output: false

Example 3:
Input: arr = [3,3,6,5,-2,2,5,1,-9,4]
Output: true
```

Constraints:

- `3 <= arr.length <= 5 * 10^4`
- `-10^4 <= arr[i] <= 10^4`

## Idea

The total must be divisible by three. Let `target = total / 3`. Scan from left to right and accumulate a running sum. Whenever it reaches `target`, start the next part. If the first two parts are found before the last element, the untouched suffix is a non-empty third part and has sum `target` because the whole array sums to `3 * target`.

The key detail is reserving the final element for that third part. This also handles a target of zero: extra zero-sum pieces are harmless because the first two can be merged with adjacent zero-sum pieces while keeping three non-empty parts.

```text
[0, 2, 1, -6, 6 | -7, 9, 1 | 2, 0, 1]
        sum = 3       sum = 3      remaining sum = 3
```

Complexity: Time `O(n)` and extra space `O(1)`.

### Java

```java []
package array;

public final class PartitionArrayIntoThreePartsWithEqualSum {
    private PartitionArrayIntoThreePartsWithEqualSum() {}

    // O(n) time and O(1) extra space.
    public static boolean canThreePartsEqualSum(int[] arr) {
        int total = 0;
        for (int value : arr) total += value;
        if (total % 3 != 0) return false;

        int target = total / 3;
        int sum = 0;
        int parts = 0;
        // Leave at least one element for the third part.
        for (int i = 0; i < arr.length - 1; i++) {
            sum += arr[i];
            if (sum == target) {
                parts++;
                if (parts == 2) return true;
                sum = 0;
            }
        }
        return false;
    }
}
```

### Python

```python []
"""LeetCode 1013 Partition Array Into Three Parts With Equal Sum."""


class Solution:
    def canThreePartsEqualSum(self, arr: list[int]) -> bool:
        total = sum(arr)
        if total % 3:
            return False

        target = total // 3
        current_sum = 0
        parts_found = 0
        # One pass: O(n) time and O(1) extra space.
        for value in arr:
            current_sum += value
            if current_sum == target:
                parts_found += 1
                current_sum = 0

        return parts_found >= 3
```

### C++

```cpp []
#pragma once

#include <numeric>
#include <vector>

using namespace std;

class Solution {
public:
    bool canThreePartsEqualSum(vector<int>& arr) {
        // Two linear passes take O(n) time and O(1) extra space.
        const int total = accumulate(arr.begin(), arr.end(), 0);
        if (total % 3 != 0) return false;

        const int target = total / 3;
        int sum = 0;
        int parts = 0;
        // Leave at least one element for the third nonempty partition.
        for (size_t i = 0; i + 1 < arr.size(); ++i) {
            sum += arr[i];
            if (sum == target) {
                ++parts;
                if (parts == 2) return true;
                sum = 0;
            }
        }
        return false;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn can_three_parts_equal_sum(arr: Vec<i32>) -> bool {
        let total: i32 = arr.iter().sum();
        if total % 3 != 0 {
            return false;
        }

        let target = total / 3;
        let mut part_sum = 0;
        let mut parts = 0;

        // Two linear passes take O(n) time and O(1) extra space.
        // Reserve the last element so the remaining third part is nonempty.
        for &value in arr.iter().take(arr.len() - 1) {
            part_sum += value;
            if part_sum == target {
                parts += 1;
                part_sum = 0;
                if parts == 2 {
                    return true;
                }
            }
        }

        false
    }
}
```
