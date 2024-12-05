---
author: JZ
pubDatetime: 2024-12-03T06:23:00Z
modDatetime: 2024-12-03T06:23:00Z
title: HackerRank Robot Walks and Project Euler 208 Solutions
featured: true
tags:
  - a-simulation
  - a-math
description:
  "Solutions for project euler 208 and hacker rank question robot walks, hard, tags: math, simulation."
---

## Table of contents

## Context

For a related but much simpler question, see [leetcode 1041](../leet-1041-hackerrank-gfg-robot-bounded-in-circle/).

## Project Euler 208

A robot moves in a series of one-fifth circular arcs ($72\degree$),
with a free choice of a clockwise or an anticlockwise arc for each step, but no turning on the spot.

One of possible closed paths of arcs starting northward is

![euler-208-25-arcs](https://projecteuler.net/resources/images/0208_robotwalk.gif?1678992055)

Given that the robot starts facing North, how many journeys of 70 arcs in length can it take that return it,
after the final arc, to its starting position? (Any arc may be traversed multiple times.)

### Idea

The picture below shows the trajectory if the robots choose to move five counterclockwise arcs of 72 degrees and return to its starting point (points `E -> A -> B -> C -> D`).

![five arcs](https://drive.google.com/thumbnail?id=1U4eZNZz0Z8LEai5qAK8XJuRK6QsboOZt&sz=w1000)

Let's find out the exact value for the sine and cosine of the 72-degree angle to help us calculate the coordinate changes for an arc. Check [math-only-math](https://www.math-only-math.com/exact-value-of-cos-72-degree.html) for the calculation method.

We find $\sin72\degree = \dfrac{\sqrt{10+2\sqrt5}}{4}$ and $\cos72\degree = \dfrac{\sqrt5 - 1}{4}$.

References:

1. [stephan-brumme](https://euler.stephan-brumme.com/208/)
2. [nayuki](https://github.com/nayuki/Project-Euler-solutions/blob/master/python/p208.py)

Stephan's algorithm is based on induction. Nayuki's algorithm is based on coordinate displacements (using the exact values for the cos and sin of the 72-degree angle) for each of the five arcs and more robust for correctness. However, the algorithm inducted from five arcs starting from the same point (4,0) on the axis with the arc radius value of 4. If the robot moves one counterclockwise arc for 72 degrees and then moves one clockwise arc like shown in the picture below, the x and y displacement would be different. Nonetheless, without a mathematical proof, for 72-degree arcs, both the two referenced algorithms can calculate correctly.

![two arcs](https://drive.google.com/thumbnail?id=1ZuFL8cm17-o9Lji1-aqti1QNNzBwW932&sz=w1000)

Also, as you will see from the Hacker Rank "Robot Walks" question below. When the angle of the arc changes, the same algorithm inducted from the 72-degree-arc scenario may not apply anymore.

```rust
let n=5; // number of arcs to make a full circle
let m=70; // number of moves
```

Complexity: Time $O(n\cdot 2^m)$, Space $O(2^m)$.

## HackerRank Robot Walks Question

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

## Idea

As mentioned above, the two algorithms referenced for "Project Euler 208" question above may not be correct for all angled arcs within `[0,360]` degrees.

We can calculate the coordinate changes with rotation matrix.

For the arcs rotating around origin, the counterclockwise [rotation matrix](https://en.wikipedia.org/wiki/Rotation_matrix) and the coordinate displacements are

$$
\begin{bmatrix}
    x' \\
    y'
\end{bmatrix}
=
\begin{bmatrix}
    \cos\theta & -\sin\theta \\
    \sin\theta & \cos\theta
\end{bmatrix}
\begin{bmatrix}
    x \\
    y
\end{bmatrix}
$$

So the new coordinates $(x',y')$ of a point $(x,y)$ are $x'=x\cos\theta-y\sin\theta$ and $y'=x\sin\theta+y\cos\theta$.
If the rotation is not about the origin (0,0), you will have to do conversion and conversion back as mentioned in this [mathematics stack exchange post](https://math.stackexchange.com/questions/2093314/rotation-matrix-of-rotation-around-a-point-other-than-the-origin). The process is not trivial.

You can also see that the coordinate displacements, namely $x'-x$ and $y'-y$, depend on the starting coordinate `x,y`.
So Nayuki's strategy for calculating the coordinate displacement is no longer correct.

1. We can maintain a state by recording the center of the arc and how many degrees the robot has rotated so far.
2. We will assume the robot starts from point (radius,0). The center of the arc will be (0,0) if the robot rotates counterclockwise.
3. With the two fields, we can calculate the coordinate for the robot with $x+radius\cdot \cos\theta$ and $y+radius\cdot \sin\theta$, where $x, y$ are the coordinates for the center of the arc.
4. If the robot switches from rotating clockwise to counterclockwise or vice versa, we can mirror the center of the arc to the new center. The robot is right in the middle of the new center and the old center. We also need to adjust the angle by adding $\pi$.
5. We implement a method for the robot to rotate.
6. To calculate the total number of possibilities, we can implement a recursive function with backtracking.

Complexity: Time $O(n\cdot 2^m)$, Space $O(1)$.

### Python

```python
from math import cos, sin, pi

RADIUS = 1


def equal_epsilon(a, b) -> bool:
    return abs(a - b) < 1e-6


class State:
    def __init__(self):
        """arc center at origin (0,0), staring point (1,0), counterclockwise rotation"""
        self.center = (0, 0)
        self.angle = 0
        self.d = 1  # direction: 1 counterclockwise, -1 clockwise

    def get_point(self):
        """ending point"""
        (x, y), a = self.center, self.angle
        return x + RADIUS * cos(a), y + RADIUS * sin(a)

    def mirror(self):
        """mirror center and update angle"""
        x1, y1 = self.get_point()
        x0, y0 = self.center
        self.center = (2 * x1 - x0, 2 * y1 - y0)  # mirror
        self.angle += pi
        self.d = -self.d

    def rotate(self, angle: float, d: int):
        if d != self.d: self.mirror()
        self.angle += angle * self.d


class RobotWalks:
    def __init__(self, n: int, m: int, K: int):
        self.n = n
        self.angle = 2 * pi / self.n
        self.m = m
        self.K = K

    def journeys(self) -> int:
        # start at (1,0)

        def helper(steps, s: State) -> int:
            res = 0
            if steps == 0:
                x, y = s.get_point()  # check whether returned to starting point (1,0)
                return 1 if equal_epsilon(x, 1) and equal_epsilon(y, 0) else 0
            # sc = copy(s)
            # try counterclockwise arc
            s.rotate(self.angle, 1)
            res += helper(steps - 1, s)
            s.rotate(-self.angle, 1)  # backtrack
            # try clockwise arc
            s.rotate(self.angle, -1)
            res += helper(steps - 1, s)
            s.rotate(-self.angle, -1)
            return res

        return helper(self.m, State()) % self.K
```

Unit Test

```python
class TestRobotWalks(TestCase):
    def setUp(self):
        self.tbt_s = State()
        self.tbt_r = RobotWalks(1, 2, 3)

    def test_state(self):
        self.assertEqual((1, 0), self.tbt_s.get_point())
        self.tbt_s.angle += pi / 6
        x, y = self.tbt_s.get_point()
        self.assertTrue(equal_epsilon(x, 0.8660254))  # cos(pi/6)
        self.assertTrue(equal_epsilon(y, 0.5))  # sin(pi/6)

    def test_state_copy(self):
        """shallow copy of state is enough"""
        sc = copy(self.tbt_s)
        sc.center = (1, 0)  # tuple immutable, assign a new tuple
        self.assertEqual((1, 0), sc.center)
        self.assertEqual((0, 0), self.tbt_s.center)

    def test_state_mirror(self):
        self.tbt_s.mirror()
        # (0,0) mirror (1,0) to (2,0)
        self.assertTrue(equal_epsilon(self.tbt_s.center[0], 2))
        self.assertTrue(equal_epsilon(self.tbt_s.center[1], 0))
        self.assertEqual(self.tbt_s.angle, pi)
        # mirror does not change the end point of the arc
        x, y = self.tbt_s.get_point()
        self.assertTrue(equal_epsilon(x, 1))
        self.assertTrue(equal_epsilon(y, 0))

    def test_walks(self):
        cases = [
            (5, 25, 1000000007, 70932),
            (2, 2, 31, 2),
            (2, 1, 31, 0),
            (2, 3, 31, 0),
            (2, 4, 31, 6),
            (3, 6, 1000000007, 8),
            (6, 7, 1000000009, 2),
            (4, 8, 1000000033, 18),
        ]
        for n, m, K, exp in cases:
            tbt = RobotWalks(n, m, K)
            self.assertEqual(exp, tbt.journeys())
```

The algorithm fails for test case `(5, 25, 1000000007, 70932)` due to precision error. Even with an epsilon of `0.2` the returned number of journeys is still less than `70932`.

I did some tweaking and found out that the major part of the precision error actually comes from the angle rotation and the `sin` and `cos` calculations.

Added a few lines as below, and with that all the unit tests above can succeed.

```python
# to reduce trigonometry error
if self.angle > 2 * pi: self.angle -= 2 * pi
if self.angle < -2 * pi: self.angle += 2 * pi

# to cut running time in half, add line below to the recursive helper
# took about 20 sec for test case (5, 25, 1000000007, 70932)
if steps == self.m: return res * 2
```

Submission Result on Hacker Rank:

1. passed about 10 of the hidden test cases
2. time exceeded for many hidden test cases
3. runtime error for less than 10 of the test cases

I am curious on what the runtime error is about and too bad that hacker rank does not even show one test case when time exceeded or the test case failed due to time exceeded.

## Summary

The algorithm above uses simulation and is based on estimation due to the use of the epsilon.

You can read Project Euler 208's discussion thread for more fun math. Eigenray@ provided some proof for some different cases of `n`.

1. n is odd or a power of 2
2. n is even but not a power of 2
3. n is a power of a prime p

sajninredoc@'s java solution on page 1 of the discussion thread should have a time complexity of $O(m\cdot n)$, and space complexity of $O(m^2)$.

It looks like the question might be solvable with graph theory or combinatorics (may need further proof), but I did not notice any generic solution for all `n` values. If we have to derive the solution equation for several different cases of `n`, how many cases are there and what are the equations?

I am not sure whether a generic algorithm (with or without simulation/estimation) is possible for all `n` values with a time complexity less than exponential. Any comment or suggestion is welcome here.
