---
author: JZ
pubDatetime: 2026-11-26T19:39:20Z
modDatetime: 2026-11-26T19:39:20Z
title: LeetCode 136 Single Number
featured: true
tags:
  - a-bit
  - a-hash
description: "Solutions for LeetCode 136, easy, tags: array, bit manipulation, hash table."
---

## Table of contents

## Description

Given a non-empty array of integers `nums`, every element appears twice except for one. Find that single element.

```text
Example 1:
Input: nums = [2,2,1]
Output: 1

Example 2:
Input: nums = [4,1,2,1,2]
Output: 4

Example 3:
Input: nums = [1]
Output: 1
```

### Constraints

- `1 <= nums.length <= 3 * 10^4`
- `-3 * 10^4 <= nums[i] <= 3 * 10^4`
- Every element appears twice except for one element, which appears once.

Link: [LeetCode 136](https://leetcode.com/problems/single-number/description/)

## Idea 1: XOR cancellation

XOR has two useful properties: `x ^ x = 0` and `x ^ 0 = x`. Since XOR is associative and commutative, we can combine the values in any order. Every pair cancels, leaving the value that occurs once.

```text
nums:   [4, 1, 2, 1, 2]
XOR:     4 ^ 1 ^ 2 ^ 1 ^ 2
pairs:   4 ^ (1 ^ 1) ^ (2 ^ 2)
result:  4
```

Complexity: Time $O(n)$, extra space $O(1)$.

### Java

```java []
public final class SingleNumber {

    private SingleNumber() {
    }

    // O(n) time and O(1) extra space. Each pair cancels out under XOR.
    public static int singleNumberXor(int[] nums) {
        int single = 0;
        for (int num : nums) {
            single ^= num;
        }
        return single;
    }
}
```

### Python

```python []
class Solution:
    def singleNumber(self, nums: list[int]) -> int:
        """XOR cancels each paired value. Time O(n), extra space O(1)."""
        result = 0
        for value in nums:
            result ^= value
        return result
```

### C++

```cpp []
#include <vector>

class Solution136 {
public:
    // XOR cancels each pair. O(n) time and O(1) extra space.
    int singleNumber(const std::vector<int>& nums) {
        int result = 0;
        for (int num : nums) {
            result ^= num;
        }
        return result;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// O(n) time and O(1) extra space. Equal values cancel under XOR.
    pub fn single_number_xor(nums: Vec<i32>) -> i32 {
        nums.into_iter().fold(0, |single, num| single ^ num)
    }
}
```

## Idea 2: Toggle values in a hash set

Keep a set of values that have appeared an odd number of times so far. When a value appears for the first time, add it. When it appears again, remove it. Once all pairs have been processed, the set contains only the single value.

```text
read 2  -> {2}
read 2  -> {}
read 1  -> {1}
```

Hash set operations take expected $O(1)$ time, so the total time is $O(n)$. The set can hold up to $O(n)$ values, so extra space is $O(n)$.

### Java

```java []
import java.util.HashSet;
import java.util.Set;

public final class SingleNumber {
    private SingleNumber() {
    }

    // O(n) expected time and O(n) extra space. A second occurrence removes the pair.
    public static int singleNumberHashSet(int[] nums) {
        Set<Integer> unpaired = new HashSet<>();
        for (int num : nums) {
            if (!unpaired.add(num)) {
                unpaired.remove(num);
            }
        }
        return unpaired.iterator().next();
    }
}
```

### Python

```python []
class Solution2:
    def singleNumber(self, nums: list[int]) -> int:
        """Toggle values in a set. Expected time O(n), extra space O(n)."""
        seen = set()
        for value in nums:
            if value in seen:
                seen.remove(value)
            else:
                seen.add(value)
        return next(iter(seen))
```

### C++

```cpp []
#include <unordered_set>
#include <vector>

class Solution136 {
public:
    // Remove each value on its second occurrence. O(n) expected time and O(n) extra space.
    int singleNumberHashSet(const std::vector<int>& nums) {
        std::unordered_set<int> unpaired;
        for (int num : nums) {
            const auto [it, inserted] = unpaired.insert(num);
            if (!inserted) {
                unpaired.erase(it);
            }
        }
        return *unpaired.begin();
    }
};
```

### Rust

```rust []
use std::collections::HashSet;

pub struct Solution;

impl Solution {
    /// Expected O(n) time and O(n) extra space.
    pub fn single_number_hash_set(nums: Vec<i32>) -> i32 {
        let mut unpaired = HashSet::new();
        for num in nums {
            if !unpaired.insert(num) {
                unpaired.remove(&num);
            }
        }
        unpaired.into_iter().next().expect("one unpaired number")
    }
}
```
