---
author: JZ
pubDatetime: 2026-04-05T06:00:00Z
modDatetime: 2026-04-05T06:00:00Z
title: LeetCode 874 Walking Robot Simulation
featured: true
tags:
  - a-array
  - a-hash-table
  - a-simulation
description:
  "Solutions for LeetCode 874, medium, tags: array, hash table, simulation."
---

## Table of contents

## Description

A robot on an infinite XY-plane starts at point `(0, 0)` facing north. The robot can receive a sequence of these three possible types of `commands`:

- `-2`: Turn left 90 degrees.
- `-1`: Turn right 90 degrees.
- `1 <= k <= 9`: Move forward `k` units, one unit at a time.

Some of the grid squares are obstacles. The `i`th obstacle is at grid point `obstacles[i] = (xi, yi)`. If the robot runs into an obstacle, it will stay in its current position and move on to the next command.

Return _the maximum Euclidean distance squared that the robot ever gets from the origin_ `(0, 0)`.

```
Example 1:

Input: commands = [4,-1,3], obstacles = []
Output: 25
Explanation: The robot starts at (0, 0):
1. Move north 4 units to (0, 4).
2. Turn right.
3. Move east 3 units to (3, 4).
The furthest point the robot ever gets from the origin is (3, 4),
which squared is 3^2 + 4^2 = 25 units away.

Example 2:

Input: commands = [4,-1,4,-2,4], obstacles = [[2,4]]
Output: 65
Explanation: The robot starts at (0, 0):
1. Move north 4 units to (0, 4).
2. Turn right.
3. Move east but is blocked by obstacle at (2, 4). Robot is at (1, 4).
4. Turn left.
5. Move north 4 units to (1, 8).
The furthest point the robot ever gets from the origin is (1, 8),
which squared is 1^2 + 8^2 = 65 units away.

Example 3:

Input: commands = [6,-1,-1,6], obstacles = [[0,0]]
Output: 36
Explanation: The robot starts at (0, 0):
1. Move north 6 units to (0, 6).
2. Turn right.
3. Turn right (now facing south).
4. Move south 5 units and stop before (0, 0) obstacle at (0, 1).
The furthest point the robot ever gets from the origin is (0, 6),
which squared is 6^2 = 36 units away.

Constraints:

1 <= commands.length <= 10^4
commands[i] is either -2, -1, or an integer in the range [1, 9].
0 <= obstacles.length <= 10^4
-3 * 10^4 <= xi, yi <= 3 * 10^4
The answer is guaranteed to be less than 2^31.
```

## Solution

### Idea

This is a simulation problem. The key insight is using a **HashSet** for obstacle coordinates so we can check collisions in $O(1)$ time.

We define four directions — North, East, South, West — using direction arrays:

```
Direction:  N      E      S      W
dx:         0      1      0     -1
dy:         1      0     -1      0
Index:      0      1      2      3
```

Turning is index arithmetic:
- **Turn right**: `d = (d + 1) % 4` — cycles N→E→S→W→N
- **Turn left**: `d = (d + 3) % 4` — cycles N→W→S→E→N (equivalent to `d - 1` without going negative)

For each move command, we step **one unit at a time** and check if the next cell is an obstacle. If it is, we stop. After each move command, we update the max squared distance.

Let's trace Example 2: `commands = [4,-1,4,-2,4], obstacles = [[2,4]]`

```
         y
         8 |          * (1,8) max=65
         7 |          |
         6 |          |
         5 |          |
         4 |  * - - X . (2,4) obstacle
         3 |  |
         2 |  |
         1 |  |
         0 +--+--+--+--+-- x
           0  1  2  3  4

Step 1: Move N 4 → (0,4), max=16
Step 2: Turn right → facing E
Step 3: Move E 4 → blocked at (2,4), stop at (1,4), max=17
Step 4: Turn left → facing N
Step 5: Move N 4 → (1,8), max=65
```

Complexity: Time $O(n \cdot k + m)$, Space $O(m)$.

Where $n$ is commands length, $k$ is max steps per command ($\le 9$), and $m$ is obstacles count.

#### Java

```java
public static int robotSim(int[] commands, int[][] obstacles) {
    int[] dx = {0, 1, 0, -1}; // N, E, S, W
    int[] dy = {1, 0, -1, 0};
    Set<Long> obs = new HashSet<>();
    for (int[] o : obstacles) obs.add(encode(o[0], o[1]));
    int x = 0, y = 0, d = 0, res = 0;
    for (int c : commands) {
        if (c == -2) d = (d + 3) % 4;
        else if (c == -1) d = (d + 1) % 4;
        else {
            for (int i = 0; i < c; i++) {
                int nx = x + dx[d], ny = y + dy[d];
                if (obs.contains(encode(nx, ny))) break;
                x = nx;
                y = ny;
            }
            res = Math.max(res, x * x + y * y);
        }
    }
    return res;
}

private static long encode(int x, int y) {
    return ((long) x + 30001) * 60003 + (y + 30001);
}
```

#### Python

```python
class Solution:
    """O(n*k+m) time, O(m) space. n: commands length, k: max steps (9), m: obstacles length."""

    def robotSim(self, commands: list[int], obstacles: list[list[int]]) -> int:
        dx = [0, 1, 0, -1]  # N, E, S, W
        dy = [1, 0, -1, 0]
        obs = set(map(tuple, obstacles))
        x = y = d = 0  # d: 0=N, 1=E, 2=S, 3=W
        res = 0
        for c in commands:
            if c == -2:
                d = (d + 3) % 4  # turn left
            elif c == -1:
                d = (d + 1) % 4  # turn right
            else:
                for _ in range(c):
                    nx, ny = x + dx[d], y + dy[d]
                    if (nx, ny) in obs:
                        break
                    x, y = nx, ny
                res = max(res, x * x + y * y)
        return res
```

#### C++

```cpp
class Solution {
public:
    int robotSim(vector<int> &commands, vector<vector<int>> &obstacles) {
        unordered_set<string> obs;
        for (auto &o : obstacles) {
            obs.insert(to_string(o[0]) + "," + to_string(o[1]));
        }
        int dx[] = {0, 1, 0, -1};
        int dy[] = {1, 0, -1, 0};
        int x = 0, y = 0, d = 0, res = 0;
        for (int c : commands) {
            if (c == -2) {
                d = (d + 3) % 4;
            } else if (c == -1) {
                d = (d + 1) % 4;
            } else {
                for (int i = 0; i < c; i++) {
                    int nx = x + dx[d], ny = y + dy[d];
                    if (obs.count(to_string(nx) + "," + to_string(ny))) {
                        break;
                    }
                    x = nx;
                    y = ny;
                }
                res = max(res, x * x + y * y);
            }
        }
        return res;
    }
};
```

#### Rust

```rust
use std::collections::HashSet;

impl Solution {
    pub fn robot_sim(commands: Vec<i32>, obstacles: Vec<Vec<i32>>) -> i32 {
        let dx = [0, 1, 0, -1]; // N, E, S, W
        let dy = [1, 0, -1, 0];
        let obs: HashSet<(i32, i32)> = obstacles.iter().map(|o| (o[0], o[1])).collect();
        let (mut x, mut y, mut d) = (0i32, 0i32, 0usize);
        let mut res = 0;
        for &c in &commands {
            if c == -2 {
                d = (d + 3) % 4;
            } else if c == -1 {
                d = (d + 1) % 4;
            } else {
                for _ in 0..c {
                    let (nx, ny) = (x + dx[d], y + dy[d]);
                    if obs.contains(&(nx, ny)) {
                        break;
                    }
                    x = nx;
                    y = ny;
                }
                res = res.max(x * x + y * y);
            }
        }
        res
    }
}
```
