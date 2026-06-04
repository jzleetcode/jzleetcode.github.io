---
author: JZ
pubDatetime: 2026-06-04T10:41:00Z
modDatetime: 2026-06-04T10:41:00Z
title: LeetCode 114 Flatten Binary Tree to Linked List
featured: true
tags:
  - a-tree
  - a-dfs
  - a-linked-list
description:
  "Solutions for LeetCode 114, medium, tags: tree, depth-first search, linked list, stack, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 114](https://leetcode.com/problems/flatten-binary-tree-to-linked-list/description/)

Given the `root` of a binary tree, flatten the tree into a "linked list":

- The "linked list" should use the same `TreeNode` class where the `right` child pointer points to the next node in the list and the `left` child pointer is always `null`.
- The "linked list" should be in the same order as a pre-order traversal of the binary tree.

```
Example 1:

Input: root = [1,2,5,3,4,null,6]
Output: [1,null,2,null,3,null,4,null,5,null,6]

        1               1
       / \               \
      2   5       ->      2
     / \   \               \
    3   4   6               3
                             \
                              4
                               \
                                5
                                 \
                                  6

Example 2:

Input: root = []
Output: []

Example 3:

Input: root = [0]
Output: [0]

Constraints:

The number of nodes in the tree is in the range [0, 2000].
-100 <= Node.val <= 100
```

Follow up: Can you flatten the tree in-place (with O(1) extra space)?

## Solution 1: Iterative (Morris-style)

### Idea

For each node, if it has a left child, find the rightmost node of the left subtree. Then:
1. Attach the current node's right subtree to that rightmost node's right pointer.
2. Move the left subtree to the right.
3. Set left to null.
4. Advance to the next right node.

Each node is visited at most twice (once as `cur`, once during the "find rightmost" walk), so total work is O(n).

```
Step-by-step for [1,2,5,3,4,null,6]:

cur=1: left subtree exists, rightmost of left = 4
       attach 5->6 to 4's right, move 2 to 1's right
       Tree: 1 -> 2 -> 3
                   \
                    4 -> 5 -> 6

cur=2: left subtree exists, rightmost of left = 3
       attach 4->5->6 to 3's right, move 3 to 2's right
       Tree: 1 -> 2 -> 3 -> 4 -> 5 -> 6

cur=3,4,5,6: no left child, just advance right
```

Complexity: Time $O(n)$ — each node visited at most twice. Space $O(1)$ — no extra data structures.

#### Java

```java []
public static void flattenIterative(TreeNode root) {
    TreeNode cur = root;
    while (cur != null) {
        if (cur.left != null) {
            TreeNode rightmost = cur.left;
            while (rightmost.right != null) { // find rightmost of left subtree
                rightmost = rightmost.right;
            }
            rightmost.right = cur.right;
            cur.right = cur.left;
            cur.left = null;
        }
        cur = cur.right;
    }
}
```

#### Python

```python []
class Solution:
    def flatten(self, root: Optional[TreeNode]) -> None:
        cur = root
        while cur:  # O(n) — each node visited at most twice
            if cur.left:
                rightmost = cur.left
                while rightmost.right:  # find rightmost of left subtree
                    rightmost = rightmost.right
                rightmost.right = cur.right
                cur.right = cur.left
                cur.left = None
            cur = cur.right
```

#### C++

```cpp []
void flatten(TreeNode *root) {
    TreeNode *cur = root;
    while (cur) {
        if (cur->left) {
            TreeNode *rightmost = cur->left;
            while (rightmost->right) { // find rightmost of left subtree
                rightmost = rightmost->right;
            }
            rightmost->right = cur->right;
            cur->right = cur->left;
            cur->left = nullptr;
        }
        cur = cur->right;
    }
}
```

#### Rust

```rust []
pub fn flatten(root: &mut Option<Rc<RefCell<TreeNode>>>) {
    let mut cur = root.clone();
    while let Some(node) = cur {
        let left = node.borrow().left.clone();
        if let Some(left_node) = left {
            let mut rightmost = left_node.clone();
            loop {
                let next = rightmost.borrow().right.clone();
                match next {
                    Some(n) => rightmost = n,
                    None => break,
                }
            }
            let right = node.borrow().right.clone();
            rightmost.borrow_mut().right = right;
            node.borrow_mut().right = Some(left_node);
            node.borrow_mut().left = None;
        }
        cur = node.borrow().right.clone();
    }
}
```

## Solution 2: Recursive Reverse Postorder

### Idea

Process the tree in reverse pre-order: right subtree first, then left, then current node. Maintain a `prev` pointer that tracks the previously processed node. For each node, set its `right` to `prev` and `left` to null, then update `prev` to the current node.

This effectively builds the flattened list from the tail back to the head.

```
Processing order for [1,2,5,3,4,null,6]: 6, 5, 4, 3, 2, 1

prev=null, process 6: 6.right=null, prev=6
prev=6,    process 5: 5.right=6, prev=5
prev=5,    process 4: 4.right=5, prev=4
prev=4,    process 3: 3.right=4, prev=3
prev=3,    process 2: 2.right=3, prev=2
prev=2,    process 1: 1.right=2, prev=1

Result: 1->2->3->4->5->6
```

Complexity: Time $O(n)$ — visit each node once. Space $O(h)$ — recursion stack depth where h is tree height, worst case O(n) for skewed tree.

#### Java

```java []
public static void flattenRecursive(TreeNode root) {
    flatten(root, new TreeNode[]{null});
}

private static void flatten(TreeNode node, TreeNode[] prev) {
    if (node == null) return;
    flatten(node.right, prev);  // process right first
    flatten(node.left, prev);   // then left
    node.right = prev[0];       // link to previously processed
    node.left = null;
    prev[0] = node;
}
```

#### Python

```python []
class Solution2:
    def flatten(self, root: Optional[TreeNode]) -> None:
        self.prev = None
        self._flatten(root)

    def _flatten(self, node: Optional[TreeNode]) -> None:
        if not node:
            return
        self._flatten(node.right)   # process right first
        self._flatten(node.left)    # then left
        node.right = self.prev      # link to previously processed
        node.left = None
        self.prev = node
```

#### C++

```cpp []
class Solution2 {
public:
    void flatten(TreeNode *root) {
        prev = nullptr;
        helper(root);
    }
private:
    TreeNode *prev = nullptr;
    void helper(TreeNode *node) {
        if (!node) return;
        helper(node->right);    // process right first
        helper(node->left);     // then left
        node->right = prev;     // link to previously processed
        node->left = nullptr;
        prev = node;
    }
};
```
