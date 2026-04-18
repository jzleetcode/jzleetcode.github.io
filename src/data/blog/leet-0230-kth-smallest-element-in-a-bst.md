---
author: JZ
pubDatetime: 2026-04-18T06:00:00Z
modDatetime: 2026-04-18T06:00:00Z
title: LeetCode 230 Kth Smallest Element in a BST
featured: true
tags:
  - a-binary-search-tree
  - a-dfs
description:
  "Solutions for LeetCode 230, medium, tags: tree, depth-first search, binary search tree, binary tree."
---

## Table of contents

## Description

Given the root of a binary search tree, and an integer `k`, return the **kth smallest** value **(1-indexed)** of all the values of the nodes in the tree.

```
Example 1:

    3
   / \
  1   4
   \
    2

Input: root = [3,1,4,null,2], k = 1
Output: 1

Example 2:

        5
       / \
      3   6
     / \
    2   4
   /
  1

Input: root = [5,3,6,2,4,null,null,1], k = 3
Output: 3

Constraints:

The number of nodes in the tree is n.
1 <= k <= n <= 10^4
0 <= Node.val <= 10^4
```

## Idea

An **inorder traversal** of a BST visits nodes in ascending order. Instead of collecting all values, we use an explicit **stack** for the traversal and stop as soon as we have visited `k` nodes — the last visited node holds the answer.

```
Tree: [5,3,6,2,4,null,null,1], k = 3

        5
       / \
      3   6
     / \
    2   4
   /
  1

Inorder: 1 -> 2 -> 3 -> 4 -> 5 -> 6
                    ^
                 k=3, return 3

Stack trace (→ means "go left", ↑ means "pop"):
  → push 5, push 3, push 2, push 1
  ↑ pop 1  (visit #1)
  ↑ pop 2  (visit #2)
  ↑ pop 3  (visit #3 == k) -> return 3
```

The stack depth is at most the tree height $H$. We visit exactly $k$ nodes before returning. So the total work is $O(H)$ to reach the leftmost node plus $O(k)$ pops.

Complexity: Time $O(H + k)$, Space $O(H)$.

### Java

```java []
// lc 230, iterative inorder. O(H+k) time, O(H) space.
public static int kthSmallest(TreeNode root, int k) {
    ArrayDeque<TreeNode> stack = new ArrayDeque<>();
    TreeNode cur = root;
    while (cur != null || !stack.isEmpty()) {
        while (cur != null) { // O(H) go to leftmost
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();
        if (--k == 0) return cur.val; // found kth smallest
        cur = cur.right;
    }
    throw new IllegalArgumentException("k is larger than the number of nodes");
}
```

### Python

```python []
# lc 230, iterative inorder. O(H+k) time, O(H) space.
def kthSmallest(self, root: 'TreeNode', k: int) -> int:
    stack = []
    cur = root
    while cur or stack:
        while cur:  # O(H) go to leftmost
            stack.append(cur)
            cur = cur.left
        cur = stack.pop()
        k -= 1
        if k == 0:  # found kth smallest
            return cur.val
        cur = cur.right
```

### C++

```cpp []
// lc 230, iterative inorder. O(H+k) time, O(H) space.
int kthSmallest(TreeNode *root, int k) {
    std::stack<TreeNode *> stk;
    TreeNode *cur = root;
    while (cur || !stk.empty()) {
        while (cur) { // O(H) go to leftmost
            stk.push(cur);
            cur = cur->left;
        }
        cur = stk.top();
        stk.pop();
        if (--k == 0) return cur->val; // found kth smallest
        cur = cur->right;
    }
    return -1;
}
```

### Rust

```rust []
// lc 230, iterative inorder. O(H+k) time, O(H) space.
pub fn kth_smallest(root: Option<Rc<RefCell<TreeNode>>>, k: i32) -> i32 {
    let mut stack: Vec<Rc<RefCell<TreeNode>>> = Vec::new();
    let mut current = root;
    let mut count = 0;
    loop {
        while let Some(node) = current {
            stack.push(node.clone()); // go to leftmost, O(H)
            current = node.borrow().left.clone();
        }
        let node = stack.pop().unwrap();
        count += 1;
        if count == k { // found kth smallest
            return node.borrow().val;
        }
        current = node.borrow().right.clone();
    }
}
```
