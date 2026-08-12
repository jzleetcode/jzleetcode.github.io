---
author: JZ
pubDatetime: 2026-08-12T10:36:00Z
modDatetime: 2026-08-12T10:36:00Z
title: LeetCode 2616 Minimize the Maximum Difference of Pairs
featured: true
tags:
  - a-binary-search
  - a-array
  - a-greedy
  - a-sorting
description:
  "Solutions for LeetCode 2616, medium, tags: array, binary search, greedy, sorting."
---

## Table of contents

## Description

Question Link: [LeetCode 2616](https://leetcode.com/problems/minimize-the-maximum-difference-of-pairs/description/)

You are given a **0-indexed** integer array `nums` and an integer `p`. Find `p` pairs of indices of `nums` such that the **maximum** difference amongst all the pairs is **minimized**. Return the minimized maximum difference.

```
Example 1:

Input: nums = [10,1,2,7,1,3], p = 2
Output: 1
Explanation: The 2 pairs are formed with indices (1,4) and (2,5), i.e. values (1,1) and (2,3).
The maximum difference is max(|1-1|, |2-3|) = 1. Minimized.

Example 2:

Input: nums = [4,2,1,2], p = 1
Output: 0
Explanation: Pair indices (0,3), i.e. values (4,2)? No — pair (1,3) values (2,2), difference = 0.
```

**Constraints:**

- `1 <= nums.length <= 10^5`
- `0 <= nums[i] <= 10^9`
- `0 <= p <= (nums.length) / 2`

## Idea: Sort + Binary Search on Answer + Greedy

This is a classic "binary search on the answer" problem. The answer (maximum difference among chosen pairs) has a monotonic property: if we can form `p` pairs with max difference ≤ `d`, then we can also do it for any `d' > d`.

**Algorithm:**
1. Sort the array. After sorting, optimal pairs always use adjacent elements (any non-adjacent pair can be replaced with adjacent pairs without increasing the max difference).
2. Binary search on the answer `d` in range `[0, nums[n-1] - nums[0]]`.
3. For each candidate `d`, greedily check: scan left to right — if `nums[i+1] - nums[i] <= d`, take that pair and skip both elements (advance by 2); otherwise advance by 1.

```
nums = [10, 1, 2, 7, 1, 3], p = 2

sorted: [1, 1, 2, 3, 7, 10]

lo = 0, hi = 9

mid = 4: greedy -> (1,1) diff=0 ✓, (2,3) diff=1 ✓ -> 2 pairs, feasible -> hi=4
mid = 2: greedy -> (1,1) diff=0 ✓, (2,3) diff=1 ✓ -> 2 pairs, feasible -> hi=2
mid = 1: greedy -> (1,1) diff=0 ✓, (2,3) diff=1 ✓ -> 2 pairs, feasible -> hi=1
mid = 0: greedy -> (1,1) diff=0 ✓, (2,3) diff=1 ✗, (3,7) diff=4 ✗, (7,10) diff=3 ✗ -> 1 pair, not enough -> lo=1

lo == hi == 1, answer = 1
```

**Why greedy works:** After sorting, if we skip a valid adjacent pair `(i, i+1)` hoping to use `i+1` with `i+2`, the difference `nums[i+2] - nums[i+1] <= nums[i+2] - nums[i]` (since sorted). So taking the leftmost valid pair never hurts — it frees `i+2` for future pairs with at most the same max difference.

Complexity: Time $O(n \log n + n \log M)$ where $M = \max(\text{nums}) - \min(\text{nums})$, Space $O(1)$.

### Java

```java []
public final class MinimizeMaxDifferenceOfPairs {

    private MinimizeMaxDifferenceOfPairs() {
    }

    // Sort + Binary Search on Answer + Greedy. O(n log n + n log M) time, O(1) space.
    public static int minimizeMax(int[] nums, int p) {
        if (p == 0) return 0;
        Arrays.sort(nums); // O(n log n)
        int lo = 0, hi = nums[nums.length - 1] - nums[0]; // binary search bounds
        while (lo < hi) { // O(log M) iterations
            int mid = lo + (hi - lo) / 2;
            if (countPairs(nums, mid) >= p) { // O(n) greedy check
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

    // Greedy: count max pairs with difference <= threshold. O(n) time.
    private static int countPairs(int[] nums, int threshold) {
        int count = 0;
        int i = 0;
        while (i < nums.length - 1) { // O(n) scan
            if (nums[i + 1] - nums[i] <= threshold) {
                count++;
                i += 2; // skip both elements
            } else {
                i++;
            }
        }
        return count;
    }
}
```

### Python

```python []
class Solution:
    def minimizeMax(self, nums: list[int], p: int) -> int:
        """Sort + Binary search on answer + Greedy. O(n log n + n log M) time, O(1) space.
        M = max(nums) - min(nums)."""
        if p == 0:
            return 0
        nums.sort()  # O(n log n)
        n = len(nums)

        def can_form(threshold: int) -> bool:
            count, i = 0, 0
            while i < n - 1:  # O(n) greedy scan
                if nums[i + 1] - nums[i] <= threshold:
                    count += 1
                    i += 2  # use both elements in a pair
                else:
                    i += 1
                if count >= p:
                    return True
            return count >= p

        lo, hi = 0, nums[-1] - nums[0]  # O(log M) search range
        while lo < hi:
            mid = (lo + hi) // 2
            if can_form(mid):
                hi = mid
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
// Sort + Binary Search on Answer + Greedy.
// O(n log n + n log M) time where M = max - min, O(1) extra space.
class Solution {
public:
    int minimizeMax(vector<int>& nums, int p) {
        sort(nums.begin(), nums.end());  // O(n log n)
        int n = nums.size();
        int lo = 0;
        int hi = (n >= 2) ? nums[n - 1] - nums[0] : 0;
        while (lo < hi) { // O(log M) iterations
            int mid = lo + (hi - lo) / 2;
            if (canFormPairs(nums, p, mid)) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

private:
    // O(n) greedy scan
    bool canFormPairs(vector<int>& nums, int p, int threshold) {
        int count = 0, i = 0;
        while (i < (int)nums.size() - 1) {
            if (nums[i + 1] - nums[i] <= threshold) {
                count++;
                i += 2;  // skip both elements
            } else {
                i++;
            }
            if (count >= p) return true;
        }
        return count >= p;
    }
};
```

### Rust

```rust []
// Sort + Binary search on answer + Greedy.
// O(n log n + n log M) time where M = max - min, O(1) extra space.
impl Solution {
    pub fn minimize_max(mut nums: Vec<i32>, p: i32) -> i32 {
        let p = p as usize;
        if p == 0 {
            return 0;
        }
        nums.sort_unstable(); // O(n log n)
        let mut lo = 0i32;
        let mut hi = nums[nums.len() - 1] - nums[0];
        while lo < hi { // O(log M) iterations
            let mid = lo + (hi - lo) / 2;
            if Self::can_form_pairs(&nums, p, mid) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        lo
    }

    // O(n) greedy scan
    fn can_form_pairs(nums: &[i32], p: usize, threshold: i32) -> bool {
        let mut count = 0;
        let mut i = 0;
        while i + 1 < nums.len() {
            if nums[i + 1] - nums[i] <= threshold {
                count += 1;
                if count >= p { return true; }
                i += 2; // skip both elements
            } else {
                i += 1;
            }
        }
        count >= p
    }
}
```
