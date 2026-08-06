---
author: JZ
pubDatetime: 2026-08-06T10:00:00Z
modDatetime: 2026-08-06T10:00:00Z
title: LeetCode 1514 Path with Maximum Probability
featured: true
tags:
  - a-graph
  - a-heap
  - a-shortest-path
description:
  "Solutions for LeetCode 1514, medium, tags: graph, heap, shortest path, bellman-ford."
---

## Table of contents

## Description

Question Links: [LeetCode 1514](https://leetcode.com/problems/path-with-maximum-probability/description/)

You are given an undirected weighted graph of `n` nodes (0-indexed), represented by an edge list where `edges[i] = [a, b]` is an undirected edge connecting the nodes `a` and `b` with a probability of success of traversing that edge `succProb[i]`.

Given two nodes `start` and `end`, find the path with the maximum probability of success to go from `start` to `end` and return its success probability.

If there is no path from `start` to `end`, return 0. Your answer will be accepted if it differs from the correct answer by at most `1e-5`.

```
Example 1:

Input: n = 3, edges = [[0,1],[1,2],[0,2]], succProb = [0.5,0.5,0.2], start = 0, end = 2
Output: 0.25000
Explanation: There are two paths from start to end:
  0 -> 1 -> 2: probability = 0.5 * 0.5 = 0.25
  0 -> 2:      probability = 0.2
The best path is 0 -> 1 -> 2 with probability 0.25.

Example 2:

Input: n = 3, edges = [[0,1],[1,2],[0,2]], succProb = [0.5,0.5,0.3], start = 0, end = 2
Output: 0.30000
Explanation: The direct path 0 -> 2 has probability 0.3 which is better than 0 -> 1 -> 2 = 0.25.

Example 3:

Input: n = 3, edges = [[0,1]], succProb = [0.5], start = 0, end = 2
Output: 0.00000
Explanation: There is no path between 0 and 2.
```

**Constraints:**

- `2 <= n <= 10^4`
- `0 <= start, end < n`
- `start != end`
- `0 <= a, b < n`
- `a != b`
- `0 <= succProb.length == edges.length <= 2*10^4`
- `0 <= succProb[i] <= 1`
- There is at most one edge between every two nodes.

## Idea

This is a single-source shortest path problem on a graph with non-negative edge weights (probabilities between 0 and 1). Instead of minimizing distance, we maximize the product of edge probabilities along the path.

**Solution 1 — Modified Dijkstra:** Use a max-heap (priority queue) seeded with probability 1.0 at the start node. At each step, pop the node with the highest probability. For each neighbor, if `current_prob * edge_prob > best_known[neighbor]`, push the new probability. The first time we pop the end node, that's the answer.

This works because probabilities are in `[0, 1]`, so the product can only decrease or stay the same as we extend a path — analogous to non-negative edge weights in classic Dijkstra. The greedy property holds: the highest-probability path found so far cannot be improved by extending any lower-probability path.

**Solution 2 — Bellman-Ford:** Initialize `prob[start] = 1.0`, all others 0. Relax all edges up to `V-1` times. Since the graph is undirected, relax both directions per edge. Stop early if no update occurs in a round.

```
Graph: n=3, edges=[[0,1],[1,2],[0,2]], probs=[0.5, 0.5, 0.2]

    0 ---0.5--- 1
    |           |
   0.2        0.5
    |           |
    +--------- 2

Dijkstra from 0:
  heap: [(1.0, 0)]
  pop (1.0, 0): relax → push (0.5, 1), push (0.2, 2)
  pop (0.5, 1): relax → push (0.25, 2)
  pop (0.25, 2): node==end → return 0.25
```

Complexity:
- Dijkstra: Time $O((V+E) \log V)$, Space $O(V+E)$.
- Bellman-Ford: Time $O(V \cdot E)$, Space $O(V)$.

### Java

```java []
// Modified Dijkstra, O((V+E)logV) time, O(V+E) space.
public static double maxProbability(int n, int[][] edges, double[] succProb, int start, int end) {
    List<List<double[]>> graph = new ArrayList<>();
    for (int i = 0; i < n; i++) graph.add(new ArrayList<>()); // O(V) init
    for (int i = 0; i < edges.length; i++) { // O(E) build adjacency list
        int a = edges[i][0], b = edges[i][1];
        double p = succProb[i];
        graph.get(a).add(new double[]{b, p});
        graph.get(b).add(new double[]{a, p});
    }
    double[] prob = new double[n];
    prob[start] = 1.0;
    PriorityQueue<double[]> pq = new PriorityQueue<>((a, b) -> Double.compare(b[0], a[0]));
    pq.offer(new double[]{1.0, start});
    while (!pq.isEmpty()) { // O((V+E) log V) total
        double[] cur = pq.poll();
        double curProb = cur[0];
        int node = (int) cur[1];
        if (node == end) return curProb;
        if (curProb < prob[node]) continue;
        for (double[] next : graph.get(node)) { // O(degree) neighbors
            int neighbor = (int) next[0];
            double edgeProb = next[1];
            double newProb = curProb * edgeProb;
            if (newProb > prob[neighbor]) {
                prob[neighbor] = newProb;
                pq.offer(new double[]{newProb, neighbor});
            }
        }
    }
    return 0.0;
}
```
```java []
// Bellman-Ford, O(V*E) time, O(V) space.
public static double maxProbability2(int n, int[][] edges, double[] succProb, int start, int end) {
    double[] prob = new double[n];
    prob[start] = 1.0;
    for (int i = 0; i < n - 1; i++) { // O(V-1) rounds
        boolean updated = false;
        for (int j = 0; j < edges.length; j++) { // O(E) edges per round
            int a = edges[j][0], b = edges[j][1];
            double p = succProb[j];
            if (prob[a] * p > prob[b]) { prob[b] = prob[a] * p; updated = true; }
            if (prob[b] * p > prob[a]) { prob[a] = prob[b] * p; updated = true; }
        }
        if (!updated) break;
    }
    return prob[end];
}
```

### Python

```python []
# Modified Dijkstra, O((V+E)logV) time, O(V+E) space.
class Solution:
    def maxProbability(self, n: int, edges: list[list[int]], succProb: list[float],
                       start_node: int, end_node: int) -> float:
        graph = defaultdict(list)
        for (u, v), prob in zip(edges, succProb):  # O(E)
            graph[u].append((v, prob))
            graph[v].append((u, prob))
        max_prob = [0.0] * n  # O(V)
        max_prob[start_node] = 1.0
        pq = [(-1.0, start_node)]  # max-heap via negation
        while pq:  # O((V+E)logV)
            neg_prob, node = heapq.heappop(pq)  # O(logV)
            cur_prob = -neg_prob
            if node == end_node:
                return cur_prob
            if cur_prob < max_prob[node]:
                continue
            for neighbor, edge_prob in graph[node]:  # O(degree) per node
                new_prob = cur_prob * edge_prob
                if new_prob > max_prob[neighbor]:
                    max_prob[neighbor] = new_prob
                    heapq.heappush(pq, (-new_prob, neighbor))  # O(logV)
        return 0.0
```
```python []
# Bellman-Ford, O(V*E) time, O(V) space.
class Solution2:
    def maxProbability(self, n: int, edges: list[list[int]], succProb: list[float],
                       start_node: int, end_node: int) -> float:
        max_prob = [0.0] * n  # O(V)
        max_prob[start_node] = 1.0
        for _ in range(n - 1):  # O(V) iterations
            updated = False
            for (u, v), prob in zip(edges, succProb):  # O(E) per iteration
                if max_prob[u] * prob > max_prob[v]:
                    max_prob[v] = max_prob[u] * prob
                    updated = True
                if max_prob[v] * prob > max_prob[u]:
                    max_prob[u] = max_prob[v] * prob
                    updated = True
            if not updated:
                break
        return max_prob[end_node]
```

### C++

```cpp []
// Modified Dijkstra, O((V+E)logV) time, O(V+E) space.
double maxProbability(int n, vector<vector<int>>& edges, vector<double>& succProb,
                      int start_node, int end_node) {
    vector<vector<pair<int, double>>> graph(n);
    for (int i = 0; i < (int)edges.size(); ++i) {
        int u = edges[i][0], v = edges[i][1];
        double w = succProb[i];
        graph[u].emplace_back(v, w);
        graph[v].emplace_back(u, w);
    }
    vector<double> prob(n, 0.0);
    prob[start_node] = 1.0;
    priority_queue<pair<double, int>> pq;
    pq.emplace(1.0, start_node);
    // O((V+E)logV) — each node extracted at most once, each edge relaxed once
    while (!pq.empty()) {
        auto [p, u] = pq.top(); pq.pop();
        if (u == end_node) return p;
        if (p < prob[u]) continue;
        for (auto& [v, w] : graph[u]) { // O(degree(u)) per node
            double newProb = p * w;
            if (newProb > prob[v]) {
                prob[v] = newProb;
                pq.emplace(newProb, v);
            }
        }
    }
    return 0.0;
}
```
```cpp []
// Bellman-Ford, O(V*E) time, O(V) space.
double maxProbability(int n, vector<vector<int>>& edges, vector<double>& succProb,
                      int start_node, int end_node) {
    vector<double> prob(n, 0.0);
    prob[start_node] = 1.0;
    for (int i = 0; i < n - 1; ++i) { // O(V) iterations
        bool updated = false;
        for (int j = 0; j < (int)edges.size(); ++j) { // O(E) relaxations per iteration
            int u = edges[j][0], v = edges[j][1];
            double w = succProb[j];
            if (prob[u] * w > prob[v]) { prob[v] = prob[u] * w; updated = true; }
            if (prob[v] * w > prob[u]) { prob[u] = prob[v] * w; updated = true; }
        }
        if (!updated) break;
    }
    return prob[end_node];
}
```

### Rust

```rust []
// Modified Dijkstra, O((V+E)logV) time, O(V+E) space.
pub fn max_probability(n: i32, edges: Vec<Vec<i32>>, succ_prob: Vec<f64>,
                       start_node: i32, end_node: i32) -> f64 {
    let n = n as usize;
    let (start, end) = (start_node as usize, end_node as usize);
    let mut graph: Vec<Vec<(usize, f64)>> = vec![vec![]; n];
    for (i, edge) in edges.iter().enumerate() { // O(E)
        let (u, v) = (edge[0] as usize, edge[1] as usize);
        graph[u].push((v, succ_prob[i]));
        graph[v].push((u, succ_prob[i]));
    }
    let mut dist = vec![0.0_f64; n];
    dist[start] = 1.0;
    let mut heap = BinaryHeap::new();
    heap.push((FloatOrd(1.0), start));
    while let Some((FloatOrd(prob), u)) = heap.pop() { // O((V+E)logV)
        if u == end { return prob; }
        if prob < dist[u] { continue; }
        for &(v, edge_prob) in &graph[u] { // O(degree)
            let new_prob = prob * edge_prob;
            if new_prob > dist[v] {
                dist[v] = new_prob;
                heap.push((FloatOrd(new_prob), v));
            }
        }
    }
    0.0
}
```
```rust []
// Bellman-Ford, O(V*E) time, O(V) space.
pub fn max_probability2(n: i32, edges: Vec<Vec<i32>>, succ_prob: Vec<f64>,
                        start_node: i32, end_node: i32) -> f64 {
    let n = n as usize;
    let (start, end) = (start_node as usize, end_node as usize);
    let mut dist = vec![0.0_f64; n];
    dist[start] = 1.0;
    for _ in 0..n - 1 { // O(V) iterations
        let mut updated = false;
        for (i, edge) in edges.iter().enumerate() { // O(E) per iteration
            let (u, v) = (edge[0] as usize, edge[1] as usize);
            let p = succ_prob[i];
            if dist[u] * p > dist[v] { dist[v] = dist[u] * p; updated = true; }
            if dist[v] * p > dist[u] { dist[u] = dist[v] * p; updated = true; }
        }
        if !updated { break; }
    }
    dist[end]
}
```
