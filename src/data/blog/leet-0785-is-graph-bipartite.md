---
author: JZ
pubDatetime: 2026-08-22T06:00:00Z
modDatetime: 2026-08-22T06:00:00Z
title: LeetCode 785 Is Graph Bipartite
featured: false
tags:
  - a-bfs
  - a-graph
  - a-union-find
description:
  "Solutions for LeetCode 785, medium, tags: graph, depth-first search, breadth-first search, union find."
---

## Table of contents

## Description

Question Links: [LeetCode 785](https://leetcode.com/problems/is-graph-bipartite/description/)

There is an **undirected** graph with `n` nodes, where each node is numbered between `0` and `n - 1`. You are given a 2D array `graph`, where `graph[u]` is an array of nodes that node `u` is adjacent to. More formally, for each `v` in `graph[u]`, there is an undirected edge between node `u` and node `v`. The graph has the following properties:

- There are no self-edges (`graph[u]` does not contain `u`).
- There are no parallel edges (`graph[u]` does not contain duplicate values).
- If `v` is in `graph[u]`, then `u` is in `graph[v]` (the graph is undirected).
- The graph may not be connected, meaning there may be two nodes `u` and `v` such that there is no path between them.

A graph is **bipartite** if the nodes can be partitioned into two independent sets `A` and `B` such that every edge in the graph connects a node in set `A` and a node in set `B`.

Return `true` _if and only if it is **bipartite**_.

```
Example 1:

    0 --- 1
    |     |
    3 --- 2

Input: graph = [[1,3],[0,2],[1,3],[0,2]]
Output: true
Explanation: We can partition the nodes into two sets: {0, 2} and {1, 3}.

Example 2:

    0 --- 1
    | \   |
    3 --- 2

Input: graph = [[1,2,3],[0,2],[0,1,3],[0,2]]
Output: false
Explanation: There is no way to partition the nodes into two independent sets
such that every edge connects a node in one and a node in the other.
```

**Constraints:**

- `graph.length == n`
- `1 <= n <= 100`
- `0 <= graph[u].length < n`
- `0 <= graph[u][i] <= n - 1`
- `graph[u]` does not contain `u`.
- All the values of `graph[u]` are **unique**.
- If `graph[u]` contains `v`, then `graph[v]` contains `u`.

## Idea1

**BFS coloring.** A graph is bipartite if and only if it contains no odd-length cycle. We can check this by attempting to 2-color the graph: assign one color to the starting node, then BFS outward assigning alternating colors. If we ever find a neighbor with the same color as the current node, an odd cycle exists.

We must handle disconnected components by iterating over all nodes and starting BFS from any unvisited node.

```
BFS coloring example (graph = [[1,3],[0,2],[1,3],[0,2]]):

Start at node 0, color RED:
  0(R) → neighbor 1 → color BLUE
  0(R) → neighbor 3 → color BLUE
  1(B) → neighbor 2 → color RED
  3(B) → neighbor 2 → already RED ✓ (opposite of BLUE)

Result: sets {0,2}=RED, {1,3}=BLUE. Bipartite!
```

Complexity: Time $O(V + E)$ — each node and edge visited once. Space $O(V)$ — color array + BFS queue.

### Java

```java []
// lc 785, BFS coloring, O(V+E) time, O(V) space.
public static boolean isBipartiteBFS(int[][] graph) {
    int n = graph.length;
    int[] color = new int[n]; // O(V) space
    java.util.Arrays.fill(color, -1); // -1 means uncolored
    for (int i = 0; i < n; i++) { // handle disconnected components
        if (color[i] != -1) continue;
        Queue<Integer> queue = new ArrayDeque<>(); // O(V+E) BFS
        queue.add(i);
        color[i] = 0;
        while (!queue.isEmpty()) {
            int u = queue.poll();
            for (int v : graph[u]) { // O(E) total across all nodes
                if (color[v] == -1) {
                    color[v] = 1 - color[u]; // assign opposite color
                    queue.add(v);
                } else if (color[v] == color[u]) {
                    return false; // same color conflict
                }
            }
        }
    }
    return true;
}
```

```python []
# lc 785, BFS coloring, O(V+E) time, O(V) space.
class Solution:
    def isBipartite(self, graph: list[list[int]]) -> bool:
        n = len(graph)
        color = [0] * n  # 0: unvisited, 1 or -1: two colors
        for i in range(n):  # O(V) handle disconnected components
            if color[i] != 0:
                continue
            color[i] = 1
            queue = deque([i])
            while queue:  # O(V+E) BFS
                node = queue.popleft()
                for nei in graph[node]:  # O(degree) per node
                    if color[nei] == 0:
                        color[nei] = -color[node]
                        queue.append(nei)
                    elif color[nei] == color[node]:
                        return False
        return True
```

```cpp []
// lc 785, BFS coloring, O(V+E) time, O(V) space.
bool isBipartiteBFS(vector<vector<int>> &graph) {
    int n = graph.size();
    vector<int> color(n, -1); // -1 = uncolored, 0/1 = two colors
    for (int i = 0; i < n; i++) { // handle disconnected components
        if (color[i] != -1) continue;
        queue<int> q;
        q.push(i);
        color[i] = 0;
        while (!q.empty()) {
            int u = q.front(); q.pop();
            for (int v : graph[u]) { // O(E) total across all BFS
                if (color[v] == -1) {
                    color[v] = 1 - color[u]; // assign opposite color
                    q.push(v);
                } else if (color[v] == color[u]) {
                    return false; // same color on both ends
                }
            }
        }
    }
    return true;
}
```

```rust []
// lc 785, BFS coloring, O(V+E) time, O(V) space.
pub fn is_bipartite_bfs(graph: Vec<Vec<i32>>) -> bool {
    let n = graph.len();
    let mut color = vec![-1i8; n]; // O(V) space; -1 = unvisited
    for start in 0..n { // handle disconnected components
        if color[start] != -1 { continue; }
        color[start] = 0;
        let mut queue = VecDeque::new();
        queue.push_back(start);
        while let Some(u) = queue.pop_front() { // BFS O(V+E)
            for &v in &graph[u] { // O(degree(u))
                let v = v as usize;
                if color[v] == -1 {
                    color[v] = 1 - color[u]; // assign opposite color
                    queue.push_back(v);
                } else if color[v] == color[u] {
                    return false;
                }
            }
        }
    }
    true
}
```

## Idea2

**Union-Find.** Key insight: for a bipartite graph, all neighbors of a node must be in the _opposite_ partition, which means all neighbors of a node must be in the _same_ partition as each other.

Algorithm: for each node `u`, union all of `u`'s neighbors together (they must be in the same set). Then check: if `u` is in the same set as any of its neighbors, the graph is not bipartite (it would mean `u` is in the same partition as its neighbor — a contradiction).

```
Union-Find example (graph = [[1,2],[0,2],[0,1]], triangle):

Node 0: neighbors = {1, 2}. Union(1, 2). Check find(0)==find(1)? No.
Node 1: neighbors = {0, 2}. Union(0, 2). Check find(1)==find(0)? YES!
  → 0 and 1 are in the same set, but they are neighbors.
  → Not bipartite!
```

Complexity: Time $O(V \cdot \alpha(V) + E)$ — for each edge, union/find operations are nearly $O(1)$ amortized. Space $O(V)$ — parent and rank arrays.

### Java

```java []
// lc 785, Union-Find, O(V*alpha(V)+E) time, O(V) space.
public static boolean isBipartiteUF(int[][] graph) {
    int n = graph.length;
    int[] parent = new int[n]; // O(V) space
    int[] rank = new int[n];
    for (int i = 0; i < n; i++) parent[i] = i;
    for (int u = 0; u < n; u++) {
        for (int v : graph[u]) {
            if (find(parent, u) == find(parent, v)) return false; // u and neighbor in same set
            union(parent, rank, graph[u][0], v); // O(alpha(V)) amortized union of all neighbors
        }
    }
    return true;
}

private static int find(int[] parent, int x) { // O(alpha(V)) with path compression
    if (parent[x] != x) parent[x] = find(parent, parent[x]);
    return parent[x];
}

private static void union(int[] parent, int[] rank, int x, int y) { // union by rank
    int px = find(parent, x), py = find(parent, y);
    if (px == py) return;
    if (rank[px] < rank[py]) parent[px] = py;
    else if (rank[px] > rank[py]) parent[py] = px;
    else { parent[py] = px; rank[px]++; }
}
```

```python []
# lc 785, Union-Find, O(V*alpha(V)+E) time, O(V) space.
class Solution2:
    def isBipartite(self, graph: list[list[int]]) -> bool:
        n = len(graph)
        parent = list(range(n))
        rank = [0] * n

        def find(x: int) -> int:
            while parent[x] != x:  # O(alpha(V)) amortized with path compression
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x: int, y: int) -> None:
            rx, ry = find(x), find(y)
            if rx == ry: return
            if rank[rx] < rank[ry]: rx, ry = ry, rx
            parent[ry] = rx
            if rank[rx] == rank[ry]: rank[rx] += 1

        for node in range(n):  # O(V)
            for nei in graph[node]:  # O(E) total across all nodes
                if find(node) == find(nei):  # node and neighbor in same set
                    return False
                union(graph[node][0], nei)  # all neighbors go into same group
        return True
```

```cpp []
// lc 785, Union-Find, O(V*alpha(V)+E) time, O(V) space.
bool isBipartiteUF(vector<vector<int>> &graph) {
    int n = graph.size();
    vector<int> parent(n), rank(n, 0);
    iota(parent.begin(), parent.end(), 0); // parent[i] = i
    for (int u = 0; u < n; u++) {
        for (int v : graph[u]) {
            if (find(parent, u) == find(parent, v)) {
                return false; // u and v in same set — odd cycle
            }
            unite(parent, rank, graph[u][0], v); // union all neighbors together
        }
    }
    return true;
}

int find(vector<int> &parent, int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]]; // path compression (halving)
        x = parent[x];
    }
    return x;
}

void unite(vector<int> &parent, vector<int> &rank, int x, int y) {
    int px = find(parent, x), py = find(parent, y);
    if (px == py) return;
    if (rank[px] < rank[py]) swap(px, py); // union by rank
    parent[py] = px;
    if (rank[px] == rank[py]) rank[px]++;
}
```

```rust []
// lc 785, Union-Find, O(V*alpha(V)+E) time, O(V) space.
pub fn is_bipartite_uf(graph: Vec<Vec<i32>>) -> bool {
    let n = graph.len();
    let mut parent: Vec<usize> = (0..n).collect(); // O(V) space
    let mut rank = vec![0u32; n];
    for u in 0..n { // O(V)
        if graph[u].is_empty() { continue; }
        let first_neighbor = graph[u][0] as usize;
        for &v in &graph[u] { // union all neighbors O(degree(u)*alpha(V))
            let v = v as usize;
            union(&mut parent, &mut rank, first_neighbor, v);
        }
        if find(&mut parent, u) == find(&mut parent, first_neighbor) {
            return false; // u in same set as neighbor — odd cycle
        }
    }
    true
}

fn find(parent: &mut Vec<usize>, x: usize) -> usize { // O(alpha(n))
    if parent[x] != x { parent[x] = find(parent, parent[x]); }
    parent[x]
}

fn union(parent: &mut Vec<usize>, rank: &mut Vec<u32>, x: usize, y: usize) {
    let (rx, ry) = (find(parent, x), find(parent, y));
    if rx == ry { return; }
    match rank[rx].cmp(&rank[ry]) { // union by rank
        std::cmp::Ordering::Less => parent[rx] = ry,
        std::cmp::Ordering::Greater => parent[ry] = rx,
        std::cmp::Ordering::Equal => { parent[ry] = rx; rank[rx] += 1; }
    }
}
```
