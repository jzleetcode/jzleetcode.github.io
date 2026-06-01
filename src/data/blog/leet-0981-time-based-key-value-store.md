---
author: JZ
pubDatetime: 2026-05-27T06:00:00Z
modDatetime: 2026-05-27T06:00:00Z
title: LeetCode 981 Time Based Key-Value Store
featured: false
tags:
  - a-hash-table
  - a-binary-search
  - a-design
description:
  "Solutions for LeetCode 981, medium, tags: hash table, string, binary search, design."
---

## Table of contents

## Description

Question Links: [LeetCode 981](https://leetcode.com/problems/time-based-key-value-store/description/)

Design a time-based key-value data structure that can store multiple values for the same key at different time stamps and retrieve the key's value at a certain timestamp.

Implement the `TimeMap` class:

- `TimeMap()` Initializes the object of the data structure.
- `void set(String key, String value, int timestamp)` Stores the key `key` with the value `value` at the given time `timestamp`.
- `String get(String key, int timestamp)` Returns a value such that `set` was called previously, with `timestamp_prev <= timestamp`. If there are multiple such values, it returns the value associated with the largest `timestamp_prev`. If there are no values, it returns `""`.

```
Example 1:

Input
["TimeMap", "set", "get", "get", "set", "get"]
[[], ["foo", "bar", 1], ["foo", 1], ["foo", 3], ["foo", "bar2", 4], ["foo", 4]]
Output
[null, null, "bar", "bar", null, "bar2"]

Explanation
TimeMap timeMap = new TimeMap();
timeMap.set("foo", "bar", 1);  // store the key "foo" and value "bar" along with timestamp = 1.
timeMap.get("foo", 1);         // return "bar"
timeMap.get("foo", 3);         // return "bar", since there is no value at timestamp 3 and timestamp 2,
                               // the largest timestamp_prev is 1 so we return "bar".
timeMap.set("foo", "bar2", 4); // store the key "foo" and value "bar2" along with timestamp = 4.
timeMap.get("foo", 4);         // return "bar2"

Constraints:

1 <= key.length, value.length <= 100
key and value consist of lowercase English letters and digits.
1 <= timestamp <= 10^7
All the timestamps timestamp of set are strictly increasing.
At most 2 * 10^5 calls will be made to set and get.
```

## Solution 1: HashMap + Binary Search

### Idea

We use a hash map where each key maps to a list of `(timestamp, value)` pairs. Since the problem guarantees that `set` calls have strictly increasing timestamps for the same key, the list is always sorted by timestamp without any extra work.

For `get`, we perform a binary search (upper bound) on the timestamp list to find the largest timestamp that is `<= ` the query timestamp.

```
set("foo","bar",1)   → store["foo"] = [(1,"bar")]
set("foo","bar2",4)  → store["foo"] = [(1,"bar"), (4,"bar2")]

get("foo", 3):
  binary search for largest ts <= 3
  upper_bound gives index of first ts > 3 → index 1
  go back one → index 0 → "bar"
```

Complexity: `set` $O(1)$ amortized, `get` $O(\log n)$ where $n$ is the number of values for that key. Space $O(N)$ total entries.

#### Java

```java []
// Solution 1: HashMap + TreeMap. set O(log n), get O(log n). Space O(n).
static class TimeMap1 {
    private final Map<String, TreeMap<Integer, String>> map;

    public TimeMap1() {
        map = new HashMap<>();
    }

    public void set(String key, String value, int timestamp) {
        map.computeIfAbsent(key, k -> new TreeMap<>()).put(timestamp, value);
    }

    public String get(String key, int timestamp) {
        TreeMap<Integer, String> treeMap = map.get(key);
        if (treeMap == null) return "";
        Map.Entry<Integer, String> entry = treeMap.floorEntry(timestamp); // O(log n)
        return entry == null ? "" : entry.getValue();
    }
}
```

#### Python

```python []
class TimeMap:
    """Hash map + binary search. set: O(1), get: O(log n) time, O(n) space overall."""

    def __init__(self):
        self.store: dict[str, list[tuple[int, str]]] = defaultdict(list)

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.store[key].append((timestamp, value))  # O(1) amortized

    def get(self, key: str, timestamp: int) -> str:
        if key not in self.store:
            return ""
        vals = self.store[key]
        i = bisect_right(vals, (timestamp, chr(127)))  # O(log n)
        return vals[i - 1][1] if i > 0 else ""
```

#### C++

```cpp []
// Solution 1: unordered_map + vector + upper_bound (binary search).
// set O(1), get O(log n). Space O(n).
class TimeMap {
    unordered_map<string, vector<pair<int, string>>> store;
public:
    TimeMap() {}

    void set(string key, string value, int timestamp) {
        store[key].emplace_back(timestamp, value);
    }

    string get(string key, int timestamp) {
        auto it = store.find(key);
        if (it == store.end()) return "";
        auto &vec = it->second;
        // upper_bound finds first element with timestamp > given timestamp
        auto ub = upper_bound(vec.begin(), vec.end(), make_pair(timestamp, string(127, '\x7f')));
        if (ub == vec.begin()) return "";
        return prev(ub)->second; // O(log n)
    }
};
```

#### Rust

```rust []
// Solution 1: HashMap + Vec with partition_point. set O(1), get O(log n).
struct TimeMap {
    map: HashMap<String, Vec<(i32, String)>>,
}

impl TimeMap {
    fn new() -> Self { Self { map: HashMap::new() } }

    fn set(&mut self, key: String, value: String, timestamp: i32) {
        self.map.entry(key).or_default().push((timestamp, value)); // O(1) amortized
    }

    fn get(&self, key: String, timestamp: i32) -> String {
        match self.map.get(&key) {
            None => String::new(),
            Some(entries) => {
                // O(log n) — partition_point finds first index where ts > timestamp
                let idx = entries.partition_point(|(ts, _)| *ts <= timestamp);
                if idx == 0 { String::new() } else { entries[idx - 1].1.clone() }
            }
        }
    }
}
```

## Solution 2: HashMap + Ordered Map (TreeMap/BTreeMap)

### Idea

Instead of a flat list with manual binary search, we can use an ordered map (TreeMap in Java, `map` in C++, BTreeMap in Rust) as the inner container. This provides `floorEntry`/`upper_bound`/`range` operations directly.

The trade-off is that `set` becomes $O(\log n)$ instead of $O(1)$, since insertion into a balanced BST costs $O(\log n)$. However, the code is simpler and self-documenting.

Complexity: `set` $O(\log n)$, `get` $O(\log n)$. Space $O(N)$.

#### Java

```java []
// Solution 2: HashMap + ArrayList with manual binary search. set O(1), get O(log n).
static class TimeMap2 {
    private final Map<String, List<int[]>> timestamps;
    private final Map<String, List<String>> values;

    public TimeMap2() {
        timestamps = new HashMap<>();
        values = new HashMap<>();
    }

    public void set(String key, String value, int timestamp) {
        timestamps.computeIfAbsent(key, k -> new ArrayList<>()).add(new int[]{timestamp});
        values.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
    }

    public String get(String key, int timestamp) {
        List<int[]> ts = timestamps.get(key);
        if (ts == null || ts.isEmpty()) return "";
        int lo = 0, hi = ts.size() - 1, res = -1;
        while (lo <= hi) { // O(log n) binary search
            int mid = lo + (hi - lo) / 2;
            if (ts.get(mid)[0] <= timestamp) { res = mid; lo = mid + 1; }
            else { hi = mid - 1; }
        }
        return res == -1 ? "" : values.get(key).get(res);
    }
}
```

#### Python

```python []
class TimeMap2:
    """Hash map + linear scan from end (simpler, for small n). set: O(1), get: O(n) time."""

    def __init__(self):
        self.store: dict[str, list[tuple[int, str]]] = defaultdict(list)

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.store[key].append((timestamp, value))

    def get(self, key: str, timestamp: int) -> str:
        if key not in self.store:
            return ""
        vals = self.store[key]
        for i in range(len(vals) - 1, -1, -1):  # O(n) scan from end
            if vals[i][0] <= timestamp:
                return vals[i][1]
        return ""
```

#### C++

```cpp []
// Solution 2: unordered_map + ordered map. set O(log n), get O(log n). Space O(n).
class TimeMap2 {
    unordered_map<string, map<int, string>> store;
public:
    TimeMap2() {}

    void set(string key, string value, int timestamp) {
        store[key][timestamp] = value; // O(log n) map insert
    }

    string get(string key, int timestamp) {
        auto it = store.find(key);
        if (it == store.end()) return "";
        auto &m = it->second;
        auto ub = m.upper_bound(timestamp); // O(log n)
        if (ub == m.begin()) return "";
        return prev(ub)->second;
    }
};
```

#### Rust

```rust []
// Solution 2: HashMap + BTreeMap. set O(log n), get O(log n).
struct TimeMapBTree {
    map: HashMap<String, BTreeMap<i32, String>>,
}

impl TimeMapBTree {
    fn new() -> Self { Self { map: HashMap::new() } }

    fn set(&mut self, key: String, value: String, timestamp: i32) {
        self.map.entry(key).or_default().insert(timestamp, value); // O(log n)
    }

    fn get(&self, key: String, timestamp: i32) -> String {
        match self.map.get(&key) {
            None => String::new(),
            Some(tree) => {
                // O(log n) — range query up to and including timestamp, take last
                tree.range(..=timestamp).next_back()
                    .map(|(_, v)| v.clone())
                    .unwrap_or_default()
            }
        }
    }
}
```
