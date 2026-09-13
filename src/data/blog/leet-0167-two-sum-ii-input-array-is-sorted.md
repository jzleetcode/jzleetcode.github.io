---
author: JZ
pubDatetime: 2026-09-13T06:00:00Z
modDatetime: 2026-09-13T06:00:00Z
title: LeetCode 167 Two Sum II - Input Array Is Sorted
featured: true
tags:
  - a-array
  - a-two-pointers
  - a-binary-search
description:
  "Solutions for LeetCode 167, medium, tags: array, two pointers, binary search."
---

## Table of contents

## Description

Question Links: [LeetCode 167](https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/description/)

Given a **1-indexed** array of integers `numbers` that is already sorted in **non-decreasing order**, find two numbers such that they add up to a specific `target` number. Let these two numbers be `numbers[index1]` and `numbers[index2]` where `1 <= index1 < index2 <= numbers.length`.

Return the indices of the two numbers, `index1` and `index2`, **added by one** as an integer array `[index1, index2]` of length 2.

The tests are generated such that there is **exactly one solution**. You **may not** use the same element twice.

Your solution must use only constant extra space.

```
Example 1:

Input: numbers = [2,7,11,15], target = 9
Output: [1,2]
Explanation: The sum of 2 and 7 is 9.
Therefore, index1 = 1, index2 = 2. We return [1, 2].

Example 2:

Input: numbers = [2,3,4], target = 6
Output: [1,3]
Explanation: The sum of 2 and 4 is 6.
Therefore, index1 = 1, index2 = 3. We return [1, 3].

Example 3:

Input: numbers = [-1,0], target = -1
Output: [1,2]
Explanation: The sum of -1 and 0 is -1.
Therefore, index1 = 1, index2 = 2. We return [1, 2].

Constraints:

2 <= numbers.length <= 3 * 10^4
-1000 <= numbers[i] <= 1000
numbers is sorted in non-decreasing order.
-1000 <= target <= 1000
The tests are generated such that there is exactly one solution.
```

## Solution 1: Two Pointers

### Idea

Since the array is sorted, place one pointer at the start (`l`) and one at the end (`r`). Check the sum:

- If `sum == target`, return the 1-indexed result.
- If `sum < target`, move `l` right to increase the sum.
- If `sum > target`, move `r` left to decrease the sum.

```
numbers = [2, 3, 4], target = 6

l=0, r=2: 2+4=6 == target → return [1,3]
```

```
numbers = [2, 7, 11, 15], target = 9

l=0, r=3: 2+15=17 > 9 → r--
l=0, r=2: 2+11=13 > 9 → r--
l=0, r=1: 2+7 = 9 == target → return [1,2]
```

Why it works: if we skip index `l` (by moving `r` left), the sum decreases. If we skip index `r` (by moving `l` right), the sum increases. Because there is exactly one solution and the array is sorted, the two-pointer walk never skips the answer.

Complexity: Time $O(n)$ — each pointer moves at most $n$ steps, Space $O(1)$.

#### Java

```java []
public int[] twoSum2P(int[] numbers, int target) {
    int l = 0, r = numbers.length - 1;
    while (l < r) { // O(n)
        int v = numbers[l] + numbers[r];
        if (v < target) l++;
        else if (v == target) break;
        else r--;
    }
    return new int[]{l + 1, r + 1};
}
```

#### Python

```python []
class Solution:
    """Two pointers. O(n) time, O(1) space."""

    def twoSum(self, numbers: List[int], target: int) -> List[int]:
        l, r = 0, len(numbers) - 1
        while l < r:  # O(n)
            v = numbers[l] + numbers[r]
            if v == target:
                return [l + 1, r + 1]
            elif v < target:
                l += 1
            else:
                r -= 1
```

#### C++

```cpp []
vector<int> twoSum(vector<int> &numbers, int target) {
    for (int l = 0, r = numbers.size() - 1; l < r;) { // O(n)
        int add = numbers[l] + numbers[r];
        if (add > target) r--;
        else if (add < target) l++;
        else return {l + 1, r + 1};
    }
    return {};
}
```

#### Rust

```rust []
pub fn two_sum(numbers: Vec<i32>, target: i32) -> Vec<i32> {
    let mut lo = 0usize;
    let mut hi = numbers.len() - 1;
    while lo < hi { // O(n)
        let sum = numbers[lo] + numbers[hi];
        if sum == target {
            return vec![lo as i32 + 1, hi as i32 + 1];
        } else if sum < target {
            lo += 1;
        } else {
            hi -= 1;
        }
    }
    unreachable!("problem guarantees exactly one solution")
}
```

## Solution 2: Binary Search

### Idea

For each element `numbers[i]`, binary search for `target - numbers[i]` in the subarray `numbers[i+1..]`. The sorted order makes binary search applicable.

This uses a different data structure pattern (binary search on sorted array) compared to the two-pointer approach above.

Complexity: Time $O(n \log n)$ — outer loop $O(n)$, each binary search $O(\log n)$, Space $O(1)$.

#### Java

```java []
public int[] twoSumBS(int[] numbers, int target) {
    for (int i = 0; i < numbers.length - 1; i++) { // O(n)
        int j = Arrays.binarySearch(numbers, i + 1, numbers.length, target - numbers[i]); // O(log n)
        if (j > 0) return new int[]{i + 1, j + 1};
    }
    return new int[]{};
}
```

#### Python

```python []
class Solution2:
    """Binary search. O(n log n) time, O(1) space."""

    def twoSum(self, numbers: List[int], target: int) -> List[int]:
        for i in range(len(numbers)):  # O(n)
            complement = target - numbers[i]
            j = bisect_left(numbers, complement, i + 1)  # O(log n)
            if j < len(numbers) and numbers[j] == complement:
                return [i + 1, j + 1]
```

#### C++

```cpp []
vector<int> twoSumBS(vector<int> &numbers, int target) {
    for (int i = 0; i < (int)numbers.size(); i++) { // O(n)
        int complement = target - numbers[i];
        auto it = lower_bound(numbers.begin() + i + 1, numbers.end(), complement); // O(log n)
        if (it != numbers.end() && *it == complement) {
            return {i + 1, (int)(it - numbers.begin()) + 1};
        }
    }
    return {};
}
```

#### Rust

```rust []
pub fn two_sum(numbers: Vec<i32>, target: i32) -> Vec<i32> {
    let n = numbers.len();
    for i in 0..n - 1 { // O(n)
        let complement = target - numbers[i];
        let (mut lo, mut hi) = (i + 1, n - 1);
        while lo <= hi { // O(log n)
            let mid = lo + (hi - lo) / 2;
            if numbers[mid] == complement {
                return vec![i as i32 + 1, mid as i32 + 1];
            } else if numbers[mid] < complement {
                lo = mid + 1;
            } else {
                if mid == 0 { break; }
                hi = mid - 1;
            }
        }
    }
    unreachable!("problem guarantees exactly one solution")
}
```
