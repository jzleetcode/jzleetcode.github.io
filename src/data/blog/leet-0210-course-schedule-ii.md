---
author: JZ
pubDatetime: 2026-06-28T06:00:00Z
modDatetime: 2026-06-28T06:00:00Z
title: LeetCode 210 Course Schedule II
featured: true
tags:
  - a-graph
  - a-depth-first-search
  - a-breadth-first-search
  - a-topological-sort
description:
  "Solutions for LeetCode 210, medium, tags: depth-first search, breadth-first search, graph, topological sort."
---

## Table of contents

## Description

Question Links: [LeetCode 210](https://leetcode.com/problems/course-schedule-ii/description/)

There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [a_i, b_i]` indicates that you **must** take course `b_i` first if you want to take course `a_i`.

For example, the pair `[0, 1]`, indicates that to take course `0` you have to first take course `1`.

Return the ordering of courses you should take to finish all courses. If there are many valid answers, return **any** of them. If it is impossible to finish all courses, return **an empty array**.

```
Example 1:

Input: numCourses = 2, prerequisites = [[1,0]]
Output: [0,1]
Explanation: There are a total of 2 courses to take. To take course 1 you should have finished
course 0. So the correct course order is [0,1].

Example 2:

Input: numCourses = 4, prerequisites = [[1,0],[2,0],[3,1],[3,2]]
Output: [0,2,1,3]
Explanation: There are a total of 4 courses to take. To take course 3 you should have finished both
courses 1 and 2. Both courses 1 and 2 should be taken after you finished course 0.
So one correct course order is [0,1,2,3]. Another correct ordering is [0,2,1,3].

Example 3:

Input: numCourses = 1, prerequisites = []
Output: [0]

Constraints:

1 <= numCourses <= 2000
0 <= prerequisites.length <= numCourses * (numCourses - 1)
prerequisites[i].length == 2
0 <= a_i, b_i < numCourses
a_i != b_i
All the pairs [a_i, b_i] are distinct.
```

## Solution 1: BFS Topological Sort (Kahn's Algorithm)

### Idea

Use BFS with in-degree tracking to produce a topological ordering. Start by enqueuing all nodes with in-degree 0 (no prerequisites). Process each node — append it to the result and decrement its neighbors' in-degrees; enqueue any neighbor that reaches 0. If all nodes are processed, return the order; otherwise a cycle exists and we return an empty array.

```
Example: numCourses=4, prerequisites=[[1,0],[2,0],[3,1],[3,2]]

Adjacency list:        In-degree:
  0 -> [1, 2]            0: 0  <-- start
  1 -> [3]               1: 1
  2 -> [3]               2: 1
                          3: 2

BFS:
  Queue: [0]           order=[]
  Process 0: --deg[1]=0, --deg[2]=0    Queue: [1,2]   order=[0]
  Process 1: --deg[3]=1                Queue: [2]     order=[0,1]
  Process 2: --deg[3]=0                Queue: [3]     order=[0,1,2]
  Process 3:                           Queue: []      order=[0,1,2,3]

  len(order)==numCourses -> return [0,1,2,3]
```

Complexity: Time $O(V+E)$ — each node dequeued once, each edge relaxed once. Space $O(V+E)$ — adjacency list $O(V+E)$, in-degree array $O(V)$, queue $O(V)$.

#### Java

```java []
// solution 1, BFS Kahn's algorithm. O(V+E) time and space.
private int[] byBFS(int[] indeg) {
    int[] order = new int[indeg.length];
    ArrayDeque<Integer> q = new ArrayDeque<>();
    for (int i = 0; i < indeg.length; i++) if (indeg[i] == 0) q.add(i); // O(V)
    int cnt = 0;
    while (!q.isEmpty()) { // O(V+E) total
        int v = q.poll();
        order[cnt++] = v;
        for (int w : adj.get(v)) {
            indeg[w]--;
            if (indeg[w] == 0) q.offer(w);
            else if (indeg[w] < 0) return new int[0];
        }
    }
    return cnt == indeg.length ? order : new int[0];
}
```

#### Python

```python []
def findOrder(self, numCourses: int, prerequisites: List[List[int]]) -> List[int]:
    edges = collections.defaultdict(list)
    indeg = [0] * numCourses
    res = list()
    for e in prerequisites:  # O(E)
        edges[e[1]].append(e[0])
        indeg[e[0]] += 1
    q = collections.deque([u for u in range(numCourses) if indeg[u] == 0])  # O(V)
    while q:  # O(V+E) total
        u = q.popleft()
        res.append(u)
        for v in edges[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)
    if len(res) != numCourses: res = list()
    return res
```

#### C++

```cpp []
vector<int> findOrder(int numCourses, vector<vector<int>> &prerequisites) {
    int n = numCourses;
    vector<vector<int>> adj(n);
    vector<int> indeg(n, 0);
    for (auto &e : prerequisites) { // O(E)
        adj[e[1]].emplace_back(e[0]);
        indeg[e[0]]++;
    }
    queue<int> q;
    for (int i = 0; i < n; i++) if (indeg[i] == 0) q.push(i); // O(V)
    vector<int> order;
    while (!q.empty()) { // O(V+E) total
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : adj[u])
            if (--indeg[v] == 0) q.push(v);
    }
    return (int)order.size() == n ? order : vector<int>{};
}
```

#### Rust

```rust []
pub fn find_order(num_courses: i32, prerequisites: Vec<Vec<i32>>) -> Vec<i32> {
    let n = num_courses as usize;
    let mut adj = vec![vec![]; n];
    let mut in_degree = vec![0u32; n];
    for edge in &prerequisites { // O(E)
        adj[edge[1] as usize].push(edge[0] as usize);
        in_degree[edge[0] as usize] += 1;
    }
    let mut queue = VecDeque::new();
    for i in 0..n { if in_degree[i] == 0 { queue.push_back(i); } } // O(V)
    let mut order = Vec::with_capacity(n);
    while let Some(node) = queue.pop_front() { // O(V+E) total
        order.push(node as i32);
        for &neighbor in &adj[node] {
            in_degree[neighbor] -= 1;
            if in_degree[neighbor] == 0 { queue.push_back(neighbor); }
        }
    }
    if order.len() == n { order } else { vec![] }
}
```

## Solution 2: DFS Reverse Post-Order

### Idea

DFS with cycle detection using the three-color scheme (WHITE/GRAY/BLACK). When a node finishes (all descendants fully explored), append it to the result. The result is the reverse post-order — reversing it gives a valid topological order. If we encounter a GRAY node (back edge), a cycle exists.

```
Example: numCourses=4, prerequisites=[[1,0],[2,0],[3,1],[3,2]]

Adjacency list (prerequisite -> course):
  0 -> [1, 2]
  1 -> [3]
  2 -> [3]

DFS from 0:
  Visit 0 (WHITE->GRAY)
    Visit 1 (WHITE->GRAY)
      Visit 3 (WHITE->GRAY)
        No unvisited neighbors
      Finish 3 (GRAY->BLACK)  post=[3]
    Finish 1 (GRAY->BLACK)    post=[3,1]
    Visit 2 (WHITE->GRAY)
      3 is BLACK, skip
    Finish 2 (GRAY->BLACK)    post=[3,1,2]
  Finish 0 (GRAY->BLACK)      post=[3,1,2,0]

  Reverse: [0,2,1,3] -- valid topological order
```

Complexity: Time $O(V+E)$ — each node and edge visited once. Space $O(V+E)$ — adjacency list $O(V+E)$, color array $O(V)$, stack $O(V)$.

#### Java

```java []
// solution 2, DFS reverse post-order. O(V+E) time and space.
private int[] byDfs() {
    hasCycle = new BitSet(1);
    marked = new BitSet(adj.size());
    onStack = new BitSet(adj.size());
    order = new ArrayList<>();
    for (int i = adj.size() - 1; i >= 0; i--)
        if (!hasCycle.get(0)) dfs(i);
        else return new int[0];
    Collections.reverse(order);
    return order.stream().mapToInt(i -> i).toArray();
}

private void dfs(int v) {
    if (marked.get(v)) return;
    marked.set(v);
    onStack.set(v);
    for (int w : adj.get(v)) {
        if (hasCycle.get(0)) return;
        else if (onStack.get(w)) hasCycle.set(0); // back edge -> cycle
        else dfs(w);
    }
    onStack.clear(v);
    order.add(v); // reverse post-order
}
```

#### Python

```python []
def findOrder(self, numCourses: int, prerequisites: List[List[int]]) -> List[int]:
    adj = defaultdict(list)
    for a, b in prerequisites:
        adj[b].append(a)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * numCourses
    order = []

    for start in range(numCourses):  # O(V)
        if color[start] != WHITE: continue
        stack = [(start, 0)]
        color[start] = GRAY
        while stack:  # O(V+E) total
            u, idx = stack[-1]
            if idx < len(adj[u]):
                stack[-1] = (u, idx + 1)
                v = adj[u][idx]
                if color[v] == GRAY: return []  # cycle
                if color[v] == WHITE:
                    color[v] = GRAY
                    stack.append((v, 0))
            else:
                stack.pop()
                color[u] = BLACK
                order.append(u)
    order.reverse()
    return order
```

#### C++

```cpp []
vector<int> findOrder(int numCourses, vector<vector<int>> &prerequisites) {
    int n = numCourses;
    vector<int> res, marked(n, false), onStack(n, false);
    vector<vector<int>> adj(n);
    bool cycle = false;
    for (auto e: prerequisites) adj[e[1]].emplace_back(e[0]); // O(E)
    function<void(int)> dfs = [&](int v) {
        if (marked[v]) return;
        onStack[v] = true, marked[v] = true;
        for (int w: adj[v]) { // O(deg(v))
            if (onStack[w]) cycle = true;
            else dfs(w);
        }
        onStack[v] = false;
        res.emplace_back(v); // reverse post-order
    };
    for (int i = 0; i < n; i++) // O(V)
        if (!cycle) dfs(i); else return {};
    reverse(res.begin(), res.end());
    return res;
}
```

#### Rust

```rust []
pub fn find_order_dfs(num_courses: i32, prerequisites: Vec<Vec<i32>>) -> Vec<i32> {
    let n = num_courses as usize;
    let mut adj = vec![vec![]; n];
    for edge in &prerequisites { adj[edge[1] as usize].push(edge[0] as usize); } // O(E)
    let mut color = vec![0u8; n]; // 0=WHITE, 1=GRAY, 2=BLACK
    let mut order = Vec::with_capacity(n);
    for start in 0..n { // O(V)
        if color[start] != 0 { continue; }
        let mut stack: Vec<(usize, usize)> = vec![(start, 0)];
        color[start] = 1;
        while let Some((node, idx)) = stack.last_mut() { // O(V+E) total
            if *idx < adj[*node].len() {
                let neighbor = adj[*node][*idx];
                *idx += 1;
                if color[neighbor] == 1 { return vec![]; } // back edge -> cycle
                if color[neighbor] == 0 {
                    color[neighbor] = 1;
                    stack.push((neighbor, 0));
                }
            } else {
                let (finished, _) = stack.pop().unwrap();
                color[finished] = 2;
                order.push(finished as i32); // reverse post-order
            }
        }
    }
    order.reverse();
    order
}
```
