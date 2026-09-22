---
author: JZ
pubDatetime: 2026-09-22T10:07:00Z
modDatetime: 2026-09-22T10:07:00Z
title: LeetCode 229 Majority Element II
featured: true
tags:
  - a-array
  - a-hash
description:
  "Solutions for LeetCode 229, medium, tags: array, hash table, sorting, counting."
---

## Table of contents

## Description

Given an integer array of size `n`, find all elements that appear more than `⌊n/3⌋` times.

### Constraints

- `1 <= nums.length <= 5 * 10^4`
- `-10^9 <= nums[i] <= 10^9`

Link: [LeetCode 229](https://leetcode.com/problems/majority-element-ii/)

## Idea 1: Boyer-Moore Voting

This extends the classic Boyer-Moore majority vote to the `n/3` case. Key insight: at most **2** elements can appear more than `⌊n/3⌋` times.

We maintain two candidate slots with counters. When we see a number that matches neither candidate and both counters are positive, we decrement both — effectively "canceling" a triplet of three distinct values. After one pass, the two candidates are the *only possible* majority elements. A second verification pass confirms their actual counts.

```
nums: [1, 1, 1, 3, 3, 2, 2, 2]

Phase 1 — find candidates:
  i=0  n=1  → c1=1, cnt1=1
  i=1  n=1  → c1 match, cnt1=2
  i=2  n=1  → c1 match, cnt1=3
  i=3  n=3  → c2=3, cnt2=1
  i=4  n=3  → c2 match, cnt2=2
  i=5  n=2  → neither, cnt1=2, cnt2=1
  i=6  n=2  → neither, cnt1=1, cnt2=0
  i=7  n=2  → cnt2==0, c2=2, cnt2=1

  candidates: c1=1, c2=2

Phase 2 — verify:
  count(1) = 3 > 8/3 = 2  ✓
  count(2) = 3 > 8/3 = 2  ✓

result: [1, 2]
```

Complexity: Time $O(n)$ — two passes. Space $O(1)$ — only 4 variables.

### Java

```java []
public List<Integer> majorityElementBMVoting(int[] nums) {
    List<Integer> result = new ArrayList<>(2);
    if (nums == null || nums.length == 0) return result;
    int candidate1 = nums[0], candidate2 = nums[0], count1 = 0, count2 = 0, len = nums.length;
    for (int i = 0; i < len; i++) { // O(n)
        if (nums[i] == candidate1) count1++;
        else if (nums[i] == candidate2) count2++;
        else if (count1 == 0) {
            candidate1 = nums[i];
            count1 = 1;
        } else if (count2 == 0) {
            candidate2 = nums[i];
            count2 = 1;
        } else {
            count1--; // cancel a triplet of 3 distinct values
            count2--;
        }
    }
    count1 = 0;
    count2 = 0;
    for (int i = 0; i < len; i++) { // O(n) verification
        if (nums[i] == candidate1) count1++;
        else if (nums[i] == candidate2) count2++;
    }
    if (count1 > len / 3) result.add(candidate1);
    if (count2 > len / 3) result.add(candidate2);
    return result;
}
```

### Python

```python []
def majorityElement(self, nums: list[int]) -> list[int]:
    c1 = c2 = 0
    n1 = n2 = None
    for num in nums:  # O(n)
        if num == n1:
            c1 += 1
        elif num == n2:
            c2 += 1
        elif c1 == 0:
            n1, c1 = num, 1
        elif c2 == 0:
            n2, c2 = num, 1
        else:
            c1 -= 1
            c2 -= 1
    # O(n) verification pass
    threshold = len(nums) // 3
    return [n for n in (n1, n2) if n is not None and nums.count(n) > threshold]
```

### C++

```cpp []
vector<int> majorityElementVoting(vector<int>& nums) {
    int cand1 = 0, cand2 = 0, cnt1 = 0, cnt2 = 0;
    for (int num : nums) { // O(n)
        if (num == cand1) cnt1++;
        else if (num == cand2) cnt2++;
        else if (cnt1 == 0) { cand1 = num; cnt1 = 1; }
        else if (cnt2 == 0) { cand2 = num; cnt2 = 1; }
        else { cnt1--; cnt2--; } // cancel triplet
    }
    cnt1 = cnt2 = 0;
    for (int num : nums) { // O(n) verify
        if (num == cand1) cnt1++;
        else if (num == cand2) cnt2++;
    }
    vector<int> result;
    int n = nums.size();
    if (cnt1 > n / 3) result.push_back(cand1);
    if (cnt2 > n / 3) result.push_back(cand2);
    sort(result.begin(), result.end());
    return result;
}
```

### Rust

```rust []
pub fn majority_element(nums: Vec<i32>) -> Vec<i32> {
    let (mut c1, mut c2) = (0, 1);
    let (mut cnt1, mut cnt2) = (0i32, 0i32);
    for &n in &nums { // O(n)
        if n == c1 { cnt1 += 1; }
        else if n == c2 { cnt2 += 1; }
        else if cnt1 == 0 { c1 = n; cnt1 = 1; }
        else if cnt2 == 0 { c2 = n; cnt2 = 1; }
        else { cnt1 -= 1; cnt2 -= 1; } // cancel triplet
    }
    let threshold = (nums.len() / 3) as i32;
    let mut result: Vec<i32> = [c1, c2].iter().copied()
        .filter(|&c| nums.iter().filter(|&&x| x == c).count() as i32 > threshold) // O(n) verify
        .collect();
    result.sort();
    result.dedup();
    result
}
```

## Idea 2: HashMap Counting

Count occurrences with a hash map, then collect entries exceeding the threshold.

Complexity: Time $O(n)$ — one pass to count, one to filter. Space $O(n)$ — hash map stores up to $n$ entries.

### Java

```java []
public List<Integer> majorityElementMap(int[] nums) {
    List<Integer> result = new ArrayList<>();
    if (nums == null || nums.length == 0) return result;
    int oneThird = nums.length / 3;
    Map<Integer, Integer> counts = new HashMap<>();
    for (int n : nums) { // O(n), each put O(1) amortized
        if (!counts.containsKey(n)) counts.put(n, 1);
        else counts.put(n, counts.get(n) + 1);
    }
    for (Map.Entry<Integer, Integer> entry : counts.entrySet()) // O(n)
        if (entry.getValue() > oneThird) result.add(entry.getKey());
    return result;
}
```

### Python

```python []
def majorityElementMap(self, nums: list[int]) -> list[int]:
    counts = {}
    threshold = len(nums) // 3
    for num in nums:  # O(n)
        counts[num] = counts.get(num, 0) + 1  # O(1) per insert
    return [num for num, cnt in counts.items() if cnt > threshold]
```

### C++

```cpp []
vector<int> majorityElementMap(vector<int>& nums) {
    unordered_map<int, int> counts;
    int n = nums.size();
    vector<int> result;
    for (int num : nums) counts[num]++; // O(n), O(1) amortized per insert
    for (auto& [val, cnt] : counts)     // O(n)
        if (cnt > n / 3) result.push_back(val);
    sort(result.begin(), result.end());
    return result;
}
```

### Rust

```rust []
pub fn majority_element_hashmap(nums: Vec<i32>) -> Vec<i32> {
    let threshold = nums.len() / 3;
    let mut counts: HashMap<i32, usize> = HashMap::new();
    for &n in &nums { // O(n)
        *counts.entry(n).or_insert(0) += 1; // O(1) amortized
    }
    let mut result: Vec<i32> = counts.into_iter()
        .filter(|&(_, cnt)| cnt > threshold) // O(n)
        .map(|(val, _)| val)
        .collect();
    result.sort();
    result
}
```
