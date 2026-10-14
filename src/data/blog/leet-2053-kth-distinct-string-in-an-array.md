---
author: JZ
pubDatetime: 2026-10-14T19:05:00Z
modDatetime: 2026-10-14T19:05:00Z
title: LeetCode 2053 Kth Distinct String in an Array
featured: true
tags:
  - a-array
  - a-hash
  - a-string
description: "Solutions for LeetCode 2053, easy, tags: array, hash table, string."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question Links: [LeetCode 2053](https://leetcode.com/problems/kth-distinct-string-in-an-array/description/)

A string is **distinct** if it appears exactly once in `arr`. Return the `k`th distinct string in the array's original order. If there are fewer than `k` distinct strings, return an empty string.

```text
Example 1:
Input: arr = ["d", "b", "c", "b", "c", "a"], k = 2
Output: "a"
Explanation: "d" and "a" appear once, in that order. The second is "a".

Example 2:
Input: arr = ["aaa", "aa", "a"], k = 1
Output: "aaa"
```

Constraints:

- `1 <= arr.length <= 1000`
- `1 <= arr[i].length <= 5`
- `arr[i]` consists of lowercase English letters.
- `1 <= k <= arr.length`

## Idea

Count the occurrences of every string, then scan `arr` again from left to right. Only strings with a count of one are candidates; decrement `k` for each candidate and return the one that brings it to zero. Scanning the original array preserves the required order, regardless of the iteration order of the hash map.

```text
arr:        d  b  c  b  c  a
frequency:  1  2  2  2  2  1
distinct:   d                 a
                            k=2 -> a
```

If the scan finishes before `k` reaches zero, no such string exists, so return `""`.

Complexity: Time $O(n)$ expected, where hash-map operations are expected $O(1)$. Space $O(n)$ for the frequency map.

### Java

```java []
import java.util.HashMap;
import java.util.Map;

public final class KthDistinctString {
    private KthDistinctString() {}

    public static String kthDistinct(String[] arr, int k) {
        Map<String, Integer> counts = new HashMap<>();
        for (String value : arr) { // O(n)
            counts.put(value, counts.getOrDefault(value, 0) + 1);
        }

        for (String value : arr) { // O(n)
            if (counts.get(value) == 1 && --k == 0) {
                return value;
            }
        }
        return "";
    }
}
```

### Python

```python []
class Solution:
    def kthDistinct(self, arr, k):
        # The frequency pass is O(n) expected time and O(n) space.
        frequencies = {}
        for value in arr:
            frequencies[value] = frequencies.get(value, 0) + 1

        # The ordered scan is O(n) expected time and preserves input order.
        for value in arr:
            if frequencies[value] == 1:
                k -= 1
                if k == 0:
                    return value

        return ""
```

### C++

```cpp []
#include <string>
#include <unordered_map>
#include <vector>

class Solution {
public:
    std::string kthDistinct(std::vector<std::string>& arr, int k) {
        std::unordered_map<std::string, int> frequency;
        for (const std::string& value : arr) {
            ++frequency[value];
        }

        // The counting pass and the ordered scan each take O(n) expected time.
        for (const std::string& value : arr) {
            if (frequency[value] == 1 && --k == 0) {
                return value;
            }
        }

        // The frequency map stores up to n strings, so extra space is O(n).
        return "";
    }
};
```

### Rust

```rust []
use std::collections::HashMap;

pub struct Solution;

impl Solution {
    pub fn kth_distinct(arr: Vec<String>, mut k: i32) -> String {
        let mut counts = HashMap::with_capacity(arr.len());
        for item in &arr {
            *counts.entry(item.clone()).or_insert(0) += 1;
        }

        for item in arr {
            if counts.get(&item) == Some(&1) {
                k -= 1;
                if k == 0 {
                    return item;
                }
            }
        }

        String::new()
    }
}
```
