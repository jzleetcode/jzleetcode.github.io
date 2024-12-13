---
author: JZ
pubDatetime: 2024-12-11T06:23:00Z
modDatetime: 2024-12-11T06:23:00Z
title: LeetCode 2558 Take Gifts From the Richest Pile
featured: true
tags:
  - a-array
  - a-heap
  - a-simulation
description:
  "Solutions for LeetCode 2558, easy, tags: array, heap, simulation."
---

## Table of contents

## Description

You are given an integer array `gifts` denoting the number of gifts in various piles. Every second, you do the following:

-   Choose the pile with the maximum number of gifts.
-   If there is more than one pile with the maximum number of gifts, choose any.
-   Leave behind the floor of the square root of the number of gifts in the pile. Take the rest of the gifts.

Return _the number of gifts remaining after_ `k` _seconds._

```
Example 1:

Input: gifts = [25,64,9,4,100], k = 4
Output: 29
Explanation:
The gifts are taken in the following way:
- In the first second, the last pile is chosen and 10 gifts are left behind.
- Then the second pile is chosen and 8 gifts are left behind.
- After that the first pile is chosen and 5 gifts are left behind.
- Finally, the last pile is chosen again and 3 gifts are left behind.
The final remaining gifts are [5,8,9,4,3], so the total number of gifts remaining is 29.

Example 2:

Input: gifts = [1,1,1,1], k = 4
Output: 4
Explanation:
In this case, regardless which pile you choose, you have to leave behind 1 gift in each pile.
That is, you can't take any pile with you.
So, the total gifts remaining are 4.
```

**Constraints:**

-   `1 <= gifts.length <= 10^3`
-   `1 <= gifts[i] <= 10^9`
-   `1 <= k <= 10^3`


Hint 1

How can you keep track of the largest gifts in the array

Hint 2

What is an efficient way to find the square root of a number?

Hint 3

Can you keep adding up the values of the gifts while ensuring they are in a certain order?

Hint 4

Can we use a priority queue or heap here?

## Idea

The most straight-forward thought is to iterate through the array and find the maximum,
update it according to the operation instruction.

We will omit the implementation considering the time complexity and the implementation is straight-forward.

Complexity: Time $O(nk)$, Space $O(1)$.

## Idea2

Complexity: Time $O(n+k \log n)$, Space $O(k)$.

### C++

```cpp
// leet 2558, 6ms, 13.4 mb
class Solution {
public:
    long long pickGifts(vector<int> &gifts, int k) {
        priority_queue<int> pq{gifts.begin(), gifts.end()};
        while (k-- > 0) {
            int cur = pq.top();
            pq.pop();
            pq.emplace(sqrt(cur)); // auto cast, floor to int
        }
        long long res = 0;
        while (!pq.empty())
            res += pq.top(), pq.pop();
        return res;
    }
};
```

### Python

```python
class Solution:
    """8 ms, 17.72 mb"""

    def pickGifts(self, gifts, k):
        pq = [-g for g in gifts]  # max heap
        heapify(pq)
        for _ in range(k):
            cur = -heappop(pq)
            heappush(pq, -math.floor(math.sqrt(cur)))
        res = 0
        while pq:
            res -= heappop(pq)
        return res
```
