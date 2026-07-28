---
author: JZ
pubDatetime: 2026-07-28T10:06:00Z
modDatetime: 2026-07-28T10:06:00Z
title: LeetCode 767 Reorganize String
featured: true
tags:
  - a-greedy
  - a-heap
  - a-counting
description:
  "Solutions for LeetCode 767, medium, tags: hash table, string, greedy, sorting, heap, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 767](https://leetcode.com/problems/reorganize-string/description/)

Given a string `s`, rearrange the characters of `s` so that any two adjacent characters are not the same.

Return any possible rearrangement of `s` or return `""` if not possible.

```
Example 1:

Input: s = "aab"
Output: "aba"

Example 2:

Input: s = "aaab"
Output: ""
```

**Constraints:**

- `1 <= s.length <= 500`
- `s` consists of lowercase English letters.

## Idea1: Counting + Interleave

The key insight: if the most frequent character appears more than `⌈n/2⌉` times, it's impossible. Otherwise, we can always construct a valid arrangement by placing characters at even indices first, then odd indices.

```
s = "aaabb" (n=5, max freq = 3 for 'a', ⌈5/2⌉ = 3 ✓)

Step 1: Place most frequent char at even indices
  idx: 0  1  2  3  4
       a  _  a  _  a

Step 2: Fill remaining chars at remaining positions
  idx: 0  1  2  3  4
       a  b  a  b  a
```

Why this works: by filling even indices with the most frequent character first, we guarantee it never appears adjacent to itself (even indices are always separated by at least one position). All remaining characters have lower frequency so they fit in the gaps.

Complexity: Time $O(n)$, Space $O(k)$ where $k \le 26$.

## Idea2: Max-Heap (Greedy)

Use a max-heap ordered by frequency. At each step, pop the most frequent character and append it. To avoid placing the same character consecutively, hold back the previous character and only re-insert it on the next iteration.

```
s = "aab"
heap: [('a',2), ('b',1)]

Step 1: pop 'a'(2), append 'a', prev=None → result="a", hold='a'(1)
Step 2: pop 'b'(1), append 'b', push back 'a'(1) → result="ab", hold='b'(0)
Step 3: pop 'a'(1), append 'a', 'b' count=0 skip → result="aba"
```

Complexity: Time $O(n \log k)$, Space $O(k)$ where $k \le 26$.

### Java

```java []
// solution 1, counting + interleave, O(n) time, O(k) space. 1ms, 41.72Mb.
public String reorganizeString(String s) {
    int[] count = new int[26];
    for (int i = 0; i < s.length(); i++) count[s.charAt(i) - 'a']++;
    int max = 0, maxInd = 0;
    for (int i = 0; i < count.length; i++) {
        if (count[i] > max) {
            max = count[i];
            maxInd = i;
        }
    }
    if (max > (s.length() + 1) / 2) return "";
    char[] res = new char[s.length()];
    int idx = 0;
    while (count[maxInd] > 0) { // O(n/2), place max frequency char at index 0,2,4,...
        res[idx] = (char) (maxInd + 'a');
        idx += 2;
        count[maxInd]--;
    }
    for (int i = 0; i < count.length; i++) { // O(n/2), fill remaining
        while (count[i] > 0) {
            if (idx >= res.length) idx = 1;
            res[idx] = (char) (i + 'a');
            idx += 2;
            count[i]--;
        }
    }
    return String.valueOf(res);
}
```
```java []
// solution 2, max-heap, O(n*log(k)) time, O(k) space. 4ms, 41.60 mb.
public String reorganizeString2(String s) {
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
    int[] counts = new int[26];
    int maxCnt = 0;
    for (int i = 0; i < s.length(); i++) {
        int id = s.charAt(i) - 'a';
        counts[id]++;
        if (counts[id] > maxCnt) maxCnt = counts[id];
    }
    if (maxCnt > (s.length() + 1) / 2) return "";
    for (int i = 0; i < counts.length; i++)
        if (counts[i] != 0) pq.add(new int[]{-counts[i], i});
    StringBuilder sb = new StringBuilder();
    int prevId = -1;
    while (!pq.isEmpty()) {
        int id = pq.remove()[1];
        sb.append((char) (id + 'a'));
        counts[id]--;
        if (prevId != -1 && counts[prevId] > 0)
            pq.add(new int[]{-counts[prevId], prevId});
        prevId = id;
    }
    return sb.toString();
}
```

### Python

```python []
# solution 1, counting + interleave, O(n) time, O(k) space.
class Solution:
    def reorganizeString(self, s: str) -> str:
        counts = defaultdict(int)
        max_c, max_cnt, n = None, 0, len(s)
        for c in s:
            counts[c] += 1
            if counts[c] > max_cnt:
                max_c, max_cnt = c, counts[c]
        if max_cnt > (n + 1) // 2:
            return ''
        i = 0
        res = [''] * n
        while counts[max_c] > 0:  # O(n/2)
            res[i] = max_c
            i += 2
            counts[max_c] -= 1
        for c in counts:  # O(n/2)
            while counts[c] > 0:
                if i > n - 1:
                    i = 1
                res[i] = c
                i += 2
                counts[c] -= 1
        return ''.join(res)
```
```python []
# solution 2, max-heap, O(n*log(k)) time, O(k) space. 36ms, 16.62mb.
class Solution3:
    def reorganizeString(self, s: str) -> str:
        counter = Counter(s)
        char_cnt = [(-counter[c], c) for c in counter]
        heapq.heapify(char_cnt)
        if -char_cnt[0][0] > (len(s) + 1) // 2: return ""

        res, prev = [], None
        while char_cnt:
            _, c = heapq.heappop(char_cnt)
            res.append(c)
            counter[c] -= 1
            if prev and counter[prev] > 0:
                heapq.heappush(char_cnt, (-counter[prev], prev))
            prev = c
        return "".join(res)
```

### C++

```cpp
// counting + interleave, O(n) time, O(k) space.
string reorganizeString(string s) {
    unordered_map<char, int> counts;
    char mC = 0;
    int maxCnt = 0;
    for (auto &c: s) {
        counts[c] += 1;
        if (counts[c] > maxCnt)
            maxCnt = counts[c], mC = c;
    }
    if (maxCnt > (s.size() + 1) / 2) return "";
    int i = 0;
    vector<char> res(s.size());
    while (counts[mC]-- > 0) { // O(n/2)
        res[i] = mC;
        i += 2;
    }
    for (auto &p: counts) { // O(n/2)
        while (p.second > 0) {
            if (i > s.size() - 1) i = 1;
            res[i] = p.first;
            i += 2;
            p.second--;
        }
    }
    return {res.begin(), res.end()};
}
```

### Rust

```rust
// counting + interleave, O(n) time, O(k) space.
pub fn reorganize_string(s: String) -> String {
    let (mut max_c, mut max_v) = (&0u8, 0);
    let mut counts = HashMap::new();
    for b in s.as_bytes() {
        counts.entry(b).and_modify(|v| *v += 1).or_insert(1);
        if counts[b] > max_v { (max_c, max_v) = (b, counts[b]); }
    }
    if max_v > (s.len() + 1) / 2 { return String::new(); }
    let (mut i, mut res) = (0, vec![0u8; s.len()]);
    while counts[max_c] > 0 { // O(n/2)
        res[i] = *max_c;
        i += 2;
        counts.entry(max_c).and_modify(|v| *v -= 1);
    }
    for (k, v) in counts.iter_mut() { // O(n/2)
        while *v > 0 {
            if i > s.len() - 1 { i = 1; }
            res[i] = **k;
            i += 2;
            *v -= 1;
        }
    }
    String::from_utf8(res).expect("invalid utf8")
}
```
