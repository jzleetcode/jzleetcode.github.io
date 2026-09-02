---
author: JZ
pubDatetime: 2026-08-27T08:00:00Z
modDatetime: 2026-08-27T08:00:00Z
title: LeetCode 1268 Search Suggestions System
featured: false
tags:
  - a-binary-search
  - a-trie
  - a-sorting
  - a-string
description:
  "Solutions for LeetCode 1268, medium, tags: array, string, binary search, sorting, trie, heap (priority queue)."
---

## Table of contents

## Description

Question Links: [LeetCode 1268](https://leetcode.com/problems/search-suggestions-system/description/)

You are given an array of strings `products` and a string `searchWord`. Design a system that suggests at most three product names from `products` after each character of `searchWord` is typed. Suggested products should have common prefix with `searchWord`. If there are more than three products with a common prefix return the three lexicographically minimum products.

Return a list of lists of the suggested products after each character of `searchWord` is typed.

```
Example 1:

Input: products = ["mobile","mouse","moneypot","monitor","mousepad"], searchWord = "mouse"
Output: [["mobile","moneypot","monitor"],["mobile","moneypot","monitor"],
         ["mouse","mousepad"],["mouse","mousepad"],["mouse","mousepad"]]
Explanation: products sorted lexicographically = ["mobile","moneypot","monitor","mouse","mousepad"].
After typing m and mo all products match and we show user ["mobile","moneypot","monitor"].
After typing mou, mous and mouse the system suggests ["mouse","mousepad"].

Example 2:

Input: products = ["havana"], searchWord = "havana"
Output: [["havana"],["havana"],["havana"],["havana"],["havana"],["havana"]]

Example 3:

Input: products = ["bags","baggage","banner","box","cloths"], searchWord = "bags"
Output: [["baggage","bags","banner"],["baggage","bags","banner"],["baggage","bags"],["bags"]]
```

**Constraints:**

- `1 <= products.length <= 1000`
- `1 <= products[i].length <= 3000`
- `1 <= sum(products[i].length) <= 2 * 10^4`
- All the strings of `products` are unique.
- `products[i]` consists of lowercase English letters.
- `1 <= searchWord.length <= 1000`
- `searchWord` consists of lowercase English letters.

## Idea1: Sort + Binary Search

Sort the products array. For each growing prefix of `searchWord`, binary search for the insertion point (the first product >= prefix). Then check up to 3 products starting from that position that share the prefix.

```
products sorted: ["bags", "baggage", "banner", "box", "cloths"]
                  ↑ actually: ["baggage", "bags", "banner", "box", "cloths"]

searchWord = "bags"

prefix "b":    lower_bound → "baggage"  → ["baggage","bags","banner"]
prefix "ba":   lower_bound → "baggage"  → ["baggage","bags","banner"]
prefix "bag":  lower_bound → "baggage"  → ["baggage","bags"]
prefix "bags": lower_bound → "bags"     → ["bags"]
```

The key insight: since products are sorted, all products sharing a prefix form a contiguous range. Binary search finds the start of that range efficiently.

We can also narrow the search window: once `lo` advances past some products for prefix "ba", those products certainly won't match for prefix "bag" either.

Complexity: Time $O(n \log n + m \cdot L \cdot \log n)$ where $n$ = products.length, $m$ = searchWord.length, $L$ = average product length (for string comparisons). Space $O(\text{sort})$.

## Idea2: Trie

Build a trie from sorted products. At each trie node, store up to 3 words (the lexicographically smallest) that pass through that node. Then for each prefix character of `searchWord`, walk the trie and read the stored suggestions directly.

```
Trie structure (storing up to 3 suggestions per node):

root
 └─ b: ["baggage","bags","banner"]
     └─ a: ["baggage","bags","banner"]
         └─ g: ["baggage","bags"]
             └─ s: ["bags"]
             └─ g: ["baggage"]
                 └─ a: ["baggage"]
                     └─ ...
         └─ n: ["banner"]
     └─ o: ["box"]
 └─ c: ["cloths"]
```

Complexity: Time $O(n \cdot L)$ build + $O(m)$ query. Space $O(n \cdot L)$ for trie nodes.

### Java

```java []
// O(n log n + m*L*log n) time, O(sort) space.
public static List<List<String>> suggestedProducts(String[] products, String searchWord) {
    Arrays.sort(products);
    List<List<String>> result = new ArrayList<>();
    String prefix = "";
    int lo = 0, hi = products.length;
    for (int i = 0; i < searchWord.length(); i++) {
        prefix = prefix + searchWord.charAt(i);
        lo = lowerBound(products, lo, hi, prefix); // O(L * log n)
        List<String> suggestions = new ArrayList<>();
        for (int j = lo; j < Math.min(lo + 3, hi); j++) {
            if (products[j].startsWith(prefix)) {
                suggestions.add(products[j]);
            } else {
                break;
            }
        }
        result.add(suggestions);
    }
    return result;
}

private static int lowerBound(String[] products, int lo, int hi, String prefix) {
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (products[mid].compareTo(prefix) < 0) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}
```

### Python

```python []
class Solution:
    """Sort + binary search. O(n log n + m*L*log n) time, O(sort) space."""

    def suggestedProducts(self, products: list[str], searchWord: str) -> list[list[str]]:
        products.sort()  # O(n log n)
        res = []
        prefix = ""
        for ch in searchWord:  # O(m) iterations
            prefix += ch  # O(L)
            lo = bisect.bisect_left(products, prefix)  # O(L * log n)
            suggestions = []
            for i in range(lo, min(lo + 3, len(products))):
                if products[i].startswith(prefix):  # O(L)
                    suggestions.append(products[i])
                else:
                    break
            res.append(suggestions)
        return res
```

```python []
class Solution2:
    """Trie with sorted children. O(n*L) build, O(m*L) query time."""

    def suggestedProducts(self, products: list[str], searchWord: str) -> list[list[str]]:
        root = {}
        products.sort()
        for word in products:  # O(n*L) build
            node = root
            for ch in word:  # O(L)
                if ch not in node:
                    node[ch] = {"#": []}
                node = node[ch]
                if len(node["#"]) < 3:
                    node["#"].append(word)

        res = []
        node = root
        for ch in searchWord:  # O(m) query
            if node and ch in node:
                node = node[ch]
                res.append(node["#"])
            else:
                node = None
                res.append([])
        return res
```

### C++

```cpp []
// Sort + Binary Search (lower_bound).
// O(n log n + m*L*log n) time, O(sort) space.
vector<vector<string>> suggestedProducts(vector<string>& products, string searchWord) {
    sort(products.begin(), products.end());
    vector<vector<string>> result;
    string prefix;
    for (char c : searchWord) {
        prefix += c;
        auto it = lower_bound(products.begin(), products.end(), prefix); // O(L * log n)
        vector<string> suggestions;
        for (int i = 0; i < 3 && it + i != products.end(); ++i) {
            const string& s = *(it + i);
            if (s.substr(0, prefix.size()) == prefix) { // O(L)
                suggestions.push_back(s);
            } else {
                break;
            }
        }
        result.push_back(std::move(suggestions));
    }
    return result;
}
```

### Rust

```rust []
// Sort + Binary Search (partition_point).
// O(n log n + m * L * log n) time, O(sort) space.
pub fn suggested_products(mut products: Vec<String>, search_word: String) -> Vec<Vec<String>> {
    products.sort();
    let mut result = Vec::with_capacity(search_word.len());
    for i in 1..=search_word.len() {
        let prefix = &search_word[..i];
        let start = products.partition_point(|p| p.as_str() < prefix); // O(L * log n)
        let mut suggestions = Vec::new();
        for j in start..products.len().min(start + 3) {
            if products[j].starts_with(prefix) { // O(L)
                suggestions.push(products[j].clone());
            } else {
                break;
            }
        }
        result.push(suggestions);
    }
    result
}
```
