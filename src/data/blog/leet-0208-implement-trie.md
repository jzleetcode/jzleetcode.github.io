---
author: JZ
pubDatetime: 2026-08-25T10:36:00Z
modDatetime: 2026-08-25T10:36:00Z
title: LeetCode 208 Implement Trie (Prefix Tree)
featured: true
tags:
  - a-trie
  - a-hash
  - a-design
  - c-pinterest
description:
  "Solutions for LeetCode 208, medium, tags: hash table, string, design, trie, companies: pinterest."
---

## Table of contents

## Description

Question Link: [LeetCode 208](https://leetcode.com/problems/implement-trie-prefix-tree/description/)

A **trie** (pronounced as "try") or **prefix tree** is a tree data structure used to efficiently store and retrieve keys in a dataset of strings. There are various applications of this data structure, such as autocomplete and spellchecker.

Implement the `Trie` class:

- `Trie()` Initializes the trie object.
- `void insert(String word)` Inserts the string `word` into the trie.
- `boolean search(String word)` Returns `true` if the string `word` is in the trie (i.e., was inserted before), and `false` otherwise.
- `boolean startsWith(String prefix)` Returns `true` if there is a previously inserted string `word` that has the prefix `prefix`, and `false` otherwise.

```
Example 1:

Input
["Trie", "insert", "search", "search", "startsWith", "insert", "search"]
[[], ["apple"], ["apple"], ["app"], ["app"], ["app"], ["app"]]
Output
[null, null, true, false, true, null, true]

Explanation
Trie trie = new Trie();
trie.insert("apple");
trie.search("apple");   // return True
trie.search("app");     // return False
trie.startsWith("app"); // return True
trie.insert("app");
trie.search("app");     // return True
```

**Constraints:**

- `1 <= word.length, prefix.length <= 2000`
- `word` and `prefix` consist only of lowercase English letters.
- At most `3 * 10^4` calls in total will be made to `insert`, `search`, and `startsWith`.

## Solution 1: Array of Links (26 children)

### Idea

Each node holds a fixed-size array of 26 pointers (one per lowercase letter) and a boolean `isWord` flag. To insert, traverse character by character creating nodes as needed. To search or check prefix, traverse and check if you reach `null` early.

```
         root
        / | \
       a  b  c  ...
      /
     p
    /
   p
  /
 l
/
e  (isWord = true)
```

Complexity: Time $O(n)$ for insert/search/startsWith where $n$ is word length. Space $O(26 \cdot N)$ where $N$ is total characters inserted (worst case each character creates a new node with 26 slots).

#### Java

```java []
class Node {
    private static final int R = 26;
    boolean isWord;
    Node[] next;

    Node() {
        next = new Node[R];
    }
}

public class Trie {
    Node root;

    public Trie() { // O(1) time, O(26) space
        root = new Node();
    }

    public void insert(String word) { // O(n) time, O(26n) space worst case
        Node cur = root;
        for (int i = 0; i < word.length(); i++) {
            int id = word.charAt(i) - 'a';
            if (cur.next[id] == null) cur.next[id] = new Node();
            cur = cur.next[id];
        }
        cur.isWord = true;
    }

    public boolean search(String word) { // O(n) time, O(1) space
        Node n = get(word);
        return n != null && n.isWord;
    }

    public boolean startsWith(String prefix) { // O(n) time, O(1) space
        return get(prefix) != null;
    }

    private Node get(String word) { // O(n) time, O(1) space
        Node cur = root;
        for (int i = 0; i < word.length(); i++) {
            int id = word.charAt(i) - 'a';
            if (cur.next[id] == null) return null;
            cur = cur.next[id];
        }
        return cur;
    }
}
```

#### Python

```python []
class TrieNode:
    def __init__(self):
        self.is_word = False
        self.next = dict()

    def get(self, word: str):
        cur = self
        for c in word:
            if c not in cur.next: return None
            cur = cur.next[c]
        return cur

    def insert(self, word: str) -> None:
        cur = self
        for c in word:
            if c not in cur.next:
                cur.next[c] = TrieNode()
            cur = cur.next[c]
        cur.is_word = True


class Trie:

    def __init__(self):  # O(1) time and space
        self.root = TrieNode()

    def insert(self, word: str) -> None:  # O(n) time, O(n) space worst case
        self.root.insert(word)

    def search(self, word: str) -> bool:  # O(n) time, O(1) space
        n = self.root.get(word)
        return n is not None and n.is_word

    def startsWith(self, prefix: str) -> bool:  # O(n) time, O(1) space
        return self.root.get(prefix) is not None
```

#### C++

```cpp []
class TrieNode {
public:
    unordered_map<char, unique_ptr<TrieNode>> next;
    bool end = false;

    void insert(const string &word) { // O(n) time, O(n) space
        auto *node = this;
        for (auto &ch : word) {
            if (!node->next.count(ch)) node->next[ch] = make_unique<TrieNode>();
            node = node->next[ch].get();
        }
        node->end = true;
    }

    TrieNode *get(const string &word) { // O(n) time, O(1) space
        TrieNode *node = this;
        for (auto &ch : word) {
            if (!node->next.count(ch)) return nullptr;
            node = node->next[ch].get();
        }
        return node;
    }

    bool search(const string &word) {
        auto *node = get(word);
        return node != nullptr && node->end;
    }

    bool startsWith(const string &word) {
        return get(word) != nullptr;
    }
};

class Trie {
    unique_ptr<TrieNode> root = make_unique<TrieNode>();
public:
    Trie() = default;
    void insert(const string &word) { root->insert(word); }
    bool search(const string &word) { return root->search(word); }
    bool startsWith(const string &word) { return root->startsWith(word); }
};
```

#### Rust

```rust []
use std::collections::HashMap;

#[derive(Default, Debug)]
pub struct TrieNode {
    pub next: HashMap<char, TrieNode>,
    pub end: bool,
}

impl TrieNode {
    pub fn new() -> Self { TrieNode::default() }

    pub fn insert(&mut self, word: &str) { // O(n) time, O(n) space
        let mut cur = self;
        for c in word.chars() {
            cur = cur.next.entry(c).or_default();
        }
        cur.end = true;
    }

    pub fn search(&self, word: &str) -> bool { // O(n) time, O(1) space
        self.get(word).map_or(false, |node| node.end)
    }

    pub fn starts_with(&self, prefix: &str) -> bool { // O(n) time, O(1) space
        self.get(prefix).is_some()
    }

    pub fn get(&self, s: &str) -> Option<&TrieNode> {
        let mut cur = self;
        for c in s.chars() {
            match cur.next.get(&c) {
                Some(node) => cur = node,
                None => return None,
            }
        }
        Some(cur)
    }
}

#[derive(Debug, Default)]
struct Trie {
    root: TrieNode,
}

impl Trie {
    fn new() -> Self { Trie::default() }
    fn insert(&mut self, word: String) { self.root.insert(&word); }
    fn search(&self, word: String) -> bool { self.root.search(&word) }
    fn starts_with(&self, prefix: &str) -> bool { self.root.starts_with(prefix) }
}
```

## Solution 2: Recursive Trie

### Idea

Instead of iterating through characters, we can implement trie operations recursively. Each recursive call handles one character deeper in the trie. This approach is slightly less efficient due to recursion stack space but demonstrates a different programming paradigm.

Complexity: Time $O(n)$, Space $O(n)$ recursion stack for insert/search.

#### Java

```java []
class TrieRecursive {
    static class Node {
        private static final int R = 26;
        boolean isWord;
        Node[] next = new Node[R];
    }

    Node root = new Node();

    private Node insert(Node n, String word, int d) { // O(n) time, O(n) stack space
        if (n == null) n = new Node();
        if (d < word.length()) {
            int id = word.charAt(d) - 'a';
            n.next[id] = insert(n.next[id], word, d + 1);
        } else n.isWord = true;
        return n;
    }

    public void insert(String word) {
        root = insert(root, word, 0);
    }

    public boolean search(String word) {
        Node n = get(root, word, 0);
        return n != null && n.isWord;
    }

    public boolean startsWith(String prefix) {
        return get(root, prefix, 0) != null;
    }

    private Node get(Node n, String word, int d) { // O(n) time, O(n) stack space
        if (n == null) return null;
        if (d == word.length()) return n;
        return get(n.next[word.charAt(d) - 'a'], word, d + 1);
    }
}
```
