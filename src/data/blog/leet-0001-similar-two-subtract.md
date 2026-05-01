---
author: JZ
pubDatetime: 2024-11-24T07:23:00Z
modDatetime: 2024-11-24T07:23:00Z
title: LeetCode 1 Similar Two Subtract Count
tags:
  - a-array
  - a-hash
  - c-salesforce
description:
  "Solutions for LeetCode 1 similar, medium, tags: array, hash table, companies: salesforce."
---

## Table of contents

## Description

Given an array and a target number, return number of paired elements in the array where the difference between the two elements is the target. There might be duplicates in the array.

Check the test cases below for examples.

## Solution

### Idea

1. We can build a hash map to count the unique values and how many for each value is in the array.
2. We iterate through the hash map and look for `v+T` so that the difference between v and `look` would be `T` (target). We add the multiplication of the counts for `v` and `look` if such `look` is found. We only look for `v+T` and not `v-T` to avoid double counting.

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public final class SimilarTwoSubtract {
    private SimilarTwoSubtract() {}

    // Time O(n), Space O(n).
    public static int twoSubtract(int[] A, int target) {
        if (A == null || A.length == 0) return 0;
        Map<Integer, Integer> cnt = new HashMap<>();
        for (int v : A) cnt.merge(v, 1, Integer::sum); // O(n) build
        int res = 0;
        for (Map.Entry<Integer, Integer> e : cnt.entrySet()) { // O(unique)
            int look = e.getKey() + target;
            Integer lookCnt = cnt.get(look);
            if (lookCnt != null) res += e.getValue() * lookCnt;
        }
        return res;
    }
}
```

#### Python

```python []
from collections import Counter


def two_subtract(A: list[int], T: int) -> int:
    """Time O(n), Space O(n)."""
    cnt, res = Counter(A), 0
    for v in cnt:                # O(unique) ≤ O(n)
        look = v + T
        if look not in cnt: continue
        res += cnt[look] * cnt[v]  # multiplicative pairing
    return res
```

#### C++

```cpp []
class SolutionSimilarTwoSubtract {
public:
    // Time O(n), Space O(n).
    int twoSubtract(const vector<int>& A, int target) {
        unordered_map<int, int> cnt;
        for (int v : A) cnt[v]++;            // O(n)
        int res = 0;
        for (const auto& [v, c] : cnt) {     // O(unique)
            auto it = cnt.find(v + target);  // look forward only
            if (it != cnt.end()) res += c * it->second;
        }
        return res;
    }
};
```

#### Rust

```rust []
use std::collections::HashMap;

impl Solution {
    // Time O(n), Space O(n).
    pub fn two_subtract(a: Vec<i32>, target: i32) -> i64 {
        let mut cnt: HashMap<i32, i64> = HashMap::new();
        for v in &a {
            *cnt.entry(*v).or_insert(0) += 1; // O(n)
        }
        let mut res: i64 = 0;
        for (v, c) in &cnt {
            // Only look forward to (v + target) to avoid double counting.
            if let Some(other) = cnt.get(&(v + target)) {
                res += c * other;
            }
        }
        res
    }
}
```

Unit test

```python []
import unittest


class TestTwoSubtract(unittest.TestCase):

    def test_two_subtract(self):
        cases = [
            ([1, 2], 3, 0),  # no index pairs
            ([1, 2], 1, 1),  # [[0,1]]
            ([1, 2, 0], 1, 2),  # [[0,1],[0,2]]
            ([1, 2, 1, 2, 0], 1, 6)  # [[0,1],[0,3],[1,2],[2,3],[0,4],[2,4]]
        ]
        for nums, target, exp in cases:
            with self.subTest(nums=nums, target=target, exp=exp):
                self.assertEqual(exp, two_subtract(nums, target))
```
