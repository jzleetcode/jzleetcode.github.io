---
author: JZ
pubDatetime: 2024-11-08T15:22:00Z
modDatetime: 2024-11-08T17:12:00Z
title: LeetCode 20 LintCode 423 Valid Parentheses (stack)
featured: true
tags:
  - a-stack
  - a-string
  - c-goldman-sachs
  - c-Twitter
  - c-Airbnb
  - c-Amazon
  - c-Facebook
  - c-Zenefits
  - c-Microsoft
  - c-Bloomberg
  - c-Uber
  - c-Google
description:
  "solution for LeetCode 20 LintCode 423 valid parentheses, tags: stack, string; companies: goldman sachs, twitter, airbnb, amazon, facebook, microsoft, bloomberg, uber, google."
---

## Table of contents

## Description

Given a string s containing just the characters `'(', ')', '{', '}', '[' and ']'`, determine if the input string is valid.

An input string is valid if:

Open brackets must be closed by the same type of brackets.
Open brackets must be closed in the correct order.
Every close bracket has a corresponding open bracket of the same type.

```
Example 1:

Input: s = "()"

Output: true

Example 2:

Input: s = "()[]{}"

Output: true

Example 3:

Input: s = "(]"

Output: false

Example 4:

Input: s = "([])"

Output: true


Constraints:

1 <= s.length <= 10^4
s consists of parentheses only '()[]{}'.
```

## Solution

### Idea

We use a stack to memorize the open brackets seen and their order.
When we see a close bracket, we pop the most recent bracket (LIFO) to match.
Remember to check whether there are any remaining brackets left on the stack at the end.

#### Java

Using Java 13 enhanced `case switch`, a bit shorter than regular `if else`.

```java
class Solution {
    public boolean isValid(String s) {
        Stack<Character> stack = new Stack<>();
        for (int i = 0; i < s.length(); i++) {
            switch (s.charAt(i)) {
                case '(' -> stack.push(')');
                case '[' -> stack.push(']');
                case '{' -> stack.push('}');
                default -> {
                    if (stack.isEmpty() || s.charAt(i) != stack.pop()) return false;
                }
            }
        }
        return stack.isEmpty();
    }
}
```

#### Rust

In many cases, I found Rust tends to be verbose.
But for this question, Rust is perfect.
For the fourth branch, no separate emptiness check is needed because Rust's `VecDeque` returns an `Option`.

```rust
use std::collections::VecDeque;

impl Solution {
    pub fn is_valid(s: String) -> bool {
        let mut st = VecDeque::new();
        for c in s.chars() {
            match c {
                '(' => st.push_back(')'),
                '[' => st.push_back(']'),
                '{' => st.push_back('}'),
                _ => if st.pop_back() != Some(c) {return false;}
            }
        }
        st.is_empty();
    }
}
```

### Python

We can leverage `match case` introduced in Python 3.10.

```python
class Solution:
    """0 ms, 17.42 mb"""

    def isValid(self, s: str) -> bool:
        st = deque()
        for c in s:
            match c:  # match case since 3.10
                case '(':
                    st.append(')')
                case '[':
                    st.append(']')
                case '{':
                    st.append('}')
                case _:
                    if not st or st.pop() != c:
                        return False
        return len(st) == 0
```

### C++

C++ does not support returning the element with `pop`. So we needed one more branch in the `if else` branches.

```cpp
class Solution {
public:
    bool isValid(string s) {
        deque<char> st;
        for (char c: s) {
            if (c == '(') st.push_back(')');
            else if (c == '[') st.push_back(']');
            else if (c == '{') st.push_back('}');
            else if (!st.empty() && st.back() == c) st.pop_back();
            else return false;
        }
        return st.empty();
    }
};
```
