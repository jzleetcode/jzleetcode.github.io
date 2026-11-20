---
author: JZ
pubDatetime: 2026-11-20T19:44:13Z
modDatetime: 2026-11-20T19:44:13Z
title: LeetCode 3042 Count Prefix and Suffix Pairs I
featured: true
tags:
  - a-string
  - a-array
description: "Count prefix and suffix pairs by checking each ordered index pair."
---

## Table of contents

## Description

[LeetCode 3042: Count Prefix and Suffix Pairs I](https://leetcode.com/problems/count-prefix-and-suffix-pairs-i/)

Given an array `words`, count the index pairs `(i, j)` with `i < j` for which `words[i]` is both a prefix and a suffix of `words[j]`. Equal words qualify, but their indices must still be different.

For example, `words = ["a", "aba", "ababa", "aa"]` gives `4`: the matching pairs are `(0, 1)`, `(0, 2)`, `(0, 3)`, and `(1, 2)`.

**Constraints:**

- `1 <= words.length <= 50`
- `1 <= words[i].length <= 10`
- Each word consists only of lowercase English letters.

## Idea

Examine each pair once by letting `j` start at `i + 1`. Count the pair only when the earlier word matches both ends of the later word. A longer earlier word cannot match either end, and the same word can match both ends even when those ends overlap.

```text
earlier: aba
later:   ababa
prefix:  aba
suffix:    aba

Both ends match, so count this pair.
```

The loops visit every pair with `i < j` exactly once. For each pair, the two string checks are true precisely when the pair meets the requirement, so the count is correct.

Let `n` be the number of words and `L` their maximum length. There are $n(n-1)/2$ pairs, and checking both ends costs $O(L)$ per pair. **Time:** $O(n^2 L)$. **Auxiliary space:** $O(1)$.

### Java

```java []
package string;

/** LeetCode 3042: Count Prefix and Suffix Pairs I. */
public final class CountPrefixAndSuffixPairsI {
    private CountPrefixAndSuffixPairsI() {}

    // O(n^2 * L) time for n words of maximum length L; O(1) auxiliary space.
    public static int countPrefixSuffixPairs(String[] words) {
        int count = 0;
        for (int i = 0; i < words.length; i++) {
            for (int j = i + 1; j < words.length; j++) {
                if (words[j].startsWith(words[i]) && words[j].endsWith(words[i])) {
                    count++;
                }
            }
        }
        return count;
    }
}
```

### Python

```python []
"""leet 3042, easy"""


class Solution:
    def countPrefixSuffixPairs(self, words: list[str]) -> int:
        n = len(words)
        count = 0

        # Step 1: Iterate through each pair of words
        for i in range(n):
            for j in range(i + 1, n):
                str1 = words[i]
                str2 = words[j]

                # Step 2: Skip if the first string is larger than the second
                if len(str1) > len(str2):
                    continue

                # Step 3: Check if str1 is both the prefix and suffix of str2
                if str2.startswith(str1) and str2.endswith(str1):
                    count += 1

        # Step 4: Return the total count of prefix-suffix pairs
        return count
```

### C++

```cpp []
#ifndef LEETCODE_COUNT_PREFIX_AND_SUFFIX_PAIRS_I_HPP
#define LEETCODE_COUNT_PREFIX_AND_SUFFIX_PAIRS_I_HPP

#include <string>
#include <vector>

class Solution3042 {
public:
    int countPrefixSuffixPairs(const std::vector<std::string>& words) {
        int count = 0;
        // O(n^2) pairs, with O(L) comparisons and O(1) auxiliary space.
        for (std::size_t i = 0; i < words.size(); ++i) {
            for (std::size_t j = i + 1; j < words.size(); ++j) {
                const std::string& prefix = words[i];
                const std::string& word = words[j];
                if (prefix.size() <= word.size() &&
                    word.compare(0, prefix.size(), prefix) == 0 &&
                    word.compare(word.size() - prefix.size(), prefix.size(), prefix) == 0) {
                    ++count;
                }
            }
        }
        return count;
    }
};

#endif // LEETCODE_COUNT_PREFIX_AND_SUFFIX_PAIRS_I_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Time: O(n² · L); auxiliary space: O(1), where L is the maximum word length.
    pub fn count_prefix_suffix_pairs(words: Vec<String>) -> i32 {
        let mut count = 0;
        for (i, prefix) in words.iter().enumerate() {
            for word in &words[i + 1..] {
                if word.starts_with(prefix.as_str()) && word.ends_with(prefix.as_str()) {
                    count += 1;
                }
            }
        }
        count
    }
}
```
