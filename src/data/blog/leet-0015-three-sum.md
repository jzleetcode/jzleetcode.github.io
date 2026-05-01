---
author: JZ
pubDatetime: 2026-04-19T10:00:00Z
modDatetime: 2026-04-19T10:00:00Z
title: LeetCode 15 3Sum
featured: false
tags:
  - a-array
  - a-two-pointers
  - a-sorting
  - a-hash-table
description:
  "Solutions for LeetCode 15, medium, tags: array, two pointers, sorting, hash table."
---

## Table of contents

## Description

Question Links: [LeetCode 15](https://leetcode.com/problems/3sum/description/)

Given an integer array `nums`, return all the triplets `[nums[i], nums[j], nums[k]]` such that `i != j`, `i != k`, and `j != k`, and `nums[i] + nums[j] + nums[k] == 0`.

Notice that the solution set must not contain duplicate triplets.

```
Example 1:

Input: nums = [-1,0,1,2,-1,-4]
Output: [[-1,-1,2],[-1,0,1]]
Explanation:
nums[0] + nums[1] + nums[2] = (-1) + 0 + 1 = 0.
nums[1] + nums[2] + nums[4] = 0 + 1 + (-1) = 0.
nums[0] + nums[3] + nums[4] = (-1) + 2 + (-1) = 0.
The distinct triplets are [-1,0,1] and [-1,-1,2].
Notice that the order of the output and the order of the triplets does not matter.

Example 2:

Input: nums = [0,1,1]
Output: []
Explanation: The only possible triplet does not sum up to 0.

Example 3:

Input: nums = [0,0,0]
Output: [[0,0,0]]
Explanation: The only possible triplet sums up to 0.

Constraints:

3 <= nums.length <= 3000
-10^5 <= nums[i] <= 10^5
```

## Solution 1: Sort + Two Pointers

### Idea

Sort the array first. Then fix one element at index `i` and use two pointers (`lo`, `hi`) to find pairs in the remaining sorted subarray that sum to `-nums[i]`.

Key deduplication: skip consecutive equal values for `i`, `lo`, and `hi` to avoid duplicate triplets.

```
nums = [-1, 0, 1, 2, -1, -4]
sorted: [-4, -1, -1, 0, 1, 2]

i=0, nums[i]=-4, target=4
  lo=1, hi=5: -1+2=1 < 4  → lo++
  lo=2, hi=5: -1+2=1 < 4  → lo++
  lo=3, hi=5:  0+2=2 < 4  → lo++
  lo=4, hi=5:  1+2=3 < 4  → lo++
  lo=5: lo>=hi, done

i=1, nums[i]=-1, target=1
  lo=2, hi=5: -1+2=1 == 1 → found [-1,-1,2], lo=3, hi=4
  lo=3, hi=4:  0+1=1 == 1 → found [-1,0,1], lo=4, hi=3
  lo>=hi, done

i=2, nums[i]=-1, skip (duplicate of i=1)

i=3, nums[i]=0 > 0, break

Result: [[-1,-1,2], [-1,0,1]]
```

Complexity: Time $O(n^2)$ — sort $O(n \log n)$ + nested two-pointer $O(n^2)$. Space $O(1)$ excluding output (sort is in-place).

#### Java

```java []
// O(n^2) time, O(1) space. Sort + two pointers.
static class Solution1 {
    public List<List<Integer>> threeSum(int[] nums) {
        List<List<Integer>> res = new ArrayList<>();
        Arrays.sort(nums); // O(n log n) sort to enable two-pointer approach
        for (int i = 0; i < nums.length - 2; i++) { // O(n) outer loop
            if (i > 0 && nums[i] == nums[i - 1]) continue; // skip duplicate first element
            if (nums[i] > 0) break; // early termination: smallest > 0 means no triplet possible
            int lo = i + 1, hi = nums.length - 1; // two pointers
            while (lo < hi) { // O(n) inner scan
                int sum = nums[i] + nums[lo] + nums[hi];
                if (sum < 0) lo++; // sum too small, move left pointer right
                else if (sum > 0) hi--; // sum too large, move right pointer left
                else {
                    res.add(Arrays.asList(nums[i], nums[lo], nums[hi]));
                    while (lo < hi && nums[lo] == nums[lo + 1]) lo++; // skip duplicate second element
                    while (lo < hi && nums[hi] == nums[hi - 1]) hi--; // skip duplicate third element
                    lo++;
                    hi--;
                }
            }
        }
        return res;
    }
}
```

#### Python

```python []
class Solution:
    def threeSum(self, nums: list[int]) -> list[list[int]]:
        """Sort + two pointers approach.
        Time O(n^2): sort O(n log n) + nested loop O(n^2).
        Space O(1) excluding output (sort is in-place).
        """
        nums.sort()  # O(n log n)
        res = []
        for i in range(len(nums) - 2):  # O(n) outer loop
            if nums[i] > 0:
                break  # remaining elements are all positive, no valid triplet
            if i > 0 and nums[i] == nums[i - 1]:
                continue  # skip duplicate for first element
            lo, hi = i + 1, len(nums) - 1
            while lo < hi:  # O(n) two-pointer scan per i, total O(n^2)
                s = nums[i] + nums[lo] + nums[hi]
                if s < 0:
                    lo += 1
                elif s > 0:
                    hi -= 1
                else:
                    res.append([nums[i], nums[lo], nums[hi]])
                    lo += 1
                    hi -= 1
                    while lo < hi and nums[lo] == nums[lo - 1]:
                        lo += 1  # skip duplicate for second element
                    while lo < hi and nums[hi] == nums[hi + 1]:
                        hi -= 1  # skip duplicate for third element
        return res
```

#### C++

```cpp []
// Solution 1: Sort + Two Pointers - Time O(n^2), Space O(1) excluding output
class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        vector<vector<int>> result;
        int n = nums.size();
        if (n < 3) return result;

        sort(nums.begin(), nums.end());         // O(n log n) sort for two-pointer scan

        for (int i = 0; i < n - 2; ++i) {      // O(n) fix first element
            if (nums[i] > 0) break;             // sorted: no triple can sum to 0
            if (i > 0 && nums[i] == nums[i - 1]) continue; // skip duplicate first element

            int left = i + 1, right = n - 1;   // O(1) two pointers for remaining pair
            while (left < right) {              // O(n) sweep per fixed element -> O(n^2) total
                int sum = nums[i] + nums[left] + nums[right];
                if (sum < 0) {
                    ++left;                     // need larger sum
                } else if (sum > 0) {
                    --right;                    // need smaller sum
                } else {
                    result.push_back({nums[i], nums[left], nums[right]});
                    while (left < right && nums[left] == nums[left + 1]) ++left;   // skip duplicate second
                    while (left < right && nums[right] == nums[right - 1]) --right; // skip duplicate third
                    ++left;
                    --right;
                }
            }
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn three_sum(mut nums: Vec<i32>) -> Vec<Vec<i32>> {
        let mut result: Vec<Vec<i32>> = Vec::new();
        let n = nums.len();
        if n < 3 { return result; }
        nums.sort_unstable(); // O(n log n) — enables two-pointer technique

        for i in 0..n - 2 {
            if nums[i] > 0 { break; } // smallest element positive => no triplet sums to zero
            if i > 0 && nums[i] == nums[i - 1] { continue; } // skip duplicate first element
            let mut lo = i + 1; // left pointer
            let mut hi = n - 1; // right pointer
            while lo < hi {
                let sum = nums[i] + nums[lo] + nums[hi]; // O(1) per check
                if sum < 0 {
                    lo += 1; // need a larger sum
                } else if sum > 0 {
                    hi -= 1; // need a smaller sum
                } else {
                    result.push(vec![nums[i], nums[lo], nums[hi]]);
                    while lo < hi && nums[lo] == nums[lo + 1] { lo += 1; }
                    while lo < hi && nums[hi] == nums[hi - 1] { hi -= 1; }
                    lo += 1;
                    hi -= 1;
                }
            }
        }
        result
    }
}
```

## Solution 2: Hash Set

### Idea

Sort the array for deduplication. Fix one element at index `i`, then scan the remaining elements with a hash set. For each `nums[j]`, check if the complement `-nums[i] - nums[j]` was seen before.

This uses a different data structure (hash set) instead of two pointers, trading O(n) space for conceptual simplicity.

Complexity: Time $O(n^2)$ — outer loop $O(n)$ × inner scan $O(n)$ with $O(1)$ hash lookups. Space $O(n)$ for the hash set.

#### Java

```java []
// O(n^2) time, O(n) space. Hash set approach.
static class Solution2 {
    public List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums); // sort for dedup and early termination
        List<List<Integer>> res = new ArrayList<>();
        for (int i = 0; i < nums.length - 2; i++) { // O(n) outer loop
            if (i > 0 && nums[i] == nums[i - 1]) continue; // skip duplicate first element
            if (nums[i] > 0) break; // early termination
            Set<Integer> seen = new HashSet<>(); // O(n) space for hash set
            for (int j = i + 1; j < nums.length; j++) { // O(n) inner loop
                int complement = -nums[i] - nums[j]; // target for third element
                if (seen.contains(complement)) {
                    res.add(Arrays.asList(nums[i], complement, nums[j]));
                    while (j + 1 < nums.length && nums[j] == nums[j + 1]) j++; // skip duplicate third element
                }
                seen.add(nums[j]); // track seen values
            }
        }
        return res;
    }
}
```

#### Python

```python []
class Solution2:
    def threeSum(self, nums: list[int]) -> list[list[int]]:
        """Hash set approach.
        Time O(n^2): for each element, scan remaining with a set lookup O(1).
        Space O(n) for the seen set.
        """
        nums.sort()  # O(n log n), needed only for deduplication of results
        res = []
        for i in range(len(nums) - 2):  # O(n) outer loop
            if nums[i] > 0:
                break
            if i > 0 and nums[i] == nums[i - 1]:
                continue  # skip duplicate for first element
            seen = set()  # O(n) space
            j = i + 1
            while j < len(nums):  # O(n) inner loop, total O(n^2)
                complement = -nums[i] - nums[j]
                if complement in seen:  # O(1) hash lookup
                    res.append([nums[i], complement, nums[j]])
                    while j + 1 < len(nums) and nums[j] == nums[j + 1]:
                        j += 1  # skip duplicate for third element
                seen.add(nums[j])
                j += 1
        return res
```

#### C++

```cpp []
// Solution 2: Hash Set - Time O(n^2), Space O(n)
class Solution2 {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        vector<vector<int>> result;
        int n = nums.size();
        if (n < 3) return result;

        sort(nums.begin(), nums.end());         // O(n log n) sort to handle duplicates

        for (int i = 0; i < n - 2; ++i) {      // O(n) fix first element
            if (nums[i] > 0) break;             // sorted: no triple can sum to 0
            if (i > 0 && nums[i] == nums[i - 1]) continue; // skip duplicate first element

            unordered_set<int> seen;            // O(n) hash set for complement lookup
            for (int j = i + 1; j < n; ++j) {  // O(n) scan remaining elements
                int complement = -nums[i] - nums[j]; // target for third element
                if (seen.count(complement)) {
                    result.push_back({nums[i], complement, nums[j]});
                    while (j + 1 < n && nums[j] == nums[j + 1]) ++j; // skip duplicate third
                } else {
                    seen.insert(nums[j]);       // O(1) amortized insert
                }
            }
        }
        return result;
    }
};
```

#### Rust

```rust []
impl Solution2 {
    pub fn three_sum(mut nums: Vec<i32>) -> Vec<Vec<i32>> {
        use std::collections::HashSet;
        let mut result: Vec<Vec<i32>> = Vec::new();
        let n = nums.len();
        if n < 3 { return result; }
        nums.sort_unstable(); // sort so we can skip duplicates easily

        for i in 0..n - 2 {
            if nums[i] > 0 { break; } // early termination
            if i > 0 && nums[i] == nums[i - 1] { continue; } // skip duplicate first element
            let mut seen: HashSet<i32> = HashSet::new(); // O(n) space per outer iteration
            let mut j = i + 1;
            while j < n {
                let complement = -nums[i] - nums[j]; // target for the third element
                if seen.contains(&complement) {
                    result.push(vec![nums[i], complement, nums[j]]);
                    while j + 1 < n && nums[j] == nums[j + 1] { j += 1; } // skip duplicates on j
                }
                seen.insert(nums[j]); // O(1) amortized insertion
                j += 1;
            }
        }
        result
    }
}
```
