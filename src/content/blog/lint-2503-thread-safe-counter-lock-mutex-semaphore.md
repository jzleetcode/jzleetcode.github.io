---
author: JZ
pubDatetime: 2024-12-10T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: LintCode 2503 Thread Safe Counter (Concurrency)
featured: true
draft: true
tags:
  - concurrent-mutex
  - concurrent-lock
  - concurrent-semaphore
description:
  "Solutions for LintCode 2503, tags: mutex, lock, semaphore, concurrent container."
---

## Table of contents

## Description

Implement a thread-safe counter with the following methods.

-   `ThreadSafeCounter()` constructor to initialize the variable `i`.
-   `incr()` computes the result of adding one to `number` (`Main.safeCounter` in Java) by calling `increase(number)` (Main.incr()`in Java) and assigns it to the variable`i\`.
-   `decr()` calculates `number` (in Java, `Main.safeCounter`) by calling `decrease(number)` (in Java, `Main.decr()`) and assigning it to the variable `i`.
-   `get_count()` (`getCount()` in Java/C++) returns the value of the variable `i`.

`increase(number)` (in Java it is `Main.incr()`) and `decrease(number)` (in Java it is `Main.decr()`) are functions we give that will add one and subtract one respectively to the passed arguments and return the calculated result.

We will open multiple threads for the operation. Eventually we will check if you have implemented addition and subtraction correctly by calling the `get_count` (or `getCount()` in Java/C++) method, which will be called after each test case is completed.

```
Example

We will run main.py (Main.java in Java, Main.cpp in C++) to read and run your operation.

ThreadSafeCounter()
decr()
incr()
decr()
incr()
incr()

Output:
1

Explanation:
We performed 3 incr() and 2 decr() operations on i and
completed i - 1 + 1 - 1 + 1 + 1 operations on i = 0, resulting in 1.
```

## Idea


### Java


## References

1. lock vs mutex vs semaphore [stackoverflow](https://stackoverflow.com/questions/2332765/what-is-the-difference-between-lock-mutex-and-semaphore)
2. re-entrant lock [stackoverflow](https://stackoverflow.com/questions/1312259/what-is-the-re-entrant-lock-and-concept-in-general)
3. re-entrant lock java 23 [doc](https://docs.oracle.com/en/java/javase/23/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
4. python 3.12 RLock [doc](https://docs.python.org/3.12/library/threading.html#threading.RLock)
