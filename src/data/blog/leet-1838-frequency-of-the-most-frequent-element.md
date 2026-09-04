---
author: JZ
pubDatetime: 2026-08-28T06:00:00Z
modDatetime: 2026-08-28T06:00:00Z
title: LeetCode 1838 Frequency of the Most Frequent Element
featured: false
tags:
  - a-sliding-window
  - a-binary-search
  - a-prefix-sum
  - a-sorting
description:
  "Solutions for LeetCode 1838, medium, tags: array, binary search, greedy, sliding window, sorting, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 1838](https://leetcode.com/problems/frequency-of-the-most-frequent-element/description/)

The **frequency** of an element is the number of times it occurs in an array.

You are given an integer array `nums` and an integer `k`. In one operation, you can choose an index of `nums` and increment the element at that index by `1`.

Return the **maximum possible frequency** of an element after performing at most `k` operations.

```
Example 1:
Input: nums = [1,2,4], k = 5
Output: 3
Explanation: Increment the first element three times and the second element two times
to make nums = [4,4,4]. 4 has a frequency of 3.

Example 2:
Input: nums = [1,4,8,13], k = 5
Output: 2
Explanation: There are multiple optimal solutions:
- Increment the first element three times to make nums = [4,4,8,13]. 4 has a frequency of 2.
- Increment the second element four times to make nums = [1,8,8,13]. 8 has a frequency of 2.

Example 3:
Input: nums = [3,9,6], k = 2
Output: 1

Constraints:
1 <= nums.length <= 10^5
1 <= nums[i] <= 10^5
1 <= k <= 10^5
```

## Solution 1: Sliding Window

### Idea

After sorting, we want to find the longest window `[left, right]` where we can make all elements equal to `nums[right]` using at most `k` increments. The cost for a window is:

$$cost = nums[right] \times (right - left + 1) - \sum_{i=left}^{right} nums[i]$$

If the cost exceeds `k`, we shrink from the left. Since we only increment (never decrement), sorting ensures the target is always the rightmost element.

```
nums = [1, 2, 4], k = 5, sorted

r=0: window=[1]     sum=1  cost=1*1-1=0<=5   res=1
r=1: window=[1,2]   sum=3  cost=2*2-3=1<=5   res=2
r=2: window=[1,2,4] sum=7  cost=4*3-7=5<=5   res=3 <-- answer

All 3 elements can be made into 4: cost = (4-1)+(4-2)+(4-4) = 3+2+0 = 5 = k
```

Each element enters and leaves the window at most once, so the inner while loop is $O(1)$ amortized.

Complexity: Time $O(n \log n)$ for sorting, Space $O(1)$ extra (sort in place).

#### Java

```java []
public static int maxFrequency(int[] nums, int k) {
    Arrays.sort(nums); // O(n log n)
    int left = 0, res = 1;
    long windowSum = 0;
    for (int right = 0; right < nums.length; right++) { // O(n)
        windowSum += nums[right];
        // cost to make all elements in [left, right] equal to nums[right]
        while ((long) nums[right] * (right - left + 1) - windowSum > k) { // O(1) amortized
            windowSum -= nums[left];
            left++;
        }
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

#### Python

```python []
class Solution:
    def maxFrequency(self, nums: list[int], k: int) -> int:
        """sliding window, O(n log n) time for sort, O(n) space."""
        nums.sort()  # O(n log n)
        res, window_sum, left = 1, 0, 0
        for right in range(len(nums)):  # O(n)
            window_sum += nums[right]
            # cost to make all elements in [left, right] equal to nums[right]
            while nums[right] * (right - left + 1) - window_sum > k:  # O(1) amortized
                window_sum -= nums[left]
                left += 1
            res = max(res, right - left + 1)
        return res
```

#### C++

```cpp []
class Solution {
public:
    int maxFrequency(vector<int>& nums, int k) {
        sort(nums.begin(), nums.end()); // O(n log n)
        int left = 0, res = 1;
        long long windowSum = 0;
        for (int right = 0; right < (int)nums.size(); right++) { // O(n)
            windowSum += nums[right];
            // cost to make all elements in [left, right] equal to nums[right]
            while ((long long)nums[right] * (right - left + 1) - windowSum > k) { // O(1) amortized
                windowSum -= nums[left];
                left++;
            }
            res = max(res, right - left + 1);
        }
        return res;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn max_frequency(mut nums: Vec<i32>, k: i32) -> i32 {
        nums.sort_unstable(); // O(n log n)
        let k = k as i64;
        let (mut l, mut sum) = (0usize, 0i64);
        let mut res = 1;
        for r in 0..nums.len() { // O(n)
            sum += nums[r] as i64;
            // cost to make all elements in [l..=r] equal to nums[r]
            while (nums[r] as i64) * (r - l + 1) as i64 - sum > k { // O(1) amortized
                sum -= nums[l] as i64;
                l += 1;
            }
            res = res.max(r - l + 1);
        }
        res as i32
    }
}
```

## Solution 2: Binary Search + Prefix Sum

### Idea

Instead of a sliding window, we binary search on the answer (the maximum achievable frequency). For a candidate window size `m`, we check every window of size `m` in the sorted array: if any window's cost $\leq k$, then frequency `m` is achievable.

The cost for window `[i-m+1, i]` is computed in $O(1)$ using prefix sums:

$$cost = nums[i] \times m - (prefix[i+1] - prefix[i-m+1])$$

We binary search on `m` in $[1, n]$, and for each candidate we scan all windows in $O(n)$.

Complexity: Time $O(n \log n)$, Space $O(n)$ for prefix sum array.

#### Java

```java []
public static int maxFrequency2(int[] nums, int k) {
    Arrays.sort(nums); // O(n log n)
    int n = nums.length;
    long[] prefix = new long[n + 1]; // O(n) space
    for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];
    int res = 1;
    int lo = 1, hi = n; // O(log n) binary search
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (canAchieve(nums, prefix, mid, k)) { res = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return res;
}

private static boolean canAchieve(int[] nums, long[] prefix, int size, int k) {
    for (int right = size - 1; right < nums.length; right++) { // O(n)
        int left = right - size + 1;
        long windowSum = prefix[right + 1] - prefix[left];
        long cost = (long) nums[right] * size - windowSum;
        if (cost <= k) return true;
    }
    return false;
}
```

#### Python

```python []
class Solution2:
    def maxFrequency(self, nums: list[int], k: int) -> int:
        """binary search + prefix sum, O(n log n) time, O(n) space."""
        nums.sort()  # O(n log n)
        prefix = [0] * (len(nums) + 1)
        for i, v in enumerate(nums):  # O(n) prefix sum
            prefix[i + 1] = prefix[i] + v

        def can_make_freq(size: int) -> bool:
            for i in range(size - 1, len(nums)):  # O(n) scan all windows of this size
                window_sum = prefix[i + 1] - prefix[i - size + 1]
                cost = nums[i] * size - window_sum
                if cost <= k:
                    return True
            return False

        lo, hi = 1, len(nums)  # O(log n) binary search
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if can_make_freq(mid):
                lo = mid
            else:
                hi = mid - 1
        return lo
```

#### C++

```cpp []
class SolutionBS {
public:
    int maxFrequency(vector<int>& nums, int k) {
        sort(nums.begin(), nums.end()); // O(n log n)
        int n = (int)nums.size();
        vector<long long> prefix(n + 1, 0); // O(n) space
        for (int i = 0; i < n; i++) prefix[i + 1] = prefix[i] + nums[i];
        int res = 1;
        for (int right = 0; right < n; right++) {
            // binary search for smallest left
            int lo = 0, hi = right;
            while (lo < hi) { // O(log n)
                int mid = (lo + hi) / 2;
                long long cost = (long long)nums[right] * (right - mid + 1) - (prefix[right + 1] - prefix[mid]);
                if (cost <= k) hi = mid;
                else lo = mid + 1;
            }
            long long cost = (long long)nums[right] * (right - lo + 1) - (prefix[right + 1] - prefix[lo]);
            if (cost <= k) res = max(res, right - lo + 1);
        }
        return res;
    }
};
```

#### Rust

```rust []
impl Solution2 {
    pub fn max_frequency(mut nums: Vec<i32>, k: i32) -> i32 {
        nums.sort_unstable(); // O(n log n)
        let n = nums.len();
        let k = k as i64;
        let mut prefix = vec![0i64; n + 1]; // O(n) space
        for i in 0..n {
            prefix[i + 1] = prefix[i] + nums[i] as i64;
        }
        let mut res = 1;
        for r in 0..n {
            // binary search for smallest l, O(log n)
            let (mut lo, mut hi) = (0, r);
            while lo < hi {
                let mid = (lo + hi) / 2;
                let window = (r - mid + 1) as i64;
                let cost = nums[r] as i64 * window - (prefix[r + 1] - prefix[mid]);
                if cost <= k { hi = mid; } else { lo = mid + 1; }
            }
            res = res.max(r - lo + 1);
        }
        res as i32
    }
}
```
