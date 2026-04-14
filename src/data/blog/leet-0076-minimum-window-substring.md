---
author: JZ
pubDatetime: 2026-04-14T06:23:00Z
modDatetime: 2026-04-14T06:23:00Z
title: LeetCode 76 Minimum Window Substring
featured: true
tags:
  - a-sliding-window
  - a-hash
  - a-string
description:
  "Solutions for LeetCode 76, hard, tags: hash table, string, sliding window."
---

## Table of contents

## Description

Question link: [LeetCode 76](https://leetcode.com/problems/minimum-window-substring/description/).

Given two strings `s` and `t` of lengths `m` and `n` respectively, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If there is no such substring, return the empty string `""`.

The testcases will be generated such that the answer is unique.

```
Example 1:

Input: s = "ADOBECODEBANC", t = "ABC"
Output: "BANC"
Explanation: The minimum window substring "BANC" includes
'A', 'B', and 'C' from string t.

Example 2:

Input: s = "a", t = "a"
Output: "a"
Explanation: The entire string s is the minimum window.

Example 3:

Input: s = "a", t = "aa"
Output: ""
Explanation: Both 'a's from t must be included in the window.
Since the largest window of s only has one 'a', return empty string.
```

**Constraints:**

- `m == s.length`
- `n == t.length`
- `1 <= m, n <= 10^5`
- `s` and `t` consist of uppercase and lowercase English letters.

## Idea

Use a sliding window with a character count array of size 128 (ASCII). First, count the frequency of each character in `t`. Then use two pointers — expand the right pointer to grow the window, and once all characters of `t` are found, shrink from the left to minimize the window.

The key variable `notFound` tracks how many characters from `t` are still missing. When a character enters the window and its count transitions from positive to zero (or below), we've satisfied one more required character. When shrinking, if a character's count transitions from zero to positive, we've lost a required character.

```
s = "ADOBECODEBANC", t = "ABC"

cnt after t:   A:1  B:1  C:1          notFound = 3

r=0  'A'  cnt[A]=0   notFound=2       window: [A]DOBECODEBANC
r=1  'D'  cnt[D]=-1  notFound=2       window: [AD]OBECODEBANC
r=2  'O'  cnt[O]=-1  notFound=2       window: [ADO]BECODEBANC
r=3  'B'  cnt[B]=0   notFound=1       window: [ADOB]ECODEBANC
r=4  'E'  cnt[E]=-1  notFound=1       window: [ADOBE]CODEBANC
r=5  'C'  cnt[C]=0   notFound=0  *    window: [ADOBEC]ODEBANC
  shrink: l=0 'A' cnt[A]=1 notFound=1   best="ADOBEC" (len 6)
r=6  'O'  cnt[O]=-2  notFound=1       window: ADOBEC[O]DEBANC -> l=1
...
r=10 'A'  cnt[A]=0   notFound=0  *    window: ...CODEBA[NC]
  shrink: find best="BANC" (len 4)
```

Each character is visited at most twice — once by the right pointer and once by the left pointer.

Complexity: Time $O(m + n)$, Space $O(128) = O(1)$.

### Java

```java []
// sliding window. 2ms, 42.5Mb. O(m+n) time, O(128) space.
public String minWindow(String s, String t) {
    int[] map = new int[128]; // ascii char count for t
    for (int i = 0; i < t.length(); i++) map[t.charAt(i)]++; // O(n)
    int tNotFound = t.length(), left = 0, right = 0, minL = 0, minR = s.length() + 1;
    while (right < s.length()) { // O(m), each char visited at most twice
        if (map[s.charAt(right++)]-- > 0) tNotFound--;
        while (tNotFound == 0) {
            if (right - left < minR - minL) {
                minR = right;
                minL = left;
            }
            if (map[s.charAt(left++)]++ == 0) tNotFound++; // shrink from left
        }
    }
    return minR == s.length() + 1 ? "" : s.substring(minL, minR);
}
```

### Python

```python []
class Solution:
    """sliding window with count tracking. O(m+n) time, O(128) space."""

    def minWindow(self, s: str, t: str) -> str:
        cnt = [0] * 128
        for c in t:
            cnt[ord(c)] += 1  # O(n)
        not_found, left, min_l, min_r = len(t), 0, 0, len(s) + 1
        for right in range(len(s)):  # O(m), each char visited at most twice (right and left)
            cnt[ord(s[right])] -= 1
            if cnt[ord(s[right])] >= 0:
                not_found -= 1
            while not_found == 0:
                if right - left + 1 < min_r - min_l:
                    min_l, min_r = left, right + 1
                cnt[ord(s[left])] += 1
                if cnt[ord(s[left])] > 0:
                    not_found += 1
                left += 1
        return "" if min_r == len(s) + 1 else s[min_l:min_r]
```

### C++

```cpp []
// sliding window with count tracking. O(m+n) time, O(128) space.
static string minWindow(const string& s, const string& t) {
    int cnt[128] = {};
    for (char c : t) cnt[c]++; // O(n)
    int notFound = t.size(), left = 0, minL = 0, minR = s.size() + 1;
    for (int right = 0; right < (int)s.size(); ++right) { // O(m)
        if (cnt[s[right]]-- > 0) notFound--;
        while (notFound == 0) {
            if (right - left + 1 < minR - minL) {
                minL = left;
                minR = right + 1;
            }
            if (cnt[s[left++]]++ == 0) notFound++; // shrink from left
        }
    }
    return minR == (int)s.size() + 1 ? "" : s.substr(minL, minR - minL);
}
```

### Rust

```rust []
/// sliding window with count tracking. O(m+n) time, O(128) space.
pub fn min_window(s: String, t: String) -> String {
    let s = s.as_bytes();
    let mut cnt = [0i32; 128];
    for &b in t.as_bytes() {
        cnt[b as usize] += 1; // O(n)
    }
    let mut not_found = t.len();
    let (mut l, mut start, mut min_len) = (0, 0, usize::MAX);
    for r in 0..s.len() { // O(m), each char visited at most twice
        let rc = s[r] as usize;
        if cnt[rc] > 0 {
            not_found -= 1;
        }
        cnt[rc] -= 1;
        while not_found == 0 {
            if r - l + 1 < min_len {
                min_len = r - l + 1;
                start = l;
            }
            let lc = s[l] as usize;
            cnt[lc] += 1;
            if cnt[lc] > 0 { // shrink from left
                not_found += 1;
            }
            l += 1;
        }
    }
    if min_len == usize::MAX {
        String::new()
    } else {
        String::from_utf8_lossy(&s[start..start + min_len]).into_owned()
    }
}
```
