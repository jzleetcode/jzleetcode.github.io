---
author: JZ
pubDatetime: 2026-11-07T19:48:07Z
modDatetime: 2026-11-07T19:48:07Z
title: LeetCode 1748 Sum of Unique Elements
featured: true
tags:
  - a-array
  - a-hash-table
  - a-sorting
description: "Use a bounded frequency table in O(n) time, or sort and scan duplicate groups in O(n log n) time."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Solution 1: Bounded Frequency Array](#solution-1-bounded-frequency-array)
- [Solution 2: Sort and Scan Groups](#solution-2-sort-and-scan-groups)
- [Complexity](#complexity)

## Description

Question link: [LeetCode 1748: Sum of Unique Elements](https://leetcode.com/problems/sum-of-unique-elements/description/)

Given an integer array `nums`, return the sum of all values that appear exactly once.

**Example 1:**

```text
Input: nums = [1, 2, 3, 2]
Output: 4
Explanation: 1 and 3 each appear once, so the sum is 1 + 3 = 4.
```

**Example 2:**

```text
Input: nums = [1, 1, 1, 1, 1]
Output: 0
```

**Example 3:**

```text
Input: nums = [1, 2, 3, 4, 5]
Output: 15
```

**Constraints:**

- `1 <= nums.length <= 100`
- `1 <= nums[i] <= 100`

## Idea

A value contributes to the answer only when its frequency is exactly one. Count the values, then add the ones with frequency one.

For Example 1:

| Value        |   1 |   2 |   3 |
| :----------- | --: | --: | --: |
| Frequency    |   1 |   2 |   1 |
| Contribution |   1 |   0 |   3 |

The answer is `1 + 3 = 4`.

## Solution 1: Bounded Frequency Array

The constraints limit every value to `1..=100`. A frequency array can count each number directly by using the number as its index. After counting, scan values 1 through 100 and add a value only if its count is one. Index 0 is unused.

### Java

```java []
public static int sumOfUnique(int[] nums) {
    int[] frequencies = new int[101];
    for (int num : nums) {
        frequencies[num]++;
    }

    int sum = 0;
    for (int value = 1; value < frequencies.length; value++) {
        if (frequencies[value] == 1) {
            sum += value;
        }
    }
    return sum;
}
```

### Python

```python []
class Solution:
    def sumOfUnique(self, nums):
        frequencies = [0] * 101
        for number in nums:
            frequencies[number] += 1

        total = 0
        for value, frequency in enumerate(frequencies):
            if frequency == 1:
                total += value
        return total
```

### C++

```cpp []
#include <array>
#include <vector>

using namespace std;

class Solution {
public:
    int sumOfUnique(const vector<int>& nums) {
        array<int, 101> frequency{};
        for (int value : nums) {
            ++frequency[value];
        }

        int sum = 0;
        for (int value = 1; value <= 100; ++value) {
            if (frequency[value] == 1) {
                sum += value;
            }
        }
        return sum;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn sum_of_unique(nums: Vec<i32>) -> i32 {
        let mut frequency = [0; 101];
        for value in nums {
            frequency[value as usize] += 1;
        }

        frequency
            .iter()
            .enumerate()
            .filter(|&(_, &count)| count == 1)
            .map(|(value, _)| value as i32)
            .sum()
    }
}
```

## Solution 2: Sort and Scan Groups

Sorting gives each value one contiguous group. Scan each group and add its value only when the group has length one. Java, Python, and C++ sort a copy to keep the caller's input unchanged. Rust takes ownership of a `Vec` and sorts it in place.

### Java

```java []
import java.util.Arrays;

public static int sumOfUniqueBySorting(int[] nums) {
    int[] sorted = Arrays.copyOf(nums, nums.length);
    Arrays.sort(sorted);

    int sum = 0;
    for (int index = 0; index < sorted.length; ) {
        int end = index + 1;
        while (end < sorted.length && sorted[end] == sorted[index]) {
            end++;
        }
        if (end - index == 1) {
            sum += sorted[index];
        }
        index = end;
    }
    return sum;
}
```

### Python

```python []
class Solution:
    def sumOfUniqueBySorting(self, nums):
        ordered = sorted(nums)
        total = 0
        start = 0

        while start < len(ordered):
            end = start + 1
            while end < len(ordered) and ordered[end] == ordered[start]:
                end += 1
            if end - start == 1:
                total += ordered[start]
            start = end

        return total
```

### C++

```cpp []
#include <algorithm>
#include <vector>

using namespace std;

class Solution {
public:
    int sumOfUniqueBySorting(const vector<int>& nums) {
        vector<int> sorted = nums;
        sort(sorted.begin(), sorted.end());

        int sum = 0;
        for (size_t start = 0; start < sorted.size();) {
            size_t end = start + 1;
            while (end < sorted.size() && sorted[end] == sorted[start]) {
                ++end;
            }
            if (end == start + 1) {
                sum += sorted[start];
            }
            start = end;
        }
        return sum;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn sum_of_unique_by_sorting(mut nums: Vec<i32>) -> i32 {
        nums.sort_unstable();

        let mut sum = 0;
        let mut index = 0;
        while index < nums.len() {
            let value = nums[index];
            let mut next = index + 1;
            while next < nums.len() && nums[next] == value {
                next += 1;
            }

            if next == index + 1 {
                sum += value;
            }
            index = next;
        }

        sum
    }
}
```

## Complexity

Let `n` be the array length and `U = 100` be the number of possible values.

- **Bounded frequency array:** counting takes $O(n)$ time, and scanning the fixed range takes $O(U)$ time. Total time is $O(n + U) = O(n)$ under the constraints. The frequency array uses $O(U)$ space, which is $O(1)$ for this fixed range.
- **Sort and scan:** sorting takes $O(n \log n)$ time, and scanning all groups takes $O(n)$ time. Java, Python, and C++ use $O(n)$ space for their sorted copy. Rust sorts its owned vector in place and uses $O(\log n)$ auxiliary space for the sorting stack.
