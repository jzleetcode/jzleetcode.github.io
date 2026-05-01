---
author: JZ
pubDatetime: 2025-01-08T06:23:00Z
modDatetime: 2025-01-08T06:23:00Z
title: LeetCode 916 LintCode 1726 Word Subsets
tags:
  - a-hash
  - a-counting
  - a-string
  - a-array
description:
  "Solutions for LeetCode 916 LintCode 1726, medium, tags: array, hash table, string."
---

## Table of contents

## Description

You are given two string arrays `words1` and `words2`.

A string `b` is a **subset** of string `a` if every letter in `b` occurs in `a` including multiplicity.

-   For example, `"wrr"` is a subset of `"warrior"` but is not a subset of `"world"`.

A string `a` from `words1` is **universal** if for every string `b` in `words2`, `b` is a subset of `a`.

Return an array of all the **universal** strings in `words1`. You may return the answer in **any order**.

```
Example 1:

Input: words1 = ["amazon","apple","facebook","google","leetcode"], words2 = ["e","o"]
Output: ["facebook","google","leetcode"]

Example 2:

Input: words1 = ["amazon","apple","facebook","google","leetcode"], words2 = ["l","e"]
Output: ["apple","google","leetcode"]
```

**Constraints:**

-   `1 <= words1.length, words2.length <= 10^4`
-   `1 <= words1[i].length, words2[i].length <= 10`
-   `words1[i]` and `words2[i]` consist only of lowercase English letters.
-   All the strings of `words1` are **unique**.

## Idea

This is another question that uses counting/counter. For other similar questions, see the [counting tag](../../tags/a-counting).

We could union all the counters (hashmaps) for all the words in `words2`. Let's call this counter `cnt`.

We then compare `cnt` with the counter for each of the word in `words1` and filter for the ones where `cnt <= Counter(word)`.

Since Python has the library `Counter`, the Python implementation is the shortest.

```rust
let n = words1.len(), m = words2.len();
let l1 = max(words1.len()), l2 = max(words2.len());
```

Complexity: Time $O(n*l1+m*l2)$, Space $O(l1+l2)$.

### C++

```cpp []
// leet 916
vector<string> wordSubsets(vector<string> &words1, vector<string> &words2) {
    int maxCnt[26] = {};
    for (auto &b : words2) {
        int cnt[26] = {};
        for (char c : b) cnt[c - 'a']++;
        for (int i = 0; i < 26; i++) maxCnt[i] = max(maxCnt[i], cnt[i]);
    }
    vector<string> res;
    for (auto &a : words1) {
        int cnt[26] = {};
        for (char c : a) cnt[c - 'a']++;
        bool ok = true;
        for (int i = 0; i < 26; i++)
            if (cnt[i] < maxCnt[i]) { ok = false; break; }
        if (ok) res.push_back(a);
    }
    return res;
}
```

### Java

```java []
// leet 916
public static List<String> wordSubsets(String[] words1, String[] words2) {
    int[] maxCnt = new int[26];
    for (String b : words2) {
        int[] cnt = count(b);
        for (int i = 0; i < 26; i++) maxCnt[i] = Math.max(maxCnt[i], cnt[i]);
    }
    List<String> res = new ArrayList<>();
    for (String a : words1) {
        int[] cnt = count(a);
        boolean universal = true;
        for (int i = 0; i < 26; i++)
            if (cnt[i] < maxCnt[i]) { universal = false; break; }
        if (universal) res.add(a);
    }
    return res;
}
```

### Python

```python
class Solution(object):
    """526 ms, 21.3 mb"""

    def wordSubsets(self, A: list[str], B: list[str]) -> list[str]:
        cnt = Counter()
        for b in B:
            cnt |= Counter(b)
        return [a for a in A if Counter(a) >= cnt]
```
