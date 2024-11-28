---
author: JZ
pubDatetime: 2024-11-26T10:23:00Z
modDatetime: 2024-11-26T10:23:00Z
title: Fun Bit Tricks (Manipulations)
featured: true
tags:
  - a-bit
description:
  "Fun bitwise tricks such as count set bits, negate, ilog2, xor swap, .etc."
---

## Table of contents

## XOR Swap

We can swap two elements using bitwise `xor`.

First, let's understand the two basic discoveries for `xor`:

- for any `x`, `x^x==0`
- for any `x`, `x^0==x`

Based on the two understandings above, we can perform the bitwise `xor` swap like below.

```java
int a = 1, b = 2;
// xor swap
a ^= b; // assign a^b to a
b ^= a; // b^(new a) == b^a^b == 0^a == a, now b equals original a
a ^= b; // (new a)&(new b) == a^b^a == 0^b == b, now a equals original b
```


## Bitwise Negation

The bitwise negation operator (`~`) changes each bit from `0` to `1` and from `1` to `0`.

Let use hexidecimal literal and look at an example.

```java
~ 0x0 == 0xffff_ffff  // ~0 is -1
~ 0x1 == 0xffff_fffe  // ~1 is -2
```

So we have `~n == -(n+1)` for two's complement number representations.

Javas binary search uses this characteristic to help indicating the insertion position of a non-existing element to keep the array still sorted. This aligns well with the convention to return `-1` to indicate an element cannot be found or a certain operation can not be successfully completed.

For example, searching for `2` in array `[0,1,3]`.

1. The `lo` and `hi` pointers will cross and both be equal to `2` when the binary search algorithm finishes.
2. The Java standard library's binary search algorithm will return `-(lo+1)`.
3. The caller of the function can take a negation of the returned number, `~(-(lo+1)) == -(-(lo+1)+1) == lo`.
4. The caller get the position to insert the new element to keep the array sorted.
5. If we insert 2 at index 2 (shift the elements to the right), the array becomes `[0,1,2,3]`.
