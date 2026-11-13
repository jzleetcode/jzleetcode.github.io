---
author: JZ
pubDatetime: 2026-11-13T19:46:32Z
modDatetime: 2026-11-13T19:46:32Z
title: LeetCode 1208 Get Equal Substrings Within Budget
featured: true
tags:
  - a-string
  - a-sliding-window
description: "Solutions for LeetCode 1208, medium, tags: string, sliding window."
---

## Table of contents

## Description

Question Link: [LeetCode 1208](https://leetcode.com/problems/get-equal-substrings-within-budget/description/)

Given two strings `s` and `t` of the same length, changing `s[i]` to `t[i]` costs the absolute difference between their ASCII values. Return the longest substring of `s` whose corresponding characters in `t` can be matched with total cost at most `maxCost`.

**Constraints:**

- $1 \leq s.length = t.length \leq 10^5$
- $0 \leq maxCost \leq 10^6$
- `s` and `t` consist of only lowercase English letters.

## Idea

For each position, compute the cost `abs(s[i] - t[i])`. These costs are nonnegative, so a sliding window works: extend the right edge and add its cost. If the total exceeds `maxCost`, move the left edge forward and subtract each removed character's cost until the window is valid again. Record the longest valid window after each expansion.

```text
index:  0 1 2 3
s:      a b c d
t:      b c d f
cost:   1 1 1 2
        └─────┘
        cost = 3 (maxCost = 3)
```

The first three characters fit the budget. Adding the last character raises the cost to 5, so the left side moves until the window cost is at most 3 again. Each index enters and leaves the window at most once.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
package sliding;

public final class EqualSubstringWithinBudget {

    private EqualSubstringWithinBudget() {
    }

    public static int equalSubstring(String s, String t, int maxCost) {
        int left = 0;
        int cost = 0;
        int maximum = 0;

        // O(n) time: each position enters and leaves the window at most once; O(1) extra space.
        for (int right = 0; right < s.length(); right++) {
            cost += Math.abs(s.charAt(right) - t.charAt(right));
            while (cost > maxCost) {
                cost -= Math.abs(s.charAt(left) - t.charAt(left));
                left++;
            }
            maximum = Math.max(maximum, right - left + 1);
        }
        return maximum;
    }
}
```

### Python

```python []
"""LeetCode 1208, medium, tags: string, sliding window."""


class Solution:
    def equalSubstring(self, s: str, t: str, maxCost: int) -> int:
        """Sliding window, O(n) time and O(1) extra space."""
        left = cost = best = 0
        for right in range(len(s)):  # O(n): visit each right endpoint once.
            cost += abs(ord(s[right]) - ord(t[right]))
            while cost > maxCost:  # O(n) amortized: left advances at most n times overall.
                cost -= abs(ord(s[left]) - ord(t[left]))
                left += 1
            best = max(best, right - left + 1)
        return best
```

### C++

```cpp []
#pragma once
#include <algorithm>
#include <cstdlib>
#include <string>

using namespace std;

// LeetCode 1208: Get Equal Substrings Within Budget
class SolutionEqualSubstringWithinBudget {
public:
    // Sliding window. O(n) time, O(1) extra space.
    int equalSubstring(const string& s, const string& t, int maxCost) {
        int left = 0, cost = 0, longest = 0;
        for (int right = 0; right < (int)s.size(); right++) {
            cost += abs(s[right] - t[right]);
            while (cost > maxCost) {
                cost -= abs(s[left] - t[left]);
                ++left;
            }
            longest = max(longest, right - left + 1);
        }
        return longest;
    }
};
```

### Rust

```rust []
/// LeetCode 1208: Get Equal Substrings Within Budget.
pub struct Solution;

impl Solution {
    /// Sliding window over ASCII byte differences, O(n) time and O(1) extra space.
    pub fn equal_substring(s: String, t: String, max_cost: i32) -> i32 {
        let (s, t) = (s.as_bytes(), t.as_bytes());
        let (mut left, mut cost, mut longest) = (0, 0, 0);

        for right in 0..s.len() {
            cost += s[right].abs_diff(t[right]) as i32;

            while cost > max_cost {
                cost -= s[left].abs_diff(t[left]) as i32;
                left += 1;
            }

            longest = longest.max(right + 1 - left);
        }

        longest as i32
    }
}
```
