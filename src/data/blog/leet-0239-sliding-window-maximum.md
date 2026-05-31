---
author: JZ
pubDatetime: 2026-05-31T06:00:00Z
modDatetime: 2026-05-31T06:00:00Z
title: LeetCode 239 Sliding Window Maximum
featured: true
tags:
  - a-array
  - a-queue
  - a-sliding-window
  - a-monotonic-queue
  - a-heap
description:
  "Solutions for LeetCode 239, hard, tags: array, queue, sliding window, heap, monotonic queue."
---

## Table of contents

## Description

Question Links: [LeetCode 239](https://leetcode.com/problems/sliding-window-maximum/description/)

You are given an array of integers `nums`, there is a sliding window of size `k` which is moving from the very left of the array to the very right. You can only see the `k` numbers in the window. Each time the sliding window moves right by one position.

Return the max sliding window.

```
Example 1:

Input: nums = [1,3,-1,-3,5,3,6,7], k = 3
Output: [3,3,5,5,6,7]
Explanation:
Window position                Max
---------------               -----
[1  3  -1] -3  5  3  6  7       3
 1 [3  -1  -3] 5  3  6  7       3
 1  3 [-1  -3  5] 3  6  7       5
 1  3  -1 [-3  5  3] 6  7       5
 1  3  -1  -3 [5  3  6] 7       6
 1  3  -1  -3  5 [3  6  7]      7

Example 2:

Input: nums = [1], k = 1
Output: [1]

Constraints:

1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4
1 <= k <= nums.length
```

## Solution 1: Monotonic Deque

### Idea

Maintain a deque of indices where the values are in decreasing order. The front of the deque always holds the index of the current window's maximum. For each new element:

1. Remove the front if it's outside the window (`index < i - k + 1`).
2. Pop elements from the back that are smaller or equal to the new element — they can never be the maximum while the new element is in the window.
3. Push the new index onto the back.
4. Once the window is fully formed (`i >= k - 1`), the front gives the maximum.

Each element is pushed and popped at most once, so all back operations are $O(n)$ amortized total.

```
nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3

i=0: dq=[0]           (value 1)
i=1: dq=[1]           (3 > 1, pop 0, push 1)
i=2: dq=[1,2]         (−1 < 3, push 2)        → res[0] = nums[1] = 3
i=3: dq=[1,2,3]       (−3 < −1, push 3)       → res[1] = nums[1] = 3
i=4: dq=[4]           (5 > all, pop 3,2,1)     → res[2] = nums[4] = 5
     note: front 1 would be removed anyway (1 < 4-2=2)
i=5: dq=[4,5]         (3 < 5, push 5)         → res[3] = nums[4] = 5
i=6: dq=[6]           (6 > all, pop 5,4)       → res[4] = nums[6] = 6
i=7: dq=[7]           (7 > 6, pop 6)           → res[5] = nums[7] = 7
```

Complexity: Time $O(n)$, Space $O(k)$.

#### Java

```java []
public int[] maxSlidingWindow(int[] nums, int k) {
    int n = nums.length;
    int[] res = new int[n - k + 1];
    ArrayDeque<Integer> dq = new ArrayDeque<>();
    for (int i = 0; i < nums.length; i++) { // O(n)
        if (!dq.isEmpty() && dq.peek() < i - (k - 1)) dq.removeFirst();
        while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) dq.removeLast(); // O(1) amortized
        dq.add(i);
        if (i >= k - 1) res[i - (k - 1)] = nums[dq.peekFirst()];
    }
    return res; // Time O(n), Space O(k)
}
```

#### Python

```python []
def maxSlidingWindow(self, nums: list[int], k: int) -> list[int]:
    res = []
    dq = deque()  # stores indices, front is always the max in window
    for i, v in enumerate(nums):  # O(n)
        if dq and dq[0] < i - (k - 1):
            dq.popleft()
        while dq and nums[dq[-1]] <= v:  # O(1) amortized
            dq.pop()
        dq.append(i)
        if i >= k - 1:
            res.append(nums[dq[0]])
    return res  # Time O(n), Space O(k)
```

#### C++

```cpp []
vector<int> maxSlidingWindow(vector<int> &nums, int k) {
    size_t n = nums.size(), l = n - (k - 1);
    vector<int> res(l);
    deque<int> dq;
    for (int i = 0; i < n; i++) { // O(n)
        if (!dq.empty() && (dq.front() < i - (k - 1))) dq.pop_front();
        while (!dq.empty() && nums[dq.back()] <= nums[i]) dq.pop_back(); // O(1) amortized
        dq.push_back(i);
        if (i >= k - 1) res[i - (k - 1)] = nums[dq.front()];
    }
    return res; // Time O(n), Space O(k)
}
```

#### Rust

```rust []
pub fn max_sliding_window(nums: Vec<i32>, k: i32) -> Vec<i32> {
    let k = k as usize;
    let mut res = Vec::with_capacity(nums.len() - k + 1);
    let mut dq = std::collections::VecDeque::new();
    for i in 0..nums.len() { // O(n)
        if let Some(&front) = dq.front() {
            if front + k <= i { dq.pop_front(); }
        }
        while let Some(&back) = dq.back() { // O(1) amortized
            if nums[back] <= nums[i] { dq.pop_back(); } else { break; }
        }
        dq.push_back(i);
        if i >= k - 1 { res.push(nums[*dq.front().unwrap()]); }
    }
    res // Time O(n), Space O(k)
}
```

## Solution 2: Brute Force

### Idea

For each window position, find the maximum by scanning all `k` elements. Simple but slower.

Complexity: Time $O(n \cdot k)$, Space $O(1)$ extra.

#### Python

```python []
def maxSlidingWindow(self, nums: list[int], k: int) -> list[int]:
    return [max(nums[i:i + k]) for i in range(len(nums) - k + 1)]  # O(n*k)
```
