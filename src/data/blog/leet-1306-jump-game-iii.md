---
author: JZ
pubDatetime: 2026-11-24T20:06:14Z
modDatetime: 2026-11-24T20:06:14Z
title: LeetCode 1306 Jump Game III
featured: true
tags:
  - a-bfs
  - a-dfs
  - a-graph
  - a-array
description: "Solutions for LeetCode 1306, medium: breadth-first and iterative depth-first search on an implicit graph of array indices."
---

## Table of contents

## Description

Question Link: [LeetCode 1306: Jump Game III](https://leetcode.com/problems/jump-game-iii/description/)

You are given an array of non-negative integers `arr` and a starting index `start`. From an index `i`, you may jump to `i + arr[i]` or `i - arr[i]`. A jump is allowed only when its destination is inside the array. Return `true` if some sequence of jumps reaches an index whose value is `0`; otherwise, return `false`.

```text
Example 1:
Input: arr = [4,2,3,0,3,1,2], start = 5
Output: true
Explanation: 5 -> 4 -> 1 -> 3. The value at index 3 is 0.

Example 2:
Input: arr = [4,2,3,0,3,1,2], start = 0
Output: true

Example 3:
Input: arr = [3,0,2,1,2], start = 2
Output: false
```

**Constraints:**

- `1 <= arr.length <= 5 * 10^4`
- `0 <= arr[i] < arr.length`
- `0 <= start < arr.length`

## Idea

Treat every array index as a vertex in an implicit graph. From index `i`, the only possible neighbors are `i - arr[i]` and `i + arr[i]`; discard a neighbor when it falls outside the array. The answer is true if a traversal from `start` visits an index whose value is zero.

For example, starting at index `5` in Example 1, the jumps can visit `4`, then `1`, then `3`, where `arr[3] == 0`.

Use a `visited` set or array to add each valid index to the frontier at most once. This is necessary because jumps can lead back to earlier indices and form cycles. Breadth-first search stores pending indices in a queue; iterative depth-first search uses a stack. Both visit at most `n` indices and examine at most two jumps per index.

Complexity for either method: Time $O(n)$; Space $O(n)$ for the visited structure and traversal frontier.

### Java

```java []
package graph;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Queue;

/** LeetCode 1306, medium. Reach a zero by jumping left or right from the current index. */
public final class JumpGameIII {
    private JumpGameIII() {}

    /** Breadth-first search. O(n) time and O(n) space. */
    public static boolean canReach(int[] arr, int start) {
        boolean[] visited = new boolean[arr.length];
        Queue<Integer> queue = new ArrayDeque<>();
        queue.add(start);
        visited[start] = true;

        while (!queue.isEmpty()) {
            int index = queue.remove();
            int jump = arr[index];
            if (jump == 0) {
                return true;
            }

            int left = index - jump;
            if (left >= 0 && !visited[left]) {
                visited[left] = true;
                queue.add(left);
            }
            int right = index + jump;
            if (right < arr.length && !visited[right]) {
                visited[right] = true;
                queue.add(right);
            }
        }
        return false;
    }

    /** Iterative depth-first search. O(n) time and O(n) space. */
    public static boolean canReachDFS(int[] arr, int start) {
        boolean[] visited = new boolean[arr.length];
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);
        visited[start] = true;

        while (!stack.isEmpty()) {
            int index = stack.pop();
            int jump = arr[index];
            if (jump == 0) {
                return true;
            }

            int left = index - jump;
            if (left >= 0 && !visited[left]) {
                visited[left] = true;
                stack.push(left);
            }
            int right = index + jump;
            if (right < arr.length && !visited[right]) {
                visited[right] = true;
                stack.push(right);
            }
        }
        return false;
    }
}
```

### Python

```python []
"""LeetCode 1306, medium, tags: array, graph, bfs, dfs."""

from collections import deque


class Solution:
    """BFS. O(n) time and O(n) space."""

    def canReach(self, arr: list[int], start: int) -> bool:
        n = len(arr)
        visited = {start}
        queue = deque([start])
        while queue:  # Each index is queued once: O(n) total work.
            index = queue.popleft()
            if arr[index] == 0:
                return True
            for neighbor in (index + arr[index], index - arr[index]):
                if 0 <= neighbor < n and neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return False


class Solution2:
    """Iterative DFS. O(n) time and O(n) space."""

    def canReach(self, arr: list[int], start: int) -> bool:
        n = len(arr)
        visited = {start}
        stack = [start]
        while stack:  # Each index is pushed once: O(n) total work.
            index = stack.pop()
            if arr[index] == 0:
                return True
            for neighbor in (index + arr[index], index - arr[index]):
                if 0 <= neighbor < n and neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        return False
```

### C++

```cpp []
#pragma once

#include <initializer_list>
#include <queue>
#include <stack>
#include <vector>

class Solution1306BFS {
public:
    // BFS. O(n) time and O(n) space since each index is enqueued at most once.
    bool canReach(std::vector<int>& arr, int start) {
        const int n = static_cast<int>(arr.size());
        std::vector<bool> visited(n);
        std::queue<int> pending;
        visited[start] = true;
        pending.push(start);

        while (!pending.empty()) {
            const int index = pending.front();
            pending.pop();
            const int jump = arr[index];
            if (jump == 0) return true;

            for (int next : {index + jump, index - jump}) {
                if (0 <= next && next < n && !visited[next]) {
                    visited[next] = true;
                    pending.push(next);
                }
            }
        }
        return false;
    }
};

class Solution1306DFS {
public:
    // Iterative DFS. O(n) time and O(n) space since each index is pushed at most once.
    bool canReach(std::vector<int>& arr, int start) {
        const int n = static_cast<int>(arr.size());
        std::vector<bool> visited(n);
        std::stack<int> pending;
        visited[start] = true;
        pending.push(start);

        while (!pending.empty()) {
            const int index = pending.top();
            pending.pop();
            const int jump = arr[index];
            if (jump == 0) return true;

            for (int next : {index + jump, index - jump}) {
                if (0 <= next && next < n && !visited[next]) {
                    visited[next] = true;
                    pending.push(next);
                }
            }
        }
        return false;
    }
};
```

### Rust

```rust []
use std::collections::VecDeque;

pub struct Solution;

impl Solution {
    /// Breadth-first search takes O(n) time and O(n) space.
    pub fn can_reach(arr: Vec<i32>, start: i32) -> bool {
        let indices = 0..arr.len() as i32;
        let mut visited = vec![false; arr.len()];
        let mut queue = VecDeque::from([start]);
        visited[start as usize] = true;

        while let Some(index) = queue.pop_front() {
            let jump = arr[index as usize];
            if jump == 0 {
                return true;
            }
            for next in [index - jump, index + jump] {
                if indices.contains(&next) && !visited[next as usize] {
                    visited[next as usize] = true;
                    queue.push_back(next);
                }
            }
        }
        false
    }
}

pub struct Solution2;

impl Solution2 {
    /// Iterative depth-first search takes O(n) time and O(n) space.
    pub fn can_reach(arr: Vec<i32>, start: i32) -> bool {
        let indices = 0..arr.len() as i32;
        let mut visited = vec![false; arr.len()];
        let mut stack = vec![start];
        visited[start as usize] = true;

        while let Some(index) = stack.pop() {
            let jump = arr[index as usize];
            if jump == 0 {
                return true;
            }
            for next in [index - jump, index + jump] {
                if indices.contains(&next) && !visited[next as usize] {
                    visited[next as usize] = true;
                    stack.push(next);
                }
            }
        }
        false
    }
}
```
