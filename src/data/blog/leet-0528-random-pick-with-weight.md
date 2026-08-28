---
author: JZ
pubDatetime: 2026-08-22T06:00:00Z
modDatetime: 2026-08-22T06:00:00Z
title: LeetCode 528 Random Pick with Weight
featured: false
tags:
  - a-binary-search
  - a-prefix-sum
  - a-randomized
description:
  "Solutions for LeetCode 528, medium, tags: array, math, binary search, prefix sum, randomized."
---

## Table of contents

## Description

Question Links: [LeetCode 528](https://leetcode.com/problems/random-pick-with-weight/description/)

You are given a 0-indexed array of positive integers `w` where `w[i]` describes the weight of the `i`th index.

You need to implement the function `pickIndex()`, which randomly picks an index in the range `[0, w.length - 1]` (inclusive) and returns it. The probability of picking an index `i` is `w[i] / sum(w)`.

```
Example 1:
Input: ["Solution","pickIndex"] [[[1]],[]]
Output: [null,0]

Example 2:
Input: ["Solution","pickIndex","pickIndex","pickIndex","pickIndex","pickIndex"]
[[[1,3]],[],[],[],[],[]]
Output: [null,1,1,1,1,0]

Constraints:
1 <= w.length <= 10^4
1 <= w[i] <= 10^5
pickIndex will be called at most 10^4 times.
```

## Solution 1: Prefix Sum + Binary Search

### Idea

Build a prefix sum array where `prefix[i] = w[0] + w[1] + ... + w[i]`. To pick an index, generate a random integer `target` in `[1, total]` and binary search for the smallest index whose prefix sum is `>= target`.

The prefix sum divides `[1, total]` into segments proportional to the weights. Each index `i` "owns" the range `(prefix[i-1], prefix[i]]`, whose length equals `w[i]`.

```
w = [1, 3, 2]
prefix = [1, 4, 6]
total = 6

index 0 owns range [1, 1]  -> probability 1/6
index 1 owns range [2, 4]  -> probability 3/6
index 2 owns range [5, 6]  -> probability 2/6

target = 3 -> binary search finds index 1 (prefix[1]=4 >= 3)
```

Complexity: Constructor $O(n)$ time, $O(n)$ space. `pickIndex` $O(\log n)$ time.

#### Java

```java []
public final class RandomPickWithWeight {

    private final int[] prefix;
    private final int total;
    private final Random rand;

    // O(n) time, O(n) space
    public RandomPickWithWeight(int[] w) {
        prefix = new int[w.length];
        prefix[0] = w[0];
        for (int i = 1; i < w.length; i++) {
            prefix[i] = prefix[i - 1] + w[i]; // O(n)
        }
        total = prefix[w.length - 1];
        rand = new Random();
    }

    // O(log n) time - binary search for leftmost prefix[i] >= target
    public int pickIndex() {
        int target = rand.nextInt(total) + 1; // [1, total]
        int lo = 0, hi = prefix.length - 1;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (prefix[mid] >= target) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }
}
```

#### Python

```python []
class Solution:
    """Prefix sum + binary search. __init__: O(n) time, O(n) space. pickIndex: O(log n) time."""

    def __init__(self, w: list[int]):
        self.prefix = []
        total = 0
        for weight in w:  # O(n)
            total += weight
            self.prefix.append(total)
        self.total = total

    def pickIndex(self) -> int:
        target = random.randint(1, self.total)
        return bisect_left(self.prefix, target)  # O(log n)
```

#### C++

```cpp []
// O(n) constructor, O(log n) pickIndex via binary search
class RandomPickWithWeight {
    vector<int> prefix;
    int total;
    mt19937 rng;

public:
    RandomPickWithWeight(vector<int>& w) : rng(random_device{}()) {
        prefix.resize(w.size());
        prefix[0] = w[0];
        for (int i = 1; i < (int)w.size(); i++) {
            prefix[i] = prefix[i - 1] + w[i]; // O(n)
        }
        total = prefix.back();
    }

    int pickIndex() {
        uniform_int_distribution<int> dist(1, total);
        int target = dist(rng);
        // O(log n) - find first prefix[i] >= target
        return lower_bound(prefix.begin(), prefix.end(), target) - prefix.begin();
    }
};
```

#### Rust

```rust []
pub struct RandomPickWithWeight {
    prefix: Vec<i32>,
    total: i32,
}

impl RandomPickWithWeight {
    // O(n) time, O(n) space
    pub fn new(w: Vec<i32>) -> Self {
        let mut prefix = Vec::with_capacity(w.len());
        let mut sum = 0;
        for &weight in &w {
            sum += weight;
            prefix.push(sum);
        }
        Self { prefix, total: sum }
    }

    // O(log n) time - binary search for first prefix[i] >= target
    pub fn pick_index(&self) -> i32 {
        let mut rng = rand::thread_rng();
        let target = rng.gen_range(1..=self.total);
        let mut lo = 0usize;
        let mut hi = self.prefix.len();
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            if self.prefix[mid] < target { lo = mid + 1; } else { hi = mid; }
        }
        lo as i32
    }
}
```

## Solution 2: Prefix Sum + Linear Scan

### Idea

Same prefix sum construction, but instead of binary search, simply scan from left to right to find the first index whose prefix sum is `>= target`. Simpler code but slower for large arrays.

Complexity: Constructor $O(n)$ time, $O(n)$ space. `pickIndex` $O(n)$ time.

#### Java

```java []
final class RandomPickWithWeight2 {

    private final int[] prefix;
    private final int total;
    private final Random rand;

    public RandomPickWithWeight2(int[] w) {
        prefix = new int[w.length];
        prefix[0] = w[0];
        for (int i = 1; i < w.length; i++) {
            prefix[i] = prefix[i - 1] + w[i];
        }
        total = prefix[w.length - 1];
        rand = new Random();
    }

    // O(n) time - linear scan
    public int pickIndex() {
        int target = rand.nextInt(total) + 1;
        for (int i = 0; i < prefix.length; i++) { // O(n)
            if (prefix[i] >= target) return i;
        }
        return prefix.length - 1;
    }
}
```

#### Python

```python []
class Solution2:
    """Prefix sum + linear scan. __init__: O(n) time, O(n) space. pickIndex: O(n) time."""

    def __init__(self, w: list[int]):
        self.prefix = []
        total = 0
        for weight in w:
            total += weight
            self.prefix.append(total)
        self.total = total

    def pickIndex(self) -> int:
        target = random.randint(1, self.total)
        for i, val in enumerate(self.prefix):  # O(n)
            if target <= val:
                return i
        return len(self.prefix) - 1
```

#### C++

```cpp []
// O(n) pickIndex via linear scan
class RandomPickWithWeight2 {
    vector<int> prefix;
    int total;
    mt19937 rng;

public:
    RandomPickWithWeight2(vector<int>& w) : rng(random_device{}()) {
        prefix.resize(w.size());
        prefix[0] = w[0];
        for (int i = 1; i < (int)w.size(); i++) {
            prefix[i] = prefix[i - 1] + w[i];
        }
        total = prefix.back();
    }

    int pickIndex() {
        uniform_int_distribution<int> dist(1, total);
        int target = dist(rng);
        for (int i = 0; i < (int)prefix.size(); i++) { // O(n)
            if (prefix[i] >= target) return i;
        }
        return (int)prefix.size() - 1;
    }
};
```

#### Rust

```rust []
pub struct RandomPickWithWeight2 {
    prefix: Vec<i32>,
    total: i32,
}

impl RandomPickWithWeight2 {
    pub fn new(w: Vec<i32>) -> Self {
        let mut prefix = Vec::with_capacity(w.len());
        let mut sum = 0;
        for &weight in &w {
            sum += weight;
            prefix.push(sum);
        }
        Self { prefix, total: sum }
    }

    // O(n) time - linear scan
    pub fn pick_index(&self) -> i32 {
        let mut rng = rand::thread_rng();
        let target = rng.gen_range(1..=self.total);
        for (i, &p) in self.prefix.iter().enumerate() {
            if p >= target { return i as i32; }
        }
        (self.prefix.len() - 1) as i32
    }
}
```
