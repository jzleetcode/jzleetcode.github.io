---
author: JZ
pubDatetime: 2026-08-06T08:00:00Z
modDatetime: 2026-08-06T08:00:00Z
title: LeetCode 739 Daily Temperatures
featured: false
tags:
  - a-stack
  - a-monotonic-stack
  - a-array
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

Use a **monotonic decreasing stack** of indices. We iterate through the temperatures array; for each day `i`, we pop all indices from the stack whose temperature is less than `temperatures[i]` — those days have found their next warmer day. The answer for popped index `j` is `i - j`.

Each index is pushed and popped at most once, so the total work is linear.

```
temperatures: [73, 74, 75, 71, 69, 72, 76, 73]

Stack trace (stores indices, shown as temp[idx]):
i=0: push 73[0]           stack: [73]
i=1: pop 73[0] → ans[0]=1, push 74[1]   stack: [74]
i=2: pop 74[1] → ans[1]=1, push 75[2]   stack: [75]
i=3: push 71[3]           stack: [75, 71]
i=4: push 69[4]           stack: [75, 71, 69]
i=5: pop 69[4] → ans[4]=1
     pop 71[3] → ans[3]=2
     push 72[5]            stack: [75, 72]
i=6: pop 72[5] → ans[5]=1
     pop 75[2] → ans[2]=4
     push 76[6]            stack: [76]
i=7: push 73[7]           stack: [76, 73]

Result: [1, 1, 4, 2, 1, 1, 0, 0]
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
// see algorithm-java src/main/java/stack/DailyTemperatures.java for the full source.
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

#### C++

```cpp []
vector<int> dailyTemperatures(vector<int>& temperatures) {
    int n = temperatures.size();
    vector<int> res(n, 0); // O(n) space
    stack<int> st; // monotonic decreasing stack of indices, O(n) space
    for (int i = 0; i < n; i++) { // O(n)
        while (!st.empty() && temperatures[st.top()] < temperatures[i]) { // O(n) total pops
            int j = st.top();
            st.pop();
            res[j] = i - j;
        }
        st.push(i);
    }
    return res; // Time O(n), Space O(n)
}
```

#### Python

```python []
def dailyTemperatures(self, temperatures: list[int]) -> list[int]:
    n = len(temperatures)
    res = [0] * n  # O(n) space
    stack = []  # monotonic decreasing stack of indices, O(n) space
    for i in range(n):  # O(n)
        while stack and temperatures[stack[-1]] < temperatures[i]:  # O(n) total pops
            j = stack.pop()
            res[j] = i - j
        stack.append(i)
    return res  # Time O(n), Space O(n)
```

#### Rust

```rust []
// see crates/leet/src/stack/daily_temperatures.rs for the full source.
pub fn daily_temperatures(temperatures: Vec<i32>) -> Vec<i32> {
    let n = temperatures.len();
    let mut res = vec![0i32; n]; // O(n) space
    let mut stack: Vec<usize> = Vec::new(); // monotonic decreasing stack of indices, O(n) space
    for i in 0..n { // O(n)
        while let Some(&j) = stack.last() { // O(n) total pops
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
```
