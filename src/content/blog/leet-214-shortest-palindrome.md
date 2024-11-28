---
author: JZ
pubDatetime: 2024-11-26T06:23:00Z
modDatetime: 2024-11-26T06:23:00Z
title: LeetCode 214 LintCode 678 Shortest Palindrome (GeeksForGeeks Minimum Insertion to Form Shortest Palindrome)
featured: true
tags:
  - a-rolling-hash
  - a-string
  - a-kmp
  - a-two-pointers
  - a-hash
  - c-google
description:
  "Solutions for LeetCode 239, LintCode 678, medium, tags: two pointers, string, kmp, rabin-karp, rolling hash."
---

## Table of contents

## Description

You are given a string `s`. You can convert `s` to a palindrome by adding characters in front of it.

Return _the shortest palindrome you can find by performing this transformation_.

```
Example 1:

Input: s = "aacecaaa"
Output: "aaacecaaa"

Example 2:

Input: s = "abcd"
Output: "dcbabcd"
```

**Constraints:**

-   `0 <= s.length <= 5 * 10^4`
-   `s` consists of lowercase English letters only.

## Solution

`let n=s.length`

### Idea1

Firstly, how can we form the shortest palindrome?

We can find the longest palindrome prefix of the string. Copy the remaining substring, reverse it, and append it to the front of the string to form the shortest palindrome.

For example, for string `aaabc`, the longest palindrome prefix is `aaa`. We take the remaining substring `bc`, reverse to `cb` and add to front to form `cbaaabc`.

Secondly, how can we find the longest palindrome prefix?

We can use the rolling hash method which is also used in [Rabin-Karp](https://en.wikipedia.org/wiki/Rabin%E2%80%93Karp_algorithm) string search algorithm. Similarly, we have a very small chance of hash collision and false positives. In reality, the percentage is very low.

The polynomial rolling hash is defined as following.

`H=s[0]p^(n-1) + s[1]^p(n-2) + s[2]p^(n-3) + ... + s[n-2]p + s[n-1]`, where `s` is the string, `s[i], i in [0,n-1]` is the characters in the string, and p is a power factor for the hash function.

Similar to the hash functions used for a hash map data structure, the hash can be used to check for equality.

We can compute the rolling hash in a forward and reverse order and compare the two hashes. If they are equal, we found a palindrome.

The reverse hash is then `s[n-1]p^(n-1) + s[n-2]p^(n-2) + ... + s[0]p`.

Let's look at how the forward and reverse hash changes with the above example.

| i | c   | forward              | reverse              | pow        | note     |
|---|-----|----------------------|----------------------|------------|----------|
| 0 | `a` | 1                    | 1                    | 1->31      | match    |
| 1 | `a` | 1*31+1               | 1+1*31               | 31->31^2   | match    |
| 2 | `a` | 1*31^2+1*31+1        | 1+1*31+1*31^2        | 31^2->31^3 | match    |
| 3 | `b` | 1*31^3+1*31^2+1*31+2 | 1+1*31+1*31^2+2*31^3 | 31^3->31^4 | no match |


In the calculation below, we offset `a-z` to integers `1-26` to simplify the hash calculation.

Complexity: Time O(n), Space O(n), O(1) if not considering result space.

#### Python

```python
class SolutionHash:
    """47 ms, 18.02 mb"""

    def shortestPalindrome(self, s: str) -> str:
        base, pow, mod, end, forward, reverse = 31, 1, 1e9 + 7, -1, 0, 0
        for i, c in enumerate(s):
            id = ord(c) - ord('a') + 1
            forward = (forward * base + id) % mod
            reverse = (reverse + id * pow) % mod
            pow = (pow * base) % mod
            if forward == reverse: end = i
        return s[end + 1:][::-1] + s
```
