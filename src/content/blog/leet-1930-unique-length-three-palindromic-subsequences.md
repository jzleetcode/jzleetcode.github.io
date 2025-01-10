---
author: JZ
pubDatetime: 2025-01-05T06:23:00Z
modDatetime: 2025-01-05T06:23:00Z
title: LeetCode 1930 Unique Length-3 Palindromic Subsequences
featured: true
tags:
  - a-hash
  - a-bit
  - a-string
  - a-prefix-sum
description:
  "Solutions for LeetCode 1930, medium, tags: hash table, string, bit manipulation, prefix sum."
---

## Table of contents

## Description

Question [Link](https://leetcode.com/problems/unique-length-3-palindromic-subsequences/description/?envType=daily-question&envId=2025-01-04)

Given a string `s`, return _the number of **unique palindromes of length three** that are a **subsequence** of_ `s`.

Note that even if there are multiple ways to obtain the same subsequence, it is still only counted **once**.

A **palindrome** is a string that reads the same forwards and backwards.

A **subsequence** of a string is a new string generated from the original string with some characters (can be none) deleted without changing the relative order of the remaining characters.

-   For example, `"ace"` is a subsequence of `"abcde"`.

```
Example 1:

Input: s = "aabca"
Output: 3
Explanation: The 3 palindromic subsequences of length 3 are:
- "aba" (subsequence of "aabca")
- "aaa" (subsequence of "aabca")
- "aca" (subsequence of "aabca")

Example 2:

Input: s = "adc"
Output: 0
Explanation: There are no palindromic subsequences of length 3 in "adc".

Example 3:

Input: s = "bbcbaba"
Output: 4
Explanation: The 4 palindromic subsequences of length 3 are:
- "bbb" (subsequence of "bbcbaba")
- "bcb" (subsequence of "bbcbaba")
- "bab" (subsequence of "bbcbaba")
- "aba" (subsequence of "bbcbaba")
```

**Constraints:**

-   `3 <= s.length <= 105`
-   `s` consists of only lowercase English letters.

Hint 1

What is the maximum number of length-3 palindromic strings?

Hint 2

How can we keep track of the characters that appeared to the left of a given position?

## Idea

To form a palindrome of length three, we could locate the same letter at the start and end. In the middle we need another letter.

1. We initialize two arrays to remember the first and last index for the twenty-six lower case english letters.
2. We iterate through the twenty-six letters. For each letter, we could know the first and last index.
3. We count the distinct letters in between the `first` and `last` index and accumulate that to the result.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java
// n, 1. 281 ms, 45.44 mb.
class Solution {
    public int countPalindromicSubsequence(String s) {
        int first[] = new int[26], last[] = new int[26], res = 0;
        Arrays.fill(first, Integer.MAX_VALUE);
        for (int i = 0; i < s.length(); i++) {
            int id = s.charAt(i) - 'a';
            first[id] = Math.min(i, first[id]);
            last[id] = i;
        }
        for (int i = 0; i < 26; i++)
            if (first[i] < last[i])
                res += (int) s.substring(first[i] + 1, last[i]).chars().distinct().count();
        return res;
    }
}
```

### Python

```python
class Solution:
    """266 ms, 19.3 mb"""

    def countPalindromicSubsequence(self, s: str) -> int:
        first, last, res = [inf] * 26, [0] * 26, 0
        for i, c in enumerate(s):
            id = ord(c) - ord('a')
            first[id] = min(i, first[id])
            last[id] = i
        for i in range(26):
            if first[i] < last[i]:
                res += len(set(list(s[first[i] + 1:last[i]])))
        return res
```
