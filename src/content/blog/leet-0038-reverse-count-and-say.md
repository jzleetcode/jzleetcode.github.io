---
author: JZ
pubDatetime: 2024-11-23T07:23:00Z
modDatetime: 2024-11-23T08:23:00Z
title: Reverse of LeetCode 38 LintCode 420 Count and Say (Look and Say)
featured: true
tags:
  - a-math
  - a-string
  - c-facebook
  - c-pinterest
description:
  "Solutions for LeetCode 38, LintCode 420, medium, tags: math, string, simulation, companies: facebook, pinterest."
---

## Table of contents

## Description

See [solution for LeetCode 38](./leet-0038-count-and-say/) for more background. The question could come up as a follow-up to that question.

You should clarify the exact meaning of "reverse".

Possible constraints:

1. The count should be less than 10, e.g., 1211 could be one 2 one 1 or 121 ones. As we mentioned in [LeetCode 38](./leet-0038-count-and-say/#background), the sequence count should be a single digit. In fact, unless the seed digit contains such a digit or a run of more than three of the same digit, no digits other than `1`, `2`, and `3` appear in the sequence.


## Solution

### Idea

1.  We parse the input string (`s`) parsed in pairs:
    -   The first character of each pair (`s.charAt(i)`) is the count of repetitions.
    -   The second character of each pair (`s.charAt(i + 1)`) is the digit being repeated.
2.  For each pair, repeat the digit `count` times and append it to the result.
3.  The result is the prior term in the Count and Say sequence.

Example

Input:

`s = "111221"`

Execution:

-   Read `11`: Add "1" repeated 1 time → "1".
-   Read `12`: Add "2" repeated 1 time → "12".
-   Read `21`: Add "1" repeated 2 times → "1211".

Output:

`"1211"`

Edge Cases to Consider

-   An empty string should return an empty result.
-   Invalid strings (e.g., odd-length input) should be handled appropriately, possibly by throwing an exception or returning an error message.

Complexity: Time O(n/1.3), Space O(n/1.3) or O(1) not considering result space.

#### Python

```python
class Solution:

    def reverseCountSay(self, s):
        res, n = [], len(s)
        for i in range(0, n, 2):
            cnt = int(s[i])
            ch = s[i + 1]
            res.extend([ch] * cnt)
        return ''.join(res)
```
