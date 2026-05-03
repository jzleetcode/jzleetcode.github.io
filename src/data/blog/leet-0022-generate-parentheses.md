---
author: JZ
pubDatetime: 2026-05-03T08:00:00Z
modDatetime: 2026-05-03T08:00:00Z
title: LeetCode 22 Generate Parentheses
featured: true
tags:
  - a-string
  - a-dynamic-programming
  - a-backtracking
description:
  "Solutions for LeetCode 22, medium, tags: string, dynamic programming, backtracking."
---

## Table of contents

## Description

Question Links: [LeetCode 22](https://leetcode.com/problems/generate-parentheses/description/)

Given `n` pairs of parentheses, write a function to generate all combinations of well-formed parentheses.

```
Example 1:

Input: n = 3
Output: ["((()))","(()())","(())()","()(())","()()()"]

Example 2:

Input: n = 1
Output: ["()"]

Constraints:

1 <= n <= 8
```

## Solution 1: Backtracking

### Idea

Build valid sequences character by character. At each step, we can add `(` if we haven't used all `n` opening parens, or `)` if the count of `)` is less than the count of `(` (ensuring we never close more than we opened).

The total number of valid sequences is the $n$-th Catalan number $C_n = \frac{1}{n+1}\binom{2n}{n}$, which is $O\!\left(\frac{4^n}{\sqrt{n}}\right)$.

```
n = 3, backtracking tree (pruned):

                            ""
                     left=0,right=0
                           |
                          "("
                     left=1,right=0
                    /              \
                 "(("              "()"
            left=2,right=0    left=1,right=1
              /       \              |
           "((("     "(()"|        "()("
         l=3,r=0   l=2,r=1      l=2,r=1
           |        /    \        /    \
         "((()"|  "(()(" "(())" "()((" "()()"
        l=3,r=1  l=3,r=1 l=2,r=2 l=3,r=1 l=2,r=2
           |       |       |       |       |
        "((())"|"(()()"|"(())("|"()(()"| "()()("|
        l=3,r=2 l=3,r=2 l=2,r=2 l=3,r=2 l=2,r=2
           |       |       |       |       |
        "((()))""(()())""(())()""()(())""()()()"
          ✓        ✓       ✓       ✓       ✓
```

Complexity: Time $O\!\left(\frac{4^n}{\sqrt{n}}\right)$ — we generate all $C_n$ valid sequences, each of length $2n$. Space $O\!\left(\frac{4^n}{\sqrt{n}}\right)$ for storing results plus $O(n)$ recursion stack depth.

#### Java

```java []
// 0ms, 41.8Mb. backtracking. n-th Catalan number 1/(n+1)*(2n choose n) O(4^n/sqrt(n)) time and space.
public List<String> generateParenthesisBT(int n) {
    List<String> ans = new ArrayList();
    backtrack(ans, new StringBuilder(), 0, 0, n);
    return ans;
}

private void backtrack(List<String> res, StringBuilder cur, int left, int right, int n) {
    if (cur.length() == 2 * n) {
        res.add(cur.toString());
        return;
    }
    if (left < n) {
        cur.append('(');
        backtrack(res, cur, left + 1, right, n);
        cur.deleteCharAt(cur.length() - 1);
    }
    if (right < left) {
        cur.append(')');
        backtrack(res, cur, left, right + 1, n);
        cur.deleteCharAt(cur.length() - 1);
    }
}
```

#### Python

```python []
class Solution:
    """backtracking. n-th Catalan number 1/(n+1)*(2n choose n), O(4^n/sqrt(n)) time and space."""

    def generateParenthesis(self, n: int) -> list[str]:
        res: list[str] = []

        def backtrack(cur: list[str], left: int, right: int) -> None:
            if len(cur) == 2 * n:  # O(n) per valid string copy
                res.append(''.join(cur))
                return
            if left < n:  # can still open
                cur.append('(')
                backtrack(cur, left + 1, right)
                cur.pop()
            if right < left:  # can close without mismatch
                cur.append(')')
                backtrack(cur, left, right + 1)
                cur.pop()

        backtrack([], 0, 0)
        return res
```

#### C++

```cpp []
// Backtracking. O(4^n/sqrt(n)) time and space.
class GenParenthesesBT {
public:
    vector<string> generateParenthesis(int n) {
        vector<string> res;
        string cur;
        backtrack(res, cur, 0, 0, n);
        return res;
    }

private:
    void backtrack(vector<string>& res, string& cur, int left, int right, int n) {
        if ((int)cur.size() == 2 * n) {
            res.push_back(cur);
            return;
        }
        if (left < n) {
            cur.push_back('(');
            backtrack(res, cur, left + 1, right, n);
            cur.pop_back();
        }
        if (right < left) {
            cur.push_back(')');
            backtrack(res, cur, left, right + 1, n);
            cur.pop_back();
        }
    }
};
```

#### Rust

```rust []
/// Backtracking approach. O(4^n / sqrt(n)) time and space.
pub fn generate_parenthesis(n: i32) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    Self::backtrack(n as usize, 0, 0, &mut current, &mut result);
    result
}

fn backtrack(
    n: usize, open: usize, close: usize,
    current: &mut String, result: &mut Vec<String>,
) {
    if current.len() == 2 * n {
        result.push(current.clone());
        return;
    }
    if open < n {
        current.push('(');
        Self::backtrack(n, open + 1, close, current, result);
        current.pop();
    }
    if close < open {
        current.push(')');
        Self::backtrack(n, open, close + 1, current, result);
        current.pop();
    }
}
```

## Solution 2: DP Decomposition

### Idea

Any valid sequence of $k$ pairs can be decomposed as `(` + `inside` + `)` + `tail`, where `inside` is a valid sequence of $i$ pairs and `tail` is a valid sequence of $k{-}1{-}i$ pairs, for $i \in [0, k)$.

$$f(k) = \bigcup_{i=0}^{k-1} \left\{ \texttt{"("} + s_1 + \texttt{")"} + s_2 \;\middle|\; s_1 \in f(i),\; s_2 \in f(k{-}1{-}i) \right\}$$

Base case: $f(0) = \{\texttt{""}\}$.

```
n = 3, DP build-up:

f(0) = [""]
f(1) = ["(" + f(0) + ")" + f(0)] = ["()"]
f(2) = ["(" + f(0) + ")" + f(1)] + ["(" + f(1) + ")" + f(0)]
     = ["()()", "(())"]
f(3) = ["(" + f(0) + ")" + f(2)] + ["(" + f(1) + ")" + f(1)] + ["(" + f(2) + ")" + f(0)]
     = ["()()()", "()(())"] + ["(())()"] + ["(()())", "((()))"]
```

Complexity: Time $O\!\left(\frac{4^n}{\sqrt{n}}\right)$ — generates all Catalan($n$) strings across all sub-problems. Space $O\!\left(\frac{4^n}{\sqrt{n}}\right)$ — stores all results for each sub-problem $f(0) \ldots f(n)$.

#### Java

```java []
// f(n) = (f(0))f(n-1) + (f(1))f(n-2) + ... + (f(n-1))f(0), prove by induction
// O(4^n/sqrt(n)) time and space. 9ms, 42.6Mb.
public List<String> generateParenthesis(int n) {
    List<String> res = new ArrayList<>();
    if (n == 0) res.add("");
    else {
        for (int i = 0; i < n; i++)
            for (String left : generateParenthesis(i))
                for (String right : generateParenthesis(n - 1 - i))
                    res.add("(" + left + ")" + right);
    }
    return res;
}
```

#### Python

```python []
class Solution2:
    """DP decomposition. f(n) = (f(i))f(n-1-i) for i in [0,n). O(4^n/sqrt(n)) time and space."""

    def generateParenthesis(self, n: int) -> list[str]:
        dp: list[list[str]] = [[] for _ in range(n + 1)]
        dp[0] = ['']
        for k in range(1, n + 1):  # O(Catalan(n)) total combinations
            for i in range(k):  # split: i pairs inside, k-1-i pairs outside
                for left in dp[i]:
                    for right in dp[k - 1 - i]:
                        dp[k].append(f'({left}){right}')
        return dp[n]
```

#### C++

```cpp []
// DP decomposition f(k) = "(" + f(i) + ")" + f(k-1-i). O(4^n/sqrt(n)) time and space.
class GenParenthesesDP {
public:
    vector<string> generateParenthesis(int n) {
        vector<vector<string>> dp(n + 1);
        dp[0] = {""};
        for (int k = 1; k <= n; k++)
            for (int i = 0; i < k; i++)
                for (const string& inside : dp[i])
                    for (const string& outside : dp[k - 1 - i])
                        dp[k].push_back("(" + inside + ")" + outside);
        return dp[n];
    }
};
```

#### Rust

```rust []
/// DP decomposition: f(k) = "(" + f(i) + ")" + f(k-1-i). O(4^n / sqrt(n)) time and space.
pub fn generate_parenthesis_dp(n: i32) -> Vec<String> {
    let n = n as usize;
    let mut dp: Vec<Vec<String>> = vec![Vec::new(); n + 1];
    dp[0].push(String::new());

    for k in 1..=n {
        let mut results = Vec::new();
        for i in 0..k {
            let left = dp[i].clone();
            let right = dp[k - 1 - i].clone();
            for l in &left {
                for r in &right {
                    results.push(format!("({}){}", l, r));
                }
            }
        }
        dp[k] = results;
    }

    dp[n].clone()
}
```
