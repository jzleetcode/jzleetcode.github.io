---
author: JZ
pubDatetime: 2026-08-08T10:36:00Z
modDatetime: 2026-08-08T10:36:00Z
title: LeetCode 1048 Longest String Chain
featured: false
tags:
  - a-dp
  - a-hash
  - a-string
description:
  "Solutions for LeetCode 1048, medium, tags: array, hash table, two pointers, string, dynamic programming."
---

## Table of contents

## Description

Question Links: [LeetCode 1048](https://leetcode.com/problems/longest-string-chain/description/)

You are given an array of `words` where each word consists of lowercase English letters.

`wordA` is a **predecessor** of `wordB` if and only if we can insert **exactly one** letter anywhere in `wordA` **without changing the order** of the other characters to make it equal to `wordB`.

- For example, `"abc"` is a predecessor of `"abac"`, while `"cba"` is not a predecessor of `"bcad"`.

A **word chain** is a sequence of words `[word_1, word_2, ..., word_k]` with `k >= 1`, where `word_1` is a predecessor of `word_2`, `word_2` is a predecessor of `word_3`, and so on. A single word is trivially a word chain with `k == 1`.

Return the **length** of the **longest possible word chain** with words chosen from the given list of `words`.

```
Example 1:

Input: words = ["a","b","ba","bca","bda","bdca"]
Output: 4
Explanation: One of the longest word chains is ["a","ba","bda","bdca"].

Example 2:

Input: words = ["xbc","pcxbcf","xb","cxbc","pcxbc"]
Output: 5
Explanation: All the words can be put in a word chain ["xb","xbc","cxbc","pcxbc","pcxbcf"].

Example 3:

Input: words = ["abcd","dbqca"]
Output: 1
Explanation: The trivial word chain ["abcd"] is one of the longest word chains.
["abcd","dbqca"] is not a valid word chain because the ordering of letters is changed.
```

**Constraints:**

- `1 <= words.length <= 1000`
- `1 <= words[i].length <= 16`
- `words[i]` only consists of lowercase English letters.

## Idea

Sort words by length so shorter words (potential predecessors) are processed first. Use a hash map `dp` where `dp[word]` stores the length of the longest chain ending at that word.

For each word, try removing each character at index `i` to form a candidate predecessor. If that predecessor exists in `dp`, we can extend its chain by 1.

```
words sorted by length: ["a", "b", "ba", "bca", "bda", "bdca"]

Process "a":    dp["a"]    = 1
Process "b":    dp["b"]    = 1
Process "ba":   remove 'b' -> "a" in dp(1), remove 'a' -> "b" in dp(1)
                dp["ba"]   = 2
Process "bca":  remove 'b' -> "ca" not found
                remove 'c' -> "ba" in dp(2)  ✓
                remove 'a' -> "bc" not found
                dp["bca"]  = 3
Process "bda":  remove 'b' -> "da" not found
                remove 'd' -> "ba" in dp(2)  ✓
                remove 'a' -> "bd" not found
                dp["bda"]  = 3
Process "bdca": remove 'b' -> "dca" not found
                remove 'd' -> "bca" in dp(3)  ✓
                remove 'c' -> "bda" in dp(3)  ✓
                remove 'a' -> "bdc" not found
                dp["bdca"] = 4

Answer: 4
```

Complexity: Time $O(n \cdot L^2)$ — for each of $n$ words, we try $L$ character removals, each producing a string in $O(L)$. Space $O(n \cdot L)$ — the hash map stores up to $n$ words of length up to $L$.

### Java

```java []
public static int longestStrChain(String[] words) {
    // Sort words by length so predecessors are processed first — O(n log n)
    Arrays.sort(words, (a, b) -> a.length() - b.length());

    // dp map: word -> longest chain ending at that word — O(n) space
    Map<String, Integer> dp = new HashMap<>();
    int result = 1;

    for (String word : words) { // O(n) iterations
        int best = 1;
        // Try removing each character to form a predecessor — O(L) removals
        for (int i = 0; i < word.length(); i++) {
            // Build predecessor by removing char at index i — O(L) string concat
            String predecessor = word.substring(0, i) + word.substring(i + 1);
            int prevChain = dp.getOrDefault(predecessor, 0);
            best = Math.max(best, prevChain + 1);
        }
        dp.put(word, best);
        result = Math.max(result, best);
    }

    return result;
}
```

### Python

```python []
def longestStrChain(self, words: list[str]) -> int:
    words.sort(key=len)  # O(n log n)
    dp = {}
    res = 1
    for word in words:  # O(n)
        dp[word] = 1
        for i in range(len(word)):  # O(L)
            predecessor = word[:i] + word[i + 1:]  # O(L) string slice
            if predecessor in dp:
                dp[word] = max(dp[word], dp[predecessor] + 1)
        res = max(res, dp[word])
    return res
```

### C++

```cpp []
int longestStrChain(vector<string> &words) {
    // Sort by length so predecessors are processed first. O(n log n)
    sort(words.begin(), words.end(), [](const string &a, const string &b) {
        return a.size() < b.size();
    });
    unordered_map<string, int> dp; // dp[word] = longest chain ending at word
    int ans = 1;
    for (const string &word : words) { // O(n)
        dp[word] = 1;
        for (int i = 0; i < (int)word.size(); i++) { // O(L) removals
            // Build predecessor by removing char at i. O(L) string copy.
            string pred = word.substr(0, i) + word.substr(i + 1);
            if (dp.count(pred)) {
                dp[word] = max(dp[word], dp[pred] + 1);
            }
        }
        ans = max(ans, dp[word]);
    }
    return ans;
}
```

### Rust

```rust []
pub fn longest_str_chain(words: Vec<String>) -> i32 {
    let mut words = words;
    words.sort_by_key(|w| w.len()); // O(n log n) sort by length

    // dp[word] = length of longest chain ending at word
    let mut dp: HashMap<String, i32> = HashMap::new(); // O(n) space
    let mut ans = 1;

    for word in &words {
        let mut best = 1;
        // Try removing each character to form a predecessor — O(L) iterations
        for i in 0..word.len() {
            // Building predecessor string — O(L) per iteration
            let pred = format!("{}{}", &word[..i], &word[i + 1..]);
            if let Some(&prev_len) = dp.get(&pred) {
                best = best.max(prev_len + 1);
            }
        }
        dp.insert(word.clone(), best);
        ans = ans.max(best);
    }

    ans
}
```
