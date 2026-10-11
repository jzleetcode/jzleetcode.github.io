---
author: JZ
pubDatetime: 2026-10-11T19:17:38Z
modDatetime: 2026-10-11T19:17:38Z
title: "LeetCode 1493 Longest Subarray of 1's After Deleting One Element"
featured: true
tags:
  - a-array
  - a-sliding-window
  - a-prefix-sum
description: "Solutions for LeetCode 1493, medium, tags: array, sliding window, prefix sum."
---

## Table of contents

## Description

Question Link: [LeetCode 1493](https://leetcode.com/problems/longest-subarray-of-1s-after-deleting-one-element/description/)

Given a binary array `nums`, return the length of the longest subarray containing only `1`s after deleting exactly one element.

**Constraints:**

- $1 \leq \text{nums.length} \leq 10^5$
- `nums[i]` is either `0` or `1`.

## Idea1: One-Zero Sliding Window

Keep a window containing at most one zero. Deleting one element from that window leaves only ones, so each valid window of length $L$ contributes $L - 1$. Subtract one even when the window has no zero, because the problem requires a deletion.

When adding a second zero, move the left boundary until the window is valid again. Each index enters and leaves the window at most once.

```
nums:   [1, 1, 0, 1, 1]
         ^           ^
         left        right
zeros in window = 1, window length = 5
delete one element -> 4 consecutive ones
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public static int longestSubarray(int[] nums) {
    int left = 0;
    int zeroCount = 0;
    int longest = 0;

    // O(n) time: each endpoint moves forward at most n times; O(1) auxiliary space.
    for (int right = 0; right < nums.length; right++) {
        if (nums[right] == 0) zeroCount++;
        while (zeroCount > 1) {
            if (nums[left] == 0) zeroCount--;
            left++;
        }
        longest = Math.max(longest, right - left);
    }

    return longest;
}
```

```python []
class Solution:
    def longestSubarray(self, nums: list[int]) -> int:
        """Sliding window, O(n) time and O(1) extra space."""
        left = zeros = best = 0
        for right, value in enumerate(nums):  # O(n): each right endpoint is visited once.
            if value == 0:
                zeros += 1
            while zeros > 1:  # O(n) amortized: left advances at most n times overall.
                if nums[left] == 0:
                    zeros -= 1
                left += 1
            best = max(best, right - left)
        return best
```

```cpp []
class SolutionLongestSubarrayOfOnesAfterDeletingOneElement {
public:
    // One-zero sliding window. O(n) time, O(1) space.
    int longestSubarray(vector<int> &nums) {
        int left = 0, zeros = 0, longest = 0;
        for (int right = 0; right < (int)nums.size(); right++) {
            if (nums[right] == 0) ++zeros;
            while (zeros > 1) {
                if (nums[left] == 0) --zeros;
                ++left;
            }
            longest = max(longest, right - left);
        }
        return longest;
    }
};
```

```rust []
pub struct Solution;

impl Solution {
    /// One-zero sliding window, O(n) time and O(1) space.
    pub fn longest_subarray(nums: &[i32]) -> i32 {
        let (mut left, mut zero_count, mut max_window) = (0usize, 0usize, 0usize);

        for (right, &value) in nums.iter().enumerate() {
            if value == 0 {
                zero_count += 1;
            }

            while zero_count > 1 {
                if nums[left] == 0 {
                    zero_count -= 1;
                }
                left += 1;
            }

            max_window = max_window.max(right - left + 1);
        }

        max_window.saturating_sub(1) as i32
    }
}
```

## Idea2: Prefix/Suffix Counts

For each index, imagine deleting that element. Count the consecutive ones immediately before it and immediately after it; joining those runs gives the answer for that deletion. The maximum over all deleted indices is the result.

```
nums:          [1, 1, 0, 1]
delete index:        ^
ones before:      2
ones after:              1
candidate length: 2 + 1 = 3
```

Complexity: Time $O(n)$, Space $O(n)$ for the prefix and suffix counts.

### Java

```java []
public static int longestSubarrayWithPrefixSuffix(int[] nums) {
    int length = nums.length;
    int[] prefixOnes = new int[length];
    int[] suffixOnes = new int[length];

    // O(n) scan; the prefix count array uses O(n) space.
    for (int i = 0; i < length; i++) {
        if (nums[i] == 1) prefixOnes[i] = 1 + (i > 0 ? prefixOnes[i - 1] : 0);
    }

    // O(n) scan; the suffix count array also uses O(n) space.
    for (int i = length - 1; i >= 0; i--) {
        if (nums[i] == 1) suffixOnes[i] = 1 + (i + 1 < length ? suffixOnes[i + 1] : 0);
    }

    int longest = 0;
    // O(n) scan; total time is O(n), with O(n) auxiliary space for both count arrays.
    for (int i = 0; i < length; i++) {
        int onesBefore = i > 0 ? prefixOnes[i - 1] : 0;
        int onesAfter = i + 1 < length ? suffixOnes[i + 1] : 0;
        longest = Math.max(longest, onesBefore + onesAfter);
    }

    return longest;
}
```

```python []
class Solution2:
    def longestSubarray(self, nums: list[int]) -> int:
        """Prefix/suffix counts, O(n) time and O(n) extra space."""
        n = len(nums)
        ones_before = [0] * n
        ones_after = [0] * n

        consecutive_ones = 0
        for index, value in enumerate(nums):  # O(n): count ones strictly before each index.
            ones_before[index] = consecutive_ones
            consecutive_ones = consecutive_ones + 1 if value == 1 else 0

        consecutive_ones = 0
        for index in range(n - 1, -1, -1):  # O(n): count ones strictly after each index.
            ones_after[index] = consecutive_ones
            consecutive_ones = consecutive_ones + 1 if nums[index] == 1 else 0

        best = 0
        for index in range(n):  # O(n): delete this index and join its adjacent runs.
            best = max(best, ones_before[index] + ones_after[index])
        return best
```

```cpp []
class SolutionLongestSubarrayOfOnesAfterDeletingOneElement2 {
public:
    // Prefix/suffix counts around each deleted element. O(n) time, O(n) space.
    int longestSubarray(vector<int> &nums) {
        int n = nums.size();
        vector<int> prefix(n, 0), suffix(n, 0);
        for (int i = 0; i < n; i++) {
            if (nums[i] == 1) prefix[i] = 1 + (i > 0 ? prefix[i - 1] : 0);
        }
        for (int i = n - 1; i >= 0; i--) {
            if (nums[i] == 1) suffix[i] = 1 + (i + 1 < n ? suffix[i + 1] : 0);
        }

        int longest = 0;
        for (int i = 0; i < n; i++) {
            int onesBefore = i > 0 ? prefix[i - 1] : 0;
            int onesAfter = i + 1 < n ? suffix[i + 1] : 0;
            longest = max(longest, onesBefore + onesAfter);
        }
        return longest;
    }
};
```

```rust []
impl Solution {
    /// Prefix/suffix consecutive-one counts, O(n) time and O(n) space.
    pub fn longest_subarray_prefix_suffix(nums: &[i32]) -> i32 {
        let n = nums.len();
        let mut prefix_ones = vec![0usize; n + 1];
        let mut suffix_ones = vec![0usize; n + 1];

        for i in 0..n {
            if nums[i] == 1 {
                prefix_ones[i + 1] = prefix_ones[i] + 1;
            }
        }

        for i in (0..n).rev() {
            if nums[i] == 1 {
                suffix_ones[i] = suffix_ones[i + 1] + 1;
            }
        }

        let mut longest = 0usize;
        for i in 0..n {
            longest = longest.max(prefix_ones[i] + suffix_ones[i + 1]);
        }

        longest as i32
    }
}
```
