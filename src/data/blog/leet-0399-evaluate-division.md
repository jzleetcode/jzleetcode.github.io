---
author: JZ
pubDatetime: 2026-07-26T10:00:00Z
modDatetime: 2026-07-26T10:00:00Z
title: LeetCode 399 Evaluate Division
featured: true
tags:
  - a-graph
  - a-bfs
  - a-union-find
description:
  "Solutions for LeetCode 399, medium, tags: array, string, depth-first search, breadth-first search, union find, graph, shortest path."
---

## Table of contents

## Description

Question Links: [LeetCode 399](https://leetcode.com/problems/evaluate-division/description/)

You are given an array of variable pairs `equations` and an array of real numbers `values`, where `equations[i] = [Ai, Bi]` and `values[i]` represent the equation `Ai / Bi = values[i]`. Each `Ai` or `Bi` is a string that represents a single variable.

You are also given some `queries`, where `queries[j] = [Cj, Dj]` represents the `j`th query where you must find the answer for `Cj / Dj = ?`.

Return the answers to all queries. If a single answer cannot be determined, return `-1.0`.

```
Example 1:

Input: equations = [["a","b"],["b","c"]], values = [2.0,3.0],
       queries = [["a","c"],["b","a"],["a","e"],["a","a"],["x","x"]]
Output: [6.00000,0.50000,-1.00000,1.00000,-1.00000]
Explanation: Given: a / b = 2.0, b / c = 3.0
queries are: a / c = ?, b / a = ?, a / e = ?, a / a = ?, x / x = ?
return: [6.0, 0.5, -1.0, 1.0, -1.0 ]
note: x is undefined => -1.0

Example 2:

Input: equations = [["a","b"],["b","c"],["bc","cd"]], values = [1.5,2.5,5.0],
       queries = [["a","c"],["c","b"],["bc","cd"],["cd","bc"]]
Output: [3.75000,0.40000,5.00000,0.20000]

Example 3:

Input: equations = [["a","b"]], values = [0.5],
       queries = [["a","b"],["b","a"],["a","c"],["x","y"]]
Output: [0.50000,2.00000,-1.00000,-1.00000]

Constraints:

1 <= equations.length <= 20
equations[i].length == 2
1 <= Ai.length, Bi.length <= 5
values.length == equations.length
0.0 < values[i] <= 20.0
1 <= queries.length <= 20
queries[i].length == 2
1 <= Cj.length, Dj.length <= 5
Ai, Bi, Cj, Dj consist of lower case English letters and digits.
```

## Solution 1: BFS on Weighted Graph

### Idea

Model the equations as a weighted directed graph: for each equation `a / b = k`, add edge `a → b` with weight `k` and edge `b → a` with weight `1/k`. Then answering a query `src / dst` is equivalent to finding the product of edge weights along a path from `src` to `dst`.

```
Given: a/b = 2.0, b/c = 3.0

Graph:
  a --2.0--> b --3.0--> c
  a <--0.5-- b <--0.33-- c

Query a/c: path a → b → c, product = 2.0 * 3.0 = 6.0
Query b/a: path b → a, product = 0.5
Query a/e: no node 'e' in graph → -1.0
```

For each query, BFS from source, accumulating the product of edge weights. If the destination is reached, return the accumulated product; otherwise return -1.0.

Complexity: Time $O(Q \cdot (V + E))$, Space $O(V + E)$.

#### Java

```java []
public static double[] calcEquation(List<List<String>> equations, double[] values,
                                    List<List<String>> queries) {
    Map<String, List<double[]>> graph = new HashMap<>();
    Map<String, List<String>> adj = new HashMap<>();
    for (int i = 0; i < equations.size(); i++) { // O(E) build graph
        String a = equations.get(i).get(0);
        String b = equations.get(i).get(1);
        double val = values[i];
        adj.computeIfAbsent(a, k -> new ArrayList<>()).add(b);
        graph.computeIfAbsent(a, k -> new ArrayList<>()).add(new double[]{i, val});
        adj.computeIfAbsent(b, k -> new ArrayList<>()).add(a);
        graph.computeIfAbsent(b, k -> new ArrayList<>()).add(new double[]{i, 1.0 / val});
    }
    double[] result = new double[queries.size()];
    for (int q = 0; q < queries.size(); q++) { // O(Q * (V + E))
        String src = queries.get(q).get(0);
        String dst = queries.get(q).get(1);
        if (!adj.containsKey(src) || !adj.containsKey(dst)) result[q] = -1.0;
        else if (src.equals(dst)) result[q] = 1.0;
        else result[q] = bfs(src, dst, adj, graph);
    }
    return result;
}

private static double bfs(String src, String dst, Map<String, List<String>> adj,
                           Map<String, List<double[]>> graph) {
    Queue<String> queue = new LinkedList<>();
    Map<String, Double> dist = new HashMap<>();
    queue.offer(src);
    dist.put(src, 1.0);
    while (!queue.isEmpty()) { // O(V + E)
        String curr = queue.poll();
        List<String> neighbors = adj.get(curr);
        List<double[]> weights = graph.get(curr);
        for (int i = 0; i < neighbors.size(); i++) {
            String next = neighbors.get(i);
            if (dist.containsKey(next)) continue;
            double w = dist.get(curr) * weights.get(i)[1];
            if (next.equals(dst)) return w;
            dist.put(next, w);
            queue.offer(next);
        }
    }
    return -1.0;
}
```

#### Python

```python []
from collections import defaultdict, deque

class Solution:
    def calcEquation(self, equations, values, queries):
        graph = defaultdict(list)
        for (a, b), v in zip(equations, values):  # O(E) build adjacency list
            graph[a].append((b, v))
            graph[b].append((a, 1.0 / v))

        def bfs(src, dst):
            if src not in graph or dst not in graph:
                return -1.0
            if src == dst:
                return 1.0
            visited = {src}
            queue = deque([(src, 1.0)])
            while queue:  # O(V + E)
                node, product = queue.popleft()
                for neighbor, weight in graph[node]:
                    if neighbor == dst:
                        return product * weight
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, product * weight))
            return -1.0

        return [bfs(a, b) for a, b in queries]  # O(Q * (V + E))
```

#### C++

```cpp []
vector<double> calcEquation(vector<vector<string>> &equations,
                            vector<double> &values,
                            vector<vector<string>> &queries) {
    unordered_map<string, vector<pair<string, double>>> graph;
    for (size_t i = 0; i < equations.size(); ++i) { // O(E)
        graph[equations[i][0]].emplace_back(equations[i][1], values[i]);
        graph[equations[i][1]].emplace_back(equations[i][0], 1.0 / values[i]);
    }
    vector<double> result;
    for (auto &q : queries) { // O(Q * (V + E))
        if (graph.find(q[0]) == graph.end() || graph.find(q[1]) == graph.end()) {
            result.push_back(-1.0);
            continue;
        }
        if (q[0] == q[1]) { result.push_back(1.0); continue; }
        // BFS
        unordered_map<string, double> visited;
        queue<pair<string, double>> bfs;
        bfs.push({q[0], 1.0});
        visited[q[0]] = 1.0;
        double ans = -1.0;
        while (!bfs.empty()) { // O(V + E)
            auto [node, w] = bfs.front(); bfs.pop();
            if (node == q[1]) { ans = w; break; }
            for (auto &[nei, nw] : graph[node]) {
                if (visited.find(nei) == visited.end()) {
                    visited[nei] = w * nw;
                    bfs.push({nei, w * nw});
                }
            }
        }
        result.push_back(ans);
    }
    return result;
}
```

#### Rust

```rust []
use std::collections::{HashMap, HashSet, VecDeque};

impl Solution {
    pub fn calc_equation(
        equations: Vec<Vec<String>>, values: Vec<f64>, queries: Vec<Vec<String>>,
    ) -> Vec<f64> {
        let mut graph: HashMap<String, Vec<(String, f64)>> = HashMap::new();
        for (eq, &val) in equations.iter().zip(values.iter()) { // O(E)
            graph.entry(eq[0].clone()).or_default().push((eq[1].clone(), val));
            graph.entry(eq[1].clone()).or_default().push((eq[0].clone(), 1.0 / val));
        }
        queries.iter().map(|q| { // O(Q * (V + E))
            if !graph.contains_key(&q[0]) || !graph.contains_key(&q[1]) { return -1.0; }
            if q[0] == q[1] { return 1.0; }
            let mut queue = VecDeque::new();
            let mut visited = HashSet::new();
            queue.push_back((q[0].clone(), 1.0));
            visited.insert(q[0].clone());
            while let Some((node, acc)) = queue.pop_front() { // O(V + E)
                if node == q[1] { return acc; }
                if let Some(neighbors) = graph.get(&node) {
                    for (next, weight) in neighbors {
                        if visited.insert(next.clone()) {
                            queue.push_back((next.clone(), acc * weight));
                        }
                    }
                }
            }
            -1.0
        }).collect()
    }
}
```

## Solution 2: Union-Find with Weighted Edges

### Idea

Use a weighted Union-Find where `weight[x] = x / root(x)`. This allows answering ratio queries in near-constant time after building the structure.

```
weight[x] = x / root(x)

After building from a/b=2, b/c=3:
  root = a, weight[a]=1, weight[b]=0.5, weight[c]=1/6

Query a/c = weight[a] / weight[c] = 1 / (1/6) = 6 ✓
Query b/a = weight[b] / weight[a] = 0.5 / 1 = 0.5 ✓
```

**Path compression**: when `find(x)` compresses the path, multiply weights along the chain so `weight[x]` directly reflects `x / root`.

**Union**: given `a/b = val`, after finding roots `ra`, `rb`:
- $ra / rb = val \cdot weight[b] / weight[a]$
- Attach the lower-rank root under the higher-rank root with the computed ratio.

Complexity: Time $O((E + Q) \cdot \alpha(n))$, Space $O(V)$.

#### Java

```java []
public static double[] calcEquation2(List<List<String>> equations, double[] values,
                                     List<List<String>> queries) {
    Map<String, String> parent = new HashMap<>();
    Map<String, Double> weight = new HashMap<>(); // weight[x] = x / root(x)
    Map<String, Integer> rank = new HashMap<>();

    for (int i = 0; i < equations.size(); i++) { // O(E * alpha(n))
        String a = equations.get(i).get(0), b = equations.get(i).get(1);
        if (!parent.containsKey(a)) { parent.put(a, a); weight.put(a, 1.0); rank.put(a, 0); }
        if (!parent.containsKey(b)) { parent.put(b, b); weight.put(b, 1.0); rank.put(b, 0); }
        union(a, b, values[i], parent, weight, rank);
    }

    double[] result = new double[queries.size()];
    for (int q = 0; q < queries.size(); q++) { // O(Q * alpha(n))
        String a = queries.get(q).get(0), b = queries.get(q).get(1);
        if (!parent.containsKey(a) || !parent.containsKey(b)) result[q] = -1.0;
        else {
            String ra = find(a, parent, weight), rb = find(b, parent, weight);
            result[q] = ra.equals(rb) ? weight.get(a) / weight.get(b) : -1.0;
        }
    }
    return result;
}

private static String find(String x, Map<String, String> parent, Map<String, Double> weight) {
    if (!parent.get(x).equals(x)) { // O(alpha(n)) with path compression
        String root = find(parent.get(x), parent, weight);
        weight.put(x, weight.get(x) * weight.get(parent.get(x)));
        parent.put(x, root);
    }
    return parent.get(x);
}

private static void union(String a, String b, double val,
                           Map<String, String> parent, Map<String, Double> weight,
                           Map<String, Integer> rank) {
    String ra = find(a, parent, weight), rb = find(b, parent, weight);
    if (ra.equals(rb)) return;
    double w = val * weight.get(b) / weight.get(a); // ra/rb
    int rankA = rank.get(ra), rankB = rank.get(rb);
    if (rankA < rankB) { parent.put(ra, rb); weight.put(ra, w); }
    else if (rankA > rankB) { parent.put(rb, ra); weight.put(rb, 1.0 / w); }
    else { parent.put(rb, ra); weight.put(rb, 1.0 / w); rank.put(ra, rankA + 1); }
}
```

#### Python

```python []
class Solution2:
    def calcEquation(self, equations, values, queries):
        parent, rank, weight = {}, {}, {}  # weight[x] = x / root(x)

        def find(x):  # O(alpha(n)) amortized with path compression
            if x != parent[x]:
                root = find(parent[x])
                weight[x] *= weight[parent[x]]
                parent[x] = root
            return parent[x]

        def union(a, b, val):
            if a not in parent: parent[a], rank[a], weight[a] = a, 0, 1.0
            if b not in parent: parent[b], rank[b], weight[b] = b, 0, 1.0
            ra, rb = find(a), find(b)
            if ra == rb: return
            w = val * weight[b] / weight[a]  # ra / rb
            if rank[ra] < rank[rb]:
                parent[ra], weight[ra] = rb, w
            elif rank[ra] > rank[rb]:
                parent[rb], weight[rb] = ra, 1.0 / w
            else:
                parent[rb], weight[rb] = ra, 1.0 / w
                rank[ra] += 1

        for (a, b), v in zip(equations, values):  # O(E * alpha(n))
            union(a, b, v)

        results = []
        for a, b in queries:  # O(Q * alpha(n))
            if a not in parent or b not in parent: results.append(-1.0)
            elif find(a) != find(b): results.append(-1.0)
            else: results.append(weight[a] / weight[b])
        return results
```

#### C++

```cpp []
class Solution {
    unordered_map<string, string> parent;
    unordered_map<string, double> weight; // weight[x] = x / root(x)
    unordered_map<string, int> rank_;

    string find(const string &x) { // O(alpha(n)) with path compression
        if (parent[x] != x) {
            string root = find(parent[x]);
            weight[x] *= weight[parent[x]];
            parent[x] = root;
        }
        return parent[x];
    }

    void unite(const string &a, const string &b, double val) {
        string ra = find(a), rb = find(b);
        if (ra == rb) return;
        double w = val * weight[b] / weight[a]; // ra / rb
        if (rank_[ra] < rank_[rb]) { parent[ra] = rb; weight[ra] = w; }
        else if (rank_[ra] > rank_[rb]) { parent[rb] = ra; weight[rb] = 1.0 / w; }
        else { parent[rb] = ra; weight[rb] = 1.0 / w; rank_[ra]++; }
    }

public:
    vector<double> calcEquationUnionFind(vector<vector<string>> &equations,
                                         vector<double> &values,
                                         vector<vector<string>> &queries) {
        for (size_t i = 0; i < equations.size(); ++i) { // O(E * alpha(n))
            for (auto &node : equations[i]) {
                if (parent.find(node) == parent.end()) {
                    parent[node] = node; weight[node] = 1.0; rank_[node] = 0;
                }
            }
            unite(equations[i][0], equations[i][1], values[i]);
        }
        vector<double> result;
        for (auto &q : queries) { // O(Q * alpha(n))
            if (parent.find(q[0]) == parent.end() || parent.find(q[1]) == parent.end())
                result.push_back(-1.0);
            else {
                string ra = find(q[0]), rb = find(q[1]);
                result.push_back(ra == rb ? weight[q[0]] / weight[q[1]] : -1.0);
            }
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn calc_equation_union_find(
        equations: Vec<Vec<String>>, values: Vec<f64>, queries: Vec<Vec<String>>,
    ) -> Vec<f64> {
        let mut parent: HashMap<String, String> = HashMap::new();
        let mut weight: HashMap<String, f64> = HashMap::new();
        let mut rank: HashMap<String, u32> = HashMap::new();

        fn find(x: &str, parent: &mut HashMap<String, String>,
                weight: &mut HashMap<String, f64>) -> String {
            if parent[x] != x { // O(alpha(n)) with path compression
                let p = parent[x].clone();
                let root = find(&p, parent, weight);
                let w = weight[x] * weight[&p];
                weight.insert(x.to_string(), w);
                parent.insert(x.to_string(), root.clone());
                root
            } else { x.to_string() }
        }

        for eq in &equations {
            for node in eq {
                if !parent.contains_key(node) {
                    parent.insert(node.clone(), node.clone());
                    weight.insert(node.clone(), 1.0);
                    rank.insert(node.clone(), 0);
                }
            }
        }
        for (eq, &val) in equations.iter().zip(values.iter()) { // O(E * alpha(n))
            let ra = find(&eq[0], &mut parent, &mut weight);
            let rb = find(&eq[1], &mut parent, &mut weight);
            if ra == rb { continue; }
            let w = val * weight[&eq[1]] / weight[&eq[0]]; // ra/rb
            let (rank_a, rank_b) = (rank[&ra], rank[&rb]);
            if rank_a < rank_b { parent.insert(ra.clone(), rb); weight.insert(ra, w); }
            else if rank_a > rank_b { parent.insert(rb.clone(), ra); weight.insert(rb, 1.0/w); }
            else { parent.insert(rb.clone(), ra.clone()); weight.insert(rb, 1.0/w);
                   *rank.get_mut(&ra).unwrap() += 1; }
        }
        queries.iter().map(|q| { // O(Q * alpha(n))
            if !parent.contains_key(&q[0]) || !parent.contains_key(&q[1]) { return -1.0; }
            let ra = find(&q[0], &mut parent, &mut weight);
            let rb = find(&q[1], &mut parent, &mut weight);
            if ra != rb { -1.0 } else { weight[&q[0]] / weight[&q[1]] }
        }).collect()
    }
}
```
