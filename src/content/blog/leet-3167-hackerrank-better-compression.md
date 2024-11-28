---
author: JZ
pubDatetime: 2024-11-26T07:23:00Z
modDatetime: 2024-11-26T07:23:00Z
title: LeetCode 3167 HackerRank Better Compression
featured: true
tags:
  - a-string
  - a-hash
  - a-counting
  - a-sorting
  - leetcode-locked
  - c-salesforce
description:
  "Solutions for LeetCode 3167 HackerRank Better Compression, tags: string, hash table, companies: salesforce."
---

## Table of contents

## Description

Consider a string, S, that is a series of characters each followed by its frequency as an integer. The string is not compressed correctly, so there may be multiple occurrences of the same character. A properly compressed string will consist of one instance of each character in alphabetical order followed by the total count of that character within the string.

Example 1

The string 'a3c9b2c1' has two instances where 'c' is followed by a count: once with 9 occurrences, and again with 1. It should be compressed to 'a3b2c10'.

Example 2

'a12b56c1' → 'a12b56c1'

Explanation: Nothing is changed because each character occurred only once, and they are already sorted ascending.

Example 3

al2c56a1b5 → 'a13b5c56'
Explanation: 'a' occurs twice: 12 times for the first occurrence and 1 time in the second occurrence for a total 13. Sort 'b' and 'c' in alphabetic order.

Example 4:

Input: compressed = "c2b3a1"

Output: "a1b3c2"

Example 5:

Input: compressed = "a2b4c1"

Output: "a2b4c1"

Function Description

`betterCompression` has the following parameter:
S: a compressed string

Returns:

string: the properly compressed string

**HackerRank Constraints:**

* 1 ≤ size of S ≤ 100000
* 'a' <= characters in S <= 'z'
* 1 ≤ frequency of each character in S ≤ 1000

**LeetCode Constraints:**

-   `1 <= compressed.length <= 6 * 10^4`
-   `compressed` consists only of lowercase English letters and digits.
-   `compressed` is a valid compression, i.e., each character is followed by its frequency.
-   Frequencies are in the range `[1, 10^4]` and have no leading zeroes.

## Solution

`let n=s.length`

### Idea

We can process the string input and accumulate the count for each of the characters in `a-z`. And finally we concat the correct count for each character for the result.

If we use a ordered map, the time complexity would be O(n*log*26).

Complexity: Time O(n), Space O(26) or O(1).

Possible Bugs:

1. The integer count may have multiple digits, do not assume it is single digit.
2. Do not include the characters having a zero count.

#### Python

```python
def better_compression(s: str) -> str:
    n, res, i = len(s), [0] * 26, 0
    while i < n:
        c, cnt = s[i], 0
        i += 1
        while i < n and s[i].isdigit():
            cnt = cnt * 10 + int(s[i])
            i += 1
        res[ord(c) - ord('a')] += cnt
    return ''.join(chr(i + ord('a')) + str(res[i]) for i in range(26) if res[i])

```

Unit Test

```python
class Test(TestCase):
    def test_better_compression(self):
        cases = [
            ('a3c9b2c1', 'a3b2c10'),
            ('a12b56c1', 'a12b56c1'),
            ('a12c56a1b5', 'a13b5c56'),
            ('c2b3a1', 'a1b3c2'),
            ('a2b4c1', 'a2b4c1'),
        ]
        for s, exp in cases:
            with self.subTest(s=s):
                self.assertEqual(exp, better_compression(s))
```
