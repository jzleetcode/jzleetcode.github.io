---
author: JZ
pubDatetime: 2026-04-09T06:23:00Z
modDatetime: 2026-04-09T06:23:00Z
title: LeetCode 3 Longest Substring Without Repeating Characters
featured: false
tags:
  - a-sliding-window
  - a-hash
  - a-string
description:
  "Solutions for LeetCode 3, medium, tags: hash table, string, sliding window."
---

## Table of contents

## Description

Question link: [LeetCode 3](https://leetcode.com/problems/longest-substring-without-repeating-characters/description/).

Given a string `s`, find the length of the **longest substring** without repeating characters.

```
Example 1:

Input: s = "abcabcbb"
Output: 3
Explanation: The answer is "abc", with the length of 3.

Example 2:

Input: s = "bbbbb"
Output: 1
Explanation: The answer is "b", with the length of 1.

Example 3:

Input: s = "pwwkew"
Output: 3
Explanation: The answer is "wke", with the length of 3.
Notice that the answer must be a substring, not a subsequence,
"pwke" is a subsequence and not a substring.
```

**Constraints:**

- `0 <= s.length <= 5 * 10^4`
- `s` consists of English letters, digits, symbols and spaces.

## Idea1

Use a sliding window with a hash map that stores the last seen index for each character. The right pointer advances one step at a time. When a duplicate character is found within the current window, we jump the left pointer directly past the previous occurrence instead of shrinking one step at a time.

```
  s = "abcabcbb"

  step 0: left=0  right=0  window="a"         map={a:0}           res=1
  step 1: left=0  right=1  window="ab"        map={a:0,b:1}       res=2
  step 2: left=0  right=2  window="abc"       map={a:0,b:1,c:2}   res=3
  step 3: left=1  right=3  window="bca"       map={a:3,b:1,c:2}   res=3
                            ^ 'a' seen at 0, jump left to 0+1=1
  step 4: left=2  right=4  window="cab"       map={a:3,b:4,c:2}   res=3
                            ^ 'b' seen at 1, jump left to 1+1=2
  step 5: left=3  right=5  window="abc"       map={a:3,b:4,c:5}   res=3
  step 6: left=5  right=6  window="cb"        map={a:3,b:6,c:5}   res=3
  step 7: left=7  right=7  window="b"         map={a:3,b:7,c:5}   res=3
```

The key insight is the `left = max(left, lastSeen[ch] + 1)` jump. The `left` pointer never moves backward, and each character is visited at most twice (once by `right`, the index update is O(1)), giving us O(n) overall.

Complexity: Time $O(n)$, Space $O(\min(n, m))$ where $m$ is the character set size.

### Java

```java []
// sliding window with hash map, n, min(n,m). 2ms, 44mb.
public static int lengthOfLongestSubstring(String s) {
    Map<Character, Integer> lastSeen = new HashMap<>(); // O(min(n,m)) space for char->index
    int max = 0, left = 0;
    for (int right = 0; right < s.length(); right++) { // O(n) single pass
        char c = s.charAt(right);
        if (lastSeen.containsKey(c) && lastSeen.get(c) >= left) {
            left = lastSeen.get(c) + 1; // O(1) jump past previous occurrence
        }
        lastSeen.put(c, right); // O(1) update last seen index
        max = Math.max(max, right - left + 1);
    }
    return max;
}
```

### Python

```python []
class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last_seen: dict[str, int] = {}
        left = 0
        res = 0
        for right, ch in enumerate(s):  # O(n) — single pass
            if ch in last_seen and last_seen[ch] >= left:
                left = last_seen[ch] + 1  # O(1) jump
            last_seen[ch] = right
            res = max(res, right - left + 1)
        return res  # Time O(n), Space O(min(n, m)) where m is charset size
```

### C++

```cpp []
// sliding window with hash map. O(n) time, O(min(n,m)) space.
static int lengthOfLongestSubstring(const string& s) {
    unordered_map<char, int> lastSeen;
    int maxLen = 0;
    for (int left = 0, right = 0; right < (int)s.size(); ++right) {
        char c = s[right];
        if (lastSeen.count(c) && lastSeen[c] >= left) {
            left = lastSeen[c] + 1;
        }
        lastSeen[c] = right;
        maxLen = max(maxLen, right - left + 1);
    }
    return maxLen;
}
```

### Rust

```rust []
pub fn length_of_longest_substring(s: String) -> i32 {
    // sliding window with hash map, O(n) time, O(min(n,m)) space
    let mut map: HashMap<char, usize> = HashMap::new(); // char -> last seen index
    let mut max_len = 0;
    let mut left = 0; // left boundary of window

    for (right, ch) in s.chars().enumerate() {
        // O(n) — each char visited once by right pointer
        if let Some(&prev_idx) = map.get(&ch) {
            // jump left past the previous occurrence
            left = left.max(prev_idx + 1);
        }
        map.insert(ch, right); // update last seen index
        max_len = max_len.max(right - left + 1); // update answer
    }

    max_len as i32
}
```

## Idea2

Use a sliding window with a hash set. Instead of jumping the left pointer, we shrink the window one step at a time by removing characters from the left until the duplicate is gone. This is conceptually simpler but the left pointer may visit a character multiple times within a shrink loop.

The total work is still O(n) because each character is added to and removed from the set at most once across all iterations.

Complexity: Time $O(n)$, Space $O(\min(n, m))$.

### Java

```java []
// sliding window with hash set, n, min(n,m).
public static int lengthOfLongestSubstring2(String s) {
    Set<Character> window = new HashSet<>(); // O(min(n,m)) space for current window chars
    int max = 0, left = 0;
    for (int right = 0; right < s.length(); right++) { // O(n) outer pass
        char c = s.charAt(right);
        while (window.contains(c)) { // shrink window one step at a time
            window.remove(s.charAt(left)); // O(1) remove leftmost char
            left++;
        }
        window.add(c); // O(1) add current char
        max = Math.max(max, right - left + 1);
    }
    return max;
}
```

### Python

```python []
class Solution:
    def lengthOfLongestSubstring2(self, s: str) -> int:
        seen: set[str] = set()
        left = 0
        res = 0
        for right in range(len(s)):  # O(n) outer
            while s[right] in seen:  # O(n) total across all iterations
                seen.discard(s[left])
                left += 1
            seen.add(s[right])
            res = max(res, right - left + 1)
        return res  # Time O(n), Space O(min(n, m))
```

### C++

```cpp []
// sliding window with hash set. O(n) time, O(min(n,m)) space.
static int lengthOfLongestSubstring2(const string& s) {
    unordered_set<char> window;
    int maxLen = 0;
    for (int left = 0, right = 0; right < (int)s.size(); ++right) {
        while (window.count(s[right])) {
            window.erase(s[left]);
            ++left;
        }
        window.insert(s[right]);
        maxLen = max(maxLen, right - left + 1);
    }
    return maxLen;
}
```

### Rust

```rust []
pub fn length_of_longest_substring_set(s: String) -> i32 {
    // sliding window with hash set, O(n) time, O(min(n,m)) space
    let mut set: HashSet<char> = HashSet::new();
    let chars: Vec<char> = s.chars().collect();
    let mut max_len = 0;
    let mut left = 0; // left boundary of window

    for right in 0..chars.len() {
        // O(n) amortized — left moves at most n times total
        while set.contains(&chars[right]) {
            set.remove(&chars[left]); // shrink window one step
            left += 1;
        }
        set.insert(chars[right]);
        max_len = max_len.max(right - left + 1); // update answer
    }

    max_len as i32
}
```
