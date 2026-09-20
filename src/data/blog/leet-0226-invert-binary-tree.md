---
author: JZ
pubDatetime: 2026-09-20T10:37:00Z
modDatetime: 2026-09-20T10:37:00Z
title: LeetCode 226 Invert Binary Tree
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-tree
  - a-binary-tree
description:
  "Solutions for LeetCode 226, easy, tags: tree, depth-first search, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 226](https://leetcode.com/problems/invert-binary-tree/description/)

Given the `root` of a binary tree, invert the tree, and return its root.

```
Example 1:

        4                  4
       / \                / \
      2   7    -->       7   2
     / \ / \            / \ / \
    1  3 6  9          9  6 3  1

Input: root = [4,2,7,1,3,6,9]
Output: [4,7,2,9,6,3,1]

Example 2:

      2          2
     / \   -->  / \
    1   3      3   1

Input: root = [2,1,3]
Output: [2,3,1]

Example 3:

Input: root = []
Output: []
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 100]`.
- `-100 <= Node.val <= 100`

## Idea 1: Recursive DFS

At each node, swap its left and right children, then recurse into both subtrees. The recursion naturally visits every node exactly once via depth-first traversal.

```
   Before swap at node 4:       After swap at node 4:
        4                            4
       / \                          / \
      2   7                        7   2
     / \ / \                      / \ / \
    1  3 6  9                    6  9 1  3
                                (then recurse into 7 and 2)
```

Complexity: Time $O(n)$ — each node visited once. Space $O(h)$ — recursion stack where $h$ is tree height, worst case $O(n)$ for a skewed tree.

## Idea 2: Iterative BFS

Use a queue to traverse level by level. For each dequeued node, swap its children in place, then enqueue the (now-swapped) children. No recursion needed.

```
Queue state walk-through for [4,2,7,1,3,6,9]:

  queue: [4]         → pop 4, swap children → 4's left=7, right=2
  queue: [7, 2]      → pop 7, swap children → 7's left=9, right=6
  queue: [2, 9, 6]   → pop 2, swap children → 2's left=3, right=1
  queue: [9, 6, 3, 1] → pop leaves (no children to swap)
  done → [4,7,2,9,6,3,1]
```

Complexity: Time $O(n)$ — each node visited once. Space $O(n)$ — queue holds up to $n/2$ nodes at the widest level.

### Java

```java []
// Solution 1: recursive DFS. O(n) time, O(h) space.
public TreeNode invertTree(TreeNode root) {
    if (root == null) return null;
    TreeNode left = invertTree(root.left);
    root.left = invertTree(root.right);
    root.right = left;
    return root;
}
```

```java []
// Solution 2: iterative BFS. O(n) time, O(n) space.
public TreeNode invertTree2(TreeNode root) {
    if (root == null) return null;
    Queue<TreeNode> queue = new ArrayDeque<>();
    queue.add(root);
    while (!queue.isEmpty()) {
        TreeNode cur = queue.remove();
        TreeNode temp = cur.left;
        cur.left = cur.right;
        cur.right = temp;
        if (cur.left != null) queue.add(cur.left);
        if (cur.right != null) queue.add(cur.right);
    }
    return root;
}
```

```python []
# Solution 1: recursive DFS. O(n) time, O(h) space.
def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
    if not root: return root
    temp = root.left
    root.left = self.invertTree(root.right)
    root.right = self.invertTree(temp)
    return root
```

```python []
# Solution 2: iterative BFS. O(n) time, O(n) space.
def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
    if not root: return root
    queue = deque([root])
    while queue:
        node = queue.popleft()
        node.left, node.right = node.right, node.left
        if node.left: queue.append(node.left)
        if node.right: queue.append(node.right)
    return root
```

```cpp []
// Solution 1: recursive DFS. O(n) time, O(h) space.
TreeNode* invertTree(TreeNode* root) {
    if (!root) return nullptr;
    std::swap(root->left, root->right);
    invertTree(root->left);
    invertTree(root->right);
    return root;
}
```

```cpp []
// Solution 2: iterative BFS. O(n) time, O(n) space.
TreeNode* invertTreeBFS(TreeNode* root) {
    if (!root) return nullptr;
    std::queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* node = q.front();
        q.pop();
        std::swap(node->left, node->right);
        if (node->left) q.push(node->left);
        if (node->right) q.push(node->right);
    }
    return root;
}
```

```rust []
// Solution 1: recursive DFS. O(n) time, O(h) space.
pub fn invert_tree(root: Option<Rc<RefCell<TreeNode>>>) -> Option<Rc<RefCell<TreeNode>>> {
    if let Some(node) = root {
        let mut n = node.borrow_mut();
        let left = n.left.take();
        let right = n.right.take();
        n.left = Self::invert_tree(right);
        n.right = Self::invert_tree(left);
        drop(n);
        Some(node)
    } else {
        None
    }
}
```

```rust []
// Solution 2: iterative BFS. O(n) time, O(n) space.
pub fn invert_tree_bfs(root: Option<Rc<RefCell<TreeNode>>>) -> Option<Rc<RefCell<TreeNode>>> {
    if let Some(ref r) = root {
        let mut queue = VecDeque::new();
        queue.push_back(Rc::clone(r));
        while let Some(node) = queue.pop_front() {
            let mut n = node.borrow_mut();
            let tmp = n.left.take();
            n.left = n.right.take();
            n.right = tmp;
            if let Some(ref left) = n.left { queue.push_back(Rc::clone(left)); }
            if let Some(ref right) = n.right { queue.push_back(Rc::clone(right)); }
        }
    }
    root
}
```
