---
author: JZ
pubDatetime: 2026-10-21T18:54:05Z
modDatetime: 2026-10-21T18:54:05Z
title: LeetCode 946 Validate Stack Sequences
featured: true
tags:
  - a-array
  - a-stack
description: "Solution for LeetCode 946, medium, tags: array, stack, simulation."
---

## Table of contents

- [Description](#description)
- [Idea](#idea)
- [Complexity](#complexity)
- [Java](#java)
- [Python](#python)
- [C++](#c)
- [Rust](#rust)

## Description

Question link: [LeetCode 946: Validate Stack Sequences](https://leetcode.com/problems/validate-stack-sequences/description/)

Given the order in which distinct integers are pushed onto an initially empty stack, determine whether a proposed order of pops is possible. You may interleave push and pop operations, but you must push every element and eventually pop every element.

For example, `pushed = [1,2,3,4,5]` and `popped = [4,5,3,2,1]` is possible: push `1,2,3,4`, pop `4`, push `5`, and then pop `5,3,2,1`. However, `[4,3,5,1,2]` is impossible: once `5` is removed, `2` sits above the requested `1`.

**Constraints:**

- `1 <= pushed.length <= 1000`
- `0 <= pushed[i] <= 1000`
- All values in `pushed` are unique.
- `popped.length == pushed.length`
- `popped` is a permutation of `pushed`.

## Idea

Use a stack to simulate the operations. Process `pushed` from left to right. After each push, pop while the top equals the next requested value in `popped`. If that next value is already on top, popping it immediately is always safe; postponing it cannot help produce a different top.

```text
pushed:  1  2  3  4  5
popped:  4  5  3  2  1

push 1, 2, 3, 4 -> stack [1, 2, 3, 4] -> pop 4
push 5          -> stack [1, 2, 3, 5] -> pop 5, 3, 2, 1
```

The stack contains precisely the pushed elements not yet popped. If the simulation consumes every requested pop, it constructs a valid operation sequence. Otherwise, the next requested value is blocked by an element above it after all pushes, so no valid sequence exists. An in-place array used as a stack would still be the same simulation, not a distinct algorithm that needs a second solution.

## Complexity

Let `n = pushed.length`. Each value is pushed once and popped at most once, so even though the `while` loop is nested inside the `for` loop, total **time is $O(n)$**. The simulated stack holds at most `n` values, so **auxiliary space is $O(n)$**.

### Java

```java []
package stack;

import java.util.ArrayDeque;
import java.util.Deque;

public final class ValidateStackSequences {
    private ValidateStackSequences() {}

    public static boolean validateStackSequences(int[] pushed, int[] popped) {
        Deque<Integer> stack = new ArrayDeque<>();
        int poppedIndex = 0;
        for (int value : pushed) {
            stack.push(value);
            // Each element can leave the stack only once: O(n) pops overall.
            while (!stack.isEmpty() && poppedIndex < popped.length
                    && stack.peek() == popped[poppedIndex]) {
                stack.pop();
                poppedIndex++;
            }
        }
        return poppedIndex == popped.length;
    }
}
```

The Java repository uses a static utility method. On LeetCode, place it in `class Solution` as an instance method.

### Python

```python []
class Solution:
    def validateStackSequences(self, pushed: list[int], popped: list[int]) -> bool:
        stack = []
        pop_index = 0

        for value in pushed:  # O(n) pushes.
            stack.append(value)
            while stack and stack[-1] == popped[pop_index]:
                stack.pop()  # Each value is popped at most once: O(n) total.
                pop_index += 1
                if pop_index == len(popped):
                    return True

        return pop_index == len(popped)  # O(n) auxiliary stack space.
```

### C++

```cpp []
#pragma once
#include <cstddef>
#include <stack>
#include <vector>

using namespace std;

namespace ValidateStackSequences {

class Solution {
public:
    bool validateStackSequences(vector<int>& pushed, vector<int>& popped) {
        stack<int> pending;
        size_t poppedIndex = 0;
        for (int value : pushed) {
            pending.push(value);
            // Amortized O(n): the inner loop pops each element at most once.
            while (!pending.empty() && poppedIndex < popped.size() && pending.top() == popped[poppedIndex]) {
                pending.pop();
                ++poppedIndex;
            }
        }
        return poppedIndex == popped.size();
    }
};

}
```

The C++ repository wraps `Solution` in a namespace to avoid name collisions. Remove that wrapper when submitting on LeetCode.

### Rust

```rust []
pub struct Solution;

impl Solution {
    pub fn validate_stack_sequences(pushed: Vec<i32>, popped: Vec<i32>) -> bool {
        let mut stack = Vec::new();
        let mut next_popped = 0;

        for value in pushed {
            stack.push(value);
            // O(n) total pops: each pushed value is removed at most once.
            while next_popped < popped.len() && stack.last() == Some(&popped[next_popped]) {
                stack.pop();
                next_popped += 1;
            }
        }

        next_popped == popped.len()
    }
}
```
