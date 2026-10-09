---
author: JZ
pubDatetime: 2026-10-09T19:07:53Z
modDatetime: 2026-10-09T19:07:53Z
title: LeetCode 1207 Unique Number of Occurrences
featured: true
tags:
  - a-array
  - a-hash-table
description: "Solutions for LeetCode 1207, easy, tags: array, hash table."
---

## Table of contents

## Description

Question Link: [LeetCode 1207](https://leetcode.com/problems/unique-number-of-occurrences/description/)

Given an integer array `arr`, return `true` if every distinct value in the array occurs a different number of times. Otherwise, return `false`.

```
Example 1:

Input: arr = [1,2,2,1,1,3]
Output: true
Explanation: The values 1, 2, and 3 occur 3, 2, and 1 times.

Example 2:

Input: arr = [1,2]
Output: false
Explanation: Both values occur once.

Example 3:

Input: arr = [-3,0,1,-3,1,1,1,-3,10,0]
Output: true

Constraints:

1 <= arr.length <= 1000
-1000 <= arr[i] <= 1000
```

## Solution 1: Hash Map and Set

### Idea

First count each value with a hash map. Then insert each count into a set. If a count is already present, two different values have the same frequency, so the answer is `false`.

For Example 1, the counts are:

```
value       1  2  3
frequency   3  2  1
```

All three frequencies are distinct, so the answer is `true`.

Complexity: Time $O(n)$ on average, where $n$ is the array length. Space $O(k)$, where $k$ is the number of distinct values.

### Java

```java []
public static boolean uniqueOccurrences(int[] numbers) {
    Map<Integer, Integer> frequencies = new HashMap<>();
    for (int number : numbers) {
        frequencies.merge(number, 1, Integer::sum);
    }

    Set<Integer> seenFrequencies = new HashSet<>();
    for (int frequency : frequencies.values()) {
        if (!seenFrequencies.add(frequency)) {
            return false;
        }
    }
    return true;
}
```

### Python

```python []
from collections import Counter


class Solution:
    def uniqueOccurrences(self, arr: list[int]) -> bool:
        occurrences = Counter(arr)
        return len(occurrences) == len(set(occurrences.values()))
```

### C++

```cpp []
bool uniqueOccurrences(const std::vector<int> &arr) {
    std::unordered_map<int, int> frequencies;
    for (int value : arr) {
        ++frequencies[value];
    }

    std::unordered_set<int> seenFrequencies;
    for (const auto &entry : frequencies) {
        if (!seenFrequencies.insert(entry.second).second) {
            return false;
        }
    }

    return true;
}
```

### Rust

```rust []
pub fn unique_occurrences(nums: Vec<i32>) -> bool {
    let mut counts = HashMap::new();
    for num in nums {
        *counts.entry(num).or_insert(0) += 1;
    }

    let mut frequencies = HashSet::new();
    counts.values().all(|&count| frequencies.insert(count))
}
```

## Solution 2: Bounded Frequency Arrays

### Idea

The constraints bound every value to `[-1000, 1000]`, so a value can be mapped directly into a 2,001-slot array using `arr[i] + 1000`. After counting, scan that array and use a second boolean array indexed by frequency. A frequency already marked means two values share that frequency.

The second array needs `n + 1` entries because no value can appear more than `n` times. This approach avoids hash tables and uses the small fixed value domain.

Complexity: Time $O(n + U)$ and space $O(n + U)$, where $U = 2001$ is the number of possible values. Since the problem fixes $U$, this is $O(n)$ time and space under these constraints.

### Java

```java []
public static boolean uniqueOccurrencesByFrequencyArray(int[] numbers) {
    int[] frequencies = new int[2001];
    for (int number : numbers) {
        frequencies[number + 1000]++;
    }

    boolean[] seenFrequencies = new boolean[numbers.length + 1];
    for (int frequency : frequencies) {
        if (frequency > 0) {
            if (seenFrequencies[frequency]) {
                return false;
            }
            seenFrequencies[frequency] = true;
        }
    }
    return true;
}
```

### Python

```python []
class Solution:
    def uniqueOccurrencesByFrequencyArray(self, arr: list[int]) -> bool:
        frequencies = [0] * 2001
        for number in arr:
            frequencies[number + 1000] += 1

        used_frequencies = [False] * (len(arr) + 1)
        for frequency in frequencies:
            if frequency == 0:
                continue
            if used_frequencies[frequency]:
                return False
            used_frequencies[frequency] = True
        return True
```

### C++

```cpp []
bool uniqueOccurrencesByFrequencyArray(const std::vector<int> &arr) {
    constexpr int minValue = -1000;
    constexpr int maxValue = 1000;
    constexpr int valueRange = maxValue - minValue + 1;
    std::array<int, valueRange> frequencies{};

    for (int value : arr) {
        ++frequencies[value - minValue];
    }

    std::vector<bool> seenFrequencies(arr.size() + 1, false);
    for (int frequency : frequencies) {
        if (frequency > 0) {
            if (seenFrequencies[frequency]) {
                return false;
            }
            seenFrequencies[frequency] = true;
        }
    }

    return true;
}
```

### Rust

```rust []
pub fn unique_occurrences_by_frequency_array(nums: Vec<i32>) -> bool {
    let mut counts = [0; 2001];
    for num in nums.iter() {
        counts[(num + 1000) as usize] += 1;
    }

    let mut seen_frequencies = vec![false; nums.len() + 1];
    for count in counts {
        if count > 0 {
            if seen_frequencies[count] {
                return false;
            }
            seen_frequencies[count] = true;
        }
    }

    true
}
```
