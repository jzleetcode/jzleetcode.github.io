---
author: JZ
pubDatetime: 2026-04-11T08:00:00Z
modDatetime: 2026-04-11T08:00:00Z
title: LeetCode 394 Decode String
featured: false
tags:
  - a-string
  - a-stack
  - a-recursion
description:
  "Solutions for LeetCode 394, medium, tags: string, stack, recursion."
---

## Table of contents

## Description

Question Links: [LeetCode 394](https://leetcode.com/problems/decode-string/description/)

Given an encoded string, return its decoded string.

The encoding rule is: `k[encoded_string]`, where the `encoded_string` inside the square brackets is being repeated exactly `k` times. Note that `k` is guaranteed to be a positive integer.

You may assume that the input string is always valid; there are no extra white spaces, square brackets are well-formed, etc. Furthermore, you may assume that the original data does not contain any digits and that digits are only for those repeat numbers, `k`. For example, there will not be input like `3a` or `2[4]`.

```
Example 1:

Input: s = "3[a]2[bc]"
Output: "aaabcbc"

Example 2:

Input: s = "3[a2[c]]"
Output: "accaccacc"

Example 3:

Input: s = "2[abc]3[cd]ef"
Output: "abcabccdcdcdef"

Constraints:

1 <= s.length <= 30
s consists of lowercase English letters, digits, and square brackets '[]'.
s is guaranteed to be a valid input.
All the integers in s are in the range [1, 300].
```

## Solution 1: Stack

### Idea

Maintain a stack of `(previous_string, repeat_count)` pairs and a running `cur` string. As we scan the input:

- **digit** → accumulate into `k` (handles multi-digit like `12[a]`)
- **`[`** → push `(cur, k)` onto the stack, reset `cur` and `k`
- **`]`** → pop `(prev, cnt)`, set `cur = prev + cur * cnt`
- **letter** → append to `cur`

```
Trace for "3[a2[c]]":

char='3' → k=3
char='[' → push("",3), cur="", k=0
char='a' → cur="a"
char='2' → k=2
char='[' → push("a",2), cur="", k=0
char='c' → cur="c"
char=']' → pop("a",2), cur="a"+"c"*2 = "acc"
char=']' → pop("",3), cur=""+"acc"*3 = "accaccacc"

Result: "accaccacc"
```

Complexity: Time $O(n \cdot \text{max\_k})$ where $n$ is the input length and $\text{max\_k}$ is the largest repeat factor. Space $O(n)$ for the stack depth (bounded by nesting level).

#### Java

```java []
public String decodeString(String s) {
    Deque<StringBuilder> strStack = new ArrayDeque<>();
    Deque<Integer> countStack = new ArrayDeque<>();
    StringBuilder cur = new StringBuilder();
    int k = 0;
    for (char c : s.toCharArray()) { // O(n)
        if (Character.isDigit(c)) {
            k = k * 10 + (c - '0');
        } else if (c == '[') {
            strStack.push(cur);
            countStack.push(k);
            cur = new StringBuilder();
            k = 0;
        } else if (c == ']') {
            StringBuilder prev = strStack.pop();
            int repeat = countStack.pop();
            for (int i = 0; i < repeat; i++) prev.append(cur); // O(max_k)
            cur = prev;
        } else {
            cur.append(c);
        }
    }
    return cur.toString(); // Time O(n * max_k), Space O(n)
}
```

#### Python

```python []
class Solution:
    def decodeString(self, s: str) -> str:
        stack = []  # stack of (previous_string, repeat_count)
        cur = ""
        k = 0
        for c in s:  # O(n)
            if c.isdigit():
                k = k * 10 + int(c)
            elif c == '[':
                stack.append((cur, k))
                cur, k = "", 0
            elif c == ']':
                prev, cnt = stack.pop()
                cur = prev + cur * cnt  # O(max_k) per expansion
            else:
                cur += c
        return cur  # Time O(n * max_k), Space O(n)
```

#### C++

```cpp []
class Solution394 {
public:
    string decodeString(string s) {
        stack<pair<string, int>> stk;
        string cur;
        int k = 0;
        for (char c : s) { // O(n)
            if (isdigit(c)) {
                k = k * 10 + (c - '0');
            } else if (c == '[') {
                stk.push({cur, k});
                cur.clear();
                k = 0;
            } else if (c == ']') {
                auto [prev, cnt] = stk.top();
                stk.pop();
                string tmp;
                for (int i = 0; i < cnt; i++) tmp += cur; // O(max_k)
                cur = prev + tmp;
            } else {
                cur += c;
            }
        }
        return cur; // Time O(n * max_k), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn decode_string(s: String) -> String {
        let mut stack: Vec<(String, usize)> = Vec::new();
        let mut current = String::new();
        let mut k: usize = 0;
        for ch in s.chars() { // O(n)
            match ch {
                '0'..='9' => k = k * 10 + (ch as usize - '0' as usize),
                '[' => {
                    stack.push((current.clone(), k));
                    current.clear();
                    k = 0;
                }
                ']' => {
                    let (prev, repeat) = stack.pop().unwrap();
                    let repeated = current.repeat(repeat); // O(max_k)
                    current = prev + &repeated;
                }
                _ => current.push(ch),
            }
        }
        current // Time O(n * max_k), Space O(n)
    }
}
```

## Solution 2: Recursive Descent

### Idea

Parse the string as a simple grammar using recursion. Maintain a global index `i`:

- **letter** → append to result, advance `i`
- **digit** → parse the full number, skip `[`, recurse to decode the inner content, skip `]`, repeat the inner result `k` times

Each `[` triggers a recursive call; the recursion returns when `]` or end of string is reached.

Complexity: same as the stack approach — Time $O(n \cdot \text{max\_k})$, Space $O(n)$ for recursion depth.

#### Java

```java []
static class Solution2 {
    private int i;

    public String decodeString(String s) {
        i = 0;
        return decode(s);
    }

    private String decode(String s) {
        StringBuilder res = new StringBuilder();
        while (i < s.length() && s.charAt(i) != ']') { // O(n) total across all calls
            if (Character.isDigit(s.charAt(i))) {
                int k = 0;
                while (i < s.length() && Character.isDigit(s.charAt(i)))
                    k = k * 10 + (s.charAt(i++) - '0');
                i++; // skip '['
                String nested = decode(s);
                i++; // skip ']'
                for (int j = 0; j < k; j++) res.append(nested); // O(max_k)
            } else {
                res.append(s.charAt(i++));
            }
        }
        return res.toString();
    }
}
```

#### Python

```python []
class Solution2:
    def decodeString(self, s: str) -> str:
        self.i = 0
        return self._decode(s)

    def _decode(self, s: str) -> str:
        res = ""
        while self.i < len(s) and s[self.i] != ']':
            if s[self.i].isdigit():
                k = 0
                while self.i < len(s) and s[self.i].isdigit():  # parse number
                    k = k * 10 + int(s[self.i])
                    self.i += 1
                self.i += 1  # skip '['
                decoded = self._decode(s)  # recurse for nested content
                self.i += 1  # skip ']'
                res += decoded * k  # O(max_k)
            else:
                res += s[self.i]
                self.i += 1
        return res  # Time O(n * max_k), Space O(n)
```

#### C++

```cpp []
class Solution394V2 {
    int i;

    string decode(const string &s) {
        string res;
        while (i < (int)s.size() && s[i] != ']') {
            if (isdigit(s[i])) {
                int k = 0;
                while (i < (int)s.size() && isdigit(s[i]))
                    k = k * 10 + (s[i++] - '0');
                i++; // skip '['
                string inner = decode(s);
                i++; // skip ']'
                for (int j = 0; j < k; j++) res += inner; // O(max_k)
            } else {
                res += s[i++];
            }
        }
        return res;
    }

public:
    string decodeString(string s) {
        i = 0;
        return decode(s); // Time O(n * max_k), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn decode_string_v2(s: String) -> String {
        let chars: Vec<char> = s.chars().collect();
        let mut i = 0;
        Self::decode_recursive(&chars, &mut i)
    }

    fn decode_recursive(chars: &[char], i: &mut usize) -> String {
        let mut result = String::new();
        while *i < chars.len() && chars[*i] != ']' {
            if chars[*i].is_ascii_digit() {
                let mut k: usize = 0;
                while *i < chars.len() && chars[*i].is_ascii_digit() {
                    k = k * 10 + (chars[*i] as usize - '0' as usize);
                    *i += 1;
                }
                *i += 1; // skip '['
                let inner = Self::decode_recursive(chars, i);
                *i += 1; // skip ']'
                for _ in 0..k { result.push_str(&inner); } // O(max_k)
            } else {
                result.push(chars[*i]);
                *i += 1;
            }
        }
        result // Time O(n * max_k), Space O(n)
    }
}
```
