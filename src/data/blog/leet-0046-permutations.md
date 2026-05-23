---
author: JZ
pubDatetime: 2026-05-17T10:13:00Z
modDatetime: 2026-05-17T10:13:00Z
title: LeetCode 46 Permutations
featured: false
tags:
  - a-array
  - a-backtracking
description:
  "Solutions for LeetCode 46, medium, tags: array, backtracking."
---

## Table of contents

## Description

Question Link: [LeetCode 46](https://leetcode.com/problems/permutations/description/)

Given an array `nums` of distinct integers, return _all the possible permutations_. You can return the answer in **any order**.

```
Example 1:

Input: nums = [1,2,3]
Output: [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]

Example 2:

Input: nums = [0,1]
Output: [[0,1],[1,0]]

Example 3:

Input: nums = [1]
Output: [[1]]
```

**Constraints:**

-   `1 <= nums.length <= 6`
-   `-10 <= nums[i] <= 10`
-   All the integers of `nums` are **unique**.

## Idea1

Backtracking with swap. For each position `begin`, try placing every remaining element there by swapping, recurse on the rest, then swap back to restore state.

```
             [1, 2, 3]
            /    |     \
      fix=0  swap(0,1)  swap(0,2)
       [1,2,3]  [2,1,3]  [3,2,1]
       /    \    /    \    /    \
    [1,2,3] [1,3,2] [2,1,3] [2,3,1] [3,2,1] [3,1,2]
```

The recursion tree has $n!$ leaves (one per permutation), and copying each leaf takes $O(n)$.

Complexity: Time $O(n \cdot n!)$, Space $O(n)$ recursion depth (not counting result).

### Java

```java []
// O(n*n!) time, O(n) space (recursion depth, not counting result).
static class SolutionRecur {
    int[] nums;
    List<List<Integer>> res;

    public List<List<Integer>> permute(int[] nums) {
        this.nums = nums;
        res = new ArrayList<>();
        permute(0);
        return res;
    }

    void permute(int begin) {
        if (begin == nums.length) {
            res.add(Arrays.stream(nums).boxed().collect(Collectors.toList())); // O(n) copy
            return;
        }
        for (int i = begin; i < nums.length; i++) { // O(n-begin) branches
            swap(begin, i);
            permute(begin + 1);
            swap(begin, i);
        }
    }

    private void swap(int i, int j) {
        if (i != j) {
            int temp = nums[i];
            nums[i] = nums[j];
            nums[j] = temp;
        }
    }
}
```

### Python

```python []
class Solution:
    """Backtracking with swap. O(n*n!) time, O(n) space."""

    def permute(self, nums: List[int]) -> List[List[int]]:
        res = []

        def dfs(fix):  # O(n!) branches
            if fix == len(nums):
                res.append(nums.copy())  # O(n) copy
                return
            for i in range(fix, len(nums)):
                nums[i], nums[fix] = nums[fix], nums[i]
                dfs(fix + 1)
                nums[i], nums[fix] = nums[fix], nums[i]

        dfs(0)
        return res
```

### C++

```cpp []
// Backtracking with swap. O(n*n!) time, O(n) recursion depth.
class SolutionPermutations {
public:
    vector<vector<int>> permuteSwap(vector<int> &nums) {
        vector<vector<int>> result;
        backtrack(nums, 0, result);
        return result;
    }

private:
    void backtrack(vector<int> &nums, int begin, vector<vector<int>> &result) {
        if (begin == (int)nums.size()) {
            result.push_back(nums); // O(n) copy
            return;
        }
        for (int i = begin; i < (int)nums.size(); i++) { // O(n-begin) branches
            swap(nums[begin], nums[i]);
            backtrack(nums, begin + 1, result);
            swap(nums[begin], nums[i]);
        }
    }
};
```

### Rust

```rust []
impl Solution {
    /// Backtracking with swap. O(n*n!) time, O(n) space (recursion depth).
    pub fn permute(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut nums = nums;
        let mut res = Vec::new();
        Self::backtrack(&mut nums, 0, &mut res);
        res
    }

    fn backtrack(nums: &mut Vec<i32>, start: usize, res: &mut Vec<Vec<i32>>) {
        if start == nums.len() {
            res.push(nums.clone()); // O(n) copy
            return;
        }
        for i in start..nums.len() { // O(n-start) branches
            nums.swap(start, i);
            Self::backtrack(nums, start + 1, res);
            nums.swap(start, i);
        }
    }
}
```

## Idea2

Iterative insertion. Build permutations incrementally: start with the first element, then for each subsequent element, insert it at every possible position in each existing permutation.

For `[1,2,3]`:
1. Start: `[[1]]`
2. Insert `2` at positions 0,1 of `[1]`: `[[2,1], [1,2]]`
3. Insert `3` at positions 0,1,2 of each: `[[3,2,1], [2,3,1], [2,1,3], [3,1,2], [1,3,2], [1,2,3]]`

Complexity: Time $O(n \cdot n!)$, Space $O(1)$ extra (not counting the result).

### Java

```java []
// Iterative insertion. O(n*n!) time, O(1) space not counting result.
public List<List<Integer>> permuteI(int[] num) {
    List<List<Integer>> res = new ArrayList<>();
    List<Integer> l0 = new ArrayList<>();
    l0.add(num[0]);
    res.add(l0);
    for (int i = 1; i < num.length; i++) { // O(n) elements to insert
        List<List<Integer>> new_res = new ArrayList<>();
        for (int j = 0; j <= i; ++j) { // O(i) insertion positions
            for (List<Integer> l : res) { // O((i-1)!) existing permutations
                List<Integer> new_l = new LinkedList<>(l);
                new_l.add(j, num[i]);
                new_res.add(new_l);
            }
        }
        res = new_res;
    }
    return res;
}
```

### Python

```python []
class Solution2:
    """Iterative insertion. O(n*n!) time, O(1) space not counting result."""

    def permute(self, nums: List[int]) -> List[List[int]]:
        res = [[nums[0]]]
        for i in range(1, len(nums)):  # O(n) elements to insert
            new_res = []
            for perm in res:  # O((i-1)!) existing permutations
                for j in range(i + 1):  # O(i) insertion positions
                    new_res.append(perm[:j] + [nums[i]] + perm[j:])
            res = new_res
        return res
```

### C++

```cpp []
// Iterative insertion. O(n*n!) time, O(1) extra space (not counting result).
vector<vector<int>> permuteInsert(vector<int> &nums) {
    vector<vector<int>> result;
    if (nums.empty()) return result;
    result.push_back({nums[0]});
    for (int i = 1; i < (int)nums.size(); i++) { // O(n) elements
        vector<vector<int>> next;
        for (auto &perm : result) { // O((i-1)!) existing permutations
            for (int j = 0; j <= (int)perm.size(); j++) { // O(i) positions
                vector<int> newPerm(perm);
                newPerm.insert(newPerm.begin() + j, nums[i]);
                next.push_back(move(newPerm));
            }
        }
        result = move(next);
    }
    return result;
}
```

### Rust

```rust []
impl Solution {
    /// Iterative insertion. O(n*n!) time, O(1) extra space (not counting result).
    pub fn permute_insert(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut perms: Vec<Vec<i32>> = vec![vec![]];
        for &num in &nums { // O(n) elements
            let mut next = Vec::with_capacity(perms.len() * (perms[0].len() + 1));
            for perm in &perms { // O((i-1)!) existing permutations
                for pos in 0..=perm.len() { // O(i) insertion positions
                    let mut new_perm = perm.clone();
                    new_perm.insert(pos, num);
                    next.push(new_perm);
                }
            }
            perms = next;
        }
        perms
    }
}
```
