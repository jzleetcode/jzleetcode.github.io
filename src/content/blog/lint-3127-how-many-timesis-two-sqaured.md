---
author: JZ
pubDatetime: 2024-11-30T06:23:00Z
modDatetime: 2024-11-30T06:23:00Z
title: LintCode 3127 How Many Times is Two Squared?
featured: true
tags:
  - a-math
  - a-bit
description:
  "Solutions for LintCode 3127, easy, tags: math, bit."
---

## Table of contents

## Description

Receives a positive integer `n`.

Outputs a positive integer representing the smallest integer power of `2` greater than `n`.

> The data guarantees that the result is within the `unsigned int` data range.

Example

**Input Sample 1:**

    4

**Output sample 1:**

    8

> `2^0 = 1`
> `2^1 = 2`
> `2^2 = 4`
> `2^3 = 8`
> So the smallest integer power of `2` larger than `4` is `8`.

**Input Sample 2:**

    13

**Output Example 2:**

    16

> The integer powers of `2` are `1, 2, 4, 8, 16, 32...`
> The smallest integer power of `2` greater than `13` is `16`.

Hide Hint

-   Unsigned integer variables are declared with the `unsigned` modifier.
-   Shifting `1` bit left is equivalent to multiplying `2`.

## Solution

### Idea

We can start from 2 and multiply the `result` by 2 until it is greater than `n`.

To check the integral data limits, it is better to check the official language reference. For C++, you can check the size of the various types of integers such as `int`, `char`, and `unsigned long long` at [cppreference](https://en.cppreference.com/w/cpp/language/types). The question mentioned the result can fit in `unsigned int`.

Complexity: Time $O(\log_2n)$, Space $O(1)$.

#### C++

```cpp
#include <iostream>

using namespace std;

int main() {
    int n; cin >> n;
    unsigned int res = 2;
    while (res<=n) res <<= 1;
    cout << res;
    return 0;
}
```
