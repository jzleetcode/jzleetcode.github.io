---
author: JZ
pubDatetime: 2026-09-25T10:38:00Z
modDatetime: 2026-09-25T10:38:00Z
title: LeetCode 395 Longest Substring with At Least K Repeating Characters
featured: true
tags:
  - a-divide-and-conquer
  - a-sliding-window
description:
  "Solutions for LeetCode 395, medium, tags: hash table, string, divide and conquer, sliding window."
---

## Table of contents

## Description

Given a string `s` and an integer `k`, return the length of the longest substring of `s` such that the frequency of each character in this substring is greater than or equal to `k`.

If no such substring exists, return `0`.

**Example 1:**

```
Input: s = "aaabb", k = 3
Output: 3
Explanation: The longest substring is "aaa", as 'a' is repeated 3 times.
```

**Example 2:**

```
Input: s = "ababbc", k = 2
Output: 5
Explanation: The longest substring is "ababb", as 'a' is repeated 2 times
and 'b' is repeated 3 times.
```

### Constraints

- `1 <= s.length <= 10^4`
- `s` consists of only lowercase English letters.
- `1 <= k <= 10^5`

Link: [LeetCode 395](https://leetcode.com/problems/longest-substring-with-at-least-k-repeating-characters/)

## Idea1: Divide and Conquer

**Key Insight:** Any character whose total frequency in the string is less than `k` can never appear in a valid substring. That character acts as a natural **split point** — no valid substring can cross it.

```
s = "aaabbbdcccc", k = 2

Step 1: count frequencies
  a:3  b:3  d:1  c:4
         ^
         'd' appears only once (< k=2), so split on 'd'

Step 2: split → ["aaabbb", "cccc"]

Step 3: recurse
  "aaabbb" → all chars >= 2 → length 6
  "cccc"   → all chars >= 2 → length 4

Result: max(6, 4) = 6
```

**Why it terminates:** Each recursion level eliminates at least one character from the alphabet. Since there are at most 26 lowercase letters, the recursion depth is at most 26. Each level scans $O(n)$ characters total.

Complexity: Time $O(26 \cdot n) = O(n)$, Space $O(26) = O(1)$.

## Idea2: Sliding Window

The standard sliding window doesn't directly apply here because we can't decide when to shrink — both expanding and shrinking might improve the answer. The trick is to **enumerate the target number of unique characters** in the window.

For each target $t$ from $1$ to $\text{totalUnique}$:
- Expand the right pointer. If unique count $\leq t$, keep expanding.
- If unique count exceeds $t$, shrink from the left.
- When unique count equals $t$ and all $t$ characters have frequency $\geq k$, update the answer.

```
s = "ababbc", k = 2, target unique = 2

 l           r
 a  b  a  b  b  c
 ^              ^
 unique=3 > target=2 → shrink

    l        r
    b  a  b  b  c
    ^           ^
    unique=3 > target=2 → shrink

       l     r
       a  b  b  c
       ^        ^
       unique=3 > target=2 → shrink

          l  r
          b  b  c
          ^     ^
          unique=2 == target, but 'c' has freq 1 < k=2

For target unique = 2, the best window found is "ababb" (len 5)
where a:2, b:3, both >= k=2.
```

Since there are at most 26 possible target values, and each target does a single-pass $O(n)$ scan:

Complexity: Time $O(26 \cdot n) = O(n)$, Space $O(26) = O(1)$.

### Java

```java []
// solution 1, sliding window, O(un) time, O(26) space.
public static int longestSubstring1(String s, int k) {
    int count[] = new int[26], u = countUnique(s), res = 0;
    for (int curUniqCnt = 1; curUniqCnt <= u; curUniqCnt++) { // O(26) targets
        Arrays.fill(count, 0);
        for (int l = 0, r = 0, uC = 0, cAtLeastK = 0; r < s.length(); ) { // O(n)
            if (uC <= curUniqCnt) { // expand the sliding window
                int idx = s.charAt(r++) - 'a';
                if (count[idx]++ == 0) uC++;
                if (count[idx] == k) cAtLeastK++;
            } else { // shrink the sliding window
                int idx = s.charAt(l++) - 'a';
                if (count[idx]-- == k) cAtLeastK--;
                if (count[idx] == 0) uC--;
            }
            if (uC == curUniqCnt && uC == cAtLeastK)
                res = Math.max(r - l, res);
        }
    }
    return res;
}

// solution 2, divide and conquer, O(26n) time, O(26) space.
public static int longestSubstring2(String s, int k) {
    return dc(s, 0, s.length(), k);
}

private static int dc(String s, int start, int end, int k) {
    if (end - start < k) return 0;
    int[] count = new int[26];
    for (int i = start; i < end; i++) count[s.charAt(i) - 'a']++; // O(n)
    for (int i = start; i < end; i++) {
        if (count[s.charAt(i) - 'a'] >= k) continue;
        int j = i + 1;
        while (j < end && count[s.charAt(j) - 'a'] < k) j++; // skip consecutive invalid
        return Math.max(dc(s, start, i, k), dc(s, j, end, k)); // recurse both halves
    }
    return end - start; // all chars meet threshold
}

static int countUnique(String s) {
    boolean seen[] = new boolean[26];
    int res = 0;
    for (int i = 0; i < s.length(); i++) {
        int ci = s.charAt(i) - 'a';
        if (!seen[ci]) { res++; seen[ci] = true; }
    }
    return res;
}
```

### Python

```python []
# solution 1, divide and conquer, O(26n) time, O(26) space.
def longestSubstring(self, s: str, k: int) -> int:
    if len(s) < k:
        return 0
    freq = Counter(s)
    for ch in freq:  # O(26) unique chars at most
        if freq[ch] < k:
            return max(  # O(n) split, recurse on each part
                self.longestSubstring(part, k)
                for part in s.split(ch)
            )
    return len(s)  # all chars meet threshold

# solution 2, sliding window, O(26n) time, O(26) space.
def longestSubstring2(self, s: str, k: int) -> int:
    n = len(s)
    unique_total = len(set(s))
    res = 0
    for target in range(1, unique_total + 1):  # O(26) targets
        count = [0] * 26
        left = unique = at_least_k = 0
        for right in range(n):  # O(n) per target
            idx = ord(s[right]) - ord('a')
            if count[idx] == 0:
                unique += 1
            count[idx] += 1
            if count[idx] == k:
                at_least_k += 1
            while unique > target:  # shrink window
                li = ord(s[left]) - ord('a')
                if count[li] == k:
                    at_least_k -= 1
                count[li] -= 1
                if count[li] == 0:
                    unique -= 1
                left += 1
            if unique == target == at_least_k:
                res = max(res, right - left + 1)
    return res
```

### C++

```cpp []
// solution 1, divide and conquer, O(26n) time, O(26) space.
int longestSubstring(const string& s, int k) {
    return dc(s, 0, s.size(), k);
}
int dc(const string& s, int start, int end, int k) {
    if (end - start < k) return 0;
    int cnt[26] = {};
    for (int i = start; i < end; ++i) cnt[s[i] - 'a']++; // O(n)
    for (int i = start; i < end; ++i) {
        if (cnt[s[i] - 'a'] >= k) continue;
        int j = i + 1;
        while (j < end && cnt[s[j] - 'a'] < k) j++;
        return max(dc(s, start, i, k), dc(s, j, end, k));
    }
    return end - start;
}

// solution 2, sliding window, O(26n) time, O(26) space.
int longestSubstring2(const string& s, int k) {
    int totalUnique = unordered_set<char>(s.begin(), s.end()).size();
    int res = 0;
    for (int target = 1; target <= totalUnique; ++target) { // O(26) targets
        int cnt[26] = {};
        int left = 0, unique = 0, kOrMore = 0;
        for (int right = 0; right < (int)s.size(); ++right) { // O(n)
            int c = s[right] - 'a';
            if (cnt[c]++ == 0) unique++;
            if (cnt[c] == k) kOrMore++;
            while (unique > target) {
                int l = s[left] - 'a';
                if (cnt[l] == k) kOrMore--;
                if (--cnt[l] == 0) unique--;
                left++;
            }
            if (unique == target && kOrMore == target)
                res = max(res, right - left + 1);
        }
    }
    return res;
}
```

### Rust

```rust []
// solution 1, divide and conquer, O(26n) time, O(26) space.
pub fn longest_substring(s: String, k: i32) -> i32 {
    fn dc(s: &[u8], k: usize) -> i32 {
        if s.is_empty() { return 0; }
        let mut freq = [0usize; 26];
        for &b in s { freq[(b - b'a') as usize] += 1; } // O(n)
        if let Some(&split_char) = s.iter().find(|&&b| {
            let f = freq[(b - b'a') as usize];
            f > 0 && f < k
        }) {
            s.split(|&b| b == split_char)
                .map(|part| dc(part, k))
                .max().unwrap_or(0)
        } else {
            s.len() as i32 // all chars >= k
        }
    }
    dc(s.as_bytes(), k as usize)
}

// solution 2, sliding window, O(26n) time, O(26) space.
pub fn longest_substring2(s: String, k: i32) -> i32 {
    let bytes = s.as_bytes();
    let k = k as usize;
    let mut seen = [false; 26];
    for &b in bytes { seen[(b - b'a') as usize] = true; }
    let total_unique = seen.iter().filter(|&&v| v).count();
    let mut result = 0;
    for target in 1..=total_unique { // O(26) targets
        let mut freq = [0usize; 26];
        let (mut left, mut unique, mut at_least_k) = (0, 0, 0);
        for right in 0..bytes.len() { // O(n)
            let ri = (bytes[right] - b'a') as usize;
            if freq[ri] == 0 { unique += 1; }
            freq[ri] += 1;
            if freq[ri] == k { at_least_k += 1; }
            while unique > target {
                let li = (bytes[left] - b'a') as usize;
                if freq[li] == k { at_least_k -= 1; }
                freq[li] -= 1;
                if freq[li] == 0 { unique -= 1; }
                left += 1;
            }
            if unique == target && at_least_k == target {
                result = result.max(right - left + 1);
            }
        }
    }
    result as i32
}
```
