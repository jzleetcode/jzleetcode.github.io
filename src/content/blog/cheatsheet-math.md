---
author: JZ
pubDatetime: 2024-11-28T06:23:00Z
modDatetime: 2024-11-28T06:23:00Z
title: Cheatsheet for Math Knowledge Needed for LeetCode Algorithm Questions (Geometric Series and Arithmetic Progression Sum)
featured: true
tags:
  - a-math
description:
  "cheatsheet for math knowledge needed for leetcode algorithm questions, geometric series sum"
---

## Table of contents

## Number Series

### Geometric Series

A **geometric series** is a series of terms where each term is a constant multiple (called the common ratio, $r$) of the previous one.

#### General Form

The general form of a geometric series is:

$$S_n = a + ar + ar^2 + ar^3 + ⋯ + ar^{n−1}$$

Where:

-   $a$ is the first term,
-   $r$ is the common ratio,
-   $n$ is the number of terms.

#### Sum of a Geometric Series

The sum of the first n terms of a geometric series can be calculated using the formula:

$$S_{n}=\dfrac{a(1-r^{n})}{1-r}$$

Special Cases:

1.  **If r=1:**
    -   The series is just a repetition of the same term a, so the sum of n terms is: $S_n = na$
2.  **For an infinite geometric series:**
    -   If $∣r∣ < 1$, the series converges to: $S_{n}=\dfrac{a}{1-r}$
    -   If $∣r∣ > 1$, the series does not converge.

#### Example

1.  **Finite Geometric Series**: $S = 1 + 2 + 2^2 + 2^3 + 2^4 = \dfrac{a(1-2^5)}{1-2} = 31$
2.  **Infinite Geometric Series**: $S = 1 + \dfrac{1}{2} + \dfrac{1}{4} + ... = \dfrac{1}{1-\dfrac{1}{2}} = 2 $

#### References

-   [Wikipedia: Geometric Series](https://en.wikipedia.org/wiki/Geometric_series)

### Arithmetic Series

The term **"等差数列"** in Chinese translates to **"Arithmetic Sequence"** or **"Arithmetic Progression"** in English.

An **Arithmetic Sequence** is a sequence of numbers in which the difference between consecutive terms is constant. This difference is referred to as the **common difference** (d).

#### General Form

The $n^{th}$ term of an arithmetic sequence can be expressed as:

$$a_n = a_1 + (n-1)\cdot d$$

Where:

-   $a_n$ is the $n^{th}$ term,
-   $a_1$ is the first term,
-   $d$ is the common difference,
-   $n$ is the term number.

#### Sum of the First n Terms 等差数列求和

The sum $S_n$ of the first n terms of an arithmetic sequence is given by:

$$S_n = \dfrac{n}{2}\cdot (a_1 + a_n) $$

Alternatively, using the general formula for the $n^{th}$ term, the sum can also be written as:

$$S_n = \dfrac{n}{2}\cdot (2a_1 + (n-1)\cdot d) $$

#### Example

For an arithmetic sequence where:

-   $a_1 = 2$,
-   $d = 3$,
-   and $n = 5$,

The sequence will be: 2,5,8,11,14.

The sum of the first 5 terms is:

$$S_5 = \dfrac{5}{2}\cdot (2 + 14) = 40 $$

#### References

-   [Wikipedia: Arithmetic Progression](https://en.wikipedia.org/wiki/Arithmetic_progression)
