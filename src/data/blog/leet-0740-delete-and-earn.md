---
author: JZ
pubDatetime: 2026-08-23T06:00:00Z
modDatetime: 2026-08-23T06:00:00Z
title: LeetCode 740 Delete and Earn
featured: false
tags:
  - a-dynamic-programming
description:
  "Solutions for LeetCode 740, medium, tags: array, hash table, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 740](https://leetcode.com/problems/delete-and-earn/description/)

You are given an integer array `nums`. You want to maximize the number of points you get by performing the following operation any number of times:

- Pick any `nums[i]` and delete it to earn `nums[i]` points. Afterwards, you must delete **every** element equal to `nums[i] - 1` and **every** element equal to `nums[i] + 1`.

Return the **maximum number of points** you can earn by applying the above operation some number of times.

```
Example 1:

Input: nums = [3,4,2]
Output: 6
Explanation: You can perform the following operations:
- Delete 4 to earn 4 points. Consequently, 3 is also deleted. nums = [2].
- Delete 2 to earn 2 points. nums = [].
You earn a total of 6 points.

Example 2:

Input: nums = [2,2,3,3,3,4]
Output: 9
Explanation: You can perform the following operations:
- Delete a 3 to earn 3 points. All 2's and 4's are also deleted. nums = [3,3].
- Delete a 3 to earn 3 points. nums = [3].
- Delete a 3 to earn 3 points. nums = [].
You earn a total of 9 points.

Constraints:

1 <= nums.length <= 2 * 10^4
1 <= nums[i] <= 10^4
```

## Solution 1: DP on Frequency Array (House Robber)

### Idea

The key insight is that if you decide to earn points from value `v`, you must take **all** copies of `v` (taking one forces deletion of `v-1` and `v+1`, so you might as well take them all). This transforms the problem:

1. Build an `earn` array where `earn[v] = v * count(v)` — total points from taking all copies of `v`.
2. Now the problem becomes: pick values from `earn[1..maxVal]` such that no two picked values are adjacent — exactly **House Robber** (LeetCode 198).

```
nums = [2, 2, 3, 3, 3, 4]

Step 1: Build earn array
earn[2] = 2*2 = 4   earn[3] = 3*3 = 9   earn[4] = 4*1 = 4

Step 2: House Robber on earn[1..4]
index:     1     2     3     4
earn:      0     4     9     4
         +-----+-----+-----+-----+
prev2    |  0  |  0  |  4  |  9  |
prev1    |  0  |  4  |  9  |  9  |
         +-----+-----+-----+-----+
                                ^-- answer = 9
```

At each value `v`, we either:
- Skip `v`: keep `prev1` (best up through `v-1`)
- Take `v`: add `earn[v]` to `prev2` (best up through `v-2`, since `v-1` is excluded)

Complexity: Time $O(n + M)$ where $M$ = max value. Space $O(M)$ for the earn array.

#### Java

```java []
// O(n + maxVal) time, O(maxVal) space.
public static int deleteAndEarn(int[] nums) {
    int maxVal = 0;
    for (int n : nums) maxVal = Math.max(maxVal, n);
    int[] earn = new int[maxVal + 1];
    for (int n : nums) earn[n] += n; // O(n) — build earn array
    int prev2 = 0, prev1 = 0;
    for (int v = 1; v <= maxVal; v++) { // O(maxVal) — house robber
        int curr = Math.max(prev1, prev2 + earn[v]);
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

#### Python

```python []
# O(n + max_val) time, O(max_val) space.
def deleteAndEarn(self, nums: list[int]) -> int:
    max_val = max(nums)
    earn = [0] * (max_val + 1)  # O(max_val) space
    for n in nums:  # O(n)
        earn[n] += n
    prev, curr = 0, 0
    for i in range(1, max_val + 1):  # O(max_val) — house robber
        prev, curr = curr, max(curr, prev + earn[i])
    return curr
```

#### C++

```cpp []
// O(n + max_val) time, O(max_val) space.
int deleteAndEarn(vector<int> &nums) {
    int maxVal = *max_element(nums.begin(), nums.end());
    vector<int> earn(maxVal + 1, 0);
    for (int x : nums) earn[x] += x; // O(n) — build earn array
    int prev2 = 0, prev1 = 0;
    for (int v = 1; v <= maxVal; v++) { // O(max_val) — house robber
        int cur = max(prev1, prev2 + earn[v]);
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}
```

#### Rust

```rust []
/// O(n + max_val) time, O(max_val) space.
pub fn delete_and_earn(nums: Vec<i32>) -> i32 {
    let max_val = *nums.iter().max().unwrap() as usize;
    let mut earn = vec![0i64; max_val + 1]; // O(max_val) space
    for &v in &nums { earn[v as usize] += v as i64; } // O(n)
    let (mut prev, mut curr) = (0i64, 0i64);
    for i in 0..=max_val { // O(max_val) — house robber
        let tmp = curr;
        curr = curr.max(prev + earn[i]);
        prev = tmp;
    }
    curr as i32
}
```

## Solution 2: Sort + Group DP

### Idea

Solution 1 allocates an array up to `maxVal`, which is wasteful if values are sparse (e.g., `[1, 10000]`). Instead:

1. Count frequencies and sort the **unique** values.
2. Apply house robber logic only when consecutive unique values differ by exactly 1. When there's a gap, both adjacent values can be taken — no conflict.

```
nums = [1, 1, 1, 5, 5, 5]

sorted unique: [1, 5]
earn:           3  25

Since 5 ≠ 1+1 (gap exists), take both: 3 + 25 = 28? No — earn[1]=3, earn[5]=25, take both = 28.
Wait: answer is 18 because 1*3 + 5*3 = 3+15 = 18.
earn[1] = 1*3 = 3, earn[5] = 5*3 = 15, total = 3+15 = 18.  ✓
```

Complexity: Time $O(n + k \log k)$ where $k$ = number of distinct values. Space $O(k)$.

#### Java

```java []
// O(n + k log k) time, O(k) space where k = distinct values.
public static int deleteAndEarnSortGroup(int[] nums) {
    java.util.Map<Integer, Integer> countMap = new java.util.TreeMap<>();
    for (int n : nums) countMap.merge(n, 1, Integer::sum); // O(n)
    int[] keys = new int[countMap.size()];
    int[] earn = new int[countMap.size()];
    int idx = 0;
    for (var entry : countMap.entrySet()) {
        keys[idx] = entry.getKey();
        earn[idx] = entry.getKey() * entry.getValue();
        idx++;
    }
    int prev2 = 0, prev1 = earn[0];
    for (int i = 1; i < keys.length; i++) { // O(k) — group house robber
        int curr;
        if (keys[i] == keys[i - 1] + 1) curr = Math.max(prev1, prev2 + earn[i]);
        else curr = prev1 + earn[i]; // gap: safe to take both
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

#### Python

```python []
# O(n + k log k) time, O(k) space where k = distinct values.
def deleteAndEarn(self, nums: list[int]) -> int:
    from collections import Counter
    count = Counter(nums)
    vals = sorted(count.keys())  # O(k log k)
    prev, curr = 0, 0
    for i, v in enumerate(vals):  # O(k) — group house robber
        points = v * count[v]
        if i > 0 and vals[i - 1] == v - 1:
            prev, curr = curr, max(curr, prev + points)
        else:
            prev, curr = curr, curr + points  # gap: safe to take
    return curr
```

#### C++

```cpp []
// O(n + k log k) time, O(k) space where k = distinct values.
int deleteAndEarn(vector<int> &nums) {
    unordered_map<int, int> freq;
    for (int x : nums) freq[x] += x; // O(n)
    vector<int> keys;
    keys.reserve(freq.size());
    for (auto &[k, _] : freq) keys.push_back(k);
    sort(keys.begin(), keys.end()); // O(k log k)
    int prev2 = 0, prev1 = 0;
    for (int i = 0; i < (int)keys.size(); i++) { // O(k) — group house robber
        int cur;
        if (i > 0 && keys[i] == keys[i - 1] + 1)
            cur = max(prev1, prev2 + freq[keys[i]]);
        else
            cur = prev1 + freq[keys[i]]; // gap: safe to take both
        prev2 = prev1;
        prev1 = cur;
    }
    return prev1;
}
```

#### Rust

```rust []
/// O(n + k log k) time, O(k) space where k = distinct values.
pub fn delete_and_earn_sort(nums: Vec<i32>) -> i32 {
    use std::collections::HashMap;
    let mut freq: HashMap<i32, i64> = HashMap::new();
    for &v in &nums { *freq.entry(v).or_default() += v as i64; } // O(n)
    let mut keys: Vec<i32> = freq.keys().copied().collect();
    keys.sort_unstable(); // O(k log k)
    let (mut prev, mut curr) = (0i64, 0i64);
    for i in 0..keys.len() { // O(k) — group house robber
        let earn = freq[&keys[i]];
        if i > 0 && keys[i] == keys[i - 1] + 1 {
            let tmp = curr;
            curr = curr.max(prev + earn);
            prev = tmp;
        } else {
            prev = curr;
            curr += earn; // gap: safe to take
        }
    }
    curr as i32
}
```
