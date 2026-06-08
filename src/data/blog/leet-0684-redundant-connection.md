---
author: JZ
pubDatetime: 2026-06-08T06:00:00Z
modDatetime: 2026-06-08T06:00:00Z
title: LeetCode 684 Redundant Connection
featured: true
tags:
  - a-union-find
  - a-graph
  - a-dfs
description:
  "Solutions for LeetCode 684, medium, tags: tree, union find, graph, depth-first search."
---

## Table of contents

## Description

Question Links: [LeetCode 684](https://leetcode.com/problems/redundant-connection/description/)

In this problem, a tree is an **undirected graph** that is connected and has no cycles.

You are given a graph that started as a tree with `n` nodes labeled from `1` to `n`, with one additional edge added. The added edge has two **different** vertices chosen from `1` to `n`, and was not an edge that already existed. The graph is represented as an array `edges` of length `n` where `edges[i] = [ai, bi]` indicates that there is an edge between nodes `ai` and `bi` in the graph.

Return *an edge that can be removed so that the resulting graph is a tree of* `n` *nodes*. If there are multiple answers, return the answer that occurs **last** in the input array.

```
Example 1:

    1 --- 2
     \   /
       3

Input: edges = [[1,2],[1,3],[2,3]]
Output: [2,3]

Example 2:

    5 - 1 - 2
        |   |
        4 - 3

Input: edges = [[1,2],[2,3],[3,4],[1,4],[1,5]]
Output: [1,4]
```

**Constraints:**

- `n == edges.length`
- `3 <= n <= 1000`
- `edges[i].length == 2`
- `1 <= ai < bi <= n`
- `ai != bi`
- There are no repeated edges.
- The given graph is connected.

## Idea1

Use **Union Find** (disjoint set union). Process edges one by one. For each edge `[u, v]`, check if `u` and `v` are already in the same component. If so, this edge creates the cycle and is the redundant one. Otherwise, merge the two components.

```
Process edges = [[1,2],[2,3],[3,4],[1,4],[1,5]]:

Edge [1,2]: components {1,2},{3},{4},{5}  -> union
Edge [2,3]: components {1,2,3},{4},{5}    -> union
Edge [3,4]: components {1,2,3,4},{5}      -> union
Edge [1,4]: find(1)=find(4) already!      -> REDUNDANT ✓
Edge [1,5]: (not reached, already found answer)
```

Path compression + union by rank makes `find` nearly $O(1)$ amortized.

Complexity: Time $O(n \cdot \alpha(n)) \approx O(n)$, Space $O(n)$.

### Java

```java []
import princeton.jsl.WeightedQUSizePCUF;

// lc 684, union find, O(n*alpha(n)) ~= O(n) time, O(n) space.
public int[] redundantUF(Integer[][] edges) {
    WeightedQUSizePCUF uf = new WeightedQUSizePCUF(edges.length + 1);
    for (Integer[] e : edges) {
        if (uf.connected(e[0], e[1])) return new int[]{e[0], e[1]}; // already in same set
        else uf.union(e[0], e[1]);
    }
    return null;
}
```

WeightedQUSizePCUF (union by size with path compression):

```java []
public class WeightedQUSizePCUF {
    private int[] parent;
    private int[] size;

    public WeightedQUSizePCUF(int n) {
        parent = new int[n];
        size = new int[n];
        for (int i = 0; i < n; i++) { parent[i] = i; size[i] = 1; }
    }

    public int find(int p) {
        int root = p;
        while (root != parent[root]) root = parent[root]; // O(alpha(n)) amortized
        while (p != root) { int newp = parent[p]; parent[p] = root; p = newp; } // path compression
        return root;
    }

    public boolean connected(int p, int q) { return find(p) == find(q); }

    public void union(int p, int q) {
        int rootP = find(p), rootQ = find(q);
        if (rootP == rootQ) return;
        if (size[rootP] < size[rootQ]) { parent[rootP] = rootQ; size[rootQ] += size[rootP]; } // union by size
        else { parent[rootQ] = rootP; size[rootP] += size[rootQ]; }
    }
}
```

```python []
# lc 684, union find, O(n*alpha(n)) ~= O(n) time, O(n) space.
def findRedundantConnection(self, edges: List[List[int]]) -> List[int]:
    n = len(edges)
    parent = list(range(n + 1))
    rank = [0] * (n + 1)

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path compression
            x = parent[x]
        return x

    def union(x, y) -> bool:
        px, py = find(x), find(y)
        if px == py:
            return False  # already connected
        if rank[px] < rank[py]:  # union by rank
            px, py = py, px
        parent[py] = px
        if rank[px] == rank[py]:
            rank[px] += 1
        return True

    for u, v in edges:
        if not union(u, v):
            return [u, v]
    return []
```

```cpp []
// lc 684, union find, O(n*alpha(n)) ~= O(n) time, O(n) space.
vector<int> findRedundantConnectionUF(vector<vector<int>> &edges) {
    int n = edges.size();
    vector<int> parent(n + 1), rank(n + 1, 0);
    iota(parent.begin(), parent.end(), 0);

    for (auto &e: edges) {
        int px = find(parent, e[0]), py = find(parent, e[1]);
        if (px == py) return e; // already connected
        if (rank[px] < rank[py]) swap(px, py); // union by rank
        parent[py] = px;
        if (rank[px] == rank[py]) rank[px]++;
    }
    return {};
}

int find(vector<int> &parent, int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]]; // path compression
        x = parent[x];
    }
    return x;
}
```

```rust []
// lc 684, union find, O(n*alpha(n)) ~= O(n) time, O(n) space.
pub fn find_redundant_connection(edges: Vec<Vec<i32>>) -> Vec<i32> {
    let n = edges.len();
    let mut parent: Vec<usize> = (0..=n).collect();
    let mut rank = vec![0usize; n + 1];

    for edge in &edges {
        let (u, v) = (edge[0] as usize, edge[1] as usize);
        let (pu, pv) = (Self::find(&mut parent, u), Self::find(&mut parent, v));
        if pu == pv { return edge.clone(); } // already connected
        if rank[pu] < rank[pv] { parent[pu] = pv; } // union by rank
        else {
            parent[pv] = pu;
            if rank[pu] == rank[pv] { rank[pu] += 1; }
        }
    }
    vec![]
}

fn find(parent: &mut Vec<usize>, mut x: usize) -> usize {
    while parent[x] != x {
        parent[x] = parent[parent[x]]; // path compression
        x = parent[x];
    }
    x
}
```

## Idea2

Use **DFS cycle detection**. Build the full adjacency list, then run DFS from any node. When we encounter a back edge (a visited neighbor that isn't the parent), we've found the cycle. Backtrack through parent pointers to collect all cycle nodes. Then scan edges from last to first — the last edge whose both endpoints are in the cycle is the answer.

```
DFS from node 0 (0-indexed) on edges [[1,2],[2,3],[3,4],[1,4],[1,5]]:

adj[0]: [1,3,4]  adj[1]: [0,2]  adj[2]: [1,3]  adj[3]: [2,0]  adj[4]: [0]

DFS path: 0 -> 1 -> 2 -> 3 -> back edge to 0 (cycle found!)
Cycle nodes via parent: {0, 3, 2, 1} (but 0-indexed = nodes 1,2,3,4)
Last edge with both endpoints in cycle: [1,4] ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
import princeton.jsl.Cycle;
import princeton.jsl.Graph;

// lc 684, DFS cycle detection, O(V+E) time, O(V+E) space.
public int[] redundantGraph(Integer[][] edges) {
    int[] result = null;
    Cycle cycle = new Cycle(new Graph(edges));
    Set<Integer> cycleSet = new HashSet<>();
    for (int v : cycle.cycle()) cycleSet.add(v);
    for (int i = edges.length - 1; i >= 0; i--) {
        if (cycleSet.contains(edges[i][1]) && cycleSet.contains(edges[i][0])) {
            result = new int[]{edges[i][0], edges[i][1]};
            break;
        }
    }
    return result;
}
```

```python []
# lc 684, DFS cycle detection, O(n) time, O(n) space.
def findRedundantConnection(self, edges: List[List[int]]) -> List[int]:
    n = len(edges)
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u - 1].append(v - 1)
        adj[v - 1].append(u - 1)

    visited = [False] * n
    parent = [-1] * n
    cycle_start = -1

    def dfs(src):
        nonlocal cycle_start
        visited[src] = True
        for nei in adj[src]:
            if not visited[nei]:
                parent[nei] = src
                dfs(nei)
            elif nei != parent[src] and cycle_start == -1:
                cycle_start = nei
                parent[nei] = src

    dfs(0)

    cycle_nodes = set()
    node = cycle_start
    while True:
        cycle_nodes.add(node)
        node = parent[node]
        if node == cycle_start:
            break

    for i in range(len(edges) - 1, -1, -1):  # O(n) scan from last
        if (edges[i][0] - 1) in cycle_nodes and (edges[i][1] - 1) in cycle_nodes:
            return edges[i]
    return []
```

```cpp []
// lc 684, DFS cycle detection, O(n) time, O(n) space.
vector<int> findRedundantConnectionDFS(vector<vector<int>> &edges) {
    int n = edges.size();
    vector<vector<int>> adj(n);
    for (auto &e: edges) {
        adj[e[0] - 1].push_back(e[1] - 1);
        adj[e[1] - 1].push_back(e[0] - 1);
    }
    vector<bool> visited(n, false);
    vector<int> parent(n, -1);
    int cycleStart = -1;

    function<void(int)> dfs = [&](int u) {
        visited[u] = true;
        for (int v: adj[u]) {
            if (!visited[v]) { parent[v] = u; dfs(v); }
            else if (v != parent[u] && cycleStart == -1) { cycleStart = v; parent[v] = u; }
        }
    };
    dfs(0);

    unordered_set<int> cycleNodes;
    int node = cycleStart;
    do { cycleNodes.insert(node); node = parent[node]; } while (node != cycleStart);

    for (int i = n - 1; i >= 0; i--) // O(n) scan from last
        if (cycleNodes.count(edges[i][0] - 1) && cycleNodes.count(edges[i][1] - 1))
            return edges[i];
    return {};
}
```

```rust []
// lc 684, DFS cycle detection, O(n) time, O(n) space.
pub fn find_redundant_connection_dfs(edges: Vec<Vec<i32>>) -> Vec<i32> {
    let n = edges.len();
    let mut adj = vec![vec![]; n];
    for e in &edges {
        adj[e[0] as usize - 1].push(e[1] as usize - 1);
        adj[e[1] as usize - 1].push(e[0] as usize - 1);
    }
    let mut visited = vec![false; n];
    let mut parent = vec![usize::MAX; n];
    let mut cycle_start: Option<usize> = None;

    fn dfs(u: usize, adj: &[Vec<usize>], visited: &mut [bool],
           parent: &mut [usize], cycle_start: &mut Option<usize>) {
        visited[u] = true;
        for &v in &adj[u] {
            if !visited[v] { parent[v] = u; dfs(v, adj, visited, parent, cycle_start); }
            else if parent[u] != v && cycle_start.is_none() { *cycle_start = Some(v); parent[v] = u; }
        }
    }
    dfs(0, &adj, &mut visited, &mut parent, &mut cycle_start);

    let cs = cycle_start.unwrap();
    let mut cycle_nodes = std::collections::HashSet::new();
    let mut node = cs;
    loop { cycle_nodes.insert(node); node = parent[node]; if node == cs { break; } }

    for i in (0..edges.len()).rev() { // O(n) scan from last
        let (u, v) = (edges[i][0] as usize - 1, edges[i][1] as usize - 1);
        if cycle_nodes.contains(&u) && cycle_nodes.contains(&v) { return edges[i].clone(); }
    }
    vec![]
}
```
