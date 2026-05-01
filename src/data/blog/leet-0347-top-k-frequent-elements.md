---
author: JZ
pubDatetime: 2026-04-18T06:00:00Z
modDatetime: 2026-04-18T06:00:00Z
title: LeetCode 347 Top K Frequent Elements
featured: false
tags:
  - a-array
  - a-hash-table
  - a-heap
  - a-bucket-sort
  - a-counting
description:
  "Solutions for LeetCode 347, medium, tags: array, hash table, divide and conquer, sorting, heap, bucket sort, counting, quickselect."
---

## Table of contents

## Description

Given an integer array `nums` and an integer `k`, return the `k` most frequent elements. You may return the answer in any order.

```
Example 1:

Input: nums = [1,1,1,2,2,3], k = 2
Output: [1,2]

Example 2:

Input: nums = [1], k = 1
Output: [1]

Constraints:

1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4
k is in the range [1, the number of unique elements in the array].
It is guaranteed that the answer is unique.

Follow up: Your algorithm's time complexity must be better than O(n log n), where n is the array's size.
```

## Solution 1: Bucket Sort

### Idea

Use a frequency count, then distribute elements into buckets where the index represents the frequency. Collect results from the highest-frequency bucket downward until we have `k` elements.

```
Input: nums = [1,1,1,2,2,3], k = 2

Step 1 - Count frequencies:
  count = {1:3, 2:2, 3:1}

Step 2 - Create buckets (index = frequency, max index = n = 6):
  buckets[1] = [3]
  buckets[2] = [2]
  buckets[3] = [1]
  buckets[4..6] = []

Step 3 - Collect from highest bucket down:
  freq=6: empty
  freq=5: empty
  freq=4: empty
  freq=3: pick 1 -> result = [1]
  freq=2: pick 2 -> result = [1, 2]  <- have k=2, done!

Output: [1, 2]
```

Complexity: Time $O(n)$ — counting is $O(n)$, distributing to buckets is $O(n)$, collecting is $O(n)$. Space $O(n)$ for the count map and bucket array.

#### Java

```java []
public static int[] topKFrequentBucket(int[] nums, int k) {
    Map<Integer, Integer> count = new HashMap<>();
    for (int num : nums) count.merge(num, 1, Integer::sum); // O(n)
    @SuppressWarnings("unchecked")
    List<Integer>[] buckets = new List[nums.length + 1]; // index = frequency
    for (var entry : count.entrySet()) { // O(n) distribute
        int freq = entry.getValue();
        if (buckets[freq] == null) buckets[freq] = new ArrayList<>();
        buckets[freq].add(entry.getKey());
    }
    int[] res = new int[k];
    int idx = 0;
    for (int freq = nums.length; freq > 0 && idx < k; freq--) { // O(n) collect
        if (buckets[freq] != null) {
            for (int num : buckets[freq]) {
                res[idx++] = num;
                if (idx == k) return res;
            }
        }
    }
    return res;
}
```

#### Python

```python []
class Solution:
    def topKFrequent(self, nums: list[int], k: int) -> list[int]:
        count = Counter(nums)
        n = len(nums)
        buckets: list[list[int]] = [[] for _ in range(n + 1)]  # O(n) space
        for num, freq in count.items():  # O(n) distribute to buckets
            buckets[freq].append(num)
        res = []
        for freq in range(n, 0, -1):  # O(n) collect from highest freq
            for num in buckets[freq]:
                res.append(num)
                if len(res) == k:
                    return res
        return res
```

#### C++

```cpp []
vector<int> topKFrequent(vector<int> &nums, int k) {
    unordered_map<int, int> count;
    for (int num: nums) count[num]++; // O(n)
    int n = (int) nums.size();
    vector<vector<int>> buckets(n + 1); // index = frequency
    for (auto &[num, freq]: count) buckets[freq].push_back(num); // O(n) distribute
    vector<int> res;
    for (int freq = n; freq > 0 && (int) res.size() < k; freq--) { // O(n) collect
        for (int num: buckets[freq]) {
            res.push_back(num);
            if ((int) res.size() == k) return res;
        }
    }
    return res;
}
```

#### Rust

```rust []
pub fn top_k_frequent_bucket(nums: Vec<i32>, k: i32) -> Vec<i32> {
    let n = nums.len();
    let mut count: HashMap<i32, usize> = HashMap::new();
    for &num in &nums { // O(n)
        *count.entry(num).or_insert(0) += 1;
    }
    let mut buckets: Vec<Vec<i32>> = vec![vec![]; n + 1]; // index = frequency
    for (&num, &freq) in &count { // O(n) distribute
        buckets[freq].push(num);
    }
    let mut res = Vec::with_capacity(k as usize);
    for freq in (1..=n).rev() { // O(n) collect from highest freq
        for &num in &buckets[freq] {
            res.push(num);
            if res.len() == k as usize {
                return res;
            }
        }
    }
    res
}
```

## Solution 2: Min-Heap of Size K

### Idea

Count frequencies, then maintain a min-heap of size `k`. As we iterate through the frequency map, push each element; when the heap exceeds size `k`, pop the minimum (least frequent). After processing all elements, the heap contains the `k` most frequent.

```
Input: nums = [1,1,1,2,2,3], k = 2

Step 1 - Count: {1:3, 2:2, 3:1}

Step 2 - Process with min-heap (size limit = 2):
  push (freq=3, num=1) -> heap: [(3,1)]         size=1 <= k
  push (freq=2, num=2) -> heap: [(2,2),(3,1)]   size=2 <= k
  push (freq=1, num=3) -> heap: [(1,3),(3,1),(2,2)] size=3 > k
    pop min (1,3)      -> heap: [(2,2),(3,1)]   size=2 = k

Result: [2, 1] (order doesn't matter)
```

Complexity: Time $O(n \log k)$ — counting is $O(n)$, iterating unique elements (at most $n$) with heap operations each costing $O(\log k)$. Space $O(n)$ for the count map, $O(k)$ for the heap.

#### Java

```java []
public static int[] topKFrequentHeap(int[] nums, int k) {
    Map<Integer, Integer> count = new HashMap<>();
    for (int num : nums) count.merge(num, 1, Integer::sum); // O(n)
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1])); // min-heap by freq
    for (var entry : count.entrySet()) { // O(n log k)
        pq.offer(new int[]{entry.getKey(), entry.getValue()});
        if (pq.size() > k) pq.poll(); // evict least frequent
    }
    int[] res = new int[k];
    for (int i = 0; i < k; i++) res[i] = pq.poll()[0];
    return res;
}
```

#### Python

```python []
class Solution2:
    def topKFrequent(self, nums: list[int], k: int) -> list[int]:
        count = Counter(nums)  # O(n) time and space
        heap: list[tuple[int, int]] = []
        for num, freq in count.items():  # O(n log k): iterate n unique, each heap op log k
            heappush(heap, (freq, num))
            if len(heap) > k:
                heappop(heap)  # evict least frequent
        return [num for _, num in heap]
```

#### C++

```cpp []
vector<int> topKFrequent(vector<int> &nums, int k) {
    unordered_map<int, int> count;
    for (int num: nums) count[num]++; // O(n)
    // min-heap by frequency
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    for (auto &[num, freq]: count) { // O(n log k)
        pq.emplace(freq, num);
        if ((int) pq.size() > k) pq.pop(); // evict least frequent
    }
    vector<int> res;
    while (!pq.empty()) {
        res.push_back(pq.top().second);
        pq.pop();
    }
    return res;
}
```

#### Rust

```rust []
pub fn top_k_frequent(nums: Vec<i32>, k: i32) -> Vec<i32> {
    let k = k as usize;
    let mut count: HashMap<i32, usize> = HashMap::new();
    for &num in &nums { // O(n)
        *count.entry(num).or_insert(0) += 1;
    }
    let mut heap: BinaryHeap<Reverse<(usize, i32)>> = BinaryHeap::new(); // min-heap by freq
    for (&num, &freq) in &count { // O(n log k)
        heap.push(Reverse((freq, num)));
        if heap.len() > k {
            heap.pop(); // evict least frequent
        }
    }
    heap.into_iter().map(|Reverse((_, num))| num).collect()
}
```
