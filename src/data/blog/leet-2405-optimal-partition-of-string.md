---
author: JZ
pubDatetime: 2026-11-23T19:44:01Z
modDatetime: 2026-11-23T19:44:01Z
title: LeetCode 2405 Optimal Partition of String
featured: true
tags:
  - a-greedy
  - a-string
  - a-hash
description: "Solutions for LeetCode 2405, medium, tags: hash table, string, greedy."
---

## Table of contents

## Description

Question Links: [LeetCode 2405](https://leetcode.com/problems/optimal-partition-of-string/description/)

Given a string `s`, split it into the fewest possible substrings so that no substring contains the same letter twice. Keep the letters in their original order, and use every letter exactly once.

Example 1:

```text
Input: s = "abacaba"
Output: 4
```

One minimum partition is `ab | ac | ab | a`.

Example 2:

```text
Input: s = "ssssss"
Output: 6
```

Each `s` must be placed in its own substring.

**Constraints:**

- $1 \leq s.length \leq 10^5$
- `s` consists of only English lowercase letters.

## Idea

Scan from left to right and keep the letters in the current substring. When the next letter is already present, close the current substring before that letter, clear the set, and start the next substring with the repeated letter.

For `abacaba`, the second `a` forces the first boundary. The same rule then applies to the remaining suffix:

```text
s:          a b a c a b a
seen state: 0 1 x 0 x 1 x
parts:      [a b] | [a c] | [a b] | [a]
                  ^       ^       ^
x = this letter repeated in the current part, so start a new part here
```

### Why the greedy split is optimal

A substring can grow up to, but not include, the first letter that repeats inside it. Any valid partition starting at the same position must end its first substring no later than that point. If it ends earlier, we can move the following distinct letters into the first substring; that remains valid and leaves fewer letters for the rest of the partition. So choosing the longest valid prefix never needs more substrings. Apply the same argument to the remaining suffix.

### Hash set

The set stores which lowercase letters already appear in the current substring. A repeated letter increases the answer, clears the set, and is inserted as the first letter of the next substring.

Time: expected $O(n)$, because each character uses a constant number of average-case set operations.

Space: $O(1)$, because the set contains at most 26 lowercase letters.

### Bitmask

The alternative uses one bit for each letter: `a` maps to bit 0, `b` to bit 1, through `z` at bit 25. Checking and setting a bit replaces set membership; a repeated bit triggers the same greedy split.

Time: $O(n)$.

Space: $O(1)$, using one 26-bit mask.

### Java

```java []
package string;

import java.util.HashSet;
import java.util.Set;

/** Greedy solutions for LeetCode 2405, Optimal Partition of String. */
public final class OptimalPartitionOfString {

    private OptimalPartitionOfString() {
    }

    /** O(n) time and O(1) space for the fixed lowercase alphabet. */
    public static int partitionString(String s) {
        int partitions = 1; // The input is nonempty.
        Set<Character> seen = new HashSet<>();
        for (int i = 0; i < s.length(); i++) {
            char letter = s.charAt(i);
            if (!seen.add(letter)) {
                partitions++;
                seen.clear(); // At most 26 letters to clear.
                seen.add(letter);
            }
        }
        return partitions;
    }

    /** O(n) time and O(1) space using one bit per lowercase letter. */
    public static int partitionStringBitmask(String s) {
        int partitions = 1;
        int seen = 0;
        for (int i = 0; i < s.length(); i++) {
            int bit = 1 << (s.charAt(i) - 'a');
            if ((seen & bit) != 0) {
                partitions++;
                seen = 0;
            }
            seen |= bit;
        }
        return partitions;
    }
}
```

### Python

```python []
class Solution:
    """Greedy partitioning with a set of letters in the current substring."""

    def partitionString(self, s: str) -> int:
        seen = set()
        partitions = 1
        for char in s:  # O(n): each character is visited once.
            if char in seen:  # O(1) expected; at most 26 lowercase letters are stored.
                partitions += 1
                seen.clear()
            seen.add(char)
        return partitions


class Solution2:
    """Greedy partitioning with one bit per lowercase letter."""

    def partitionString(self, s: str) -> int:
        seen = 0
        partitions = 1
        for char in s:  # O(n): each character is visited once.
            bit = 1 << (ord(char) - ord("a"))
            if seen & bit:
                partitions += 1
                seen = 0
            seen |= bit
        return partitions
```

### C++

```cpp []
#pragma once

#include <cstdint>
#include <string>
#include <unordered_set>

namespace optimal_partition_of_string {
class Solution {
public:
    // LeetCode 2405. Expected O(n) time and O(1) space for 26 letters.
    int partitionString(const std::string& s) {
        int partitions = 1;
        std::unordered_set<char> seen;
        for (char letter : s) {
            if (seen.contains(letter)) {
                ++partitions;
                seen.clear();
            }
            seen.insert(letter);
        }
        return partitions;
    }

    // O(n) time and O(1) space with one bit per lowercase letter.
    int partitionStringBitmask(const std::string& s) {
        int partitions = 1;
        std::uint32_t seen = 0;
        for (char letter : s) {
            const std::uint32_t bit = std::uint32_t{1} << (letter - 'a');
            if ((seen & bit) != 0) {
                ++partitions;
                seen = 0;
            }
            seen |= bit;
        }
        return partitions;
    }
};
} // namespace optimal_partition_of_string
```

### Rust

```rust []
use std::collections::HashSet;

pub struct Solution;

impl Solution {
    /// Greedy scan with a set. O(n) time and O(1) extra space for 26 letters.
    pub fn partition_string(s: String) -> i32 {
        let mut partitions = 1;
        let mut seen = HashSet::new();
        for letter in s.bytes() {
            if !seen.insert(letter) {
                partitions += 1;
                seen.clear();
                seen.insert(letter);
            }
        }
        partitions
    }

    /// Greedy scan with a 26-bit mask. O(n) time and O(1) extra space.
    pub fn partition_string_bitmask(s: String) -> i32 {
        let mut partitions = 1;
        let mut seen = 0_u32;
        for letter in s.bytes() {
            let bit = 1_u32 << (letter - b'a');
            if seen & bit != 0 {
                partitions += 1;
                seen = 0;
            }
            seen |= bit;
        }
        partitions
    }
}
```
