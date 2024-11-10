---
author: JZ
pubDatetime: 2024-11-09T15:22:00Z
modDatetime: 2024-11-09T17:12:00Z
title: LeetCode 3097 Shortest Subarray With OR at Least K II (Bit)
featured: true
tags:
  - a-bit
  - a-sliding-window
  - c-goldman-sachs
description:
  "solution for leetcode 3097 Shortest Subarray With OR at Least K II, tags: bit, sliding-window, array"
---


## Table of contents

## Description

You are given an array nums of non-negative integers and an integer k.

An array is called special if the bitwise OR of all of its elements is at least k.

Return the length of the shortest special non-empty subarray of nums, or return -1 if no special subarray exists.

Example 1:

Input: `nums = [1,2,3], k = 2`

Output: 1

Explanation:

The subarray `[3]` has OR value of 3. Hence, we return 1.

Example 2:

Input: `nums = [2,1,8], k = 10`

Output: 3

Explanation:

The subarray `[2,1,8]` has OR value of 11. Hence, we return 3.

Example 3:

Input: nums = `[1,2]`, k = 0

Output: 1

Explanation:

The subarray `[1]` has OR value of 1. Hence, we return 1.

Constraints:

```
1 <= nums.length <= 2 * 10^5, n
0 <= nums[i] <= 10^9
0 <= k <= 10^9
```

## Solution

### Idea

We can maintain a sliding window `[start,end]` (where the square brackets `[]` indicate inclusive boundaries). While iterating through the array, maintain the bit OR result at least k (>= k). We can use an array to keep the count of each bit to know when the bit is set or not set in the bitwise OR result.

There is an optimization according to the constraint for `nums[i]`.

Complexity: Time O(n), Space O(1).

#### Java

```java
class Solution {
    final static int K = 32 - Integer.numberOfLeadingZeros((int) 1e9);
    int[] bitCnt;

    public int minimumSubarrayLength(int[] nums, int k) {
        int res = Integer.MAX_VALUE;
        int start = 0, end = 0;
        bitCnt = new int[K]; // Tracks count of set bits at each position
        while (end < nums.length) {
            updateBitCnt(nums[end], 1);
            while (start <= end && bitCntToNum() >= k) {
                res = Math.min(res, end - start + 1);
                updateBitCnt(nums[start], -1);
                start++;
            }
            end++;
        }
        return res == Integer.MAX_VALUE ? -1 : res;
    }

    // update the bit count array when adding/removing a number from window
    private void updateBitCnt(int number, int delta) {
        for (int pos = 0; pos < K; pos++)
            if (((number >> pos) & 1) != 0) bitCnt[pos] += delta;
    }

    // convert the bit count array back to number using OR operation
    private int bitCntToNum() {
        int res = 0;
        for (int pos = 0; pos < K; pos++)
            if (bitCnt[pos] != 0) res |= 1 << pos;
        return res;
    }
}
```
