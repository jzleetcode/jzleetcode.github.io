---
author: JZ
pubDatetime: 2026-07-20T06:00:00Z
modDatetime: 2026-07-20T06:00:00Z
title: LeetCode 543 Diameter of Binary Tree
featured: true
tags:
  - a-dfs
  - a-tree
  - a-binary-tree
description:
  "Solutions for LeetCode 543, easy, tags: tree, depth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 543](https://leetcode.com/problems/diameter-of-binary-tree/description/)

Given the `root` of a binary tree, return _the length of the **diameter** of the tree_.

The **diameter** of a binary tree is the **length** of the longest path between any two nodes in a tree. This path may or may not pass through the `root`.

The length of a path between two nodes is represented by the number of edges between them.

```
Example 1:

        1
       / \
      2   3
     / \
    4   5

Input: root = [1,2,3,4,5]
Output: 3
Explanation: 3 is the length of the path [4,2,1,3] or [5,2,1,3].

Example 2:

Input: root = [1,2]
Output: 1
```

**Constraints:**

- The number of nodes in the tree is in the range `[1, 10^4]`.
- `-100 <= Node.val <= 100`

## Idea

Use **DFS post-order** traversal. The key insight: at every node, the longest path _through_ that node equals `left_depth + right_depth`. We track the global maximum of this value across all nodes.

The helper function returns the **depth** (number of edges from node to its deepest leaf) to the parent so each level can compute its own candidate diameter.

```
        1             depth(1) returns 2
       / \            diameter at node 1 = 2 + 1 = 3  <-- global max
      2   3           depth(2) returns 1, depth(3) returns 0
     / \              diameter at node 2 = 1 + 1 = 2
    4   5             depth(4) = depth(5) = 0
```

The diameter may not pass through the root. Consider:

```
        1             depth(1) returns 3
       /              diameter at node 1 = 3 + 0 = 3
      2               depth(2) returns 2
     / \              diameter at node 2 = 2 + 2 = 4  <-- global max!
    3   4
   /     \
  5       6
```

Path `5-3-2-4-6` has length 4, which doesn't go through root.

Complexity: Time $O(n)$ — each node visited once, Space $O(h)$ — recursion stack where $h$ is tree height.

### Java

```java []
package tree;

import struct.TreeNode;

// lc 543, DFS post-order. O(n) time, O(h) space.
public static int diameterOfBinaryTree(TreeNode root) {
    int[] maxDiameter = new int[1];
    depth(root, maxDiameter);
    return maxDiameter[0];
}

private static int depth(TreeNode node, int[] maxDiameter) {
    if (node == null) return 0;
    int left = depth(node.left, maxDiameter);   // O(left subtree)
    int right = depth(node.right, maxDiameter); // O(right subtree)
    maxDiameter[0] = Math.max(maxDiameter[0], left + right); // diameter through this node
    return 1 + Math.max(left, right); // depth to parent
}
```

```python []
# lc 543, DFS post-order. O(n) time, O(h) space.
def diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int:
    self.res = 0

    def depth(node: Optional[TreeNode]) -> int:  # O(n) total calls
        if not node:
            return 0
        left = depth(node.left)   # O(h) stack space
        right = depth(node.right)
        self.res = max(self.res, left + right)  # diameter through this node
        return 1 + max(left, right)

    depth(root)
    return self.res
```

```cpp []
// lc 543, DFS post-order. O(n) time, O(h) space.
int diameterOfBinaryTree(TreeNode* root) {
    int result = 0;
    depth(root, result);
    return result;
}

int depth(TreeNode* node, int& result) {
    if (!node) return 0;
    int left = depth(node->left, result);
    int right = depth(node->right, result);
    result = std::max(result, left + right); // diameter through this node
    return std::max(left, right) + 1;        // depth to parent
}
```

```rust []
// lc 543, DFS post-order. O(n) time, O(h) space.
pub fn diameter_of_binary_tree(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    fn depth(node: Option<Rc<RefCell<TreeNode>>>, diameter: &mut i32) -> i32 {
        match node {
            None => 0,
            Some(n) => {
                let n = n.borrow();
                let left = depth(n.left.clone(), diameter);   // O(h) stack
                let right = depth(n.right.clone(), diameter);
                *diameter = max(*diameter, left + right); // diameter = left + right
                max(left, right) + 1 // return depth to parent
            }
        }
    }
    let mut diameter = 0;
    depth(root, &mut diameter); // O(n) time, O(h) space
    diameter
}
```
