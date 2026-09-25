---
author: JZ
pubDatetime: 2026-09-25T10:08:00Z
modDatetime: 2026-09-25T10:08:00Z
title: LeetCode 241 Different Ways to Add Parentheses
featured: true
tags:
  - a-dynamic-programming
  - a-recursion
description:
  "Solutions for LeetCode 241, medium, tags: math, dynamic programming, string, recursion, memoization."
---

## Table of contents

## Description

Question Links: [LeetCode 241](https://leetcode.com/problems/different-ways-to-add-parentheses/description/)

Given a string `expression` of numbers and operators, return all possible results from computing all the different possible ways to group numbers and operators. You may return the answer in **any order**.

The test cases are generated such that the output values fit in a 32-bit integer and the number of different results does not exceed $10^4$.

```
Example 1:

Input: expression = "2-1-1"
Output: [0,2]
Explanation:
((2-1)-1) = 0
(2-(1-1)) = 2

Example 2:

Input: expression = "2*3-4*5"
Output: [-34,-14,-10,-10,10]
Explanation:
(2*(3-(4*5))) = -34
((2*3)-(4*5)) = -14
((2*(3-4))*5) = -10
(2*((3-4)*5)) = -10
(((2*3)-4)*5) = 10

Constraints:

1 <= expression.length <= 20
expression consists of digits and the operator '+', '-', and '*'.
All the integer values in the input expression are in the range [0, 99].
The integer values in the input expression do not have a leading '-' or '+' denoting the sign.
```

## Solution 1: Tabulation DP (Bottom-Up)

### Idea

Every way to parenthesize an expression corresponds to choosing one operator as the "last" operation. For the expression `2*3-4*5`, if we pick `-` as the root operator, the left subexpression `2*3` evaluates to `6` and the right `4*5` evaluates to `20`, giving `6-20 = -14`.

We build a 2D table `dp[i][j]` storing **all** possible results for the substring `expression[i..=j]`:

1. **Base cases**: single digits → `dp[i][i]`; two-digit numbers (e.g., `10`) → `dp[i][i+1]`.
2. **Fill by length**: for each substring length 3 to `n`, try every operator position as the split point. Combine every left result with every right result using that operator.

```
expression = "2*3-4*5"
indices:      0123456

Split at '*' (index 1):  left dp[0][0]={2}, right dp[2][6]
Split at '-' (index 3):  left dp[0][2]={6}, right dp[4][6]={20}  → 6-20 = -14
Split at '*' (index 5):  left dp[0][4],     right dp[6][6]={5}

Recursion tree (conceptual):
              "2*3-4*5"
             /    |    \
      "2"*"3-4*5" | "2*3-4"*"5"
                   |
            "2*3"-"4*5"
            /         \
         {6}         {20}
          → 6-20 = -14
```

The number of ways to parenthesize $n$ operators follows the **Catalan number** $C_n = \frac{1}{n+1}\binom{2n}{n} \sim \frac{4^n}{n^{1.5}\sqrt{\pi}}$.

Complexity: Time $O(n \cdot 2^n)$, Space $O(2^n)$, where $n$ is the number of operators.

#### Java

```java []
// O(n * 2^n) time, O(2^n) space. 1ms, 42.10mb.
String e;
List<Integer>[][] dp;

public List<Integer> diffWaysToCompute(String expression) {
    this.e = expression;
    int n = e.length();
    dp = new ArrayList[n][n]; // dp[i][j]: possible res for expression [i,j] inclusive
    init();
    for (int len = 3; len <= n; len++) // Fill the dp table for all possible subexpressions
        for (int start = 0, end = start + len - 1; end < n; start++, end++)
            process(start, end);
    return dp[0][n - 1];
}

// base cases: single digits and two-digit numbers
private void init() {
    int n = e.length();
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            dp[i][j] = new ArrayList<>();
    for (int i = 0; i < n; i++) {
        if (Character.isDigit(e.charAt(i))) {
            int dig1 = e.charAt(i) - '0';
            if (i + 1 < n && Character.isDigit(e.charAt(i + 1))) {
                int dig2 = e.charAt(i + 1) - '0';
                int number = dig1 * 10 + dig2;
                dp[i][i + 1].add(number);
            } else dp[i][i].add(dig1);
        }
    }
}

// try all possible positions to split the e, process sub-expressions
private void process(int start, int end) {
    for (int split = start; split <= end; split++) {
        if (Character.isDigit(e.charAt(split))) continue; // only process when split is an op
        List<Integer> leftRes = dp[start][split - 1];
        List<Integer> rightRes = dp[split + 1][end];
        compute(e.charAt(split), leftRes, rightRes, dp[start][end]);
    }
}

private void compute(char op, List<Integer> leftRes, List<Integer> rightRes, List<Integer> res) {
    for (int lv : leftRes)
        for (int rv : rightRes) // O(|left| * |right|) per split
            switch (op) {
                case '+' -> res.add(lv + rv);
                case '-' -> res.add(lv - rv);
                case '*' -> res.add(lv * rv);
            }
}
```

#### Python

```python []
# O(n * 2^n) time, O(2^n) space. 38ms, 16.79mb.
def diffWaysToCompute(self, expression: str) -> List[int]:
    e = expression
    n = len(e)
    dp = [[[] for _ in range(n)] for _ in range(n)]
    for i, char in enumerate(e):
        if char.isdigit():
            dig1 = ord(char) - ord("0")
            if i + 1 < n and e[i + 1].isdigit():
                dp[i][i + 1].append(dig1 * 10 + (ord(e[i + 1]) - ord("0")))
            dp[i][i].append(dig1)
    for length in range(3, n + 1):  # O(n) lengths
        for start in range(n - length + 1):
            end = start + length - 1
            for split in range(start, end + 1):
                if e[split].isdigit(): continue
                for lv in dp[start][split - 1]:       # O(|left|)
                    for rv in dp[split + 1][end]:      # O(|right|)
                        if e[split] == "+": dp[start][end].append(lv + rv)
                        elif e[split] == "-": dp[start][end].append(lv - rv)
                        elif e[split] == "*": dp[start][end].append(lv * rv)
    return dp[0][n - 1]
```

#### C++

```cpp []
// O(n * 2^n) time, O(2^n) space.
string e;
vector<vector<vector<int>>> memo;

vector<int> diffWaysToCompute(string expression) {
    e = expression;
    const size_t n = e.length();
    memo.resize(n);
    for (size_t i = 0; i < n; i++) memo[i].resize(n);
    for (size_t i = 0; i < n; i++) {
        if (isdigit(e[i])) {
            int d1 = e[i] - '0';
            if (i + 1 < e.length() && isdigit(e[i + 1]))
                memo[i][i + 1].push_back(d1 * 10 + (e[i + 1] - '0'));
            memo[i][i].push_back(d1);
        }
    }
    for (auto len = 3; len <= n; len++)
        for (auto start = 0, end = start + len - 1; end < n; start++, end++)
            processSubexpression(start, end);
    return memo[0][n - 1];
}

void processSubexpression(size_t start, size_t end) {
    for (size_t split = start; split <= end; split++) {
        if (isdigit(e[split])) continue;
        vector<int> left = memo[start][split - 1];  // O(|left|) copy
        vector<int> right = memo[split + 1][end];    // O(|right|) copy
        computeResult(e[split], left, right, memo[start][end]);
    }
}

void computeResult(char op, vector<int> &left, vector<int> &right, vector<int> &res) {
    for (int lv : left)
        for (int rv : right)                         // O(|left| * |right|)
            if (op == '+') res.push_back(lv + rv);
            else if (op == '-') res.push_back(lv - rv);
            else if (op == '*') res.push_back(lv * rv);
}
```

#### Rust

```rust []
/// O(n * 2^n) time, O(2^n) space where n = number of operators (Catalan growth).
pub fn diff_ways_to_compute(expression: String) -> Vec<i32> {
    let tokens = parse(&expression);
    let mut nums: Vec<i32> = Vec::new();
    let mut ops: Vec<u8> = Vec::new();
    for t in &tokens {
        match t {
            Token::Num(n) => nums.push(*n),
            Token::Op(o) => ops.push(*o),
        }
    }
    let n = nums.len();
    if n == 0 { return vec![]; }
    let mut dp: Vec<Vec<Vec<i32>>> = vec![vec![vec![]; n]; n];
    for i in 0..n { dp[i][i] = vec![nums[i]]; }           // base: single numbers
    for len in 2..=n {                                      // fill by increasing length
        for i in 0..=n - len {
            let j = i + len - 1;
            let mut results = Vec::new();
            for k in i..j {                                 // split at operator k
                let left = dp[i][k].clone();                // O(|left|)
                let right = dp[k + 1][j].clone();           // O(|right|)
                for &l in &left {
                    for &r in &right { results.push(apply(ops[k], l, r)); }
                }
            }
            dp[i][j] = results;
        }
    }
    dp[0][n - 1].clone()
}
```

## Solution 2: Memoization (Top-Down Divide & Conquer)

### Idea

Instead of building bottom-up, we can think recursively: to evaluate `expression[start..=end]`, try every operator as the "root" split, recursively solve left and right halves, and combine. A memo cache avoids recomputing overlapping subproblems.

This is the same recurrence as Solution 1, just traversed top-down. The complexity is identical: Time $O(n \cdot 2^n)$, Space $O(2^n)$ plus recursion stack.

#### Java

```java []
// O(n * 2^n) time, O(2^n) space + recursion stack. 1ms, 41.80mb.
String e;
List<Integer>[][] memo;

public List<Integer> diffWaysToCompute(String expression) {
    this.e = expression;
    memo = new ArrayList[expression.length()][expression.length()];
    return compute(0, expression.length() - 1);
}

private List<Integer> compute(int start, int end) {
    if (memo[start][end] != null) return memo[start][end];
    List<Integer> res = new ArrayList<>();
    if (start == end) { res.add(e.charAt(start) - '0'); return res; }
    if (end - start == 1 && Character.isDigit(e.charAt(start))) {
        res.add(10 * (e.charAt(start) - '0') + (e.charAt(end) - '0'));
        return res;
    }
    for (int i = start; i <= end; i++) {
        char c = e.charAt(i);
        if (Character.isDigit(c)) continue;
        List<Integer> leftRes = compute(start, i - 1);   // recurse left
        List<Integer> rightRes = compute(i + 1, end);     // recurse right
        for (int lv : leftRes)
            for (int rv : rightRes)                       // O(|left| * |right|)
                switch (c) {
                    case '+' -> res.add(lv + rv);
                    case '-' -> res.add(lv - rv);
                    case '*' -> res.add(lv * rv);
                }
    }
    memo[start][end] = res;
    return res;
}
```

#### Python

```python []
# O(n * 2^n) time, O(2^n) space + recursion stack. 42ms, 16.89mb.
def diffWaysToCompute(self, expression: str) -> List[int]:
    e = expression

    @cache
    def compute(start: int, end: int) -> List[int]:
        res = []
        if start == end: return [int(e[start])]
        if end - start == 1 and e[start].isdigit():
            return [int(e[start:end + 1])]
        for i in range(start, end + 1):
            if e[i].isdigit(): continue
            l_res = compute(start, i - 1)                # recurse left
            r_res = compute(i + 1, end)                   # recurse right
            for lv in l_res:
                for rv in r_res:                          # O(|left| * |right|)
                    if e[i] == "+": res.append(lv + rv)
                    elif e[i] == "-": res.append(lv - rv)
                    elif e[i] == "*": res.append(lv * rv)
        return res

    return compute(0, len(expression) - 1)
```

#### C++ — same as Solution 1

The C++ implementation above uses bottom-up tabulation. A top-down memoization variant would replace the length loop with a recursive function and a memo check — the logic mirrors the Java/Python memoization approach.

#### Rust

```rust []
/// O(n * 2^n) time, O(2^n) space + recursion stack.
pub fn diff_ways_to_compute_memo(expression: String) -> Vec<i32> {
    use std::collections::HashMap;
    let tokens = parse(&expression);
    let mut nums: Vec<i32> = Vec::new();
    let mut ops: Vec<u8> = Vec::new();
    for t in &tokens {
        match t { Token::Num(n) => nums.push(*n), Token::Op(o) => ops.push(*o) }
    }
    let n = nums.len();
    if n == 0 { return vec![]; }
    let mut memo: HashMap<(usize, usize), Vec<i32>> = HashMap::new();

    fn solve(i: usize, j: usize, nums: &[i32], ops: &[u8],
             memo: &mut HashMap<(usize, usize), Vec<i32>>) -> Vec<i32> {
        if let Some(cached) = memo.get(&(i, j)) { return cached.clone(); }
        if i == j {
            let res = vec![nums[i]];
            memo.insert((i, j), res.clone());
            return res;
        }
        let mut results = Vec::new();
        for k in i..j {                                     // split at operator k
            let left = solve(i, k, nums, ops, memo);        // recurse left
            let right = solve(k + 1, j, nums, ops, memo);   // recurse right
            for &l in &left {
                for &r in &right { results.push(apply(ops[k], l, r)); }
            }
        }
        memo.insert((i, j), results.clone());
        results
    }

    solve(0, n - 1, &nums, &ops, &mut memo)
}
```
