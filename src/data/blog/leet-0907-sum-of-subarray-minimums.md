---
author: JZ
pubDatetime: 2026-04-20T06:23:00Z
modDatetime: 2026-04-20T06:23:00Z
title: LeetCode 907 Sum of Subarray Minimums
featured: true
tags:
  - a-stack
  - a-monotonic-stack
  - a-array
  - a-dp
description:
  "Solutions for LeetCode 907, medium, tags: array, dynamic programming, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 907](https://leetcode.com/problems/sum-of-subarray-minimums/description/)

Given an array of integers `arr`, find the sum of `min(b)`, where `b` ranges over every (contiguous) subarray of `arr`. Since the answer may be large, return the answer modulo `10^9 + 7`.

```
Example 1:

Input: arr = [3,1,2,4]
Output: 17
Explanation:
Subarrays are [3], [1], [2], [4], [3,1], [1,2], [2,4], [3,1,2], [1,2,4], [3,1,2,4].
Minimums are 3, 1, 2, 4, 1, 1, 2, 1, 1, 1.
Sum is 17.

Example 2:

Input: arr = [11,81,94,43,3]
Output: 444
```

**Constraints:**

-   `1 <= arr.length <= 3 * 10^4`
-   `1 <= arr[i] <= 3 * 10^4`

## Idea1

For each element `arr[i]`, we calculate its **contribution** to the total sum: how many subarrays have `arr[i]` as their minimum? If we know:
- `left[i]`: the number of consecutive elements to the left (including `arr[i]`) where `arr[i]` is the minimum
- `right[i]`: the number of consecutive elements to the right (including `arr[i]`) where `arr[i]` is the minimum

Then the contribution of `arr[i]` is `arr[i] * left[i] * right[i]`.

We use a **monotonic stack** (increasing) to efficiently compute these boundaries. To handle duplicates, we use strict `>` on the left and `>=` on the right (or vice versa) to avoid double-counting.

```
arr:   [3, 1, 2, 4]

For arr[1]=1:
  left boundary: can extend all the way left -> left[1]=2
  right boundary: can extend all the way right -> right[1]=3
  contribution: 1 * 2 * 3 = 6

For arr[0]=3:
  left boundary: only itself -> left[0]=1
  right boundary: blocked by 1 -> right[0]=1
  contribution: 3 * 1 * 1 = 3

For arr[2]=2:
  left boundary: blocked by 1 -> left[2]=1
  right boundary: extends to 4 -> right[2]=2
  contribution: 2 * 1 * 2 = 4

For arr[3]=4:
  left boundary: only itself -> left[3]=1
  right boundary: only itself -> right[3]=1
  contribution: 4 * 1 * 1 = 4

Total: 6 + 3 + 4 + 4 = 17
```

**Single-pass variant with sentinels:** We add sentinel zeros at both ends of the array. As we iterate, whenever we pop an element from the stack, we know its left and right boundaries immediately.

Complexity: Time $O(n)$ — each element is pushed and popped at most once. Space $O(n)$.

### Java

```java []
// leet 907, monotonic stack with sentinels. O(n) time, O(n) space.
static final int MOD = 1_000_000_007;

public static int sumSubarrayMins(int[] arr) {
    int n = arr.length;
    long result = 0;
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(-1); // sentinel

    for (int i = 0; i <= n; i++) { // O(n), each index pushed/popped once
        int curVal = (i == n) ? 0 : arr[i];
        while (stack.peek() != -1 && arr[stack.peek()] > curVal) {
            int mid = stack.pop();
            int left = mid - stack.peek(); // distance to previous <= element
            int right = i - mid; // distance to next < element
            result = (result + (long) arr[mid] * left * right) % MOD;
        }
        stack.push(i);
    }
    return (int) result;
}
```

### C++

```cpp []
// leet 907, monotonic stack with sentinels. O(n) time, O(n) space.
int sumSubarrayMins(vector<int> &arr) {
    int n = arr.size();
    long long result = 0;
    stack<int> stk;
    stk.push(-1); // sentinel
    constexpr int MOD = 1'000'000'007;

    for (int i = 0; i <= n; i++) { // O(n), each index pushed/popped once
        int curVal = (i == n) ? 0 : arr[i];
        while (stk.top() != -1 && arr[stk.top()] > curVal) {
            int mid = stk.top();
            stk.pop();
            long long left = mid - stk.top();  // distance to previous <= element
            long long right = i - mid;         // distance to next < element
            result = (result + (long long) arr[mid] * left * right) % MOD;
        }
        stk.push(i);
    }
    return (int) result;
}
```

### Python

```python []
class Solution2:
    """Monotonic stack single pass with sentinel. O(n) time, O(n) space."""

    def sumSubarrayMins(self, arr: list[int]) -> int:
        MOD = 10**9 + 7
        result = 0
        stack: list[int] = []
        arr = [0] + arr + [0]  # sentinels to flush the stack

        for i, val in enumerate(arr):  # O(n), each index pushed/popped once
            while stack and arr[stack[-1]] > val:
                mid = stack.pop()
                left = mid - stack[-1]  # distance to previous <= element
                right = i - mid  # distance to next < element
                result = (result + arr[mid] * left * right) % MOD
            stack.append(i)

        return result
```

### Rust

```rust []
/// leet 907, monotonic stack with sentinels. O(n) time, O(n) space.
pub fn sum_subarray_mins(arr: Vec<i32>) -> i32 {
    const MOD: i64 = 1_000_000_007;
    let n = arr.len();
    let mut result: i64 = 0;
    let mut stack: Vec<usize> = Vec::new();
    let arr: Vec<i32> = std::iter::once(0)
        .chain(arr.into_iter())
        .chain(std::iter::once(0))
        .collect();

    for i in 0..arr.len() { // O(n), each index pushed/popped once
        while !stack.is_empty() && arr[*stack.last().unwrap()] > arr[i] {
            let mid = stack.pop().unwrap();
            let left = (mid - *stack.last().unwrap()) as i64;
            let right = (i - mid) as i64;
            result = (result + arr[mid] as i64 * left * right) % MOD;
        }
        stack.push(i);
    }
    result as i32
}
```

## Idea2

Two-pass approach: first compute the `left` and `right` arrays separately using two monotonic stack passes, then sum contributions.

- **Left pass:** For each `i`, find the distance to the nearest previous element that is `<=` arr[i] (use strict `>` for popping).
- **Right pass:** For each `i`, find the distance to the nearest next element that is `<` arr[i] (use `>=` for popping).

Using different comparison operators (`>` vs `>=`) on left and right prevents double-counting when there are duplicates.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// leet 907, two-pass monotonic stack. O(n) time, O(n) space.
public static int sumSubarrayMins2(int[] arr) {
    int n = arr.length;
    int[] left = new int[n];
    int[] right = new int[n];
    Deque<Integer> stack = new ArrayDeque<>();

    for (int i = 0; i < n; i++) { // O(n)
        while (!stack.isEmpty() && arr[stack.peek()] > arr[i]) stack.pop();
        left[i] = stack.isEmpty() ? i + 1 : i - stack.peek();
        stack.push(i);
    }

    stack.clear();

    for (int i = n - 1; i >= 0; i--) { // O(n)
        while (!stack.isEmpty() && arr[stack.peek()] >= arr[i]) stack.pop();
        right[i] = stack.isEmpty() ? n - i : stack.peek() - i;
        stack.push(i);
    }

    long result = 0;
    for (int i = 0; i < n; i++) { // O(n)
        result = (result + (long) arr[i] * left[i] * right[i]) % MOD;
    }
    return (int) result;
}
```

### Python

```python []
class Solution:
    """Monotonic stack two-pass. O(n) time, O(n) space."""

    def sumSubarrayMins(self, arr: list[int]) -> int:
        MOD = 10**9 + 7
        n = len(arr)
        left = [0] * n
        right = [0] * n
        stack: list[int] = []

        for i in range(n):  # O(n), each element pushed/popped at most once
            while stack and arr[stack[-1]] > arr[i]:
                stack.pop()
            left[i] = i - stack[-1] if stack else i + 1
            stack.append(i)

        stack.clear()

        for i in range(n - 1, -1, -1):  # O(n)
            while stack and arr[stack[-1]] >= arr[i]:
                stack.pop()
            right[i] = stack[-1] - i if stack else n - i
            stack.append(i)

        result = 0
        for i in range(n):  # O(n)
            result = (result + arr[i] * left[i] * right[i]) % MOD
        return result
```
