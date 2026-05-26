---
author: JZ
pubDatetime: 2026-05-26T10:06:00Z
modDatetime: 2026-05-26T10:06:00Z
title: LeetCode 287 Find the Duplicate Number
featured: true
tags:
  - a-array
  - a-two-pointers
  - a-binary-search
description:
  "Solutions for LeetCode 287, medium, tags: array, two pointers, binary search, bit manipulation."
---

## Table of contents

## Description

Question Links: [LeetCode 287](https://leetcode.com/problems/find-the-duplicate-number/description/)

Given an array of integers `nums` containing `n + 1` integers where each integer is in the range `[1, n]` inclusive.

There is only one repeated number in nums, return this repeated number.

You must solve the problem **without** modifying the array `nums` and uses only constant extra space.

```
Example 1:

Input: nums = [1,3,4,2,2]
Output: 2

Example 2:

Input: nums = [3,1,3,4,2]
Output: 3

Example 3:

Input: nums = [3,3,3,3,3]
Output: 3
```

**Constraints:**

- `1 <= n <= 10^5`
- `nums.length == n + 1`
- `1 <= nums[i] <= n`
- All the integers in nums appear only once except for precisely one integer which appears two or more times.

**Follow up:**

- How can we prove that at least one duplicate number must exist in nums? (Pigeonhole principle)
- Can you solve the problem in linear runtime complexity?

## Idea1

Treat the array as a linked list where index `i` points to node `nums[i]`. Since values are in `[1, n]` and there are `n+1` entries, a cycle must exist (pigeonhole principle), and the entrance to the cycle is the duplicate value.

We use Floyd's cycle detection (tortoise and hare):

```
Array: [1, 3, 4, 2, 2]  (indices 0..4)

Follow the "links":
0 -> 1 -> 3 -> 2 -> 4 -> 2 (cycle!)
                    ^       |
                    +-------+

Phase 1 (find meeting point):
  slow: 0->1->3->2->4->2
  fast: 0->3->4->3->4->3
  Meet at node 4? Let's trace:
    slow=nums[0]=1, fast=nums[nums[0]]=nums[1]=3
    slow=nums[1]=3, fast=nums[nums[3]]=nums[2]=4
    slow=nums[3]=2, fast=nums[nums[4]]=nums[2]=4
    slow=nums[2]=4, fast=nums[nums[4]]=nums[2]=4
    slow==fast==4

Phase 2 (find cycle entrance):
  slow2=nums[0]=1, slow=nums[4]=2
  slow2=nums[1]=3, slow=nums[2]=4
  slow2=nums[3]=2, slow=nums[4]=2
  slow2==slow==2 -> answer is 2
```

Complexity: Time $O(n)$ — each phase traverses at most $n$ nodes, Space $O(1)$ — only pointer variables.

### Java

```java []
public class FindDuplicate {
    // solution 1, two pointers, O(n) time, O(1) space.
    public static int findDuplicate1(int[] nums) {
        int slow = 0, fast = 0;
        do {
            slow = nums[slow];       // tortoise: one step
            fast = nums[nums[fast]]; // hare: two steps
        } while (slow != fast);      // Phase 1: meet inside cycle
        slow = 0;                    // Phase 2: find entrance
        while (slow != fast) {
            slow = nums[slow];
            fast = nums[fast];
        }
        return slow;
    }
}
```

### Python

```python []
class Solution:
    def findDuplicate(self, nums: list[int]) -> int:
        """Floyd's cycle detection. O(n) time, O(1) space."""
        slow = nums[0]
        fast = nums[0]
        while True:
            slow = nums[slow]       # one step — O(1)
            fast = nums[nums[fast]] # two steps — O(1)
            if slow == fast:
                break               # Phase 1 done — O(n) total

        slow = nums[0]
        while slow != fast:         # Phase 2 — O(n)
            slow = nums[slow]
            fast = nums[fast]
        return slow
```

### C++

```cpp []
class Solution287 {
public:
    // Floyd's cycle detection. O(n) time, O(1) space.
    static int findDuplicate(vector<int>& nums) {
        int slow = nums[0], fast = nums[0];
        do {
            slow = nums[slow];       // one step
            fast = nums[nums[fast]]; // two steps
        } while (slow != fast);

        slow = nums[0];
        while (slow != fast) {
            slow = nums[slow];
            fast = nums[fast];
        }
        return slow;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Floyd's cycle detection. O(n) time, O(1) space.
    pub fn find_duplicate(nums: Vec<i32>) -> i32 {
        let mut slow = nums[0] as usize;
        let mut fast = nums[0] as usize;
        loop {
            slow = nums[slow] as usize;              // tortoise: one step
            fast = nums[nums[fast] as usize] as usize; // hare: two steps
            if slow == fast { break; }               // meet in cycle — O(n)
        }
        let mut slow2 = nums[0] as usize;
        while slow2 != slow {
            slow2 = nums[slow2] as usize;            // both one step — O(n)
            slow = nums[slow] as usize;
        }
        slow as i32
    }
}
```

## Idea2

Binary search on the **value range** `[1, n]`, not on indices. For a candidate value `mid`, count how many numbers in the array are `<= mid`. By the pigeonhole principle, if `count > mid`, the duplicate must be in `[1, mid]`; otherwise it's in `[mid+1, n]`.

```
Array: [1, 3, 4, 2, 2], n=4, value range [1,4]

Iteration 1: lo=1, hi=4, mid=2
  count(x <= 2) = 3 (elements: 1,2,2)
  3 > 2 -> duplicate in [1,2], hi=2

Iteration 2: lo=1, hi=2, mid=1
  count(x <= 1) = 1
  1 <= 1 -> duplicate in [2,2], lo=2

lo==hi==2 -> answer is 2
```

Complexity: Time $O(n \log n)$ — $O(\log n)$ binary search iterations, each scanning $O(n)$ elements, Space $O(1)$ — only a few variables.

### Java

```java []
public class FindDuplicate {
    // Binary search on value range. O(n log n) time, O(1) space.
    public static int findDuplicate3(int[] nums) {
        int lo = 1, hi = nums.length - 1;       // value range [1, n]
        while (lo < hi) {                        // O(log n) iterations
            int mid = lo + (hi - lo) / 2;
            int count = 0;
            for (int num : nums)                 // O(n) per iteration
                if (num <= mid) count++;
            if (count > mid) hi = mid;           // pigeonhole: dup in [lo, mid]
            else lo = mid + 1;
        }
        return lo;
    }
}
```

### Python

```python []
class Solution2:
    def findDuplicate(self, nums: list[int]) -> int:
        """Binary search on value range. O(n log n) time, O(1) space."""
        lo, hi = 1, len(nums) - 1               # value range [1, n]
        while lo < hi:                           # O(log n) iterations
            mid = (lo + hi) // 2
            count = sum(1 for x in nums if x <= mid)  # O(n)
            if count > mid:
                hi = mid
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
class Solution287 {
public:
    // Binary search on value range. O(n log n) time, O(1) space.
    static int findDuplicate2(vector<int>& nums) {
        int lo = 1, hi = static_cast<int>(nums.size()) - 1;
        while (lo < hi) {                            // O(log n) iterations
            int mid = lo + (hi - lo) / 2;
            int count = 0;
            for (int num : nums)                     // O(n) per iteration
                if (num <= mid) count++;
            if (count > mid) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Binary search on value range. O(n log n) time, O(1) space.
    pub fn find_duplicate_binary_search(nums: Vec<i32>) -> i32 {
        let mut lo = 1i32;
        let mut hi = nums.len() as i32 - 1;
        while lo < hi {                                  // O(log n) iterations
            let mid = lo + (hi - lo) / 2;
            let count = nums.iter().filter(|&&x| x <= mid).count() as i32; // O(n)
            if count > mid { hi = mid; }
            else { lo = mid + 1; }
        }
        lo
    }
}
```
