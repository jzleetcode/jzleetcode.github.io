---
author: JZ
pubDatetime: 2026-11-17T19:43:16Z
modDatetime: 2026-11-17T19:43:16Z
title: LeetCode 2592 Maximize Greatness of an Array
featured: true
tags:
  - a-array
  - a-two-pointers
  - a-greedy
  - a-sorting
description: "Solutions for LeetCode 2592, medium, tags: array, two pointers, greedy, sorting."
---

## Table of contents

## Description

Question Link: [LeetCode 2592: Maximize Greatness of an Array](https://leetcode.com/problems/maximize-greatness-of-an-array/description/)

You are given a 0-indexed integer array `nums`. You may permute its values into a new array `perm`. The greatness is the number of indices `i` for which `perm[i] > nums[i]`. Return the maximum possible greatness.

```text
Example 1:
Input: nums = [1,3,5,2,1,3,1]
Output: 4
Explanation: One optimal permutation is [2,5,1,3,3,1,1]. It is greater at indices 0, 1, 3, and 4.

Example 2:
Input: nums = [1,2,3,4]
Output: 3
Explanation: The permutation [2,3,4,1] is greater at indices 0, 1, and 2.

Constraints:
1 <= nums.length <= 10^5
0 <= nums[i] <= 10^9
```

## Idea

Sort the values so we can greedily match small candidates to small targets. Keep `matched` at the smallest value that has not yet been beaten, then scan each sorted value as a candidate. If `candidate > nums[matched]`, use it for that target and advance `matched`. Otherwise, skip it: it cannot beat this target or any larger remaining target.

For the first example, the sorted values are `[1, 1, 1, 2, 3, 3, 5]`:

```text
candidate 1, 1, 1: cannot beat target 1
candidate 2: beats target 1  → matched = 1
candidate 3: beats target 1  → matched = 2
candidate 3: beats target 1  → matched = 3
candidate 5: beats target 2  → matched = 4
```

The greedy pairing is optimal. When a candidate cannot beat the smallest unmatched target, it cannot beat any remaining target. When it can, assigning it to the smallest unmatched target leaves every larger candidate available for the remaining targets.

Time: $O(n \log n)$ for sorting and $O(n)$ for the scan, for $O(n \log n)$ total. Python's sort uses $O(n)$ temporary space; the Java, C++, and Rust in-place sorts use $O(\log n)$ stack space, with an $O(1)$ scan.

### Python

```python []
class Solution:
    def maximizeGreatness(self, nums):
        """Return the maximum count of positions where a permutation wins."""
        nums.sort()  # O(n log n); Timsort uses O(n) temporary space.
        matched = 0
        for value in nums:  # O(n) total; each value is considered once.
            if value > nums[matched]:
                matched += 1
        return matched
```

### Java

```java []
import java.util.Arrays;

/** Greedy solution for LeetCode 2592, Maximize Greatness of an Array. */
public final class MaximizeGreatness {

    private MaximizeGreatness() {
    }

    /**
     * Counts the maximum number of elements that can be made strictly greater than their paired values.
     *
     * @param nums values to pair after rearrangement; sorted in place
     * @return the maximum number of strictly greater pairs
     *
     * Time: O(n log n) for sorting. Extra space: O(log n) for the sort's stack and O(1) for the scan.
     */
    public static int maximizeGreatness(int[] nums) {
        Arrays.sort(nums);

        int matched = 0;
        for (int candidate = 0; candidate < nums.length; candidate++) {
            if (nums[candidate] > nums[matched]) {
                matched++;
            }
        }
        return matched;
    }
}
```

### C++

```cpp []
#include <algorithm>
#include <vector>

using namespace std;

class Solution {
public:
    int maximizeGreatness(vector<int> &nums) {
        sort(nums.begin(), nums.end());

        int matched = 0;
        // Runtime is O(n log n); sorting uses O(log n) stack space and the scan O(1).
        for (int candidate = 0; candidate < nums.size(); ++candidate) {
            if (nums[candidate] > nums[matched]) {
                ++matched;
            }
        }
        return matched;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Sorts the values and greedily pairs each smallest unmatched value with
    /// the first larger value available.
    /// Time: O(n log n), Space: O(log n) stack for the in-place unstable sort.
    pub fn maximize_greatness(mut nums: Vec<i32>) -> i32 {
        nums.sort_unstable();

        let mut smallest_unmatched = 0;
        let mut candidate = 0;
        while candidate < nums.len() {
            if nums[candidate] > nums[smallest_unmatched] {
                smallest_unmatched += 1;
            }
            candidate += 1;
        }

        smallest_unmatched as i32
    }
}
```
