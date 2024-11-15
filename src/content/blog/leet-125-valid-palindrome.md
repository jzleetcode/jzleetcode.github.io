---
author: JZ
pubDatetime: 2024-11-13T07:22:00Z
modDatetime: 2024-11-13T08:12:00Z
title: LeetCode 125 LintCode 415 Valid Palindrome
featured: true
tags:
  - a-string
  - a-two-pointers
  - c-linkedin
  - c-facebook
  - c-uber
  - c-zenefits
  - c-microsoft
description:
  "Solutions for LeetCode 125, LintCode 415, easy, tags: two pointers, string. Companies: LinkedIn, Facebook, Uber, Zenefits, Microsoft."
---

## Table of contents

## Description

A phrase is a **palindrome** if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string `s`, return `true` _if it is a **palindrome**, or_ `false` _otherwise_.

```
Example 1:

Input: s = "A man, a plan, a canal: Panama"
Output: true
Explanation: "amanaplanacanalpanama" is a palindrome.
Example 2:

Input: s = "race a car"
Output: false
Explanation: "raceacar" is not a palindrome.
Example 3:

Input: s = " "
Output: true
Explanation: s is an empty string "" after removing non-alphanumeric characters.
Since an empty string reads the same forward and backward, it is a palindrome.
 

Constraints:

1 <= s.length <= 2 * 10^5
s consists only of printable ASCII characters.
```

## Solution

### Idea

We can use two pointers to iterate from the left and right end of the string. As we iterate, we ignore the non-alphanumeric characters. When both of the two pointers are pointing at an alphanumeric character, we report false if the two characters are not equal. Otherwise, we return `true` at the end.

Complexity: Time O(n), Space O(1).

#### C++

```cpp
class Solution {
public:
    bool isPalindrome(string s) {
        for (int l = 0, r = s.size() - 1; l < r; l++, r--) {
            while (l < r && !isalnum(s[l])) l++;
            while (l < r && !isalnum(s[r])) r--;
            if (l < r && toupper(s[l]) != toupper(s[r])) return false;
        }
        return true;
    }
};
```

#### Java

```java
static class Solution1 {
    public boolean isPalindrome2P(String s) {
        for (int l = 0, r = s.length() - 1; l < r; l++, r--) {
            while (!Character.isLetterOrDigit(s.charAt(l)) && l < r) l++;
            while (!Character.isLetterOrDigit(s.charAt(r)) && l < r) r--;
            if (l < r && Character.toUpperCase(s.charAt(l)) != Character.toUpperCase(s.charAt(r)))
                return false;
        }
        return true;
    }
}
```

#### Rust

```rust
impl Solution {
    pub fn is_palindrome(s: String) -> bool {
        let mut chars = s.chars().filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_uppercase());
        while let (Some(l), Some(r)) = (chars.next(), chars.next_back()) {
            if l != r { return false; }
        }
        true
    }
}
```

