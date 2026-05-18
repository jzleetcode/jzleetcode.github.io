---
author: JZ
pubDatetime: 2026-05-18T06:00:00Z
modDatetime: 2026-05-18T06:00:00Z
title: LeetCode 2583 Kth Largest Sum in a Binary Tree
featured: true
tags:
  - a-tree
  - a-bfs
  - a-sorting
  - a-heap
description:
  "Solutions for LeetCode 2583, medium, tags: tree, breadth-first search, sorting, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 2583](https://leetcode.com/problems/kth-largest-sum-in-a-binary-tree/description/)

You are given the root of a binary tree and a positive integer `k`.

The **level sum** in the tree is the sum of the values of the nodes that are on the same level.

Return the `k`th **largest** level sum in the tree (1-indexed). If there are fewer than `k` levels in the tree, return `-1`.

**Note** that two nodes are on the same level if they have the same distance from the root.

```
Example 1:

        5
       / \
      8   9
     / \ / \
    2  1 3  7
   / \
  4   6

Input: root = [5,8,9,2,1,3,7,4,6], k = 2
Output: 13
Explanation: Level sums are [5, 17, 13, 10].
The 2nd largest level sum is 13.

Example 2:

    1
   /
  2
 /
3

Input: root = [1,2,null,3], k = 1
Output: 3
Explanation: The largest level sum is 3.

Constraints:

The number of nodes in the tree is n.
2 <= n <= 10^5
1 <= Node.val <= 10^6
1 <= k <= n
```

## Solution 1: BFS + Sort

### Idea

Perform a standard BFS level-order traversal to compute the sum of node values at each level. Collect all level sums into a list, sort it in descending order, and return the element at index `k-1`.

```
BFS traversal with level-sum accumulation:

Level 0:  [5]           → sum = 5
Level 1:  [8, 9]       → sum = 17
Level 2:  [2, 1, 3, 7] → sum = 13
Level 3:  [4, 6]       → sum = 10

Sorted descending: [17, 13, 10, 5]
k=2 → answer = 13
```

Complexity: Time $O(n + d \log d)$ where $n$ = nodes and $d$ = depth, Space $O(n)$.

#### Java

```java []
public static long kthLargestLevelSumSort(TreeNode root, int k) {
    if (root == null) return -1;
    List<Long> levelSums = new ArrayList<>();
    Queue<TreeNode> queue = new ArrayDeque<>();
    queue.add(root);
    while (!queue.isEmpty()) { // O(n) total across all levels
        int size = queue.size();
        long sum = 0;
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            sum += node.val;
            if (node.left != null) queue.add(node.left);
            if (node.right != null) queue.add(node.right);
        }
        levelSums.add(sum);
    }
    if (levelSums.size() < k) return -1;
    levelSums.sort(Collections.reverseOrder()); // O(d log d) where d = depth
    return levelSums.get(k - 1);
}
```

#### Python

```python []
def kthLargestLevelSum(self, root: Optional[TreeNode], k: int) -> int:
    if not root:
        return -1
    level_sums = []
    queue = deque([root])  # O(w) space, w = max width
    while queue:
        level_sum = 0
        for _ in range(len(queue)):  # O(n) total across all levels
            node = queue.popleft()
            level_sum += node.val
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        level_sums.append(level_sum)
    if k > len(level_sums):
        return -1
    level_sums.sort(reverse=True)  # O(d log d)
    return level_sums[k - 1]
```

#### C++

```cpp []
long long kthLargestLevelSum(TreeNode *root, int k) {
    if (!root) return -1;
    std::vector<long long> sums;
    std::queue<TreeNode *> q;
    q.push(root);
    while (!q.empty()) {
        int sz = q.size();
        long long levelSum = 0;
        for (int i = 0; i < sz; ++i) { // O(n) total
            auto *node = q.front();
            q.pop();
            levelSum += node->val;
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        sums.push_back(levelSum);
    }
    if (k > (int)sums.size()) return -1;
    std::sort(sums.begin(), sums.end(), std::greater<>()); // O(d log d)
    return sums[k - 1];
}
```

#### Rust

```rust []
pub fn kth_largest_level_sum(root: Option<Rc<RefCell<TreeNode>>>, k: i32) -> i64 {
    let mut level_sums: Vec<i64> = Vec::new();
    let mut queue: VecDeque<Rc<RefCell<TreeNode>>> = VecDeque::new(); // O(width) space
    if let Some(node) = root {
        queue.push_back(node);
    }
    while !queue.is_empty() {
        let size = queue.len();
        let mut level_sum: i64 = 0;
        for _ in 0..size { // O(n) total
            let node = queue.pop_front().unwrap();
            let n = node.borrow();
            level_sum += n.val as i64;
            if let Some(ref left) = n.left { queue.push_back(Rc::clone(left)); }
            if let Some(ref right) = n.right { queue.push_back(Rc::clone(right)); }
        }
        level_sums.push(level_sum);
    }
    if (k as usize) > level_sums.len() { return -1; }
    level_sums.sort_unstable_by(|a, b| b.cmp(a)); // O(d log d)
    level_sums[(k - 1) as usize]
}
```

## Solution 2: BFS + Min-Heap of Size k

### Idea

Instead of sorting all level sums, maintain a min-heap of size `k`. As we compute each level sum, if the heap has fewer than `k` elements, push it in. Otherwise, if the new sum is larger than the heap's minimum, replace the minimum. After traversal, the heap's minimum is the kth largest.

This is more space-efficient when $k \ll d$ (number of levels).

Complexity: Time $O(n + d \log k)$, Space $O(n)$ for BFS queue, $O(k)$ for heap.

#### Java

```java []
public static long kthLargestLevelSumHeap(TreeNode root, int k) {
    if (root == null) return -1;
    PriorityQueue<Long> minHeap = new PriorityQueue<>(); // O(k) space
    Queue<TreeNode> queue = new ArrayDeque<>();
    queue.add(root);
    int depth = 0;
    while (!queue.isEmpty()) { // O(n) total
        int size = queue.size();
        long sum = 0;
        for (int i = 0; i < size; i++) {
            TreeNode node = queue.poll();
            sum += node.val;
            if (node.left != null) queue.add(node.left);
            if (node.right != null) queue.add(node.right);
        }
        minHeap.add(sum); // O(log k)
        if (minHeap.size() > k) minHeap.poll(); // maintain size k
        depth++;
    }
    if (depth < k) return -1;
    return minHeap.peek();
}
```

#### Python

```python []
def kthLargestLevelSum(self, root: Optional[TreeNode], k: int) -> int:
    if not root:
        return -1
    heap = []  # O(k) space
    queue = deque([root])
    while queue:
        level_sum = 0
        for _ in range(len(queue)):  # O(n) total
            node = queue.popleft()
            level_sum += node.val
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        if len(heap) < k:
            heapq.heappush(heap, level_sum)  # O(log k)
        elif level_sum > heap[0]:
            heapq.heapreplace(heap, level_sum)  # O(log k)
    if len(heap) < k:
        return -1
    return heap[0]
```

#### C++

```cpp []
long long kthLargestLevelSum(TreeNode *root, int k) {
    if (!root) return -1;
    // min-heap keeps the k largest level sums
    std::priority_queue<long long, std::vector<long long>, std::greater<>> minHeap;
    std::queue<TreeNode *> q;
    q.push(root);
    int levels = 0;
    while (!q.empty()) {
        int sz = q.size();
        long long levelSum = 0;
        for (int i = 0; i < sz; ++i) { // O(n) total
            auto *node = q.front();
            q.pop();
            levelSum += node->val;
            if (node->left) q.push(node->left);
            if (node->right) q.push(node->right);
        }
        ++levels;
        minHeap.push(levelSum); // O(log k)
        if ((int)minHeap.size() > k) minHeap.pop();
    }
    if (k > levels) return -1;
    return minHeap.top();
}
```

#### Rust

```rust []
pub fn kth_largest_level_sum_heap(root: Option<Rc<RefCell<TreeNode>>>, k: i32) -> i64 {
    let k = k as usize;
    let mut heap: BinaryHeap<Reverse<i64>> = BinaryHeap::new(); // min-heap, O(k) space
    let mut queue: VecDeque<Rc<RefCell<TreeNode>>> = VecDeque::new();
    if let Some(node) = root {
        queue.push_back(node);
    }
    while !queue.is_empty() {
        let size = queue.len();
        let mut level_sum: i64 = 0;
        for _ in 0..size {
            let node = queue.pop_front().unwrap();
            let n = node.borrow();
            level_sum += n.val as i64;
            if let Some(ref left) = n.left { queue.push_back(Rc::clone(left)); }
            if let Some(ref right) = n.right { queue.push_back(Rc::clone(right)); }
        }
        if heap.len() < k {
            heap.push(Reverse(level_sum)); // O(log k)
        } else if let Some(&Reverse(min)) = heap.peek() {
            if level_sum > min {
                heap.pop();
                heap.push(Reverse(level_sum)); // O(log k)
            }
        }
    }
    if heap.len() < k { -1 } else { heap.peek().unwrap().0 }
}
```
