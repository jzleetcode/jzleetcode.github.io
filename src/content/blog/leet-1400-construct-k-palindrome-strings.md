---
author: JZ
pubDatetime: 2025-01-09T06:23:00Z
modDatetime: 2025-01-09T06:23:00Z
title: LeetCode 1400 Construct K Palindrome Strings
featured: true
tags:
  - a-counting
  - a-hash
  - a-string
  - a-greedy
description:
  "Solutions for LeetCode 1400, medium, tags: hash table, string, greedy, counting."
---

## Table of contents

## Description

Question [Link](https://leetcode.com/problems/construct-k-palindrome-strings/description/?envType=daily-question&envId=2025-01-11)

Given a string `s` and an integer `k`, return `true` _if you can use all the characters in_ `s` _to construct_ `k` _palindrome strings or_ `false` _otherwise_.

```
Example 1:

Input: s = "annabelle", k = 2
Output: true
Explanation: You can construct two palindromes using all characters in s.
Some possible constructions "anna" + "elble", "anbna" + "elle", "anellena" + "b"

Example 2:

Input: s = "leetcode", k = 3
Output: false
Explanation: It is impossible to construct 3 palindromes using all the characters of s.

Example 3:

Input: s = "true", k = 4
Output: true
Explanation: The only possible solution is to put each character in a separate string.
```

**Constraints:**

-   `1 <= s.length <= 10^5`
-   `s` consists of lowercase English letters.
-   `1 <= k <= 10^5`

Hint 1

If the s.length < k we cannot construct k strings from s and answer is false.

Hint 2

If the number of characters that have odd counts is > k, then the minimum number of palindrome strings we can construct is > k and the answer is false.

Hint 3

Otherwise, you can construct exactly k palindrome strings and the answer is true (why ?).

## Idea

We have two basic cases to consider.

1. If `k == s.length`, we can always form `k` palindromes with each being a single letter.
2. If `k > s.length`, there is no way to form `k` palindromes considering empty string is not allowed.

The important discovery for this question is that for each letter having an odd count, the letter cannot form a palindrome with another letter also having an odd count (to test whether a value `v` is odd, we could use `v & 1`, see this stackoverflow [question](https://stackoverflow.com/questions/20393373/performance-wise-how-fast-are-bitwise-operators-vs-normal-modulus)). For example, if there is one letter `a` and one letter `b` in the string. They must form two separate palindromes.

With the above knowledge, we could count the number of letters having an odd count and compare that with `k`.

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
lass Solution:
    """30 ms, 18.26 mb"""

    def canConstruct(self, s: str, k: int) -> bool:
        if len(s) < k: return False
        if len(s) == k: return True
        cnt = Counter(s)

        return sum([1 if cnt[c] & 1 else 0 for c in cnt]) <= k
```
