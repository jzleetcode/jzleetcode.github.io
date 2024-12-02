---
author: JZ
pubDatetime: 2024-11-30T07:23:00Z
modDatetime: 2024-11-30T07:23:00Z
title: LeetCode 1041 LintCode 1345 Robot Bounded in Circle (GeeksForGeeks, HackerRank EnCircular, Robot Walks, Project Euler 208)
featured: true
tags:
  - a-math
  - a-string
  - a-simulation
  - c-linkedin
  - c-salesforce
description:
  "Solutions for LeetCode 1041 LintCode 1345 GFG HackerRank Robot Walks Project Euler 208, medium, tags: math, string, simulation, companies: linkedin, salesforce."
---

## Table of contents

## Context

This is a popular question seen on LeetCode, LintCode, GeeksForGeeks, and HackerRank.

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

## HackerRank Question

HackerRank [Question](https://www.hackerrank.com/contests/projecteuler/challenges/euler208/problem).

This problem is a programming version of [Problem 208](https://projecteuler.net/problem=208) from [projecteuler.net](https://projecteuler.net/)

A robot moves in a series of one-$n^{th}$ circular arcs ($\dfrac{360\degree}{n}$), with a free choice of a clockwise or an anticlockwise arc for each step, but no turning on the spot.

For example, one of possible 70932 closed paths of 25 arcs with n=5 and starting northward is

![image](https://s3.amazonaws.com/hr-assets/0/1513552045-1234c816d1-PE208.png)

Given that the robot starts facing North, how many journeys of `m` arcs in length can it take that return it, after the final arc, to its starting position?

Any arc may be traversed multiple times.

Since the answer can be huge, output it modulo `K`.

**Input Format**

The only line of each test case contains exactly three space-separated integers: `n`, `m`, and `K`.

**Constraints**

- $1 \lt n \le 10$
- $n < m$
- $n^2 \times m \le 2 \times 10^4$
- $10^9 \lt K \lt 2 \times 10^9$
- $K$ is a prime number

**Output Format**

On a single line print the answer modulo $K$.

**Sample Input 0**

3 6 1000000007

**Sample Output 0**

8

**Explanation 0**

If a robot moves in a series of six $120\degree$ circular arcs, then there are only 8 journeys that return to the starting position:

![image](https://s3.amazonaws.com/hr-assets/0/1515290672-2deb64feb3-Example3Answer.png)

**Sample Input 1**

6 7 1000000009

**Sample Output 1**

2

**Explanation 1**

If a robot moves in a series of seven $60\degree$ circular arcs, then there are only 2 journeys that return to the starting position:

![image](https://s3.amazonaws.com/hr-assets/0/1515326635-190fa1f15a-Example6Answer.png)

**Sample Input 2**

4 8 1000000033

**Sample Output 2**

18

**Explanation 2**

If a robot moves in a series of eight $90\degree$ circular arcs, then there are 18 journeys that return to the starting position:

![image](https://s3.amazonaws.com/hr-assets/0/1515415327-0e59c29aad-Example4Answers.png)
