---
author: JZ
pubDatetime: 2026-08-14T10:06:00Z
modDatetime: 2026-08-14T10:06:00Z
title: LeetCode 2300 Successful Pairs of Spells and Potions
featured: false
tags:
  - a-binary-search
  - a-array
  - a-sorting
description:
  "Solutions for LeetCode 2300, medium, tags: array, binary search, sorting."
---

## Table of contents

## Description

Question Link: [LeetCode 2300](https://leetcode.com/problems/successful-pairs-of-spells-and-potions/description/)

You are given two positive integer arrays `spells` and `potions`, of length `n` and `m` respectively, where `spells[i]` represents the strength of the `i`th spell and `potions[j]` represents the strength of the `j`th potion.

You are also given an integer `success`. A spell and potion pair is considered **successful** if the product of their strengths is **at least** `success`.

Return an integer array `pairs` of length `n` where `pairs[i]` is the number of potions that will form a successful pair with the `i`th spell.

```
Example 1:

Input: spells = [5,1,3], potions = [1,2,3,4,5], success = 7
Output: [4,0,3]
Explanation:
- 0th spell: 5 * [1,2,3,4,5] = [5,10,15,20,25]. 4 pairs are successful.
- 1st spell: 1 * [1,2,3,4,5] = [1,2,3,4,5]. 0 pairs are successful.
- 2nd spell: 3 * [1,2,3,4,5] = [3,6,9,12,15]. 3 pairs (3,4,5) are successful.

Example 2:

Input: spells = [3,1,2], potions = [8,5,8], success = 16
Output: [2,0,2]
```

**Constraints:**

- `n == spells.length`
- `m == potions.length`
- `1 <= n, m <= 10^5`
- `1 <= spells[i], potions[j] <= 10^5`
- `1 <= success <= 10^10`

## Idea: Sort + Binary Search

For each spell, we need the count of potions where `spell * potion >= success`, i.e., `potion >= ceil(success / spell)`. If we sort the potions array once, we can binary search for this threshold for each spell.

```
potions = [1, 2, 3, 4, 5] (sorted), success = 7

spell = 5:  need potion >= ceil(7/5) = 2  -> idx=1, count = 5-1 = 4
spell = 1:  need potion >= ceil(7/1) = 7  -> idx=5, count = 5-5 = 0
spell = 3:  need potion >= ceil(7/3) = 3  -> idx=2, count = 5-2 = 3

Result: [4, 0, 3]
```

The key insight is ceiling division without floating point: `ceil(success / spell) = (success + spell - 1) / spell` using integer arithmetic.

Complexity: Time $O(n \log n + m \log n)$ — sort potions $O(n \log n)$, then binary search per spell $O(\log n)$ repeated $m$ times. Space $O(n)$ for the sorted potions copy (or $O(1)$ extra if sorting in-place).

### Java

```java []
public final class SuccessfulPairs {

    private SuccessfulPairs() {
    }

    // Sort + Binary Search. O((m + n) log n) time, O(1) extra space.
    public static int[] successfulPairs(int[] spells, int[] potions, long success) {
        Arrays.sort(potions); // O(n log n)
        int n = spells.length, m = potions.length;
        int[] result = new int[n];
        for (int i = 0; i < n; i++) { // O(n log m)
            long minPotion = (success + spells[i] - 1) / spells[i]; // ceiling division
            int lo = 0, hi = m;
            while (lo < hi) { // O(log m)
                int mid = lo + (hi - lo) / 2;
                if (potions[mid] >= minPotion) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }
            result[i] = m - lo;
        }
        return result;
    }
}
```

### Python

```python []
from bisect import bisect_left


class Solution:
    def successfulPairs(self, spells: list[int], potions: list[int], success: int) -> list[int]:
        """Sort + Binary search. O((m+n) log n) time, O(n) space for sorted potions copy."""
        potions.sort()  # O(n log n)
        n = len(potions)
        res = []
        for spell in spells:  # O(m) iterations
            min_potion = (success + spell - 1) // spell  # ceiling division
            idx = bisect_left(potions, min_potion)  # O(log n)
            res.append(n - idx)
        return res
```

### C++

```cpp []
// Sort + Binary Search. O((m+n) log n) time, O(n) extra space.
class Solution {
public:
    vector<int> successfulPairs(vector<int>& spells, vector<int>& potions, long long success) {
        int n = potions.size();
        sort(potions.begin(), potions.end()); // O(n log n)
        vector<int> result;
        result.reserve(spells.size());
        for (int spell : spells) { // O(m log n)
            long long minPotion = (success + spell - 1) / spell; // ceiling division
            if (minPotion > 100000) { result.push_back(0); continue; }
            int idx = lower_bound(potions.begin(), potions.end(), (int)minPotion) - potions.begin();
            result.push_back(n - idx);
        }
        return result;
    }
};
```

### Rust

```rust []
// Sort + Binary Search. O((m+n) log n) time, O(n) extra space.
impl Solution {
    pub fn successful_pairs(spells: Vec<i32>, mut potions: Vec<i32>, success: i64) -> Vec<i32> {
        potions.sort_unstable(); // O(n log n)
        let n = potions.len() as i32;
        spells
            .iter()
            .map(|&spell| { // O(m log n) total
                let spell = spell as i64;
                let min_potion = (success + spell - 1) / spell; // ceiling division
                let idx = potions.partition_point(|&p| (p as i64) < min_potion); // O(log n)
                n - idx as i32
            })
            .collect()
    }
}
```
