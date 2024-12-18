---
author: JZ
pubDatetime: 2024-11-29T06:23:00Z
modDatetime: 2024-11-29T06:23:00Z
title: LeetCode 1346 Check If N and Its Double Exist
featured: true
tags:
  - a-array
  - a-hash
  - a-two-pointers
  - a-binary-search
  - a-sorting

description:
  "Solutions for LeetCode 1346, easy, tags: array, hash table, two pointers, binary search, sorting."
---

## Table of contents

## Description

Question links: [LeetCode 1346](https://leetcode.com/problems/check-if-n-and-its-double-exist/)

Given an array `arr` of integers, check if there exist two indices `i` and `j` such that :

-   `i != j`
-   `0 <= i, j < arr.length`
-   `arr[i] == 2 * arr[j]`

```
Example 1:

Input: arr = [10,2,5,3]
Output: true
Explanation: For i = 0 and j = 2, arr[i] == 10 == 2 * 5 == 2 * arr[j]

Example 2:

Input: arr = [3,1,7,11]
Output: false
Explanation: There is no i and j that satisfy the conditions.
```

**Constraints:**

-   `2 <= arr.length <= 500`
-   `-10^3 <= arr[i] <= 10^3`

Hint 1

Loop from i = 0 to arr.length, maintaining in a hashTable the array elements from `[0, i-1]`.

Hint 2

On each step of the loop check if we have seen the element `2 * arr[i]` so far.

Hint 3

Also check if we have seen `arr[i] / 2` in case `arr[i] % 2 == 0`.

## Solution

### Idea

We can iterate through the array and use a hashset to store the elements already seen.

1. If the double of the current element is already seen or the number's half is already seen, we return true.
2. If no such pairs are present, we return false.

Complexity: Time $O(n)$, Space $O(n)$.

#### Python

```python
class Solution:
    def checkIfExist(self, arr: list[int]) -> bool:
        seen = set()
        for n in arr:
            if 2 * n in seen or (n % 2 == 0 and n // 2 in seen):
                return True
            seen.add(n)
        return False
```
