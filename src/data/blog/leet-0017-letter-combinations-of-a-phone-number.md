---
author: JZ
pubDatetime: 2026-05-16T10:37:00Z
modDatetime: 2026-05-16T10:37:00Z
title: LeetCode 17 Letter Combinations of a Phone Number
featured: false
tags:
  - a-backtracking
  - a-hash-table
  - a-string
description:
  "Solutions for LeetCode 17, medium, tags: hash table, string, backtracking."
---

## Table of contents

## Description

Question Links: [LeetCode 17](https://leetcode.com/problems/letter-combinations-of-a-phone-number/description/)

Given a string containing digits from `2-9` inclusive, return all possible letter combinations that the number could represent. Return the answer in **any order**.

A mapping of digits to letters (just like on the telephone buttons) is given below. Note that 1 does not map to any letters.

```
+-----+-----+-----+
|  1  |  2  |  3  |
|     | abc | def |
+-----+-----+-----+
|  4  |  5  |  6  |
| ghi | jkl | mno |
+-----+-----+-----+
|  7  |  8  |  9  |
|pqrs | tuv |wxyz |
+-----+-----+-----+
|  *  |  0  |  #  |
|     |     |     |
+-----+-----+-----+
```

```
Example 1:

Input: digits = "23"
Output: ["ad","ae","af","bd","be","bf","cd","ce","cf"]

Example 2:

Input: digits = ""
Output: []

Example 3:

Input: digits = "2"
Output: ["a","b","c"]

Constraints:

0 <= digits.length <= 4
digits[i] is a digit in the range ['2', '9'].
```

## Solution 1: Iterative (BFS-style)

### Idea

Start with a list containing one empty string. For each digit, expand every existing combination by appending each letter mapped to that digit. This builds up all combinations level by level, similar to BFS.

```
digits = "23"

Start:          [""]
After '2' (abc): ["a", "b", "c"]
After '3' (def): ["ad","ae","af","bd","be","bf","cd","ce","cf"]

Level-by-level expansion:
         ""
       / | \
      a  b  c          <- letters for '2'
     /|\ ...
    ad ae af           <- letters for '3'
```

Complexity: Time $O(n \cdot 4^n)$ — there are up to $4^n$ combinations, each of length $n$ (copying strings). Space $O(4^n \cdot n)$ for storing the result.

#### Java

```java []
// 2ms, 40.8Mb. O(4^n * n) time and space.
public List<String> letterCombinations(String digits) {
    if (digits.isEmpty()) return new ArrayList<>();
    List<StringBuilder> res = new ArrayList<>();
    res.add(new StringBuilder());
    char[][] map = {{'a', 'b', 'c'}, {'d', 'e', 'f'}, {'g', 'h', 'i'}, {'j', 'k', 'l'}, {'m', 'n', 'o'},
            {'p', 'q', 'r', 's'}, {'t', 'u', 'v'}, {'w', 'x', 'y', 'z'}};
    for (int i = 0; i < digits.length(); i++) { // O(n) digits
        List<StringBuilder> temp = new ArrayList<>();
        for (StringBuilder sb : res)
            for (char c : map[digits.charAt(i) - '2']) // O(3 or 4) letters
                temp.add(new StringBuilder(sb).append(c));
        res = temp;
    }
    return res.stream().map(sb -> sb.toString()).collect(Collectors.toList());
}
```

#### Python

```python []
class Solution:
    """Iterative BFS-like approach. Time O(n * 4^n), Space O(4^n)."""

    def letterCombinations(self, digits: str) -> list[str]:
        if not digits:
            return []
        mapping = ["abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"]
        res = [""]
        for d in digits:  # O(n)
            letters = mapping[int(d) - 2]
            res = [prefix + c for prefix in res for c in letters]  # O(4^n) combinations
        return res
```

#### C++

```cpp []
// Time: O(4^n * n), Space: O(4^n * n)
vector<string> letterCombinations(string digits) {
    if (digits.empty()) return {};
    vector<string> mapping = {"abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"};
    vector<string> result = {""};
    for (char d : digits) { // O(n) digits
        vector<string> next;
        const string &letters = mapping[d - '2'];
        for (const string &prev : result) {
            for (char c : letters) { // O(3 or 4) letters
                next.push_back(prev + c);
            }
        }
        result = move(next);
    }
    return result;
}
```

#### Rust

```rust []
/// Iterative BFS approach. Time O(n * 4^n), Space O(4^n).
pub fn letter_combinations(digits: String) -> Vec<String> {
    if digits.is_empty() {
        return vec![];
    }
    let mapping: [&str; 8] = ["abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"];
    let mut result: Vec<String> = vec![String::new()];

    for ch in digits.chars() { // O(n) digits
        let letters = mapping[(ch as usize) - ('2' as usize)];
        let mut next = Vec::with_capacity(result.len() * letters.len());
        for combo in &result {
            for letter in letters.chars() { // O(3 or 4) letters
                let mut s = combo.clone();
                s.push(letter);
                next.push(s);
            }
        }
        result = next;
    }
    result
}
```

## Solution 2: Backtracking (DFS)

### Idea

Use recursion: at each depth, pick one letter from the current digit's mapping, add it to the path, then recurse for the next digit. When the path length equals the number of digits, save the combination. Backtrack by removing the last character before trying the next letter.

```
digits = "23"

Recursion tree (DFS):
backtrack(0, "")
├── backtrack(1, "a")
│   ├── backtrack(2, "ad") -> save "ad"
│   ├── backtrack(2, "ae") -> save "ae"
│   └── backtrack(2, "af") -> save "af"
├── backtrack(1, "b")
│   ├── backtrack(2, "bd") -> save "bd"
│   ├── ...
└── backtrack(1, "c")
    └── ...
```

Complexity: Time $O(n \cdot 4^n)$ — generating $4^n$ combinations, each of length $n$. Space $O(n)$ for the recursion stack (plus $O(4^n \cdot n)$ for the output).

#### Java

```java []
// Queue-based BFS. O(4^n * n) time and space.
public List<String> letterCombinationsQ(String digits) {
    LinkedList<String> ans = new LinkedList<String>();
    if (digits.isEmpty()) return ans;
    String[] mapping = new String[]{"0", "1", "abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"};
    ans.add("");
    while (ans.peek().length() != digits.length()) {
        String remove = ans.remove();
        String map = mapping[digits.charAt(remove.length()) - '0'];
        for (char c : map.toCharArray()) ans.addLast(remove + c);
    }
    return ans;
}
```

#### Python

```python []
class Solution2:
    """Backtracking approach. Time O(n * 4^n), Space O(n) recursion + O(4^n) result."""

    def letterCombinations(self, digits: str) -> list[str]:
        if not digits:
            return []
        mapping = ["abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"]
        res = []

        def backtrack(i: int, path: list[str]) -> None:
            if i == len(digits):
                res.append("".join(path))
                return
            for c in mapping[int(digits[i]) - 2]:  # O(3 or 4) letters per digit
                path.append(c)
                backtrack(i + 1, path)
                path.pop()

        backtrack(0, [])
        return res
```

#### C++

```cpp []
// Time: O(4^n * n), Space: O(n) excluding output
class Solution17V2 {
    vector<string> mapping = {"abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"};
    vector<string> result;
    string path;

    void backtrack(const string &digits, int idx) {
        if (idx == (int)digits.size()) {
            result.push_back(path);
            return;
        }
        for (char c : mapping[digits[idx] - '2']) { // O(3 or 4) letters
            path.push_back(c);
            backtrack(digits, idx + 1);
            path.pop_back();
        }
    }

public:
    vector<string> letterCombinations(string digits) {
        if (digits.empty()) return {};
        result.clear();
        path.clear();
        backtrack(digits, 0);
        return result;
    }
};
```

#### Rust

```rust []
/// Backtracking approach. Time O(n * 4^n), Space O(n) recursion + O(4^n) result.
pub fn letter_combinations_v2(digits: String) -> Vec<String> {
    if digits.is_empty() {
        return vec![];
    }
    let mapping: [&str; 8] = ["abc", "def", "ghi", "jkl", "mno", "pqrs", "tuv", "wxyz"];
    let digits: Vec<usize> = digits.chars().map(|c| c as usize - '2' as usize).collect();
    let mut result = Vec::new();
    let mut current = String::with_capacity(digits.len());
    backtrack(&digits, &mapping, 0, &mut current, &mut result);
    result
}

fn backtrack(
    digits: &[usize], mapping: &[&str; 8], idx: usize,
    current: &mut String, result: &mut Vec<String>,
) {
    if idx == digits.len() {
        result.push(current.clone());
        return;
    }
    for letter in mapping[digits[idx]].chars() { // O(3 or 4) letters
        current.push(letter);
        backtrack(digits, mapping, idx + 1, current, result);
        current.pop();
    }
}
```
