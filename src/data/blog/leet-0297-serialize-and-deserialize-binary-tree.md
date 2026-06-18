---
author: JZ
pubDatetime: 2026-06-11T10:06:00Z
modDatetime: 2026-06-11T10:06:00Z
title: LeetCode 297 Serialize and Deserialize Binary Tree
featured: false
tags:
  - a-tree
  - a-dfs
  - a-bfs
description:
  "Solutions for LeetCode 297, hard, tags: string, tree, binary tree, design, dfs, bfs."
---

## Table of contents

## Description

[LeetCode 297](https://leetcode.com/problems/serialize-and-deserialize-binary-tree/)

Serialization is the process of converting a data structure or object into a sequence of bits so that it can be stored in a file or memory buffer, or transmitted across a network connection link to be reconstructed later in the same or another computer environment.

Design an algorithm to serialize and deserialize a binary tree. There is no restriction on how your serialization/deserialization algorithm should work. You just need to ensure that a binary tree can be serialized to a string and this string can be deserialized to the original tree structure.

**Example 1:**

```
Input: root = [1,2,3,null,null,4,5]
Output: [1,2,3,null,null,4,5]
```

**Example 2:**

```
Input: root = []
Output: []
```

**Constraints:**

- The number of nodes in the tree is in the range `[0, 10^4]`.
- `-1000 <= Node.val <= 1000`

## Idea1: Preorder DFS

Serialize the tree using a preorder (root → left → right) traversal. Each node's value is recorded, and `null` children are represented with a sentinel `#`. Deserialization consumes tokens sequentially—each token either creates a node or terminates a branch.

```
Serialize [1,2,3,null,null,4,5]:

        1
       / \
      2   3
         / \
        4   5

Preorder output: "1,2,#,#,3,4,#,#,5,#,#"

Deserialize:
  token "1" -> create node(1)
    token "2" -> create node(2)
      token "#" -> null (left of 2)
      token "#" -> null (right of 2)
    token "3" -> create node(3)
      token "4" -> create node(4)
        token "#" -> null (left of 4)
        token "#" -> null (right of 4)
      token "5" -> create node(5)
        token "#" -> null (left of 5)
        token "#" -> null (right of 5)
```

Complexity: Time $O(n)$ — visit each node once. Space $O(n)$ — recursion stack up to $O(h)$ where $h$ is tree height, output string $O(n)$.

## Idea2: BFS Level-Order

Serialize the tree level-by-level using a queue. Each dequeued node appends its value, then enqueues its children (including nulls as sentinels). Deserialization pairs tokens with parent nodes via a queue.

```
Serialize [1,2,3,null,null,4,5]:

Level 0: 1
Level 1: 2, 3
Level 2: #, #, 4, 5
Level 3: #, #, #, #

BFS output: "1,2,3,#,#,4,5,#,#,#,#"
```

Complexity: Time $O(n)$, Space $O(n)$ — the queue holds up to $O(w)$ nodes where $w$ is the maximum width of the tree (worst case $n/2$ at the last level).

### Java

```java []
public class SerializeBT {
    static final String COMMA = ",";
    static final String NULL_NODE = "#";

    // Preorder recursive. O(n) time and O(h) space.
    public String serializePOR(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        preOrderHelper(root, sb);
        return sb.toString();
    }

    private void preOrderHelper(TreeNode node, StringBuilder sb) {
        if (node == null) sb.append(NULL_NODE);
        else {
            sb.append(node.val).append(COMMA);
            preOrderHelper(node.left, sb);
            sb.append(COMMA);
            preOrderHelper(node.right, sb);
        }
    }

    public TreeNode deserializePOR(String data) {
        Deque<String> nodes = new ArrayDeque<>();
        nodes.addAll(Arrays.asList(data.split(COMMA)));
        return buildTree(nodes);
    }

    private TreeNode buildTree(Deque<String> nodes) {
        String val = nodes.remove();
        if (val.equals(NULL_NODE)) return null;
        TreeNode node = new TreeNode(Integer.parseInt(val));
        node.left = buildTree(nodes);
        node.right = buildTree(nodes);
        return node;
    }

    // Level order iterative. O(n) time, O(n) space.
    public String serializeLOI(TreeNode root) {
        StringBuilder sb = new StringBuilder();
        Deque<TreeNode> q = new LinkedList<>();
        if (root != null) {
            q.add(root);
            sb.append(root.val);
        }
        while (!q.isEmpty()) {
            int size = q.size();
            for (int i = 0; i < size; i++) {
                TreeNode n = q.remove();
                String left = NULL_NODE, right = NULL_NODE;
                if (n.left != null) {
                    q.add(n.left);
                    left = String.valueOf(n.left.val);
                }
                if (n.right != null) {
                    right = String.valueOf(n.right.val);
                    q.add(n.right);
                }
                sb.append(COMMA).append(left).append(COMMA).append(right);
            }
        }
        return sb.toString();
    }

    public TreeNode deserializeLOI(String data) {
        String[] nodes = data.split(COMMA);
        Deque<TreeNode> q = new LinkedList<>();
        TreeNode root = readNode(nodes[0]);
        if (root == null) return null;
        int count = 0;
        q.add(root);
        while (!q.isEmpty()) {
            int size = q.size();
            for (int i = 0; i < size; i++) {
                TreeNode n = q.remove();
                n.left = readNode(nodes[count + 1]);
                n.right = readNode(nodes[count + 2]);
                if (n.left != null) q.add(n.left);
                if (n.right != null) q.add(n.right);
                count += 2;
            }
        }
        return root;
    }

    private TreeNode readNode(String s) {
        if ("#".equals(s) || "".equals(s)) return null;
        else return new TreeNode(Integer.parseInt(s));
    }
}
```

### Python

```python []
class Codec:
    """Preorder DFS serialization. O(n) time, O(n) space."""

    def serialize(self, root: 'TreeNode') -> str:
        tokens = []
        self._ser_helper(root, tokens)
        return ','.join(tokens)

    def _ser_helper(self, node, tokens):
        if node is None:
            tokens.append('#')
        else:
            tokens.append(str(node.val))  # O(1)
            self._ser_helper(node.left, tokens)  # O(left subtree)
            self._ser_helper(node.right, tokens)  # O(right subtree)

    def deserialize(self, data: str) -> 'TreeNode':
        tokens = iter(data.split(','))
        return self._deser_helper(tokens)

    def _deser_helper(self, tokens):
        val = next(tokens)
        if val == '#':
            return None
        node = TreeNode(int(val))
        node.left = self._deser_helper(tokens)
        node.right = self._deser_helper(tokens)
        return node


class Codec2:
    """BFS level-order serialization. O(n) time, O(n) space."""

    def serialize(self, root: 'TreeNode') -> str:
        if not root:
            return ''
        tokens = []
        queue = deque([root])
        while queue:
            node = queue.popleft()  # O(1) amortized
            if node:
                tokens.append(str(node.val))
                queue.append(node.left)  # O(1)
                queue.append(node.right)
            else:
                tokens.append('#')
        return ','.join(tokens)

    def deserialize(self, data: str) -> 'TreeNode':
        if not data:
            return None
        tokens = data.split(',')
        root = TreeNode(int(tokens[0]))
        queue = deque([root])
        i = 1
        while queue:
            node = queue.popleft()
            if tokens[i] != '#':
                node.left = TreeNode(int(tokens[i]))
                queue.append(node.left)
            i += 1
            if tokens[i] != '#':
                node.right = TreeNode(int(tokens[i]))
                queue.append(node.right)
            i += 1
        return root
```

### C++

```cpp []
class SerializeBT {
public:
    // DFS preorder - O(n) time, O(h) space
    std::string serialize_dfs(TreeNode* root) {
        std::string result;
        dfs_helper(root, result);
        if (!result.empty()) result.pop_back();
        return result;
    }

    TreeNode* deserialize_dfs(std::string data) {
        std::istringstream ss(data);
        return dfs_build(ss);
    }

    // BFS level-order - O(n) time, O(n) space
    std::string serialize_bfs(TreeNode* root) {
        if (!root) return "#";
        std::string result;
        std::queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {
            TreeNode* node = q.front();
            q.pop();
            if (node) {
                result += std::to_string(node->val) + ",";
                q.push(node->left);
                q.push(node->right);
            } else {
                result += "#,";
            }
        }
        if (!result.empty()) result.pop_back();
        return result;
    }

    TreeNode* deserialize_bfs(std::string data) {
        if (data.empty() || data == "#") return nullptr;
        std::istringstream ss(data);
        std::string token;
        std::getline(ss, token, ',');
        TreeNode* root = new TreeNode(std::stoi(token));
        std::queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {
            TreeNode* node = q.front();
            q.pop();
            if (std::getline(ss, token, ',')) {
                if (token != "#") {
                    node->left = new TreeNode(std::stoi(token));
                    q.push(node->left);
                }
            }
            if (std::getline(ss, token, ',')) {
                if (token != "#") {
                    node->right = new TreeNode(std::stoi(token));
                    q.push(node->right);
                }
            }
        }
        return root;
    }

private:
    void dfs_helper(TreeNode* node, std::string& result) {
        if (!node) { result += "#,"; return; }
        result += std::to_string(node->val) + ",";
        dfs_helper(node->left, result);
        dfs_helper(node->right, result);
    }

    TreeNode* dfs_build(std::istringstream& ss) {
        std::string token;
        if (!std::getline(ss, token, ',')) return nullptr;
        if (token == "#") return nullptr;
        TreeNode* node = new TreeNode(std::stoi(token));
        node->left = dfs_build(ss);
        node->right = dfs_build(ss);
        return node;
    }
};
```

### Rust

```rust []
use std::cell::RefCell;
use std::collections::VecDeque;
use std::rc::Rc;

pub struct Solution;

impl Solution {
    // DFS preorder - O(n) time, O(n) space
    pub fn serialize_dfs(root: Option<Rc<RefCell<TreeNode>>>) -> String {
        let mut result = Vec::new();
        Self::serialize_dfs_helper(&root, &mut result);
        result.join(",")
    }

    fn serialize_dfs_helper(node: &Option<Rc<RefCell<TreeNode>>>, result: &mut Vec<String>) {
        match node {
            None => result.push("null".to_string()),
            Some(n) => {
                let n = n.borrow();
                result.push(n.val.to_string());
                Self::serialize_dfs_helper(&n.left, result);
                Self::serialize_dfs_helper(&n.right, result);
            }
        }
    }

    pub fn deserialize_dfs(data: String) -> Option<Rc<RefCell<TreeNode>>> {
        if data.is_empty() { return None; }
        let tokens: Vec<&str> = data.split(',').collect();
        let mut idx = 0;
        Self::deserialize_dfs_helper(&tokens, &mut idx)
    }

    fn deserialize_dfs_helper(tokens: &[&str], idx: &mut usize) -> Option<Rc<RefCell<TreeNode>>> {
        if *idx >= tokens.len() { return None; }
        let token = tokens[*idx];
        *idx += 1;
        if token == "null" { return None; }
        let val: i32 = token.parse().unwrap();
        let left = Self::deserialize_dfs_helper(tokens, idx);
        let right = Self::deserialize_dfs_helper(tokens, idx);
        Some(Rc::new(RefCell::new(TreeNode { val, left, right })))
    }

    // BFS level-order - O(n) time, O(n) space
    pub fn serialize_bfs(root: Option<Rc<RefCell<TreeNode>>>) -> String {
        let mut result = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(root);
        while let Some(node) = queue.pop_front() {
            match node {
                None => result.push("null".to_string()),
                Some(n) => {
                    let n = n.borrow();
                    result.push(n.val.to_string());
                    queue.push_back(n.left.clone());
                    queue.push_back(n.right.clone());
                }
            }
        }
        while result.last().map_or(false, |s| s == "null") { result.pop(); }
        result.join(",")
    }

    pub fn deserialize_bfs(data: String) -> Option<Rc<RefCell<TreeNode>>> {
        if data.is_empty() { return None; }
        let tokens: Vec<&str> = data.split(',').collect();
        if tokens.is_empty() || tokens[0] == "null" { return None; }
        let root = Rc::new(RefCell::new(TreeNode::new(tokens[0].parse().unwrap())));
        let mut queue = VecDeque::new();
        queue.push_back(Rc::clone(&root));
        let mut i = 1;
        while let Some(node) = queue.pop_front() {
            if i < tokens.len() {
                if tokens[i] != "null" {
                    let left = Rc::new(RefCell::new(TreeNode::new(tokens[i].parse().unwrap())));
                    node.borrow_mut().left = Some(Rc::clone(&left));
                    queue.push_back(left);
                }
                i += 1;
            }
            if i < tokens.len() {
                if tokens[i] != "null" {
                    let right = Rc::new(RefCell::new(TreeNode::new(tokens[i].parse().unwrap())));
                    node.borrow_mut().right = Some(Rc::clone(&right));
                    queue.push_back(right);
                }
                i += 1;
            }
        }
        Some(root)
    }
}
```
