---
author: JZ
pubDatetime: 2026-10-02T19:30:39Z
modDatetime: 2026-10-02T19:30:39Z
title: LeetCode 2730 Find the Longest Semi-Repetitive Substring
featured: true
tags:
  - a-sliding-window
description: "Solutions for LeetCode 2730, medium, tags: string, sliding window, two pointers."
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

Question link: [LeetCode 2730: Find the Longest Semi-Repetitive Substring](https://leetcode.com/problems/find-the-longest-semi-repetitive-substring/description/)

Given a digit string `s`, return the length of its longest substring with at most one pair of equal adjacent digits. Each adjacent match counts as a pair, so `"111"` contains two pairs (`11` at positions 0–1 and 1–2) and is not semi-repetitive.

Examples:

- `s = "52233"` → `4` (for example, `"5223"`)
- `s = "5494"` → `4`
- `s = "1111111"` → `2`

Constraints:

- `1 <= s.length <= 50`
- `'0' <= s[i] <= '9'`

## Idea

Use a sliding window `[left, right]` and count equal adjacent pairs inside it. Extending the right edge can add only one new pair: compare `s[right]` with `s[right - 1]`. If the count becomes greater than one, advance `left` until the pair count is valid again. When removing the leftmost digit, the only pair that disappears is between `s[left]` and `s[left + 1]`.

For `"52233"`, the full window has two pairs, `22` and `33`. Shrinking past the first pair restores the invariant:

```text
Index:   0 1 2 3 4
Digits:  5 2 2 3 3
Window: [5 2 2 3 3]  two pairs (22, 33): invalid
Shrink:   [2 2 3 3]  still two pairs
Then:       [2 3 3]  one pair (33): valid
```

Every character enters the window once, and `left` only moves forward, so shrinking across the whole scan is linear rather than quadratic.

## Complexity

Time: `O(n)`, where `n` is the length of `s`. Space: `O(1)` extra space.

### Java

```java []
public final class LongestSemiRepetitiveSubstring {

    private LongestSemiRepetitiveSubstring() {
    }

    public static int longestSemiRepetitiveSubstring(String s) {
        int left = 0;
        int equalPairs = 0;
        int maximum = 0;

        // O(n) time: each character enters and leaves the window at most once.
        for (int right = 0; right < s.length(); right++) {
            if (right > 0 && s.charAt(right) == s.charAt(right - 1)) {
                equalPairs++;
            }

            // O(n) total shrinking across the full scan; the window uses O(1) space.
            while (equalPairs > 1) {
                if (s.charAt(left) == s.charAt(left + 1)) {
                    equalPairs--;
                }
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
class Solution:
    def longestSemiRepetitiveSubstring(self, s: str) -> int:
        left = 0
        equal_pairs = 0
        longest = 0

        for right in range(len(s)):  # O(n) time; each character enters the window once.
            if right > 0 and s[right] == s[right - 1]:
                equal_pairs += 1

            while equal_pairs > 1:  # O(n) total; left advances at most n times.
                if s[left] == s[left + 1]:
                    equal_pairs -= 1
                left += 1

            longest = max(longest, right - left + 1)

        return longest
```

### C++

```cpp []
#pragma once

#include <algorithm>
#include <string>

using namespace std;

class Solution {
public:
    int longestSemiRepetitiveSubstring(string s) {
        int equalPairs = 0;
        int longest = 0;

        // Each character enters the window once, so the expansion is O(n).
        for (int left = 0, right = 0; right < (int)s.size(); right++) {
            if (right > 0 && s[right] == s[right - 1]) {
                equalPairs++;
            }

            // Each character leaves the window at most once, so shrinking is O(n).
            while (equalPairs > 1) {
                if (left + 1 <= right && s[left] == s[left + 1]) {
                    equalPairs--;
                }
                left++;
            }

            longest = max(longest, right - left + 1);
        }

        return longest;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn longest_semi_repetitive_substring(s: String) -> i32 {
        let digits = s.as_bytes();
        let mut left = 0;
        let mut equal_pairs = 0;
        let mut longest = 0;

        // The right edge advances once, so this loop is O(n) time overall.
        for right in 0..digits.len() {
            if right > 0 && digits[right] == digits[right - 1] {
                equal_pairs += 1;
            }

            // Each left-edge advance removes one pair at most, keeping this O(n).
            while equal_pairs > 1 {
                if digits[left] == digits[left + 1] {
                    equal_pairs -= 1;
                }
                left += 1;
            }

            longest = longest.max(right - left + 1);
        }

        longest as i32
    }
}
```
