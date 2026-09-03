---
author: JZ
pubDatetime: 2026-09-03T10:37:00Z
modDatetime: 2026-09-03T10:37:00Z
title: LeetCode 662 Maximum Width of Binary Tree
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-tree
  - a-binary-tree
description:
  "Solutions for LeetCode 662, medium, tags: tree, depth-first search, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 662](https://leetcode.com/problems/maximum-width-of-binary-tree/description/)

Given the `root` of a binary tree, return _the **maximum width** of the given tree_.

The maximum width of a tree is the maximum width among all levels.

The width of one level is defined as the length between the end-nodes (the leftmost and rightmost non-null nodes), where the null nodes between the end-nodes that would be present in a complete binary tree extending down to that level are also counted into the length calculation.

It is guaranteed that the answer will in the range of a **32-bit** signed integer.

```
Example 1:

         1
        / \
       3   2
      / \   \
     5   3   9

Input: root = [1,3,2,5,3,null,9]
Output: 4
Explanation: The maximum width exists in the third level with length 4 (5,3,null,9).

Example 2:

         1
        / \
       3   2
      /     \
     5       9
    /       /
   6       7

Input: root = [1,3,2,5,null,null,9,6,null,7]
Output: 7
Explanation: The maximum width exists in the fourth level with length 7
             (6,null,null,null,null,null,7).

Example 3:

     1
    / \
   3   2
  /
 5

Input: root = [1,3,2,5]
Output: 2
Explanation: The maximum width exists in the second level with length 2 (3,2).
```

**Constraints:**

- The number of nodes in the tree is in the range `[1, 3000]`.
- `-100 <= Node.val <= 100`

## Idea1 BFS

Assign each node an index as if the tree were a complete binary tree. For a node at index $i$:

- left child: $2i$
- right child: $2i + 1$

Traverse level-by-level. At each level, width = rightmost index - leftmost index + 1.

```
         1 (pos=0)
        / \
  (0)  3   2  (1)
      / \   \
(0)  5   3   9  (3)       width = 3 - 0 + 1 = 4
```

To prevent index overflow on deep trees, normalize positions at each level by subtracting the leftmost position.

Complexity: Time $O(n)$, Space $O(n)$ for the queue (holds at most one level).

## Idea2 DFS

Use pre-order DFS. Maintain a map from depth to the **first** (leftmost) position seen at that depth. For each node, width at its depth = current position - first position + 1.

Since pre-order visits left before right, the first node seen at each depth is always the leftmost. Same position normalization trick applies to prevent overflow.

Complexity: Time $O(n)$, Space $O(n)$ for the map + $O(h)$ for recursion stack.

### Java

```java []
// BFS, O(n) time and space, 2ms, 43.01Mb.
public int widthOfBinaryTreeBfs(TreeNode root) {
    int res = 0;
    Queue<Map.Entry<TreeNode, Integer>> q = new ArrayDeque<>();
    q.add(new AbstractMap.SimpleEntry<>(root, 0));
    while (!q.isEmpty()) {
        int l = q.peek().getValue(), r = l, s = q.size();
        for (int i = 0; i < s; i++) { // O(n) total across all levels
            Map.Entry<TreeNode, Integer> e = q.remove();
            TreeNode n = e.getKey();
            r = e.getValue();
            if (n.left != null) q.add(new AbstractMap.SimpleEntry<>(n.left, 2 * r));
            if (n.right != null) q.add(new AbstractMap.SimpleEntry<>(n.right, 2 * r + 1));
        }
        res = Math.max(res, r - l + 1);
    }
    return res;
}
```

```java []
// DFS, O(n) time and space. 3ms, 44.36Mb.
int res;
Map<Integer, Integer> lLeft; // level -> leftmost position

public int widthOfBinaryTreeDfs(TreeNode root) {
    res = 0;
    lLeft = new HashMap<>();
    dfs(root, 0, 0);
    return res;
}

void dfs(TreeNode n, int d, int p) {
    if (n == null) return;
    lLeft.putIfAbsent(d, p);
    res = Math.max(res, p - lLeft.get(d) + 1);
    dfs(n.left, d + 1, 2 * p);     // O(h) recursion depth
    dfs(n.right, d + 1, 2 * p + 1);
}
```

### Python

```python []
# BFS. O(n) time, O(n) space.
def widthOfBinaryTree(self, root: Optional[TreeNode]) -> int:
    q = deque()
    q.append((root, 0))
    res = 0
    while q:
        size = len(q)
        l, r = q[0][1], 0
        for i in range(size):  # O(n) total across all levels
            n, r = q.popleft()
            if n.left is not None: q.append((n.left, 2 * r))
            if n.right is not None: q.append((n.right, 2 * r + 1))
        res = max(res, r - l + 1)
    return res
```

```python []
# DFS. O(n) time, O(n) space.
def widthOfBinaryTree(self, root: Optional[TreeNode]) -> int:
    self.res = 0
    self.left_most = {}

    def dfs(node: Optional[TreeNode], depth: int, pos: int):
        if node is None:
            return
        if depth not in self.left_most:
            self.left_most[depth] = pos
        self.res = max(self.res, pos - self.left_most[depth] + 1)
        dfs(node.left, depth + 1, 2 * pos)  # O(h) stack depth
        dfs(node.right, depth + 1, 2 * pos + 1)

    dfs(root, 0, 0)
    return self.res
```

### C++

```cpp []
// BFS, O(n) time and space.
int widthOfBinaryTree(TreeNode *root) {
    if (!root) return 0;
    int maxWidth = 0;
    queue<pair<TreeNode *, unsigned long>> q; // O(n) space
    q.push({root, 0});
    while (!q.empty()) {
        int size = q.size();
        unsigned long left = q.front().second;
        unsigned long right = left;
        while (size-- > 0) {
            auto [node, pos] = q.front();
            q.pop();
            right = pos;
            unsigned long offset = pos - left; // normalize to prevent overflow
            if (node->left) q.push({node->left, 2 * offset});
            if (node->right) q.push({node->right, 2 * offset + 1});
        }
        maxWidth = max(maxWidth, (int)(right - left + 1));
    }
    return maxWidth;
}
```

```cpp []
// DFS, O(n) time and space.
int widthOfBinaryTree(TreeNode *root) {
    unordered_map<int, unsigned long> firstPos; // depth -> first position
    int maxWidth = 0;
    dfs(root, 0, 0, firstPos, maxWidth);
    return maxWidth;
}

void dfs(TreeNode *node, int depth, unsigned long pos,
         unordered_map<int, unsigned long> &firstPos, int &maxWidth) {
    if (!node) return;
    if (firstPos.find(depth) == firstPos.end()) firstPos[depth] = pos;
    unsigned long width = pos - firstPos[depth] + 1;
    maxWidth = max(maxWidth, (int)width);
    unsigned long offset = pos - firstPos[depth]; // normalize
    dfs(node->left, depth + 1, 2 * offset, firstPos, maxWidth);  // O(h) recursion
    dfs(node->right, depth + 1, 2 * offset + 1, firstPos, maxWidth);
}
```

### Rust

```rust []
// BFS, O(n) time and space.
pub fn width_of_binary_tree(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    let Some(root) = root else { return 0 };
    let mut max_width: u64 = 1;
    let mut queue: VecDeque<(Rc<RefCell<TreeNode>>, u64)> = VecDeque::new();
    queue.push_back((root, 0));
    while !queue.is_empty() {
        let level_size = queue.len();
        let left_pos = queue.front().unwrap().1;
        let mut right_pos = left_pos;
        for _ in 0..level_size { // O(n) total
            let (node, pos) = queue.pop_front().unwrap();
            right_pos = pos;
            let normalized = pos - left_pos; // prevent overflow
            let n = node.borrow();
            if let Some(ref left) = n.left {
                queue.push_back((Rc::clone(left), normalized * 2));
            }
            if let Some(ref right) = n.right {
                queue.push_back((Rc::clone(right), normalized * 2 + 1));
            }
        }
        max_width = max_width.max(right_pos - left_pos + 1);
    }
    max_width as i32
}
```

```rust []
// DFS, O(n) time and space.
pub fn width_of_binary_tree_dfs(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    fn dfs(
        node: Option<Rc<RefCell<TreeNode>>>, depth: u32, pos: u64,
        first_pos: &mut HashMap<u32, u64>, max_width: &mut u64,
    ) {
        let Some(node) = node else { return };
        first_pos.entry(depth).or_insert(pos);
        let width = pos - first_pos[&depth] + 1;
        *max_width = (*max_width).max(width);
        let n = node.borrow();
        let normalized = pos - first_pos[&depth]; // normalize to prevent overflow
        dfs(n.left.clone(), depth + 1, normalized * 2, first_pos, max_width); // O(h) stack
        dfs(n.right.clone(), depth + 1, normalized * 2 + 1, first_pos, max_width);
    }
    let mut first_pos = HashMap::new();
    let mut max_width: u64 = 0;
    dfs(root, 0, 0, &mut first_pos, &mut max_width);
    max_width as i32
}
```
