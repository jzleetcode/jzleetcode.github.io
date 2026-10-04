---
author: JZ
pubDatetime: 2026-10-04T12:00:00Z
modDatetime: 2026-10-04T12:00:00Z
title: LeetCode 2602 Minimum Operations to Make All Array Elements Equal
featured: true
tags:
  - a-array
  - a-binary-search
  - a-prefix-sum
  - a-sorting
description: "Solutions for LeetCode 2602, medium, tags: array, binary search, sorting, prefix sum."
---

## Table of contents

## Description

Question Link: [LeetCode 2602](https://leetcode.com/problems/minimum-operations-to-make-all-array-elements-equal/description/)

For each target in `queries`, calculate the minimum number of increments or decrements needed to make every value in `nums` equal to that target. Return the costs in query order.

```text
Example 1:
Input: nums = [3,1,6,8], queries = [1,5]
Output: [14,10]

Example 2:
Input: nums = [2,9,6,3], queries = [10]
Output: [20]
```

**Constraints:**

- `n == nums.length`
- `m == queries.length`
- `1 <= n, m <= 10^5`
- `1 <= nums[i], queries[i] <= 10^9`

## Idea

For a target `q`, the total cost is the sum of `|nums[i] - q|`. Sort the values and build a prefix-sum array, where `prefix[k]` is the sum of the first `k` sorted values. Then use binary search to find `k`, the first index whose value is at least `q`.

```text
sorted values:  1  2  3 | 4  5  6
target q = 4:   below q  | at least q
indices:        0  1  2 | 3  4  5
prefix sums:    0  1  3  6  10 15 21
```

The values before `k` are smaller than `q`, so their cost is `q * k - prefix[k]`. The values from `k` onward are at least `q`, so their cost is `(prefix[n] - prefix[k]) - q * (n - k)`. Values equal to `q` contribute zero, so placing them on the right side is safe.

For the diagram, the left cost is `4 * 3 - 6 = 6`, and the right cost is `(21 - 6) - 4 * 3 = 3`; the total is `9`.

Sorting and building prefix sums take `O(n log n)` time. Each of `m` queries takes `O(log n)` for the binary search and `O(1)` arithmetic, so total time is `O(n log n + m log n)`. Auxiliary space is `O(n)` for the sorted values and prefix sums, plus `O(m)` for the returned costs.

### Java

```java []
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class MinimumOperationsToMakeAllArrayElementsEqual {

    private MinimumOperationsToMakeAllArrayElementsEqual() {
    }

    public static List<Long> minOperations(int[] nums, int[] queries) {
        int[] sorted = Arrays.copyOf(nums, nums.length);
        Arrays.sort(sorted);

        long[] prefixSums = new long[sorted.length + 1];
        for (int index = 0; index < sorted.length; index++) {
            prefixSums[index + 1] = prefixSums[index] + sorted[index];
        }

        List<Long> operations = new ArrayList<>(queries.length);
        for (int query : queries) {
            int split = lowerBound(sorted, query);
            long leftCost = (long) query * split - prefixSums[split];
            long rightCost = prefixSums[sorted.length] - prefixSums[split]
                    - (long) query * (sorted.length - split);
            operations.add(leftCost + rightCost);
        }
        return operations;
    }

    private static int lowerBound(int[] nums, int target) {
        int low = 0;
        int high = nums.length;
        while (low < high) {
            int middle = low + (high - low) / 2;
            if (nums[middle] < target) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        return low;
    }
}
```

### Python

```python []
from bisect import bisect_left


class Solution:
    def minOperations(self, nums, queries):
        """Return the adjustment cost for each target query.

        Sorting and prefix-sum construction take O(n log n) time; each of m
        queries takes O(log n), for O((n + m) log n) total time and O(n)
        extra space.
        """
        ordered = sorted(nums)
        prefix = [0]
        for value in ordered:
            prefix.append(prefix[-1] + value)

        total = prefix[-1]
        result = []
        for target in queries:
            split = bisect_left(ordered, target)
            left_cost = target * split - prefix[split]
            right_cost = total - prefix[split] - target * (len(ordered) - split)
            result.append(left_cost + right_cost)

        return result
```

### C++

```cpp []
#pragma once

#include <algorithm>
#include <vector>

using namespace std;

class Solution {
public:
    // Sort and prefix sums make each query O(log n), for O((n+m) log n) total time.
    // O(n) extra space for the prefix sums and result.
    vector<long long> minOperations(vector<int>& nums, vector<int>& queries) {
        sort(nums.begin(), nums.end());

        vector<long long> prefixSums(nums.size() + 1);
        for (size_t index = 0; index < nums.size(); ++index) {
            prefixSums[index + 1] = prefixSums[index] + nums[index];
        }

        vector<long long> result;
        result.reserve(queries.size());
        for (int query : queries) {
            const size_t splitIndex = lower_bound(nums.begin(), nums.end(), query) - nums.begin();
            const long long leftCost = static_cast<long long>(query) * splitIndex - prefixSums[splitIndex];
            const long long rightCost = (prefixSums.back() - prefixSums[splitIndex])
                - static_cast<long long>(query) * (nums.size() - splitIndex);
            result.push_back(leftCost + rightCost);
        }

        return result;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Sorts the values and uses prefix sums to calculate each query in O(log n) time.
    /// Overall time is O((n + m) log n) and extra space is O(n).
    pub fn min_operations(mut nums: Vec<i32>, queries: Vec<i32>) -> Vec<i64> {
        nums.sort_unstable();

        let mut prefix_sums = Vec::with_capacity(nums.len() + 1);
        prefix_sums.push(0_i64);
        for &value in &nums {
            prefix_sums.push(prefix_sums.last().unwrap() + i64::from(value));
        }

        let total_count = nums.len() as i64;
        queries
            .into_iter()
            .map(|query| {
                let target = i64::from(query);
                let split_index = nums.partition_point(|&value| value < query);
                let left_count = split_index as i64;
                let left_cost = target * left_count - prefix_sums[split_index];

                let right_count = total_count - left_count;
                let right_sum = prefix_sums[nums.len()] - prefix_sums[split_index];
                let right_cost = right_sum - target * right_count;

                left_cost + right_cost
            })
            .collect()
    }
}
```
