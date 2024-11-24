---
author: JZ
pubDatetime: 2024-11-22T06:23:00Z
modDatetime: 2024-11-22T07:24:00Z
title: LeetCode 465 Optimal Account Balancing
featured: true
tags:
  - a-bit
  - a-array
  - a-dp
  - a-backtracking
  - leetcode-locked
  - c-google
  - c-pinterest
description:
  "Solutions for LeetCode 465 LintCode 707, hard, tags: bit, array, dynamic programming, backtracking, bitmask."
---

## Table of contents

## Description

You are given an array of transactions `transactions` where `transactions[i] = [from_i, to_i, amount_i]` indicates that the person with `ID = from_i` gave `amount_i $` to the person with `ID = to_i`.

Return _the minimum number of transactions required to settle the debt_.

```
Example 1:

Input: transactions = [[0,1,10],[2,0,5]]
Output: 2
Explanation:
Person #0 gave person #1 $10.
Person #2 gave person #0 $5.
Two transactions are needed. One way to settle the debt is person #1 pays person #0 and #2 $5 each.

Example 2:

Input: transactions = [[0,1,10],[1,0,1],[1,2,5],[2,0,5]]
Output: 1
Explanation:
Person #0 gave person #1 $10.
Person #1 gave person #0 $1.
Person #1 gave person #2 $5.
Person #2 gave person #0 $5.
Therefore, person #1 only need to give person #0 $4, and all debt is settled.
```

**Constraints:**

-   `1 <= transactions.length <= 8`
-   `transactions[i].length == 3`
-   `0 <= from_i, to_i < 12`
-   `from_i != to_i`
-   `1 <= amount_i <= 100`

## Solution

### Idea1

We could solve this question with the subset sum method.

1. We calculate the total net balances for each person and collect those with non-zero balances. Assume this include persons `0, 1, 2`.
2. We use an array `f[i]` to represent the minimum number of edges (transactions) needed for people in subset `i`, where person `j` is in subset `i` if `1<<j & i != 0`. Foe example, `f[3]` represents subset `3` (`11b` in binary format) includes person `0` and `1` because `3 == 1<<0 + 1<<1`.
3. `let n == number of non-zero balances`. We use dynamic programming to minimize the transactions needed, i.e., the `f[]` array. We iterate `i` in `[1,1<<n)` (non-empty subsets: `i!=0`) for all the possible subsets of people. In the inner loop, we check if person `j` is in the current subset `i` and calculate the total balance for subset `i`. If the total is `0`, we can minimize `f[i]` by separating subset `i` into two groups (`j` and `i^j`).
4. Finally we return the minimized `f[1<<n-1]` or `f[-1]` which is the subset including all the people with non-zero balances. `11...1` with `1` repeating `n` times.

Complexity: Time O(n*2^n), Space O(2^n).

#### Java

Stay tuned.

#### Python

```python
class Solution1:
    def balance_graph(self, edges: List[List[int]]) -> int:
        """
        @param edges: a directed graph where each edge is represented by a tuple
        @return: the number of edges
        """
        bal = defaultdict(int)
        for f, t, amount in edges:
            bal[f] -= amount
            bal[t] += amount
        non_zero = [b for b in bal.values() if b]
        n = len(non_zero)
        f = [sys.maxsize] * (1 << n)  # python2 sys.maxint, python3 sys.maxsize, inf, or 1<<29
        f[0] = 0
        for i in range(1, 1 << n):
            total = 0  # total balances in this subset
            for j, x in enumerate(non_zero):
                if i >> j & 1:
                    total += x  # bit_cnt += 1 for py < 3.10
            if total == 0:
                f[i] = i.bit_count() - 1  # bit_count() needs python 3.10
                j = (i - 1) & i
                while j > 0:
                    f[i] = min(f[i], f[j] + f[j ^ i])
                    j = (j - 1) & i
        return f[-1]  # f[(1<<n)-1]
```

### Idea2

Similar to Idea1 above, we can collect people with non-zero balances and try to settle the transactions among them.
In this method, we can use backtracking for settling the transactions. The method can pass on LeetCode but not on LintCode because of the factorial time complexity.

1. Optionally, we can sort the non-zero balances descending to optimize the run time. Note this does not change the overall time complexity.
2. We recursively try to minimize the transactions starting from person 0.
3. In the dfs method, we iterate through the indexes `i` after the starting index and try to settle the balance if `non_zero[i]` and `non_zero[start]` are of opposite signs. We use one transaction to add `non_zero[i]` to `non_zero[start]` and recursively dfs `start+1` and take the minimum. After the recursive dfs, we backtrack to set `non_zero[i]` to the original value.
4. If the settled balance is 0, we can reduce the number of transactions so we can break out of the for loop.

Complexity: Time O(n!), Space O(n).

#### Java

Stay tuned.

#### Python

```python
class Solution2:
    def minTransfers(self, edges: List[List[int]]) -> int:
        bal = defaultdict(int)
        for u, v, w in edges:
            bal[u] -= w
            bal[v] += w
        non_zero = [b for b in bal.values() if b != 0]
        non_zero.sort(reverse=True)
        # Use DFS with backtracking to minimize transactions
        def dfs(start: int) -> int:
            while start < len(non_zero) and non_zero[start] == 0:
                start += 1
            # Base case: All balances settled
            if start == len(non_zero):
                return 0
            res = float('inf')
            # Try to settle balances[start] with subsequent balances
            for i in range(start + 1, len(non_zero)):
                if non_zero[i] * non_zero[start] < 0:  # Opposite signs only
                    # Settle balances[start] with balances[i]
                    non_zero[i] += non_zero[start]
                    # Recur to settle the next balance and count this transaction
                    res = min(res, 1 + dfs(start + 1))
                    # Backtrack to previous state
                    non_zero[i] -= non_zero[start]
                    # Optimization: Stop if an exact zero balance is found
                    if non_zero[i] + non_zero[start] == 0:
                        break
            return res

        return dfs(0)
```
