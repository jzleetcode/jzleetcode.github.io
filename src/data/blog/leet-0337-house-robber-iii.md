---
author: JZ
pubDatetime: 2026-08-04T10:00:00Z
modDatetime: 2026-08-04T10:00:00Z
title: LeetCode 337 House Robber III
featured: false
tags:
  - a-tree
  - a-dfs
  - a-dynamic-programming
  - a-binary-tree
description:
  "Solutions for LeetCode 337, medium, tags: tree, dfs, dynamic programming, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 337](https://leetcode.com/problems/house-robber-iii/description/)

The thief has found himself a new place for his thievery again. There is only one entrance to this area, called root. Besides the root, each house has one and only one parent house. After a tour, the smart thief realized that all houses in this place form a binary tree. It will automatically contact the police if two directly-linked houses were broken into on the same night.

Given the root of the binary tree, return the maximum amount of money the thief can rob without alerting the police.

```
Example 1:

Input: root = [3,2,3,null,3,null,1]
Output: 7
Explanation: Maximum amount of money the thief can rob = 3 + 3 + 1 = 7.

Example 2:

Input: root = [3,4,5,1,3,null,1]
Output: 9
Explanation: Maximum amount of money the thief can rob = 4 + 5 = 9.
```

**Constraints:**

- The number of nodes in the tree is in the range `[1, 10⁴]`.
- `0 <= Node.val <= 10⁴`

## Idea: Post-Order DFS (Tree DP)

At each node, we have two choices: rob it or skip it. We can define the subproblem as a pair `(rob_this, skip_this)` returned from each subtree via post-order DFS:

- **Rob this node**: we take its value but must skip both children.
  - `rob_this = node.val + skip_left + skip_right`
- **Skip this node**: we can independently choose the best option for each child.
  - `skip_this = max(rob_left, skip_left) + max(rob_right, skip_right)`

The answer is `max(rob_root, skip_root)`.

```
         3*           Rob nodes marked with *
        / \
       2   3*         rob(3) = 3 + skip(2) + skip(3)
        \   \                = 3 + 3 + 1 = 7
         3*  1*       skip(3) = max(rob(2),skip(2)) + max(rob(3),skip(3))
                             = max(0,3) + max(3,1) = 6
                      Answer: max(7, 6) = 7
```

The key insight is that this bottom-up approach avoids redundant computation—each node is visited exactly once, and the two-value return captures all needed state without memoization.

Complexity: Time $O(n)$ — each node visited once. Space $O(h)$ — recursion stack depth where $h$ is tree height.

### Java

```java []
// Post-order DFS tree DP. O(n) time, O(h) space.
public static int rob(TreeNode root) {
    int[] result = dfs(root); // result[0] = rob root, result[1] = skip root
    return Math.max(result[0], result[1]);
}

private static int[] dfs(TreeNode node) {
    if (node == null) return new int[]{0, 0}; // base case, O(1)
    int[] left = dfs(node.left);   // O(left subtree) time
    int[] right = dfs(node.right); // O(right subtree) time
    int robThis = node.val + left[1] + right[1]; // rob this node + skip both children
    int skipThis = Math.max(left[0], left[1]) + Math.max(right[0], right[1]); // skip this, best of each child
    return new int[]{robThis, skipThis}; // O(1) space per frame
}
```

### Python

```python []
# Post-order DFS tree DP. O(n) time, O(h) space.
class Solution:
    def rob(self, root: Optional[TreeNode]) -> int:
        def dfs(node: Optional[TreeNode]) -> Tuple[int, int]:  # O(n) total calls
            if not node:
                return 0, 0
            left = dfs(node.left)  # O(h) stack space
            right = dfs(node.right)
            rob_this = node.val + left[1] + right[1]
            skip_this = max(left) + max(right)
            return rob_this, skip_this

        return max(dfs(root))
```

### C++

```cpp []
// Post-order DFS tree DP. O(n) time, O(h) space.
int rob(TreeNode* root) {
    auto [rob_root, skip_root] = dfs(root);
    return std::max(rob_root, skip_root);
}

std::pair<int, int> dfs(TreeNode* node) {
    if (!node) return {0, 0};
    auto [rob_left, skip_left] = dfs(node->left);
    auto [rob_right, skip_right] = dfs(node->right);
    int rob_this = node->val + skip_left + skip_right;
    int skip_this = std::max(rob_left, skip_left) + std::max(rob_right, skip_right);
    return {rob_this, skip_this};
}
```

### Rust

```rust []
// Post-order DFS tree DP. O(n) time, O(h) space.
pub fn rob(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    let (rob, skip) = Self::dfs(&root);
    max(rob, skip)
}

fn dfs(node: &Option<Rc<RefCell<TreeNode>>>) -> (i32, i32) {
    match node {
        None => (0, 0),
        Some(n) => {
            let n = n.borrow();
            let (rob_left, skip_left) = Self::dfs(&n.left);
            let (rob_right, skip_right) = Self::dfs(&n.right);
            // rob_this: take this node's value + must skip both children
            let rob_this = n.val + skip_left + skip_right;
            // skip_this: don't take this node, pick best from each child
            let skip_this = max(rob_left, skip_left) + max(rob_right, skip_right);
            (rob_this, skip_this)
        }
    }
}
```
