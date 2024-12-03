---
author: JZ
pubDatetime: 2024-12-01T08:22:00Z
modDatetime: 2024-12-01T10:12:00Z
title: How to Install SortedContainers in the Python Shell or With a Python Script
featured: true
tags:
  - cheatsheet-apps
description:
  "tips for installing sortedcontainers in a python shell"
---

## Table of contents

## Context

Python does not have ordered map or ordered set in the system library. Java has `TreeMap` and `TreeSet`. C++ has `map` and `set`. Thanks to [Grant Jenks](https://grantjenks.com/docs/sortedcontainers/), Python now actually has one more. The `SortedList` data structure allows duplicates and is not typically seen in other programming languages.

Check out some questions in the [sorting tag](../../tags/a-sorting/).

## Interview Platform Programming Language Versions

How to check the Python version in a Python shell? We can check it with `sys` like below.

```python
import sys
print(sys.version)

# hackerrank
3.12.4 (main, Aug  2 2024, 14:40:51) [GCC 10.2.1 20210110]
```

Platform document page for coding environments:

1. [LeetCode](https://support.leetcode.com/hc/en-us/articles/360011833974-What-are-the-environments-for-the-programming-languages), `sortedcontainers` included.
2. [HackerRank](https://candidatesupport.hackerrank.com/hc/en-us/articles/4402913877523-Execution-Environment), `sortedcontainers` not available, cannot install.
3. [CoderPad](https://coderpad.io/languages/), `sortedcontainers` included.
4. [CodeInterview](https://codeinterview.io/languages/),`sortedcontainers` not included, can install.

## How to Install `sortedcontainers` in a Python Shell or With a Python Script

You can use the following command (tested at [codeinterview.io](https://codeinterview.io/)) for Python 2 and Python 3.5+.

```python
import pip;
pip.main(['install', 'sortedcontainers'])
```

For Python 3.4, you can use the following command.

```python

import sys, subprocess;
subprocess.run([sys.executable, '-m', 'pip', 'install', '--user', 'sortedcontainers'])
# remove --user if running from a virtual environment
```

You should see the following output in `stdout`.

```shell
WARNING: pip is being invoked by an old script wrapper. This will fail in a future version of pip.
Please see https://github.com/pypa/pip/issues/5599 for advice on fixing the underlying issue.
To avoid this problem you can invoke Python with '-m pip' instead of running pip directly.
Collecting sortedcontainers
  Downloading sortedcontainers-2.4.0-py2.py3-none-any.whl.metadata (10 kB)
Downloading sortedcontainers-2.4.0-py2.py3-none-any.whl (29 kB)
Installing collected packages: sortedcontainers
Successfully installed sortedcontainers-2.4.0
WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable.It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning.
```

After that, you can test importing useful classes from `sortedcontainers`.

```python
from sortedcontainers import SortedList

a=SortedList()
a.add(1)
a.add(2)
print(a)
```

And you should see output below in `stdout`.

```shell
SortedList([1, 2])
```

## Reference

1. [invent with python](https://inventwithpython.com/blog/2022/08/25/how-to-run-pip-from-the-python-interactive-shell/)
