---
author: JZ
pubDatetime: 2026-06-25T10:07:00Z
modDatetime: 2026-06-25T10:07:00Z
title: LeetCode 547 Number of Provinces
featured: false
tags:
  - a-union-find
  - a-dfs
  - a-graph
description:
  "Solutions for LeetCode 547, medium, tags: depth-first search, breadth-first search, union find, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 547](https://leetcode.com/problems/number-of-provinces/description/)

There are `n` cities. Some of them are connected, while some are not. If city `a` is connected directly with city `b`, and city `b` is connected directly with city `c`, then city `a` is connected indirectly with city `c`.

A **province** is a group of directly or indirectly connected cities and no other cities outside of the group.

You are given an `n x n` matrix `isConnected` where `isConnected[i][j] = 1` if the `i`th city and the `j`th city are directly connected, and `isConnected[i][j] = 0` otherwise.

Return _the total number of **provinces**_.

```
Example 1:

  0 --- 1     2

Input: isConnected = [[1,1,0],[1,1,0],[0,0,1]]
Output: 2

Example 2:

  0     1     2

Input: isConnected = [[1,0,0],[0,1,0],[0,0,1]]
Output: 3
```

**Constraints:**

- `1 <= n <= 200`
- `n == isConnected.length`
- `n == isConnected[i].length`
- `isConnected[i][j]` is `1` or `0`.
- `isConnected[i][i] == 1`
- `isConnected[i][j] == isConnected[j][i]`

## Idea1

Use **DFS** to count connected components. For each unvisited city, increment the province count and run an iterative DFS (using an explicit stack) to mark all reachable cities as visited. The adjacency matrix row gives us all neighbors in O(n) time.

```
isConnected:         visited after DFS from city 0:
[1, 1, 0]           [true, true, false]
[1, 1, 0]           provinces = 1
[0, 0, 1]

continue scan -> city 2 unvisited:
                     [true, true, true]
                     provinces = 2
```

Complexity: Time $O(n^2)$ — we visit every cell of the n×n matrix at most once. Space $O(n)$ — for the visited array and DFS stack (at most n cities on the stack).

### Java

```java []
// lc 547 DFS iterative, O(n^2) time, O(n) space.
public static int findCircleNumDFS(int[][] isConnected) {
    if (isConnected == null || isConnected.length == 0) return 0;
    int n = isConnected.length;
    boolean[] visited = new boolean[n];             // O(n) space
    int provinces = 0;

    for (int i = 0; i < n; i++) {                   // O(n) cities to check
        if (!visited[i]) {
            provinces++;
            Deque<Integer> stack = new ArrayDeque<>();
            stack.push(i);
            while (!stack.isEmpty()) {              // iterative DFS
                int city = stack.pop();
                if (visited[city]) continue;
                visited[city] = true;
                for (int j = 0; j < n; j++) {       // O(n) neighbors per city
                    if (isConnected[city][j] == 1 && !visited[j]) {
                        stack.push(j);
                    }
                }
            }
        }
    }
    return provinces;
}
```

```python []
# lc 547 DFS iterative, O(n^2) time, O(n) space.
class Solution:
    def findCircleNum(self, isConnected: list[list[int]]) -> int:
        n = len(isConnected)
        visited = [False] * n
        count = 0
        for i in range(n):  # O(n)
            if not visited[i]:
                count += 1
                stack = [i]
                while stack:  # O(n) total across all DFS calls
                    node = stack.pop()
                    for j in range(n):  # O(n) neighbors
                        if isConnected[node][j] == 1 and not visited[j]:
                            visited[j] = True
                            stack.append(j)
        return count
```

```cpp []
// lc 547 DFS iterative, O(n^2) time, O(n) space.
static int findCircleNumDFS(vector<vector<int>>& isConnected) {
    int n = isConnected.size();
    vector<bool> visited(n, false); // O(n) space
    int provinces = 0;

    for (int i = 0; i < n; i++) {
        if (visited[i]) continue;
        provinces++;
        stack<int> stk;        // O(n) worst-case stack depth
        stk.push(i);
        visited[i] = true;
        while (!stk.empty()) {
            int city = stk.top();
            stk.pop();
            for (int j = 0; j < n; j++) { // O(n) scan neighbors
                if (isConnected[city][j] == 1 && !visited[j]) {
                    visited[j] = true;
                    stk.push(j);
                }
            }
        }
    }
    return provinces;
}
```

```rust []
// lc 547 DFS iterative, O(n^2) time, O(n) space.
pub fn find_circle_num(is_connected: &Vec<Vec<i32>>) -> i32 {
    let n = is_connected.len();
    let mut visited = vec![false; n]; // O(n) space
    let mut provinces = 0;
    let mut stack = Vec::new(); // O(n) space worst case

    for i in 0..n { // O(n) outer loop
        if visited[i] { continue; }
        provinces += 1;
        stack.push(i);
        while let Some(city) = stack.pop() { // DFS traversal
            if visited[city] { continue; }
            visited[city] = true;
            for j in 0..n { // O(n) neighbor scan
                if is_connected[city][j] == 1 && !visited[j] {
                    stack.push(j);
                }
            }
        }
    }
    provinces
}
```

## Idea2

Use **Union Find** (disjoint set) with path compression and union by rank. Start with `n` isolated components. Scan the upper triangle of the matrix — when `isConnected[i][j] == 1`, merge the sets containing `i` and `j`. Each successful merge decrements the component count.

Union Find is a fundamentally different data structure from the DFS approach — it maintains disjoint sets and supports efficient merge/query operations without explicit graph traversal.

```
n=3, isConnected = [[1,1,0],[1,1,0],[0,0,1]]

Initial: parent = [0,1,2], provinces = 3

Process (0,1): isConnected[0][1]=1
  find(0)=0, find(1)=1 -> different
  union(0,1): parent=[0,0,2], provinces=2

Process (0,2): isConnected[0][2]=0 -> skip
Process (1,2): isConnected[1][2]=0 -> skip

Result: 2 provinces
```

Complexity: Time $O(n^2 \cdot \alpha(n))$ — iterate upper triangle of matrix with nearly O(1) amortized union/find operations. Space $O(n)$ — parent and rank arrays.

### Java

```java []
// lc 547 Union Find, O(n^2 * alpha(n)) time, O(n) space.
public static int findCircleNumUnionFind(int[][] isConnected) {
    if (isConnected == null || isConnected.length == 0) return 0;
    int n = isConnected.length;
    int[] parent = new int[n];                      // O(n) space
    int[] rank = new int[n];                        // O(n) space
    int provinces = n;

    for (int i = 0; i < n; i++) parent[i] = i;     // each city is its own root

    for (int i = 0; i < n; i++) {                   // O(n^2) pairs to check
        for (int j = i + 1; j < n; j++) {           // upper triangle only
            if (isConnected[i][j] == 1) {
                int ri = find(parent, i);           // O(alpha(n)) amortized
                int rj = find(parent, j);
                if (ri != rj) {
                    union(parent, rank, ri, rj);
                    provinces--;
                }
            }
        }
    }
    return provinces;
}

private static int find(int[] parent, int x) {
    if (parent[x] != x) parent[x] = find(parent, parent[x]); // path compression
    return parent[x];
}

private static void union(int[] parent, int[] rank, int x, int y) {
    if (rank[x] < rank[y]) parent[x] = y;          // union by rank
    else if (rank[x] > rank[y]) parent[y] = x;
    else { parent[y] = x; rank[x]++; }
}
```

```python []
# lc 547 Union Find, O(n^2 * alpha(n)) time, O(n) space.
class Solution2:
    def findCircleNum(self, isConnected: list[list[int]]) -> int:
        n = len(isConnected)
        parent = list(range(n))
        rank = [0] * n

        def find(x):
            while parent[x] != x:  # O(alpha(n)) amortized
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x, y):
            px, py = find(x), find(y)
            if px == py:
                return False
            if rank[px] < rank[py]:
                px, py = py, px
            parent[py] = px  # O(1)
            if rank[px] == rank[py]:
                rank[px] += 1
            return True

        count = n
        for i in range(n):  # O(n)
            for j in range(i + 1, n):  # O(n), together O(n^2)
                if isConnected[i][j] == 1:
                    if union(i, j):
                        count -= 1
        return count
```

```cpp []
// lc 547 Union Find, O(n^2 * alpha(n)) time, O(n) space.
static int findCircleNumUF(vector<vector<int>>& isConnected) {
    int n = isConnected.size();
    vector<int> parent(n);   // O(n) space
    vector<int> rank(n, 0);  // O(n) space
    iota(parent.begin(), parent.end(), 0);
    int provinces = n;

    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) { // upper triangle only
            if (isConnected[i][j] == 1) {
                int ri = find(parent, i); // path-compressed find
                int rj = find(parent, j);
                if (ri != rj) {
                    unite(parent, rank, ri, rj);
                    provinces--;
                }
            }
        }
    }
    return provinces;
}

static int find(vector<int>& parent, int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]]; // path compression (halving)
        x = parent[x];
    }
    return x;
}

static void unite(vector<int>& parent, vector<int>& rank, int x, int y) {
    if (rank[x] < rank[y]) swap(x, y);
    parent[y] = x;
    if (rank[x] == rank[y]) rank[x]++;
}
```

```rust []
// lc 547 Union Find, O(n^2 * alpha(n)) time, O(n) space.
pub fn find_circle_num_uf(is_connected: &Vec<Vec<i32>>) -> i32 {
    let n = is_connected.len();
    let mut parent: Vec<usize> = (0..n).collect(); // O(n) space
    let mut rank = vec![0u32; n]; // O(n) space
    let mut provinces = n as i32;

    for i in 0..n { // O(n^2) iteration over upper triangle
        for j in (i + 1)..n {
            if is_connected[i][j] == 1 {
                let ri = find(&mut parent, i);
                let rj = find(&mut parent, j);
                if ri != rj {
                    union(&mut parent, &mut rank, ri, rj);
                    provinces -= 1;
                }
            }
        }
    }
    provinces
}

fn find(parent: &mut Vec<usize>, x: usize) -> usize {
    if parent[x] != x {
        parent[x] = find(parent, parent[x]); // path compression
    }
    parent[x]
}

fn union(parent: &mut Vec<usize>, rank: &mut Vec<u32>, x: usize, y: usize) {
    match rank[x].cmp(&rank[y]) { // union by rank
        std::cmp::Ordering::Less => parent[x] = y,
        std::cmp::Ordering::Greater => parent[y] = x,
        std::cmp::Ordering::Equal => { parent[y] = x; rank[x] += 1; }
    }
}
```
