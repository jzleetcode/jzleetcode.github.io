---
author: JZ
pubDatetime: 2024-12-09T07:23:00Z
modDatetime: 2024-12-09T07:23:00Z
title: LeetCode 239 Sliding Window Max
featured: true
draft: true
tags:
  - a-sliding-window
description:
  "Solutions for LeetCode 239, hard, tags: array, queue, sliding window, heap, monotonic queue."
---

## Table of contents

## Description

Question links: [Leetcode 1650](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree-iii/description/), [LintCode]()

Given two nodes of a binary tree `p` and `q`, return _their lowest common ancestor (LCA)_.

Each node will have a reference to its parent node. The definition for `Node` is below:

class Node {
public int val;
public Node left;
public Node right;
public Node parent;
}

According to the **[definition of LCA on Wikipedia](https://en.wikipedia.org/wiki/Lowest_common_ancestor)**: "The lowest common ancestor of two nodes p and q in a tree T is the lowest node that has both p and q as descendants (where we allow **a node to be a descendant of itself**)."

```
Example 1:

Input：{4,3,7,#,#,5,6},3,5
Output：4
Explanation：
     4
     / \
    3   7
       / \
      5   6
LCA(3, 5) = 4

Example 2:

Input：{4,3,7,#,#,5,6},5,6
Output：7
Explanation：
      4
     / \
    3   7
       / \
      5   6
LCA(5, 6) = 7
```

**Constraints:**

-   The number of nodes in the tree is in the range `[2, 105]`.
-   `-10^9 <= Node.val <= 10^9`
-   All `Node.val` are **unique**.
-   `p != q`
-   `p` and `q` exist in the tree.

## Idea

We can use the two-pointer method. We advance the two pointers until they meet in the tree.

1. The exit condition

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java
// solution 1, two pointer, O(h) time, O(1) space. h:tree height, worst case O(n). LintCode 2550ms, 21.95Mb.
static class Solution {
    public BTNode lowestCommonAncestor(BTNode p, BTNode q) {
        BTNode a = p, b = q;
        while (a != b) {
            a = a.parent == null ? q : a.parent;
            b = b.parent == null ? p : b.parent;
        }
        return a;
    }
}
```
