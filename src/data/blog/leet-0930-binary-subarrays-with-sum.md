---
author: JZ
pubDatetime: 2026-09-17T10:08:00Z
modDatetime: 2026-09-17T10:08:00Z
title: LeetCode 930 Binary Subarrays With Sum
featured: true
tags:
  - a-hash
  - a-prefix-sum
  - a-sliding-window
description:
  "Solutions for LeetCode 930, medium, tags: array, hash table, sliding window, prefix sum."
---

## Table of contents

## Description

Given a binary array `nums` and an integer `goal`, return the number of non-empty subarrays with a sum equal to `goal`.

A subarray is a contiguous part of the array.

```
Example 1:

Input: nums = [1,0,1,0,1], goal = 2
Output: 4
Explanation: The 4 subarrays are [1,0,1], [1,0,1,0], [0,1,0,1], [1,0,1].

Example 2:

Input: nums = [0,0,0,0,0], goal = 0
Output: 15
```

### Constraints

- `1 <= nums.length <= 3 * 10^4`
- `nums[i]` is either `0` or `1`
- `0 <= goal <= nums.length`

Link: [LeetCode 930](https://leetcode.com/problems/binary-subarrays-with-sum/)

## Idea1

Use prefix sums with a hash map. The key insight: if the prefix sum at index `j` minus the prefix sum at index `i` equals `goal`, then `nums[i+1..j]` sums to `goal`. For each position, count how many earlier prefix sums equal `current_prefix - goal`.

```
nums:       [1, 0, 1, 0, 1]   goal = 2
prefix:  [0, 1, 1, 2, 2, 3]
              ^        ^
   freq map tracks how many times each prefix sum appeared

At prefix=1: check freq[1-2]=freq[-1]=0
At prefix=1: check freq[1-2]=freq[-1]=0
At prefix=2: check freq[2-2]=freq[0]=1  → +1 (subarray [1,0,1])
At prefix=2: check freq[2-2]=freq[0]=1  → +1 (subarray [1,0,1,0])
At prefix=3: check freq[3-2]=freq[1]=2  → +2 ([0,1,0,1] and [1,0,1])
                                           total = 4
```

Initialize the map with `{0: 1}` to count subarrays starting from index 0.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
public static int numSubarraysWithSum(int[] nums, int goal) {
    Map<Integer, Integer> freq = new HashMap<>(); // O(n) space
    freq.put(0, 1);
    int prefix = 0;
    int count = 0;
    for (int num : nums) { // O(n)
        prefix += num;
        count += freq.getOrDefault(prefix - goal, 0); // O(1)
        freq.merge(prefix, 1, Integer::sum);
    }
    return count;
}
```

### Python

```python []
def numSubarraysWithSum(self, nums: list[int], goal: int) -> int:
    count = 0
    prefix = 0
    freq = defaultdict(int)
    freq[0] = 1  # O(n) space
    for num in nums:  # O(n)
        prefix += num
        count += freq[prefix - goal]
        freq[prefix] += 1
    return count
```

### C++

```cpp []
int numSubarraysWithSum(vector<int>& nums, int goal) {
    unordered_map<int, int> prefixCount; // O(n) space
    prefixCount[0] = 1;
    int count = 0, sum = 0;
    for (int x : nums) { // O(n)
        sum += x;
        if (prefixCount.count(sum - goal)) {
            count += prefixCount[sum - goal]; // O(1)
        }
        prefixCount[sum]++;
    }
    return count;
}
```

### Rust

```rust []
pub fn num_subarrays_with_sum(nums: Vec<i32>, goal: i32) -> i32 {
    let mut map = HashMap::new();
    map.insert(0, 1); // O(n) space
    let (mut prefix, mut count) = (0, 0);
    for n in nums { // O(n)
        prefix += n;
        if let Some(&c) = map.get(&(prefix - goal)) { // O(1)
            count += c;
        }
        *map.entry(prefix).or_insert(0) += 1;
    }
    count
}
```

## Idea2

Sliding window approach using the identity: $\text{exactly}(goal) = \text{atMost}(goal) - \text{atMost}(goal - 1)$.

The helper `atMost(k)` counts subarrays with sum $\leq k$ using a standard sliding window. When the window sum exceeds `k`, shrink from the left. Each valid window of size `right - left + 1` contributes that many subarrays ending at `right`.

```
atMost(2) for [1, 0, 1, 0, 1]:
  right=0: sum=1, window=[1],         count += 1  = 1
  right=1: sum=1, window=[1,0],       count += 2  = 3
  right=2: sum=2, window=[1,0,1],     count += 3  = 6
  right=3: sum=2, window=[1,0,1,0],   count += 4  = 10
  right=4: sum=3 > 2 → shrink left
           sum=2, window=[0,1,0,1],   count += 4  = 14

atMost(1) for [1, 0, 1, 0, 1]:
  right=0: sum=1, window=[1],         count += 1  = 1
  right=1: sum=1, window=[1,0],       count += 2  = 3
  right=2: sum=2 > 1 → shrink left
           sum=1, window=[0,1],       count += 2  = 5
  right=3: sum=1, window=[0,1,0],     count += 3  = 8
  right=4: sum=2 > 1 → shrink left
           sum=1, window=[1,0,1] > 1 → shrink
           sum=1, window=[0,1],       count += 2  = 10

exactly(2) = atMost(2) - atMost(1) = 14 - 10 = 4  ✓
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public static int numSubarraysWithSum2(int[] nums, int goal) {
    return atMost(nums, goal) - atMost(nums, goal - 1);
}

private static int atMost(int[] nums, int k) {
    if (k < 0) return 0;
    int left = 0, sum = 0, count = 0;
    for (int right = 0; right < nums.length; right++) { // O(n)
        sum += nums[right];
        while (sum > k) { // O(1) amortized, each element enters/leaves once
            sum -= nums[left++];
        }
        count += right - left + 1;
    }
    return count;
}
```

### Python

```python []
def numSubarraysWithSum(self, nums: list[int], goal: int) -> int:
    def at_most(k: int) -> int:
        if k < 0:
            return 0
        res = 0
        left = 0
        cur = 0
        for right in range(len(nums)):  # O(n)
            cur += nums[right]
            while cur > k:  # each element enters/leaves at most once, O(n) total
                cur -= nums[left]
                left += 1
            res += right - left + 1
        return res

    return at_most(goal) - at_most(goal - 1)
```

### C++

```cpp []
int numSubarraysWithSum(vector<int>& nums, int goal) {
    return atMost(nums, goal) - atMost(nums, goal - 1);
}

int atMost(vector<int>& nums, int goal) {
    if (goal < 0) return 0;
    int count = 0, sum = 0, left = 0;
    for (int right = 0; right < (int)nums.size(); ++right) { // O(n)
        sum += nums[right];
        while (sum > goal) { // O(1) amortized
            sum -= nums[left++];
        }
        count += right - left + 1;
    }
    return count;
}
```

### Rust

```rust []
pub fn num_subarrays_with_sum_sliding(nums: Vec<i32>, goal: i32) -> i32 {
    fn at_most(nums: &[i32], goal: i32) -> i32 {
        if goal < 0 {
            return 0;
        }
        let (mut left, mut sum, mut count) = (0, 0, 0);
        for right in 0..nums.len() { // O(n)
            sum += nums[right];
            while sum > goal { // O(1) amortized
                sum -= nums[left];
                left += 1;
            }
            count += (right + 1 - left) as i32;
        }
        count
    }
    at_most(&nums, goal) - at_most(&nums, goal - 1)
}
```
