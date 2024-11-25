---
author: JZ
pubDatetime: 2024-11-23T08:23:00Z
modDatetime: 2024-11-23T09:23:00Z
title: LeetCode 1804 LintCode 3729 Implement Trie II
featured: true
tags:
  - a-design
  - a-trie
  - a-hash
  - a-string

description:
  "Solutions for LeetCode 1804 LintCode 3729, medium, tags: design, trie, hash, string."
---

## Table of contents

## Description

A [**trie**](https://en.wikipedia.org/wiki/Trie) (pronounced as "try") or **prefix tree** is a tree data structure used to efficiently store and retrieve keys in a dataset of strings. There are various applications of this data structure, such as autocomplete and spellchecker.

Implement the Trie class:

-   `Trie()` Initializes the trie object.
-   `void insert(String word)` Inserts the string `word` into the trie.
-   `int countWordsEqualTo(String word)` Returns the number of instances of the string `word` in the trie.
-   `int countWordsStartingWith(String prefix)` Returns the number of strings in the trie that have the string `prefix` as a prefix.
-   `void erase(String word)` Erases the string `word` from the trie.

```
Example 1:

Input

["Trie", "insert", "insert", "countWordsEqualTo", "countWordsStartingWith", "erase", "countWordsEqualTo", "countWordsStartingWith", "erase", "countWordsStartingWith"]
[[], ["apple"], ["apple"], ["apple"], ["app"], ["apple"], ["apple"], ["app"], ["apple"], ["app"]]

Output

[null, null, null, 2, 2, null, 1, 1, null, 0]

Explanation
Trie trie = new Trie();
trie.insert("apple");               // Inserts "apple".
trie.insert("apple");               // Inserts another "apple".
trie.countWordsEqualTo("apple");    // There are two instances of "apple" so return 2.
trie.countWordsStartingWith("app"); // "app" is a prefix of "apple" so return 2.
trie.erase("apple");                // Erases one "apple".
trie.countWordsEqualTo("apple");    // Now there is only one instance of "apple" so return 1.
trie.countWordsStartingWith("app"); // return 1
trie.erase("apple");                // Erases "apple". Now the trie is empty.
trie.countWordsStartingWith("app"); // return 0
```

**Constraints:**

-   `1 <= word.length, prefix.length <= 2000`
-   `word` and `prefix` consist only of lowercase English letters.
-   At most `3 * 104` calls **in total** will be made to `insert`, `countWordsEqualTo`, `countWordsStartingWith`, and `erase`.
-   It is guaranteed that for any function call to `erase`, the string `word` will exist in the trie.

## Background

As the picture from wikipedia shows, a trie is a efficient data structure dealing with alphabetic languages such as English, Spanish, and French.

![wikipedia picture](https://upload.wikimedia.org/wikipedia/commons/b/be/Trie_example.svg)

It is especially efficient for search miss comparing to a hash set when used for strings. Can you explain why?

## Solution

### Idea

We can modify the trie node from LeetCode 208 Implement Trie. We can add two fields to represent the number of words having this prefix and ending at this node. We no longer need the boolean to indicate whether this node is the end of a word.

If space is a concern, we can remove the links where the value become 0 after `erase`.

Complexity: Time O(n), Space O(n).

#### Python

```python
class Trie:
    def __init__(self):
        self.next = dict()
        self.v = self.pv = 0

    def insert(self, word: str):
        self.add(word, 1)

    def add(self, word: str, n: int):
        cur = self
        for c in word:
            if c not in cur.next:
                cur.next[c] = Trie()
            cur = cur.next[c]
            cur.pv += n
        cur.v += n

    def count_words_equal_to(self, word: str) -> int:
        node = self.get(word)
        return 0 if node is None else node.v


    def count_words_starting_with(self, prefix: str) -> int:
        node = self.get(prefix)
        return 0 if node is None else node.pv

    def erase(self, word: str):
        self.add(word, -1)

    def get(self, word):
        cur = self
        for c in word:
            if c not in cur.next:
                return None
            cur = cur.next[c]
        return cur
```
