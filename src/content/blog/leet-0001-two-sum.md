---
author: JZ
pubDatetime: 2024-12-04T06:23:00Z
modDatetime: 2024-12-04T06:23:00Z
title: LeetCode 1 LintCode 56 Two Sum
featured: true
tags:
  - a-array
  - a-hash
  - c-salesforce
description:
  "Solutions for  LeetCode 1 LintCode 56, easy, tags: array, hash table."
---

## Table of contents

## Description

Question Links: [LeetCode 1](https://leetcode.com/problems/two-sum/description/), [LintCode 56](https://www.lintcode.com/problem/56/)

Given an array of integers `nums` and an integer `target`, return _indices of the two numbers such that they add up to `target`_.

You may assume that each input would have **_exactly_ one solution**, and you may not use the _same_ element twice.

You can return the answer in any order.

```
Example 1:

Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].

Example 2:

Input: nums = [3,2,4], target = 6
Output: [1,2]

Example 3:

Input: nums = [3,3], target = 6
Output: [0,1]
```

**Constraints:**

-   `2 <= nums.length <= 10^4`
-   `-10^9 <= nums[i] <= 10^9`
-   `-10^9 <= target <= 10^9`
-   **Only one valid answer exists.**

**Follow-up:** Can you come up with an algorithm that is less than `O(n^2)`time complexity?

Hint 1

A really brute force way would be to search for all possible pairs of numbers but that would be too slow. Again, it's best to try out brute force solutions for just for completeness. It is from these brute force solutions that you can come up with optimizations.

Hint 2

So, if we fix one of the numbers, say `x`, we have to scan the entire array to find the next number `y` which is `value - x` where value is the input parameter. Can we change our array somehow so that this search becomes faster?

Hint 3

The second train of thought is, without changing the array, can we use additional space somehow? Like maybe a hash map to speed up the search?

## Idea

1. We could iterate through the array and remember the indices for the elements in a hashmap.
2. For each element, we look for the number that can sum to the target. If such pair is found, we return the pair of indices.

Complexity: Time $O(n)$, Space $O(n)$.

### Rust

```rust
use std::collections::HashMap;


impl Solution {
    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {
        let mut val_id = HashMap::new();
        for (i, v) in nums.iter().enumerate() {
            match val_id.get(&(target - v)) {
                Some(i1) => return vec![*i1 as i32, i as i32],
                None => val_id.insert(v, i),
            };
        }
        unreachable!("should have found a pair");
    }
}
```

### Python

```python
class Solution:
    """3ms, 19.13mb"""

    def twoSum(self, nums: List[int], target: int) -> List[int]:
        val_ind = dict()
        for i, n in enumerate(nums):
            v = target - n
            if v in val_ind:
                return [val_ind[v], i]
            else:
                val_ind[n] = i
```

## Variation 1

One variation is to print out the value for all such pairs.

## Idea

1. We could remember the count of the element values in the hashmap.
2. As we iterate, we look for the number that could sum to the target. If such an element value is found, we print out the pairs repeating with the count of the found element value

Complexity: Time $O(n)$, Space $O(n)$.

### Rust

```rust
pub fn two_sum_print(nums: Vec<i32>, target: i32) {
    let mut cnt = HashMap::new();
    for v in nums.iter() {
        let look = target - v;
        if let Some(c) = cnt.get(&look) {
            for _ in 0..*c { println!("{v} {look}") };
        }
        *cnt.entry(v).or_insert(0) += 1;
    }
}
```

Unit Test

```rust
#[test]
fn test_two_sum_print() {
    let v = vec![-2, -2, 2, -2, -2, 2, 3]; // 8 pairs
    Solution::two_sum_print(v, 0);
}
```

```shell
# should print out all 8 pairs
2 -2
2 -2
-2 2
-2 2
2 -2
2 -2
2 -2
2 -2
```

### Python

```python
def two_sum_print(nums, target):
    cnt = defaultdict(int)
    for n in nums:
        look = target - n
        if look in cnt:
            for i in range(cnt[look]): print(look, n)
        cnt[n] += 1
```
