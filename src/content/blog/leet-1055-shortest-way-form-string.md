---
author: JZ
pubDatetime: 2024-11-17T05:23:00Z
modDatetime: 2024-11-17T05:23:00Z
title: LeetCode 1055 LintCode 3652 Shortest Way to Form String
featured: true
tags:
  - a-two-pointers
  - a-greedy
  - a-string
  - leetcode-locked
description:
  "Solutions for LeetCode 1055 LintCode 3652, hard, tags: greedy, two pointers, string."
---

## Table of contents

## Description

A **subsequence** of a string is a new string formed from the original string by deleting some (can be none) of the characters without disturbing the relative positions of the remaining characters. (i.e., `"ace"` is a subsequence of `"abcde"` while `"aec"` is not).

Given two strings `source` and `target`, return _the minimum number of **subsequences** of_ `source` _such that their concatenation equals_ `target`. If the task is impossible, return `-1`.

```shell
Example 1:

Input: source = "abc", target = "abcbc"
Output: 2
Explanation: The target "abcbc" can be formed by "abc" and "bc", which are subsequences of source "abc".
Example 2:

Input: source = "abc", target = "acdbc"
Output: -1
Explanation: The target string cannot be constructed from the subsequences of source string due to the character "d" in target string.
Example 3:

Input: source = "xyz", target = "xzyxz"
Output: 3
Explanation: The target string can be constructed as follows "xz" + "y" + "xz".
```

**Constraints:**

-   `1 <= source.length, target.length <= 1000`
-   `let m=source.length, n=target.length`
-   `source` and `target` consist of lowercase English letters.

## Solution

### Idea

We can use two pointers `i` and `j` to iterate through `source` and `target`. If we see a match, we set the boolean flag `found` to `true` and increment both `i` and `j`, otherwise we only increment `i`.

When one of the pointers reached the end:

1. If the flag is still `false`, we return `-1`.
2. Otherwise, we increment the count for the `result`.

When both of the `while` loops terminate, we return the final result.

Complexity: Time O(mn), Space O(1).

#### Java

```java
class Solution {
    public int shortestWay(String source, String target) {
        int m = source.length(), n = target.length();
        int res = 0, j = 0;
        while (j < n) {
            boolean found = false;
            int i = 0;
            while (i < m && j < n) {
                if (source.charAt(i) == target.charAt(j)) {
                    found = true;
                    j++;
                }
                i++;
            }
            if (!found) return -1; // can not form target
            res++;
        }
        return res;
    }
}
```

#### Python

```pycon
class Solution:
    """
    @param s: Source string
    @param target: Target string
    @return: Number of subsequences that can be spliced into target
    """

    def shortest_way(self, source: str, target: str) -> int:
        """62ms, 5.05mb"""
        m, n = map(len, (source, target))
        res = j = 0
        while j < n:
            found, i = False, 0
            while i < m and j < n:
                if source[i] == target[j]:
                    j += 1
                    found = True
                i += 1
            if not found: return -1
            res += 1
        return res
```
