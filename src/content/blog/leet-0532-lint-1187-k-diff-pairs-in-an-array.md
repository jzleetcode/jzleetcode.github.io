---
author: JZ
pubDatetime: 2025-01-17T06:23:00Z
modDatetime: 2025-01-17T06:23:00Z
title: LeetCode 532 LintCode 1187 K-diff Pairs in An Array
featured: true
tags:
  - a-hash
  - a-counting
  - a-two-pointers
  - a-binary-search
  - a-array
  - a-sorting
  - c-nvidia
  - c-amazon
description:
  "Solutions for LeetCode 532 LintCode 1187, medium, tags: array, hash table, counting, two-pointers, binary-search; companies: nvidia, amazon."
---

## Table of contents

## Description

Question Links: [LeetCode 532](https://leetcode.com/problems/k-diff-pairs-in-an-array/description/), [LintCode 1187](https://www.lintcode.com/problem/1187/)

Given an array of integers `nums` and an integer `k`, return _the number of **unique** k-diff pairs in the array_.

A **k-diff** pair is an integer pair `(nums[i], nums[j])`, where the following are true:

-   `0 <= i, j < nums.length`
-   `i != j`
-   `|nums[i] - nums[j]| == k`

**Notice** that `|val|` denotes the absolute value of `val`.

```
Example 1:

Input: nums = [3,1,4,1,5], k = 2
Output: 2
Explanation: There are two 2-diff pairs in the array, (1, 3) and (3, 5).
Although we have two 1s in the input, we should only return the number of unique pairs.

Example 2:

Input: nums = [1,2,3,4,5], k = 1
Output: 4
Explanation: There are four 1-diff pairs in the array, (1, 2), (2, 3), (3, 4) and (4, 5).

Example 3:

Input: nums = [1,3,1,5,4], k = 0
Output: 1
Explanation: There is one 0-diff pair in the array, (1, 1).
```

**Constraints:**

-   `1 <= nums.length <= 10^4`
-   `-10^7 <= nums[i] <= 10^7`
-   `0 <= k <= 10^7`

## Idea

We could count the values in the array and then iterate through the counter.

1. If `k==0`, we count if this element count is >= 2. Because we would only consider the unique pairs, if the count is <= 1, there is no such pair; if the count is >= 2, we count the one pair of `v and v`.
2. If `k>0`, we look for `v+k` in the counter.

Complexity: Time $O(n)$, Space $O(n)$.

### C++

```cpp
// leet 532, 3 ms, 17.22 mb
class Solution {
public:
    int findPairs(vector<int> &nums, int k) {
        int res = 0;
        unordered_map<int, int> cnt;
        for (auto &n: nums) cnt[n] += 1;
        for (auto e: cnt) res += k > 0 && cnt.count(e.first + k) || k == 0 && e.second > 1;
        return res;
    }
};
```

### Python

```python
class Solution:
    """5 ms, 19 mb"""

    def findPairs(self, nums: list[int], k: int) -> int:
        cnt = Counter(nums)
        return sum([k > 0 and c + k in cnt or k == 0 and cnt[c] > 1 for c in cnt])
```
