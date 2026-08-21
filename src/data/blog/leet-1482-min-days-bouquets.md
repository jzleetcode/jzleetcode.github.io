---
author: JZ
pubDatetime: 2026-08-15T10:30:00Z
modDatetime: 2026-08-15T10:30:00Z
title: LeetCode 1482 Minimum Number of Days to Make m Bouquets
featured: false
tags:
  - a-binary-search
  - a-array
description:
  "Solutions for LeetCode 1482, medium, tags: array, binary search."
---

## Table of contents

## Description

Question Link: [LeetCode 1482](https://leetcode.com/problems/minimum-number-of-days-to-make-m-bouquets/description/)

You are given an integer array `bloomDay`, an integer `m` and an integer `k`.

You want to make `m` bouquets. To make a bouquet, you need to use `k` **adjacent** flowers from the garden.

The garden consists of `n` flowers, the `i`th flower will bloom in the `bloomDay[i]` and then can be used in **exactly one** bouquet.

Return the minimum number of days you need to wait to be able to make `m` bouquets from the garden. If it is impossible to make `m` bouquets return `-1`.

```
Example 1:

Input: bloomDay = [1,10,3,10,2], m = 3, k = 1
Output: 3
Explanation: On day 3, flowers at indices 0, 2, 4 have bloomed.
We can make 3 bouquets each with 1 flower.

Example 2:

Input: bloomDay = [1,10,3,10,2], m = 3, k = 2
Output: -1
Explanation: We need 3 bouquets each with 2 adjacent flowers = 6 flowers, but only 5 exist.

Example 3:

Input: bloomDay = [7,7,7,7,12,7,7], m = 2, k = 3
Output: 12
Explanation: On day 7, flowers [0,1,2,3,5,6] bloom. We can make 1 bouquet from [0,1,2].
On day 12, flower [4] blooms. Now we can make a second bouquet from [4,5,6].
```

**Constraints:**

- `bloomDay.length == n`
- `1 <= n <= 10^5`
- `1 <= bloomDay[i] <= 10^9`
- `1 <= m <= 10^6`
- `1 <= k <= n`

## Idea: Binary Search on Answer + Greedy

The key insight is that the answer (number of days) has a monotonic property: if we can make `m` bouquets by day `d`, we can also do it for any `d' > d` (more flowers bloom, so we have at least as many choices).

**Algorithm:**
1. If `m * k > n`, return -1 (impossible — not enough flowers exist).
2. Binary search on days in range `[min(bloomDay), max(bloomDay)]`.
3. For each candidate day `d`, greedily count bouquets: scan left to right counting consecutive bloomed flowers; whenever the count reaches `k`, increment bouquets and reset the counter.

```
bloomDay = [7, 7, 7, 7, 12, 7, 7], m = 2, k = 3

lo = 7, hi = 12

mid = 9:
  day=9: bloomed = [7,7,7,7,_,7,7] -> consecutive groups: [4], [2]
  bouquets from group of 4: floor(4/3) = 1 (greedy gets 1, counter resets at 3)
  bouquets from group of 2: 0
  total = 1 < 2 -> not enough -> lo = 10

mid = 11:
  day=11: same as day 9 (flower[4]=12 not bloomed) -> 1 bouquet -> lo = 12

lo == hi == 12:
  day=12: all bloomed -> groups: [7] -> floor: 2 bouquets ✓

answer = 12
```

**Why greedy works:** We need `k` **adjacent** bloomed flowers. By scanning left to right and taking each group of `k` consecutive as soon as possible, we never "waste" flowers — using a flower earlier in the array never blocks a future bouquet that wouldn't have been possible anyway.

Complexity: Time $O(n \log(\max(\text{bloomDay})))$, Space $O(1)$.

### Java

```java []
public final class MinDaysBouquets {

    private MinDaysBouquets() {
    }

    // Binary Search on Answer + Greedy. O(n * log(max_day)) time, O(1) space.
    public static int minDays(int[] bloomDay, int m, int k) {
        int n = bloomDay.length;
        if ((long) m * k > n) return -1; // impossible
        int lo = 1, hi = 0;
        for (int d : bloomDay) hi = Math.max(hi, d);
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (canMake(bloomDay, mid, m, k)) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

    // Greedy: count bouquets achievable by day. O(n) time.
    private static boolean canMake(int[] bloomDay, int day, int m, int k) {
        int bouquets = 0, consecutive = 0;
        for (int d : bloomDay) {
            if (d <= day) {
                consecutive++;
                if (consecutive == k) {
                    bouquets++;
                    consecutive = 0;
                }
            } else {
                consecutive = 0;
            }
        }
        return bouquets >= m;
    }
}
```

### Python

```python []
class Solution:
    def minDays(self, bloom_day: list[int], m: int, k: int) -> int:
        """Binary search on answer. O(n * log(max_day)) time, O(1) space."""
        n = len(bloom_day)
        if m * k > n:  # impossible
            return -1

        def can_make(days: int) -> bool:
            bouquets, flowers = 0, 0
            for d in bloom_day:  # O(n)
                if d <= days:
                    flowers += 1
                    if flowers == k:
                        bouquets += 1
                        flowers = 0
                else:
                    flowers = 0
            return bouquets >= m

        lo, hi = min(bloom_day), max(bloom_day)  # O(n)
        while lo <= hi:  # O(log(max_day))
            mid = (lo + hi) // 2
            if can_make(mid):
                hi = mid - 1
            else:
                lo = mid + 1
        return lo
```

### C++

```cpp []
// Binary Search on Answer + Greedy consecutive count.
// O(n * log(max_day)) time, O(1) extra space.
class Solution {
public:
    int minDays(vector<int>& bloomDay, int m, int k) {
        int n = bloomDay.size();
        if ((long long)m * k > n) return -1;
        int lo = *min_element(bloomDay.begin(), bloomDay.end());
        int hi = *max_element(bloomDay.begin(), bloomDay.end());
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (canMake(bloomDay, m, k, mid)) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }

private:
    // O(n) greedy scan
    bool canMake(vector<int>& bloomDay, int m, int k, int day) {
        int bouquets = 0, consecutive = 0;
        for (int b : bloomDay) {
            if (b <= day) {
                consecutive++;
                if (consecutive == k) {
                    bouquets++;
                    consecutive = 0;
                    if (bouquets >= m) return true;
                }
            } else {
                consecutive = 0;
            }
        }
        return bouquets >= m;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Binary search on answer + Greedy check.
    /// O(n * log(max_day)) time, O(1) extra space.
    pub fn min_days(bloom_day: Vec<i32>, m: i32, k: i32) -> i32 {
        let n = bloom_day.len();
        if (m as i64) * (k as i64) > n as i64 {
            return -1;
        }
        let mut lo = *bloom_day.iter().min().unwrap();
        let mut hi = *bloom_day.iter().max().unwrap();
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if Self::can_make(&bloom_day, m, k, mid) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        lo
    }

    // O(n) greedy scan
    fn can_make(bloom_day: &[i32], m: i32, k: i32, days: i32) -> bool {
        let mut bouquets = 0;
        let mut consecutive = 0;
        for &d in bloom_day {
            if d <= days {
                consecutive += 1;
                if consecutive == k {
                    bouquets += 1;
                    consecutive = 0;
                }
            } else {
                consecutive = 0;
            }
        }
        bouquets >= m
    }
}
```
