---
author: JZ
pubDatetime: 2026-08-07T06:00:00Z
modDatetime: 2026-08-07T06:00:00Z
title: LeetCode 131 Palindrome Partitioning
featured: false
tags:
  - a-backtracking
  - a-dynamic-programming
  - a-string
description:
  "Solutions for LeetCode 131, medium, tags: string, dynamic programming, backtracking."
---

## Table of contents

## Description

Question Links: [LeetCode 131](https://leetcode.com/problems/palindrome-partitioning/description/)

Given a string `s`, partition `s` such that every substring of the partition is a palindrome. Return all possible palindrome partitioning of `s`.

```
Example 1:

Input: s = "aab"
Output: [["a","a","b"],["aa","b"]]

Example 2:

Input: s = "a"
Output: [["a"]]

Constraints:

1 <= s.length <= 16
s contains only lowercase English letters.
```

## Solution 1: Backtracking + DP Palindrome Table

### Idea

Precompute an $n \times n$ table where `dp[i][j] = true` if `s[i..j]` is a palindrome. Fill bottom-up: `dp[i][j] = (s[i] == s[j]) && (j - i <= 2 || dp[i+1][j-1])`. Then backtrack through all partitions, using the table for $O(1)$ palindrome checks at each branch.

```
s = "aab"

Palindrome table:
     a  a  b
a  [ T  T  F ]
a  [ .  T  F ]
b  [ .  .  T ]

Backtracking tree:
                    start=0
                /           \
          "a"(0,0)        "aa"(0,1)
          start=1           start=2
        /       \              |
  "a"(1,1)   "aa" X       "b"(2,2)
   start=2                  start=3 ✓
      |                  => ["aa","b"]
  "b"(2,2)
   start=3 ✓
=> ["a","a","b"]
```

Complexity: Time $O(n \cdot 2^n)$ — there are at most $2^{n-1}$ partitions, each taking $O(n)$ to copy. Space $O(n^2)$ — palindrome table dominates.

#### Java

```java []
public List<List<String>> partition(String s) {
    int len = s.length();
    boolean[][] dp = new boolean[len][len];
    List<List<String>> result = new ArrayList<>();
    dfs(result, s, 0, new ArrayList<>(), dp);
    return result;
}

void dfs(List<List<String>> result, String s, int start, List<String> currentList, boolean[][] dp) {
    if (start >= s.length()) result.add(new ArrayList<>(currentList));
    for (int end = start; end < s.length(); end++) { // O(2^N) branches
        // two ends match, middle is palindrome or no middle part
        if (s.charAt(start) == s.charAt(end) && (end - start <= 2 || dp[start + 1][end - 1])) {
            dp[start][end] = true;
            currentList.add(s.substring(start, end + 1));
            dfs(result, s, end + 1, currentList, dp);
            currentList.remove(currentList.size() - 1);
        }
    }
}
```

#### Python

```python []
class Solution:
    def partition(self, s: str) -> list[list[str]]:
        n = len(s)
        dp = [[False] * n for _ in range(n)]
        for i in range(n - 1, -1, -1):  # O(N^2) fill palindrome table
            for j in range(i, n):
                dp[i][j] = s[i] == s[j] and (j - i <= 2 or dp[i + 1][j - 1])
        res = []
        self._dfs(s, 0, [], res, dp)
        return res

    def _dfs(self, s, start, path, res, dp):
        if start == len(s):
            res.append(path[:])
            return
        for end in range(start, len(s)):  # O(2^N) branches total
            if dp[start][end]:
                path.append(s[start:end + 1])
                self._dfs(s, end + 1, path, res, dp)
                path.pop()
```

#### C++

```cpp []
vector<vector<string>> partition(string s) {
    int n = s.size();
    vector<vector<bool>> dp(n, vector<bool>(n, false));
    for (int i = n - 1; i >= 0; i--) {          // O(N^2) fill
        for (int j = i; j < n; j++) {
            if (s[i] == s[j] && (j - i <= 2 || dp[i + 1][j - 1])) {
                dp[i][j] = true;
            }
        }
    }
    vector<vector<string>> result;
    vector<string> path;
    function<void(int)> backtrack = [&](int start) {
        if (start == n) {
            result.push_back(path);
            return;
        }
        for (int end = start; end < n; end++) {  // O(2^N) branches
            if (dp[start][end]) {
                path.push_back(s.substr(start, end - start + 1));
                backtrack(end + 1);
                path.pop_back();
            }
        }
    };
    backtrack(0);
    return result;
}
```

#### Rust

```rust []
pub fn partition(s: String) -> Vec<Vec<String>> {
    let n = s.len();
    let bytes = s.as_bytes();
    let mut dp = vec![vec![false; n]; n];
    for i in (0..n).rev() { // O(N^2) fill
        for j in i..n {
            dp[i][j] = bytes[i] == bytes[j] && (j - i < 2 || dp[i + 1][j - 1]);
        }
    }
    let mut res = Vec::new();
    let mut path = Vec::new();
    fn backtrack(s: &str, start: usize, dp: &[Vec<bool>], path: &mut Vec<String>, res: &mut Vec<Vec<String>>) {
        if start == s.len() {
            res.push(path.clone());
            return;
        }
        for end in start..s.len() { // O(2^N) branches
            if dp[start][end] {
                path.push(s[start..=end].to_string());
                backtrack(s, end + 1, dp, path, res);
                path.pop();
            }
        }
    }
    backtrack(&s, 0, &dp, &mut path, &mut res);
    res
}
```

## Solution 2: Backtracking + Inline Palindrome Check

### Idea

Same backtracking structure, but instead of precomputing a table, check each substring for palindrome inline with a two-pointer scan. This trades $O(n^2)$ precomputation space for $O(n)$ per-check time. In practice this is fast because most branches are pruned early when the first characters don't match.

Complexity: Time $O(n \cdot 2^n)$ — same branch count, each palindrome check up to $O(n)$. Space $O(n)$ — only recursion stack, no precomputed table.

#### Java

```java []
public List<List<String>> partitionDFS(String s) {
    List<List<String>> result = new ArrayList<>();
    dfs(0, result, new ArrayList<>(), s);
    return result;
}

void dfs(int start, List<List<String>> result, List<String> currentList, String s) {
    if (start >= s.length()) result.add(new ArrayList<>(currentList));
    for (int end = start; end < s.length(); end++) { // O(2^N) branches
        if (isPalindrome(s, start, end)) {
            currentList.add(s.substring(start, end + 1));
            dfs(end + 1, result, currentList, s);
            currentList.remove(currentList.size() - 1);
        }
    }
}

boolean isPalindrome(String s, int low, int high) { // O(N) per check
    while (low < high)
        if (s.charAt(low++) != s.charAt(high--)) return false;
    return true;
}
```

#### Python

```python []
class Solution2:
    def partition(self, s: str) -> list[list[str]]:
        res = []
        self._dfs(s, 0, [], res)
        return res

    def _dfs(self, s, start, path, res):
        if start == len(s):
            res.append(path[:])
            return
        for end in range(start, len(s)):  # O(2^N) branches
            if self._is_palindrome(s, start, end):
                path.append(s[start:end + 1])
                self._dfs(s, end + 1, path, res)
                path.pop()

    def _is_palindrome(self, s, lo, hi):  # O(N) per check
        while lo < hi:
            if s[lo] != s[hi]:
                return False
            lo += 1
            hi -= 1
        return True
```

#### C++

```cpp []
vector<vector<string>> partition(string s) {
    vector<vector<string>> result;
    vector<string> path;
    function<bool(int, int)> isPalin = [&](int lo, int hi) -> bool {
        while (lo < hi)  // O(N) check per substring
            if (s[lo++] != s[hi--]) return false;
        return true;
    };
    function<void(int)> backtrack = [&](int start) {
        if (start == (int)s.size()) {
            result.push_back(path);
            return;
        }
        for (int end = start; end < (int)s.size(); end++) {  // O(2^N) branches
            if (isPalin(start, end)) {
                path.push_back(s.substr(start, end - start + 1));
                backtrack(end + 1);
                path.pop_back();
            }
        }
    };
    backtrack(0);
    return result;
}
```

#### Rust

```rust []
pub fn partition_v2(s: String) -> Vec<Vec<String>> {
    let mut res = Vec::new();
    let mut path = Vec::new();
    fn is_palindrome(s: &[u8], mut left: usize, mut right: usize) -> bool {
        while left < right { // O(N) per check
            if s[left] != s[right] { return false; }
            left += 1;
            right -= 1;
        }
        true
    }
    fn backtrack(s: &[u8], start: usize, path: &mut Vec<String>, res: &mut Vec<Vec<String>>) {
        if start == s.len() {
            res.push(path.clone());
            return;
        }
        for end in start..s.len() { // O(2^N) branches
            if is_palindrome(s, start, end) {
                path.push(String::from_utf8_lossy(&s[start..=end]).into_owned());
                backtrack(s, end + 1, path, res);
                path.pop();
            }
        }
    }
    backtrack(s.as_bytes(), 0, &mut path, &mut res);
    res
}
```
