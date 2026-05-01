---
author: JZ
pubDatetime: 2024-11-26T06:23:00Z
modDatetime: 2025-05-01T06:23:00Z
title: LeetCode 214 LintCode 678 Shortest Palindrome (GeeksForGeeks Minimum Insertion to Form Shortest Palindrome)
tags:
  - a-rolling-hash
  - a-string
  - a-kmp
  - a-two-pointers
  - a-hash
  - c-google
description:
  "Solutions for LeetCode 239, LintCode 678, medium, tags: two pointers, string, kmp, rabin-karp, rolling hash."
---

## Table of contents

## Description

Question Links: [LeetCode 214](https://leetcode.com/problems/shortest-palindrome/description/), [LintCode 678](https://www.lintcode.com/problem/678/)

You are given a string `s`. You can convert `s` to a palindrome by adding characters in front of it.

Return _the shortest palindrome you can find by performing this transformation_.

```
Example 1:

Input: s = "aacecaaa"
Output: "aaacecaaa"

Example 2:

Input: s = "abcd"
Output: "dcbabcd"
```

**Constraints:**

-   `0 <= s.length <= 5 * 10^4`
-   `s` consists of lowercase English letters only.

## Solution

`let n=s.length`

### Idea1

Firstly, how can we form the shortest palindrome?

We can find the longest palindrome prefix of the string. Copy the remaining substring, reverse it, and append it to the front of the string to form the shortest palindrome.

For example, for string `aaabc`, the longest palindrome prefix is `aaa`. We take the remaining substring `bc`, reverse to `cb` and add to front to form `cbaaabc`.

Secondly, how can we find the longest palindrome prefix?

We can use the rolling hash method which is also used in [Rabin-Karp](https://en.wikipedia.org/wiki/Rabin%E2%80%93Karp_algorithm) string search algorithm. Similarly, we have a very small chance of hash collision and false positives. In reality, the percentage is very low.

The polynomial rolling hash is defined as following.

`H=s[0]p^(n-1) + s[1]^p(n-2) + s[2]p^(n-3) + ... + s[n-2]p + s[n-1]`, where `s` is the string, `s[i], i in [0,n-1]` is the characters in the string, and p is a power factor for the hash function.

Similar to the hash functions used for a hash map data structure, the hash can be used to check for equality.

We can compute the rolling hash in a forward and reverse order and compare the two hashes. If they are equal, we found a palindrome.

The reverse hash is then `s[n-1]p^(n-1) + s[n-2]p^(n-2) + ... + s[0]p`.

Let's look at how the forward and reverse hash changes with the above example.

| i | c   | forward                 | reverse                 | pow        | note     |
|---|-----|-------------------------|-------------------------|------------|----------|
| 0 | `a` | 1                       | 1                       | 1->31      | match    |
| 1 | `a` | 1*31+1                  | 1+1*31                  | 31->31^2   | match    |
| 2 | `a` | 1\*31^2+1\*31+1         | 1+1\*31+1\*31^2         | 31^2->31^3 | match    |
| 3 | `b` | 1\*31^3+1\*31^2+1\*31+2 | 1+1\*31+1\*31^2+2\*31^3 | 31^3->31^4 | no match |


In the calculation below, we offset `a-z` to integers `1-26` to simplify the hash calculation.

Complexity: Time O(n), Space O(n), O(1) if not considering result space.

#### Python

```python
class SolutionHash:
    """47 ms, 18.02 mb"""

    def shortestPalindrome(self, s: str) -> str:
        base, pow, mod, end, forward, reverse = 31, 1, 1e9 + 7, -1, 0, 0
        for i, c in enumerate(s):
            id = ord(c) - ord('a') + 1
            forward = (forward * base + id) % mod
            reverse = (reverse + id * pow) % mod
            pow = (pow * base) % mod
            if forward == reverse: end = i
        return s[end + 1:][::-1] + s
```

#### Java

```java []
// rolling hash, similar to rabin karp. O(n) time and space.
class Solution2 {
    public String shortestPalindrome(String s) {
        long base = 29;
        long mod = (long) 1e9 + 7;
        long forward = 0, reverse = 0, pow = 1;
        int end = -1;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            forward = (forward * base + (c - 'a' + 1)) % mod;
            reverse = (reverse + (c - 'a' + 1) * pow) % mod;
            pow = (pow * base) % mod;
            if (forward == reverse) end = i;
        }
        String suffix = s.substring(end + 1);
        StringBuilder reversedSuffix = new StringBuilder(suffix).reverse();
        return reversedSuffix.append(s).toString();
    }
}
```

#### C++

```cpp []
// leet 214, rolling hash. O(n) time, O(n) space.
class Solution214 {
public:
    string shortestPalindrome(string s) {
        long long base = 31, pw = 1, mod = 1e9 + 7;
        long long forward = 0, reverse = 0;
        int end = -1;
        for (int i = 0; i < (int) s.size(); i++) {
            int id = s[i] - 'a' + 1;
            forward = (forward * base + id) % mod;
            reverse = (reverse + (long long) id * pw) % mod;
            pw = (pw * base) % mod;
            if (forward == reverse) end = i;
        }
        string suffix = s.substr(end + 1);
        string rev_suffix(suffix.rbegin(), suffix.rend());
        return rev_suffix + s;
    }
};
```

#### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn shortest_palindrome(s: String) -> String {
        let base: u64 = 31;
        let modulus: u64 = 1_000_000_007;
        let mut pw: u64 = 1;
        let mut forward: u64 = 0;
        let mut reverse: u64 = 0;
        let mut end: i32 = -1;
        for (i, c) in s.bytes().enumerate() {
            let id = (c - b'a' + 1) as u64;
            forward = (forward * base + id) % modulus;
            reverse = (reverse + id * pw) % modulus;
            pw = (pw * base) % modulus;
            if forward == reverse {
                end = i as i32;
            }
        }
        let suffix = &s[(end + 1) as usize..];
        let rev_suffix: String = suffix.chars().rev().collect();
        rev_suffix + &s
    }
}
```
