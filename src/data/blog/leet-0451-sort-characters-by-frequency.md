---
author: JZ
pubDatetime: 2026-09-20T10:07:00Z
modDatetime: 2026-09-20T10:07:00Z
title: LeetCode 451 Sort Characters By Frequency
featured: true
tags:
  - a-hash-table
  - a-string
  - a-sorting
  - a-heap
  - a-bucket-sort
description:
  "Solutions for LeetCode 451, medium, tags: hash table, string, sorting, heap, bucket sort."
---

## Table of contents

## Description

Question Links: [LeetCode 451](https://leetcode.com/problems/sort-characters-by-frequency/description/)

Given a string `s`, sort it in **decreasing order** based on the **frequency** of the characters. The *frequency* of a character is the number of times it appears in the string.

Return the sorted string. If there are multiple answers, return any of them.

```
Example 1:

Input: s = "tree"
Output: "eert"
Explanation: 'e' appears twice while 'r' and 't' both appear once.
So 'e' must appear before both 'r' and 't'. Therefore "eetr" is also a valid answer.

Example 2:

Input: s = "cccaaa"
Output: "cccaaa"
Explanation: Both 'c' and 'a' appear three times, so both "cccaaa" and "aaaccc" are valid answers.
Note that "cacaca" is incorrect, as the same characters must be together.

Example 3:

Input: s = "Aabb"
Output: "bbAa"
Explanation: "bbaA" is also a valid answer, but "Aabb" is incorrect.
Note that 'A' and 'a' are treated as two different characters.

Constraints:

1 <= s.length <= 5 * 10^5
s consists of uppercase and lowercase English letters and digits.
```

## Solution 1: HashMap + Sort

### Idea

Count the frequency of each character with a hash map, then sort the unique characters by their frequency in descending order. Finally, build the result string by repeating each character by its count.

```
Input: "tree"

Step 1 — count frequencies:
  count = {'t': 1, 'r': 1, 'e': 2}

Step 2 — sort unique chars by frequency descending:
  sorted = ['e', 't', 'r']  (t and r tie at 1, order doesn't matter)

Step 3 — build result:
  'e' * 2 + 't' * 1 + 'r' * 1 = "eetr"
```

Complexity: Time $O(n + k \log k)$ where $n$ = string length and $k$ = number of unique characters (at most 62: a-z, A-Z, 0-9), so $k \log k$ is effectively constant. Space $O(n)$ for the result.

#### Java

```java []
public static String frequencySortSort(String s) {
    Map<Character, Integer> count = new HashMap<>();
    for (char c : s.toCharArray()) count.merge(c, 1, Integer::sum); // O(n)
    List<Character> chars = new ArrayList<>(count.keySet());
    chars.sort((a, b) -> count.get(b) - count.get(a)); // O(k log k)
    StringBuilder sb = new StringBuilder();
    for (char c : chars) sb.append(String.valueOf(c).repeat(count.get(c))); // O(n)
    return sb.toString();
}
```

#### Python

```python []
class Solution:
    def frequencySort(self, s: str) -> str:
        count = Counter(s)  # O(n)
        chars = sorted(count.keys(), key=lambda c: -count[c])  # O(k log k)
        return ''.join(c * count[c] for c in chars)  # O(n)
```

#### C++

```cpp []
string frequencySortSort(string s) {
    unordered_map<char, int> count;
    for (char c : s) count[c]++; // O(n)
    vector<char> chars;
    for (auto &[c, _] : count) chars.push_back(c);
    sort(chars.begin(), chars.end(), [&](char a, char b) { // O(k log k)
        return count[a] > count[b];
    });
    string result;
    for (char c : chars) result.append(count[c], c); // O(n)
    return result;
}
```

#### Rust

```rust []
pub fn frequency_sort(s: String) -> String {
    let mut count: HashMap<char, usize> = HashMap::new();
    for c in s.chars() { *count.entry(c).or_default() += 1; } // O(n)
    let mut chars: Vec<char> = count.keys().copied().collect();
    chars.sort_unstable_by(|a, b| count[b].cmp(&count[a])); // O(k log k)
    let mut result = String::with_capacity(s.len());
    for c in chars { for _ in 0..count[&c] { result.push(c); } } // O(n)
    result
}
```

## Solution 2: Bucket Sort

### Idea

Instead of sorting, use bucket sort where the bucket index represents the frequency. After counting character frequencies, place each character into the bucket matching its frequency. Then iterate buckets from highest to lowest, appending characters to the result.

This avoids the $O(k \log k)$ comparison sort by leveraging the fact that frequencies are bounded by $n$.

```
Input: "tree"

Step 1 — count frequencies:
  count = {'t': 1, 'r': 1, 'e': 2}

Step 2 — fill buckets (index = frequency):
  buckets[0] = []
  buckets[1] = ['t', 'r']
  buckets[2] = ['e']

Step 3 — iterate from highest bucket:
  freq=2: 'e' * 2 = "ee"
  freq=1: 't' * 1 + 'r' * 1 = "eetr"
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static String frequencySortBucket(String s) {
    Map<Character, Integer> count = new HashMap<>();
    for (char c : s.toCharArray()) count.merge(c, 1, Integer::sum); // O(n)
    int maxFreq = Collections.max(count.values()); // O(k)
    List<Character>[] buckets = new List[maxFreq + 1]; // O(n)
    for (var entry : count.entrySet()) { // O(k)
        int freq = entry.getValue();
        if (buckets[freq] == null) buckets[freq] = new ArrayList<>();
        buckets[freq].add(entry.getKey());
    }
    StringBuilder sb = new StringBuilder();
    for (int freq = maxFreq; freq > 0; freq--) { // O(n) total
        if (buckets[freq] != null)
            for (char c : buckets[freq]) sb.append(String.valueOf(c).repeat(freq));
    }
    return sb.toString();
}
```

#### Python

```python []
class Solution2:
    def frequencySort(self, s: str) -> str:
        count = Counter(s)  # O(n)
        max_freq = max(count.values())  # O(k)
        buckets: list[list[str]] = [[] for _ in range(max_freq + 1)]  # O(n)
        for c, freq in count.items(): buckets[freq].append(c)  # O(k)
        res = []
        for freq in range(max_freq, 0, -1):  # O(n) total across all buckets
            for c in buckets[freq]: res.append(c * freq)
        return ''.join(res)
```

#### C++

```cpp []
string frequencySortBucket(string s) {
    unordered_map<char, int> count;
    for (char c : s) count[c]++; // O(n)
    int maxFreq = 0;
    for (auto &[_, freq] : count) maxFreq = max(maxFreq, freq); // O(k)
    vector<vector<char>> buckets(maxFreq + 1); // O(n)
    for (auto &[c, freq] : count) buckets[freq].push_back(c); // O(k)
    string result;
    for (int freq = maxFreq; freq > 0; freq--) // O(n) total
        for (char c : buckets[freq]) result.append(freq, c);
    return result;
}
```

#### Rust

```rust []
pub fn frequency_sort_bucket(s: String) -> String {
    let mut count: HashMap<char, usize> = HashMap::new();
    for c in s.chars() { *count.entry(c).or_default() += 1; } // O(n)
    let max_freq = *count.values().max().unwrap_or(&0); // O(k)
    let mut buckets: Vec<Vec<char>> = vec![vec![]; max_freq + 1]; // O(n)
    for (&c, &freq) in &count { buckets[freq].push(c); } // O(k)
    let mut result = String::with_capacity(s.len());
    for freq in (1..=max_freq).rev() { // O(n) total
        for &c in &buckets[freq] { for _ in 0..freq { result.push(c); } }
    }
    result
}
```
