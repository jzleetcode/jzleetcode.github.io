---
author: JZ
pubDatetime: 2026-10-01T00:15:26Z
modDatetime: 2026-10-01T00:15:26Z
title: LeetCode 3066 Minimum Operations to Exceed Threshold Value II
featured: true
tags:
  - a-heap
  - a-greedy
description: "A min-heap simulation that repeatedly combines the two smallest values, with overflow-safe implementations in four languages."
---

## Table of contents

## Description

Question Link: [LeetCode 3066](https://leetcode.com/problems/minimum-operations-to-exceed-threshold-value-ii/)

Each operation takes the two smallest values, `x` and `y`, and inserts `2 * min(x, y) + max(x, y)`. Find the minimum number of operations needed until every value is at least `k`.

For example, `nums = [2, 11, 10, 1, 3]` and `k = 10` takes two operations: combine `1` with `2` to make `4`, then combine `3` with `4` to make `10`. The remaining values are already at least `10`.

The constraints are: the array length is between `2` and `200,000`; each value and `k` are between `1` and `1,000,000,000`; and the input always allows a solution.

## Idea

The operation always selects the two smallest values, so a min-heap gives us exactly the values we need without sorting the whole array after every operation.

1. Put every value into a min-heap.
2. While the smallest value is below `k`, remove the two smallest values, combine them, and insert the result back.
3. Stop once the heap minimum reaches `k`. Since it is the minimum, all remaining values meet the threshold too.

For `nums = [1, 1, 2, 4, 9]` and `k = 20`, the heap evolves as follows:

```text
[1, 1, 2, 4, 9]  -- combine 1 and 1 --> [2, 3, 4, 9]
[2, 3, 4, 9]     -- combine 2 and 3 --> [4, 7, 9]
[4, 7, 9]        -- combine 4 and 7 --> [9, 15]
[9, 15]          -- combine 9 and 15 -> [33]
```

At that point the only remaining value, `33`, is at least `20`, so the answer is `4`.

The initial heap contains `n` values. Each operation shrinks it by one, so there are at most `n - 1` operations. Each pop and push costs `O(log n)`, giving `O(n log n)` time and `O(n)` heap space. The Python version heapifies the input list in place; Java, C++, and Rust keep the heap separately.

The combined values can exceed the 32-bit signed integer range even though every input value is at most `1,000,000,000`. The Java, C++, and Rust solutions therefore store heap values as 64-bit integers.

The APIs differ slightly by language: Python uses `heapify`, `heappop`, and `heappush`; Java's `PriorityQueue` provides `peek`, `poll`, and `offer`; C++ needs `greater<>` because `priority_queue` is a max-heap by default; Rust uses `Reverse` to make `BinaryHeap` behave as a min-heap.

### Java

```java []
import java.util.PriorityQueue;

public final class MinOperationsExceedThresholdII {
    private MinOperationsExceedThresholdII() {
    }

    // O(n log n) time, O(n) space.
    public static int minOperations(int[] nums, int k) {
        PriorityQueue<Long> minHeap = new PriorityQueue<>();
        for (int num : nums) {
            minHeap.offer((long) num); // O(log n)
        }

        int operations = 0;
        while (minHeap.peek() < k) {
            long first = minHeap.poll(); // O(log n)
            long second = minHeap.poll(); // O(log n)
            minHeap.offer(2 * first + second); // O(log n)
            operations++;
        }
        return operations;
    }
}
```

### Python

```python []
"""leet 3066, medium"""
import heapq


class Solution:
    """Min-heap solution, O(n log n) time and O(n) space."""

    def minOperations(self, nums: list[int], k: int) -> int:
        heapq.heapify(nums)  # O(n)

        num_operations = 0
        while nums[0] < k:
            x = heapq.heappop(nums)  # O(log n)
            y = heapq.heappop(nums)  # O(log n)
            heapq.heappush(nums, min(x, y) * 2 + max(x, y))  # O(log n)

            num_operations += 1

        return num_operations
```

### C++

```cpp []
#include <functional>
#include <queue>
#include <vector>

using namespace std;

// Min-heap simulation: O(n log n) time, O(n) space.
class Solution {
public:
    int minOperations(vector<int>& nums, int k) {
        priority_queue<long long, vector<long long>, greater<>> minHeap;
        for (int num : nums) {
            minHeap.push(num);
        }

        int operations = 0;
        while (minHeap.top() < k) {
            long long x = minHeap.top();
            minHeap.pop();
            long long y = minHeap.top();
            minHeap.pop();
            minHeap.push(2 * x + y);
            ++operations;
        }
        return operations;
    }
};
```

### Rust

```rust []
use std::cmp::Reverse;
use std::collections::BinaryHeap;

pub struct Solution;

impl Solution {
    /// Uses a min-heap. O(n log n) time and O(n) space.
    pub fn min_operations(nums: Vec<i32>, k: i32) -> i32 {
        let mut values: BinaryHeap<Reverse<i64>> = nums
            .into_iter()
            .map(|value| Reverse(i64::from(value)))
            .collect();
        let threshold = i64::from(k);
        let mut operations = 0;

        while values.peek().unwrap().0 < threshold {
            let Reverse(x) = values.pop().unwrap();
            let Reverse(y) = values.pop().unwrap();
            values.push(Reverse(2 * x + y));
            operations += 1;
        }

        operations
    }
}
```
