---
author: JZ
pubDatetime: 2026-11-21T19:42:11Z
modDatetime: 2026-11-21T19:42:11Z
title: LeetCode 1653 Minimum Deletions to Make String Balanced
featured: true
tags:
  - a-string
  - a-dynamic-programming
description: "Solutions for LeetCode 1653, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Link: [LeetCode 1653](https://leetcode.com/problems/minimum-deletions-to-make-string-balanced/description/)

You are given a string `s` containing only `a` and `b`. The string is balanced when no `b` appears before a later `a`. Return the minimum number of characters to delete to make `s` balanced.

### Constraints

- $1 \leq s.length \leq 10^5$
- `s[i]` is either `a` or `b`.

## Idea

A balanced string has the shape `a* b*`: once a `b` appears, no `a` may follow. For a prefix, keep two values: the minimum deletions needed to balance it, and the number of `b`s seen so far.

When the next character is `b`, it can stay, so increment the `b` count. When it is `a`, either delete this `a` (one more deletion) or keep it and delete every earlier `b`. Take the cheaper choice:

```text
s:            a  a  b  a  b  b
b seen:       0  0  1  1  2  3
min deletions:0  0  0  1  1  1
```

For `aababb`, the answer is one deletion: remove the middle `a` to get `aabbb`.

Complexity: Time $O(n)$, Space $O(1)$.

### Prefix/suffix split

A second way is to try every split between the kept `a`s and the kept `b`s. For a split at index `i`, delete the `b`s before `i` and the `a`s from `i` onward. The remaining characters always have the balanced form `a* b*`. A suffix array counts the `a`s to the right of each split, while a running count tracks `b`s on the left.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
package string;

/**
 * <a href="https://leetcode.com/problems/minimum-deletions-to-make-string-balanced/">LeetCode 1653</a>.
 */
public final class MinimumDeletionsToMakeStringBalanced {
    private MinimumDeletionsToMakeStringBalanced() {}

    /**
     * One-pass dynamic programming. Time O(n), Space O(1).
     */
    public static int minimumDeletions(String s) {
        int deletions = 0;
        int bCount = 0;

        for (int i = 0; i < s.length(); i++) { // O(n) total: each character is processed once.
            char c = s.charAt(i);
            if (c == 'b') {
                bCount++;
            } else {
                // Delete this 'a', or delete all earlier 'b's.
                deletions = Math.min(deletions + 1, bCount);
            }
        }
        return deletions;
    }

    /**
     * Try every split between an all-'a' prefix and all-'b' suffix. Time O(n), Space O(n).
     */
    public static int minimumDeletionsBySplit(String s) {
        int n = s.length();
        int[] suffixACount = new int[n + 1]; // O(n) extra space for suffix counts.

        for (int i = n - 1; i >= 0; i--) { // O(n): build counts from right to left.
            suffixACount[i] = suffixACount[i + 1] + (s.charAt(i) == 'a' ? 1 : 0);
        }

        int prefixBCount = 0;
        int minDeletions = n;
        for (int split = 0; split <= n; split++) { // O(n): evaluate all n + 1 splits.
            minDeletions = Math.min(minDeletions, prefixBCount + suffixACount[split]);
            if (split < n && s.charAt(split) == 'b') {
                prefixBCount++;
            }
        }
        return minDeletions;
    }
}
```

### Python

```python []
"""LeetCode 1653: minimum deletions to make a string balanced."""


class Solution:
    def minimumDeletions(self, s: str) -> int:
        """One-pass DP; O(n) time and O(1) auxiliary space."""
        deletions = 0
        b_count = 0

        for char in s:  # O(n) time; each character is processed once.
            if char == "a":
                # Keep this 'a' by deleting earlier 'b's, or delete this 'a'.
                deletions = min(deletions + 1, b_count)
            else:
                b_count += 1

        return deletions

    def minimumDeletionsBySplit(self, s: str) -> int:
        """Return the minimum deletions by checking every balanced split."""
        n = len(s)
        suffix_a = [0] * (n + 1)  # O(n) auxiliary space.
        for index in range(n - 1, -1, -1):  # O(n) time to count suffix 'a's.
            suffix_a[index] = suffix_a[index + 1] + (s[index] == "a")

        minimum = suffix_a[0]  # Split before the first character.
        prefix_b = 0
        for split in range(1, n + 1):  # O(n) time to scan all split points.
            if s[split - 1] == "b":
                prefix_b += 1
            minimum = min(minimum, prefix_b + suffix_a[split])

        return minimum
```

### C++

```cpp []
#ifndef LEETCODE_MINIMUMDELETIONSTOMAKESTRINGBALANCED_HPP
#define LEETCODE_MINIMUMDELETIONSTOMAKESTRINGBALANCED_HPP

#include <algorithm>
#include <string>
#include <vector>

using namespace std;

class Solution1653 {
public:
    // O(n) time; O(1) extra space. Keep the best result for each prefix.
    int minimumDeletions(const string &s) {
        int bCount = 0;
        int deletions = 0;
        for (char c : s) {
            if (c == 'b') {
                bCount++;
            } else {
                // Delete this 'a', or delete all earlier 'b's.
                deletions = min(deletions + 1, bCount);
            }
        }
        return deletions;
    }

    // O(n) time; O(n) extra space for suffix counts of 'a'.
    int minimumDeletionsBySplit(const string &s) {
        const int n = static_cast<int>(s.size());
        vector<int> suffixA(n + 1, 0);
        for (int i = n - 1; i >= 0; i--) {
            suffixA[i] = suffixA[i + 1] + (s[i] == 'a');
        }

        int prefixB = 0;
        int minimum = n;
        for (int split = 0; split <= n; split++) {
            // Keep 'b's before the split and 'a's after it.
            minimum = min(minimum, prefixB + suffixA[split]);
            if (split < n && s[split] == 'b') {
                prefixB++;
            }
        }
        return minimum;
    }
};

#endif // LEETCODE_MINIMUMDELETIONSTOMAKESTRINGBALANCED_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// One-pass DP. O(n) time, O(1) extra space.
    pub fn minimum_deletions(s: String) -> i32 {
        let mut b_count = 0;
        let mut deletions = 0;

        for &byte in s.as_bytes() {
            if byte == b'b' {
                b_count += 1;
            } else {
                // Delete this 'a', or delete every earlier 'b'.
                deletions = (deletions + 1).min(b_count);
            }
        }

        deletions
    }

    /// Check every split using suffix 'a' counts. O(n) time, O(n) extra space.
    pub fn minimum_deletions_by_split(s: String) -> i32 {
        let bytes = s.as_bytes();
        let n = bytes.len();
        let mut suffix_a = vec![0; n + 1];

        for i in (0..n).rev() {
            suffix_a[i] = suffix_a[i + 1] + i32::from(bytes[i] == b'a');
        }

        let mut prefix_b = 0;
        let mut minimum = n as i32;
        for split in 0..=n {
            minimum = minimum.min(prefix_b + suffix_a[split]);
            if split < n && bytes[split] == b'b' {
                prefix_b += 1;
            }
        }

        minimum
    }
}

```
