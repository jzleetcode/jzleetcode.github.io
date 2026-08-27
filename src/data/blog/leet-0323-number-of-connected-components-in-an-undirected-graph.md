---
author: JZ
pubDatetime: 2026-08-21T10:36:00Z
modDatetime: 2026-08-21T10:36:00Z
title: LeetCode 323 Number of Connected Components in an Undirected Graph
featured: false
tags:
  - a-union-find
  - a-dfs
  - a-graph
description:
  "Solutions for LeetCode 323, medium, tags: depth-first search, breadth-first search, union find, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 323](https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/description/)

You have a graph of `n` nodes. You are given an integer `n` and an array `edges` where `edges[i] = [ai, bi]` indicates that there is an edge between `ai` and `bi` in the graph.

Return _the number of connected components in the graph_.

```
Example 1:

  0 --- 1     3
        |     |
        2     4

Input: n = 5, edges = [[0,1],[1,2],[3,4]]
Output: 2

Example 2:

  0 --- 1     3
        |     |
        2 --- 3 --- 4

Input: n = 5, edges = [[0,1],[1,2],[2,3],[3,4]]
Output: 1
```

**Constraints:**

- `1 <= n <= 2000`
- `1 <= edges.length <= 5000`
- `edges[i].length == 2`
- `0 <= ai <= bi < n`
- `ai != bi`
- There are no repeated edges.

## Idea1

Use **Union-Find** (disjoint set) with path compression and union by rank. Start with `n` isolated components. For each edge, merge the sets containing the two endpoints. Each successful merge decrements the component count.

```
n=5, edges = [[0,1],[1,2],[3,4]]

Initial: parent = [0,1,2,3,4], components = 5

Process edge [0,1]:
  find(0)=0, find(1)=1 -> different
  union: parent=[0,0,2,3,4], components=4

Process edge [1,2]:
  find(1)=0, find(2)=2 -> different
  union: parent=[0,0,0,3,4], components=3

Process edge [3,4]:
  find(3)=3, find(4)=4 -> different
  union: parent=[0,0,0,3,3], components=2

Result: 2 components
```

Complexity: Time $O(n + e \cdot \alpha(n))$ — initialize `n` parents, then process `e` edges with nearly O(1) amortized find/union. Space $O(n)$ — parent and rank arrays.

### Java

```java []
// lc 323 Union-Find, O(n + e * alpha(n)) time, O(n) space.
public static int countComponentsUF(int n, int[][] edges) {
    int[] parent = new int[n];
    int[] rank = new int[n];
    for (int i = 0; i < n; i++) { // O(n) init
        parent[i] = i;
    }

    int components = n;
    for (int[] edge : edges) { // O(e) edges
        int rootA = find(parent, edge[0]); // O(alpha(n)) path compression
        int rootB = find(parent, edge[1]); // O(alpha(n)) path compression
        if (rootA != rootB) {
            // Union by rank
            if (rank[rootA] < rank[rootB]) {
                parent[rootA] = rootB;
            } else if (rank[rootA] > rank[rootB]) {
                parent[rootB] = rootA;
            } else {
                parent[rootB] = rootA;
                rank[rootA]++;
            }
            components--;
        }
    }
    return components;
}

private static int find(int[] parent, int x) {
    while (parent[x] != x) { // O(alpha(n)) path compression
        parent[x] = parent[parent[x]]; // path halving
        x = parent[x];
    }
    return x;
}
```

```python []
# lc 323 Union-Find, O(n + e * alpha(n)) time, O(n) space.
class Solution:
    def countComponents(self, n: int, edges: list[list[int]]) -> int:
        parent = list(range(n))
        rank = [0] * n

        def find(x):
            while parent[x] != x:  # O(alpha(n)) amortized with path compression
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x, y):
            px, py = find(x), find(y)
            if px == py:
                return False
            if rank[px] < rank[py]:  # union by rank
                px, py = py, px
            parent[py] = px
            if rank[px] == rank[py]:
                rank[px] += 1
            return True

        components = n
        for a, b in edges:  # O(e) edges
            if union(a, b):
                components -= 1
        return components
```

```cpp []
// lc 323 Union-Find, O(n + e * alpha(n)) time, O(n) space.
static int countComponentsUF(int n, vector<vector<int>>& edges) {
    vector<int> parent(n);   // O(n) space
    vector<int> rank(n, 0);  // O(n) space for union by rank
    iota(parent.begin(), parent.end(), 0); // parent[i] = i
    int components = n; // start with n isolated components

    for (auto& e : edges) { // O(e) iterations
        int ri = find(parent, e[0]); // amortized O(alpha(n))
        int rj = find(parent, e[1]);
        if (ri != rj) {
            unite(parent, rank, ri, rj);
            components--; // merging two components
        }
    }
    return components;
}

static int find(vector<int>& parent, int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]]; // path compression (halving)
        x = parent[x];
    }
    return x;
}

static void unite(vector<int>& parent, vector<int>& rank, int x, int y) {
    if (rank[x] < rank[y]) swap(x, y);
    parent[y] = x;
    if (rank[x] == rank[y]) rank[x]++;
}
```

```rust []
// lc 323 Union-Find, O(n + e*α(n)) time, O(n) space.
pub fn count_components_uf(n: i32, edges: Vec<Vec<i32>>) -> i32 {
    let n = n as usize;
    let mut parent: Vec<usize> = (0..n).collect(); // O(n) space
    let mut rank = vec![0u32; n]; // O(n) space
    let mut components = n as i32;

    fn find(parent: &mut Vec<usize>, x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]); // path compression → amortized O(α(n))
        }
        parent[x]
    }

    for edge in &edges { // O(e) iterations
        let (a, b) = (edge[0] as usize, edge[1] as usize);
        let ra = find(&mut parent, a); // O(α(n)) amortized
        let rb = find(&mut parent, b);
        if ra != rb {
            // union by rank
            match rank[ra].cmp(&rank[rb]) {
                std::cmp::Ordering::Less => parent[ra] = rb,
                std::cmp::Ordering::Greater => parent[rb] = ra,
                std::cmp::Ordering::Equal => {
                    parent[rb] = ra;
                    rank[ra] += 1;
                }
            }
            components -= 1;
        }
    }

    components
}
```

## Idea2

Use **DFS** to count connected components. Build an adjacency list from edges, then iterate through all nodes. For each unvisited node, increment the component count and run an iterative DFS to mark all reachable nodes as visited.

This approach uses a different data structure (adjacency list + visited set) compared to Union-Find's parent/rank arrays, and explicitly traverses the graph rather than implicitly merging sets.

```
n=5, edges = [[0,1],[1,2],[3,4]]

Adjacency list:
  0: [1]
  1: [0, 2]
  2: [1]
  3: [4]
  4: [3]

DFS from node 0: visits {0, 1, 2} -> components = 1
Node 1: already visited -> skip
Node 2: already visited -> skip
DFS from node 3: visits {3, 4} -> components = 2
Node 4: already visited -> skip

Result: 2 components
```

Complexity: Time $O(n + e)$ — build adjacency list in O(e), visit each node and edge once. Space $O(n + e)$ — adjacency list stores 2e entries, plus O(n) for visited array and DFS stack.

### Java

```java []
// lc 323 DFS, O(n + e) time, O(n + e) space.
public static int countComponentsDFS(int n, int[][] edges) {
    List<List<Integer>> adj = new ArrayList<>();
    for (int i = 0; i < n; i++) { // O(n) init
        adj.add(new ArrayList<>());
    }
    for (int[] edge : edges) { // O(e) build adjacency list
        adj.get(edge[0]).add(edge[1]);
        adj.get(edge[1]).add(edge[0]);
    }

    boolean[] visited = new boolean[n];
    int components = 0;
    for (int i = 0; i < n; i++) { // O(n) iterate nodes
        if (!visited[i]) {
            components++;
            dfs(adj, visited, i);
        }
    }
    return components;
}

private static void dfs(List<List<Integer>> adj, boolean[] visited, int node) {
    visited[node] = true;
    for (int neighbor : adj.get(node)) { // O(degree) per node, O(e) total
        if (!visited[neighbor]) {
            dfs(adj, visited, neighbor);
        }
    }
}
```

```python []
# lc 323 DFS, O(n + e) time, O(n + e) space.
class Solution2:
    def countComponents(self, n: int, edges: list[list[int]]) -> int:
        adj = [[] for _ in range(n)]  # O(n + e) space
        for a, b in edges:
            adj[a].append(b)
            adj[b].append(a)

        visited = set()
        components = 0

        def dfs(node):
            stack = [node]
            while stack:  # O(n + e) total across all calls
                cur = stack.pop()
                for neighbor in adj[cur]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        stack.append(neighbor)

        for i in range(n):  # O(n)
            if i not in visited:
                visited.add(i)
                dfs(i)
                components += 1

        return components
```

```cpp []
// lc 323 DFS iterative, O(n + e) time, O(n + e) space.
static int countComponentsDFS(int n, vector<vector<int>>& edges) {
    vector<vector<int>> adj(n); // O(n + 2e) space for adjacency list
    for (auto& e : edges) { // O(e) — build adjacency list
        adj[e[0]].push_back(e[1]);
        adj[e[1]].push_back(e[0]);
    }

    vector<bool> visited(n, false); // O(n) space
    int components = 0;

    for (int i = 0; i < n; i++) { // O(n) — check each node
        if (visited[i]) continue;
        components++;
        // DFS using stack — visits each edge at most twice total
        vector<int> stk = {i};
        visited[i] = true;
        while (!stk.empty()) {
            int node = stk.back();
            stk.pop_back();
            for (int nb : adj[node]) { // O(degree) per node
                if (!visited[nb]) {
                    visited[nb] = true;
                    stk.push_back(nb);
                }
            }
        }
    }
    return components;
}
```

```rust []
// lc 323 DFS iterative, O(n + e) time, O(n + e) space.
pub fn count_components_dfs(n: i32, edges: Vec<Vec<i32>>) -> i32 {
    let n = n as usize;
    let mut adj = vec![vec![]; n]; // O(n + e) space
    for edge in &edges {
        let (a, b) = (edge[0] as usize, edge[1] as usize);
        adj[a].push(b); // O(e) total edges stored
        adj[b].push(a);
    }

    let mut visited = vec![false; n]; // O(n) space
    let mut components = 0i32;

    for i in 0..n { // O(n) outer loop
        if !visited[i] {
            components += 1;
            // iterative DFS to avoid stack overflow
            let mut stack = vec![i];
            while let Some(node) = stack.pop() { // each node visited once → O(n) total
                if visited[node] {
                    continue;
                }
                visited[node] = true;
                for &neighbor in &adj[node] { // each edge traversed twice total → O(e)
                    if !visited[neighbor] {
                        stack.push(neighbor);
                    }
                }
            }
        }
    }

    components
}
```
