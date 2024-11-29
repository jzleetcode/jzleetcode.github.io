---
author: JZ
pubDatetime: 2024-11-10T06:12:00Z
modDatetime: 2024-11-10T07:22:00Z
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
