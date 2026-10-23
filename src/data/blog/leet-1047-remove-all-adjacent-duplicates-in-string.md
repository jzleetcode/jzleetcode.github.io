---
author: JZ
pubDatetime: 2026-10-23T18:48:09Z
modDatetime: 2026-10-23T18:48:09Z
title: LeetCode 1047 Remove All Adjacent Duplicates In String
featured: true
tags:
  - a-stack
  - a-string
description: "Solution for LeetCode 1047, easy, tags: string, stack, simulation."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 1047: Remove All Adjacent Duplicates In String](https://leetcode.com/problems/remove-all-adjacent-duplicates-in-string/description/)

Given a string `s` of lowercase English letters, repeatedly remove two adjacent, equal letters until no such pair remains. Return the resulting string.

```text
Input:  s = "abbaca"
Output: "ca"

Input:  s = "azxxzy"
Output: "ay"
```

**Constraints:**

- `1 <= s.length <= 10^5`
- `s` consists of lowercase English letters.

## Idea

Use a stack containing the fully reduced prefix. For each new character, remove the stack top if it matches; otherwise, push the character. Since the prefix has no adjacent duplicates, the only new pair can involve its last character and the incoming character.

```text
character    a    b    b    a    c    a
stack        a    ab   a    -    c    ca

The second b removes the first b; the next a removes the first a.
```

More explicitly, `abb` reduces to `a`, then the next `a` removes that remaining `a`. Building the answer as a stack handles these cascading removals without repeatedly rescanning the string. An array or string used as a stack implements the same algorithm, so no second solution is needed.

## Complexity

Let `n = s.length`. Each character is pushed at most once and popped at most once. Traversal and constructing the final string take **$O(n)$ time**. In the worst case no pairs cancel, so the stack uses **$O(n)$ auxiliary space**.

### Java

```java []
package stack;

public final class RemoveAllAdjacentDuplicatesInString {
    private RemoveAllAdjacentDuplicatesInString() {}

    /** Time: O(n); space: O(n) for the stack, where n is the string length. */
    public static String removeDuplicates(String s) {
        StringBuilder stack = new StringBuilder();
        for (int index = 0; index < s.length(); index++) {
            char current = s.charAt(index);
            if (stack.length() > 0 && stack.charAt(stack.length() - 1) == current) {
                stack.setLength(stack.length() - 1);
            } else {
                stack.append(current);
            }
        }
        return stack.toString();
    }
}
```

The Java repository uses a static utility method; for LeetCode, place `removeDuplicates` in `class Solution` as an instance method.

### Python

```python []
class Solution:
    def removeDuplicates(self, s: str) -> str:
        stack = []
        for character in s:  # O(n) total: each character is pushed and popped at most once.
            if stack and stack[-1] == character:
                stack.pop()
            else:
                stack.append(character)
        return "".join(stack)  # O(n) time and O(n) auxiliary stack space.
```

### C++

```cpp []
#ifndef LEETCODE_REMOVE_ALL_ADJACENT_DUPLICATES_IN_STRING_HPP
#define LEETCODE_REMOVE_ALL_ADJACENT_DUPLICATES_IN_STRING_HPP

#include <string>

class Solution1047 {
public:
    // Time: O(n); space: O(n) for the string used as a stack.
    std::string removeDuplicates(std::string s) {
        std::string result;
        result.reserve(s.size());
        for (char character : s) {
            if (!result.empty() && result.back() == character) {
                result.pop_back();
            } else {
                result.push_back(character);
            }
        }
        return result;
    }
};

#endif // LEETCODE_REMOVE_ALL_ADJACENT_DUPLICATES_IN_STRING_HPP
```

The C++ repository calls its class `Solution1047` to avoid collisions; rename it to `Solution` for LeetCode.

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Time: O(n), where n is the number of characters. Space: O(n) for the stack.
    pub fn remove_duplicates(s: String) -> String {
        let mut stack = Vec::new();

        for ch in s.chars() {
            if stack.last() == Some(&ch) {
                stack.pop();
            } else {
                stack.push(ch);
            }
        }

        stack.into_iter().collect()
    }
}
```
