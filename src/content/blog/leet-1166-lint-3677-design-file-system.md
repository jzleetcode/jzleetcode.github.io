---
author: JZ
pubDatetime: 2025-01-10T06:23:00Z
modDatetime: 2025-01-10T06:23:00Z
title: LeetCode 1166 LintCode 3677 Design File System
featured: true
tags:
  - a-hash
  - a-trie
  - a-string
  - a-design
description:
  "Solutions for LeetCode 1166 LintCode 3677, medium, tags: hash table, trie, string, design."
---

## Table of contents

## Description

You are asked to design a file system that allows you to create new paths and associate them with different values.

The format of a path is one or more concatenated strings of the form: `/` followed by one or more lowercase English letters. For example, "`/leetcode"` and "`/leetcode/problems"` are valid paths while an empty string `""` and `"/"` are not.

Implement the `FileSystem` class:

-   `bool createPath(string path, int value)` Creates a new `path` and associates a `value` to it if possible and returns `true`. Returns `false` if the path **already exists** or its parent path **doesn't exist**.
-   `int get(string path)` Returns the value associated with `path` or returns `-1` if the path doesn't exist.


```
Example 1:

Input:
["FileSystem","createPath","get"]
[[],["/a",1],["/a"]]
Output:
[null,true,1]
Explanation:
FileSystem fileSystem = new FileSystem();

fileSystem.createPath("/a", 1); // return true
fileSystem.get("/a"); // return 1

Example 2:

Input:
["FileSystem","createPath","createPath","get","createPath","get"]
[[],["/leet",1],["/leet/code",2],["/leet/code"],["/c/d",1],["/c"]]
Output:
[null,true,true,2,false,-1]
Explanation:
FileSystem fileSystem = new FileSystem();

fileSystem.createPath("/leet", 1); // return true
fileSystem.createPath("/leet/code", 2); // return true
fileSystem.get("/leet/code"); // return 2
fileSystem.createPath("/c/d", 1); // return false because the parent path "/c" doesn't exist.
fileSystem.get("/c"); // return -1 because this path doesn't exist.
```

**Constraints:**

-   `2 <= path.length <= 100`
-   `1 <= value <= 10^9`
-   Each `path` is **valid** and consists of lowercase English letters and `'/'`.
-   At most `10^4` calls **in total** will be made to `createPath` and `get`.

## Idea

We could use the `trie` data structure to solve this question. Typically, a `trie` has characters as nodes. For this question, we will use a path (folder/file) as a node. We will use the hash table instead of the array implementation because the key is not a character and not suitable as an array index.

For insert,

1. We split the whole path by the slash "/". Because the path is guaranteed to be valid as one of the constraints, the result array after the split is `['', 'path1', 'path2', ... , 'path(l-1)']`, where `l` is the length of the array.
2. We check each of the path in `[1,l-1)`. If any of those paths does not already exist, we return false. If it exists, we iterate to that path.
3. Finally, we check the last path `path(l-1)`. If it already exists, we return false. Otherwise, we create the path by adding it to the `trie` hash table and return true.

For search,

1. We split the whole path same to above.
2. We iterate each of the path. It any of it does not exist in the `trie`, we return -1. Otherwise we return the value in the `trie` hash table.

```rust
let n = path.len();
```

Complexity: Time $O(n)$, Space $O(n)$.

### Python

```python
class Trie:
    def __init__(self, v: int = -1):
        self.next = dict()
        self.v = v

    def insert(self, w: str, v: int) -> bool:
        node = self
        ps = w.split("/")
        for p in ps[1:-1]:
            if p not in node.next:
                return False
            node = node.next[p]
        if ps[-1] in node.next:
            return False
        node.next[ps[-1]] = Trie(v)
        return True

    def search(self, w: str) -> int:
        node = self
        for p in w.split("/")[1:]:
            if p not in node.next:
                return -1
            node = node.next[p]
        return node.v


class FileSystem:
    """lint 162 ms, 5.55 mb"""

    def __init__(self):
        self.trie = Trie()

    def createPath(self, path: str, value: int) -> bool:
        return self.trie.insert(path, value)

    def get(self, path: str) -> int:
        return self.trie.search(path)
```
