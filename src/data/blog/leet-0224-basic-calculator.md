---
author: JZ
pubDatetime: 2026-09-13T06:00:00Z
modDatetime: 2026-09-13T06:00:00Z
title: LeetCode 224 Basic Calculator
featured: false
tags:
  - a-stack
  - a-string
  - a-math
  - a-recursion
description:
  "Solutions for LeetCode 224, hard, tags: math, string, stack, recursion."
---

## Table of contents

## Description

Question Links: [LeetCode 224](https://leetcode.com/problems/basic-calculator/description/)

Given a string `s` representing a valid expression, implement a basic calculator to evaluate it, and return the result of the evaluation.

Note: You are **not** allowed to use any built-in function which evaluates strings as mathematical expressions, such as `eval()`.

```
Example 1:

Input: s = "1 + 1"
Output: 2

Example 2:

Input: s = " 2-1 + 2 "
Output: 3

Example 3:

Input: s = "(1+(4+5+2)-3)+(6+8)"
Output: 23
```

**Constraints:**

- `1 <= s.length <= 3 * 10^5`
- `s` consists of digits, `'+'`, `'-'`, `'('`, `')'`, and `' '`.
- `s` represents a valid expression.
- `'+'` is not used as a unary operation (i.e., `"+1"` and `"+(2 + 3)"` is invalid).
- `'-'` could be used as a unary operation (i.e., `"-1"` and `"-(2 + 3)"` is valid).
- There will be no two consecutive operators in the input.
- Every number and running calculation will fit in a signed 32-bit integer.

## Idea1: Stack

Use a **stack** to handle parentheses. Track the running `result` and current `sign`. When we hit `(`, push the current result and sign onto the stack and reset. When we hit `)`, pop the sign and previous result, combining them.

```
Parsing "(1+(4+5+2)-3)+(6+8)":

char  sign  action                          stack          res
(      +    push res=0,sign=1, reset        [0, 1]         0
1      +    res += 1*1                      [0, 1]         1
+      +    sign = 1                        [0, 1]         1
(      +    push res=1,sign=1, reset        [0,1,1,1]      0
4      +    res += 1*4                      [0,1,1,1]      4
+      +    sign = 1                        [0,1,1,1]      4
5      +    res += 1*5                      [0,1,1,1]      9
+      +    sign = 1                        [0,1,1,1]      9
2      +    res += 1*2                      [0,1,1,1]      11
)           pop: res = 1 + 1*11 = 12       [0, 1]         12
-      -    sign = -1                       [0, 1]         12
3      -    res += (-1)*3                   [0, 1]         9
)           pop: res = 0 + 1*9 = 9         []             9
+      +    sign = 1                        []             9
(      +    push res=9,sign=1, reset        [9, 1]         0
6      +    res += 1*6                      [9, 1]         6
+      +    sign = 1                        [9, 1]         6
8      +    res += 1*8                      [9, 1]         14
)           pop: res = 9 + 1*14 = 23       []             23
                                                           ↑ answer
```

Complexity: Time $O(n)$ — single pass. Space $O(n)$ — stack depth proportional to nesting.

## Idea2: Recursive Descent

Treat the expression as a grammar and parse it recursively:

- `expr → num (('+' | '-') num)*`
- `num → digit+ | '(' expr ')' | '-' num`

Each `(` triggers a recursive call to `expr`, which returns when it hits the matching `)`. This naturally handles arbitrary nesting. No explicit stack is needed — the call stack serves the same purpose.

Complexity: Time $O(n)$ — each character visited once. Space $O(d)$ — recursion depth equals max nesting depth.

### Java

```java []
package stack;

import java.util.ArrayDeque;
import java.util.Deque;

// lc 224, stack approach, O(n) time, O(n) space.
public int calculate(String s) {
    int sign = 1, res = 0;
    Deque<Integer> vals = new ArrayDeque<>();
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (Character.isDigit(c)) {
            int sum = s.charAt(i) - '0';
            while (i + 1 < s.length() && Character.isDigit(s.charAt(i + 1))) {
                sum = sum * 10 + s.charAt(i + 1) - '0';
                i++;
            }
            res += sum * sign;
        } else if (c == '+') sign = 1;
        else if (c == '-') sign = -1;
        else if (c == '(') {
            vals.push(res);  // push result
            vals.push(sign); // push sign
            res = 0;         // reset for sub-expression
            sign = 1;
        } else if (c == ')') res = res * vals.pop() + vals.pop();
        // res*sign + pre_res
    }
    return res;
}
```

### Python

```python []
# lc 224, stack approach, O(n) time, O(n) space.
from collections import deque

class Solution:
    def calculate(self, s: str) -> int:
        vals = deque()
        res, sign, i = 0, 1, 0
        while i < len(s):
            c = s[i]
            if c.isdigit():
                n = int(c)
                while i + 1 < len(s) and s[i + 1].isdigit():  # O(digits) per number
                    n = n * 10 + int(s[i + 1])
                    i += 1
                res += n * sign
            elif c == "-":
                sign = -1
            elif c == "+":
                sign = 1
            elif c == "(":  # O(1) push
                vals.append(res)
                vals.append(sign)
                res = 0
                sign = 1
            elif c == ")":  # O(1) pop
                res = res * vals.pop() + vals.pop()
            i += 1
        return res
```

```python []
# lc 224, recursive descent parser, O(n) time, O(depth) space.
class Solution2:
    def calculate(self, s: str) -> int:
        self.i = 0
        self.s = s
        return self._expr()

    def _expr(self) -> int:
        res = self._num()
        while self.i < len(self.s):
            self._skip_spaces()
            if self.i >= len(self.s) or self.s[self.i] == ')':
                break
            op = self.s[self.i]
            self.i += 1
            right = self._num()
            if op == '+':
                res += right
            else:
                res -= right
        return res

    def _num(self) -> int:
        self._skip_spaces()
        if self.s[self.i] == '(':  # recurse into sub-expression, O(depth)
            self.i += 1
            val = self._expr()
            self.i += 1  # skip ')'
            return val
        if self.s[self.i] == '-':  # unary minus
            self.i += 1
            return -self._num()
        n = 0
        while self.i < len(self.s) and self.s[self.i].isdigit():  # O(digits) per number
            n = n * 10 + int(self.s[self.i])
            self.i += 1
        self._skip_spaces()
        return n

    def _skip_spaces(self):
        while self.i < len(self.s) and self.s[self.i] == ' ':
            self.i += 1
```

### C++

```cpp []
// lc 224, stack approach, O(n) time, O(n) space.
int calculate(const string &s) {
    stack<int> stk;
    int res = 0, num = 0, sign = 1;
    for (auto &c : s) {
        if (isdigit(c)) {
            num = num * 10 + (c - '0');           // O(1) per digit
        } else if (c == '+') {
            res += sign * num;                     // accumulate previous number
            num = 0;
            sign = 1;
        } else if (c == '-') {
            res += sign * num;
            num = 0;
            sign = -1;
        } else if (c == '(') {
            stk.push(res);                         // push current result
            stk.push(sign);                        // push current sign
            res = 0;
            sign = 1;
        } else if (c == ')') {
            res += sign * num;                     // finalize sub-expression
            num = 0;
            res *= stk.top(); stk.pop();           // multiply by sign before '('
            res += stk.top(); stk.pop();           // add result before '('
        }
    }
    return res + sign * num;                       // handle trailing number
}
```

### Rust

```rust []
// lc 224, stack approach, O(n) time, O(n) space.
impl Solution {
    pub fn calculate(s: String) -> i32 {
        let mut stack: Vec<i64> = Vec::new(); // O(n) space for nested parens
        let mut result: i64 = 0;
        let mut sign: i64 = 1;
        let mut num: i64 = 0;

        for c in s.chars() {
            match c {
                '0'..='9' => {
                    num = num * 10 + (c as i64 - '0' as i64); // O(1) accumulate digit
                }
                '+' => {
                    result += sign * num; // flush current number
                    num = 0;
                    sign = 1;
                }
                '-' => {
                    result += sign * num;
                    num = 0;
                    sign = -1;
                }
                '(' => {
                    stack.push(result); // O(1) amortized push
                    stack.push(sign);
                    result = 0;
                    sign = 1;
                }
                ')' => {
                    result += sign * num;
                    num = 0;
                    let prev_sign = stack.pop().unwrap(); // O(1) pop
                    let prev_result = stack.pop().unwrap();
                    result = prev_result + prev_sign * result;
                }
                _ => {} // skip whitespace
            }
        }
        result += sign * num; // flush trailing number
        result as i32
    }
}
```
