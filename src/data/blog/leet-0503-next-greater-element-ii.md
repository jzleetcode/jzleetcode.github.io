---
author: JZ
pubDatetime: 2026-09-24T06:00:00Z
modDatetime: 2026-09-24T06:00:00Z
title: LeetCode 503 Next Greater Element II
featured: true
tags:
  - a-array
  - a-stack
  - a-monotonic-stack
description:
  "Solutions for LeetCode 503, medium, tags: array, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 503](https://leetcode.com/problems/next-greater-element-ii/description/)

Given a circular integer array `nums` (i.e., the next element of `nums[nums.length - 1]` is `nums[0]`), return the next greater number for every element in `nums`.

The next greater number of a number `x` is the first greater number to its traversing-order next in the array, which means you could search circularly to find its next greater number. If it doesn't exist, return `-1` for this number.

```
Example 1:

Input: nums = [1,2,1]
Output: [2,-1,2]
Explanation: The first 1's next greater number is 2;
The number 2 can't find next greater number.
The second 1's next greater number needs to search circularly, which is also 2.

Example 2:

Input: nums = [1,2,3,4,3]
Output: [2,3,4,-1,4]

Constraints:

1 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
```

## Solution 1: Monotonic Stack with Double Traversal

### Idea

The challenge compared to the standard "next greater element" problem is the circular array — the answer for an element near the end might wrap around to the beginning.

The key trick: iterate through the array **twice** (indices `0` to `2n-1`), using `i % n` to wrap around. This simulates the circular behavior. We maintain a **monotonic decreasing stack** of indices. For each element, we pop all stack entries that are smaller, recording the current element as their "next greater." We only push indices during the first pass (`i < n`) to avoid duplicates.

Each index is pushed and popped at most once across both passes, so the total work is linear.

```
nums = [1, 2, 3, 4, 3], n=5
Condition: nums[stack.top()] < nums[i%n]

Pass 1 (i=0..4):
i=0: stack empty, push 0                      stack=[0]
i=1: nums[0]=1 < nums[1]=2 → pop, res[0]=2   stack=[]
     push 1                                   stack=[1]
i=2: nums[1]=2 < nums[2]=3 → pop, res[1]=3   stack=[]
     push 2                                   stack=[2]
i=3: nums[2]=3 < nums[3]=4 → pop, res[2]=4   stack=[]
     push 3                                   stack=[3]
i=4: nums[3]=4 > nums[4]=3, no pop
     push 4                                   stack=[3,4]

Pass 2 (i=5..9, i%n = 0..4, no pushes):
i=5, i%n=0, nums[0]=1
  nums[4]=3, 3 < 1? no → stop                 stack=[3,4]
i=6, i%n=1, nums[1]=2
  nums[4]=3, 3 < 2? no → stop                 stack=[3,4]
i=7, i%n=2, nums[2]=3
  nums[4]=3, 3 < 3? no → stop                 stack=[3,4]
i=8, i%n=3, nums[3]=4
  nums[4]=3, 3 < 4? yes → pop 4, res[4]=4     stack=[3]
  nums[3]=4, 4 < 4? no → stop                 stack=[3]
i=9, i%n=4, nums[4]=3
  nums[3]=4, 4 < 3? no → stop                 stack=[3]

res = [2, 3, 4, -1, 4] ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static int[] nextGreaterElements(int[] nums) {
    int n = nums.length;
    int[] res = new int[n];
    Arrays.fill(res, -1);
    Deque<Integer> stack = new ArrayDeque<>(); // monotonic decreasing stack of indices
    for (int i = 0; i < 2 * n; i++) { // O(n)
        while (!stack.isEmpty() && nums[stack.peek()] < nums[i % n]) { // O(n) total
            res[stack.pop()] = nums[i % n];
        }
        if (i < n) stack.push(i);
    }
    return res; // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def nextGreaterElements(self, nums: list[int]) -> list[int]:
        n = len(nums)
        res = [-1] * n  # O(n) space
        stack = []  # monotonic decreasing stack of indices, O(n) space
        for i in range(2 * n):  # O(n), each index pushed/popped at most once across both passes
            while stack and nums[stack[-1]] < nums[i % n]:  # O(n) total pops
                res[stack.pop()] = nums[i % n]
            if i < n:
                stack.append(i)
        return res  # Time O(n), Space O(n)
```

#### C++

```cpp []
vector<int> nextGreaterElements(vector<int>& nums) {
    int n = nums.size();
    vector<int> res(n, -1); // O(n) space
    stack<int> st; // monotonic decreasing stack of indices, O(n) space
    for (int i = 0; i < 2 * n; i++) { // O(n)
        while (!st.empty() && nums[st.top()] < nums[i % n]) { // O(n) total pops
            res[st.top()] = nums[i % n];
            st.pop();
        }
        if (i < n) st.push(i);
    }
    return res; // Time O(n), Space O(n)
}
```

#### Rust

```rust []
pub fn next_greater_elements(nums: Vec<i32>) -> Vec<i32> {
    let n = nums.len();
    let mut res = vec![-1i32; n]; // O(n) space
    let mut stack: Vec<usize> = Vec::new(); // monotonic decreasing stack of indices, O(n) space
    for i in 0..2 * n { // O(n), each index pushed/popped at most once
        while let Some(&j) = stack.last() { // O(n) total pops
            if nums[j] < nums[i % n] {
                stack.pop();
                res[j] = nums[i % n];
            } else {
                break;
            }
        }
        if i < n {
            stack.push(i);
        }
    }
    res // Time O(n), Space O(n)
}
```

## Solution 2: Brute Force

### Idea

For each element, scan forward circularly through the remaining `n-1` positions to find the first element that is strictly greater.

Complexity: Time $O(n^2)$, Space $O(n)$.

#### Python

```python []
class Solution2:
    def nextGreaterElements(self, nums: list[int]) -> list[int]:
        n = len(nums)
        res = [-1] * n  # O(n) space
        for i in range(n):  # O(n)
            for j in range(1, n):  # O(n)
                if nums[(i + j) % n] > nums[i]:
                    res[i] = nums[(i + j) % n]
                    break
        return res  # Time O(n^2), Space O(n)
```
