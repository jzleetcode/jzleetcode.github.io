---
author: JZ
pubDatetime: 2024-12-10T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: LeetCode 713 LintCode 1075 Subarray Product Less Than K
featured: true
tags:
  - a-sliding
  - a-two-pointers
  - a-prefix-sum
  - c-salesforce
  - c-yatra
description:
  "Solutions for LeetCode 713 and LintCode 1075, medium, tags: sliding window, two pointers, prefix sum; companies: salesforce, yatra."
---

## Table of contents

## Description

Question links: [GFG](https://www.geeksforgeeks.org/minimum-replacements-in-a-string-to-make-adjacent-characters-unequal/), [LeetCode 713](https://leetcode.com/problems/subarray-product-less-than-k/description/), [LintCode 1075](https://www.lintcode.com/problem/1075/).

The question is on HackerRank too.

Given an array of integers `nums` and an integer `k`, return _the number of contiguous subarrays where the product of all the elements in the subarray is strictly less than_ `k`.

```
Example 1:

Input: nums = [10,5,2,6], k = 100
Output: 8
Explanation: The 8 subarrays that have product less than 100 are:
[10], [5], [2], [6], [10, 5], [5, 2], [2, 6], [5, 2, 6]
Note that [10, 5, 2] is not included as the product of 100 is not strictly less than k.

Example 2:

Input: nums = [1,2,3], k = 0
Output: 0
```

**Constraints:**

-   `1 <= nums.length <= 3 * 10^4`
-   `1 <= nums[i] <= 1000`
-   `0 <= k <= 10^6`

Hint 1

For each j, let opt(j) be the smallest i so that nums[i] * nums[i+1] * ... * nums[j] is less than k. `opt` is an increasing function.

## HackerRank Question Description

Returns: long int: the number of subarrays whose product is less than or equal to k.

Constraints

- $1 \le n \le 5 \times 10^5$
- $1 \le numbers(i] \le 100$
- $1 \le k \le 10^6$

One variation is that the product can be equal to `k`. And there is some difference in the constraints.

We can solve these questions with the same algorithm.

## Idea1

We could use a sliding window to maintain the subarray.

1. We start with `left (l)` and `right (r)` both at 0. The product start at `1`.
2. In each iteration, we multiply `nums[r]`. Product is for window `[l,r]` inclusive.
3. If the product becomes greater than or equal to `k`, we shrink the window by increasing `l` until the product is less than `k`.
4. The number of subarrays for the window `[l,r]` inclusive is `r-l+1`. For example, consider example 1 above. For window `[0,1]` array `[10,5]`. The subarrays are `[10,5]` and `[5]` and the count is `1-0+1`.
5. We need to handle the edge case when `k<=1`. Considering the constraint that the element values are in `[1,1000]`, no valid subarrays can possibly have a product of less than 1. So we can return 0.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java
// sliding window, n, 1. 4ms, 48mb.
class Solution {
    public int numSubarrayProductLessThanK(int[] nums, int k) {
        if (k <= 1) return 0;
        int res = 0, prod = 1;
        for (int l = 0, r = 0; r < nums.length; r++) {
            prod *= nums[r]; // expand the sliding window
            while (prod >= k) prod /= nums[l++]; // shrink
            res += r - l + 1;
        }
        return res;
    }
}
```

### Python

```python
class Solution:
    """43 ms, 19.35 mb"""
    def numSubarrayProductLessThanK(self, nums: list[int], k: int) -> int:
        if k <= 1: return 0
        res, l, r, prod = 0, 0, 0, 1
        while r < len(nums):
            prod *= nums[r]
            r += 1
            while prod >= k:
                prod //= nums[l]
                l += 1
            res += r - l  # not r-l+1 since r incremented
        return res
```

Unit Test

```python
class TestSolution(TestCase):
    def test_num_subarray_product_less_than_k(self):
        cases = [
            ([4, 13, 20, 32, 44, 59, 61, 71, 75, 86, 88], 567601, 32),
            ([1, 2, 3], 7, 6),
            ([2, 3, 4], 7, 4),
            ([1, 2, 3], 4, 4),
            ([10, 5, 2, 6], 100, 8),
            ([1, 2, 3], 0, 0),
        ]
        tbt = Solution()
        for arr, k, exp in cases:
            with self.subTest(arr=arr, k=k, exp=exp):
                self.assertEqual(tbt.numSubarrayProductLessThanK(arr, k), exp)
```

## Idea2

If $k \times nums[i]$ may overflow in some programming languages, the comparison `prod >= k` may run into issues. We can use the idea of a prefix sum array.

Let's use example 1 above.

1. We build a log prefix product array with a dummy `0th` element.
2. The array is $[0, \log 10, \log 50, \log 100, \log 600]$.
3. To get the product between indexes `[i,j]` inclusive, we can use the log prefix product array `lps[j+1] - lps[i]`.
4. We iterate through the array considering the subarray starting with index `cur`.
5. We perform binary search to find the ending index `low`. Elements in `[cur,lo-2]` have a product less than `k`. The count is `lo-cur-1`.

Complexity: Time $O(n \log n)$, Space $O(n)$.

### Java

```java
// binary search, nlgn, n. 28ms, 47.62mb.
static class Solution2 {
    public int numSubarrayProductLessThanK(int[] nums, int k) {
        if (k == 0) return 0; // [10,5,2,6] k:100
        double logK = Math.log(k);
        int n = nums.length;
        double[] lps = new double[n + 1]; // log prefix sum [0, lg10, lg50, lg100, lg600]
        for (int i = 0; i < n; i++) lps[i + 1] = lps[i] + Math.log(nums[i]);
        int res = 0;
        for (int cur = 0; cur < n; cur++) {
            int low = cur + 1, high = n + 1;
            while (low < high) {
                int mid = low + (high - low) / 2;
                if (lps[mid] - lps[cur] < logK - 1e-9) low = mid + 1;
                else high = mid;
            }
            res += low - cur - 1; // cur=1, lg(5*2*6)<lg100, lo ends at 5, 5-1-1==3
        }
        return res;
    }
}
```

### Python

```python
class Solution2:
    """541 ms, 19.86 mb"""
    def numSubarrayProductLessThanK(self, nums: list[int], k: int) -> int:
        if k <= 1: return 0
        res, lgK, n = 0, math.log(k), len(nums)
        lps = [0]
        for i in range(n):
            lps.append(lps[-1] + math.log(nums[i]))
        for i in range(n):
            lo, hi = i + 1, n + 1
            while lo < hi:
                mid = lo + (hi - lo) // 2
                if lps[mid] - lps[i] < lgK - 1e-9:
                    lo = mid + 1
                else:
                    hi = mid
            res += lo - i - 1
        return res
```
