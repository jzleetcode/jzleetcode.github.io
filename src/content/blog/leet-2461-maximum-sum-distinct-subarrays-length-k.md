---
author: JZ
pubDatetime: 2024-11-17T07:23:00Z
modDatetime: 2024-11-17T07:23:00Z
title: LeetCode 2461 Maximum Sum of Distinct Subarrays With Length K
featured: true
tags:
  - a-sliding-window
  - a-array
  - a-hash
description:
  "Solutions for LeetCode 2461, medium, tags: array, sliding window, hash."
---

## Table of contents

## Description

You are given an integer array `nums` and an integer `k`. Find the maximum subarray sum of all the subarrays of `nums` that meet the following conditions:

-   The length of the subarray is `k`, and
-   All the elements of the subarray are **distinct**.

Return _the maximum subarray sum of all the subarrays that meet the conditions__._ If no subarray meets the conditions, return `0`.

_A **subarray** is a contiguous non-empty sequence of elements within an array._

```
Example 1:

Input: nums = [1,5,4,2,9,9,9], k = 3
Output: 15
Explanation: The subarrays of nums with length 3 are:
- [1,5,4] which meets the requirements and has a sum of 10.
- [5,4,2] which meets the requirements and has a sum of 11.
- [4,2,9] which meets the requirements and has a sum of 15.
- [2,9,9] which does not meet the requirements because the element 9 is repeated.
- [9,9,9] which does not meet the requirements because the element 9 is repeated.
We return 15 because it is the maximum subarray sum of all the subarrays that meet the conditions

Example 2:

Input: nums = [4,4,4], k = 3
Output: 0
Explanation: The subarrays of nums with length 3 are:
- [4,4,4] which does not meet the requirements because the element 4 is repeated.
We return 0 because no subarrays meet the conditions.
 

Constraints:

1 <= k <= nums.length <= 10^5
1 <= nums[i] <= 10^5
```

Hint 1

Which elements change when moving from the subarray of size k that ends at index i to the subarray of size k that ends at index i + 1?
* * *
Hint 2

Only two elements change, the element at i + 1 is added into the subarray, and the element at i - k + 1 gets removed from the subarray.
* * *
Hint 3

Iterate through each subarray of size k and keep track of the sum of the subarray and the frequency of each element.


## Solution

### Idea

Complexity: Time O(n), Space O(n).

#### Java

```java
class Solution {
    public long maximumSubarraySum(int[] nums, int k) {
        long res = 0, cur = 0, dup = -1;
        HashMap<Integer, Integer> last = new HashMap<>(); // val->last seen index
        for (int i = 0; i < nums.length; ++i) {
            cur += nums[i];
            if (i >= k) cur -= nums[i - k];
            dup = Math.max(dup, last.getOrDefault(nums[i], -1));
            if (i - dup >= k) res = Math.max(res, cur); // past the duplicate segment
            last.put(nums[i], i);
        }
        return res;
    }
}
```
