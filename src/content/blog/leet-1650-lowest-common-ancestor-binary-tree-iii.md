---
author: JZ
pubDatetime: 2024-12-09T07:23:00Z
modDatetime: 2024-12-09T07:23:00Z
title: LeetCode 1650 LintCode 474 Lowest Common Ancestor of a Binary Tree III
featured: true
tags:
  - a-binary-tree
  - a-tree
  - a-hash
  - a-two-pointers
  - c-microsoft
  - leetcode-locked
description:
  "Solutions for LeetCode 1650 LintCode 474, medium, tags: binary tree, hash table, two pointers; companies: microsoft."
---

## Table of contents

## Description

Question links: [Leetcode 1650](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree-iii/description/), [LintCode 474](https://www.lintcode.com/problem/474/)

Given two nodes of a binary tree `p` and `q`, return _their lowest common ancestor (LCA)_.

Each node will have a reference to its parent node. The definition for `Node` is below:

```java
class Node {
    public int val;
    public Node left;
    public Node right;
    public Node parent;
}

```

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

Example 3:

Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1
Output: 3
Explanation: The LCA of nodes 5 and 1 is 3.

Example 4:

Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 4
Output: 5
Explanation: The LCA of nodes 5 and 4 is 5 since a node can be a descendant of itself according to the LCA definition.

Example 5:

Input: root = [1,2], p = 1, q = 2
Output: 1
```

**Constraints:**

-   The number of nodes in the tree is in the range `[2, 10^5]`.
-   `-10^9 <= Node.val <= 10^9`
-   All `Node.val` are **unique**.
-   `p != q`
-   `p` and `q` exist in the tree.

## Idea

We can use the two-pointer method. We advance the two pointers until they meet in the tree.

1. The exit condition is when the two pointers point to the lowest common ancestor, i.e., `a == b`
2. What to do when one of the pointers could not go up anymore? We switch the pointer to point to the other node. This way both pointers will travel the path for each and meet at the lowest common ancestor. For example, for example 1 above, pointer 1 will point to 3,4,5,7,4 and pointer 2 will point to 5,7,4,3,4. Finally, they meet at LCA (4).

Complexity: Time $O(n)$, Space $O(1)$.

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
