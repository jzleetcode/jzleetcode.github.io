---
author: JZ
pubDatetime: 2024-11-27T08:23:00Z
modDatetime: 2024-11-27T08:23:00Z
title: HackerRank Bitwise Xor Operations
featured: true
tags:
  - a-bit
  - a-sliding-window
  - c-salesforce
description:
  "Solutions for hackerrank bitwise xor operations, medium, tags: bit, companies: salesforce."
---

## Table of contents

## Description

Optimize a service from the following pseudocode:

```javascript
function getXoredArray(array, k):
    n = size of the array
    loop i = 0 to k - 1:
        # ^ represents the bitwise xor operation
        array[i % n] = array[i % n] ^ array[n - (i % n) - 1]
    return array
```

More formally, given an array `arr` of n integers and an integer k, replace `arr[i % n]` with `arr[i % n] ^ arr[n - (i % n) - 1]` for each i from 0 to k - 1 where ^ represents the bitwise xor operation and % is the modulo division operator. Find the final array after performing the replacements.

Example 1

Suppose n = 4, arr = [5, 6, 7, 8] and k = 3.

| i | i1 | i2 | `arr[i1]` | `arr[i2]` | XOR | `arr`    |
|---|----|----|-----------|-----------|-----|----------|
| 0 | 0  | 3  | 5         | 8         | 13  | 13,6,7,8 |
| 1 | 1  | 2  | 6         | 7         | 1   | 13,1,7,8 |
| 2 | 2  | 1  | 7         | 1         | 6   | 13,1,6,8 |

For each i from 0 to 2 inclusive, perform the operation. In the table,
- `i1 = i % n = i % 4`
- `i2 = n-i % n-1 = 4-i % 4 - 1`
- `XOR = arr[i1] ^ arr(i2]`

Example 2

Input: `arr=[6,1,9], k=7`

Output: `[6,0,15]`

Explanation:

The array will change to `[15,1,9]`, `[15,0,9]`, `[15,0,6]`, `[9,0,6]`, `[9,0,6]`, `[9,0,15]`, `[6,0,15]`.

Example 3

Input: `arr=[1,2], k=2`

Output: `[3,1]`


Constraints:

- 1 ≤ n ≤ 10^5
- 1 ≤ arr[i] ≤ 10^7
- 1 ≤ k ≤ 10^12

## Solution

### Idea1

The straightforward thought would be to apply the `xor` operation k times.

Complexity: Time O(k), Space O(1).

#### Python

```python
def xor_operations(arr: list[int], k: int) -> list[int]:
    """k,1"""
    n = len(arr)
    for i in range(k):
        arr[i % n] ^= arr[n - (i % n) - 1]
    return arr
```

### Idea2

In constraints section, `k` could be very large. Can we improve the time complexity?

The process of applying the `xor` operations essentially is equivalent to the bitwise `xor` swap function. See [bitwise `xor` swap](../bit-tricks/).

So for every three `xor` operations, the mirrored (`arr[i]` and `arr[n-1-i]`) elements in the array are swapped. If the element is a mirror with itself, it becomes 0.

Let's iterate through some `xor` operations for array `[6,1,9]` and observe how the array changes.

| k  | array      | note        |
|----|------------|-------------|
| -  | `[6,1,9]`  | init        |
| 1  | `[15,1,9]` | `a[0]=6^9`  |
| 2  | `[15,0,9]` | `a[1]=1^1`  |
| 3  | `[15,0,6]` | `a[2]=15^9` |
| 4  | `[9,0,6]`  | `a[0]=15^6` |
| 5  | `[9,0,6]`  | `a[1]=0^0`  |
| 6  | `[9,0,15]` | `a[2]=6^9`  |
| 7  | `[6,0,15]` | `a[0]=9^15` |
| 8  | `[6,0,15]` | `a[1]=0^0`  |
| 9  | `[6,0,9]`  | `a[2]=6^15` |
| 10 | `[15,0,9]` | `a[1]=6^9`  |

Firstly, we can see that the middle element (for arrays with odd number of elements) changes to `0` and stays as `0` if `k >= n//2`.

Secondly, we see that the other elements (excluding the middle element) reset after `3*n` `xor` operations.

`let a = a[i], b = a[n-1-i], xor = a^b`.

We can see that `a[i]` will loop in `[xor, a, b]` and `a[n-i-1]` will loop in `[b, a, xor]`.

We need to map `k` and `i` to an index into the three element array above to get the value for `a[i]` and `a[n-1-i]`.

| k           | i | target index | note                                         |
|-------------|---|--------------|----------------------------------------------|
| `[1,n]`     | 0 | 0            | when k in `[1,3]`, `a[0]=15`, `[xor,a,b][0]` |
| `[n+1,2n]`  | 0 | 1            | when k in `[4,6]`, `a[0]=9`, `[xor,a,b][1]`  |
| `[2n+1,3n]` | 0 | 2            | when k in `[7,9]`, `a[0]=6`, `[xor,a,b][2]`  |


So for `array[i]`, we can use `(k+n-1-i)//n-1` to calculate the target index.

Similarly, for `array[n-1-i]`, we can use `(k+n+i)//n-1` to calculate the target index.

Ooh la la! We reduce the time complexity from O(k) to O(n//2), a `10^7` reduction according to the constraints.

Complexity: Time O(n//2), Space O(1).

#### Python

```python
def xor_operations_1(arr: list[int], k: int) -> list[int]:
    """n,1"""
    n = len(arr)
    if n % 2 == 1:
        arr[n // 2] = 0 if k > n // 2 else arr[n // 2]
    k %= n * 3  # k in [0,3n-1]
    for i in range(n // 2):
        a, b = arr[i], arr[n - 1 - i]
        xor = a ^ b
        arr[i] = [xor, b, a][(k - 1 - i) // n]  # (k+n-1-i)//n-1, map k in [1,n]->0
        arr[n - 1 - i] = [b, a, xor][(k + i) // n]  # (k+n+i)//n-1, map k in [0,n-1]->0
    return arr
```

Unit Test

```python
class TestXorOperations(TestCase):
    def test_xor_operations(self):
        cases = [
            ([10, 20], 1, [30, 20]),
            ([10, 20], 2, [30, 10]),
            ([10, 20], 3, [20, 10]),
            ([10, 20], 4, [20, 30]),
            ([10, 20], 5, [10, 30]),
            ([10, 20], 6, [10, 20]),
            ([10, 20], 7, [30, 20]),
            ([10, 20], 8, [30, 10]),
            ([6, 1, 9], 1, [15, 1, 9]),
            ([6, 1, 9], 2, [15, 0, 9]),
            ([6, 1, 9], 3, [15, 0, 6]),
            ([6, 1, 9], 4, [9, 0, 6]),
            ([6, 1, 9], 5, [9, 0, 6]),
            ([6, 1, 9], 6, [9, 0, 15]),
            ([6, 1, 9], 7, [6, 0, 15]),
            ([6, 1, 9], 8, [6, 0, 15]),
            ([6, 1, 9], 9, [6, 0, 9]),
            ([6, 1, 9], 10, [15, 0, 9]),
            ([1, 2], 2, [3, 1]),
            ([5, 6, 7, 8], 3, [13, 1, 6, 8]),
            ([2], 1, [0]),
            ([2], 2, [0]),
            ([1, 2, 3, 4, 5], 1, [4, 2, 3, 4, 5]),
            ([1, 2, 3, 4, 5], 3, [4, 6, 0, 4, 5]),
        ]
        for arr, k, exp in cases:
            with self.subTest(arr=arr, k=k, exp=exp):
                self.assertEqual(exp, xor_operations(arr.copy(), k))
                self.assertEqual(exp, xor_operations_1(arr.copy(), k))
```
