---
author: JZ
pubDatetime: 2026-11-18T19:51:04Z
modDatetime: 2026-11-18T19:51:04Z
title: LeetCode 2090 K Radius Subarray Averages
featured: true
tags:
  - a-array
  - a-sliding-window
  - a-prefix-sum
description: "Solutions for LeetCode 2090, medium, tags: array, sliding window, prefix sum."
---

## Table of contents

## Description

Question Link: [LeetCode 2090](https://leetcode.com/problems/k-radius-subarray-averages/description/)

For each index `i`, calculate the average of the `2k + 1` values from `nums[i - k]` through `nums[i + k]`. If the complete window does not fit inside the array, put `-1` at that index.

The average uses integer division truncated toward zero. For example, `-7 / 3` is `-2`.

**Constraints:**

- $1 \leq nums.length \leq 10^5$
- $0 \leq k \leq 10^5$
- $-10^5 \leq nums[i] \leq 10^5$

## Idea

The window size is fixed at `2k + 1`. A center is valid from index `k` through `n - k - 1`, where `n` is the array length. Start with an output array filled with `-1` and write averages only at valid centers.

For the example `nums = [7, 4, 3, 9, 1, 8, 5, 2, 6]` and `k = 3`, the windows move one position at a time:

```text
center 3: [7 4 3 9 1 8 5]          sum 37, average 5
center 4:   [4 3 9 1 8 5 2]        sum 32, average 4
center 5:     [3 9 1 8 5 2 6]      sum 34, average 4

output: [-1, -1, -1, 5, 4, 4, -1, -1, -1]
```

### Sliding window

Sum the first `2k + 1` values. When the window advances, subtract the value that left on the left and add the new value on the right. If the new right edge is `r`, its center is `r - k`. Each value is added and removed at most once.

Use a wide integer for the running sum: the constraints allow a window sum larger than a 32-bit integer. Also preserve truncation toward zero for negative sums. Java, C++, and Rust integer division already behaves this way; Python needs a small helper because `//` rounds down.

Complexity: Time $O(n)$, Space $O(1)$ auxiliary, excluding the returned array.

### Prefix sums

Let `prefix[j]` store the sum of the first `j` values. The sum for a center `i` is `prefix[i + k + 1] - prefix[i - k]`. This also takes linear time, while the prefix array uses linear extra space.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
package sliding;

import java.util.Arrays;

/** LeetCode 2090: K Radius Subarray Averages. */
@SuppressWarnings("unused")
public final class KRadiusSubarrayAverages {

    private KRadiusSubarrayAverages() {
    }

    // O(n) time and O(1) auxiliary space, excluding the returned array.
    public static int[] getAverages(int[] nums, int k) {
        int[] averages = new int[nums.length];
        Arrays.fill(averages, -1);
        int windowSize = 2 * k + 1;
        if (windowSize > nums.length) return averages;

        long sum = 0;
        for (int right = 0; right < nums.length; right++) {
            sum += nums[right];
            if (right >= windowSize - 1) {
                averages[right - k] = (int) (sum / windowSize);
                sum -= nums[right - windowSize + 1];
            }
        }
        return averages;
    }

    // O(n) time and O(n) auxiliary space for the prefix sums.
    public static int[] getAveragesByPrefixSum(int[] nums, int k) {
        int[] averages = new int[nums.length];
        Arrays.fill(averages, -1);
        int windowSize = 2 * k + 1;
        if (windowSize > nums.length) return averages;

        long[] prefix = new long[nums.length + 1];
        for (int i = 0; i < nums.length; i++) {
            prefix[i + 1] = prefix[i] + nums[i];
        }
        for (int center = k; center < nums.length - k; center++) {
            long sum = prefix[center + k + 1] - prefix[center - k];
            averages[center] = (int) (sum / windowSize);
        }
        return averages;
    }
}
```

### Python

```python []
"""LeetCode 2090, medium: K Radius Subarray Averages."""


def _average_toward_zero(total: int, width: int) -> int:
    """Divide like Java/C++ integer division, truncating negative values toward zero."""
    return total // width if total >= 0 else -((-total) // width)


class Solution:
    def getAverages(self, nums: list[int], k: int) -> list[int]:
        n = len(nums)
        width = 2 * k + 1
        averages = [-1] * n
        if width > n:
            return averages

        window_sum = sum(nums[:width])
        averages[k] = _average_toward_zero(window_sum, width)
        # O(n) time: each window update adds and removes one value.
        for right in range(width, n):
            window_sum += nums[right] - nums[right - width]
            averages[right - k] = _average_toward_zero(window_sum, width)

        return averages

    def getAveragesByPrefixSum(self, nums: list[int], k: int) -> list[int]:
        n = len(nums)
        width = 2 * k + 1
        averages = [-1] * n
        if width > n:
            return averages

        prefix = [0] * (n + 1)
        # O(n) time to build prefixes; O(n) extra space for range-sum queries.
        for index, value in enumerate(nums):
            prefix[index + 1] = prefix[index] + value

        for center in range(k, n - k):
            window_sum = prefix[center + k + 1] - prefix[center - k]
            averages[center] = _average_toward_zero(window_sum, width)

        return averages
```

### C++

```cpp []
#ifndef K_RADIUS_SUBARRAY_AVERAGES_HPP
#define K_RADIUS_SUBARRAY_AVERAGES_HPP

#include <vector>
using namespace std;

// LeetCode 2090. Rolling window: O(n) time, O(1) extra space excluding output.
class KRadiusSubarrayAverages {
public:
    static vector<int> getAverages(vector<int>& nums, int k) {
        const int n = static_cast<int>(nums.size());
        vector<int> averages(n, -1);
        const long long window = 2LL * k + 1;
        if (window > n) return averages;

        long long sum = 0;
        for (int right = 0; right < n; ++right) {
            sum += nums[right];
            if (right >= window) sum -= nums[right - window];
            if (right >= window - 1) {
                // Signed integer division truncates negative averages toward zero.
                averages[right - k] = static_cast<int>(sum / window);
            }
        }
        return averages;
    }

    // Prefix sums: O(n) time and O(n) extra space excluding output.
    static vector<int> getAveragesByPrefixSum(vector<int>& nums, int k) {
        const int n = static_cast<int>(nums.size());
        vector<int> averages(n, -1);
        const long long window = 2LL * k + 1;
        if (window > n) return averages;

        vector<long long> prefix(n + 1, 0);
        for (int i = 0; i < n; ++i) {
            prefix[i + 1] = prefix[i] + nums[i];
        }
        for (int center = k; center < n - k; ++center) {
            const long long sum = prefix[center + k + 1] - prefix[center - k];
            averages[center] = static_cast<int>(sum / window);
        }
        return averages;
    }
};

#endif
```

### Rust

```rust []
/// LeetCode 2090: K Radius Subarray Averages.
pub struct Solution;

impl Solution {
    /// Rolling window: O(n) time and O(1) extra space, excluding the output.
    pub fn get_averages(nums: Vec<i32>, k: i32) -> Vec<i32> {
        let k = k as usize;
        if k == 0 {
            return nums;
        }

        let window = 2 * k + 1;
        let mut averages = vec![-1; nums.len()];
        if window > nums.len() {
            return averages;
        }

        let mut sum: i64 = nums[..window].iter().map(|&num| i64::from(num)).sum();
        averages[k] = (sum / window as i64) as i32;
        for right in window..nums.len() {
            sum += i64::from(nums[right]) - i64::from(nums[right - window]);
            averages[right - k] = (sum / window as i64) as i32;
        }
        averages
    }

    /// Prefix sums: O(n) time and O(n) extra space, excluding the output.
    pub fn get_averages_by_prefix_sum(nums: Vec<i32>, k: i32) -> Vec<i32> {
        let k = k as usize;
        if k == 0 {
            return nums;
        }

        let window = 2 * k + 1;
        let mut averages = vec![-1; nums.len()];
        if window > nums.len() {
            return averages;
        }

        let mut prefix = vec![0_i64; nums.len() + 1];
        for (i, &num) in nums.iter().enumerate() {
            prefix[i + 1] = prefix[i] + i64::from(num);
        }
        for center in k..nums.len() - k {
            let sum = prefix[center + k + 1] - prefix[center - k];
            averages[center] = (sum / window as i64) as i32;
        }
        averages
    }
}
```
