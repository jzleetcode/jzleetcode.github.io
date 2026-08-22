---
author: JZ
pubDatetime: 2026-08-16T10:07:00Z
modDatetime: 2026-08-16T10:07:00Z
title: LeetCode 863 All Nodes Distance K in Binary Tree
featured: false
tags:
  - a-tree
  - a-bfs
description:
  "Solutions for LeetCode 863, medium, tags: tree, DFS, BFS, binary tree."
---

## Table of contents

## Description

Given the `root` of a binary tree, the value of a target node `target`, and an integer `k`, return an array of the values of all nodes that have a distance `k` from the target node.

You can return the answer in any order.

**Example 1:**

> Input: root = [3,5,1,6,2,0,8,null,null,7,4], target = 5, k = 2
> Output: [7,4,1]
> Explanation: The nodes that are a distance 2 from the target node (with value 5) are the nodes with values 7, 4, and 1.

**Example 2:**

> Input: root = [1], target = 1, k = 3
> Output: []

**Constraints:**

- The number of nodes in the tree is in the range `[1, 500]`.
- `0 <= Node.val <= 500`
- All the values `Node.val` are unique.
- `target` is the value of one of the nodes in the tree.
- `0 <= k <= 1000`

Link: [LeetCode 863](https://leetcode.com/problems/all-nodes-distance-k-in-binary-tree/)

## Idea1: BFS with Parent Map

The tree only has downward pointers (left/right). To traverse "upward" from the target, we first build a parent pointer map via DFS. Then we treat the tree as an undirected graph and BFS outward from the target for exactly `k` levels.

```
         3
        / \
       5   1      target = 5, k = 2
      / \ / \
     6  2 0  8
       / \
      7   4

BFS from node 5:
  dist 0: [5]
  dist 1: [6, 2, 3]       (children + parent)
  dist 2: [7, 4, 1]  ✓    (children of 2 + child of 3 via right)
```

Complexity: Time $O(n)$ — DFS to build parent map + BFS visits each node at most once. Space $O(n)$ — parent map + visited set + queue.

## Idea2: Pure DFS (No Extra Data Structure)

Find the target via DFS. Once found, collect all nodes at distance `k` in its subtree. As the recursion unwinds, the distance from each ancestor to the target is known, so we collect nodes at the remaining distance in the **opposite** subtree.

```
dfs(3): target in left subtree at dist 2
  dfs(5): THIS IS TARGET, collect at dist 2 in subtree → [7, 4]
    returns 0
  dist from 3 to target = 0 + 1 (via 5) + 1 = 2... actually:
  dfs(5) returns 0 → dist from node 3 = 0+1+1? No:
    dfs(node.left=5) returns 0 → left_dist=0, dist_from_here=1
    since 1 < k=2, collect in right subtree at dist k-1-1 = 0 → node 1
  returns 1 to caller... wait, let me redo:

Walk through for target=5, k=2:
  dfs(3):
    dfs(5): node==target → collectSubtree(5, dist=2) → finds 7,4
      return 0
    left_dist = 0, dist_from_3 = 0+1 = 1
    1 < k=2 → collectSubtree(right=1, k-1-1=0) → finds node 1
    return 1
Result: [7, 4, 1] ✓
```

Complexity: Time $O(n)$ — each node visited once by DFS + at most once by collectSubtree. Space $O(n)$ — recursion stack up to $O(h)$, result list up to $O(n)$.

### Java

```java []
package tree;

import struct.TreeNode;

import java.util.*;

public final class AllNodesDistanceKBT {

    private AllNodesDistanceKBT() {
    }

    // BFS with parent map. O(n) time, O(n) space.
    public static List<Integer> distanceK(TreeNode root, TreeNode target, int k) {
        Map<TreeNode, TreeNode> parentMap = new HashMap<>();
        buildParentMap(root, null, parentMap);
        Queue<TreeNode> queue = new ArrayDeque<>();
        Set<TreeNode> visited = new HashSet<>();
        queue.add(target);
        visited.add(target);
        int dist = 0;
        while (!queue.isEmpty()) {
            if (dist == k) {
                List<Integer> result = new ArrayList<>();
                for (TreeNode node : queue) result.add(node.val);
                return result;
            }
            int size = queue.size();
            for (int i = 0; i < size; i++) { // O(n) total across all levels
                TreeNode node = queue.poll();
                for (TreeNode neighbor : new TreeNode[]{node.left, node.right, parentMap.get(node)}) {
                    if (neighbor != null && !visited.contains(neighbor)) {
                        visited.add(neighbor);
                        queue.add(neighbor);
                    }
                }
            }
            dist++;
        }
        return new ArrayList<>();
    }

    private static void buildParentMap(TreeNode node, TreeNode parent, Map<TreeNode, TreeNode> parentMap) {
        if (node == null) return;
        parentMap.put(node, parent); // O(n) entries total
        buildParentMap(node.left, node, parentMap);
        buildParentMap(node.right, node, parentMap);
    }

    // Pure DFS. O(n) time, O(n) space.
    public static List<Integer> distanceK2(TreeNode root, TreeNode target, int k) {
        List<Integer> result = new ArrayList<>();
        dfs(root, target, k, result);
        return result;
    }

    private static int dfs(TreeNode node, TreeNode target, int k, List<Integer> result) {
        if (node == null) return -1;
        if (node == target) {
            collectSubtree(node, k, result);
            return 0;
        }
        int left = dfs(node.left, target, k, result);
        if (left >= 0) {
            int dist = left + 1;
            if (dist == k) result.add(node.val);
            else if (dist < k) collectSubtree(node.right, k - dist - 1, result);
            return dist;
        }
        int right = dfs(node.right, target, k, result);
        if (right >= 0) {
            int dist = right + 1;
            if (dist == k) result.add(node.val);
            else if (dist < k) collectSubtree(node.left, k - dist - 1, result);
            return dist;
        }
        return -1;
    }

    private static void collectSubtree(TreeNode node, int dist, List<Integer> result) {
        if (node == null || dist < 0) return;
        if (dist == 0) {
            result.add(node.val);
            return;
        }
        collectSubtree(node.left, dist - 1, result); // O(n) total across all calls
        collectSubtree(node.right, dist - 1, result);
    }
}
```

### Python

```python []
from collections import deque
from typing import List, Optional

from algorithm.jzstruct.tree_node import TreeNode


class Solution:
    """Build parent map via DFS, then BFS from target for K levels.
    Time O(n), Space O(n)."""

    def distanceK(self, root: TreeNode, target: TreeNode, k: int) -> List[int]:
        parent = {}

        def build_parent(node: TreeNode, par: Optional[TreeNode]) -> None:  # O(n)
            if not node:
                return
            parent[node] = par
            build_parent(node.left, node)
            build_parent(node.right, node)

        build_parent(root, None)

        queue = deque([target])
        visited = {target}
        dist = 0
        while queue:
            if dist == k:
                return [node.val for node in queue]  # O(n) worst case
            dist += 1
            for _ in range(len(queue)):  # O(n) total across all levels
                node = queue.popleft()
                for neighbor in (node.left, node.right, parent[node]):
                    if neighbor and neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
        return []


class Solution2:
    """Pure DFS: find target, then collect nodes at remaining distance in subtrees.
    Time O(n), Space O(n)."""

    def distanceK(self, root: TreeNode, target: TreeNode, k: int) -> List[int]:
        res = []

        def collect(node: Optional[TreeNode], dist: int) -> None:  # O(n) total
            if not node or dist > k:
                return
            if dist == k:
                res.append(node.val)
                return
            collect(node.left, dist + 1)  # O(h) stack
            collect(node.right, dist + 1)

        def dfs(node: Optional[TreeNode]) -> int:  # O(n)
            """Return distance from node to target, or -1 if target not in subtree."""
            if not node:
                return -1
            if node is target:
                collect(node, 0)
                return 0
            left = dfs(node.left)
            if left >= 0:
                if left + 1 == k:
                    res.append(node.val)
                else:
                    collect(node.right, left + 2)
                return left + 1
            right = dfs(node.right)
            if right >= 0:
                if right + 1 == k:
                    res.append(node.val)
                else:
                    collect(node.left, right + 2)
                return right + 1
            return -1

        dfs(root)
        return res
```

### C++

```cpp []
#include "struct/TreeNode.hpp"
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <queue>

using namespace std;

class Solution863 {
public:
    // BFS with parent map. O(n) time, O(n) space.
    vector<int> distanceK(TreeNode* root, TreeNode* target, int k) {
        unordered_map<TreeNode*, TreeNode*> parent;
        buildParent(root, nullptr, parent); // O(n)

        queue<TreeNode*> q;
        unordered_set<TreeNode*> visited;
        q.push(target);
        visited.insert(target);

        int dist = 0;
        while (!q.empty()) {
            if (dist == k) {
                vector<int> result;
                while (!q.empty()) {
                    result.push_back(q.front()->val);
                    q.pop();
                }
                return result;
            }
            int size = q.size();
            for (int i = 0; i < size; i++) { // O(n) total
                TreeNode* node = q.front();
                q.pop();
                if (node->left && !visited.count(node->left)) {
                    visited.insert(node->left);
                    q.push(node->left);
                }
                if (node->right && !visited.count(node->right)) {
                    visited.insert(node->right);
                    q.push(node->right);
                }
                if (parent[node] && !visited.count(parent[node])) {
                    visited.insert(parent[node]);
                    q.push(parent[node]);
                }
            }
            dist++;
        }
        return {};
    }

    // Pure DFS. O(n) time, O(n) space.
    vector<int> distanceKDFS(TreeNode* root, TreeNode* target, int k) {
        vector<int> result;
        dfs(root, target, k, result);
        return result;
    }

private:
    void buildParent(TreeNode* node, TreeNode* par,
                     unordered_map<TreeNode*, TreeNode*>& parent) {
        if (!node) return;
        parent[node] = par;
        buildParent(node->left, node, parent);
        buildParent(node->right, node, parent);
    }

    int dfs(TreeNode* node, TreeNode* target, int k, vector<int>& result) {
        if (!node) return -1;
        if (node == target) {
            collectSubtree(node, k, result);
            return 0;
        }
        int left = dfs(node->left, target, k, result);
        if (left >= 0) {
            if (left + 1 == k) result.push_back(node->val);
            else collectSubtree(node->right, k - left - 2, result);
            return left + 1;
        }
        int right = dfs(node->right, target, k, result);
        if (right >= 0) {
            if (right + 1 == k) result.push_back(node->val);
            else collectSubtree(node->left, k - right - 2, result);
            return right + 1;
        }
        return -1;
    }

    void collectSubtree(TreeNode* node, int dist, vector<int>& result) {
        if (!node || dist < 0) return;
        if (dist == 0) {
            result.push_back(node->val);
            return;
        }
        collectSubtree(node->left, dist - 1, result); // O(n) total
        collectSubtree(node->right, dist - 1, result);
    }
};
```

### Rust

```rust []
use std::cell::RefCell;
use std::collections::{HashMap, HashSet, VecDeque};
use std::rc::Rc;

use crate::structs::tree_node::TreeNode;

pub struct Solution;

impl Solution {
    /// BFS with adjacency graph. O(n) time, O(n) space.
    pub fn distance_k(root: Option<Rc<RefCell<TreeNode>>>, target: i32, k: i32) -> Vec<i32> {
        let mut graph: HashMap<i32, Vec<i32>> = HashMap::new();

        fn build_graph(node: &Option<Rc<RefCell<TreeNode>>>, graph: &mut HashMap<i32, Vec<i32>>) {
            if let Some(n) = node {
                let n = n.borrow();
                if let Some(ref left) = n.left {
                    let lv = left.borrow().val;
                    graph.entry(n.val).or_default().push(lv); // O(n) edges total
                    graph.entry(lv).or_default().push(n.val);
                    build_graph(&n.left, graph);
                }
                if let Some(ref right) = n.right {
                    let rv = right.borrow().val;
                    graph.entry(n.val).or_default().push(rv);
                    graph.entry(rv).or_default().push(n.val);
                    build_graph(&n.right, graph);
                }
            }
        }

        build_graph(&root, &mut graph);

        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(target);
        visited.insert(target);
        let mut dist = 0;

        while !queue.is_empty() {
            if dist == k {
                return queue.into_iter().collect();
            }
            let size = queue.len();
            for _ in 0..size { // O(n) total across all levels
                let curr = queue.pop_front().unwrap();
                if let Some(neighbors) = graph.get(&curr) {
                    for &nei in neighbors {
                        if visited.insert(nei) {
                            queue.push_back(nei);
                        }
                    }
                }
            }
            dist += 1;
        }

        vec![]
    }

    /// Pure DFS. O(n) time, O(n) space.
    pub fn distance_k_dfs(root: Option<Rc<RefCell<TreeNode>>>, target: i32, k: i32) -> Vec<i32> {
        let mut result = Vec::new();

        fn collect_subtree(node: &Option<Rc<RefCell<TreeNode>>>, dist: i32, result: &mut Vec<i32>) {
            if dist < 0 { return; }
            if let Some(n) = node {
                let n = n.borrow();
                if dist == 0 {
                    result.push(n.val);
                    return;
                }
                collect_subtree(&n.left, dist - 1, result);
                collect_subtree(&n.right, dist - 1, result);
            }
        }

        fn dfs(
            node: &Option<Rc<RefCell<TreeNode>>>, target: i32, k: i32, result: &mut Vec<i32>,
        ) -> i32 {
            if let Some(n) = node {
                let n = n.borrow();
                if n.val == target {
                    collect_subtree(&Some(Rc::new(RefCell::new(TreeNode {
                        val: n.val, left: n.left.clone(), right: n.right.clone(),
                    }))), k, result);
                    return 0;
                }
                let left_dist = dfs(&n.left, target, k, result);
                if left_dist >= 0 {
                    let dist_from_here = left_dist + 1;
                    if dist_from_here == k { result.push(n.val); }
                    else if dist_from_here < k {
                        collect_subtree(&n.right, k - dist_from_here - 1, result);
                    }
                    return dist_from_here;
                }
                let right_dist = dfs(&n.right, target, k, result);
                if right_dist >= 0 {
                    let dist_from_here = right_dist + 1;
                    if dist_from_here == k { result.push(n.val); }
                    else if dist_from_here < k {
                        collect_subtree(&n.left, k - dist_from_here - 1, result);
                    }
                    return dist_from_here;
                }
                -1
            } else { -1 }
        }

        dfs(&root, target, k, &mut result);
        result
    }
}
```
