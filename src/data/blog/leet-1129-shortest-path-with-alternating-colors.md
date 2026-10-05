---
author: JZ
pubDatetime: 2026-10-05T19:41:35Z
modDatetime: 2026-10-05T19:41:35Z
title: LeetCode 1129 Shortest Path with Alternating Colors
featured: true
tags:
  - a-bfs
  - a-graph
description: "Solutions for LeetCode 1129, medium, tags: graph, breadth-first search."
---

## Table of contents

## Description

Question Links: [LeetCode 1129 — Shortest Path with Alternating Colors](https://leetcode.com/problems/shortest-path-with-alternating-colors/description/)

We have a directed graph whose edges are either red or blue. Starting from node `0`, find the shortest path to every node such that consecutive edges always have different colors. Return `-1` for a node that cannot be reached by a valid alternating path.

Constraints:

- `1 <= n <= 100`
- `0 <= redEdges.length, blueEdges.length <= 400`
- Every edge is a two-element list `[from, to]`, with both nodes in `[0, n - 1]`.
- The graph may contain self-edges and parallel edges.

For example, if the only edges are red `0 -> 1` and red `1 -> 2`, node `2` is unreachable: taking two red edges in a row is not allowed.

## Idea

A regular BFS can mark a node visited once. That is not enough here: reaching the same node after a red edge leaves blue edges available, while reaching it after a blue edge leaves red edges available. So the search state must remember both the current node and the previous edge color.

For example, suppose the graph contains red `0 -> 1`, blue `0 -> 1`, red `1 -> 2`, and blue `1 -> 3`. There are two useful states for node `1`:

```
(0, none) --red-->  (1, red)  --blue--> (3, blue)
     |
     +-----blue--> (1, blue) --red----> (2, red)
```

The first edge can have either color, so the initial BFS state uses a neutral color. From then on, each state follows only edges whose color differs from the previous one. We mark each `(node, color)` state when it enters the queue; this prevents cycles without discarding the other color-state for that node. Since the queue is breadth-first, the first distance recorded for each node is its shortest valid distance.

Let `m` be the total number of red and blue edges. There are at most two visited states per node, and every adjacency list is scanned only a constant number of times.

Complexity: Time $O(n + m)$, Space $O(n + m)$.

### Java

```java []
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Queue;

public final class ShortestPathAlternatingColors {
    private static final int RED = 0;
    private static final int BLUE = 1;
    private static final int NONE = -1;

    private ShortestPathAlternatingColors() {}

    public static int[] shortestAlternatingPaths(int n, int[][] redEdges, int[][] blueEdges) {
        List<List<int[]>> graph = new ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
        for (int[] edge : redEdges) graph.get(edge[0]).add(new int[]{edge[1], RED});
        for (int[] edge : blueEdges) graph.get(edge[0]).add(new int[]{edge[1], BLUE});

        int[] answer = new int[n];
        Arrays.fill(answer, -1);
        boolean[][] visited = new boolean[n][2];

        Queue<int[]> queue = new ArrayDeque<>();
        queue.offer(new int[]{0, NONE});
        int distance = 0;

        while (!queue.isEmpty()) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                int[] current = queue.poll();
                int node = current[0];
                int previousColor = current[1];
                if (answer[node] == -1) answer[node] = distance;

                for (int[] next : graph.get(node)) {
                    int nextNode = next[0];
                    int nextColor = next[1];
                    if (nextColor != previousColor && !visited[nextNode][nextColor]) {
                        visited[nextNode][nextColor] = true;
                        queue.offer(new int[]{nextNode, nextColor});
                    }
                }
            }
            distance++;
        }
        return answer;
    }
}
```

### Python

```python []
from collections import deque


class Solution:
    def shortestAlternatingPaths(
        self, n: int, redEdges: list[list[int]], blueEdges: list[list[int]]
    ) -> list[int]:
        graph = [[[] for _ in range(n)] for _ in range(2)]
        for color, edges in enumerate((redEdges, blueEdges)):
            for source, target in edges:
                graph[color][source].append(target)

        shortest = [-1] * n
        shortest[0] = 0
        visited = [[False, False] for _ in range(n)]
        queue = deque([(0, -1, 0)])

        while queue:
            node, last_color, distance = queue.popleft()
            for color in range(2):
                if color == last_color:
                    continue
                for neighbor in graph[color][node]:
                    if visited[neighbor][color]:
                        continue
                    visited[neighbor][color] = True
                    if shortest[neighbor] == -1:
                        shortest[neighbor] = distance + 1
                    queue.append((neighbor, color, distance + 1))

        return shortest
```

### C++

```cpp []
#include <queue>
#include <tuple>
#include <vector>

using namespace std;

class Solution1129 {
public:
    vector<int> shortestAlternatingPaths(int n, vector<vector<int>>& redEdges, vector<vector<int>>& blueEdges) {
        constexpr int RED = 0;
        constexpr int BLUE = 1;
        constexpr int NONE = 2;

        vector<vector<vector<int>>> graph(2, vector<vector<int>>(n));
        for (const auto& edge : redEdges) graph[RED][edge[0]].push_back(edge[1]);
        for (const auto& edge : blueEdges) graph[BLUE][edge[0]].push_back(edge[1]);

        vector<int> answer(n, -1);
        vector<vector<bool>> visited(n, vector<bool>(2, false));
        queue<tuple<int, int, int>> q;
        q.push({0, NONE, 0});
        answer[0] = 0;

        while (!q.empty()) {
            auto [node, previousColor, distance] = q.front();
            q.pop();

            for (int color = RED; color <= BLUE; color++) {
                if (color == previousColor) continue;
                for (int next : graph[color][node]) {
                    if (visited[next][color]) continue;
                    visited[next][color] = true;
                    if (answer[next] == -1) answer[next] = distance + 1;
                    q.push({next, color, distance + 1});
                }
            }
        }

        return answer;
    }
};
```

### Rust

```rust []
use std::collections::VecDeque;

pub struct Solution;

impl Solution {
    pub fn shortest_alternating_paths(
        n: i32,
        red_edges: Vec<Vec<i32>>,
        blue_edges: Vec<Vec<i32>>,
    ) -> Vec<i32> {
        let n = n as usize;
        let mut graph = vec![vec![Vec::new(); n], vec![Vec::new(); n]];
        for edge in red_edges {
            graph[0][edge[0] as usize].push(edge[1] as usize);
        }
        for edge in blue_edges {
            graph[1][edge[0] as usize].push(edge[1] as usize);
        }

        let mut distances = vec![-1; n];
        distances[0] = 0;
        let mut visited = vec![vec![false; n], vec![false; n]];
        visited[0][0] = true;
        visited[1][0] = true;

        let mut queue = VecDeque::new();
        queue.push_back((0usize, 2usize, 0i32));

        while let Some((node, previous_color, distance)) = queue.pop_front() {
            for color in 0..2 {
                if color == previous_color {
                    continue;
                }
                for &next in &graph[color][node] {
                    if visited[color][next] {
                        continue;
                    }
                    visited[color][next] = true;
                    if distances[next] == -1 {
                        distances[next] = distance + 1;
                    }
                    queue.push_back((next, color, distance + 1));
                }
            }
        }

        distances
    }
}
```

## References

- [LeetCode 1129 — Shortest Path with Alternating Colors](https://leetcode.com/problems/shortest-path-with-alternating-colors/description/)
