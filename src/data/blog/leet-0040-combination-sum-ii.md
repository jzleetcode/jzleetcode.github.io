---
author: JZ
pubDatetime: 2026-08-31T10:37:00Z
modDatetime: 2026-08-31T10:37:00Z
title: LeetCode 40 Combination Sum II
featured: true
tags:
  - a-array
  - a-backtracking
  - a-sorting
description:
  "Solutions for LeetCode 40, medium, tags: array, backtracking, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 40](https://leetcode.com/problems/combination-sum-ii/description/)

Given a collection of candidate numbers (`candidates`) and a target number (`target`), find all unique combinations in `candidates` where the candidate numbers sum to `target`.

Each number in `candidates` may only be used **once** in the combination.

**Note:** The solution set must not contain duplicate combinations.

```
Example 1:

Input: candidates = [10,1,2,7,6,1,5], target = 8
Output: [[1,1,6],[1,2,5],[1,7],[2,6]]

Example 2:

Input: candidates = [2,5,2,1,2], target = 5
Output: [[1,2,2],[5]]

Constraints:

1 <= candidates.length <= 100
1 <= candidates[i] <= 50
1 <= target <= 30
```

## Solution 1: Backtracking with Sort and Skip Duplicates

### Idea

Sort the candidates. Backtrack from each index, advancing to `i+1` (each element used at most once). The key insight for avoiding duplicate combinations: **at the same recursion level, skip a candidate if it equals the previous candidate**. Since the array is sorted, equal elements are adjacent, and `if i > start and candidates[i] == candidates[i-1]` catches exactly the duplicate branches.

```
candidates = [1,1,2,5,6,7,10], target = 8 (sorted)

                              remaining=8
                        /        |        \      \       \
                    [1]r=7   [2]r=6   [5]r=3  [6]r=2  [7]r=1
                   / | \       |        |       |       x(>1,prune)
          [1,1]r=6  ...     [2,5]r=1  [5,6]x  [6,?]x
           / |  \             x(2>1)
   [1,1,2]r=4 [1,1,5]r=1 [1,1,6]r=0 ✓
      |         x(5>1)
   [1,1,2,5]x
   
   skip second 1 at level 0: i=1, i>start=0, c[1]==c[0] → skip
   
   Result: [[1,1,6],[1,2,5],[1,7],[2,6]]
```

Why skipping works: if `candidates[i] == candidates[i-1]` at the same level, any combination starting with `candidates[i]` would be a subset of combinations already explored starting with `candidates[i-1]` (which had access to all elements from `i` onward).

Complexity: Time $O(2^n)$ — each candidate is either included or not. Space $O(n)$ for the recursion stack depth.

#### Java

```java []
public static List<List<Integer>> combinationSum2(int[] candidates, int target) {
    Arrays.sort(candidates); // O(n log n)
    List<List<Integer>> res = new ArrayList<>();
    backtrack(candidates, target, 0, new ArrayList<>(), res);
    return res;
}

private static void backtrack(int[] c, int remaining, int start, List<Integer> path, List<List<Integer>> res) {
    if (remaining == 0) {
        res.add(new ArrayList<>(path));
        return;
    }
    for (int i = start; i < c.length; i++) { // O(n) branches
        if (c[i] > remaining) break; // prune: sorted
        if (i > start && c[i] == c[i - 1]) continue; // skip duplicates at same level
        path.add(c[i]);
        backtrack(c, remaining - c[i], i + 1, path, res); // i+1: each element used once
        path.remove(path.size() - 1);
    }
}
```

#### Python

```python []
class Solution:
    def combinationSum2(self, candidates: list[int], target: int) -> list[list[int]]:
        candidates.sort()  # O(n log n)
        res: list[list[int]] = []

        def backtrack(start: int, remaining: int, path: list[int]) -> None:
            if remaining == 0:
                res.append(path[:])
                return
            for i in range(start, len(candidates)):  # O(n) branches per level
                if candidates[i] > remaining:  # prune: sorted, rest too large
                    break
                if i > start and candidates[i] == candidates[i - 1]:  # skip duplicates at same level
                    continue
                path.append(candidates[i])
                backtrack(i + 1, remaining - candidates[i], path)  # i+1: each element used once
                path.pop()

        backtrack(0, target, [])
        return res
```

#### C++

```cpp []
class Solution40 {
public:
    vector<vector<int>> combinationSum2(vector<int>& candidates, int target) {
        sort(candidates.begin(), candidates.end()); // O(n log n)
        vector<vector<int>> res;
        vector<int> path;
        backtrack(candidates, target, 0, path, res);
        return res;
    }
private:
    void backtrack(vector<int>& c, int remaining, int start, vector<int>& path, vector<vector<int>>& res) {
        if (remaining == 0) {
            res.push_back(path);
            return;
        }
        for (int i = start; i < (int)c.size(); i++) { // O(2^n) total branches
            if (c[i] > remaining) break; // prune: sorted
            if (i > start && c[i] == c[i - 1]) continue; // skip duplicates at same level
            path.push_back(c[i]);
            backtrack(c, remaining - c[i], i + 1, path, res); // i+1: each element used once
            path.pop_back();
        }
    }
};
```

#### Rust

```rust []
pub fn combination_sum2(mut candidates: Vec<i32>, target: i32) -> Vec<Vec<i32>> {
    candidates.sort();
    let mut res = Vec::new();
    Self::backtrack(&candidates, target, 0, &mut vec![], &mut res);
    res
}

fn backtrack(c: &[i32], remaining: i32, start: usize, path: &mut Vec<i32>, res: &mut Vec<Vec<i32>>) {
    if remaining == 0 {
        res.push(path.clone());
        return;
    }
    for i in start..c.len() { // O(n) branches per level
        if c[i] > remaining { break; } // prune: sorted
        if i > start && c[i] == c[i - 1] { continue; } // skip duplicates at same level
        path.push(c[i]);
        Self::backtrack(c, remaining - c[i], i + 1, path, res); // i+1: each used at most once
        path.pop();
    }
}
```

## Solution 2: Counter-Based Backtracking

### Idea

Instead of sorting and skipping adjacent duplicates, group candidates by value using a frequency map (Counter/HashMap). Then iterate over unique values in sorted order. For each unique value, try using 1 copy, 2 copies, ..., up to `min(frequency, remaining/value)` copies. This naturally avoids duplicates since each unique value is processed exactly once.

```
candidates = [10,1,2,7,6,1,5], target = 8
counter = {10:1, 1:2, 2:1, 7:1, 6:1, 5:1}
unique (sorted) = [(1,2), (2,1), (5,1), (6,1), (7,1), (10,1)]

                               remaining=8
                         /           |           \
                 use 1x1, r=7    use 2x1, r=6    (skip 1)
                /    |    \         |    \
          [1,2]r=5 [1,5]r=2 ...  [1,1,2]r=4 ...
            |        |             |
        [1,2,5]r=0✓  [1,5,?]    [1,1,2,5]x(>0)
                      x(>2)      [1,1,6]r=0 ✓

Result: [[1,1,6],[1,2,5],[1,7],[2,6]]
```

Complexity: Time $O(2^n)$ — bounded by the number of subsets. Space $O(n)$ for the recursion depth plus the counter.

#### Java

```java []
public static List<List<Integer>> combinationSum2Counter(int[] candidates, int target) {
    Map<Integer, Integer> freq = new HashMap<>();
    for (int c : candidates) freq.merge(c, 1, Integer::sum); // O(n)
    List<int[]> entries = new ArrayList<>();
    for (var e : freq.entrySet()) entries.add(new int[]{e.getKey(), e.getValue()});
    entries.sort(Comparator.comparingInt(a -> a[0])); // O(k log k), k = unique keys
    List<List<Integer>> res = new ArrayList<>();
    counterBacktrack(entries, target, 0, new ArrayList<>(), res);
    return res;
}

private static void counterBacktrack(List<int[]> entries, int remaining, int idx,
                                     List<Integer> path, List<List<Integer>> res) {
    if (remaining == 0) {
        res.add(new ArrayList<>(path));
        return;
    }
    for (int i = idx; i < entries.size(); i++) { // O(k) unique keys
        int val = entries.get(i)[0], count = entries.get(i)[1];
        if (val > remaining) break; // prune: sorted
        for (int c = 1; c <= count && c * val <= remaining; c++) { // O(count) copies
            path.add(val);
            counterBacktrack(entries, remaining - c * val, i + 1, path, res);
        }
        for (int c = Math.min(count, remaining / val); c >= 1; c--) path.remove(path.size() - 1);
    }
}
```

#### Python

```python []
class Solution2:
    def combinationSum2(self, candidates: list[int], target: int) -> list[list[int]]:
        from collections import Counter
        counter = Counter(candidates)
        unique = sorted(counter.keys())  # O(u log u) where u = unique count
        res: list[list[int]] = []

        def backtrack(idx: int, remaining: int, path: list[int]) -> None:
            if remaining == 0:
                res.append(path[:])
                return
            for i in range(idx, len(unique)):  # O(u) branches
                c = unique[i]
                if c > remaining:  # prune
                    break
                orig_len = len(path)
                for count in range(1, counter[c] + 1):  # try 1..freq copies of c
                    if c * count > remaining:  # prune
                        break
                    path.append(c)
                    backtrack(i + 1, remaining - c * count, path)
                del path[orig_len:]  # remove all appended copies of c

        backtrack(0, target, [])
        return res
```

#### C++

```cpp []
class Solution40Counter {
public:
    vector<vector<int>> combinationSum2(vector<int>& candidates, int target) {
        unordered_map<int, int> counter;
        for (int c : candidates) counter[c]++; // O(n)
        vector<pair<int, int>> counts(counter.begin(), counter.end());
        sort(counts.begin(), counts.end()); // sort by value
        vector<vector<int>> res;
        vector<int> path;
        backtrack(counts, target, 0, path, res);
        return res;
    }
private:
    void backtrack(vector<pair<int,int>>& counts, int remaining, int idx,
                   vector<int>& path, vector<vector<int>>& res) {
        if (remaining == 0) {
            res.push_back(path);
            return;
        }
        for (int i = idx; i < (int)counts.size(); i++) { // iterate unique values
            int val = counts[i].first;
            int freq = counts[i].second;
            if (val > remaining) break; // prune: sorted
            for (int k = 1; k <= freq && k * val <= remaining; k++) { // use 1..freq copies
                path.push_back(val);
                backtrack(counts, remaining - k * val, i + 1, path, res);
            }
            for (int k = min(freq, remaining / val); k > 0; k--) path.pop_back();
        }
    }
};
```

#### Rust

```rust []
pub fn combination_sum2_counter(candidates: Vec<i32>, target: i32) -> Vec<Vec<i32>> {
    use std::collections::HashMap;
    let mut counter: HashMap<i32, usize> = HashMap::new();
    for c in &candidates { // O(n) count frequencies
        *counter.entry(*c).or_insert(0) += 1;
    }
    let mut uniq: Vec<(i32, usize)> = counter.into_iter().collect();
    uniq.sort(); // sort for deterministic order
    let mut res = Vec::new();
    Self::bt_counter(&uniq, target, 0, &mut vec![], &mut res);
    res
}

fn bt_counter(
    uniq: &[(i32, usize)],
    remaining: i32,
    start: usize,
    path: &mut Vec<i32>,
    res: &mut Vec<Vec<i32>>,
) {
    if remaining == 0 {
        res.push(path.clone());
        return;
    }
    for i in start..uniq.len() { // O(k) unique candidates
        let (val, count) = uniq[i];
        if val > remaining { break; } // prune: sorted
        for times in 1..=count { // use val 1..count times
            if val * times as i32 > remaining { break; }
            path.push(val);
            Self::bt_counter(uniq, remaining - val * times as i32, i + 1, path, res);
        }
        for _ in 0..count.min((remaining / val) as usize) { // pop all pushed
            path.pop();
        }
    }
}
```
