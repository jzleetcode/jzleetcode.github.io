---
author: JZ
pubDatetime: 2026-06-29T06:00:00Z
modDatetime: 2026-06-29T06:00:00Z
title: LeetCode 2131 Longest Palindrome by Concatenating Two Letter Words
featured: true
tags:
  - a-greedy
  - a-hash
description:
  "Solutions for LeetCode 2131, medium, tags: array, hash table, string, greedy, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 2131](https://leetcode.com/problems/longest-palindrome-by-concatenating-two-letter-words/description/)

You are given an array of strings `words`. Each element of `words` consists of **two** lowercase English letters.

Create the **longest possible palindrome** by selecting some elements from `words` and concatenating them in **any order**. Each element can be selected **at most once**.

Return the **length** of the longest palindrome that you can create. If it is impossible to create any palindrome, return `0`.

A **palindrome** is a string that reads the same forward and backward.

```
Example 1:

Input: words = ["lc","cl","gg"]
Output: 6
Explanation: One longest palindrome is "lc" + "gg" + "cl" = "lcggcl", of length 6.
Note that "cleli" is another longest palindrome that can be created.

Example 2:

Input: words = ["ab","ty","yt","lc","cl","ab"]
Output: 8
Explanation: One longest palindrome is "ty" + "lc" + "cl" + "yt" = "tylcclyt", of length 8.

Example 3:

Input: words = ["cc","ll","xx"]
Output: 2
Explanation: One longest palindrome is "cc", of length 2.
"ll" is another longest palindrome, so is "xx".
```

**Constraints:**

- `1 <= words.length <= 10^5`
- `words[i].length == 2`
- `words[i]` consists of lowercase English letters.

## Idea: Greedy with Hash Map

We categorize words into two types:

1. **Palindromic words** — both characters are the same (e.g., `"aa"`, `"bb"`)
2. **Non-palindromic words** — characters differ (e.g., `"ab"`, `"lc"`)

For a valid palindrome built by concatenation, non-palindromic words must be used in mirror pairs: if we place `"ab"` on the left half, we need `"ba"` on the right half. Each such pair contributes 4 characters.

For palindromic words, pairs can be placed symmetrically (one on each side, contributing 4). Additionally, exactly **one** unpaired palindromic word can sit in the center, contributing 2.

```
Palindrome structure:

    [non-pal pairs] [pal pairs] [center?] [pal pairs] [non-pal pairs]
     "ab" "lc"       "aa"        "gg"      "aa"       "cl" "ba"
     ←——left——→                  center               ←——right——→

Algorithm:
1. Count frequency of each word
2. For palindromic words (w[0]==w[1]):
   - pairs = freq // 2 → contributes pairs * 4
   - if any has odd freq → one center available (+2)
3. For non-palindromic words:
   - only process once per pair (word < reverse)
   - pairs = min(freq[word], freq[reverse]) → pairs * 4
```

Complexity: Time $O(n)$ — one pass to count, one pass over unique words. Space $O(n)$ for the frequency map.

### Java

```java []
// lc 2131, greedy + hash, O(n) time, O(n) space.
public static int longestPalindrome(String[] words) {
    Map<String, Integer> freq = new HashMap<>();
    for (String w : words) {
        freq.merge(w, 1, Integer::sum);           // O(n)
    }

    int length = 0;
    boolean hasOddCenter = false;

    for (Map.Entry<String, Integer> entry : freq.entrySet()) {
        String word = entry.getKey();
        int count = entry.getValue();

        if (word.charAt(0) == word.charAt(1)) {
            // Palindromic word
            int pairs = count / 2;
            length += pairs * 4;                  // O(1) per word
            if (count % 2 == 1) {
                hasOddCenter = true;
            }
        } else {
            // Non-palindromic: pair with reverse, process once
            String rev = "" + word.charAt(1) + word.charAt(0);
            if (word.compareTo(rev) < 0) {        // avoid double-counting
                int revCount = freq.getOrDefault(rev, 0);
                int pairs = Math.min(count, revCount);
                length += pairs * 4;
            }
        }
    }

    if (hasOddCenter) {
        length += 2;
    }

    return length;
}
```

```python []
# lc 2131, greedy + hash, O(n) time, O(n) space.
class Solution:
    def longestPalindrome(self, words: list[str]) -> int:
        count = Counter(words)                       # O(n) space
        length = 0
        has_center = False

        for word, freq in count.items():             # O(n) unique words
            rev = word[1] + word[0]
            if word == rev:
                # Palindromic word like "aa", "bb"
                pairs = freq // 2
                length += pairs * 4
                if freq % 2 == 1:
                    has_center = True
            elif word < rev and rev in count:
                # Non-palindromic pair like "ab"/"ba"
                pairs = min(freq, count[rev])
                length += pairs * 4

        if has_center:
            length += 2

        return length
```

```cpp []
// lc 2131, greedy + hash, O(n) time, O(n) space.
int longestPalindrome(vector<string>& words) {
    unordered_map<string, int> freq;
    for (auto& w : words) freq[w]++;              // O(n)

    int length = 0;
    bool hasCenter = false;

    for (auto& [word, cnt] : freq) {
        if (cnt == 0) continue;
        string rev = {word[1], word[0]};
        if (word == rev) {
            // palindromic word
            length += (cnt / 2) * 4;
            if (cnt % 2 == 1) hasCenter = true;
        } else if (word < rev && freq.count(rev)) {
            int pairs = min(cnt, freq[rev]);       // O(1) lookup
            length += pairs * 4;
        }
    }

    if (hasCenter) length += 2;
    return length;
}
```

```rust []
// lc 2131, greedy + hash, O(n) time, O(n) space.
impl Solution {
    pub fn longest_palindrome(words: Vec<String>) -> i32 {
        let mut freq: HashMap<&str, i32> = HashMap::new();
        for w in &words {
            *freq.entry(w.as_str()).or_insert(0) += 1;  // O(n)
        }

        let mut length = 0i32;
        let mut has_center = false;

        for (word, &count) in &freq {
            let bytes = word.as_bytes();
            if bytes[0] == bytes[1] {
                // Palindromic word
                length += (count / 2) * 4;
                if count % 2 == 1 {
                    has_center = true;
                }
            } else if bytes[0] < bytes[1] {
                // Non-palindromic: only process once per pair
                let rev: String = word.chars().rev().collect();
                if let Some(&rev_count) = freq.get(rev.as_str()) {
                    length += count.min(rev_count) * 4;
                }
            }
        }

        if has_center { length += 2; }
        length
    }
}
```
