---
author: JZ
pubDatetime: 2026-09-22T06:00:00Z
modDatetime: 2026-09-22T06:00:00Z
title: System Design - How Diff Algorithms Work
tags:
  - design-algorithm
  - design-system
description:
  "How diff algorithms work: the edit graph model, shortest edit script, Myers' O(ND) algorithm with greedy snakes and D-contours, git's diff strategies (Myers, patience, histogram), and a source code walkthrough of xdiff in the git codebase."
---

## Table of contents

## Context

Every time you run `git diff`, review a pull request, or hit undo in a collaborative editor, a diff algorithm is working behind the scenes. It takes two sequences — usually two versions of a file — and produces the smallest set of changes that transforms one into the other.

The diff problem sounds simple, but the naive approach (try every possible set of edits and pick the smallest one) is exponentially expensive. In 1986, Eugene Myers published a paper that changed everything: **"An O(ND) Difference Algorithm and Its Variations."** His algorithm finds the **shortest edit script** — the minimum number of insertions and deletions — in time proportional to the size of the diff itself, not the size of the files. This is the algorithm `git diff` uses by default.

Let's start by understanding the problem as a graph.

## The Edit Graph

The key insight behind Myers' algorithm is that **diffing two sequences is the same as finding the shortest path through a grid.** Suppose we are comparing two strings:

```
  A = "ABCABBA"    (old, length N = 7)
  B = "CBABAC"     (new, length M = 6)
```

We build a grid with `A` along the x-axis and `B` along the y-axis. Each cell `(x, y)` represents a state: "we have processed `x` characters from A and `y` characters from B."

```
        A   B   C   A   B   B   A
    0   1   2   3   4   5   6   7
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
C 1   |   |   | \ |   |   |   |   |
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
B 2   |   | \ |   |   | \ | \ |   |
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
A 3   | \ |   |   | \ |   |   | \ |
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
B 4   |   | \ |   |   | \ | \ |   |
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
A 5   | \ |   |   | \ |   |   | \ |
  +---+---+---+---+---+---+---+---+
  |   |   |   |   |   |   |   |   |
C 6   |   |   | \ |   |   |   |   |
  +---+---+---+---+---+---+---+---+
```

Three types of moves are possible from any point `(x, y)`:

- **Right** `(x, y) → (x+1, y)`: Delete `A[x+1]` from the old sequence. Cost = 1.
- **Down** `(x, y) → (x, y+1)`: Insert `B[y+1]` into the new sequence. Cost = 1.
- **Diagonal** `(x, y) → (x+1, y+1)`: Only allowed when `A[x+1] == B[y+1]` — the character matches. Cost = 0. These diagonal moves are drawn as `\` in the grid above.

The goal is to get from `(0, 0)` (top-left) to `(N, M)` (bottom-right) with the fewest non-diagonal moves. Each non-diagonal move is one edit (insertion or deletion). The total number of non-diagonal moves is called **D**, the **edit distance**.

A path that uses the maximum number of diagonals produces the **shortest edit script (SES)** and, equivalently, the **longest common subsequence (LCS)**.

## The Shortest Edit Script Problem

Before Myers, the standard approach was dynamic programming. Build an `(N+1) × (M+1)` table where `dp[x][y]` is the minimum edits to reach `(x, y)`. Fill it row by row:

```
dp[x][y] = dp[x-1][y-1]       if A[x] == B[y]  (diagonal, free)
          min(dp[x-1][y],      otherwise
              dp[x][y-1]) + 1  (delete or insert, cost 1)
```

This runs in $O(NM)$ time and space. For two files with 10,000 lines each, that's 100 million operations and 400 MB of memory — workable, but not ideal for a tool that runs on every keystroke.

Myers' insight was that most diffs are **small**. If two files differ by only D lines, we should be able to find the diff in $O(ND)$ time, which is much less than $O(NM)$ when $D \ll N$.

## Myers' O(ND) Algorithm

### Diagonals and the k-line

Myers introduces a coordinate system based on **diagonals**. Define $k = x - y$. Each value of $k$ is a diagonal line running from top-left to bottom-right through the grid:

```
       k=-6  k=-5  k=-4  k=-3  k=-2  k=-1  k=0  k=1  k=2  k=3 ...

  y=0                                              (0,0) (1,0) (2,0) ...
  y=1                                        (0,1) (1,1) (2,1) ...
  y=2                                  (1,2) (2,2) ...
  y=3                            (0,3) (1,3) ...
  ...
```

Every move right increases $k$ by 1 (delete). Every move down decreases $k$ by 1 (insert). Diagonal moves keep $k$ the same. So after exactly $D$ non-diagonal moves, we must be on a diagonal where $k$ has the same parity as $D$.

### The greedy approach: D-contours

Myers' algorithm works in rounds. In round $d$ (from 0 to $D$), it finds the **furthest reaching point** on each diagonal $k$ using exactly $d$ edits. This is called the **D-contour** — the frontier of how far we can reach with $d$ edits.

The algorithm uses a single array `V[-MAX..MAX]` where `V[k]` stores the furthest x-coordinate reached on diagonal $k`.

```python
def myers_diff(A, B):
    N, M = len(A), len(B)
    MAX = N + M

    V = [0] * (2 * MAX + 1)   # V[k] = furthest x on diagonal k
    # V is indexed by k + MAX to handle negative indices

    for d in range(0, MAX + 1):
        for k in range(-d, d + 1, 2):
            # Decide: come from diagonal k-1 (down) or k+1 (right)?
            if k == -d or (k != d and V[k - 1] < V[k + 1]):
                x = V[k + 1]       # move down: x stays, y increases
            else:
                x = V[k - 1] + 1   # move right: x increases

            y = x - k

            # Follow the diagonal (free matches) as far as possible
            while x < N and y < M and A[x] == B[y]:
                x += 1
                y += 1

            V[k] = x

            # Did we reach the end?
            if x >= N and y >= M:
                return d   # edit distance is d

    return -1  # should never reach here
```

### Walking through the example

Let's trace through `A = "ABCABBA"` and `B = "CBABAC"`:

```
  d=0:  k=0   start at (0,0), no match A[0]='A' != B[0]='C'
              V[0] = 0  →  furthest point (0,0)
              Not at (7,6). Continue.

  d=1:  k=-1  from V[0]=0, move down → (0,1), y=1
              match? A[0]='A' != B[1]='B'. Stop.
              V[-1] = 0  →  (0,1)

        k=1   from V[0]=0, move right → (1,0)
              match? A[1]='B' != B[0]='C'. Stop.
              V[1] = 1   →  (1,0)

  d=2:  k=-2  from V[-1]=0, move down → (0,2)
              match? A[0]='A' != B[2]='A'... wait, A[0]='A'==B[2]='A'!
              Actually B = "CBABAC", B[2]='A'. A[0]='A'. Match!
              → (1,3). A[1]='B'==B[3]='B'. Match!
              → (2,4). A[2]='C' != B[4]='A'. Stop.
              V[-2] = 2  →  (2,4)

        k=0   V[-1]=0 vs V[1]=1, V[1] is bigger, move down from k=1
              from V[1]=1, move down → (1,1)
              match? A[1]='B'==B[1]='B'. Match!
              → (2,2). A[2]='C' != B[2]='A'. Stop.
              V[0] = 2   →  (2,2)

        k=2   from V[1]=1, move right → (2,0)
              match? A[2]='C'==B[0]='C'. Match!
              → (3,1). A[3]='A' != B[1]='B'. Stop.
              V[2] = 3   →  (3,1)

  ... (continuing this process)

  d=5:  eventually reaches (7,6). Edit distance = 5.
```

The edit script has 5 edits: delete 3 characters from A and insert 2 from B (or some equivalent combination). Combined with the matches, this gives us the familiar diff output.

### The "snake" metaphor

In Myers' paper, a **snake** is a sequence of moves that starts with one non-diagonal step (right or down) followed by zero or more diagonal steps (matches). Visually, a snake looks like a hockey stick going through the grid:

```
  step right (cost 1)
       \
        \       diagonal (free)
         \
          \
```

Each round of the algorithm extends the furthest-reaching snake on each diagonal by one more non-diagonal step. The greedy strategy — always follow diagonals as far as possible — is what makes the algorithm efficient for small diffs.

## From Edit Script to Unified Diff

The algorithm above finds the edit distance $D$, but we also need the actual edit script. To recover the path, we save the `V` array at each round $d$ and trace back from `(N, M)`:

```python
def myers_diff_with_edits(A, B):
    N, M = len(A), len(B)
    MAX = N + M
    V = {0: 0}
    trace = []

    for d in range(0, MAX + 1):
        trace.append(dict(V))  # save state
        for k in range(-d, d + 1, 2):
            if k == -d or (k != d and V.get(k - 1, 0) < V.get(k + 1, 0)):
                x = V.get(k + 1, 0)
            else:
                x = V.get(k - 1, 0) + 1
            y = x - k
            while x < N and y < M and A[x] == B[y]:
                x += 1
                y += 1
            V[k] = x
            if x >= N and y >= M:
                return backtrack(trace, A, B, d)

def backtrack(trace, A, B, D):
    edits = []
    x, y = len(A), len(B)

    for d in range(D, 0, -1):
        V = trace[d - 1]
        k = x - y

        if k == -d or (k != d and V.get(k - 1, 0) < V.get(k + 1, 0)):
            prev_k = k + 1   # came from a down move (insert)
        else:
            prev_k = k - 1   # came from a right move (delete)

        prev_x = V[prev_k]
        prev_y = prev_x - prev_k

        # Record diagonal matches (in reverse)
        while x > prev_x + (1 if prev_k < k else 0) and y > prev_y + (1 if prev_k > k else 0):
            x -= 1
            y -= 1
            edits.append(('equal', A[x]))

        if prev_k < k:
            edits.append(('delete', A[x - 1]))   # right move = delete
        else:
            edits.append(('insert', B[y - 1]))    # down move = insert

        x = prev_x
        y = prev_y

    # Any remaining diagonal at the start
    while x > 0 and y > 0:
        x -= 1
        y -= 1
        edits.append(('equal', A[x]))

    edits.reverse()
    return edits
```

The trace-back produces a sequence of `(equal, char)`, `(delete, char)`, and `(insert, char)` operations. A diff formatter then groups these into hunks (blocks of changes with surrounding context) and renders the familiar `+` and `-` lines:

```diff
--- a/old.txt
+++ b/new.txt
@@ -1,7 +1,6 @@
-A
-B
 C
+B
 A
 B
-B
 A
+C
```

## How Git Uses Myers' Algorithm

Git's diff engine lives in `xdiff/`, a library originally written by Davide Libenzi. The core Myers implementation is in [`xdiff/xdiffi.c`](https://github.com/git/git/blob/master/xdiff/xdiffi.c). Here is the main loop, simplified:

```c
/*
 * xdl_split() - find the middle snake of the shortest edit path.
 * Uses the "linear space" refinement from Myers' paper:
 * run the algorithm forward from (0,0) and backward from (N,M)
 * until the two frontiers meet in the middle.
 */
int xdl_split(unsigned long const *ha1, long off1, long lim1,
              unsigned long const *ha2, long off2, long lim2,
              long *kvdf, long *kvdb, int need_min,
              xdpsplit_t *spl) {
    long dmin = off1 - lim2, dmax = lim1 - off2;
    long fmid = off1 - off2, bmid = lim1 - lim2;
    /* ... */

    for (ec = 1; ; ec++) {
        /* Forward pass */
        for (d = fmid - ec; d <= fmid + ec; d += 2) {
            /* pick best predecessor, extend snake */
            /* ... */
            if (odd && bmin <= d && d <= bmax && kvdb[d] <= kvdf[d]) {
                /* forward and backward met — found middle snake */
                spl->i1 = kvdf[d];
                spl->i2 = kvdf[d] - d;
                return ec;
            }
        }

        /* Backward pass (mirror image) */
        for (d = bmid - ec; d <= bmid + ec; d += 2) {
            /* ... */
            if (!odd && fmin <= d && d <= fmax && kvdf[d] >= kvdb[d]) {
                /* found middle snake */
                spl->i1 = kvdb[d];
                spl->i2 = kvdb[d] - d;
                return ec;
            }
        }
    }
}
```

Git uses the **linear-space refinement** from Myers' paper. Instead of saving every `V` array (which takes $O(D^2)$ space), it runs the algorithm from both ends simultaneously. The forward scan starts at `(0, 0)` and the backward scan starts at `(N, M)`. When they meet in the middle, the algorithm records the meeting point (the **middle snake**), then recursively solves the two halves. This reduces space from $O(D^2)$ to $O(N + M)$.

### Line hashing

Git does not compare lines character by character in the edit graph. Instead, [`xdiff/xprepare.c`](https://github.com/git/git/blob/master/xdiff/xprepare.c) first hashes each line to a 64-bit integer. The diff algorithm then compares hash values, which is a single integer comparison instead of a string comparison. This is why `xdl_split` takes `ha1` and `ha2` (hash arrays) rather than raw text.

```
  Original files          After preparation

  "int main() {"   →   0x7a3f2b1c...
  "  return 0;"     →   0x4e8d9a0f...
  "}"               →   0x1b2c3d4e...

  Diff algorithm works on hash arrays, not strings.
```

### The `--minimal` flag

By default, git's Myers implementation uses a heuristic to limit search depth when diffs are large. The code checks whether the number of edits exceeds a threshold and, if so, takes the best path found so far even if it is not provably minimal. The `--minimal` flag (`xdl_do_diff(..., XDF_NEED_MINIMAL)`) disables this heuristic, forcing the algorithm to find the true shortest edit script at the cost of potentially much longer runtime.

## Patience Diff

Myers' algorithm optimizes for the shortest edit script, but the shortest edit script is not always the most **readable** diff. Consider this example where a function is being replaced:

```
  // old                    // new
  def foo():               def bar():
      return 1                 return 2
                            
  def bar():
      return 2
```

Myers might match the shared `def bar():` and `return 2` lines in a way that produces a confusing diff — it might show `foo` being renamed to `bar` and the body changing, rather than `foo` being deleted and `bar` already existing.

**Patience diff** (`git diff --patience`) addresses this with a different strategy:

1. Find all lines that appear **exactly once** in both the old and new files.
2. Compute the **Longest Common Subsequence (LCS)** of these unique lines. These become anchors.
3. Recursively diff the regions between the anchors using the same algorithm.

```
  Unique lines in both files:

  Old line 1: "def foo():"      ← unique in old, not in new (skip)
  Old line 2: "    return 1"    ← not unique (appears once but "return" is common)
  Old line 4: "def bar():"      ← unique in both!
  Old line 5: "    return 2"    ← unique? depends on content

  Anchor: "def bar():" is matched first, then regions around it
  are diffed recursively.
```

The result: patience diff tends to align function boundaries and produce diffs that are more natural for code review. It avoids "sliding" matches that make the diff confusing.

Git's patience diff implementation lives in [`xdiff/xpatience.c`](https://github.com/git/git/blob/master/xdiff/xpatience.c).

## Histogram Diff

**Histogram diff** (`git diff --histogram`) is an evolution of patience diff, introduced to git by Bram Cohen's work and refined by the JGit (Java Git) project. It relaxes the "unique lines only" constraint:

1. Build a histogram (occurrence count) of each line in the old file.
2. Find the **lowest-occurrence line** that appears in both files — the rarest shared line is the best anchor.
3. Match that line, then recursively diff the regions around it.

This is faster than patience diff in practice because it avoids the LCS computation and handles files with few unique lines better. It is the default diff algorithm in JGit and is popular for large repositories.

The implementation is in [`xdiff/xhistogram.c`](https://github.com/git/git/blob/master/xdiff/xhistogram.c).

### Comparing the strategies

```
  Algorithm      Time           Quality              When to use
  ----------    -----------    ------------------    ----------------------
  Myers         O(ND)          Minimal edits,        Default. Good for most
  (default)                    may slide hunks       files.

  Patience      O(N log N      Better alignment      Code with clear
                + ND)          at function/block      structure (functions,
                               boundaries             classes).

  Histogram     O(N + ND)      Similar to patience,  Large files, repos
                               faster in practice     with few unique lines.
```

You can set a default for your repository:

```bash
git config diff.algorithm histogram
```

## The Linear Space Trick: Divide and Conquer

The full Myers algorithm with backtracking needs to store the `V` array for every round $d$, totaling $O(D^2)$ space. For a diff with thousands of edits, this is significant. The linear-space refinement trades time for space:

1. Run the forward algorithm from `(0, 0)` and the backward algorithm from `(N, M)`.
2. When the two frontiers overlap, you have found the **middle snake** — the meeting point.
3. Record the middle snake. Now recursively solve the two halves:
   - Top-left to start of middle snake
   - End of middle snake to bottom-right

```
  +---+---+---+---+---+---+---+---+
  |  \                              |
  |    \   Forward frontier         |
  |      \  ─ ─ ─ ─ ─>             |
  |        \          |             |
  +- - - - -\=========/- - - - - - +
  |           \ middle \            |
  |            \ snake  \           |
  +- - - - - - -\========\- - - - -+
  |               |        \        |
  |    <─ ─ ─ ─ ─          \       |
  |     Backward frontier    \      |
  |                            \    |
  +---+---+---+---+---+---+---+\--+
```

Each recursive call processes half the grid but only needs $O(N + M)$ space for the two `V` arrays. The total time is still $O(ND)$ (each edit is discovered exactly once), but space drops to $O(N + M)$.

This is the version git uses — the `xdl_split` function shown earlier implements this divide-and-conquer approach.

## Performance in Practice

For typical source code diffs (small $D$ relative to $N$), Myers' algorithm is essentially linear: $O(N + D^2)$, where the $D^2$ term is negligible. This is why `git diff` feels instant even on large files.

```
  File size     Edit distance    Myers time    DP time
  (N lines)     (D edits)         O(ND)         O(N^2)
  ----------   --------------   -----------   -----------
  1,000         10               10,000        1,000,000
  10,000        50               500,000       100,000,000
  100,000       100              10,000,000    10,000,000,000
```

The advantage is dramatic: for a 100,000-line file with 100 changed lines, Myers is 1,000× faster than the DP approach.

However, for **completely different files** (where $D \approx N + M$), Myers degrades to $O(N \times M)$ — the same as DP. Git's heuristic cutoffs prevent this from causing hangs in practice.

## References

1. Myers, E. "An O(ND) Difference Algorithm and Its Variations" (1986) [paper](http://www.xmailserver.org/diff2.pdf)
2. Git's xdiff library — Myers implementation [`xdiff/xdiffi.c`](https://github.com/git/git/blob/master/xdiff/xdiffi.c)
3. Git's xdiff library — patience diff [`xdiff/xpatience.c`](https://github.com/git/git/blob/master/xdiff/xpatience.c)
4. Git's xdiff library — histogram diff [`xdiff/xhistogram.c`](https://github.com/git/git/blob/master/xdiff/xhistogram.c)
5. Git's xdiff library — line preparation and hashing [`xdiff/xprepare.c`](https://github.com/git/git/blob/master/xdiff/xprepare.c)
6. Bram Cohen, "Patience Diff Advantages" [blog](https://bramcohen.livejournal.com/73318.html)
7. James Coglan, "The Myers Diff Algorithm" [blog series](https://blog.jcoglan.com/2017/02/12/the-myers-diff-algorithm-part-1/)
8. `diff` — GNU diffutils [manual](https://www.gnu.org/software/diffutils/manual/)
