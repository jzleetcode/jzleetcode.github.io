---
author: JZ
pubDatetime: 2024-12-10T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: HackerRank and GeeksForGeeks Minimum Replacements/Substitutions to Make Adjacent Characters Unequal
featured: true
draft: true
tags:
  - a-sliding-window
  - a-array
  - c-salesforce
description:
  "Solutions for , easy, tags: array, sliding window; companies: salesforce."
---

## Table of contents

## Description

Question Links: [GFG](https://www.geeksforgeeks.org/minimum-replacements-in-a-string-to-make-adjacent-characters-unequal/)

For each word in a list of words, if any two adjacent characters are equal, change one of them. Determine the minimum number of substitutions so the final string contains no adjacent equal characters.

Example

```
words = ['add', boook, 'break']

1. 'add': change one d (1 change)
2. 'boook': change the middle o(1 change)
3. 'break: no changes are necessary (0 changes)

The return array is [1, 1, 0].
```

Function Description

Complete the function `minimalOnerations`, `minimalOperations` has the following parameters:

string words[n]: an array of strings

Returns: int[n]: each element i is the minimum substitutions for words[i].

Constraints:

- 1 ≤ n ≤ 100
- 2 ≤ length of words ≤ 10
- Each character of words[i] is in the range ascii[a-z].

Input Format for custom Testing

Input from stdin will be processed as follows and passed to the function.

The first line contains an integer n, the size of the array words.

Each of the next `n` lines contains a string words[i].

Sample Case 0

sample Input 0

```
Function Parameters
→ words| Size = 5
→ words[] = [ 'ab', 'aab', 'abb', 'abab' . 'abaaaba']

Sample output
0
1
1
0
1
```

Explanation 0

- words = 'ab' is already acceptable, so np replacements are needed
- words = 'aab' Replace an 'a' with an appropriate character so 1 replacement.
- words = 'abb' is not acceptable. Replace a 'b' with an appropriate character, again 1 replacement
- words = 'abab' is already acceptable, so O replacements
- words = 'abaaaba' is not acceptable. Replace the middle 'a' in 'aaa', 1 replacement.

The return array is [0, 1, 1, 0, 1].

## Idea

A key discovery for this question is that for any streak of repeating characters, the number of replacements needed is the repeat count divide by two.

So we count the streak of repeating characters and accumulate the result.

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
def minReplaceUnequal(s: str) -> int:
    i, res, n = 0, 0, len(s)
    while i < n:
        streak = 1
        while i + 1 < n and s[i] == s[i + 1]:
            i += 1
            streak += 1
        res += streak // 2
        i += 1
    return res
```

Unit Test

```python
class TestMinReplacementUnequal(TestCase):
    def test_min_replace_unequal(self):
        cases = [
            ('ab', 0),
            ('caaab', 1),
            ('xxxxxxx', 3),
            ('add', 1),
            ('boook', 1),
            ('break', 0),
            ('abaaaba', 1),
            ('abab', 0),
        ]
        for s, exp in cases:
            with self.subTest(s=s, exp=exp):
                self.assertEqual(exp, minReplaceUnequal(s))
```
