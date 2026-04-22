---
author: JZ
pubDatetime: 2026-04-16T06:00:00Z
modDatetime: 2026-04-16T06:00:00Z
title: LeetCode 49 Group Anagrams
featured: false
tags:
  - a-array
  - a-hash-table
  - a-string
  - a-sorting
description:
  "Solutions for LeetCode 49, medium, tags: array, hash table, string, sorting."
---

## Table of contents

## Description

Given an array of strings `strs`, group the anagrams together. You can return the answer in any order.

An **anagram** is a word or phrase formed by rearranging the letters of a different word or phrase, using all the original letters exactly once.

```
Example 1:

Input: strs = ["eat","tea","tan","ate","nat","bat"]
Output: [["bat"],["nat","tan"],["ate","eat","tea"]]
Explanation: There is no string in strs that can be rearranged to form "bat".
The strings "nat" and "tan" are anagrams as they can be rearranged to form each other.
The strings "ate", "eat", and "tea" are anagrams as they can be rearranged to form each other.

Example 2:

Input: strs = [""]
Output: [[""]]

Example 3:

Input: strs = ["a"]
Output: [["a"]]

Constraints:

1 <= strs.length <= 10^4
0 <= strs[i].length <= 100
strs[i] consists of lowercase English letters.
```

## Solution 1: Sorted Key

### Idea

Two strings are anagrams if and only if their sorted versions are identical. For each string, sort its characters to produce a canonical key, then use a hash map to group all strings sharing the same key.

```
Input: ["eat", "tea", "tan", "ate", "nat", "bat"]

Step-by-step (sorting each string to get the key):

  "eat" -> sorted -> "aet"   groups: {"aet": ["eat"]}
  "tea" -> sorted -> "aet"   groups: {"aet": ["eat","tea"]}
  "tan" -> sorted -> "ant"   groups: {"aet": ["eat","tea"], "ant": ["tan"]}
  "ate" -> sorted -> "aet"   groups: {"aet": ["eat","tea","ate"], "ant": ["tan"]}
  "nat" -> sorted -> "ant"   groups: {"aet": ["eat","tea","ate"], "ant": ["tan","nat"]}
  "bat" -> sorted -> "abt"   groups: {"aet": [...], "ant": [...], "abt": ["bat"]}

Result: [["eat","tea","ate"], ["tan","nat"], ["bat"]]
```

Complexity: Time $O(n \cdot k \log k)$ where $n$ = number of strings and $k$ = max string length (sorting each string). Space $O(n \cdot k)$.

#### Java

```java []
public static List<List<String>> groupAnagramsSort(String[] strs) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String s : strs) { // O(n)
        char[] chars = s.toCharArray();
        Arrays.sort(chars); // O(k log k)
        String key = new String(chars);
        groups.computeIfAbsent(key, k1 -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(groups.values());
}
```

#### Python

```python []
class Solution:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[str, list[str]] = defaultdict(list)
        for s in strs:  # O(n)
            key = ''.join(sorted(s))  # O(k log k)
            groups[key].append(s)
        return list(groups.values())
```

#### C++

```cpp []
vector<vector<string>> groupAnagramsSort(vector<string> &strs) {
    unordered_map<string, vector<string>> groups;
    for (auto &s : strs) { // O(n)
        string key = s;
        sort(key.begin(), key.end()); // O(k log k)
        groups[key].push_back(s);
    }
    vector<vector<string>> result;
    for (auto &[k, v] : groups) result.push_back(v);
    return result;
}
```

#### Rust

```rust []
pub fn group_anagrams(strs: Vec<String>) -> Vec<Vec<String>> {
    let mut groups: HashMap<Vec<u8>, Vec<String>> = HashMap::new();
    for s in strs { // O(n)
        let mut key: Vec<u8> = s.bytes().collect();
        key.sort_unstable(); // O(k log k)
        groups.entry(key).or_default().push(s);
    }
    groups.into_values().collect()
}
```

## Solution 2: Character Count Key

### Idea

Instead of sorting, count the frequency of each character (26 lowercase letters) and use that count as the hash map key. This avoids the $O(k \log k)$ sort per string.

```
Input: ["eat", "tea", "tan"]

  "eat" -> count: [1,0,0,0,1,0,...,1,0,...] (a:1, e:1, t:1)
  "tea" -> count: [1,0,0,0,1,0,...,1,0,...] (a:1, e:1, t:1)  <- same key!
  "tan" -> count: [1,0,0,0,0,0,...,1,0,...,1,...] (a:1, n:1, t:1)
```

Complexity: Time $O(n \cdot k)$ — counting $k$ characters per string, building a fixed-length (26) key is $O(k + 26) = O(k)$. Space $O(n \cdot k)$.

#### Java

```java []
public static List<List<String>> groupAnagramsCount(String[] strs) {
    Map<String, List<String>> groups = new HashMap<>();
    for (String s : strs) { // O(n)
        int[] count = new int[26]; // O(1)
        for (char c : s.toCharArray()) count[c - 'a']++; // O(k)
        String key = Arrays.toString(count);
        groups.computeIfAbsent(key, k1 -> new ArrayList<>()).add(s);
    }
    return new ArrayList<>(groups.values());
}
```

#### Python

```python []
class Solution2:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[tuple, list[str]] = defaultdict(list)
        for s in strs:  # O(n)
            count = [0] * 26  # O(26) = O(1)
            for c in s:  # O(k)
                count[ord(c) - ord('a')] += 1
            groups[tuple(count)].append(s)
        return list(groups.values())
```

#### C++

```cpp []
vector<vector<string>> groupAnagramsCount(vector<string> &strs) {
    unordered_map<string, vector<string>> groups;
    for (auto &s : strs) { // O(n)
        string key(26, '0');
        for (char c : s) key[c - 'a']++; // O(k)
        groups[key].push_back(s);
    }
    vector<vector<string>> result;
    for (auto &[k, v] : groups) result.push_back(v);
    return result;
}
```

#### Rust

```rust []
pub fn group_anagrams_count(strs: Vec<String>) -> Vec<Vec<String>> {
    let mut groups: HashMap<[u8; 26], Vec<String>> = HashMap::new();
    for s in strs { // O(n)
        let mut count = [0u8; 26]; // O(1)
        for b in s.bytes() { // O(k)
            count[(b - b'a') as usize] += 1;
        }
        groups.entry(count).or_default().push(s);
    }
    groups.into_values().collect()
}
```
