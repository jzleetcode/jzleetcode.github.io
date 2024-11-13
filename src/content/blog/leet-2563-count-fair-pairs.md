---
author: JZ
pubDatetime: 2024-11-11T08:01:00Z
modDatetime: 2024-11-11T09:12:00Z
title: LeetCode 2563 Count the Number of Fair Pairs
featured: true
tags:
  - a-array
  - a-two-pointers
  - a-binary-search
  - a-sorting
description:
  "Solutions for LeetCode 2563, medium, tags: array, two pointers, binary search, sorting."
---

## Table of contents

## Description

Given a **0-indexed** integer array `nums` of size `n` and two integers `lower` and `upper`, return _the number of fair pairs_.

A pair `(i, j)` is **fair** if:

-   `0 <= i < j < n`, and
-   `lower <= nums[i] + nums[j] <= upper`

```
Example 1:

Input: nums = [0,1,7,4,4,5], lower = 3, upper = 6
Output: 6
Explanation: There are 6 fair pairs: (0,3), (0,4), (0,5), (1,3), (1,4), and (1,5).
Example 2:

Input: nums = [1,7,9,2,5], lower = 11, upper = 11
Output: 1
Explanation: There is a single fair pair: (2,3).
 

Constraints:

1 <= nums.length <= 10^5
nums.length == n
-10^9 <= nums[i] <= 10^9
-10^9 <= lower <= upper <= 10^9
```

## Solution

### Idea

First of all, we can note that the number of fair pairs do not change if we sort the array. No matter index `i` and `j` elements are swapped or not swapped during sorting, they are still a fair pair.

1. Sort the array.
2. For each element in the array, we look for the first element (index `l`) greater than `upper-v` and the first element (index `r`) not less than `lower-v`. For the current element it can pair with elements in index range `[l,r)` to form a fair pair, where `[` (square bracket) is inclusive and `)` is exclusive, i.e., range `[l,r-1]`. So we increment result with `r-l`.
3. We return the result after the iteration.

Note: it is probably easier to use C++ and Python for this idea since they have the following library functions:

1. find first element/index not less than the target: C++ `lower_bound()` and Python `bisect_left()`
2. find first element/index greater than the target: C++ `upper_bound()` and Python `bisect_right()`

Complexity: Time O(nlogn), Space O(logn).

The space complexity of the sorting algorithm depends on the programming language.

-   In Python, the sort method sorts a list using the Timsort algorithm which is a combination of Merge Sort and Insertion Sort and has O(n) additional space.
-   In Java, `Arrays.sort()` is implemented using a variant of the Quick Sort algorithm which has a space complexity of O(logn) for sorting two arrays.
-   In C++, the `sort()` function is implemented as a hybrid of Quick Sort, Heap Sort, and Insertion Sort, with a worse-case space complexity of O(logn).

#### C++

```cpp
class Solution {
public:
    long long countFairPairs(vector<int> &nums, int lower, int upper) {
        long long res = 0;
        auto beg = nums.begin(), end = nums.end();
        sort(beg, end);
        for (auto [i, v]: views::enumerate(nums)) // since C++23
            res += upper_bound(beg + i + 1, end, upper - v)
                   - lower_bound(beg + i + 1, end, lower - v);
        return res;
    }
};
```
