---
author: JZ
pubDatetime: 2026-09-29T10:36:00Z
modDatetime: 2026-09-29T10:36:00Z
title: LeetCode 945 Minimum Increment to Make Array Unique
featured: true
tags:
  - a-array
  - a-greedy
  - a-sorting
  - a-counting
description:
  "Solutions for LeetCode 945, medium, tags: array, greedy, sorting, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 945](https://leetcode.com/problems/minimum-increment-to-make-array-unique/description/)

You are given an integer array `nums`. In one move, you can pick an index `i` where `0 <= i < nums.length` and increment `nums[i]` by 1.

Return the minimum number of moves to make every value in `nums` unique.

The test cases are generated so that the answer fits in a 32-bit integer.

```
Example 1:

Input: nums = [1,2,2]
Output: 1
Explanation: After 1 move, the array could be [1, 2, 3].

Example 2:

Input: nums = [3,2,1,2,1,7]
Output: 6
Explanation: After 6 moves, the array could be [3, 4, 1, 2, 5, 7].
It can be shown that it is impossible for the answer to be less than 6.
```

**Constraints:**

- `1 <= nums.length <= 10^5`
- `0 <= nums[i] <= 10^5`

## Idea1

Sort the array, then scan left to right. Whenever the current element is not greater than the previous one, we must bump it to `previous + 1`. The cost of that bump is the difference. This greedy strategy is optimal because sorting brings duplicates together and each bump is the smallest possible.

```
nums (sorted): [1, 1, 2, 2, 3, 7]

Step 1: nums[1]=1 <= nums[0]=1 → bump to 2, cost 1  → [1, 2, 2, 2, 3, 7]
Step 2: nums[2]=2 <= nums[1]=2 → bump to 3, cost 1  → [1, 2, 3, 2, 3, 7]
Step 3: nums[3]=2 <= nums[2]=3 → bump to 4, cost 2  → [1, 2, 3, 4, 3, 7]
Step 4: nums[4]=3 <= nums[3]=4 → bump to 5, cost 2  → [1, 2, 3, 4, 5, 7]

Total moves = 1 + 1 + 2 + 2 = 6
```

Complexity: Time $O(n \log n)$ — dominated by sort, Space $O(\text{sort})$.

### Java

```java []
public static int sortGreedy(int[] nums) {
    Arrays.sort(nums); // O(n log n)
    int moves = 0;
    for (int i = 1; i < nums.length; i++) { // O(n) scan
        if (nums[i] <= nums[i - 1]) {
            int target = nums[i - 1] + 1;
            moves += target - nums[i];
            nums[i] = target;
        }
    }
    return moves;
}
```

### Python

```python []
class Solution:
    def minIncrementForUnique(self, nums: list[int]) -> int:
        nums.sort()  # O(n log n)
        res = 0
        for i in range(1, len(nums)):  # O(n)
            if nums[i] <= nums[i - 1]:
                target = nums[i - 1] + 1
                res += target - nums[i]
                nums[i] = target
        return res
```

### C++

```cpp []
int minIncrementForUnique(vector<int>& nums) {
    sort(nums.begin(), nums.end()); // O(n log n)
    int moves = 0;
    for (int i = 1; i < (int)nums.size(); ++i) { // O(n)
        if (nums[i] <= nums[i - 1]) {
            int target = nums[i - 1] + 1;
            moves += target - nums[i];
            nums[i] = target;
        }
    }
    return moves;
}
```

### Rust

```rust []
pub fn min_increment_for_unique(nums: &mut Vec<i32>) -> i32 {
    nums.sort(); // O(n log n)
    let mut moves = 0i32;
    for i in 1..nums.len() {
        if nums[i] <= nums[i - 1] {
            let need = nums[i - 1] + 1;
            moves += need - nums[i]; // O(n) total
            nums[i] = need;
        }
    }
    moves
}
```

## Idea2

Use a frequency (counting sort) approach. Build a count array, then sweep from index 0 upward. Whenever a slot has more than one element, push the extras to the next slot. Each pushed element costs 1 move (it was incremented by 1). This avoids the $O(n \log n)$ sort at the expense of extra space.

```
nums: [3, 2, 1, 2, 1, 7]

count: idx  0  1  2  3  4  5  6  7
           [0, 2, 2, 1, 0, 0, 0, 1]

Sweep:
  i=1: count[1]=2 > 1, push 1 extra to i=2 → count=[0,1,3,1,0,0,0,1], moves=1
  i=2: count[2]=3 > 1, push 2 extras to i=3 → count=[0,1,1,3,0,0,0,1], moves=3
  i=3: count[3]=3 > 1, push 2 extras to i=4 → count=[0,1,1,1,2,0,0,1], moves=5
  i=4: count[4]=2 > 1, push 1 extra to i=5  → count=[0,1,1,1,1,1,0,1], moves=6

Total moves = 6 ✓
```

Complexity: Time $O(n + \text{max\_val})$ — one pass to build counts, one sweep, Space $O(n + \text{max\_val})$ — the count array.

### Java

```java []
public static int countingSort(int[] nums) {
    int max = 0;
    for (int v : nums) max = Math.max(max, v);
    int[] count = new int[nums.length + max + 1]; // O(n + max_val) space
    for (int v : nums) count[v]++; // O(n) frequency count
    int moves = 0;
    for (int i = 0; i < count.length - 1; i++) { // O(n + max_val) sweep
        if (count[i] > 1) {
            int extras = count[i] - 1;
            count[i + 1] += extras;
            moves += extras;
        }
    }
    return moves;
}
```

### Python

```python []
class Solution2:
    def minIncrementForUnique(self, nums: list[int]) -> int:
        if not nums:
            return 0
        max_val = max(nums) + len(nums)  # upper bound after pushes
        count = [0] * (max_val + 1)
        for v in nums:  # O(n)
            count[v] += 1
        res = 0
        for i in range(max_val):  # O(n + max_val)
            if count[i] > 1:
                extra = count[i] - 1
                count[i + 1] += extra
                res += extra
        return res
```

### C++

```cpp []
int minIncrementForUnique2(vector<int>& nums) {
    if (nums.empty()) return 0;
    const int MAXV = 200001; // nums[i] <= 1e5, duplicates can push up to ~2e5
    vector<int> cnt(MAXV, 0);
    for (int x : nums) cnt[x]++; // O(n)
    int moves = 0;
    for (int i = 0; i < MAXV - 1; ++i) { // O(max_val) sweep
        if (cnt[i] > 1) {
            int extra = cnt[i] - 1;
            cnt[i + 1] += extra;
            moves += extra;
        }
    }
    return moves;
}
```

### Rust

```rust []
pub fn min_increment_for_unique2(nums: &[i32]) -> i32 {
    let max_val = *nums.iter().max().unwrap_or(&0) as usize;
    let size = max_val + nums.len() + 1; // O(max_val + n) space
    let mut count = vec![0i32; size];
    for &v in nums {
        count[v as usize] += 1; // O(n)
    }
    let mut moves = 0i32;
    for i in 0..size - 1 {
        if count[i] > 1 {
            let extras = count[i] - 1;
            count[i + 1] += extras; // O(1) per slot
            moves += extras;
        }
    }
    moves
}
```
