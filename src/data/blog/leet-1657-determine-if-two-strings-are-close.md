---
author: JZ
pubDatetime: 2026-10-22T18:55:32Z
modDatetime: 2026-10-22T18:55:32Z
title: LeetCode 1657 Determine if Two Strings Are Close
featured: true
tags:
  - a-hash-table
  - a-string
  - a-sorting
description: "Solution for LeetCode 1657, medium, tags: hash table, string, sorting, counting."
---

## Table of contents

## Description

Question Link: [LeetCode 1657](https://leetcode.com/problems/determine-if-two-strings-are-close/description/)

Two strings are **close** if one can be transformed into the other using either operation any number of times:

1. Swap any two positions in the string.
2. Choose two different characters already present in the string and exchange **all** occurrences of those characters.

Given `word1` and `word2`, return whether they are close.

```text
Example 1:
Input: word1 = "abc", word2 = "bca"
Output: true

Example 2:
Input: word1 = "a", word2 = "aa"
Output: false

Example 3:
Input: word1 = "cabbba", word2 = "abbccc"
Output: true

Constraints:
1 <= word1.length, word2.length <= 10^5
word1 and word2 contain only lowercase English letters.
```

## Idea: Character Support and Frequency Multiset

Position swaps can rearrange characters but cannot change their counts. Exchanging two existing characters can swap their counts, but cannot introduce a character that was absent. Therefore, close strings must have **both** the same set of present characters and the same multiset of nonzero frequencies.

These conditions are sufficient, too: exchange character labels until each letter has the desired frequency, then swap positions to match the target string.

```text
word1 = "cabbba"        word2 = "abbccc"

letter       a  b  c      letter       a  b  c
count        2  3  1      count        1  2  3
present      Y  Y  Y      present      Y  Y  Y

sorted counts: [1, 2, 3]  ==  [1, 2, 3]  -> true

"ab" vs "cd": frequencies match, but present letters differ -> false
```

Count each lowercase letter in two arrays of length 26. Reject different lengths or different present-letter sets, then sort both count arrays and compare them. We need only this one algorithm: using a hash map instead of a fixed array implements the same invariant, not a distinct approach.

Complexity: Time $O(n + 26 \log 26) = O(n)$ and extra space $O(26) = O(1)$, where $n$ is the length of either word. Sorting only 26 counts is constant work regardless of input length.

### Java

```java []
package hash;

import java.util.Arrays;

public final class DetermineIfTwoStringsAreClose {
    private DetermineIfTwoStringsAreClose() {}

    public static boolean closeStrings(String word1, String word2) {
        if (word1.length() != word2.length()) {
            return false;
        }

        int[] firstCounts = new int[26];
        int[] secondCounts = new int[26];
        for (int index = 0; index < word1.length(); index++) {
            firstCounts[word1.charAt(index) - 'a']++;
            secondCounts[word2.charAt(index) - 'a']++;
        }

        for (int index = 0; index < 26; index++) {
            if ((firstCounts[index] == 0) != (secondCounts[index] == 0)) {
                return false;
            }
        }

        Arrays.sort(firstCounts);
        Arrays.sort(secondCounts);
        return Arrays.equals(firstCounts, secondCounts);
    }
}
```

### Python

```python []
"""LeetCode 1657, medium, tags: hash table, string, sorting, counting."""


class Solution:
    def closeStrings(self, word1: str, word2: str) -> bool:
        """Compare character sets and frequency multisets.

        Time O(n) for n characters and a fixed 26-letter alphabet.
        Space O(1) for two arrays of 26 counts.
        """
        if len(word1) != len(word2):
            return False

        first_counts = [0] * 26
        second_counts = [0] * 26
        for char in word1:  # O(n)
            first_counts[ord(char) - ord('a')] += 1
        for char in word2:  # O(n)
            second_counts[ord(char) - ord('a')] += 1

        for first, second in zip(first_counts, second_counts):  # O(26)
            if (first == 0) != (second == 0):
                return False

        return sorted(first_counts) == sorted(second_counts)  # O(26 log 26) = O(1)
```

### C++

```cpp []
#ifndef LEETCODE_DETERMINEIFTWOSTRINGSARECLOSE_HPP
#define LEETCODE_DETERMINEIFTWOSTRINGSARECLOSE_HPP

#include <algorithm>
#include <array>
#include <string>

class Solution {
public:
    bool closeStrings(const std::string &word1, const std::string &word2) {
        if (word1.size() != word2.size()) {
            return false;
        }

        std::array<int, 26> frequencies1{};
        std::array<int, 26> frequencies2{};
        for (char character : word1) {
            ++frequencies1[character - 'a'];
        }
        for (char character : word2) {
            ++frequencies2[character - 'a'];
        }

        for (int index = 0; index < 26; ++index) {
            if ((frequencies1[index] == 0) != (frequencies2[index] == 0)) {
                return false;
            }
        }

        std::sort(frequencies1.begin(), frequencies1.end());
        std::sort(frequencies2.begin(), frequencies2.end());
        return frequencies1 == frequencies2;
    }
};

#endif
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn close_strings(word1: String, word2: String) -> bool {
        if word1.len() != word2.len() {
            return false;
        }

        let mut first_counts = [0usize; 26];
        let mut second_counts = [0usize; 26];
        for (first, second) in word1.bytes().zip(word2.bytes()) {
            first_counts[(first - b'a') as usize] += 1;
            second_counts[(second - b'a') as usize] += 1;
        }

        if first_counts
            .iter()
            .zip(second_counts.iter())
            .any(|(&first, &second)| (first == 0) != (second == 0))
        {
            return false;
        }

        first_counts.sort_unstable();
        second_counts.sort_unstable();
        first_counts == second_counts
    }
}
```
