---
author: JZ
pubDatetime: 2026-10-26T18:48:10Z
modDatetime: 2026-10-26T18:48:10Z
title: LeetCode 2000 Reverse Prefix of Word
featured: true
tags:
  - a-string
  - a-two-pointers
description: "Solution for LeetCode 2000, easy, tags: string, two pointers."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question Link: [LeetCode 2000](https://leetcode.com/problems/reverse-prefix-of-word/description/)

Given a string `word` and a character `ch`, find the **first** occurrence of `ch` and reverse the part of `word` from the beginning through that character, inclusive. Leave the rest unchanged. If `ch` does not occur, return the original word.

```text
Example 1:
Input: word = "abcdefd", ch = "d"
Output: "dcbaefd"

Example 2:
Input: word = "xyxzxe", ch = "z"
Output: "zxyxxe"

Example 3:
Input: word = "abcd", ch = "z"
Output: "abcd"
```

Constraints:

- `1 <= word.length <= 250`
- `word` consists of lowercase English letters.
- `ch` is a lowercase English letter.

## Idea

Find the first position of `ch`. If there is none, return `word` unchanged. Otherwise put one pointer at the start and another on `ch`, then swap the two characters and move both pointers toward the middle. The suffix after `ch` is never touched.

```text
word:      a b c d | e f d
positions: 0 1 2 3 | 4 5 6
swap 0,3: d b c a | e f d
swap 1,2: d c b a | e f d
result:    d c b a | e f d
```

Stop at the **first** `d`, not the later one. Both the search and the swaps take $O(n)$ time for a word of length $n$. Java and Python make mutable copies and return new strings, requiring $O(n)$ additional space. C++ copies the argument on entry, so its total extra space is $O(n)$, but the reversal itself uses $O(1)$ auxiliary space. Rust takes ownership and reuses the existing string buffer, using $O(1)$ additional space.

### Java

```java []
package string;

/** LeetCode 2000: Reverse Prefix of Word. */
public final class ReversePrefixOfWord {
    private ReversePrefixOfWord() {}

    public static String reversePrefix(String word, char ch) {
        int end = word.indexOf(ch);
        if (end < 0) return word;

        char[] letters = word.toCharArray();
        int left = 0;
        int right = end;
        while (left < right) {
            char temporary = letters[left];
            letters[left++] = letters[right];
            letters[right--] = temporary;
        }
        return new String(letters);
    }
}
```

### Python

```python []
"""LeetCode 2000: Reverse Prefix of Word."""


class Solution:
    def reversePrefix(self, word: str, ch: str) -> str:
        # Searching for the first occurrence takes O(n) time.
        right = word.find(ch)
        if right == -1:
            return word

        letters = list(word)
        left = 0
        while left < right:  # At most n/2 swaps: O(n) time.
            letters[left], letters[right] = letters[right], letters[left]
            left += 1
            right -= 1

        # The mutable copy and the returned string each use O(n) space.
        return "".join(letters)
```

### C++

```cpp []
#ifndef LEETCODE_REVERSE_PREFIX_OF_WORD_HPP
#define LEETCODE_REVERSE_PREFIX_OF_WORD_HPP

#include <string>
#include <utility>

class Solution2000 {
public:
    std::string reversePrefix(std::string word, char ch) {
        const std::size_t end = word.find(ch);
        if (end == std::string::npos) return word;

        for (std::size_t left = 0, right = end; left < right; ++left, --right) {
            std::swap(word[left], word[right]);
        }
        return word;
    }
};

#endif // LEETCODE_REVERSE_PREFIX_OF_WORD_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Time: O(n); extra space: O(1), reusing the word's buffer.
    pub fn reverse_prefix(word: String, ch: char) -> String {
        let mut bytes = word.into_bytes();
        if let Some(mut right) = bytes.iter().position(|&byte| byte == ch as u8) {
            let mut left = 0;
            while left < right {
                bytes.swap(left, right);
                left += 1;
                right -= 1;
            }
        }

        String::from_utf8(bytes).expect("lowercase letters are valid UTF-8")
    }
}
```
