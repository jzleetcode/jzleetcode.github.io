---
author: JZ
pubDatetime: 2026-06-07T10:06:00Z
modDatetime: 2026-06-07T10:06:00Z
title: LeetCode 525 Contiguous Array
featured: true
tags:
  - a-hash
  - a-prefix-sum
description:
  "Solutions for LeetCode 525, medium, tags: array, hash table, prefix sum."
---

## Table of contents

## Description

Given a binary array `nums`, return the maximum length of a contiguous subarray with an equal number of `0` and `1`.

### Constraints

- `1 <= nums.length <= 10^5`
- `nums[i]` is either `0` or `1`

Link: [LeetCode 525](https://leetcode.com/problems/contiguous-array/)

## Idea

**Key Insight:** Replace every `0` with `-1`. Now the problem becomes: find the longest subarray with sum equal to `0`. This is a classic prefix sum + hash map problem.

If `prefix_sum[j] == prefix_sum[i]`, then the subarray `(i, j]` sums to zero — meaning it has equal `0`s and `1`s.

```
nums:       [0, 0, 1, 0, 0, 0, 1, 1]
transformed:[-1,-1, 1,-1,-1,-1, 1, 1]
prefix_sum: [-1,-2,-1,-2,-3,-4,-3,-2]
                                     ^
                                     index 7, prefix=-2 first seen at index 1
                                     → subarray [2..7] length = 7-1 = 6
```

**Algorithm:**
1. Initialize a hash map with `{0: -1}` (prefix sum `0` at virtual index `-1`).
2. Iterate through the array, maintaining a running prefix sum (add `+1` for `1`, `-1` for `0`).
3. If the current prefix sum was seen before at index `j`, update `max_len = max(max_len, i - j)`.
4. Otherwise, store the first occurrence of this prefix sum.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
public static int findMaxLength(int[] nums) {
    Map<Integer, Integer> firstIndex = new HashMap<>(); // O(n) space
    firstIndex.put(0, -1);
    int prefix = 0;
    int maxLen = 0;
    for (int i = 0; i < nums.length; i++) { // O(n)
        prefix += (nums[i] == 0) ? -1 : 1;
        if (firstIndex.containsKey(prefix)) {
            maxLen = Math.max(maxLen, i - firstIndex.get(prefix));
        } else {
            firstIndex.put(prefix, i);
        }
    }
    return maxLen;
}
```

### Python

```python []
def findMaxLength(self, nums: list[int]) -> int:
    prefix_map = {0: -1}  # O(n) space
    max_len = 0
    count = 0
    for i, num in enumerate(nums):  # O(n)
        count += 1 if num == 1 else -1
        if count in prefix_map:
            max_len = max(max_len, i - prefix_map[count])
        else:
            prefix_map[count] = i
    return max_len
```

### C++

```cpp []
int findMaxLength(vector<int>& nums) {
    unordered_map<int, int> prefixIndex; // O(n) space
    prefixIndex[0] = -1;
    int maxLen = 0, sum = 0;
    for (int i = 0; i < (int)nums.size(); ++i) { // O(n)
        sum += (nums[i] == 0 ? -1 : 1);
        if (prefixIndex.count(sum)) {
            maxLen = max(maxLen, i - prefixIndex[sum]);
        } else {
            prefixIndex[sum] = i;
        }
    }
    return maxLen;
}
```

### Rust

```rust []
pub fn find_max_length(nums: Vec<i32>) -> i32 {
    let mut map: HashMap<i32, i32> = HashMap::new(); // O(n) space
    map.insert(0, -1);
    let mut prefix_sum = 0;
    let mut max_len = 0;
    for (i, &num) in nums.iter().enumerate() { // O(n)
        prefix_sum += if num == 1 { 1 } else { -1 };
        if let Some(&prev_idx) = map.get(&prefix_sum) {
            max_len = max_len.max(i as i32 - prev_idx);
        } else {
            map.insert(prefix_sum, i as i32);
        }
    }
    max_len
}
```
