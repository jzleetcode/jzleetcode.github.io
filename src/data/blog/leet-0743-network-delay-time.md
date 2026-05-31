---
author: JZ
pubDatetime: 2026-05-26T06:00:00Z
modDatetime: 2026-05-26T06:00:00Z
title: LeetCode 743 Network Delay Time
featured: false
tags:
  - a-graph
  - a-heap
  - a-shortest-path
description:
  "Solutions for LeetCode 743, medium, tags: graph, heap, shortest path, Dijkstra, Bellman-Ford."
---

## Table of contents

## Description

Question Links: [LeetCode 743](https://leetcode.com/problems/network-delay-time/description/)

You are given a network of `n` nodes, labeled from `1` to `n`. You are also given `times`, a list of travel times as directed edges `times[i] = (ui, vi, wi)`, where `ui` is the source node, `vi` is the target node, and `wi` is the time it takes for a signal to travel from source to target.

We will send a signal from a given node `k`. Return the minimum time it takes for all the `n` nodes to receive the signal. If it is impossible for all the `n` nodes to receive the signal, return `-1`.

```
Example 1:

Input: times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2
Output: 2

Example 2:

Input: times = [[1,2,1]], n = 2, k = 1
Output: 1

Example 3:

Input: times = [[1,2,1]], n = 2, k = 2
Output: -1

Constraints:

1 <= k <= n <= 100
1 <= times.length <= 6000
times[i].length == 3
1 <= ui, vi <= n
ui != vi
0 <= wi <= 100
All the pairs (ui, vi) are unique. (i.e., no multiple edges.)
```

## Solution 1: Dijkstra's Algorithm

### Idea

This is a single-source shortest path problem — find the shortest time from node `k` to every other node, then return the maximum. Dijkstra's algorithm works here because all edge weights are non-negative.

We use a min-heap priority queue storing `(distance, node)`. At each step we pop the node with the smallest known distance, then relax its neighbors. If a neighbor's distance improves, we push the new distance.

```
times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2

Adjacency list:
  2 -> [(1,1), (3,1)]
  3 -> [(4,1)]

Dijkstra from node 2:
  dist = [_, inf, 0, inf, inf]   (index 0 unused)
  pop (0, 2): relax 1 -> dist[1]=1, relax 3 -> dist[3]=1
  pop (1, 1): no outgoing edges
  pop (1, 3): relax 4 -> dist[4]=2
  pop (2, 4): no outgoing edges

  max(dist[1..4]) = 2
```

Complexity: Time $O(E \log V)$ — each edge is relaxed once, each push/pop is $O(\log V)$. Space $O(V + E)$.

#### Java

```java []
public int networkDelayTimeDijkstra(int[][] times, int n, int k) {
    Map<Integer, List<int[]>> graph = new HashMap<>();
    for (int[] edge : times) { // O(E)
        graph.putIfAbsent(edge[0], new ArrayList<>());
        graph.get(edge[0]).add(new int[]{edge[1], edge[2]});
    }
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));
    int[] distTo = new int[n + 1];
    Arrays.fill(distTo, Integer.MAX_VALUE);
    distTo[k] = 0;
    pq.offer(new int[]{0, k}); // {dist, node}
    int max = 0;
    while (!pq.isEmpty()) { // O(E log V) total
        int[] cur = pq.remove();
        int curDist = cur[0], v = cur[1];
        if (curDist > distTo[v]) continue;
        max = curDist;
        n--;
        if (!graph.containsKey(v)) continue;
        for (int[] next : graph.get(v)) {
            int w = next[0], d = next[1];
            if (curDist + d < distTo[w]) {
                distTo[w] = curDist + d;
                pq.add(new int[]{distTo[w], w});
            }
        }
    }
    return n == 0 ? max : -1; // Time O(E log V), Space O(V + E)
}
```

#### Python

```python []
class Solution:
    def networkDelayTime(self, times: list[list[int]], n: int, k: int) -> int:
        graph = defaultdict(list)
        for u, v, w in times:  # O(E)
            graph[u].append((v, w))
        dist = [float('inf')] * (n + 1)
        dist[k] = 0
        pq = [(0, k)]  # (distance, node)
        while pq:  # O(E log V) total
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for v, w in graph[u]:  # relaxation
                if dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
                    heapq.heappush(pq, (dist[v], v))
        res = max(dist[1:])  # O(V)
        return res if res < float('inf') else -1
```

#### C++

```cpp []
int networkDelayTime(vector<vector<int>>& times, int n, int k) {
    vector<vector<pair<int, int>>> graph(n + 1);
    for (auto& t : times) // O(E)
        graph[t[0]].emplace_back(t[1], t[2]);
    vector<int> dist(n + 1, INT_MAX);
    dist[k] = 0;
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    pq.emplace(0, k);
    while (!pq.empty()) { // O(E log V) total
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;
        for (auto& [v, w] : graph[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.emplace(dist[v], v);
            }
        }
    }
    int ans = *max_element(dist.begin() + 1, dist.end());
    return ans == INT_MAX ? -1 : ans; // Time O(E log V), Space O(V + E)
}
```

#### Rust

```rust []
pub fn network_delay_time(times: Vec<Vec<i32>>, n: i32, k: i32) -> i32 {
    let n = n as usize;
    let mut graph = vec![vec![]; n + 1];
    for edge in &times { // O(E)
        graph[edge[0] as usize].push((edge[1] as usize, edge[2]));
    }
    let mut dist = vec![i32::MAX; n + 1];
    dist[k as usize] = 0;
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((0, k as usize)));
    while let Some(Reverse((d, u))) = heap.pop() { // O(E log V) total
        if d > dist[u] { continue; }
        for &(v, w) in &graph[u] {
            let nd = d + w;
            if nd < dist[v] {
                dist[v] = nd;
                heap.push(Reverse((nd, v)));
            }
        }
    }
    let ans = dist[1..=n].iter().copied().max().unwrap();
    if ans == i32::MAX { -1 } else { ans } // Time O(E log V), Space O(V + E)
}
```

## Solution 2: Bellman-Ford

### Idea

Bellman-Ford relaxes all edges `V-1` times. It's simpler than Dijkstra and also handles negative weights (not needed here, but it uses a different data structure — just an array instead of a heap).

Complexity: Time $O(V \cdot E)$, Space $O(V)$.

#### Python

```python []
class Solution2:
    def networkDelayTime(self, times: list[list[int]], n: int, k: int) -> int:
        dist = [float('inf')] * (n + 1)
        dist[k] = 0
        for _ in range(n - 1):  # O(V) iterations
            for u, v, w in times:  # O(E) edges
                if dist[u] + w < dist[v]:
                    dist[v] = dist[u] + w
        res = max(dist[1:])
        return res if res < float('inf') else -1
```
