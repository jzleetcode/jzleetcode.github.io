---
author: JZ
pubDatetime: 2024-12-18T06:23:00Z
modDatetime: 2024-12-18T06:23:00Z
title: LintCode 2503 Thread Safe Counter (Concurrency)
featured: true
draft: true
tags:
  - concurrent-mutex
  - concurrent-lock
  - concurrent-semaphore
description:
  "Solutions for LintCode 2503, tags: lock, re-entrant lock."
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

We could use a lock. In Rust mutable reference is mutually exclusive, which means that it cannot coexist with any other references to the same data, no matter whether the reference is mutable or not. This avoids data racing and ensures data freshness.

We could use a simple lock or a re-entrant lock. The latter is more useful when the same thread may need to acquire the same lock multiple times. For example, recursively exploring a graph.

### Python

```python
OP_CNT = 100_000


class Counter(ABC):
    """counter ABC"""

    def __init__(self, value=0):
        self.value = value

    @abstractmethod
    def increment(self):
        pass

    @abstractmethod
    def decrement(self):
        pass


class NCounter(Counter):
    """not thread-safe"""

    def __init__(self, value: int = 0):
        super().__init__(value)

    # https://stackoverflow.com/questions/77096404/cant-create-race-condition-in-python-3-11-using-multiple-threads
    def increment(self):
        self.value += int(1)

    def decrement(self):
        self.value -= int(1)


class LCounter(Counter):
    """using lock"""

    def __init__(self, value: int = 0):
        super().__init__(value)
        self.lock = threading.Lock()

    def increment(self):
        self.lock.acquire()
        logging.debug('Acquired a lock')
        try:
            logging.debug('incrementing')
            self.value = self.value + int(1)
        finally:
            logging.debug('Releasing a lock')
            self.lock.release()

    def decrement(self):
        with self.lock:
            logging.debug('Acquired lock, decrementing')
            self.value -= int(1)


def inc_worker(c: Counter):
    """workers using counter"""

    for _ in range(OP_CNT):
        c.increment()


def dec_worker(c: Counter):
    """workers using counter"""

    for _ in range(OP_CNT):
        c.decrement()


class CCounter(Counter):
    """using Condition RLock, re-entrant lock"""

    def __init__(self, value=0):
        super().__init__(value)
        self.condition = threading.Condition()

    def increment(self):
        with self.condition:
            self.value += int(1)

    def decrement(self):
        with self.condition:
            self.value -= int(1
```

Unit Test

```python
THREAD_CNT = 10


class TestCounter(TestCase):

    def setUp(self):
        self.tbt1 = NCounter()
        self.tbt2 = LCounter()
        self.tbt3 = CCounter()

    def test_unsafe_counter(self):
        threads = [Thread(target=inc_worker, args=(self.tbt1,)) for _ in range(THREAD_CNT)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertNotEqual(self.tbt1.value, THREAD_CNT * OP_CNT)

        threads = [Thread(target=dec_worker, args=(self.tbt1,)) for _ in range(THREAD_CNT)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertNotEqual(self.tbt1.value, - THREAD_CNT * OP_CNT)

    def test_safe_counters(self):
        threads = [Thread(target=inc_worker, args=(c,)) for _ in range(THREAD_CNT)
                   for c in [self.tbt2, self.tbt3]]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(self.tbt2.value, THREAD_CNT * OP_CNT)
        self.assertEqual(self.tbt3.value, THREAD_CNT * OP_CNT)

    def test_rlock_vs_lock_timing(self):
        """python 3.12 Rlock faster 0.3 s < 0.39 s"""
        start = time.time()
        threads = [Thread(target=dec_worker, args=(self.tbt2,)) for _ in range(THREAD_CNT)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(self.tbt2.value, -THREAD_CNT * OP_CNT)
        end = time.time()
        print(end - start)

        start = time.time()
        threads = [Thread(target=dec_worker, args=(self.tbt3,)) for _ in range(THREAD_CNT)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(self.tbt3.value, - THREAD_CNT * OP_CNT)
        end = time.time()
        print(end - start)
```

## References

1. lock vs mutex vs semaphore [stackoverflow](https://stackoverflow.com/questions/2332765/what-is-the-difference-between-lock-mutex-and-semaphore)
2. re-entrant lock [stackoverflow](https://stackoverflow.com/questions/1312259/what-is-the-re-entrant-lock-and-concept-in-general)
3. re-entrant lock java 23 [doc](https://docs.oracle.com/en/java/javase/23/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
4. python 3.12 RLock [doc](https://docs.python.org/3.12/library/threading.html#threading.RLock)
5. python re-entrant lock vs lock [stackoverflow](https://stackoverflow.com/questions/22885775/what-is-the-difference-between-lock-and-rlock)
