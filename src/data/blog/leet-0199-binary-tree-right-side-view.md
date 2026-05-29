---
author: JZ
pubDatetime: 2026-05-29T06:00:00Z
modDatetime: 2026-05-29T06:00:00Z
title: LeetCode 199 Binary Tree Right Side View
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-tree
description:
  "Solutions for LeetCode 199, medium, tags: tree, depth-first search, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 199](https://leetcode.com/problems/binary-tree-right-side-view/description/)

Given the `root` of a binary tree, imagine yourself standing on the **right side** of it, return the values of the nodes you can see ordered from top to bottom.

```
Example 1:

Input: root = [1,2,3,null,5,null,4]
Output: [1,3,4]

        1        <-- 1
       / \
      2   3      <-- 3
       \   \
        5   4    <-- 4

Example 2:

Input: root = [1,null,3]
Output: [1,3]

Example 3:

Input: root = []
Output: []
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 100]`.
- `-100 <= Node.val <= 100`

## Idea1

**BFS level-order traversal** — process the tree level by level using a queue. The last node dequeued at each level is the rightmost node visible from the right side.

```
        1            level 0: [1]         -> take 1
       / \
      2   3          level 1: [2, 3]      -> take 3
       \   \
        5   4        level 2: [5, 4]      -> take 4

Result: [1, 3, 4]
```

For a left-heavy tree where the left subtree is deeper:

```
        1            level 0: [1]         -> take 1
       / \
      2   3          level 1: [2, 3]      -> take 3
     /
    4                level 2: [4]         -> take 4

Result: [1, 3, 4]
```

Complexity: Time $O(n)$ — visit every node once, Space $O(w)$ where $w$ is the maximum width of the tree (at most $n/2$ for a complete tree).

### Java

```java []
// lc 199, BFS, O(n) time, O(w) space.
public static List<Integer> rightSideViewBFS(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    if (root == null) return result;
    Deque<TreeNode> queue = new ArrayDeque<>();
    queue.add(root);
    while (!queue.isEmpty()) {
        int size = queue.size();                     // nodes at this level
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            if (i == size - 1) result.add(node.val); // last node in level
            if (node.left != null) queue.add(node.left);
            if (node.right != null) queue.add(node.right);
        }
    }
    return result;
}
```

```python []
# lc 199, BFS, O(n) time, O(w) space.
class Solution:
    def rightSideView(self, root: Optional[TreeNode]) -> List[int]:
        if not root:
            return []
        res = []
        q = deque([root])
        while q:                           # O(n) total iterations
            n = len(q)
            for i in range(n):
                node = q.popleft()
                if node.left:
                    q.append(node.left)
                if node.right:
                    q.append(node.right)
                if i == n - 1:             # last node in this level
                    res.append(node.val)
        return res
```

```cpp []
// lc 199, BFS, O(n) time, O(w) space.
vector<int> rightSideView(TreeNode *root) {
    vector<int> res;
    if (!root) return res;
    deque<TreeNode *> q;
    q.push_back(root);
    while (!q.empty()) {
        int size = q.size();               // nodes at this level
        while (size-- > 0) {
            auto cur = q.front();
            q.pop_front();
            if (size == 0) res.push_back(cur->val);  // last node in level
            if (cur->left) q.push_back(cur->left);
            if (cur->right) q.push_back(cur->right);
        }
    }
    return res;
}
```

```rust []
// lc 199, BFS, O(n) time, O(w) space.
pub fn right_side_view_bfs(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<i32> {
    let mut result = Vec::new();
    let mut queue: VecDeque<Rc<RefCell<TreeNode>>> = VecDeque::new();
    if let Some(node) = root {
        queue.push_back(node);
    }
    while !queue.is_empty() {
        let level_size = queue.len();
        for i in 0..level_size {
            let node = queue.pop_front().unwrap();
            let borrowed = node.borrow();
            if i == level_size - 1 {
                result.push(borrowed.val);  // last node in level
            }
            if let Some(ref left) = borrowed.left {
                queue.push_back(left.clone());
            }
            if let Some(ref right) = borrowed.right {
                queue.push_back(right.clone());
            }
        }
    }
    result
}
```

## Idea2

**DFS preorder (root → right → left)** — traverse the tree visiting the right child before the left. The first node encountered at each depth level is the rightmost node at that level.

We track depth and only record a node's value when `depth == result.size()` (i.e., we haven't seen this level yet). Since we visit right before left, the first node we see at each depth is guaranteed to be the rightmost.

Complexity: Time $O(n)$ — visit every node once, Space $O(h)$ where $h$ is the height of the tree (recursion stack).

### Java

```java []
// lc 199, DFS preorder right-first, O(n) time, O(h) space.
public static List<Integer> rightSideViewDFS(TreeNode root) {
    List<Integer> result = new ArrayList<>();
    dfs(root, 0, result);
    return result;
}

private static void dfs(TreeNode node, int depth, List<Integer> result) {
    if (node == null) return;
    if (depth == result.size()) result.add(node.val); // first at this depth
    dfs(node.right, depth + 1, result);               // right before left
    dfs(node.left, depth + 1, result);
}
```

```python []
# lc 199, DFS preorder right-first, O(n) time, O(h) space.
class Solution2:
    def rightSideView(self, root: Optional[TreeNode]) -> List[int]:
        res = []

        def dfs(node: Optional[TreeNode], depth: int):
            if not node:
                return
            if depth == len(res):          # first visit at this depth
                res.append(node.val)
            dfs(node.right, depth + 1)     # right before left
            dfs(node.left, depth + 1)

        dfs(root, 0)
        return res
```

```cpp []
// lc 199, DFS preorder right-first, O(n) time, O(h) space.
vector<int> rightSideView(TreeNode *root) {
    vector<int> res;
    function<void(TreeNode *, int)> dfs = [&](TreeNode *n, int depth) {
        if (!n) return;
        if (depth == (int)res.size()) res.push_back(n->val); // first at depth
        dfs(n->right, depth + 1);          // right before left
        dfs(n->left, depth + 1);
    };
    dfs(root, 0);
    return res;
}
```

```rust []
// lc 199, DFS preorder right-first, O(n) time, O(h) space.
pub fn right_side_view(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<i32> {
    let mut result = Vec::new();
    Self::dfs(&root, 0, &mut result);
    result
}

fn dfs(node: &Option<Rc<RefCell<TreeNode>>>, depth: usize, result: &mut Vec<i32>) {
    if let Some(n) = node {
        let borrowed = n.borrow();
        if depth == result.len() {
            result.push(borrowed.val);     // first at this depth
        }
        Self::dfs(&borrowed.right, depth + 1, result); // right before left
        Self::dfs(&borrowed.left, depth + 1, result);
    }
}
```
