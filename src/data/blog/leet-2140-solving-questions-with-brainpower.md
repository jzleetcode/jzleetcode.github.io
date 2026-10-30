---
author: JZ
pubDatetime: 2026-10-19T19:02:19Z
modDatetime: 2026-10-19T19:02:19Z
title: LeetCode 2140 Solving Questions With Brainpower
featured: false
tags:
  - a-array
  - a-dynamic-programming
description: "Solution for LeetCode 2140, medium, tags: array, dynamic programming."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 2140: Solving Questions With Brainpower](https://leetcode.com/problems/solving-questions-with-brainpower/description/)

You are given `questions`, where `questions[i] = [points, brainpower]`. Solving question `i` earns its points but forces you to skip the next `brainpower` questions. Skipping it lets you decide again at `i + 1`. Find the maximum total points.

Examples:

- `[[3, 2], [4, 3], [4, 4], [2, 5]]` → `5` (solve questions `0` and `3`).
- `[[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]` → `7` (solve questions `1` and `4`).

Constraints:

- $1 \leq \text{questions.length} \leq 10^5$
- $\text{questions}[i].\text{length} = 2$
- $1 \leq \text{points}_i, \text{brainpower}_i \leq 10^5$

## Idea

Let `dp[i]` be the maximum points obtainable starting at question `i`. There are exactly two choices: skip `i` and continue at `i + 1`, or solve `i`, collect its points, and continue after its required skipped questions.

$$
dp[i] = \max\!\left(dp[i+1],\; \text{points}_i + dp[\min(n,\, i+\text{brainpower}_i+1)]\right), \qquad dp[n] = 0.
$$

Compute `dp` from right to left so both later states already exist. Clamp the next index to `n` when solving a question jumps beyond the end.

```text
questions:  [3,2] [4,3] [4,4] [2,5]
index:        0     1     2     3     4 (past end)
dp:           5     4     4     2     0

at i=0: skip → dp[1] = 4
        solve → 3 + dp[3] = 5
```

Only one solution is needed: a top-down recurrence with memoization uses the same algorithm and risks deep recursion at the 100,000-question limit.

## Complexity

For $n$ questions, **time is $O(n)$**: each question contributes one constant-time decision. **Extra space is $O(n)$** for the suffix DP table. The answer can exceed a signed 32-bit integer, so Java, C++, and Rust accumulate in 64-bit integers.

### Java

The repository's utility method is static; for LeetCode submission, use an instance method on `Solution`.

```java []
package dp;

public final class QuestionsBrainpower {
    private QuestionsBrainpower() {}

    /** Backward DP. Time O(n), space O(n). */
    public static long mostPoints(int[][] questions) {
        int length = questions.length;
        long[] dp = new long[length + 1];
        for (int index = length - 1; index >= 0; index--) {
            int next = Math.min(length, index + questions[index][1] + 1);
            dp[index] = Math.max(dp[index + 1], questions[index][0] + dp[next]);
        }
        return dp[0];
    }
}
```

### Python

```python []
"""leet 2140, medium"""


class Solution:
    """Maximum points with O(n) time and O(n) extra space."""

    def mostPoints(self, Q: list[list[int]]) -> int:
        dp = [0] * (len(Q) + 1)
        for i in range(len(Q) - 1, -1, -1):  # Each question is evaluated once.
            points, jump = Q[i][0], Q[i][1]
            dp[i] = max(points + dp[min(jump + i + 1, len(Q))], dp[i + 1])
        return dp[0]
```

### C++

```cpp []
#ifndef QUESTIONSBRAINPOWER_HPP
#define QUESTIONSBRAINPOWER_HPP

#include <algorithm>
#include <vector>

using namespace std;

class Solution {
public:
    long long mostPoints(vector<vector<int>> &questions) {
        const int n = static_cast<int>(questions.size());
        vector<long long> dp(n + 1, 0);
        for (int index = n - 1; index >= 0; --index) {
            const int next = min(n, index + questions[index][1] + 1);
            dp[index] = max(dp[index + 1], static_cast<long long>(questions[index][0]) + dp[next]);
        }
        return dp[0];
    }
};

#endif // QUESTIONSBRAINPOWER_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// O(n) time and O(n) space.
    pub fn most_points(questions: Vec<Vec<i32>>) -> i64 {
        let n = questions.len();
        let mut dp = vec![0i64; n + 1];

        for i in (0..n).rev() {
            let next = (i + questions[i][1] as usize + 1).min(n);
            dp[i] = dp[i + 1].max(questions[i][0] as i64 + dp[next]);
        }

        dp[0]
    }
}
```
