---
author: JZ
pubDatetime: 2026-09-16T08:00:00Z
modDatetime: 2026-09-16T08:00:00Z
title: LeetCode 338 Counting Bits
featured: false
tags:
  - a-bit
  - a-dp
description:
  "Solutions for LeetCode 338, easy, tags: dynamic programming, bit manipulation."
---

## Table of contents

## Description

Question Links: [LeetCode 338](https://leetcode.com/problems/counting-bits/description/)

Given an integer `n`, return an array `ans` of length `n + 1` such that for each `i` (`0 <= i <= n`), `ans[i]` is the number of 1's in the binary representation of `i`.

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
```

**Constraints:**

- `0 <= n <= 10^5`

**Follow up:**

- Can you do it in $O(n)$ time and possibly in a single pass?
- Can you do it without using any built-in function (e.g., `__builtin_popcount` in C++)?

## Idea 1: DP with Bit Shift

The key observation: the number of 1-bits in `i` equals the number of 1-bits in `i >> 1` (right-shift drops the least significant bit) plus the least significant bit itself (`i & 1`).

```
i       binary   i>>1   ans[i>>1]   i&1   ans[i]
0       0000     0      0           0     0
1       0001     0      0           1     1
2       0010     1      1           0     1
3       0011     1      1           1     2
4       0100     2      1           0     1
5       0101     2      1           1     2
6       0110     3      2           0     2
7       0111     3      2           1     3
8       1000     4      1           0     1
```

Recurrence: `ans[i] = ans[i >> 1] + (i & 1)`

Since `i >> 1 < i`, we always reference already-computed values when iterating forward from 0.

Complexity: Time $O(n)$, Space $O(1)$ extra (output array only).

## Idea 2: DP with Brian Kernighan's Trick

`i & (i - 1)` clears the lowest set bit of `i`. So the popcount of `i` is exactly one more than the popcount of `i & (i - 1)`.

```
i=6:  0110 & 0101 = 0100 (=4), ans[4]=1, so ans[6]=1+1=2
i=7:  0111 & 0110 = 0110 (=6), ans[6]=2, so ans[7]=2+1=3
i=12: 1100 & 1011 = 1000 (=8), ans[8]=1, so ans[12]=1+1=2
```

Recurrence: `ans[i] = ans[i & (i - 1)] + 1`

Since clearing any bit produces a smaller number, `i & (i - 1) < i`, so the reference is always already computed.

Complexity: Time $O(n)$, Space $O(1)$ extra.

### Java

```java []
// solution 1, 2ms, 48.5 Mb. DP with bit shift, O(n) time, O(1) space.
public int[] countBits2(int n) {
    int[] res = new int[n + 1];
    for (int i = 0; i <= n; i++) res[i] = res[i / 2] + i % 2; // res[i>>1] + (i&1)
    return res;
}
```

```java []
// solution 2, O(nLgn) time, O(1) space. 18ms, 48.4 Mb. Brute force popcount.
public int[] countBits(int n) {
    int[] result = new int[n + 1];
    for (int i = 0; i <= n; i++) {
        int sum = 0;
        int num = i;
        while (num != 0) {
            sum += num % 2;
            num = num / 2;
        }
        result[i] = sum;
    }
    return result;
}
```

### Python

```python []
class Solution:
    def countBits(self, n: int) -> list[int]:
        """DP with bit shift. O(n) time, O(1) space."""
        res = [0] * (n + 1)
        for i in range(1, n + 1):
            res[i] = res[i >> 1] + (i & 1)  # O(1) per element
        return res
```

```python []
class Solution2:
    def countBits(self, n: int) -> list[int]:
        """DP with last set bit (Brian Kernighan). O(n) time, O(1) space."""
        res = [0] * (n + 1)
        for i in range(1, n + 1):
            res[i] = res[i & (i - 1)] + 1  # O(1) per element, i&(i-1) clears lowest set bit
        return res
```

### C++

```cpp []
// DP with bit shift: ans[i] = ans[i >> 1] + (i & 1)
// Time: O(n), Space: O(1) extra (output array not counted)
vector<int> countBits(int n) {
    vector<int> ans(n + 1, 0);
    for (int i = 1; i <= n; i++)
        ans[i] = ans[i >> 1] + (i & 1); // right-shift reuses sub-problem
    return ans;
}
```

```cpp []
// DP with Brian Kernighan: ans[i] = ans[i & (i-1)] + 1
// Time: O(n), Space: O(1) extra
vector<int> countBits2(int n) {
    vector<int> ans(n + 1, 0);
    for (int i = 1; i <= n; i++)
        ans[i] = ans[i & (i - 1)] + 1; // drop lowest set bit
    return ans;
}
```

### Rust

```rust []
/// DP with bit shift: ans[i] = ans[i >> 1] + (i & 1)
/// Time O(n), Space O(1) extra (output array only)
pub fn count_bits_shift(n: i32) -> Vec<i32> {
    let n = n as usize;
    let mut res = vec![0i32; n + 1];
    for i in 1..=n {
        res[i] = res[i >> 1] + (i as i32 & 1); // right-shift drops LSB, add it back
    }
    res
}
```

```rust []
/// DP with Brian Kernighan: ans[i] = ans[i & (i-1)] + 1
/// Time O(n), Space O(1) extra (output array only)
pub fn count_bits_kernighan(n: i32) -> Vec<i32> {
    let n = n as usize;
    let mut res = vec![0i32; n + 1];
    for i in 1..=n {
        res[i] = res[i & (i - 1)] + 1; // i & (i-1) clears lowest set bit
    }
    res
}
```
