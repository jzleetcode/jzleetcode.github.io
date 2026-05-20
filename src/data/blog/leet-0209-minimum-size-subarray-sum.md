---
author: JZ
pubDatetime: 2026-05-14T11:00:00Z
modDatetime: 2026-05-14T11:00:00Z
title: LeetCode 209 Minimum Size Subarray Sum
featured: false
tags:
  - a-sliding-window
  - a-binary-search
  - a-prefix-sum
description:
  "Solutions for LeetCode 209, medium, tags: array, binary search, sliding window, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 209](https://leetcode.com/problems/minimum-size-subarray-sum/description/)

Given an array of positive integers `nums` and a positive integer `target`, return the minimal length of a subarray whose sum is greater than or equal to `target`. If there is no such subarray, return `0` instead.

```
Example 1:

Input: target = 7, nums = [2,3,1,2,4,3]
Output: 2
Explanation: The subarray [4,3] has the minimal length under the problem constraint.

Example 2:

Input: target = 4, nums = [1,4,4]
Output: 1

Example 3:

Input: target = 11, nums = [1,1,1,1,1,1,1,1]
Output: 0

Constraints:

1 <= target <= 10^9
1 <= nums.length <= 10^5
1 <= nums[i] <= 10^4
```

Follow up: If you have figured out the $O(n)$ solution, try coding another solution of which the time complexity is $O(n \log n)$.

## Solution 1: Sliding Window

### Idea

Use two pointers (`left` and `right`) to maintain a window. Expand the window by moving `right` and adding elements. When the window sum reaches `target`, record the length and shrink from the left.

Because all elements are positive, the sum is monotonically increasing as we expand. This guarantees we can greedily shrink from the left once the condition is met.

```
nums = [2, 3, 1, 2, 4, 3], target = 7

Step 1: [2, 3, 1, 2] sum=8 >= 7, len=4, shrink -> [3, 1, 2] sum=6
Step 2: [3, 1, 2, 4] sum=10 >= 7, len=4, shrink -> [1, 2, 4] sum=7 >= 7, len=3, shrink -> [2, 4] sum=6
Step 3: [2, 4, 3] sum=9 >= 7, len=3, shrink -> [4, 3] sum=7 >= 7, len=2, shrink -> [3] sum=3
Result: 2
```

Each element is visited at most twice (once by `right`, once by `left`), so total work is $O(n)$.

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
// Solution 1: Sliding window. O(n) time, O(1) space.
public static int minSubArrayLen(int target, int[] nums) {
    int n = nums.length;
    int left = 0, sum = 0, minLen = Integer.MAX_VALUE;

    // O(n) - each element visited at most twice (once by right, once by left)
    for (int right = 0; right < n; right++) {
        sum += nums[right];

        // Shrink window from left while sum >= target
        while (sum >= target) {
            minLen = Math.min(minLen, right - left + 1);
            sum -= nums[left];
            left++;
        }
    }

    return minLen == Integer.MAX_VALUE ? 0 : minLen;
}
```

#### Python

```python []
class Solution:
    """sliding window. O(n) time, O(1) space."""

    def minSubArrayLen(self, target: int, nums: list[int]) -> int:
        res, l, cur = len(nums) + 1, 0, 0
        for r in range(len(nums)):  # O(n), each element visited at most twice
            cur += nums[r]
            while cur >= target:  # shrink window, amortized O(n) total
                res = min(res, r - l + 1)
                cur -= nums[l]
                l += 1
        return res if res <= len(nums) else 0
```

#### C++

```cpp []
// leet 209, sliding window, O(n) time, O(1) space
class SolutionMinSizeSubarraySum {
public:
    int minSubArrayLen(int target, vector<int>& nums) {
        int n = nums.size();
        int minLen = n + 1;
        int sum = 0;
        for (int l = 0, r = 0; r < n; r++) {
            sum += nums[r];
            while (sum >= target) {
                minLen = min(minLen, r - l + 1);
                sum -= nums[l++];
            }
        }
        return minLen == n + 1 ? 0 : minLen;
    }
};
```

#### Rust

```rust []
pub fn min_sub_array_len(target: i32, nums: Vec<i32>) -> i32 {
    // sliding window, O(n) time, O(1) space
    let target = target as i64;
    let mut min_len = usize::MAX;
    let mut left = 0;
    let mut sum = 0i64;

    for right in 0..nums.len() {
        // O(n) — right pointer visits each element once
        sum += nums[right] as i64;

        while sum >= target {
            // O(n) amortized — left moves at most n times total
            min_len = min_len.min(right - left + 1);
            sum -= nums[left] as i64;
            left += 1;
        }
    }

    if min_len == usize::MAX { 0 } else { min_len as i32 }
}
```

## Solution 2: Prefix Sum + Binary Search

### Idea

Build a prefix sum array where `prefix[i]` is the sum of `nums[0..i]`. Since all elements are positive, the prefix sum is strictly increasing. For each starting index `i`, binary search for the smallest `j` such that `prefix[j] - prefix[i] >= target`.

```
nums = [2, 3, 1, 2, 4, 3], target = 7
prefix = [0, 2, 5, 6, 8, 12, 15]

i=0: need prefix[j] >= 0+7=7,  binary search -> j=4 (prefix[4]=8),  len=4
i=1: need prefix[j] >= 2+7=9,  binary search -> j=5 (prefix[5]=12), len=4
i=2: need prefix[j] >= 5+7=12, binary search -> j=5 (prefix[5]=12), len=3
i=3: need prefix[j] >= 6+7=13, binary search -> j=6 (prefix[6]=15), len=3
i=4: need prefix[j] >= 8+7=15, binary search -> j=6 (prefix[6]=15), len=2
i=5: need prefix[j] >= 12+7=19, not found
Result: 2
```

Complexity: Time $O(n \log n)$, Space $O(n)$.

#### Java

```java []
// Solution 2: Prefix sum + binary search. O(n log n) time, O(n) space.
public static int minSubArrayLenBinarySearch(int target, int[] nums) {
    int n = nums.length;

    // Build prefix sum array. O(n) time, O(n) space.
    int[] prefixSum = new int[n + 1];
    for (int i = 0; i < n; i++) {
        prefixSum[i + 1] = prefixSum[i] + nums[i];
    }

    int minLen = Integer.MAX_VALUE;

    // For each starting position, binary search for the ending position. O(n log n) time.
    for (int i = 0; i < n; i++) {
        int targetSum = target + prefixSum[i];

        // Binary search in [i+1, n]. O(log n) time.
        int left = i + 1, right = n;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (prefixSum[mid] >= targetSum) {
                minLen = Math.min(minLen, mid - i);
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
    }

    return minLen == Integer.MAX_VALUE ? 0 : minLen;
}
```

#### Python

```python []
class Solution2:
    """prefix sum + binary search. O(n log n) time, O(n) space."""

    def minSubArrayLen(self, target: int, nums: list[int]) -> int:
        n = len(nums)
        prefix = [0] * (n + 1)
        for i in range(n):  # O(n)
            prefix[i + 1] = prefix[i] + nums[i]
        res = n + 1
        for i in range(n):  # O(n) iterations
            need = prefix[i] + target
            j = bisect.bisect_left(prefix, need, i + 1)  # O(log n) binary search
            if j <= n:
                res = min(res, j - i)
        return res if res <= n else 0
```

#### C++

```cpp []
// leet 209, prefix sum + binary search, O(n log n) time, O(n) space
class SolutionMinSizeSubarraySum2 {
public:
    int minSubArrayLen(int target, vector<int>& nums) {
        int n = nums.size();
        vector<int> prefix(n + 1, 0);
        for (int i = 0; i < n; i++) {
            prefix[i + 1] = prefix[i] + nums[i];
        }

        int minLen = n + 1;
        for (int i = 0; i < n; i++) {
            int needed = target + prefix[i];
            int low = i + 1, high = n + 1;
            while (low < high) {
                int mid = low + (high - low) / 2;
                if (prefix[mid] < needed) {
                    low = mid + 1;
                } else {
                    high = mid;
                }
            }
            if (low <= n) {
                minLen = min(minLen, low - i);
            }
        }
        return minLen == n + 1 ? 0 : minLen;
    }
};
```

#### Rust

```rust []
pub fn min_sub_array_len_binary_search(target: i32, nums: Vec<i32>) -> i32 {
    // prefix sum + binary search, O(n log n) time, O(n) space
    let target = target as i64;
    let n = nums.len();

    // Build prefix sum array: prefix[i] = sum of nums[0..i]
    let mut prefix = vec![0i64; n + 1];
    for i in 0..n {
        // O(n) — build prefix sum
        prefix[i + 1] = prefix[i] + nums[i] as i64;
    }

    let mut min_len = usize::MAX;

    for left in 0..n {
        // O(n log n) — binary search for each starting position
        let target_sum = prefix[left] + target;

        let mut lo = left + 1;
        let mut hi = n + 1;

        while lo < hi {
            // O(log n) per iteration
            let mid = lo + (hi - lo) / 2;
            if prefix[mid] >= target_sum {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }

        if lo <= n && prefix[lo] >= target_sum {
            min_len = min_len.min(lo - left);
        }
    }

    if min_len == usize::MAX { 0 } else { min_len as i32 }
}
```
