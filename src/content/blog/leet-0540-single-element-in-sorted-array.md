---
author: JZ
pubDatetime: 2024-12-05T06:23:00Z
modDatetime: 2024-12-05T06:23:00Z
title: LeetCode 540 LintCode 1183 Single Element in a Sorted Array
featured: true
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 540 LintCode 1183, medium, tags: array, binary search."
---

## Table of contents

## Description

## Idea

The short solution below takes a couple of discoveries.

1. The target element must be at an even index.
2. In binary search, we can compare the mid index element with its neighbor index.
   1. If mid is odd, we compare with `mid^1==mid-1`.
   2. If mid is even, we compare with `mid^1==mid+1`.
3. In both cases above, there are even number of elements on the left of `mid` and its neighbor. If `nums[mid]==nums[neighbor]`, we know the single element must be on the right. Otherwise, single element is on the left of `mid` (including `mid`).

Complexity: Time $O(\log n)$, Space $O(1)$.

![](https://drive.google.com/thumbnail?id=1U4eZNZz0Z8LEai5qAK8XJuRK6QsboOZt&sz=w1000)

### Python

```python
class Solution:
    """0 ms, 24.3 mb"""

    def singleNonDuplicate(self, nums: List[int]) -> int:
        l, r = 0, len(nums) - 1
        while l < r:
            mid = l + (r - l) // 2
            if nums[mid] == nums[mid ^ 1]:
                l = mid + 1
            else:
                r = mid
        return nums[l]
```

### Java

```java
class Solution {
    // binary search, lgn time, 1 space, 0ms, 50.24Mb
    public int singleNonDuplicate(int[] nums) {
        int l = 0, r = nums.length - 1;
        while (l < r) { // single element must be on even index
            int mid = l + (r - l) / 2;
            if (nums[mid] == nums[mid ^ 1]) l = mid + 1; // compare with mid+1 when even, mid-1 when odd
            else r = mid;
        }
        return nums[l];
        // for [3,3,7,7,10,11,11] l,r: [0,6],[4,6],[4,5],[4,4]
    }
}
```

### Rust

```rust
impl Solution {
    pub fn single_non_duplicate(nums: Vec<i32>) -> i32 {
        let (mut l, mut r) = (0, nums.len() - 1); // constraints len>=1
        while l < r {
            let m = l + (r - l) / 2;
            if nums[m] != nums[m ^ 1] { r = m } else { l = m + 1 }
        }
        nums[l]
    }
}
```

### C++

```cpp
class Solution {
public:
    int singleNonDuplicate(vector<int> &nums) {
        int l = 0, r = nums.size() - 1;
        while (l < r) {
            int m = l + (r - l) / 2;
            if (nums[m] == nums[m ^ 1]) l = m + 1;
            else r = m;
        }
        return nums[l];
    }
};
```
