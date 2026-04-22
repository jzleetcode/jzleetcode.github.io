---
author: JZ
pubDatetime: 2026-04-22T06:00:00Z
modDatetime: 2026-04-22T06:00:00Z
title: LeetCode 2452 Words Within Two Edits of Dictionary
featured: true
tags:
  - a-string
  - a-trie
description:
  "Solutions for LeetCode 2452, medium, tags: array, string, trie."
---

## Table of contents

## Description

You are given two string arrays, `queries` and `dictionary`. All words in each array comprise of lowercase English letters and have the same length.

In one **edit** you can take a word from `queries`, and change any letter in it to any other letter. Find all words from `queries` that, after a maximum of **two edits**, equal some word from `dictionary`.

Return a list of all words from `queries` that match with some word from `dictionary` after a maximum of **two edits**. Return the words in the same order they appear in `queries`.

```
Example 1:

Input: queries = ["word","note","ants","wood"], dictionary = ["wood","joke","moat"]
Output: ["word","note","wood"]
Explanation:
- "word" -> "wood" (change 'r' to 'o'), 1 edit
- "note" -> "joke" (change 'n' to 'j', 't' to 'k'), 2 edits
- "ants" requires 3+ edits for any dictionary word, excluded
- "wood" -> "wood", 0 edits

Example 2:

Input: queries = ["yes"], dictionary = ["not"]
Output: []
Explanation: "yes" -> "not" requires 3 edits.

Constraints:

1 <= queries.length, dictionary.length <= 100
n == queries[i].length == dictionary[j].length
1 <= n <= 100
All queries[i] and dictionary[j] are composed of lowercase English letters.
```

## Solution 1: Brute Force

### Idea

For each query word, compare it character by character against every word in the dictionary. Count the number of positions where characters differ (mismatches). If any dictionary word has at most 2 mismatches, include the query in the result.

```
query: "word"    dict: "wood"
         w o r d          w o o d
         ^       ^        ^       ^
match    Y Y N Y  ->  1 mismatch <= 2  ✓

query: "ants"    dict: "wood"
         a n t s          w o o d
         N N N N  ->  4 mismatches > 2  ✗

query: "ants"    dict: "joke"
         a n t s          j o k e
         N N N N  ->  4 mismatches > 2  ✗

query: "ants"    dict: "moat"
         a n t s          m o a t
         N N N N  ->  4 mismatches > 2  ✗
```

We can early-exit the inner character comparison loop once mismatches exceed 2.

Complexity: Time $O(q \cdot d \cdot m)$ where $q$ = len(queries), $d$ = len(dictionary), $m$ = word length. Space $O(1)$ extra.

#### Java

```java []
// Solution 1: Brute force. Time O(q * d * m), Space O(1) extra.
public static List<String> twoEditWordsBrute(String[] queries, String[] dictionary) {
    List<String> res = new ArrayList<>();
    for (String q : queries) { // O(q)
        for (String d : dictionary) { // O(d)
            int mismatches = 0;
            for (int i = 0; i < q.length() && mismatches <= 2; i++) // O(m)
                if (q.charAt(i) != d.charAt(i)) mismatches++;
            if (mismatches <= 2) {
                res.add(q);
                break;
            }
        }
    }
    return res;
}
```

#### Python

```python []
# Solution 1: Brute force. Time O(q*d*m), Space O(1) extra.
def twoEditWords(self, queries: list[str], dictionary: list[str]) -> list[str]:
    res = []
    for q in queries:
        for d in dictionary:
            if sum(a != b for a, b in zip(q, d)) <= 2:  # O(m) per pair
                res.append(q)
                break
    return res
```

#### C++

```cpp []
// Solution 1: Brute Force. Time O(q * d * m), Space O(1) extra.
vector<string> twoEditWords(vector<string> &queries, vector<string> &dictionary) {
    vector<string> res;
    for (auto &q : queries) {
        for (auto &d : dictionary) {
            int diff = 0;
            for (int i = 0; i < (int)q.size() && diff <= 2; i++) {
                if (q[i] != d[i]) diff++;
            }
            if (diff <= 2) {
                res.push_back(q);
                break;
            }
        }
    }
    return res;
}
```

#### Rust

```rust []
/// Solution 1: Brute force. Time O(q * d * m), Space O(1) extra.
pub fn two_edit_words(queries: Vec<String>, dictionary: Vec<String>) -> Vec<String> {
    queries
        .into_iter()
        .filter(|q| {
            dictionary.iter().any(|d| {
                q.chars()
                    .zip(d.chars())
                    .filter(|(a, b)| a != b)
                    .count()
                    <= 2
            })
        })
        .collect()
}
```

## Solution 2: Trie with DFS

### Idea

Build a trie from the dictionary words. For each query, perform a depth-first search on the trie, tracking the number of character mismatches. At each trie node, we try all 26 children. If the child character matches the query character, we continue with the same edit count; otherwise we increment edits by 1. We prune any branch where edits exceed 2.

```
Trie built from dictionary = ["wood", "joke", "moat"]:

          root
        /  |  \
       w   j   m
       |   |   |
       o   o   o
       |   |   |
       o   k   a
       |   |   |
       d*  e*  t*

DFS for query "note":
  root -> j (n!=j, edits=1) -> o (o==o, edits=1) -> k (t!=k, edits=2) -> e (e==e, edits=2) -> end ✓
  Found match with 2 edits.

DFS for query "ants":
  All paths exceed 2 mismatches -> no match.
```

The trie approach can be faster in practice when the dictionary is large and queries share common prefixes, because pruning avoids checking entire words once edits exceed 2.

Complexity: Time $O(d \cdot m)$ to build trie + $O(q \cdot 26^2 \cdot m)$ worst case to query (pruned in practice). Space $O(d \cdot m)$ for the trie.

#### Java

```java []
// Solution 2: Trie with DFS. Time O(d*m) build + O(q * 26^2 * m) query. Space O(d*m).
public static List<String> twoEditWordsTrie(String[] queries, String[] dictionary) {
    int[][] trie = new int[dictionary.length * queries[0].length() + 1][26]; // trie nodes
    boolean[] end = new boolean[trie.length]; // marks end of a word
    int size = 1; // node 0 is root
    for (String d : dictionary) { // O(d * m) build trie
        int node = 0;
        for (int i = 0; i < d.length(); i++) {
            int c = d.charAt(i) - 'a';
            if (trie[node][c] == 0) trie[node][c] = size++;
            node = trie[node][c];
        }
        end[node] = true;
    }
    List<String> res = new ArrayList<>();
    for (String q : queries) // O(q)
        if (dfs(trie, end, q, 0, 0, 0)) res.add(q);
    return res;
}

private static boolean dfs(int[][] trie, boolean[] end, String q, int node, int i, int edits) {
    if (edits > 2) return false;
    if (i == q.length()) return end[node];
    for (int c = 0; c < 26; c++) { // branch on all 26 letters
        if (trie[node][c] == 0) continue;
        int nextEdits = edits + (c == q.charAt(i) - 'a' ? 0 : 1);
        if (dfs(trie, end, q, trie[node][c], i + 1, nextEdits)) return true;
    }
    return false;
}
```

#### Python

```python []
# Solution 2: Trie with DFS. Time O(d*m) build + O(q * 26^2 * m) query. Space O(d*m).
def twoEditWords(self, queries: list[str], dictionary: list[str]) -> list[str]:
    trie: dict = {}
    for word in dictionary:  # O(d*m) build trie
        node = trie
        for c in word:
            node = node.setdefault(c, {})
        node['#'] = True

    def dfs(node: dict, word: str, i: int, edits: int) -> bool:
        if i == len(word):
            return '#' in node
        for ch, child in node.items():
            if ch == '#':
                continue
            new_edits = edits + (0 if ch == word[i] else 1)
            if new_edits <= 2 and dfs(child, word, i + 1, new_edits):
                return True
        return False

    return [q for q in queries if dfs(trie, q, 0, 0)]
```

#### C++

```cpp []
// Solution 2: Trie with DFS. Time O(d*m) build + O(q * 26^2 * m) query. Space O(d*m).
struct TrieNode {
    array<unique_ptr<TrieNode>, 26> children{};
    bool isEnd = false;
};

void insert(TrieNode *root, const string &word) {
    TrieNode *cur = root;
    for (char c : word) {
        int idx = c - 'a';
        if (!cur->children[idx]) cur->children[idx] = make_unique<TrieNode>();
        cur = cur->children[idx].get();
    }
    cur->isEnd = true;
}

bool dfs(TrieNode *node, const string &word, int pos, int edits) {
    if (edits > 2) return false;
    if (pos == (int)word.size()) return node->isEnd;
    for (int c = 0; c < 26; c++) {
        if (!node->children[c]) continue;
        int cost = (c != word[pos] - 'a') ? 1 : 0;
        if (dfs(node->children[c].get(), word, pos + 1, edits + cost)) return true;
    }
    return false;
}

vector<string> twoEditWords(vector<string> &queries, vector<string> &dictionary) {
    auto root = make_unique<TrieNode>();
    for (auto &w : dictionary) insert(root.get(), w); // O(d*m)
    vector<string> res;
    for (auto &q : queries)
        if (dfs(root.get(), q, 0, 0)) res.push_back(q);
    return res;
}
```

#### Rust

Common `TrieNode` struct used across trie problems:

```rust []
use std::collections::HashMap;

#[derive(Default, Debug)]
pub struct TrieNode {
    pub next: HashMap<char, TrieNode>,
    pub end: bool,
    pub cnt: usize,
}

impl TrieNode {
    pub fn new() -> Self { TrieNode::default() }
    pub fn insert(&mut self, word: &str) {
        let mut cur = self;
        for c in word.chars() {
            cur = cur.next.entry(c).or_default();
            cur.cnt += 1;
        }
        cur.end = true;
    }
}
```

```rust []
/// Solution 2: Trie + DFS. Time O(d*m) build + O(q * 26^2 * m) query. Space O(d*m).
pub fn two_edit_words_trie(queries: Vec<String>, dictionary: Vec<String>) -> Vec<String> {
    let mut root = TrieNode::new();
    for w in &dictionary {
        root.insert(w);
    }
    queries
        .into_iter()
        .filter(|q| {
            let chars: Vec<char> = q.chars().collect();
            Self::dfs(&root, &chars, 0, 0)
        })
        .collect()
}

fn dfs(node: &TrieNode, chars: &[char], idx: usize, edits: usize) -> bool {
    if idx == chars.len() {
        return node.end;
    }
    for (&c, child) in &node.next {
        let new_edits = edits + if c == chars[idx] { 0 } else { 1 };
        if new_edits <= 2 && Self::dfs(child, chars, idx + 1, new_edits) {
            return true;
        }
    }
    false
}
```
