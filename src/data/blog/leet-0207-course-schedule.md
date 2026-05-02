---
author: JZ
pubDatetime: 2026-05-02T06:00:00Z
modDatetime: 2026-05-02T06:00:00Z
title: LeetCode 207 Course Schedule
featured: true
tags:
  - a-graph
  - a-depth-first-search
  - a-breadth-first-search
  - a-topological-sort
description:
  "Solutions for LeetCode 207, medium, tags: depth-first search, breadth-first search, graph, topological sort."
---

## Table of contents

## Description

Question Links: [LeetCode 207](https://leetcode.com/problems/course-schedule/description/)

There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [a_i, b_i]` indicates that you **must** take course `b_i` first if you want to take course `a_i`.

For example, the pair `[0, 1]`, indicates that to take course `0` you have to first take course `1`.

Return `true` if you can finish all courses. Otherwise, return `false`.

```
Example 1:

Input: numCourses = 2, prerequisites = [[1,0]]
Output: true
Explanation: There are a total of 2 courses to take.
To take course 1 you should have finished course 0. So it is possible.

Example 2:

Input: numCourses = 2, prerequisites = [[1,0],[0,1]]
Output: false
Explanation: There are a total of 2 courses to take.
To take course 1 you should have finished course 0, and to take course 0 you should also
have finished course 1. So it is impossible.

Constraints:

1 <= numCourses <= 2000
0 <= prerequisites.length <= 5000
prerequisites[i].length == 2
0 <= a_i, b_i < numCourses
All the pairs prerequisites[i] are unique.
```

## Solution 1: DFS Cycle Detection

### Idea

Model courses as nodes and prerequisites as directed edges. If the graph has a cycle, it is impossible to finish all courses. We detect cycles using DFS with a three-color scheme:

- **WHITE (0)**: unvisited
- **GRAY (1)**: currently on the DFS stack (being explored)
- **BLACK (2)**: fully processed (all descendants explored)

If DFS encounters a GRAY node, we found a back edge — a cycle exists.

```
Example: numCourses=4, prerequisites=[[1,0],[2,1],[3,2],[1,3]]

Adjacency list (b -> a):
  0 -> [1]
  1 -> [2]
  2 -> [3]
  3 -> [1]   <-- back edge creates cycle

DFS from node 0:
  Visit 0 (WHITE->GRAY)
    Visit 1 (WHITE->GRAY)
      Visit 2 (WHITE->GRAY)
        Visit 3 (WHITE->GRAY)
          Neighbor 1 is GRAY -> cycle detected!
  Return false
```

Complexity: Time $O(V+E)$ — each node and edge visited once. Space $O(V+E)$ — adjacency list $O(V+E)$, color array $O(V)$, stack $O(V)$.

#### Java

```java []
// solution 1, DFS O(V+E) time and space. 2ms, 42.3Mb.
public boolean canFinishDFS(int numCourses, int[][] prerequisites) {
    adj = new ArrayList[numCourses];
    for (int i = 0; i < numCourses; i++) adj[i] = new ArrayList<>();
    for (int[] edge : prerequisites) adj[edge[1]].add(edge[0]); // [0,1] 1->0 1 is prerequisite of 0
    visited = new boolean[numCourses];
    onStack = new boolean[numCourses];
    for (int i = 0; i < numCourses; i++)
        if (!visited[i] && hasCycle(i)) return false;
    return true;
}

private boolean hasCycle(int source) {
    visited[source] = true;
    onStack[source] = true;
    for (int v : adj[source]) {
        if (onStack[v]) return true;
        if (!visited[v] && hasCycle(v)) return true;
    }
    onStack[source] = false;
    return false;
}
```

#### Python

```python []
class Solution:
    """Iterative DFS cycle detection. O(V+E) time, O(V+E) space."""

    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        adj = defaultdict(list)
        for a, b in prerequisites:
            adj[b].append(a)
        WHITE, GRAY, BLACK = 0, 1, 2
        color = [WHITE] * numCourses

        for start in range(numCourses):  # O(V) outer loop
            if color[start] != WHITE:
                continue
            stack = [(start, 0)]
            color[start] = GRAY
            while stack:  # O(V+E) total across all starts
                u, idx = stack.pop()
                if idx < len(adj[u]):
                    stack.append((u, idx + 1))
                    v = adj[u][idx]
                    if color[v] == GRAY:
                        return False
                    if color[v] == WHITE:
                        color[v] = GRAY
                        stack.append((v, 0))
                else:
                    color[u] = BLACK
        return True
```

#### C++

```cpp []
bool canFinishDFS(int numCourses, vector<vector<int>> &prerequisites) {
    enum Color { WHITE, GRAY, BLACK };
    int n = numCourses;
    vector<vector<int>> adj(n);
    vector<Color> color(n, WHITE);

    for (auto &e : prerequisites) adj[e[1]].emplace_back(e[0]); // O(E)

    bool hasCycle = false;
    function<void(int)> dfs = [&](int u) {
        color[u] = GRAY;
        for (int v : adj[u]) { // O(deg(u))
            if (color[v] == GRAY) { hasCycle = true; return; }
            if (color[v] == WHITE) dfs(v);
            if (hasCycle) return;
        }
        color[u] = BLACK;
    };

    for (int i = 0; i < n && !hasCycle; i++) // O(V)
        if (color[i] == WHITE) dfs(i);

    return !hasCycle;
}
```

#### Rust

```rust []
pub fn can_finish_dfs(num_courses: i32, prerequisites: Vec<Vec<i32>>) -> bool {
    let n = num_courses as usize;
    let mut adj = vec![vec![]; n];
    for edge in &prerequisites {
        adj[edge[1] as usize].push(edge[0] as usize);
    }

    // 0 = WHITE, 1 = GRAY, 2 = BLACK
    let mut color = vec![0u8; n];

    for start in 0..n { // O(V) outer loop
        if color[start] != 0 { continue; }
        let mut stack: Vec<(usize, usize)> = vec![(start, 0)];
        color[start] = 1;

        while let Some((node, idx)) = stack.last_mut() {
            if *idx < adj[*node].len() {
                let neighbor = adj[*node][*idx];
                *idx += 1;
                if color[neighbor] == 1 { return false; } // back edge -> cycle
                if color[neighbor] == 0 {
                    color[neighbor] = 1;
                    stack.push((neighbor, 0));
                }
            } else {
                let (finished, _) = stack.pop().unwrap();
                color[finished] = 2; // BLACK
            }
        }
    }
    true
}
```

## Solution 2: BFS Topological Sort (Kahn's Algorithm)

### Idea

Use BFS with in-degree tracking. Start by enqueuing all nodes with in-degree 0 (no prerequisites). Process each node, decrement its neighbors' in-degrees, and enqueue any that reach 0. If all nodes are processed, no cycle exists.

```
Example: numCourses=4, prerequisites=[[1,0],[2,0],[3,1],[3,2]]

Adjacency list:        In-degree:
  0 -> [1, 2]            0: 0  <-- start
  1 -> [3]               1: 1
  2 -> [3]               2: 1
                          3: 2

BFS:
  Queue: [0]         count=0
  Process 0: --deg[1]=0, --deg[2]=0    Queue: [1,2]   count=1
  Process 1: --deg[3]=1                Queue: [2]     count=2
  Process 2: --deg[3]=0                Queue: [3]     count=3
  Process 3:                           Queue: []      count=4

  count(4) == numCourses(4) -> true
```

Complexity: Time $O(V+E)$ — each node dequeued once, each edge relaxed once. Space $O(V+E)$ — adjacency list $O(V+E)$, in-degree array $O(V)$, queue $O(V)$.

#### Java

```java []
// solution 2, bfs, 3ms 42.4Mb. O(V+E) linear time and space.
public boolean canFinishBFS(int numCourses, int[][] prerequisites) {
    List<Integer>[] adj = new ArrayList[numCourses];
    Queue<Integer> queue = new ArrayDeque<>();
    int[] inDegree = new int[numCourses];
    for (int i = 0; i < numCourses; i++) adj[i] = new ArrayList<>();
    for (int[] edge : prerequisites) { // O(E)
        adj[edge[1]].add(edge[0]);
        inDegree[edge[0]]++;
    }
    for (int i = 0; i < inDegree.length; i++)
        if (inDegree[i] == 0) queue.offer(i);
    int count = 0;
    while (!queue.isEmpty()) { // O(V+E)
        int course = queue.poll();
        count++;
        for (int w : adj[course])
            if (--inDegree[w] == 0) queue.offer(w);
    }
    return count == numCourses;
}
```

#### Python

```python []
class Solution2:
    """BFS topological sort (Kahn's algorithm). O(V+E) time, O(V+E) space."""

    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        adj = defaultdict(list)
        in_degree = [0] * numCourses
        for a, b in prerequisites:  # O(E)
            adj[b].append(a)
            in_degree[a] += 1
        queue = deque(i for i in range(numCourses) if in_degree[i] == 0)
        count = 0
        while queue:  # O(V+E)
            u = queue.popleft()
            count += 1
            for v in adj[u]:
                in_degree[v] -= 1
                if in_degree[v] == 0:
                    queue.append(v)
        return count == numCourses
```

#### C++

```cpp []
bool canFinishBFS(int numCourses, vector<vector<int>> &prerequisites) {
    int n = numCourses;
    vector<vector<int>> adj(n);
    vector<int> indegree(n, 0);

    for (auto &e : prerequisites) { // O(E)
        adj[e[1]].emplace_back(e[0]);
        indegree[e[0]]++;
    }

    queue<int> q;
    for (int i = 0; i < n; i++) // O(V)
        if (indegree[i] == 0) q.push(i);

    int visited = 0;
    while (!q.empty()) { // O(V+E)
        int u = q.front(); q.pop();
        visited++;
        for (int v : adj[u])
            if (--indegree[v] == 0) q.push(v);
    }

    return visited == n;
}
```

#### Rust

```rust []
pub fn can_finish_bfs(num_courses: i32, prerequisites: Vec<Vec<i32>>) -> bool {
    let n = num_courses as usize;
    let mut adj = vec![vec![]; n];
    let mut in_degree = vec![0u32; n];

    for edge in &prerequisites { // O(E)
        adj[edge[1] as usize].push(edge[0] as usize);
        in_degree[edge[0] as usize] += 1;
    }

    let mut queue = VecDeque::new();
    for i in 0..n { // O(V)
        if in_degree[i] == 0 { queue.push_back(i); }
    }

    let mut processed = 0usize;
    while let Some(node) = queue.pop_front() { // O(V+E)
        processed += 1;
        for &neighbor in &adj[node] {
            in_degree[neighbor] -= 1;
            if in_degree[neighbor] == 0 { queue.push_back(neighbor); }
        }
    }

    processed == n
}
```
