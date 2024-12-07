---
author: JZ
pubDatetime: 2024-12-05T08:22:00Z
modDatetime: 2024-12-05T10:12:00Z
title: How to Draw Circles and Arcs with Python Library Matplotlib
featured: true
tags:
  - cheatsheet-ai
description:
  "tips for matplotlib python draw arcs, robot walks, project euler 208"
---

## Table of contents

## Math Drawing and Algorithm Simulation

In article ["HackerRank Robot Walks and Project Euler 208 Solutions"](../hackerrank-robot-walks-project-euler-208/) I drew the robot trajectory (circles and arcs) with [math10](https://www.math10.com/en/geometry/geogebra/geogebra.html). The tool is pretty nice, however not as flexible and customizable as a specialized drawing library.

Python's [matplotlib](https://matplotlib.org/stable/) and [StdDraw](https://algs4.cs.princeton.edu/code/javadoc/edu/princeton/cs/algs4/StdDraw.html) from Princeton's Algorithm 4th Edition are great tools for scientific drawing and algorithm simulations.

## Drawing Robot Trajectory with Matplotlib

How to draw arcs with matplotlib? It's actually pretty straight forward.

I drew the robot trajectory arcs with python code below. We can easily use loops to simplify the drawing tasks.

```python
import numpy
import matplotlib.pyplot as plt
from matplotlib.patches import Arc
from math import pi, cos, sin

fg, ax = plt.subplots(1, 1, figsize=(8, 8))

angle = 2 * pi / 5
mirror = (2 * cos(angle), 2 * sin(angle))
arcs = [Arc((0, 0), 2, 2, angle=0, theta1=0, theta2=72, edgecolor='blue', linewidth=2),
        Arc((0, 0), 0.4, 0.4, angle=0, theta1=0, theta2=72, edgecolor='orange', linewidth=2),
        Arc((mirror[0], mirror[1]), 2, 2, angle=0, theta1=180, theta2=252, edgecolor='blue', linewidth=2)]

# Add the arc to the axes
for a in arcs:
    ax.add_patch(a)

# Set the aspect ratio of the plot to 'equal' to ensure a circular arc
ax.set_aspect('equal')
ax.set_xticks(numpy.arange(-3, 3, 0.5))
ax.set_yticks(numpy.arange(-1, 2, 0.5))

# Set the limits of the plot
ax.set_xlim(-1, 2)
ax.set_ylim(-1, 2.2)

plt.text(0.2, 0.2, '72°', size='14')
plt.text(-0.25, -0.2, '(0,0)', size='14')

plt.plot([0, 1], [0, 0], 'b-')
plt.plot([0, 2 * cos(angle)], [0, 2 * sin(angle)], 'b-')
plt.grid()
# Show the plot
fg.canvas.draw()
```

And the result image is below.

![](https://drive.google.com/thumbnail?id=1vQ6_F8n2N8CRGsD3vTTi_ElNpX3XtT2w&sz=w1000)
