---
author: JZ
pubDatetime: 2026-06-05T06:00:00Z
modDatetime: 2026-06-05T06:00:00Z
title: LeetCode 787 Cheapest Flights Within K Stops
featured: true
tags:
  - a-graph
  - a-bfs
  - a-dp
  - a-shortest-path
description:
  "Solutions for LeetCode 787, medium, tags: dynamic programming, BFS, graph, heap, shortest path."
---

## Table of contents

## Description

Question Links: [LeetCode 787](https://leetcode.com/problems/cheapest-flights-within-k-stops/description/)

There are `n` cities connected by some number of flights. You are given an array `flights` where `flights[i] = [from_i, to_i, price_i]` indicates that there is a flight from city `from_i` to city `to_i` with cost `price_i`.

You are also given three integers `src`, `dst`, and `k`, return the cheapest price from `src` to `dst` with at most `k` stops. If there is no such route, return `-1`.

```
Example 1:

Input: n = 4, flights = [[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]], src = 0, dst = 3, k = 1
Output: 700
Explanation: The optimal path with at most 1 stop: 0 -> 1 -> 3 (cost 700).
The path 0 -> 1 -> 2 -> 3 costs 400 but uses 2 stops.

Example 2:

Input: n = 3, flights = [[0,1,100],[1,2,100],[0,2,500]], src = 0, dst = 2, k = 1
Output: 200
Explanation: The cheapest path: 0 -> 1 -> 2 (cost 200, 1 stop).

Example 3:

Input: n = 3, flights = [[0,1,100],[1,2,100],[0,2,500]], src = 0, dst = 2, k = 0
Output: 500
Explanation: With 0 stops allowed, only the direct flight 0 -> 2 works.

Constraints:

1 <= n <= 100
0 <= flights.length <= (n * (n - 1) / 2)
flights[i].length == 3
0 <= from_i, to_i < n
from_i != to_i
1 <= price_i <= 10^4
There will not be any multiple flights between two cities.
0 <= src, dst, k < n
src != dst
```

## Solution 1: Bellman-Ford Variant

### Idea

Standard Dijkstra doesn't work here because we need to limit the number of edges (stops) in the path. Instead, we use a Bellman-Ford variant that relaxes all edges exactly `k+1` times (since `k` stops means `k+1` edges).

The key insight: we use the **previous round's** distances when relaxing (copy the array before each round), so that each round only extends paths by exactly one more edge.

```
n = 4, flights = [[0,1,100],[1,2,100],[2,0,100],[1,3,600],[2,3,200]]
src = 0, dst = 3, k = 1

Round 0 (1st edge):
  prices = [0, inf, inf, inf]
  relax: 0->1: prices[1] = 100
         0->2: no (prices[2] unchanged)
         1->3: prices[3] = 600 (via 0->1->3? No, from prices[0]+... wait)
  After:  [0, 100, inf, 600]
  Actually: edge 0->1 gives 100, edge 1->3 uses OLD prices[1]=inf, skip
            Only 0->1 is relaxed: [0, 100, inf, inf]

Round 1 (2nd edge, k=1 stop):
  From prev [0, 100, inf, inf]:
  edge 1->2: 100+100=200, edge 1->3: 100+600=700
  After:  [0, 100, 200, 700]

Answer: prices[3] = 700
```

Complexity: Time $O((k+1) \cdot E)$ — `k+1` rounds, each scanning all edges. Space $O(n)$.

#### Java

```java []
public static int findCheapestPriceBF(int n, int[][] flights, int src, int dst, int k) {
    int[] prices = new int[n];
    Arrays.fill(prices, Integer.MAX_VALUE);
    prices[src] = 0;
    for (int i = 0; i <= k; i++) { // O(k+1) rounds
        int[] tmp = prices.clone();
        for (int[] f : flights) { // O(E) edges per round
            if (prices[f[0]] != Integer.MAX_VALUE && prices[f[0]] + f[2] < tmp[f[1]]) {
                tmp[f[1]] = prices[f[0]] + f[2];
            }
        }
        prices = tmp;
    }
    return prices[dst] == Integer.MAX_VALUE ? -1 : prices[dst];
}
```

#### Python

```python []
def findCheapestPrice(self, n: int, flights: list[list[int]], src: int, dst: int, k: int) -> int:
    INF = float("inf")
    prices = [INF] * n
    prices[src] = 0
    for _ in range(k + 1):  # O(k+1) rounds
        tmp = prices[:]
        for u, v, w in flights:  # O(E) edges per round
            if prices[u] != INF and prices[u] + w < tmp[v]:
                tmp[v] = prices[u] + w
        prices = tmp
    return prices[dst] if prices[dst] != INF else -1
```

#### C++

```cpp []
int findCheapestPrice(int n, vector<vector<int>>& flights, int src, int dst, int k) {
    vector<int> prices(n, INT_MAX);
    prices[src] = 0;
    for (int i = 0; i <= k; i++) { // O(k+1) rounds
        vector<int> tmp(prices);
        for (auto& f : flights) { // O(E) edges per round
            if (prices[f[0]] != INT_MAX && prices[f[0]] + f[2] < tmp[f[1]]) {
                tmp[f[1]] = prices[f[0]] + f[2];
            }
        }
        prices = tmp;
    }
    return prices[dst] == INT_MAX ? -1 : prices[dst];
}
```

#### Rust

```rust []
pub fn find_cheapest_price_bf(n: i32, flights: Vec<Vec<i32>>, src: i32, dst: i32, k: i32) -> i32 {
    let n = n as usize;
    let mut prices = vec![i32::MAX; n];
    prices[src as usize] = 0;
    for _ in 0..=k { // O(k+1) rounds
        let mut tmp = prices.clone();
        for f in &flights { // O(E) edges per round
            let (u, v, w) = (f[0] as usize, f[1] as usize, f[2]);
            if prices[u] != i32::MAX && prices[u] + w < tmp[v] {
                tmp[v] = prices[u] + w;
            }
        }
        prices = tmp;
    }
    if prices[dst as usize] == i32::MAX { -1 } else { prices[dst as usize] }
}
```

## Solution 2: BFS with Pruning

### Idea

Level-order BFS where each level represents one additional stop. We track the best-known distance to each node and only enqueue a neighbor if the new cost is strictly better. This prunes paths that can't improve on known costs.

```
n = 3, flights = [[0,1,100],[1,2,100],[0,2,500]], src = 0, dst = 2, k = 1

Level 0 (direct flights from src):
  queue: [(0, 0)]
  dist = [0, inf, inf]
  Process node 0: neighbors 1 (cost 100), 2 (cost 500)
    dist = [0, 100, 500], queue: [(1,100), (2,500)]

Level 1 (1 stop):
  Process node 1: neighbor 2 (cost 100+100=200 < 500)
    dist = [0, 100, 200], queue: [(2,200)]
  Process node 2: no outgoing edges

stops = 2 > k = 1, stop.
Answer: dist[2] = 200
```

Complexity: Time $O((k+1) \cdot E)$ — in the worst case each level processes all edges. Space $O(n + E)$.

#### Java

```java []
public static int findCheapestPriceBFS(int n, int[][] flights, int src, int dst, int k) {
    List<List<int[]>> graph = new ArrayList<>();
    for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
    for (int[] f : flights) graph.get(f[0]).add(new int[]{f[1], f[2]});
    int[] dist = new int[n];
    Arrays.fill(dist, Integer.MAX_VALUE);
    dist[src] = 0;
    Queue<int[]> q = new ArrayDeque<>();
    q.offer(new int[]{src, 0});
    int stops = 0;
    while (!q.isEmpty() && stops <= k) {
        int size = q.size();
        for (int i = 0; i < size; i++) { // O(level width)
            int[] cur = q.poll();
            for (int[] nei : graph.get(cur[0])) { // O(edges from node)
                int newCost = cur[1] + nei[1];
                if (newCost < dist[nei[0]]) {
                    dist[nei[0]] = newCost;
                    q.offer(new int[]{nei[0], newCost});
                }
            }
        }
        stops++;
    }
    return dist[dst] == Integer.MAX_VALUE ? -1 : dist[dst];
}
```

#### Python

```python []
def findCheapestPrice(self, n: int, flights: list[list[int]], src: int, dst: int, k: int) -> int:
    graph = defaultdict(list)
    for u, v, w in flights:
        graph[u].append((v, w))
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    q = deque([(src, 0)])
    stops = 0
    while q and stops <= k:
        for _ in range(len(q)):  # O(level width)
            node, cost = q.popleft()
            for nei, w in graph[node]:  # O(edges from node)
                new_cost = cost + w
                if new_cost < dist[nei]:
                    dist[nei] = new_cost
                    q.append((nei, new_cost))
        stops += 1
    return dist[dst] if dist[dst] != INF else -1
```

#### C++

```cpp []
int findCheapestPrice(int n, vector<vector<int>>& flights, int src, int dst, int k) {
    vector<vector<pair<int, int>>> graph(n);
    for (auto& f : flights) graph[f[0]].emplace_back(f[1], f[2]);
    vector<int> dist(n, INT_MAX);
    dist[src] = 0;
    queue<pair<int, int>> q;
    q.emplace(src, 0);
    int stops = 0;
    while (!q.empty() && stops <= k) {
        int sz = q.size();
        for (int i = 0; i < sz; i++) { // O(level width)
            auto [node, cost] = q.front();
            q.pop();
            for (auto& [nei, w] : graph[node]) { // O(edges from node)
                int newCost = cost + w;
                if (newCost < dist[nei]) {
                    dist[nei] = newCost;
                    q.emplace(nei, newCost);
                }
            }
        }
        stops++;
    }
    return dist[dst] == INT_MAX ? -1 : dist[dst];
}
```

#### Rust

```rust []
pub fn find_cheapest_price(n: i32, flights: Vec<Vec<i32>>, src: i32, dst: i32, k: i32) -> i32 {
    let n = n as usize;
    let mut graph = vec![vec![]; n];
    for f in &flights {
        graph[f[0] as usize].push((f[1] as usize, f[2]));
    }
    let mut dist = vec![i32::MAX; n];
    dist[src as usize] = 0;
    let mut q = VecDeque::new();
    q.push_back((src as usize, 0i32));
    let mut stops = 0;
    while !q.is_empty() && stops <= k {
        let size = q.len();
        for _ in 0..size {
            let (node, cost) = q.pop_front().unwrap();
            for &(nei, w) in &graph[node] {
                let new_cost = cost + w;
                if new_cost < dist[nei] {
                    dist[nei] = new_cost;
                    q.push_back((nei, new_cost));
                }
            }
        }
        stops += 1;
    }
    if dist[dst as usize] == i32::MAX { -1 } else { dist[dst as usize] }
}
```
