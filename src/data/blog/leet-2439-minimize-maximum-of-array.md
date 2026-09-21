---
author: JZ
pubDatetime: 2026-09-21T10:07:00Z
modDatetime: 2026-09-21T10:07:00Z
title: LeetCode 2439 Minimize Maximum of Array
featured: true
tags:
  - a-array
  - a-binary-search
  - a-greedy
  - a-prefix-sum
description:
  "Solutions for LeetCode 2439, medium, tags: array, binary search, greedy, prefix sum."
---

## Table of contents

## Description

Question Link: [LeetCode 2439](https://leetcode.com/problems/minimize-maximum-of-array/description/)

You are given a **0-indexed** array `nums` of `n` integers.

In one operation, you can pick an index `i` where `1 <= i < n` and decrease `nums[i]` by 1 and increase `nums[i - 1]` by 1.

Return _the minimum possible value of the maximum integer of_ `nums` _after performing any number of operations_.

```
Example 1:

Input: nums = [3,7,1,6]
Output: 5
Explanation:
One set of optimal operations:
1. i=1, nums = [4,6,1,6]
2. i=3, nums = [4,6,2,5]
3. i=1, nums = [5,5,2,5]
The maximum is 5, which is the minimum possible.

Example 2:

Input: nums = [10,1]
Output: 10
Explanation:
We can only move from right to left (decrease nums[1], increase nums[0]).
Since nums[0] is already the max and can't be reduced, the answer is 10.
```

**Constraints:**

- `n == nums.length`
- `1 <= n <= 10^5`
- `0 <= nums[i] <= 10^9`

## Idea1: Prefix Sum Greedy

The key insight is that we can only move values **leftward** (from index `i` to `i-1`). The first element can never decrease — it can only receive. So the bottleneck is whichever prefix has the highest required "average ceiling."

For each prefix `nums[0..i]`, if the total sum is `S`, the best we can do is spread it evenly, giving a max of $\lceil S / (i+1) \rceil$. The answer is the maximum across all prefixes.

```
nums = [3, 7, 1, 6]

prefix[0] = 3,  ceil(3/1) = 3
prefix[1] = 10, ceil(10/2) = 5   <-- bottleneck
prefix[2] = 11, ceil(11/3) = 4
prefix[3] = 17, ceil(17/4) = 5   <-- tied

Answer = max(3, 5, 4, 5) = 5
```

**Why it works:** within any prefix, we can freely redistribute leftward to equalize values up to the ceiling of the average. But we cannot "borrow" from the right — so each prefix is an independent lower bound on the answer.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
// Prefix sum greedy. O(n) time, O(1) space.
public static int minimizeArrayValue(int[] nums) {
    long prefixSum = 0;
    long res = 0;
    for (int i = 0; i < nums.length; i++) {
        prefixSum += nums[i];
        // ceil(prefixSum / (i+1))
        long ceil = (prefixSum + i) / (i + 1);
        res = Math.max(res, ceil);
    }
    return (int) res;
}
```

### Python

```python []
class Solution:
    """Prefix sum greedy. O(n) time, O(1) space."""

    def minimizeArrayValue(self, nums: list[int]) -> int:
        res, prefix = 0, 0
        for i, v in enumerate(nums):
            prefix += v
            # ceil(prefix / (i + 1))
            res = max(res, (prefix + i) // (i + 1))
        return res
```

### C++

```cpp []
// Prefix sum greedy. O(n) time, O(1) space.
class Solution {
public:
    int minimizeArrayValue(vector<int>& nums) {
        long long prefix = 0;
        long long ans = 0;
        for (int i = 0; i < (int)nums.size(); i++) {
            prefix += nums[i];
            // ceil(prefix / (i+1))
            long long candidate = (prefix + i) / (i + 1);
            ans = max(ans, candidate);
        }
        return (int)ans;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Prefix sum greedy. O(n) time, O(1) space.
    pub fn minimize_array_value(nums: Vec<i32>) -> i32 {
        let mut prefix_sum: i64 = 0;
        let mut ans: i64 = 0;
        for (i, &num) in nums.iter().enumerate() {
            prefix_sum += num as i64;
            let ceil_avg = (prefix_sum + i as i64) / (i as i64 + 1);
            ans = ans.max(ceil_avg);
        }
        ans as i32
    }
}
```

## Idea2: Binary Search on the Answer

Binary search on the maximum value `cap` in range `[0, max(nums)]`. For each candidate, greedily check feasibility: scan left to right, tracking how much "excess capacity" the left side has. If an element exceeds `cap`, it must push the overflow leftward — but only if previous elements had room.

```
nums = [3, 7, 1, 6], cap = 5

excess after index 0: 5 - 3 = 2  (room to absorb 2 more)
excess after index 1: 2 + (5 - 7) = 0  (7 pushes 2 left, exactly absorbed)
excess after index 2: 0 + (5 - 1) = 4  (1 leaves 4 spare)
excess after index 3: 4 + (5 - 6) = 3  (6 pushes 1 left, absorbed)
All non-negative -> cap=5 is feasible.

cap = 4:
excess after 0: 4-3 = 1
excess after 1: 1+(4-7) = -2  <- negative, infeasible!

Answer: 5
```

Complexity: Time $O(n \log M)$ where $M = \max(\text{nums})$, Space $O(1)$.

### Java

```java []
// Binary search on answer. O(n log(max)) time, O(1) space.
public static int minimizeArrayValue(int[] nums) {
    int lo = 0, hi = 0;
    for (int v : nums) hi = Math.max(hi, v);
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (feasible(nums, mid)) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

private static boolean feasible(int[] nums, int mid) {
    long excess = 0; // O(n) scan
    for (int v : nums) {
        excess += mid - v;
        if (excess < 0) return false;
    }
    return true;
}
```

### Python

```python []
class Solution2:
    """Binary search on the answer. O(n log(max)) time, O(1) space."""

    def minimizeArrayValue(self, nums: list[int]) -> int:
        lo, hi = 0, max(nums)
        while lo < hi:
            mid = (lo + hi) // 2
            excess = 0  # O(n) scan
            feasible = True
            for v in nums:
                excess += mid - v
                if excess < 0:
                    feasible = False
                    break
            if feasible:
                hi = mid
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
// Binary search on answer. O(n log(max)) time, O(1) space.
class Solution2 {
public:
    int minimizeArrayValue(vector<int>& nums) {
        int lo = 0, hi = *max_element(nums.begin(), nums.end());
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (feasible(nums, mid))
                hi = mid;
            else
                lo = mid + 1;
        }
        return lo;
    }
private:
    bool feasible(vector<int>& nums, int cap) {
        long long excess = 0; // O(n) scan
        for (int x : nums) {
            excess += (long long)cap - x;
            if (excess < 0) return false;
        }
        return true;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Binary search on answer. O(n log(max)) time, O(1) space.
    pub fn minimize_array_value_bs(nums: Vec<i32>) -> i32 {
        let mut lo: i64 = 0;
        let mut hi: i64 = *nums.iter().max().unwrap() as i64;
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if Self::feasible(&nums, mid) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        lo as i32
    }

    fn feasible(nums: &[i32], cap: i64) -> bool {
        let mut excess: i64 = 0; // O(n) scan
        for &num in nums {
            excess += num as i64 - cap;
            if excess > 0 {
                return false;
            }
        }
        true
    }
}
```
