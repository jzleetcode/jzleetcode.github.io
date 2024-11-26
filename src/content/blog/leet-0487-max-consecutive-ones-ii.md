---
author: JZ
pubDatetime: 2024-11-24T08:23:00Z
modDatetime: 2024-11-24T08:23:00Z
title: LeetCode 487 LintCode 883 Max Consecutive Ones II
featured: true
tags:
  - a-dp
  - a-two-pointers
  - a-sliding-window
  - a-array
  - c-google
  - leetcode-locked
description:
  "Solutions for LeetCode 487, LintCode 833, medium, tags: array, dynamic programming, sliding window, two pointers, companies: google."
---

## Table of contents

## Description

Given a binary array `nums`, return _the maximum number of consecutive_ `1`_'s in the array if you can flip at most one_ `0`.

```
Example 1:

Input: nums = [1,0,1,1,0]
Output: 4
Explanation:
- If we flip the first zero, nums becomes [1,1,1,1,0] and we have 4 consecutive ones.
- If we flip the second zero, nums becomes [1,0,1,1,1] and we have 3 consecutive ones.
The max number of consecutive ones is 4.

Example 2:

Input: nums = [1,0,1,1,0,1]
Output: 4
Explanation:
- If we flip the first zero, nums becomes [1,1,1,1,0,1] and we have 4 consecutive ones.
- If we flip the second zero, nums becomes [1,0,1,1,1,1] and we have 4 consecutive ones.
The max number of consecutive ones is 4.
```

**Constraints:**

-   `1 <= nums.length <= 10^5`
-   `nums[i]` is either `0` or `1`.

**Follow up:** What if the input numbers come in one by one as an infinite stream? In other words, you can't store all numbers coming from the stream as it's too large to hold in memory. Could you solve it efficiently?

## Solution

### Idea

We can maintain two pointers left and right, and the remaining flips we could use.

1. This method can generalize for more than one （`k`) flip allowed.
2. We maintain `l` and `r` two pointers where we can make the numbers all equal to 1 within `[l,r)`.
3. We decrement `k` if we see a zero.
4. We only start examining left side when `k<0`, i.e., we used up all `k` flips. The window will only increase and never shrinks. If `k<0`, we move left pointer to the right by one. We increment `k` if left pointer was pointing to a zero because we can now use one more flip.

Complexity: Time O(n), Space O(1).

#### Java

```java
 class Solution2 {
    public int findMaxConsecutiveOnes(int[] nums) {
        int l = 0, r = 0;
        int k = 1;
        while (r < nums.length) {
            if (nums[r++] == 0) --k;
            if (k < 0 && nums[l++] == 0) ++k; // only increment when k<0, window never shrinks
        }
        return r - l;
    }
}
```

#### Python

```python
class Solution:
    """83 ms, 5.28 mb"""
    def find_max_consecutive_ones(self, nums: List[int]) -> int:
        l, r, k, n = 0, 0, 1, len(nums)
        while r < n:
            k -= nums[r] == 0
            r += 1
            if k < 0:
                k += nums[l] == 0
                l += 1
        return r - l
```

### Idea for the Follow-Up

In the solution above, we never shrink the sliding window after it grows. This requires access to `nums[l]` to check whether the value is 0 so we can decide whether we can increment k back up by one.

1. To avoid having to look up `nums[l]`, we can keep a queue of the indexes for the last `k` zero elements.
2. When `k<0`, we no longer increment `l` by one but move `l` one past the first index in the queue.
3. There can be up to `k` zeroes within `[l,r)`. So we take the maximum and keep the window size updated in `res`.

Complexity: Time O(n), Space O(k).

If you know of a better solution for the follow-up, please comment.

#### Java

```java
public int followUp(int[] nums) {
    int l = 0, r = 0, k = 1, n = nums.length, res = 0;
    ArrayDeque<Integer> q = new ArrayDeque<>();
    while (r < n) {
        if (nums[r++] == 0) {
            --k;
            q.add(r - 1);
        }
        while (k < 0) {
            l = q.remove() + 1;
            ++k;
        }
        res = Math.max(res, r - l);
    }
    return res;
}
```

Unit Test

```java
@ParameterizedTest
@CsvSource({
        "'1,0,1,1,0,0,0,0', 4",
        "'1,0,1,1,0,1', 4",
        "'1,0,1,1,0', 4",
        "'1,0,1,0,1', 3",
        "'1,1,1', 3"
})
void test(@ConvertWith(IntegerArrayConverter.class) Integer[] nums, int expected) {
    int[] numsP = IntArrayUtil.unBoxIntegerArray(nums);
    assertEquals(expected, tbt1.findMaxConsecutiveOnes(numsP));
    assertEquals(expected, tbt1.followUp(numsP));
}
```

#### Python

```python
def follow_up(selfs, nums: List[int]) -> int:
    res, l, r, k, n, q = 0, 0, 0, 1, len(nums), deque()
    while r < n:
        if nums[r] == 0:
            k -= 1
            q.append(r)
        r += 1
        if k < 0:
            l = q.popleft() + 1
            k += 1
        res = max(res, r - l)
    return res
```
