---
author: JZ
pubDatetime: 2026-06-04T08:00:00Z
modDatetime: 2026-06-04T08:00:00Z
title: LeetCode 236 Lowest Common Ancestor of a Binary Tree
featured: true
tags:
  - a-tree
  - a-dfs
  - a-binary-tree
description:
  "Solutions for LeetCode 236, medium, tags: tree, dfs, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 236](https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/description/)

Given a binary tree, find the lowest common ancestor (LCA) of two given nodes in the tree.

According to the definition of LCA on Wikipedia: "The lowest common ancestor is defined between two nodes p and q as the lowest node in T that has both p and q as descendants (where we allow a node to be a descendant of itself)."

```
Example 1:

Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1
Output: 3
Explanation: The LCA of nodes 5 and 1 is 3.

Example 2:

Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 4
Output: 5
Explanation: The LCA of nodes 5 and 4 is 5, since a node can be a descendant of itself
according to the LCA definition.

Example 3:

Input: root = [1,2], p = 1, q = 2
Output: 1
```

**Constraints:**

- The number of nodes in the tree is in the range `[2, 10⁵]`.
- `-10⁹ <= Node.val <= 10⁹`
- All `Node.val` are unique.
- `p != q`
- `p` and `q` will exist in the tree.

## Idea 1: Recursive DFS

The key insight is: for each node, recursively search left and right subtrees for p and q.

- If the current node is `null`, `p`, or `q`, return it immediately.
- If both left and right recursive calls return non-null, the current node is the LCA (p and q are in different subtrees).
- Otherwise, propagate the non-null result upward.

```
         3          p=5, q=1
        / \
       5   1        left=5(found p), right=1(found q)
      / \   / \     both non-null → return 3 (root)
     6  2  0   8
       / \
      7   4
```

Complexity: Time $O(n)$, Space $O(h)$ where $h$ is tree height (recursion stack).

## Idea 2: Iterative with Parent Map

Build a parent pointer map using BFS/DFS until both p and q are found. Then trace all ancestors of p into a set, and walk up from q until hitting a node in that set.

```
Step 1: BFS to build parent map
  parent[3]=null, parent[5]=3, parent[1]=3, parent[6]=5, parent[2]=5, ...

Step 2: Trace p=5 ancestors → {5, 3}

Step 3: Walk up from q=4: 4→2→5 → 5 is in ancestors set ✓
  Answer: 5
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// solution 1, recursive dfs. 5ms, 43.3 Mb. O(n) time and O(h) space.
public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
    if (root == null || root == p || root == q) return root;
    TreeNode left = lowestCommonAncestor(root.left, p, q);
    TreeNode right = lowestCommonAncestor(root.right, p, q);
    if (left != null && right != null) return root;
    else if (left != null) return left;
    else return right;
}
```
```java []
// solution 2, iterative with parent map. 12ms, 42.9 Mb. O(n) time and space.
public TreeNode lowestCommonAncestorI2(TreeNode root, TreeNode p, TreeNode q) {
    Deque<TreeNode> stack = new ArrayDeque<>();
    Map<TreeNode, TreeNode> parent = new HashMap<>();
    parent.put(root, null);
    stack.push(root);
    while (!parent.containsKey(p) || !parent.containsKey(q)) {
        TreeNode cur = stack.pop();
        if (cur.left != null) {
            parent.put(cur.left, cur);
            stack.push(cur.left);
        }
        if (cur.right != null) {
            parent.put(cur.right, cur);
            stack.push(cur.right);
        }
    }
    Set<TreeNode> ancestors = new HashSet<>();
    while (p != null) {
        ancestors.add(p);
        p = parent.get(p);
    }
    while (!ancestors.contains(q)) q = parent.get(q);
    return q;
}
```

### Python

```python []
# solution 1, recursive dfs. O(n) time, O(h) space.
class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        if root is None or root is p or root is q:
            return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        if left and right:
            return root
        return left if left else right
```
```python []
# solution 2, iterative with parent map. O(n) time, O(n) space.
class Solution2:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        stack = [root]
        parent = {root: None}
        while p not in parent or q not in parent:  # O(n)
            node = stack.pop()
            if node.left:
                parent[node.left] = node
                stack.append(node.left)
            if node.right:
                parent[node.right] = node
                stack.append(node.right)
        ancestors = set()
        while p:  # O(h)
            ancestors.add(p)
            p = parent[p]
        while q not in ancestors:  # O(h)
            q = parent[q]
        return q
```

### C++

```cpp []
// solution 1, recursive dfs. O(n) time, O(h) space.
TreeNode *lowestCommonAncestor(TreeNode *root, TreeNode *p, TreeNode *q) {
    if (!root || root == p || root == q) return root;
    TreeNode *left = lowestCommonAncestor(root->left, p, q);
    TreeNode *right = lowestCommonAncestor(root->right, p, q);
    if (left && right) return root;
    return left ? left : right;
}
```
```cpp []
// solution 2, iterative with parent map. O(n) time, O(n) space.
TreeNode *lowestCommonAncestorIterative(TreeNode *root, TreeNode *p, TreeNode *q) {
    if (!root) return nullptr;
    std::unordered_map<TreeNode *, TreeNode *> parent;
    parent[root] = nullptr;
    std::vector<TreeNode *> stack = {root};
    while (parent.find(p) == parent.end() || parent.find(q) == parent.end()) {
        TreeNode *node = stack.back();
        stack.pop_back();
        if (node->left) {
            parent[node->left] = node;
            stack.push_back(node->left);
        }
        if (node->right) {
            parent[node->right] = node;
            stack.push_back(node->right);
        }
    }
    std::unordered_set<TreeNode *> ancestors;
    while (p) {
        ancestors.insert(p);
        p = parent[p];
    }
    while (ancestors.find(q) == ancestors.end()) {
        q = parent[q];
    }
    return q;
}
```

### Rust

```rust []
// solution 1, recursive dfs. O(n) time, O(h) space.
pub fn lowest_common_ancestor(root: Node, p: Node, q: Node) -> Node {
    let p_val = p.as_ref()?.borrow().val;
    let q_val = q.as_ref()?.borrow().val;
    Self::dfs(&root, p_val, q_val)
}

fn dfs(node: &Node, p: i32, q: i32) -> Node {
    let n = node.as_ref()?;
    let val = n.borrow().val;
    if val == p || val == q {
        return node.clone();
    }
    let left = Self::dfs(&n.borrow().left, p, q);
    let right = Self::dfs(&n.borrow().right, p, q);
    match (left.is_some(), right.is_some()) {
        (true, true) => node.clone(),
        (true, false) => left,
        (false, true) => right,
        _ => None,
    }
}
```
```rust []
// solution 2, iterative with parent map. O(n) time, O(n) space.
pub fn lowest_common_ancestor(root: Node, p: Node, q: Node) -> Node {
    let p_val = p.as_ref().unwrap().borrow().val;
    let q_val = q.as_ref().unwrap().borrow().val;
    let mut parent: HashMap<i32, Node> = HashMap::new();
    parent.insert(root.as_ref().unwrap().borrow().val, None);
    let mut queue = VecDeque::new();
    queue.push_back(root.clone());
    while !parent.contains_key(&p_val) || !parent.contains_key(&q_val) {
        let node = queue.pop_front().unwrap();
        let n = node.as_ref().unwrap().borrow();
        if let Some(ref left) = n.left {
            parent.insert(left.borrow().val, node.clone());
            queue.push_back(Some(left.clone()));
        }
        if let Some(ref right) = n.right {
            parent.insert(right.borrow().val, node.clone());
            queue.push_back(Some(right.clone()));
        }
    }
    let mut ancestors: HashSet<i32> = HashSet::new();
    let mut cur_val = Some(p_val);
    while let Some(v) = cur_val {
        ancestors.insert(v);
        cur_val = parent.get(&v).and_then(|p| p.as_ref().map(|n| n.borrow().val));
    }
    let mut cur_val = Some(q_val);
    while let Some(v) = cur_val {
        if ancestors.contains(&v) {
            return Self::find_node(&root, v);
        }
        cur_val = parent.get(&v).and_then(|p| p.as_ref().map(|n| n.borrow().val));
    }
    None
}
```
