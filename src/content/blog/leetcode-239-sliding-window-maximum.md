---
author: JZ
pubDatetime: 2024-11-10T08:22:00Z
modDatetime: 2024-11-10T10:12:00Z
title: LeetCode 239 LintCode 362 Sliding Window Maximum
featured: true
tags:
  - a-sliding-window
  - a-deque
  - c-amazon
  - c-microsoft
  - c-zenefits
  - c-google
description:
  "solutions for LeetCode 239, LintCode 362, hard, tags: array, queue, sliding window, heap, monotonic queue. Companies: Amazon, Zenefits, Microsoft, Google."
---

## Table of contents

## Description

You are given an array of integers `nums`, there is a sliding window of size `k` which is moving from the very left of the array to the very right. You can only see the `k` numbers in the window. Each time the sliding window moves right by one position.

Return the _max sliding window_.

Example 1:

```
Input: nums = [1,3,-1,-3,5,3,6,7], k = 3
Output: [3,3,5,5,6,7]
Explanation:
Window position                Max
---------------               -----
[1 3  -1] -3  5  3  6  7       3
1 [3  -1  -3] 5  3  6  7       3
1  3 [-1  -3  5] 3  6  7       5
1  3  -1 [-3  5  3] 6  7       5
1  3  -1  -3 [5  3  6] 7       6
1  3  -1  -3  5 [3  6  7]      7
```


Example 2:

```
Input: nums = [1], k = 1
Output: [1]
```

Constraints:

-   `1 <= nums.length <= 10^5`
-   `-10^4 <= nums[i] <= 10^4`
-   `1 <= k <= nums.length`

## Solution

### Idea

We can use a double ended `Deque` which are supported in most if not all programming languages (I would assume so). We use it to to remember the array indexes. The `Deque` size will remain less than k and be updated as we iterate through the array. During the iteration:

1. we remove elements from the front when it is not in the sliding window (`index < i-(k-1)`) anymore.
2. we remove elements from the back when the array element is not greater than the current element since we only need to get the maximum.
3. we add the current index to the `Deque`.
4. we add the array element of the first index in the `Deque` to the result starting when the first window starts.

We maintain the first index in the `Deque` as the maximum in the sliding window.

Complexity: Time O(n), Space O(k). Note that space for the returned result is not considered.

#### Java

```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] res = new int[n - k + 1];
        ArrayDeque<Integer> dq = new ArrayDeque<>();
        for (int i = 0; i < nums.length; i++) {
            if (!dq.isEmpty() && dq.peek() < i - (k - 1)) dq.removeFirst(); // do not forget empty check
            while (!dq.isEmpty() && nums[dq.peekLast()] <= nums[i]) dq.removeLast();
            dq.add(i); // they might be the next max
            if (i >= k - 1) res[i - (k - 1)] = nums[dq.peekFirst()]; // max is at head of the deque
        }
        return res;
    }
}
```
