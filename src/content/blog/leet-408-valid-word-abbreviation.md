---
author: JZ
pubDatetime: 2024-12-09T06:23:00Z
modDatetime: 2024-12-09T06:23:00Z
title: LeetCode 408 LintCode 637 Valid Word Abbreviation
featured: true
tags:
  - a-two-pointers
  - a-string
  - c-facebook
  - c-google
  - leetcode-locked
description:
  "Solutions for LeetCode 408 LintCode 637, easy, tags: two pointers, string, companies: facebook, google."
---

## Table of contents

## Description

Question links: [LeetCode](https://leetcode.com/problems/valid-word-abbreviation), [LintCode](https://www.lintcode.com/problem/637/)

A string can be **abbreviated** by replacing any number of **non-adjacent**, **non-empty** substrings with their lengths. The lengths **should not** have leading zeros.

For example, a string such as `"substitution"` could be abbreviated as (but not limited to):

-   `"s10n"` (`"s ubstitutio n"`)
-   `"sub4u4"` (`"sub stit u tion"`)
-   `"12"` (`"substitution"`)
-   `"su3i1u2on"` (`"su bst i t u ti on"`)
-   `"substitution"` (no substrings replaced)

The following are **not valid** abbreviations:

-   `"s55n"` (`"s ubsti tutio n"`, the replaced substrings are adjacent)
-   `"s010n"` (has leading zeros)
-   `"s0ubstitution"` (replaces an empty substring)

Given a string `word` and an abbreviation `abbr`, return _whether the string **matches** the given abbreviation_.

A **substring** is a contiguous **non-empty** sequence of characters within a string.

```
Example 1:

Input: word = "internationalization", abbr = "i12iz4n"
Output: true
Explanation: The word "internationalization" can be abbreviated as "i12iz4n" ("i nternational iz atio n").

Example 2:

Input: word = "apple", abbr = "a2e"
Output: false
Explanation: The word "apple" cannot be abbreviated as "a2e".
```

**Constraints:**

-   `1 <= word.length <= 20`
-   `word` consists of only lowercase English letters.
-   `1 <= abbr.length <= 10`
-   `abbr` consists of lowercase English letters and digits.
-   All the integers in `abbr` will fit in a 32-bit integer.

## Idea

We can iterate through the abbreviation while maintaining two pointers (indexes) looking at the word and abbreviation.
Each iteration we advance the index `j` in abbreviation so the time complexity is $O(m)$.

1. If the character is a letter, we advance `i` by `x` and compare characters at `i` and `j`. Report `false` if not equal.
2. If the character is a number, we accumulate the number in case the number is more than one digit.
3. When we exit the loop, we make sure the two pointers are at the end of the string.

`let n=word.length and m=abbr.length`

Complexity: Time $O(m)$, Space $O(1)$.

### C++

```cpp
// 20 ms, 2.82 mb.
class Solution {
public:
    /**
     * @param word: a non-empty string
     * @param abbr: an abbreviation
     * @return: true if string matches with the given abbr or false
     */
    bool validWordAbbreviation(string &word, string &abbr) {
        int n = word.size(), m = abbr.size(), i = 0, j = 0, x = 0;
        while (i < n && j < m) {
            if (isdigit(abbr[j])) {
                if (x == 0 && abbr[j] == '0') return false;
                x = 10 * x + abbr[j] - '0';
            } else {
                i += x;
                x = 0;
                if (i >= n || abbr[j] != word[i]) return false;
                i++;
            }
            j++;
        }
        return i + x == n && j == m;
    }
};
```

### Python

```python
class Solution:
    """81 ms, 5.14 mb"""

    def validWordAbbreviation(self, word: str, abbr: str) -> bool:
        n, m = map(len, (word, abbr))
        i = j = x = 0
        while i < n and j < m:
            if abbr[j].isdigit():
                if abbr[j] == '0' and x == 0:
                    return False
                x = x * 10 + int(abbr[j])
            else:
                i += x
                x = 0
                if i >= n or word[i] != abbr[j]:
                    return False
                i += 1
            j += 1
        return i + x == n and j == m
```

### Rust

Rust `Iterator` `advance_by()` method is still experimental. Otherwise, we could consider using two iterators.

```rust
/// 42 ms, 3.16 mb
impl Solution {
    pub fn valid_word_abbreviation(word: String, abbr: String) -> bool {
        let (wc, ac): (Vec<char>, Vec<char>) = (word.chars().collect(), abbr.chars().collect());
        let (mut i, mut j, mut x) = (0, 0, 0);
        let (n, m) = (wc.len(), ac.len());
        while i < n && j < m {
            if ac[j].is_numeric() {
                if ac[j] == '0' && x == 0 { return false; }
                x = x * 10 + ac[j].to_digit(10).unwrap() as usize;
            } else {
                i += x;
                x = 0;
                if i >= n || wc[i] != ac[j] { return false; }
                i += 1;
            }
            j += 1;
        }
        i + x == n && j == m
    }
}
```
