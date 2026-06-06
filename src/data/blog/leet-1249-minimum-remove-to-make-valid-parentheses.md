---
author: JZ
pubDatetime: 2026-06-06T10:36:00Z
modDatetime: 2026-06-06T10:36:00Z
title: LeetCode 1249 Minimum Remove to Make Valid Parentheses
featured: true
tags:
  - a-stack
  - a-string
description:
  "Solutions for LeetCode 1249, medium, tags: string, stack."
---

## Table of contents

## Description

Question Links: [LeetCode 1249](https://leetcode.com/problems/minimum-remove-to-make-valid-parentheses/description/)

Given a string `s` of `'('`, `')'` and lowercase English characters.

Your task is to remove the minimum number of parentheses (`'('` or `')'`, in any positions) so that the resulting parentheses string is valid and return **any valid string**.

Formally, a parentheses string is valid if and only if:

- It is the empty string, contains only lowercase characters, or
- It can be written as `AB` (`A` concatenated with `B`), where `A` and `B` are valid strings, or
- It can be written as `(A)`, where `A` is a valid string.

```
Example 1:
Input: s = "lee(t(c)o)de)"
Output: "lee(t(c)o)de"
Explanation: "lee(t(co)de)", "lee(t(c)ode)" would also be accepted.

Example 2:
Input: s = "a)b(c)d"
Output: "ab(c)d"

Example 3:
Input: s = "))(("
Output: ""
Explanation: An empty string is also valid.

Constraints:
1 <= s.length <= 10^5
s[i] is either '(' , ')', or lowercase English letter.
```

## Solution 1: Stack

### Idea

Use a stack to track indices of unmatched `'('`. As we scan, if we encounter `')'` with an empty stack, it's unmatched — add its index to a removal set. After scanning, any indices remaining in the stack are unmatched `'('`. Rebuild the string skipping all indices in the removal set.

```
Input: "lee(t(c)o)de)"
          ^         ^
        idx 3     idx 12

Stack trace:
  i=3  '(' -> stack=[3]
  i=5  '(' -> stack=[3,5]
  i=7  ')' -> pop, stack=[3]
  i=9  ')' -> pop, stack=[]
  i=12 ')' -> stack empty, toRemove={12}

toRemove = {12}
Result:  "lee(t(c)o)de"  (skip index 12)
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static String minRemoveToMakeValid(String s) {
    Deque<Integer> stack = new ArrayDeque<>();
    Set<Integer> toRemove = new HashSet<>();

    for (int i = 0; i < s.length(); i++) { // O(n)
        char c = s.charAt(i);
        if (c == '(') {
            stack.push(i);
        } else if (c == ')') {
            if (stack.isEmpty()) {
                toRemove.add(i);
            } else {
                stack.pop();
            }
        }
    }

    while (!stack.isEmpty()) {
        toRemove.add(stack.pop());
    }

    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < s.length(); i++) { // O(n)
        if (!toRemove.contains(i)) {
            sb.append(s.charAt(i));
        }
    }

    return sb.toString();
}
```

#### Python

```python []
def min_remove_to_make_valid(self, s: str) -> str:
    stack = []  # indices of unmatched '('
    to_remove = set()
    for i, c in enumerate(s):  # O(n)
        if c == '(':
            stack.append(i)
        elif c == ')':
            if stack:
                stack.pop()
            else:
                to_remove.add(i)
    to_remove.update(stack)  # remaining unmatched '('
    return ''.join(c for i, c in enumerate(s) if i not in to_remove)  # O(n)
```

#### C++

```cpp []
string minRemoveToMakeValid(string s) {
    stack<int> st;
    unordered_set<int> toRemove;

    for (int i = 0; i < s.length(); i++) { // O(n)
        if (s[i] == '(') {
            st.push(i);
        } else if (s[i] == ')') {
            if (!st.empty()) {
                st.pop();
            } else {
                toRemove.insert(i);
            }
        }
    }

    while (!st.empty()) {
        toRemove.insert(st.top());
        st.pop();
    }

    string result;
    for (int i = 0; i < s.length(); i++) { // O(n)
        if (toRemove.find(i) == toRemove.end()) {
            result += s[i];
        }
    }

    return result;
}
```

#### Rust

```rust []
pub fn min_remove_to_make_valid(s: String) -> String {
    let mut stack: Vec<usize> = Vec::new();
    let mut to_remove: HashSet<usize> = HashSet::new();
    let chars: Vec<char> = s.chars().collect();

    for (i, &ch) in chars.iter().enumerate() { // O(n)
        match ch {
            '(' => stack.push(i),
            ')' => {
                if stack.is_empty() {
                    to_remove.insert(i);
                } else {
                    stack.pop();
                }
            }
            _ => {}
        }
    }

    to_remove.extend(stack);

    chars.iter() // O(n)
        .enumerate()
        .filter_map(|(i, &ch)| {
            if to_remove.contains(&i) { None } else { Some(ch) }
        })
        .collect()
}
```

## Solution 2: Two-Pass

### Idea

First pass (left-to-right): skip any `')'` that has no matching `'('` before it — just count opens. Second pass (right-to-left): skip any `'('` that has no matching `')'` after it — count closes.

No extra data structure beyond the intermediate string.

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static String minRemoveToMakeValidTwoPass(String s) {
    // Pass 1: left to right, remove unmatched ')' — O(n)
    StringBuilder sb = new StringBuilder();
    int openCount = 0;
    for (char c : s.toCharArray()) {
        if (c == '(') {
            openCount++;
        } else if (c == ')') {
            if (openCount == 0) continue;
            openCount--;
        }
        sb.append(c);
    }

    // Pass 2: right to left, remove unmatched '(' — O(n)
    StringBuilder result = new StringBuilder();
    openCount = 0;
    for (int i = sb.length() - 1; i >= 0; i--) {
        char c = sb.charAt(i);
        if (c == ')') {
            openCount++;
        } else if (c == '(') {
            if (openCount == 0) continue;
            openCount--;
        }
        result.append(c);
    }

    return result.reverse().toString();
}
```

#### Python

```python []
def min_remove_to_make_valid(self, s: str) -> str:
    # Pass 1: remove excess ')' — O(n)
    result = []
    open_count = 0
    for c in s:
        if c == '(':
            open_count += 1
            result.append(c)
        elif c == ')':
            if open_count > 0:
                open_count -= 1
                result.append(c)
        else:
            result.append(c)
    # Pass 2: remove excess '(' from the right — O(n)
    final = []
    close_needed = 0
    for c in reversed(result):
        if c == '(':
            if close_needed > 0:
                close_needed -= 1
            else:
                continue
        elif c == ')':
            close_needed += 1
        final.append(c)
    return ''.join(reversed(final))
```

#### C++

```cpp []
string minRemoveToMakeValidTwoPass(string s) {
    // Pass 1: left to right — remove excess ')' — O(n)
    string leftToRight;
    int openCount = 0;
    for (char c : s) {
        if (c == '(') {
            openCount++;
            leftToRight += c;
        } else if (c == ')') {
            if (openCount > 0) {
                openCount--;
                leftToRight += c;
            }
        } else {
            leftToRight += c;
        }
    }

    // Pass 2: right to left — remove excess '(' — O(n)
    string result;
    int closeCount = 0;
    for (int i = leftToRight.length() - 1; i >= 0; i--) {
        char c = leftToRight[i];
        if (c == ')') {
            closeCount++;
            result += c;
        } else if (c == '(') {
            if (closeCount > 0) {
                closeCount--;
                result += c;
            }
        } else {
            result += c;
        }
    }

    reverse(result.begin(), result.end());
    return result;
}
```

#### Rust

```rust []
pub fn min_remove_to_make_valid_two_pass(s: String) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut result: Vec<Option<char>> = chars.iter().map(|&c| Some(c)).collect();

    // Left-to-right: remove unmatched ')' — O(n)
    let mut open_count = 0;
    for i in 0..result.len() {
        if let Some(ch) = result[i] {
            match ch {
                '(' => open_count += 1,
                ')' => {
                    if open_count == 0 { result[i] = None; }
                    else { open_count -= 1; }
                }
                _ => {}
            }
        }
    }

    // Right-to-left: remove unmatched '(' — O(n)
    let mut close_count = 0;
    for i in (0..result.len()).rev() {
        if let Some(ch) = result[i] {
            match ch {
                ')' => close_count += 1,
                '(' => {
                    if close_count == 0 { result[i] = None; }
                    else { close_count -= 1; }
                }
                _ => {}
            }
        }
    }

    result.iter().filter_map(|&ch| ch).collect()
}
```
