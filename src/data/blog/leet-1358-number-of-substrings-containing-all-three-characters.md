---
author: JZ
pubDatetime: 2026-11-16T19:47:57Z
modDatetime: 2026-11-16T19:47:57Z
title: LeetCode 1358 Number of Substrings Containing All Three Characters
featured: true
tags:
  - a-sliding-window
  - a-string
  - a-counting
description:
  "Solutions for LeetCode 1358, medium, tags: string, sliding window, counting."
---

## Table of contents

## Description

Question Link: [LeetCode 1358](https://leetcode.com/problems/number-of-substrings-containing-all-three-characters/description/)

Given a string `s` consisting only of `a`, `b`, and `c`, return the number of substrings that contain at least one occurrence of each character.

```
Example 1:
Input: s = "abcabc"
Output: 10

Example 2:
Input: s = "aaacb"
Output: 3

Example 3:
Input: s = "abc"
Output: 1

Constraints:
3 <= s.length <= 5 * 10^4
s consists only of characters a, b, and c.
```

## Idea

Count valid substrings by their right endpoint. For each position, we need to know how many starting positions make the substring ending there contain all three characters.

### Last-seen positions

Keep the most recent index of `a`, `b`, and `c`, initially `-1`. After processing index `i`, let `m` be the smallest of those three positions. If `m == -1`, a character has not appeared yet, so there are no valid substrings ending at `i`. Otherwise, every start from `0` through `m` includes the latest occurrence of all three characters. That gives `m + 1` valid substrings ending at `i`.

For `s = "abcabc"`:

```
i  char  last a,b,c  valid substrings ending here
0   a    0,-1,-1     0
1   b    0,1,-1      0
2   c    0,1,2       1
3   a    3,1,2       2
4   b    3,4,2       3
5   c    3,4,5       4
                         --
total                    10
```

This method scans the string once and stores three indices. Time is $O(n)$ and extra space is $O(1)$.

### Sliding window

Keep a count for each character in the current window. When the window contains all three, move its left edge right until it no longer does. At that point, `left` is the number of valid starts for substrings ending at the current right edge: every earlier start still includes the valid window, and starting at `left` does not.

Each pointer moves at most `n` times, so time is $O(n)$. The three counts use $O(1)$ extra space.

### Java

```java []
// See algorithm-java/src/main/java/sliding/NumberOfSubstringsContainingAllThreeCharacters.java for the complete class.
// Last-seen positions: O(n) time and O(1) extra space.
public static int numberOfSubstrings(String s) {
    int[] lastSeen = {-1, -1, -1};
    int result = 0;
    for (int right = 0; right < s.length(); right++) { // O(n)
        lastSeen[s.charAt(right) - 'a'] = right;
        result += 1 + Math.min(lastSeen[0], Math.min(lastSeen[1], lastSeen[2]));
    }
    return result;
}

// Sliding window: O(n) time and O(1) extra space.
public static int numberOfSubstringsSlidingWindow(String s) {
    int[] counts = new int[3];
    int left = 0;
    int result = 0;
    for (int right = 0; right < s.length(); right++) { // O(n), both pointers move at most n times
        counts[s.charAt(right) - 'a']++;
        while (counts[0] > 0 && counts[1] > 0 && counts[2] > 0) {
            counts[s.charAt(left) - 'a']--;
            left++;
        }
        result += left;
    }
    return result;
}
```

### Python

```python []
class Solution:
    def numberOfSubstrings(self, s: str) -> int:
        last_pos = [-1] * 3  # O(1) auxiliary space
        total = 0
        for pos in range(len(s)):  # O(n) time
            last_pos[ord(s[pos]) - ord("a")] = pos
            total += 1 + min(last_pos)
        return total


class Solution2:
    def numberOfSubstrings(self, s: str) -> int:
        counts = [0] * 3  # O(1) auxiliary space
        left = total = 0
        for right, char in enumerate(s):  # O(n); each left index advances once
            counts[ord(char) - ord("a")] += 1
            while counts[0] and counts[1] and counts[2]:
                left_char = s[left]
                counts[ord(left_char) - ord("a")] -= 1
                left += 1
            total += left
        return total
```

### C++

```cpp []
// See CSAPP/leetcode/src/sliding/NumberOfSubstringsContainingAllThreeCharacters.hpp for the complete class.
class SolutionNumberOfSubstringsContainingAllThreeCharacters {
public:
    // Last-seen positions: O(n) time, O(1) extra space.
    int numberOfSubstrings(const string& s) {
        int lastSeen[3] = {-1, -1, -1};
        int total = 0;
        for (int right = 0; right < (int)s.size(); ++right) { // O(n)
            lastSeen[s[right] - 'a'] = right;
            total += min({lastSeen[0], lastSeen[1], lastSeen[2]}) + 1;
        }
        return total;
    }

    // Sliding window: O(n) time, O(1) extra space.
    int numberOfSubstringsSlidingWindow(const string& s) {
        int counts[3] = {0, 0, 0};
        int left = 0, total = 0;
        for (int right = 0; right < (int)s.size(); ++right) { // each pointer advances at most n times
            ++counts[s[right] - 'a'];
            while (counts[0] > 0 && counts[1] > 0 && counts[2] > 0) {
                --counts[s[left] - 'a'];
                ++left;
            }
            total += left;
        }
        return total;
    }
};
```

### Rust

```rust []
// See in_code_learning_rust/crates/leet/src/sliding/number_of_substrings_containing_all_three_characters.rs for the complete source.
pub struct Solution;

impl Solution {
    // Last-seen positions: O(n) time and O(1) auxiliary space.
    pub fn number_of_substrings(s: String) -> i32 {
        let mut last_seen = [-1; 3];
        let mut total = 0;
        for (right, byte) in s.bytes().enumerate() { // O(n)
            last_seen[(byte - b'a') as usize] = right as i32;
            total += last_seen.iter().min().unwrap() + 1;
        }
        total
    }

    // Sliding window: O(n) time and O(1) auxiliary space.
    pub fn number_of_substrings_sliding_window(s: String) -> i32 {
        let bytes = s.as_bytes();
        let mut counts = [0; 3];
        let mut left = 0;
        let mut total = 0;
        for &byte in bytes { // each byte enters and leaves the window at most once
            counts[(byte - b'a') as usize] += 1;
            while counts.iter().all(|&count| count > 0) {
                counts[(bytes[left] - b'a') as usize] -= 1;
                left += 1;
            }
            total += left as i32;
        }
        total
    }
}
```
