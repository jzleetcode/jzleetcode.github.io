---
author: JZ
pubDatetime: 2026-07-22T10:39:00Z
modDatetime: 2026-07-22T10:39:00Z
title: LeetCode 310 Minimum Height Trees
featured: true
tags:
  - a-graph
  - a-topological-sort
  - a-bfs
description:
  "Solutions for LeetCode 310, medium, tags: graph, topological sort, BFS."
---

## Table of contents

## Description

Question Links: [LeetCode 310](https://leetcode.com/problems/minimum-height-trees/description/)

A tree is an undirected graph in which any two vertices are connected by exactly one path. Any connected graph without simple cycles is a tree.

Given a tree of `n` nodes labelled from `0` to `n - 1`, and an array of `n - 1` `edges` where `edges[i] = [aᵢ, bᵢ]` indicates that there is an undirected edge between the two nodes `aᵢ` and `bᵢ` in the tree, you can choose any node of the tree as the root. When you select a node `x` as the root, the result tree has height `h`. Among all possible rooted trees, those with minimum height (i.e. `min(h)`) are called **minimum height trees** (MHTs).

Return a list of all MHTs' root labels. You can return the answer in any order.

```
Example 1:

Input: n = 4, edges = [[1,0],[1,2],[1,3]]
Output: [1]
Explanation: The height of the tree when root=1 is 1, which is the minimum.

Example 2:

Input: n = 6, edges = [[3,0],[3,1],[3,2],[3,4],[5,4]]
Output: [3,4]
```

**Constraints:**

- `1 ≤ n ≤ 2 × 10⁴`
- `edges.length == n - 1`
- `0 ≤ aᵢ, bᵢ < n`
- `aᵢ ≠ bᵢ`
- All the pairs `(aᵢ, bᵢ)` are distinct.
- The given input is guaranteed to be a tree and there will be no repeated edges.

## Idea

The root(s) that minimize tree height are the **center(s)** of the tree — the node(s) that minimize the longest path to any leaf. A tree has at most 2 centers (think of the midpoint of the diameter).

We find the centers by repeatedly removing all current leaves (degree-1 nodes) from the outside inward, like peeling an onion. When 1 or 2 nodes remain, those are the answer.

```
Example: n=6, edges=[[3,0],[3,1],[3,2],[3,4],[5,4]]

Tree structure:
    0
    |
1 - 3 - 4 - 5
    |
    2

Round 1 — remove leaves {0, 1, 2, 5}:
    remaining: {3, 4}

remaining ≤ 2, stop → answer = [3, 4]
```

This is essentially topological sort on an undirected tree: each round removes all degree-1 nodes and updates neighbors' degrees.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// O(n) time, O(n) space. Topological sort peeling leaves.
public static List<Integer> findMinHeightTrees(int n, int[][] edges) {
    if (n == 1) return List.of(0); // O(1) base case
    if (n == 2) return List.of(0, 1);

    List<List<Integer>> adj = new ArrayList<>(n);
    int[] degree = new int[n]; // O(n) space
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());

    for (int[] e : edges) { // O(n) time — n-1 edges
        adj.get(e[0]).add(e[1]);
        adj.get(e[1]).add(e[0]);
        degree[e[0]]++;
        degree[e[1]]++;
    }

    Queue<Integer> leaves = new LinkedList<>();
    for (int i = 0; i < n; i++) { // O(n) time
        if (degree[i] == 1) leaves.offer(i);
    }

    int remaining = n;
    while (remaining > 2) { // O(n) total across all iterations
        int size = leaves.size();
        remaining -= size;
        for (int i = 0; i < size; i++) {
            int leaf = leaves.poll();
            for (int neighbor : adj.get(leaf)) {
                if (--degree[neighbor] == 1) {
                    leaves.offer(neighbor);
                }
            }
        }
    }

    return new ArrayList<>(leaves);
}
```

### Python

```python []
class Solution:
    """O(n) time, O(n) space. Topological sort peeling leaves."""

    def findMinHeightTrees(self, n: int, edges: list[list[int]]) -> list[int]:
        if n <= 2:
            return list(range(n))
        adj = [set() for _ in range(n)]  # O(n) space
        for u, v in edges:  # O(n) time, tree has n-1 edges
            adj[u].add(v)
            adj[v].add(u)
        leaves = deque(i for i in range(n) if len(adj[i]) == 1)
        remaining = n
        while remaining > 2:  # O(n) total across all iterations
            leaf_count = len(leaves)
            remaining -= leaf_count
            for _ in range(leaf_count):
                leaf = leaves.popleft()
                neighbor = adj[leaf].pop()
                adj[neighbor].remove(leaf)
                if len(adj[neighbor]) == 1:
                    leaves.append(neighbor)
        return list(leaves)
```

### C++

```cpp []
// O(n) time, O(n) space. Topological sort peeling leaves.
vector<int> findMinHeightTrees(int n, vector<vector<int>>& edges) {
    if (n == 1) return {0};
    if (n == 2) return {0, 1};

    vector<int> degree(n, 0);               // O(n) space
    vector<vector<int>> adj(n);             // O(n) space

    for (auto& e : edges) {                 // O(n) time
        adj[e[0]].push_back(e[1]);
        adj[e[1]].push_back(e[0]);
        degree[e[0]]++;
        degree[e[1]]++;
    }

    queue<int> leaves;
    for (int i = 0; i < n; i++) {           // O(n) time
        if (degree[i] == 1) leaves.push(i);
    }

    int remaining = n;
    while (remaining > 2) {                 // O(n) total iterations
        int sz = leaves.size();
        remaining -= sz;
        for (int i = 0; i < sz; i++) {
            int leaf = leaves.front();
            leaves.pop();
            for (int neighbor : adj[leaf]) {
                if (--degree[neighbor] == 1) {
                    leaves.push(neighbor);
                }
            }
        }
    }

    vector<int> result;
    while (!leaves.empty()) {
        result.push_back(leaves.front());
        leaves.pop();
    }
    return result;
}
```

### Rust

```rust []
// O(n) time, O(n) space. Topological sort peeling leaves.
pub fn find_min_height_trees(n: i32, edges: Vec<Vec<i32>>) -> Vec<i32> {
    let n = n as usize;
    if n == 1 {
        return vec![0];
    }

    let mut adj: Vec<Vec<usize>> = vec![vec![]; n]; // O(n) space
    let mut degree: Vec<usize> = vec![0; n];
    for e in &edges { // O(n) time
        let (u, v) = (e[0] as usize, e[1] as usize);
        adj[u].push(v);
        adj[v].push(u);
        degree[u] += 1;
        degree[v] += 1;
    }

    let mut leaves: Vec<usize> = (0..n).filter(|&i| degree[i] == 1).collect();
    let mut remaining = n;

    while remaining > 2 { // O(n) total across all iterations
        remaining -= leaves.len();
        let mut new_leaves = Vec::new();
        for &leaf in &leaves {
            for &neighbor in &adj[leaf] {
                degree[neighbor] -= 1;
                if degree[neighbor] == 1 {
                    new_leaves.push(neighbor);
                }
            }
        }
        leaves = new_leaves;
    }

    leaves.iter().map(|&x| x as i32).collect()
}
```
