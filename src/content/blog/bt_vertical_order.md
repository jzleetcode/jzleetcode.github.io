---
author: JZ
pubDatetime: 2024-11-10T08:22:00Z
modDatetime: 2024-11-10T10:12:00Z
title: LeetCode 314 LintCode 651 Binary Tree Vertical Order Traversal 
featured: true
tags:
  - a-tree
  - a-hash
  - a-bfs
  - c-facebook
  - c-google
  - leetcode-locked
description:
  "solutions for LeetCode 314 LintCode 651 Binary Tree Vertical Order Traversal, tags: hash, bfs, tree, companies: facebook google"
---

## Table of contents

## Description

Links: [LintCode 651](https://www.lintcode.com/problem/651/), [LeetCode 314](https://leetcode.com/problems/vertical-order-traversal-of-a-binary-tree/)

Given a binary tree, return the vertical order traversal of its nodes' values. (i.e., from top to bottom, column by column).

If two nodes are in the same row and column, the order should be from left to right.

For each node at position (row, col), its left and right children will be at positions `(row + 1, col - 1)` and `(row + 1, col + 1)` respectively. The root of the tree is at `(0, 0)`.

Example

Example1

Input:  {3,9,20,#,#,15,7}
Output: [[9],[3,15],[20],[7]]
Explanation:
```
   3
  /\
 /  \
 9  20
    /\
   /  \
  15   7
```

Example2

Input: {3,9,8,4,0,1,7}
Output: [[4],[9],[3,0,1],[8],[7]]
Explanation:
```
     3
    /\
   /  \
   9   8
  /\  /\
 /  \/  \
 4  01   
```

Constraints:

- The number of nodes in the tree is in the range `[0, 100].`
- `-100 <= Node.val <= 100`


## Idea

We could use breath-first search (BFS) to traverse the tree and maintain a hash map for `column -> values`. In the queue for BFS traversal, we keep track of the column index as well as the tree node. After that, we collect the values in the hash map to the result (a list of lists of `int32`).

Complexity: Time O(n), Space O(n).

### C++

```cpp
// 20 ms, 2.82 mb
class Solution {
public:
    /**
     * @param root: the root of tree
     * @return: the vertical order traversal
     */
    vector<vector<int> > verticalOrder(TreeNode *root) {
        vector<vector<int> > res;
        if (root == nullptr) return res;
        unordered_map<int, vector<int> > colV; // col:vals
        deque<pair<TreeNode *, int> > q;
        int minC = 0, maxC = 0;
        q.emplace_back(root, 0);
        while (!q.empty()) {
            auto [n,c] = q.front();
            q.pop_front();
            colV[c].push_back(n->val);
            minC = min(minC, c);
            maxC = max(maxC, c);
            if (n->left) q.emplace_back(n->left, c - 1);
            if (n->right) q.emplace_back(n->right, c + 1);
        }
        for (int i = minC; i <= maxC; ++i) res.push_back(colV[i]);
        return res;
    }
};
```

### Python

```python
class Solution:
    """lint code, 81 ms, 5.01 mb"""

    def vertical_order(self, root: TreeNode) -> List[List[int]]:
        res = []
        if not root: return res
        col_nodes = defaultdict(list)
        min_c, max_c, q = 0, 0, deque()
        q.append((root, 0))
        while q:
            n, c = q.popleft()
            col_nodes[c].append(n.val)
            max_c, min_c = max(max_c, c), min(min_c, c)
            if n.left:
                q.append((n.left, c - 1))
            if n.right:
                q.append((n.right, c + 1))
        for i in range(min_c, max_c + 1):
            res.append(col_nodes[i])
        return res
```

### Java

```java
// solution 1, hashmap, n time, n space. LintCode 233ms, 20.17Mb.
// another, treemap, nlgn time, n space.
static class Solution {
    public List<List<Integer>> verticalOrder(TreeNode root) {
        List<List<Integer>> res = new ArrayList<>();
        if (root == null) return res;
        ArrayDeque<Map.Entry<TreeNode, Integer>> q = new ArrayDeque<>(); // bfs
        q.offer(new AbstractMap.SimpleEntry<>(root, 0));
        HashMap<Integer, List<Integer>> colNodes = new HashMap<>(); // column -> nodes
        int minC = 0, maxC = 0;
        while (!q.isEmpty()) {
            var p = q.remove();
            root = p.getKey();
            int col = p.getValue();
            colNodes.computeIfAbsent(col, c -> new ArrayList<>()).add(root.val);
            if (root.left != null) q.add(new AbstractMap.SimpleEntry<>(root.left, col - 1));
            if (root.right != null) q.offer(new AbstractMap.SimpleEntry<>(root.right, col + 1));
            if (minC > col) minC = col;
            if (maxC < col) maxC = col;
        }
        for (int c = minC; c <= maxC; c++) res.add(colNodes.get(c));
        return res;
    }
}
```

### Rust

Rust solution takes triple the time to learn and think about.
That is the price to pay for performance and no garbage collection.
Not sure if it is worth it versus the C++ rather than the modern functional programming idioms.
See the comments below.

```rust
use crate::structs::tree_node::TreeNode;
use std::cell::RefCell;
use std::cmp::{max, min};
use std::collections::{HashMap, VecDeque};
use std::rc::Rc;


impl Solution {
    /// 20 ms, 3.16 mb
    pub fn vertical_order(root: Option<Rc<RefCell<TreeNode>>>) -> Vec<Vec<i32>> {
        let mut res = Vec::new();
        if root.is_none() { return res; }
        let mut col_v = HashMap::new();
        let (mut min_c, mut max_c, mut q) = (0, 0, VecDeque::new());
        q.push_back((root, 0));
        // must be in while let, while !q.is_empty(): None not covered
        while let Some((Some(n), c)) = q.pop_front() {
            let n = n.borrow();
            col_v.entry(c).or_insert(Vec::new()).push(n.val);
            min_c = min(min_c, c);
            max_c = max(max_c, c);
            if !n.left.is_none() { q.push_back((n.left.clone(), c - 1)) }
            if !n.right.is_none() { q.push_back((n.right.clone(), c + 1)) }
        }
        // move out of the map, alternatively can copy with .clone()
        for i in min_c..max_c + 1 { res.push(col_v.remove(&i).unwrap()) }
        res
    }
}
```
