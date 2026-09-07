---
author: JZ
pubDatetime: 2026-09-07T08:00:00Z
modDatetime: 2026-09-07T08:00:00Z
title: LeetCode 338 Counting Bits
featured: true
tags:
  - a-dp
  - a-bit
description:
  "Solutions for LeetCode 338, easy, tags: dynamic programming, bit manipulation."
---

## Table of contents

## Description

Question Links: [LeetCode 338](https://leetcode.com/problems/counting-bits/description/)

Given an integer `n`, return an array `ans` of length `n + 1` such that for each `i` (`0 <= i <= n`), `ans[i]` is the **number of `1`'s** in the binary representation of `i`.

```
Example 1:

Input: n = 2
Output: [0,1,1]
Explanation:
0 --> 0
1 --> 1
2 --> 10

Example 2:

Input: n = 5
Output: [0,1,1,2,1,2]
Explanation:
0 --> 0
1 --> 1
2 --> 10
3 --> 11
4 --> 100
5 --> 101

Constraints:

0 <= n <= 10^5

Follow up:

- It is very easy to come up with a solution with a runtime of O(n log n).
  Can you do it in linear time O(n) and possibly in a single pass?
- Can you do it without using any built-in function
  (i.e., like __builtin_popcount in C++)?
```

## Solution 1: DP with Bit Shift

### Idea

The key observation is that the number of 1-bits in `i` relates to a smaller sub-problem we have already solved. Right-shifting `i` by one (`i >> 1`) is equivalent to dividing by 2, which removes the least significant bit. We can recover that bit with `i & 1`. So:

$$ans[i] = ans[i \gg 1] + (i \mathbin{\&} 1)$$

```
i  binary  i>>1  ans[i>>1]  i&1  ans[i]
0   0000    0       0        0     0
1   0001    0       0        1     1
2   0010    1       1        0     1
3   0011    1       1        1     2
4   0100    2       1        0     1
5   0101    2       1        1     2
6   0110    3       2        0     2
7   0111    3       2        1     3
```

Complexity: Time $O(n)$, Space $O(1)$ extra.

#### Java

```java []
class Solution {
    public int[] countBits(int n) {
        int[] res = new int[n + 1];
        for (int i = 0; i <= n; i++) res[i] = res[i / 2] + i % 2; // O(n) time, O(1) space
        return res;
    }
}
```

#### C++

```cpp []
class Solution {
public:
    vector<int> countBits(int n) {
        vector<int> ans(n + 1, 0);
        for (int i = 1; i <= n; i++)
            ans[i] = ans[i >> 1] + (i & 1); // O(n) time, O(1) space
        return ans;
    }
};
```

#### Python

```python []
class Solution:
    def countBits(self, n: int) -> list[int]:
        res = [0] * (n + 1)
        for i in range(1, n + 1):
            res[i] = res[i >> 1] + (i & 1)  # O(1) per element
        return res
```

#### Rust

```rust []
impl Solution {
    pub fn count_bits(n: i32) -> Vec<i32> {
        let n = n as usize;
        let mut res = vec![0i32; n + 1];
        for i in 1..=n {
            res[i] = res[i >> 1] + (i as i32 & 1); // O(n) time, O(1) space
        }
        res
    }
}
```

## Solution 2: DP with Brian Kernighan's Trick

### Idea

Brian Kernighan's bit trick: `i & (i - 1)` clears the lowest set bit of `i`. The result is always a smaller number whose answer we already computed. So:

$$ans[i] = ans[i \mathbin{\&} (i-1)] + 1$$

```
i  binary  i&(i-1)  ans[i&(i-1)]  ans[i]
0   0000     -          -           0
1   0001    0000         0          1
2   0010    0000         0          1
3   0011    0010         1          2
4   0100    0000         0          1
5   0101    0100         1          2
6   0110    0100         1          2
7   0111    0110         2          3
```

Complexity: Time $O(n)$, Space $O(1)$ extra.

#### Java

```java []
class Solution {
    public int[] countBits(int n) {
        int[] res = new int[n + 1];
        for (int i = 1; i <= n; i++) res[i] = res[i & (i - 1)] + 1; // O(n), Brian Kernighan
        return res;
    }
}
```

#### C++

```cpp []
class Solution {
public:
    vector<int> countBits2(int n) {
        vector<int> ans(n + 1, 0);
        for (int i = 1; i <= n; i++)
            ans[i] = ans[i & (i - 1)] + 1; // O(n), drop lowest set bit
        return ans;
    }
};
```

#### Python

```python []
class Solution2:
    def countBits(self, n: int) -> list[int]:
        res = [0] * (n + 1)
        for i in range(1, n + 1):
            res[i] = res[i & (i - 1)] + 1  # O(1) per element, clears lowest set bit
        return res
```

#### Rust

```rust []
impl Solution {
    pub fn count_bits_kernighan(n: i32) -> Vec<i32> {
        let n = n as usize;
        let mut res = vec![0i32; n + 1];
        for i in 1..=n {
            res[i] = res[i & (i - 1)] + 1; // O(n), clears lowest set bit
        }
        res
    }
}
```
