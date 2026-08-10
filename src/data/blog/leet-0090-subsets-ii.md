---
author: JZ
pubDatetime: 2026-08-10T10:38:00Z
modDatetime: 2026-08-10T10:38:00Z
title: LeetCode 90 Subsets II
featured: true
tags:
  - a-backtracking
description:
  "Solutions for LeetCode 90, medium, tags: array, backtracking, bit manipulation."
---

## Table of contents

## Description

Given an integer array `nums` that may contain duplicates, return all possible subsets (the power set).

The solution set must **not** contain duplicate subsets. Return the solution in any order.

**Example 1:**

> Input: nums = [1,2,2]
> Output: [[],[1],[1,2],[1,2,2],[2],[2,2]]

**Example 2:**

> Input: nums = [0]
> Output: [[],[0]]

**Constraints:**

- `1 <= nums.length <= 10`
- `-10 <= nums[i] <= 10`

Link: [LeetCode 90](https://leetcode.com/problems/subsets-ii/)

## Idea1: Backtracking with Duplicate Skipping

This is the same framework as [LeetCode 78 Subsets](/posts/leet-0078-subsets/), but the input may contain duplicates. The key insight is: **sort first**, then at each recursion level skip elements that are the same as the previous element at that level.

```
Sort [1,2,2] → [1,2,2]

Recursion tree (X = pruned):

                  []
         /        |        \
       [1]       [2]       X (2==2, skip)
      /   \       |
   [1,2]  X    [2,2]
     |
  [1,2,2]
```

At each level, `if i > start && nums[i] == nums[i-1]` prunes the duplicate branch. The first `2` at that level generates all subsets containing `2`; the second `2` would generate duplicates.

Complexity: Time $O(n \cdot 2^n)$ — at most $\prod (freq_i + 1)$ unique subsets (bounded by $2^n$), each $O(n)$ to copy. Space $O(n)$ excluding result (recursion depth).

## Idea2: Iterative Cascading

Build subsets incrementally. For each element:
- If it's a **new** value: extend **all** existing subsets with it.
- If it's a **duplicate**: extend **only** the subsets added in the previous round.

This works because extending an older subset with a duplicate would recreate a subset already generated when that value appeared first.

```
nums = [1,2,2] (sorted)

Round 0: [[]]
Round 1 (val=1, new): extend all → [[], [1]]
Round 2 (val=2, new): extend all → [[], [1], [2], [1,2]]
Round 3 (val=2, dup): extend only [2],[1,2] → [[], [1], [2], [1,2], [2,2], [1,2,2]]
```

Complexity: Time $O(n \cdot 2^n)$, Space $O(n \cdot 2^n)$.

### Java

```java []
package array;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class SubsetsII {

    private SubsetsII() {
    }

    // Backtracking: O(n*2^n) time, O(n) space
    public static List<List<Integer>> subsetsWithDup(int[] nums) {
        List<List<Integer>> res = new ArrayList<>();
        Arrays.sort(nums); // O(n log n) sort so duplicates are adjacent
        backtrack(nums, 0, new ArrayList<>(), res);
        return res;
    }

    private static void backtrack(int[] nums, int start, List<Integer> curr, List<List<Integer>> res) {
        res.add(new ArrayList<>(curr)); // O(n) copy current subset to result
        for (int i = start; i < nums.length; i++) {
            if (i > start && nums[i] == nums[i - 1]) continue; // skip duplicate at same level
            curr.add(nums[i]);
            backtrack(nums, i + 1, curr, res);
            curr.remove(curr.size() - 1); // backtrack
        }
    }

    // Cascading: O(n*2^n) time and space
    public static List<List<Integer>> subsetsWithDupCascade(int[] nums) {
        List<List<Integer>> res = new ArrayList<>();
        res.add(new ArrayList<>());
        Arrays.sort(nums); // O(n log n)
        int prevNewStart = 0;
        for (int i = 0; i < nums.length; i++) {
            int startIdx = (i > 0 && nums[i] == nums[i - 1]) ? prevNewStart : 0;
            int resSize = res.size();
            for (int j = startIdx; j < resSize; j++) { // extend eligible subsets
                List<Integer> newSubset = new ArrayList<>(res.get(j)); // O(n) copy
                newSubset.add(nums[i]);
                res.add(newSubset);
            }
            prevNewStart = resSize;
        }
        return res;
    }
}
```

### Python

```python []
class Solution:
    """Backtracking with duplicate skipping. O(n*2^n) time, O(n) space."""

    def subsetsWithDup(self, nums: List[int]) -> List[List[int]]:
        nums.sort()  # O(n log n)
        res = []

        def backtrack(start, cur):
            res.append(cur[:])  # O(n) copy
            for i in range(start, len(nums)):  # O(2^n) branches total
                if i > start and nums[i] == nums[i - 1]:  # skip duplicate at same level
                    continue
                cur.append(nums[i])
                backtrack(i + 1, cur)
                cur.pop()

        backtrack(0, [])
        return res


class Solution2:
    """Iterative cascading with duplicate handling. O(n*2^n) time and space."""

    def subsetsWithDup(self, nums: List[int]) -> List[List[int]]:
        nums.sort()  # O(n log n)
        res = [[]]
        prev_size = 0
        for i in range(len(nums)):  # O(n) outer
            start = prev_size if i > 0 and nums[i] == nums[i - 1] else 0
            prev_size = len(res)
            new_subsets = []
            for j in range(start, prev_size):  # O(2^n) total
                new_subsets.append(res[j] + [nums[i]])  # O(n) copy
            res.extend(new_subsets)
        return res
```

### C++

```cpp []
#include <algorithm>
#include <vector>
using namespace std;

class Solution90 {
public:
    // Backtracking: O(n*2^n) time, O(n) space (recursion depth)
    vector<vector<int>> subsetsWithDup(vector<int>& nums) {
        sort(nums.begin(), nums.end());            // sort to group duplicates
        vector<vector<int>> res;
        vector<int> path;
        backtrack(nums, 0, path, res);
        return res;
    }

    // Cascading: O(n*2^n) time and space
    vector<vector<int>> subsetsWithDupCascade(vector<int>& nums) {
        sort(nums.begin(), nums.end());
        vector<vector<int>> res = {{}};
        int prevSize = 0;
        for (int i = 0; i < (int)nums.size(); i++) {
            int start = (i > 0 && nums[i] == nums[i - 1]) ? prevSize : 0;
            prevSize = res.size();
            for (int j = start; j < prevSize; j++) {
                vector<int> subset = res[j];
                subset.push_back(nums[i]);
                res.push_back(std::move(subset));
            }
        }
        return res;
    }

private:
    void backtrack(vector<int>& nums, int start, vector<int>& path, vector<vector<int>>& res) {
        res.push_back(path);
        for (int i = start; i < (int)nums.size(); i++) {
            if (i > start && nums[i] == nums[i - 1]) continue; // skip duplicates
            path.push_back(nums[i]);
            backtrack(nums, i + 1, path, res);
            path.pop_back();
        }
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Backtracking: O(n * 2^n) time, O(n) space (excluding output).
    pub fn subsets_with_dup_backtrack(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut nums = nums;
        nums.sort(); // O(n log n) — duplicates must be adjacent
        let mut result = Vec::new();
        let mut current = Vec::new();
        Self::backtrack(&nums, 0, &mut current, &mut result);
        result
    }

    fn backtrack(nums: &[i32], start: usize, current: &mut Vec<i32>, result: &mut Vec<Vec<i32>>) {
        result.push(current.clone()); // O(n) — snapshot current subset
        for i in start..nums.len() {
            if i > start && nums[i] == nums[i - 1] {
                continue; // skip duplicate at same level
            }
            current.push(nums[i]);
            Self::backtrack(nums, i + 1, current, result);
            current.pop();
        }
    }

    /// Cascading: O(n * 2^n) time and space.
    pub fn subsets_with_dup_cascade(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut nums = nums;
        nums.sort();
        let mut result: Vec<Vec<i32>> = vec![vec![]];
        let mut prev_new_start = 0;
        for i in 0..nums.len() {
            let start = if i > 0 && nums[i] == nums[i - 1] { prev_new_start } else { 0 };
            let end = result.len();
            for j in start..end {
                let mut subset = result[j].clone();
                subset.push(nums[i]);
                result.push(subset);
            }
            prev_new_start = end;
        }
        result
    }
}
```
