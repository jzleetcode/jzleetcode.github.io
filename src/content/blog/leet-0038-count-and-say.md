---
author: JZ
pubDatetime: 2024-11-23T06:23:00Z
modDatetime: 2024-11-23T07:23:00Z
title: LeetCode 38 LintCode 420 Count and Say (Look and Say)
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

The **count-and-say** sequence is a sequence of digit strings defined by the recursive formula:

-   `countAndSay(1) = "1"`
-   `countAndSay(n)` is the run-length encoding of `countAndSay(n - 1)`.

[Run-length encoding](http://en.wikipedia.org/wiki/Run-length_encoding) (RLE) is a string compression method that works by replacing consecutive identical characters (repeated 2 or more times) with the concatenation of the character and the number marking the count of the characters (length of the run). For example, to compress the string `"3322251"` we replace `"33"` with `"23"`, replace `"222"` with `"32"`, replace `"5"` with `"15"` and replace `"1"` with `"11"`. Thus the compressed string becomes `"23321511"`.

Given a positive integer `n`, return _the_ `nth` _element of the **count-and-say** sequence_.

```
Example 1:

Input: n = 4

Output: "1211"

Explanation:

countAndSay(1) = "1"
countAndSay(2) = RLE of "1" = "11"
countAndSay(3) = RLE of "11" = "21"
countAndSay(4) = RLE of "21" = "1211"

Example 2:

Input: n = 1

Output: "1"

Explanation:

This is the base case.



Constraints:

1 <= n <= 30
```

Follow up: Could you solve it iteratively?

Hint 1

Create a helper function that maps an integer to pairs of its digits and their frequencies. For example, if you call this function with "223314444411", then it maps it to an array of pairs [[2,2], [3,2], [1,1], [4,5], [1, 2]].

Hint 2

Create another helper function that takes the array of pairs and creates a new integer. For example, if you call this function with [[2,2], [3,2], [1,1], [4,5], [1, 2]], it should create "22"+"23"+"11"+"54"+"21" = "2223115421".

Hint 3

Now, with the two helper functions, you can start with "1" and call the two functions alternatively n-1 times. The answer is the last integer you will obtain.

## Background

The sequence is documented in the online encyclopedia of integer sequences website and the sequence id is [A005150](https://oeis.org/A005150). It is often referred to as the look and say sequence: describe the previous term.

[Wikipedia](https://en.wikipedia.org/wiki/Look-and-say_sequence) has the information for how quickly the length of the string grows. The growth factor is known as Conway's constant and denoted by λ (1.303577269034).

Fun questions:

* How does the sequence grow with digit 0-9 as the base digit? The sequence grows indefinitely. Except 22, 22, 22, 22, … (sequence A010861 in the OEIS).
* What's the max single digit? No digits other than `1`, `2`, and `3` appear in the sequence, unless the seed number contains such a digit or a run of more than three of the same digit.

## Solution

### Idea

The solution should be straightforward.

1. We construct the sequence from the base case `"1"`. We count the number of repeating digits. We can append the count and the digit to the result string.
2. We iterate until we have the n*th* sequence.

If the function might be called multiple times with random `n` values within the constraint bounds, we can use a hash map to cache the first `30` strings in the sequence.

Complexity: Time O(1.3^n), Space O(1.3^n) or O(1) not considering result space.

#### Java

#### Python

```python
class Solution:
    """7 ms, 16.67 mb"""

    @cache
    def countAndSay(self, n: int) -> str:
        res = "1"
        while n > 1:
            tmp, i, m = [], 0, len(res)
            while i < m:
                count = 1
                while i + 1 < m and res[i] == res[i + 1]:
                    count += 1
                    i += 1
                tmp.append(str(count))
                tmp.append(res[i])
                i += 1
            res = "".join(tmp)  # 1121->211211
            n -= 1
        return res
```
