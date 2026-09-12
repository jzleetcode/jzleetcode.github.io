---
author: JZ
pubDatetime: 2026-09-12T12:00:00Z
modDatetime: 2026-09-12T12:00:00Z
title: LeetCode 32 Longest Valid Parentheses
featured: true
tags:
  - a-string
  - a-stack
  - a-dynamic-programming
description:
  "Solutions for LeetCode 32, hard, tags: string, stack, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 32](https://leetcode.com/problems/longest-valid-parentheses/description/)

Given a string containing just the characters `'('` and `')'`, return the length of the longest valid (well-formed) parentheses substring.

```
Example 1:

Input: s = "(()"
Output: 2
Explanation: The longest valid parentheses substring is "()".

Example 2:

Input: s = ")()())"
Output: 4
Explanation: The longest valid parentheses substring is "()()".

Example 3:

Input: s = ""
Output: 0

Constraints:

0 <= s.length <= 3 * 10^4
s[i] is '(' or ')'.
```

## Solution 1: Stack

### Idea

Use a stack of indices with `-1` as an initial base. For each character:

- `'('`: push its index.
- `')'`: pop the top. If the stack is now empty, push the current index as a new base. Otherwise, the current valid length is `i - stack.top()`.

The base index marks where the current valid substring starts. Every unmatched `)` becomes a new base.

```
s = ")()())"

i=0: ')' pop -1, stack empty → push 0 (new base).  stack=[0]
i=1: '(' push 1.                                    stack=[0,1]
i=2: ')' pop 1, len=2-0=2. max=2.                   stack=[0]
i=3: '(' push 3.                                    stack=[0,3]
i=4: ')' pop 3, len=4-0=4. max=4.                   stack=[0]
i=5: ')' pop 0, stack empty → push 5 (new base).    stack=[5]

Result: 4
```

Complexity: Time $O(n)$, Space $O(n)$.

Each index is pushed and popped at most once.

#### Java

```java []
public static int longestValidParenthesesStack(String s) {
    int max = 0;
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(-1); // base index
    for (int i = 0; i < s.length(); i++) { // O(n)
        if (s.charAt(i) == '(') {
            stack.push(i); // each index pushed/popped once, O(n) total
        } else {
            stack.pop();
            if (stack.isEmpty()) {
                stack.push(i); // new base
            } else {
                max = Math.max(max, i - stack.peek());
            }
        }
    }
    return max;
}
```

#### Python

```python []
class Solution:
    def longest_valid_parentheses(self, s: str) -> int:
        stack = [-1]  # base index for length calculation, O(n) space
        max_len = 0
        for i, c in enumerate(s):  # O(n)
            if c == '(':
                stack.append(i)
            else:
                stack.pop()
                if not stack:
                    stack.append(i)  # new base
                else:
                    max_len = max(max_len, i - stack[-1])
        return max_len
```

#### C++

```cpp []
static int longestValidParenthesesStack(const string &s) {
    stack<int> st;
    st.push(-1); // base index
    int maxLen = 0;
    for (int i = 0; i < (int)s.size(); i++) { // O(n), each index pushed/popped once, O(n) total
        if (s[i] == '(') {
            st.push(i);
        } else {
            st.pop();
            if (st.empty()) {
                st.push(i); // new base
            } else {
                maxLen = max(maxLen, i - st.top());
            }
        }
    }
    return maxLen;
}
```

#### Rust

```rust []
pub fn longest_valid_parentheses_stack(s: String) -> i32 {
    let mut stack: Vec<i32> = vec![-1]; // base index
    let mut max_len = 0i32;
    for (i, c) in s.chars().enumerate() { // O(n)
        let i = i as i32;
        if c == '(' {
            stack.push(i);
        } else {
            stack.pop();
            if stack.is_empty() {
                stack.push(i); // new base
            } else {
                max_len = max_len.max(i - stack.last().unwrap());
            }
        }
    }
    max_len
}
```

## Solution 2: Two-Pass Greedy

### Idea

We can solve this in $O(1)$ extra space with two passes:

1. **Left-to-right**: maintain `open` and `close` counters. When they're equal, we have a valid substring of length `2 * close`. When `close > open`, the substring is broken — reset both to 0.
2. **Right-to-left**: same logic but reset when `open > close`.

The left-to-right pass misses cases like `"(()"` where open never equals close. The right-to-left pass catches those by approaching from the other direction.

```
s = "(()"

Left-to-right:
  '(' open=1 close=0
  '(' open=2 close=0
  ')' open=2 close=1
  → open never equals close, max stays 0

Right-to-left:
  ')' open=0 close=1
  '(' open=1 close=1 → match! max=2
  '(' open=2 close=1 → open>close, reset

Result: 2
```

Complexity: Time $O(n)$, Space $O(1)$.

Two linear passes, no extra data structures.

#### Java

```java []
public static int longestValidParenthesesTwoPass(String s) {
    int max = 0;
    int open = 0, close = 0;
    for (int i = 0; i < s.length(); i++) { // O(n) left-to-right
        if (s.charAt(i) == '(') open++;
        else close++;
        if (open == close) max = Math.max(max, 2 * close);
        else if (close > open) { open = 0; close = 0; }
    }
    open = 0; close = 0;
    for (int i = s.length() - 1; i >= 0; i--) { // O(n) right-to-left
        if (s.charAt(i) == '(') open++;
        else close++;
        if (open == close) max = Math.max(max, 2 * open);
        else if (open > close) { open = 0; close = 0; }
    }
    return max;
}
```

#### Python

```python []
class Solution2:
    def longest_valid_parentheses(self, s: str) -> int:
        max_len = 0
        left = right = 0
        for c in s:  # O(n) left-to-right
            if c == '(':
                left += 1
            else:
                right += 1
            if left == right:
                max_len = max(max_len, 2 * right)
            elif right > left:
                left = right = 0
        left = right = 0
        for c in reversed(s):  # O(n) right-to-left
            if c == '(':
                left += 1
            else:
                right += 1
            if left == right:
                max_len = max(max_len, 2 * left)
            elif left > right:
                left = right = 0
        return max_len
```

#### C++

```cpp []
static int longestValidParenthesesTwoPass(const string &s) {
    int n = (int)s.size();
    int open = 0, close = 0, maxLen = 0;
    for (int i = 0; i < n; i++) { // O(n)
        if (s[i] == '(') open++;
        else close++;
        if (open == close) maxLen = max(maxLen, 2 * close);
        else if (close > open) { open = 0; close = 0; }
    }
    open = 0; close = 0;
    for (int i = n - 1; i >= 0; i--) { // O(n)
        if (s[i] == '(') open++;
        else close++;
        if (open == close) maxLen = max(maxLen, 2 * open);
        else if (open > close) { open = 0; close = 0; }
    }
    return maxLen;
}
```

#### Rust

```rust []
pub fn longest_valid_parentheses_two_pass(s: String) -> i32 {
    let bytes = s.as_bytes();
    let mut max_len = 0i32;
    let (mut open, mut close) = (0i32, 0i32);
    for &b in bytes.iter() { // O(n) left-to-right
        if b == b'(' { open += 1; } else { close += 1; }
        if open == close {
            max_len = max_len.max(open + close);
        } else if close > open {
            open = 0; close = 0;
        }
    }
    open = 0; close = 0;
    for &b in bytes.iter().rev() { // O(n) right-to-left
        if b == b'(' { open += 1; } else { close += 1; }
        if open == close {
            max_len = max_len.max(open + close);
        } else if open > close {
            open = 0; close = 0;
        }
    }
    max_len
}
```
