---
author: JZ
pubDatetime: 2026-06-28T06:00:00Z
modDatetime: 2026-06-28T06:00:00Z
title: LeetCode 2101 Detonate the Maximum Bombs
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-graph
description:
  "Solutions for LeetCode 2101, medium, tags: array, math, depth-first search, breadth-first search, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 2101](https://leetcode.com/problems/detonate-the-maximum-bombs/description/)

You are given a list of bombs. The **range** of a bomb is defined as the area where its effect can be felt. Each bomb's range is represented as a circle with center at `(xi, yi)` and radius `ri`.

You may choose to detonate a **single** bomb. When a bomb is detonated, it will detonate **all the bombs** that lie in its range. These bombs will further detonate other bombs that lie in their ranges.

Given the list of bombs, return _the maximum number of bombs that can be detonated if you are allowed to detonate only **one** bomb_.

A bomb is considered to be in the range of another bomb if the **Euclidean distance** between their centers is less than or equal to the radius of the detonating bomb.

```
Example 1:

Input: bombs = [[2,1,3],[6,1,4]]
Output: 2
Explanation: If we detonate bomb 0, bomb 1 is in its range (distance=4, radius=3?
Actually distance between (2,1) and (6,1) is 4 and radius of bomb 0 is 3, so bomb 0
cannot reach bomb 1. But bomb 1 has radius 4 which can reach bomb 0.
Wait — the actual expected output is 2: detonating bomb 1 reaches bomb 0.

Example 2:

Input: bombs = [[1,1,5],[10,10,5]]
Output: 1
Explanation: Detonating either bomb will not trigger the other since the distance
between them exceeds both radii.

Example 3:

Input: bombs = [[1,2,3],[2,3,1],[3,4,2],[4,5,3],[5,6,4]]
Output: 5
Explanation: Detonating bomb 4 triggers a chain reaction that detonates all bombs.
```

**Constraints:**

- `1 <= bombs.length <= 100`
- `bombs[i].length == 3`
- `1 <= xi, yi, ri <= 10^5`

## Idea

Model the problem as a **directed graph**: create an edge from bomb `i` to bomb `j` if the Euclidean distance between them is ≤ the radius of bomb `i` (meaning `i` can trigger `j`). Note the graph is directed — bomb `i` reaching `j` does not imply `j` can reach `i`.

```
Example: bombs = [[0,0,10],[5,0,1]]

Bomb 0: center (0,0), radius 10
Bomb 1: center (5,0), radius 1
Distance = 5

Bomb 0 → Bomb 1 (5 ≤ 10 ✓)
Bomb 1 → Bomb 0 (5 ≤ 1 ✗)

Graph:  0 ───→ 1

Starting from 0: reach {0,1} → count 2
Starting from 1: reach {1}   → count 1
Answer: 2
```

Algorithm:
1. Build the directed adjacency list — for each pair `(i, j)`, add edge `i→j` if `(xi-xj)² + (yi-yj)² ≤ ri²`. Use integer arithmetic (long/i64) to avoid overflow and floating-point issues.
2. For each bomb as a starting point, run BFS/DFS to count all reachable nodes.
3. Return the maximum count.

Complexity: Time $O(n^3)$ — $O(n^2)$ to build graph + $O(n)$ starts × $O(n^2)$ BFS/DFS. Space $O(n^2)$ for the adjacency list.

### Java

```java []
// O(n^2) build directed graph: edge i->j if bomb i can reach bomb j
private static List<List<Integer>> buildGraph(int[][] bombs) {
    int n = bombs.length;
    List<List<Integer>> graph = new ArrayList<>(n);
    for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
    for (int i = 0; i < n; i++) {
        long ri = bombs[i][2];
        for (int j = 0; j < n; j++) {
            if (i == j) continue;
            long dx = bombs[i][0] - bombs[j][0];
            long dy = bombs[i][1] - bombs[j][1];
            if (dx * dx + dy * dy <= ri * ri) graph.get(i).add(j);
        }
    }
    return graph;
}

// BFS, O(n^3) time, O(n^2) space.
public static int maximumDetonationBFS(int[][] bombs) {
    int n = bombs.length;
    List<List<Integer>> graph = buildGraph(bombs);
    int max = 0;
    for (int i = 0; i < n; i++) {               // O(n) starts
        boolean[] visited = new boolean[n];
        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(i);
        visited[i] = true;
        int count = 0;
        while (!queue.isEmpty()) {              // BFS O(n + edges)
            int cur = queue.poll();
            count++;
            for (int neighbor : graph.get(cur)) {
                if (!visited[neighbor]) {
                    visited[neighbor] = true;
                    queue.offer(neighbor);
                }
            }
        }
        max = Math.max(max, count);
    }
    return max;
}

// DFS, O(n^3) time, O(n^2) space.
public static int maximumDetonationDFS(int[][] bombs) {
    int n = bombs.length;
    List<List<Integer>> graph = buildGraph(bombs);
    int max = 0;
    for (int i = 0; i < n; i++) {               // O(n) starts
        boolean[] visited = new boolean[n];
        max = Math.max(max, dfs(graph, i, visited));
    }
    return max;
}

private static int dfs(List<List<Integer>> graph, int node, boolean[] visited) {
    visited[node] = true;
    int count = 1;
    for (int neighbor : graph.get(node)) {
        if (!visited[neighbor]) count += dfs(graph, neighbor, visited);
    }
    return count;
}
```

```python []
# BFS from each bomb on directed graph. O(n^3) time, O(n^2) space.
class Solution:
    def maximumDetonation(self, bombs: list[list[int]]) -> int:
        n = len(bombs)
        adj = defaultdict(list)
        for i in range(n):                       # O(n^2) build directed graph
            xi, yi, ri = bombs[i]
            for j in range(n):
                if i == j:
                    continue
                xj, yj, _ = bombs[j]
                if (xi - xj) ** 2 + (yi - yj) ** 2 <= ri ** 2:  # i can reach j
                    adj[i].append(j)
        res = 0
        for start in range(n):                   # O(n) starts, each BFS O(n+E)
            visited = {start}
            queue = deque([start])
            while queue:
                u = queue.popleft()
                for v in adj[u]:
                    if v not in visited:
                        visited.add(v)
                        queue.append(v)
            res = max(res, len(visited))
        return res
```

```cpp []
// BFS, O(n^3) time, O(n^2) space.
static int maximumDetonationBFS(vector<vector<int>> &bombs) {
    int n = bombs.size();
    vector<vector<int>> adj(n);
    for (int i = 0; i < n; i++) {                // O(n^2) build directed graph
        for (int j = 0; j < n; j++) {
            if (i == j) continue;
            long long dx = bombs[i][0] - bombs[j][0];
            long long dy = bombs[i][1] - bombs[j][1];
            long long r = bombs[i][2];
            if (dx * dx + dy * dy <= r * r) adj[i].push_back(j);
        }
    }
    int res = 0;
    for (int i = 0; i < n; i++) {                // O(n) starts
        vector<bool> visited(n, false);
        queue<int> q;
        q.push(i);
        visited[i] = true;
        int count = 0;
        while (!q.empty()) {                     // BFS O(n + edges)
            int u = q.front(); q.pop();
            count++;
            for (int v : adj[u]) {
                if (!visited[v]) { visited[v] = true; q.push(v); }
            }
        }
        res = max(res, count);
    }
    return res;
}
```

```rust []
// BFS, O(n^3) time, O(n^2) space.
impl Solution {
    pub fn maximum_detonation(bombs: Vec<Vec<i32>>) -> i32 {
        let n = bombs.len();
        let mut adj = vec![vec![]; n];
        for i in 0..n {                          // O(n^2) build directed graph
            let (xi, yi, ri) = (bombs[i][0] as i64, bombs[i][1] as i64, bombs[i][2] as i64);
            for j in 0..n {
                if i == j { continue; }
                let dx = xi - bombs[j][0] as i64;
                let dy = yi - bombs[j][1] as i64;
                if dx * dx + dy * dy <= ri * ri { adj[i].push(j); }
            }
        }
        let mut res = 0;
        for start in 0..n {                      // O(n) starts
            let mut visited = vec![false; n];
            visited[start] = true;
            let mut queue = VecDeque::new();
            queue.push_back(start);
            let mut count = 1;
            while let Some(node) = queue.pop_front() {  // BFS O(n + edges)
                for &nei in &adj[node] {
                    if !visited[nei] {
                        visited[nei] = true;
                        count += 1;
                        queue.push_back(nei);
                    }
                }
            }
            res = res.max(count);
        }
        res
    }
}
```
