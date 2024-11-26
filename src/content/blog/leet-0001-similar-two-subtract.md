---
author: JZ
pubDatetime: 2024-11-24T07:23:00Z
modDatetime: 2024-11-24T07:23:00Z
title: LeetCode 1 Similar Two Subtract Count
featured: true
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
2. We use a hash set to mark which value we have looked at already.
3. We iterate through the hash map and look for two targets: `v+T` and `v-T` so that the difference between v and `look` would be `T` (target). We add the multiplication of the counts for `v` and `look` if such `look` is found.
4. We add `v` to the `mark` hash set so we do not double count.

Complexity: Time O(n), Space O(n).

#### Python

```python
from collections import Counter


def two_subtract(A: list[int], T: int) -> int:
    cnt, mark, res = Counter(A), set(), 0
    for v in cnt:
        for look in v - T, v + T:
            if look not in cnt or look in mark: continue
            res += cnt[look] * cnt[v]
        mark.add(v)
    return res
```

Unit test

```python
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
