---
author: JZ
pubDatetime: 2026-08-13T06:00:00Z
modDatetime: 2026-08-13T06:00:00Z
title: LeetCode 227 Basic Calculator II
featured: true
tags:
  - a-stack
  - a-string
  - a-math
description:
  "Solutions for LeetCode 227, medium, tags: math, string, stack."
---

## Table of contents

## Description

Question Links: [LeetCode 227](https://leetcode.com/problems/basic-calculator-ii/description/)

Given a string `s` which represents an expression, evaluate this expression and return its value.

The integer division should truncate toward zero.

You may assume that the given expression is always valid. All intermediate results will be in the range of [-2^31, 2^31 - 1].

Note: You are **not** allowed to use any built-in function which evaluates strings as mathematical expressions, such as `eval()`.

```
Example 1:

Input: s = "3+2*2"
Output: 7

Example 2:

Input: s = " 3/2 "
Output: 1

Example 3:

Input: s = " 3+5 / 2 "
Output: 5
```

**Constraints:**

- `1 <= s.length <= 3 * 10^5`
- `s` consists of integers and operators (`'+'`, `'-'`, `'*'`, `'/'`) separated by some number of spaces.
- `s` represents a valid expression.
- All the integers in the expression are non-negative integers in the range `[0, 2^31 - 1]`.
- The answer is guaranteed to fit in a 32-bit integer.

## Idea

The key insight is to use a **three-tier cache** (`res`, `last`, `cur`) to handle operator precedence without a stack:

- `cur` — the number currently being parsed.
- `last` — the last operand involved in a `*` or `/` chain (these bind tighter).
- `res` — the running sum of fully resolved terms.

When we encounter an operator (or a sentinel at the end), we process the **previous** operator:

```
Parsing "3 + 2 * 2":

char   prev_op  action               res  last  cur
 3       +      (building cur)        0    0     3
 +       +      res+=last, last=cur   0    3     0
 2       +      (building cur)        0    3     2
 *       +      res+=last, last=cur   3    2     0
 2       *      (building cur)        3    2     2
 #       *      last*=cur             3    4     0
 #       #      res+=last             7    4     0
                                      ↑ answer
```

By appending sentinel characters (`"##"`), we ensure the last pending operator and the final accumulation both execute inside the loop.

Complexity: Time $O(n)$ — single pass. Space $O(1)$ — only three variables.

### Java

```java []
package stack;

// lc 227, three-tier cache, O(n) time, O(1) space.
public static int calculate(String s) {
    int cur = 0, last = 0, res = 0;
    s = s + "##";
    char prevOp = '+';
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (Character.isWhitespace(c)) continue;
        if (Character.isDigit(c)) cur = c + cur * 10 - '0'; // O(1) per digit
        else {
            if (prevOp == '*') last *= cur;           // fold cur into last
            else if (prevOp == '/') last /= cur;     // truncate toward zero
            else {
                res += last;                          // accumulate last to res
                last = prevOp == '+' ? cur : -cur;   // set last to cur
            }
            prevOp = c;
            cur = 0;
        }
    }
    return res;
}
```

```python []
# lc 227, three-tier cache, O(n) time, O(1) space.
from math import trunc

class Solution:
    def calculate(self, s):
        res, cur, last, prev_op = 0, 0, 0, '+'
        for c in s + "##":                           # sentinel to flush last op
            if c.isspace():
                continue
            elif c.isdigit():
                cur = cur * 10 + int(c)              # O(1) per digit
            else:
                if prev_op == '*':
                    last *= cur                      # fold cur into last
                elif prev_op == '/':
                    last = trunc(last / cur)         # truncate toward zero
                else:
                    res += last                      # accumulate last to res
                    last = cur if prev_op == '+' else -cur
                prev_op, cur = c, 0
        return res
```

```cpp []
// lc 227, three-tier cache, O(n) time, O(1) space.
int calculate(const string &s) {
    int res = 0, cur = 0, last = 0;
    char preOp = '+';
    for (auto &c : (s + "##")) {
        if (isspace(c)) continue;
        if (isdigit(c)) cur = cur * 10 + (c - '0'); // paren avoids overflow
        else {
            if (preOp == '*') last *= cur;           // fold cur into last
            else if (preOp == '/') last /= cur;     // truncate toward zero
            else {
                res += last;                         // accumulate last to res
                last = preOp == '+' ? cur : -cur;
            }
            preOp = c;
            cur = 0;
        }
    }
    return res;
}
```

```rust []
// lc 227, three-tier cache, O(n) time, O(1) space.
impl Solution {
    pub fn calculate(s: String) -> i32 {
        let s = s + "##";
        let (mut res, mut last, mut cur) = (0i64, 0i64, 0i64);
        let mut prev_op = '+';
        for c in s.chars() {
            if c.is_whitespace() { continue; }
            if c.is_ascii_digit() {
                cur = cur * 10 + (c as i64 - '0' as i64); // O(1) per digit
            } else {
                match prev_op {
                    '*' => last *= cur,              // fold cur into last
                    '/' => last /= cur,             // truncate toward zero
                    '+' => { res += last; last = cur; }
                    _ => { res += last; last = -cur; } // '-'
                }
                prev_op = c;
                cur = 0;
            }
        }
        res as i32
    }
}
```
