---
author: JZ
pubDatetime: 2026-09-15T10:38:00Z
modDatetime: 2026-09-15T10:38:00Z
title: LeetCode 211 Design Add and Search Words Data Structure
featured: false
tags:
  - a-trie
  - a-dfs
  - a-design
  - a-string
description:
  "Solutions for LeetCode 211, medium, tags: string, depth-first search, design, trie."
---

## Table of contents

## Description

Question Link: [LeetCode 211](https://leetcode.com/problems/design-add-and-search-words-data-structure/description/)

Design a data structure that supports adding new words and finding if a string matches any previously added string.

Implement the `WordDictionary` class:

- `WordDictionary()` Initializes the object.
- `void addWord(word)` Adds `word` to the data structure, it can be matched later.
- `bool search(word)` Returns `true` if there is any string in the data structure that matches `word` or `false` otherwise. `word` may contain dots `'.'` where dots can be matched with any letter.

```
Example 1:

Input
["WordDictionary","addWord","addWord","addWord","search","search","search","search"]
[[],["bad"],["dad"],["mad"],["pad"],["bad"],[".ad"],["b.."]]
Output
[null,null,null,null,false,true,true,true]

Explanation
WordDictionary wordDictionary = new WordDictionary();
wordDictionary.addWord("bad");
wordDictionary.addWord("dad");
wordDictionary.addWord("mad");
wordDictionary.search("pad"); // return False
wordDictionary.search("bad"); // return True
wordDictionary.search(".ad"); // return True, matches bad, dad, mad
wordDictionary.search("b.."); // return True, matches bad
```

**Constraints:**

- `1 <= word.length <= 25`
- `word` in `addWord` consists of lowercase English letters.
- `word` in `search` consist of `'.'` or lowercase English letters.
- There will be at most `3` dots in `word` for search queries.
- At most `10^4` calls will be made to `addWord` and `search`.

## Solution 1: Trie + DFS

### Idea

Build a standard trie (prefix tree). `addWord` inserts character by character. For `search`, when we encounter a literal character we follow the single matching child. When we encounter `'.'`, we must try **all** existing children — this is the DFS branching step.

```
         root
        / | \
       b  d  m
       |  |  |
       a  a  a
       |  |  |
       d* d* d*    (* = isWord)

search("b.."):  b -> a -> [try all children] -> d* ✓
search(".ad"):  [try b,d,m] -> a -> d* ✓
search("pad"):  no child 'p' at root -> false
```

The `'.'` wildcard creates branching factor up to 26 at each dot position. With at most 3 dots (per constraints), the worst case is $O(26^3 \cdot L)$ which is bounded.

Complexity: `addWord` Time $O(L)$, Space $O(L)$. `search` Time $O(L)$ without dots, $O(26^D \cdot L)$ worst case with $D$ dots. Overall space $O(N \cdot L)$ for $N$ words of average length $L$.

#### Java

The `Node` class is shared with [LeetCode 208 Implement Trie](/posts/leet-0208-implement-trie).

```java []
class Node {
    private static final int R = 26;
    boolean isWord;
    Node[] next;

    Node() {
        next = new Node[R];
    }
}

class WordDictionary { // 452 ms, 96 Mb.
    Node root;

    public WordDictionary() {
        root = new Node();
    }

    public void addWord(String word) { // O(L)
        Node cur = root;
        for (int i = 0; i < word.length(); i++) {
            int id = word.charAt(i) - 'a';
            if (cur.next[id] == null) cur.next[id] = new Node();
            cur = cur.next[id];
        }
        cur.isWord = true;
    }

    public boolean search(String word) { // O(L) avg, O(26^D * L) worst
        return match(word, 0, root);
    }

    private boolean match(String word, int d, Node n) {
        if (d == word.length()) return n.isWord;
        int id = word.charAt(d) - 'a';
        if (word.charAt(d) != '.') return n.next[id] != null && match(word, d + 1, n.next[id]);
        else {
            for (int i = 0; i < n.next.length; i++) // O(26) branching
                if (n.next[i] != null)
                    if (match(word, d + 1, n.next[i])) return true;
        }
        return false;
    }
}
```

#### Python

```python []
class WordDictionary:
    """Trie + DFS. addWord O(L), search O(L) avg, O(26^D * L) worst with wildcards. Space O(N*L)."""

    def __init__(self):
        self.children: dict[str, 'WordDictionary'] = {}
        self.is_word = False

    def addWord(self, word: str) -> None:
        node = self
        for c in word:  # O(L)
            if c not in node.children:
                node.children[c] = WordDictionary()
            node = node.children[c]
        node.is_word = True

    def search(self, word: str) -> bool:
        return self._match(word, 0)

    def _match(self, word: str, i: int) -> bool:
        if i == len(word):
            return self.is_word
        c = word[i]
        if c != '.':
            return c in self.children and self.children[c]._match(word, i + 1)
        return any(child._match(word, i + 1) for child in self.children.values())  # O(26) per dot
```

#### C++

```cpp []
class WordDictionary {
    struct TrieNode {
        TrieNode* children[26]{};
        bool isEnd = false;
        ~TrieNode() { for (auto& child : children) delete child; }
    };

    TrieNode* root;

    bool dfs(TrieNode* node, const string& word, int pos) {
        if (!node) return false;
        if (pos == (int)word.size()) return node->isEnd;
        char c = word[pos];
        if (c == '.') {
            for (auto& child : node->children) // O(26) branching at each dot
                if (dfs(child, word, pos + 1)) return true;
            return false;
        }
        return dfs(node->children[c - 'a'], word, pos + 1); // O(1) for exact match
    }

public:
    WordDictionary() : root(new TrieNode()) {}
    ~WordDictionary() { delete root; }

    void addWord(const string& word) { // O(L) time, O(L) space for new nodes
        TrieNode* node = root;
        for (char c : word) {
            int idx = c - 'a';
            if (!node->children[idx]) node->children[idx] = new TrieNode();
            node = node->children[idx];
        }
        node->isEnd = true;
    }

    bool search(const string& word) { // O(26^D * L) worst case
        return dfs(root, word, 0);
    }
};
```

#### Rust

```rust []
use std::collections::HashMap;

#[derive(Default)]
struct TrieNode {
    children: HashMap<char, TrieNode>, // O(1) lookup per character
    is_end: bool,
}

struct WordDictionary {
    root: TrieNode,
}

impl WordDictionary {
    fn new() -> Self {
        WordDictionary { root: TrieNode::default() }
    }

    fn add_word(&mut self, word: String) { // O(L) time, O(L) space
        let mut node = &mut self.root;
        for ch in word.chars() {
            node = node.children.entry(ch).or_default();
        }
        node.is_end = true;
    }

    fn search(&self, word: String) -> bool { // O(26^D * L) worst case
        Self::dfs(&self.root, word.as_bytes(), 0)
    }

    fn dfs(node: &TrieNode, word: &[u8], i: usize) -> bool {
        if i == word.len() { return node.is_end; }
        let ch = word[i] as char;
        if ch == '.' {
            for child in node.children.values() { // O(26) branching
                if Self::dfs(child, word, i + 1) { return true; }
            }
            false
        } else {
            match node.children.get(&ch) { // O(1) exact match
                Some(child) => Self::dfs(child, word, i + 1),
                None => false,
            }
        }
    }
}
```

## Solution 2: HashMap by Length

### Idea

Group words by length in a hash map. To search, iterate all words of the same length and compare character by character, treating `'.'` as a wildcard. This avoids the trie data structure entirely but trades search efficiency for simplicity.

Complexity: `addWord` Time $O(1)$ amortized. `search` Time $O(N \cdot L)$ where $N$ is the number of stored words of the same length. Space $O(N \cdot L)$.

#### Java

```java []
class WordDictionaryMap { // 2372ms, 50.5 Mb.
    Map<Integer, List<String>> map = new HashMap<>(); // space O(N*L)

    public void addWord(String word) { // O(1) amortized
        int len = word.length();
        if (!map.containsKey(len)) map.put(len, new ArrayList<>());
        map.get(len).add(word);
    }

    public boolean search(String word) { // O(N*L) worst case
        int len = word.length();
        if (!map.containsKey(len)) return false;
        for (String s : map.get(len))
            if (isSame(s, word)) return true;
        return false;
    }

    private boolean isSame(String s, String word) {
        for (int i = 0; i < word.length(); i++) // O(L), early exit on mismatch
            if (word.charAt(i) != '.' && word.charAt(i) != s.charAt(i)) return false;
        return true;
    }
}
```

#### Python

```python []
class WordDictionaryMap:
    """HashMap by length, brute-force match. addWord O(1), search O(N*L). Space O(N*L)."""

    def __init__(self):
        self.words: dict[int, list[str]] = {}

    def addWord(self, word: str) -> None:  # O(1)
        self.words.setdefault(len(word), []).append(word)

    def search(self, word: str) -> bool:
        for s in self.words.get(len(word), []):  # O(N) words of same length
            if all(wc == '.' or wc == sc for wc, sc in zip(word, s)):  # O(L)
                return True
        return False
```
