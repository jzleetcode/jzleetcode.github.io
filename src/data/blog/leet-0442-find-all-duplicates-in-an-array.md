---
author: JZ
pubDatetime: 2026-09-17T10:37:00Z
modDatetime: 2026-09-17T10:37:00Z
title: LeetCode 442 Find All Duplicates in an Array
featured: false
tags:
  - a-array
  - a-hash
description:
  "Solutions for LeetCode 442, medium, tags: array, hash table."
---

## Table of contents

## Description

Given an integer array `nums` of length `n` where all the integers of `nums` are in the range `[1, n]` and each integer appears **at most twice**, return an array of all the integers that appear **twice**.

You must write an algorithm that runs in `O(n)` time and uses only constant extra space.

### Constraints

- `n == nums.length`
- `1 <= n <= 10^5`
- `1 <= nums[i] <= n`
- Each element in `nums` appears **once** or **twice**.

Link: [LeetCode 442](https://leetcode.com/problems/find-all-duplicates-in-an-array/)

## Idea 1: Negation Marking

Since every value is in `[1, n]`, we can use the array itself as a hash map: for each value `v`, use index `v-1` as its "bucket" and **negate** the value there as a visited flag.

```
nums:  [4, 3, 2, 7, 8, 2, 3, 1]

i=0  v=4  → check nums[3]=7 > 0  → negate: nums[3]=-7
i=1  v=3  → check nums[2]=2 > 0  → negate: nums[2]=-2
i=2  v=2  → check nums[1]=3 > 0  → negate: nums[1]=-3
i=3  v=7  → check nums[6]=3 > 0  → negate: nums[6]=-3
i=4  v=8  → check nums[7]=1 > 0  → negate: nums[7]=-1
i=5  v=2  → check nums[1]=-3 < 0 → duplicate! add 2
i=6  v=3  → check nums[2]=-2 < 0 → duplicate! add 3
i=7  v=1  → check nums[0]=4 > 0  → negate: nums[0]=-4

result: [2, 3]
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public static List<Integer> findDuplicates1(int[] nums) {
    List<Integer> res = new ArrayList<>();
    for (int i = 0; i < nums.length; i++) {
        int idx = Math.abs(nums[i]) - 1; // map value to index, O(1)
        if (nums[idx] < 0) res.add(idx + 1); // already visited, idx+1 is duplicate
        else nums[idx] = -nums[idx]; // mark visited by negating, O(1)
    }
    return res;
}
```

### Python

```python []
def findDuplicates(self, nums: list[int]) -> list[int]:
    result = []
    for num in nums:  # O(n)
        idx = abs(num) - 1  # O(1) map value to index
        if nums[idx] < 0:
            result.append(abs(num))
        else:
            nums[idx] = -nums[idx]
    return result  # O(n) time, O(1) space (output excluded)
```

### C++

```cpp []
static vector<int> findDuplicates(vector<int>& nums) {
    vector<int> result;
    for (int i = 0; i < static_cast<int>(nums.size()); i++) {
        int idx = abs(nums[i]) - 1;     // map value to index — O(1)
        if (nums[idx] < 0) {
            result.push_back(idx + 1);   // already visited → duplicate
        } else {
            nums[idx] = -nums[idx];      // mark as visited by negating
        }
    }
    return result;
}
```

### Rust

```rust []
pub fn find_duplicates(mut nums: Vec<i32>) -> Vec<i32> {
    let mut result = Vec::new();
    for i in 0..nums.len() {
        let idx = nums[i].unsigned_abs() as usize - 1; // map value to index — O(1)
        if nums[idx] < 0 {
            result.push(idx as i32 + 1); // already visited — v is duplicate
        } else {
            nums[idx] = -nums[idx]; // mark as seen — O(1) per element
        }
    }
    result // total: O(n) time, O(1) extra space
}
```

## Idea 2: Cyclic Sort

Place each value `v` at its "home" index `v-1` by swapping. After the sort pass, any position `i` where `nums[i] != i+1` holds a duplicate value.

```
nums: [4, 3, 2, 7, 8, 2, 3, 1]

Sorting phase (swap v to index v-1):
  [4,3,2,7,8,2,3,1] → swap 4↔7 → [7,3,2,4,8,2,3,1]
  [7,3,2,4,8,2,3,1] → swap 7↔3 → [3,3,2,4,8,2,7,1]
  [3,3,2,4,8,2,7,1] → swap 3↔2 → [2,3,3,4,8,2,7,1]
  [2,3,3,4,8,2,7,1] → swap 2↔3 → [3,2,3,4,8,2,7,1]
  ... → eventually: [1,2,3,4,3,2,7,8]

Scan: nums[4]=3≠5 → dup, nums[5]=2≠6 → dup
result: [3, 2]
```

Complexity: Time $O(n)$ — each element swapped at most once. Space $O(1)$.

### Java

```java []
public static List<Integer> findDuplicates2(int[] nums) {
    List<Integer> res = new ArrayList<>();
    for (int i = 0; i < nums.length; ) { // note do not auto increment i
        int v = nums[i];
        if (v == i + 1) i++; // already in place, nums[i]==i+1
        else if (v == nums[v - 1]) i++; // duplicate detected, v already at nums[v-1], skip
        else { // swap nums[i] and nums[v-1] to place v at index v-1, O(1)
            nums[i] = nums[v - 1];
            nums[v - 1] = v;
        }
    }
    for (int i = 0; i < nums.length; i++) // scan for mismatches, O(n)
        if (nums[i] != i + 1) res.add(nums[i]); // nums[i] is a duplicate
    return res;
}
```

### Python

```python []
def findDuplicates(self, nums: list[int]) -> list[int]:
    n = len(nums)
    i = 0
    while i < n:  # O(n) total swaps, each element placed at most once
        correct = nums[i] - 1
        if nums[i] != nums[correct]:
            nums[i], nums[correct] = nums[correct], nums[i]  # O(1) swap
        else:
            i += 1
    return [nums[i] for i in range(n) if nums[i] != i + 1]  # O(n) scan
```

### C++

```cpp []
static vector<int> findDuplicatesCyclicSort(vector<int>& nums) {
    int n = static_cast<int>(nums.size());
    for (int i = 0; i < n; i++) {
        while (nums[i] != nums[nums[i] - 1]) { // swap until correct or dup — O(1) amortized
            swap(nums[i], nums[nums[i] - 1]);
        }
    }
    vector<int> result;
    for (int i = 0; i < n; i++) {
        if (nums[i] != i + 1) { // value at wrong position → duplicate
            result.push_back(nums[i]);
        }
    }
    return result;
}
```

### Rust

```rust []
pub fn find_duplicates_cyclic_sort(mut nums: Vec<i32>) -> Vec<i32> {
    let n = nums.len();
    let mut i = 0;
    while i < n {
        let target = nums[i] as usize - 1; // correct index for value nums[i]
        if nums[i] != nums[target] {
            nums.swap(i, target); // place nums[i] at its home — O(1) per swap
        } else {
            i += 1;
        }
    }
    let mut result = Vec::new();
    for i in 0..n {
        if nums[i] != i as i32 + 1 {
            result.push(nums[i]); // value at wrong index is duplicate
        }
    }
    result
}
```
