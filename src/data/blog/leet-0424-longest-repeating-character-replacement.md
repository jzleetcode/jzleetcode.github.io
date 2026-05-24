---
author: JZ
pubDatetime: 2026-05-18T06:23:00Z
modDatetime: 2026-05-18T06:23:00Z
title: LeetCode 424 Longest Repeating Character Replacement
featured: false
tags:
  - a-sliding-window
  - a-binary-search
  - a-string
  - a-hash
description:
  "Solutions for LeetCode 424, medium, tags: string, sliding window, hash table, binary search."
---

## Table of contents

## Description

Question link: [LeetCode 424](https://leetcode.com/problems/longest-repeating-character-replacement/description/).

You are given a string `s` and an integer `k`. You can choose any character of the string and change it to any other uppercase English letter. You can perform this operation at most `k` times.

Return the length of the longest substring containing the same letter you can get after performing the above operations.

```
Example 1:

Input: s = "ABAB", k = 2
Output: 4
Explanation: Replace the two 'B's with 'A's (or vice versa).

Example 2:

Input: s = "AABABBA", k = 1
Output: 4
Explanation: Replace the one 'A' in the middle with 'B' to form "AABBBBA".
The substring "BBBB" has the longest repeating letters, which is 4.
```

**Constraints:**

- `1 <= s.length <= 10^5`
- `s` consists of only uppercase English letters.
- `0 <= k <= s.length`

## Idea1

Sliding window with a frequency count array. We maintain a window `[left, right]` and track the maximum frequency of any single character within the window (`maxFreq`). The key invariant is:

```
window_length - maxFreq <= k
```

This means: the number of characters we need to replace (those that aren't the most frequent) must be at most `k`. When the invariant breaks, we shrink from the left.

```
  s = "AABABBA", k = 1

  right=0: window="A"       freq={A:1}       maxFreq=1  len=1  replace=0 <=1  res=1
  right=1: window="AA"      freq={A:2}       maxFreq=2  len=2  replace=0 <=1  res=2
  right=2: window="AAB"     freq={A:2,B:1}   maxFreq=2  len=3  replace=1 <=1  res=3
  right=3: window="AABA"    freq={A:3,B:1}   maxFreq=3  len=4  replace=1 <=1  res=4
  right=4: window="AABAB"   freq={A:3,B:2}   maxFreq=3  len=5  replace=2 > 1!
           shrink: window="ABAB"  freq={A:2,B:2}  left=1  len=4  replace=2 > 1!
           shrink: window="BAB"   freq={A:1,B:2}  left=2  len=3  replace=1 <=1  res=4
  right=5: window="BABB"    freq={A:1,B:3}   maxFreq=3  len=4  replace=1 <=1  res=4
  right=6: window="BABBA"   freq={A:2,B:3}   maxFreq=3  len=5  replace=2 > 1!
           shrink: window="ABBA"  freq={A:2,B:2}  left=3  len=4  replace=2 > 1!
           shrink: window="BBA"   freq={A:1,B:2}  left=4  len=3  replace=1 <=1  res=4
```

**Optimization**: `maxFreq` never needs to be decremented. The answer can only improve when `maxFreq` increases. A stale `maxFreq` just prevents the window from growing, but doesn't cause incorrect results — it only means we don't find a *better* answer with a lower `maxFreq`, which is fine since we already recorded the best result at the higher `maxFreq`.

Complexity: Time $O(n)$, Space $O(1)$ (26-element frequency array).

### Java

```java []
// sliding window, O(n) time, O(1) space.
public static int slidingWindow(String s, int k) {
    int[] count = new int[26]; // O(1) space, fixed 26 letters
    int maxFreq = 0, left = 0, res = 0;
    for (int right = 0; right < s.length(); right++) { // O(n) iteration
        count[s.charAt(right) - 'A']++;
        maxFreq = Math.max(maxFreq, count[s.charAt(right) - 'A']); // track max freq in window
        while (right - left + 1 - maxFreq > k) { // shrink window when replacements exceed k
            count[s.charAt(left) - 'A']--;
            left++;
        }
        res = Math.max(res, right - left + 1); // update longest valid window
    }
    return res;
}
```

### Python

```python []
def characterReplacement(self, s: str, k: int) -> int:
    count: dict[str, int] = {}
    left = 0
    max_freq = 0
    res = 0
    for right in range(len(s)):  # O(n)
        count[s[right]] = count.get(s[right], 0) + 1
        max_freq = max(max_freq, count[s[right]])  # O(1)
        while (right - left + 1) - max_freq > k:  # O(n) total shrinks
            count[s[left]] -= 1
            left += 1
        res = max(res, right - left + 1)
    return res  # Time O(n), Space O(26) = O(1)
```

### C++

```cpp []
// sliding window, O(n) time, O(1) space.
int characterReplacement(string s, int k) {
    int freq[26] = {};
    int maxFreq = 0, res = 0;
    for (int l = 0, r = 0; r < (int)s.size(); r++) {
        freq[s[r] - 'A']++;
        maxFreq = max(maxFreq, freq[s[r] - 'A']); // O(1) update
        while ((r - l + 1) - maxFreq > k) { // shrink window if invalid
            freq[s[l] - 'A']--;
            l++;
        }
        res = max(res, r - l + 1);
    }
    return res;
}
```

### Rust

```rust []
pub fn character_replacement(s: String, k: i32) -> i32 {
    let bytes = s.as_bytes();
    let mut freq = [0i32; 26]; // O(1) space — fixed 26 letters
    let mut max_freq = 0i32;
    let mut left = 0usize;
    let mut result = 0i32;

    for right in 0..bytes.len() { // O(n)
        let idx = (bytes[right] - b'A') as usize;
        freq[idx] += 1;
        max_freq = max_freq.max(freq[idx]); // O(1) update

        let window_len = (right - left + 1) as i32;
        if window_len - max_freq > k { // shrink from left
            let left_idx = (bytes[left] - b'A') as usize;
            freq[left_idx] -= 1;
            left += 1;
        }
        result = result.max((right - left + 1) as i32);
    }
    result
}
```

## Idea2

Binary search on the answer length. We binary search for the largest window size `L` such that there exists some window of size `L` with at least `(L - k)` occurrences of one character. For each candidate `L`, we slide a fixed-size window across the string and check if any window has `max_freq >= L - k`.

```
  s = "AABABBA", k = 1, n = 7

  Binary search: lo=1, hi=7
    mid=4: canAchieve(4)?
      window [0..3]="AABA" freq={A:3,B:1} maxFreq=3, 4-3=1 <=1 → YES
    lo=5
    mid=6: canAchieve(6)?
      window [0..5]="AABABB" freq={A:3,B:3} maxFreq=3, 6-3=3 > 1
      window [1..6]="ABABBA" freq={A:3,B:3} maxFreq=3, 6-3=3 > 1 → NO
    hi=5
    mid=5: canAchieve(5)?
      window [0..4]="AABAB" freq={A:3,B:2} maxFreq=3, 5-3=2 > 1
      window [1..5]="ABABB" freq={A:2,B:3} maxFreq=3, 5-3=2 > 1
      window [2..6]="BABBA" freq={A:2,B:3} maxFreq=3, 5-3=2 > 1 → NO
    hi=4
  Answer: 4
```

Complexity: Time $O(n \log n)$ ($O(\log n)$ binary search iterations, each with $O(n)$ window scan), Space $O(1)$.

### Java

```java []
// binary search on answer length, O(n log n) time, O(1) space.
public static int binarySearch(String s, int k) {
    int lo = 1, hi = s.length(), res = 0; // binary search on window length
    while (lo <= hi) { // O(log n) iterations
        int mid = lo + (hi - lo) / 2;
        if (canAchieve(s, k, mid)) { // O(n) check
            res = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return res;
}

private static boolean canAchieve(String s, int k, int len) {
    int[] count = new int[26];
    for (int i = 0; i < s.length(); i++) { // slide fixed-size window
        count[s.charAt(i) - 'A']++;
        if (i >= len) count[s.charAt(i - len) - 'A']--; // remove left element
        if (i >= len - 1) {
            int maxFreq = 0;
            for (int c : count) maxFreq = Math.max(maxFreq, c); // O(26) = O(1)
            if (len - maxFreq <= k) return true;
        }
    }
    return false;
}
```

### Python

```python []
def characterReplacement2(self, s: str, k: int) -> int:
    def can_achieve(length: int) -> bool:
        count: dict[str, int] = {}
        for i in range(len(s)):  # O(n) per check
            count[s[i]] = count.get(s[i], 0) + 1
            if i >= length:
                count[s[i - length]] -= 1
            if i >= length - 1:
                if max(count.values()) >= length - k:  # O(26) = O(1)
                    return True
        return False

    lo, hi = 1, len(s)  # O(log n) binary search iterations
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if can_achieve(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo  # Time O(n log n), Space O(26) = O(1)
```

### C++

```cpp []
// binary search on answer length, O(n log n) time, O(1) space.
int characterReplacement(string s, int k) {
    int n = s.size();
    int lo = 1, hi = n, ans = 1;
    while (lo <= hi) { // O(log n) iterations
        int mid = lo + (hi - lo) / 2;
        if (canAchieve(s, k, mid)) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

bool canAchieve(const string& s, int k, int len) {
    int freq[26] = {};
    for (int i = 0; i < (int)s.size(); i++) {
        freq[s[i] - 'A']++;
        if (i >= len) freq[s[i - len] - 'A']--; // slide out left
        if (i >= len - 1) {
            int maxFreq = *max_element(freq, freq + 26); // O(26) = O(1)
            if (len - maxFreq <= k) return true;
        }
    }
    return false;
}
```

### Rust

```rust []
pub fn character_replacement_binary_search(s: String, k: i32) -> i32 {
    let bytes = s.as_bytes();
    let n = bytes.len();
    if n == 0 { return 0; }

    let mut lo = 1usize; // O(log n) iterations
    let mut hi = n;
    while lo < hi {
        let mid = lo + (hi - lo + 1) / 2;
        if can_make_window(bytes, k, mid) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo as i32
}

fn can_make_window(bytes: &[u8], k: i32, win_len: usize) -> bool {
    let mut freq = [0i32; 26]; // O(1) space
    let mut max_freq = 0i32;
    for i in 0..bytes.len() { // O(n) scan
        let idx = (bytes[i] - b'A') as usize;
        freq[idx] += 1;
        max_freq = max_freq.max(freq[idx]);
        if i >= win_len {
            let left_idx = (bytes[i - win_len] - b'A') as usize;
            freq[left_idx] -= 1;
            max_freq = *freq.iter().max().unwrap(); // O(26) = O(1)
        }
        if i + 1 >= win_len && (win_len as i32 - max_freq) <= k {
            return true;
        }
    }
    false
}
```
