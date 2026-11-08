---
author: JZ
pubDatetime: 2026-11-08T19:49:14Z
modDatetime: 2026-11-08T19:49:14Z
title: LeetCode 1248 Count Number of Nice Subarrays
featured: true
tags:
  - a-hash
  - a-prefix-sum
  - a-sliding-window
description: "Solutions for LeetCode 1248, medium, tags: array, hash table, prefix sum, sliding window."
---

## Table of contents

## Description

Given an integer array `nums` and an integer `k`, a subarray is **nice** if it contains exactly `k` odd numbers. Return the number of nice subarrays.

```text
Example 1:
Input: nums = [1,1,2,1,1], k = 3
Output: 2

Example 2:
Input: nums = [2,4,6], k = 1
Output: 0
```

### Constraints

- `1 <= nums.length <= 50000`
- `1 <= nums[i] <= 100000`
- `1 <= k <= nums.length`

Link: [LeetCode 1248](https://leetcode.com/problems/count-number-of-nice-subarrays/)

## Idea1

Convert each value to `0` if it is even and `1` if it is odd. Let `prefix` be the number of odd values seen so far. A subarray ending at the current position contains exactly `k` odd values when an earlier prefix had value `prefix - k`.

Keep the frequency of every prefix count, starting with `{0: 1}` for the empty prefix. At each value, add the frequency of `prefix - k`, then record the current prefix. The Python solution uses a hash map; the other languages use an array because every prefix count is between `0` and `nums.length`.

```text
nums:          [1, 1, 2, 1, 1]
odd prefixes:  0  1  2  2  3  4
k = 3:
  prefix 3 looks for prefix 0 -> 1 subarray
  prefix 4 looks for prefix 1 -> 1 subarray
                              total = 2
```

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
public final class NumberOfNiceSubarrays {

    private NumberOfNiceSubarrays() {
    }

    /** Prefix odd-count frequencies. O(n) time, O(n) space. */
    public static int numberOfSubarrays(int[] nums, int k) {
        int[] frequencies = new int[nums.length + 1]; // O(n) space
        frequencies[0] = 1; // empty prefix
        int oddCount = 0;
        int count = 0;
        for (int num : nums) { // O(n): each prefix takes O(1) work
            oddCount += num & 1;
            if (oddCount >= k) {
                count += frequencies[oddCount - k];
            }
            frequencies[oddCount]++;
        }
        return count;
    }
}
```

### Python

```python []
class Solution:
    def numberOfSubarrays(self, nums: list[int], k: int) -> int:
        """Count exact-k odd subarrays with prefix frequencies: O(n) time, O(n) space."""
        odd_prefix = 0
        frequencies = {0: 1}  # The empty prefix lets a match start at index 0.
        count = 0
        for num in nums:  # O(n); each prefix lookup and update is O(1) on average.
            odd_prefix += num & 1
            count += frequencies.get(odd_prefix - k, 0)
            frequencies[odd_prefix] = frequencies.get(odd_prefix, 0) + 1
        return count
```

### C++

```cpp []
int numberOfSubarrays(vector<int>& nums, int k) {
    vector<int> prefixCount(nums.size() + 1, 0);
    prefixCount[0] = 1;
    int oddCount = 0, count = 0;
    // One pass: O(n) time, O(n) space for prefix odd-count frequencies.
    for (int num : nums) {
        oddCount += num % 2;
        if (oddCount >= k) count += prefixCount[oddCount - k];
        ++prefixCount[oddCount];
    }
    return count;
}
```

### Rust

```rust []
pub fn number_of_subarrays(nums: Vec<i32>, k: i32) -> i32 {
    let mut frequencies = vec![0; nums.len() + 1];
    frequencies[0] = 1;
    let (mut odds, mut count) = (0usize, 0);
    let k = k as usize;
    // Visit each value once, with O(1) frequency lookup and update.
    for num in nums {
        odds += (num & 1) as usize;
        if odds >= k {
            count += frequencies[odds - k];
        }
        frequencies[odds] += 1;
    }
    count
}
```

## Idea2

Count subarrays with **exactly** `k` odd values by subtracting two at-most counts:

$$\operatorname{exactly}(k) = \operatorname{atMost}(k) - \operatorname{atMost}(k - 1).$$

For `atMost(limit)`, slide a window across `nums`, tracking its odd count. Whenever the count exceeds `limit`, move the left edge until the window is valid again. Every start between `left` and `right` then forms a valid subarray ending at `right`, so add `right - left + 1`.

For `[2,1,2,1,2]` and `k = 1`, `atMost(1) = 11` and `atMost(0) = 3`; their difference is `8`, the number of subarrays with exactly one odd value.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
/** Sliding window: exactly(k) = atMost(k) - atMost(k - 1). O(n) time, O(1) space. */
public static int numberOfSubarraysSliding(int[] nums, int k) {
    return atMost(nums, k) - atMost(nums, k - 1);
}

/** Counts subarrays containing at most k odd numbers. O(n) time, O(1) space. */
private static int atMost(int[] nums, int k) {
    int left = 0;
    int oddCount = 0;
    int count = 0;
    for (int right = 0; right < nums.length; right++) { // O(n) total
        oddCount += nums[right] & 1;
        while (oddCount > k) { // left advances at most n times across the loop
            oddCount -= nums[left++] & 1;
        }
        count += right - left + 1;
    }
    return count;
}
```

### Python

```python []
def numberOfSubarraysSliding(self, nums: list[int], k: int) -> int:
    """Count exact-k odds as at_most(k) - at_most(k - 1): O(n) time, O(1) space."""

    def at_most(limit: int) -> int:
        if limit < 0:
            return 0

        left = odd_count = total = 0
        for right, num in enumerate(nums):  # O(n); each item enters the window once.
            odd_count += num & 1
            while odd_count > limit:  # Each item leaves at most once, so O(n) total.
                odd_count -= nums[left] & 1
                left += 1
            total += right - left + 1
        return total

    return at_most(k) - at_most(k - 1)
```

### C++

```cpp []
class SolutionNumberOfNiceSubarrays {
public:
    // Exactly k odds = at most k odds - at most k - 1 odds.
    // Two linear passes: O(n) time, O(1) extra space.
    int numberOfSubarraysSliding(vector<int>& nums, int k) {
        return atMost(nums, k) - atMost(nums, k - 1);
    }

private:
    int atMost(vector<int>& nums, int k) {
        int left = 0, oddCount = 0, count = 0;
        // Each pointer advances at most n times: O(n) time, O(1) space.
        for (int right = 0; right < (int)nums.size(); ++right) {
            oddCount += nums[right] % 2;
            while (oddCount > k) oddCount -= nums[left++] % 2;
            count += right - left + 1;
        }
        return count;
    }
};
```

### Rust

```rust []
pub fn number_of_subarrays_sliding(nums: Vec<i32>, k: i32) -> i32 {
    fn at_most(nums: &[i32], k: i32) -> i32 {
        let (mut left, mut odds, mut count) = (0, 0, 0);
        // Both pointers advance at most n times, so this pass is O(n).
        for right in 0..nums.len() {
            odds += nums[right] & 1;
            while odds > k {
                odds -= nums[left] & 1;
                left += 1;
            }
            count += (right + 1 - left) as i32;
        }
        count
    }
    at_most(&nums, k) - at_most(&nums, k - 1)
}
```
