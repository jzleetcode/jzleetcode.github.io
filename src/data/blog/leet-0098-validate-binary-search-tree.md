---
author: JZ
pubDatetime: 2026-06-13T06:00:00Z
modDatetime: 2026-06-13T06:00:00Z
title: LeetCode 98 Validate Binary Search Tree
featured: true
tags:
  - a-binary-search-tree
  - a-dfs
description:
  "Solutions for LeetCode 98, medium, tags: tree, depth-first search, binary search tree, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 98](https://leetcode.com/problems/validate-binary-search-tree/description/)

Given the `root` of a binary tree, determine if it is a valid binary search tree (BST).

A **valid BST** is defined as follows:

- The left subtree of a node contains only nodes with keys **strictly less than** the node's key.
- The right subtree of a node contains only nodes with keys **strictly greater than** the node's key.
- Both the left and right subtrees must also be binary search trees.

```
Example 1:

    2
   / \
  1   3

Input: root = [2,1,3]
Output: true

Example 2:

    5
   / \
  1   4
     / \
    3   6

Input: root = [5,1,4,null,null,3,6]
Output: false
Explanation: The root node's value is 5 but its right child's value is 4.

Constraints:

The number of nodes in the tree is in the range [1, 10^4].
-2^31 <= Node.val <= 2^31 - 1
```

## Idea1: Recursive DFS with Bounds

For each node, maintain a valid range `(low, high)`. The root can be anything, so it starts with `(-∞, +∞)`. When going left, the upper bound tightens to the current node's value. When going right, the lower bound tightens.

```
Tree: [5,1,4,null,null,3,6]

         5  range: (-∞, +∞)
        / \
       1   4
           ↑
    range: (5, +∞)  →  4 is NOT in (5, +∞)  →  INVALID

Why just checking the immediate parent is wrong:
         5
        / \
       1   6
          / \
         3   7
         ↑
    3 < 6 (passes parent check)
    but 3 < 5 (fails ancestor bound check!)
    range for this position: (5, 6) → 3 is NOT in (5, 6)
```

We use `long` (or `i64` in Rust) for bounds to avoid overflow when node values are `INT_MIN` or `INT_MAX`.

Complexity: Time $O(n)$ — visit every node once, Space $O(h)$ — recursion stack.

## Idea2: Inorder Traversal

An inorder traversal of a valid BST produces a **strictly increasing** sequence. We traverse with an explicit stack and check that each visited value is greater than the previous.

```
Tree: [2,1,3]

Inorder: 1 -> 2 -> 3  (strictly increasing → valid BST)

Tree: [5,1,4,null,null,3,6]

Inorder: 1 -> 5 -> 3 -> 4 -> 6
                    ↑
            3 < 5 (not increasing → invalid)
```

Complexity: Time $O(n)$ — visit every node once, Space $O(h)$ — stack depth.

### Java

```java []
// lc 98, approach 1: recursive with long bounds. O(n) time, O(h) space.
public static boolean isValidBST(TreeNode root) {
    return validate(root, Long.MIN_VALUE, Long.MAX_VALUE);
}

private static boolean validate(TreeNode node, long min, long max) {
    if (node == null) return true;
    if (node.val <= min || node.val >= max) return false; // long bounds avoid int overflow
    return validate(node.left, min, node.val)
            && validate(node.right, node.val, max);
}
```

```java []
// lc 98, approach 2: iterative inorder. O(n) time, O(h) space.
public static boolean isValidBST2(TreeNode root) {
    ArrayDeque<TreeNode> stack = new ArrayDeque<>();
    TreeNode cur = root;
    long prev = Long.MIN_VALUE;
    while (cur != null || !stack.isEmpty()) { // O(n) total visits
        while (cur != null) {
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();
        if (cur.val <= prev) return false; // must be strictly increasing
        prev = cur.val;
        cur = cur.right;
    }
    return true;
}
```

### Python

```python []
# lc 98, approach 1: recursive with bounds. O(n) time, O(h) space.
def isValidBST(self, root: 'TreeNode') -> bool:
    return self._valid(root, -inf, inf)

def _valid(self, node, lo, hi):
    if not node:
        return True
    if node.val <= lo or node.val >= hi:
        return False
    return self._valid(node.left, lo, node.val) and self._valid(node.right, node.val, hi)
```

```python []
# lc 98, approach 2: iterative inorder. O(n) time, O(h) space.
def isValidBST(self, root: 'TreeNode') -> bool:
    stack, prev = [], -inf
    cur = root
    while cur or stack:
        while cur:  # O(h) go to leftmost
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        if cur.val <= prev:  # must be strictly increasing
            return False
        prev = cur.val
        cur = cur.right
    return True
```

### C++

```cpp []
// lc 98, approach 1: recursive with long bounds. O(n) time, O(h) space.
bool isValidBST(TreeNode* root) {
    return validate(root, LONG_MIN, LONG_MAX);
}

bool validate(TreeNode* node, long low, long high) {
    if (!node) return true;
    if (node->val <= low || node->val >= high) return false;
    return validate(node->left, low, node->val) &&
           validate(node->right, node->val, high);
}
```

```cpp []
// lc 98, approach 2: iterative inorder. O(n) time, O(h) space.
bool isValidBSTInorder(TreeNode* root) {
    std::stack<TreeNode*> stk;
    long prev = LONG_MIN;
    TreeNode* curr = root;
    while (curr || !stk.empty()) {
        while (curr) {
            stk.push(curr);
            curr = curr->left;
        }
        curr = stk.top();
        stk.pop();
        if (curr->val <= prev) return false;
        prev = curr->val;
        curr = curr->right;
    }
    return true;
}
```

### Rust

```rust []
// lc 98, approach 1: recursive with i64 bounds. O(n) time, O(h) space.
pub fn is_valid_bst(root: Option<Rc<RefCell<TreeNode>>>) -> bool {
    Self::validate(&root, i64::MIN, i64::MAX)
}

fn validate(node: &Option<Rc<RefCell<TreeNode>>>, min: i64, max: i64) -> bool {
    match node {
        None => true,
        Some(n) => {
            let n = n.borrow();
            let val = n.val as i64;
            if val <= min || val >= max { return false; }
            Self::validate(&n.left, min, val) && Self::validate(&n.right, val, max)
        }
    }
}
```

```rust []
// lc 98, approach 2: iterative inorder. O(n) time, O(h) space.
pub fn is_valid_bst_inorder(root: Option<Rc<RefCell<TreeNode>>>) -> bool {
    let mut stack: Vec<Rc<RefCell<TreeNode>>> = Vec::new();
    let mut current = root;
    let mut prev = i64::MIN;
    loop {
        while let Some(node) = current {
            stack.push(node.clone());
            current = node.borrow().left.clone();
        }
        if let Some(node) = stack.pop() {
            let val = node.borrow().val as i64;
            if val <= prev { return false; } // must be strictly increasing
            prev = val;
            current = node.borrow().right.clone();
        } else {
            break;
        }
    }
    true
}
```
