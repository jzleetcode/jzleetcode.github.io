---
author: JZ
pubDatetime: 2026-06-12T10:07:00Z
modDatetime: 2026-06-12T10:07:00Z
title: LeetCode 380 Insert Delete GetRandom O(1)
featured: true
tags:
  - a-hash
  - a-array
  - a-design
description:
  "Solutions for LeetCode 380, medium, tags: array, hash table, math, design, randomized."
---

## Table of contents

## Description

Question Links: [LeetCode 380](https://leetcode.com/problems/insert-delete-getrandom-o1/description/)

Implement the `RandomizedSet` class:

- `RandomizedSet()` Initializes the RandomizedSet object.
- `bool insert(int val)` Inserts an item `val` into the set if not present. Returns `true` if the item was not present, `false` otherwise.
- `bool remove(int val)` Removes an item `val` from the set if present. Returns `true` if the item was present, `false` otherwise.
- `int getRandom()` Returns a random element from the current set of elements (it's guaranteed that at least one element exists when this method is called). Each element must have the same **probability** of being returned.

You must implement the functions of the class such that each function works in **average O(1)** time complexity.

```
Example 1:

Input
["RandomizedSet", "insert", "remove", "insert", "getRandom", "remove", "insert", "getRandom"]
[[], [1], [2], [2], [], [1], [2], []]
Output
[null, true, false, true, 2, true, false, 2]

Explanation
RandomizedSet randomizedSet = new RandomizedSet();
randomizedSet.insert(1); // Inserts 1 to the set. Returns true as 1 was inserted successfully.
randomizedSet.remove(2); // Returns false as 2 does not exist in the set.
randomizedSet.insert(2); // Inserts 2 to the set, returns true. Set now contains [1,2].
randomizedSet.getRandom(); // getRandom() should return either 1 or 2 randomly.
randomizedSet.remove(1); // Removes 1 from the set, returns true. Set now contains [2].
randomizedSet.insert(2); // 2 was already in the set, so return false.
randomizedSet.getRandom(); // Since 2 is the only number in the set, getRandom() will always return 2.
```

**Constraints:**

- $-2^{31} \leq val \leq 2^{31} - 1$
- At most $2 \times 10^5$ calls will be made to `insert`, `remove`, and `getRandom`.
- There will be at least one element in the data structure when `getRandom` is called.

## Solution

### Idea

The key insight is that we need O(1) for three different operations:

1. **insert** — checking membership and adding: use a **hash map**.
2. **remove** — finding and removing: hash map gives O(1) lookup, but we also need O(1) removal from the collection used by `getRandom`.
3. **getRandom** — uniform random access by index: use a **dynamic array** (ArrayList/Vec).

The trick for O(1) removal from the array is to **swap the element to remove with the last element**, then pop the last. The hash map stores `val -> index` so we can locate any element in the array instantly.

```
Before remove(val=3):

  Array:   [5, 3, 8, 7]     Map: {5:0, 3:1, 8:2, 7:3}
                ^
  Step 1: swap with last
  Array:   [5, 7, 8, 7]     Map: {5:0, 7:1, 8:2, ...}
  Step 2: pop last, remove from map
  Array:   [5, 7, 8]        Map: {5:0, 7:1, 8:2}
```

Complexity: Time $O(1)$ average for all operations, Space $O(n)$.

#### Java

```java []
class RandomizedSet {
    ArrayList<Integer> nums;
    HashMap<Integer, Integer> valIndex; // val -> index in nums
    Random rand;

    public RandomizedSet() {
        nums = new ArrayList<>();
        valIndex = new HashMap<>();
        rand = new Random();
    }

    public boolean insert(int val) {
        if (valIndex.containsKey(val)) return false; // O(1) lookup
        valIndex.put(val, nums.size());
        nums.add(val); // O(1) amortized append
        return true;
    }

    public boolean remove(int val) {
        if (!valIndex.containsKey(val)) return false; // O(1) lookup
        int i = valIndex.get(val);
        if (i < nums.size() - 1) { // swap with last, O(1)
            int last = nums.get(nums.size() - 1);
            nums.set(i, last);
            valIndex.put(last, i);
        }
        valIndex.remove(val);
        nums.remove(nums.size() - 1); // O(1) pop from end
        return true;
    }

    public int getRandom() {
        return nums.get(rand.nextInt(nums.size())); // O(1) random index
    }
}
```

#### Python

```python []
class RandomizedSet:

    def __init__(self):
        self.vals = []
        self.val_index = {}

    def insert(self, val: int) -> bool:
        if val in self.val_index:  # O(1) hash lookup
            return False
        self.val_index[val] = len(self.vals)
        self.vals.append(val)  # O(1) amortized append
        return True

    def remove(self, val: int) -> bool:
        if val not in self.val_index:  # O(1) hash lookup
            return False
        i = self.val_index[val]
        last = self.vals[-1]
        self.vals[i] = last  # O(1) swap last into removed slot
        self.val_index[last] = i
        self.vals.pop()  # O(1) pop from end
        del self.val_index[val]
        return True

    def getRandom(self) -> int:
        return random.choice(self.vals)  # O(1) random index access
```

#### C++

```cpp []
class RandomizedSet {
    vector<int> nums;
    unordered_map<int, int> valToIdx; // val -> index in nums

public:
    RandomizedSet() {}

    bool insert(int val) {
        if (valToIdx.count(val)) return false; // O(1) lookup
        valToIdx[val] = nums.size();
        nums.push_back(val); // O(1) amortized
        return true;
    }

    bool remove(int val) {
        if (!valToIdx.count(val)) return false; // O(1) lookup
        int idx = valToIdx[val];
        int last = nums.back();
        nums[idx] = last;         // O(1) swap with last
        valToIdx[last] = idx;
        nums.pop_back();          // O(1) pop
        valToIdx.erase(val);
        return true;
    }

    int getRandom() {
        return nums[rand() % nums.size()]; // O(1)
    }
};
```

#### Rust

```rust []
use rand::Rng;
use std::collections::HashMap;

struct RandomizedSet {
    vals: Vec<i32>,
    val_index: HashMap<i32, usize>,
}

impl RandomizedSet {
    fn new() -> Self {
        Self { vals: Vec::new(), val_index: HashMap::new() }
    }

    fn insert(&mut self, val: i32) -> bool {
        if self.val_index.contains_key(&val) { // O(1) lookup
            return false;
        }
        self.val_index.insert(val, self.vals.len());
        self.vals.push(val); // O(1) amortized
        true
    }

    fn remove(&mut self, val: i32) -> bool {
        if let Some(&idx) = self.val_index.get(&val) { // O(1) lookup
            let last = *self.vals.last().unwrap();
            self.vals[idx] = last;       // O(1) swap with last
            self.val_index.insert(last, idx);
            self.vals.pop();             // O(1) pop
            self.val_index.remove(&val);
            true
        } else {
            false
        }
    }

    fn get_random(&self) -> i32 {
        let mut rng = rand::thread_rng();
        let idx = rng.gen_range(0..self.vals.len()); // O(1)
        self.vals[idx]
    }
}
```
