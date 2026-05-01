---
author: JZ
pubDatetime: 2026-04-20T06:00:00Z
modDatetime: 2026-04-20T06:00:00Z
title: LeetCode 300 Longest Increasing Subsequence
featured: true
tags:
  - a-array
  - a-binary-search
  - a-dp
description:
  "Solutions for LeetCode 300, medium, tags: array, binary search, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 300](https://leetcode.com/problems/longest-increasing-subsequence/description/)

Given an integer array `nums`, return the length of the longest **strictly increasing subsequence**.

```
Example 1:

Input: nums = [10,9,2,5,3,7,101,18]
Output: 4
Explanation: The longest increasing subsequence is [2,3,7,101], therefore the length is 4.

Example 2:

Input: nums = [0,1,0,3,2,3]
Output: 4

Example 3:

Input: nums = [7,7,7,7,7,7,7]
Output: 1
```

**Constraints:**

- `1 <= nums.length <= 2500`
- `-10^4 <= nums[i] <= 10^4`

**Follow up:** Can you come up with an algorithm that runs in $O(n \log n)$ time complexity?

## Idea1

We use patience sorting (DP with binary search). Maintain a `tails` array where `tails[i]` is the smallest tail element for any increasing subsequence of length `i+1`.

For each number in `nums`, binary search in `tails` for the leftmost position where the value is `>= num`. If found, replace that position. If not found (num is larger than all tails), append to extend the longest subsequence.

```
nums = [10, 9, 2, 5, 3, 7, 101, 18]

Process 10:  tails = [10]
Process 9:   tails = [9]         (replace 10)
Process 2:   tails = [2]         (replace 9)
Process 5:   tails = [2, 5]      (append)
Process 3:   tails = [2, 3]      (replace 5)
Process 7:   tails = [2, 3, 7]   (append)
Process 101: tails = [2, 3, 7, 101]  (append)
Process 18:  tails = [2, 3, 7, 18]   (replace 101)

Answer: len(tails) = 4
```

Note: `tails` is NOT the actual LIS — it only tracks smallest possible tails to maximize extension potential.

Complexity: Time $O(n \log n)$, Space $O(n)$.

### Java

```java []
public static int lengthOfLISBinarySearch(int[] nums) {
    int[] tails = new int[nums.length]; // O(n) space: smallest tail for each subsequence length
    int size = 0;
    for (int num : nums) { // O(n) iterations
        int lo = 0, hi = size;
        while (lo < hi) { // O(log n) binary search for insertion point
            int mid = lo + (hi - lo) / 2;
            if (tails[mid] < num) lo = mid + 1;
            else hi = mid;
        }
        tails[lo] = num;
        if (lo == size) size++;
    }
    return size;
}
```

### Python

```python []
def lengthOfLIS(self, nums: List[int]) -> int:
    tails: List[int] = []
    for num in nums:  # O(n)
        pos = bisect.bisect_left(tails, num)  # O(log n)
        if pos == len(tails):
            tails.append(num)
        else:
            tails[pos] = num
    return len(tails)
```

### C++

```cpp []
int lengthOfLIS(vector<int> &nums) {
    vector<int> tails;
    for (int num : nums) { // O(n)
        auto it = lower_bound(tails.begin(), tails.end(), num); // O(log n)
        if (it == tails.end())
            tails.push_back(num);
        else
            *it = num;
    }
    return tails.size();
}
```

### Rust

```rust []
pub fn length_of_lis(nums: Vec<i32>) -> i32 {
    let mut tails: Vec<i32> = Vec::new();
    for &num in &nums { // O(n)
        let pos = tails.partition_point(|&x| x < num); // O(log n)
        if pos == tails.len() {
            tails.push(num);
        } else {
            tails[pos] = num;
        }
    }
    tails.len() as i32
}
```

## Idea2

Classic DP approach. Define `dp[i]` as the length of the longest increasing subsequence ending at index `i`. For each `i`, check all previous indices `j < i`. If `nums[j] < nums[i]`, we can extend the subsequence ending at `j`.

```
nums = [10, 9, 2, 5, 3, 7, 101, 18]
dp   = [ 1, 1, 1, 2, 2, 3,   4,  4]
                       ^       ^
                    2,5      2,3,7,101

Answer: max(dp) = 4
```

Complexity: Time $O(n^2)$, Space $O(n)$.

### Java

```java []
public static int lengthOfLISDP(int[] nums) {
    int n = nums.length;
    int[] dp = new int[n]; // O(n) space
    Arrays.fill(dp, 1);
    int max = 1;
    for (int i = 1; i < n; i++) { // O(n) outer
        for (int j = 0; j < i; j++) { // O(n) inner -> O(n^2)
            if (nums[j] < nums[i]) {
                dp[i] = Math.max(dp[i], dp[j] + 1);
            }
        }
        max = Math.max(max, dp[i]);
    }
    return max;
}
```

### Python

```python []
def lengthOfLIS(self, nums: List[int]) -> int:
    n = len(nums)
    dp = [1] * n
    for i in range(1, n):  # O(n)
        for j in range(i):  # O(n), together O(n^2)
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)
```

### C++

```cpp []
int lengthOfLIS(vector<int> &nums) {
    int n = nums.size();
    vector<int> dp(n, 1); // O(n) space
    int ans = 1;
    for (int i = 1; i < n; i++) { // O(n^2)
        for (int j = 0; j < i; j++) {
            if (nums[j] < nums[i])
                dp[i] = max(dp[i], dp[j] + 1);
        }
        ans = max(ans, dp[i]);
    }
    return ans;
}
```

### Rust

```rust []
pub fn length_of_lis_dp(nums: Vec<i32>) -> i32 {
    let n = nums.len();
    let mut dp = vec![1; n];
    let mut res = 1;
    for i in 1..n { // O(n) outer
        for j in 0..i { // O(n) inner -> O(n^2) total
            if nums[j] < nums[i] {
                dp[i] = dp[i].max(dp[j] + 1);
            }
        }
        res = res.max(dp[i]);
    }
    res
}
```
