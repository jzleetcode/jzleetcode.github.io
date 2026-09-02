---
author: JZ
pubDatetime: 2026-09-02T06:00:00Z
modDatetime: 2026-09-02T06:00:00Z
title: LeetCode 103 Binary Tree Zigzag Level Order Traversal
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-binary-tree
description:
  "Solutions for LeetCode 103, medium, tags: tree, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 103](https://leetcode.com/problems/binary-tree-zigzag-level-order-traversal/description/)

Given the root of a binary tree, return the zigzag level order traversal of its nodes' values. (i.e., from left to right, then right to left for the next level and alternate between).

```
Example 1:

Input: root = [3,9,20,null,null,15,7]
Output: [[3],[20,9],[15,7]]

Example 2:

Input: root = [1]
Output: [[1]]

Example 3:

Input: root = []
Output: []
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 2000]`.
- `-100 <= Node.val <= 100`

## Idea1: BFS

Use a standard BFS level-order traversal with a queue, but alternate the direction we place values into each level's list. On even levels (0, 2, …), fill left-to-right; on odd levels (1, 3, …), fill right-to-left.

The key trick is to pre-allocate the level array of size `k` (the number of nodes at that level) and compute the insertion index: `i` on even levels, `k - 1 - i` on odd levels. This avoids reversing.

```
        3             level 0 (L→R): [3]
       / \
      9   20          level 1 (R→L): [20, 9]
         / \
        15   7        level 2 (L→R): [15, 7]
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// BFS. O(N) time and O(maxCount of one level, do not consider res) space.
public List<List<Integer>> zigzagLevelOrderBfs(TreeNode root) {
    List<List<Integer>> res = new ArrayList<>();
    Queue<TreeNode> q = new ArrayDeque<>(5);
    if (root != null) q.add(root);
    boolean leftToRight = true;
    while (!q.isEmpty()) {
        int size = q.size();
        LinkedList<Integer> curLevel = new LinkedList<>();
        for (int i = 0; i < size; i++) {
            TreeNode cur = q.remove();
            if (leftToRight) curLevel.addLast(cur.val); // O(1)
            else curLevel.addFirst(cur.val); // O(1) linked list
            if (cur.left != null) q.add(cur.left);
            if (cur.right != null) q.add(cur.right);
        }
        leftToRight = !leftToRight;
        res.add(curLevel);
    }
    return res;
}
```

### Python

```python []
class Solution:
    """BFS with deque. O(n) time, O(n) space."""

    def zigzagLevelOrder(self, root: TreeNode) -> List[List[int]]:
        res = []
        q = deque([root]) if root else None
        odd = False  # root level 0, even level
        while q:
            n, cur = len(q), deque()
            for _ in range(n):
                node = q.popleft()
                if odd:
                    cur.appendleft(node.val)  # O(1)
                else:
                    cur.append(node.val)  # O(1)
                if node.left: q.append(node.left)
                if node.right: q.append(node.right)
            res.append(list(cur))
            odd = not odd
        return res
```

### C++

```cpp []
// BFS with deque, reversing direction each level.
// O(n) time, O(w) space where w = max width.
vector<vector<int>> zigzagLevelOrderBfs(TreeNode *root) {
    vector<vector<int>> res;
    if (root == nullptr) return res;
    deque<TreeNode *> q;
    q.push_back(root);
    bool leftToRight = true;
    while (!q.empty()) {
        int size = q.size();
        vector<int> level(size);
        for (int i = 0; i < size; ++i) {
            auto cur = q.front();
            q.pop_front();
            int idx = leftToRight ? i : size - 1 - i; // O(1)
            level[idx] = cur->val;
            if (cur->left) q.push_back(cur->left);
            if (cur->right) q.push_back(cur->right);
        }
        res.push_back(level);
        leftToRight = !leftToRight;
    }
    return res;
}
```

### Rust

```rust []
/// BFS queue-based zigzag level order traversal.
/// Time O(n), Space O(w) where w is max width.
pub fn zigzag_level_order(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<Vec<i32>> {
    let mut result = Vec::new();
    let mut queue: VecDeque<Rc<RefCell<TreeNode>>> = VecDeque::new();
    if let Some(node) = root {
        queue.push_back(node);
    }
    let mut left_to_right = true;
    while !queue.is_empty() {
        let level_size = queue.len();
        let mut level = vec![0; level_size];
        for i in 0..level_size {
            let node = queue.pop_front().unwrap();
            let borrowed = node.borrow();
            let idx = if left_to_right { i } else { level_size - 1 - i };
            level[idx] = borrowed.val;
            if let Some(ref left) = borrowed.left {
                queue.push_back(left.clone());
            }
            if let Some(ref right) = borrowed.right {
                queue.push_back(right.clone());
            }
        }
        result.push(level);
        left_to_right = !left_to_right;
    }
    result
}
```

## Idea2: DFS

Use DFS to collect nodes in standard level order (left-to-right at every depth), then reverse the odd-indexed levels. This avoids the BFS queue entirely and leverages the call stack.

Complexity: Time $O(n)$, Space $O(h)$ for recursion stack where $h$ is tree height ($O(n)$ in the worst case for a skewed tree, $O(\log n)$ for a balanced tree).

### Java

```java []
// DFS. O(N) time and space (result and recursive stack).
public List<List<Integer>> zigzagLevelOrderDfs(TreeNode root) {
    List<List<Integer>> res = new ArrayList<>();
    dfs(root, res, 0);
    return res;
}

private void dfs(TreeNode cur, List<List<Integer>> res, int level) {
    if (cur == null) return;
    if (res.size() <= level) res.add(new LinkedList<>());
    List<Integer> curLevel = res.get(level);
    if (level % 2 == 0) curLevel.add(cur.val);
    else curLevel.addFirst(cur.val); // O(1) linked list insert at head
    dfs(cur.left, res, level + 1);
    dfs(cur.right, res, level + 1);
}
```

### Python

```python []
class Solution:
    """DFS. O(n) time, O(h) space for recursion."""

    def zigzagLevelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        res = []

        def dfs(n: Optional[TreeNode], h: int):
            if not n: return
            if len(res) <= h: res.append([])
            res[h].append(n.val)
            dfs(n.left, h + 1)
            dfs(n.right, h + 1)

        dfs(root, 0)
        return [res[i] if i % 2 == 0 else res[i][::-1] for i in range(len(res))]
```

### C++

```cpp []
// DFS: build levels then reverse odd-indexed ones.
// O(n) time, O(h) space where h = height of the tree.
vector<vector<int>> zigzagLevelOrderDfs(TreeNode *root) {
    vector<vector<int>> res;
    dfs(root, 0, res);
    for (int i = 1; i < (int)res.size(); i += 2) {
        reverse(res[i].begin(), res[i].end());
    }
    return res;
}

void dfs(TreeNode *node, int depth, vector<vector<int>> &res) {
    if (node == nullptr) return;
    if (depth == (int)res.size()) res.emplace_back();
    res[depth].push_back(node->val);
    dfs(node->left, depth + 1, res);
    dfs(node->right, depth + 1, res);
}
```

### Rust

```rust []
/// DFS recursive with depth tracking, then reverse odd levels.
/// Time O(n), Space O(h) where h is tree height.
pub fn zigzag_level_order_dfs(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<Vec<i32>> {
    let mut result = Vec::new();
    Self::dfs(&root, 0, &mut result);
    for (i, level) in result.iter_mut().enumerate() {
        if i % 2 == 1 {
            level.reverse();
        }
    }
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
