---
author: JZ
pubDatetime: 2026-06-26T06:00:00Z
modDatetime: 2026-06-26T06:00:00Z
title: LeetCode 752 Open the Lock
featured: true
tags:
  - a-bfs
  - a-graph
  - a-hash
description:
  "Solutions for LeetCode 752, medium, tags: array, hash table, string, breadth-first search."
---

## Table of contents

## Description

Question Links: [LeetCode 752](https://leetcode.com/problems/open-the-lock/description/)

You have a lock in front of you with 4 circular wheels. Each wheel has 10 slots: `'0', '1', '2', '3', '4', '5', '6', '7', '8', '9'`. The wheels can rotate freely and wrap around: for example we can turn `'9'` to be `'0'`, or `'0'` to be `'9'`. Each move consists of turning one wheel one slot.

The lock initially starts at `'0000'`, a string representing the state of the 4 wheels.

You are given a list of `deadends` dead ends, meaning if the lock displays any of these codes, the wheels of the lock will stop turning and you will be unable to open it.

Given a `target` representing the value of the wheels that will unlock the lock, return the minimum total number of turns required to open the lock, or `-1` if it is impossible.

```
Example 1:

Input: deadends = ["0201","0101","0102","1212","2002"], target = "0202"
Output: 6
Explanation: A sequence of valid moves would be
"0000" -> "1000" -> "1100" -> "1200" -> "1201" -> "1202" -> "0202".
Note that a sequence like "0000" -> "0001" -> "0002" -> "0102" -> "0202"
would be invalid, because "0102" is a deadend.

Example 2:

Input: deadends = ["8888"], target = "0009"
Output: 1
Explanation: We can turn the last wheel in reverse to move from "0000" -> "0009".

Example 3:

Input: deadends = ["8887","8889","8878","8898","8788","8988","7888","9888"], target = "8888"
Output: -1
Explanation: We cannot reach the target without getting stuck.
```

**Constraints:**

- `1 <= deadends.length <= 500`
- `deadends[i].length == 4`
- `target.length == 4`
- target will not be in the list `deadends`.
- `target` and `deadends[i]` consist of digits only.

## Idea1: BFS

Model each lock state as a node in a graph. Two nodes are connected if they differ by exactly one wheel by one slot. We want the shortest path from `"0000"` to `target`, avoiding `deadends`. This is a textbook BFS on an unweighted graph.

```
State space: 10^4 = 10,000 nodes
Each node has 4 * 2 = 8 neighbors (4 wheels x 2 directions)

       1000
        |
   0100-0000-0900
        |
       9000
  (only 4 of 8 neighbors shown)
```

Algorithm:
1. Put `deadends` into a `HashSet` for O(1) lookup.
2. If `"0000"` is a deadend, return `-1`.
3. BFS from `"0000"`, expanding by turning each of 4 wheels up or down.
4. Skip states that are deadends or already visited.
5. Return the depth when we first reach `target`.

Complexity: Time $O(10^4 \cdot 8) = O(1)$ bounded by state space. Space $O(10^4)$ for the visited set and queue.

## Idea2: Bidirectional BFS

Start BFS from both `"0000"` and `target` simultaneously. At each step, expand the **smaller** frontier. When the two frontiers meet, we have our answer. This reduces the search space significantly in practice — from $O(b^d)$ to $O(b^{d/2})$ where $b=8$ is the branching factor and $d$ is the depth.

```
Forward:   {0000} --expand--> {1000,9000,0100,...}
Backward:  {0202} --expand--> {1202,9202,0302,...}
           ... meet in the middle ...
```

Complexity: same worst-case $O(10^4)$ but much faster in practice due to reduced frontier size.

### Java

```java []
private static List<String> neighbors(String code) {
    List<String> result = new ArrayList<>(8);
    char[] arr = code.toCharArray();
    for (int i = 0; i < 4; i++) {          // O(4) digits
        char orig = arr[i];
        arr[i] = orig == '9' ? '0' : (char) (orig + 1);  // turn up
        result.add(new String(arr));
        arr[i] = orig == '0' ? '9' : (char) (orig - 1);  // turn down
        result.add(new String(arr));
        arr[i] = orig;
    }
    return result;                          // 8 neighbors total
}

// lc 752, BFS, O(10^4) time and space.
public static int openLock(String[] deadends, String target) {
    Set<String> dead = new HashSet<>(Arrays.asList(deadends));
    if (dead.contains("0000")) return -1;
    if ("0000".equals(target)) return 0;
    Queue<String> queue = new LinkedList<>();
    Set<String> visited = new HashSet<>();
    queue.offer("0000");
    visited.add("0000");
    int steps = 0;
    while (!queue.isEmpty()) {              // BFS layer by layer
        steps++;
        int size = queue.size();
        for (int i = 0; i < size; i++) {   // process one layer
            String curr = queue.poll();
            for (String next : neighbors(curr)) {  // O(8) neighbors
                if (next.equals(target)) return steps;
                if (!dead.contains(next) && visited.add(next)) {
                    queue.offer(next);
                }
            }
        }
    }
    return -1;
}

// lc 752, Bidirectional BFS, O(10^4) time and space.
public static int openLockBidirectional(String[] deadends, String target) {
    Set<String> dead = new HashSet<>(Arrays.asList(deadends));
    if (dead.contains("0000")) return -1;
    if ("0000".equals(target)) return 0;
    Set<String> beginSet = new HashSet<>(), endSet = new HashSet<>(), visited = new HashSet<>();
    beginSet.add("0000");
    endSet.add(target);
    visited.add("0000");
    visited.add(target);
    int steps = 0;
    while (!beginSet.isEmpty() && !endSet.isEmpty()) {
        if (beginSet.size() > endSet.size()) {  // expand smaller frontier
            Set<String> temp = beginSet; beginSet = endSet; endSet = temp;
        }
        Set<String> nextSet = new HashSet<>();
        steps++;
        for (String curr : beginSet) {
            for (String next : neighbors(curr)) {
                if (endSet.contains(next)) return steps;
                if (!dead.contains(next) && visited.add(next)) nextSet.add(next);
            }
        }
        beginSet = nextSet;
    }
    return -1;
}
```

```python []
# lc 752, BFS, O(10^4) time and space.
class Solution:
    def openLock(self, deadends: list[str], target: str) -> int:
        dead = set(deadends)
        if "0000" in dead:
            return -1
        if target == "0000":
            return 0
        queue = deque([("0000", 0)])
        visited = {"0000"}
        while queue:                                    # O(10^4) states max
            state, turns = queue.popleft()
            for i in range(4):                          # O(4) digits
                digit = int(state[i])
                for d in (-1, 1):                       # O(2) directions
                    new_digit = (digit + d) % 10
                    new_state = state[:i] + str(new_digit) + state[i + 1:]
                    if new_state == target:
                        return turns + 1
                    if new_state not in visited and new_state not in dead:
                        visited.add(new_state)
                        queue.append((new_state, turns + 1))
        return -1

# lc 752, Bidirectional BFS, O(10^4) time and space.
class SolutionBidirectional:
    def openLock(self, deadends: list[str], target: str) -> int:
        dead = set(deadends)
        if "0000" in dead:
            return -1
        if target == "0000":
            return 0
        front, back = {"0000"}, {target}
        visited = {"0000", target}
        turns = 0
        while front and back:
            if len(front) > len(back):              # expand smaller frontier
                front, back = back, front
            next_front = set()
            for state in front:
                for i in range(4):
                    digit = int(state[i])
                    for d in (-1, 1):
                        new_state = state[:i] + str((digit + d) % 10) + state[i + 1:]
                        if new_state in back:
                            return turns + 1
                        if new_state not in visited and new_state not in dead:
                            visited.add(new_state)
                            next_front.add(new_state)
            front = next_front
            turns += 1
        return -1
```

```cpp []
// lc 752, BFS, O(10^4) time and space.
int openLock(vector<string>& deadends, string target) {
    unordered_set<string> dead(deadends.begin(), deadends.end());
    if (dead.count("0000")) return -1;
    if (target == "0000") return 0;
    unordered_set<string> visited;
    visited.insert("0000");
    queue<string> q;
    q.push("0000");
    int steps = 0;
    while (!q.empty()) {                        // BFS layer by layer
        ++steps;
        int sz = q.size();
        for (int i = 0; i < sz; ++i) {         // process one layer
            string cur = q.front(); q.pop();
            for (int j = 0; j < 4; ++j) {      // O(4) digits
                for (int d : {1, -1}) {         // O(2) directions
                    string next = cur;
                    next[j] = (cur[j] - '0' + d + 10) % 10 + '0';
                    if (next == target) return steps;
                    if (!dead.count(next) && !visited.count(next)) {
                        visited.insert(next);
                        q.push(next);
                    }
                }
            }
        }
    }
    return -1;
}

// lc 752, Bidirectional BFS, O(10^4) time and space.
int openLockBidirectional(vector<string>& deadends, string target) {
    unordered_set<string> dead(deadends.begin(), deadends.end());
    if (dead.count("0000")) return -1;
    if (target == "0000") return 0;
    unordered_set<string> front, back, visited;
    front.insert("0000"); back.insert(target);
    visited.insert("0000"); visited.insert(target);
    int steps = 0;
    while (!front.empty() && !back.empty()) {
        if (front.size() > back.size()) swap(front, back);  // expand smaller
        unordered_set<string> nextFront;
        ++steps;
        for (const string& cur : front) {
            for (int j = 0; j < 4; ++j) {
                for (int d : {1, -1}) {
                    string next = cur;
                    next[j] = (cur[j] - '0' + d + 10) % 10 + '0';
                    if (back.count(next)) return steps;
                    if (!dead.count(next) && !visited.count(next)) {
                        visited.insert(next); nextFront.insert(next);
                    }
                }
            }
        }
        front = std::move(nextFront);
    }
    return -1;
}
```

```rust []
// lc 752, BFS, O(10^4) time and space.
impl Solution {
    pub fn open_lock(deadends: Vec<String>, target: String) -> i32 {
        let dead: HashSet<String> = deadends.into_iter().collect();
        let start = "0000".to_string();
        if dead.contains(&start) { return -1; }
        if target == start { return 0; }
        let mut visited: HashSet<String> = HashSet::new();
        visited.insert(start.clone());
        let mut queue: VecDeque<(String, i32)> = VecDeque::new();
        queue.push_back((start, 0));
        while let Some((curr, steps)) = queue.pop_front() {
            for next in Self::neighbors(&curr) {       // O(8) neighbors
                if next == target { return steps + 1; }
                if !dead.contains(&next) && !visited.contains(&next) {
                    visited.insert(next.clone());
                    queue.push_back((next, steps + 1));
                }
            }
        }
        -1
    }

    fn neighbors(state: &str) -> Vec<String> {
        let digits: Vec<u8> = state.bytes().map(|b| b - b'0').collect();
        let mut result = Vec::with_capacity(8);
        for i in 0..4 {                                // O(4) digits
            let mut up = digits.clone();
            up[i] = (up[i] + 1) % 10;                 // turn up
            result.push(up.iter().map(|d| (d + b'0') as char).collect());
            let mut down = digits.clone();
            down[i] = (down[i] + 9) % 10;             // turn down (wrap)
            result.push(down.iter().map(|d| (d + b'0') as char).collect());
        }
        result
    }
}
```
