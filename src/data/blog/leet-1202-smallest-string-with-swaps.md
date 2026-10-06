---
author: JZ
pubDatetime: 2026-09-27T10:07:00Z
modDatetime: 2026-09-27T10:07:00Z
title: LeetCode 1202 Smallest String With Swaps
featured: false
tags:
  - a-graph
  - a-union-find
  - a-dfs
  - a-sorting
  - a-string
description:
  "Solutions for LeetCode 1202, medium, tags: array, hash table, string, depth-first search, breadth-first search, union find, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 1202](https://leetcode.com/problems/smallest-string-with-swaps/description/)

You are given a string `s`, and an array of pairs of indices in the string `pairs` where `pairs[i] = [a, b]` indicates 2 indices (0-indexed) of the string.

You can swap the characters at any pair of indices in the given `pairs` **any number of times**.

Return the lexicographically smallest string that `s` can be changed to after using the swaps.

```
Example 1:
Input: s = "dcab", pairs = [[0,3],[1,2]]
Output: "bacd"
Explanation:
  Swap s[0] and s[3] → "bcad"
  Swap s[1] and s[2] → "bacd"

Example 2:
Input: s = "dcab", pairs = [[0,3],[1,2],[0,2]]
Output: "abcd"
Explanation:
  Swap s[0] and s[3] → "bcad"
  Swap s[0] and s[2] → "acbd"
  Swap s[1] and s[2] → "abcd"

Example 3:
Input: s = "cba", pairs = [[0,1],[1,2]]
Output: "abc"
Explanation:
  Swap s[0] and s[1] → "bca"
  Swap s[1] and s[2] → "bac"
  Swap s[0] and s[1] → "abc"
```

**Constraints:**

- `1 <= s.length <= 10^5`
- `0 <= pairs.length <= 10^5`
- `0 <= pairs[i][0], pairs[i][1] < s.length`
- `s` only contains lower case English letters.

## Idea1: Union-Find

The key insight: if index `a` connects to `b` and `b` connects to `c`, then we can rearrange the characters at `a`, `b`, `c` in any order (transitive swaps). So we need to find connected components and sort the characters within each.

```
pairs: [0,3], [1,2]

indices:  0  1  2  3
string:   d  c  a  b

component {0,3}: chars d,b → sorted b,d → positions 0→b, 3→d
component {1,2}: chars c,a → sorted a,c → positions 1→a, 2→c

result: "bacd"
```

Union-Find groups indices into components efficiently. For each component, sort the indices and the corresponding characters, then map sorted characters back to sorted index positions.

```
parent = [0, 1, 2, ..., n-1]

for (a, b) in pairs:        ← O(E · α(n))
  union(a, b)

groups = group indices by find(i) for each i   ← O(n · α(n))

for each group:
  chars = sorted chars at group indices         ← O(k · log(k))
  assign chars[j] → result[indices[j]]

total: O(n·α(n) + n·log(n)) ≈ O(n·log(n))
```

Complexity: Time $O(n \cdot \alpha(n) + n \cdot \log n)$, Space $O(n)$.

## Idea2: DFS Connected Components

Instead of Union-Find, build an adjacency list and use DFS (or BFS) to discover connected components. Within each component, the same sort-and-assign logic applies.

```
adj list from pairs:
0 → [3]    1 → [2]
3 → [0]    2 → [1]

DFS from 0: visit 0 → 3 → done. component = {0, 3}
DFS from 1: visit 1 → 2 → done. component = {1, 2}
```

Complexity: Time $O(n \cdot \log n + E)$, Space $O(n + E)$ where $E$ = number of pairs. DFS uses more space for the adjacency list but avoids the Union-Find machinery.

### Java

```java []
// Union-Find, n·α(n) + n·log(n) time, n space.
public static String smallestStringUF(String s, List<List<Integer>> pairs) {
    int n = s.length();
    int[] parent = new int[n];
    int[] rank = new int[n];
    for (int i = 0; i < n; i++) parent[i] = i; // O(n) init

    for (List<Integer> pair : pairs) { // O(E·α(n)) unions
        union(parent, rank, pair.get(0), pair.get(1));
    }

    // group indices by root — O(n·α(n))
    Map<Integer, List<Integer>> groups = new HashMap<>();
    for (int i = 0; i < n; i++) {
        groups.computeIfAbsent(find(parent, i), k -> new ArrayList<>()).add(i);
    }

    char[] res = new char[n];
    for (List<Integer> indices : groups.values()) {
        List<Character> chars = new ArrayList<>(indices.size());
        for (int idx : indices) chars.add(s.charAt(idx));
        Collections.sort(chars); // O(k·log(k)) where k = component size
        for (int i = 0; i < indices.size(); i++) {
            res[indices.get(i)] = chars.get(i);
        }
    }
    return new String(res);
}

private static int find(int[] parent, int x) {
    while (parent[x] != x) {
        parent[x] = parent[parent[x]]; // path compression (halving)
        x = parent[x];
    }
    return x;
}

private static void union(int[] parent, int[] rank, int a, int b) {
    int ra = find(parent, a);
    int rb = find(parent, b);
    if (ra == rb) return;
    if (rank[ra] < rank[rb]) { parent[ra] = rb; }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
    else { parent[rb] = ra; rank[ra]++; }
}
```
```java []
// DFS, n·log(n) + E time, n + E space.
public static String smallestStringDFS(String s, List<List<Integer>> pairs) {
    int n = s.length();
    List<List<Integer>> adj = new ArrayList<>(n);
    for (int i = 0; i < n; i++) adj.add(new ArrayList<>());
    for (List<Integer> pair : pairs) { // O(E) build adjacency list
        int u = pair.get(0), v = pair.get(1);
        adj.get(u).add(v);
        adj.get(v).add(u);
    }

    boolean[] visited = new boolean[n];
    char[] res = new char[n];
    for (int i = 0; i < n; i++) {
        if (visited[i]) continue;
        List<Integer> component = new ArrayList<>();
        dfs(adj, visited, i, component); // O(V_k + E_k)
        Collections.sort(component);
        List<Character> chars = new ArrayList<>(component.size());
        for (int idx : component) chars.add(s.charAt(idx));
        Collections.sort(chars); // O(k·log(k))
        for (int j = 0; j < component.size(); j++) {
            res[component.get(j)] = chars.get(j);
        }
    }
    return new String(res);
}
```

### Python

```python []
class Solution:
    """Union-Find. O(n·α(n) + n·log(n)) time, O(n) space."""

    def smallestStringWithSwaps(self, s, pairs):
        n = len(s)
        parent = list(range(n))
        rank = [0] * n

        def find(x):  # O(α(n)) amortized
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):  # O(α(n)) amortized
            ra, rb = find(a), find(b)
            if ra == rb:
                return
            if rank[ra] < rank[rb]:
                ra, rb = rb, ra
            parent[rb] = ra
            if rank[ra] == rank[rb]:
                rank[ra] += 1

        for a, b in pairs:  # O(E·α(n))
            union(a, b)

        groups = defaultdict(list)
        for i in range(n):  # O(n·α(n))
            groups[find(i)].append(i)

        res = list(s)
        for indices in groups.values():
            chars = sorted(res[i] for i in indices)  # O(k·log(k))
            for i, idx in enumerate(sorted(indices)):
                res[idx] = chars[i]
        return ''.join(res)
```
```python []
class Solution2:
    """DFS connected components. O(n·log(n) + E) time, O(n + E) space."""

    def smallestStringWithSwaps(self, s, pairs):
        n = len(s)
        adj = defaultdict(list)
        for a, b in pairs:  # O(E)
            adj[a].append(b)
            adj[b].append(a)

        visited = [False] * n
        res = list(s)
        for start in range(n):  # O(n + E) total
            if visited[start]:
                continue
            component = []
            stack = [start]
            while stack:
                node = stack.pop()
                if visited[node]:
                    continue
                visited[node] = True
                component.append(node)
                for nei in adj[node]:
                    if not visited[nei]:
                        stack.append(nei)
            chars = sorted(res[i] for i in component)  # O(k·log(k))
            for i, idx in enumerate(sorted(component)):
                res[idx] = chars[i]
        return ''.join(res)
```

### C++

```cpp []
// Union-Find, O(n·α(n) + n·log(n)) time, O(n) space.
string smallestStringWithSwaps(string s, vector<vector<int>> &pairs) {
    int n = static_cast<int>(s.size());
    vector<int> parent(n), rank_(n, 0);
    iota(parent.begin(), parent.end(), 0); // O(n) init

    auto find = [&](int x) {
        while (parent[x] != x) {           // path compression (halving)
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    auto unite = [&](int a, int b) {
        a = find(a); b = find(b);
        if (a == b) return;
        if (rank_[a] < rank_[b]) swap(a, b); // union by rank
        parent[b] = a;
        if (rank_[a] == rank_[b]) ++rank_[a];
    };

    for (auto &p : pairs) unite(p[0], p[1]); // O(E·α(n))

    unordered_map<int, vector<int>> groups;
    for (int i = 0; i < n; ++i)               // O(n·α(n))
        groups[find(i)].push_back(i);

    for (auto &[root, indices] : groups) {
        string chars;
        chars.reserve(indices.size());
        for (int i : indices) chars += s[i];
        sort(chars.begin(), chars.end());      // O(k·log(k))
        for (size_t j = 0; j < indices.size(); ++j)
            s[indices[j]] = chars[j];
    }
    return s;
}
```
```cpp []
// DFS, O(n·log(n) + E) time, O(n + E) space.
string smallestStringWithSwaps(string s, vector<vector<int>> &pairs) {
    int n = static_cast<int>(s.size());
    vector<vector<int>> adj(n);
    for (auto &p : pairs) {               // O(E)
        adj[p[0]].push_back(p[1]);
        adj[p[1]].push_back(p[0]);
    }

    vector<bool> visited(n, false);
    for (int i = 0; i < n; ++i) {         // O(n + E) total
        if (visited[i]) continue;
        vector<int> comp;
        function<void(int)> dfs = [&](int u) {
            visited[u] = true;
            comp.push_back(u);
            for (int v : adj[u])
                if (!visited[v]) dfs(v);
        };
        dfs(i);
        string chars;
        for (int idx : comp) chars += s[idx];
        sort(comp.begin(), comp.end());
        sort(chars.begin(), chars.end()); // O(k·log(k))
        for (size_t j = 0; j < comp.size(); ++j)
            s[comp[j]] = chars[j];
    }
    return s;
}
```

### Rust

```rust []
// Union-Find, O(n·α(n) + n·log(n)) time, O(n) space.
pub fn smallest_string_with_swaps(s: String, pairs: Vec<Vec<i32>>) -> String {
    let n = s.len();
    let mut parent: Vec<usize> = (0..n).collect();
    let mut rank: Vec<usize> = vec![0; n];

    fn find(parent: &mut Vec<usize>, x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]); // path compression
        }
        parent[x]
    }
    fn union(parent: &mut Vec<usize>, rank: &mut Vec<usize>, a: usize, b: usize) {
        let (mut ra, mut rb) = (find(parent, a), find(parent, b));
        if ra == rb { return; }
        if rank[ra] < rank[rb] { std::mem::swap(&mut ra, &mut rb); }
        parent[rb] = ra;
        if rank[ra] == rank[rb] { rank[ra] += 1; }
    }

    for pair in &pairs {
        union(&mut parent, &mut rank, pair[0] as usize, pair[1] as usize);
    }

    let chars: Vec<char> = s.chars().collect();
    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        groups.entry(find(&mut parent, i)).or_default().push(i);
    }

    let mut result = vec![' '; n];
    for (_root, indices) in &groups {
        let mut sorted_chars: Vec<char> = indices.iter().map(|&i| chars[i]).collect();
        sorted_chars.sort();
        let mut sorted_indices = indices.clone();
        sorted_indices.sort();
        for (idx, &i) in sorted_indices.iter().enumerate() {
            result[i] = sorted_chars[idx];
        }
    }
    result.into_iter().collect()
}
```
```rust []
// DFS, O(n·log(n) + E) time, O(n + E) space.
pub fn smallest_string_with_swaps(s: String, pairs: Vec<Vec<i32>>) -> String {
    let n = s.len();
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for pair in &pairs {
        let (a, b) = (pair[0] as usize, pair[1] as usize);
        adj[a].push(b);
        adj[b].push(a);
    }

    let chars: Vec<char> = s.chars().collect();
    let mut visited = vec![false; n];
    let mut result = vec![' '; n];
    for i in 0..n {
        if visited[i] { continue; }
        let mut component = Vec::new();
        let mut stack = vec![i];
        while let Some(node) = stack.pop() {
            if visited[node] { continue; }
            visited[node] = true;
            component.push(node);
            for &nbr in &adj[node] {
                if !visited[nbr] { stack.push(nbr); }
            }
        }
        component.sort();
        let mut sorted_chars: Vec<char> = component.iter().map(|&idx| chars[idx]).collect();
        sorted_chars.sort();
        for (pos, &idx) in component.iter().enumerate() {
            result[idx] = sorted_chars[pos];
        }
    }
    result.into_iter().collect()
}
```
