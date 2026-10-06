---
author: JZ
pubDatetime: 2026-10-06T19:21:57Z
modDatetime: 2026-10-06T19:21:57Z
title: LeetCode 2530 Maximal Score After Applying K Operations
featured: true
tags:
  - a-greedy
  - a-heap
description: "Solution for LeetCode 2530, medium, tags: array, greedy, heap (priority queue)."
---

## Table of contents

## Description

This explanation shows how a greedy max-heap solves [LeetCode 2530: Maximal Score After Applying K Operations](https://leetcode.com/problems/maximal-score-after-applying-k-operations/) and why the same idea works in Java, Python, C++, and Rust.

Start with an integer array `nums` and a score of zero. Each operation chooses one array element, adds its current value to the score, and replaces that element with its value divided by three, rounded upward. You may choose the same position again. Find the largest score after **exactly** `k` operations.

**Example 1:** `nums = [10,10,10,10,10]`, `k = 5` gives **50**. Take each original value once.

**Example 2:** `nums = [1,10,3,3,3]`, `k = 3` gives **17**. The best available rewards are `10`, then `4`, then `3`.

**Constraints:**

- `1 <= nums.length, k <= 10^5`
- `1 <= nums[i] <= 10^9`

## Idea

### Greedy selection with a max-heap

Take the largest current value at every step. A **max-heap** exposes that value without rescanning the whole array.

For each of the `k` operations:

1. Read or remove the maximum value.
2. Add it to the running score.
3. Replace it with `(maximum + 2) / 3`, using integer division.
4. Restore heap order before the next operation.

The heap always holds exactly one current value for each original element. Duplicate values are separate candidates, and the replacement stays available for later operations.

The following walkthrough lists values in descending order for readability; it does not show the heap's internal array layout.

```text
nums = [1,10,3,3,3], k = 3

Round   Available values    Take   Replacement   Score
  0     [10,3,3,3,1]          -         -          0
  1     [4,3,3,3,1]          10         4         10
  2     [3,3,3,2,1]           4         2         14
  3     [3,3,2,1,1]           3         1         17
```

### Why the greedy choice is optimal

Each array position generates its own sequence of rewards. Selecting that position advances only its sequence:

```text
Starting at 10:  10 -> 4 -> 2 -> 1 -> 1 -> ...
Starting at  3:   3 -> 1 -> 1 -> 1 -> 1 -> ...
```

Every sequence is nonincreasing. Its current value is therefore at least as large as every later, still-hidden reward from that position. The largest exposed value is also the largest reward remaining anywhere.

Taking that reward is legal and exposes only a value no larger than itself. Repeating this argument selects the `k` greatest available rewards while respecting the required order within each sequence. No other legal sequence of `k` choices can have a larger sum.

This also explains why reordering the heap loses no necessary information: the index does not affect how an element changes.

### Integer rounding and score width

For positive integers, upward division by three is `(value + 2) / 3` with integer division. For example, `3` becomes `1`, while both `4` and `5` become `2`. Python uses `//`; Java, C++, and Rust use integer `/`. Avoid floating-point conversion, which can round large integers incorrectly.

The maximum possible score is `100000 * 1000000000 = 100000000000000`, so Java uses `long`, C++ uses `long long`, and Rust uses `i64`. Python integers already support this range. Individual heap entries and `value + 2` fit in a signed 32-bit integer under these constraints.

One is a fixed point: replacing it produces one again. Even when every heap entry reaches one, each remaining operation still adds one because the problem requires exactly `k` operations.

### Complexity

Let `n = nums.length`.

- **Time:** $O(n + k \log n)$. All four implementations construct their heap in linear time and perform `k` logarithmic updates. For a singleton heap, each update is constant time; a bound covering that case literally is $O(n + k \log(n + 1))$.
- **Auxiliary space:** $O(n)$ for the heap. Heap size never grows beyond the original array length.

Java and Python use negative values in a min-heap. C++ and Rust use their built-in max-heap containers. These are representations of the same algorithm, not separate solutions.

The implementations include all required imports and wrapper declarations. The Java and Rust wrappers retain their existing repository visibility; for a LeetCode submission, use the corresponding `Solution` wrapper expected by the judge.

### Java

[Committed implementation](https://github.com/JesseZhuang/algorithm-java/blob/c5a0a1f6cb113ac6d764c13c26088378a0c2c7bc/src/main/java/heap/MaxScoreKOps.java)

```java []
package heap;

import java.util.Arrays;
import java.util.PriorityQueue;
import java.util.stream.Collectors;

@SuppressWarnings("unused")
public class MaxScoreKOps {
    // heap, n+klgn, n.
    static class Solution {
        public long maxKelements(int[] nums, int k) {
            // use negative values, java pq no constructor taking collection and comparator, addAll nlgn
            // or create custom reverse int class, override comparable interface
            PriorityQueue<Integer> pq = new PriorityQueue<>(
                    Arrays.stream(nums).boxed().map(i -> -i).collect(Collectors.toList()));
            long res = 0;
            while (k-- > 0) {
                int cur = -pq.remove();
                res += cur;
                pq.add(-(cur + 2) / 3);
            }
            return res;
        }
    }
}
```

### Python

[Committed implementation](https://github.com/JesseZhuang/InCodeLearning-Python3/blob/0a6d5ab55f3f16bd62d67d92490f0539ca242bfa/algorithm/heap/maximal_score_after_k_operations.py)

```python []
"""LeetCode 2530, medium. Tags: array, greedy, heap (priority queue)."""

import heapq


class Solution:
    """Greedy max-heap. O(n + k log n) time and O(n) auxiliary space."""

    def maxKelements(self, nums: list[int], operations: int) -> int:
        heap = [-value for value in nums]
        heapq.heapify(heap)  # O(n) heap construction.
        score = 0

        for _ in range(operations):  # O(k) rounds, O(log n) per replacement.
            maximum = -heap[0]
            score += maximum
            heapq.heapreplace(heap, -((maximum + 2) // 3))

        return score
```

### C++

[Committed implementation](https://github.com/JesseZhuang/CSAPP/blob/a4edba994c342138a90b0cf7ad364462e54b95ef/leetcode/src/heap/MaximalScoreAfterApplyingKOperations.hpp)

```cpp []
#pragma once

#include <queue>
#include <vector>

using namespace std;

class Solution {
public:
    long long maxKelements(const vector<int>& numbers, int operationCount) {
        priority_queue<int> maxHeap(numbers.begin(), numbers.end());
        long long score = 0;

        for (int operation = 0; operation < operationCount; ++operation) {
            const int maximum = maxHeap.top();
            score += maximum;
            maxHeap.pop();
            maxHeap.push((maximum + 2) / 3);
        }

        return score;
    }
};
```

### Rust

[Committed implementation](https://github.com/JesseZhuang/in_code_learning_rust/blob/395edc5ced49753d17249ddccb5facee9d2970f4/crates/leet/src/heap/max_score_k_ops.rs)

```rust []
// lc 2530

use std::collections::BinaryHeap;

impl Solution {
    // credit @sunjesse
    pub fn max_kelements(nums: Vec<i32>, k: i32) -> i64 {
        let mut heap = BinaryHeap::from(nums);
        let mut res = 0;
        for _ in 0..k {
            let cur = heap.pop().unwrap();
            res += cur as i64;
            // f32 rounding error [756902131,995414896,95906472,149914376,387433380,848985151], k=6
            heap.push((cur + 2) / 3);
        }
        res
    }
}

struct Solution;
```

## Tests

Focused tests cover both examples, ceiling division for every possible remainder, changes in heap order, exactly `k` operations after reaching one, 64-bit score accumulation, and maximum input and operation counts. Java and Python also compare the heap solution with exhaustive optimal searches on small arrays. The Java, Python, and C++ tests verify that the caller's input is unchanged; Rust takes ownership of its input vector.

- [Java tests](https://github.com/JesseZhuang/algorithm-java/blob/c5a0a1f6cb113ac6d764c13c26088378a0c2c7bc/src/test/java/heap/MaxScoreKOpsTest.java)
- [Python tests](https://github.com/JesseZhuang/InCodeLearning-Python3/blob/0a6d5ab55f3f16bd62d67d92490f0539ca242bfa/test/test_maximal_score_after_k_operations.py)
- [C++ tests](https://github.com/JesseZhuang/CSAPP/blob/a4edba994c342138a90b0cf7ad364462e54b95ef/leetcode/test/heap/MaximalScoreAfterApplyingKOperationsTest.cpp)
- [Rust tests](https://github.com/JesseZhuang/in_code_learning_rust/blob/395edc5ced49753d17249ddccb5facee9d2970f4/crates/leet/src/heap/max_score_k_ops.rs)
