---
author: JZ
pubDatetime: 2024-11-10T15:22:00Z
modDatetime: 2024-11-10T17:12:00Z
title: LintCode 179 Update Bits (bit)
tags:
  - a-bit
description:
  "solution for lintcode 179 update bits, tags: bit"
---

## Table of contents

## Description

Given two 32-bit numbers, N and M, and two bit positions, i and j.
Write a method to set all bits between `i` and `j` in N equal to M (e.g., M becomes a substring of N start from i to j).

In the function, the numbers N and M will be given in decimal, you should also return a decimal number.

You can assume that the bits j through i have enough space to fit all of M. That is,
if M=10011， you can assume that there are at least five bits between j and i.
You would not, for example, have j=3 and i=2, because M could not fully fit between bit 3 and bit 2.

Example

Example 1:

Input: N=(10000000000)2 M=(10101)2 i=2 j=6
Output: N=(10001010100)2

Example 2:

Input: N=(10000000000)2 M=(11111)2 i=2 j=6
Output: N=(10001111100)2

Challenge: Minimum number of operations?

## Solution

### Idea1

We can set a mask of pattern `11110000001111` where the bit is unset for position (index) in  `[i,j]`. Please note that the question is counting from `0th` bit starting from the least significant bit (rightmost). We can use this mask to clear out the bits in `[i,j]` of `n`. Next we left shift `m` `i` bits. Finally, we add or perform bitwise OR with `n` and `m<<i` to get the result.

Complexity: Time O(1), Space O(1).

#### Rust

This is an example where rust is more verbose than Java and C++ because of the strictness. We could use `overflowing_sub()` to avoid the overflow error. Alternatively we could cast all variables to `u32` and cast the result back to `i32` at the end.

For example, `i32::Min - 1` would just overflow and evaluate to `i32::MAX` in Java and C++. In Rust, it will result in overflow error.


```rust
impl Solution {
    pub fn update_bits(n: i32, m: i32, i: i32, j: i32) -> i32 {
        let mask = if j < 31 {
            !(1i32 << (j + 1)).overflowing_sub(1 << i).0
        } else {
            ((1 << i) as i32).overflowing_sub(1).0
        };
        n & mask | m << i
    }
}
```

### Idea2

For each bit in `[i,j]` unset in n. Then similar to idea 1 above, perform bitwise OR with `n` and `m<<i` to get the result.

Complexity: Time O(j-i), Space O(1).
