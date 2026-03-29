---
author: JZ
pubDatetime: 2026-03-21T10:41:00Z
modDatetime: 2026-03-21T10:41:00Z
title: LeetCode 1235 Maximum Profit in Job Scheduling
featured: true
tags:
  - a-array
  - a-binary-search
  - a-dp
  - a-sorting
  - c-airbnb
description:
  "Solutions for LeetCode 1235, hard, tags: array, binary search, dynamic programming, sorting."
---

## Table of contents

## Description

We have `n` jobs, where every job is scheduled to be done from `startTime[i]` to `endTime[i]`, obtaining a profit of `profit[i]`.

You're given the `startTime`, `endTime` and `profit` arrays, return the maximum profit you can take such that there are no two jobs in the subset with overlapping time range.

If you choose a job that ends at time `X` you will be able to start another job that starts at time `X`.

```
Example 1:

Input: startTime = [1,2,3,3], endTime = [3,4,5,6], profit = [50,10,40,70]
Output: 120
Explanation: The subset chosen is the first and fourth job.
Time range [1-3]+[3-6] , we get profit of 120 = 50 + 70.

Example 2:

Input: startTime = [1,2,3,4,6], endTime = [3,5,10,6,9], profit = [20,20,100,70,60]
Output: 150
Explanation: The subset chosen is the first, fourth and fifth job.
Profit obtained 150 = 20 + 70 + 60.

Example 3:

Input: startTime = [1,1,1], endTime = [2,3,4], profit = [5,6,4]
Output: 6
```

**Constraints:**

-   `1 <= startTime.length == endTime.length == profit.length <= 5 * 10^4`
-   `1 <= startTime[i] < endTime[i] <= 10^9`
-   `1 <= profit[i] <= 10^4`

## Idea1

Sort jobs by end time. Maintain a sorted map (TreeMap/SortedDict/BTreeMap/std::map) from `endTime` to `maxProfit`. Initialize with a sentinel `{0: 0}`.

For each job `(s, e, p)`, use a floor query (largest key $\le s$) to find the best compatible previous profit. Add the current job's profit. Only insert into the map if the new total exceeds the current global maximum (last entry in the map). This avoids polluting the map with suboptimal states.

```
Jobs sorted by end: [(s1,e1,p1), (s2,e2,p2), ...]
Map: {0: 0}  (sentinel)

For each (s, e, p):
  prev_profit = map.floor(s).value    ← best profit ending at or before s
  cur = prev_profit + p
  if cur > map.last().value:           ← beats current global max?
    map[e] = cur
```

The key insight: because jobs are processed in end-time order and we only insert when the profit is strictly greater than the current best, the map values are strictly increasing. This means `map.last()` always holds the global optimum, and `floor(s)` correctly finds the best non-overlapping prefix.

Complexity: Time $O(n \log n)$, Space $O(n)$.

### Java

```java
// 53ms, 54.89mb. treemap, nlgn, n.
public int jobScheduling(int[] startTime, int[] endTime, int[] profit) {
    int len = startTime.length;
    int[][] mi = new int[len][3]; // meeting info
    for (int i = 0; i < len; i++)
        mi[i] = new int[]{startTime[i], endTime[i], profit[i]};

    Arrays.sort(mi, Comparator.comparingInt(a -> a[1])); // sort by end time
    TreeMap<Integer, Integer> endTp = new TreeMap<>(); // endTime, total profit, must declare as treemap
    endTp.put(0, 0); // dummy job end at 0, profit 0, important
    for (int[] i : mi) {
        int cur = endTp.floorEntry(i[0]).getValue() + i[2]; // max <= i[0]
        if (cur > endTp.lastEntry().getValue()) // max key
            endTp.put(i[1], cur); // put (endTime, profit)
    }
    return endTp.lastEntry().getValue();
}
```

### Python

```python
class Solution:
    """TreeMap/SortedDict, nlgn time, n space. 794ms, 54.9mb."""

    def jobScheduling(self, startTime: List[int], endTime: List[int], profit: List[int]) -> int:
        jobs = sorted(zip(startTime, endTime, profit), key=lambda j: j[1])
        tm = SortedDict()  # end_time:total profit
        tm[0] = 0
        for s, e, p in jobs:
            item = tm.peekitem(tm.bisect_right(s) - 1)  # floor, max key <= s
            profit = item[1] + p
            if profit > tm.peekitem()[1]: tm[e] = profit  # max key in sorted dict
        return tm.peekitem()[1]
```

### C++

```cpp
// leetcode 1235, std::map, nlgn time, n space.
int jobScheduling(vector<int> &startTime, vector<int> &endTime, vector<int> &profit) {
    const size_t n = startTime.size();
    vector<tuple<int, int, int>> jobs(n);
    for (size_t i = 0; i < n; i++)
        jobs[i] = {startTime[i], endTime[i], profit[i]};
    ranges::sort(jobs, {}, [](const auto &t) { return get<1>(t); });
    map<int, int> endProf{{0, 0}};
    for (const auto &[s, e, p] : jobs) {
        auto it = endProf.upper_bound(s);
        int np = prev(it)->second + p;
        if (np > endProf.rbegin()->second)
            endProf[e] = np;
    }
    return endProf.rbegin()->second;
}
```

### Rust

```rust
// lc 1235, BTreeMap, O(n log n) time, O(n) space.
pub fn job_scheduling(start_time: Vec<i32>, end_time: Vec<i32>, profit: Vec<i32>) -> i32 {
    let mut jobs: Vec<(i32, i32, i32)> = start_time
        .into_iter()
        .zip(end_time.into_iter().zip(profit.into_iter()))
        .map(|(s, (e, p))| (s, e, p))
        .collect();
    jobs.sort_by_key(|&(_, e, _)| e);

    let mut tm: BTreeMap<i32, i32> = BTreeMap::new();
    tm.insert(0, 0);

    for (s, e, p) in jobs {
        let base = tm.range(..=s).next_back().map(|(_, &v)| v).unwrap_or(0);
        let new_profit = base + p;
        let max_so_far = tm.iter().next_back().map(|(_, &v)| v).unwrap_or(0);
        if new_profit > max_so_far {
            tm.insert(e, new_profit);
        }
    }

    *tm.iter().next_back().unwrap().1
}
```

## Idea2

Sort jobs by end time. Use a `dp[]` array where `dp[i]` = max profit considering the first `i` jobs (1-indexed). For each job `i`, binary search (bisect_right/upper_bound) on the `ends` array to find the latest job `j` whose end time $\le$ current start time. Then:

$$dp[i] = \max(dp[i-1],\ dp[j] + profit_i)$$

The two choices represent skipping job `i` (take `dp[i-1]`) or taking job `i` (add its profit to the best compatible prefix `dp[j]`).

Complexity: Time $O(n \log n)$, Space $O(n)$.

### Java

```java
// dp + binary search, nlgn time, n space.
public static int jobScheduling2(int[] startTime, int[] endTime, int[] profit) {
    int n = startTime.length;
    int[][] jobs = new int[n][3];
    for (int i = 0; i < n; i++) {
        jobs[i][0] = endTime[i];
        jobs[i][1] = startTime[i];
        jobs[i][2] = profit[i];
    }
    Arrays.sort(jobs, Comparator.comparingInt(a -> a[0]));
    int[] ends = new int[n];
    for (int i = 0; i < n; i++)
        ends[i] = jobs[i][0];
    int[] dp = new int[n + 1];
    for (int i = 1; i <= n; i++) {
        int s = jobs[i - 1][1];
        int p = jobs[i - 1][2];
        int j = bisectRight(ends, s, 0, i - 1);
        dp[i] = Math.max(dp[i - 1], dp[j] + p);
    }
    return dp[n];
}
```

### Python

```python
class Solution2:
    """DP + binary search on sorted array. nlgn time, n space."""

    def jobScheduling(self, startTime: List[int], endTime: List[int], profit: List[int]) -> int:
        jobs = sorted(zip(endTime, startTime, profit))
        n = len(jobs)
        ends = [j[0] for j in jobs]
        dp = [0] * (n + 1)  # dp[i]: max profit considering first i jobs (1-indexed)
        for i in range(1, n + 1):
            e, s, p = jobs[i - 1]
            j = bisect_right(ends, s, 0, i - 1)  # latest end <= s, search in [0, i-1)
            dp[i] = max(dp[i - 1], dp[j] + p)
        return dp[n]
```

### C++

```cpp
// dp + binary search (upper_bound), nlgn time, n space.
int jobScheduling(vector<int> &startTime, vector<int> &endTime, vector<int> &profit) {
    const int n = static_cast<int>(startTime.size());
    vector<tuple<int, int, int>> jobs(n);
    for (int i = 0; i < n; i++)
        jobs[i] = {endTime[i], startTime[i], profit[i]};
    ranges::sort(jobs);
    vector<int> ends(n);
    for (int i = 0; i < n; i++)
        ends[i] = get<0>(jobs[i]);
    vector<int> dp(n + 1);
    for (int i = 1; i <= n; i++) {
        int s = get<1>(jobs[i - 1]);
        int p = get<2>(jobs[i - 1]);
        int j = static_cast<int>(upper_bound(ends.begin(), ends.begin() + (i - 1), s) - ends.begin());
        dp[i] = max(dp[i - 1], dp[j] + p);
    }
    return dp[n];
}
```

### Rust

```rust
// lc 1235, DP + binary search, O(n log n) time, O(n) space.
pub fn job_scheduling(start_time: Vec<i32>, end_time: Vec<i32>, profit: Vec<i32>) -> i32 {
    let n = start_time.len();
    let mut jobs: Vec<(i32, i32, i32)> = end_time
        .into_iter()
        .zip(start_time.into_iter().zip(profit.into_iter()))
        .map(|(e, (s, p))| (e, s, p))
        .collect();
    jobs.sort_unstable_by_key(|&(e, _, _)| e);

    let ends: Vec<i32> = jobs.iter().map(|&(e, _, _)| e).collect();
    let mut dp = vec![0; n + 1];
    for i in 1..=n {
        let (_, s, p) = jobs[i - 1];
        let j = ends[..i - 1].partition_point(|&x| x <= s);
        dp[i] = dp[i - 1].max(dp[j] + p);
    }
    dp[n]
}
```
