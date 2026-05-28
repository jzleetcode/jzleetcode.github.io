---
author: JZ
pubDatetime: 2026-05-23T06:00:00Z
modDatetime: 2026-05-23T06:00:00Z
title: LeetCode 621 Task Scheduler
featured: false
tags:
  - a-greedy
  - a-hash
  - a-counting
description:
  "Solutions for LeetCode 621, medium, tags: array, hash table, greedy, sorting, heap, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 621](https://leetcode.com/problems/task-scheduler/description/)

You are given an array of CPU tasks, each represented by letters A to Z, and a cooling time, `n`. Each cycle or interval allows the completion of one task. Tasks can be completed in any order, but there's a constraint: identical tasks must be separated by at least `n` intervals due to cooling time.

Return the minimum number of intervals required to complete all tasks.

```
Example 1:

Input: tasks = ["A","A","A","B","B","B"], n = 2
Output: 8
Explanation: A possible sequence is: A -> B -> idle -> A -> B -> idle -> A -> B.

After completing task A, you must wait two cycles before doing A again.
The same applies to task B. In the 3rd interval, neither A nor B can be done,
so you idle. By the 4th cycle, you can do A again as 2 intervals have passed.

Example 2:

Input: tasks = ["A","C","A","B","D","B"], n = 1
Output: 6
Explanation: A possible sequence is: A -> B -> C -> D -> A -> B.

With a cooling interval of 1, you can repeat a task after just one other task.

Example 3:

Input: tasks = ["A","A","A","B","B","B"], n = 3
Output: 10
Explanation: A possible sequence is: A -> B -> idle -> idle -> A -> B -> idle -> idle -> A -> B.

There are only two types of tasks, A and B, which need to be separated by
3 intervals. This leads to idling twice between repetitions of these tasks.

Constraints:

1 <= tasks.length <= 10^4
tasks[i] is an uppercase English letter.
0 <= n <= 100
```

## Solution: Greedy / Math

### Idea

The key insight is that the answer is determined by the most frequent task(s). Imagine placing the most frequent task first, creating "frames" separated by cooling gaps.

```
Example: tasks = [A,A,A,B,B,B], n = 2

Frame view (gap length = n+1 = 3):
  A B _  |  A B _  |  A B
  frame1     frame2    last partial

nGaps = maxFreq - 1 = 2   (number of full gaps between last occurrences)
gapLen = n + 1 = 3         (each frame holds n+1 slots)
maxCnt = 2                 (both A and B have max frequency 3)

Formula result = nGaps * gapLen + maxCnt = 2 * 3 + 2 = 8
```

The formula gives the minimum intervals assuming idles are needed. But if there are many distinct tasks, they fill all idle slots and the answer is simply the total number of tasks. So the final answer is:

$$\text{result} = \max(\text{tasks.length},\ (\text{maxFreq} - 1) \times (n + 1) + \text{maxCnt})$$

Where:
- `maxFreq` = highest frequency among all tasks
- `maxCnt` = number of tasks that share that highest frequency

Complexity: Time $O(n)$ single pass, Space $O(1)$ (26-letter frequency array).

#### Java

```java []
// O(n) time, O(1) space.
public int leastInterval(char[] tasks, int n) {
    int[] count = new int[26];
    int max = 0, maxCnt = 0;
    for (char task : tasks) { // O(n)
        count[task - 'A']++;
        if (count[task - 'A'] > max) {
            max = count[task - 'A'];
            maxCnt = 1;
        } else if (count[task - 'A'] == max) maxCnt++;
    }
    int nGaps = max - 1, gapL = n + 1;
    return Math.max(tasks.length, nGaps * gapL + maxCnt);
}
```

#### Python

```python []
def leastInterval(self, tasks: List[str], n: int) -> int:
    max_v, max_cnt, counts = 0, 0, defaultdict(int)
    for t in tasks:  # O(n)
        counts[t] += 1
        if counts[t] > max_v:
            max_v = counts[t]
            max_cnt = 1
        elif counts[t] == max_v:
            max_cnt += 1
    n_gaps, gap_l = max_v - 1, n + 1
    return max(len(tasks), n_gaps * gap_l + max_cnt)
```

#### C++

```cpp []
// O(n) time, O(1) space.
int leastInterval(vector<char>& tasks, int n) {
    int count[26] = {};
    int maxFreq = 0, maxCnt = 0;
    for (char t : tasks) { // O(n)
        count[t - 'A']++;
        if (count[t - 'A'] > maxFreq) {
            maxFreq = count[t - 'A'];
            maxCnt = 1;
        } else if (count[t - 'A'] == maxFreq) {
            maxCnt++;
        }
    }
    int nGaps = maxFreq - 1;
    int gapLen = n + 1;
    return max((int)tasks.size(), nGaps * gapLen + maxCnt);
}
```

#### Rust

```rust []
/// O(n) time, O(1) space.
pub fn least_interval(tasks: Vec<char>, n: i32) -> i32 {
    let mut count = [0i32; 26];
    let mut max_freq = 0i32;
    let mut max_cnt = 0i32;
    for &t in &tasks { // O(n)
        let i = (t as u8 - b'A') as usize;
        count[i] += 1;
        if count[i] > max_freq {
            max_freq = count[i];
            max_cnt = 1;
        } else if count[i] == max_freq {
            max_cnt += 1;
        }
    }
    let n_gaps = max_freq - 1;
    let gap_len = n + 1;
    (tasks.len() as i32).max(n_gaps * gap_len + max_cnt)
}
```
