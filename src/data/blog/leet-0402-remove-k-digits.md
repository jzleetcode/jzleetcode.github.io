---
author: JZ
pubDatetime: 2026-06-08T06:23:00Z
modDatetime: 2026-06-08T06:23:00Z
title: LeetCode 402 Remove K Digits
featured: true
tags:
  - a-stack
  - a-monotonic-stack
  - a-greedy
  - a-string
description:
  "Solutions for LeetCode 402, medium, tags: string, stack, monotonic stack, greedy."
---

## Table of contents

## Description

Question Links: [LeetCode 402](https://leetcode.com/problems/remove-k-digits/description/)

Given string `num` representing a non-negative integer and an integer `k`, return the smallest possible integer after removing `k` digits from `num`.

```
Example 1:

Input: num = "1432219", k = 3
Output: "1219"
Explanation: Remove the three digits 4, 3, and the leading 2 to form "1219".

Example 2:

Input: num = "10200", k = 1
Output: "200"
Explanation: Remove the leading 1, the number is "200". Note that the output must not contain leading zeroes.

Example 3:

Input: num = "10", k = 2
Output: "0"
Explanation: Remove all digits, the remaining number is empty which is "0".
```

**Constraints:**

-   `1 <= k <= num.length <= 10^5`
-   `num` consists of only digits.
-   `num` does not have any leading zeros except for the zero itself.

## Idea

We use a **monotonic stack** with a greedy strategy: scan left to right, and whenever the current digit is smaller than the top of the stack, pop the stack (using one removal). This ensures we always remove a larger digit that precedes a smaller one — the optimal greedy choice for minimizing the result.

```
num = "1432219", k = 3

Process each digit:
  '1' -> stack: [1]
  '4' -> stack: [1,4]         (4 > 1, just push)
  '3' -> pop 4, k=2           (3 < 4, remove 4)
         stack: [1,3]
  '2' -> pop 3, k=1           (2 < 3, remove 3)
         stack: [1,2]
  '2' -> stack: [1,2,2]       (2 >= 2, just push)
  '1' -> pop 2, k=0           (1 < 2, remove 2)
         stack: [1,2,1]
  '9' -> stack: [1,2,1,9]     (k=0, no more removals)

Result: "1219"
```

After processing all digits, if `k > 0` still, remove from the end (the stack is non-decreasing, so the largest digits are at the end). Finally, strip leading zeros.

Complexity: Time $O(n)$ — each digit is pushed and popped at most once. Space $O(n)$.

### Java

```java []
public static String removeKdigits(String num, int k) {
    StringBuilder stack = new StringBuilder();
    for (char c : num.toCharArray()) { // O(n)
        while (k > 0 && stack.length() > 0 && stack.charAt(stack.length() - 1) > c) {
            stack.deleteCharAt(stack.length() - 1); // amortized O(1)
            k--;
        }
        stack.append(c);
    }
    stack.setLength(stack.length() - k);
    if (stack.length() == 0) return "0";
    // strip leading zeros
    int start = 0;
    while (start < stack.length() - 1 && stack.charAt(start) == '0') start++;
    return stack.substring(start);
}
```

### Python

```python []
class Solution:
    """Monotonic stack greedy. O(n) time, O(n) space."""

    def removeKdigits(self, num: str, k: int) -> str:
        stack = []
        for digit in num:  # O(n)
            while k and stack and stack[-1] > digit:  # amortized O(1)
                stack.pop()
                k -= 1
            stack.append(digit)
        if k:
            stack = stack[:-k]
        return "".join(stack).lstrip("0") or "0"
```

### C++

```cpp []
string removeKdigits(string num, int k) {
    string stack; // O(n) space
    for (char c : num) { // O(n)
        while (k > 0 && !stack.empty() && stack.back() > c) { // amortized O(1)
            stack.pop_back();
            k--;
        }
        stack.push_back(c);
    }
    stack.resize(stack.size() - k);
    size_t start = stack.find_first_not_of('0');
    return start == string::npos ? "0" : stack.substr(start);
}
```

### Rust

```rust []
pub fn remove_kdigits(num: String, k: i32) -> String {
    let mut k = k as usize;
    let mut stack: Vec<u8> = Vec::new(); // O(n) space
    for &b in num.as_bytes() { // O(n)
        while k > 0 && !stack.is_empty() && *stack.last().unwrap() > b {
            stack.pop(); // amortized O(1)
            k -= 1;
        }
        stack.push(b);
    }
    stack.truncate(stack.len() - k);
    let result = String::from_utf8(stack).unwrap();
    let stripped = result.trim_start_matches('0');
    if stripped.is_empty() { "0".to_string() } else { stripped.to_string() }
}
```
