---
author: JZ
pubDatetime: 2026-05-19T06:00:00Z
modDatetime: 2026-05-19T06:00:00Z
title: LeetCode 105 Construct Binary Tree from Preorder and Inorder Traversal
featured: true
tags:
  - a-tree
  - a-divide-and-conquer
  - a-hash-table
  - a-binary-tree
description:
  "Solutions for LeetCode 105, medium, tags: array, hash table, divide and conquer, tree, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 105](https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/description/)

Given two integer arrays `preorder` and `inorder` where `preorder` is the preorder traversal of a binary tree and `inorder` is the inorder traversal of the same tree, construct and return *the binary tree*.

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

The first element in `preorder` is always the root. Find that root's index in `inorder` — everything to its left is the left subtree, everything to its right is the right subtree. Recurse on each half, advancing the preorder index.

Use a HashMap to get O(1) root-index lookups in `inorder` instead of scanning each time.

```
preorder: [3, 9, 20, 15, 7]    inorder: [9, 3, 15, 20, 7]
            ^root                            ^   ^root

Step 1: root = preorder[0] = 3
        inorder index of 3 is 1
        left subtree inorder:  [9]        (indices 0..0)
        right subtree inorder: [15,20,7]  (indices 2..4)

Step 2: next preorder element = 9 -> left child of 3
        inorder index of 9 is 0
        left/right subtrees empty -> leaf

Step 3: next preorder element = 20 -> right child of 3
        inorder index of 20 is 3
        left subtree inorder:  [15]  (index 2..2)
        right subtree inorder: [7]   (index 4..4)

Result:
        3
       / \
      9   20
         /  \
        15    7
```

Complexity: Time $O(n)$ — each node visited exactly once. Space $O(n)$ — HashMap $O(n)$, recursion stack $O(n)$ worst case (skewed tree).

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
/// Recursive DFS with HashMap — O(n) time, O(n) space
impl Solution {
    pub fn build_tree(preorder: Vec<i32>, inorder: Vec<i32>) -> Option<Rc<RefCell<TreeNode>>> {
        let inorder_map: HashMap<i32, usize> =
            inorder.iter().enumerate().map(|(i, &v)| (v, i)).collect();
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

Process `preorder` elements left-to-right. Maintain a stack tracking the path from root downward. Use `inorder` to decide when to stop going left and attach a right child instead.

Key insight: as long as the stack top doesn't match the current `inorder` element, the next preorder value is a left child. When it does match, pop the stack (advancing the inorder pointer) until it no longer matches — the next preorder value is the right child of the last popped node.

```
preorder: [3, 9, 20, 15, 7]    inorder: [9, 3, 15, 20, 7]

i=0: root=3, stack=[3], inIdx=0
i=1: stack.top()=3 != inorder[0]=9 -> 9 is left child of 3
     stack=[3,9], inIdx=0
i=2: stack.top()=9 == inorder[0]=9 -> pop 9 (inIdx=1)
     stack.top()=3 == inorder[1]=3 -> pop 3 (inIdx=2)
     stack empty -> 20 is right child of 3
     stack=[20], inIdx=2
i=3: stack.top()=20 != inorder[2]=15 -> 15 is left child of 20
     stack=[20,15], inIdx=2
i=4: stack.top()=15 == inorder[2]=15 -> pop 15 (inIdx=3)
     stack.top()=20 == inorder[3]=20 -> pop 20 (inIdx=4)
     stack empty -> 7 is right child of 20
     stack=[7], inIdx=4
```

Complexity: Time $O(n)$ — each node pushed and popped exactly once. Space $O(n)$ — stack holds at most $n$ nodes.

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
        for (int i = 1; i < preorder.length; i++) { // O(n) each node pushed/popped once
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
        for (int i = 1; i < (int)preorder.size(); ++i) { // O(n) each node pushed/popped once
            TreeNode* node = new TreeNode(preorder[i]);
            if (stk.top()->val != inorder[inIdx]) {
                stk.top()->left = node;
            } else {
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
/// Iterative with stack — O(n) time, O(n) space
impl Solution2 {
    pub fn build_tree(preorder: Vec<i32>, inorder: Vec<i32>) -> Option<Rc<RefCell<TreeNode>>> {
        if preorder.is_empty() {
            return None;
        }

        let root = Rc::new(RefCell::new(TreeNode::new(preorder[0])));
        let mut stack: Vec<Rc<RefCell<TreeNode>>> = vec![Rc::clone(&root)];
        let mut in_idx = 0;

        for i in 1..preorder.len() { // O(n) each node pushed/popped once
            let node = Rc::new(RefCell::new(TreeNode::new(preorder[i])));
            let mut parent = Rc::clone(stack.last().unwrap());

            if stack.last().unwrap().borrow().val != inorder[in_idx] {
                parent.borrow_mut().left = Some(Rc::clone(&node));
            } else {
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
