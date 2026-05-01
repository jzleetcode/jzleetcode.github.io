---
author: JZ
pubDatetime: 2026-04-26T06:00:00Z
modDatetime: 2026-04-26T06:00:00Z
title: LeetCode 128 Longest Consecutive Sequence
featured: true
tags:
  - a-array
  - a-hash-table
  - a-union-find
description:
  "Solutions for LeetCode 128, medium, tags: array, hash table, union find."
---

## Table of contents

## Description

Question Links: [LeetCode 128](https://leetcode.com/problems/longest-consecutive-sequence/description/)

Given an unsorted array of integers `nums`, return the length of the longest consecutive elements sequence.

You must write an algorithm that runs in `O(n)` time.

```
Example 1:

Input: nums = [100,4,200,1,3,2]
Output: 4
Explanation: The longest consecutive elements sequence is [1, 2, 3, 4]. Therefore its length is 4.

Example 2:

Input: nums = [0,3,7,2,5,8,4,6,0,1]
Output: 9
Explanation: The longest consecutive elements sequence is [0, 1, 2, 3, 4, 5, 6, 7, 8]. Therefore its length is 9.

Constraints:

0 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9
```

## Solution 1: HashSet

### Idea

Place all numbers into a hash set. For each number, check if it is the **start** of a consecutive sequence (i.e., `num - 1` is not in the set). If so, count how far the sequence extends by checking `num + 1`, `num + 2`, etc.

The key insight: we only start counting from sequence beginnings. Each number is visited at most twice (once in the outer loop, once as part of a `while` extension), giving linear time overall.

```
Input: [100, 4, 200, 1, 3, 2]
Set:   {100, 4, 200, 1, 3, 2}

  100: 99 not in set -> start. 101 not in set -> length = 1
  4:   3 in set     -> skip (not a sequence start)
  200: 199 not in set -> start. 201 not in set -> length = 1
  1:   0 not in set -> start. 2 in set, 3 in set, 4 in set, 5 not in set -> length = 4
  3:   2 in set     -> skip
  2:   1 in set     -> skip

Answer: 4
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static int longestConsecutiveSet(int[] nums) {
    if (nums == null || nums.length == 0) return 0;
    Set<Integer> numSet = new HashSet<>();
    for (int num : nums) numSet.add(num); // O(n)
    int maxLength = 0;
    for (int num : numSet) { // O(n) total
        if (!numSet.contains(num - 1)) { // only start from sequence beginning
            int currentNum = num;
            int currentLength = 1;
            while (numSet.contains(currentNum + 1)) { // O(consecutive length)
                currentNum++;
                currentLength++;
            }
            maxLength = Math.max(maxLength, currentLength);
        }
    }
    return maxLength;
}
```

#### Python

```python []
class Solution:
    def longestConsecutive(self, nums: list[int]) -> int:
        num_set = set(nums)  # O(n)
        res = 0
        for n in num_set:  # O(n) total, inner while visits each element at most once
            if n - 1 not in num_set:
                cur = n
                length = 1
                while cur + 1 in num_set:  # O(consecutive length)
                    cur += 1
                    length += 1
                res = max(res, length)
        return res
```

#### C++

```cpp []
int longestConsecutiveSet(vector<int>& nums) {
    if (nums.empty()) return 0;
    unordered_set<int> numSet(nums.begin(), nums.end()); // O(n)
    int maxLen = 0;
    for (int num : numSet) { // O(n) total
        if (numSet.find(num - 1) == numSet.end()) { // sequence start
            int currentNum = num;
            int currentLen = 1;
            while (numSet.find(currentNum + 1) != numSet.end()) { // O(consecutive length)
                currentNum++;
                currentLen++;
            }
            maxLen = max(maxLen, currentLen);
        }
    }
    return maxLen;
}
```

#### Rust

```rust []
pub fn longest_consecutive(nums: Vec<i32>) -> i32 {
    if nums.is_empty() { return 0; }
    let num_set: HashSet<i32> = nums.into_iter().collect(); // O(n)
    let mut max_len = 0;
    for &num in &num_set { // O(n) total
        if !num_set.contains(&(num - 1)) { // sequence start
            let mut current = num;
            let mut current_len = 1;
            while num_set.contains(&(current + 1)) { // O(consecutive length)
                current += 1;
                current_len += 1;
            }
            max_len = max_len.max(current_len);
        }
    }
    max_len
}
```

## Solution 2: Union Find

### Idea

Use a Union-Find (disjoint set) data structure. For each unique number, create a set. Then for each number, if `num + 1` exists, union them together. The answer is the size of the largest component.

With path compression and union by size, each `find`/`union` operation is $O(\alpha(n))$ where $\alpha$ is the inverse Ackermann function — effectively constant.

```
Input: [100, 4, 200, 1, 3, 2]

Initialize: {100:1}, {4:1}, {200:1}, {1:1}, {3:1}, {2:1}  (each number -> size 1)

Union phase (check num+1 for each):
  100: 101 not present -> skip
  4:   5 not present   -> skip
  200: 201 not present -> skip
  1:   2 present       -> union(1,2) -> {1,2}: size 2
  3:   4 present       -> union(3,4) -> {3,4}: size 2
  2:   3 present       -> union(2,3) -> {1,2,3,4}: size 4

Max component size: 4
```

Complexity: Time $O(n \cdot \alpha(n)) \approx O(n)$, Space $O(n)$.

#### Java

```java []
public static int longestConsecutiveUF(int[] nums) {
    if (nums == null || nums.length == 0) return 0;
    Map<Integer, Integer> parent = new HashMap<>(), size = new HashMap<>();
    for (int num : nums) { // O(n), initialize
        if (!parent.containsKey(num)) { parent.put(num, num); size.put(num, 1); }
    }
    for (int num : nums) { // O(n), union adjacent
        if (parent.containsKey(num + 1)) union(parent, size, num, num + 1);
    }
    int maxLength = 0;
    for (int s : size.values()) maxLength = Math.max(maxLength, s);
    return maxLength;
}

private static int find(Map<Integer, Integer> parent, int x) {
    if (parent.get(x) != x) parent.put(x, find(parent, parent.get(x))); // path compression
    return parent.get(x);
}

private static void union(Map<Integer, Integer> parent, Map<Integer, Integer> size, int x, int y) {
    int rx = find(parent, x), ry = find(parent, y);
    if (rx != ry) { // union by size
        if (size.get(rx) < size.get(ry)) { parent.put(rx, ry); size.put(ry, size.get(ry) + size.get(rx)); }
        else { parent.put(ry, rx); size.put(rx, size.get(rx) + size.get(ry)); }
    }
}
```

#### Python

```python []
class Solution2:
    def longestConsecutive(self, nums: list[int]) -> int:
        if not nums: return 0
        parent, size = {}, {}
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]  # path compression
                x = parent[x]
            return x
        def union(x, y):
            rx, ry = find(x), find(y)
            if rx == ry: return
            if size[rx] < size[ry]: rx, ry = ry, rx  # union by size
            parent[ry] = rx
            size[rx] += size[ry]
        for n in nums:  # O(n), initialize
            if n in parent: continue
            parent[n] = n
            size[n] = 1
            if n - 1 in parent: union(n, n - 1)
            if n + 1 in parent: union(n, n + 1)
        return max(size[find(x)] for x in parent)  # O(n)
```

#### C++

```cpp []
int longestConsecutiveUF(vector<int>& nums) {
    if (nums.empty()) return 0;
    unordered_map<int, int> parent, size;
    for (int num : nums) { // O(n), initialize
        if (parent.find(num) == parent.end()) { parent[num] = num; size[num] = 1; }
    }
    for (int num : nums) { // O(n), union adjacent
        if (parent.find(num + 1) != parent.end()) unionSets(num, num + 1, parent, size);
    }
    int maxLen = 0;
    for (const auto& [num, sz] : size) maxLen = max(maxLen, sz);
    return maxLen;
}

// find with path compression
int find(int x, unordered_map<int, int>& parent) {
    if (parent[x] != x) parent[x] = find(parent[x], parent);
    return parent[x];
}

// union by size
void unionSets(int x, int y, unordered_map<int, int>& parent, unordered_map<int, int>& size) {
    int rx = find(x, parent), ry = find(y, parent);
    if (rx != ry) {
        if (size[rx] < size[ry]) { parent[rx] = ry; size[ry] += size[rx]; }
        else { parent[ry] = rx; size[rx] += size[ry]; }
    }
}
```

#### Rust

```rust []
pub fn longest_consecutive_uf(nums: Vec<i32>) -> i32 {
    if nums.is_empty() { return 0; }
    let mut parent = HashMap::new();
    let mut size = HashMap::new();
    let num_set: HashSet<i32> = nums.iter().copied().collect();
    for &num in &num_set { // O(n), initialize
        parent.insert(num, num);
        size.insert(num, 1);
    }
    for &num in &num_set { // O(n), union adjacent
        if num_set.contains(&(num + 1)) { union(&mut parent, &mut size, num, num + 1); }
    }
    *size.values().max().unwrap_or(&0)
}

fn find(parent: &mut HashMap<i32, i32>, x: i32) -> i32 {
    if parent[&x] != x {
        let root = find(parent, parent[&x]); // path compression
        parent.insert(x, root);
    }
    parent[&x]
}

fn union(parent: &mut HashMap<i32, i32>, size: &mut HashMap<i32, i32>, x: i32, y: i32) {
    let (rx, ry) = (find(parent, x), find(parent, y));
    if rx != ry { // union by size
        let (sx, sy) = (size[&rx], size[&ry]);
        if sx < sy { parent.insert(rx, ry); size.insert(ry, sx + sy); }
        else { parent.insert(ry, rx); size.insert(rx, sx + sy); }
    }
}
```
