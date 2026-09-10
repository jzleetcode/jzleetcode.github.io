---
author: JZ
pubDatetime: 2026-09-10T10:37:00Z
modDatetime: 2026-09-10T10:37:00Z
title: LeetCode 1679 Max Number of K-Sum Pairs
featured: true
tags:
  - a-hash
  - a-two-pointer
  - a-sorting
description:
  "Solutions for LeetCode 1679, medium, tags: array, hash table, two pointers, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 1679](https://leetcode.com/problems/max-number-of-k-sum-pairs/description/)

You are given an integer array `nums` and an integer `k`.

In one operation, you can pick two numbers from the array whose sum equals `k` and remove them from the array.

Return _the maximum number of operations you can perform on the array_.

```
Example 1:

Input: nums = [1,2,3,4], k = 5
Output: 2
Explanation: Starting with nums = [1,2,3,4]:
- Remove numbers 1 and 4, then nums = [2,3]
- Remove numbers 2 and 3, then nums = []
There are no more pairs that sum up to 5, hence a total of 2 operations.

Example 2:

Input: nums = [3,1,3,4,3], k = 6
Output: 1
Explanation: Starting with nums = [3,1,3,4,3]:
- Remove the first two 3's, then nums = [1,4,3]
There are no more pairs that sum up to 6, hence a total of 1 operation.

Constraints:

1 <= nums.length <= 10^5
1 <= nums[i] <= 10^9
1 <= k <= 10^9
```

## Solution 1: Hash Map (Single Pass)

### Idea

Scan left to right, maintaining a frequency map of values we have seen but not yet paired. For each element `x`, check if `k - x` exists in the map. If so, pair them (decrement the complement's count). Otherwise, add `x` to the map for future pairing.

```
nums = [1,2,3,4], k = 5

x=1: map={}, complement 4 not found -> map={1:1}
x=2: map={1:1}, complement 3 not found -> map={1:1, 2:1}
x=3: map={1:1, 2:1}, complement 2 found! pair (2,3) -> ops=1, map={1:1, 2:0}
x=4: map={1:1, 2:0}, complement 1 found! pair (1,4) -> ops=2, map={1:0, 2:0}
```

Each element is processed once with $O(1)$ hash operations.

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static int maxOperations(int[] nums, int k) {
    HashMap<Integer, Integer> freq = new HashMap<>(); // O(n) space
    int ops = 0;
    for (int num : nums) { // O(n) time
        int complement = k - num;
        Integer count = freq.get(complement);
        if (count != null && count > 0) {
            ops++;
            freq.put(complement, count - 1);
        } else {
            freq.merge(num, 1, Integer::sum);
        }
    }
    return ops;
}
```

#### Python

```python []
def maxOperations(self, nums: list[int], k: int) -> int:
    cnt = Counter()  # O(n) space
    res = 0
    for x in nums:  # O(n)
        if cnt[k - x] > 0:  # O(1) complement found
            res += 1
            cnt[k - x] -= 1
        else:
            cnt[x] += 1  # O(1) store for later
    return res
```

#### C++

```cpp []
int maxOperations(vector<int> &nums, int k) {
    unordered_map<int, int> freq;          // freq[v] = unseen count of v
    int ops = 0;
    for (int num : nums) {
        int complement = k - num;          // O(1) lookup for complement
        if (freq[complement] > 0) {
            freq[complement]--;            // consume one complement
            ops++;
        } else {
            freq[num]++;                   // store for future match
        }
    }
    return ops;
}
```

#### Rust

```rust []
pub fn max_operations(nums: Vec<i32>, k: i32) -> i32 {
    let mut cnt: HashMap<i32, i32> = HashMap::new(); // value -> remaining count
    let mut ops = 0;
    for &n in &nums {
        let complement = k - n; // O(1) complement lookup
        if let Some(c) = cnt.get_mut(&complement) {
            if *c > 0 {
                *c -= 1; // consume one complement
                ops += 1;
                continue;
            }
        }
        *cnt.entry(n).or_insert(0) += 1; // store for future pairing
    }
    ops
}
```

## Solution 2: Sort + Two Pointers

### Idea

Sort the array, then use two pointers from both ends. If the sum of the two pointed values equals `k`, count a pair and move both inward. If the sum is too small, advance the left pointer. If too large, retreat the right pointer.

```
nums = [3,1,3,4,3], k = 6

sorted: [1,3,3,3,4]
         L         R

lo=0, hi=4: 1+4=5 < 6 -> lo++
lo=1, hi=4: 3+4=7 > 6 -> hi--
lo=1, hi=3: 3+3=6 == 6 -> ops=1, lo++, hi--
lo=2, hi=2: lo==hi, stop

Result: 1
```

Sorting dominates at $O(n \log n)$. The two-pointer scan is $O(n)$. No extra space beyond the sort.

Complexity: Time $O(n \log n)$, Space $O(1)$ extra.

#### Java

```java []
public static int maxOperationsTwoPointers(int[] nums, int k) {
    Arrays.sort(nums); // O(n log n)
    int lo = 0, hi = nums.length - 1;
    int ops = 0;
    while (lo < hi) { // O(n)
        int sum = nums[lo] + nums[hi];
        if (sum == k) {
            ops++;
            lo++;
            hi--;
        } else if (sum < k) {
            lo++;
        } else {
            hi--;
        }
    }
    return ops;
}
```

#### Python

```python []
def maxOperations(self, nums: list[int], k: int) -> int:
    nums.sort()  # O(n log n)
    lo, hi = 0, len(nums) - 1
    res = 0
    while lo < hi:  # O(n)
        s = nums[lo] + nums[hi]
        if s == k:
            res += 1
            lo += 1
            hi -= 1
        elif s < k:
            lo += 1
        else:
            hi -= 1
    return res
```

#### C++

```cpp []
int maxOperationsTwoPtr(vector<int> &nums, int k) {
    sort(nums.begin(), nums.end());        // O(n log n) sort
    int lo = 0, hi = (int)nums.size() - 1;
    int ops = 0;
    while (lo < hi) {                      // O(n) two-pointer scan
        int sum = nums[lo] + nums[hi];
        if (sum == k) {
            ops++;
            lo++;
            hi--;
        } else if (sum < k) {
            lo++;                          // need larger sum
        } else {
            hi--;                          // need smaller sum
        }
    }
    return ops;
}
```

#### Rust

```rust []
pub fn max_operations_two_ptr(mut nums: Vec<i32>, k: i32) -> i32 {
    nums.sort_unstable(); // O(n log n)
    let (mut lo, mut hi) = (0usize, nums.len().wrapping_sub(1));
    let mut ops = 0;
    while lo < hi && hi < nums.len() {
        let sum = nums[lo] + nums[hi];
        if sum == k {
            ops += 1;
            lo += 1;
            hi = hi.wrapping_sub(1); // move both inward
        } else if sum < k {
            lo += 1; // need larger sum
        } else {
            hi = hi.wrapping_sub(1); // need smaller sum
        }
    }
    ops
}
```
