---
author: JZ
pubDatetime: 2026-08-19T10:00:00Z
modDatetime: 2026-08-19T10:00:00Z
title: LeetCode 45 Jump Game II
featured: true
tags:
  - a-greedy
  - a-array
description:
  "Solutions for LeetCode 45, medium, tags: array, dynamic programming, greedy."
---

## Table of contents

## Description

You are given a 0-indexed array of integers `nums` of length `n`. You are initially positioned at `nums[0]`.

Each element `nums[i]` represents the maximum length of a forward jump from index `i`. In other words, if you are at `nums[i]`, you can jump to any `nums[i + j]` where `0 <= j <= nums[i]` and `i + j < n`.

Return the minimum number of jumps to reach `nums[n - 1]`. The test cases are generated such that you can reach `nums[n - 1]`.

**Example 1:**

> Input: nums = [2,3,1,1,4]
> Output: 2
> Explanation: The minimum number of jumps to reach the last index is 2. Jump 1 step from index 0 to 1, then 3 steps to the last index.

**Example 2:**

> Input: nums = [2,3,0,1,4]
> Output: 2

**Constraints:**

- `1 <= nums.length <= 10^4`
- `0 <= nums[i] <= 1000`
- It's guaranteed that you can reach `nums[n - 1]`.

[LeetCode 45](https://leetcode.com/problems/jump-game-ii/)

## Idea

### Solution 1: Greedy

We maintain `reach` (farthest reachable from positions seen so far) and `p` (the boundary of the current jump). When index `i` reaches `p`, we must take one more jump and set `p = reach`.

```
index:   0   1   2   3   4
nums:   [2,  3,  1,  1,  4]

i=0: reach=max(0,0+2)=2, i==p(0) → jump! res=1, p=2
i=1: reach=max(2,1+3)=4, i!=p
i=2: reach=max(4,2+1)=4, i==p(2) → jump! res=2, p=4
p >= n-1, done. Answer: 2
```

Complexity: Time $O(n)$ — single pass. Space $O(1)$.

### Solution 2: BFS Level-Order

Think of indices as nodes in a graph. From index `i`, edges go to `i+1, i+2, ..., i+nums[i]`. The minimum jumps is the shortest path from 0 to n-1, computed via BFS. Each "level" is one jump. We track `curEnd` (end of current BFS level) and `nxtEnd` (farthest reachable in next level).

```
Level 0: index 0         → can reach indices 1,2     (nxtEnd=2)
Level 1: indices 1,2     → can reach indices 2,3,4   (nxtEnd=4)
4 >= n-1, done at level 2.
```

Complexity: Time $O(n)$ — single pass. Space $O(1)$.

### Java

```java []
public class JumpGameII {
    // Greedy, O(n) time, O(1) space, 2ms, 45.19Mb.
    public int minJumps(int[] nums) {
        int res = 0;
        for (int i = 0, reach = 0, p = 0; p < nums.length - 1; i++) { // O(n)
            reach = Math.max(reach, nums[i] + i);
            if (i == p) {
                res++;
                p = reach;
            }
        }
        return res;
    }
}
```

### Python

```python []
class Solution:
    """Greedy. O(n) time, O(1) space."""

    def jump(self, nums: list[int]) -> int:
        i, p, reach, res = 0, 0, 0, 0
        while p < len(nums) - 1:  # O(n)
            reach = max(reach, i + nums[i])
            if i == p:
                p = reach
                res += 1
            i += 1
        return res


class Solution2:
    """BFS level-order. O(n) time, O(1) space."""

    def jump(self, nums: list[int]) -> int:
        n = len(nums)
        if n <= 1:
            return 0
        level, cur_end, nxt_end = 0, 0, 0
        for i in range(n - 1):  # O(n)
            nxt_end = max(nxt_end, i + nums[i])
            if i == cur_end:
                level += 1
                cur_end = nxt_end
                if cur_end >= n - 1:
                    break
        return level
```

### C++

```cpp []
class JumpGameII {
public:
    // Greedy, O(n) time, O(1) space.
    int jump(vector<int>& nums) {
        int res = 0, reach = 0, p = 0;
        for (int i = 0; p < (int)nums.size() - 1; i++) { // O(n)
            reach = max(reach, nums[i] + i);
            if (i == p) {
                res++;
                p = reach;
            }
        }
        return res;
    }

    // BFS level-order, O(n) time, O(1) space.
    int jumpBFS(vector<int>& nums) {
        int n = nums.size();
        if (n <= 1) return 0;
        int level = 0, curEnd = 0, nxtEnd = 0;
        for (int i = 0; i < n - 1; i++) { // O(n)
            nxtEnd = max(nxtEnd, i + nums[i]);
            if (i == curEnd) {
                level++;
                curEnd = nxtEnd;
                if (curEnd >= n - 1) break;
            }
        }
        return level;
    }
};
```

### Rust

```rust []
use std::cmp::max;

impl Solution {
    /// Greedy. O(n) time, O(1) space.
    pub fn jump(nums: Vec<i32>) -> i32 {
        let (mut res, mut reach, mut p) = (0i32, 0usize, 0usize);
        let mut i = 0usize;
        while p < nums.len() - 1 { // O(n)
            reach = max(reach, i + nums[i] as usize);
            if i == p {
                res += 1;
                p = reach;
            }
            i += 1;
        }
        res
    }

    /// BFS level-order. O(n) time, O(1) space.
    pub fn jump_bfs(nums: Vec<i32>) -> i32 {
        let n = nums.len();
        if n <= 1 { return 0; }
        let (mut level, mut cur_end, mut nxt_end) = (0i32, 0usize, 0usize);
        for i in 0..n - 1 { // O(n)
            nxt_end = max(nxt_end, i + nums[i] as usize);
            if i == cur_end {
                level += 1;
                cur_end = nxt_end;
                if cur_end >= n - 1 { break; }
            }
        }
        level
    }
}
```
