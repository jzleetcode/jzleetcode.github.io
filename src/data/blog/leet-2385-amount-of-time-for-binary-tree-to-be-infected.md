---
author: JZ
pubDatetime: 2026-08-17T08:00:00Z
modDatetime: 2026-08-17T08:00:00Z
title: LeetCode 2385 Amount of Time for Binary Tree to Be Infected
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-tree
description:
  "Solutions for LeetCode 2385, medium, tags: tree, depth-first search, breadth-first search, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 2385](https://leetcode.com/problems/amount-of-time-for-binary-tree-to-be-infected/description/)

You are given the `root` of a binary tree with **unique** values, and an integer `start`. At minute 0, an **infection** starts from the node with value `start`.

Each minute, a node becomes infected if:
- The node is currently uninfected.
- The node is adjacent to an infected node.

Return *the number of minutes needed for the entire tree to be infected.*

```
Example 1:

        1
       / \
      5   3
     /   / \
    4   10   6
   / \
  9   2

Input: root = [1,5,3,4,null,10,6,9,2], start = 3
Output: 4
Explanation:
- Minute 0: Node 3
- Minute 1: Nodes 1, 10, 6
- Minute 2: Node 5
- Minute 3: Node 4
- Minute 4: Nodes 9, 2

Example 2:

Input: root = [1], start = 1
Output: 0
```

**Constraints:**

- The number of nodes in the tree is in the range `[1, 10^5]`.
- `1 <= Node.val <= 10^5`
- Each node has a **unique** value.
- A node with value `start` exists in the tree.

## Idea

### Solution 1: BFS (Graph Conversion)

Treat the binary tree as an undirected graph. Build parent pointers (or an adjacency list) via DFS, then BFS from the `start` node. The number of BFS levels minus one equals the infection time.

```
       1
      / \
     5   3   <-- start = 3
    /   / \
   4   10   6
  / \
 9   2

BFS from 3: level 0 = {3}
             level 1 = {1, 10, 6}
             level 2 = {5}
             level 3 = {4}
             level 4 = {9, 2}  --> answer = 4
```

Complexity: Time $O(n)$, Space $O(n)$.

### Solution 2: One-Pass DFS (Negative Encoding)

Avoid building an explicit graph by using a single post-order DFS. Define `depth(node)`:

- Returns `max(left, right) + 1` normally — the 1-indexed height (leaf returns 1, None returns 0).
- When `node.val == start`: the farthest node in start's subtree is `max(left, right)` edges away. Update the answer, then return `-1` to signal "start is 1 edge below this node's parent."
- When a child returns a negative value `d`: start is `|d|` edges below the current node. The farthest infection path going the other direction is `otherChildHeight + |d|`. Update answer, propagate `d - 1` upward.

```
depth(None) = 0

depth(9) = 1     depth(2) = 1
      \         /
    depth(4) = max(1,1)+1 = 2
      /
depth(5) = max(2,0)+1 = 3

depth(10) = 1    depth(6) = 1
       \        /
     depth(3): node.val==start
       ans = max(1, 1) = 1
       return -1

depth(1): left=3, right=-1
  right < 0 → ans = max(1, left - right) = max(1, 3-(-1)) = 4 ✓
  return -2
```

The formula `left - right = left + |right|` works because heights are 1-indexed: `left=3` means the farthest leaf from node 5 is 3 edges away (5→4→9). Adding `|right|=1` (the edge from node 1 to start's direction) gives the total path length of 4.

Complexity: Time $O(n)$, Space $O(h)$ where $h$ is tree height.

### Java

```java []
// BFS approach. O(n) time, O(n) space.
public static int amountOfTime(TreeNode root, int start) {
    Map<Integer, TreeNode> parentMap = new HashMap<>();
    Map<Integer, TreeNode> nodeMap = new HashMap<>();
    Deque<TreeNode> stack = new ArrayDeque<>();
    stack.push(root);
    // O(n) DFS to build parent pointers and node lookup
    while (!stack.isEmpty()) {
        TreeNode node = stack.pop();
        nodeMap.put(node.val, node);
        if (node.right != null) {
            parentMap.put(node.right.val, node);
            stack.push(node.right);
        }
        if (node.left != null) {
            parentMap.put(node.left.val, node);
            stack.push(node.left);
        }
    }
    // BFS from start node; O(n) time, O(n) space
    TreeNode startNode = nodeMap.get(start);
    Set<Integer> visited = new HashSet<>();
    Queue<TreeNode> queue = new ArrayDeque<>();
    queue.add(startNode);
    visited.add(start);
    int minutes = -1;
    while (!queue.isEmpty()) {
        int size = queue.size();
        minutes++;
        for (int i = 0; i < size; i++) {
            TreeNode cur = queue.poll();
            if (cur.left != null && visited.add(cur.left.val)) queue.add(cur.left);
            if (cur.right != null && visited.add(cur.right.val)) queue.add(cur.right);
            TreeNode parent = parentMap.get(cur.val);
            if (parent != null && visited.add(parent.val)) queue.add(parent);
        }
    }
    return minutes;
}
```

```java []
// DFS approach. O(n) time, O(h) space.
private static int ans;

public static int amountOfTimeDfs(TreeNode root, int start) {
    ans = 0;
    depth(root, start);
    return ans;
}

private static int depth(TreeNode node, int start) {
    if (node == null) return 0;
    int left = depth(node.left, start);   // O(h) stack
    int right = depth(node.right, start);

    if (node.val == start) {
        ans = Math.max(ans, Math.max(left, right));
        return -1;
    }
    if (left < 0) {
        ans = Math.max(ans, right - left);
        return left - 1;
    }
    if (right < 0) {
        ans = Math.max(ans, left - right);
        return right - 1;
    }
    return 1 + Math.max(left, right);
}
```

### Python

```python []
class Solution:
    """BFS: build parent map, then BFS from start. O(n) time, O(n) space."""

    def amountOfTime(self, root: Optional[TreeNode], start: int) -> int:
        parent = {}
        start_node = None

        def build(node, par):  # O(n)
            nonlocal start_node
            if not node:
                return
            parent[node] = par
            if node.val == start:
                start_node = node
            build(node.left, node)
            build(node.right, node)

        build(root, None)

        queue = deque([start_node])
        visited = {start_node}
        minutes = -1
        while queue:  # O(n) total
            minutes += 1
            for _ in range(len(queue)):
                node = queue.popleft()
                for neighbor in (node.left, node.right, parent[node]):
                    if neighbor and neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
        return minutes
```

```python []
class Solution2:
    """DFS: negative encoding. O(n) time, O(h) space."""

    def amountOfTime(self, root: Optional[TreeNode], start: int) -> int:
        self.ans = 0

        def depth(node):  # O(n)
            if not node:
                return 0
            left = depth(node.left)   # O(h) stack
            right = depth(node.right)

            if node.val == start:
                self.ans = max(self.ans, max(left, right))
                return -1
            if left < 0:
                self.ans = max(self.ans, right - left)
                return left - 1
            if right < 0:
                self.ans = max(self.ans, left - right)
                return right - 1
            return max(left, right) + 1

        depth(root)
        return self.ans
```

### C++

```cpp []
// BFS: build parent map, then BFS from start. O(n) time, O(n) space.
int amountOfTime(TreeNode* root, int start) {
    unordered_map<TreeNode*, TreeNode*> parent;
    TreeNode* startNode = nullptr;

    function<void(TreeNode*, TreeNode*)> buildParent = [&](TreeNode* node, TreeNode* par) {
        if (!node) return;
        parent[node] = par;
        if (node->val == start) startNode = node;
        buildParent(node->left, node);
        buildParent(node->right, node);
    };
    buildParent(root, nullptr);

    queue<TreeNode*> q;
    unordered_set<TreeNode*> visited;
    q.push(startNode);
    visited.insert(startNode);
    int minutes = -1;

    while (!q.empty()) {
        int sz = q.size();
        minutes++;
        for (int i = 0; i < sz; i++) {
            TreeNode* cur = q.front(); q.pop();
            for (TreeNode* next : {cur->left, cur->right, parent[cur]}) {
                if (next && !visited.count(next)) {
                    visited.insert(next);
                    q.push(next);
                }
            }
        }
    }
    return minutes;
}
```

```cpp []
// DFS: negative encoding. O(n) time, O(h) space.
class Solution2 {
    int ans;

    int depth(TreeNode* node, int start) {
        if (!node) return 0;
        int left = depth(node->left, start);
        int right = depth(node->right, start);

        if (node->val == start) {
            ans = max(left, right);
            return -1;
        }
        if (left < 0) {
            ans = max(ans, right - left);
            return left - 1;
        }
        if (right < 0) {
            ans = max(ans, left - right);
            return right - 1;
        }
        return max(left, right) + 1;
    }

public:
    int amountOfTime(TreeNode* root, int start) {
        ans = 0;
        depth(root, start);
        return ans;
    }
};
```

### Rust

```rust []
// BFS: build adjacency list, then BFS from start. O(n) time, O(n) space.
pub fn amount_of_time(root: TreeLink, start: i32) -> i32 {
    let mut graph: HashMap<i32, Vec<i32>> = HashMap::new();

    fn build(node: &TreeLink, graph: &mut HashMap<i32, Vec<i32>>) {
        if let Some(n) = node {
            let n = n.borrow();
            if let Some(ref left) = n.left {
                let lv = left.borrow().val;
                graph.entry(n.val).or_default().push(lv);
                graph.entry(lv).or_default().push(n.val);
                build(&n.left, graph);
            }
            if let Some(ref right) = n.right {
                let rv = right.borrow().val;
                graph.entry(n.val).or_default().push(rv);
                graph.entry(rv).or_default().push(n.val);
                build(&n.right, graph);
            }
        }
    }

    build(&root, &mut graph);

    let mut visited: HashMap<i32, bool> = HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back(start);
    visited.insert(start, true);
    let mut minutes = -1;

    while !queue.is_empty() {
        let size = queue.len();
        for _ in 0..size {
            let cur = queue.pop_front().unwrap();
            if let Some(neighbors) = graph.get(&cur) {
                for &nb in neighbors {
                    if !visited.contains_key(&nb) {
                        visited.insert(nb, true);
                        queue.push_back(nb);
                    }
                }
            }
        }
        minutes += 1;
    }
    minutes
}
```

```rust []
// DFS: negative encoding. O(n) time, O(h) space.
pub fn amount_of_time_dfs(root: TreeLink, start: i32) -> i32 {
    let mut ans = 0;

    fn depth(node: &TreeLink, start: i32, ans: &mut i32) -> i32 {
        match node {
            None => 0,
            Some(n) => {
                let n = n.borrow();
                let left = depth(&n.left, start, ans);
                let right = depth(&n.right, start, ans);

                if n.val == start {
                    *ans = left.max(right);
                    return -1;
                }
                if left < 0 {
                    *ans = (*ans).max(right - left);
                    return left - 1;
                }
                if right < 0 {
                    *ans = (*ans).max(left - right);
                    return right - 1;
                }
                left.max(right) + 1
            }
        }
    }

    depth(&root, start, &mut ans);
    ans
}
```
