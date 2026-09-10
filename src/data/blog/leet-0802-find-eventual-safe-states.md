---
author: JZ
pubDatetime: 2026-09-10T06:00:00Z
modDatetime: 2026-09-10T06:00:00Z
title: LeetCode 802 Find Eventual Safe States
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-graph
  - a-topological-sort
description:
  "Solutions for LeetCode 802, medium, tags: depth-first search, breadth-first search, graph, topological sort."
---

## Table of contents

## Description

Question Links: [LeetCode 802](https://leetcode.com/problems/find-eventual-safe-states/description/)

There is a directed graph of `n` nodes with each node labeled from `0` to `n - 1`. The graph is represented by a **0-indexed** 2D integer array `graph` where `graph[i]` is an integer array of nodes adjacent to node `i`, meaning there is an edge from node `i` to each node in `graph[i]`.

A node is a **terminal node** if there are no outgoing edges. A node is a **safe node** if every possible path starting from that node leads to a **terminal node** (or another safe node).

Return an array containing all the **safe nodes** of the graph. The answer should be sorted in ascending order.

```
Example 1:

Input: graph = [[1,2],[2,3],[5],[0],[5],[],[]]
Output: [2,4,5,6]
Explanation:
Nodes 5 and 6 are terminal nodes (no outgoing edges).
Every path starting at node 2 leads to node 5, so 2 is safe.
Every path starting at node 4 leads to node 5, so 4 is safe.
Nodes 0, 1, and 3 participate in the cycle 0->1->3->0, so they are not safe.

Example 2:

Input: graph = [[1,2,3,4],[1,2],[3,4],[0,4],[]]
Output: [4]
Explanation:
Only node 4 is terminal. Node 1 has a self-loop. Nodes 0, 2, 3 can reach
the cycle through node 3->0.
```

**Constraints:**

- `n == graph.length`
- `1 <= n <= 10^4`
- `0 <= graph[i].length <= n`
- `0 <= graph[i][j] <= n - 1`
- `graph[i]` is sorted in a strictly increasing order.
- The graph may contain self-loops.
- The number of edges in the graph will be in the range `[1, 4 * 10^4]`.

## Idea1

Use **DFS with 3-coloring** to detect cycles. Assign each node one of three colors:

- **0 (unvisited)** — not yet explored.
- **1 (visiting)** — currently on the DFS recursion stack.
- **2 (safe)** — all paths from this node reach terminal nodes.

For each node, run DFS. If we encounter a node with color 1 (visiting), we found a cycle — it's not safe. If we encounter color 2, it's already confirmed safe. After all neighbors of a node are confirmed safe, mark it as safe (color 2).

```
Graph: [[1,2],[2,3],[5],[0],[5],[],[]]

DFS tree traversal:

  dfs(0) color[0]=1 (visiting)
    dfs(1) color[1]=1
      dfs(2) color[2]=1
        dfs(5) color[5]=1 -> terminal -> color[5]=2 (safe)
      color[2]=2 (safe, all neighbors safe)
      dfs(3) color[3]=1
        dfs(0) color[0]==1 -> CYCLE! return false
      color[3] stays 1 (unsafe)
    color[1] stays 1 (unsafe)
  color[0] stays 1 (unsafe)

  dfs(4) color[4]=1
    dfs(5) color[5]==2 -> already safe
  color[4]=2 (safe)

  dfs(6) color[6]=1 -> terminal -> color[6]=2 (safe)

Result: nodes with color 2 -> [2, 4, 5, 6]
```

Complexity: Time $O(V + E)$ — each node and edge visited at most once, Space $O(V)$ — color array plus recursion stack.

### Java

```java []
// lc 802, DFS 3-coloring, O(V+E) time, O(V) space.
public static List<Integer> eventualSafeNodes(int[][] graph) {
    int n = graph.length;
    int[] color = new int[n]; // O(V) space
    List<Integer> result = new ArrayList<>();
    for (int i = 0; i < n; i++)
        if (dfs(graph, color, i)) result.add(i);
    return result;
}

private static boolean dfs(int[][] graph, int[] color, int node) {
    if (color[node] != 0) return color[node] == 2; // already classified
    color[node] = 1; // mark visiting
    for (int next : graph[node]) // O(V+E) total across all calls
        if (!dfs(graph, color, next)) return false; // cycle found
    color[node] = 2; // mark safe
    return true;
}
```

```python []
# lc 802, DFS 3-coloring, O(V+E) time, O(V) space.
def eventualSafeNodes(self, graph: list[list[int]]) -> list[int]:
    n = len(graph)
    color = [0] * n  # 0: unvisited, 1: visiting, 2: safe

    def dfs(node: int) -> bool:
        if color[node] != 0:
            return color[node] == 2
        color[node] = 1  # O(1) mark visiting
        for nei in graph[node]:  # O(out-degree) per node, O(E) total
            if not dfs(nei):
                return False
        color[node] = 2
        return True

    return [i for i in range(n) if dfs(i)]
```

```cpp []
// lc 802, DFS 3-coloring, O(V+E) time, O(V) space.
vector<int> eventualSafeNodes(vector<vector<int>> &graph) {
    int n = graph.size();
    vector<int> color(n, 0); // O(V) space

    function<bool(int)> dfs = [&](int u) -> bool {
        if (color[u] != 0) return color[u] == 2; // O(1)
        color[u] = 1; // mark visiting
        for (int v : graph[u]) { // O(deg(u)), O(E) total
            if (!dfs(v)) return false;
        }
        color[u] = 2; // mark safe
        return true;
    };

    vector<int> res;
    for (int i = 0; i < n; i++) // O(V+E) total
        if (dfs(i)) res.push_back(i);
    return res;
}
```

```rust []
// lc 802, DFS 3-coloring, O(V+E) time, O(V) space.
pub fn eventual_safe_nodes(graph: Vec<Vec<i32>>) -> Vec<i32> {
    let n = graph.len();
    let mut color = vec![0u8; n]; // O(V) space
    let mut result = Vec::new();
    for i in 0..n {
        if Self::dfs(i, &graph, &mut color) {
            result.push(i as i32);
        }
    }
    result
}

fn dfs(node: usize, graph: &[Vec<i32>], color: &mut [u8]) -> bool {
    if color[node] != 0 {
        return color[node] == 2;
    }
    color[node] = 1; // mark visiting
    for &next in &graph[node] { // O(E) total across all calls
        if !Self::dfs(next as usize, graph, color) {
            return false;
        }
    }
    color[node] = 2; // mark safe
    true
}
```

## Idea2

Use **reverse graph + topological sort BFS** (Kahn's algorithm variant). The key insight: a node is safe if and only if all its successors are safe. Terminal nodes (out-degree 0) are trivially safe.

1. Build a **reverse adjacency list** and track each node's **out-degree**.
2. Seed a queue with all terminal nodes (out-degree 0).
3. BFS: for each safe node, decrement the out-degree of its predecessors in the reverse graph. When a predecessor's out-degree reaches 0, all its successors are safe — so it's safe too.

```
Graph: [[1,2],[2,3],[5],[0],[5],[],[]]

Out-degrees:  [2, 2, 1, 1, 1, 0, 0]
Reverse adj:  0<-[3], 1<-[0], 2<-[0,1], 3<-[1], 5<-[2,4], 6<-[]

BFS start: queue = [5, 6]  (out-degree 0)

  Process 5: safe[5]=true
    pred 2: out_deg[2] = 1-1 = 0 -> enqueue 2
    pred 4: out_deg[4] = 1-1 = 0 -> enqueue 4

  Process 6: safe[6]=true  (no predecessors)

  Process 2: safe[2]=true
    pred 0: out_deg[0] = 2-1 = 1  (not 0 yet)
    pred 1: out_deg[1] = 2-1 = 1  (not 0 yet)

  Process 4: safe[4]=true  (no predecessors in reverse)

Queue empty. Nodes 0,1,3 never reached 0 out-degree (cycle).
Result: [2, 4, 5, 6]
```

Complexity: Time $O(V + E)$ — building reverse graph and BFS each traverse all edges once, Space $O(V + E)$ — reverse adjacency list.

### Java

```java []
// lc 802, reverse graph + topological sort BFS, O(V+E) time, O(V+E) space.
public static List<Integer> eventualSafeNodesBFS(int[][] graph) {
    int n = graph.length;
    List<List<Integer>> reverseAdj = new ArrayList<>(); // O(V+E) space
    int[] outDegree = new int[n];
    for (int i = 0; i < n; i++) reverseAdj.add(new ArrayList<>());
    for (int i = 0; i < n; i++) { // O(V+E) build reverse graph
        outDegree[i] = graph[i].length;
        for (int next : graph[i]) reverseAdj.get(next).add(i);
    }
    Queue<Integer> queue = new ArrayDeque<>();
    for (int i = 0; i < n; i++)
        if (outDegree[i] == 0) queue.offer(i); // terminal nodes
    boolean[] safe = new boolean[n];
    while (!queue.isEmpty()) { // O(V+E) total
        int node = queue.poll();
        safe[node] = true;
        for (int prev : reverseAdj.get(node))
            if (--outDegree[prev] == 0) queue.offer(prev);
    }
    List<Integer> result = new ArrayList<>();
    for (int i = 0; i < n; i++)
        if (safe[i]) result.add(i);
    return result;
}
```

```python []
# lc 802, reverse graph + topological sort BFS, O(V+E) time, O(V+E) space.
def eventualSafeNodesBFS(self, graph: list[list[int]]) -> list[int]:
    n = len(graph)
    out_degree = [0] * n
    rev = [[] for _ in range(n)]  # O(V+E) space
    for u in range(n):
        out_degree[u] = len(graph[u])  # O(V)
        for v in graph[u]:
            rev[v].append(u)  # O(E) total
    q = deque(u for u in range(n) if out_degree[u] == 0)
    safe = [False] * n
    while q:  # O(V+E) BFS
        node = q.popleft()
        safe[node] = True
        for prev in rev[node]:
            out_degree[prev] -= 1
            if out_degree[prev] == 0:
                q.append(prev)
    return [i for i in range(n) if safe[i]]
```

```cpp []
// lc 802, reverse graph + topological sort BFS, O(V+E) time, O(V+E) space.
vector<int> eventualSafeNodesBFS(vector<vector<int>> &graph) {
    int n = graph.size();
    vector<vector<int>> radj(n); // O(V+E) space
    vector<int> outdegree(n, 0);

    for (int u = 0; u < n; u++) { // O(V+E) build reverse graph
        outdegree[u] = graph[u].size();
        for (int v : graph[u]) radj[v].push_back(u);
    }

    queue<int> q;
    for (int i = 0; i < n; i++) // seed terminal nodes
        if (outdegree[i] == 0) q.push(i);

    vector<bool> safe(n, false);
    while (!q.empty()) { // O(V+E) total
        int u = q.front(); q.pop();
        safe[u] = true;
        for (int v : radj[u])
            if (--outdegree[v] == 0) q.push(v);
    }

    vector<int> res;
    for (int i = 0; i < n; i++)
        if (safe[i]) res.push_back(i);
    return res;
}
```

```rust []
// lc 802, reverse graph + topological sort BFS, O(V+E) time, O(V+E) space.
pub fn eventual_safe_nodes_bfs(graph: Vec<Vec<i32>>) -> Vec<i32> {
    let n = graph.len();
    let mut out_degree = vec![0usize; n];
    let mut reverse: Vec<Vec<usize>> = vec![vec![]; n]; // O(V+E) space

    for (u, neighbors) in graph.iter().enumerate() { // O(V+E)
        out_degree[u] = neighbors.len();
        for &v in neighbors {
            reverse[v as usize].push(u);
        }
    }

    let mut queue = VecDeque::new();
    for i in 0..n {
        if out_degree[i] == 0 { queue.push_back(i); }
    }

    let mut safe = vec![false; n];
    while let Some(node) = queue.pop_front() { // O(V+E) total
        safe[node] = true;
        for &prev in &reverse[node] {
            out_degree[prev] -= 1;
            if out_degree[prev] == 0 { queue.push_back(prev); }
        }
    }

    (0..n).filter(|&i| safe[i]).map(|i| i as i32).collect()
}
```
