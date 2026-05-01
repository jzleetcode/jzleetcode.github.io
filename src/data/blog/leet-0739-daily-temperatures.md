---
author: JZ
pubDatetime: 2026-04-10T06:00:00Z
modDatetime: 2026-04-10T06:00:00Z
title: LeetCode 739 Daily Temperatures
featured: false
tags:
  - a-array
  - a-stack
  - a-monotonic-stack
description:
  "Solutions for LeetCode 739, medium, tags: array, stack, monotonic stack."
---

## Table of contents

## Description

Question Links: [LeetCode 739](https://leetcode.com/problems/daily-temperatures/description/)

Given an array of integers `temperatures`, return an array `answer` such that `answer[i]` is the number of days you have to wait after the `i`th day to get a warmer temperature. If there is no future day for which this is possible, keep `answer[i] == 0` instead.

```
Example 1:

Input: temperatures = [73,74,75,71,69,72,76,73]
Output: [1,1,4,2,1,1,0,0]

Example 2:

Input: temperatures = [30,40,50,60]
Output: [1,1,1,0]

Example 3:

Input: temperatures = [30,60,90]
Output: [1,1,0]

Constraints:

1 <= temperatures.length <= 10^5
30 <= temperatures[i] <= 100
```

## Solution

### Idea

We use a **monotonic decreasing stack** that stores indices. As we iterate through the array, for each temperature, we pop all indices from the stack whose temperatures are strictly less than the current temperature. For each popped index `j`, the answer is `i - j` (the distance to the next warmer day). Then we push the current index.

Each index is pushed and popped at most once, so the total work across all iterations is $O(n)$.

Let's trace Example 1: `temperatures = [73,74,75,71,69,72,76,73]`

```
i=0: t=73, stack=[]         → push 0.        stack=[0]
i=1: t=74, stack=[0]        → 74>73, pop 0 → ans[0]=1-0=1. push 1. stack=[1]
i=2: t=75, stack=[1]        → 75>74, pop 1 → ans[1]=2-1=1. push 2. stack=[2]
i=3: t=71, stack=[2]        → 71<75, push 3.  stack=[2,3]
i=4: t=69, stack=[2,3]      → 69<71, push 4.  stack=[2,3,4]
i=5: t=72, stack=[2,3,4]    → 72>69, pop 4 → ans[4]=5-4=1.
                               72>71, pop 3 → ans[3]=5-3=2.
                               72<75, push 5.  stack=[2,5]
i=6: t=76, stack=[2,5]      → 76>72, pop 5 → ans[5]=6-5=1.
                               76>75, pop 2 → ans[2]=6-2=4.
                               push 6.         stack=[6]
i=7: t=73, stack=[6]        → 73<76, push 7.  stack=[6,7]

Remaining in stack: indices 6,7 → ans[6]=0, ans[7]=0
Result: [1,1,4,2,1,1,0,0]
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static int[] dailyTemperatures(int[] temperatures) {
    int n = temperatures.length;
    int[] res = new int[n];
    Deque<Integer> stack = new ArrayDeque<>(); // monotonic decreasing stack of indices
    for (int i = 0; i < n; i++) { // O(n)
        while (!stack.isEmpty() && temperatures[stack.peek()] < temperatures[i]) { // O(n) total
            int j = stack.pop();
            res[j] = i - j;
        }
        stack.push(i);
    }
    return res; // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def dailyTemperatures(self, temperatures: list[int]) -> list[int]:
        n = len(temperatures)
        res = [0] * n
        stack = []  # monotonic decreasing stack of indices
        for i, t in enumerate(temperatures):  # O(n)
            while stack and temperatures[stack[-1]] < t:  # each index pushed/popped at most once, O(n) total
                j = stack.pop()
                res[j] = i - j
            stack.append(i)
        return res  # Time O(n), Space O(n)
```

#### C++

```cpp []
class Solution739 {
public:
    vector<int> dailyTemperatures(vector<int> &temperatures) {
        int n = static_cast<int>(temperatures.size());
        vector<int> res(n, 0);
        stack<int> st; // monotonic decreasing stack of indices
        for (int i = 0; i < n; i++) { // O(n)
            while (!st.empty() && temperatures[st.top()] < temperatures[i]) { // O(n) total
                int j = st.top();
                st.pop();
                res[j] = i - j;
            }
            st.push(i);
        }
        return res; // Time O(n), Space O(n)
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn daily_temperatures(temperatures: Vec<i32>) -> Vec<i32> {
        let n = temperatures.len();
        let mut res = vec![0i32; n];
        let mut stack: Vec<usize> = Vec::new(); // monotonic decreasing stack of indices
        for i in 0..n { // O(n)
            while let Some(&j) = stack.last() { // each index pushed/popped at most once, O(n) total
                if temperatures[j] < temperatures[i] {
                    stack.pop();
                    res[j] = (i - j) as i32;
                } else {
                    break;
                }
            }
            stack.push(i);
        }
        res // Time O(n), Space O(n)
    }
}
```
