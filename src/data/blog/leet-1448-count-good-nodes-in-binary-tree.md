---
author: JZ
pubDatetime: 2026-09-24T10:07:00Z
modDatetime: 2026-09-24T10:07:00Z
title: LeetCode 1448 Count Good Nodes in Binary Tree
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-tree
  - a-binary-tree
description:
  "Solutions for LeetCode 1448, medium, tags: tree, depth-first search, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 1448](https://leetcode.com/problems/count-good-nodes-in-binary-tree/description/)

Given a binary tree `root`, a node X in the tree is named **good** if in the path from root to X there are no nodes with a value _greater than_ X.

Return the number of **good** nodes in the binary tree.

```
Example 1:

        3
       / \
      1   4
     /   / \
    3   1   5

Input: root = [3,1,4,3,null,1,5]
Output: 4
Explanation: Nodes in blue are good.
Root Node (3) is always a good node.
Node 4 -> (3,4) path max is 3, 4 >= 3, good.
Node 5 -> (3,4,5) path max is 4, 5 >= 4, good.
Node 3 -> (3,1,3) path max is 3, 3 >= 3, good.

Example 2:

      3
     /
    3
   / \
  4   2

Input: root = [3,3,null,4,2]
Output: 3
Explanation: Node 2 -> (3,3,2) is not good, because "3" is higher than it.

Example 3:

Input: root = [1]
Output: 1
Explanation: Root is considered good.
```

**Constraints:**

- The number of nodes in the binary tree is in the range `[1, 10^5]`.
- Each node's value is between `[-10^4, 10^4]`.

## Idea1: DFS Recursive

Track the **maximum value** seen so far on the path from root to the current node. At each node, if `node.val >= maxSoFar`, it is a good node. Pass `max(maxSoFar, node.val)` down to children.

```
        3  (max=3, good)
       / \
      1   4  (max=3, 1<3 bad)  (max=3, 4>=3 good)
     /   / \
    3   1   5  (max=3, 3>=3 good) (max=4, 1<4 bad) (max=4, 5>=4 good)

Good nodes: 3, 4, 5, 3 (left-left) = 4
```

Complexity: Time $O(n)$ — visit each node once, Space $O(h)$ — recursion stack where $h$ is tree height.

### Java

```java []
package tree;

import struct.TreeNode;

// lc 1448, DFS recursive. O(n) time, O(h) space.
public static int goodNodes(TreeNode root) {
    return dfs(root, Integer.MIN_VALUE);
}

private static int dfs(TreeNode node, int maxSoFar) {
    if (node == null) return 0;
    int count = node.val >= maxSoFar ? 1 : 0;        // O(1) check
    int newMax = Math.max(maxSoFar, node.val);
    count += dfs(node.left, newMax);                   // O(left subtree)
    count += dfs(node.right, newMax);                  // O(right subtree)
    return count;
}
```

```python []
# lc 1448, DFS recursive. O(n) time, O(h) space.
def goodNodes(self, root: TreeNode) -> int:
    def dfs(node: Optional[TreeNode], max_so_far: int) -> int:
        if not node:
            return 0
        good = 1 if node.val >= max_so_far else 0     # O(1)
        new_max = max(max_so_far, node.val)
        good += dfs(node.left, new_max)                # O(left subtree)
        good += dfs(node.right, new_max)               # O(right subtree)
        return good                                    # O(n) time, O(h) space
    return dfs(root, root.val)
```

```cpp []
// lc 1448, DFS recursive. O(n) time, O(h) space.
int goodNodes(TreeNode* root) {
    return dfs(root, root->val);
}

int dfs(TreeNode* node, int maxSoFar) {
    if (!node) return 0;
    int count = (node->val >= maxSoFar) ? 1 : 0;
    int newMax = std::max(maxSoFar, node->val);
    return count + dfs(node->left, newMax) + dfs(node->right, newMax);
}
```

```rust []
// lc 1448, DFS recursive. O(n) time, O(h) space.
pub fn good_nodes(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    fn dfs(node: Option<Rc<RefCell<TreeNode>>>, max_so_far: i32) -> i32 {
        match node {
            None => 0,
            Some(n) => {
                let n = n.borrow();
                let good = if n.val >= max_so_far { 1 } else { 0 };
                let new_max = max_so_far.max(n.val);
                good + dfs(n.left.clone(), new_max) + dfs(n.right.clone(), new_max)
            }
        }
    }
    dfs(root, i32::MIN)
}
```

## Idea2: BFS Iterative

Use a **queue** that stores `(node, maxSoFar)` pairs. Process level by level — at each node, check if it is good, then enqueue children with the updated max.

```
Queue: [(3, 3)]
Pop (3,3): 3>=3 good, enqueue (1,3), (4,3)       count=1
Pop (1,3): 1<3 bad,  enqueue (3,3)                count=1
Pop (4,3): 4>=3 good, enqueue (1,4), (5,4)        count=2
Pop (3,3): 3>=3 good                              count=3
Pop (1,4): 1<4 bad                                count=3
Pop (5,4): 5>=4 good                              count=4
```

Complexity: Time $O(n)$, Space $O(w)$ where $w$ is the maximum width of the tree.

### Java

```java []
package tree;

import struct.TreeNode;
import java.util.LinkedList;
import java.util.Queue;

// lc 1448, BFS iterative. O(n) time, O(w) space.
public static int goodNodes2(TreeNode root) {
    if (root == null) return 0;
    int count = 0;
    Queue<Object[]> queue = new LinkedList<>();
    queue.offer(new Object[]{root, root.val});
    while (!queue.isEmpty()) {                          // O(n) iterations
        Object[] pair = queue.poll();
        TreeNode node = (TreeNode) pair[0];
        int maxSoFar = (int) pair[1];
        if (node.val >= maxSoFar) count++;              // O(1)
        int newMax = Math.max(maxSoFar, node.val);
        if (node.left != null) queue.offer(new Object[]{node.left, newMax});
        if (node.right != null) queue.offer(new Object[]{node.right, newMax});
    }
    return count;
}
```

```python []
# lc 1448, BFS iterative. O(n) time, O(w) space.
def goodNodes(self, root: TreeNode) -> int:
    count = 0
    q = deque([(root, root.val)])                       # O(w) space
    while q:
        node, max_so_far = q.popleft()                  # O(1)
        if node.val >= max_so_far:
            count += 1
        new_max = max(max_so_far, node.val)
        if node.left:
            q.append((node.left, new_max))
        if node.right:                                  # O(n) time total
            q.append((node.right, new_max))
    return count
```

```cpp []
// lc 1448, BFS iterative. O(n) time, O(w) space.
int goodNodesBfs(TreeNode* root) {
    if (!root) return 0;
    int count = 0;
    std::queue<std::pair<TreeNode*, int>> q;
    q.push({root, root->val});
    while (!q.empty()) {                                // O(n) iterations
        auto [node, maxSoFar] = q.front();
        q.pop();
        if (node->val >= maxSoFar) count++;
        int newMax = std::max(maxSoFar, node->val);
        if (node->left) q.push({node->left, newMax});
        if (node->right) q.push({node->right, newMax});
    }
    return count;
}
```

```rust []
// lc 1448, BFS iterative. O(n) time, O(w) space.
pub fn good_nodes_bfs(root: Option<Rc<RefCell<TreeNode>>>) -> i32 {
    let mut count = 0;
    let mut queue: VecDeque<(Rc<RefCell<TreeNode>>, i32)> = VecDeque::new();
    if let Some(r) = root {
        queue.push_back((r, i32::MIN));
    }
    while let Some((node, max_so_far)) = queue.pop_front() { // O(n)
        let n = node.borrow();
        if n.val >= max_so_far { count += 1; }
        let new_max = max_so_far.max(n.val);
        if let Some(ref left) = n.left {
            queue.push_back((Rc::clone(left), new_max));
        }
        if let Some(ref right) = n.right {
            queue.push_back((Rc::clone(right), new_max));
        }
    }
    count
}
```
