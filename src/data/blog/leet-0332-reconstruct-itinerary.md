---
author: JZ
pubDatetime: 2026-08-11T10:37:00Z
modDatetime: 2026-08-11T10:37:00Z
title: LeetCode 332 Reconstruct Itinerary
featured: true
tags:
  - a-graph
  - a-depth-first-search
  - a-eulerian-path
description:
  "Solutions for LeetCode 332, hard, tags: graph, depth-first search, Eulerian path."
---

## Table of contents

## Description

Question Links: [LeetCode 332](https://leetcode.com/problems/reconstruct-itinerary/description/)

You are given a list of airline `tickets` where `tickets[i] = [from_i, to_i]` represent the departure and arrival airports of one flight. Reconstruct the itinerary in order and return it.

All of the tickets belong to a man who departs from `"JFK"`, thus, the itinerary must begin with `"JFK"`. If there are multiple valid itineraries, you should return the itinerary that has the smallest lexical order when read as a single string.

You may assume all tickets form at least one valid itinerary. You must use all the tickets once and only once.

```
Example 1:

Input: tickets = [["MUC","LHR"],["JFK","MUC"],["SFO","SJC"],["LHR","SFO"]]
Output: ["JFK","MUC","LHR","SFO","SJC"]

Example 2:

Input: tickets = [["JFK","SFO"],["JFK","ATL"],["SFO","ATL"],["ATL","JFK"],["ATL","SFO"]]
Output: ["JFK","ATL","JFK","SFO","ATL","SFO"]
Explanation: Another possible reconstruction is ["JFK","SFO","ATL","JFK","ATL","SFO"]
but it is larger in lexical order.

Constraints:

1 <= tickets.length <= 300
tickets[i].length == 2
from_i.length == 3
to_i.length == 3
from_i and to_i consist of uppercase English letters.
from_i != to_i
```

## Solution 1: Hierholzer's Algorithm (Recursive DFS)

### Idea

This is an Eulerian path problem on a directed graph — we must traverse every edge (ticket) exactly once. Hierholzer's algorithm finds such a path by:

1. Build an adjacency list; sort neighbors lexicographically (use a min-heap or reverse-sorted list for efficient removal of the smallest).
2. DFS from "JFK": at each node, greedily visit the smallest unvisited neighbor by removing it from the adjacency list.
3. When a node has no remaining neighbors, append it to the result (post-order).
4. Reverse the result to get the correct Eulerian path.

The key insight: post-order collection handles "dead-end" nodes correctly. A dead-end is visited last in forward traversal but must appear before backtracking resumes — post-order + reverse achieves this.

```
Example: tickets = [["JFK","KUL"],["JFK","NRT"],["NRT","JFK"]]

Graph (sorted adjacency):
  JFK -> [KUL, NRT]
  NRT -> [JFK]

DFS from JFK:
  JFK: visit KUL (smallest)
    KUL: no neighbors -> post-order: [KUL]
  JFK: visit NRT
    NRT: visit JFK
      JFK: no neighbors -> post-order: [KUL, JFK]
    NRT: no neighbors -> post-order: [KUL, JFK, NRT]
  JFK: no neighbors -> post-order: [KUL, JFK, NRT, JFK]

Reverse: [JFK, NRT, JFK, KUL]  ✓
```

Complexity: Time $O(E \log E)$ — sorting adjacency lists dominates. Space $O(E)$ — adjacency list and recursion stack.

#### Java

```java []
public static List<String> findItinerary(List<List<String>> tickets) {
    Map<String, PriorityQueue<String>> graph = new HashMap<>(); // O(E) space for adjacency list
    for (List<String> ticket : tickets) {
        graph.computeIfAbsent(ticket.get(0), k -> new PriorityQueue<>()) // PriorityQueue gives lexical order
                .add(ticket.get(1));
    }
    List<String> result = new ArrayList<>();
    dfs(graph, "JFK", result);
    Collections.reverse(result); // post-order reversal gives correct Eulerian path
    return result;
}

private static void dfs(Map<String, PriorityQueue<String>> graph, String airport, List<String> result) {
    PriorityQueue<String> neighbors = graph.get(airport);
    while (neighbors != null && !neighbors.isEmpty()) {
        dfs(graph, neighbors.poll(), result); // O(log E) poll from PriorityQueue
    }
    result.add(airport); // post-order: add after all outgoing edges exhausted
}
```

#### Python

```python []
class Solution:
    """Hierholzer's algorithm (recursive DFS) — Eulerian path in directed graph."""

    def findItinerary(self, tickets: list[list[str]]) -> list[str]:
        graph: dict[str, list[str]] = defaultdict(list)
        for src, dst in tickets:  # O(E)
            graph[src].append(dst)
        for src in graph:  # O(E log E) sort each adjacency list in reverse for pop()
            graph[src].sort(reverse=True)

        route: list[str] = []

        def dfs(airport: str) -> None:
            while graph[airport]:  # O(E) total across all calls
                dfs(graph[airport].pop())
            route.append(airport)

        dfs("JFK")
        return route[::-1]  # O(E)
```

#### C++

```cpp []
static vector<string> findItinerary(vector<vector<string>>& tickets) {
    // O(E log E) — build adjacency with min-heap for lexicographic order
    unordered_map<string, priority_queue<string, vector<string>, greater<string>>> graph;
    for (auto& t : tickets) {
        graph[t[0]].push(t[1]);
    }

    vector<string> route;
    function<void(const string&)> dfs = [&](const string& airport) {
        while (!graph[airport].empty()) {
            string next = graph[airport].top(); // O(log E)
            graph[airport].pop();
            dfs(next);
        }
        route.push_back(airport); // O(1) amortized
    };

    dfs("JFK");
    reverse(route.begin(), route.end()); // O(E)
    return route;
}
```

#### Rust

```rust []
pub fn find_itinerary(tickets: Vec<Vec<String>>) -> Vec<String> {
    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();
    for ticket in &tickets {
        graph.entry(ticket[0].as_str()).or_default().push(ticket[1].as_str());
    }
    // Sort each adjacency list in reverse lexicographic order so pop gives smallest.
    for dests in graph.values_mut() {
        dests.sort_unstable_by(|a, b| b.cmp(a));
    }

    let mut route: Vec<&str> = Vec::with_capacity(tickets.len() + 1);

    fn dfs<'a>(node: &'a str, graph: &mut HashMap<&'a str, Vec<&'a str>>, route: &mut Vec<&'a str>) {
        while let Some(next) = graph.get_mut(node).and_then(Vec::pop) {
            dfs(next, graph, route);
        }
        route.push(node);
    }

    dfs("JFK", &mut graph, &mut route);
    route.reverse();
    route.into_iter().map(String::from).collect()
}
```

## Solution 2: Hierholzer's Algorithm (Iterative Stack)

### Idea

Same algorithm as above but uses an explicit stack instead of recursion. This avoids stack overflow for large inputs (up to 300 tickets per constraints, but useful in general for deeper graphs).

The stack simulates the DFS call stack. When the current top-of-stack node has no more outgoing edges, we pop it into the result (post-order). Otherwise we push the next smallest destination onto the stack.

Complexity: Time $O(E \log E)$, Space $O(E)$.

#### Java

```java []
public static List<String> findItinerary2(List<List<String>> tickets) {
    Map<String, PriorityQueue<String>> graph = new HashMap<>(); // O(E) space for adjacency list
    for (List<String> ticket : tickets) {
        graph.computeIfAbsent(ticket.get(0), k -> new PriorityQueue<>())
                .add(ticket.get(1));
    }
    Deque<String> stack = new ArrayDeque<>(); // O(E) space for explicit stack
    List<String> result = new ArrayList<>();
    stack.push("JFK");
    while (!stack.isEmpty()) {
        String curr = stack.peek();
        PriorityQueue<String> neighbors = graph.get(curr);
        if (neighbors != null && !neighbors.isEmpty()) {
            stack.push(neighbors.poll()); // O(log E) poll, push next smallest destination
        } else {
            result.add(stack.pop()); // post-order: add when no more outgoing edges
        }
    }
    Collections.reverse(result); // reverse post-order to get correct path
    return result;
}
```

#### Python

```python []
class Solution2:
    """Hierholzer's algorithm (iterative stack) — avoids recursion limit."""

    def findItinerary(self, tickets: list[list[str]]) -> list[str]:
        graph: dict[str, list[str]] = defaultdict(list)
        for src, dst in tickets:  # O(E)
            graph[src].append(dst)
        for src in graph:  # O(E log E)
            graph[src].sort(reverse=True)

        stack: list[str] = ["JFK"]
        route: list[str] = []
        while stack:  # O(E)
            while graph[stack[-1]]:
                stack.append(graph[stack[-1]].pop())
            route.append(stack.pop())
        return route[::-1]  # O(E)
```

#### C++

```cpp []
static vector<string> findItinerary2(vector<vector<string>>& tickets) {
    // O(E log E) — build adjacency with min-heap
    unordered_map<string, priority_queue<string, vector<string>, greater<string>>> graph;
    for (auto& t : tickets) {
        graph[t[0]].push(t[1]);
    }

    vector<string> route;
    stack<string> stk;
    stk.push("JFK");

    while (!stk.empty()) {
        string top = stk.top();
        if (!graph[top].empty()) {
            string next = graph[top].top(); // O(log E)
            graph[top].pop();
            stk.push(next);
        } else {
            route.push_back(top); // O(1) amortized
            stk.pop();
        }
    }

    reverse(route.begin(), route.end()); // O(E)
    return route;
}
```

#### Rust

```rust []
pub fn find_itinerary_iterative(tickets: Vec<Vec<String>>) -> Vec<String> {
    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();
    for ticket in &tickets {
        graph.entry(ticket[0].as_str()).or_default().push(ticket[1].as_str());
    }
    for dests in graph.values_mut() {
        dests.sort_unstable_by(|a, b| b.cmp(a));
    }

    let mut stack: Vec<&str> = vec!["JFK"];
    let mut route: Vec<&str> = Vec::with_capacity(tickets.len() + 1);

    while let Some(&node) = stack.last() {
        if graph.get(node).map_or(true, |v| v.is_empty()) {
            route.push(stack.pop().unwrap());
        } else {
            let next = graph.get_mut(node).unwrap().pop().unwrap();
            stack.push(next);
        }
    }

    route.reverse();
    route.into_iter().map(String::from).collect()
}
```
