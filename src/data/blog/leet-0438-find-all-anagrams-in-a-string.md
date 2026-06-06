---
author: JZ
pubDatetime: 2026-06-06T06:00:00Z
modDatetime: 2026-06-06T06:00:00Z
title: LeetCode 438 Find All Anagrams in a String
featured: true
tags:
  - a-sliding-window
  - a-hash-table
  - a-string
description:
  "Solutions for LeetCode 438, medium, tags: hash table, string, sliding window."
---

## Table of contents

## Description

Question Links: [LeetCode 438](https://leetcode.com/problems/find-all-anagrams-in-a-string/description/)

Given two strings `s` and `p`, return an array of all the start indices of `p`'s anagrams in `s`. You may return the answer in any order.

An **Anagram** is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.

**Constraints:**

- `1 <= s.length, p.length <= 3 * 10^4`
- `s` and `p` consist of lowercase English letters.

## Idea1: Sliding Window + Count Array

Maintain a fixed-size window of length `|p|`. Use a count array of size 26. Initialize by incrementing for each char in `p`, then decrement as chars enter the window and increment as chars leave. At each position, check if all 26 entries are zero.

```
s = "cbaebabacd", p = "abc"

cnt initialized from p: a:1 b:1 c:1

Window slides:
 [c b a] e b a b a c d   cnt: a:0 b:0 c:0 → all zero ✓ → index 0
  c [b a e] b a b a c d   cnt: a:0 b:0 c:1 e:-1 → ✗
  ...
  c b a e b a [b a c] d   cnt: a:0 b:0 c:0 → all zero ✓ → index 6
```

Complexity: Time $O(26 \cdot n)$ = $O(n)$, Space $O(1)$.

## Idea2: Sliding Window + Matches Counter

Instead of scanning all 26 entries, track how many of the 26 character slots are "balanced" (count == 0). When all 26 are balanced, we have an anagram. Each window slide updates at most 2 slots in O(1).

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
// Approach 1: count array, check all 26 each step
public static List<Integer> findAnagrams1(String s, String p) {
    List<Integer> result = new ArrayList<>();
    if (s.length() < p.length()) return result;
    int[] cnt = new int[26];
    int n = s.length(), m = p.length();
    for (int i = 0; i < m; i++) { // O(m) — initialize window
        cnt[p.charAt(i) - 'a']++;
        cnt[s.charAt(i) - 'a']--;
    }
    if (allZero(cnt)) result.add(0);
    for (int i = m; i < n; i++) { // O(n) — slide window
        cnt[s.charAt(i) - 'a']--;
        cnt[s.charAt(i - m) - 'a']++;
        if (allZero(cnt)) result.add(i - m + 1); // O(26) check
    }
    return result;
}
```
```java []
// Approach 2: matches counter, O(1) per step
public static List<Integer> findAnagrams2(String s, String p) {
    List<Integer> result = new ArrayList<>();
    if (s.length() < p.length()) return result;
    int[] cnt = new int[26];
    int n = s.length(), m = p.length();
    for (char c : p.toCharArray()) cnt[c - 'a']++; // O(m)
    int matches = 0;
    for (int i = 0; i < 26; i++) if (cnt[i] == 0) matches++;
    for (int i = 0; i < n; i++) { // O(n) — expand window
        int idx = s.charAt(i) - 'a';
        cnt[idx]--;
        if (cnt[idx] == 0) matches++;
        else if (cnt[idx] == -1) matches--;
        if (i >= m) { // shrink window
            idx = s.charAt(i - m) - 'a';
            cnt[idx]++;
            if (cnt[idx] == 0) matches++;
            else if (cnt[idx] == 1) matches--;
        }
        if (matches == 26) result.add(i - m + 1);
    }
    return result;
}
```

### Python

```python []
# Approach 1: count array, check all zeros
class Solution:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        res = []
        if len(p) > len(s):
            return res
        cnt = [0] * 26
        for c in p:
            cnt[ord(c) - ord('a')] += 1  # O(m)
        for i in range(len(s)):  # O(n), each char enters and leaves window once
            cnt[ord(s[i]) - ord('a')] -= 1
            if i >= len(p):
                cnt[ord(s[i - len(p)]) - ord('a')] += 1
            if all(v == 0 for v in cnt):  # O(26) = O(1)
                res.append(i - len(p) + 1)
        return res
```
```python []
# Approach 2: matches counter
class Solution2:
    def findAnagrams(self, s: str, p: str) -> list[int]:
        res = []
        if len(p) > len(s):
            return res
        cnt = [0] * 26
        for c in p:
            cnt[ord(c) - ord('a')] += 1
        matches = sum(1 for c in cnt if c == 0)  # O(26)
        for i in range(len(s)):  # O(n)
            idx = ord(s[i]) - ord('a')
            cnt[idx] -= 1
            if cnt[idx] == 0:
                matches += 1
            elif cnt[idx] == -1:
                matches -= 1
            if i >= len(p):
                idx = ord(s[i - len(p)] ) - ord('a')
                cnt[idx] += 1
                if cnt[idx] == 0:
                    matches += 1
                elif cnt[idx] == 1:
                    matches -= 1
            if matches == 26:
                res.append(i - len(p) + 1)
        return res
```

### C++

```cpp []
// Approach 1: count array, check all zeros
vector<int> findAnagrams(const string& s, const string& p) {
    vector<int> res;
    int n = s.size(), m = p.size();
    if (n < m) return res;
    int cnt[26] = {};
    for (char c : p) cnt[c - 'a']++;
    for (int i = 0; i < n; ++i) { // O(n) iterations
        cnt[s[i] - 'a']--;
        if (i >= m) cnt[s[i - m] - 'a']++;
        if (i >= m - 1) {
            bool allZero = true;
            for (int j = 0; j < 26; ++j) { // O(26) check per window
                if (cnt[j] != 0) { allZero = false; break; }
            }
            if (allZero) res.push_back(i - m + 1);
        }
    }
    return res;
}
```
```cpp []
// Approach 2: matches counter, O(1) per step
vector<int> findAnagrams2(const string& s, const string& p) {
    vector<int> res;
    int n = s.size(), m = p.size();
    if (n < m) return res;
    int cnt[26] = {};
    for (char c : p) cnt[c - 'a']++;
    int matches = 0;
    for (int j = 0; j < 26; ++j) if (cnt[j] == 0) matches++;
    for (int i = 0; i < n; ++i) { // O(n) iterations, O(1) work each
        int idx = s[i] - 'a';
        cnt[idx]--;
        if (cnt[idx] == 0) matches++;
        else if (cnt[idx] == -1) matches--;
        if (i >= m) {
            int lidx = s[i - m] - 'a';
            cnt[lidx]++;
            if (cnt[lidx] == 0) matches++;
            else if (cnt[lidx] == 1) matches--;
        }
        if (matches == 26) res.push_back(i - m + 1);
    }
    return res;
}
```

### Rust

```rust []
// Approach 1: count array, check all zeros
pub fn find_anagrams(s: String, p: String) -> Vec<i32> {
    let (s, p) = (s.as_bytes(), p.as_bytes());
    if s.len() < p.len() { return vec![]; }
    let mut count = [0i32; 26];
    for i in 0..p.len() {
        count[(p[i] - b'a') as usize] -= 1;
        count[(s[i] - b'a') as usize] += 1;
    }
    let mut result = Vec::new();
    if count.iter().all(|&c| c == 0) { result.push(0); }
    for i in p.len()..s.len() { // O(n) iterations, each O(26) check
        count[(s[i] - b'a') as usize] += 1;
        count[(s[i - p.len()] - b'a') as usize] -= 1;
        if count.iter().all(|&c| c == 0) {
            result.push((i - p.len() + 1) as i32);
        }
    }
    result
}
```
```rust []
// Approach 2: matches counter, O(1) per step
pub fn find_anagrams_v2(s: String, p: String) -> Vec<i32> {
    let (s, p) = (s.as_bytes(), p.as_bytes());
    if s.len() < p.len() { return vec![]; }
    let mut count = [0i32; 26];
    for &b in p.iter() { count[(b - b'a') as usize] += 1; }
    let mut matches = count.iter().filter(|&&c| c == 0).count();
    let mut result = Vec::new();
    for i in 0..s.len() { // O(n)
        let idx = (s[i] - b'a') as usize;
        count[idx] -= 1;
        if count[idx] == 0 { matches += 1; }
        else if count[idx] == -1 { matches -= 1; }
        if i >= p.len() {
            let idx = (s[i - p.len()] - b'a') as usize;
            count[idx] += 1;
            if count[idx] == 0 { matches += 1; }
            else if count[idx] == 1 { matches -= 1; }
        }
        if matches == 26 { result.push((i as i32) - p.len() as i32 + 1); }
    }
    result
}
```
