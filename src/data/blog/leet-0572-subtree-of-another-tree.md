---
author: JZ
pubDatetime: 2026-09-14T11:00:00Z
modDatetime: 2026-09-14T11:00:00Z
title: LeetCode 572 Subtree of Another Tree
featured: true
tags:
  - a-tree
  - a-dfs
  - a-string-matching
  - a-binary-tree
description:
  "Solutions for LeetCode 572, easy, tags: tree, dfs, string matching, binary tree, hash function."
---

## Table of contents

## Description

Question Links: [LeetCode 572](https://leetcode.com/problems/subtree-of-another-tree/description/)

Given the roots of two binary trees `root` and `subRoot`, return `true` if there is a subtree of `root` with the same structure and node values of `subRoot` and `false` otherwise.

A subtree of a binary tree `tree` is a tree that consists of a node in `tree` and all of this node's descendants. The tree `tree` could also be considered as a subtree of itself.

```
Example 1:

Input: root = [3,4,5,1,2], subRoot = [4,1,2]
Output: true

Example 2:

Input: root = [3,4,5,1,2,null,null,null,null,0], subRoot = [4,1,2]
Output: false
```

**Constraints:**

- The number of nodes in the root tree is in the range `[1, 2000]`. Let `m` = number of nodes in root.
- The number of nodes in the subRoot tree is in the range `[1, 1000]`. Let `n` = number of nodes in subRoot.
- `-10⁴ <= root.val <= 10⁴`
- `-10⁴ <= subRoot.val <= 10⁴`

## Idea 1: Recursive DFS

For each node in `root`, check whether the subtree rooted at that node is identical to `subRoot`. The helper `isSameTree` compares two trees node-by-node.

```
       3          sub = [4,1,2]
      / \
     4   5        isSameTree(node4, sub) → match left(1==1), right(2==2) ✓
    / \
   1   2
```

- The outer `isSubtree` visits every node in `root`: O(m) calls.
- Each call may invoke `isSameTree` which compares up to O(n) nodes.

Complexity: Time $O(m \cdot n)$ worst case, Space $O(m)$ recursion stack.

## Idea 2: Tree Serialization

Serialize both trees into strings using pre-order traversal with null markers (`#`) and comma delimiters. Then check if the serialized `subRoot` is a substring of the serialized `root`.

The comma delimiters are critical to avoid false matches: without them, node value `12` could falsely match `2`.

```
root  = [3,4,5,1,2]  → ",3,,4,,1,#,#,,2,#,#,,5,#,#"
sub   = [4,1,2]      → ",4,,1,#,#,,2,#,#"
                         ^^^^^^^^^^^^^^^^^ found in root string ✓

root  = [12]  → ",12,#,#"
sub   = [2]   → ",2,#,#"     not found ✗ (comma prevents "12" matching "2")
```

Complexity: Time $O(m + n)$ with built-in string search, Space $O(m + n)$ for the serialized strings.

### Java

```java []
// solution 1, recursive DFS. 2ms, 42 Mb. O(m*n) time, O(m) space.
public boolean isSubtree(TreeNode root, TreeNode subRoot) {
    if (root == null) return false;
    return identical(root, subRoot) || isSubtree(root.left, subRoot) || isSubtree(root.right, subRoot);
}

private boolean identical(TreeNode a, TreeNode b) {
    if (a == null || b == null) return a == b;
    return a.val == b.val && identical(a.left, b.left) && identical(a.right, b.right);
}
```
```java []
// solution 2, serialization + KMP. 5ms, 42.3 Mb. O(m+n) time and space.
static final String COMMA = ",";
static final String NULL_NODE = "#";

public boolean isSubtreeString(TreeNode root, TreeNode subRoot) {
    StringBuilder sb = new StringBuilder(), sb2 = new StringBuilder();
    preOrderHelper(root, sb);
    preOrderHelper(subRoot, sb2);
    KMP1D kmp = new KMP1D(sb2.toString());
    return kmp.inHaystack(sb.toString());
}

private void preOrderHelper(TreeNode node, StringBuilder sb) {
    if (node == null) sb.append(NULL_NODE);
    else {
        sb.append(COMMA).append(node.val).append(COMMA); // comma prevents [12] matching [2]
        preOrderHelper(node.left, sb);
        sb.append(COMMA);
        preOrderHelper(node.right, sb);
    }
}
```
```java []
// solution 3, tree hashing. 7ms, 49.4 Mb. O(m+n) time and space.
final int MOD_1 = 1000000007;
final int MOD_2 = 2147483647;
List<long[]> memo = new ArrayList<>();

long[] hashSubtreeAtNode(TreeNode node, boolean needToAdd) {
    if (node == null) return new long[]{3, 7};
    long[] left = hashSubtreeAtNode(node.left, needToAdd);
    long[] right = hashSubtreeAtNode(node.right, needToAdd);
    long left1 = (left[0] << 5) % MOD_1;
    long right1 = (right[0] << 1) % MOD_1;
    long left2 = (left[1] << 7) % MOD_2;
    long right2 = (right[1] << 1) % MOD_2;
    long[] hashPair = {(left1 + right1 + node.val) % MOD_1,
            (left2 + right2 + node.val) % MOD_2};
    if (needToAdd) memo.add(hashPair);
    return hashPair;
}

public boolean isSubtreeHash(TreeNode root, TreeNode subRoot) {
    hashSubtreeAtNode(root, true);
    long[] s = hashSubtreeAtNode(subRoot, false);
    for (long[] m : memo) if (m[0] == s[0] && m[1] == s[1]) return true;
    return false;
}
```

### Python

```python []
# solution 1, recursive DFS. O(m*n) time, O(m) space.
class Solution:
    def isSubtree(self, root: Optional[TreeNode], subRoot: Optional[TreeNode]) -> bool:
        if root is None:
            return subRoot is None
        return self._same(root, subRoot) or self.isSubtree(root.left, subRoot) or self.isSubtree(root.right, subRoot)

    def _same(self, a: Optional[TreeNode], b: Optional[TreeNode]) -> bool:  # O(min(m,n))
        if a is None or b is None:
            return a is b
        return a.val == b.val and self._same(a.left, b.left) and self._same(a.right, b.right)
```
```python []
# solution 2, serialization + substring. O(m+n) time, O(m+n) space.
class Solution2:
    def isSubtree(self, root: Optional[TreeNode], subRoot: Optional[TreeNode]) -> bool:
        def serialize(node: Optional[TreeNode]) -> str:
            if node is None:
                return "#"
            return f",{node.val}," + serialize(node.left) + "," + serialize(node.right)  # O(n) nodes

        return serialize(subRoot) in serialize(root)  # O(m+n) with built-in string search
```

### C++

```cpp []
// solution 1, recursive DFS. O(m*n) time, O(m) space.
bool isSubtree(TreeNode* root, TreeNode* subRoot) {
    if (!root) return !subRoot;
    if (isSameTree(root, subRoot)) return true;
    return isSubtree(root->left, subRoot) || isSubtree(root->right, subRoot);
}

bool isSameTree(TreeNode* s, TreeNode* t) {
    if (!s && !t) return true;
    if (!s || !t) return false;
    if (s->val != t->val) return false;
    return isSameTree(s->left, t->left) && isSameTree(s->right, t->right);
}
```
```cpp []
// solution 2, serialization + string::find. O(m+n) time, O(m+n) space.
bool isSubtreeSerial(TreeNode* root, TreeNode* subRoot) {
    std::string s = serialize(root);
    std::string t = serialize(subRoot);
    return s.find(t) != std::string::npos;
}

void serialize(TreeNode* node, std::string& out) {
    if (!node) {
        out += ",#";
        return;
    }
    out += "," + std::to_string(node->val); // comma delimiter prevents [12] matching [2]
    serialize(node->left, out);
    serialize(node->right, out);
}
```

### Rust

```rust []
// solution 1, recursive DFS. O(m*n) time, O(m) space.
pub fn is_subtree(root: Node, sub_root: Node) -> bool {
    fn is_same(a: &Node, b: &Node) -> bool {
        match (a, b) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                let a = a.borrow();
                let b = b.borrow();
                a.val == b.val && is_same(&a.left, &b.left) && is_same(&a.right, &b.right)
            }
            _ => false,
        }
    }
    fn check(root: &Node, sub: &Node) -> bool {
        match root {
            None => false,
            Some(n) => {
                if is_same(root, sub) { return true; }
                let n = n.borrow();
                check(&n.left, sub) || check(&n.right, sub)
            }
        }
    }
    check(&root, &sub_root)
}
```
```rust []
// solution 2, serialization + contains. O(m+n) time, O(m+n) space.
pub fn is_subtree_serial(root: Node, sub_root: Node) -> bool {
    fn serialize(node: &Node, buf: &mut String) {
        match node {
            None => buf.push_str(",#"),
            Some(n) => {
                let n = n.borrow();
                buf.push(',');
                buf.push_str(&n.val.to_string());
                serialize(&n.left, buf);
                serialize(&n.right, buf);
            }
        }
    }
    let mut s_root = String::new();
    serialize(&root, &mut s_root);
    let mut s_sub = String::new();
    serialize(&sub_root, &mut s_sub);
    s_root.contains(&s_sub)
}
```
