---
author: JZ
pubDatetime: 2024-12-01T08:23:00Z
modDatetime: 2024-12-01T08:23:00Z
title: LeetCode 53 LintCode 41 Maximum Subarray
featured: true
tags:
  - a-array
  - a-divide-conquer
  - a-dp
  - a-prefix-sum
  - c-ltk
description:
  "Solutions for LeetCode 53 and LintCode 41, medium, tags: array, divide and conquer, dynamic programming, prefix sum, companies: ltk."
---

## Table of contents

## Description

Given an integer array `nums`, find the subarray with the largest sum, and return _its sum_.

```
Example 1:

Input: nums = [-2,1,-3,4,-1,2,1,-5,4]
Output: 6
Explanation: The subarray [4,-1,2,1] has the largest sum 6.

Example 2:

Input: nums = [1]
Output: 1
Explanation: The subarray [1] has the largest sum 1.

Example 3:

Input: nums = [5,4,-1,7,8]
Output: 23
Explanation: The subarray [5,4,-1,7,8] has the largest sum 23.
```
**Constraints:**

-   `1 <= nums.length <= 10^5`
-   `-10^4 <= nums[i] <= 10^4`

**Follow up:** If you have figured out the `O(n)` solution, try coding another solution using the **divide and conquer** approach, which is more subtle.

## Idea1

We could use dynamic programming to solve this question.

1. We could use two variables to track two states during the dynamic programming: the max sum ending at the current index and the result (max sum so far).
2. For each iteration, we add the current number to the `maxHere`, the max sum ending at the previous index. We compare that sum with the current number itself and take the maximum and set it to `maxHere`. For example, if `maxHere` was negative, the sum would definitely be smaller than the current number. Then we would just set the current number to `maxHere`.
3. Next, we take the maximum from the previous `res` and current `maxHere` to remember the max sum seen so far.
4. Finally, we return the result which records the maximum seen throughout.

Let's use example 1 above and look at how `maxHere` and `res` would change.

```
array: [-2,1,-3,4,-1,2,1,-5,4]
look at index 0 number -2
maxHere needs to include at least the current number, because subarray is non-empty. so maxHere = -2
res = -2
look at index 1 number 1
maxHere = max(1, -2+1) = 1
res = max(-2,1) = 1

...

so maxHere and res values are below as we iterate through
maxHere: [-2,1,-2,4,3,5,6,1,4]
res: [-2,1,1,4,4,5,6,6,6]
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java
class Solution1 {
    int maxSubarrayDP(int[] nums) {
        int maxHere = 0, res = Integer.MIN_VALUE; // max sum ending at current index
        for (int n : nums) {
            maxHere = Math.max(n, maxHere + n); // note that the first item is the number, not 0
            res = Math.max(res, maxHere);
        }
        return res;
    }
}
```

### Rust

```rust
use std::cmp::max;

/// leet 53

impl Solution {
    /// 0 ms, 3.34 mb.
    pub fn max_sub_array(nums: Vec<i32>) -> i32 {
        let (mut max_here, mut res) = (0, i32::MIN);
        for n in nums {
            max_here = max(max_here + n, n);
            res = max(res, max_here);
        }
        res
    }
}
```

### Python

```python
class Solution:
    """75 ms, 31.8 mb"""

    def maxSubArray(self, nums: list[int]) -> int:
        max_here, res = 0, -inf
        for n in nums:
            max_here = max(n, max_here + n)
            res = max(res, max_here)
        return res
```

## Idea2

For the follow-up question, we could solve this question with divide and conquer.

We could use the prefix sum array data structure for a recursive solution. If we split a non-empty array into two halves, the maximum subarray can possibly be composed with three possible ways.

1. the entire subarray can be in the left half.
2. the entire subarray can be in the right half.
3. the subarray contains elements in both the left and right half.

We can calculate a forward `maxHere` array `pre[]`, where `pre[i]` denotes max sum subarray ending at index i. And a reverse `maxHere` array `suf[]`, where `suf[i]` denotes the maxi subarray starting at index i.

We use a recursive `helper` function to calculate the maximum subarray in the left and right halves. Then we take the maximum out of the three possibilities.

Complexity: Time $O(n)$, Space $O(n)$.

Alternatively, if we perform the calculation after the recursive call. We could implement a recursive solution with the complexity of Time $O(n\log n)$, Space $O(\log n)$ (recursive stack space).

### Java

```java
class Solution2 {
    int[] pre, suf;

    int maxSubArray(int[] nums) {
        int n = nums.length;
        pre = Arrays.copyOf(nums, n);
        suf = Arrays.copyOf(nums, n);
        for (int i = 1; i < n; i++) pre[i] += Math.max(0, pre[i - 1]);
        for (int i = n - 2; i >= 0; i--) suf[i] += Math.max(0, suf[i + 1]);
        return helper(nums, 0, n - 1);
    }

    /**
     * 72 ms, 58.05 mb.
     * Divide and conquer, O(N) time, O(N) space. T(N) = 2T(N/2) + O(1).
     * Alternative DnC solution available for O(NlgN) time and O(lgN) recursive stack space.
     */
    int helper(int[] nums, int left, int right) {
        if (left == right) return nums[left];
        int mid = (left + right) / 2;
        return Arrays.stream(new int[]{
                helper(nums, left, mid),
                helper(nums, mid + 1, right),
                pre[mid] + suf[mid + 1]}).max().orElseThrow();
    }
}
```
