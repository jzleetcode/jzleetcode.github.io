---
author: JZ
pubDatetime: 2026-06-29T06:00:00Z
modDatetime: 2026-06-29T06:00:00Z
title: LeetCode 127 Word Ladder
featured: true
tags:
  - a-bfs
  - a-hash-table
description:
  "Solutions for LeetCode 127, hard, tags: hash table, string, breadth-first search."
---

## Table of contents

## Description

Question Links: [LeetCode 127](https://leetcode.com/problems/word-ladder/description/)

A **transformation sequence** from word `beginWord` to word `endWord` using a dictionary `wordList` is a sequence of words `beginWord -> s1 -> s2 -> ... -> sk` such that:

- Every adjacent pair of words differs by a single letter.
- Every `si` for `1 <= i <= k` is in `wordList`. Note that `beginWord` does not need to be in `wordList`.
- `sk == endWord`

Given two words, `beginWord` and `endWord`, and a dictionary `wordList`, return the **number of words** in the **shortest transformation sequence** from `beginWord` to `endWord`, or `0` if no such sequence exists.

```
Example 1:

Input: beginWord = "hit", endWord = "cog", wordList = ["hot","dot","dog","lot","log","cog"]
Output: 5
Explanation: One shortest transformation sequence is "hit" -> "hot" -> "dot" -> "dog" -> "cog",
which is 5 words long.

Example 2:

Input: beginWord = "hit", endWord = "cog", wordList = ["hot","dot","dog","lot","log"]
Output: 0
Explanation: The endWord "cog" is not in wordList, therefore there is no valid transformation sequence.

Constraints:

1 <= beginWord.length <= 10
endWord.length == beginWord.length
1 <= wordList.length <= 5000
wordList[i].length == beginWord.length
beginWord, endWord, and wordList[i] consist of lowercase English letters.
beginWord != endWord
All the words in wordList are unique.
```

## Solution 1: BFS with Wildcard Pattern Map

### Idea

Two words are adjacent if they differ by exactly one letter. Instead of comparing every pair ($O(N^2 \cdot M)$), we group words by **wildcard patterns** — replacing each position with `*`. For example, `hot` produces patterns `*ot`, `h*t`, `ho*`. Words sharing a pattern are neighbors.

Then we run BFS from `beginWord`, expanding level by level. The first time we reach `endWord`, the current level is the answer.

```
Example: "hit" -> "cog"

Pattern Map (partial):
  *ot -> [hot, dot, lot]
  h*t -> [hot, hit]
  ho* -> [hot]
  d*g -> [dog]
  *og -> [dog, log, cog]
  ...

BFS:
  Level 1: {hit}
  Level 2: {hot}         (via h*t)
  Level 3: {dot, lot}   (via *ot)
  Level 4: {dog, log}   (via d*g, l*g)
  Level 5: {cog}  ✓     (via *og)
```

Complexity: Time $O(M^2 \cdot N)$ — building the pattern map takes $O(M \cdot N)$ entries, each pattern is $O(M)$ to construct via substring. Space $O(M^2 \cdot N)$ for the pattern map storing all patterns.

#### Java

```java []
// BFS with wildcard pattern map. O(M^2*N) time, O(M^2*N) space.
// M = word length, N = wordList size.
public int ladderLengthBFS(String beginWord, String endWord, List<String> wordList) {
    int L = beginWord.length();
    HashMap<String, List<String>> wildToReal = new HashMap<>();
    wordList.forEach(word -> {
        for (int i = 0; i < L; i++) { // O(M) patterns per word
            String wild = word.substring(0, i) + '*' + word.substring(i + 1, L); // O(M) substring
            wildToReal.computeIfAbsent(wild, k -> new ArrayList<>()).add(word);
        }
    });
    Queue<Pair<String, Integer>> q = new LinkedList<>();
    q.add(new Pair<>(beginWord, 1));
    HashMap<String, Boolean> visited = new HashMap<>();
    visited.put(beginWord, true);
    while (!q.isEmpty()) { // O(N) nodes total
        Pair<String, Integer> node = q.remove();
        String word = node.getKey();
        int level = node.getValue();
        for (int i = 0; i < L; i++) { // O(M) patterns per word
            String newWord = word.substring(0, i) + '*' + word.substring(i + 1, L);
            for (String adjacentWord : wildToReal.getOrDefault(newWord, new ArrayList<>())) {
                if (adjacentWord.equals(endWord)) return level + 1;
                if (!visited.containsKey(adjacentWord)) {
                    visited.put(adjacentWord, true);
                    q.add(new Pair<>(adjacentWord, level + 1));
                }
            }
        }
    }
    return 0;
}
```

#### Python

```python []
from collections import defaultdict, deque

class Solution:
    def ladderLength(self, beginWord: str, endWord: str, wordList: list[str]) -> int:
        """BFS with wildcard pattern map. O(M^2*N) time and space."""
        word_set = set(wordList)
        if endWord not in word_set:
            return 0
        L = len(beginWord)
        wild_to_words: dict[str, list[str]] = defaultdict(list)
        for word in wordList:
            for i in range(L):  # O(M) patterns per word, O(N) words -> O(M*N) entries
                wild_to_words[word[:i] + '*' + word[i + 1:]].append(word)
        queue = deque([(beginWord, 1)])
        visited = {beginWord}
        while queue:  # O(N) nodes visited total
            cur, level = queue.popleft()
            for i in range(L):  # O(M) patterns per word
                pattern = cur[:i] + '*' + cur[i + 1:]
                for neighbor in wild_to_words[pattern]:
                    if neighbor == endWord:
                        return level + 1
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append((neighbor, level + 1))
        return 0
```

#### C++

```cpp []
// BFS with wildcard pattern map. O(M^2*N) time and space.
int ladderLengthBFS(string beginWord, string endWord, vector<string>& wordList) {
    unordered_set<string> wordSet(wordList.begin(), wordList.end());
    if (wordSet.find(endWord) == wordSet.end()) return 0;
    int M = beginWord.size();
    unordered_map<string, vector<string>> patternMap;
    for (const string& word : wordList) {
        for (int i = 0; i < M; i++) { // O(M) patterns per word
            string pattern = word.substr(0, i) + "*" + word.substr(i + 1); // O(M) substring
            patternMap[pattern].push_back(word);
        }
    }
    queue<string> q;
    q.push(beginWord);
    unordered_set<string> visited;
    visited.insert(beginWord);
    int level = 1;
    while (!q.empty()) {
        int size = q.size();
        for (int s = 0; s < size; s++) { // O(N) total across all levels
            string curr = q.front(); q.pop();
            for (int i = 0; i < M; i++) { // O(M) patterns
                string pattern = curr.substr(0, i) + "*" + curr.substr(i + 1);
                for (const string& neighbor : patternMap[pattern]) {
                    if (neighbor == endWord) return level + 1;
                    if (visited.find(neighbor) == visited.end()) {
                        visited.insert(neighbor);
                        q.push(neighbor);
                    }
                }
            }
        }
        level++;
    }
    return 0;
}
```

#### Rust

```rust []
use std::collections::{HashMap, HashSet, VecDeque};

/// BFS with wildcard pattern map. O(M^2*N) time, O(M^2*N) space.
pub fn ladder_length(begin_word: String, end_word: String, word_list: Vec<String>) -> i32 {
    let word_set: HashSet<&str> = word_list.iter().map(|s| s.as_str()).collect();
    if !word_set.contains(end_word.as_str()) { return 0; }
    // Build pattern map: O(M*N) entries, each O(M) to construct
    let mut pattern_map: HashMap<String, Vec<&str>> = HashMap::new();
    for word in &word_list {
        let chars: Vec<char> = word.chars().collect();
        for i in 0..chars.len() { // O(M) patterns per word
            let pattern: String = chars[..i].iter()
                .chain(std::iter::once(&'*'))
                .chain(chars[i + 1..].iter()).collect();
            pattern_map.entry(pattern).or_default().push(word.as_str());
        }
    }
    // BFS — O(N) nodes, O(M) work per node
    let mut visited: HashSet<&str> = HashSet::new();
    let mut queue: VecDeque<(&str, i32)> = VecDeque::new();
    queue.push_back((begin_word.as_str(), 1));
    visited.insert(begin_word.as_str());
    while let Some((word, level)) = queue.pop_front() {
        let chars: Vec<char> = word.chars().collect();
        for i in 0..chars.len() {
            let pattern: String = chars[..i].iter()
                .chain(std::iter::once(&'*'))
                .chain(chars[i + 1..].iter()).collect();
            if let Some(neighbors) = pattern_map.get(&pattern) {
                for &neighbor in neighbors {
                    if neighbor == end_word.as_str() { return level + 1; }
                    if visited.insert(neighbor) {
                        queue.push_back((neighbor, level + 1));
                    }
                }
            }
        }
    }
    0
}
```

## Solution 2: Bidirectional BFS

### Idea

Instead of searching from one end, run BFS simultaneously from `beginWord` and `endWord`. At each step, expand the **smaller frontier** — this balances the search trees and prunes the search space dramatically.

The two frontiers "meet in the middle": when expanding one side produces a word already in the other side's visited set, we've found the shortest path. This typically explores $O(\sqrt{N})$ nodes instead of $O(N)$.

```
"hit" -> "cog"

Step 1: front={hit}, back={cog}
  expand front (smaller): hit -> hot
  front={hot}

Step 2: front={hot}, back={cog}
  expand front: hot -> dot, lot
  front={dot, lot}

Step 3: front={dot, lot}, back={cog}
  expand back (smaller): cog -> dog, log
  back={dog, log}

Step 4: front={dot, lot}, back={dog, log}
  expand front: dot -> dog ← in back! return 4+1=5 ✓
```

Complexity: Time $O(M^2 \cdot N)$ worst case, but typically much faster since the search space is pruned. Space $O(M \cdot N)$ for the visited sets and frontiers.

#### Java

```java []
// Bidirectional BFS. O(M^2*N) time worst case, O(M^2*N) space.
// Expands smaller frontier first for practical speedup.
public int ladderLengthBidirectional(String beginWord, String endWord, List<String> wordList) {
    if (!wordList.contains(endWord)) return 0;
    int L = beginWord.length();
    HashMap<String, ArrayList<String>> allComboDict = new HashMap<>();
    wordList.forEach(word -> {
        for (int i = 0; i < L; i++) {
            String newWord = word.substring(0, i) + '*' + word.substring(i + 1, L);
            allComboDict.computeIfAbsent(newWord, k -> new ArrayList<>()).add(word);
        }
    });
    Queue<Pair<String, Integer>> qBegin = new LinkedList<>();
    Queue<Pair<String, Integer>> qEnd = new LinkedList<>();
    qBegin.add(new Pair<>(beginWord, 1));
    qEnd.add(new Pair<>(endWord, 1));
    HashMap<String, Integer> visitedBegin = new HashMap<>();
    HashMap<String, Integer> visitedEnd = new HashMap<>();
    visitedBegin.put(beginWord, 1);
    visitedEnd.put(endWord, 1);
    while (!qBegin.isEmpty() && !qEnd.isEmpty()) {
        int ans = visitNode(qBegin, visitedBegin, visitedEnd, allComboDict, L);
        if (ans > -1) return ans;
        ans = visitNode(qEnd, visitedEnd, visitedBegin, allComboDict, L);
        if (ans > -1) return ans;
    }
    return 0;
}

private int visitNode(Queue<Pair<String, Integer>> q, HashMap<String, Integer> visited,
        HashMap<String, Integer> othersVisited,
        HashMap<String, ArrayList<String>> allComboDict, int L) {
    Pair<String, Integer> node = q.remove();
    String word = node.getKey();
    int level = node.getValue();
    for (int i = 0; i < L; i++) { // O(M)
        String pattern = word.substring(0, i) + '*' + word.substring(i + 1, L);
        for (String adj : allComboDict.getOrDefault(pattern, new ArrayList<>())) {
            if (othersVisited.containsKey(adj)) return level + othersVisited.get(adj);
            if (!visited.containsKey(adj)) {
                visited.put(adj, level + 1);
                q.add(new Pair<>(adj, level + 1));
            }
        }
    }
    return -1;
}
```

#### Python

```python []
class Solution2:
    def ladderLength(self, beginWord: str, endWord: str, wordList: list[str]) -> int:
        """Bidirectional BFS. O(M^2*N) worst, much faster in practice."""
        word_set = set(wordList)
        if endWord not in word_set:
            return 0
        L = len(beginWord)
        front, back = {beginWord}, {endWord}
        visited = {beginWord, endWord}
        level = 1
        while front and back:  # O(N) total expansion
            if len(front) > len(back):  # always expand smaller frontier
                front, back = back, front
            next_front = set()
            for word in front:
                for i in range(L):  # O(M) positions
                    for c in 'abcdefghijklmnopqrstuvwxyz':  # O(26)
                        candidate = word[:i] + c + word[i + 1:]
                        if candidate in back:
                            return level + 1
                        if candidate in word_set and candidate not in visited:
                            visited.add(candidate)
                            next_front.add(candidate)
            front = next_front
            level += 1
        return 0
```

#### C++

```cpp []
// Bidirectional BFS. O(M^2*N) worst case, faster in practice.
int ladderLengthBidirectional(string beginWord, string endWord, vector<string>& wordList) {
    unordered_set<string> wordSet(wordList.begin(), wordList.end());
    if (wordSet.find(endWord) == wordSet.end()) return 0;
    int M = beginWord.size();
    unordered_map<string, vector<string>> patternMap;
    for (const string& word : wordList) {
        for (int i = 0; i < M; i++) {
            string pattern = word.substr(0, i) + "*" + word.substr(i + 1);
            patternMap[pattern].push_back(word);
        }
    }
    unordered_set<string> frontBegin{beginWord}, frontEnd{endWord};
    unordered_set<string> visitedBegin{beginWord}, visitedEnd{endWord};
    int level = 1;
    while (!frontBegin.empty() && !frontEnd.empty()) {
        if (frontBegin.size() > frontEnd.size()) { // expand smaller frontier
            swap(frontBegin, frontEnd);
            swap(visitedBegin, visitedEnd);
        }
        unordered_set<string> nextFront;
        for (const string& curr : frontBegin) {
            for (int i = 0; i < M; i++) { // O(M) patterns
                string pattern = curr.substr(0, i) + "*" + curr.substr(i + 1);
                for (const string& neighbor : patternMap[pattern]) {
                    if (visitedEnd.count(neighbor)) return level + 1;
                    if (!visitedBegin.count(neighbor)) {
                        visitedBegin.insert(neighbor);
                        nextFront.insert(neighbor);
                    }
                }
            }
        }
        frontBegin = nextFront;
        level++;
    }
    return 0;
}
```

#### Rust

```rust []
use std::collections::HashSet;

/// Bidirectional BFS. O(M^2*N) worst, faster in practice.
pub fn ladder_length_bidirectional(
    begin_word: String, end_word: String, word_list: Vec<String>,
) -> i32 {
    let word_set: HashSet<String> = word_list.into_iter().collect();
    if !word_set.contains(&end_word) { return 0; }
    let mut front: HashSet<String> = HashSet::from([begin_word.clone()]);
    let mut back: HashSet<String> = HashSet::from([end_word.clone()]);
    let mut visited: HashSet<String> = HashSet::from([begin_word, end_word]);
    let mut level = 1;
    while !front.is_empty() && !back.is_empty() {
        if front.len() > back.len() { // expand smaller frontier
            std::mem::swap(&mut front, &mut back);
        }
        let mut next_front: HashSet<String> = HashSet::new();
        for word in &front {
            let mut chars: Vec<u8> = word.bytes().collect();
            for i in 0..chars.len() { // O(M) positions
                let original = chars[i];
                for c in b'a'..=b'z' { // O(26) replacements
                    if c == original { continue; }
                    chars[i] = c;
                    let new_word = String::from_utf8(chars.clone()).unwrap();
                    if back.contains(&new_word) { return level + 1; }
                    if word_set.contains(&new_word) && visited.insert(new_word.clone()) {
                        next_front.insert(new_word);
                    }
                }
                chars[i] = original;
            }
        }
        front = next_front;
        level += 1;
    }
    0
}
```
