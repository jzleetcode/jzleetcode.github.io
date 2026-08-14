---
author: JZ
pubDatetime: 2026-08-14T08:00:00Z
modDatetime: 2026-08-14T08:00:00Z
title: LeetCode 456 132 Pattern
featured: true
tags:
  - a-stack
  - a-monotonic-stack
  - a-array
description:
  "Solutions for LeetCode 456, medium, tags: array, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 456](https://leetcode.com/problems/456-pattern/description/)

Given an array of `n` integers `nums`, a **132 pattern** is a subsequence of three integers `nums[i]`, `nums[j]`, `nums[k]` such that `i < j < k` and `nums[i] < nums[k] < nums[j]`.

Return `true` if there is a 132 pattern in `nums`, otherwise return `false`.

```
Example 1:

Input: nums = [1,2,3,4]
Output: false
Explanation: There is no 132 pattern in the sequence.

Example 2:

Input: nums = [3,1,4,2]
Output: true
Explanation: There is a 132 pattern in the sequence: [1, 4, 2].

Example 3:

Input: nums = [-1,3,2,0]
Output: true
Explanation: There are three 132 patterns: [-1, 3, 2], [-1, 3, 0], [-1, 2, 0].

Constraints:

n == nums.length
1 <= n <= 2 * 10^5
-10^9 <= nums[i] <= 10^9
```

## Solution 1: Monotonic Stack (Right to Left)

### Idea

Scan from right to left, maintaining a **monotonic decreasing stack** (candidates for the '3' role, the largest element). When we encounter a value larger than the stack top, we pop — each popped value is a candidate for '2' (the middle value, `nums[k]`). We track the maximum popped value as `second`. If any element to the left is smaller than `second`, we found a valid 132 pattern.

```
nums: [3, 1, 4, 2]

Scan right to left:
i=3: push 2              stack: [2], second = -inf
i=2: 4 > 2, pop 2       stack: [], second = 2
     push 4              stack: [4]
i=1: 1 < second(2)      => FOUND! return true

The 132 pattern: nums[1]=1, nums[2]=4, nums[3]=2
i.e., 1 < 2 < 4 with indices 1 < 2 < 3
```

Complexity: Time $O(n)$, Space $O(n)$.

Each element is pushed and popped at most once, so total stack operations are $O(n)$.

#### Java

```java []
public static boolean find132patternStack(int[] nums) {
    if (nums == null || nums.length < 3) return false;
    int n = nums.length;
    int[] stack = new int[n];
    int top = -1;
    int third = Integer.MIN_VALUE; // the '2' candidate (nums[k])
    for (int i = n - 1; i >= 0; i--) { // O(n)
        if (nums[i] < third) return true;
        while (top >= 0 && nums[i] > stack[top]) { // O(n) total pops
            third = stack[top--];
        }
        stack[++top] = nums[i];
    }
    return false; // Time O(n), Space O(n)
}
```

#### C++

```cpp []
bool find132pattern(vector<int>& nums) {
    int n = nums.size();
    if (n < 3) return false;
    stack<int> st; // monotonic decreasing stack (candidates for '3')
    int second = INT_MIN; // largest popped value (candidate for '2')
    for (int i = n - 1; i >= 0; i--) { // O(n)
        if (nums[i] < second) return true;
        while (!st.empty() && nums[i] > st.top()) { // O(n) total pops
            second = st.top();
            st.pop();
        }
        st.push(nums[i]);
    }
    return false; // Time O(n), Space O(n)
}
```

#### Python

```python []
def find132pattern(self, nums: list[int]) -> bool:
    stack = []  # monotonic decreasing stack, O(n) space
    second = float('-inf')  # the '2' in 132 (largest value popped)
    for i in range(len(nums) - 1, -1, -1):  # O(n) scan right to left
        if nums[i] < second:  # nums[i] is '1', second is '2', stack top was '3'
            return True
        while stack and stack[-1] < nums[i]:  # O(n) total pops
            second = stack.pop()
        stack.append(nums[i])
    return False  # Time O(n), Space O(n)
```

#### Rust

```rust []
pub fn find132pattern(nums: Vec<i32>) -> bool {
    let n = nums.len();
    if n < 3 { return false; }
    let mut stack: Vec<i32> = Vec::new();
    let mut two = i32::MIN; // candidate for '2'
    for i in (0..n).rev() { // O(n)
        if nums[i] < two { return true; }
        while let Some(&top) = stack.last() { // O(n) total pops
            if top < nums[i] {
                two = two.max(stack.pop().unwrap());
            } else { break; }
        }
        stack.push(nums[i]);
    }
    false // Time O(n), Space O(n)
}
```

## Solution 2: Prefix Min + Monotonic Stack

### Idea

Precompute `prefix_min[i] = min(nums[0..=i])` as '1' candidates. Then scan right to left with a decreasing stack storing '2' candidates. For each index `j` where `nums[j] > prefix_min[j]` (potential '3'), check if any stack element falls strictly between `prefix_min[j]` and `nums[j]`.

```
nums:       [3,  5,  0,  3,  4]
prefix_min: [3,  3,  0,  0,  0]

Scan right to left:
j=4: nums[4]=4 > prefix_min[4]=0
     stack empty, push 4         stack: [4]
j=3: nums[3]=3 > prefix_min[3]=0
     stack top=4, 4 > 0 (not <=0), check 4 < 3? no
     push 3                      stack: [4, 3]
j=2: nums[2]=0 == prefix_min[2]=0, skip
j=1: nums[1]=5 > prefix_min[1]=3
     pop 3 (<=3? yes, 3<=3), pop
     stack top=4, 4 > 3, check 4 < 5? yes => FOUND!

Pattern: prefix_min[1]=3, stack_top=4, nums[1]=5 => 3 < 4 < 5
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static boolean find132patternPrefixMin(int[] nums) {
    if (nums == null || nums.length < 3) return false;
    int n = nums.length;
    int[] minPrefix = new int[n]; // O(n) space
    minPrefix[0] = nums[0];
    for (int i = 1; i < n; i++) minPrefix[i] = Math.min(minPrefix[i - 1], nums[i]); // O(n)
    int[] stack = new int[n];
    int top = -1;
    for (int i = n - 1; i >= 1; i--) { // O(n)
        if (nums[i] > minPrefix[i]) {
            while (top >= 0 && stack[top] <= minPrefix[i]) top--; // O(n) total
            if (top >= 0 && stack[top] < nums[i]) return true;
            stack[++top] = nums[i];
        }
    }
    return false; // Time O(n), Space O(n)
}
```

#### C++

```cpp []
bool find132patternPrefixMin(vector<int>& nums) {
    int n = nums.size();
    if (n < 3) return false;
    vector<int> prefixMin(n); // O(n) space
    prefixMin[0] = nums[0];
    for (int i = 1; i < n; i++) prefixMin[i] = min(prefixMin[i - 1], nums[i]); // O(n)
    stack<int> st; // candidates for '2', O(n) space
    for (int j = n - 1; j >= 0; j--) { // O(n)
        if (nums[j] > prefixMin[j]) {
            while (!st.empty() && st.top() <= prefixMin[j]) st.pop(); // O(n) total
            if (!st.empty() && st.top() < nums[j]) return true;
            st.push(nums[j]);
        }
    }
    return false; // Time O(n), Space O(n)
}
```

#### Python

```python []
def find132pattern(self, nums: list[int]) -> bool:
    n = len(nums)
    if n < 3: return False
    prefix_min = [0] * n  # O(n) space
    prefix_min[0] = nums[0]
    for i in range(1, n): prefix_min[i] = min(prefix_min[i - 1], nums[i])  # O(n)
    stack = []  # monotonic decreasing stack, O(n) space
    for j in range(n - 1, -1, -1):  # O(n)
        if nums[j] > prefix_min[j]:
            while stack and stack[-1] <= prefix_min[j]: stack.pop()  # O(n) total
            if stack and stack[-1] < nums[j]: return True
            stack.append(nums[j])
    return False  # Time O(n), Space O(n)
```

#### Rust

```rust []
pub fn find132pattern_prefix_min(nums: Vec<i32>) -> bool {
    let n = nums.len();
    if n < 3 { return false; }
    let mut prefix_min = vec![0i32; n]; // O(n) space
    prefix_min[0] = nums[0];
    for i in 1..n { prefix_min[i] = prefix_min[i - 1].min(nums[i]); } // O(n)
    let mut stack: Vec<usize> = Vec::new(); // O(n) space
    for j in (0..n).rev() { // O(n)
        if nums[j] > prefix_min[j] {
            while let Some(&top) = stack.last() { // O(n) total
                if nums[top] <= prefix_min[j] { stack.pop(); } else { break; }
            }
            if let Some(&top) = stack.last() {
                if nums[top] < nums[j] { return true; }
            }
            stack.push(j);
        }
    }
    false // Time O(n), Space O(n)
}
```
