---
author: JZ
pubDatetime: 2026-06-19T10:07:00Z
modDatetime: 2026-06-19T10:07:00Z
title: LeetCode 150 Evaluate Reverse Polish Notation
featured: true
tags:
  - a-array
  - a-math
  - a-stack
description:
  "Solutions for LeetCode 150, medium, tags: array, math, stack."
---

## Table of contents

## Description

Question Links: [LeetCode 150](https://leetcode.com/problems/evaluate-reverse-polish-notation/description/)

You are given an array of strings `tokens` that represents an arithmetic expression in a Reverse Polish Notation.

Evaluate the expression. Return an integer that represents the value of the expression.

Note that:
- The valid operators are `'+'`, `'-'`, `'*'`, and `'/'`.
- Each operand may be an integer or another expression.
- The division between two integers always truncates toward zero.
- There will not be any division by zero.
- The input represents a valid arithmetic expression in a reverse polish notation.
- The answer and all the intermediate calculations can be represented in a 32-bit integer.

```
Example 1:

Input: tokens = ["2","1","+","3","*"]
Output: 9
Explanation: ((2 + 1) * 3) = 9

Example 2:

Input: tokens = ["4","13","5","/","+"]
Output: 6
Explanation: (4 + (13 / 5)) = 6

Example 3:

Input: tokens = ["10","6","9","3","+","-11","*","/","*","17","+","5","+"]
Output: 22
Explanation: ((10 * (6 / ((9 + 3) * -11))) + 17) + 5
= ((10 * (6 / (12 * -11))) + 17) + 5
= ((10 * (6 / -132)) + 17) + 5
= ((10 * 0) + 17) + 5
= (0 + 17) + 5
= 17 + 5
= 22

Constraints:

1 <= tokens.length <= 10^4
tokens[i] is either an operator: "+", "-", "*", or "/", or an integer in the range [-200, 200].
```

## Solution 1: Stack

### Idea

Reverse Polish Notation evaluates naturally with a stack: scan tokens left to right, push operands, and when an operator appears, pop the top two operands, apply the operator, and push the result.

```
tokens = ["10","6","9","3","+","-11","*","/","*","17","+","5","+"]

Step    Token   Action              Stack
─────   ─────   ─────────────────   ─────────────
1       10      push                [10]
2       6       push                [10, 6]
3       9       push                [10, 6, 9]
4       3       push                [10, 6, 9, 3]
5       +       pop 9,3 → 12       [10, 6, 12]
6       -11     push                [10, 6, 12, -11]
7       *       pop 12,-11 → -132  [10, 6, -132]
8       /       pop 6,-132 → 0     [10, 0]
9       *       pop 10,0 → 0       [0]
10      17      push                [0, 17]
11      +       pop 0,17 → 17      [17]
12      5       push                [17, 5]
13      +       pop 17,5 → 22      [22]

Result: 22
```

Key detail: for subtraction and division, order matters. The first popped value is the right operand, and the second popped value is the left operand.

Complexity: Time $O(n)$, Space $O(n)$.

Each token is processed exactly once. The stack holds at most $O(n)$ elements.

#### Java

```java []
public int evalRPN(String[] tokens) {
    ArrayDeque<Integer> stack = new ArrayDeque<>();
    for (int i = 0; i < tokens.length; i++) { // O(n) time
        int val1, val2;
        switch (tokens[i]) {
            case "+" -> stack.push(stack.pop() + stack.pop());
            case "-" -> {
                val2 = stack.pop();
                val1 = stack.pop();
                stack.push(val1 - val2);
            }
            case "/" -> {
                val2 = stack.pop();
                val1 = stack.pop();
                stack.push(val1 / val2);
            }
            case "*" -> stack.push(stack.pop() * stack.pop());
            default -> stack.push(Integer.parseInt(tokens[i]));
        }
    }
    return stack.pop(); // O(n) space for the stack
}
```

#### Python

```python []
class Solution:
    def evalRPN(self, tokens: list[str]) -> int:
        stack = []  # O(n) space
        for token in tokens:  # O(n) time
            match token:
                case '+':
                    stack.append(stack.pop() + stack.pop())
                case '-':
                    b, a = stack.pop(), stack.pop()
                    stack.append(a - b)
                case '*':
                    stack.append(stack.pop() * stack.pop())
                case '/':
                    b, a = stack.pop(), stack.pop()
                    stack.append(int(a / b))  # truncate toward zero
                case _:
                    stack.append(int(token))
        return stack[0]
```

#### C++

```cpp []
class Solution {
public:
    int evalRPN(vector<string>& tokens) {
        stack<int> st;
        for (const auto& token : tokens) { // O(n) time
            if (token == "+" || token == "-" || token == "*" || token == "/") {
                int b = st.top(); st.pop();
                int a = st.top(); st.pop();
                if (token == "+") st.push(a + b);
                else if (token == "-") st.push(a - b);
                else if (token == "*") st.push(a * b);
                else st.push(a / b); // C++ int division truncates toward zero
            } else {
                st.push(stoi(token));
            }
        }
        return st.top(); // O(n) space for the stack
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn eval_rpn(tokens: Vec<String>) -> i32 {
        let mut stack: Vec<i32> = Vec::new(); // O(n) space
        for token in &tokens { // O(n) time
            match token.as_str() {
                "+" | "-" | "*" | "/" => {
                    let b = stack.pop().unwrap();
                    let a = stack.pop().unwrap();
                    let result = match token.as_str() {
                        "+" => a + b,
                        "-" => a - b,
                        "*" => a * b,
                        "/" => a / b, // Rust i32 division truncates toward zero
                        _ => unreachable!(),
                    };
                    stack.push(result);
                }
                num => stack.push(num.parse::<i32>().unwrap()),
            }
        }
        stack.pop().unwrap()
    }
}
```
