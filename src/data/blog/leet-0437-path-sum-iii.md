---
author: JZ
pubDatetime: 2026-07-23T06:00:00Z
modDatetime: 2026-07-23T06:00:00Z
title: LeetCode 437 Path Sum III
featured: true
tags:
  - a-tree
  - a-dfs
  - a-prefix-sum
  - a-hash-table
description:
  "Solutions for LeetCode 437, medium, tags: tree, depth-first search, binary tree, prefix sum, hash table."
---

## Table of contents

## Description

Question Links: [LeetCode 437](https://leetcode.com/problems/path-sum-iii/description/)

Given the `root` of a binary tree and an integer `targetSum`, return _the number of paths where the sum of the values along the path equals_ `targetSum`.

The path does not need to start or end at the root or a leaf, but it must go downwards (i.e., traveling only from parent nodes to child nodes).

**Constraints:**

- The number of nodes in the tree is in the range `[0, 1000]`.
- $-10^9 \le$ `Node.val` $\le 10^9$
- $-1000 \le$ `targetSum` $\le 1000$

```
Example 1:

         10
        /  \
       5   -3
      / \    \
     3   2    11
    / \   \
   3  -2   1

Input: root = [10,5,-3,3,2,null,11,3,-2,null,1], targetSum = 8
Output: 3
Explanation: The paths that sum to 8 are:
  5 -> 3
  5 -> 2 -> 1
  -3 -> 11

Example 2:
Input: root = [5,4,8,11,null,13,4,7,2,null,null,5,1], targetSum = 22
Output: 3
```

## Idea1: DFS + Prefix Sum HashMap

The key insight is: if we track the cumulative sum from root to the current node, then the number of valid paths ending at the current node is the number of ancestors whose prefix sum equals `currentSum - targetSum`.

We maintain a HashMap mapping each prefix sum to its frequency. As we DFS through the tree, we:
1. Add the current node's value to the running sum.
2. Look up `currentSum - targetSum` in the map — that's how many valid paths end here.
3. Add `currentSum` to the map, recurse into children, then **backtrack** (remove from map).

```
         10  (prefixSum=10)
        /
       5    (prefixSum=15)
      /
     3      (prefixSum=18)

For target=8:
  At node 3: prefixSum=18, look up 18-8=10 → found (root), so path 5->3 works.
```

Complexity: Time $O(n)$ — visit each node once. Space $O(n)$ — HashMap + recursion stack (up to tree height).

### Java

```java []
public static int pathSum(TreeNode root, int targetSum) {
    Map<Long, Integer> prefixSumCount = new HashMap<>();
    prefixSumCount.put(0L, 1); // empty prefix
    return dfs(root, 0L, targetSum, prefixSumCount);
}

private static int dfs(TreeNode node, long currentSum, int target, Map<Long, Integer> prefixSumCount) {
    if (node == null) return 0;

    currentSum += node.val;
    // Number of paths ending at this node with sum == target
    int count = prefixSumCount.getOrDefault(currentSum - target, 0);

    // Add current prefix sum to map
    prefixSumCount.merge(currentSum, 1, Integer::sum);

    // Recurse into children
    count += dfs(node.left, currentSum, target, prefixSumCount);
    count += dfs(node.right, currentSum, target, prefixSumCount);

    // Backtrack: remove current prefix sum
    prefixSumCount.merge(currentSum, -1, Integer::sum);

    return count;
}
```

### Python

```python []
class Solution:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        prefix_counts = defaultdict(int)
        prefix_counts[0] = 1
        self.result = 0

        def dfs(node, curr_sum):
            if not node:
                return
            curr_sum += node.val  # O(1) per node
            self.result += prefix_counts[curr_sum - targetSum]  # O(1) lookup
            prefix_counts[curr_sum] += 1
            dfs(node.left, curr_sum)  # O(n) total across all nodes
            dfs(node.right, curr_sum)
            prefix_counts[curr_sum] -= 1  # backtrack

        dfs(root, 0)
        return self.result
```

### C++

```cpp []
class Solution437 {
public:
    int pathSum(TreeNode* root, int targetSum) {
        std::unordered_map<long long, int> prefixCount;
        prefixCount[0] = 1;
        int count = 0;
        dfs(root, 0LL, static_cast<long long>(targetSum), prefixCount, count);
        return count;
    }

private:
    void dfs(TreeNode* node, long long currSum, long long target,
             std::unordered_map<long long, int>& prefixCount, int& count) {
        if (!node) return;
        currSum += node->val;
        auto it = prefixCount.find(currSum - target);
        if (it != prefixCount.end()) {
            count += it->second;
        }
        prefixCount[currSum]++;
        dfs(node->left, currSum, target, prefixCount, count);
        dfs(node->right, currSum, target, prefixCount, count);
        prefixCount[currSum]--; // backtrack
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn path_sum(root: TreeLink, target_sum: i32) -> i32 {
        let mut prefix_map: HashMap<i64, i32> = HashMap::new();
        prefix_map.insert(0, 1);
        Self::dfs_prefix(&root, 0, target_sum as i64, &mut prefix_map)
    }

    fn dfs_prefix(
        node: &TreeLink, curr_sum: i64, target: i64,
        prefix_map: &mut HashMap<i64, i32>,
    ) -> i32 {
        let Some(n) = node else { return 0 };
        let n = n.borrow();
        let curr_sum = curr_sum + n.val as i64;
        let mut count = *prefix_map.get(&(curr_sum - target)).unwrap_or(&0);

        *prefix_map.entry(curr_sum).or_insert(0) += 1;
        count += Self::dfs_prefix(&n.left, curr_sum, target, prefix_map);
        count += Self::dfs_prefix(&n.right, curr_sum, target, prefix_map);
        *prefix_map.get_mut(&curr_sum).unwrap() -= 1;

        count
    }
}
```

## Idea2: Double DFS (Brute Force)

For each node, start a DFS counting all downward paths from it that sum to `targetSum`. Then recurse on left and right subtrees to try every possible starting node.

- Outer DFS: tries each node as a starting point — $O(n)$ nodes.
- Inner DFS: from each starting node, explores all paths downward — $O(n)$ in the worst case (skewed tree).

Complexity: Time $O(n^2)$ worst case (skewed tree), $O(n \log n)$ for balanced trees. Space $O(n)$ — recursion stack.

### Java

```java []
public static int pathSum2(TreeNode root, int targetSum) {
    if (root == null) return 0;
    return countFrom(root, targetSum, 0L)
            + pathSum2(root.left, targetSum)
            + pathSum2(root.right, targetSum);
}

private static int countFrom(TreeNode node, int target, long currentSum) {
    if (node == null) return 0;
    currentSum += node.val;
    int count = (currentSum == target) ? 1 : 0;
    count += countFrom(node.left, target, currentSum);
    count += countFrom(node.right, target, currentSum);
    return count;
}
```

### Python

```python []
class Solution2:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        if not root:
            return 0
        return (self._count(root, targetSum)  # O(n) for each starting node
                + self.pathSum(root.left, targetSum)  # O(n) calls total
                + self.pathSum(root.right, targetSum))

    def _count(self, node, remaining):
        if not node:
            return 0
        count = 1 if node.val == remaining else 0
        count += self._count(node.left, remaining - node.val)
        count += self._count(node.right, remaining - node.val)
        return count
```

### C++

```cpp []
class Solution437_BruteForce {
public:
    int pathSum(TreeNode* root, int targetSum) {
        if (!root) return 0;
        return countFrom(root, static_cast<long long>(targetSum)) +
               pathSum(root->left, targetSum) +
               pathSum(root->right, targetSum);
    }

private:
    int countFrom(TreeNode* node, long long remaining) {
        if (!node) return 0;
        int count = (node->val == remaining) ? 1 : 0;
        count += countFrom(node->left, remaining - node->val);
        count += countFrom(node->right, remaining - node->val);
        return count;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn path_sum_brute(root: TreeLink, target_sum: i32) -> i32 {
        let Some(n) = root else { return 0 };
        let nb = n.borrow();
        Self::count_from(&Some(n.clone()), target_sum as i64)
            + Self::path_sum_brute(nb.left.clone(), target_sum)
            + Self::path_sum_brute(nb.right.clone(), target_sum)
    }

    fn count_from(node: &TreeLink, target: i64) -> i32 {
        let Some(n) = node else { return 0 };
        let n = n.borrow();
        let remaining = target - n.val as i64;
        let mut count = if remaining == 0 { 1 } else { 0 };
        count += Self::count_from(&n.left, remaining);
        count += Self::count_from(&n.right, remaining);
        count
    }
}
```
