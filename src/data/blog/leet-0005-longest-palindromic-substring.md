---
author: JZ
pubDatetime: 2026-05-21T10:37:00Z
modDatetime: 2026-05-21T10:37:00Z
title: LeetCode 5 Longest Palindromic Substring
featured: true
tags:
  - a-string
  - a-dp
description:
  "Solutions for LeetCode 5, medium, tags: string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 5](https://leetcode.com/problems/longest-palindromic-substring/description/)

Given a string `s`, return the longest palindromic substring in `s`.

```
Example 1:

Input: s = "babad"
Output: "bab"
Explanation: "aba" is also a valid answer.

Example 2:

Input: s = "cbbd"
Output: "bb"
```

**Constraints:**

- `1 <= s.length <= 1000`
- `s` consist of only digits and English letters.

## Idea1

**Expand from center.** For each index `i`, expand outward treating `i` as the center of an odd-length palindrome and the gap between `i` and `i+1` as the center of an even-length palindrome. Track the longest found.

```
s = "xabcbay"

Expand from i=3 (char 'c'):
  odd:  l=3, r=3 -> 'c'
        l=2, r=4 -> 'bcb'
        l=1, r=5 -> 'abcba'
        l=0, r=6 -> x != y, stop
  Result: "abcba" (length 5)

No even expansion yields anything longer.
Answer: "abcba"
```

Complexity: Time $O(n^2)$ — $O(n)$ centers, each expands up to $O(n)$. Space $O(1)$.

### Java

```java []
// lc 5, expand from center. O(n^2) time, O(1) space.
static class Solution1 {
    int left, maxLen;
    String s;

    public String longestPalindrome(String s) {
        this.s = s;
        for (int i = 0; i < s.length(); i++) {
            extendPalindrome(i, i); // odd length
            extendPalindrome(i, i + 1); // even length
        }
        return s.substring(left, left + maxLen);
    }

    private void extendPalindrome(int left, int right) {
        while (left >= 0 && right < s.length() && s.charAt(left) == s.charAt(right)) {
            left--;
            right++;
        } // left, right will stop when out of bound or no longer match
        if (maxLen < right - left - 1) {
            this.left = left + 1; // move back to a matched index
            maxLen = right - left - 1;
        }
    }
}
```

```python []
# lc 5, expand from center. O(n^2) time, O(1) space.
class Solution2:
    def __init__(self):
        self.left = 0
        self.max_l = 0

    def longestPalindrome(self, s: str) -> str:
        def expand(i: int, j: int):
            left, right = i, j
            while left >= 0 and right < len(s) and s[left] == s[right]:
                left -= 1
                right += 1
            if right - left - 1 > self.max_l:
                self.max_l = right - left - 1
                self.left = left + 1

        for i in range(len(s)):  # O(n)
            expand(i, i)      # odd, expand O(n)
            expand(i, i + 1)  # even

        return s[self.left:self.left + self.max_l]
```

```cpp []
// lc 5, expand from center. O(n^2) time, O(1) space.
class Solution5 {
public:
    string longestPalindrome(string s) {
        int n = (int) s.size(), start = 0, maxLen = 1;
        auto expand = [&](int l, int r) {
            while (l >= 0 && r < n && s[l] == s[r]) { l--; r++; }
            if (r - l - 1 > maxLen) {
                start = l + 1;
                maxLen = r - l - 1;
            }
        };
        for (int i = 0; i < n; i++) { // O(n)
            expand(i, i);     // odd, expand O(n)
            expand(i, i + 1); // even
        }
        return s.substr(start, maxLen);
    }
};
```

```rust []
// lc 5, expand from center. O(n^2) time, O(1) space.
pub fn longest_palindrome(s: String) -> String {
    let bytes = s.as_bytes();
    let n = bytes.len();
    if n == 0 { return String::new(); }
    let mut start = 0usize;
    let mut max_len = 1usize;

    let expand = |mut l: i32, mut r: i32| -> (usize, usize) {
        while l >= 0 && (r as usize) < n && bytes[l as usize] == bytes[r as usize] {
            l -= 1;
            r += 1;
        }
        ((l + 1) as usize, (r - l - 1) as usize)
    };

    for i in 0..n { // O(n) iterations, each expand O(n) worst case
        let (s1, l1) = expand(i as i32, i as i32);
        let (s2, l2) = expand(i as i32, (i + 1) as i32);
        if l1 > max_len { start = s1; max_len = l1; }
        if l2 > max_len { start = s2; max_len = l2; }
    }
    s[start..start + max_len].to_string()
}
```

## Idea2

**Manacher's algorithm.** Transform `s` into a padded string with sentinels (e.g., `"abc"` becomes `"$#a#b#c#@"`) so that odd and even palindromes are handled uniformly. Maintain a `center` and `right` boundary of the rightmost known palindrome, and use the mirror property to skip redundant character comparisons.

```
s = "cbbd"
Padded: $ # c # b # b # d # @

p[] after Manacher:
index:  0 1 2 3 4 5 6 7 8 9 10
char:   $ # c # b # b # d #  @
p[i]:   0 0 1 0 1 4 1 0 1 0  0
                    ^
            center=5, p[5]=4 -> palindrome radius 4 in padded
            original: start=(5-1-4)/2=0, len=4 -> "cbbd"? No...
            Actually p[5]=4 means "#b#b#" has radius 2 in original
            -> longest is "bb" with length 2

Wait, let's be precise:
  max p[i] = 4 at i=5 (the '#' between the two b's)
  original start = (5 - 1 - 4)/2 = 0... that's wrong for "cbbd"

Correct: the max is actually p[5] which represents "bb"
  Let's recount: for "cbbd", padded is $#c#b#b#d#@
  i=1('#'):p=0, i=2('c'):p=1, i=3('#'):p=0, i=4('b'):p=1,
  i=5('#'):p=2 (b#b matches both sides -> radius 2 in padded = "bb" in original)
  i=6('b'):p=1, i=7('#'):p=0, i=8('d'):p=1, i=9('#'):p=0

  max p=2 at i=5, origStart=(5-1-2)/2=1, len=2 -> s[1..3]="bb" ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// lc 5, Manacher's algorithm. O(n) time and space.
static class Solution2 {
    public String longestPalindrome(String s) {
        return new Manacher(s).longestPalindromicSubstring();
    }
}
```

The `Manacher` class (shared utility):

```java []
public class Manacher {
    public int[] p;
    public char[] t;
    private String s;

    public Manacher(String s) {
        this.s = s;
        // Transform: "abc" -> "$#a#b#c#@"
        t = new char[s.length() * 2 + 3];
        t[0] = '$';
        for (int i = 0; i < s.length(); i++) {
            t[2 * i + 1] = '#';
            t[2 * i + 2] = s.charAt(i);
        }
        t[s.length() * 2 + 1] = '#';
        t[s.length() * 2 + 2] = '@';

        p = new int[t.length];
        int center = 0, right = 0;
        for (int i = 1; i < t.length - 1; i++) {
            int mirror = 2 * center - i;
            if (right > i) p[i] = Math.min(right - i, p[mirror]);
            while (t[i + (1 + p[i])] == t[i - (1 + p[i])]) p[i]++;
            if (i + p[i] > right) { center = i; right = i + p[i]; }
        }
    }

    public String longestPalindromicSubstring() {
        int length = 0, center = 0;
        for (int i = 1; i < p.length - 1; i++) {
            if (p[i] > length) { length = p[i]; center = i; }
        }
        return s.substring((center - 1 - length) / 2, (center - 1 + length) / 2);
    }
}
```

```python []
# lc 5, Manacher's algorithm. O(n) time and space.
class Manacher:
    def __init__(self, s: str) -> None:
        t = ["$", "#"]
        for c in s:
            t.append(c)
            t.append("#")
        t.append("@")
        self.m = m = len(t)
        self.p = p = [0] * m
        self.s = s
        center = right = 0
        for i in range(1, m - 1):
            mirror = 2 * center - i
            if right > i: p[i] = min(right - i, p[mirror])
            while t[i - (p[i] + 1)] == t[i + (p[i] + 1)]: p[i] += 1
            if i + p[i] > right:
                center = i
                right = i + p[i]

    def longestPalindromeSubstring(self) -> str:
        max_l = center = 0
        for i in range(1, self.m - 1):
            if self.p[i] > max_l:
                max_l = self.p[i]
                center = i
        return self.s[(center - 1 - max_l) // 2:(center - 1 + max_l) // 2]


class Solution:
    def longestPalindrome(self, s: str) -> str:
        return Manacher(s).longestPalindromeSubstring()
```

```cpp []
// lc 5, Manacher's algorithm. O(n) time, O(n) space.
class Solution5Manacher {
public:
    string longestPalindrome(string s) {
        int n = (int) s.size();
        if (n == 0) return "";
        string t = "$#";
        for (char c: s) { t += c; t += '#'; }
        t += '@';
        int m = (int) t.size();
        vector<int> p(m, 0);
        int center = 0, right = 0;
        for (int i = 1; i < m - 1; i++) {
            int mirror = 2 * center - i;
            if (right > i) p[i] = min(right - i, p[mirror]);
            while (t[i + p[i] + 1] == t[i - p[i] - 1]) p[i]++;
            if (i + p[i] > right) { center = i; right = i + p[i]; }
        }
        int maxLen = 0, maxCenter = 0;
        for (int i = 1; i < m - 1; i++) {
            if (p[i] > maxLen) { maxLen = p[i]; maxCenter = i; }
        }
        int origStart = (maxCenter - 1 - maxLen) / 2;
        return s.substr(origStart, maxLen);
    }
};
```

```rust []
// lc 5, Manacher's algorithm. O(n) time, O(n) space.
pub fn longest_palindrome_manacher(s: String) -> String {
    let n = s.len();
    if n == 0 { return String::new(); }
    let bytes = s.as_bytes();
    let mut t: Vec<u8> = Vec::with_capacity(2 * n + 3);
    t.push(b'$'); t.push(b'#');
    for &b in bytes { t.push(b); t.push(b'#'); }
    t.push(b'@');

    let m = t.len() as i32;
    let mut p = vec![0i32; m as usize];
    let (mut center, mut right): (i32, i32) = (0, 0);

    for i in 1..m - 1 {
        let mirror = 2 * center - i;
        if right > i { p[i as usize] = p[mirror as usize].min(right - i); }
        while t[(i + p[i as usize] + 1) as usize] == t[(i - p[i as usize] - 1) as usize] {
            p[i as usize] += 1;
        }
        if i + p[i as usize] > right { center = i; right = i + p[i as usize]; }
    }

    let (mut max_len, mut max_center) = (0i32, 0i32);
    for i in 1..m - 1 {
        if p[i as usize] > max_len { max_len = p[i as usize]; max_center = i; }
    }
    let orig_start = ((max_center - 1 - max_len) / 2) as usize;
    s[orig_start..orig_start + max_len as usize].to_string()
}
```
