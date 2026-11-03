---
author: JZ
pubDatetime: 2026-11-03T19:31:06Z
modDatetime: 2026-11-03T19:31:06Z
title: LeetCode 1624 Largest Substring Between Two Equal Characters
featured: true
tags:
  - a-string
  - a-hash-table
description: "Solutions for LeetCode 1624, easy, tags: hash table, string."
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

Question link: [LeetCode 1624: Largest Substring Between Two Equal Characters](https://leetcode.com/problems/largest-substring-between-two-equal-characters/description/)

Given a string `s`, return the maximum length of a substring that lies strictly between two equal characters. Return `-1` if no character appears at least twice.

Examples:

- `s = "aa"` → `0`
- `s = "abca"` → `2` (`"bc"`)
- `s = "cbzxy"` → `-1`

Constraints:

- `2 <= s.length <= 100`
- `s` contains only lowercase English letters.

## Idea

For a repeated character at index `right`, the longest valid substring ending there uses that character's earliest occurrence, `first[character]`. Keeping the first index for every letter means we never need to reconsider earlier pairs.

```text
s:       a b c a b a
index:   0 1 2 3 4 5
first:   a -> 0, b -> 1, c -> 2

at 3: a ... a  => 3 - 0 - 1 = 2
at 5: a ..... a => 5 - 0 - 1 = 4   maximum
```

The input is lowercase English letters, so a 26-element array is sufficient. A hash map works as well, but has no advantage here.

## Complexity

Time: `O(n)`, where `n` is the length of `s`. Space: `O(1)` because the first-index table has 26 entries.

### Java

```java []
public final class LargestSubstringBetweenTwoEqualCharacters {
    private LargestSubstringBetweenTwoEqualCharacters() {}

    public static int maxLengthBetweenEqualCharacters(String s) {
        int[] firstIndex = new int[26];
        Arrays.fill(firstIndex, -1);
        int maxLength = -1;

        for (int index = 0; index < s.length(); index++) { // O(n)
            int letter = s.charAt(index) - 'a';
            if (firstIndex[letter] == -1) {
                firstIndex[letter] = index;
            } else {
                maxLength = Math.max(maxLength, index - firstIndex[letter] - 1);
            }
        }
        return maxLength;
    }
}
```

### Python

```python []
class Solution:
    def maxLengthBetweenEqualCharacters(self, s: str) -> int:
        first_index: dict[str, int] = {}
        longest = -1

        for index, char in enumerate(s):  # O(n) total iterations
            if char in first_index:
                longest = max(longest, index - first_index[char] - 1)
            else:
                first_index[char] = index

        return longest
```

### C++

```cpp []
class Solution1624 {
public:
    int maxLengthBetweenEqualCharacters(const std::string& s) {
        std::array<int, 26> firstOccurrence{};
        firstOccurrence.fill(-1);

        int longest = -1;
        for (int index = 0; index < static_cast<int>(s.size()); ++index) {
            const int character = s[index] - 'a';
            if (firstOccurrence[character] == -1) {
                firstOccurrence[character] = index;
            } else {
                longest = std::max(longest, index - firstOccurrence[character] - 1);
            }
        }
        return longest;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn max_length_between_equal_characters(s: String) -> i32 {
        let mut first_index = [-1_i32; 26];
        let mut longest = -1;

        for (index, byte) in s.bytes().enumerate() {
            let slot = (byte - b'a') as usize;
            if first_index[slot] == -1 {
                first_index[slot] = index as i32;
            } else {
                longest = longest.max(index as i32 - first_index[slot] - 1);
            }
        }

        longest
    }
}
```
