---
author: JZ
pubDatetime: 2026-08-24T10:36:00Z
modDatetime: 2026-08-24T10:36:00Z
title: LeetCode 1011 Capacity To Ship Packages Within D Days
featured: false
tags:
  - a-binary-search
  - a-array
  - a-greedy
description:
  "Solutions for LeetCode 1011, medium, tags: array, binary search, greedy."
---

## Table of contents

## Description

Question Link: [LeetCode 1011](https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/description/)

A conveyor belt has packages that must be shipped from one port to another within `days` days.

The `i`-th package on the conveyor belt has a weight of `weights[i]`. Each day, we load the ship with packages on the conveyor belt (in the order given by weights). We may not load more weight than the maximum weight capacity of the ship.

Return the least weight capacity of the ship that will result in all the packages on the conveyor belt being shipped within `days` days.

```
Example 1:

Input: weights = [1,2,3,4,5,6,7,8,9,10], days = 5
Output: 15
Explanation: A ship capacity of 15 is the minimum to ship all the packages in 5 days like this:
1st day: 1, 2, 3, 4, 5
2nd day: 6, 7
3rd day: 8
4th day: 9
5th day: 10

Example 2:

Input: weights = [3,2,2,4,1,4], days = 3
Output: 6
Explanation: A ship capacity of 6 is the minimum to ship all the packages in 3 days like this:
1st day: 3, 2
2nd day: 2, 4
3rd day: 1, 4

Example 3:

Input: weights = [1,2,3,1,1], days = 4
Output: 3
Explanation:
1st day: 1
2nd day: 2
3rd day: 3
4th day: 1, 1
```

**Constraints:**

- `1 <= days <= weights.length <= 5 * 10^4`
- `1 <= weights[i] <= 500`

## Idea: Binary Search on Answer + Greedy Check

The key insight: if a capacity `c` can ship all packages within `days` days, then any capacity `c' > c` can too. This **monotonic property** makes binary search applicable.

**Search range:** The minimum possible capacity is `max(weights)` (must carry the heaviest single package) and the maximum is `sum(weights)` (ship everything in one day).

**Feasibility check:** For a given capacity, greedily load packages in order. When adding the next package would exceed capacity, start a new day. Count total days needed.

```
weights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], days = 5

lo = 10 (max), hi = 55 (sum)

mid = 32: days needed = 2  -> feasible, hi = 32
mid = 21: days needed = 3  -> feasible, hi = 21
mid = 15: days needed = 5  -> feasible, hi = 15
mid = 12: days needed = 6  -> NOT feasible, lo = 13
mid = 14: days needed = 6  -> NOT feasible, lo = 15

lo == hi == 15, answer = 15
```

```
Greedy loading with capacity = 15:

Day 1: [1, 2, 3, 4, 5] sum=15 <= 15  ✓
Day 2: [6, 7]           sum=13 <= 15  ✓  (adding 8 would be 21 > 15)
Day 3: [8]              sum=8  <= 15  ✓  (adding 9 would be 17 > 15)
Day 4: [9]              sum=9  <= 15  ✓  (adding 10 would be 19 > 15)
Day 5: [10]             sum=10 <= 15  ✓

5 days needed == 5 allowed  ✓
```

**Why greedy works:** Packages must be shipped in order. Loading as much as possible each day is optimal — holding back capacity today only delays packages to later days, never reducing the total days needed.

Complexity: Time $O(n \cdot \log(\text{sum} - \text{max}))$, Space $O(1)$.

### Java

```java []
// O(n * log(sum-max)) time, O(1) space.
public static int shipWithinDays2(int[] weights, int days) {
    int max = 0, sum = 0;
    for (int weight : weights) {
        if (weight > max) max = weight;
        sum += weight;
    }

    int l = max, r = sum, res = l;
    while (l <= r) { // O(log(sum-max))
        int mid = l + (r - l) / 2, count = 1, cur = 0; // count starts with 1
        for (int w : weights) { // O(n) greedy check
            if (cur + w > mid) {
                count += 1;
                if (count > days) break;
                cur = 0;
            }
            cur += w;
        }
        if (count > days) l = mid + 1;
        else {
            res = mid;
            r = mid - 1;
        }
    }
    return res;
}
```

### Python

```python []
class Solution:
    def shipWithinDays(self, weights: list[int], days: int) -> int:
        """Binary search on answer + greedy feasibility check.
        O(n * log(sum - max)) time, O(1) space."""

        def feasible(capacity: int) -> bool:
            day_count, cur = 1, 0
            for w in weights:  # O(n)
                if cur + w > capacity:
                    day_count += 1
                    if day_count > days:
                        return False
                    cur = 0
                cur += w
            return True

        lo, hi = max(weights), sum(weights)  # O(n)
        while lo < hi:  # O(log(sum - max))
            mid = (lo + hi) // 2
            if feasible(mid):
                hi = mid
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
// Binary Search on Answer + Greedy feasibility check.
// O(n * log(sum-max)) time, O(1) space.
class Solution {
public:
    int shipWithinDays(vector<int>& weights, int days) {
        int lo = *max_element(weights.begin(), weights.end());
        int hi = accumulate(weights.begin(), weights.end(), 0);

        while (lo < hi) { // O(log(sum-max))
            int mid = lo + (hi - lo) / 2;
            if (canShip(weights, days, mid)) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

private:
    // Greedy: can we ship all packages within `days` using capacity `cap`? O(n)
    bool canShip(vector<int>& weights, int days, int cap) {
        int needed = 1;
        int cur = 0;
        for (int w : weights) {
            if (cur + w > cap) {
                needed++;
                cur = 0;
                if (needed > days) return false;
            }
            cur += w;
        }
        return needed <= days;
    }
};
```

### Rust

```rust []
// Binary search on answer + Greedy check.
// O(n * log(sum - max)) time, O(1) extra space.
impl Solution {
    pub fn ship_within_days(weights: Vec<i32>, days: i32) -> i32 {
        let mut lo = *weights.iter().max().unwrap();
        let mut hi: i32 = weights.iter().sum();

        while lo < hi { // O(log(sum-max))
            let mid = lo + (hi - lo) / 2;
            if Self::can_ship(&weights, days, mid) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        lo
    }

    // Greedy: count days needed with given capacity. O(n)
    fn can_ship(weights: &[i32], days: i32, capacity: i32) -> bool {
        let mut needed = 1;
        let mut current = 0;
        for &w in weights {
            if current + w > capacity {
                needed += 1;
                current = w;
            } else {
                current += w;
            }
        }
        needed <= days
    }
}
```
