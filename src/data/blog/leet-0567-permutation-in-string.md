---
author: JZ
pubDatetime: 2026-06-07T06:00:00Z
modDatetime: 2026-06-07T06:00:00Z
title: LeetCode 567 Permutation in String
featured: false
tags:
  - a-sliding-window
  - a-hash-table
  - a-string
description:
  "Solutions for LeetCode 567, medium, tags: hash table, two pointers, string, sliding window."
---

## Table of contents

## Description

Question Links: [LeetCode 567](https://leetcode.com/problems/permutation-in-string/description/)

Given two strings `s1` and `s2`, return `true` if `s2` contains a permutation of `s1`, or `false` otherwise.

In other words, return `true` if one of `s1`'s permutations is the substring of `s2`.

**Example 1:**

```
Input: s1 = "ab", s2 = "eidbaooo"
Output: true
Explanation: s2 contains one permutation of s1 ("ba").
```

**Example 2:**

```
Input: s1 = "ab", s2 = "eidboaoo"
Output: false
```

**Constraints:**

- `1 <= s1.length, s2.length <= 10^4`
- `s1` and `s2` consist of lowercase English letters.

## Idea1: Sliding Window + Matches Counter

Maintain a fixed-size window of length `l1` sliding over `s2`. Use two count arrays of size 26. Track how many character positions (out of 26) have matching frequency between `s1`'s count and the current window's count. When all 26 match, a permutation exists.

```
s1 = "ab", s2 = "eidbaooo"

c1: a:1 b:1 (24 zeros)
Initial window "ei": c2: e:1 i:1

Slide:
  "eid" → drop 'e', add 'd' → no 26 match
  "idb" → drop 'i', add 'b' → ...
  "dba" → drop 'd', add 'a' → c2: a:1 b:1 → matches=26 ✓
```

Each slide updates at most 2 character slots in the `matches` counter, so the inner work is $O(1)$.

Complexity: Time $O(l_1 + l_2)$, Space $O(1)$ (two arrays of size 26).

## Idea2: Sort and Compare

For each window of size `l1` in `s2`, sort the window and compare with sorted `s1`.

Complexity: Time $O((l_2 - l_1) \cdot l_1 \cdot \log l_1)$, Space $O(l_1)$.

### Java

```java []
public class PermutationInString {
    // optimized sliding window, 26(l2-l1)+l1: l2, 26+26:1. 6ms, 42.48mb.
    static class SolutionSW {
        public boolean checkInclusion(String s1, String s2) {
            int l1 = s1.length(), l2 = s2.length();
            if (l1 > l2) return false;
            int[] c1 = new int[26], c2 = new int[26]; // char count
            for (int i = 0; i < l1; i++) { // look at [0,l1)
                c1[s1.charAt(i) - 'a']++;
                c2[s2.charAt(i) - 'a']++;
            }
            int count = 0; // matched count in s1 and window of length of l1 in s2
            for (int i = 0; i < 26; i++) if (c1[i] == c2[i]) count++;
            // sliding [l1,l2)
            for (int i = 0; i < l2 - l1; i++) {
                if (count == 26) return true;
                int r = s2.charAt(i + l1) - 'a', l = s2.charAt(i) - 'a';
                c2[r]++;
                if (c2[r] == c1[r]) count++;
                else if (c2[r] == c1[r] + 1) count--;
                c2[l]--;
                if (c2[l] == c1[l]) count++;
                else if (c2[l] == c1[l] - 1) count--;
            }
            return count == 26;
        }
    }

    // sort, O((l2-l1)l1lgl1), O(l1+sort).
    static class Solution {
        public boolean checkInclusion(String s1, String s2) {
            s1 = sort(s1);
            for (int i = 0; i <= s2.length() - s1.length(); i++)
                if (s1.equals(sort(s2.substring(i, i + s1.length())))) return true;
            return false;
        }

        public String sort(String s) {
            char[] t = s.toCharArray();
            Arrays.sort(t);
            return new String(t);
        }
    }
}
```

### Python

```python []
class Solution:
    """Sliding window with match count. O(l2) time, O(1) space."""

    def checkInclusion(self, s1: str, s2: str) -> bool:
        l1, l2 = len(s1), len(s2)
        if l1 > l2:
            return False
        c1, c2 = [0] * 26, [0] * 26
        for i in range(l1):  # O(l1)
            c1[ord(s1[i]) - 97] += 1
            c2[ord(s2[i]) - 97] += 1
        count = sum(1 for i in range(26) if c1[i] == c2[i])
        for i in range(l2 - l1):  # O(l2 - l1), each iteration O(1)
            if count == 26:
                return True
            r = ord(s2[i + l1]) - 97
            c2[r] += 1
            if c2[r] == c1[r]:
                count += 1
            elif c2[r] == c1[r] + 1:
                count -= 1
            l = ord(s2[i]) - 97
            c2[l] -= 1
            if c2[l] == c1[l]:
                count += 1
            elif c2[l] == c1[l] - 1:
                count -= 1
        return count == 26


class Solution2:
    """Sorted comparison. O((l2-l1) * l1 * log(l1)) time, O(l1) space."""

    def checkInclusion(self, s1: str, s2: str) -> bool:
        l1, l2 = len(s1), len(s2)
        if l1 > l2:
            return False
        s1_sorted = sorted(s1)
        for i in range(l2 - l1 + 1):  # O(l2 - l1) windows
            if sorted(s2[i:i + l1]) == s1_sorted:
                return True
        return False
```

### C++

```cpp []
// Approach 1: sliding window with match count. O(l2) time, O(1) space.
class Solution {
public:
    bool checkInclusion(string s1, string s2) {
        int m = s1.size(), n = s2.size();
        if (m > n) return false;
        int c1[26] = {}, c2[26] = {};
        for (int i = 0; i < m; ++i) {
            c1[s1[i] - 'a']++;
            c2[s2[i] - 'a']++;
        }
        int matches = 0;
        for (int i = 0; i < 26; ++i) if (c1[i] == c2[i]) matches++;
        for (int i = m; i < n; ++i) {
            if (matches == 26) return true;
            int idx = s2[i] - 'a';
            c2[idx]++;
            if (c2[idx] == c1[idx]) matches++;
            else if (c2[idx] == c1[idx] + 1) matches--;
            int lidx = s2[i - m] - 'a';
            c2[lidx]--;
            if (c2[lidx] == c1[lidx]) matches++;
            else if (c2[lidx] == c1[lidx] - 1) matches--;
        }
        return matches == 26;
    }
};

// Approach 2: sort and compare. O(l1*log(l1) * (l2-l1)) time, O(l1) space.
class Solution2 {
public:
    bool checkInclusion(string s1, string s2) {
        int m = s1.size(), n = s2.size();
        if (m > n) return false;
        sort(s1.begin(), s1.end());
        for (int i = 0; i <= n - m; ++i) {
            string sub = s2.substr(i, m);
            sort(sub.begin(), sub.end());
            if (sub == s1) return true;
        }
        return false;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Sliding window with match count — O(l2) time, O(1) space.
    pub fn check_inclusion(s1: String, s2: String) -> bool {
        let (s1, s2) = (s1.as_bytes(), s2.as_bytes());
        if s1.len() > s2.len() {
            return false;
        }
        let mut count = [0i32; 26];
        for &b in s1.iter() {
            count[(b - b'a') as usize] += 1;
        }
        let mut matches = 0usize;
        for i in 0..26 {
            if count[i] == 0 { matches += 1; }
        }
        for i in 0..s1.len() {
            let idx = (s2[i] - b'a') as usize;
            count[idx] -= 1;
            if count[idx] == 0 { matches += 1; }
            else if count[idx] == -1 { matches -= 1; }
        }
        if matches == 26 { return true; }
        for i in s1.len()..s2.len() {
            let idx = (s2[i] - b'a') as usize;
            count[idx] -= 1;
            if count[idx] == 0 { matches += 1; }
            else if count[idx] == -1 { matches -= 1; }
            let idx = (s2[i - s1.len()] - b'a') as usize;
            count[idx] += 1;
            if count[idx] == 0 { matches += 1; }
            else if count[idx] == 1 { matches -= 1; }
            if matches == 26 { return true; }
        }
        false
    }
}
```
