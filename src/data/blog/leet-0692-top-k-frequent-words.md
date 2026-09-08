---
author: JZ
pubDatetime: 2026-09-08T10:38:00Z
modDatetime: 2026-09-08T10:38:00Z
title: LeetCode 692 Top K Frequent Words
featured: true
tags:
  - a-hash-table
  - a-string
  - a-heap
  - a-bucket-sort
  - a-counting
description:
  "Solutions for LeetCode 692, medium, tags: hash table, string, trie, sorting, heap, bucket sort, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 692](https://leetcode.com/problems/top-k-frequent-words/description/)

Given an array of strings `words` and an integer `k`, return the `k` most frequent strings.

Return the answer sorted by the frequency from highest to lowest. Sort the words with the same frequency by their lexicographical order.

```
Example 1:

Input: words = ["i","love","leetcode","i","love","coding"], k = 2
Output: ["i","love"]
Explanation: "i" and "love" are the two most frequent words.
Note that "i" comes before "love" due to a lower alphabetical order.

Example 2:

Input: words = ["the","day","is","sunny","the","the","the","sunny","is","is"], k = 4
Output: ["the","is","sunny","day"]
Explanation: "the", "is", "sunny" and "day" are the four most frequent words,
with the number of occurrence being 4, 3, 2 and 1 respectively.

Constraints:

1 <= words.length <= 500
1 <= words[i].length <= 10
words[i] consists of lowercase English letters.
k is in the range [1, The number of unique words[i]]

Follow-up: Could you solve it in O(n log k) time and O(n) extra space?
```

## Solution 1: Heap

### Idea

Count word frequencies with a hash map, then use a max-heap ordered by (frequency descending, word ascending). Pop `k` times to get the result. For the follow-up O(n log k): use a min-heap of size `k` with a comparator that evicts the least desirable element (lower frequency, or higher lex order for ties), then reverse the result at the end.

```
Input: words = ["i","love","leetcode","i","love","coding"], k = 2

Step 1 - Count frequencies:
  count = {"i":2, "love":2, "leetcode":1, "coding":1}

Step 2 - Max-heap ordered by (-freq, word):
  push (-2,"i"), (-2,"love"), (-1,"coding"), (-1,"leetcode")

  Heap (max-heap, smallest tuple on top with negated freq):
       (-2,"i")
      /        \
  (-2,"love")  (-1,"coding")
    /
  (-1,"leetcode")

Step 3 - Pop k=2 times:
  pop (-2,"i")    -> result = ["i"]
  pop (-2,"love") -> result = ["i","love"]

Output: ["i","love"]
```

Complexity: Time $O(n + m \log m)$ where $m$ is the number of unique words — counting is $O(n)$, building the heap is $O(m \log m)$, popping $k$ times is $O(k \log m)$. For the min-heap variant: $O(n \log k)$. Space $O(n)$ for the count map.

#### Java

```java []
public static List<String> topKFrequent(String[] words, int k) {
    Map<String, Integer> freq = new HashMap<>(); // O(n) space
    for (String w : words) freq.merge(w, 1, Integer::sum); // O(n) time
    // max-heap: higher freq first; same freq -> lexicographically smaller first
    PriorityQueue<Map.Entry<String, Integer>> maxHeap = new PriorityQueue<>(
            (a, b) -> a.getValue().equals(b.getValue())
                    ? a.getKey().compareTo(b.getKey()) // O(1) lex compare (word len <= 10)
                    : b.getValue() - a.getValue()      // descending frequency
    );
    maxHeap.addAll(freq.entrySet()); // O(m log m) where m = unique words
    List<String> result = new ArrayList<>(k);
    for (int i = 0; i < k; i++) result.add(maxHeap.poll().getKey()); // O(k log m)
    return result;
}
```

#### Python

```python []
class Solution:
    def topKFrequent(self, words: list[str], k: int) -> list[str]:
        count = Counter(words)  # O(n) time and space
        heap: list[tuple[int, str]] = []
        for word, freq in count.items():  # O(n log k): iterate n unique, each heap op log k
            heappush(heap, (-freq, word))  # negate freq for max-heap behavior
        res = []
        for _ in range(k):  # O(k log n)
            res.append(heappop(heap)[1])
        return res
```

#### C++

```cpp []
vector<string> topKFrequent(vector<string> &words, int k) {
    unordered_map<string, int> count;
    for (auto &w : words) count[w]++; // O(n) frequency count
    // min-heap: lower freq on top; same freq -> reverse lex on top (evict first)
    auto cmp = [](const pair<int, string> &a, const pair<int, string> &b) {
        if (a.first != b.first) return a.first > b.first; // higher freq = higher priority (stays)
        return a.second < b.second;                        // lower lex = higher priority (stays)
    };
    priority_queue<pair<int, string>, vector<pair<int, string>>, decltype(cmp)> pq(cmp);
    for (auto &[word, freq] : count) { // O(n log k) heap maintenance
        pq.emplace(freq, word);
        if ((int) pq.size() > k) pq.pop(); // evict least important
    }
    vector<string> res(k);
    for (int i = k - 1; i >= 0; i--) { // O(k log k) pop in reverse order
        res[i] = pq.top().second;
        pq.pop();
    }
    return res;
}
```

#### Rust

```rust []
#[derive(Eq, PartialEq)]
struct WordFreq { word: String, freq: usize }

impl Ord for WordFreq {
    fn cmp(&self, other: &Self) -> Ordering {
        self.freq.cmp(&other.freq) // higher frequency wins
            .then_with(|| other.word.cmp(&self.word)) // lex smaller wins (reverse string cmp)
    }
}
impl PartialOrd for WordFreq {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

pub fn top_k_frequent(words: Vec<String>, k: i32) -> Vec<String> {
    let k = k as usize;
    let mut count: HashMap<String, usize> = HashMap::new();
    for word in &words { *count.entry(word.clone()).or_insert(0) += 1; } // O(n)
    let mut heap: BinaryHeap<WordFreq> = BinaryHeap::new(); // max-heap by (freq, reverse-lex)
    for (word, freq) in count { heap.push(WordFreq { word, freq }); } // O(m log m)
    let mut res = Vec::with_capacity(k);
    for _ in 0..k { res.push(heap.pop().unwrap().word); } // O(k log m)
    res
}
```

## Solution 2: Bucket Sort

### Idea

Count frequencies, distribute words into buckets indexed by their frequency, sort each bucket lexicographically, and collect from the highest-frequency bucket downward until we have `k` words.

```
Input: words = ["the","day","is","sunny","the","the","the","sunny","is","is"], k = 4

Step 1 - Count: {"the":4, "day":1, "is":3, "sunny":2}

Step 2 - Buckets (index = frequency):
  buckets[1] = ["day"]
  buckets[2] = ["sunny"]
  buckets[3] = ["is"]
  buckets[4] = ["the"]

Step 3 - Collect from highest bucket, sort each lex:
  freq=4: ["the"]           -> result = ["the"]
  freq=3: ["is"]            -> result = ["the","is"]
  freq=2: ["sunny"]         -> result = ["the","is","sunny"]
  freq=1: ["day"]           -> result = ["the","is","sunny","day"]  <- k=4, done!

Output: ["the","is","sunny","day"]
```

Complexity: Time $O(n)$ for counting and bucketing, $O(L \log L)$ for sorting within each bucket where $L$ is the bucket size. Space $O(n)$ for the count map and bucket array.

#### Java

```java []
public static List<String> topKFrequentBucket(String[] words, int k) {
    Map<String, Integer> freq = new HashMap<>(); // O(n) space
    for (String w : words) freq.merge(w, 1, Integer::sum); // O(n) time
    int maxFreq = Collections.max(freq.values()); // O(m)
    @SuppressWarnings("unchecked")
    List<String>[] buckets = new List[maxFreq + 1]; // index = frequency
    for (var e : freq.entrySet()) { // O(m) distribute
        int f = e.getValue();
        if (buckets[f] == null) buckets[f] = new ArrayList<>();
        buckets[f].add(e.getKey());
    }
    List<String> result = new ArrayList<>(k);
    for (int i = maxFreq; i >= 1 && result.size() < k; i--) { // collect from highest freq
        if (buckets[i] == null) continue;
        Collections.sort(buckets[i]); // O(L log L) lex sort within bucket
        for (String w : buckets[i]) {
            result.add(w);
            if (result.size() == k) break;
        }
    }
    return result;
}
```

#### Python

```python []
class Solution2:
    def topKFrequent(self, words: list[str], k: int) -> list[str]:
        count = Counter(words)  # O(n) time and space
        n = len(words)
        buckets: list[list[str]] = [[] for _ in range(n + 1)]  # O(n) space, index = frequency
        for word, freq in count.items():  # O(m) distribute, m unique words
            buckets[freq].append(word)
        res = []
        for freq in range(n, 0, -1):  # O(n) collect from highest freq
            bucket = sorted(buckets[freq])  # sort lexicographically within same frequency
            for word in bucket:
                res.append(word)
                if len(res) == k:
                    return res
        return res
```

#### C++

```cpp []
vector<string> topKFrequent(vector<string> &words, int k) {
    unordered_map<string, int> count;
    for (auto &w : words) count[w]++; // O(n) frequency count
    int n = (int) words.size();
    vector<vector<string>> buckets(n + 1); // index = frequency, O(n) space
    for (auto &[word, freq] : count) buckets[freq].push_back(word); // O(m) distribute
    vector<string> res;
    for (int freq = n; freq > 0 && (int) res.size() < k; freq--) {
        sort(buckets[freq].begin(), buckets[freq].end()); // O(L log L) lex sort per bucket
        for (auto &w : buckets[freq]) {
            res.push_back(w);
            if ((int) res.size() == k) return res;
        }
    }
    return res;
}
```

#### Rust

```rust []
pub fn top_k_frequent_bucket(words: Vec<String>, k: i32) -> Vec<String> {
    let k = k as usize;
    let n = words.len();
    let mut count: HashMap<String, usize> = HashMap::new();
    for word in &words { *count.entry(word.clone()).or_insert(0) += 1; } // O(n)
    let mut buckets: Vec<Vec<String>> = vec![vec![]; n + 1]; // index = frequency
    for (word, freq) in count { buckets[freq].push(word); } // O(m) distribute
    let mut res = Vec::with_capacity(k);
    for freq in (1..=n).rev() { // collect from highest freq bucket
        buckets[freq].sort(); // sort each bucket lexicographically
        for word in &buckets[freq] {
            res.push(word.clone());
            if res.len() == k { return res; }
        }
    }
    res
}
```
