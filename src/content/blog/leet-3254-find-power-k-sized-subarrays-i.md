---
author: JZ
pubDatetime: 2024-11-14T07:12:00Z
modDatetime: 2024-11-14T07:22:00Z
title: LeetCode 3254 Find the Power of K-Size Subarrays I
tags:
  - a-sliding-window
  - a-array
description:
  "Solutions for LeetCode 3254, medium, tags: array, sliding window."
---

## Table of contents

## Description

You are given an array of integers `nums` of length `n` and a _positive_ integer `k`.

The **power** of an array is defined as:

-   Its **maximum** element if _all_ of its elements are **consecutive** and **sorted** in **ascending** order.
-   \-1 otherwise.

You need to find the **power** of all subarrays of `nums` of size `k`.

Return an integer array `results` of size `n - k + 1`, where `results[i]` is the _power_ of `nums[i..(i + k - 1)]`.

```
Example 1:

Input: nums = [1,2,3,4,3,2,5], k = 3

Output: [3,4,-1,-1,-1]

Explanation:

There are 5 subarrays of nums of size 3:

[1, 2, 3] with the maximum element 3.
[2, 3, 4] with the maximum element 4.
[3, 4, 3] whose elements are not consecutive.
[4, 3, 2] whose elements are not sorted.
[3, 2, 5] whose elements are not consecutive.
Example 2:

Input: nums = [2,2,2,2,2], k = 4

Output: [-1,-1]

Example 3:

Input: nums = [3,2,3,2,3,2], k = 2

Output: [-1,3,-1,3,-1]

 

Constraints:

1 <= n == nums.length <= 500
1 <= nums[i] <= 10^5
1 <= k <= n
```

Hint 1

Can we use a brute force solution with nested loops and HashSet?

## Solution

### Idea

We can maintain a counter of the streak for the consecutive elements seen in the array as we iterate. When the streak reaches k, we can start writing the element (max element of the streak (length k)) to the result as long as the streak is >= k.

Complexity: Time O(n), Space O(1).

#### Java

```java
class Solution {
    public int[] resultsArray(int[] nums, int k) {
        if (k == 1) return nums; // every single element is a valid subarray
        int n = nums.length, res[] = new int[n - k + 1];
        Arrays.fill(res, -1); // Initialize results to -1
        for (int i = 0, streak = 1; i < n - 1; i++) {
            if (nums[i] + 1 == nums[i + 1]) streak++;
            else streak = 1;
            if (streak >= k) res[i - k + 2] = nums[i + 1];
        }
        return res;
    }
}
```
