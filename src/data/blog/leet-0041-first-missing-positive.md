---
author: JZ
pubDatetime: 2026-07-28T10:37:00Z
modDatetime: 2026-07-28T10:37:00Z
title: LeetCode 41 First Missing Positive
featured: true
tags:
  - a-array
  - a-hash-table
description:
  "Solutions for LeetCode 41, hard, tags: array, hash table."
---

## Table of contents

## Description

Question Links: [LeetCode 41](https://leetcode.com/problems/first-missing-positive/description/)

Given an unsorted integer array `nums`, return the smallest missing positive integer.

You must implement an algorithm that runs in $O(n)$ time and uses $O(1)$ auxiliary space.

**Example 1:**

- Input: `nums = [1,2,0]`
- Output: `3`

**Example 2:**

- Input: `nums = [3,4,-1,1]`
- Output: `2`

**Example 3:**

- Input: `nums = [7,8,9,11,12]`
- Output: `1`

**Constraints:**

- `1 <= nums.length <= 10^5`
- `-2^31 <= nums[i] <= 2^31 - 1`

## Idea1: Cyclic Sort

The answer must be in the range `[1, n+1]` where `n = len(nums)`. We can use the array itself as a hash map — place each value `v` in `[1, n]` at index `v-1`.

```
Before: [3, 4, -1, 1]
         i=0: swap 3 to index 2 -> [-1, 4, 3, 1]
         i=0: -1 out of range, advance
         i=1: swap 4 to index 3 -> [-1, 1, 3, 4]
         i=1: swap 1 to index 0 -> [1, -1, 3, 4]
         i=1: -1 out of range, advance
         i=2: 3 already at index 2, advance
         i=3: 4 already at index 3, advance
After:  [1, -1, 3, 4]
         scan: nums[1] != 2 → answer is 2
```

Each element moves to its final position at most once, so the total number of swaps is bounded by `n`.

Complexity: Time $O(n)$, Space $O(1)$.

## Idea2: Index Marking

Use the sign of `nums[i]` to record whether value `i+1` is present. Three passes:

1. Replace all non-positive and out-of-range values with `n+1` (a sentinel that won't trigger marking).
2. For each value `v` in `[1, n]`, negate `nums[v-1]` to mark that `v` exists.
3. The first index `i` where `nums[i] > 0` means `i+1` is missing.

```
nums = [3, 4, -1, 1], n = 4
Step 1: replace -1 → [3, 4, 5, 1]
Step 2: |3|=3 → negate idx 2: [3, 4, -5, 1]
        |4|=4 → negate idx 3: [3, 4, -5, -1]
        |5|>n → skip
        |1|=1 → negate idx 0: [-3, 4, -5, -1]
Step 3: nums[1]=4 > 0 → answer is 2
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public class FirstMissingPos {
    // Cyclic sort. O(n) time, O(1) space.
    public int firstMissingPositive(int[] nums) {
        int l = nums.length, i = 0;
        while (i < l) {
            int n = nums[i];
            if (n == i + 1 || n <= 0 || n > l || nums[i] == nums[n - 1]) i++;
            else {
                nums[i] = nums[n - 1]; // O(n) total swaps
                nums[n - 1] = n;
            }
        }
        i = 0;
        while (i < l && nums[i] == i + 1) i++; // O(n) scan
        return i + 1;
    }
}
```

### Python

```python []
class Solution:
    def firstMissingPositive(self, nums: List[int]) -> int:
        """Cyclic sort. Place each value v in [1, n] at index v-1."""
        n = len(nums)
        i = 0
        while i < n:  # O(n) total swaps since each element moves to its final position at most once
            v = nums[i]
            if 1 <= v <= n and nums[v - 1] != v:
                nums[i], nums[v - 1] = nums[v - 1], v  # O(1) space, in-place swap
            else:
                i += 1
        for i in range(n):  # O(n)
            if nums[i] != i + 1:
                return i + 1
        return n + 1

    def firstMissingPositive2(self, nums: List[int]) -> int:
        """Index marking with negation. Uses the array itself as a hash set."""
        n = len(nums)
        for i in range(n):  # O(n) — replace invalid values
            if nums[i] <= 0 or nums[i] > n:
                nums[i] = n + 1
        for i in range(n):  # O(n) — mark presence
            v = abs(nums[i])
            if v <= n:
                nums[v - 1] = -abs(nums[v - 1])
        for i in range(n):  # O(n) — find first missing
            if nums[i] > 0:
                return i + 1
        return n + 1
```

### C++

```cpp []
class Solution41 {
public:
    // Cyclic sort — O(n) time, O(1) space.
    static int firstMissingPositive(vector<int> nums) {
        int n = static_cast<int>(nums.size());
        for (int i = 0; i < n; ++i) {
            while (nums[i] > 0 && nums[i] <= n
                   && nums[nums[i] - 1] != nums[i]) {  // O(1) amortized per element
                swap(nums[i], nums[nums[i] - 1]);
            }
        }
        for (int i = 0; i < n; ++i) {  // O(n) scan
            if (nums[i] != i + 1) return i + 1;
        }
        return n + 1;
    }

    // Index marking — O(n) time, O(1) space.
    static int firstMissingPositiveMarking(vector<int> nums) {
        int n = static_cast<int>(nums.size());
        for (int i = 0; i < n; ++i) {  // O(n) sentinel pass
            if (nums[i] <= 0 || nums[i] > n) nums[i] = n + 1;
        }
        for (int i = 0; i < n; ++i) {  // O(n) marking pass
            int val = abs(nums[i]);
            if (val <= n) nums[val - 1] = -abs(nums[val - 1]);
        }
        for (int i = 0; i < n; ++i) {  // O(n) scan
            if (nums[i] > 0) return i + 1;
        }
        return n + 1;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Cyclic sort — O(n) time, O(1) space.
    pub fn first_missing_positive(nums: &mut Vec<i32>) -> i32 {
        let n = nums.len();
        let mut i = 0;
        while i < n {  // O(n) — each element swapped at most once to its correct position
            let v = nums[i];
            if v > 0 && (v as usize) <= n && nums[(v - 1) as usize] != v {
                let target = (v - 1) as usize;
                nums.swap(i, target);
            } else {
                i += 1;
            }
        }
        for i in 0..n {  // O(n) scan
            if nums[i] != (i as i32) + 1 {
                return (i as i32) + 1;
            }
        }
        (n as i32) + 1
    }

    /// Index marking — O(n) time, O(1) space.
    pub fn first_missing_positive_marking(nums: &mut Vec<i32>) -> i32 {
        let n = nums.len();
        for i in 0..n {  // O(n) sentinel pass
            if nums[i] <= 0 || nums[i] > n as i32 { nums[i] = (n as i32) + 1; }
        }
        for i in 0..n {  // O(n) marking pass
            let v = nums[i].unsigned_abs() as usize;
            if v >= 1 && v <= n { nums[v - 1] = -nums[v - 1].abs(); }
        }
        for i in 0..n {  // O(n) scan
            if nums[i] > 0 { return (i as i32) + 1; }
        }
        (n as i32) + 1
    }
}
```
