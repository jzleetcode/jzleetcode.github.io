---
author: JZ
pubDatetime: 2024-11-10T06:12:00Z
modDatetime: 2026-05-01T07:22:00Z
title: LeetCode 1574 Shortest Subarray to be Removed to Make Array Sorted
tags:
  - a-array
  - a-binary-search
  - a-two-pointers
description:
  "Solutions for LeetCode 1574, medium, tags: array, binary-search, two-pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 1574](https://leetcode.com/problems/shortest-subarray-to-be-removed-to-make-array-sorted/description/)

Given an integer array `arr`, remove a subarray (can be empty) from `arr` such that the remaining elements in `arr` are **non-decreasing**.

Return _the length of the shortest subarray to remove_.

A **subarray** is a contiguous subsequence of the array.

```shell
Example 1:

Input: arr = [1,2,3,10,4,2,3,5]
Output: 3
Explanation: The shortest subarray we can remove is [10,4,2] of length 3. The remaining elements after that will be [1,2,3,3,5] which are sorted.
Another correct solution is to remove the subarray [3,10,4].

Example 2:

Input: arr = [5,4,3,2,1]
Output: 4
Explanation: Since the array is strictly decreasing, we can only keep a single element. Therefore we need to remove a subarray of length 4, either [5,4,3,2] or [4,3,2,1].

Example 3:

Input: arr = [1,2,3]
Output: 0
Explanation: The array is already non-decreasing. We do not need to remove any elements.
 

Constraints:

1 <= arr.length <= 10^5
```

Hint 1

The key is to find the longest non-decreasing subarray starting with the first element or ending with the last element, respectively.

Hint 2

After removing some subarray, the result is the concatenation of a sorted prefix and a sorted suffix, where the last element of the prefix is smaller than the first element of the suffix.

## Solution

### Idea

We can use a two-pointer or sliding-window approach.

1. We iterate from the right, find the first element not sorted.
2. We maintain a window of l,r two pointers and slide it until `l>=r`
3. Removing `Array[l+1,r-1]` will make the array sorted, we keep the minimum for `r-l-1`: `(r-1) - (l+1) + 1`.

Complexity: Time O(n), Space O(1).

#### Java

```java
class Solution {
    public int findLengthOfShortestSubarray(int[] A) {
        int r = A.length - 1;
        while (r > 0 && A[r] >= A[r - 1]) r--; // first non-sorted index
        int res = r, l = 0; // can remove A[0,r-1]
        while (l < r && (l == 0 || A[l - 1] <= A[l])) {
            // find r such that removing [l+1,r-1] will make the array sorted
            while (r < A.length && A[l] > A[r]) r++;
            res = Math.min(res, r - l - 1);
            l++;
        }
        return res;
    }
}
```

#### Python

```python
class Solution:
    """Two pointers. O(n) time, O(1) space."""

    def findLengthOfShortestSubarray(self, arr: list[int]) -> int:
        r = len(arr) - 1
        while r > 0 and arr[r] >= arr[r - 1]:
            r -= 1
        res, l = r, 0
        while l < r and (l == 0 or arr[l - 1] <= arr[l]):
            while r < len(arr) and arr[l] > arr[r]:
                r += 1
            res = min(res, r - l - 1)
            l += 1
        return res
```

#### C++

```cpp
class ShortestSubarrayRemoved {
public:
    static int findLengthOfShortestSubarray(vector<int>& A) {
        int r = (int)A.size() - 1;
        while (r > 0 && A[r] >= A[r - 1]) r--;
        int res = r, l = 0;
        while (l < r && (l == 0 || A[l - 1] <= A[l])) {
            while (r < (int)A.size() && A[l] > A[r]) r++;
            res = min(res, r - l - 1);
            l++;
        }
        return res;
    }
};
```

#### Rust

```rust
impl Solution {
    pub fn find_length_of_shortest_subarray(arr: &[i32]) -> i32 {
        let n = arr.len();
        let mut r = n - 1;
        while r > 0 && arr[r] >= arr[r - 1] { r -= 1; }
        let mut res = r as i32;
        let mut l = 0usize;
        while l < r && (l == 0 || arr[l - 1] <= arr[l]) {
            while r < n && arr[l] > arr[r] { r += 1; }
            res = res.min((r - l - 1) as i32);
            l += 1;
        }
        res
    }
}
```
