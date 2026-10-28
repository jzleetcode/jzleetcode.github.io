---
author: JZ
pubDatetime: 2026-10-28T19:09:11Z
modDatetime: 2026-10-28T19:09:11Z
title: LeetCode 1963 Minimum Number of Swaps to Make the String Balanced
featured: true
tags:
  - a-string
  - a-stack
  - a-greedy
description: "An O(n)-time, O(1)-space solution to LeetCode 1963 using unmatched brackets."
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

Question link: [LeetCode 1963: Minimum Number of Swaps to Make the String Balanced](https://leetcode.com/problems/minimum-number-of-swaps-to-make-the-string-balanced/description/)

Given a string `s` containing equal numbers of `[` and `]`, swap any two characters as many times as needed to make it balanced. Return the minimum number of swaps. A balanced string can be empty, two balanced strings joined together, or a balanced string wrapped in `[` and `]`.

For example, `s = "][]["` needs one swap, `s = "]]][[["` needs two, and `s = "[]"` needs none.

**Constraints:**

- `n == s.length`
- `2 <= n <= 10^6`, and `n` is even.
- Each character of `s` is `[` or `]`.
- The counts of `[` and `]` are both `n / 2`.

## Idea

Match each closing bracket with an earlier unmatched opening bracket, if one exists. This is the same matching rule as a stack, but the **count** of unmatched openings is enough: increment for `[`, and decrement for `]` when the count is positive. Ignore a `]` that has no opening to match.

Because the two bracket types occur equally often, the scan leaves the same number `k` of unmatched openings and unmatched closings. Removing all matched pairs would leave `k` closing brackets followed by `k` opening brackets. One swap can match at most two of these pairs; swapping a closing bracket near the front with an opening bracket near the end achieves that reduction. When one pair remains, one final swap handles it. Therefore the answer is `ceil(k / 2)`, implemented as `(k + 1) / 2` with integer division.

```text
s = ] ] ] [ [ [
    ^ ^ ^       unmatched closings
          ^ ^ ^ unmatched openings

k = 3, so ceil(3 / 2) = 2 swaps.

]]][[[  ->  []][[]  ->  [][[]]
 swap 0,5    swap 2,4   balanced
```

An explicit stack would only store the same unmatched count, so it is not a distinct second algorithm.

## Complexity

Let `n = s.length`. The scan processes each character once, giving **$O(n)$ time**. It stores only one counter, giving **$O(1)$ auxiliary space**, even when `n` reaches one million.

### Java

```java []
class Solution {
    public int minSwaps(String s) {
        int ss = 0; // stack size
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '[') ss++;
            else if (ss > 0) ss--;
        }
        return (ss + 1) / 2;
    }
}
```

The Java repository keeps this `Solution` as a nested class inside `MinSwapsBalance`; submit the inner class on LeetCode.

### Python

```python []
class Solution:
    def minSwaps(self, s: str) -> int:
        """Return the minimum swaps in O(n) time and O(1) extra space."""
        unmatched_open = 0
        for bracket in s:  # O(n): each bracket is examined once.
            if bracket == "[":
                unmatched_open += 1
            elif unmatched_open:
                unmatched_open -= 1

        return (unmatched_open + 1) // 2
```

### C++

```cpp []
#include <string>

namespace MinSwapsBalance {

class Solution {
public:
    int minSwaps(const std::string& s) {
        int unmatchedOpen = 0;
        for (char bracket : s) {
            if (bracket == '[') {
                ++unmatchedOpen;
            } else if (unmatchedOpen > 0) {
                --unmatchedOpen;
            }
        }
        return (unmatchedOpen + 1) / 2;
    }
};

}
```

The C++ repository uses a namespace to avoid collisions with other `Solution` classes. Remove the namespace when submitting on LeetCode.

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn min_swaps(s: String) -> i32 {
        let mut unmatched_open = 0;

        for bracket in s.bytes() {
            if bracket == b'[' {
                unmatched_open += 1;
            } else if bracket == b']' && unmatched_open > 0 {
                unmatched_open -= 1;
            }
        }

        (unmatched_open + 1) / 2
    }
}
```
