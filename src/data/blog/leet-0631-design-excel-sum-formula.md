---
author: JZ
pubDatetime: 2026-04-04T06:00:00Z
modDatetime: 2026-04-04T06:00:00Z
title: LeetCode 631 Design Excel Sum Formula
featured: true
tags:
  - a-design
  - a-graph
  - a-dfs
  - a-topological-sort
  - c-airbnb
  - leetcode-locked
description:
  "Solutions for LeetCode 631, hard, tags: design, graph, depth-first search, topological sort."
---

## Table of contents

## Description

Design an Excel-like spreadsheet that supports:

- `set(row, column, val)` - assign a raw value to one cell.
- `get(row, column)` - return the current displayed value of one cell.
- `sum(row, column, numbers)` - replace the target cell with a formula and return its current value.

Each string in `numbers` is either:

- a single cell reference like `A1`
- or a range like `A1:B2`

Ranges are inclusive, and overlapping ranges count with multiplicity. For example, if a formula is `["A1", "A1:B2"]`, then `A1` contributes twice.

You may assume there are no circular references.

```
Example:

Excel(3, "C")
set(1, "A", 2)
sum(3, "C", ["A1", "A1:B2"]) -> 4
set(2, "B", 2)
get(3, "C") -> 6

Explanation:
Initially A1 = 2 and the other referenced cells are 0, so
  C3 = A1 + (A1 + B1 + A2 + B2) = 2 + (2 + 0 + 0 + 0) = 4
After setting B2 = 2,
  C3 = 2 + (2 + 0 + 0 + 2) = 6
```

**Constraints:**

- `1 <= height <= 26`
- `'A' <= width <= 'Z'`
- `1 <= row <= height`
- `'A' <= column <= width`
- `-100 <= val <= 100`
- `1 <= numbers.length <= 5`
- `numbers[i]` is either `ColRow` or `ColRow:ColRow`
- Every referenced cell stays inside the sheet bounds.
- There are no circular references.
- At most `100` calls will be made to `set`, `get`, and `sum`.

## Idea

This problem looks like a 2D range-sum problem at first, but the real difficulty is that `sum()` creates a **persistent formula cell**. After a later `set()`, all downstream formulas must reflect the change.

That gives us two natural designs:

1. **Eager update**: cache every cell's displayed value and propagate deltas through a dependency graph.
2. **Lazy evaluation**: store formulas only, and recompute a cell by DFS when `get()` is called.

The first one is the main solution here because repeated reads become `O(1)`, which is much closer to how a real spreadsheet behaves.

### Solution 1: Weighted Dependency Graph + Cached Values

For each cell, store:

- its current displayed value
- if it is a formula cell, a weighted map of source cells it depends on
- reverse edges from a source cell to all formula cells that depend on it

The reverse edges are the key to fast updates.

If `C1 = A1 + A1:B1`, then the formula really means:

```
A1 --x2--> C1
B1 --x1--> C1
```

If later `A1` increases by `+3`, then `C1` must increase by `+6`.

The weighted edges also handle:

- repeated references like `["A1", "A1"]`
- overlapping ranges like `["A1:B2", "B2:C3"]`

When `set()` or `sum()` overwrites a formula cell, we must first remove its old reverse edges. Otherwise stale dependencies would keep pushing future updates into the wrong cells.

For propagation, we treat the downstream formula graph as a DAG and process it in topological order:

```
A1 changes by +3

A1 --x2--> C1 --x1--> A2
B1 --x1--> C1
B1 --------x1-------> A2

delta(C1) = +6
delta(A2) = +6
```

#### Complexity

Let:

- `H * W` = sheet size
- `k` = number of direct cell occurrences in the new formula after expanding ranges
- `k_old` = number of direct cell occurrences in the old formula being replaced
- `V_a, E_a` = number of reachable downstream formula cells / dependency edges touched by one propagation
- `F` = total weighted formula references stored across the sheet

Operation costs:

- `set`: remove old formula edges in `O(k_old)`, then propagate in `O(V_a + E_a)`, so total `O(k_old + V_a + E_a)`
- `get`: `O(1)`
- `sum`: parse and store the new formula in `O(k)`, clear old edges in `O(k_old)`, compute the new value in `O(k)`, then propagate in `O(V_a + E_a)`, so total `O(k_old + k + V_a + E_a)`
- Space: `O(HW + F)`

Even though we store both forward formula refs and reverse dependency refs, the asymptotic space stays `O(HW + F)`; the reverse map only increases the constant factor.

### Solution 2: Lazy DFS Evaluation

The simpler alternative is:

- raw cells store their literal value
- formula cells store only their weighted source map
- `get()` recursively evaluates a target cell

That is a direct expression-evaluation view:

```
get(A2)
  -> eval(C1)
       -> eval(A1)
       -> eval(B1)
  -> eval(B1)
```

We add memoization inside one `get()` call so shared subtrees are only evaluated once per query.

This version is much easier to write, but repeated reads can be expensive because nothing is cached across updates.

#### Complexity

Let:

- `V_t, E_t` = number of formula cells / dependency edges in the transitive subgraph needed to evaluate one target cell
- `k` = direct size of the just-written formula after expanding ranges
- `F` = total stored weighted formula refs

Operation costs:

- `set`: `O(1)`
- `get`: `O(V_t + E_t)` with per-call memoization
- `sum`: storing the formula is `O(k)`, and it must immediately return the cell value, so total `O(k + V_t + E_t)`
- Space: persistent `O(HW + F)`, plus `O(V_t)` temporary memo / recursion stack per `get()`

### Complexity Comparison

| Operation | Solution 1: eager graph + cached values | Solution 2: lazy DFS |
| --- | --- | --- |
| `set` | `O(k_old + V_a + E_a)` | `O(1)` |
| `get` | `O(1)` | `O(V_t + E_t)` |
| `sum` | `O(k_old + k + V_a + E_a)` | `O(k + V_t + E_t)` |
| Space | `O(HW + F)` | `O(HW + F)` persistent, `O(V_t)` extra per query |

So the real trade-off is:

- **Solution 1**: expensive writes, cheap reads
- **Solution 2**: cheap writes, expensive reads

Because spreadsheets are read all the time, the eager design is the better main solution.

### Why Not 2D BIT / Segment Tree?

A `2D BIT` or `2D segment tree` would be a great fit if the problem were only:

- point updates on a numeric grid
- rectangle-sum queries on that grid

Then we could support both operations in roughly `O(log H * log W)`.

But `631` is harder because `sum()` does **not** ask a one-time query. It creates a formula cell that must keep updating after future edits.

The hard part is dependency maintenance:

- which formulas depend on `B2`?
- how do we remove stale edges when a formula is overwritten?
- how do we count repeated references and overlapping ranges correctly?
- how do we propagate updates through formula-to-formula chains?

So a `2D BIT` or `2D segment tree` alone cannot solve the core problem. The dependency graph is still the primary structure.

A hybrid design is possible in theory, but for this problem it is overkill. Once formulas can depend on formulas, the graph bookkeeping dominates the implementation complexity anyway.

### Java

```java
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

public final class ExcelSum {
    private ExcelSum() {}

    public interface Spreadsheet {
        void set(int row, char column, int val);
        int get(int row, char column);
        int sum(int row, char column, String[] numbers);
    }

    private static long cellId(int row, int col) {
        return ((long) row << 32) | (col & 0xffffffffL);
    }

    private static int parseColumnPrefix(String ref, int endExclusive) {
        int value = 0;
        for (int i = 0; i < endExclusive; i++) {
            value = value * 26 + ref.charAt(i) - 'A' + 1;
        }
        return value - 1;
    }

    private static int[] parseRef(String ref) {
        int idx = 0;
        while (idx < ref.length() && Character.isLetter(ref.charAt(idx))) {
            idx++;
        }
        return new int[] {
                Integer.parseInt(ref.substring(idx)) - 1,
                parseColumnPrefix(ref, idx)
        };
    }

    private static Map<Long, Integer> parseFormula(String[] numbers) {
        Map<Long, Integer> refs = new HashMap<>();
        for (String token : numbers) {
            if (!token.contains(":")) {
                int[] cell = parseRef(token);
                refs.merge(cellId(cell[0], cell[1]), 1, Integer::sum);
                continue;
            }
            String[] parts = token.split(":", 2);
            int[] startCell = parseRef(parts[0]);
            int[] endCell = parseRef(parts[1]);
            for (int row = startCell[0]; row <= endCell[0]; row++) {
                for (int col = startCell[1]; col <= endCell[1]; col++) {
                    refs.merge(cellId(row, col), 1, Integer::sum);
                }
            }
        }
        return refs;
    }

    private static int[] unpack(long id) {
        return new int[] {(int) (id >>> 32), (int) id};
    }

// Main solution: cached values + weighted reverse dependency graph.
public static final class Excel implements Spreadsheet {
    private final int[][] values;
    private final Map<Long, Map<Long, Integer>> formulas = new HashMap<>();
    private final Map<Long, Map<Long, Integer>> dependents = new HashMap<>();

    public Excel(int height, char width) {
        int cols = width - 'A' + 1;
        this.values = new int[height][cols];
    }

    public void set(int row, char column, int val) {
        int r = row - 1, c = column - 'A';
        long target = cellId(r, c);
        int oldValue = values[r][c];
        clearFormula(target);
        values[r][c] = val;
        propagate(target, val - oldValue);
    }

    public int get(int row, char column) {
        return values[row - 1][column - 'A'];
    }

    public int sum(int row, char column, String[] numbers) {
        int r = row - 1, c = column - 'A';
        long target = cellId(r, c);
        int oldValue = values[r][c];
        clearFormula(target);

        Map<Long, Integer> refs = parseFormula(numbers);
        formulas.put(target, refs);
        for (Map.Entry<Long, Integer> e : refs.entrySet()) {
            dependents.computeIfAbsent(e.getKey(), k -> new HashMap<>())
                    .merge(target, e.getValue(), Integer::sum);
        }

        int newValue = 0;
        for (Map.Entry<Long, Integer> e : refs.entrySet()) {
            int[] src = unpack(e.getKey());
            newValue += values[src[0]][src[1]] * e.getValue();
        }
        values[r][c] = newValue;
        propagate(target, newValue - oldValue);
        return newValue;
    }

    private void clearFormula(long target) {
        Map<Long, Integer> refs = formulas.remove(target);
        if (refs == null) return;
        for (Map.Entry<Long, Integer> e : refs.entrySet()) {
            long src = e.getKey();
            Map<Long, Integer> dep = dependents.get(src);
            int next = dep.getOrDefault(target, 0) - e.getValue();
            if (next == 0) dep.remove(target);
            else dep.put(target, next);
            if (dep.isEmpty()) dependents.remove(src);
        }
    }

    private Set<Long> collectAffected(long start) {
        Set<Long> affected = new HashSet<>();
        Queue<Long> queue = new ArrayDeque<>();
        queue.add(start);
        while (!queue.isEmpty()) {
            long src = queue.poll();
            for (long dst : dependents.getOrDefault(src, Map.of()).keySet()) {
                if (affected.add(dst)) queue.add(dst);
            }
        }
        return affected;
    }

    private void propagate(long start, int delta) {
        if (delta == 0 || !dependents.containsKey(start)) return;
        Set<Long> affected = collectAffected(start);
        if (affected.isEmpty()) return;

        Map<Long, Integer> indegree = new HashMap<>();
        for (long cell : affected) indegree.put(cell, 0);
        for (long src : affected) {
            for (long dst : dependents.getOrDefault(src, Map.of()).keySet()) {
                if (indegree.containsKey(dst)) indegree.put(dst, indegree.get(dst) + 1);
            }
        }
        for (long dst : dependents.getOrDefault(start, Map.of()).keySet()) {
            if (indegree.containsKey(dst)) indegree.put(dst, indegree.get(dst) + 1);
        }

        Map<Long, Integer> accumulated = new HashMap<>();
        accumulated.put(start, delta);
        Queue<Long> queue = new ArrayDeque<>();
        queue.add(start);
        while (!queue.isEmpty()) {
            long src = queue.poll();
            int acc = accumulated.getOrDefault(src, 0);
            for (Map.Entry<Long, Integer> edge : dependents.getOrDefault(src, Map.of()).entrySet()) {
                long dst = edge.getKey();
                if (!indegree.containsKey(dst)) continue;
                accumulated.merge(dst, acc * edge.getValue(), Integer::sum);
                indegree.put(dst, indegree.get(dst) - 1);
                if (indegree.get(dst) == 0) {
                    int[] rc = unpack(dst);
                    values[rc[0]][rc[1]] += accumulated.get(dst);
                    queue.add(dst);
                }
            }
        }
    }
}
```

```java
// Alternative: store formulas only, evaluate by DFS on get().
public static final class ExcelLazy implements Spreadsheet {
    private final int[][] values;
    private final Map<Long, Map<Long, Integer>> formulas = new HashMap<>();

    public ExcelLazy(int height, char width) {
        int cols = width - 'A' + 1;
        this.values = new int[height][cols];
    }

    public void set(int row, char column, int val) {
        int r = row - 1, c = column - 'A';
        formulas.remove(cellId(r, c));
        values[r][c] = val;
    }

    public int get(int row, char column) {
        return evaluate(cellId(row - 1, column - 'A'), new HashMap<>());
    }

    public int sum(int row, char column, String[] numbers) {
        long target = cellId(row - 1, column - 'A');
        formulas.put(target, parseFormula(numbers));
        return get(row, column);
    }

    private int evaluate(long cell, Map<Long, Integer> memo) {
        if (memo.containsKey(cell)) return memo.get(cell);
        Map<Long, Integer> refs = formulas.get(cell);
        if (refs == null) {
            int[] rc = unpack(cell);
            return values[rc[0]][rc[1]];
        }
        int total = 0;
        for (Map.Entry<Long, Integer> e : refs.entrySet()) {
            total += evaluate(e.getKey(), memo) * e.getValue();
        }
        memo.put(cell, total);
        return total;
    }
}
}
```

### Python

```python
# Main solution: cached values + weighted dependency graph.
from collections import Counter, defaultdict, deque

type Cell = tuple[int, int]


class _ExcelBase:
    @staticmethod
    def _parse_column(column: str) -> int:
        value = 0
        for char in column:
            value = value * 26 + ord(char) - ord("A") + 1
        return value

    def _cell(self, row: int, column: str) -> Cell:
        return row - 1, self._parse_column(column) - 1

    def _parse_ref(self, ref: str) -> Cell:
        idx = 0
        while idx < len(ref) and ref[idx].isalpha():
            idx += 1
        return int(ref[idx:]) - 1, self._parse_column(ref[:idx]) - 1

    def _parse_formula(self, numbers: list[str]) -> Counter[Cell]:
        refs: Counter[Cell] = Counter()
        for token in numbers:
            if ":" not in token:
                refs[self._parse_ref(token)] += 1
                continue
            start_ref, end_ref = token.split(":")
            start_row, start_col = self._parse_ref(start_ref)
            end_row, end_col = self._parse_ref(end_ref)
            for row in range(start_row, end_row + 1):
                for col in range(start_col, end_col + 1):
                    refs[(row, col)] += 1
        return refs


class Excel(_ExcelBase):
    def __init__(self, height: int, width: str):
        self.rows = height
        self.cols = self._parse_column(width)
        self.values = [[0] * self.cols for _ in range(self.rows)]
        self.formulas: dict[Cell, Counter[Cell]] = {}
        self.dependents: defaultdict[Cell, Counter[Cell]] = defaultdict(Counter)

    def set(self, row: int, column: str, val: int) -> None:
        target = self._cell(row, column)
        old_value = self.values[target[0]][target[1]]
        self._clear_formula(target)
        self.values[target[0]][target[1]] = val
        self._propagate(target, val - old_value)

    def get(self, row: int, column: str) -> int:
        target = self._cell(row, column)
        return self.values[target[0]][target[1]]

    def sum(self, row: int, column: str, numbers: list[str]) -> int:
        target = self._cell(row, column)
        old_value = self.values[target[0]][target[1]]
        self._clear_formula(target)

        refs = self._parse_formula(numbers)
        self.formulas[target] = refs
        for src, weight in refs.items():
            self.dependents[src][target] += weight

        new_value = sum(self.values[r][c] * weight for (r, c), weight in refs.items())
        self.values[target[0]][target[1]] = new_value
        self._propagate(target, new_value - old_value)
        return new_value

    def _clear_formula(self, target: Cell) -> None:
        refs = self.formulas.pop(target, None)
        if not refs:
            return
        for src, weight in refs.items():
            self.dependents[src][target] -= weight
            if self.dependents[src][target] == 0:
                del self.dependents[src][target]
            if not self.dependents[src]:
                del self.dependents[src]

    def _collect_affected(self, start: Cell) -> set[Cell]:
        affected: set[Cell] = set()
        queue = deque([start])
        while queue:
            src = queue.popleft()
            for dst in self.dependents.get(src, {}):
                if dst not in affected:
                    affected.add(dst)
                    queue.append(dst)
        return affected

    def _propagate(self, start: Cell, delta: int) -> None:
        if delta == 0 or start not in self.dependents:
            return

        affected = self._collect_affected(start)
        indegree = {cell: 0 for cell in affected}
        for src in [start, *affected]:
            for dst in self.dependents.get(src, {}):
                if dst in indegree:
                    indegree[dst] += 1

        accumulated = defaultdict(int)
        accumulated[start] = delta
        queue = deque([start])
        while queue:
            src = queue.popleft()
            for dst, weight in self.dependents.get(src, {}).items():
                if dst not in indegree:
                    continue
                accumulated[dst] += accumulated[src] * weight
                indegree[dst] -= 1
                if indegree[dst] == 0:
                    self.values[dst[0]][dst[1]] += accumulated[dst]
                    queue.append(dst)
```

```python
# Alternative: store formulas only, evaluate by DFS on get().
class Excel2(_ExcelBase):
    def __init__(self, height: int, width: str):
        self.rows = height
        self.cols = self._parse_column(width)
        self.values = [[0] * self.cols for _ in range(self.rows)]
        self.formulas: dict[Cell, Counter[Cell]] = {}

    def set(self, row: int, column: str, val: int) -> None:
        target = self._cell(row, column)
        self.formulas.pop(target, None)
        self.values[target[0]][target[1]] = val

    def get(self, row: int, column: str) -> int:
        return self._evaluate(self._cell(row, column), {})

    def sum(self, row: int, column: str, numbers: list[str]) -> int:
        target = self._cell(row, column)
        self.formulas[target] = self._parse_formula(numbers)
        return self.get(row, column)

    def _evaluate(self, cell: Cell, memo: dict[Cell, int]) -> int:
        if cell in memo:
            return memo[cell]
        if cell not in self.formulas:
            return self.values[cell[0]][cell[1]]

        total = 0
        for src, weight in self.formulas[cell].items():
            total += self._evaluate(src, memo) * weight
        memo[cell] = total
        return total
```

### C++

```cpp
#include <cstdint>
#include <deque>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

using RefWeights = std::unordered_map<long long, int>;

long long cellKey(int row, int col) {
    return (static_cast<long long>(row) << 32) | static_cast<std::uint32_t>(col);
}

void unpackCell(long long key, int &row, int &col) {
    row = static_cast<int>(key >> 32);
    col = static_cast<int>(static_cast<std::uint32_t>(key & 0xffffffffLL));
}

int parseColumnWidth(const std::string &width) {
    int value = 0;
    for (char ch : width) value = value * 26 + static_cast<int>(ch - 'A') + 1;
    return value;
}

std::pair<int, int> cellFromRc(int row1, const std::string &colLetters) {
    return {row1 - 1, parseColumnWidth(colLetters) - 1};
}

std::pair<int, int> parseRef(const std::string &ref) {
    size_t idx = 0;
    while (idx < ref.size() && ref[idx] >= 'A' && ref[idx] <= 'Z') ++idx;
    int row = std::stoi(ref.substr(idx)) - 1;
    int col = parseColumnWidth(ref.substr(0, idx)) - 1;
    return {row, col};
}

RefWeights parseFormula(const std::vector<std::string> &tokens) {
    RefWeights refs;
    for (const std::string &token : tokens) {
        auto colon = token.find(':');
        if (colon == std::string::npos) {
            auto [row, col] = parseRef(token);
            refs[cellKey(row, col)] += 1;
            continue;
        }
        auto [sr, sc] = parseRef(token.substr(0, colon));
        auto [er, ec] = parseRef(token.substr(colon + 1));
        for (int r = sr; r <= er; ++r) {
            for (int c = sc; c <= ec; ++c) {
                refs[cellKey(r, c)] += 1;
            }
        }
    }
    return refs;
}

// Main solution: cached values + weighted reverse dependency graph.
class Solution {
public:
    Solution(int height, std::string width)
        : values_(height, std::vector<int>(parseColumnWidth(width), 0)) {}

    void set(int row, std::string column, int val) {
        auto [r, c] = cellFromRc(row, column);
        long long target = cellKey(r, c);
        int oldValue = values_[r][c];
        clearFormula(target);
        values_[r][c] = val;
        propagate(target, val - oldValue);
    }

    int get(int row, std::string column) {
        auto [r, c] = cellFromRc(row, column);
        return values_[r][c];
    }

    int sum(int row, std::string column, std::vector<std::string> numbers) {
        auto [r, c] = cellFromRc(row, column);
        long long target = cellKey(r, c);
        int oldValue = values_[r][c];
        clearFormula(target);

        auto refs = parseFormula(numbers);
        formulas_[target] = refs;
        for (auto &[src, weight] : refs) dependents_[src][target] += weight;

        int newValue = 0;
        for (auto &[src, weight] : refs) {
            int sr, sc;
            unpackCell(src, sr, sc);
            newValue += values_[sr][sc] * weight;
        }
        values_[r][c] = newValue;
        propagate(target, newValue - oldValue);
        return newValue;
    }

private:
    std::vector<std::vector<int>> values_;
    std::unordered_map<long long, std::unordered_map<long long, int>> formulas_;
    std::unordered_map<long long, std::unordered_map<long long, int>> dependents_;

    void clearFormula(long long target) {
        auto it = formulas_.find(target);
        if (it == formulas_.end()) return;
        for (auto &[src, weight] : it->second) {
            auto &depMap = dependents_[src];
            depMap[target] -= weight;
            if (depMap[target] == 0) depMap.erase(target);
            if (depMap.empty()) dependents_.erase(src);
        }
        formulas_.erase(it);
    }

    std::vector<long long> collectAffected(long long start) {
        std::unordered_set<long long> seen;
        std::deque<long long> q{start};
        std::vector<long long> affected;
        while (!q.empty()) {
            long long src = q.front();
            q.pop_front();
            auto it = dependents_.find(src);
            if (it == dependents_.end()) continue;
            for (auto &[dst, _] : it->second) {
                if (seen.insert(dst).second) {
                    affected.push_back(dst);
                    q.push_back(dst);
                }
            }
        }
        return affected;
    }

    void propagate(long long start, int delta) {
        if (delta == 0 || !dependents_.contains(start)) return;
        auto affected = collectAffected(start);
        if (affected.empty()) return;

        std::unordered_map<long long, int> indegree;
        for (long long cell : affected) indegree[cell] = 0;

        std::vector<long long> sources{start};
        sources.insert(sources.end(), affected.begin(), affected.end());
        for (long long src : sources) {
            auto it = dependents_.find(src);
            if (it == dependents_.end()) continue;
            for (auto &[dst, _] : it->second) {
                if (indegree.contains(dst)) ++indegree[dst];
            }
        }

        std::unordered_map<long long, long long> accumulated;
        accumulated[start] = delta;
        std::deque<long long> q{start};
        while (!q.empty()) {
            long long src = q.front();
            q.pop_front();
            auto it = dependents_.find(src);
            if (it == dependents_.end()) continue;
            for (auto &[dst, weight] : it->second) {
                if (!indegree.contains(dst)) continue;
                accumulated[dst] += accumulated[src] * weight;
                if (--indegree[dst] == 0) {
                    int r, c;
                    unpackCell(dst, r, c);
                    values_[r][c] += static_cast<int>(accumulated[dst]);
                    q.push_back(dst);
                }
            }
        }
    }
};
```

```cpp
// Alternative: store formulas only, evaluate by DFS on get().
class Solution2 {
public:
    Solution2(int height, std::string width)
        : values_(height, std::vector<int>(parseColumnWidth(width), 0)) {}

    void set(int row, std::string column, int val) {
        auto [r, c] = cellFromRc(row, column);
        formulas_.erase(cellKey(r, c));
        values_[r][c] = val;
    }

    int get(int row, std::string column) {
        std::unordered_map<long long, int> memo;
        auto [r, c] = cellFromRc(row, column);
        return evaluate(cellKey(r, c), memo);
    }

    int sum(int row, std::string column, std::vector<std::string> numbers) {
        auto [r, c] = cellFromRc(row, column);
        formulas_[cellKey(r, c)] = parseFormula(numbers);
        return get(row, column);
    }

private:
    std::vector<std::vector<int>> values_;
    std::unordered_map<long long, std::unordered_map<long long, int>> formulas_;

    int evaluate(long long cell, std::unordered_map<long long, int> &memo) {
        if (memo.contains(cell)) return memo[cell];
        if (!formulas_.contains(cell)) {
            int r, c;
            unpackCell(cell, r, c);
            return values_[r][c];
        }
        int total = 0;
        for (auto &[src, weight] : formulas_[cell]) {
            total += evaluate(src, memo) * weight;
        }
        return memo[cell] = total;
    }
};
```

### Rust

```rust
// Main solution: cached values + weighted reverse dependency graph.
use std::collections::{HashMap, VecDeque};

type Cell = (usize, usize);

fn parse_column(s: &str) -> usize {
    let mut value = 0usize;
    for ch in s.chars() {
        value = value * 26 + (ch as u8 - b'A' + 1) as usize;
    }
    value
}

fn cell(row: i32, column: &str) -> Cell {
    ((row - 1) as usize, parse_column(column) - 1)
}

fn parse_ref(reference: &str) -> Cell {
    let mut idx = 0usize;
    let bytes = reference.as_bytes();
    while idx < bytes.len() && bytes[idx].is_ascii_alphabetic() {
        idx += 1;
    }
    let row = reference[idx..].parse::<i32>().unwrap() - 1;
    let col = parse_column(&reference[..idx]) - 1;
    (row as usize, col)
}

fn parse_formula(numbers: &[String]) -> HashMap<Cell, i32> {
    let mut refs = HashMap::new();
    for token in numbers {
        if let Some((start, end)) = token.split_once(':') {
            let (sr, sc) = parse_ref(start);
            let (er, ec) = parse_ref(end);
            for r in sr..=er {
                for c in sc..=ec {
                    *refs.entry((r, c)).or_insert(0) += 1;
                }
            }
        } else {
            *refs.entry(parse_ref(token)).or_insert(0) += 1;
        }
    }
    refs
}

pub struct Solution {
    values: Vec<Vec<i32>>,
    formulas: HashMap<Cell, HashMap<Cell, i32>>,
    dependents: HashMap<Cell, HashMap<Cell, i32>>,
}

impl Solution {
    pub fn new(height: i32, width: &str) -> Self {
        let rows = height as usize;
        let cols = parse_column(width);
        Self {
            values: vec![vec![0; cols]; rows],
            formulas: HashMap::new(),
            dependents: HashMap::new(),
        }
    }

    pub fn set(&mut self, row: i32, column: &str, val: i32) {
        let target = cell(row, column);
        let old = self.values[target.0][target.1];
        self.clear_formula(target);
        self.values[target.0][target.1] = val;
        self.propagate(target, val - old);
    }

    pub fn get(&self, row: i32, column: &str) -> i32 {
        let t = cell(row, column);
        self.values[t.0][t.1]
    }

    pub fn sum(&mut self, row: i32, column: &str, numbers: Vec<String>) -> i32 {
        let target = cell(row, column);
        let old = self.values[target.0][target.1];
        self.clear_formula(target);

        let refs = parse_formula(&numbers);
        for (src, &weight) in &refs {
            *self.dependents.entry(*src).or_default().entry(target).or_insert(0) += weight;
        }
        self.formulas.insert(target, refs.clone());

        let new_value: i32 = refs
            .iter()
            .map(|(src, w)| self.values[src.0][src.1] * w)
            .sum();
        self.values[target.0][target.1] = new_value;
        self.propagate(target, new_value - old);
        new_value
    }

    fn clear_formula(&mut self, target: Cell) {
        let Some(refs) = self.formulas.remove(&target) else { return; };
        for (src, weight) in refs {
            if let Some(dm) = self.dependents.get_mut(&src) {
                let entry = dm.entry(target).or_insert(0);
                *entry -= weight;
                if *entry == 0 {
                    dm.remove(&target);
                }
                if dm.is_empty() {
                    self.dependents.remove(&src);
                }
            }
        }
    }

    fn collect_affected(&self, start: Cell) -> HashMap<Cell, ()> {
        let mut affected = HashMap::new();
        let mut q = VecDeque::from([start]);
        while let Some(src) = q.pop_front() {
            if let Some(dsts) = self.dependents.get(&src) {
                for dst in dsts.keys() {
                    if affected.contains_key(dst) {
                        continue;
                    }
                    affected.insert(*dst, ());
                    q.push_back(*dst);
                }
            }
        }
        affected
    }

    fn propagate(&mut self, start: Cell, delta: i32) {
        if delta == 0 || !self.dependents.contains_key(&start) {
            return;
        }
        let affected = self.collect_affected(start);
        if affected.is_empty() {
            return;
        }

        let mut indegree: HashMap<Cell, usize> = affected.keys().map(|&c| (c, 0)).collect();
        let mut nodes = vec![start];
        nodes.extend(affected.keys().copied());
        for src in &nodes {
            if let Some(dsts) = self.dependents.get(src) {
                for dst in dsts.keys() {
                    if let Some(deg) = indegree.get_mut(dst) {
                        *deg += 1;
                    }
                }
            }
        }

        let mut accumulated = HashMap::from([(start, delta)]);
        let mut queue = VecDeque::from([start]);
        let mut value_deltas = HashMap::new();
        while let Some(src) = queue.pop_front() {
            let acc = *accumulated.get(&src).unwrap_or(&0);
            if let Some(dsts) = self.dependents.get(&src) {
                for (dst, &weight) in dsts {
                    if !indegree.contains_key(dst) {
                        continue;
                    }
                    *accumulated.entry(*dst).or_insert(0) += acc * weight;
                    let deg = indegree.get_mut(dst).unwrap();
                    *deg -= 1;
                    if *deg == 0 {
                        value_deltas.insert(*dst, *accumulated.get(dst).unwrap_or(&0));
                        queue.push_back(*dst);
                    }
                }
            }
        }
        for (dst, add) in value_deltas {
            self.values[dst.0][dst.1] += add;
        }
    }
}
```

```rust
// Alternative: store formulas only, evaluate by DFS on get().
pub struct Solution2 {
    values: Vec<Vec<i32>>,
    formulas: HashMap<Cell, HashMap<Cell, i32>>,
}

impl Solution2 {
    pub fn new(height: i32, width: &str) -> Self {
        let rows = height as usize;
        let cols = parse_column(width);
        Self {
            values: vec![vec![0; cols]; rows],
            formulas: HashMap::new(),
        }
    }

    pub fn set(&mut self, row: i32, column: &str, val: i32) {
        let target = cell(row, column);
        self.formulas.remove(&target);
        self.values[target.0][target.1] = val;
    }

    pub fn get(&self, row: i32, column: &str) -> i32 {
        let mut memo = HashMap::new();
        self.evaluate(cell(row, column), &mut memo)
    }

    pub fn sum(&mut self, row: i32, column: &str, numbers: Vec<String>) -> i32 {
        let target = cell(row, column);
        self.formulas.insert(target, parse_formula(&numbers));
        self.get(row, column)
    }

    fn evaluate(&self, cell: Cell, memo: &mut HashMap<Cell, i32>) -> i32 {
        if let Some(&v) = memo.get(&cell) {
            return v;
        }
        if !self.formulas.contains_key(&cell) {
            return self.values[cell.0][cell.1];
        }
        let mut total = 0;
        for (src, &weight) in &self.formulas[&cell] {
            total += self.evaluate(*src, memo) * weight;
        }
        memo.insert(cell, total);
        total
    }
}
```
