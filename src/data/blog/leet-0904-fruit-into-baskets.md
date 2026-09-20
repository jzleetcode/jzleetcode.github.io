---
author: JZ
pubDatetime: 2026-09-14T10:00:00Z
modDatetime: 2026-09-14T10:00:00Z
title: LeetCode 904 Fruit Into Baskets
featured: false
tags:
  - a-sliding-window
  - a-hash
description:
  "Solutions for LeetCode 904, medium, tags: array, hash table, sliding window."
---

## Table of contents

## Description

Question Links: [LeetCode 904](https://leetcode.com/problems/fruit-into-baskets/description/)

You are visiting a farm that has a single row of fruit trees arranged from left to right. The trees are represented by an integer array `fruits` where `fruits[i]` is the type of fruit the `i`th tree produces.

You want to collect as much fruit as possible. However, the owner has some strict rules that you must follow:

- You only have **two baskets**, and each basket can only hold a **single type** of fruit. There is no limit on the amount of fruit each basket can hold.
- Starting from any tree of your choice, you must pick **exactly one fruit** from **every** tree (including the start tree) while moving to the right. The picked fruits must fit in one of your baskets.
- Once you reach a tree with fruit that cannot fit in your baskets, you must stop.

Return _the maximum number of fruits you can pick_.

```
Example 1:

Input: fruits = [1,2,1]
Output: 3
Explanation: We can pick from all 3 trees.

Example 2:

Input: fruits = [0,1,2,2]
Output: 3
Explanation: We can pick from trees [1,2,2].
If we started at tree 0, we would only pick from trees [0,1].

Example 3:

Input: fruits = [1,2,3,2,2]
Output: 4
Explanation: We can pick from trees [2,3,2,2].
If we started at tree 0, we would only pick from trees [1,2].
```

**Constraints:**

- `1 <= fruits.length <= 10^5`
- `0 <= fruits[i] < fruits.length`

## Idea 1: Sliding Window + Hash Map

The problem reduces to: **find the longest subarray containing at most 2 distinct values.**

We maintain a sliding window `[left, right]` and a hash map counting each fruit type in the window. Expand `right` one step at a time; whenever the map has more than 2 keys, shrink `left` until we're back to 2 types.

```
fruits:  [1, 2, 3, 2, 2]

step 1:  [1]              window={1:1}           len=1
step 2:  [1, 2]           window={1:1, 2:1}      len=2
step 3:  [1, 2, 3]        window={1:1, 2:1, 3:1} → 3 types! shrink left
         [2, 3]           window={2:1, 3:1}       len=2
step 4:  [2, 3, 2]        window={2:2, 3:1}      len=3
step 5:  [2, 3, 2, 2]     window={2:3, 3:1}      len=4  ← max
```

Each element enters and exits the window at most once, so the total work is $O(n)$.

Complexity: Time $O(n)$, Space $O(1)$ — the map holds at most 3 keys.

### Java

```java []
// lc 904, sliding window + HashMap. O(n) time, O(1) space (at most 3 keys in map).
public static int totalFruit(int[] fruits) {
    Map<Integer, Integer> count = new HashMap<>();
    int left = 0, res = 0;
    for (int right = 0; right < fruits.length; right++) { // O(n), each element enters window once
        count.merge(fruits[right], 1, Integer::sum);
        while (count.size() > 2) {                        // shrink left until at most 2 types
            int lf = fruits[left];
            count.merge(lf, -1, Integer::sum);
            if (count.get(lf) == 0) count.remove(lf);
            left++;                                        // O(n) total, each element exits once
        }
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

```python []
# lc 904, sliding window + hash map, O(n) time, O(1) space (at most 3 keys).
class Solution:
    def totalFruit(self, fruits: list[int]) -> int:
        cnt, left, res = defaultdict(int), 0, 0
        for right, f in enumerate(fruits):  # O(n), each element enters/exits window once
            cnt[f] += 1
            while len(cnt) > 2:             # shrink until at most 2 types
                lf = fruits[left]
                cnt[lf] -= 1
                if cnt[lf] == 0:
                    del cnt[lf]
                left += 1
            res = max(res, right - left + 1)
        return res
```

```cpp []
// lc 904, sliding window + unordered_map. O(n) time, O(1) space (at most 3 keys).
int totalFruit(const vector<int>& fruits) {
    unordered_map<int, int> cnt;
    int res = 0, left = 0;
    for (int right = 0; right < (int)fruits.size(); ++right) {
        cnt[fruits[right]]++;
        while ((int)cnt.size() > 2) {
            if (--cnt[fruits[left]] == 0) cnt.erase(fruits[left]);
            left++;
        }
        res = max(res, right - left + 1);
    }
    return res;
}
```

```rust []
// lc 904, sliding window + HashMap. O(n) time, O(1) space (at most 3 keys).
pub fn total_fruit(fruits: Vec<i32>) -> i32 {
    let mut count: HashMap<i32, i32> = HashMap::new();
    let (mut left, mut ans) = (0, 0);
    for right in 0..fruits.len() {
        *count.entry(fruits[right]).or_insert(0) += 1;
        while count.len() > 2 {
            let lf = fruits[left];
            let c = count.get_mut(&lf).unwrap();
            *c -= 1;
            if *c == 0 { count.remove(&lf); }
            left += 1;
        }
        ans = ans.max(right - left + 1);
    }
    ans as i32
}
```

## Idea 2: Track Last Two Types

Instead of a hash map, we can track exactly which two fruit types are in the window (`a` = older, `b` = most recent) and how long the latest consecutive run of `b` is (`cntB`).

- If the current fruit is `a` or `b`, extend the window.
- If it's a **third** type, the window resets to `cntB + 1`: the consecutive tail of `b` plus this new fruit.
- Whenever the fruit differs from `b`, rotate: `a ← b`, `b ← current`.

```
fruits:  [1, 1, 1, 1, 2, 3, 3, 3]
          a=-1 b=-1

i=0  f=1  cur=1  cntB=1  a=-1 b=1
i=1  f=1  cur=2  cntB=2  a=-1 b=1
i=2  f=1  cur=3  cntB=3  a=-1 b=1
i=3  f=1  cur=4  cntB=4  a=-1 b=1
i=4  f=2  cur=5  cntB=1  a=1  b=2       ← still 2 types, extend
i=5  f=3  cur=2  cntB=1  a=2  b=3       ← 3rd type! reset to cntB(=1)+1=2
i=6  f=3  cur=3  cntB=2  a=2  b=3
i=7  f=3  cur=4  cntB=3  a=2  b=3

max = 5 (at i=4)
```

Complexity: Time $O(n)$, Space $O(1)$ — only a few integer variables.

### Java

```java []
// lc 904, track last two types. O(n) time, O(1) space.
public static int totalFruit2(int[] fruits) {
    int a = -1, b = -1;         // a: older basket, b: most recent basket
    int lastRun = 0;            // consecutive run length of same fruit ending at i-1
    int cur = 0, res = 0;
    for (int i = 0; i < fruits.length; i++) {          // O(n), single pass
        if (fruits[i] == a || fruits[i] == b) cur++;
        else cur = lastRun + 1;                        // 3rd type: reset window
        lastRun = (i > 0 && fruits[i] == fruits[i - 1]) ? lastRun + 1 : 1;
        if (fruits[i] != b) { a = b; b = fruits[i]; } // rotate baskets
        res = Math.max(res, cur);
    }
    return res;
}
```

```python []
# lc 904, track last two types, O(n) time, O(1) space.
class Solution2:
    def totalFruit(self, fruits: list[int]) -> int:
        res = cur = count_b = 0
        a = b = -1
        for f in fruits:
            if f == a or f == b:
                cur += 1
            else:
                cur = count_b + 1  # reset: consecutive run of b + new fruit
            if f == b:
                count_b += 1
            else:
                count_b = 1
                a, b = b, f
            res = max(res, cur)
        return res
```

```cpp []
// lc 904, track last two types. O(n) time, O(1) space.
int totalFruit2(const vector<int>& fruits) {
    int a = -1, b = -1, cntB = 0, cur = 0, res = 0;
    for (int f : fruits) {
        if (f == a || f == b) cur++;
        else cur = cntB + 1;           // 3rd type: reset window
        if (f == b) { cntB++; }
        else { cntB = 1; a = b; b = f; }
        res = max(res, cur);
    }
    return res;
}
```

```rust []
// lc 904, track last two types. O(n) time, O(1) space.
pub fn total_fruit2(fruits: Vec<i32>) -> i32 {
    let (mut last, mut second) = (-1, -1);
    let (mut last_count, mut cur, mut ans) = (0i32, 0i32, 0i32);
    for &f in &fruits {
        if f == last || f == second { cur += 1; }
        else { cur = last_count + 1; }
        if f == last { last_count += 1; }
        else { last_count = 1; second = last; last = f; }
        ans = ans.max(cur);
    }
    ans
}
```
