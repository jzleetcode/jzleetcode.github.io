---
author: JZ
pubDatetime: 2024-11-09T15:22:00Z
modDatetime: 2024-11-09T17:12:00Z
title: LeetCode 3133 Minimum Array End (Bit)
featured: true
tags:
  - a-bit
  - c-google
description:
  "solution for leetcode 3133 Minimum Array End, tags: bit"
---


## Table of contents

## Description

You are given two integers n and x. You have to construct an array of positive integers nums of size n where for every `0 <= i < n - 1`, `nums[i + 1]` is greater than `nums[i]`, and the result of the bitwise AND operation between all elements of nums is `x`.

Return the minimum possible value of `nums[n - 1]`.

Example 1:

Input: n = 3, x = 4, Output: 6

Explanation: nums can be `[4,5,6]` and its last element is 6.

Example 2:

Input: n = 2, x = 7,  Output: 15

Explanation: nums can be `[7,15]` and its last element is 15.



Constraints:

`1 <= n, x <= 10^8`

## Solution

The result should contain all the set bits in `x` otherwise the bitwise AND result would not be equal to `x`.

For `4 (0b100)`, the 3rd least significant bit (LSB) needs to be set. `5 (0b101)` and `6 (0b110)` are ok, but `8 (0b1000)` is not.

For `7 (0b111)`, 1st-3rd all the least significant bits need to be set. `15 (0b1111)` is ok.

### Idea1

The array needs `n` integers starting from x. So `n-1` integers not including `x`. The next element in the array needs to contain all the set bits in `x` and greater than `x`. We can perform bitwise OR between `result` and `x` while incrementing `result`.

Complexity: Time O(n), Space O(1).

#### Java

```java
class Solution2 {
    public long minEnd(int n, int x) {
        long res = x;
        while (--n > 0) res = (res + 1) | x;
        return res;
    }
}
```

### Idea2

As all other questions related to bit, we can explore if the question can be solved by shifting each bit. We can examine each bit in `n-1` (bit shift until 0) and decide whether to set that bit to `x` to get the `result`.

Let's use an example `n=6, x=4`.

| mask      | n    | res  | explanation                                                                                                                                                                                  | array            |
|-----------|------|------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|
| 1(0b1)    | 5    | 4    | init                                                                                                                                                                                         | `[4]`            |
|           | 5to2 | 4to5 | first LSB should be set                                                                                                                                                                      | `[4,5]`          |
| 2(0b10)   | 2to1 | 5    | second LSB not set in x but also not set in `n-1(5)`, bit shift n but res remains at 5                                                                                                       | `[4,5]`          |
| 4(0b100)  | 1    | 5    | third LSB already set in x, no change to n or res                                                                                                                                            | `[4,5]`          |
| 8(0b1000) | 1    | 13   | fourth LSB not set in x and also this bit is set in `n-1(5)`, set bit in res and bit shift. this bit was the 3rd LSB (`0b100`) in `n-1(5)` so four numbers (6,7,8,13) are added to the array | `[4,5,6,7,8,13]` |
| 16        | 0    |      | n==0, can stop                                                                                                                                                                               |                  |

Complexity: Time O(log n), Space O(1).

#### Java

```java
class Solution {
    public long minEnd(int n, int x) {
        long res = x;
        n--;
        for (long mask = 1; n > 0; mask <<= 1) {
            if ((mask & x) == 0) { // whether this bit is already set in x
                res |= (n & 1) * mask; // if this bit is set in n, set it in res
                n >>= 1;
            }
        }
        return res;
    }
}
```
