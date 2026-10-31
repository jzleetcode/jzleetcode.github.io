---
author: JZ
pubDatetime: 2026-10-31T18:45:00Z
modDatetime: 2026-10-31T18:45:00Z
title: LeetCode 1003 Check If Word Is Valid After Substitutions
featured: true
tags:
  - a-string
  - a-stack
description: "Solutions for LeetCode 1003, medium, tags: string, stack."
---

## Table of contents

## Description

Question link: [LeetCode 1003](https://leetcode.com/problems/check-if-word-is-valid-after-substitutions/description/)

Starting with the empty string, we may insert the substring `"abc"` anywhere any number of times. Given `s`, return whether it can be produced this way.

**Constraints:**

- `1 <= s.length <= 2 * 10^4`
- `s` consists only of `'a'`, `'b'`, and `'c'`.

## Idea

### Stack reduction

Every insertion contributes one contiguous `abc`. Reverse the operation: scan from left to right and remove a completed trailing `abc` as soon as it appears. A stack holds only the prefix that cannot yet be reduced.

For example, `aabcbc` reduces as follows:

```text
read a  -> a
read a  -> aa
read b  -> aab
read c  -> aabc  -> remove abc -> a
read b  -> ab
read c  -> abc   -> remove abc -> empty
```

If the stack is empty after the scan, repeated reverse insertions reduced the whole string, so the original string is valid. Otherwise, some characters could not belong to a valid insertion.

Each character is pushed once and removed at most once.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java
package stack;

public final class CheckIfWordIsValidAfterSubstitutions {
    private CheckIfWordIsValidAfterSubstitutions() {}

    public static boolean isValid(String s) {
        char[] stack = new char[s.length()];
        int size = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == 'c') {
                if (size < 2 || stack[size - 2] != 'a' || stack[size - 1] != 'b') {
                    return false;
                }
                size -= 2;
            } else {
                stack[size++] = c;
            }
        }
        return size == 0;
    }
}
```

### Python

```python
class Solution:
    def isValid(self, s: str) -> bool:
        stack: list[str] = []
        for character in s:  # O(n) total: every character is pushed and popped at most once.
            stack.append(character)
            if stack[-3:] == ["a", "b", "c"]:
                del stack[-3:]
        return not stack  # O(n) auxiliary space in the worst case.
```

### C++

```cpp
#pragma once
#include <string>

namespace CheckIfWordIsValidAfterSubstitutions {

class Solution {
public:
    // Each character is pushed once and removed at most once: O(n) time,
    // O(n) auxiliary space for the unreduced prefix.
    bool isValid(std::string s) {
        std::string pending;
        pending.reserve(s.size());
        for (char ch : s) {
            pending.push_back(ch);
            const auto size = pending.size();
            if (size >= 3 && pending[size - 3] == 'a' &&
                pending[size - 2] == 'b' && pending[size - 1] == 'c') {
                pending.resize(size - 3);
            }
        }
        return pending.empty();
    }
};

}
```

### Rust

```rust
pub struct Solution;

impl Solution {
    // Each byte is pushed and removed at most once: O(n) time, O(n) space.
    pub fn is_valid(s: String) -> bool {
        let mut stack = Vec::with_capacity(s.len());
        for byte in s.bytes() {
            stack.push(byte);
            if stack.ends_with(b"abc") {
                stack.truncate(stack.len() - 3);
            }
        }
        stack.is_empty()
    }
}
```
