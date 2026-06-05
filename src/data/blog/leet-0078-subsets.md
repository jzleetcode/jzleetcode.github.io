---
author: JZ
pubDatetime: 2026-05-30T10:36:00Z
modDatetime: 2026-05-30T10:36:00Z
title: LeetCode 78 Subsets
featured: false
tags:
  - a-backtracking
  - a-bit
description:
  "Solutions for LeetCode 78, medium, tags: array, backtracking, bit manipulation."
---

## Table of contents

## Description

Given an integer array `nums` of unique elements, return all possible subsets (the power set).

The solution set must not contain duplicate subsets. Return the solution in any order.

**Example 1:**

> Input: nums = [1,2,3]
> Output: [[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]

**Example 2:**

> Input: nums = [0]
> Output: [[],[0]]

**Constraints:**

- `1 <= nums.length <= 10`
- `-10 <= nums[i] <= 10`
- All the numbers of `nums` are unique.

Link: [LeetCode 78](https://leetcode.com/problems/subsets/)

## Idea1: Backtracking

Build subsets by choosing at each position whether to include the next element. We iterate starting from index `start` and for each element we include it (choose), recurse (explore), then remove it (un-choose).

The recursion tree looks like:

```
                 []
          /      |       \
       [1]      [2]      [3]
      /   \      |
   [1,2] [1,3] [2,3]
     |
  [1,2,3]
```

Every node in this tree is a valid subset, so we add the current path to the result at the start of each call.

Complexity: Time $O(n \cdot 2^n)$ — we generate $2^n$ subsets, each taking $O(n)$ to copy. Space $O(n)$ excluding the result (recursion depth and current path).

## Idea2: Bitmask Enumeration

For `n` elements there are $2^n$ subsets. Each subset corresponds to a bitmask from `0` to $2^n - 1$. Bit `i` being set means `nums[i]` is included.

```
mask = 0b101 for nums=[1,2,3] → pick index 0 and 2 → [1,3]
mask = 0b110                  → pick index 1 and 2 → [2,3]
```

Complexity: Time $O(n \cdot 2^n)$ — $2^n$ masks, each inspecting $n$ bits. Space $O(n \cdot 2^n)$ — storing all subsets.

### Java

```java []
package array;

import java.util.ArrayList;
import java.util.List;

public class Subsets {
    List<List<Integer>> res = new ArrayList();
    int n, k;

    void backtrack(int first, ArrayList<Integer> curr, int[] nums) {
        if (curr.size() == k) { // if the combination is done
            res.add(new ArrayList(curr));
            return;
        }
        for (int i = first; i < n; ++i) {
            curr.add(nums[i]); // add i into the current combination
            backtrack(i + 1, curr, nums); // use next integers to complete the combination
            curr.remove(curr.size() - 1); // backtrack
        }
    }

    // backtracking, O(n*2^n) time, O(n) space
    public List<List<Integer>> subsets(int[] nums) {
        n = nums.length;
        for (k = 0; k < n + 1; ++k) backtrack(0, new ArrayList<>(), nums);
        return res;
    }

    // bit mask. O(n*2^n) time and space.
    public List<List<Integer>> subsetsBS(int[] nums) {
        List<List<Integer>> res = new ArrayList();
        int n = nums.length;
        for (int i = (int) Math.pow(2, n); i < (int) Math.pow(2, n + 1); ++i) {
            String bitmask = Integer.toBinaryString(i).substring(1);
            List<Integer> curr = new ArrayList();
            for (int j = 0; j < n; ++j) {
                if (bitmask.charAt(j) == '1') curr.add(nums[j]);
            }
            res.add(curr);
        }
        return res;
    }
}
```

### Python

```python []
class Solution:
    """Backtracking. O(n*2^n) time, O(n) space excluding result."""

    def subsets(self, nums: List[int]) -> List[List[int]]:
        res = []

        def backtrack(start, cur):
            res.append(cur[:])  # O(n) copy
            for i in range(start, len(nums)):  # O(2^n) branches total
                cur.append(nums[i])
                backtrack(i + 1, cur)
                cur.pop()

        backtrack(0, [])
        return res


class Solution2:
    """Bit mask enumeration. O(n*2^n) time and space."""

    def subsets(self, nums: List[int]) -> List[List[int]]:
        n = len(nums)
        res = []
        for mask in range(1 << n):  # O(2^n) masks
            subset = []
            for i in range(n):  # O(n) per mask
                if mask & (1 << i):
                    subset.append(nums[i])
            res.append(subset)
        return res
```

### C++

```cpp []
#include <vector>
using namespace std;

class Solution78 {
public:
    // Backtracking: O(n*2^n) time, O(n) space (recursion depth)
    vector<vector<int>> subsets(vector<int>& nums) {
        vector<vector<int>> res;
        vector<int> path;
        backtrack(nums, 0, path, res);
        return res;
    }

    // Bitmask: O(n*2^n) time and space
    vector<vector<int>> subsetsBitmask(vector<int>& nums) {
        int n = nums.size();
        int total = 1 << n;                        // 2^n subsets
        vector<vector<int>> res;
        res.reserve(total);
        for (int mask = 0; mask < total; mask++) { // enumerate all masks
            vector<int> subset;
            for (int i = 0; i < n; i++) {          // O(n) per mask
                if (mask & (1 << i)) {
                    subset.push_back(nums[i]);
                }
            }
            res.push_back(std::move(subset));
        }
        return res;
    }

private:
    void backtrack(vector<int>& nums, int start, vector<int>& path, vector<vector<int>>& res) {
        res.push_back(path);                       // every node is a valid subset
        for (int i = start; i < (int)nums.size(); i++) { // O(n) branches
            path.push_back(nums[i]);               // choose
            backtrack(nums, i + 1, path, res);     // explore (i+1: no reuse)
            path.pop_back();                       // un-choose
        }
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Backtracking: O(n * 2^n) time, O(n) space (excluding output).
    pub fn subsets_backtrack(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut result = Vec::new();
        let mut current = Vec::new();
        Self::backtrack(&nums, 0, &mut current, &mut result);
        result
    }

    fn backtrack(nums: &[i32], start: usize, current: &mut Vec<i32>, result: &mut Vec<Vec<i32>>) {
        result.push(current.clone());
        for i in start..nums.len() {
            current.push(nums[i]);
            Self::backtrack(nums, i + 1, current, result);
            current.pop();
        }
    }

    /// Bit mask enumeration: O(n * 2^n) time and space.
    pub fn subsets_bitmask(nums: Vec<i32>) -> Vec<Vec<i32>> {
        let n = nums.len();
        let total = 1 << n; // 2^n
        let mut result = Vec::with_capacity(total);
        for mask in 0..total {
            let mut subset = Vec::new();
            for i in 0..n {
                if mask & (1 << i) != 0 {
                    subset.push(nums[i]);
                }
            }
            result.push(subset);
        }
        result
    }
}
```
