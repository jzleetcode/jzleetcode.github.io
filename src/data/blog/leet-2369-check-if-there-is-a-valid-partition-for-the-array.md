---
author: JZ
pubDatetime: 2026-11-19T19:46:18Z
modDatetime: 2026-11-19T19:46:18Z
title: LeetCode 2369 Check if There is a Valid Partition For The Array
featured: true
tags:
  - a-array
  - a-dynamic-programming
description: "Solution for LeetCode 2369, medium, tags: array, dynamic programming."
---

## Table of contents

## Description

Question Link: [LeetCode 2369](https://leetcode.com/problems/check-if-there-is-a-valid-partition-for-the-array/description/)

Given an integer array `nums`, partition the entire array into contiguous subarrays. A partition is valid when every subarray satisfies one of these conditions:

1. It contains exactly two equal elements, such as `[2, 2]`.
2. It contains exactly three equal elements, such as `[4, 4, 4]`.
3. It contains exactly three consecutive increasing elements, such as `[3, 4, 5]`. Each adjacent difference must be `1`.

Return `true` if at least one valid partition exists; otherwise return `false`.

```text
Example 1:
Input: nums = [4, 4, 4, 5, 6]
Output: true
Explanation: [4, 4] | [4, 5, 6]

Example 2:
Input: nums = [1, 1, 1, 2]
Output: false
Explanation: No partition covers the array using only valid groups.
```

**Constraints:**

- $2 \leq nums.length \leq 10^5$
- $1 \leq nums[i] \leq 10^6$

## Idea

### Rolling dynamic programming

A greedy choice between an equal pair and an equal triple can block a later group. For `[1, 1, 1, 2, 3]`, taking `[1, 1, 1]` leaves the invalid pair `[2, 3]`, while `[1, 1] | [1, 2, 3]` succeeds. Track whether each prefix can be partitioned instead of committing to one grouping.

Let `dp[i]` mean that the first `i` elements have a valid partition. The empty prefix is valid: `dp[0] = true`. A single element cannot form a group: `dp[1] = false`. Two elements work exactly when they are equal: `dp[2] = (nums[0] == nums[1])`.

For a prefix of length `i >= 3`, name its last three values `a`, `b`, and `c`:

- An equal pair works when `dp[i - 2]` is true and `b == c`.
- A triple works when `dp[i - 3]` is true and either `a == b == c`, or `a + 1 == b` and `b + 1 == c`.

```text
dp[i] = (dp[i-2] AND b == c)
     OR (dp[i-3] AND (equal triple OR increasing consecutive triple))
```

Only the three preceding DP states are needed. Before each transition, `three_back`, `two_back`, and `one_back` represent `dp[i - 3]`, `dp[i - 2]`, and `dp[i - 1]`. Compute the new state before shifting them forward.

```text
nums = [4, 4, 4, 5, 6]

prefix length i    dp[i]    reason
0                  true    empty prefix
1                  false   one value cannot form a group
2                  true    [4, 4]
3                  true    [4, 4, 4]
4                  false   no valid final pair or triple
5                  true    dp[2] plus [4, 5, 6]

Final partition: [4, 4] | [4, 5, 6]
```

The false state at length four does not prevent length five from working: the last triple extends the valid prefix of length two.

### Correctness

The base cases describe every possible partition of prefixes of lengths zero, one, and two. Assume the stored states correctly describe the preceding prefixes. Any valid partition of the current prefix ends with either an equal pair or one of the two allowed triples. Removing that final group leaves a valid prefix of length `i - 2` or `i - 3`, so the corresponding transition accepts it. Conversely, each accepted transition appends an allowed group to a prefix already known to be valid. Thus the transition is both necessary and sufficient. By induction, the final state answers whether the whole array has a valid partition.

Complexity: Time $O(n)$, since each prefix takes constant work. Auxiliary space $O(1)$, since only three Boolean states and a few local values are stored. The algorithms do not modify the input array.

## Implementations

The implementations below are copied from the committed and pushed solution files. Each uses the same rolling DP recurrence.

### Java

```java []
package dp;

/**
 * <a href="https://leetcode.com/problems/check-if-there-is-a-valid-partition-for-the-array/">LeetCode 2369</a>,
 * medium, tags: array, dynamic programming.
 */
public final class CheckValidPartition {
    private CheckValidPartition() {}

    /** Rolling prefix DP. Time O(n), auxiliary space O(1). */
    public static boolean validPartition(int[] nums) {
        boolean threeBack = true; // dp[0]: the empty prefix is valid.
        boolean twoBack = false; // dp[1]: a singleton cannot form a group.
        boolean oneBack = nums[0] == nums[1]; // dp[2].

        for (int length = 3; length <= nums.length; length++) { // O(n).
            int last = nums[length - 1];
            int middle = nums[length - 2];
            int first = nums[length - 3];
            boolean equalPair = middle == last;
            boolean validTriple = (first == middle && middle == last)
                    || (first + 1 == middle && middle + 1 == last);
            boolean current = (twoBack && equalPair) || (threeBack && validTriple);

            // Before the next prefix, retain dp[length-2], dp[length-1], dp[length].
            threeBack = twoBack;
            twoBack = oneBack;
            oneBack = current;
        }
        return oneBack;
    }
}
```

### Python

```python []
"""LeetCode 2369: Check if There is a Valid Partition For The Array."""


class Solution:
    def validPartition(self, nums: list[int]) -> bool:
        """Rolling prefix DP: O(n) time and O(1) auxiliary space."""
        # Before processing length 3, these are dp[0], dp[1], dp[2].
        three_back, two_back, one_back = True, False, nums[0] == nums[1]
        for length in range(3, len(nums) + 1):  # O(n) constant-work transitions.
            a, b, c = nums[length - 3], nums[length - 2], nums[length - 1]
            pair = two_back and b == c
            triple = three_back and (a == b == c or (a + 1 == b and b + 1 == c))
            current = pair or triple
            three_back, two_back, one_back = two_back, one_back, current
        return one_back
```

### C++

```cpp []
#ifndef LEETCODE_CHECKVALIDPARTITION_HPP
#define LEETCODE_CHECKVALIDPARTITION_HPP

#include <vector>

namespace check_valid_partition {

class Solution {
public:
    // LeetCode 2369. O(n) time and O(1) auxiliary space.
    bool validPartition(std::vector<int> &nums) {
        bool dp0 = true;
        bool dp1 = false;
        bool dp2 = nums[0] == nums[1];
        const int n = static_cast<int>(nums.size());

        // Before each iteration these hold dp[i - 3], dp[i - 2], dp[i - 1].
        for (int i = 3; i <= n; ++i) {
            const bool equalPair = nums[i - 2] == nums[i - 1];
            const bool equalTriple = equalPair && nums[i - 3] == nums[i - 2];
            const bool increasingTriple = nums[i - 3] + 1 == nums[i - 2]
                                          && nums[i - 2] + 1 == nums[i - 1];
            const bool current = (dp1 && equalPair)
                                 || (dp0 && (equalTriple || increasingTriple));
            dp0 = dp1;
            dp1 = dp2;
            dp2 = current;
        }
        return dp2;
    }
};

} // namespace check_valid_partition

#endif // LEETCODE_CHECKVALIDPARTITION_HPP
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Rolling prefix DP: O(n) time and O(1) auxiliary space.
    pub fn valid_partition(nums: Vec<i32>) -> bool {
        let (mut dp0, mut dp1, mut dp2) = (true, false, nums[0] == nums[1]);

        for i in 3..=nums.len() {
            // Before this step, the flags represent dp[i-3], dp[i-2], dp[i-1].
            let equal_pair = nums[i - 2] == nums[i - 1];
            let equal_triple = nums[i - 3] == nums[i - 2] && equal_pair;
            let consecutive_triple =
                nums[i - 3] + 1 == nums[i - 2] && nums[i - 2] + 1 == nums[i - 1];
            let current = (dp1 && equal_pair) || (dp0 && (equal_triple || consecutive_triple));
            (dp0, dp1, dp2) = (dp1, dp2, current);
        }

        dp2
    }
}
```
