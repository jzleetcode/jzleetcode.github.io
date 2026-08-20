---
author: JZ
pubDatetime: 2026-08-20T06:00:00Z
modDatetime: 2026-08-20T06:00:00Z
title: LeetCode 846 Hand of Straights
featured: true
tags:
  - a-array
  - a-greedy
  - a-hash-table
  - a-sorting
description:
  "Solutions for LeetCode 846, medium, tags: array, hash table, greedy, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 846](https://leetcode.com/problems/hand-of-straights/description/)

Alice has some number of cards in her hand. She wants to rearrange the cards into groups so that each group is of size `groupSize`, and consists of `groupSize` consecutive cards.

Given an integer array `hand` where `hand[i]` is the value written on the ith card and an integer `groupSize`, return `true` if she can rearrange the cards, or `false` otherwise.

```
Example 1:

Input: hand = [1,2,3,6,2,3,4,7,8], groupSize = 3
Output: true
Explanation: Alice's hand can be rearranged as [1,2,3],[2,3,4],[6,7,8]

Example 2:

Input: hand = [1,2,3,4,5], groupSize = 4
Output: false
Explanation: Alice's hand can not be rearranged into groups of 4.

Constraints:

1 <= hand.length <= 10^4
0 <= hand[i] <= 10^9
1 <= groupSize <= hand.length
```

## Solution 1: Greedy with Sorted Map

### Idea

The key insight: if we always start a group from the smallest available card, there is no choice involved — each smallest card *must* begin a group because nothing smaller can include it. We use an ordered map (TreeMap / BTreeMap / std::map) to always access the minimum efficiently.

```
hand = [1,2,3,6,2,3,4,7,8], groupSize = 3

Counts: {1:1, 2:2, 3:2, 4:1, 6:1, 7:1, 8:1}

Round 1: start=1 → need [1,2,3] → counts: {2:1, 3:1, 4:1, 6:1, 7:1, 8:1}
Round 2: start=2 → need [2,3,4] → counts: {6:1, 7:1, 8:1}
Round 3: start=6 → need [6,7,8] → counts: {} ✓
```

Complexity: Time $O(n \log n)$ — each insertion/deletion in the ordered map is $O(\log n)$, and we process each card once. Space $O(n)$ for the frequency map.

#### Java

```java []
public static boolean isNStraightHand(int[] hand, int groupSize) {
    if (hand.length % groupSize != 0) return false; // n not divisible by groupSize
    TreeMap<Integer, Integer> count = new TreeMap<>();
    for (int card : hand) count.merge(card, 1, Integer::sum); // O(n log n)
    while (!count.isEmpty()) {
        int first = count.firstKey(); // smallest card, O(log n)
        for (int i = first; i < first + groupSize; i++) {
            Integer cnt = count.get(i);
            if (cnt == null) return false; // gap found
            if (cnt == 1) count.remove(i);
            else count.put(i, cnt - 1);
        }
    }
    return true;
}
```

#### Python

```python []
class Solution:
    def isNStraightHand(self, hand: list[int], groupSize: int) -> bool:
        if len(hand) % groupSize != 0:
            return False
        count = Counter(hand)
        for start in sorted(count):  # O(n log n)
            if count[start] > 0:
                need = count[start]
                for i in range(start, start + groupSize):  # O(groupSize)
                    if count[i] < need:
                        return False
                    count[i] -= need
        return True
```

#### C++

```cpp []
bool isNStraightHand(vector<int>& hand, int groupSize) {
    if (hand.size() % groupSize != 0) return false;
    map<int, int> count;
    for (int c : hand) count[c]++;
    while (!count.empty()) {
        int start = count.begin()->first;
        for (int i = 0; i < groupSize; i++) {
            int card = start + i;
            if (count.find(card) == count.end()) return false;
            if (--count[card] == 0) count.erase(card);
        }
    }
    return true;
}
```

#### Rust

```rust []
pub fn is_n_straight_hand(hand: Vec<i32>, group_size: i32) -> bool {
    use std::collections::BTreeMap;
    let n = hand.len();
    let g = group_size as usize;
    if n % g != 0 { return false; }
    let mut counts: BTreeMap<i32, usize> = BTreeMap::new();
    for &card in &hand { *counts.entry(card).or_insert(0) += 1; }
    while let Some((&start, _)) = counts.iter().next() {
        for i in 0..group_size {
            let key = start + i;
            match counts.get_mut(&key) {
                Some(cnt) if *cnt > 1 => *cnt -= 1,
                Some(cnt) if *cnt == 1 => { counts.remove(&key); }
                _ => return false,
            }
        }
    }
    true // Time O(n log n), Space O(n)
}
```

## Solution 2: Sort + HashMap (Min-Heap variant)

### Idea

An alternative uses a min-heap (or simply sorted iteration) to always process the smallest card first, combined with a HashMap for O(1) count lookups. The min-heap variant enforces an invariant: if a card's count reaches zero but it isn't the heap minimum, the arrangement is invalid (a "hole" in an open group).

```
heap = [1,2,3,4,6,7,8], counts from above

pop-style iteration:
  peek 1: form [1,2,3], count[1]→0, pop 1
  peek 2: form [2,3,4], count[2]→0, pop 2, count[3]→0, pop 3, count[4]→0, pop 4
  peek 6: form [6,7,8], count[6]→0, pop 6, count[7]→0, pop 7, count[8]→0, pop 8
  heap empty → true
```

Complexity: Time $O(n \log n)$ — heap operations dominate. Space $O(n)$.

#### Java

```java []
public static boolean isNStraightHand2(int[] hand, int groupSize) {
    if (hand.length % groupSize != 0) return false;
    Arrays.sort(hand); // O(n log n)
    Map<Integer, Integer> count = new HashMap<>();
    for (int card : hand) count.merge(card, 1, Integer::sum);
    for (int card : hand) { // iterate sorted order
        if (count.getOrDefault(card, 0) == 0) continue; // already used
        for (int i = card; i < card + groupSize; i++) {
            int cnt = count.getOrDefault(i, 0);
            if (cnt == 0) return false; // gap or exhausted
            count.put(i, cnt - 1);
        }
    }
    return true;
}
```

#### Python

```python []
class Solution2:
    def isNStraightHand(self, hand: list[int], groupSize: int) -> bool:
        if len(hand) % groupSize != 0:
            return False
        count = Counter(hand)
        min_heap = list(count.keys())
        heapq.heapify(min_heap)  # O(n)
        while min_heap:
            start = min_heap[0]  # peek smallest
            for i in range(start, start + groupSize):  # O(groupSize)
                if count[i] == 0:
                    return False
                count[i] -= 1
                if count[i] == 0:
                    if i != min_heap[0]:
                        return False
                    heapq.heappop(min_heap)  # O(log n)
        return True
```

#### C++

```cpp []
bool isNStraightHand(vector<int>& hand, int groupSize) {
    if (hand.size() % groupSize != 0) return false;
    sort(hand.begin(), hand.end());
    unordered_map<int, int> count;
    for (int c : hand) count[c]++;
    for (int c : hand) {
        if (count[c] == 0) continue;
        for (int i = 0; i < groupSize; i++) {
            int card = c + i;
            if (count[card] <= 0) return false;
            count[card]--;
        }
    }
    return true;
}
```

#### Rust

```rust []
pub fn is_n_straight_hand_heap(hand: Vec<i32>, group_size: i32) -> bool {
    use std::collections::HashMap;
    let n = hand.len();
    let g = group_size as usize;
    if n % g != 0 { return false; }
    let mut sorted = hand;
    sorted.sort_unstable();
    let mut counts: HashMap<i32, usize> = HashMap::new();
    for &card in &sorted { *counts.entry(card).or_insert(0) += 1; }
    for &card in &sorted {
        if *counts.get(&card).unwrap_or(&0) == 0 { continue; }
        for i in 0..group_size {
            let key = card + i;
            match counts.get_mut(&key) {
                Some(cnt) if *cnt > 0 => *cnt -= 1,
                _ => return false,
            }
        }
    }
    true // Time O(n log n), Space O(n)
}
```
