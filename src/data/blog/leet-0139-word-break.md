---
author: JZ
pubDatetime: 2026-05-08T06:00:00Z
modDatetime: 2026-05-08T06:00:00Z
title: LeetCode 139 Word Break
featured: false
tags:
  - a-dynamic-programming
  - a-hash-table
  - a-string
  - a-bfs
description:
  "Solutions for LeetCode 139, medium, tags: dynamic programming, hash table, string, trie, memoization."
---

## Table of contents

## Description

Question Links: [LeetCode 139](https://leetcode.com/problems/word-break/description/)

Given a string `s` and a dictionary of strings `wordDict`, return `true` if `s` can be segmented into a space-separated sequence of one or more dictionary words.

Note that the same word in the dictionary may be reused multiple times in the segmentation.

```
Example 1:

Input: s = "leetcode", wordDict = ["leet","code"]
Output: true
Explanation: Return true because "leetcode" can be segmented as "leet code".

Example 2:

Input: s = "applepenapple", wordDict = ["apple","pen"]
Output: true
Explanation: Return true because "applepenapple" can be segmented as "apple pen apple".
Note that you are allowed to reuse a dictionary word.

Example 3:

Input: s = "catsandog", wordDict = ["cats","dog","sand","and","cat"]
Output: false

Constraints:

1 <= s.length <= 300
1 <= wordDict.length <= 1000
1 <= wordDict[i].length <= 20
s and wordDict[i] consist of only lowercase English letters.
All the strings of wordDict are unique.
```

## Solution 1: Dynamic Programming

### Idea

Define `dp[i] = true` if the substring `s[0..i)` can be segmented into dictionary words. For each position `i`, check all possible split points `j < i`: if `dp[j]` is true and `s[j..i)` is in the dictionary, then `dp[i] = true`.

```
s = "leetcode", dict = {"leet", "code"}

dp[0] = true (empty string base case)

i=1: s[0..1)="l" not in dict -> dp[1]=false
i=2: s[0..2)="le" not in dict -> dp[2]=false
i=3: s[0..3)="lee" not in dict -> dp[3]=false
i=4: s[0..4)="leet" in dict, dp[0]=true -> dp[4]=true
i=5: no valid split -> dp[5]=false
i=6: no valid split -> dp[6]=false
i=7: no valid split -> dp[7]=false
i=8: s[4..8)="code" in dict, dp[4]=true -> dp[8]=true

Result: dp[8] = true
```

Complexity: Time $O(n^2 \cdot k)$ — two nested loops $O(n^2)$, substring comparison $O(k)$ where $k$ = max word length. Space $O(n + m \cdot k)$ — dp array $O(n)$, hash set $O(m \cdot k)$.

#### Java

```java []
public boolean wordBreakDPSet(String s, List<String> wordDict) {
    int l = s.length();
    boolean[] dp = new boolean[l + 1]; // O(n) space
    dp[0] = true;
    Set<String> wordSet = new HashSet<>(wordDict); // O(m*k) space
    for (int i = 1; i <= l; i++) { // O(n)
        for (int j = 0; j < i; j++) { // O(n)
            if (dp[j] && wordSet.contains(s.substring(j, i))) { // O(k)
                dp[i] = true;
                break;
            }
        }
    }
    return dp[l];
}
```

#### Python

```python []
class Solution:
    def wordBreak(self, s: str, wordDict: list[str]) -> bool:
        n = len(s)
        dp = [False] * (n + 1)  # O(n) space
        dp[0] = True
        word_set = set(wordDict)  # O(m*k) space
        for i in range(1, n + 1):  # O(n)
            for j in range(i):  # O(n)
                if dp[j] and s[j:i] in word_set:  # O(k) substring
                    dp[i] = True
                    break
        return dp[n]
```

#### C++

```cpp []
bool wordBreak(string s, vector<string> &wordDict) {
    unordered_set<string> dict(wordDict.begin(), wordDict.end());
    int n = s.size();
    vector<bool> dp(n + 1, false);
    dp[0] = true;
    for (int i = 1; i <= n; i++) // O(n)
        for (int j = 0; j < i; j++) // O(n)
            if (dp[j] && dict.count(s.substr(j, i - j))) { // O(k)
                dp[i] = true;
                break;
            }
    return dp[n];
}
```

#### Rust

```rust []
pub fn word_break(s: String, word_dict: Vec<String>) -> bool {
    let n = s.len();
    let mut dp = vec![false; n + 1]; // O(n) space
    dp[0] = true;
    let word_set: HashSet<&str> = word_dict.iter().map(|w| w.as_str()).collect(); // O(m*k)
    for i in 1..=n { // O(n)
        for j in 0..i { // O(n)
            if dp[j] && word_set.contains(&s[j..i]) { // O(k)
                dp[i] = true;
                break;
            }
        }
    }
    dp[n]
}
```

## Solution 2: BFS

### Idea

Model the problem as a graph traversal. Each index in the string is a node. From index `start`, there is an edge to index `end` if `s[start..end)` is a word in the dictionary. Use BFS from index 0; if we can reach index `n`, the string can be segmented. A `visited` array avoids revisiting the same starting index.

```
s = "catsanddog", dict = {"cats", "dog", "sand", "and", "cat"}

BFS from 0:
  queue = [0]
  0 -> "cat" in dict -> enqueue 3
  0 -> "cats" in dict -> enqueue 4

  queue = [3, 4]
  3 -> "sand" in dict -> enqueue 7
  3 -> "and" in dict -> enqueue 6

  queue = [4, 7, 6]
  4 -> "and" in dict -> enqueue 7 (already visited)
  4 -> "andd" not in dict ...

  queue = [7, 6]
  7 -> "dog" in dict -> end=10=n -> return true!
```

Complexity: Time $O(n^2 \cdot k)$ — each index visited once $O(n)$, inner loop $O(n)$, substring $O(k)$. Space $O(n + m \cdot k)$ — queue + visited $O(n)$, hash set $O(m \cdot k)$.

#### Java

```java []
public boolean wordBreakBFS(String s, List<String> wordDict) {
    int l = s.length();
    Set<String> wordDictSet = new HashSet<>(wordDict);
    Queue<Integer> queue = new LinkedList<>();
    boolean[] visited = new boolean[l];
    queue.add(0);
    while (!queue.isEmpty()) { // O(n)
        int start = queue.remove();
        if (visited[start]) continue;
        for (int end = start + 1; end <= l; end++) { // O(n)
            if (wordDictSet.contains(s.substring(start, end))) { // O(k)
                if (end == l) return true;
                queue.add(end);
            }
        }
        visited[start] = true;
    }
    return false;
}
```

#### Python

```python []
class Solution2:
    def wordBreak(self, s: str, wordDict: list[str]) -> bool:
        n = len(s)
        visited = [False] * n
        q = deque([0])
        word_set = set(wordDict)  # O(m*k) space
        while q:  # O(n)
            start = q.popleft()
            if visited[start]:
                continue
            for end in range(start + 1, n + 1):  # O(n)
                if s[start:end] in word_set:  # O(k) substring
                    if end == n:
                        return True
                    q.append(end)
            visited[start] = True
        return False
```

#### C++

```cpp []
bool wordBreak(string s, vector<string> &wordDict) {
    unordered_set<string> dict(wordDict.begin(), wordDict.end());
    int n = s.size();
    vector<bool> visited(n, false);
    queue<int> q;
    q.push(0);
    while (!q.empty()) { // O(n)
        int start = q.front();
        q.pop();
        if (visited[start]) continue;
        visited[start] = true;
        for (int end = start + 1; end <= n; end++) { // O(n)
            if (dict.count(s.substr(start, end - start))) { // O(k)
                if (end == n) return true;
                q.push(end);
            }
        }
    }
    return false;
}
```

#### Rust

```rust []
pub fn word_break_bfs(s: String, word_dict: Vec<String>) -> bool {
    let n = s.len();
    let word_set: HashSet<&str> = word_dict.iter().map(|w| w.as_str()).collect();
    let mut visited = vec![false; n];
    let mut queue = VecDeque::new();
    queue.push_back(0);
    while let Some(start) = queue.pop_front() { // O(n)
        if start < n && visited[start] {
            continue;
        }
        if start < n {
            visited[start] = true;
        }
        for end in (start + 1)..=n { // O(n)
            if word_set.contains(&s[start..end]) { // O(k)
                if end == n {
                    return true;
                }
                queue.push_back(end);
            }
        }
    }
    false
}
```
