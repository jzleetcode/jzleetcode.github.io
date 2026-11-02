---
author: JZ
pubDatetime: 2026-11-02T19:35:00Z
modDatetime: 2026-11-02T19:35:00Z
title: LeetCode 94 Binary Tree Inorder Traversal
featured: true
tags:
  - a-tree
  - a-depth-first-search
  - a-stack
description: "Solutions for LeetCode 94, easy, tags: tree, depth-first search, stack, binary tree."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 94: Binary Tree Inorder Traversal](https://leetcode.com/problems/binary-tree-inorder-traversal/description/)

Given the `root` of a binary tree, return the inorder traversal of its nodes' values: visit the left subtree, then the node, then the right subtree.

```text
Input:  root = [1,null,2,3]
Output: [1,3,2]

    1
     \
      2
     /
    3
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 100]`.
- `-100 <= Node.val <= 100`

## Idea

The direct recursive definition is `inorder(left)`, visit `node`, then `inorder(right)`. The primary implementation makes that call stack explicit, which avoids recursion-depth limits and makes the visit order visible.

Keep moving `current` left and push every node passed on a stack. When no left child remains, the stack top is the next node whose left subtree has already been handled. Pop and record it, then continue from its right child.

```text
Tree:       4                 stack             output
           / \
          2   6          push 4, 2, 1          []
         / \ / \
        1  3 5  7        pop 1                 [1]
                          pop 2; push 3         [1,2,3]
                          pop 4; push 6, 5      [1,2,3,4,5]
                          pop 6; push 7         [1,2,3,4,5,6,7]
```

The Python implementation also includes the popular recursive DFS alternative. It has the same visit order and asymptotic bounds; the explicit-stack version is used in every language below because it directly controls the traversal state.

## Complexity

Let `n` be the number of nodes and `h` the tree height. Each node is pushed, popped, and appended once, so the traversal is **$O(n)$ time**. The explicit stack holds at most one root-to-leaf path, so auxiliary space is **$O(h)$** (worst case $O(n)$ for a skewed tree).

### Java

```java []
public static List<Integer> inorderTraversal(TreeNode root) {
    List<Integer> values = new ArrayList<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    TreeNode current = root;

    // Every node is pushed and popped once: O(n) time, O(h) space.
    while (current != null || !stack.isEmpty()) {
        while (current != null) {
            stack.push(current);
            current = current.left;
        }
        current = stack.pop();
        values.add(current.val);
        current = current.right;
    }
    return values;
}
```

### Python

```python []
class Solution:
    """Iterative DFS using an explicit stack."""

    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        result = []
        stack = []
        current = root

        # Each node is pushed and popped once: O(n) time, O(h) stack space.
        while current or stack:
            while current:
                stack.append(current)
                current = current.left
            current = stack.pop()
            result.append(current.val)
            current = current.right
        return result
```

```python []
class Solution2:
    """Recursive depth-first traversal."""

    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        result = []

        def traverse(node: Optional[TreeNode]) -> None:
            if not node:
                return
            traverse(node.left)
            result.append(node.val)
            traverse(node.right)

        traverse(root)  # O(n) time and O(h) call-stack space.
        return result
```

### C++

```cpp []
vector<int> inorderTraversal(TreeNode *root) {
    vector<int> traversal;
    stack<TreeNode *> pending;
    TreeNode *current = root;

    // Each node is pushed, popped, and visited once: O(n) time.
    // The explicit stack holds at most the tree height: O(h) space.
    while (current != nullptr || !pending.empty()) {
        while (current != nullptr) {
            pending.push(current);
            current = current->left;
        }
        current = pending.top();
        pending.pop();
        traversal.push_back(current->val);
        current = current->right;
    }
    return traversal;
}
```

### Rust

```rust []
pub fn inorder_traversal(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<i32> {
    let mut result = Vec::new();
    let mut stack = Vec::new();
    let mut current = root;

    // Each node is visited once: O(n) time and O(h) explicit-stack space.
    while current.is_some() || !stack.is_empty() {
        while let Some(node) = current {
            current = node.borrow().left.clone();
            stack.push(node);
        }
        let node = stack.pop().expect("stack contains the next inorder node");
        result.push(node.borrow().val);
        current = node.borrow().right.clone();
    }
    result
}
```
