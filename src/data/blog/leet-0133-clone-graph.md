---
author: JZ
pubDatetime: 2026-05-19T06:00:00Z
modDatetime: 2026-05-19T06:00:00Z
title: LeetCode 133 Clone Graph
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-graph
  - a-hash-table
description:
  "Solutions for LeetCode 133, medium, tags: hash table, depth-first search, breadth-first search, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 133](https://leetcode.com/problems/clone-graph/description/)

Given a reference of a node in a **connected** undirected graph.

Return a [**deep copy**](https://en.wikipedia.org/wiki/Object_copying#Deep_copy) (clone) of the graph.

Each node in the graph contains a value (`int`) and a list (`List[Node]`) of its neighbors.

```
class Node {
    public int val;
    public List<Node> neighbors;
}
```

**Test case format:**

For simplicity, each node's value is the same as the node's index (1-indexed). For example, the first node with `val == 1`, the second node with `val == 2`, and so on. The graph is represented in the test case using an adjacency list.

An adjacency list is a collection of unordered lists used to represent a finite graph. Each list describes the set of neighbors of a node in the graph.

The given node will always be the first node with `val = 1`. You must return the **copy of the given node** as a reference to the cloned graph.

```
Example 1:

    1 --- 2
    |     |
    4 --- 3

Input: adjList = [[2,4],[1,3],[2,4],[1,3]]
Output: [[2,4],[1,3],[2,4],[1,3]]
Explanation: There are 4 nodes in the graph.
1st node (val = 1)'s neighbors are 2nd node (val = 2) and 4th node (val = 4).
2nd node (val = 2)'s neighbors are 1st node (val = 1) and 3rd node (val = 3).
3rd node (val = 3)'s neighbors are 2nd node (val = 2) and 4th node (val = 4).
4th node (val = 4)'s neighbors are 1st node (val = 1) and 3rd node (val = 3).

Example 2:

Input: adjList = [[]]
Output: [[]]
Explanation: The graph consists of only one node with val = 1 and it does not have any neighbors.

Example 3:

Input: adjList = []
Output: []
Explanation: This is an empty graph, it does not have any nodes.
```

**Constraints:**

- The number of nodes in the graph is in the range `[0, 100]`.
- `1 <= Node.val <= 100`
- `Node.val` is unique for each node.
- There are no repeated edges and no self-loops in the graph.
- The Graph is connected and all nodes can be visited starting from the given node.

## Idea1

Use **DFS (depth-first search)** with a hash map to track already-cloned nodes (keyed by node value or original node reference). When visiting a node:

1. If it's already in the map, return the existing clone.
2. Otherwise, create a new clone node, put it in the map, then recursively clone each neighbor.

The map serves as both the "visited" set and the lookup from original to clone.

```
Original graph:           Clone process (DFS from node 1):

    1 --- 2               clone(1) -> map{1:1'}
    |     |                 clone(2) -> map{1:1', 2:2'}
    4 --- 3                   clone(1) -> return 1' (already in map)
                              clone(3) -> map{..., 3:3'}
                                clone(2) -> return 2' (already in map)
                                clone(4) -> map{..., 4:4'}
                                  clone(1) -> return 1' (already in map)
                                  clone(3) -> return 3' (already in map)
```

Complexity: Time $O(V + E)$ — each node and edge visited once, Space $O(V)$ — the hash map plus recursion stack.

### Java

```java []
import struct.graph.Node;

import java.util.HashMap;
import java.util.Map;

// lc 133, DFS, O(V+E) time, O(V) space.
public Node cloneGraphDFS(Node node) {
    Map<Integer, Node> valNode = new HashMap<>();
    return dfs(node, valNode);
}

private Node dfs(Node node, Map<Integer, Node> nodes) {
    if (node == null) return null;
    if (nodes.containsKey(node.val)) return nodes.get(node.val);
    Node res = new Node(node.val);
    nodes.put(node.val, res);
    for (Node n : node.neighbors) res.neighbors.add(dfs(n, nodes)); // O(E) total across all calls
    return res;
}
```

```python []
# lc 133, DFS, O(V+E) time, O(V) space.
def cloneGraph(self, node: Optional['Node']) -> Optional['Node']:
    val_node = dict()
    return self.dfs(node, val_node)

def dfs(self, node, val_node):
    if not node:
        return node
    if node.val in val_node:
        return val_node[node.val]
    res = Node(val=node.val)
    val_node[node.val] = res
    for n in node.neighbors:
        res.neighbors.append(self.dfs(n, val_node))  # O(E) total
    return res
```

```cpp []
// lc 133, DFS, O(V+E) time, O(V) space.
GNode* cloneGraphDFS(GNode* node) {
    unordered_map<GNode*, GNode*> visited;
    return dfs(node, visited);
}

GNode* dfs(GNode* node, unordered_map<GNode*, GNode*> &visited) {
    if (!node) return nullptr;
    if (visited.find(node) != visited.end()) return visited[node];
    GNode* clone = new GNode(node->val);
    visited[node] = clone;
    for (GNode* neighbor : node->neighbors) {
        clone->neighbors.push_back(dfs(neighbor, visited));  // O(E) total
    }
    return clone;
}
```

```rust []
// lc 133, DFS, O(V+E) time, O(V) space.
pub fn clone_graph_dfs(node: Option<NodeRef>) -> Option<NodeRef> {
    let node = node?;
    let mut visited: HashMap<i32, NodeRef> = HashMap::new();
    Some(Self::dfs(&node, &mut visited))
}

fn dfs(node: &NodeRef, visited: &mut HashMap<i32, NodeRef>) -> NodeRef {
    let val = node.borrow().val;
    if let Some(cloned) = visited.get(&val) {
        return Rc::clone(cloned);
    }
    let clone = Rc::new(RefCell::new(GNode::new(val)));
    visited.insert(val, Rc::clone(&clone));
    let neighbors: Vec<NodeRef> = node.borrow().neighbors.clone();
    for neighbor in &neighbors {
        let cloned_neighbor = Self::dfs(neighbor, visited); // O(E) total
        clone.borrow_mut().neighbors.push(cloned_neighbor);
    }
    clone
}
```

## Idea2

Use **BFS (breadth-first search)** with a queue and the same hash map strategy. Start by cloning the root node, add it to the map and enqueue the original. Then process the queue: for each dequeued node, iterate its neighbors — if a neighbor isn't in the map yet, clone it and enqueue the original. Either way, link the cloned neighbor to the cloned current node.

Complexity: Time $O(V + E)$, Space $O(V)$ for the hash map and queue.

### Java

```java []
import struct.graph.Node;

import java.util.*;

// lc 133, BFS, O(V+E) time, O(V) space.
public Node cloneGraphBFS(Node node) {
    if (node == null) return null;
    Map<Integer, Node> valNode = new HashMap<>();
    Queue<Node> queue = new ArrayDeque<>();
    queue.add(node);
    Node copy = new Node(node.val);
    valNode.put(node.val, copy);
    while (!queue.isEmpty()) {
        Node cur = queue.remove();
        for (Node n : cur.neighbors) {          // O(E) total across all iterations
            if (!valNode.containsKey(n.val)) {
                queue.add(n);
                valNode.put(n.val, new Node(n.val));
            }
            valNode.get(cur.val).neighbors.add(valNode.get(n.val));
        }
    }
    return copy;
}
```

```python []
# lc 133, BFS, O(V+E) time, O(V) space.
def cloneGraphBFS(self, node: Optional['Node']) -> Optional['Node']:
    if not node:
        return node
    res = Node(node.val)
    q = deque()
    q.append(node)
    val_node = dict()
    val_node[node.val] = res
    while len(q) > 0:
        cur = q.popleft()
        for n in cur.neighbors:             # O(E) total
            if n.val not in val_node:
                val_node[n.val] = Node(n.val)
                q.append(n)
            val_node[cur.val].neighbors.append(val_node[n.val])
    return res
```

```cpp []
// lc 133, BFS, O(V+E) time, O(V) space.
GNode* cloneGraphBFS(GNode* node) {
    if (!node) return nullptr;
    unordered_map<GNode*, GNode*> visited;
    queue<GNode*> q;
    visited[node] = new GNode(node->val);
    q.push(node);
    while (!q.empty()) {
        GNode* cur = q.front();
        q.pop();
        for (GNode* neighbor : cur->neighbors) {  // O(E) total
            if (visited.find(neighbor) == visited.end()) {
                visited[neighbor] = new GNode(neighbor->val);
                q.push(neighbor);
            }
            visited[cur]->neighbors.push_back(visited[neighbor]);
        }
    }
    return visited[node];
}
```

```rust []
// lc 133, BFS, O(V+E) time, O(V) space.
pub fn clone_graph_bfs(node: Option<NodeRef>) -> Option<NodeRef> {
    let node = node?;
    let mut visited: HashMap<i32, NodeRef> = HashMap::new();
    let mut queue = VecDeque::new();
    let val = node.borrow().val;
    let clone = Rc::new(RefCell::new(GNode::new(val)));
    visited.insert(val, Rc::clone(&clone));
    queue.push_back(Rc::clone(&node));
    while let Some(current) = queue.pop_front() {
        let current_val = current.borrow().val;
        let neighbors: Vec<NodeRef> = current.borrow().neighbors.clone();
        for neighbor in &neighbors {                // O(E) total
            let neighbor_val = neighbor.borrow().val;
            if !visited.contains_key(&neighbor_val) {
                let neighbor_clone = Rc::new(RefCell::new(GNode::new(neighbor_val)));
                visited.insert(neighbor_val, Rc::clone(&neighbor_clone));
                queue.push_back(Rc::clone(neighbor));
            }
            let cloned_neighbor = Rc::clone(visited.get(&neighbor_val).unwrap());
            visited.get(&current_val).unwrap().borrow_mut().neighbors.push(cloned_neighbor);
        }
    }
    Some(clone)
}
```
