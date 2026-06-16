---
author: JZ
pubDatetime: 2026-06-16T06:00:00Z
modDatetime: 2026-06-16T06:00:00Z
title: LeetCode 71 Simplify Path
featured: true
tags:
  - a-string
  - a-stack
description:
  "Solutions for LeetCode 71, medium, tags: string, stack."
---

## Table of contents

## Description

Question Links: [LeetCode 71](https://leetcode.com/problems/simplify-path/description/)

You are given an absolute path for a Unix-style file system, which always begins with a slash `/`. Your task is to transform this absolute path into its **simplified canonical path**.

The rules of a Unix-style file system are as follows:

- A single period `.` represents the current directory.
- A double period `..` represents the previous/parent directory.
- Multiple consecutive slashes such as `//` and `///` are treated as a single slash `/`.
- Any sequence of periods that does not match the rules above should be treated as a valid directory/file name (e.g., `...` is a valid name).

The simplified canonical path should follow these rules:

- The path must start with a single slash `/`.
- Directories within the path must be separated by exactly one slash `/`.
- The path must not end with a slash `/`, unless it is the root directory.
- The path must not have any single or double periods (`.` or `..`) used to denote current or parent directories.

Return the simplified canonical path.

```
Example 1:

Input: path = "/home/"
Output: "/home"

Example 2:

Input: path = "/home//foo/"
Output: "/home/foo"

Example 3:

Input: path = "/home/user/Documents/../Pictures"
Output: "/home/user/Pictures"

Example 4:

Input: path = "/../"
Output: "/"

Example 5:

Input: path = "/.../a/../b/c/../d/./"
Output: "/.../b/d"

Constraints:

1 <= path.length <= 3000
path consists of English letters, digits, period '.', slash '/' or '_'.
path is a valid absolute Unix path.
```

## Solution 1: Stack

### Idea

Split the path by `/` and process each component using a stack:
- Skip empty strings (from consecutive slashes) and `.` (current directory).
- Pop from the stack for `..` (parent directory).
- Push any other valid name onto the stack.

Finally, join the stack contents with `/` and prepend a leading slash.

```
Input: "/a/./b/../../c/"

Split by '/': ["", "a", ".", "b", "..", "..", "c", ""]

Process each part:
  ""   -> skip (empty)
  "a"  -> push         stack: [a]
  "."  -> skip (cur)   stack: [a]
  "b"  -> push         stack: [a, b]
  ".." -> pop          stack: [a]
  ".." -> pop          stack: []
  "c"  -> push         stack: [c]
  ""   -> skip (empty)

Join: "/" + "c" = "/c"
```

Complexity: Time $O(n)$ — split and single pass over components. Space $O(n)$ — stack stores at most all components.

#### Java

```java []
public static String simplifyPath(String path) {
    Deque<String> stack = new ArrayDeque<>();
    for (String part : path.split("/")) { // O(n) time
        if (part.equals("..")) {
            if (!stack.isEmpty()) stack.pop(); // O(1)
        } else if (!part.isEmpty() && !part.equals(".")) {
            stack.push(part);
        }
    }
    StringBuilder sb = new StringBuilder();
    for (String dir : stack) sb.insert(0, "/" + dir); // O(n) total
    return sb.isEmpty() ? "/" : sb.toString();
}
```

#### Python

```python []
class Solution:
    def simplifyPath(self, path: str) -> str:
        stack = []  # O(n) space
        for part in path.split('/'):  # O(n) time
            if part == '..':
                if stack:
                    stack.pop()
            elif part and part != '.':
                stack.append(part)
        return '/' + '/'.join(stack)
```

#### C++

```cpp []
static string simplifyPath(const string &path) {
    vector<string> stack; // O(n) space
    stringstream ss(path);
    string part;
    while (getline(ss, part, '/')) { // O(n) time
        if (part == "..") {
            if (!stack.empty()) stack.pop_back();
        } else if (!part.empty() && part != ".") {
            stack.push_back(part);
        }
    }
    string result;
    for (const auto &dir : stack) result += "/" + dir;
    return result.empty() ? "/" : result;
}
```

#### Rust

```rust []
pub fn simplify_path(path: String) -> String {
    let mut stack: Vec<&str> = Vec::new(); // O(n) space
    for part in path.split('/') { // O(n) time
        match part {
            ".." => { stack.pop(); }
            "" | "." => {}
            _ => stack.push(part),
        }
    }
    format!("/{}", stack.join("/"))
}
```
