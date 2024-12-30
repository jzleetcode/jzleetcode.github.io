---
author: JZ
pubDatetime: 2024-12-24T06:23:00Z
modDatetime: 2024-12-24T06:23:00Z
title: LeetCode 875 LintCode 1492 Koko Eating Bananas
featured: true
tags:
  - a-binary-search
  - a-array
  - c-facebook
  - c-salesforce
description:
  "Solutions for LeetCode 875 LintCode 1492, medium, tags: array, binary search; companies: facebook, salesforce."
---

## Table of contents

## Description

Question Links: [LeetCode 875](https://leetcode.com/problems/koko-eating-bananas/description/), [LintCode 1492](https://www.lintcode.com/problem/1492/)

Koko loves to eat bananas. There are `n` piles of bananas, the `ith` pile has `piles[i]` bananas. The guards have gone and will come back in `h` hours.

Koko can decide her bananas-per-hour eating speed of `k`. Each hour, she chooses some pile of bananas and eats `k` bananas from that pile. If the pile has less than `k` bananas, she eats all of them instead and will not eat any more bananas during this hour.

Koko likes to eat slowly but still wants to finish eating all the bananas before the guards return.

Return _the minimum integer_ `k` _such that she can eat all the bananas within_ `h` _hours_.

```
Example 1:

Input: piles = [3,6,7,11], h = 8
Output: 4

Example 2:

Input: piles = [30,11,23,4,20], h = 5
Output: 30

Example 3:

Input: piles = [30,11,23,4,20], h = 6
Output: 23
```

**Constraints:**

-   `1 <= piles.length <= 10^4`
-   `piles.length <= h <= 10^9`
-   `1 <= piles[i] <= 10^9`

## Idea

The question is similar to many questions that is solvable with binary search with a criteria.

Check out more questions in the [binary search tag](../../tags/a-binary-search/).

We can binary search in the range of `[1, max]`. We could use left binary search, `bisect_left` for duplicates (keys that can satisfy the criteria), i.e., we shrink the boundary on the left side by `+1` and right side by `=`.

The criteria for the question is that Koko could eat all the bananas within `h` hours.

The number of hours needed for Koko to eat the pile of bananas is the ceiling of the division: `p` divided by `speed`. This can be calculated by `(p-1) / speed + 1`.

Complexity: Time $O(n \log n)$, Space $O(1)$.

### Python

```python
class Solution:
    """135 ms, 18.8 mb"""

    def minEatingSpeed(self, piles: list[int], h: int) -> int:
        def feasible(speed) -> bool:
            return sum((p - 1) // speed + 1 for p in piles) <= h

        l, r = 1, max(piles)
        while l < r:
            mid = l + (r - l) // 2
            if feasible(mid):
                r = mid
            else:
                l = mid + 1
        return l
```

### C++

```cpp
// leet 875, 14 ms, 22.99 mb.
class Solution {
public:
    int minEatingSpeed(vector<int> &piles, int h) {
        int l = 1, r = 1000000000;
        while (l < r) {
            int mid = l + (r - l) / 2;
            if (feasible(piles, h, mid)) r = mid;
            else l = mid + 1;
        }
        return l;
    }

    bool feasible(vector<int> &piles, int h, int speed) {
        int sum = 0;
        for (auto p: piles) sum += (p - 1) / speed + 1;
        return sum <= h;
    }
};
```

### Rust

```rust
// leet 875, lint 1492, 4 ms, 2.44 mb
impl Solution {
    pub fn min_eating_speed(piles: Vec<i32>, h: i32) -> i32 {
        let (mut l, mut r) = (1, *piles.iter().max().expect("piles non-empty"));
        while l < r {
            let m = l + (r - l) / 2;
            if Self::feasible(&piles, h, m) { r = m } else { l = m + 1 }
        }
        l
    }
    fn feasible(piles: &Vec<i32>, h: i32, speed: i32) -> bool {
        let mut sum = 0;
        for p in piles {
            sum += (p - 1) / speed + 1;
        }
        sum <= h
    }
}
```
