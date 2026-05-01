---
author: JZ
pubDatetime: 2026-03-21T12:00:00Z
modDatetime: 2026-03-21T12:00:00Z
title: LeetCode 1298 Maximum Candies You Can Get from Boxes
featured: false
tags:
  - a-array
  - a-bfs
  - a-graph
  - c-airbnb
description:
  "Solutions for LeetCode 1298, hard, tags: array, breadth-first search, graph."
---

## Table of contents

## Description

Question Links: [LeetCode 1298](https://leetcode.com/problems/maximum-candies-you-can-get-from-boxes/description/)

Given `n` boxes, each box `i` has:

- `status[i]`: `1` if the box is open, `0` if closed.
- `candies[i]`: number of candies inside.
- `keys[i]`: list of box indices whose keys are inside box `i`.
- `containedBoxes[i]`: list of box indices contained inside box `i`.
- `initialBoxes`: list of boxes you start with.

You can open a box if you have it **and** it is open (status 1) or you have collected a key for it. When you open a box, you collect its candies, take all its keys, and take all contained boxes. Return the maximum total number of candies you can get.

```
Example 1:

Input: status = [1,0,1,0], candies = [7,5,4,100], keys = [[],[],[1],[]],
       containedBoxes = [[1,2],[3],[],[]], initialBoxes = [0]
Output: 16
Explanation: Open box 0 → 7 candies, get boxes 1,2.
  Open box 2 → 4 candies, get key to box 1.
  Open box 1 → 5 candies, get box 3 (no key, stays closed).
  Total = 7 + 4 + 5 = 16.

Example 2:

Input: status = [1,0,0,0,0,0], candies = [1,1,1,1,1,1],
       keys = [[1,2,3,4,5],[],[],[],[],[]],
       containedBoxes = [[1,2,3,4,5],[],[],[],[],[]], initialBoxes = [0]
Output: 6
```

**Constraints:**

- `1 <= status.length <= 1000`
- `status.length == candies.length == keys.length == containedBoxes.length`
- `status[i]` is either `0` or `1`
- `1 <= candies[i] <= 1000`
- `0 <= keys[i].length <= status.length`
- `0 <= keys[i][j] < status.length`
- All values of `keys[i]` are unique.
- `0 <= containedBoxes[i].length <= status.length`
- `0 <= containedBoxes[i][j] < status.length`
- All values of `containedBoxes[i]` are unique.
- Each box is contained in at most one box.
- `0 <= initialBoxes.length <= status.length`
- `0 <= initialBoxes[i] < status.length`

## Idea

Model the problem as a BFS. A box becomes "openable" when two conditions are simultaneously met: (1) we possess the box, and (2) we have its key (or it started open). Track three boolean arrays:

- `has_box[i]` — we possess box `i`.
- `has_key[i]` — we can open box `i` (initialized from `status`).
- `opened[i]` — box `i` has already been processed.

Seed the queue with initial boxes that are already open. When processing a box, collect its candies, then:

1. **Process keys**: for each key `k`, mark `has_key[k]`. If we already possess box `k` but haven't opened it, enqueue it.
2. **Process contained boxes**: for each box `b`, mark `has_box[b]`. If we have the key for `b` but haven't opened it, enqueue it.

```
has_key = status[:]     ← open boxes need no key
has_box, opened = [F]*n

for b in initialBoxes:
  has_box[b] = T
  if has_key[b]: enqueue(b), opened[b] = T

while queue not empty:
  box = dequeue()
  res += candies[box]
  for k in keys[box]:           ← new keys
    if not has_key[k]:
      has_key[k] = T
      if has_box[k] and not opened[k]: enqueue(k)
  for b in containedBoxes[box]: ← new boxes
    has_box[b] = T
    if has_key[b] and not opened[b]: enqueue(b)
```

Each box is enqueued at most once (`opened` guard). The total work iterating over `keys[box]` and `containedBoxes[box]` across all opened boxes can be $O(n^2)$ because the problem does not guarantee that each key appears in only one box.

Complexity: Time $O(n^2)$, Space $O(n)$.

### Java

```java
// BFS, n^2 time, n space.
public static int maxCandies(
        int[] status, int[] candies, int[][] keys,
        int[][] containedBoxes, int[] initialBoxes) {
    int n = status.length;
    boolean[] hasBox = new boolean[n];
    boolean[] opened = new boolean[n];
    boolean[] hasKey = new boolean[n];
    for (int i = 0; i < n; i++) hasKey[i] = status[i] == 1;
    int res = 0;
    Queue<Integer> q = new ArrayDeque<>();
    for (int b : initialBoxes) {
        hasBox[b] = true;
        if (hasKey[b]) {
            opened[b] = true;
            q.add(b);
        }
    }
    while (!q.isEmpty()) {
        int box = q.poll();
        res += candies[box];
        for (int k : keys[box]) {
            if (!hasKey[k]) {
                hasKey[k] = true;
                if (hasBox[k] && !opened[k]) {
                    opened[k] = true;
                    q.add(k);
                }
            }
        }
        for (int b : containedBoxes[box]) {
            hasBox[b] = true;
            if (!opened[b] && hasKey[b]) {
                opened[b] = true;
                q.add(b);
            }
        }
    }
    return res;
}
```

### Python

```python
class Solution:
    """BFS. O(n^2) time (keys can repeat across boxes), O(n) space."""

    def maxCandies(self, status, candies, keys, containedBoxes, initialBoxes):
        n = len(status)
        has_box = [False] * n
        opened = [False] * n
        has_key = list(status)
        res = 0
        q = deque()
        for b in initialBoxes:
            has_box[b] = True
            if has_key[b]:
                q.append(b)
                opened[b] = True
        while q:
            box = q.popleft()
            res += candies[box]
            for k in keys[box]:
                if not has_key[k]:
                    has_key[k] = True
                    if has_box[k] and not opened[k]:
                        opened[k] = True
                        q.append(k)
            for b in containedBoxes[box]:
                has_box[b] = True
                if not opened[b] and has_key[b]:
                    opened[b] = True
                    q.append(b)
        return res
```

### C++

```cpp
// lc 1298, BFS, n^2 time, n space.
int maxCandies(vector<int> &status, vector<int> &candies,
               vector<vector<int>> &keys, vector<vector<int>> &containedBoxes,
               vector<int> &initialBoxes) {
    int n = static_cast<int>(status.size());
    vector<bool> has_box(n, false);
    vector<bool> opened(n, false);
    vector<int> has_key = status;
    int res = 0;
    queue<int> q;
    for (int b : initialBoxes) {
        has_box[b] = true;
        if (has_key[b]) {
            q.push(b);
            opened[b] = true;
        }
    }
    while (!q.empty()) {
        int box = q.front();
        q.pop();
        res += candies[box];
        for (int k : keys[box]) {
            if (!has_key[k]) {
                has_key[k] = 1;
                if (has_box[k] && !opened[k]) {
                    opened[k] = true;
                    q.push(k);
                }
            }
        }
        for (int b : containedBoxes[box]) {
            has_box[b] = true;
            if (!opened[b] && has_key[b]) {
                opened[b] = true;
                q.push(b);
            }
        }
    }
    return res;
}
```

### Rust

```rust
// lc 1298, BFS, O(n^2) time, O(n) space.
pub fn max_candies(
    status: Vec<i32>, candies: Vec<i32>, keys: Vec<Vec<i32>>,
    contained_boxes: Vec<Vec<i32>>, initial_boxes: Vec<i32>,
) -> i32 {
    let n = status.len();
    let mut has_box = vec![false; n];
    let mut opened = vec![false; n];
    let mut has_key: Vec<bool> = status.iter().map(|&s| s == 1).collect();
    let mut res = 0;
    let mut q = VecDeque::new();
    for &b in &initial_boxes {
        let b = b as usize;
        has_box[b] = true;
        if has_key[b] {
            q.push_back(b);
            opened[b] = true;
        }
    }
    while let Some(box_id) = q.pop_front() {
        res += candies[box_id];
        for &k in &keys[box_id] {
            let k = k as usize;
            if !has_key[k] {
                has_key[k] = true;
                if has_box[k] && !opened[k] {
                    opened[k] = true;
                    q.push_back(k);
                }
            }
        }
        for &b in &contained_boxes[box_id] {
            let b = b as usize;
            has_box[b] = true;
            if !opened[b] && has_key[b] {
                opened[b] = true;
                q.push_back(b);
            }
        }
    }
    res
}
```
