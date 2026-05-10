---
author: JZ
pubDatetime: 2026-05-10T06:00:00Z
modDatetime: 2026-05-10T06:00:00Z
title: LeetCode 105 Construct Binary Tree from Preorder and Inorder Traversal
featured: true
tags:
  - a-tree
  - a-divide-and-conquer
  - a-hash-table
  - a-recursion
  - a-stack
description:
  "Solutions for LeetCode 105, medium, tags: array, hash table, divide and conquer, tree, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 105](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/description/)

Given two integer arrays `preorder` and `inorder` where `preorder` is the preorder traversal of a binary tree and `inorder` is the inorder traversal of the same tree, construct and return _the binary tree_.

```
Example 1:

Input: preorder = [3,9,20,15,7], inorder = [9,3,15,20,7]
Output: [3,9,20,null,null,15,7]

Example 2:

Input: preorder = [-1], inorder = [-1]
Output: [-1]

Constraints:

1 <= preorder.length <= 3000
inorder.length == preorder.length
-3000 <= preorder[i], inorder[i] <= 3000
preorder and inorder consist of unique values.
Each value of preorder also appears in inorder.
preorder is guaranteed to be the preorder traversal of the tree.
inorder is guaranteed to be the inorder traversal of the tree.
```

## Solution 1: Recursive DFS with HashMap

### Idea

The first element of `preorder` is always the root. Find that root's position in `inorder` — everything to its left is the left subtree, everything to its right is the right subtree. Recurse for both halves.

Use a HashMap to map each value to its index in `inorder` for $O(1)$ lookup instead of scanning each time.

A pointer `preIdx` walks through `preorder` left-to-right. For each recursive call, consume one element as the root, then build left subtree first (matching preorder's visit order), then right subtree.

```
preorder = [3, 9, 20, 15, 7]    inorder = [9, 3, 15, 20, 7]
                                  HashMap: {9:0, 3:1, 15:2, 20:3, 7:4}

preIdx=0, root=3, inorder split at index 1:
  left inorder:  [9]             right inorder: [15, 20, 7]
       |                              |
  preIdx=1, root=9               preIdx=2, root=20, split at 3:
  left=[], right=[]                left=[15]       right=[7]
                                   preIdx=3,root=15  preIdx=4,root=7

Result:
        3
       / \
      9   20
         /  \
        15   7
```

Complexity: Time $O(n)$ — each node visited once. Space $O(n)$ — HashMap $O(n)$, recursion stack $O(n)$ worst case (skewed tree).

#### Java

```java []
// O(n) time, O(n) space. Recursive DFS with HashMap.
static class Solution {
    HashMap<Integer, Integer> memo = new HashMap<>(); // val->index for inorder
    int[] pre;
    int crip; // cur root index in pre

    public TreeNode buildTree(int[] preorder, int[] inorder) {
        for (int i = 0; i < inorder.length; i++) memo.put(inorder[i], i);
        pre = preorder;
        crip = 0;
        return dfs(0, inorder.length - 1);
    }

    private TreeNode dfs(int l, int r) {
        if (l > r) return null;
        int root = pre[crip++];
        TreeNode n = new TreeNode(root);
        int mid = memo.get(root);
        n.left = dfs(l, mid - 1);
        n.right = dfs(mid + 1, r);
        return n;
    }
}
```

#### Python

```python []
class Solution:
    """Recursive DFS with HashMap. O(n) time, O(n) space."""

    def buildTree(self, preorder: List[int], inorder: List[int]) -> Optional[TreeNode]:
        val_idx = {v: i for i, v in enumerate(inorder)}  # O(n) space
        self.pre_id = 0

        def dfs(lo: int, hi: int) -> Optional[TreeNode]:  # O(n) time, each node visited once
            if lo > hi:
                return None
            root_val = preorder[self.pre_id]
            self.pre_id += 1
            node = TreeNode(root_val)
            mid = val_idx[root_val]
            node.left = dfs(lo, mid - 1)
            node.right = dfs(mid + 1, hi)
            return node

        return dfs(0, len(inorder) - 1)
```

#### C++

```cpp []
// Recursive DFS with HashMap — O(n) time, O(n) space
class Solution {
public:
    TreeNode* buildTree(vector<int>& preorder, vector<int>& inorder) {
        unordered_map<int, int> inMap; // val -> index in inorder
        for (int i = 0; i < (int)inorder.size(); ++i)
            inMap[inorder[i]] = i;
        int preIdx = 0;
        return build(preorder, preIdx, inMap, 0, (int)inorder.size() - 1);
    }

private:
    TreeNode* build(vector<int>& preorder, int& preIdx,
                    unordered_map<int, int>& inMap, int inLeft, int inRight) {
        if (inLeft > inRight) return nullptr;
        int rootVal = preorder[preIdx++];
        TreeNode* root = new TreeNode(rootVal);
        int inIdx = inMap[rootVal]; // O(1) lookup
        root->left = build(preorder, preIdx, inMap, inLeft, inIdx - 1);
        root->right = build(preorder, preIdx, inMap, inIdx + 1, inRight);
        return root;
    }
};
```

#### Rust

```rust []
/// Solution 1: Recursive DFS with HashMap
/// Time: O(n), Space: O(n)
pub struct Solution;

impl Solution {
    pub fn build_tree(preorder: Vec<i32>, inorder: Vec<i32>) -> Option<Rc<RefCell<TreeNode>>> {
        let inorder_map: HashMap<i32, usize> = inorder.iter().enumerate().map(|(i, &v)| (v, i)).collect();
        Self::helper(&preorder, &mut 0, 0, inorder.len() as i32 - 1, &inorder_map)
    }

    fn helper(
        preorder: &[i32],
        pre_idx: &mut usize,
        in_left: i32,
        in_right: i32,
        inorder_map: &HashMap<i32, usize>,
    ) -> Option<Rc<RefCell<TreeNode>>> {
        if in_left > in_right {
            return None;
        }
        let root_val = preorder[*pre_idx];
        *pre_idx += 1;
        let in_idx = *inorder_map.get(&root_val).unwrap() as i32;

        let left = Self::helper(preorder, pre_idx, in_left, in_idx - 1, inorder_map);
        let right = Self::helper(preorder, pre_idx, in_idx + 1, in_right, inorder_map);

        Some(Rc::new(RefCell::new(TreeNode { val: root_val, left, right })))
    }
}
```

## Solution 2: Iterative with Stack

### Idea

Process `preorder` elements left-to-right. Maintain a stack of ancestors and an `inIdx` pointer into `inorder`.

Key insight: in preorder, the next element is either the **left child** of the stack top, or the **right child** of some ancestor. We use `inorder` to determine which:

- If stack top's value ≠ `inorder[inIdx]`, the next node is a **left child** of the stack top.
- Otherwise, pop nodes from the stack while they match `inorder[inIdx]` (advancing `inIdx`). The last popped node's right child is the next node.

```
preorder = [3, 9, 20, 15, 7]    inorder = [9, 3, 15, 20, 7]

Step 0: root=3,       stack=[3],       inIdx=0
Step 1: val=9,  stk.top=3≠io[0]=9 → 3.left=9,   stack=[3,9],     inIdx=0
Step 2: val=20, stk.top=9==io[0]=9 → pop 9(inIdx=1), 3==io[1]=3 → pop 3(inIdx=2)
        → 3.right=20,  stack=[20],      inIdx=2
Step 3: val=15, stk.top=20≠io[2]=15 → 20.left=15, stack=[20,15],   inIdx=2
Step 4: val=7,  stk.top=15==io[2]=15 → pop 15(inIdx=3), 20==io[3]=20 → pop 20(inIdx=4)
        → 20.right=7,  stack=[7],       inIdx=4

Result:
        3
       / \
      9   20
         /  \
        15   7
```

Complexity: Time $O(n)$ — each node pushed and popped at most once. Space $O(n)$ — stack holds at most $n$ nodes.

#### Java

```java []
// O(n) time, O(n) space. Iterative with stack.
static class Solution2 {
    public TreeNode buildTree(int[] preorder, int[] inorder) {
        if (preorder == null || preorder.length == 0) return null;
        ArrayDeque<TreeNode> stack = new ArrayDeque<>();
        TreeNode root = new TreeNode(preorder[0]);
        stack.push(root);
        int inIdx = 0;
        for (int i = 1; i < preorder.length; i++) {
            TreeNode node = new TreeNode(preorder[i]);
            if (stack.peek().val != inorder[inIdx]) {
                stack.peek().left = node;
            } else {
                TreeNode parent = null;
                while (!stack.isEmpty() && stack.peek().val == inorder[inIdx]) {
                    parent = stack.pop();
                    inIdx++;
                }
                parent.right = node;
            }
            stack.push(node);
        }
        return root;
    }
}
```

#### Python

```python []
class Solution2:
    """Iterative with stack. O(n) time, O(n) space."""

    def buildTree(self, preorder: List[int], inorder: List[int]) -> Optional[TreeNode]:
        if not preorder:
            return None
        root = TreeNode(preorder[0])
        stack = [root]  # O(n) space
        in_idx = 0
        for i in range(1, len(preorder)):  # O(n) time, each node pushed/popped once
            val = preorder[i]
            node = TreeNode(val)
            if stack[-1].val != inorder[in_idx]:
                stack[-1].left = node
            else:
                parent = None
                while stack and stack[-1].val == inorder[in_idx]:
                    parent = stack.pop()
                    in_idx += 1
                parent.right = node
            stack.append(node)
        return root
```

#### C++

```cpp []
// Iterative with stack — O(n) time, O(n) space
class Solution2 {
public:
    TreeNode* buildTree(vector<int>& preorder, vector<int>& inorder) {
        if (preorder.empty()) return nullptr;
        TreeNode* root = new TreeNode(preorder[0]);
        stack<TreeNode*> stk;
        stk.push(root);
        int inIdx = 0;
        for (int i = 1; i < (int)preorder.size(); ++i) {
            TreeNode* node = new TreeNode(preorder[i]);
            if (stk.top()->val != inorder[inIdx]) {
                // node is left child of stack top
                stk.top()->left = node;
            } else {
                // pop until top != inorder[inIdx], node is right child of last popped
                TreeNode* parent = nullptr;
                while (!stk.empty() && stk.top()->val == inorder[inIdx]) {
                    parent = stk.top();
                    stk.pop();
                    ++inIdx;
                }
                parent->right = node;
            }
            stk.push(node);
        }
        return root;
    }
};
```

#### Rust

```rust []
/// Solution 2: Iterative with stack
/// Time: O(n), Space: O(n)
pub struct Solution2;

impl Solution2 {
    pub fn build_tree(preorder: Vec<i32>, inorder: Vec<i32>) -> Option<Rc<RefCell<TreeNode>>> {
        if preorder.is_empty() {
            return None;
        }

        let root = Rc::new(RefCell::new(TreeNode::new(preorder[0])));
        let mut stack: Vec<Rc<RefCell<TreeNode>>> = vec![Rc::clone(&root)];
        let mut in_idx = 0;

        for i in 1..preorder.len() {
            let node = Rc::new(RefCell::new(TreeNode::new(preorder[i])));
            let mut parent = Rc::clone(stack.last().unwrap());

            if stack.last().unwrap().borrow().val != inorder[in_idx] {
                // Attach as left child
                parent.borrow_mut().left = Some(Rc::clone(&node));
            } else {
                // Pop until we find the parent for the right child
                while !stack.is_empty() && stack.last().unwrap().borrow().val == inorder[in_idx] {
                    parent = Rc::clone(stack.last().unwrap());
                    stack.pop();
                    in_idx += 1;
                }
                parent.borrow_mut().right = Some(Rc::clone(&node));
            }
            stack.push(node);
        }

        Some(root)
    }
}
```
