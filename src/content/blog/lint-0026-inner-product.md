---
author: JZ
pubDatetime: 2024-12-06T06:23:00Z
modDatetime: 2024-12-06T06:23:00Z
title: LintCode 26 Inner Product
featured: true
tags:
  - a-dp
description:
  "Solutions for LintCode 26, hard, tags: dynamic programming."
---

## Table of contents

## Description

LintCode question [link](https://www.lintcode.com/problem/26/description)

Given an array `A` with length `N` and an array `B` with length `K`.
You can choose `K` numbers from array `A` with the following rules:

-   Each $A_i$ can only be selected once.
-   If `i==1 or i==N`, $A_i$ can be selected directly.
-   If `2<=i<=N-1`，if $A_{i-1}$ or $A_{i+1}$ has been selected, $A_i$ can be selected.
-   You should select **exactly** `K` numbers.

In other words that you can select one element from the leftmost or rightmost of the `A` array,
the selected element will be removed.
Then use the elements to create an array `C` **in order of your selection**.
You are asked to find the **maximum inner product** of `B` and `C`.

The inner product of `B` and `C` is $$\displaystyle\sum_{i=1}^{K-1} B_i\times C_i$$

Constraints:

- $1\le K \le N \le 2000$
- $1 \le A_i,B_i \le 10^5$

```
Example 1:

Input:

A = [2,3,5,1]
B = [2,1]
Output: 7

Explanation:

K=2
selectA0, C=[2], The reason why A2 can't be taken out directly is that A0, A1 and A3 are not taken out.
selectA1, C=[2,3]
B · C = 2 * 2 + 1 * 3 = 7

Example 2:

Input:

A = [1,4,3,2,5]
B = [1,2,3,4]
Output: 38

Explanation:

K=4
select A0, C=[1]
select A1, C=[1,4]
select A2, C=[1,4,3]
select A4, C=[1,4,3,5]
B · C = 1 * 1 + 2 * 4 + 3 * 3 + 4 * 5 = 38
```

## Idea1

We can use dynamic programming for this question.

We use `dp[i][j]` to represent the max inner product if we selected `i` elements from the left and `j` elements from the right.

$$
dp[i][j] =
\begin{cases}
    max(dp[i-1][j]+A[i-1]\cdot B[i+j-1]) &\text{if selected from left} \\
    max(dp[i][j-1]+A[n-j]\cdot B[i+j+1]) &\text{if selected from right}
\end{cases}
$$

The final result is $max(dp[i][K-i])$ for $0<=i<=K$.

Complexity: Time $O(K^2)$, Space $O(K^2)$.

### Python

```python
class Solution2:
    """dp, 7554 ms, 129.55 mb"""

    def getMaxInnerProduct(self, A, B):
        res, (n, k) = 0, map(len, (A, B))
        dp = [[0] * (k + 1) for _ in range(k + 1)]  # res for picking i from left, j from right
        for i in range(k + 1):
            for j in range(k - i + 1):  # try taking k-i from right
                if i - 1 >= 0:  # take from left
                    dp[i][j] = max(dp[i][j], dp[i - 1][j] + B[i + j - 1] * A[i - 1])
                if j - 1 >= 0:  # take from right
                    dp[i][j] = max(dp[i][j], dp[i][j - 1] + B[i + j - 1] * A[-j])
            res = max(res, dp[i][k - i])
        return res
```

## Idea2

We can improve the space complexity by reducing the `dp` array because in the inner loop, the new status depend on `dp[i-1][j]` and `dp[i][j-1]`.

Complexity: Time $O(K^2)$, Space $O(K)$.

### Python

```python
class Solution:
    """dp, 6583 ms, 5.34 mb"""

    def getMaxInnerProduct(self, A, B):
        n, k = map(len, (A, B))
        dp = [0] * (k + 1)
        for i in range(k + 1):
            ndp = copy(dp)
            for j in range(k - i + 1):  # 只会取 k - i 个数，这样就不用再另外判断会不会越界了
                if i - 1 >= 0:
                    ndp[j] = max(ndp[j], dp[j] + B[i + j - 1] * A[i - 1])
                if j - 1 >= 0:
                    ndp[j] = max(ndp[j], ndp[j - 1] + B[i + j - 1] * A[-j])
            dp = ndp
        return max(dp)
```
