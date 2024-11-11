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

Given a binary tree, return the vertical order traversal of its nodes' values. (ie, from top to bottom, column by column).

If two nodes are in the same row and column, the order should be from left to right.

For each node at position (row, col), its left and right children will be at positions (row + 1, col - 1) and (row + 1, col + 1) respectively. The root of the tree is at (0, 0).

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

## Solution

### Idea

We could use breath first search (BFS) to traverse the tree and maintain a hash map for `column -> values`. In the queue for BFS traversal, we keep track of the column index as well as the tree node. After that, we collect the values in the hash map to the result (a list of lists of `int32`).

Complexity: Time O(n), Space O(n).

#### C++

```cpp
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
        // auto vals = views::values(colV);
        // return vector<vector<int> >{vals.begin(), vals.end()};
    }
};
```

LintCode does not support C++ 20 yet, otherwise we could use `ranges::views` to get the values out of the hash map as shown in the last two lines above (commented out).
