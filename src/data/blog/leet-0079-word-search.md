---
author: JZ
pubDatetime: 2026-05-22T06:00:00Z
modDatetime: 2026-05-22T06:00:00Z
title: LeetCode 79 Word Search
featured: false
tags:
  - a-backtracking
  - a-dfs
  - a-matrix
description:
  "Solutions for LeetCode 79, medium, tags: array, string, backtracking, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 79](https://leetcode.com/problems/word-search/description/)

Given an `m x n` grid of characters `board` and a string `word`, return `true` if `word` exists in the grid.

The word can be constructed from letters of sequentially adjacent cells, where adjacent cells are horizontally or vertically neighboring. The same letter cell may not be used more than once.

```
Example 1:

Input: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCCED"
Output: true

Example 2:

Input: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "SEE"
Output: true

Example 3:

Input: board = [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], word = "ABCB"
Output: false
```

**Constraints:**

- `m == board.length`
- `n == board[i].length`
- `1 <= m, n <= 6`
- `1 <= word.length <= 15`
- `board` and `word` consist of only lowercase and uppercase English letters.

**Follow up:** Could you use search pruning to make your solution faster with a larger board?

## Idea1

We use **DFS with backtracking**. For each cell matching the first character, we launch a DFS that tries to extend the match character by character in all 4 directions. To avoid revisiting a cell in the same path, we temporarily mark it (e.g., replace with `'#'`) and restore it after exploring.

```
board:                    searching "SEE":
A B C E                   start at (1,3) 'S'
S F C S       DFS -->     move to (2,3) 'E'  (match word[1])
A D E E                   move to (2,2) 'E'  (match word[2])
                          all matched, return true

backtracking visualization for "ABCB":
A B C E       A→B→C→ try B? already visited → backtrack
S F C S       no valid path → return false
A D E E
```

At each cell we branch into at most 4 directions, and the word has length `l`, so worst case we explore $O(4^l)$ paths from each starting cell.

Complexity: Time $O(m \cdot n \cdot 4^l)$, Space $O(l)$ recursion stack (or $O(m \cdot n)$ if using a separate visited array).

### Java

```java []
// O(mn * 4^l) time, O(l) space for recursion stack.
public boolean exist(char[][] board, String word) {
    boolean[][] visited = new boolean[board.length][board[0].length];
    for (int i = 0; i < board.length; i++)       // O(m)
        for (int j = 0; j < board[0].length; j++) // O(n)
            if (dfs(board, word, 0, visited, i, j)) return true;
    return false;
}

private boolean dfs(char[][] board, String word, int index, boolean[][] visited, int i, int j) {
    if (index == word.length()) return true;
    if (i >= board.length || j >= board[0].length || i < 0 || j < 0
            || visited[i][j] || board[i][j] != word.charAt(index)) return false;
    visited[i][j] = true;
    int[][] dirs = {{0, 1}, {1, 0}, {-1, 0}, {0, -1}};
    for (int[] dir : dirs)                        // O(4) directions, O(4^l) total paths
        if (dfs(board, word, index + 1, visited, i + dir[0], j + dir[1])) return true;
    visited[i][j] = false;                        // backtrack
    return false;
}
```

```python []
# O(mn * 4^l) time, O(l) space for recursion stack.
class Solution:
    def exist(self, board: list[list[str]], word: str) -> bool:
        m, n = len(board), len(board[0])
        dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]

        def dfs(r: int, c: int, i: int) -> bool:
            if r < 0 or r > m - 1 or c < 0 or c > n - 1: return False
            tmp = board[r][c]
            if word[i] != tmp: return False
            if i == len(word) - 1: return True
            board[r][c] = "#"                     # mark visited
            for d in dirs:                        # O(4) directions
                nr, nc = r + d[0], c + d[1]
                if dfs(nr, nc, i + 1): return True
            board[r][c] = tmp                     # backtrack
            return False

        for r in range(m):                        # O(m)
            for c in range(n):                    # O(n)
                if dfs(r, c, 0): return True
        return False
```

```cpp []
// O(mn * 4^l) time, O(l) space for recursion stack.
class Solution {
public:
    bool exist(vector<vector<char>> &board, string word) {
        int m = board.size(), n = board[0].size();
        for (int i = 0; i < m; i++)               // O(m)
            for (int j = 0; j < n; j++)           // O(n)
                if (dfs(board, word, 0, i, j)) return true;
        return false;
    }

private:
    bool dfs(vector<vector<char>> &board, const string &word, int idx, int i, int j) {
        if (idx == (int) word.size()) return true;
        if (i < 0 || i >= (int) board.size() || j < 0 || j >= (int) board[0].size()) return false;
        if (board[i][j] != word[idx]) return false;
        char tmp = board[i][j];
        board[i][j] = '#';                        // mark visited
        int dirs[4][2] = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
        for (auto &d : dirs)                      // O(4) directions, O(4^l) total
            if (dfs(board, word, idx + 1, i + d[0], j + d[1])) return true;
        board[i][j] = tmp;                        // backtrack
        return false;
    }
};
```

```rust []
// O(mn * 4^l) time, O(l) space for recursion stack.
impl Solution {
    pub fn exist(mut board: Vec<Vec<char>>, word: String) -> bool {
        let (m, n) = (board.len(), board[0].len());
        let word: Vec<char> = word.chars().collect();
        for i in 0..m {                           // O(m)
            for j in 0..n {                       // O(n)
                if Self::dfs(&mut board, &word, 0, i as i32, j as i32) {
                    return true;
                }
            }
        }
        false
    }

    fn dfs(board: &mut Vec<Vec<char>>, word: &[char], idx: usize, i: i32, j: i32) -> bool {
        if idx == word.len() { return true; }
        if i < 0 || i >= board.len() as i32 || j < 0 || j >= board[0].len() as i32 {
            return false;
        }
        let (r, c) = (i as usize, j as usize);
        if board[r][c] != word[idx] { return false; }
        let tmp = board[r][c];
        board[r][c] = '#';                        // mark visited
        let dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)];
        for (dr, dc) in dirs {                    // O(4) directions
            if Self::dfs(board, word, idx + 1, i + dr, j + dc) {
                return true;
            }
        }
        board[r][c] = tmp;                        // backtrack
        false
    }
}
```

## Idea2

**Pruning optimization**: Before starting the DFS, count character frequencies in the board. If the first character of `word` appears more often than the last, reverse the word — this reduces the number of starting cells and prunes more paths early.

Additionally, if any character in `word` doesn't exist in the board at all, return `false` immediately.

Complexity: Same worst case $O(m \cdot n \cdot 4^l)$, but practically much faster on boards where the pruning kicks in.

### Java

```java []
// O(mn * 4^l) time with frequency-based pruning.
public boolean exist2(char[][] board, String word) {
    HashMap<Character, Integer> freqCnt = new HashMap<>();
    for (int i = 0; i < board.length; i++)
        for (int j = 0; j < board[0].length; j++)
            freqCnt.merge(board[i][j], 1, Integer::sum);
    for (int i = 0; i < word.length(); i++)
        if (freqCnt.getOrDefault(word.charAt(i), 0) == 0) return false;
    // reverse word if first char is more frequent than last — fewer starting points
    char firstLetter = word.charAt(0);
    char lastLetter = word.charAt(word.length() - 1);
    if (freqCnt.getOrDefault(firstLetter, 0) > freqCnt.getOrDefault(lastLetter, 0))
        word = new StringBuilder(word).reverse().toString();

    boolean[][] visited = new boolean[board.length][board[0].length];
    for (int i = 0; i < board.length; i++)
        for (int j = 0; j < board[0].length; j++)
            if (dfs(board, word, 0, visited, i, j)) return true;
    return false;
}
```
