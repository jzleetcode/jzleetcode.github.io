---
author: JZ
pubDatetime: 2025-03-24T06:23:00Z
modDatetime: 2025-03-24T06:23:00Z
title: LeetCode 658 LintCode 460 Find K Closest Elements
featured: true
tags:
  - a-array
  - a-binary-search
  - a-sliding-window
  - a-sorting
  - a-heap
  - c-google
  - c-facebook
description:
  "Solutions for LeetCode 658 LintCode 460, medium, tags: array, binary-search, sliding-window, sorting, heap; companies: google."
---

## Table of contents

## Description

Question links: [leet 658](https://leetcode.com/problems/find-k-closest-elements/description/), [lint 460](https://www.lintcode.com/problem/460/)

Given a **sorted** integer array `arr`, two integers `k` and `x`, return the `k` closest integers to `x` in the array. The result should also be sorted in ascending order.

An integer `a` is closer to `x` than an integer `b` if:

-   `|a - x| < |b - x|`, or
-   `|a - x| == |b - x|` and `a < b`

```
Example 1:

Input: arr = [1,2,3,4,5], k = 4, x = 3
Output: [1,2,3,4]

Example 2:

Input: arr = [1,1,2,3,4,5], k = 4, x = -1
Output: [1,1,2,3]
```

**Constraints:**

-   `1 <= k <= arr.length`
-   `1 <= arr.length <= 10^4`
-   `arr` is sorted in **ascending** order.
-   `-10^4 <= arr[i], x <= 10^4`

## Idea

The array is already sorted. We could binary search for the left boundary for the result section.

In the binary search, we compare `x-arr[mid]` and `arr[mid+k]-x`.

1. If `x-arr[mid]` is smaller, x could be in between `arr[mid]` and `arr[mid+k]` or smaller than `arr[mid]`. We need to search on the left.
2. Otherwise, x could be in between or bigger than `arr[mid+k]`. We need to search on the right.

Complexity: Time $O(\log{n-k})$, Space $O(1)$.

### Python

```python
class Solution:
    """0 ms, 18.95 mb. @lee215"""

    def findClosestElements(self, arr: list[int], k: int, x: int) -> list[int]:
        l, r = 0, len(arr) - k
        while l < r:
            mid = l + (r - l) // 2
            if x - arr[mid] > arr[mid + k] - x:
                l = mid + 1
            else:
                r = mid
        return arr[l:l + k]
```
