---
author: JZ
pubDatetime: 2026-04-15T06:23:00Z
modDatetime: 2026-04-15T06:23:00Z
title: LeetCode 560 Subarray Sum Equals K
featured: true
tags:
  - a-hash
  - a-prefix-sum
  - a-array
description:
  "Solutions for LeetCode 560, medium, tags: array, hash table, prefix sum."
---

## Table of contents

## Description

Question Links: [LeetCode 560](https://leetcode.com/problems/subarray-sum-equals-k/description/)

Given an integer array `nums` and an integer `k`, return _the total number of subarrays whose sum equals_ `k`.

A subarray is a contiguous **non-empty** sequence of elements within an array.

```
Example 1:

Input: nums = [1,1,1], k = 2
Output: 2

Example 2:

Input: nums = [1,2,3], k = 3
Output: 2
```

**Constraints:**

-   `1 <= nums.length <= 2 * 10^4`
-   `-1000 <= nums[i] <= 1000`
-   `-10^7 <= k <= 10^7`

## Idea1

We can use a prefix sum combined with a hash map to solve this in one pass.

The key insight is: if the prefix sum at index `j` minus the prefix sum at index `i` equals `k`, then the subarray `nums[i+1..j]` has sum `k`. So for each position, we check how many previous prefix sums equal `current_prefix - k`.

```
nums:        [1,  1,  1]    k = 2
prefix:   [0, 1,  2,  3]

At prefix=1: check cnt[1-2]=cnt[-1]=0
At prefix=2: check cnt[2-2]=cnt[0]=1  -> found 1 subarray [1,1]
At prefix=3: check cnt[3-2]=cnt[1]=1  -> found 1 subarray [1,1]
                                          total = 2
```

We initialize the hash map with `{0: 1}` to account for subarrays starting from index 0.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
// leet 560, O(n) time, O(n) space.
public int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1);
    int prefix = 0;
    int count = 0;
    for (int num : nums) { // O(n)
        prefix += num;
        count += prefixCount.getOrDefault(prefix - k, 0); // O(1)
        prefixCount.merge(prefix, 1, Integer::sum); // O(1)
    }
    return count;
}
```

### C++

```cpp []
// leet 560, O(n) time, O(n) space.
int subarraySum(vector<int> &nums, int k) {
    unordered_map<int, int> prefixCount;
    prefixCount[0] = 1;
    int sum = 0, count = 0;
    for (int num : nums) { // O(n)
        sum += num;
        if (prefixCount.count(sum - k)) { // O(1)
            count += prefixCount[sum - k];
        }
        prefixCount[sum]++; // O(1)
    }
    return count;
}
```

### Python

```python []
class Solution:
    """7 ms, 19.7 mb"""

    def subarraySum(self, nums: list[int], k: int) -> int:
        cnt, prefix, res = defaultdict(int), 0, 0
        cnt[0] = 1  # empty prefix sum
        for n in nums:  # O(n)
            prefix += n  # O(1)
            res += cnt[prefix - k]  # O(1), count subarrays ending here with sum k
            cnt[prefix] += 1  # O(1)
        return res
```

### Rust

```rust []
/// leet 560, O(n) time, O(n) space.
impl Solution {
    pub fn subarray_sum(nums: Vec<i32>, k: i32) -> i32 {
        let mut map = HashMap::new();
        map.insert(0, 1);
        let (mut prefix, mut count) = (0, 0);
        for n in nums { // O(n)
            prefix += n;
            if let Some(&c) = map.get(&(prefix - k)) { // O(1)
                count += c;
            }
            *map.entry(prefix).or_insert(0) += 1; // O(1)
        }
        count
    }
}
```

## Idea2

A brute force approach: for each starting index `i`, compute the running sum for all ending indices `j >= i`. Whenever the running sum equals `k`, increment the count.

Complexity: Time $O(n^2)$, Space $O(1)$.

### Java

```java []
// leet 560, brute force, O(n^2) time, O(1) space.
public int subarraySumBruteForce(int[] nums, int k) {
    int count = 0;
    for (int i = 0; i < nums.length; i++) { // O(n)
        int sum = 0;
        for (int j = i; j < nums.length; j++) { // O(n)
            sum += nums[j]; // O(1), together O(n^2)
            if (sum == k) count++;
        }
    }
    return count;
}
```

### Python

```python []
class Solution2:
    """TLE, brute force"""

    def subarraySum(self, nums: list[int], k: int) -> int:
        res, n = 0, len(nums)
        for i in range(n):  # O(n)
            total = 0
            for j in range(i, n):  # O(n)
                total += nums[j]  # O(1), together O(n^2)
                if total == k:
                    res += 1
        return res
```
