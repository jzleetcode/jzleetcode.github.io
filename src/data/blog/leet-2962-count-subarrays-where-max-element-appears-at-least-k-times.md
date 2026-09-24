---
author: JZ
pubDatetime: 2026-09-16T10:37:00Z
modDatetime: 2026-09-16T10:37:00Z
title: LeetCode 2962 Count Subarrays Where Max Element Appears at Least K Times
featured: false
tags:
  - a-sliding-window
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 2962, medium, tags: array, sliding window, binary search."
---

## Table of contents

## Description

Question Links: [LeetCode 2962](https://leetcode.com/problems/count-subarrays-where-the-maximum-element-appears-at-least-k-times/description/)

You are given an integer array `nums` and a **positive** integer `k`.

Return the number of subarrays where the **maximum** element of `nums` appears **at least** `k` times in that subarray.

A subarray is a contiguous sequence of elements within an array.

```
Example 1:

Input: nums = [1,3,2,3,3], k = 2
Output: 6
Explanation: The subarrays that contain the element 3 at least 2 times are:
[1,3,2,3], [1,3,2,3,3], [3,2,3], [3,2,3,3], [2,3,3] and [3,3].

Example 2:

Input: nums = [1,4,2,1], k = 3
Output: 0
Explanation: No subarray contains the element 4 at least 3 times.

Constraints:

1 <= nums.length <= 10^5
1 <= nums[i] <= 10^6
1 <= k <= 10^5
```

## Solution 1: Sliding Window

### Idea

Find the global maximum. Use two pointers `left` and `right` to maintain a window. For each `right`, count occurrences of the max element. When the count reaches `k`, shrink `left` until the count drops below `k`. At that point, every starting index in `[0, left)` paired with the current `right` forms a valid subarray, so add `left` to the result.

```
nums = [1, 3, 2, 3, 3], k = 2, max = 3

right=0: [1]           cnt=0, left=0, res += 0 = 0
right=1: [1,3]         cnt=1, left=0, res += 0 = 0
right=2: [1,3,2]       cnt=1, left=0, res += 0 = 0
right=3: [1,3,2,3]     cnt=2 >= k, shrink: remove 1, left=1
                        cnt=2 >= k, shrink: remove 3, cnt=1, left=2
                        res += 2 = 2
right=4: [..,2,3,3]    cnt=2 >= k, shrink: remove 2, left=3
                        cnt=2 >= k, shrink: remove 3, cnt=1, left=4
                        res += 4 = 6

Answer: 6
```

Complexity: Time $O(n)$ — each element is visited at most twice (once by `right`, once by `left`). Space $O(1)$.

### Java

```java []
class Solution {
    public long countSubarrays(int[] nums, int k) {
        int max = 0;
        for (int num : nums) max = Math.max(max, num); // O(n) find global max
        long res = 0;
        int left = 0, count = 0;
        for (int right = 0; right < nums.length; right++) { // O(n) expand right
            if (nums[right] == max) count++;
            while (count >= k) { // shrink left until fewer than k max elements
                if (nums[left] == max) count--;
                left++;
            }
            res += left; // all starts in [0, left) form valid subarrays ending at right
        }
        return res;
    }
}
```

### Python

```python []
class Solution:
    def countSubarrays(self, nums: list[int], k: int) -> int:
        """O(n) time, O(1) space."""
        mx = max(nums)
        res, cnt, left = 0, 0, 0
        for right in range(len(nums)):
            if nums[right] == mx:
                cnt += 1
            while cnt >= k:
                if nums[left] == mx:
                    cnt -= 1
                left += 1
            res += left  # all starting indices [0, left) form valid subarrays ending at right
        return res
```

### C++

```cpp []
class Solution {
public:
    long long countSubarrays(vector<int>& nums, int k) {
        int mx = *max_element(nums.begin(), nums.end()); // O(n) find max
        long long res = 0;
        int cnt = 0;
        for (int l = 0, r = 0; r < (int)nums.size(); r++) {
            if (nums[r] == mx) cnt++;
            while (cnt >= k) { // shrink until fewer than k maxes
                if (nums[l] == mx) cnt--;
                l++;
            }
            res += l; // all starts in [0, l) form valid subarrays ending at r
        }
        return res;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn count_subarrays(nums: Vec<i32>, k: i32) -> i64 {
        let max_val = *nums.iter().max().unwrap(); // O(n) to find global max
        let k = k as usize;
        let mut count = 0usize;
        let mut left = 0usize;
        let mut res = 0i64;
        for right in 0..nums.len() {
            if nums[right] == max_val { count += 1; }
            while count >= k { // shrink window until count drops below k
                if nums[left] == max_val { count -= 1; }
                left += 1;
            }
            res += left as i64; // all subarrays starting at [0, left) are valid
        }
        res
    }
}
```

## Solution 2: Binary Search on Prefix Positions

### Idea

Collect the positions of the maximum element into a sorted array. For each right endpoint, binary search to find how many max elements are in `[0, right]`. If there are at least `k`, the $k$-th occurrence from the right is at `positions[cnt - k]`, and any starting index in `[0, positions[cnt - k]]` gives a valid subarray. So add `positions[cnt - k] + 1` to the result.

Complexity: Time $O(n \log n)$ — the outer loop is $O(n)$, each binary search is $O(\log n)$. Space $O(n)$ for the positions array.

### Java

```java []
class Solution {
    public long countSubarrays2(int[] nums, int k) {
        int max = 0;
        for (int num : nums) max = Math.max(max, num);
        List<Integer> positions = new ArrayList<>(); // O(n) space
        for (int i = 0; i < nums.length; i++)
            if (nums[i] == max) positions.add(i);
        long res = 0;
        for (int right = 0; right < nums.length; right++) {
            int cnt = upperBound(positions, right); // O(log n) binary search
            if (cnt >= k)
                res += positions.get(cnt - k) + 1;
        }
        return res;
    }

    private int upperBound(List<Integer> sorted, int target) {
        int lo = 0, hi = sorted.size();
        while (lo < hi) { // O(log n)
            int mid = lo + (hi - lo) / 2;
            if (sorted.get(mid) <= target) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}
```

### Python

```python []
class Solution2:
    def countSubarrays(self, nums: list[int], k: int) -> int:
        """O(n log n) time, O(n) space."""
        from bisect import bisect_left
        mx = max(nums)
        positions = [i for i, v in enumerate(nums) if v == mx]
        res = 0
        for right in range(len(nums)):
            idx = bisect_left(positions, right + 1)  # count of max positions <= right
            if idx >= k:
                res += positions[idx - k] + 1
        return res
```

### C++

```cpp []
class Solution {
public:
    long long countSubarrays(vector<int>& nums, int k) {
        int mx = *max_element(nums.begin(), nums.end());
        vector<int> pos; // O(n) space
        for (int i = 0; i < (int)nums.size(); i++)
            if (nums[i] == mx) pos.push_back(i);
        long long res = 0;
        for (int r = 0; r < (int)nums.size(); r++) {
            int hi = (int)(upper_bound(pos.begin(), pos.end(), r) - pos.begin()); // O(log n)
            if (hi >= k)
                res += pos[hi - k] + 1;
        }
        return res;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn count_subarrays_bs(nums: Vec<i32>, k: i32) -> i64 {
        let max_val = *nums.iter().max().unwrap();
        let k = k as usize;
        let positions: Vec<usize> = nums.iter().enumerate()
            .filter(|&(_, &v)| v == max_val)
            .map(|(i, _)| i).collect(); // O(n) space
        let mut res = 0i64;
        for right in 0..nums.len() {
            let cnt = positions.partition_point(|&pos| pos <= right); // O(log n)
            if cnt >= k {
                res += (positions[cnt - k] + 1) as i64;
            }
        }
        res
    }
}
```
