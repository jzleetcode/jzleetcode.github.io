---
author: JZ
pubDatetime: 2026-11-05T19:48:00Z
modDatetime: 2026-11-05T19:48:00Z
title: LeetCode 70 Climbing Stairs
featured: true
tags:
  - a-dynamic-programming
  - a-math
description: "Solution for LeetCode 70, easy, tags: dynamic programming, math."
---

## Table of contents

## Description

Question Link: [LeetCode 70: Climbing Stairs](https://leetcode.com/problems/climbing-stairs/description/)

You are climbing a staircase with `n` steps. Each move climbs either one step or two steps. Return the number of distinct ways to reach the top.

```text
Example 1:
Input: n = 2
Output: 2
Explanation: 1 + 1 or 2

Example 2:
Input: n = 3
Output: 3
Explanation: 1 + 1 + 1, 1 + 2, or 2 + 1

Constraints:
1 <= n <= 45
```

## Idea

To arrive at step `i`, the last move must come from step `i - 1` or `i - 2`. If `ways(i)` is the number of routes to step `i`, then:

$$ways(i) = ways(i - 1) + ways(i - 2)$$

There is one way to reach step 1 and two ways to reach step 2. The counts continue as `1, 2, 3, 5, 8, ...`:

```text
step:   1  2  3  4  5
ways:   1  2  3  5  8
```

Each count needs only the two before it. Keep those two values, compute the next sum, and shift the pair forward. The Java and Python versions return the first two answers directly; the C++ and Rust versions start with the equivalent counts for steps 0 and 1.

Complexity: Time $O(n)$ because each step is computed once. Space $O(1)$ because only two counts are stored.

### Java

```java []
public int climbStairsIterative(int n) {
    if (n <= 2) return n;
    int a = 1, res = 2;
    for (int i = 3; i <= n; i++) {
        res += a;
        a = res - a;
    }
    return res;
}
```

Here `a` and `res` hold the previous two counts. After adding `a` to `res`, the old value of `res` is recovered by subtracting `a`; that becomes the next `a`.

### Python

```python []
class Solution:
    """LeetCode 70 Climbing Stairs."""

    def climbStairs(self, n: int) -> int:
        if n <= 2:
            return n

        previous, current = 1, 2
        # Each iteration computes one step: O(n) time and O(1) extra space.
        for _ in range(3, n + 1):
            previous, current = current, previous + current
        return current
```

### C++

```cpp []
class Solution {
public:
    // DP with the previous two counts. O(n) time, O(1) space.
    int climbStairs(int n) {
        int previous = 1, current = 1;
        for (int step = 2; step <= n; ++step) {
            int next = previous + current;
            previous = current;
            current = next;
        }
        return current;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// LeetCode 70: rolling DP in O(n) time and O(1) extra space.
    pub fn climb_stairs(n: i32) -> i32 {
        // One way to reach step 0 (stay put) and one way to reach step 1.
        let (mut prev, mut curr) = (1, 1);
        for _ in 2..=n {
            // The final move comes from either one or two steps below.
            let next = prev + curr;
            prev = curr;
            curr = next;
        }
        curr
    }
}
```
