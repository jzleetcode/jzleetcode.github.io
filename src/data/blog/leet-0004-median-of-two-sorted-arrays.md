---
author: JZ
pubDatetime: 2026-06-26T10:36:00Z
modDatetime: 2026-06-26T10:36:00Z
title: LeetCode 4 Median of Two Sorted Arrays
featured: true
tags:
  - a-array
  - a-binary-search
description:
  "Solutions for LeetCode 4, hard, tags: array, binary search, divide and conquer."
---

## Table of contents

## Description

Question Links: [LeetCode 4](https://leetcode.com/problems/median-of-two-sorted-arrays/description/)

Given two sorted arrays `nums1` and `nums2` of size `m` and `n` respectively, return the median of the two sorted arrays.

The overall run time complexity should be $O(\log(m+n))$.

```
Example 1:
Input: nums1 = [1,3], nums2 = [2]
Output: 2.00000
Explanation: merged array = [1,2,3] and median is 2.

Example 2:
Input: nums1 = [1,2], nums2 = [3,4]
Output: 2.50000
Explanation: merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5.
```

**Constraints:**

- `nums1.length == m`
- `nums2.length == n`
- `0 <= m <= 1000`
- `0 <= n <= 1000`
- `1 <= m + n <= 2000`
- `-10⁶ <= nums1[i], nums2[i] <= 10⁶`

## Idea1: Binary Search on Partition

We binary search on the shorter array to find a partition that divides both arrays into left and right halves such that:
- `max(left) <= min(right)`
- left half has exactly `(m+n+1)/2` elements

```
nums1:  [... a_left | a_right ...]    partition at index i
nums2:  [... b_left | b_right ...]    partition at index j = half - i

Valid when:  a_left <= b_right  AND  b_left <= a_right
```

Ascii diagram of the partition for `nums1=[1,3,5]`, `nums2=[2,4,6,8]`:

```
half = (3+4+1)/2 = 4 (left side gets 4 elements)

Binary search finds i=2, j=2:
nums1:  [ 1  3 | 5 ]       left: {1,3}    right: {5}
nums2:  [ 2  4 | 6  8 ]    left: {2,4}    right: {6,8}

max(left) = max(3,4) = 4
min(right) = min(5,6) = 5
Total is odd(7), median = max(left) = 4
```

Complexity: Time $O(\log(\min(m,n)))$, Space $O(1)$.

## Idea2: Merge

Merge both sorted arrays into one, then pick the middle element(s).

Complexity: Time $O(m+n)$, Space $O(m+n)$.

### Java

```java []
// Solution 1: binary search, O(log(min(m,n))) time, O(1) space
public double findMedianSortedArrays(int[] nums1, int[] nums2) {
    int N1 = nums1.length, N2 = nums2.length;
    if (N1 < N2) return findMedianSortedArrays(nums2, nums1);
    int lo = 0, hi = 2 * N2; // binary search on shorter array
    while (lo <= hi) {
        int mid2 = lo + (hi - lo) / 2;
        int mid1 = N1 + N2 - mid2; // mid1+mid2 == N1+N2 for median

        double L1 = (mid1 == 0) ? Integer.MIN_VALUE : nums1[(mid1 - 1) / 2];
        double L2 = (mid2 == 0) ? Integer.MIN_VALUE : nums2[(mid2 - 1) / 2];
        double R1 = (mid1 == N1 * 2) ? Integer.MAX_VALUE : nums1[(mid1) / 2];
        double R2 = (mid2 == N2 * 2) ? Integer.MAX_VALUE : nums2[(mid2) / 2];

        if (L1 > R2) lo = mid2 + 1;        // O(log(min(m,n))) iterations
        else if (L2 > R1) hi = mid2 - 1;
        else return (Math.max(L1, L2) + Math.min(R1, R2)) / 2;
    }
    return -1;
}
```

### Python

```python []
# Solution 1: binary search on shorter array, O(log(min(m,n))) time, O(1) space
def findMedianSortedArrays(self, nums1: list[int], nums2: list[int]) -> float:
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1
    m, n = len(nums1), len(nums2)
    lo, hi = 0, m
    while lo <= hi:
        i = (lo + hi) // 2  # O(log(min(m,n))) binary search iterations
        j = (m + n + 1) // 2 - i
        left1 = nums1[i - 1] if i > 0 else float('-inf')
        left2 = nums2[j - 1] if j > 0 else float('-inf')
        right1 = nums1[i] if i < m else float('inf')
        right2 = nums2[j] if j < n else float('inf')
        if left1 <= right2 and left2 <= right1:
            if (m + n) % 2 == 1:
                return max(left1, left2)
            return (max(left1, left2) + min(right1, right2)) / 2
        elif left1 > right2:
            hi = i - 1
        else:
            lo = i + 1
    return -1.0
```
```python []
# Solution 2: merge, O(m+n) time, O(m+n) space
def findMedianSortedArrays(self, nums1: list[int], nums2: list[int]) -> float:
    merged = []
    i, j = 0, 0
    while i < len(nums1) and j < len(nums2):  # O(m+n)
        if nums1[i] <= nums2[j]:
            merged.append(nums1[i])
            i += 1
        else:
            merged.append(nums2[j])
            j += 1
    merged.extend(nums1[i:])
    merged.extend(nums2[j:])
    n = len(merged)
    if n % 2 == 1:
        return merged[n // 2]
    return (merged[n // 2 - 1] + merged[n // 2]) / 2
```

### C++

```cpp []
// Solution 1: binary search on shorter array, O(log(min(m,n))) time, O(1) space
double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {
    if (nums1.size() > nums2.size()) return findMedianSortedArrays(nums2, nums1);
    int m = nums1.size(), n = nums2.size();
    int lo = 0, hi = m;
    int halfLen = (m + n + 1) / 2;
    while (lo <= hi) {
        int i = lo + (hi - lo) / 2; // O(log(min(m,n))) iterations
        int j = halfLen - i;
        int maxLeftA  = (i == 0) ? INT_MIN : nums1[i - 1];
        int minRightA = (i == m) ? INT_MAX : nums1[i];
        int maxLeftB  = (j == 0) ? INT_MIN : nums2[j - 1];
        int minRightB = (j == n) ? INT_MAX : nums2[j];
        if (maxLeftA <= minRightB && maxLeftB <= minRightA) {
            if ((m + n) % 2 == 1) return max(maxLeftA, maxLeftB);
            return (max(maxLeftA, maxLeftB) + min(minRightA, minRightB)) / 2.0;
        } else if (maxLeftA > minRightB) {
            hi = i - 1;
        } else {
            lo = i + 1;
        }
    }
    return 0.0;
}
```
```cpp []
// Solution 2: merge, O(m+n) time, O(m+n) space
double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {
    int m = nums1.size(), n = nums2.size();
    vector<int> merged;
    merged.reserve(m + n); // O(m+n) space
    int i = 0, j = 0;
    while (i < m && j < n) { // O(m+n) merge
        if (nums1[i] <= nums2[j]) merged.push_back(nums1[i++]);
        else merged.push_back(nums2[j++]);
    }
    while (i < m) merged.push_back(nums1[i++]);
    while (j < n) merged.push_back(nums2[j++]);
    int total = m + n;
    if (total % 2 == 1) return merged[total / 2];
    return (merged[total / 2 - 1] + merged[total / 2]) / 2.0;
}
```

### Rust

```rust []
// Solution 1: binary search on shorter array, O(log(min(m,n))) time, O(1) space
pub fn find_median_sorted_arrays(nums1: Vec<i32>, nums2: Vec<i32>) -> f64 {
    let (a, b) = if nums1.len() <= nums2.len() { (nums1, nums2) } else { (nums2, nums1) };
    let (m, n) = (a.len(), b.len());
    let half = (m + n + 1) / 2;
    let (mut lo, mut hi) = (0usize, m);
    while lo <= hi {
        let i = (lo + hi) / 2; // O(log(min(m,n))) iterations
        let j = half - i;
        let a_left = if i == 0 { i32::MIN } else { a[i - 1] };
        let a_right = if i == m { i32::MAX } else { a[i] };
        let b_left = if j == 0 { i32::MIN } else { b[j - 1] };
        let b_right = if j == n { i32::MAX } else { b[j] };
        if a_left <= b_right && b_left <= a_right {
            return if (m + n) % 2 == 1 {
                a_left.max(b_left) as f64
            } else {
                (a_left.max(b_left) as f64 + a_right.min(b_right) as f64) / 2.0
            };
        } else if a_left > b_right {
            hi = i - 1;
        } else {
            lo = i + 1;
        }
    }
    unreachable!()
}
```
```rust []
// Solution 2: merge, O(m+n) time, O(m+n) space
pub fn find_median_sorted_arrays_merge(nums1: Vec<i32>, nums2: Vec<i32>) -> f64 {
    let total = nums1.len() + nums2.len();
    let mut merged = Vec::with_capacity(total); // O(m+n) space
    let (mut i, mut j) = (0, 0);
    while i < nums1.len() && j < nums2.len() { // O(m+n) merge
        if nums1[i] <= nums2[j] { merged.push(nums1[i]); i += 1; }
        else { merged.push(nums2[j]); j += 1; }
    }
    merged.extend_from_slice(&nums1[i..]);
    merged.extend_from_slice(&nums2[j..]);
    let mid = total / 2;
    if total % 2 == 1 { merged[mid] as f64 }
    else { (merged[mid - 1] as f64 + merged[mid] as f64) / 2.0 }
}
```
