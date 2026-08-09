---
author: JZ
pubDatetime: 2026-08-04T12:00:00Z
modDatetime: 2026-08-04T12:00:00Z
title: LeetCode 678 Valid Parenthesis String
featured: false
tags:
  - a-greedy
  - a-string
  - a-stack
description:
  "Solutions for LeetCode 678, medium, tags: string, greedy, stack, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 678](https://leetcode.com/problems/valid-parenthesis-string/description/)

Given a string `s` containing only three types of characters: `'('`, `')'` and `'*'`, return `true` if `s` is valid.

The following rules define a **valid** string:

- Any left parenthesis `'('` must have a corresponding right parenthesis `')'`.
- Any right parenthesis `')'` must have a corresponding left parenthesis `'('`.
- Left parenthesis `'('` must go before the corresponding right parenthesis `')'`.
- `'*'` could be treated as a single right parenthesis `')'` OR a single left parenthesis `'('` OR an empty string `""`.

```
Example 1:

Input: s = "()"
Output: true

Example 2:

Input: s = "(*)"
Output: true

Example 3:

Input: s = "(*))"
Output: true
```

**Constraints:**

- `1 <= s.length <= 100`
- `s[i]` is `'('`, `')'` or `'*'`.

## Idea 1: Greedy Min/Max

Instead of branching on every `*`, we track the **range** of possible open-paren counts: `[lo, hi]`.

- `(` → both lo and hi increase (definitely one more open)
- `)` → both decrease (definitely one more close)
- `*` → lo decreases (could be close), hi increases (could be open)

If `hi < 0`, too many `)` even in the most optimistic scenario → invalid. We clamp `lo ≥ 0` because we never "need" negative opens. At the end, valid iff `lo == 0` (some assignment of `*` makes it perfectly balanced).

```
s = "( * ) )"
     lo: 1  0  0  0     clamped to 0 when negative
     hi: 1  2  1  0     never goes negative

lo == 0 at end → valid ✓
```

Complexity: Time $O(n)$ — single pass. Space $O(1)$.

## Idea 2: Two-Pass Greedy

Scan left-to-right treating every `*` optimistically as `(`—if balance ever drops below 0, there's no way to fix excess `)`. Then scan right-to-left treating every `*` as `)`—if balance drops below 0, there are unmatched `(`.

Both passes must survive for the string to be valid.

Complexity: Time $O(n)$ — two passes. Space $O(1)$.

### Java

```java []
// Solution 1: Greedy min/max. O(n) time, O(1) space.
public static boolean checkValidString(String s) {
    int lo = 0; // min possible open count
    int hi = 0; // max possible open count
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (c == '(') {
            lo++;
            hi++;
        } else if (c == ')') {
            lo--;
            hi--;
        } else {
            lo--; // treat '*' as ')'
            hi++; // treat '*' as '('
        }
        if (hi < 0) {
            return false;
        }
        lo = Math.max(lo, 0);
    }
    return lo == 0;
}

// Solution 2: Two-pass greedy. O(n) time, O(1) space.
public static boolean checkValidStringTwoPass(String s) {
    int balance = 0;
    for (int i = 0; i < s.length(); i++) { // O(n)
        char c = s.charAt(i);
        if (c == '(' || c == '*') {
            balance++;
        } else {
            balance--;
        }
        if (balance < 0) {
            return false;
        }
    }
    balance = 0;
    for (int i = s.length() - 1; i >= 0; i--) { // O(n)
        char c = s.charAt(i);
        if (c == ')' || c == '*') {
            balance++;
        } else {
            balance--;
        }
        if (balance < 0) {
            return false;
        }
    }
    return true;
}
```

### Python

```python []
# Solution 1: Greedy min/max. O(n) time, O(1) space.
class Solution:
    def checkValidString(self, s: str) -> bool:
        lo = 0  # min possible open '(' count
        hi = 0  # max possible open '(' count
        for c in s:  # O(n)
            if c == '(':
                lo += 1
                hi += 1
            elif c == ')':
                lo -= 1
                hi -= 1
            else:  # '*' can be '(', ')' or empty
                lo -= 1  # treat as ')'
                hi += 1  # treat as '('
            if hi < 0:  # too many ')' even treating all '*' as '('
                return False
            lo = max(lo, 0)  # lo can't go negative
        return lo == 0

# Solution 2: Two-pass greedy. O(n) time, O(1) space.
class Solution2:
    def checkValidString(self, s: str) -> bool:
        balance = 0
        for c in s:  # O(n) left to right
            if c == '(' or c == '*':
                balance += 1
            else:
                balance -= 1
            if balance < 0:
                return False
        balance = 0
        for c in reversed(s):  # O(n) right to left
            if c == ')' or c == '*':
                balance += 1
            else:
                balance -= 1
            if balance < 0:
                return False
        return True
```

### C++

```cpp []
// Solution 1: Greedy min/max. O(n) time, O(1) space.
static bool checkValidString(const string &s) {
    int lo = 0, hi = 0;
    for (char c : s) { // O(n)
        if (c == '(') { lo++; hi++; }
        else if (c == ')') { lo--; hi--; }
        else { lo--; hi++; }
        if (hi < 0) return false;
        lo = max(lo, 0);
    }
    return lo == 0;
}

// Solution 2: Two-pass greedy. O(n) time, O(1) space.
static bool checkValidStringTwoPass(const string &s) {
    int balance = 0;
    for (int i = 0; i < (int)s.size(); i++) { // O(n)
        if (s[i] == '(' || s[i] == '*') balance++;
        else balance--;
        if (balance < 0) return false;
    }
    balance = 0;
    for (int i = (int)s.size() - 1; i >= 0; i--) { // O(n)
        if (s[i] == ')' || s[i] == '*') balance++;
        else balance--;
        if (balance < 0) return false;
    }
    return true;
}
```

### Rust

```rust []
// Solution 1: Greedy min/max. O(n) time, O(1) space.
pub fn check_valid_string(s: String) -> bool {
    let mut lo = 0i32;
    let mut hi = 0i32;
    for c in s.chars() { // O(n)
        match c {
            '(' => { lo += 1; hi += 1; }
            ')' => { lo -= 1; hi -= 1; }
            _ => { lo -= 1; hi += 1; } // '*' wildcard
        }
        if hi < 0 { return false; }
        lo = lo.max(0);
    }
    lo == 0
}

// Solution 2: Two-pass greedy. O(n) time, O(1) space.
pub fn check_valid_string_two_pass(s: String) -> bool {
    let bytes = s.as_bytes();
    let mut balance = 0i32;
    for &b in bytes.iter() { // O(n)
        if b == b'(' || b == b'*' { balance += 1; }
        else { balance -= 1; }
        if balance < 0 { return false; }
    }
    balance = 0;
    for &b in bytes.iter().rev() { // O(n)
        if b == b')' || b == b'*' { balance += 1; }
        else { balance -= 1; }
        if balance < 0 { return false; }
    }
    true
}
```
