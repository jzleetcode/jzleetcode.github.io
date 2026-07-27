---
author: JZ
pubDatetime: 2026-07-27T10:36:00Z
modDatetime: 2026-07-27T10:36:00Z
title: LeetCode 1584 Min Cost to Connect All Points
featured: true
tags:
  - a-graph
  - a-heap
  - a-union-find
  - a-minimum-spanning-tree
description:
  "Solutions for LeetCode 1584, medium, tags: array, union find, graph, minimum spanning tree."
---

## Table of contents

## Description

Question Links: [LeetCode 1584](https://leetcode.com/problems/min-cost-to-connect-all-points/description/)

You are given an array `points` representing integer coordinates of some points on a 2D-plane, where `points[i] = [xi, yi]`.

The cost of connecting two points `[xi, yi]` and `[xj, yj]` is the **Manhattan distance** between them: `|xi - xj| + |yi - yj|`.

Return the minimum cost to make all points connected. All points are connected if there is **exactly one** simple path between any two points.

```
Example 1:

Input: points = [[0,0],[2,2],[3,10],[5,2],[7,0]]
Output: 20

Example 2:

Input: points = [[3,12],[-2,5],[-4,1]]
Output: 18

Constraints:

1 <= points.length <= 1000
-10^6 <= xi, yi <= 10^6
All pairs (xi, yi) are distinct.
```

## Solution 1: Prim's Algorithm

### Idea

This is a Minimum Spanning Tree (MST) problem on a **complete graph** of `n` nodes where the edge weight between any two nodes is their Manhattan distance. Prim's algorithm grows the MST one node at a time by always adding the cheapest edge that connects a node in the tree to a node outside it.

We use a min-heap storing `(cost, node)`. Start from node 0 with cost 0. Pop the cheapest entry; if not visited, add it to the MST and push all edges to unvisited nodes.

```
points = [[0,0],[2,2],[3,10],[5,2],[7,0]]

Manhattan distances (complete graph):
  0-1: 4,  0-2: 13, 0-3: 7,  0-4: 7
  1-2: 9,  1-3: 3,  1-4: 7
  2-3: 10, 2-4: 14
  3-4: 4

Prim's from node 0:
  pop (0, 0): push edges to 1,2,3,4
  pop (4, 1): push edges to 2,3,4
  pop (3, 3): from node 1 → push edges to 2,4
  pop (4, 4): from node 3 → push edge to 2
  pop (9, 2): from node 1

  MST edges: 0-1(4) + 1-3(3) + 3-4(4) + 1-2(9) = 20
```

Complexity: Time $O(n^2 \log n)$ — up to $n^2$ edges pushed onto the heap, each push/pop is $O(\log(n^2)) = O(\log n)$. Space $O(n^2)$ — heap can hold up to $n^2$ entries.

#### Java

```java []
public static int minCostConnectPointsPrim(int[][] points) {
    int n = points.length;
    if (n <= 1) return 0;
    boolean[] visited = new boolean[n];
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
    pq.offer(new int[]{0, 0});
    int totalCost = 0;
    int edgesUsed = 0;
    while (edgesUsed < n) { // O(n) nodes added to MST
        int[] curr = pq.poll();
        int cost = curr[0], node = curr[1];
        if (visited[node]) continue;
        visited[node] = true;
        totalCost += cost;
        edgesUsed++;
        for (int next = 0; next < n; next++) { // O(n) neighbors
            if (!visited[next]) {
                int dist = Math.abs(points[node][0] - points[next][0])
                         + Math.abs(points[node][1] - points[next][1]);
                pq.offer(new int[]{dist, next}); // O(log n) push
            }
        }
    }
    return totalCost; // Time O(n^2 log n), Space O(n^2)
}
```

#### Python

```python []
class Solution:
    """Prim's algorithm with min-heap. O(n^2 * log(n)) time, O(n^2) space."""

    def minCostConnectPoints(self, points: List[List[int]]) -> int:
        n = len(points)
        if n <= 1:
            return 0
        visited = [False] * n
        heap = [(0, 0)]  # (cost, node)
        total = 0
        edges_used = 0
        while edges_used < n:
            cost, u = heapq.heappop(heap)
            if visited[u]:
                continue
            visited[u] = True
            total += cost
            edges_used += 1
            for v in range(n):  # O(n) neighbors
                if not visited[v]:
                    d = abs(points[u][0] - points[v][0]) + abs(points[u][1] - points[v][1])
                    heapq.heappush(heap, (d, v))  # O(log(n^2)) = O(log n)
        return total
```

#### C++

```cpp []
int minCostConnectPoints(vector<vector<int>>& points) {
    int n = points.size();
    if (n <= 1) return 0;
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    vector<bool> inMST(n, false);
    pq.emplace(0, 0);
    int totalCost = 0, edgesUsed = 0;
    while (edgesUsed < n) { // O(n) nodes added
        auto [cost, u] = pq.top();
        pq.pop();
        if (inMST[u]) continue;
        inMST[u] = true;
        totalCost += cost;
        edgesUsed++;
        for (int v = 0; v < n; v++) { // O(n) neighbors
            if (!inMST[v]) {
                int dist = abs(points[u][0] - points[v][0])
                         + abs(points[u][1] - points[v][1]);
                pq.emplace(dist, v); // O(log n) push
            }
        }
    }
    return totalCost; // Time O(n^2 log n), Space O(n^2)
}
```

#### Rust

```rust []
pub fn min_cost_connect_points(points: Vec<Vec<i32>>) -> i32 {
    let n = points.len();
    if n <= 1 { return 0; }
    let mut in_mst = vec![false; n];
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((0i32, 0usize)));
    let mut total_cost = 0;
    let mut edges_added = 0;
    while let Some(Reverse((cost, u))) = heap.pop() { // O(n^2 log n) total
        if in_mst[u] { continue; }
        in_mst[u] = true;
        total_cost += cost;
        edges_added += 1;
        if edges_added == n { break; }
        for v in 0..n { // O(n) per node
            if !in_mst[v] {
                let dist = (points[u][0] - points[v][0]).abs()
                    + (points[u][1] - points[v][1]).abs();
                heap.push(Reverse((dist, v)));
            }
        }
    }
    total_cost // Time O(n^2 log n), Space O(n^2)
}
```

## Solution 2: Kruskal's Algorithm

### Idea

Kruskal's builds the MST by sorting all edges and greedily adding the cheapest edge that doesn't form a cycle. We use Union-Find (Disjoint Set Union) with **rank** and **path halving** to efficiently detect cycles.

For `n` points on a complete graph there are $\frac{n(n-1)}{2}$ edges. We generate all edges, sort them, then iterate in order — adding each edge that connects two previously-disconnected components until we have `n-1` edges.

```
Same example — edges sorted by weight:
  1-3: 3
  0-1: 4, 3-4: 4
  0-3: 7, 0-4: 7, 1-4: 7
  1-2: 9
  2-3: 10
  0-2: 13
  2-4: 14

Process:
  union(1,3): cost 3, components {0}{1,3}{2}{4}
  union(0,1): cost 4, components {0,1,3}{2}{4}
  union(3,4): cost 4, components {0,1,3,4}{2}
  union(0,3): skip (same component)
  ...
  union(1,2): cost 9, components {0,1,2,3,4} — done!

  Total = 3 + 4 + 4 + 9 = 20
```

Complexity: Time $O(n^2 \log n)$ — dominated by sorting $O(n^2)$ edges. Space $O(n^2)$ — storing all edges.

#### Java

```java []
public static int minCostConnectPointsKruskal(int[][] points) {
    int n = points.length;
    if (n <= 1) return 0;
    List<int[]> edges = new ArrayList<>(n * (n - 1) / 2);
    for (int i = 0; i < n; i++) // O(n^2) edges
        for (int j = i + 1; j < n; j++) {
            int dist = Math.abs(points[i][0] - points[j][0])
                     + Math.abs(points[i][1] - points[j][1]);
            edges.add(new int[]{dist, i, j});
        }
    edges.sort(Comparator.comparingInt(a -> a[0])); // O(n^2 log n)
    int[] parent = new int[n], rank = new int[n];
    for (int i = 0; i < n; i++) parent[i] = i;
    int totalCost = 0, edgesUsed = 0;
    for (int[] edge : edges) { // O(n^2 * alpha(n))
        if (edgesUsed == n - 1) break;
        int rootU = find(parent, edge[1]), rootV = find(parent, edge[2]);
        if (rootU != rootV) {
            union(parent, rank, rootU, rootV);
            totalCost += edge[0];
            edgesUsed++;
        }
    }
    return totalCost; // Time O(n^2 log n), Space O(n^2)
}

private static int find(int[] parent, int x) {
    while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
}

private static void union(int[] parent, int[] rank, int x, int y) {
    if (rank[x] < rank[y]) { parent[x] = y; }
    else if (rank[x] > rank[y]) { parent[y] = x; }
    else { parent[y] = x; rank[x]++; }
}
```

#### Python

```python []
class Solution2:
    """Kruskal's algorithm with Union-Find. O(n^2 * log(n)) time, O(n^2) space."""

    def minCostConnectPoints(self, points: List[List[int]]) -> int:
        n = len(points)
        if n <= 1:
            return 0
        parent = list(range(n))
        rank = [0] * n

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]  # path halving
                x = parent[x]
            return x

        def union(a, b) -> bool:
            ra, rb = find(a), find(b)
            if ra == rb:
                return False
            if rank[ra] < rank[rb]:
                ra, rb = rb, ra
            parent[rb] = ra
            if rank[ra] == rank[rb]:
                rank[ra] += 1
            return True

        edges = []
        for i in range(n):  # O(n^2) edges
            for j in range(i + 1, n):
                d = abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1])
                edges.append((d, i, j))
        edges.sort()  # O(n^2 log n)

        total = 0
        edges_used = 0
        for cost, u, v in edges:
            if union(u, v):
                total += cost
                edges_used += 1
                if edges_used == n - 1:
                    break
        return total
```

#### C++

```cpp []
int minCostConnectPoints(vector<vector<int>>& points) {
    int n = points.size();
    if (n <= 1) return 0;
    vector<array<int, 3>> edges;
    edges.reserve(n * (n - 1) / 2);
    for (int i = 0; i < n; i++) // O(n^2) edges
        for (int j = i + 1; j < n; j++) {
            int dist = abs(points[i][0] - points[j][0])
                     + abs(points[i][1] - points[j][1]);
            edges.push_back({dist, i, j});
        }
    sort(edges.begin(), edges.end()); // O(n^2 log n)
    vector<int> parent(n), rank_(n, 0);
    iota(parent.begin(), parent.end(), 0);
    auto find = [&](int x) {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    };
    int totalCost = 0, edgesUsed = 0;
    for (auto& [cost, u, v] : edges) { // O(n^2 * alpha(n))
        int pu = find(u), pv = find(v);
        if (pu != pv) {
            if (rank_[pu] < rank_[pv]) swap(pu, pv);
            parent[pv] = pu;
            if (rank_[pu] == rank_[pv]) rank_[pu]++;
            totalCost += cost;
            if (++edgesUsed == n - 1) break;
        }
    }
    return totalCost; // Time O(n^2 log n), Space O(n^2)
}
```

#### Rust

```rust []
pub fn min_cost_connect_points(points: Vec<Vec<i32>>) -> i32 {
    let n = points.len();
    if n <= 1 { return 0; }
    let mut edges: Vec<(i32, usize, usize)> = Vec::with_capacity(n * (n - 1) / 2);
    for i in 0..n { // O(n^2) edges
        for j in (i + 1)..n {
            let dist = (points[i][0] - points[j][0]).abs()
                + (points[i][1] - points[j][1]).abs();
            edges.push((dist, i, j));
        }
    }
    edges.sort_unstable(); // O(n^2 log n)
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank = vec![0u8; n];
    fn find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x { parent[x] = parent[parent[x]]; x = parent[x]; }
        x
    }
    let mut total_cost = 0;
    let mut edges_used = 0;
    for (cost, u, v) in edges { // O(n^2 * alpha(n))
        let ru = find(&mut parent, u);
        let rv = find(&mut parent, v);
        if ru != rv {
            if rank[ru] < rank[rv] { parent[ru] = rv; }
            else { if rank[ru] == rank[rv] { rank[ru] += 1; } parent[rv] = ru; }
            total_cost += cost;
            edges_used += 1;
            if edges_used == n - 1 { break; }
        }
    }
    total_cost // Time O(n^2 log n), Space O(n^2)
}
```
