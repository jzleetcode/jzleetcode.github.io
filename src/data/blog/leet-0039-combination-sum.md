---
author: JZ
pubDatetime: 2026-04-26T08:00:00Z
modDatetime: 2026-04-26T08:00:00Z
title: LeetCode 39 Combination Sum
featured: true
tags:
  - a-array
  - a-backtracking
  - a-dynamic-programming
description:
  "Solutions for LeetCode 39, medium, tags: array, backtracking."
---

## Table of contents

## Description

Question Links: [LeetCode 39](https://leetcode.com/problems/combination-sum/description/)

Given an array of **distinct** integers `candidates` and a target integer `target`, return a list of all **unique combinations** of `candidates` where the chosen numbers sum to `target`. You may return the combinations in **any order**.

The **same** number may be chosen from `candidates` an **unlimited number of times**. Two combinations are unique if the frequency of at least one of the chosen numbers is different.

The test cases are generated such that the number of unique combinations that sum up to `target` is less than `150` combinations for the given input.

```
Example 1:

Input: candidates = [2,3,6,7], target = 7
Output: [[2,2,3],[7]]
Explanation:
2 and 3 are candidates, and 2 + 2 + 3 = 7. Note that 2 can be used multiple times.
7 is a candidate, and 7 = 7.
These are the only two combinations.

Example 2:

Input: candidates = [2,3,5], target = 8
Output: [[2,2,2,2],[2,3,3],[3,5]]

Example 3:

Input: candidates = [2], target = 1
Output: []

Constraints:

1 <= candidates.length <= 30
2 <= candidates[i] <= 40
All elements of candidates are distinct.
1 <= target <= 40
```

## Solution 1: Backtracking with Sort and Pruning

### Idea

Sort the candidates first. Use DFS/backtracking starting from each candidate index. Since the array is sorted, once a candidate exceeds the remaining target, all subsequent candidates will too — we can `break` early. Allowing the same index to be reused enables unlimited repetitions.

```
candidates = [2,3,6,7], target = 7 (sorted)

                         remaining=7
                       /      |       \       \
                   [2]r=5  [3]r=4  [6]r=1  [7]r=0 -> [7] ✓
                  /   |      |       x(6>1)
             [2,2]r=3 [2,3]r=2 [3,3]r=1
             /   |      |        x(3>1)
       [2,2,2]r=1 [2,2,3]r=0 ✓ [2,3,?]
          x(2>1)                  x(3>2, break)

Result: [[2,2,3], [7]]
```

Complexity: Time $O(n^{t/m})$ where $n$ = number of candidates, $t$ = target, $m$ = smallest candidate. In the worst case the recursion tree has depth $t/m$ and branching factor $n$. Space $O(t/m)$ for the recursion stack depth.

#### Java

```java []
public static List<List<Integer>> combinationSum(int[] candidates, int target) {
    Arrays.sort(candidates);
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
        path.add(c[i]);
        backtrack(c, remaining - c[i], i, path, res); // same i: allow reuse
        path.remove(path.size() - 1);
    }
}
```

#### Python

```python []
class Solution:
    def combinationSum(self, candidates: list[int], target: int) -> list[list[int]]:
        candidates.sort()
        res: list[list[int]] = []

        def backtrack(start: int, remaining: int, path: list[int]) -> None:
            if remaining == 0:
                res.append(path[:])
                return
            for i in range(start, len(candidates)):  # O(n) branches per level
                if candidates[i] > remaining:  # prune: sorted, so all after are too large
                    break
                path.append(candidates[i])
                backtrack(i, remaining - candidates[i], path)  # same index: allow reuse
                path.pop()

        backtrack(0, target, [])
        return res
```

#### C++

```cpp []
class Solution {
public:
    vector<vector<int>> combinationSum(vector<int>& candidates, int target) {
        sort(candidates.begin(), candidates.end());
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
        for (int i = start; i < (int)c.size(); i++) { // O(n) branches
            if (c[i] > remaining) break; // prune: sorted
            path.push_back(c[i]);
            backtrack(c, remaining - c[i], i, path, res); // same i: allow reuse
            path.pop_back();
        }
    }
};
```

#### Rust

```rust []
pub fn combination_sum(mut candidates: Vec<i32>, target: i32) -> Vec<Vec<i32>> {
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
        path.push(c[i]);
        Self::backtrack(c, remaining - c[i], i, path, res); // same i: allow reuse
        path.pop();
    }
}
```

## Solution 2: Iterative DP

### Idea

Build an array `dp[s]` where each entry holds all combinations that sum to `s`. Initialize `dp[0] = [[]]` (empty combination sums to 0). For each candidate `c`, iterate sums from `c` to `target`. For each existing combination in `dp[s-c]`, create a new combination by appending `c` and add it to `dp[s]`.

By iterating candidates in the outer loop, we naturally avoid duplicate combinations (e.g., `[2,3]` and `[3,2]`) because each candidate can only extend combinations that were built from itself or earlier candidates.

```
candidates = [2,3,6,7], target = 7

After c=2: dp[2]=[[2]], dp[4]=[[2,2]], dp[6]=[[2,2,2]]
After c=3: dp[3]=[[3]], dp[5]=[[2,3]], dp[6]=[[2,2,2],[3,3]], dp[7]=[[2,2,3]]
After c=6: dp[6]=[[2,2,2],[3,3],[6]]
After c=7: dp[7]=[[2,2,3],[7]]

Result: [[2,2,3], [7]]
```

Complexity: Time $O(n \cdot t \cdot k)$ where $k$ is the average length of combinations stored — for each candidate and sum we copy existing combos. Space $O(t \cdot C)$ where $C$ is the total number of combinations across all sums.

#### Java

```java []
public static List<List<Integer>> combinationSumDP(int[] candidates, int target) {
    @SuppressWarnings("unchecked")
    List<List<Integer>>[] dp = new List[target + 1];
    for (int i = 0; i <= target; i++) dp[i] = new ArrayList<>();
    dp[0].add(new ArrayList<>());
    for (int c : candidates) { // O(n)
        for (int s = c; s <= target; s++) { // O(t)
            for (List<Integer> combo : dp[s - c]) {
                List<Integer> newCombo = new ArrayList<>(combo);
                newCombo.add(c);
                dp[s].add(newCombo);
            }
        }
    }
    return dp[target];
}
```

#### Python

```python []
class Solution2:
    def combinationSum(self, candidates: list[int], target: int) -> list[list[int]]:
        dp: list[list[list[int]]] = [[] for _ in range(target + 1)]  # dp[s] = combos summing to s
        dp[0] = [[]]
        for c in candidates:  # O(n) candidates
            for s in range(c, target + 1):  # O(t) sums
                for combo in dp[s - c]:  # extend each existing combo
                    dp[s].append(combo + [c])
        return dp[target]
```

#### C++

```cpp []
class SolutionDP {
public:
    vector<vector<int>> combinationSum(vector<int>& candidates, int target) {
        vector<vector<vector<int>>> dp(target + 1);
        dp[0] = {{}};
        for (int c : candidates) { // O(n)
            for (int s = c; s <= target; s++) { // O(t)
                for (auto& combo : dp[s - c]) {
                    dp[s].push_back(combo);
                    dp[s].back().push_back(c);
                }
            }
        }
        return dp[target];
    }
};
```

#### Rust

```rust []
pub fn combination_sum_dp(candidates: Vec<i32>, target: i32) -> Vec<Vec<i32>> {
    let target = target as usize;
    let mut dp: Vec<Vec<Vec<i32>>> = vec![vec![]; target + 1];
    dp[0] = vec![vec![]];
    for c in &candidates { // O(n)
        let c = *c;
        for s in c as usize..=target { // O(t)
            let prev = dp[s - c as usize].clone();
            for mut combo in prev {
                combo.push(c);
                dp[s].push(combo);
            }
        }
    }
    dp[target].clone()
}
```
