---
author: JZ
pubDatetime: 2026-05-02T06:00:00Z
modDatetime: 2026-05-02T06:00:00Z
title: LeetCode 735 Asteroid Collision
featured: true
tags:
  - a-array
  - a-stack
  - a-simulation
description:
  "Solutions for LeetCode 735, medium, tags: array, stack, simulation."
---

## Table of contents

## Description

Question Links: [LeetCode 735](https://leetcode.com/problems/asteroid-collision/description/)

We are given an array `asteroids` of integers representing asteroids in a row.

For each asteroid, the absolute value represents its size, and the sign represents its direction (positive meaning right, negative meaning left). Each asteroid moves at the same speed.

Find out the state of the asteroids after all collisions. If two asteroids meet, the smaller one will explode. If both are the same size, both will explode. Two asteroids moving in the same direction will never meet.

```
Example 1:

Input: asteroids = [5,10,-5]
Output: [5,10]
Explanation: The 10 and -5 collide resulting in 10. The 5 and 10 never collide.

Example 2:

Input: asteroids = [8,-8]
Output: []
Explanation: The 8 and -8 collide exploding each other.

Example 3:

Input: asteroids = [10,2,-5]
Output: [10]
Explanation: The 2 and -5 collide resulting in -5. The 10 and -5 collide resulting in 10.

Constraints:

2 <= asteroids.length <= 10^4
-1000 <= asteroids[i] <= 1000
asteroids[i] != 0
```

## Solution 1: Stack

### Idea

Use a stack to simulate the collisions. Process each asteroid left to right. A collision only occurs when the current asteroid moves left (negative) and the top of the stack moves right (positive). In that case, compare sizes and destroy the smaller one (or both if equal). Repeat until no more collisions occur for the current asteroid.

```
Input: [10, 2, -5]

Process each asteroid:

  10 (right) -> stack: [10]              no collision, push
   2 (right) -> stack: [10, 2]           no collision, push
  -5 (left)  -> top=2 (right), |2|<|-5|  collision: 2 destroyed
               stack: [10]
            -> top=10 (right), |10|>|-5|  collision: -5 destroyed
               stack: [10]

Result: [10]

Another example: [-2, 1, -1, 2]

  -2 (left)  -> stack empty, push        stack: [-2]
   1 (right) -> top=-2 (left), no clash   stack: [-2, 1]
  -1 (left)  -> top=1 (right), |1|==|-1| both destroyed
               stack: [-2]
   2 (right) -> top=-2 (left), no clash   stack: [-2, 2]

Result: [-2, 2]
```

Complexity: Time $O(n)$ — each asteroid is pushed and popped at most once. Space $O(n)$.

#### Java

```java []
public static int[] asteroidCollision(int[] asteroids) {
    Deque<Integer> stack = new ArrayDeque<>();
    for (int asteroid : asteroids) { // O(n)
        boolean destroyed = false;
        while (!stack.isEmpty() && asteroid < 0 && stack.peek() > 0) { // O(n) total
            int top = stack.peek();
            if (top < -asteroid) {
                stack.pop();
            } else if (top == -asteroid) {
                stack.pop();
                destroyed = true;
                break;
            } else {
                destroyed = true;
                break;
            }
        }
        if (!destroyed) {
            stack.push(asteroid);
        }
    }
    int[] res = new int[stack.size()];
    for (int i = res.length - 1; i >= 0; i--) {
        res[i] = stack.pop();
    }
    return res; // Time O(n), Space O(n)
}
```

#### Python

```python []
class Solution:
    def asteroidCollision(self, asteroids: list[int]) -> list[int]:
        stack: list[int] = []
        for a in asteroids:  # O(n)
            alive = True
            while alive and a < 0 and stack and stack[-1] > 0:  # each element pushed/popped at most once, O(n) total
                if stack[-1] < -a:
                    stack.pop()
                elif stack[-1] == -a:
                    stack.pop()
                    alive = False
                else:
                    alive = False
            if alive:
                stack.append(a)
        return stack  # Time O(n), Space O(n)
```

#### C++

```cpp []
vector<int> asteroidCollision(vector<int> &asteroids) {
    stack<int> st;
    for (int i = 0; i < static_cast<int>(asteroids.size()); i++) { // O(n)
        int asteroid = asteroids[i];
        bool destroyed = false;
        while (!st.empty() && st.top() > 0 && asteroid < 0) { // O(n) total
            if (st.top() < -asteroid) {
                st.pop();
                continue;
            } else if (st.top() == -asteroid) {
                st.pop();
                destroyed = true;
                break;
            } else {
                destroyed = true;
                break;
            }
        }
        if (!destroyed) {
            st.push(asteroid);
        }
    }
    vector<int> res(st.size());
    for (int i = static_cast<int>(st.size()) - 1; i >= 0; i--) {
        res[i] = st.top();
        st.pop();
    }
    return res; // Time O(n), Space O(n)
}
```

#### Rust

```rust []
pub fn asteroid_collision(asteroids: Vec<i32>) -> Vec<i32> {
    let mut stack: Vec<i32> = Vec::new();
    for &a in &asteroids { // O(n)
        let mut alive = true;
        while alive && a < 0 && !stack.is_empty() && *stack.last().unwrap() > 0 { // O(n) total
            let top = *stack.last().unwrap();
            if top < -a {
                stack.pop();
            } else if top == -a {
                stack.pop();
                alive = false;
            } else {
                alive = false;
            }
        }
        if alive {
            stack.push(a);
        }
    }
    stack // Time O(n), Space O(n)
}
```
