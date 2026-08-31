---
author: JZ
pubDatetime: 2026-08-31T06:00:00Z
modDatetime: 2026-08-31T06:00:00Z
title: LeetCode 50 Pow(x, n)
featured: true
tags:
  - a-math
  - a-recursion
description:
  "Solutions for LeetCode 50, medium, tags: math, recursion."
---

## Table of contents

## Description

Question Links: [LeetCode 50](https://leetcode.com/problems/powx-n/description/)

Implement `pow(x, n)`, which calculates `x` raised to the power `n` (i.e., $x^n$).

```
Example 1:

Input: x = 2.00000, n = 10
Output: 1024.00000

Example 2:

Input: x = 2.10000, n = 3
Output: 9.26100

Example 3:

Input: x = 2.00000, n = -2
Output: 0.25000
Explanation: 2^-2 = 1/2^2 = 1/4 = 0.25
```

**Constraints:**

- `-100.0 < x < 100.0`
- $-2^{31}$ `<= n <=` $2^{31} - 1$
- `n` is an integer.
- Either `x` is not zero or `n > 0`.
- $-10^4$ `<=` $x^n$ `<=` $10^4$

## Idea1

We can use **binary exponentiation** (also known as fast power or exponentiation by squaring) to compute $x^n$ in $O(\log n)$ time instead of $O(n)$.

The key insight is that we can decompose the exponent `n` into its binary representation. For each bit:
- If the bit is 1, multiply the running product by the current `x`.
- Regardless, square `x` for the next bit position.

```
Example: x = 2, n = 10 (binary: 1010)

Step  n(binary)  n&1  pow    x
 0    1010        0    1     2
 1    0101        1    4     4     (pow *= x because bit is 1)
 2    0010        0    4    16
 3    0001        1   64   256    (pow *= x because bit is 1)

Result: 64... wait, let's recalculate:
pow starts at 1, x starts at 2.

n=10 (1010):
  bit 0 (n&1=0): pow=1,   x=2*2=4
  bit 1 (n&1=1): pow=1*4=4, x=4*4=16
  bit 2 (n&1=0): pow=4,   x=16*16=256
  bit 3 (n&1=1): pow=4*256=1024, x=256*256

Result: 1024 ✓
```

For negative `n`, we compute $x^{-n}$ with $\frac{1}{x}$ as the base.

**Edge case**: when `n = -2^{31}` (i.e., `Integer.MIN_VALUE`), negating it overflows in 32-bit integers. In Java/C++, we cast to `long`; in Python, integers have arbitrary precision so no issue arises. The recursive approach avoids overflow by computing `1/x * pow(1/x, -(n+1))`.

Complexity: Time $O(\log n)$, Space $O(1)$.

### Java

```java []
public class Pow {
    // iterative binary exponentiation. O(lgn) time O(1) space.
    public double myPowIter(double x, int n) {
        if (n < 0) {
            n = -n;
            x = 1 / x;
        }
        double pow = 1;
        while (n != 0) { // O(lg n) iterations
            if ((n & 1) != 0) pow *= x;
            x *= x;
            n >>>= 1; // unsigned right shift to handle INT_MIN
        }
        return pow;
    }
}
```

### Python

```python []
class Solution:
    """iterative binary exponentiation. O(lg n) time, O(1) space."""

    def myPow(self, x: float, n: int) -> float:
        if n < 0: x = 1 / x
        n, p = abs(n), 1
        while n:  # O(lg n) iterations
            if n & 1: p *= x
            x *= x
            n >>= 1
        return p
```

### C++

```cpp []
class Solution {
public:
    // iterative binary exponentiation. O(lg n) time, O(1) space.
    double myPow(double x, int n) {
        long long N = n; // avoid overflow when negating INT_MIN
        if (N < 0) { N = -N; x = 1 / x; }
        double pow = 1;
        while (N) { // O(lg n) iterations
            if (N & 1) pow *= x;
            x *= x;
            N >>= 1;
        }
        return pow;
    }
};
```

### Rust

```rust []
impl Solution {
    /// iterative binary exponentiation. O(lg n) time, O(1) space.
    pub fn my_pow(x: f64, n: i32) -> f64 {
        let mut x = x;
        let mut n = n as i64; // avoid overflow when negating i32::MIN
        if n < 0 {
            x = 1.0 / x;
            n = -n;
        }
        let mut pow = 1.0;
        while n > 0 { // O(lg n) iterations
            if n & 1 == 1 { pow *= x; }
            x *= x;
            n >>= 1;
        }
        pow
    }
}
```

## Idea2

Alternatively, we can solve this recursively. The recurrence is:

$$
x^n =
\begin{cases}
1 & \text{if } n = 0 \\
(x^2)^{n/2} & \text{if } n \text{ is even} \\
x \cdot (x^2)^{(n-1)/2} & \text{if } n \text{ is odd}
\end{cases}
$$

Each recursive call halves `n`, giving $O(\log n)$ depth. The recursive approach naturally handles the `INT_MIN` overflow case: for negative `n`, we compute $\frac{1}{x} \cdot \text{pow}(\frac{1}{x}, -(n+1))$, which avoids negating `n` directly.

Complexity: Time $O(\log n)$, Space $O(\log n)$ (recursion stack).

### Java

```java []
public class Pow {
    // recursive binary exponentiation. O(lg n) time and space.
    public double myPow(double x, int n) {
        if (n == 0) return 1;
        if (n < 0) return 1 / x * myPow(1 / x, -(n + 1)); // O(lg n) recursion depth
        return n % 2 == 0 ? myPow(x * x, n / 2) : x * myPow(x * x, n / 2);
    }
}
```

### Python

```python []
class Solution2:
    """recursive binary exponentiation. O(lg n) time and space."""

    def myPow(self, x: float, n: int) -> float:
        if n == 0: return 1
        if n < 0: return 1 / x * self.myPow(1 / x, -(n + 1))  # O(lg n) recursion depth
        return self.myPow(x * x, n // 2) if n % 2 == 0 else x * self.myPow(x * x, n // 2)
```

### C++

```cpp []
class Solution {
public:
    // recursive binary exponentiation. O(lg n) time and space.
    double myPow(double x, int n) {
        if (n == 0) return 1;
        if (n < 0) return 1 / x * myPow(1 / x, -(n + 1)); // O(lg n) recursion depth
        return n % 2 == 0 ? myPow(x * x, n / 2) : x * myPow(x * x, n / 2);
    }
};
```

### Rust

```rust []
impl Solution {
    /// recursive binary exponentiation. O(lg n) time and space.
    pub fn my_pow_recursive(x: f64, n: i32) -> f64 {
        if n == 0 { return 1.0; }
        if n < 0 {
            return 1.0 / x * Self::my_pow_recursive(1.0 / x, -(n + 1));
            // O(lg n) recursion depth
        }
        if n % 2 == 0 { Self::my_pow_recursive(x * x, n / 2) }
        else { x * Self::my_pow_recursive(x * x, n / 2) }
    }
}
```
