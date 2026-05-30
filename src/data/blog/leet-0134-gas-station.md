---
author: JZ
pubDatetime: 2026-05-25T10:37:00Z
modDatetime: 2026-05-25T10:37:00Z
title: LeetCode 134 Gas Station
featured: false
tags:
  - a-array
  - a-greedy
description:
  "Solutions for LeetCode 134, medium, tags: array, greedy."
---

## Table of contents

## Description

Question Links: [LeetCode 134](https://leetcode.com/problems/gas-station/description/)

There are `n` gas stations along a circular route, where the amount of gas at the `i`th station is `gas[i]`.

You have a car with an unlimited gas tank and it costs `cost[i]` of gas to travel from the `i`th station to its next `(i + 1)`th station. You begin the journey with an empty tank at one of the gas stations.

Given two integer arrays `gas` and `cost`, return the starting gas station's index if you can travel around the circuit once in the clockwise direction, otherwise return `-1`. If there exists a solution, it is guaranteed to be unique.

```
Example 1:

Input: gas = [1,2,3,4,5], cost = [3,4,5,1,2]
Output: 3
Explanation:
Start at station 3 (index 3) and fill up with 4 unit of gas. Your tank = 0 + 4 = 4
Travel to station 4. Your tank = 4 - 1 + 5 = 8
Travel to station 0. Your tank = 8 - 2 + 1 = 7
Travel to station 1. Your tank = 7 - 3 + 2 = 6
Travel to station 2. Your tank = 6 - 4 + 3 = 5
Travel to station 3. The cost is 5. Your gas is just enough to travel back to station 3.
Therefore, return 3 as the starting index.

Example 2:

Input: gas = [2,3,4], cost = [3,4,3]
Output: -1
Explanation:
You can't start at station 0 or 1, as there is not enough gas to travel to the next station.
Let's start at station 2 and fill up with 4 unit of gas. Your tank = 0 + 4 = 4
Travel to station 0. Your tank = 4 - 3 + 2 = 3
Travel to station 1. Your tank = 3 - 3 + 3 = 3
You cannot travel back to station 2, as it requires 4 unit of gas but you only have 3.
Therefore, you can't travel around the circuit once no matter where you start.
```

**Constraints:**

- `n == gas.length == cost.length`
- `1 <= n <= 10^5`
- `0 <= gas[i], cost[i] <= 10^4`

## Idea1

The key insight is that if the total gas across all stations is at least the total cost, a solution must exist. We use a greedy one-pass approach: compute `gain[i] = gas[i] - cost[i]` at each station. Track a running `currGain`; when it drops below zero at station `i`, no station from the current `start` to `i` can be valid, so we reset `start = i + 1` and `currGain = 0`.

```
gas:      [1, 2, 3, 4, 5]
cost:     [3, 4, 5, 1, 2]
gain:     [-2,-2,-2, 3, 3]   total = 0 >= 0, solution exists
currGain: [-2, reset at 0]
          [-2, reset at 1]
          [-2, reset at 2]
          [ 3, 6]            start = 3, no more resets
```

Complexity: Time $O(n)$ — single pass, Space $O(1)$ — three variables.

### Java

```java []
public class GasStation {
    // O(n) time, O(1) space.
    public int canCompleteCircuit(int[] gas, int[] cost) {
        int currGain = 0, totalGain = 0, answer = 0;
        for (int i = 0; i < gas.length; ++i) { // O(n)
            totalGain += gas[i] - cost[i];
            currGain += gas[i] - cost[i];
            if (currGain < 0) {
                answer = i + 1;
                currGain = 0;
            }
        }
        return totalGain >= 0 ? answer : -1;
    }
}
```

### Python

```python []
class Solution:
    def canCompleteCircuit(self, gas: list[int], cost: list[int]) -> int:
        """One-pass greedy. O(n) time, O(1) space."""
        total_gain = 0
        curr_gain = 0
        answer = 0
        for i in range(len(gas)):  # O(n)
            total_gain += gas[i] - cost[i]
            curr_gain += gas[i] - cost[i]
            if curr_gain < 0:
                answer = i + 1
                curr_gain = 0
        return answer if total_gain >= 0 else -1
```

### C++

```cpp []
class Solution {
public:
    int canCompleteCircuit(vector<int>& gas, vector<int>& cost) {
        int n = gas.size();
        int totalGas = 0, totalCost = 0;
        int tank = 0, start = 0;
        for (int i = 0; i < n; ++i) {       // O(n)
            totalGas += gas[i];
            totalCost += cost[i];
            tank += gas[i] - cost[i];
            if (tank < 0) {
                start = i + 1;
                tank = 0;
            }
        }
        return totalGas >= totalCost ? start : -1;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn can_complete_circuit(gas: Vec<i32>, cost: Vec<i32>) -> i32 {
        let mut total_gain = 0;
        let mut curr_gain = 0;
        let mut start = 0;
        for i in 0..gas.len() { // O(n)
            let gain = gas[i] - cost[i];
            total_gain += gain;
            curr_gain += gain;
            if curr_gain < 0 {
                start = i + 1;
                curr_gain = 0;
            }
        }
        if total_gain >= 0 { start as i32 } else { -1 }
    }
}
```

## Idea2

Brute force: try each station as the starting point and simulate the full circuit. If the tank never goes negative during a full traversal, return that start index.

Complexity: Time $O(n^2)$ — nested loop (outer $O(n)$ starts, inner $O(n)$ simulation), Space $O(1)$.

### Java

```java []
public class GasStation {
    // O(n^2) time, O(1) space.
    public int canCompleteCircuitBrute(int[] gas, int[] cost) {
        int n = gas.length;
        for (int start = 0; start < n; start++) {   // O(n) outer
            int tank = 0;
            boolean valid = true;
            for (int j = 0; j < n; j++) {           // O(n) inner
                int idx = (start + j) % n;
                tank += gas[idx] - cost[idx];
                if (tank < 0) { valid = false; break; }
            }
            if (valid) return start;
        }
        return -1;
    }
}
```

### Python

```python []
class Solution2:
    def canCompleteCircuit(self, gas: list[int], cost: list[int]) -> int:
        """Brute force simulation. O(n^2) time, O(1) space."""
        n = len(gas)
        for start in range(n):  # O(n) outer
            tank = 0
            complete = True
            for j in range(n):  # O(n) inner, together O(n^2)
                idx = (start + j) % n
                tank += gas[idx] - cost[idx]
                if tank < 0:
                    complete = False
                    break
            if complete:
                return start
        return -1
```

### C++

```cpp []
class Solution2 {
public:
    int canCompleteCircuitBrute(vector<int>& gas, vector<int>& cost) {
        int n = gas.size();
        for (int start = 0; start < n; ++start) {       // O(n) outer
            int tank = 0, visited = 0;
            for (int i = start; visited < n; i = (i + 1) % n) {  // O(n) inner
                tank += gas[i] - cost[i];
                if (tank < 0) break;
                ++visited;
            }
            if (visited == n) return start;
        }
        return -1;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn can_complete_circuit_brute(gas: Vec<i32>, cost: Vec<i32>) -> i32 {
        let n = gas.len();
        for start in 0..n {             // O(n) outer
            let mut tank = 0;
            let mut ok = true;
            for offset in 0..n {        // O(n) inner
                let i = (start + offset) % n;
                tank += gas[i] - cost[i];
                if tank < 0 { ok = false; break; }
            }
            if ok { return start as i32; }
        }
        -1
    }
}
```
