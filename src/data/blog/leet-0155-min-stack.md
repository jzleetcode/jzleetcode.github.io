---
author: JZ
pubDatetime: 2026-04-16T06:00:00Z
modDatetime: 2026-04-16T06:00:00Z
title: LeetCode 155 Min Stack
featured: false
tags:
  - a-stack
  - a-design
description:
  "Solutions for LeetCode 155, medium, tags: stack, design."
---

## Table of contents

## Description

Design a stack that supports push, pop, top, and retrieving the minimum element in constant time.

Implement the `MinStack` class:

- `MinStack()` initializes the stack object.
- `void push(int val)` pushes the element `val` onto the stack.
- `void pop()` removes the element on the top of the stack.
- `int top()` gets the top element of the stack.
- `int getMin()` retrieves the minimum element in the stack.

You must implement a solution with `O(1)` time complexity for each function.

```
Example 1:

Input:
["MinStack","push","push","push","getMin","pop","top","getMin"]
[[],[-2],[0],[-3],[],[],[],[]]

Output:
[null,null,null,null,-3,null,0,-2]

Explanation:
MinStack minStack = new MinStack();
minStack.push(-2);
minStack.push(0);
minStack.push(-3);
minStack.getMin(); // return -3
minStack.pop();
minStack.top();    // return 0
minStack.getMin(); // return -2

Constraints:

-2^31 <= val <= 2^31 - 1
Methods pop, top and getMin operations will always be called on non-empty stacks.
At most 3 * 10^4 calls will be made to push, pop, top, and getMin.
```

## Solution 1: Two Stacks

### Idea

The key insight is that we can maintain a second stack that mirrors the main stack but stores the running minimum. Every time we push a value, we also push `min(val, current_min)` onto the min-stack. When we pop, we pop from both stacks.

This way, `getMin()` simply peeks at the top of the min-stack, which always reflects the minimum of all elements currently in the main stack.

```
push(-2):  stack=[-2]        min_stack=[-2]
push(0):   stack=[-2,0]      min_stack=[-2,-2]    (min(-2,0) = -2)
push(-3):  stack=[-2,0,-3]   min_stack=[-2,-2,-3]  (min(-2,-3) = -3)
getMin():  min_stack.top() = -3
pop():     stack=[-2,0]      min_stack=[-2,-2]
top():     stack.top() = 0
getMin():  min_stack.top() = -2
```

Each operation touches the top of one or both stacks, so all operations are $O(1)$ time. Both stacks hold at most $n$ elements, so space is $O(n)$.

Complexity: Time $O(1)$ per operation, Space $O(n)$.

#### Java

```java []
// Solution 1: two stacks. O(1) time for all operations, O(n) space.
Deque<Integer> stack = new ArrayDeque<>();
Deque<Integer> minStack = new ArrayDeque<>(); // tracks current min at each level

public void push(int val) {
    stack.push(val); // O(1)
    minStack.push(minStack.isEmpty() ? val : Math.min(val, minStack.peek())); // O(1)
}

public void pop() {
    stack.pop(); // O(1)
    minStack.pop(); // O(1)
}

public int top() {
    return stack.peek(); // O(1)
}

public int getMin() {
    return minStack.peek(); // O(1)
}
```

#### Python

```python []
class MinStack:
    """Two stacks approach. Each operation is O(1) time. O(n) space."""

    def __init__(self):
        self.stack = []
        self.min_stack = []  # tracks current min at each level

    def push(self, val: int) -> None:
        self.stack.append(val)  # O(1)
        # push the new min onto min_stack
        self.min_stack.append(min(val, self.min_stack[-1] if self.min_stack else val))  # O(1)

    def pop(self) -> None:
        self.stack.pop()  # O(1)
        self.min_stack.pop()  # O(1)

    def top(self) -> int:
        return self.stack[-1]  # O(1)

    def getMin(self) -> int:
        return self.min_stack[-1]  # O(1)
```

#### C++

```cpp []
// Two stacks approach. O(1) time for all operations, O(n) space.
class MinStack155 {
    stack<int> st;
    stack<int> minSt; // tracks current min at each level
public:
    MinStack155() {}

    void push(int val) {
        st.push(val); // O(1)
        minSt.push(minSt.empty() ? val : min(val, minSt.top())); // O(1)
    }

    void pop() {
        st.pop(); // O(1)
        minSt.pop(); // O(1)
    }

    int top() {
        return st.top(); // O(1)
    }

    int getMin() {
        return minSt.top(); // O(1)
    }
};
```

#### Rust

```rust []
/// Two stacks approach. O(1) time for all operations, O(n) space.
pub struct MinStack {
    stack: Vec<i32>,
    min_stack: Vec<i32>, // tracks current min at each level
}

impl MinStack {
    pub fn new() -> Self {
        MinStack { stack: Vec::new(), min_stack: Vec::new() }
    }

    pub fn push(&mut self, val: i32) {
        self.stack.push(val); // O(1)
        let cur_min = match self.min_stack.last() {
            Some(&m) => val.min(m),
            None => val,
        };
        self.min_stack.push(cur_min); // O(1)
    }

    pub fn pop(&mut self) {
        self.stack.pop(); // O(1)
        self.min_stack.pop(); // O(1)
    }

    pub fn top(&self) -> i32 {
        *self.stack.last().unwrap() // O(1)
    }

    pub fn get_min(&self) -> i32 {
        *self.min_stack.last().unwrap() // O(1)
    }
}
```

## Solution 2: Single Stack with Tuples

### Idea

Instead of two separate stacks, we store `(val, current_min)` tuples in a single stack. Each entry remembers what the minimum was at the time it was pushed. This is functionally equivalent to Solution 1 but uses one data structure.

Complexity: Time $O(1)$ per operation, Space $O(n)$.

#### Java

```java []
// Solution 2: single stack with tuples. O(1) time for all operations, O(n) space.
Deque<int[]> stack = new ArrayDeque<>(); // stores {val, currentMin}

public void push(int val) {
    int curMin = stack.isEmpty() ? val : Math.min(val, stack.peek()[1]);
    stack.push(new int[]{val, curMin}); // O(1)
}

public void pop() {
    stack.pop(); // O(1)
}

public int top() {
    return stack.peek()[0]; // O(1)
}

public int getMin() {
    return stack.peek()[1]; // O(1)
}
```

#### Python

```python []
class MinStackSingleStack:
    """Single stack storing (val, current_min) tuples. Each operation is O(1) time. O(n) space."""

    def __init__(self):
        self.stack = []  # stores (val, current_min) tuples

    def push(self, val: int) -> None:
        cur_min = min(val, self.stack[-1][1] if self.stack else val)
        self.stack.append((val, cur_min))  # O(1)

    def pop(self) -> None:
        self.stack.pop()  # O(1)

    def top(self) -> int:
        return self.stack[-1][0]  # O(1)

    def getMin(self) -> int:
        return self.stack[-1][1]  # O(1)
```

#### C++

```cpp []
// Single stack with pairs. O(1) time for all operations, O(n) space.
class MinStack155V2 {
    stack<pair<int, int>> st; // stores {val, currentMin}
public:
    MinStack155V2() {}

    void push(int val) {
        int curMin = st.empty() ? val : min(val, st.top().second);
        st.push({val, curMin}); // O(1)
    }

    void pop() {
        st.pop(); // O(1)
    }

    int top() {
        return st.top().first; // O(1)
    }

    int getMin() {
        return st.top().second; // O(1)
    }
};
```

#### Rust

```rust []
/// Single stack with tuples. O(1) time for all operations, O(n) space.
pub struct MinStackV2 {
    stack: Vec<(i32, i32)>, // stores (val, current_min)
}

impl MinStackV2 {
    pub fn new() -> Self {
        MinStackV2 { stack: Vec::new() }
    }

    pub fn push(&mut self, val: i32) {
        let cur_min = match self.stack.last() {
            Some(&(_, m)) => val.min(m),
            None => val,
        };
        self.stack.push((val, cur_min)); // O(1)
    }

    pub fn pop(&mut self) {
        self.stack.pop(); // O(1)
    }

    pub fn top(&self) -> i32 {
        self.stack.last().unwrap().0 // O(1)
    }

    pub fn get_min(&self) -> i32 {
        self.stack.last().unwrap().1 // O(1)
    }
}
```
