---
author: JZ
pubDatetime: 2026-03-16T07:23:00Z
modDatetime: 2026-03-16T07:23:00Z
title: LeetCode 1980 Find Unique Binary String
draft: true
tags:
  - a-array
  - a-string
  - a-hash
description:
  "Solutions for LeetCode 1980, medium, tags: array, hash table, string."
---

## Table of contents

## Description

Question links: [Leetcode 1980](https://leetcode.com/problems/find-unique-binary-string/description/)

You are given an array of **unique** binary strings `nums`, where each string has length `n` and `nums.length == n`.
Return any binary string of length `n` that does **not** appear in `nums`.

```
Example 1:

Input: nums = ["01","10"]
Output: "11"
Explanation: "11" does not appear in nums. "00" would also be correct.

Example 2:

Input: nums = ["00","01"]
Output: "11"
Explanation: "11" does not appear in nums. "10" would also be correct.

Example 3:

Input: nums = ["111","011","001"]
Output: "101"
Explanation: "101" does not appear in nums. "000", "010", "100", and "110" would also be correct.
```

**Constraints:**

-   `1 <= n <= 16`
-   `nums.length == n`
-   Each string in `nums` has length `n`
-   All strings in `nums` are unique

## Idea

### Solution 1: Diagonalization

Use Cantor's diagonalization idea. For each index `i`, flip the `i`-th bit of `nums[i]`. The resulting string differs from every input string at least at position `i`, so it cannot be in `nums`.

Complexity: Time $O(n)$, Space $O(1)$ (excluding output).

### Solution 2: HashSet + Enumeration

Put all strings in a hash set. Enumerate all `2^n` binary strings in order and return the first one not in the set. Since `n <= 16`, this is feasible.

Complexity: Time $O(n^2)$, Space $O(n)$.

### Java

```java
class FindUniqueBinaryString {
    public String findDifferentBinaryString(String[] nums) {
        int n = nums.length;
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            char c = nums[i].charAt(i);
            sb.append(c == '0' ? '1' : '0');
        }
        return sb.toString();
    }

    public String findDifferentBinaryStringSet(String[] nums) {
        int n = nums.length;
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (String s : nums) {
            seen.add(s);
        }
        int limit = 1 << n;
        char[] buf = new char[n];
        for (int mask = 0; mask < limit; mask++) {
            for (int i = 0; i < n; i++) {
                int bit = (mask >> (n - 1 - i)) & 1;
                buf[i] = bit == 1 ? '1' : '0';
            }
            String candidate = new String(buf);
            if (!seen.contains(candidate)) {
                return candidate;
            }
        }
        return "";
    }
}
```

### Python

```python
class Solution:
    def findDifferentBinaryString(self, nums):
        n = len(nums)
        ans = []
        for i in range(n):
            ans.append("1" if nums[i][i] == "0" else "0")
        return "".join(ans)

    def findDifferentBinaryStringSet(self, nums):
        n = len(nums)
        seen = set(nums)
        for mask in range(1 << n):
            cand = f"{mask:0{n}b}"
            if cand not in seen:
                return cand
        return ""
```

### C++

```cpp
class Solution {
public:
    string findDifferentBinaryString(const vector<string> &nums) {
        int n = static_cast<int>(nums.size());
        string ans(n, '0');
        for (int i = 0; i < n; i++) {
            ans[i] = (nums[i][i] == '0') ? '1' : '0';
        }
        return ans;
    }

    string findDifferentBinaryStringSet(const vector<string> &nums) {
        int n = static_cast<int>(nums.size());
        unordered_set<string> seen(nums.begin(), nums.end());
        int total = 1 << n;
        for (int mask = 0; mask < total; mask++) {
            string candidate(n, '0');
            for (int i = 0; i < n; i++) {
                int bit = (mask >> (n - 1 - i)) & 1;
                candidate[i] = bit ? '1' : '0';
            }
            if (seen.find(candidate) == seen.end()) {
                return candidate;
            }
        }
        return "";
    }
};
```

### Rust

```rust
pub struct Solution;

impl Solution {
    pub fn find_different_binary_string(nums: Vec<String>) -> String {
        let n = nums.len();
        let mut res = String::with_capacity(n);
        for i in 0..n {
            let c = nums[i].as_bytes()[i] as char;
            res.push(if c == '0' { '1' } else { '0' });
        }
        res
    }

    pub fn find_different_binary_string_set(nums: Vec<String>) -> String {
        use std::collections::HashSet;
        let n = nums.len();
        let set: HashSet<String> = nums.iter().cloned().collect();
        let total = 1usize << n;
        for mask in 0..total {
            let mut candidate = String::with_capacity(n);
            for i in (0..n).rev() {
                let bit = (mask >> i) & 1;
                candidate.push(if bit == 1 { '1' } else { '0' });
            }
            if !set.contains(&candidate) {
                return candidate;
            }
        }
        unreachable!("All possible strings are present")
    }
}
```
