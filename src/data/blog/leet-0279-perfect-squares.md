---
author: JZ
pubDatetime: 2026-08-10T10:00:00Z
modDatetime: 2026-08-10T10:00:00Z
title: LeetCode 279 Perfect Squares
featured: true
tags:
  - a-dynamic-programming
  - a-math
description:
  "Solutions for LeetCode 279, medium, tags: dynamic programming, math."
---

## Table of contents

## Description

Question Links: [LeetCode 279](https://leetcode.com/problems/perfect-squares/description/)

Given an integer `n`, return the least number of perfect square numbers that sum to `n`.

A perfect square is an integer that is the square of an integer; in other words, it is the product of some integer with itself. For example, 1, 4, 9, and 16 are perfect squares while 3 and 11 are not.

```
Example 1:

Input: n = 12
Output: 3
Explanation: 12 = 4 + 4 + 4.

Example 2:

Input: n = 13
Output: 2
Explanation: 13 = 4 + 9.

Constraints:

1 <= n <= 10^4
```

## Solution 1: Bottom-Up DP

### Idea

Define `dp[i]` as the minimum number of perfect squares that sum to `i`. Initialize `dp[0] = 0`. For each value `i` from 1 to `n`, try subtracting every perfect square `j*j <= i` and take the minimum: `dp[i] = min(dp[i - j*j] + 1)` for all valid `j`.

```
n = 12

dp index:  0  1  2  3  4  5  6  7  8  9  10  11  12
values:    0  1  2  3  1  2  3  4  2  1   2   3   3
                       ^              ^            ^
                      2^2           3^2        4+4+4
```

Complexity: Time $O(N \cdot \sqrt{N})$ — for each of `N` values, we try up to $\sqrt{N}$ perfect squares. Space $O(N)$ for the dp array.

#### Java

```java []
// O(N*sqrt(N)) time, O(N) space.
static List<Integer> dp = new ArrayList<>(List.of(0));

public static int numSquares2(int n) {
    while (dp.size() <= n) {
        int m = dp.size(), next = Integer.MAX_VALUE;
        for (int i = 1; i * i <= m; i++) next = Math.min(next, dp.get(m - i * i) + 1);
        dp.add(next);
    }
    return dp.get(n);
}
```

#### Python

```python []
class Solution:
    """DP. O(N*sqrt(N)) time, O(N) space."""

    def numSquares(self, n: int) -> int:
        dp = [0] * (n + 1)
        for m in range(1, n + 1):  # O(N)
            dp[m] = m  # worst case: all 1s
            i = 1
            while i * i <= m:  # O(sqrt(N))
                dp[m] = min(dp[m], dp[m - i * i] + 1)
                i += 1
        return dp[n]
```

#### C++

```cpp []
// O(N*sqrt(N)) time, O(N) space.
int numSquares(int n) {
    vector<int> dp(n + 1, n + 1);
    dp[0] = 0;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j * j <= i; j++)
            dp[i] = min(dp[i], dp[i - j * j] + 1);
    return dp[n];
}
```

#### Rust

```rust []
/// DP approach: O(N*sqrt(N)) time, O(N) space
pub fn num_squares(n: i32) -> i32 {
    let n = n as usize;
    let mut dp = vec![i32::MAX; n + 1];
    dp[0] = 0;
    for i in 1..=n {
        let mut j = 1;
        while j * j <= i {
            dp[i] = dp[i].min(dp[i - j * j] + 1);
            j += 1;
        }
    }
    dp[n]
}
```

## Solution 2: Number Theory (Lagrange + Legendre)

### Idea

By **Lagrange's four-square theorem**, every natural number can be represented as the sum of at most 4 perfect squares. Combined with **Legendre's three-square theorem**, a number `n` can be expressed as the sum of 3 squares if and only if `n` is **NOT** of the form $4^a(8b + 7)$.

Algorithm:
1. If `n` is a perfect square, return 1.
2. If `n = 4^a * (8b + 7)` for some integers `a, b`, return 4.
3. If there exist integers `i` such that `n - i*i` is a perfect square, return 2.
4. Otherwise return 3.

```
Decision tree:

  n
  |
  +--> is_square(n)? ---------> return 1
  |
  +--> n / 4^a mod 8 == 7? ---> return 4
  |
  +--> exists i: is_square(n - i^2)? --> return 2
  |
  +--> otherwise --------------> return 3
```

Complexity: Time $O(\sqrt{N})$ — step 2 is $O(\log N)$, step 3 iterates at most $\sqrt{N}$ values. Space $O(1)$.

#### Java

```java []
// O(sqrt(N)) time, O(1) space.
public static int numSquares1(int n) {
    int sr = (int) Math.sqrt(n);
    if (sr * sr == n) return 1;
    while (n % 4 == 0) n /= 4;
    if (n % 8 == 7) return 4;
    for (int i = 1; i * i <= n; i++) {
        int sq = i * i, base = (int) Math.sqrt(n - sq);
        if (base * base == n - sq) return 2;
    }
    return 3;
}
```

#### Python

```python []
class Solution2:
    """Lagrange's four-square + Legendre's three-square theorem.
    O(sqrt(N)) time, O(1) space."""

    def numSquares(self, n: int) -> int:
        sr = isqrt(n)
        if sr * sr == n:
            return 1
        t = n
        while t % 4 == 0:
            t //= 4
        if t % 8 == 7:
            return 4
        i = 1
        while i * i <= n:
            remainder = n - i * i
            base = isqrt(remainder)
            if base * base == remainder:
                return 2
            i += 1
        return 3
```

#### C++

```cpp []
// O(sqrt(N)) time, O(1) space.
int numSquares(int n) {
    auto isSquare = [](int x) { int s = (int) sqrt(x); return s * s == x; };
    if (isSquare(n)) return 1;
    int tmp = n;
    while (tmp % 4 == 0) tmp /= 4;
    if (tmp % 8 == 7) return 4;
    for (int i = 1; i * i <= n; i++)
        if (isSquare(n - i * i)) return 2;
    return 3;
}
```

#### Rust

```rust []
/// Math approach: O(sqrt(N)) time, O(1) space.
pub fn num_squares_math(n: i32) -> i32 {
    let is_square = |x: i32| -> bool {
        let s = (x as f64).sqrt() as i32;
        s * s == x || (s + 1) * (s + 1) == x
    };
    if is_square(n) { return 1; }
    let mut tmp = n;
    while tmp % 4 == 0 { tmp /= 4; }
    if tmp % 8 == 7 { return 4; }
    let mut i = 1;
    while i * i <= n {
        if is_square(n - i * i) { return 2; }
        i += 1;
    }
    3
}
```
