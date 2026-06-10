---
author: JZ
pubDatetime: 2026-06-10T06:00:00Z
modDatetime: 2026-06-10T06:00:00Z
title: LeetCode 102 Binary Tree Level Order Traversal
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-tree
description:
  "Solutions for LeetCode 102, medium, tags: tree, breadth-first search, depth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 102](https://leetcode.com/problems/binary-tree-level-order-traversal/description/)

Given the `root` of a binary tree, return the level order traversal of its nodes' values (i.e., from left to right, level by level).

```
Example 1:

Input: root = [3,9,20,null,null,15,7]
Output: [[3],[9,20],[15,7]]

        3          level 0
       / \
      9  20        level 1
         / \
        15  7      level 2

Example 2:

Input: root = [1]
Output: [[1]]

Example 3:

Input: root = []
Output: []
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 2000]`.
- `-1000 <= Node.val <= 1000`

## Idea1

**BFS with a queue** — process the tree level by level. At each step, drain all nodes currently in the queue (one full level), collect their values, and enqueue their children for the next level.

```
        3             queue: [3]         -> level [3]
       / \
      9  20           queue: [9,20]      -> level [9,20]
         / \
        15  7         queue: [15,7]      -> level [15,7]

Result: [[3], [9,20], [15,7]]
```

Complexity: Time $O(n)$ — visit every node once, Space $O(w)$ where $w$ is the maximum width of the tree (at most $n/2$ for a complete tree).

### Java

```java []
// lc 102, BFS, O(n) time, O(w) space.
public List<List<Integer>> levelOrderBFS(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    Deque<TreeNode> queue = new LinkedList<>();
    if (root == null) return result;
    queue.add(root);
    while (!queue.isEmpty()) {
        int size = queue.size();           // nodes at this level
        List<Integer> level = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            TreeNode n = queue.remove();
            level.add(n.val);
            if (n.left != null) queue.add(n.left);
            if (n.right != null) queue.add(n.right);
        }
        result.add(level);
    }
    return result;
}
```

```python []
# lc 102, BFS, O(n) time, O(w) space.
class Solution:
    def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        if not root:
            return []
        res = []
        q = deque([root])
        while q:                              # O(n) total iterations
            level = []
            for _ in range(len(q)):           # drain current level
                node = q.popleft()
                level.append(node.val)
                if node.left:
                    q.append(node.left)
                if node.right:
                    q.append(node.right)
            res.append(level)
        return res
```

```cpp []
// lc 102, BFS, O(n) time, O(w) space.
vector<vector<int>> levelOrder(TreeNode *root) {
    vector<vector<int>> res;
    if (root == nullptr) return res;
    deque<TreeNode *> q;
    q.push_back(root);
    while (!q.empty()) {
        res.emplace_back();                   // append empty vector for this level
        int size = q.size();
        while (size-- > 0) {
            auto cur = q.front();
            q.pop_front();
            res.back().push_back(cur->val);
            if (cur->left) q.push_back(cur->left);
            if (cur->right) q.push_back(cur->right);
        }
    }
    return res;
}
```

```rust []
// lc 102, BFS, O(n) time, O(w) space.
pub fn level_order_bfs(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<Vec<i32>> {
    let mut result = Vec::new();
    let mut queue: VecDeque<Rc<RefCell<TreeNode>>> = VecDeque::new();
    if let Some(node) = root {
        queue.push_back(node);
    }
    while !queue.is_empty() {
        let level_size = queue.len();
        let mut level = Vec::with_capacity(level_size);
        for _ in 0..level_size {
            let node = queue.pop_front().unwrap();
            let borrowed = node.borrow();
            level.push(borrowed.val);
            if let Some(ref left) = borrowed.left {
                queue.push_back(left.clone());
            }
            if let Some(ref right) = borrowed.right {
                queue.push_back(right.clone());
            }
        }
        result.push(level);
    }
    result
}
```

## Idea2

**DFS with depth tracking** — traverse the tree recursively, passing the current depth. When we reach a new depth for the first time (`depth == result.size()`), append a new empty list. Then add the current node's value to the list at index `depth`.

Since DFS visits left before right at each level, the values within each level list maintain left-to-right order.

```
DFS call order for [3,9,20,null,null,15,7]:

dfs(3, depth=0)  -> result[0] = [3]
  dfs(9, depth=1)  -> result[1] = [9]
  dfs(20, depth=1) -> result[1] = [9, 20]
    dfs(15, depth=2) -> result[2] = [15]
    dfs(7, depth=2)  -> result[2] = [15, 7]
```

Complexity: Time $O(n)$ — visit every node once, Space $O(h)$ where $h$ is the height of the tree (recursion stack; worst case $O(n)$ for a skewed tree).

### Java

```java []
// lc 102, DFS recursive, O(n) time, O(h) space.
public List<List<Integer>> levelOrderR(TreeNode root) {
    List<List<Integer>> result = new ArrayList<>();
    levelHelper(result, root, 0);
    return result;
}

private void levelHelper(List<List<Integer>> levelOrder, TreeNode n, int level) {
    if (n == null) return;
    if (level == levelOrder.size()) levelOrder.add(new ArrayList<>());
    levelOrder.get(level).add(n.val);
    levelHelper(levelOrder, n.left, level + 1);
    levelHelper(levelOrder, n.right, level + 1);
}
```

```python []
# lc 102, DFS recursive, O(n) time, O(h) space.
class Solution2:
    def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        res = []

        def dfs(node: Optional[TreeNode], depth: int):
            if not node:
                return
            if depth == len(res):             # new depth reached
                res.append([])
            res[depth].append(node.val)
            dfs(node.left, depth + 1)
            dfs(node.right, depth + 1)

        dfs(root, 0)
        return res
```

```cpp []
// lc 102, DFS recursive, O(n) time, O(h) space.
vector<vector<int>> levelOrder(TreeNode *root) {
    vector<vector<int>> res;
    function<void(TreeNode *, int)> dfs = [&](TreeNode *n, int depth) {
        if (!n) return;
        if (depth == (int)res.size()) res.emplace_back();
        res[depth].push_back(n->val);
        dfs(n->left, depth + 1);
        dfs(n->right, depth + 1);
    };
    dfs(root, 0);
    return res;
}
```

```rust []
// lc 102, DFS recursive, O(n) time, O(h) space.
pub fn level_order(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<Vec<i32>> {
    let mut result = Vec::new();
    Self::dfs(&root, 0, &mut result);
    result
}

fn dfs(node: &Option<Rc<RefCell<TreeNode>>>, depth: usize, result: &mut Vec<Vec<i32>>) {
    if let Some(n) = node {
        let borrowed = n.borrow();
        if depth == result.len() {
            result.push(Vec::new());
        }
        result[depth].push(borrowed.val);
        Self::dfs(&borrowed.left, depth + 1, result);
        Self::dfs(&borrowed.right, depth + 1, result);
    }
}
```
