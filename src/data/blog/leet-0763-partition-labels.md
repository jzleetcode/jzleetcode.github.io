---
author: JZ
pubDatetime: 2026-05-10T06:00:00Z
modDatetime: 2026-05-10T06:00:00Z
title: LeetCode 763 Partition Labels
featured: true
tags:
  - a-greedy
  - a-hash-table
  - a-string
description:
  "Solutions for LeetCode 763, medium, tags: greedy, hash table, string, two pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 763](https://leetcode.com/problems/partition-labels/description/)

You are given a string `s`. We want to partition the string into as many parts as possible so that each letter appears in at most one part.

Note that the partition is done so that after concatenating all the parts in order, the resultant string should be `s`.

Return a list of integers representing the size of these parts.

```
Example 1:

Input: s = "ababcbacadefegdehijhklij"
Output: [9,7,8]
Explanation:
The partition is "ababcbaca", "defegde", "hijhklij".
This is a partition so that each letter appears in at most one part.
A partition like "ababcbacadefegde", "hijhklij" is incorrect, because it splits s into less parts.

Example 2:

Input: s = "eccbbbbdec"
Output: [10]

Constraints:

1 <= s.length <= 500
s consists of lowercase English letters.
```

## Solution 1: Greedy (Last Occurrence)

### Idea

For each character, record its last occurrence index. Then scan left to right, maintaining the current partition's end as the maximum last-occurrence of all characters seen so far. When the current index reaches the partition end, we've found a complete partition.

```
s = "ababcbacadefegdehijhklij"

Last occurrence:  a->8  b->5  c->7  d->14  e->15  f->11
                  g->13 h->19 i->22 j->23  k->20  l->21

Scan:
  i=0  'a' end=max(0,8)=8
  i=1  'b' end=max(8,5)=8
  ...
  i=8  'a' end=8  => i==end, partition [0..8] size=9
  i=9  'd' end=max(0,14)=14
  ...
  i=15 'e' end=15 => i==end, partition [9..15] size=7
  i=16 'h' end=max(0,19)=19
  ...
  i=23 'j' end=23 => i==end, partition [16..23] size=8

Result: [9, 7, 8]
```

Complexity: Time $O(n)$ — two passes over the string. Space $O(1)$ — array of 26 integers.

#### Java

```java []
public List<Integer> partitionLabels(String s) {
    int[] last = new int[26]; // O(1) space
    for (int i = 0; i < s.length(); i++) { // O(n)
        last[s.charAt(i) - 'a'] = i;
    }
    List<Integer> result = new ArrayList<>();
    int start = 0, end = 0;
    for (int i = 0; i < s.length(); i++) { // O(n)
        end = Math.max(end, last[s.charAt(i) - 'a']);
        if (i == end) {
            result.add(end - start + 1);
            start = end + 1;
        }
    }
    return result;
}
```

#### Python

```python []
class Solution:
    """Greedy with last occurrence. O(n) time, O(1) space."""

    def partitionLabels(self, s: str) -> list[int]:
        last_occurrence = [0] * 26  # O(1) space, 26 letters
        for i, char in enumerate(s):  # O(n)
            last_occurrence[ord(char) - ord("a")] = i

        partition_end = 0
        partition_start = 0
        partition_sizes = []

        for i, char in enumerate(s):  # O(n)
            partition_end = max(
                partition_end, last_occurrence[ord(char) - ord("a")]
            )
            if i == partition_end:
                partition_sizes.append(i - partition_start + 1)
                partition_start = i + 1

        return partition_sizes
```

#### C++

```cpp []
vector<int> partitionLabels(string s) {
    int last[26] = {};
    for (int i = 0; i < (int)s.size(); i++)
        last[s[i] - 'a'] = i; // O(n) pass to record last occurrence

    vector<int> res;
    int start = 0, end = 0;
    for (int i = 0; i < (int)s.size(); i++) {
        end = max(end, last[s[i] - 'a']); // O(1) expand partition end
        if (i == end) {
            res.push_back(end - start + 1);
            start = i + 1;
        }
    }
    return res;
}
```

#### Rust

```rust []
pub fn partition_labels(s: String) -> Vec<i32> {
    let bytes = s.as_bytes();
    // Track last occurrence of each character — O(n) pass
    let mut last = [0usize; 26];
    for (i, &b) in bytes.iter().enumerate() {
        last[(b - b'a') as usize] = i;
    }
    // Greedily expand partition end — O(n) pass
    let mut result = Vec::new();
    let mut start = 0;
    let mut end = 0;
    for (i, &b) in bytes.iter().enumerate() {
        end = end.max(last[(b - b'a') as usize]);
        if i == end {
            result.push((end - start + 1) as i32);
            start = end + 1;
        }
    }
    result
}
```

## Solution 2: Merge Intervals

### Idea

For each unique character, compute the interval `[first_occurrence, last_occurrence]`. Sort these intervals by start position, then merge overlapping intervals. Each merged interval corresponds to one partition.

```
s = "ababcbacadefegdehijhklij"

Character intervals:
  a: [0, 8]    b: [1, 5]    c: [4, 7]
  d: [9, 14]   e: [10, 15]  f: [11, 11]
  g: [12, 13]  h: [16, 19]  i: [18, 22]
  j: [19, 23]  k: [20, 20]  l: [21, 21]

Sorted by start:
  [0,8] [1,5] [4,7] [9,14] [10,15] [11,11] [12,13] [16,19] [18,22] [19,23] [20,20] [21,21]

Merge:
  [0,8]  <- merge [1,5],[4,7] all overlap -> merged [0,8]   size=9
  [9,15] <- merge [9,14],[10,15],[11,11],[12,13]             size=7
  [16,23]<- merge [16,19],[18,22],[19,23],[20,20],[21,21]    size=8

Result: [9, 7, 8]
```

Complexity: Time $O(n)$ — one pass to build intervals, sorting 26 intervals is $O(26 \log 26) = O(1)$, merging is $O(26) = O(1)$. Space $O(1)$.

#### Java

```java []
public List<Integer> partitionLabels(String s) {
    int[] first = new int[26];
    int[] lastIdx = new int[26];
    Arrays.fill(first, -1);
    for (int i = 0; i < s.length(); i++) { // O(n)
        int c = s.charAt(i) - 'a';
        if (first[c] == -1) first[c] = i;
        lastIdx[c] = i;
    }
    // Build intervals for each character that appears
    int[][] intervals = new int[26][2];
    int count = 0;
    for (int c = 0; c < 26; c++) { // O(26) = O(1)
        if (first[c] != -1) {
            intervals[count][0] = first[c];
            intervals[count][1] = lastIdx[c];
            count++;
        }
    }
    Arrays.sort(intervals, 0, count, (a, b) -> a[0] - b[0]); // O(26 log 26) = O(1)
    // Merge intervals
    List<Integer> result = new ArrayList<>();
    int start = intervals[0][0], end = intervals[0][1];
    for (int i = 1; i < count; i++) { // O(26) = O(1)
        if (intervals[i][0] <= end) {
            end = Math.max(end, intervals[i][1]);
        } else {
            result.add(end - start + 1);
            start = intervals[i][0];
            end = intervals[i][1];
        }
    }
    result.add(end - start + 1);
    return result;
}
```

#### Python

```python []
class Solution2:
    """Merge intervals. O(n) time, O(1) space."""

    def partitionLabels(self, s: str) -> list[int]:
        first = {}
        last = {}
        for i, ch in enumerate(s):  # O(n)
            if ch not in first:
                first[ch] = i
            last[ch] = i

        # Build and merge intervals for each unique char: at most 26
        intervals = sorted((first[ch], last[ch]) for ch in first)  # O(26 log 26) = O(1)

        result = []
        start, end = intervals[0]
        for s_i, e_i in intervals[1:]:  # O(26) = O(1)
            if s_i <= end:
                end = max(end, e_i)
            else:
                result.append(end - start + 1)
                start, end = s_i, e_i
        result.append(end - start + 1)

        return result
```

#### C++

```cpp []
vector<int> partitionLabels(string s) {
    int first[26], last[26];
    fill(first, first + 26, -1);
    fill(last, last + 26, -1);

    for (int i = 0; i < (int)s.size(); i++) {
        int c = s[i] - 'a';
        if (first[c] == -1) first[c] = i;
        last[c] = i;
    }

    // Collect intervals for chars that appear
    vector<pair<int,int>> intervals;
    for (int i = 0; i < 26; i++) {
        if (first[i] != -1)
            intervals.push_back({first[i], last[i]});
    }

    // Sort by start position
    sort(intervals.begin(), intervals.end());

    // Merge overlapping intervals
    vector<int> res;
    int start = intervals[0].first, end = intervals[0].second;
    for (int i = 1; i < (int)intervals.size(); i++) {
        if (intervals[i].first <= end) {
            end = max(end, intervals[i].second); // merge
        } else {
            res.push_back(end - start + 1);
            start = intervals[i].first;
            end = intervals[i].second;
        }
    }
    res.push_back(end - start + 1); // last partition
    return res;
}
```

#### Rust

```rust []
pub fn partition_labels(s: String) -> Vec<i32> {
    let bytes = s.as_bytes();
    // Build [first, last] interval for each unique character — O(n)
    let mut intervals: [(i32, i32); 26] = [(-1, -1); 26];
    for (i, &b) in bytes.iter().enumerate() {
        let idx = (b - b'a') as usize;
        if intervals[idx].0 == -1 {
            intervals[idx].0 = i as i32;
        }
        intervals[idx].1 = i as i32;
    }
    // Collect only characters that appear, sort by start — O(26 log 26) = O(1)
    let mut present: Vec<(i32, i32)> = intervals.iter().copied().filter(|&(f, _)| f != -1).collect();
    present.sort_unstable();
    // Merge overlapping intervals — O(26) = O(1)
    let mut result = Vec::new();
    let mut cur_start = present[0].0;
    let mut cur_end = present[0].1;
    for &(s, e) in present.iter().skip(1) {
        if s <= cur_end {
            cur_end = cur_end.max(e);
        } else {
            result.push(cur_end - cur_start + 1);
            cur_start = s;
            cur_end = e;
        }
    }
    result.push(cur_end - cur_start + 1);
    result
}
```
