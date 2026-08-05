---
author: JZ
pubDatetime: 2026-08-05T06:23:00Z
modDatetime: 2026-08-05T06:23:00Z
title: LeetCode 316 Remove Duplicate Letters
featured: true
tags:
  - a-stack
  - a-monotonic-stack
  - a-greedy
  - a-string
description:
  "Solutions for LeetCode 316, medium, tags: string, stack, monotonic stack, greedy."
---

## Table of contents

## Description

Question Links: [LeetCode 316](https://leetcode.com/problems/remove-duplicate-letters/description/), [LeetCode 1081](https://leetcode.com/problems/smallest-subsequence-of-distinct-characters/description/) (identical problem)

Given a string `s`, remove duplicate letters so that every letter appears once and only once. You must make sure your result is the smallest in lexicographical order among all possible results.

```
Example 1:

Input: s = "bcabc"
Output: "abc"

Example 2:

Input: s = "cbacdcbc"
Output: "acdb"
```

**Constraints:**

- `1 <= s.length <= 10^4`
- `s` consists of lowercase English letters.

## Idea

We use a **monotonic stack** with a greedy strategy. The key insight: when building the result left to right, if the current character is smaller than the stack top and the stack top character appears again later, we can safely remove it — we'll pick it up later in a better (later) position.

```
s = "cbacdcbc"

last_index: a=3, b=6, c=7, d=4

Process each character:
  i=0 'c' -> stack: [c], in_stack: {c}
  i=1 'b' -> b < c, c appears at 7 > 1, pop c
             stack: [b], in_stack: {b}
  i=2 'a' -> a < b, b appears at 6 > 2, pop b
             stack: [a], in_stack: {a}
  i=3 'c' -> c > a, push
             stack: [a,c], in_stack: {a,c}
  i=4 'd' -> d > c, push
             stack: [a,c,d], in_stack: {a,c,d}
  i=5 'c' -> c already in stack, skip
  i=6 'b' -> b < d, but d last at 4 < 6, can't pop d
             push b
             stack: [a,c,d,b], in_stack: {a,c,d,b}
  i=7 'c' -> c already in stack, skip

Result: "acdb"
```

Three data structures work together:

1. **`last_index[26]`** — precomputed last occurrence of each character. Tells us if it's safe to pop.
2. **`in_stack[26]`** — boolean array to skip characters already in the result.
3. **`stack`** — the monotonic stack building our answer.

Complexity: Time $O(n)$ — each character is pushed and popped at most once. Space $O(1)$ — stack and arrays bounded by 26 letters.

### Java

```java []
public static String removeDuplicateLetters(String s) {
    int[] lastIndex = new int[26];
    for (int i = 0; i < s.length(); i++) {
        lastIndex[s.charAt(i) - 'a'] = i; // O(n)
    }
    boolean[] inStack = new boolean[26];
    StringBuilder stack = new StringBuilder();
    for (int i = 0; i < s.length(); i++) { // O(n)
        char c = s.charAt(i);
        if (inStack[c - 'a']) continue;
        while (stack.length() > 0 && stack.charAt(stack.length() - 1) > c
                && lastIndex[stack.charAt(stack.length() - 1) - 'a'] > i) { // amortized O(1)
            inStack[stack.charAt(stack.length() - 1) - 'a'] = false;
            stack.deleteCharAt(stack.length() - 1);
        }
        stack.append(c);
        inStack[c - 'a'] = true;
    }
    return stack.toString();
}
```

### Python

```python []
class Solution:
    def removeDuplicateLetters(self, s: str) -> str:
        """Monotonic stack + greedy. O(n) time, O(1) space (26 letters)."""
        last_index = {c: i for i, c in enumerate(s)}  # O(n)
        stack = []
        in_stack = set()
        for i, c in enumerate(s):  # O(n)
            if c in in_stack:
                continue
            while stack and c < stack[-1] and last_index[stack[-1]] > i:  # amortized O(1)
                in_stack.discard(stack.pop())
            stack.append(c)
            in_stack.add(c)
        return "".join(stack)
```

### C++

```cpp []
string removeDuplicateLetters(string s) {
    int lastIdx[26] = {};
    bool inStack[26] = {};
    for (int i = 0; i < (int)s.size(); i++) // O(n)
        lastIdx[s[i] - 'a'] = i;

    string stack;
    for (int i = 0; i < (int)s.size(); i++) { // O(n)
        int c = s[i] - 'a';
        if (inStack[c]) continue;
        while (!stack.empty() && stack.back() > s[i] && lastIdx[stack.back() - 'a'] > i) { // amortized O(1)
            inStack[stack.back() - 'a'] = false;
            stack.pop_back();
        }
        stack.push_back(s[i]);
        inStack[c] = true;
    }
    return stack;
}
```

### Rust

```rust []
pub fn remove_duplicate_letters(s: String) -> String {
    let bytes = s.as_bytes();
    let mut last_occurrence = [0usize; 26];
    for (i, &b) in bytes.iter().enumerate() { // O(n)
        last_occurrence[(b - b'a') as usize] = i;
    }

    let mut in_stack = [false; 26];
    let mut stack: Vec<u8> = Vec::new();

    for (i, &b) in bytes.iter().enumerate() { // O(n)
        let idx = (b - b'a') as usize;
        if in_stack[idx] { continue; }
        while let Some(&top) = stack.last() {
            if top > b && last_occurrence[(top - b'a') as usize] > i { // amortized O(1)
                stack.pop();
                in_stack[(top - b'a') as usize] = false;
            } else {
                break;
            }
        }
        stack.push(b);
        in_stack[idx] = true;
    }
    String::from_utf8(stack).unwrap()
}
```
