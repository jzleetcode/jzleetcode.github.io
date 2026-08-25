---
author: JZ
pubDatetime: 2026-08-25T06:00:00Z
modDatetime: 2026-08-25T06:00:00Z
title: LeetCode 179 Largest Number
featured: true
tags:
  - a-array
  - a-string
  - a-greedy
  - a-sorting
description:
  "Solutions for LeetCode 179, medium, tags: array, string, greedy, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 179](https://leetcode.com/problems/largest-number/description/)

Given a list of non-negative integers `nums`, arrange them such that they form the largest number and return it as a string.

Note: The result may be very large, so you need to return a string instead of an integer.

```
Example 1:

Input: nums = [10,2]
Output: "210"

Example 2:

Input: nums = [3,30,34,5,9]
Output: "9534330"

Constraints:

1 <= nums.length <= 100
0 <= nums[i] <= 10^9
```

## Solution: Custom Comparator Sort

### Idea

The key insight is: to decide whether number `a` should come before `b`, we compare the concatenations `str(a)+str(b)` vs `str(b)+str(a)`. Whichever concatenation is lexicographically larger tells us the correct ordering.

```
nums = [3, 30, 34, 5, 9]

Compare pairs by concatenation:
  "3" vs "30":  "330" > "303"  -> 3 before 30
  "34" vs "3":  "343" > "334"  -> 34 before 3
  "5" vs "34":  "534" > "345"  -> 5 before 34
  "9" vs "5":   "95"  > "59"   -> 9 before 5

Sorted order: [9, 5, 34, 3, 30]
Result: "9534330"
```

This works because string concatenation comparison defines a total order that is transitive: if `a+b > b+a` and `b+c > c+b`, then `a+c > c+a`. The edge case is when all numbers are zero — the result should be `"0"` not `"000..."`.

Complexity: Time $O(n \log n \cdot k)$ where $k$ is the average number of digits (comparisons cost $O(k)$). Space $O(n \cdot k)$ for the string array.

#### Java

```java []
public static String largestNumber(int[] nums) {
    String[] strs = new String[nums.length];
    for (int i = 0; i < nums.length; i++) strs[i] = String.valueOf(nums[i]);
    Arrays.sort(strs, (a, b) -> (b + a).compareTo(a + b)); // O(n log n * k)
    if (strs[0].equals("0")) return "0";
    StringBuilder sb = new StringBuilder();
    for (String s : strs) sb.append(s);
    return sb.toString();
}
```

#### Python

```python []
class Solution:
    def largestNumber(self, nums: list[int]) -> str:
        strs = [str(n) for n in nums]  # O(n*k) space

        def cmp(a: str, b: str) -> int:  # O(k) per comparison
            if a + b > b + a:
                return -1
            elif a + b < b + a:
                return 1
            return 0

        strs.sort(key=cmp_to_key(cmp))  # O(n log n * k) time
        result = "".join(strs)
        return "0" if result[0] == "0" else result
```

#### C++

```cpp []
string largestNumber(vector<int>& nums) {
    vector<string> strs;
    strs.reserve(nums.size());
    for (int n : nums) strs.push_back(to_string(n));
    sort(strs.begin(), strs.end(), [](const string& a, const string& b) {
        return a + b > b + a; // O(k) per comparison
    }); // O(n log n * k) total
    if (strs[0] == "0") return "0";
    string res;
    for (auto& s : strs) res += s;
    return res;
}
```

#### Rust

```rust []
pub fn largest_number(nums: Vec<i32>) -> String {
    let mut strs: Vec<String> = nums.iter().map(|n| n.to_string()).collect();
    strs.sort_by(|a, b| { // O(n log n * k)
        let ab = format!("{}{}", a, b);
        let ba = format!("{}{}", b, a);
        ba.cmp(&ab)
    });
    if strs[0] == "0" {
        return "0".to_string();
    }
    strs.join("")
}
```
