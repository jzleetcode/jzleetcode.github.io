---
author: JZ
pubDatetime: 2024-11-12T07:22:00Z
modDatetime: 2024-11-12T09:12:00Z
title: LeetCode 1930 Unique Length-3 Palindromic Subsequences
tags:
  - a-hash
  - a-string
  - a-bit
  - a-prefix-sum
description:
  "Solutions for LeetCode 1930, medium, tags: hash, string, bit, prefix sum."
---

## Table of contents

## Description

Given a string `s`, return _the number of **unique palindromes of length three** that are a **subsequence** of_ `s`.

Note that even if there are multiple ways to obtain the same subsequence, it is still only counted **once**.

A **palindrome** is a string that reads the same forwards and backwards.

A **subsequence** of a string is a new string generated from the original string with some characters (can be none) deleted without changing the relative order of the remaining characters.

-   For example, `"ace"` is a subsequence of `"abcde"`.

```
Example 1:

Input: s = "aabca"
Output: 3
Explanation: The 3 palindromic subsequences of length 3 are:
- "aba" (subsequence of "aabca")
- "aaa" (subsequence of "aabca")
- "aca" (subsequence of "aabca")
Example 2:

Input: s = "adc"
Output: 0
Explanation: There are no palindromic subsequences of length 3 in "adc".
Example 3:

Input: s = "bbcbaba"
Output: 4
Explanation: The 4 palindromic subsequences of length 3 are:
- "bbb" (subsequence of "bbcbaba")
- "bcb" (subsequence of "bbcbaba")
- "bab" (subsequence of "bbcbaba")
- "aba" (subsequence of "bbcbaba")
 

Constraints:

3 <= s.length <= 10^5
s consists of only lowercase English letters.
```

## Solution

### Idea

We can use hash map or array to remember the first index and the last index for each letter where it appears in the string. For each of the 26 letters, we count the unique letters in between.

Complexity: Time O(n), Space O(26) O(1).

#### C++

```cpp []
// leet 1930
class SolutionUniqL3Palindrome {
public:
    int countPalindromicSubsequence(const string &s) {
        int first[26], last[26];
        fill(first, first + 26, INT_MAX);
        fill(last, last + 26, 0);
        for (int i = 0; i < (int) s.size(); ++i) {
            int id = s[i] - 'a';
            first[id] = min(first[id], i);
            last[id] = i;
        }
        int res = 0;
        for (int i = 0; i < 26; ++i) {
            if (first[i] < last[i]) {
                unordered_set<char> between;
                for (int j = first[i] + 1; j < last[i]; ++j)
                    between.insert(s[j]);
                res += (int) between.size();
            }
        }
        return res;
    }
};
```

#### Java

```java []
class Solution {
    public int countPalindromicSubsequence(String s) {
        int first[] = new int[26], last[] = new int[26], res = 0;
        Arrays.fill(first, Integer.MAX_VALUE);
        for (int i = 0; i < s.length(); ++i) {
            int id = s.charAt(i) - 'a';
            first[id] = Math.min(first[id], i);
            last[id] = i;
        }
        for (int i = 0; i < 26; ++i)
            if (first[i] < last[i])
                res += (int) s.substring(first[i] + 1, last[i]).chars().distinct().count();
        return res;
    }
}
```

#### Python

```python []
class Solution:
    """266 ms, 19.3 mb"""

    def countPalindromicSubsequence(self, s: str) -> int:
        first, last, res = [inf] * 26, [0] * 26, 0
        for i, c in enumerate(s):
            id = ord(c) - ord('a')
            first[id] = min(i, first[id])
            last[id] = i
        for i in range(26):
            if first[i] < last[i]:
                res += len(set(list(s[first[i] + 1:last[i]])))
        return res
```

#### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn count_palindromic_subsequence(s: &str) -> i32 {
        let bytes = s.as_bytes();
        let mut first = [i32::MAX; 26];
        let mut last = [0i32; 26];
        for (i, &b) in bytes.iter().enumerate() {
            let id = (b - b'a') as usize;
            first[id] = first[id].min(i as i32);
            last[id] = i as i32;
        }
        let mut res = 0;
        for i in 0..26 {
            if first[i] < last[i] {
                let mut seen = [false; 26];
                for j in (first[i] + 1)..last[i] {
                    seen[(bytes[j as usize] - b'a') as usize] = true;
                }
                res += seen.iter().filter(|&&x| x).count() as i32;
            }
        }
        res
    }
}
```
