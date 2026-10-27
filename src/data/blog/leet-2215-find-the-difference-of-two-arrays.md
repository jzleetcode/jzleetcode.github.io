---
author: JZ
pubDatetime: 2026-10-27T19:01:37Z
modDatetime: 2026-10-27T19:01:37Z
title: LeetCode 2215 Find the Difference of Two Arrays
featured: true
tags:
  - a-array
  - a-hash
description: "Solution for LeetCode 2215, easy, tags: array, hash table."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 2215: Find the Difference of Two Arrays](https://leetcode.com/problems/find-the-difference-of-two-arrays/description/)

Given two integer arrays `nums1` and `nums2`, return two lists. The first contains each **distinct** value in `nums1` that does not appear in `nums2`; the second contains each distinct value in `nums2` that does not appear in `nums1`. Values in either list can be in any order.

```text
nums1 = [1, 2, 3],    nums2 = [2, 4, 6]    -> [[1, 3], [4, 6]]
nums1 = [1, 2, 3, 3], nums2 = [1, 1, 2, 2] -> [[3], []]
```

**Constraints:**

- `1 <= nums1.length, nums2.length <= 1000`
- `-1000 <= nums1[i], nums2[i] <= 1000`

## Idea

Create a hash set from each array. This removes duplicates and provides expected constant-time membership checks. Collect values in the first set but not the second for `answer[0]`; collect values in the second set but not the first for `answer[1]`.

```text
nums1: [1, 2, 3, 3]  ->  first:  {1, 2, 3}
nums2: [1, 1, 2, 2] ->  second: {1, 2}

first  minus second: {3} -> answer[0] = [3]
second minus first:  {}  -> answer[1] = []
```

Every output value belongs to its own input set and not the other set, and every qualifying input value appears in that set exactly once. Those two observations establish both correctness and distinctness. A second sorting-based solution would do more work without improving this approach.

## Complexity

Let $n$ and $m$ be the lengths of `nums1` and `nums2`. Building the sets and scanning their values takes **expected $O(n + m)$ time**. The sets and two returned lists use **$O(n + m)$ space**. The hash-based time bound is expected/amortized, not a worst-case guarantee for hash collisions.

### Java

```java []
package hash;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** LeetCode 2215. Find the distinct values present in only one of two arrays. */
public final class FindTheDifferenceOfTwoArrays {

    private FindTheDifferenceOfTwoArrays() {
    }

    /** O(n + m) time and O(n + m) space. */
    public static List<List<Integer>> findDifference(int[] nums1, int[] nums2) {
        Set<Integer> first = new HashSet<>();
        Set<Integer> second = new HashSet<>();
        for (int num : nums1) {
            first.add(num);
        }
        for (int num : nums2) {
            second.add(num);
        }

        List<Integer> onlyFirst = new ArrayList<>();
        for (int num : first) {
            if (!second.contains(num)) {
                onlyFirst.add(num);
            }
        }
        List<Integer> onlySecond = new ArrayList<>();
        for (int num : second) {
            if (!first.contains(num)) {
                onlySecond.add(num);
            }
        }
        return List.of(onlyFirst, onlySecond);
    }
}
```

This repository uses a static utility method. For LeetCode, move `findDifference` into `class Solution` as an instance method.

### Python

```python []
"""LeetCode 2215, Find the Difference of Two Arrays."""


class Solution:
    def findDifference(self, nums1: list[int], nums2: list[int]) -> list[list[int]]:
        """Return distinct exclusive values in O(n + m) time and space."""
        first_values = set(nums1)
        second_values = set(nums2)
        return [list(first_values - second_values), list(second_values - first_values)]
```

Python's set subtraction computes each difference directly. The problem allows any order, so there is no need to sort the returned lists.

### C++

```cpp []
#ifndef LEETCODE_FINDDIFFERENCEOFTWOARRAYS_HPP
#define LEETCODE_FINDDIFFERENCEOFTWOARRAYS_HPP

#include <unordered_set>
#include <vector>

class Solution2215 {
public:
    std::vector<std::vector<int>> findDifference(const std::vector<int>& nums1,
                                                  const std::vector<int>& nums2) {
        const std::unordered_set<int> first(nums1.begin(), nums1.end());
        const std::unordered_set<int> second(nums2.begin(), nums2.end());
        std::vector<std::vector<int>> result(2);

        for (int value : first) {
            if (!second.contains(value)) {
                result[0].push_back(value);
            }
        }
        for (int value : second) {
            if (!first.contains(value)) {
                result[1].push_back(value);
            }
        }

        return result;
    }
};

#endif // LEETCODE_FINDDIFFERENCEOFTWOARRAYS_HPP
```

The repository names the class `Solution2215` to avoid collisions in its shared test binary; rename it to `Solution` for a standalone LeetCode submission.

### Rust

```rust []
use std::collections::HashSet;

pub struct Solution;

impl Solution {
    pub fn find_difference(nums1: Vec<i32>, nums2: Vec<i32>) -> Vec<Vec<i32>> {
        let first: HashSet<i32> = nums1.into_iter().collect();
        let second: HashSet<i32> = nums2.into_iter().collect();

        vec![
            first.difference(&second).copied().collect(),
            second.difference(&first).copied().collect(),
        ]
    }
}
```

Rust's `HashSet::difference` iterates values belonging to one set but not the other; `copied()` converts borrowed integers into the returned vectors.
