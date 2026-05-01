---
author: JZ
pubDatetime: 2024-11-17T07:23:00Z
modDatetime: 2026-05-01T07:23:00Z
title: LeetCode 2461 Maximum Sum of Distinct Subarrays With Length K
tags:
  - a-sliding-window
  - a-array
  - a-hash
description:
  "Solutions for LeetCode 2461, medium, tags: array, sliding window, hash."
---

## Table of contents

## Description

Question Links: [LeetCode 2461](https://leetcode.com/problems/maximum-sum-of-distinct-subarrays-with-length-k/description/)

You are given an integer array `nums` and an integer `k`. Find the maximum subarray sum of all the subarrays of `nums` that meet the following conditions:

-   The length of the subarray is `k`, and
-   All the elements of the subarray are **distinct**.

Return _the maximum subarray sum of all the subarrays that meet the conditions. If no subarray meets the conditions, return `0`.

_A **subarray** is a contiguous non-empty sequence of elements within an array._

```
Example 1:

Input: nums = [1,5,4,2,9,9,9], k = 3
Output: 15
Explanation: The subarrays of nums with length 3 are:
- [1,5,4] which meets the requirements and has a sum of 10.
- [5,4,2] which meets the requirements and has a sum of 11.
- [4,2,9] which meets the requirements and has a sum of 15.
- [2,9,9] which does not meet the requirements because the element 9 is repeated.
- [9,9,9] which does not meet the requirements because the element 9 is repeated.
We return 15 because it is the maximum subarray sum of all the subarrays that meet the conditions

Example 2:

Input: nums = [4,4,4], k = 3
Output: 0
Explanation: The subarrays of nums with length 3 are:
- [4,4,4] which does not meet the requirements because the element 4 is repeated.
We return 0 because no subarrays meet the conditions.
 

Constraints:

1 <= k <= nums.length <= 10^5
1 <= nums[i] <= 10^5
```

Hint 1

Which elements change when moving from the subarray of size k that ends at index i to the subarray of size k that ends at index i + 1?
* * *
Hint 2

Only two elements change, the element at i + 1 is added into the subarray, and the element at i - k + 1 gets removed from the subarray.
* * *
Hint 3

Iterate through each subarray of size k and keep track of the sum of the subarray and the frequency of each element.


## Solution

### Idea

Complexity: Time O(n), Space O(n).

#### Java

```java
class Solution {
    public long maximumSubarraySum(int[] nums, int k) {
        long res = 0, cur = 0, dup = -1;
        HashMap<Integer, Integer> last = new HashMap<>(); // val->last seen index
        for (int i = 0; i < nums.length; ++i) {
            cur += nums[i];
            if (i >= k) cur -= nums[i - k];
            dup = Math.max(dup, last.getOrDefault(nums[i], -1));
            if (i - dup >= k) res = Math.max(res, cur); // past the duplicate segment
            last.put(nums[i], i);
        }
        return res;
    }
}
```

#### Python

```python
class Solution:
    """Sliding window with last-seen map. O(n) time, O(n) space."""

    def maximumSubarraySum(self, nums: list[int], k: int) -> int:
        res, cur, dup = 0, 0, -1
        last: dict[int, int] = {}
        for i, v in enumerate(nums):
            cur += v
            if i >= k:
                cur -= nums[i - k]
            dup = max(dup, last.get(v, -1))
            if i - dup >= k:
                res = max(res, cur)
            last[v] = i
        return res
```

#### C++

```cpp
class MaxSumDistinctK {
public:
    static long long maximumSubarraySum(vector<int>& nums, int k) {
        long long res = 0, cur = 0, dup = -1;
        unordered_map<int, int> last;
        for (int i = 0; i < (int)nums.size(); ++i) {
            cur += nums[i];
            if (i >= k) cur -= nums[i - k];
            if (last.count(nums[i])) dup = max(dup, (long long)last[nums[i]]);
            if (i - dup >= k) res = max(res, cur);
            last[nums[i]] = i;
        }
        return res;
    }
};
```

#### Rust

```rust
impl Solution {
    pub fn maximum_subarray_sum(nums: &[i32], k: i32) -> i64 {
        let k = k as usize;
        let (mut res, mut cur, mut dup): (i64, i64, i64) = (0, 0, -1);
        let mut last: HashMap<i32, i64> = HashMap::new();
        for (i, &v) in nums.iter().enumerate() {
            cur += v as i64;
            if i >= k { cur -= nums[i - k] as i64; }
            if let Some(&prev) = last.get(&v) { dup = dup.max(prev); }
            if i as i64 - dup >= k as i64 { res = res.max(cur); }
            last.insert(v, i as i64);
        }
        res
    }
}
```
