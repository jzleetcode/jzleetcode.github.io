---
author: JZ
pubDatetime: 2024-12-15T06:23:00Z
modDatetime: 2024-12-15T06:23:00Z
title: Analyze Recursive Algorithm Time Complexity for LeetCode Questions with Substitution, Recursion Tree and Master Theorem
featured: true
tags:
  - a-algorithm-analysis
description:
  "Analyze Recursive Algorithm Time Complexity for LeetCode Questions with Substitution, Recursion Tree and Master Theorem"
---

## Table of contents

## Context

The time complexity of a recursive algorithm may not be straight-forward to calculate. It could be analyzed with the substitution method, the recursion tree method, and the master theorem.

## Recursion Tree

A recursion tree is a tree where each node represents the cost of a certain recursive subproblem. Then you can sum up the numbers in each node to get the total cost.

For example, you can check the time complexity analysis in the following two posts.

1. [leetcode 339 nested list weight sum](../leet-0039-lint-0551-nested-list-weight-sum/)
2. [leetcode 91 ascii encoded strings](../leet-0091-hackerrank-ascii-encoded-strings/)

## Master Theorem

The master theorem is a formula for solving recurrences of the form T(n) = aT(n/b) +f(n),
where a ≥ 1 and b > 1 and f(n) is asymptotically positive. (Asymptotically positive means
that the function is positive for all sufficiently large n.)

let $c_{crit} = \log _b a = \log \text{(\#subproblems)} / \log \text{(subproblem size)}$

1. Work is dominated by subproblem (a>b^k). $T(n)=\Theta (n^{\log_b{a}})$
2. Work to split/recombine is comparable to subproblem (a=b^k). $T(n)=\Theta(n^{\log _b a} \log ^k n)$
3. Work to split/recombine dominates (a<b^k). $T(n)=\Theta (f(n))$

## References

1. Standford CS161 lecture 3 [PDF](https://web.stanford.edu/class/archive/cs/cs161/cs161.1168/lecture3.pdf)
2. Sedgewick, Analysis of Algorithms, [recurrence relations](https://aofa.cs.princeton.edu/20recurrence/)
3. Cornell CS3110 [lecture 20](https://www.cs.cornell.edu/courses/cs3110/2012sp/lectures/lec20-master/lec20.html)
4. Wikipedia [master theorem](https://en.wikipedia.org/wiki/Master_theorem_(analysis_of_algorithms))
5. GeekForGeeks [master theorem](https://www.geeksforgeeks.org/advanced-master-theorem-for-divide-and-conquer-recurrences/)
6. Programiz [master theorem](https://www.programiz.com/dsa/master-theorem)
