---
author: JZ
pubDatetime: 2026-06-25T10:36:00Z
modDatetime: 2026-06-25T10:36:00Z
title: LeetCode 841 Keys and Rooms
featured: true
tags:
  - a-dfs
  - a-bfs
  - a-graph
description:
  "Solutions for LeetCode 841, medium, tags: depth-first search, breadth-first search, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 841](https://leetcode.com/problems/keys-and-rooms/description/)

There are `n` rooms labeled from `0` to `n - 1` and all the rooms are locked except for room `0`. Your goal is to visit all the rooms. However, you cannot enter a locked room without having its key.

When you visit a room, you may find a set of **distinct keys** in it. Each key has a number on it, denoting which room it unlocks, and you can take all of them with you to unlock the other rooms.

Given an array `rooms` where `rooms[i]` is the set of keys that you can obtain if you visited room `i`, return `true` if you can visit **all** the rooms, or `false` otherwise.

```
Example 1:

Input: rooms = [[1],[2],[3],[]]
Output: true
Explanation:
We visit room 0 and pick up key 1.
We then visit room 1 and pick up key 2.
We then visit room 2 and pick up key 3.
We then visit room 3.
Since we were able to visit every room, we return true.

Example 2:

Input: rooms = [[1,3],[3,0,1],[2],[0]]
Output: false
Explanation: We can not enter room number 2 since the only key that unlocks it is in room 2.
```

**Constraints:**

- `n == rooms.length`
- `2 <= n <= 1000`
- `0 <= rooms[i].length <= 1000`
- `1 <= sum(rooms[i].length) <= 3000`
- `0 <= rooms[i][j] < n`
- All the values of `rooms[i]` are **unique**.

## Idea1

Model rooms as nodes and keys as directed edges. Room 0 is the start. The question becomes: can we reach all nodes from node 0? This is a standard **graph reachability** problem solvable with DFS or BFS.

**DFS (iterative with stack):** Start from room 0. Push it onto a stack. While the stack is not empty, pop a room, mark it visited, and push all unvisited rooms we have keys to.

```
rooms = [[1],[2],[3],[]]

Stack: [0]        visited: {0}
Pop 0 -> keys: [1] -> push 1
Stack: [1]        visited: {0,1}
Pop 1 -> keys: [2] -> push 2
Stack: [2]        visited: {0,1,2}
Pop 2 -> keys: [3] -> push 3
Stack: [3]        visited: {0,1,2,3}
Pop 3 -> keys: [] -> nothing
Stack: []         visited: {0,1,2,3}  => |visited| == 4 == n => true
```

Each room is visited at most once and each key (edge) is processed at most once.

Complexity: Time $O(N + E)$ where $N$ = number of rooms and $E$ = total number of keys across all rooms. Space $O(N)$ for the visited set and stack.

### Java

```java []
public static boolean canVisitAllRooms(List<List<Integer>> rooms) {
    int n = rooms.size();
    boolean[] visited = new boolean[n]; // O(N) space
    Deque<Integer> stack = new ArrayDeque<>();
    stack.push(0);
    visited[0] = true;
    int count = 1;

    while (!stack.isEmpty()) {
        int room = stack.pop(); // O(1) per visit
        for (int key : rooms.get(room)) { // iterate keys (edges)
            if (!visited[key]) {
                visited[key] = true;
                count++;
                stack.push(key);
            }
        }
    }
    return count == n; // all rooms visited?
}
```

```python []
def canVisitAllRooms(self, rooms: List[List[int]]) -> bool:
    """DFS iterative. O(N+E) time, O(N) space where N=rooms, E=total keys."""
    visited = set()
    stack = [0]
    while stack:
        room = stack.pop()
        if room in visited:
            continue
        visited.add(room)
        for key in rooms[room]:  # O(E) total across all iterations
            if key not in visited:
                stack.append(key)
    return len(visited) == len(rooms)
```

```cpp []
// DFS iterative. O(N+E) time, O(N) space.
bool canVisitAllRooms(vector<vector<int>>& rooms) {
    int n = rooms.size();
    unordered_set<int> visited;
    stack<int> st;
    st.push(0);
    visited.insert(0);
    while (!st.empty()) {
        int room = st.top();
        st.pop();
        for (int key : rooms[room]) {
            if (visited.find(key) == visited.end()) {
                visited.insert(key);
                st.push(key);
            }
        }
    }
    return (int)visited.size() == n;
}
```

```rust []
/// DFS iterative. O(N+E) time, O(N) space.
pub fn can_visit_all_rooms(rooms: Vec<Vec<i32>>) -> bool {
    let n = rooms.len();
    let mut visited = vec![false; n];
    let mut stack = vec![0usize];
    visited[0] = true;
    while let Some(room) = stack.pop() {
        for &key in &rooms[room] {
            let key = key as usize;
            if !visited[key] {
                visited[key] = true;
                stack.push(key);
            }
        }
    }
    visited.iter().all(|&v| v)
}
```

## Idea2

**BFS (queue-based):** Same reachability check but explores rooms level by level. Mark rooms visited when enqueuing (not when dequeuing) to avoid duplicates in the queue.

Complexity: Time $O(N + E)$, Space $O(N)$.

### Java

```java []
public static boolean canVisitAllRoomsBFS(List<List<Integer>> rooms) {
    int n = rooms.size();
    boolean[] visited = new boolean[n]; // O(N) space
    Queue<Integer> queue = new ArrayDeque<>();
    queue.offer(0);
    visited[0] = true;
    int count = 1;

    while (!queue.isEmpty()) {
        int room = queue.poll(); // O(1) per visit
        for (int key : rooms.get(room)) { // iterate keys (edges)
            if (!visited[key]) {
                visited[key] = true;
                count++;
                queue.offer(key);
            }
        }
    }
    return count == n; // all rooms visited?
}
```

```python []
def canVisitAllRoomsBFS(self, rooms: List[List[int]]) -> bool:
    """BFS. O(N+E) time, O(N) space."""
    visited = set([0])
    queue = deque([0])
    while queue:
        room = queue.popleft()
        for key in rooms[room]:
            if key not in visited:
                visited.add(key)
                queue.append(key)
    return len(visited) == len(rooms)
```

```cpp []
// BFS. O(N+E) time, O(N) space.
bool canVisitAllRoomsBFS(vector<vector<int>>& rooms) {
    int n = rooms.size();
    unordered_set<int> visited;
    queue<int> q;
    q.push(0);
    visited.insert(0);
    while (!q.empty()) {
        int room = q.front();
        q.pop();
        for (int key : rooms[room]) {
            if (visited.find(key) == visited.end()) {
                visited.insert(key);
                q.push(key);
            }
        }
    }
    return (int)visited.size() == n;
}
```

```rust []
/// BFS. O(N+E) time, O(N) space.
pub fn can_visit_all_rooms_bfs(rooms: Vec<Vec<i32>>) -> bool {
    use std::collections::VecDeque;
    let n = rooms.len();
    let mut visited = vec![false; n];
    let mut queue = VecDeque::new();
    visited[0] = true;
    queue.push_back(0usize);
    while let Some(room) = queue.pop_front() {
        for &key in &rooms[room] {
            let key = key as usize;
            if !visited[key] {
                visited[key] = true;
                queue.push_back(key);
            }
        }
    }
    visited.iter().all(|&v| v)
}
```
