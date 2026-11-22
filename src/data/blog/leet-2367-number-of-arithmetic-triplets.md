---
author: JZ
pubDatetime: 2026-11-22T19:47:46Z
modDatetime: 2026-11-22T19:47:46Z
title: LeetCode 2367 Number of Arithmetic Triplets
featured: true
tags:
  - a-array
  - a-hash
description: "Solutions for LeetCode 2367, easy, tags: array, hash table."
---

## Table of contents

## Description

Question Links: [LeetCode 2367](https://leetcode.com/problems/number-of-arithmetic-triplets/description/)

You are given a 0-indexed, strictly increasing integer array `nums` and a positive integer `diff`. Count the triplets of indices `(i, j, k)` where `i < j < k` and both gaps are equal to `diff`:

```text
nums[j] - nums[i] = diff
nums[k] - nums[j] = diff
```

Example 1:

```text
Input: nums = [0, 1, 4, 6, 7, 10], diff = 3
Output: 2
```

The value triplets are `(1, 4, 7)` and `(4, 7, 10)`.

Example 2:

```text
Input: nums = [4, 5, 6, 7, 8, 9], diff = 2
Output: 2
```

The value triplets are `(4, 6, 8)` and `(5, 7, 9)`.

**Constraints:**

- `3 <= nums.length <= 200`
- `0 <= nums[i] <= 200`
- `1 <= diff <= 50`
- `nums` is strictly increasing.

## Idea

For a starting value `x = nums[i]`, the other two values must be `x + diff` and `x + 2 * diff`. Put all values in a hash set, then scan `nums` once and count each value whose two successors are present.

In the first example, starting at `1` finds `4` and `7`, so it forms one triplet:

```text
value: 1 -- diff=3 --> 4 -- diff=3 --> 7
index: 1             2             4
```

Because `nums` is strictly increasing, every starting value represents one unique index. Each successful check therefore adds exactly one triplet.

Complexity: Time $O(n)$ expected, Space $O(n)$ for the set.

### Java

```java []
import java.util.HashSet;
import java.util.Set;

/** Hash-set solution for LeetCode 2367, Number of Arithmetic Triplets. */
public final class ArithmeticTriplets {

    private ArithmeticTriplets() {
    }

    /** Expected O(n) time and O(n) extra space for strictly increasing nums and positive diff. */
    public static int arithmeticTriplets(int[] nums, int diff) {
        Set<Integer> values = new HashSet<>();
        for (int num : nums) {
            values.add(num);
        }

        int count = 0;
        for (int num : nums) {
            if (values.contains(num + diff) && values.contains(num + 2 * diff)) {
                count++;
            }
        }
        return count;
    }
}
```

### Python

```python []
class Solution:
    def arithmeticTriplets(self, nums, diff):
        values = set(nums)  # O(n) space for average O(1) membership checks.
        count = 0
        for value in nums:  # O(n) expected time; each value is checked once.
            if value + diff in values and value + 2 * diff in values:
                count += 1
        return count
```

### C++

```cpp []
#pragma once
#include <unordered_set>
#include <vector>
using namespace std;

// LeetCode 2367. Expected O(n) time and O(n) extra space.
class Solution {
public:
    int arithmeticTriplets(vector<int>& nums, int diff) {
        unordered_set<int> values(nums.begin(), nums.end());
        int count = 0;
        for (int x : nums) {
            if (values.contains(x + diff) && values.contains(x + 2 * diff)) {
                ++count;
            }
        }
        return count;
    }
};
```

### Rust

```rust []
use std::collections::HashSet;

pub struct Solution;

impl Solution {
    // Expected O(n) time and O(n) space for constant-time membership checks.
    pub fn arithmetic_triplets(nums: Vec<i32>, diff: i32) -> i32 {
        let values: HashSet<i32> = nums.iter().copied().collect();
        nums.into_iter()
            .filter(|&x| values.contains(&(x + diff)) && values.contains(&(x + 2 * diff)))
            .count() as i32
    }
}
```
