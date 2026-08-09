---
author: JZ
pubDatetime: 2026-08-09T10:10:00Z
modDatetime: 2026-08-09T10:10:00Z
title: LeetCode 410 Split Array Largest Sum
featured: true
tags:
  - a-binary-search
  - a-array
  - a-dynamic-programming
  - a-greedy
description:
  "Solutions for LeetCode 410, hard, tags: array, binary search, dynamic programming, greedy, prefix sum."
---

## Table of contents

## Description

Question Link: [LeetCode 410](https://leetcode.com/problems/split-array-largest-sum/description/)

Given an integer array `nums` and an integer `k`, split `nums` into `k` non-empty subarrays such that the largest sum of any subarray is minimized.

Return the minimized largest sum of the split.

A subarray is a contiguous part of the array.

```
Example 1:

Input: nums = [7,2,5,10,8], k = 2
Output: 18
Explanation: There are four ways to split nums into two subarrays.
The best way is to split it into [7,2,5] and [10,8], where the largest sum among the two subarrays is only 18.

Example 2:

Input: nums = [1,2,3,4,5], k = 2
Output: 9
Explanation: There are four ways to split nums into two subarrays.
The best way is to split it into [1,2,3] and [4,5], where the largest sum among the two subarrays is only 9.
```

**Constraints:**

- `1 <= nums.length <= 1000`
- `0 <= nums[i] <= 10^6`
- `1 <= k <= min(50, nums.length)`

## Idea1: Binary Search on Answer

The key insight is that if we can split the array into `k` or fewer subarrays such that no subarray sum exceeds a given target, then any larger target also works. This monotonicity makes binary search applicable.

The search range is `[max(nums), sum(nums)]`:
- Lower bound: at minimum, one subarray must contain the largest element.
- Upper bound: at most, one subarray contains everything.

For each candidate `mid`, we greedily check: scan left to right, accumulate into the current subarray. When adding an element would exceed `mid`, start a new subarray. If we need more than `k` subarrays, `mid` is too small.

```
nums = [7, 2, 5, 10, 8], k = 2

lo = 10 (max), hi = 32 (sum)

mid = 21: [7,2,5] sum=14, [10,8] sum=18 -> 2 parts <= k=2, feasible -> hi=21
mid = 15: [7,2,5] sum=14, [10] sum=10, [8] sum=8 -> 3 parts > k=2, not feasible -> lo=16
mid = 18: [7,2,5] sum=14, [10,8] sum=18 -> 2 parts <= k=2, feasible -> hi=18
mid = 17: [7,2,5] sum=14, [10] sum=10, [8] sum=8 -> 3 parts > k=2, not feasible -> lo=18
lo == hi == 18, answer = 18
```

Complexity: Time $O(n \cdot \log(\text{sum} - \text{max}))$, Space $O(1)$.

## Idea2: Dynamic Programming

Define `dp[i][j]` as the minimum possible largest subarray sum when splitting `nums[0..i]` into `j` parts.

For each state `(i, j)`, try every possible last split point `m` where `nums[m..i]` forms the last part:

$$dp[i][j] = \min_{m=j-1}^{i-1} \max(dp[m][j-1],\ \text{prefix}[i] - \text{prefix}[m])$$

Base case: `dp[0][0] = 0`. Answer: `dp[n][k]`.

Complexity: Time $O(n^2 \cdot k)$, Space $O(n \cdot k)$.

### Java

```java []
// solution 1, binary search. O(n*log(sum)) time, O(1) space. 0ms, 40.1 Mb.
public class SplitArrayLargestSum {

    public int splitArray(int[] nums, int k) {
        int max = 0;
        long sum = 0;
        for (int num : nums) {
            max = Math.max(num, max);
            sum += num;
        }
        if (k == 1) return (int) sum;
        long l = max;
        long r = sum;
        while (l <= r) {
            long mid = (l + r) / 2;
            if (valid(mid, nums, k)) r = mid - 1;
            else l = mid + 1;
        }
        return (int) l;
    }

    public boolean valid(long target, int[] nums, int k) {
        int count = 1;
        long total = 0;
        for (int num : nums) { // O(n)
            total += num;
            if (total > target) {
                total = num;
                count++;
                if (count > k) return false;
            }
        }
        return true;
    }
}
```

### Python

```python []
class Solution:
    def splitArray(self, nums: list[int], k: int) -> int:
        """Binary search on answer. O(n * log(sum-max)) time, O(1) space."""

        def can_split(target: int) -> bool:
            count, total = 1, 0
            for num in nums:  # O(n)
                total += num
                if total > target:
                    total = num
                    count += 1
                    if count > k:
                        return False
            return True

        lo, hi = max(nums), sum(nums)  # O(n)
        while lo <= hi:  # O(log(sum-max))
            mid = (lo + hi) // 2
            if can_split(mid):
                hi = mid - 1
            else:
                lo = mid + 1
        return lo

    def splitArray2(self, nums: list[int], k: int) -> int:
        """DP. O(n^2 * k) time, O(n * k) space."""
        n = len(nums)
        prefix = [0] * (n + 1)
        for i in range(n):  # O(n)
            prefix[i + 1] = prefix[i] + nums[i]
        dp = [[float('inf')] * (k + 1) for _ in range(n + 1)]  # O(n*k) space
        dp[0][0] = 0
        for i in range(1, n + 1):  # O(n)
            for j in range(1, min(i, k) + 1):  # O(k)
                for m in range(j - 1, i):  # O(n), last part is nums[m:i]
                    dp[i][j] = min(dp[i][j], max(dp[m][j - 1], prefix[i] - prefix[m]))
        return dp[n][k]
```

### C++

```cpp []
// solution 1, binary search. O(n*log(sum)) time, O(1) space.
class Solution {
public:
    int splitArray(vector<int>& nums, int k) {
        int lo = *max_element(nums.begin(), nums.end());  // O(n)
        long long hi = accumulate(nums.begin(), nums.end(), 0LL);  // O(n)
        while (lo < hi) { // O(log(sum))
            long long mid = lo + (hi - lo) / 2;
            if (canSplit(nums, k, mid)) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    int splitArrayDp(vector<int>& nums, int k) {
        int n = nums.size();
        vector<long long> prefix(n + 1, 0);
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i]; // O(n)
        vector<vector<long long>> dp(n + 1, vector<long long>(k + 1, LLONG_MAX));
        dp[0][0] = 0;
        for (int i = 1; i <= n; i++) { // O(n)
            for (int j = 1; j <= min(i, k); j++) { // O(k)
                for (int m = j - 1; m < i; m++) { // O(n)
                    long long cur = prefix[i] - prefix[m];
                    long long val = max(dp[m][j - 1], cur);
                    dp[i][j] = min(dp[i][j], val);
                }
            }
        }
        return (int)dp[n][k];
    }

private:
    bool canSplit(vector<int>& nums, int k, long long maxSum) {
        int count = 1;
        long long curSum = 0;
        for (int num : nums) { // O(n)
            if (curSum + num > maxSum) {
                count++;
                curSum = num;
                if (count > k) return false;
            } else {
                curSum += num;
            }
        }
        return true;
    }
};
```

### Rust

```rust []
// solution 1, binary search. O(n*log(sum-max)) time, O(1) space.
impl Solution {
    pub fn split_array(nums: Vec<i32>, k: i32) -> i32 {
        let mut lo = *nums.iter().max().unwrap() as i64;
        let mut hi = nums.iter().map(|&x| x as i64).sum::<i64>();
        while lo < hi { // O(log(sum-max))
            let mid = lo + (hi - lo) / 2;
            if Self::can_split(&nums, k, mid) { hi = mid } else { lo = mid + 1 }
        }
        lo as i32
    }

    fn can_split(nums: &[i32], k: i32, max_sum: i64) -> bool {
        let mut count = 1;
        let mut current_sum: i64 = 0;
        for &num in nums { // O(n)
            current_sum += num as i64;
            if current_sum > max_sum {
                count += 1;
                current_sum = num as i64;
                if count > k { return false; }
            }
        }
        true
    }

    pub fn split_array_dp(nums: Vec<i32>, k: i32) -> i32 {
        let n = nums.len();
        let k = k as usize;
        let mut prefix = vec![0i64; n + 1];
        for i in 0..n { prefix[i + 1] = prefix[i] + nums[i] as i64; } // O(n)
        let mut dp = vec![vec![i64::MAX; k + 1]; n + 1]; // O(n*k) space
        dp[0][0] = 0;
        for i in 1..=n { // O(n)
            for j in 1..=k.min(i) { // O(k)
                for m in (j - 1)..i { // O(n)
                    if dp[m][j - 1] != i64::MAX {
                        let last_sum = prefix[i] - prefix[m];
                        dp[i][j] = dp[i][j].min(dp[m][j - 1].max(last_sum));
                    }
                }
            }
        }
        dp[n][k] as i32
    }
}
```
