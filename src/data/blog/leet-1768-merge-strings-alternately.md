---
author: JZ
pubDatetime: 2026-10-30T18:40:00Z
modDatetime: 2026-10-30T18:40:00Z
title: LeetCode 1768 Merge Strings Alternately
featured: true
tags:
  - a-string
  - a-two-pointers
description: "Solution for LeetCode 1768, easy, tags: string, two pointers."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 1768: Merge Strings Alternately](https://leetcode.com/problems/merge-strings-alternately/description/)

Given two strings `word1` and `word2`, build a new string by taking one character from `word1`, then one from `word2`, and repeating while both have characters left. Append the leftover suffix from the longer string.

```text
word1 = "abc", word2 = "pqr"  -> "apbqcr"
word1 = "ab",  word2 = "pqrs" -> "apbqrs"
word1 = "abcd", word2 = "pq"  -> "apbqcd"
```

Constraints:

- `1 <= word1.length, word2.length <= 100`
- `word1` and `word2` contain lowercase English letters.

## Idea

Keep one cursor in each word. While both cursors are valid, append the next character from `word1` and then the next character from `word2`. Once one word ends, append both remaining suffixes; one is empty, and the other is exactly the required tail.

```text
word1:  a b c d
         ^
word2:  p q
         ^
result: a p b q c d
```

Every input character is appended once, so the time complexity is $O(m+n)$ for lengths $m$ and $n$. The result needs $O(m+n)$ space; the algorithm itself uses $O(1)$ auxiliary space beyond that result. A second approach would not improve either bound, so the two-pointer merge is the only solution shown.

### Java

```java []
package string;

/** LeetCode 1768: Merge Strings Alternately. */
public final class MergeStringsAlternately {
    private MergeStringsAlternately() {}

    // O(m + n) time and O(1) auxiliary space, excluding the output buffer.
    public static String mergeAlternately(String word1, String word2) {
        StringBuilder merged = new StringBuilder(word1.length() + word2.length());
        int first = 0;
        int second = 0;
        while (first < word1.length() && second < word2.length()) {
            merged.append(word1.charAt(first++));
            merged.append(word2.charAt(second++));
        }
        merged.append(word1, first, word1.length());
        merged.append(word2, second, word2.length());
        return merged.toString();
    }
}
```

### Python

```python []
class Solution:
    def mergeAlternately(self, word1: str, word2: str) -> str:
        merged = []
        shared_length = min(len(word1), len(word2))

        # The loop runs O(min(m, n)) times and appends two characters each time.
        for index in range(shared_length):
            merged.append(word1[index])
            merged.append(word2[index])

        # Appending the one remaining suffix is O(max(m, n)); total time is O(m + n).
        merged.append(word1[shared_length:])
        merged.append(word2[shared_length:])
        return "".join(merged)  # The output buffer uses O(m + n) space.
```

### C++

```cpp []
#ifndef LEETCODE_MERGE_STRINGS_ALTERNATELY_HPP
#define LEETCODE_MERGE_STRINGS_ALTERNATELY_HPP

#include <string>

class Solution1768 {
public:
    // O(m + n) time and O(1) auxiliary space, excluding the O(m + n) result.
    std::string mergeAlternately(const std::string& word1, const std::string& word2) {
        std::string merged;
        merged.reserve(word1.size() + word2.size());
        std::size_t first = 0;
        std::size_t second = 0;
        while (first < word1.size() || second < word2.size()) {
            if (first < word1.size()) merged += word1[first++];
            if (second < word2.size()) merged += word2[second++];
        }
        return merged;
    }
};

#endif // LEETCODE_MERGE_STRINGS_ALTERNATELY_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Time: O(m + n); extra space: O(1), excluding the O(m + n) output.
    /// The problem guarantees lowercase English letters, so byte indexing is safe.
    pub fn merge_alternately(word1: String, word2: String) -> String {
        let mut merged = String::with_capacity(word1.len() + word2.len());
        let (mut i, mut j) = (0, 0);
        while i < word1.len() && j < word2.len() {
            merged.push(word1.as_bytes()[i] as char);
            merged.push(word2.as_bytes()[j] as char);
            i += 1;
            j += 1;
        }
        merged.push_str(&word1[i..]);
        merged.push_str(&word2[j..]);
        merged
    }
}
```
