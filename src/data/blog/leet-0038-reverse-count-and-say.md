---
author: JZ
pubDatetime: 2024-11-23T07:23:00Z
modDatetime: 2024-11-23T08:23:00Z
title: Reverse of LeetCode 38 LintCode 420 Count and Say (Look and Say)
tags:
  - a-math
  - a-string
  - c-facebook
  - c-pinterest
description:
  "Solutions for LeetCode 38, LintCode 420, medium, tags: math, string, simulation, companies: facebook, pinterest."
---

## Table of contents

## Description

Question Links: [LeetCode 38](https://leetcode.com/problems/count-and-say/description/), [LintCode 420](https://www.lintcode.com/problem/420/)

See [solution for LeetCode 38](../leet-0038-count-and-say/) for more background. The question could come up as a follow-up to that question.

You should clarify the exact meaning of "reverse".

Possible constraints:

1. The count should be less than 10, e.g., 1211 could be one 2 one 1 or 121 ones. As we mentioned in [LeetCode 38](../leet-0038-count-and-say/#background), the sequence count should be a single digit. In fact, unless the seed digit contains such a digit or a run of more than three of the same digit, no digits other than `1`, `2`, and `3` appear in the sequence.


## Solution

### Idea

1.  We parse the input string (`s`) parsed in pairs:
    -   The first character of each pair (`s.charAt(i)`) is the count of repetitions.
    -   The second character of each pair (`s.charAt(i + 1)`) is the digit being repeated.
2.  For each pair, repeat the digit `count` times and append it to the result.
3.  The result is the prior term in the Count and Say sequence.

Example

Input:

`s = "111221"`

Execution:

-   Read `11`: Add "1" repeated 1 time → "1".
-   Read `12`: Add "2" repeated 1 time → "12".
-   Read `21`: Add "1" repeated 2 times → "1211".

Output:

`"1211"`

Edge Cases to Consider

-   An empty string should return an empty result.
-   Invalid strings (e.g., odd-length input) should be handled appropriately, possibly by throwing an exception or returning an error message.

Complexity: Time $O(n)$, Space $O(n)$ or $O(1)$ not considering result space.

#### Java

```java []
public final class ReverseCountAndSay {
    public static String reverseCountSay(String s) {
        if (s == null || s.isEmpty()) return "";
        if ((s.length() & 1) != 0) throw new IllegalArgumentException("odd length input");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i += 2) {  // O(n/2) pairs
            int cnt = s.charAt(i) - '0';
            char digit = s.charAt(i + 1);
            for (int k = 0; k < cnt; k++) out.append(digit);
        }
        return out.toString();
    }
}
```

#### Python

```python []
class Solution:

    def reverseCountSay(self, s):
        res, n = [], len(s)
        for i in range(0, n, 2):       # O(n/2) pairs
            cnt = int(s[i])
            ch = s[i + 1]
            res.extend([ch] * cnt)
        return ''.join(res)
```

#### C++

```cpp []
class Solution {
public:
    string reverseCountSay(const string& s) {
        if (s.empty()) return "";
        if (s.size() % 2 != 0) throw invalid_argument("odd length input");
        string out;
        for (size_t i = 0; i < s.size(); i += 2) {
            int cnt = s[i] - '0';
            out.append(cnt, s[i + 1]);   // append cnt copies of digit
        }
        return out;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn reverse_count_say(s: &str) -> Result<String, &'static str> {
        if s.is_empty() { return Ok(String::new()); }
        let bytes = s.as_bytes();
        if bytes.len() % 2 != 0 { return Err("odd length input"); }
        let mut out = String::with_capacity(bytes.len() * 4);
        let mut i = 0;
        while i < bytes.len() {
            let cnt = (bytes[i] - b'0') as usize;
            let digit_ch = bytes[i + 1] as char;
            for _ in 0..cnt { out.push(digit_ch); }
            i += 2;
        }
        Ok(out)
    }
}
```
