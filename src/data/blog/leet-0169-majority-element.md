---
author: JZ
pubDatetime: 2026-08-17T10:36:00Z
modDatetime: 2026-08-17T10:36:00Z
title: LeetCode 169 Majority Element
featured: false
tags:
  - a-array
description:
  "Solutions for LeetCode 169, easy, tags: array, hash table, divide and conquer, sorting, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 169](https://leetcode.com/problems/majority-element/description/)

Given an array `nums` of size `n`, return the majority element.

The majority element is the element that appears more than `⌊n / 2⌋` times. You may assume that the majority element always exists in the array.

```
Example 1:

Input: nums = [3,2,3]
Output: 3

Example 2:

Input: nums = [2,2,1,1,1,2,2]
Output: 2

Constraints:

n == nums.length
1 <= n <= 5 * 10^4
-10^9 <= nums[i] <= 10^9
```

**Follow-up:** Could you solve the problem in linear time and in `O(1)` space?

## Solution 1: Boyer-Moore Voting

### Idea

The Boyer-Moore Voting algorithm finds the majority element in a single pass using constant extra space. The intuition is: if we cancel out each occurrence of the majority element with a different element, the majority element still survives because it appears more than `n/2` times.

We maintain a `candidate` and a `count`. When `count` drops to zero, we pick the current element as the new candidate. If the next element matches the candidate, increment count; otherwise decrement it.

```
nums = [2, 2, 1, 1, 1, 2, 2]

Step 1: count=0 → candidate=2, count=1
Step 2: num=2=candidate → count=2
Step 3: num=1≠candidate → count=1
Step 4: num=1≠candidate → count=0
Step 5: count=0 → candidate=1, count=1
Step 6: num=2≠candidate → count=0
Step 7: count=0 → candidate=2, count=1

Result: 2 ✓
```

Complexity: Time $O(n)$ — single pass, Space $O(1)$.

#### Java

```java []
// Boyer-Moore Voting: O(n) time, O(1) space
public int majorityElementBMVoting2(int[] nums) {
    int count = 0;
    Integer candidate = null;
    for (int num : nums) { // O(n)
        if (count == 0) candidate = num;
        count += (num == candidate) ? 1 : -1;
    }
    return candidate;
}
```

#### Python

```python []
def majorityElement(self, nums: List[int]) -> int:
    """Boyer-Moore Voting Algorithm. O(n) time, O(1) space."""
    count = 0
    candidate = 0
    for num in nums:  # O(n)
        if count == 0:
            candidate = num
        count += 1 if num == candidate else -1
    return candidate
```

#### C++

```cpp []
// Boyer-Moore Voting Algorithm: O(n) time, O(1) space
int majorityElement(vector<int>& nums) {
    int candidate = 0, count = 0;
    for (int num : nums) { // O(n)
        if (count == 0) {
            candidate = num;
        }
        count += (num == candidate) ? 1 : -1;
    }
    return candidate;
}
```

#### Rust

```rust []
/// Boyer-Moore Voting Algorithm — O(n) time, O(1) space
pub fn majority_element(nums: Vec<i32>) -> i32 {
    let (mut candidate, mut count) = (0, 0);
    for n in nums { // O(n)
        if count == 0 {
            candidate = n;
        }
        count += if n == candidate { 1 } else { -1 };
    }
    candidate
}
```

## Solution 2: Sorting

### Idea

If we sort the array, the majority element (which appears more than `n/2` times) must occupy the middle position `nums[n/2]`. This is because no matter how the majority element is distributed, it will always straddle the midpoint.

```
sorted [1, 1, 2, 2, 2, 2, 2]
              ^-- n/2 = index 3 → value 2 ✓

sorted [2, 2, 2, 2, 3, 3, 3]
              ^-- n/2 = index 3 → value 2 ✓
```

Complexity: Time $O(n \log n)$ — sorting dominates, Space $O(1)$ if in-place sort (or $O(n)$ for merge sort).

#### Java

```java []
// Sorting: O(n log n) time, O(1) space (in-place sort)
public int majorityElementSort(int[] nums) {
    Arrays.sort(nums); // O(n log n)
    return nums[nums.length / 2];
}
```

#### Python

```python []
def majorityElementSort(self, nums: List[int]) -> int:
    """Sorting approach. O(n log n) time, O(1) space (in-place sort)."""
    nums.sort()  # O(n log n)
    return nums[len(nums) // 2]
```

#### C++

```cpp []
// Sort and return middle element: O(n log n) time
int majorityElementSort(vector<int>& nums) {
    sort(nums.begin(), nums.end()); // O(n log n)
    return nums[nums.size() / 2];
}
```

#### Rust

```rust []
/// Sort then return middle element — O(n log n) time
pub fn majority_element_sort(nums: &mut Vec<i32>) -> i32 {
    nums.sort(); // O(n log n)
    nums[nums.len() / 2]
}
```
