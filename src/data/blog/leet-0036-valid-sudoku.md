---
author: JZ
pubDatetime: 2026-06-21T10:06:00Z
modDatetime: 2026-06-21T10:06:00Z
title: LeetCode 36 Valid Sudoku
featured: false
tags:
  - a-array
  - a-hash-table
  - a-matrix
description:
  "Solutions for LeetCode 36, medium, tags: array, hash table, matrix."
---

## Table of contents

## Description

Question Links: [LeetCode 36](https://leetcode.com/problems/valid-sudoku/description/)

Determine if a 9 x 9 Sudoku board is valid. Only the filled cells need to be validated according to the following rules:

1. Each row must contain the digits 1-9 without repetition.
2. Each column must contain the digits 1-9 without repetition.
3. Each of the nine 3 x 3 sub-boxes of the grid must contain the digits 1-9 without repetition.

Note:
- A Sudoku board (partially filled) could be valid but is not necessarily solvable.
- Only the filled cells need to be validated according to the mentioned rules.

```
Example 1:

Input: board =
[["5","3",".",".","7",".",".",".","."]
,["6",".",".","1","9","5",".",".","."]
,[".","9","8",".",".",".",".","6","."]
,["8",".",".",".","6",".",".",".","3"]
,["4",".",".","8",".","3",".",".","1"]
,["7",".",".",".","2",".",".",".","6"]
,[".","6",".",".",".",".","2","8","."]
,[".",".",".","4","1","9",".",".","5"]
,[".",".",".",".","8",".",".","7","9"]]
Output: true

Example 2:

Input: board =
[["8","3",".",".","7",".",".",".","."]
,["6",".",".","1","9","5",".",".","."]
,[".","9","8",".",".",".",".","6","."]
,["8",".",".",".","6",".",".",".","3"]
,["4",".",".","8",".","3",".",".","1"]
,["7",".",".",".","2",".",".",".","6"]
,[".","6",".",".",".",".","2","8","."]
,[".",".",".","4","1","9",".",".","5"]
,[".",".",".",".","8",".",".","7","9"]]
Output: false
Explanation: Same as Example 1, except with the 5 in the top left corner being
modified to 8. Since there are two 8's in the top left 3x3 sub-box, it is invalid.

Constraints:

board.length == 9
board[i].length == 9
board[i][j] is a digit 1-9 or '.'.
```

## Solution 1: HashSet with Encoded Keys

### Idea

For each filled cell at position `(r, c)` with value `v`, we need to check three constraints: no duplicate in row `r`, no duplicate in column `c`, and no duplicate in the 3x3 box `(r/3, c/3)`. We encode each constraint as a unique string (or tuple) and insert into a set. If insertion fails (element already exists), the board is invalid.

```
Board traversal (row-major order):

  cell (0,0) = '5' -> insert: "5 in row 0", "5 in col 0", "5 in box 0-0"
  cell (0,1) = '3' -> insert: "3 in row 0", "3 in col 1", "3 in box 0-0"
  cell (0,2) = '.'  -> skip
  ...
  cell (2,1) = '9' -> insert: "9 in row 2", "9 in col 1", "9 in box 0-0"
  cell (2,2) = '8' -> insert: "8 in row 2", "8 in col 2", "8 in box 0-0"

  Box index = (row/3, col/3):
  +-------+-------+-------+
  | (0,0) | (0,1) | (0,2) |
  +-------+-------+-------+
  | (1,0) | (1,1) | (1,2) |
  +-------+-------+-------+
  | (2,0) | (2,1) | (2,2) |
  +-------+-------+-------+
```

Complexity: Time $O(1)$, Space $O(1)$ — the board is always 9x9, so we visit at most 81 cells and store at most 243 entries in the set.

#### Java

```java []
public boolean isValidSudoku(char[][] board) {
    Set<String> seen = new HashSet<>();
    for (int i = 0; i < 9; ++i) { // O(9)
        for (int j = 0; j < 9; ++j) { // O(9)
            char number = board[i][j];
            if (number == '.') continue;
            if (!seen.add(number + " in row " + i) ||
                    !seen.add(number + " in column " + j) ||
                    !seen.add(number + " in block " + i / 3 + "-" + j / 3))
                return false;
        }
    }
    return true;
}
```

#### Python

```python []
class Solution:
    def isValidSudoku(self, board: list[list[str]]) -> bool:
        seen = set()
        for r in range(9):  # O(9)
            for c in range(9):  # O(9)
                s = board[r][c]
                if s == ".":
                    continue
                s1, s2, s3 = (r, s), (s, c), (r // 3, c // 3, s)
                if any(state in seen for state in [s1, s2, s3]):
                    return False
                else:
                    seen.update([s1, s2, s3])
        return True
```

#### C++

```cpp []
bool isValidSudoku(vector<vector<char>> &board) {
    unordered_set<string> seen;
    for (int i = 0; i < 9; i++) { // O(9)
        for (int j = 0; j < 9; j++) { // O(9)
            char c = board[i][j];
            if (c == '.') continue;
            string row = string(1, c) + " in row " + to_string(i);
            string col = string(1, c) + " in col " + to_string(j);
            string box = string(1, c) + " in box " + to_string(i / 3) + to_string(j / 3);
            if (!seen.insert(row).second ||
                !seen.insert(col).second ||
                !seen.insert(box).second)
                return false;
        }
    }
    return true;
}
```

#### Rust

```rust []
pub fn is_valid_sudoku(board: Vec<Vec<char>>) -> bool {
    let mut seen = HashSet::new();
    for i in 0..9 { // O(9)
        for j in 0..9 { // O(9)
            let c = board[i][j];
            if c == '.' {
                continue;
            }
            let row = format!("r{}{}", i, c);
            let col = format!("c{}{}", j, c);
            let bx = format!("b{}{}{}", i / 3, j / 3, c);
            if !seen.insert(row) || !seen.insert(col) || !seen.insert(bx) {
                return false;
            }
        }
    }
    true
}
```

## Solution 2: Array-Based Bitmasking

### Idea

Instead of a hash set with string keys, use three arrays of bitmasks (one each for rows, columns, and boxes). For each digit `d` in cell `(r, c)`, set bit `d` in `rows[r]`, `cols[c]`, and `boxes[r/3*3 + c/3]`. If the bit is already set, the board is invalid. This avoids string allocation and hashing overhead.

```
rows[9], cols[9], boxes[9] — each is a 9-bit integer

cell (0,0) = '5': bit 5 in rows[0], cols[0], boxes[0]
cell (0,1) = '3': bit 3 in rows[0], cols[1], boxes[0]
...

Check: if (rows[r] & (1 << d)) != 0 -> duplicate in row
```

Complexity: Time $O(1)$, Space $O(1)$ — 27 integers regardless of input.

#### Java

```java []
public boolean isValidSudokuBit(char[][] board) {
    int[] rows = new int[9], cols = new int[9], boxes = new int[9];
    for (int i = 0; i < 9; i++) {
        for (int j = 0; j < 9; j++) {
            if (board[i][j] == '.') continue;
            int bit = 1 << (board[i][j] - '1');
            int box = i / 3 * 3 + j / 3;
            if ((rows[i] & bit) != 0 || (cols[j] & bit) != 0 || (boxes[box] & bit) != 0)
                return false;
            rows[i] |= bit;
            cols[j] |= bit;
            boxes[box] |= bit;
        }
    }
    return true;
}
```

#### Python

```python []
class Solution2:
    def isValidSudoku(self, board: list[list[str]]) -> bool:
        rows, cols, boxes = [0] * 9, [0] * 9, [0] * 9
        for i in range(9):
            for j in range(9):
                if board[i][j] == '.':
                    continue
                bit = 1 << (int(board[i][j]) - 1)
                box = i // 3 * 3 + j // 3
                if rows[i] & bit or cols[j] & bit or boxes[box] & bit:
                    return False
                rows[i] |= bit
                cols[j] |= bit
                boxes[box] |= bit
        return True
```

#### C++

```cpp []
bool isValidSudokuBit(vector<vector<char>> &board) {
    int rows[9] = {}, cols[9] = {}, boxes[9] = {};
    for (int i = 0; i < 9; i++) {
        for (int j = 0; j < 9; j++) {
            if (board[i][j] == '.') continue;
            int bit = 1 << (board[i][j] - '1');
            int box = i / 3 * 3 + j / 3;
            if ((rows[i] & bit) || (cols[j] & bit) || (boxes[box] & bit))
                return false;
            rows[i] |= bit;
            cols[j] |= bit;
            boxes[box] |= bit;
        }
    }
    return true;
}
```

#### Rust

```rust []
pub fn is_valid_sudoku_bit(board: Vec<Vec<char>>) -> bool {
    let (mut rows, mut cols, mut boxes) = ([0u16; 9], [0u16; 9], [0u16; 9]);
    for i in 0..9 {
        for j in 0..9 {
            if board[i][j] == '.' {
                continue;
            }
            let bit = 1u16 << (board[i][j] as u8 - b'1');
            let bx = i / 3 * 3 + j / 3;
            if rows[i] & bit != 0 || cols[j] & bit != 0 || boxes[bx] & bit != 0 {
                return false;
            }
            rows[i] |= bit;
            cols[j] |= bit;
            boxes[bx] |= bit;
        }
    }
    true
}
```
