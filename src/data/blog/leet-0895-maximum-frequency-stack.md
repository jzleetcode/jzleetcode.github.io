---
author: JZ
pubDatetime: 2026-05-01T06:00:00Z
modDatetime: 2026-05-01T06:00:00Z
title: LeetCode 895 Maximum Frequency Stack
featured: true
tags:
  - a-hash
  - a-stack
  - a-design
description:
  "Solutions for LeetCode 895, hard, tags: hash table, stack, design, ordered set."
---

## Table of contents

## Description

Design a stack-like data structure to push elements to the stack and pop the most frequent element from the stack.

Implement the `FreqStack` class:

- `FreqStack()` constructs an empty frequency stack.
- `void push(int val)` pushes an integer val onto the top of the stack.
- `int pop()` removes and returns the most frequent element in the stack. If there is a tie for the most frequent element, the element closest to the stack's top is removed and returned.

```
Example 1:

Input
["FreqStack", "push", "push", "push", "push", "push", "push", "pop", "pop", "pop", "pop"]
[[], [5], [7], [5], [7], [4], [5], [], [], [], []]
Output
[null, null, null, null, null, null, null, 5, 7, 5, 4]

Explanation
FreqStack freqStack = new FreqStack();
freqStack.push(5); // The stack is [5]
freqStack.push(7); // The stack is [5,7]
freqStack.push(5); // The stack is [5,7,5]
freqStack.push(7); // The stack is [5,7,5,7]
freqStack.push(4); // The stack is [5,7,5,7,4]
freqStack.push(5); // The stack is [5,7,5,7,4,5]
freqStack.pop();   // return 5, as 5 is the most frequent. The stack becomes [5,7,5,7,4].
freqStack.pop();   // return 7, as 5 and 7 is the most frequent, but 7 is closest to the top. The stack becomes [5,7,5,4].
freqStack.pop();   // return 5, as 5 is the most frequent. The stack becomes [5,7,4].
freqStack.pop();   // return 4, as 4, 5 and 7 is the most frequent, but 4 is closest to the top. The stack becomes [5,7].

Constraints:

0 <= val <= 10^9
At most 2 * 10^4 calls total will be made to push and pop.
It is guaranteed that there will be at least one element in the stack before calling pop.
```

## Solution: Frequency-Grouped Stacks

### Idea

The key insight is to group elements into stacks by their current frequency. We maintain two hash maps:

1. `freq`: maps each value to its current frequency count.
2. `group`: maps each frequency to a stack (list) of values that have reached that frequency.

We also track `maxFreq`, the highest frequency of any element currently in the stack.

**Push**: Increment `freq[val]`. Append `val` to `group[freq[val]]`. Update `maxFreq`.

**Pop**: Pop from `group[maxFreq]`. Decrement `freq[val]`. If `group[maxFreq]` is now empty, decrement `maxFreq`.

The reason this works for tie-breaking is that within each frequency group, values appear in push order. So popping from the stack naturally returns the most recently pushed element at that frequency.

```
push(5): freq={5:1}         group={1:[5]}               maxFreq=1
push(7): freq={5:1,7:1}     group={1:[5,7]}             maxFreq=1
push(5): freq={5:2,7:1}     group={1:[5,7], 2:[5]}      maxFreq=2
push(7): freq={5:2,7:2}     group={1:[5,7], 2:[5,7]}    maxFreq=2
push(4): freq={5:2,7:2,4:1} group={1:[5,7,4], 2:[5,7]}  maxFreq=2
push(5): freq={5:3,7:2,4:1} group={1:[5,7,4], 2:[5,7], 3:[5]} maxFreq=3

pop() -> 5:  from group[3], maxFreq=2  (group[3] now empty)
pop() -> 7:  from group[2], maxFreq=2
pop() -> 5:  from group[2], maxFreq=1  (group[2] now empty)
pop() -> 4:  from group[1], maxFreq=1
```

Note that a value like `5` appears in multiple groups (group[1], group[2], group[3]) simultaneously. Each occurrence represents one "level" of frequency. When we pop `5` from group[3], its freq drops to 2, and the copy in group[2] is still there for a future pop.

Complexity: Time $O(1)$ per `push` and `pop`, Space $O(n)$ where $n$ is the total number of `push` calls.

#### Java

```java []
// HashMap + group stacks. O(1) time for push and pop, O(n) space total.
Map<Integer, Integer> freq = new HashMap<>(); // val -> frequency count, O(n) space
Map<Integer, Deque<Integer>> group = new HashMap<>(); // frequency -> stack of vals, O(n) space
int maxFreq = 0;

// O(1) time
public void push(int val) {
    int f = freq.merge(val, 1, Integer::sum); // increment freq
    group.computeIfAbsent(f, k -> new ArrayDeque<>()).push(val); // push to group[f]
    maxFreq = Math.max(maxFreq, f); // update maxFreq
}

// O(1) time
public int pop() {
    int val = group.get(maxFreq).pop(); // pop from most frequent group
    freq.merge(val, -1, Integer::sum); // decrement freq
    if (group.get(maxFreq).isEmpty()) maxFreq--; // shrink maxFreq if group empty
    return val;
}
```

#### Python

```python []
class FreqStack:
    def __init__(self):
        self.freq = defaultdict(int)
        self.group = defaultdict(list)  # O(n) space, freq -> stack of vals
        self.max_freq = 0

    def push(self, val: int) -> None:  # O(1) time
        self.freq[val] += 1
        f = self.freq[val]
        if f > self.max_freq:
            self.max_freq = f
        self.group[f].append(val)

    def pop(self) -> int:  # O(1) time
        val = self.group[self.max_freq].pop()
        self.freq[val] -= 1
        if not self.group[self.max_freq]:
            self.max_freq -= 1
        return val
```

#### C++

```cpp []
// LeetCode 895. O(1) push, O(1) pop, O(n) space.
class FreqStack895 {
public:
    void push(int val) {
        int f = ++freq[val];
        group[f].push_back(val);
        if (f > maxFreq) maxFreq = f;
    }

    int pop() {
        int val = group[maxFreq].back();
        group[maxFreq].pop_back();
        freq[val]--;
        if (group[maxFreq].empty()) maxFreq--;
        return val;
    }

private:
    std::unordered_map<int, int> freq;
    std::unordered_map<int, std::vector<int>> group;
    int maxFreq = 0;
};
```

#### Rust

```rust []
/// LeetCode 895. O(1) push/pop, O(n) space.
pub struct FreqStack {
    freq: HashMap<i32, i32>,
    group: HashMap<i32, Vec<i32>>,
    max_freq: i32,
}

impl FreqStack {
    pub fn new() -> Self {
        FreqStack { freq: HashMap::new(), group: HashMap::new(), max_freq: 0 }
    }

    pub fn push(&mut self, val: i32) {
        let f = self.freq.entry(val).or_insert(0);
        *f += 1;
        let f = *f;
        if f > self.max_freq {
            self.max_freq = f;
        }
        self.group.entry(f).or_insert_with(Vec::new).push(val);
    }

    pub fn pop(&mut self) -> i32 {
        let vals = self.group.get_mut(&self.max_freq).unwrap();
        let val = vals.pop().unwrap();
        if vals.is_empty() {
            self.group.remove(&self.max_freq);
            self.max_freq -= 1;
        }
        *self.freq.get_mut(&val).unwrap() -= 1;
        val
    }
}
```
