---
author: JZ
pubDatetime: 2026-05-30T10:06:00Z
modDatetime: 2026-05-30T10:06:00Z
title: LeetCode 647 Palindromic Substrings
featured: false
tags:
  - a-string
  - a-dp
description:
  "Solutions for LeetCode 647, medium, tags: string, dynamic programming, two pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 647](https://leetcode.com/problems/palindromic-substrings/description/)

Given a string `s`, return the number of palindromic substrings in it.

A string is a palindrome when it reads the same backward as forward.

A substring is a contiguous sequence of characters within the string.

```
Example 1:

Input: s = "abc"
Output: 3
Explanation: Three palindromic strings: "a", "b", "c".

Example 2:

Input: s = "aaa"
Output: 6
Explanation: Six palindromic strings: "a", "a", "a", "aa", "aa", "aaa".
```

**Constraints:**

- `1 <= s.length <= 1000`
- `s` consists of lowercase English letters.

## Idea1

**Expand around center.** Every palindrome has a center — either a single character (odd length) or a gap between two characters (even length). For each of the `2n - 1` possible centers, expand outward while characters match, counting each valid expansion as a palindromic substring.

```
s = "abba"

Center at i=0 ('a'): expand(0,0) -> "a" (count 1)
Center at gap (0,1): 'a' != 'b', stop (count 0)
Center at i=1 ('b'): expand(1,1) -> "b" (count 1)
Center at gap (1,2): 'b' == 'b' -> "bb" (count 1)
                     'a' == 'a' -> "abba" (count 1) -> total 2
Center at i=2 ('b'): expand(2,2) -> "b" (count 1)
Center at gap (2,3): 'b' != 'a', stop (count 0)
Center at i=3 ('a'): expand(3,3) -> "a" (count 1)

Total: 1+0+1+2+1+0+1 = 6
```

Complexity: Time $O(n^2)$ — $O(n)$ centers, each expands up to $O(n)$. Space $O(1)$.

### Java

```java []
// lc 647, expand around center. O(n^2) time, O(1) space.
public int countSubstrings2(String s) {
    int count = 0;
    for (int i = 0; i < s.length(); i++) // O(n) centers
        count += expand(i, i) + expand(i, i + 1);
    return count;
}

// expand from [l,r] and count palindromes. Each call O(n) worst case.
private int expand(int l, int r) {
    int res = 0;
    while (l >= 0 && r < s.length() && s.charAt(l) == s.charAt(r)) {
        l--;
        r++;
        res++;
    }
    return res;
}
```

```python []
# lc 647, expand around center. O(n^2) time, O(1) space.
class Solution2:
    def countSubstrings(self, s: str) -> int:
        def expand(i: int, j: int) -> int:
            count = 0
            while i >= 0 and j < len(s) and s[i] == s[j]:
                i -= 1
                j += 1
                count += 1
            return count

        res = 0
        for i in range(len(s)):  # O(n) centers
            res += expand(i, i) + expand(i, i + 1)  # each expand O(n)
        return res
```

```cpp []
// lc 647, expand around center. O(n^2) time, O(1) space.
static int countSubstrings(const string &s) {
    int count = 0;
    int n = static_cast<int>(s.size());
    for (int i = 0; i < n; i++) { // O(n) centers
        count += expand(s, i, i);
        count += expand(s, i, i + 1);
    }
    return count;
}

// Each call O(n) worst case
static int expand(const string &s, int l, int r) {
    int res = 0;
    int n = static_cast<int>(s.size());
    while (l >= 0 && r < n && s[l] == s[r]) {
        l--;
        r++;
        res++;
    }
    return res;
}
```

```rust []
// lc 647, expand around center. O(n^2) time, O(1) space.
pub fn count_substrings(s: String) -> i32 {
    let bytes = s.as_bytes();
    let n = bytes.len();
    let mut count = 0i32;
    for i in 0..n { // O(n) centers
        count += Self::expand(bytes, i as i32, i as i32);
        count += Self::expand(bytes, i as i32, (i + 1) as i32);
    }
    count
}

// Each expand call is O(n) worst case
fn expand(bytes: &[u8], mut l: i32, mut r: i32) -> i32 {
    let mut res = 0;
    let n = bytes.len() as i32;
    while l >= 0 && r < n && bytes[l as usize] == bytes[r as usize] {
        l -= 1;
        r += 1;
        res += 1;
    }
    res
}
```

## Idea2

**Manacher's algorithm.** Transform `s` into a padded string with sentinels (e.g., `"abc"` becomes `"$#a#b#c#@"`) so that odd and even palindromes are handled uniformly. Maintain a `center` and `right` boundary of the rightmost known palindrome, and use the mirror property to skip redundant character comparisons. After computing the palindrome radii array `p[]`, the number of palindromic substrings equals `sum((p[i] + 1) / 2)` for all valid positions.

```
s = "aaa"
Padded: $ # a # a # a # @
Index:  0 1 2 3 4 5 6 7 8

p[] after Manacher:
index:  0 1 2 3 4 5 6 7 8
char:   $ # a # a # a # @
p[i]:   0 0 1 2 3 2 1 0 0

Count = sum of (p[i]+1)/2 for i in [1,7]:
  (0+1)/2 + (1+1)/2 + (2+1)/2 + (3+1)/2 + (2+1)/2 + (1+1)/2 + (0+1)/2
= 0 + 1 + 1 + 2 + 1 + 1 + 0 = 6 ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// lc 647, Manacher's algorithm. O(n) time and space.
public int countSubstrings(String s) {
    return new Manacher(s).cntPalindromeSubstring();
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

    // number of palindromes at center == (p[center] + 1) / 2
    public int cntPalindromeSubstring() {
        int res = 0;
        for (int i = 1; i < p.length - 1; i++) res += (p[i] + 1) / 2;
        return res;
    }
}
```

```python []
# lc 647, Manacher's algorithm. O(n) time and space.
from algorithm.jzstring.Manacher import Manacher

class Solution1:
    def countSubstrings(self, s: str) -> int:
        return Manacher(s).cntPalindromeSubstrings()
```

The `Manacher` class (shared utility):

```python []
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

    def cntPalindromeSubstrings(self) -> int:
        res = 0
        for i in range(1, self.m - 1):
            res += (1 + self.p[i]) // 2
        return res
```

```cpp []
// lc 647, Manacher's algorithm. O(n) time and space.
static int countSubstringsManacher(string s) {
    Manacher m(move(s));
    return m.cntPalindromeSubstrings();
}
```

The `Manacher` class (shared utility):

```cpp []
class Manacher {
public:
    vector<int> p;
    vector<char> t;
    string s;

    explicit Manacher(string s) : s(s) {
        size_t n = s.length(), m = 2 * n + 3;
        t.resize(m);
        p.resize(m);
        t[0] = '$';
        for (int i = 0; i < n; i++) {
            t[2 * i + 1] = '#';
            t[2 * i + 2] = s[i];
        }
        t[2 * n + 1] = '#';
        t[2 * n + 2] = '@';
        int c = 0, r = 0;
        for (int i = 1; i < m - 1; i++) {
            int mirror = 2 * c - i;
            if (r > i) p[i] = min(p[mirror], r - i);
            while (t[i + (1 + p[i])] == t[i - (1 + p[i])]) p[i]++;
            if (i + p[i] > r) { r = i + p[i]; c = i; }
        }
    }

    int cntPalindromeSubstrings() {
        int res = 0;
        for (int i = 1; i < p.size() - 1; i++) res += (1 + p[i]) / 2;
        return res;
    }
};
```

```rust []
// lc 647, Manacher's algorithm. O(n) time, O(n) space.
pub fn count_substrings_manacher(s: String) -> i32 {
    let n = s.len();
    if n == 0 { return 0; }
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

    // Each p[i] = radius; palindromic substrings = sum of ceil(p[i]/2)
    let mut count = 0i32;
    for i in 1..(m - 1) as usize {
        count += (p[i] + 1) / 2;
    }
    count
}
```
