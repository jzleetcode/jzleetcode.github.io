---
author: JZ
pubDatetime: 2026-05-28T06:00:00Z
modDatetime: 2026-05-28T06:00:00Z
title: LeetCode 124 Binary Tree Maximum Path Sum
featured: true
tags:
  - a-tree
  - a-depth-first-search
  - a-dynamic-programming
  - a-binary-tree
description:
  "Solutions for LeetCode 124, hard, tags: tree, depth-first search, dynamic programming, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 124](https://leetcode.com/problems/binary-tree-maximum-path-sum/description/)

A **path** in a binary tree is a sequence of nodes where each pair of adjacent nodes in the sequence has an edge connecting them. A node can only appear in the sequence **at most once**. Note that the path does not need to pass through the root.

The **path sum** of a path is the sum of the node's values in the path.

Given the `root` of a binary tree, return *the maximum **path sum** of any **non-empty** path*.

```
Example 1:

        1
       / \
      2   3

Input: root = [1,2,3]
Output: 6
Explanation: The optimal path is 2 -> 1 -> 3 with a path sum of 2 + 1 + 3 = 6.

Example 2:

       -10
       / \
      9  20
        /  \
       15   7

Input: root = [-10,9,20,null,null,15,7]
Output: 42
Explanation: The optimal path is 15 -> 20 -> 7 with a path sum of 15 + 20 + 7 = 42.

Constraints:

The number of nodes in the tree is in the range [1, 3 * 10^4].
-1000 <= Node.val <= 1000
```

## Solution: DFS Post-Order (Max Gain)

### Idea

At each node, compute the maximum "gain" — the best sum achievable on a path starting at that node going downward (either left or right, not both). Clamp negative gains to 0 (don't extend into a subtree that decreases the sum).

While computing gains bottom-up, also track a global maximum by considering the path that goes **through** the current node (left gain + right gain + node value). This path uses both branches, which is valid as a complete path but cannot be extended upward.

```
For node X:
   leftGain  = max(0, maxGain(X.left))    -- best downward from left child
   rightGain = max(0, maxGain(X.right))   -- best downward from right child

   pathThroughX = leftGain + rightGain + X.val   -- candidate for global max
   gainFromX    = max(leftGain, rightGain) + X.val  -- return to parent

Example: [-10, 9, 20, null, null, 15, 7]

         -10
         / \
        9  20
          /  \
         15   7

maxGain(15) = 15, maxGain(7) = 7
At node 20: leftGain=15, rightGain=7
  pathThrough20 = 15 + 7 + 20 = 42  <-- global max
  gainFrom20 = max(15,7) + 20 = 35

At node 9: leftGain=0, rightGain=0
  pathThrough9 = 0 + 0 + 9 = 9
  gainFrom9 = 9

At node -10: leftGain=9, rightGain=35
  pathThrough-10 = 9 + 35 + (-10) = 34
  gainFrom-10 = max(9,35) + (-10) = 25

Global max = 42 (path: 15 -> 20 -> 7)
```

Complexity: Time $O(n)$ — visit every node exactly once. Space $O(h)$ — recursion stack, where $h$ is the tree height ($O(\log n)$ balanced, $O(n)$ worst case skewed).

#### Java

```java []
public class MaxPathSumBT {
    int maxSum; // max sum in any path while traversing the tree

    // O(n) time, O(h) space
    public int maxPathSum(TreeNode root) {
        if (root == null) return 0;
        maxSum = Integer.MIN_VALUE;
        maxGain(root);
        return maxSum;
    }

    private int maxGain(TreeNode node) {
        if (node == null) return 0;
        int left = Math.max(0, maxGain(node.left));   // O(left subtree)
        int right = Math.max(0, maxGain(node.right)); // O(right subtree)
        maxSum = Math.max(maxSum, left + right + node.val); // path through node
        return Math.max(left, right) + node.val;
    }

    // Iterative post-order with HashMap. O(n) time and space.
    public int maxPathSumIter(TreeNode root) {
        int result = Integer.MIN_VALUE;
        Map<TreeNode, Integer> maxRootPath = new HashMap<>();
        maxRootPath.put(null, 0);
        for (TreeNode node : topSort(root)) {
            int left = Math.max(maxRootPath.get(node.left), 0);
            int right = Math.max(maxRootPath.get(node.right), 0);
            maxRootPath.put(node, Math.max(left, right) + node.val);
            result = Math.max(left + right + node.val, result);
        }
        return result;
    }

    public Iterable<TreeNode> topSort(TreeNode root) {
        Deque<TreeNode> result = new LinkedList<>();
        if (root != null) {
            Deque<TreeNode> stack = new LinkedList<>();
            stack.push(root);
            while (!stack.isEmpty()) {
                TreeNode curr = stack.pop();
                result.push(curr);
                if (curr.right != null) stack.push(curr.right);
                if (curr.left != null) stack.push(curr.left);
            }
        }
        return result;
    }
}
```

#### Python

```python []
class Solution:
    """DFS post-order. O(n) time, O(h) space."""

    def maxPathSum(self, root: Optional[TreeNode]) -> int:
        res = -1 << 31

        def maxGain(node: Optional[TreeNode]) -> int:
            nonlocal res
            if not node: return 0
            left = max(0, maxGain(node.left))   # O(left subtree)
            right = max(0, maxGain(node.right)) # O(right subtree)
            res = max(res, left + right + node.val)  # path through node
            return max(left, right) + node.val

        if not root: return 0
        maxGain(root)
        return res
```

#### C++

```cpp []
// DFS post-order — O(n) time, O(h) space
class Solution124 {
public:
    int maxPathSum(TreeNode *root) {
        int res = INT_MIN;
        maxGain(root, res);
        return res;
    }

private:
    int maxGain(TreeNode *node, int &res) {
        if (!node) return 0;
        int left = std::max(0, maxGain(node->left, res));   // O(left subtree)
        int right = std::max(0, maxGain(node->right, res)); // O(right subtree)
        res = std::max(res, left + right + node->val);      // path through node
        return std::max(left, right) + node->val;           // max single-branch gain
    }
};
```

#### Rust

```rust []
/// DFS post-order — O(n) time, O(h) space
impl Solution {
    pub fn max_path_sum(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
        fn max_gain(env: &mut Env, node: Option<Rc<RefCell<TreeNode>>>) -> i32 {
            match node {
                None => 0,
                Some(n) => {
                    let n = n.borrow();
                    let left = max(0, max_gain(env, n.left.clone()));   // O(left subtree)
                    let right = max(0, max_gain(env, n.right.clone())); // O(right subtree)
                    env.res = max(env.res, left + right + n.val); // path through node
                    max(left, right) + n.val
                }
            }
        }
        let env = &mut Env { res: i32::MIN };
        max_gain(env, root);
        env.res
    }
}

struct Env {
    res: i32,
}
```
