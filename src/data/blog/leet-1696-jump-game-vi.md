---
author: JZ
pubDatetime: 2026-10-18T19:45:21Z
modDatetime: 2026-10-18T19:45:21Z
title: LeetCode 1696 Jump Game VI
featured: true
tags:
  - a-array
  - a-dynamic-programming
  - a-monotonic-queue
  - a-heap
description: "Solutions for LeetCode 1696, medium, tags: array, dynamic programming, sliding window, monotonic queue, heap."
---

## Table of contents

## Description

Question Link: [LeetCode 1696](https://leetcode.com/problems/jump-game-vi/description/)

Starting at index `0` of `nums`, jump forward by **at most** `k` positions at a time until you reach the last index. Your score is the sum of the values at every visited index. Return the maximum possible score.

For example, with `nums = [1, -1, -2, 4, -7, 3]` and `k = 2`, visiting indices `0 → 1 → 3 → 5` scores `1 - 1 + 4 + 3 = 7`.

**Constraints:**

- $1 \leq \text{nums.length}, k \leq 10^5$
- $-10^4 \leq \text{nums}[i] \leq 10^4$

## Idea 1: DP with a Monotonic Deque

Let $dp[i]$ be the best score upon landing at index $i$. Every possible previous landing position lies in the last $k$ indices:

$$dp[0] = \text{nums}[0], \qquad dp[i] = \text{nums}[i] + \max_{\max(0, i-k) \leq j < i} dp[j].$$

Keep eligible indices in a deque in **decreasing DP-score order**. Before processing `i`, remove expired indices from the front. The front then holds the largest eligible score. After calculating `dp[i]`, remove scores no larger than it from the back: the new index is at least as good and remains eligible for longer.

```text
nums:   [ 1, -1, -2,  4, -7,  3 ]     k = 2
dp:     [ 1,  0, -1,  4, -3,  7 ]
                          i = 5
eligible previous indices: 3 and 4
best previous score: dp[3] = 4
dp[5] = nums[5] + dp[3] = 3 + 4 = 7
```

Each index enters the deque once and can leave it at most once, so the nested `while` loops cost $O(n)$ **in total**. Time: $O(n)$. Space: $O(n)$ with a separate DP array (Java/C++), or $O(k)$ additional space when storing scores in the deque (Python) or updating the owned input (Rust).

## Idea 2: DP with a Max-Heap

Instead of maintaining the deque's ordering, put `(score, index)` pairs in a max-heap. Remove expired elements **when they reach the top**. The remaining top is the largest score among the last `k` indices. Expired entries deeper in the heap cannot affect the answer; they are removed if they later reach the top.

There are at most $n$ insertions and $n$ removals, each costing $O(\log n)$. Time: $O(n \log n)$. Space: $O(n)$, because lazy expiration can retain old entries. This is an alternative data structure for the same recurrence, not a different scoring rule.

## Java

```java []
package dp;

import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.PriorityQueue;

/**
 * LeetCode 1696, Jump Game VI: maximize the score when jumping up to k positions forward.
 */
public final class JumpGameVI {
    private JumpGameVI() {
    }

    /** O(n) time and O(n) space. */
    public static int maxResultDeque(int[] nums, int k) {
        int[] best = new int[nums.length];
        best[0] = nums[0];
        Deque<Integer> candidates = new ArrayDeque<>();
        candidates.addLast(0);

        for (int index = 1; index < nums.length; index++) {
            while (!candidates.isEmpty() && candidates.peekFirst() < index - k) {
                candidates.removeFirst();
            }
            best[index] = nums[index] + best[candidates.peekFirst()];
            while (!candidates.isEmpty() && best[candidates.peekLast()] <= best[index]) {
                candidates.removeLast();
            }
            candidates.addLast(index);
        }
        return best[nums.length - 1];
    }

    /** O(n log n) time and O(n) space. */
    public static int maxResultPriorityQueue(int[] nums, int k) {
        PriorityQueue<int[]> candidates = new PriorityQueue<>(
                Comparator.<int[]>comparingInt(candidate -> candidate[0]).reversed());
        candidates.add(new int[]{nums[0], 0});

        int best = nums[0];
        for (int index = 1; index < nums.length; index++) {
            while (candidates.peek()[1] < index - k) {
                candidates.remove();
            }
            best = nums[index] + candidates.peek()[0];
            candidates.add(new int[]{best, index});
        }
        return best;
    }
}
```

## Python

```python []
"""LeetCode 1696, medium: dynamic programming with a sliding maximum."""

from collections import deque
from heapq import heappop, heappush


class Solution:
    """Monotonic deque, O(n) time and O(k) auxiliary space."""

    def maxResult(self, nums: list[int], k: int) -> int:
        candidates = deque([(0, nums[0])])
        score = nums[0]

        for index in range(1, len(nums)):  # O(n) indices are added once.
            while candidates[0][0] < index - k:
                candidates.popleft()
            score = nums[index] + candidates[0][1]
            while candidates and candidates[-1][1] <= score:
                candidates.pop()  # O(n) total removals across the outer loop.
            candidates.append((index, score))

        return score


class Solution2:
    """Max-heap with lazy expiry, O(n log n) time and O(n) space."""

    def maxResult(self, nums: list[int], k: int) -> int:
        candidates = [(-nums[0], 0)]
        score = nums[0]

        for index in range(1, len(nums)):  # O(n) heap pushes and pops in total.
            while candidates[0][1] < index - k:
                heappop(candidates)
            score = nums[index] - candidates[0][0]
            heappush(candidates, (-score, index))  # O(log n) per heap operation.

        return score
```

## C++

```cpp []
#pragma once

#include <deque>
#include <queue>
#include <utility>
#include <vector>

using namespace std;

class JumpGameVI {
public:
    // O(n) time: each index enters and leaves the deque once; O(n) space for DP.
    int maxResult(const vector<int>& nums, int k) {
        vector<int> dp(nums.size());
        deque<int> candidates;
        dp[0] = nums[0];
        candidates.push_back(0);

        for (int index = 1; index < (int)nums.size(); ++index) {
            while (candidates.front() < index - k) candidates.pop_front();
            dp[index] = nums[index] + dp[candidates.front()];
            while (!candidates.empty() && dp[candidates.back()] <= dp[index]) {
                candidates.pop_back();
            }
            candidates.push_back(index);
        }

        return dp.back();
    }

    // O(n log n) time for heap operations, O(n) space with lazy expiry.
    int maxResultHeap(const vector<int>& nums, int k) {
        priority_queue<pair<int, int>> candidates;
        candidates.emplace(nums[0], 0);
        int score = nums[0];

        for (int index = 1; index < (int)nums.size(); ++index) {
            while (candidates.top().second < index - k) candidates.pop();
            score = nums[index] + candidates.top().first;
            candidates.emplace(score, index);
        }

        return score;
    }
};
```

## Rust

```rust []
use std::collections::{BinaryHeap, VecDeque};

pub struct Solution;

impl Solution {
    /// O(n) time, O(k) extra space; reuses the input for DP scores.
    pub fn max_result(mut nums: Vec<i32>, k: i32) -> i32 {
        let k = k as usize;
        let mut deque = VecDeque::new();
        deque.push_back(0usize);

        for index in 1..nums.len() {
            while deque.front().is_some_and(|&front| front + k < index) {
                deque.pop_front();
            }

            nums[index] += nums[*deque.front().unwrap()];
            while deque.back().is_some_and(|&back| nums[back] <= nums[index]) {
                deque.pop_back();
            }
            deque.push_back(index);
        }

        *nums.last().unwrap()
    }

    /// O(n log n) time, O(n) extra space with lazy heap expiry.
    pub fn max_result_heap(nums: Vec<i32>, k: i32) -> i32 {
        let k = k as usize;
        let mut heap = BinaryHeap::new();
        heap.push((nums[0], 0usize));
        let mut score = nums[0];

        for (index, &value) in nums.iter().enumerate().skip(1) {
            while heap
                .peek()
                .is_some_and(|&(_, previous)| previous + k < index)
            {
                heap.pop();
            }

            score = value + heap.peek().unwrap().0;
            heap.push((score, index));
        }

        score
    }
}
```
