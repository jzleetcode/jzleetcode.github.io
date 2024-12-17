---
author: JZ
pubDatetime: 2024-11-30T07:23:00Z
modDatetime: 2024-11-30T07:23:00Z
title: LeetCode 1041 LintCode 1345 Robot Bounded in Circle (GeeksForGeeks, HackerRank EnCircular)
featured: true
tags:
  - a-math
  - a-string
  - a-simulation
  - c-linkedin
  - c-salesforce
description:
  "Solutions for LeetCode 1041 LintCode 1345 GFG HackerRank, medium, tags: math, string, simulation, companies: linkedin, salesforce."
---

## Table of contents

## Context

This is a popular question seen on LeetCode, LintCode, GeeksForGeeks, and HackerRank.

For a related but much harder question, see [project euler 208 and hackerrank robot walks](../hackerrank-robot-walks-project-euler-208/).

## LeetCode, GeeksForGeeks, and LintCode Question

On an infinite plane, a robot initially stands at `(0, 0)` and faces north. Note that:

-   The **north direction** is the positive direction of the y-axis.
-   The **south direction** is the negative direction of the y-axis.
-   The **east direction** is the positive direction of the x-axis.
-   The **west direction** is the negative direction of the x-axis.

The robot can receive one of three instructions:

-   `"G"`: go straight 1 unit.
-   `"L"`: turn 90 degrees to the left (i.e., anti-clockwise direction).
-   `"R"`: turn 90 degrees to the right (i.e., clockwise direction).

The robot performs the `instructions` given in order, and repeats them forever.

Return `true` if and only if there exists a circle in the plane such that the robot never leaves the circle.

```
Example 1:

Input: instructions = "GGLLGG"
Output: true
Explanation: The robot is initially at (0, 0) facing the north direction.
"G": move one step. Position: (0, 1). Direction: North.
"G": move one step. Position: (0, 2). Direction: North.
"L": turn 90 degrees anti-clockwise. Position: (0, 2). Direction: West.
"L": turn 90 degrees anti-clockwise. Position: (0, 2). Direction: South.
"G": move one step. Position: (0, 1). Direction: South.
"G": move one step. Position: (0, 0). Direction: South.
Repeating the instructions, the robot goes into the cycle: (0, 0) --> (0, 1) --> (0, 2) --> (0, 1) --> (0, 0).
Based on that, we return true.

Example 2:

Input: instructions = "GG"
Output: false
Explanation: The robot is initially at (0, 0) facing the north direction.
"G": move one step. Position: (0, 1). Direction: North.
"G": move one step. Position: (0, 2). Direction: North.
Repeating the instructions, keeps advancing in the north direction and does not go into cycles.
Based on that, we return false.

Example 3:

Input: instructions = "GL"
Output: true
Explanation: The robot is initially at (0, 0) facing the north direction.
"G": move one step. Position: (0, 1). Direction: North.
"L": turn 90 degrees anti-clockwise. Position: (0, 1). Direction: West.
"G": move one step. Position: (-1, 1). Direction: West.
"L": turn 90 degrees anti-clockwise. Position: (-1, 1). Direction: South.
"G": move one step. Position: (-1, 0). Direction: South.
"L": turn 90 degrees anti-clockwise. Position: (-1, 0). Direction: East.
"G": move one step. Position: (0, 0). Direction: East.
"L": turn 90 degrees anti-clockwise. Position: (0, 0). Direction: North.
Repeating the instructions, the robot goes into the cycle: (0, 0) --> (0, 1) --> (-1, 1) --> (-1, 0) --> (0, 0).
Based on that, we return true.
```

**Constraints:**

-   `1 <= instructions.length <= 100`
-   `instructions[i]` is `'G'`, `'L'` or, `'R'`.

### Idea

A key discovery is that there are two possible states indicating that the robot can eventually return to the origin (0,0).

1. At the end of instructions, the robot is at the origin.
2. The robot is not at the origin, but it has a direction not facing north. Because the instructions will be repeated, the robot direction will change each time of the instructions were executed. And the robot will return to the origin in one or three more iterations of the instructions.

For example, the robot is at coordinate (0,3) facing east after the first iterations of the instructions as shown in the drawing below.

```
            | 1:(0,3) E
            |
            |
0----------0,0
```

For the next three iterations, the robot will arrive the following statuses.

1. at (-3,3) facing south
2. at (-3,0) facing west
3. at (0,0) facing north

```
2:(-3,3) S  |
            |
            |
0----------0,0
```

```
            |
            |
3:(-3,0) W |
0----------0,0
```

```
2:(-3,0) S  |
            |
            |
0----------0,0 4:(0,0) N
```

Complexity: Time $O(n)$, Space $O(1)$.

#### C++

I look forward to pattern matching coming to C++, see [this article](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p2688r1.pdf). For now, we will use the good old `if else`.

```cpp
class Solution {
public:
    bool isRobotBounded(string instructions) {
        int x = 0, y = 0, i = 0;
        int dirs[4][2] = {{0,  1},
                          {1,  0},
                          {0,  -1},
                          {-1, 0}}; // clockwise
        for (auto &c: instructions) {
            if (c == 'G') x += dirs[i][0], y += dirs[i][1];
            else if (c == 'R') i = (i + 1) % 4;
            else i = (i + 3) % 4;
        }
        return x == 0 && y == 0 || i > 0;
    }
};
```

## HackerRank EnCircular Question

Build a computer simulation of a mobile robot.
The robot moves on an infinite plane, starting from position (0, 0).
Its movements are described by a command string consisting of one or more of the following three letters:

- G instructs the robot to move forward one step.
- L instructs the robot to turn left in place.
- R instructs the robot to turn right in place.

The robot performs the instructions in a command sequence in an infinite loop.
Determine whether there exists some circle such that the robot always moves within the circle.
Consider the commands R and G executed infinitely.

A diagram of the robot's movement looks like:

RG -> RG
↑      ↓
RG <- RG

The robot will never leave the circle.

Function Description

Complete the function `doesCircleExist` in the editor below.
The function must return an array of n strings either YES or NO
based on whether the robot is bound within a circle or not, in order of test results.
`doesCircleExist` has the following parameters:

commands[commands[0]...commands[n-1]]: An array of n commands, where each represents a list of commands to test.

Constraints

- $1 \le commands[i] \le 2500$
- $1 \le n \le 10$
- Each command consists of G, L, and R only.

Sample Case 0

Sample Input 0

`3 G L RGRG`

Sample Output 0

`NO YES YES`

Explanation 0
There are n = 2 commands:

1. For commands[0] = "G", the robot will move forward forever (G → G - G → ..) without ever turning or being restricted to a circle. Set index O of the return array to NO.
2. For commands[1] = "L", the robot will just turn 90 degrees left forever without ever moving forward (because there is no "G" instruction). The robot is effectively trapped at one spot, thus bound within a circle. Set index 1 of the return array to YES.
3. For commands[2] = 'GRGR", concatenate the string to "GRGRGRGR" and it will follow the circular path in the statement example. Set index 2 of the return array to YES.

### Idea

The question is essentially the same with the LeetCode question and the input is a list of the strings and we can apply the same function to generate the result as a list.
