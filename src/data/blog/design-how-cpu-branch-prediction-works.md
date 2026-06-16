---
author: JZ
pubDatetime: 2026-06-16T08:00:00Z
modDatetime: 2026-06-16T08:00:00Z
title: System Design - How CPU Branch Prediction Works
tags:
  - design-system
  - design-hardware
description:
  "How modern CPUs predict branch outcomes: pipeline stalls, static vs dynamic prediction, branch history tables, two-level adaptive predictors, branch target buffers, and real-world performance implications with code examples."
---

## Table of contents

## Context

Modern CPUs don't execute one instruction at a time. They use a technique called **pipelining** — breaking each instruction into stages (fetch, decode, execute, write-back) and overlapping them like an assembly line. A 15-stage pipeline (common in modern x86 cores) can have 15 instructions in flight simultaneously.

This works beautifully for sequential code. But what happens at a branch — an `if`, `for`, `while`, or `switch`?

```
    Instruction stream:

    0x100:  cmp  rax, 10
    0x104:  jle  0x120       <-- branch: go to 0x120, or fall through to 0x108?
    0x108:  mov  rbx, 1      <-- "not taken" path
    0x10C:  ...
      ...
    0x120:  mov  rbx, 2      <-- "taken" path
    0x124:  ...
```

The CPU has already fetched instructions beyond the branch before it even knows the comparison result. If it fetched the wrong path, it must **flush the pipeline** — throw away all that speculative work and start over from the correct path. On a 15-stage pipeline, that's potentially 15 wasted cycles.

```
  Pipeline stages for a branch instruction:

  Clock cycle:   1    2    3    4    5    6    7    8   ...  15
                 +----+----+----+----+----+----+----+----+---+----+
  branch instr:  | F  | D  | E  | ... (result known here)        |
                 +----+----+----+----+----+----+----+----+---+----+
  next instr 1:  |    | F  | D  | E  | <-- wasted if wrong path  |
  next instr 2:  |    |    | F  | D  | <-- wasted if wrong path  |
  next instr 3:  |    |    |    | F  | <-- wasted if wrong path  |
                 +----+----+----+----+----+----+----+----+---+----+

  If mispredicted: flush pipeline, restart from correct target
  Penalty: ~15 cycles on modern CPUs (varies by microarchitecture)
```

Branch prediction is the CPU's solution: **guess** which way the branch will go, and start executing that path speculatively. If the guess is right, the pipeline keeps flowing without interruption. If wrong, pay the flush penalty.

Modern predictors achieve **95–99% accuracy** on typical workloads. The difference between 95% and 99% is enormous: in a loop that iterates a million times, 95% accuracy means 50,000 pipeline flushes vs. 10,000.

## Static Prediction: Simple Rules

The simplest prediction strategies require no history at all:

**Always predict "not taken"** — assume the branch falls through. This is what the earliest pipelined processors (like MIPS R2000) did. It works well for error-checking branches (`if (error) goto handle_error`) since errors are rare.

**Backward taken, forward not taken (BTFNT)** — assume backward branches (loops) are taken and forward branches are not. Loop branches jump backward to the loop head, so this heuristic captures the common case. Intel's Pentium used BTFNT as a fallback.

```
  Static prediction heuristics:

  +------------------+     branch target < branch address?
  |  Branch at 0x200 |     (i.e., jumping backward?)
  +--------+---------+
           |
     +-----+-----+
     |           |
     v           v
   YES          NO
  (backward)   (forward)
     |           |
     v           v
  Predict     Predict
  TAKEN       NOT TAKEN
  (loop       (error check,
   back)       unlikely path)
```

Static prediction gives roughly **60–70% accuracy**. Not bad, but not good enough for modern out-of-order processors that suffer heavily from mispredictions.

## Dynamic Prediction: Learning from History

Dynamic predictors observe what a branch did in the past and use that to predict its future. The key insight: **branch behavior is often repetitive**. A loop branch is taken N−1 times then not-taken once. A data-dependent branch may follow a pattern tied to the data structure it's iterating.

### The Two-Bit Saturating Counter

The foundational building block is a **two-bit saturating counter** — a tiny state machine with four states:

```
                    Two-Bit Saturating Counter

          taken              taken              taken
    +---+       +---+              +---+              +---+
    |   v       |   v              |   v              |   v
  +-------+   +-------+        +---------+        +---------+
  |  00   |   |  01   |        |   10    |        |   11    |
  |Strongly|   |Weakly |        | Weakly  |        |Strongly |
  |  Not   |-->|  Not  |------->| Taken   |------->| Taken   |
  | Taken  |   | Taken |        |         |        |         |
  +-------+   +-------+        +---------+        +---------+
    ^   |       ^   |              ^   |              ^   |
    +---+       +---+              +---+              +---+
  not taken   not taken          not taken          not taken

  Prediction:  NOT TAKEN          |           TAKEN
               (states 00, 01)    |    (states 10, 11)
```

Why two bits instead of one? A one-bit counter flips prediction after every misprediction. Consider a loop that iterates 100 times: it's taken 99 times, then not-taken once at the exit. A one-bit predictor would mispredict **twice** per loop iteration — once at the exit, and once re-entering the loop. A two-bit counter only mispredicts once, at the exit, because the single "not taken" only moves it from "strongly taken" to "weakly taken."

### Branch History Table (BHT)

A **Branch History Table** (also called a Pattern History Table) is an array of two-bit counters, indexed by some bits of the branch's program counter (PC):

```
  Branch History Table (BHT)
  Indexed by lower bits of branch PC

  Branch PC: 0x7FFA0104
                     ||||
                     vvvv
  Index = lower N bits of PC (e.g., bits [9:2])

  +-------+-------------------+
  | Index | 2-bit counter     |
  +-------+-------------------+
  |  000  |  11 (ST)          |
  |  001  |  01 (WN)          |
  |  010  |  10 (WT)          |  <-- this entry
  |  011  |  11 (ST)          |
  |  ...  |  ...              |
  |  255  |  00 (SN)          |
  +-------+-------------------+

  ST = Strongly Taken,  WT = Weakly Taken
  WN = Weakly Not-Taken, SN = Strongly Not-Taken
```

When the CPU encounters a branch:
1. Hash the PC to get a table index.
2. Read the counter: if >= 2 (states 10 or 11), predict taken; otherwise not-taken.
3. After the branch resolves, update the counter: increment on taken, decrement on not-taken (saturating at 0 and 3).

Problem: different branches can **alias** to the same table entry, polluting each other's counters. This is handled with larger tables and better hashing (XOR with global history).

## Two-Level Adaptive Prediction

Simple BHTs can't capture **patterns**. Consider:

```c
for (int i = 0; i < 4; i++) { ... }
```

The loop branch follows the pattern TTTN (taken, taken, taken, not-taken) repeating forever. A two-bit counter will always mispredict the "not-taken" at the exit. A two-level predictor can learn this pattern perfectly.

### The Idea: Correlate with Recent History

A two-level predictor uses a **Branch History Register (BHR)** — a shift register that records the last K outcomes (taken/not-taken) of recent branches:

```
  Two-Level Adaptive Predictor

  Step 1: Record recent branch outcomes in a shift register

  Branch History Register (BHR): K bits wide
  +---+---+---+---+---+---+---+---+
  | T | T | N | T | T | T | N | T |   (T=taken, N=not-taken)
  +---+---+---+---+---+---+---+---+
    ^                           ^
    newest                    oldest

  Step 2: Use BHR to index into a Pattern History Table (PHT)

  BHR value (e.g., 8 bits) = index into PHT
                |
                v
  +-------+-------------------+
  | Index | 2-bit counter     |
  +-------+-------------------+
  | 0x00  |  ...              |
  | ...   |  ...              |
  | 0xAD  |  11 (predict T)   |  <-- BHR = 10101101
  | ...   |  ...              |
  | 0xFF  |  ...              |
  +-------+-------------------+

  Each unique history pattern maps to its own counter.
  The TTTN loop gets its own PHT entry that learns "after TTT, predict N."
```

This is the **GAs** (global history, all branches, single PHT) predictor described by Yeh and Patt in 1991. Variants include:
- **GAg**: Global history, one shared PHT (simple, prone to aliasing)
- **GAp**: Global history, per-address PHTs (less aliasing, more hardware)
- **PAg**: Per-address history registers, one shared PHT
- **PAp**: Per-address everything (most accurate, most expensive)

### gshare: The Practical Compromise

Scott McFarling's **gshare** (1993) is elegantly simple and still forms the basis of modern predictors. It XORs the global branch history with the branch PC to index a single table of two-bit counters:

```
  gshare predictor

  Global History Register (GHR):  10110101  (last 8 branch outcomes)
  Branch PC (lower bits):         01001010

  XOR them together:
    10110101
  ^ 01001010
  ----------
    11111111  = index into PHT

  +-------+-------------------+
  | Index | 2-bit counter     |
  +-------+-------------------+
  | ...   |                   |
  | 0xFF  |  10 (predict T)   |  <-- use this counter
  | ...   |                   |
  +-------+-------------------+

  Why XOR? It spreads entries across the table, reducing aliasing
  between branches that share the same PC bits but have different
  histories.
```

gshare captures both **per-branch** patterns (via PC bits) and **inter-branch correlations** (via global history). For example, if branch B is almost always taken after branch A is not-taken, gshare learns this because the GHR encodes A's outcome when B is encountered.

## The Branch Target Buffer (BTB)

Predicting taken vs. not-taken is only half the problem. For taken branches, the CPU also needs to know **where** to fetch from — the target address. The **Branch Target Buffer** is a cache that maps branch PCs to their targets:

```
  Branch Target Buffer (BTB)

  +------------------+------------------+------+
  |  Branch PC (tag) |  Target Address  | Type |
  +------------------+------------------+------+
  |  0x7FFA0104      |  0x7FFA0080      | Cond |
  |  0x7FFA0200      |  0x7FFA1000      | Call |
  |  0x7FFA0300      |  (varies)        | Ret  |  <-- indirect
  +------------------+------------------+------+

  Lookup happens in parallel with instruction fetch:
  - If hit and predicted taken: fetch from target address next cycle
  - If miss: assume not a branch, fetch sequentially
```

For **indirect branches** (function pointers, virtual calls, `switch` via jump tables), the target changes at runtime. Modern CPUs use an **Indirect Target Array** — essentially a BTB indexed by history — to predict these.

For **return instructions**, CPUs maintain a **Return Address Stack (RAS)** — a small hardware stack that pushes the return address on every `call` and pops on every `ret`. This is nearly perfect for well-behaved call/return pairs.

## Tournament Predictors: Best of Both Worlds

Different predictors excel at different branch patterns. A **tournament predictor** (also called a hybrid predictor) runs multiple predictors in parallel and uses a **chooser** (another array of two-bit counters) to select which one to trust for each branch:

```
  Tournament Predictor (e.g., Alpha 21264)

  +-------------------+       +-------------------+
  |  Local Predictor  |       | Global Predictor  |
  | (per-branch       |       | (gshare-style,    |
  |  history + PHT)   |       |  inter-branch     |
  |                   |       |  correlations)    |
  +--------+----------+       +---------+---------+
           |                            |
           v                            v
      prediction L                 prediction G
           |                            |
           +----------+    +------------+
                      |    |
                      v    v
              +------------------+
              |    Chooser       |
              | (2-bit counters  |
              |  per branch)     |
              +--------+---------+
                       |
                       v
                Final prediction

  Chooser update rule:
  - If L correct and G wrong: decrement (favor L)
  - If G correct and L wrong: increment (favor G)
  - If both right or both wrong: no change
```

The Alpha 21264 processor (1998) famously used this design with a 1K-entry local predictor and a 4K-entry global predictor, achieving over 95% accuracy.

## TAGE: The State of the Art

Modern high-performance CPUs (Intel since Haswell, AMD since Zen) use **TAGE** (TAgged GEometric history length) predictors, proposed by André Seznec in 2006.

The key insight: different branches need different amounts of history. A tight loop needs only 4 bits of history, while a branch that depends on a distant earlier branch might need 200+ bits. TAGE uses **multiple tables with geometrically increasing history lengths**:

```
  TAGE Predictor Structure

  History lengths: 0, 4, 8, 16, 32, 64, 128, 256 (geometric series)

  +----------+   +----------+   +----------+   +----------+   +----------+
  |  Base    |   | Table 1  |   | Table 2  |   | Table 3  |   | Table 4  |
  | Predictor|   | hist=4   |   | hist=8   |   | hist=16  |   | hist=32  |  ...
  | (bimodal)|   |          |   |          |   |          |   |          |
  +----+-----+   +----+-----+   +----+-----+   +----+-----+   +----+-----+
       |              |              |              |              |
       v              v              v              v              v
    pred_0         pred_1         pred_2         pred_3         pred_4
       |              |              |              |              |
       +-------+------+------+------+------+------+
               |
               v
        Use the prediction from the LONGEST matching
        history table (highest confidence)

  Each tagged table entry:
  +------+--------+----------+--------+
  | tag  | ctr    | useful   | (pad)  |
  | 10b  | 3b     | 2b       |        |
  +------+--------+----------+--------+

  tag:    partial tag to detect aliasing
  ctr:    prediction counter (like 2-bit, but 3-bit)
  useful: how valuable this entry is (for replacement)
```

TAGE achieves **~96% accuracy** on SPEC benchmarks and over **99%** on many real workloads. Its tagged design means aliasing is detected (tag mismatch = no prediction from that table), and the geometric history lengths mean it naturally adapts to each branch's needs.

## Real-World Impact: A Famous Example

The most cited branch prediction example comes from a Stack Overflow answer that went viral. Consider sorting an array and then branching on each element:

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>

int main() {
    const int SIZE = 32768;
    int data[SIZE];

    srand(time(NULL));
    for (int i = 0; i < SIZE; i++)
        data[i] = rand() % 256;

    // Try with sorted data (predictable branches)
    // vs unsorted data (unpredictable branches)
    // qsort(data, SIZE, sizeof(int), compare);

    long long sum = 0;
    for (int t = 0; t < 100000; t++) {
        for (int i = 0; i < SIZE; i++) {
            if (data[i] >= 128)  // <-- this branch
                sum += data[i];
        }
    }
    printf("sum = %lld\n", sum);
    return 0;
}
```

Results on a typical x86 machine:

```
  Sorted data:    ~5 seconds    (branch is predictable: NNNN...NTTT...T)
  Unsorted data:  ~15 seconds   (branch is random: TNTNNTTN...)

  3x slowdown entirely from branch mispredictions!
```

With sorted data, the branch follows a pattern: all "not taken" for values < 128, then all "taken" for values >= 128. The predictor learns this in a few iterations and achieves near-perfect accuracy.

With unsorted data, each branch outcome is essentially random (50/50). No predictor can do better than ~50% accuracy on truly random data. The result: roughly half the branches mispredict, causing pipeline flushes.

The branchless alternative avoids the problem entirely:

```c
// Branchless: no branch to predict
int t = (data[i] - 128) >> 31;  // t = 0 if data[i] >= 128, -1 otherwise
sum += ~t & data[i];             // add data[i] if t == 0
```

## Spectre: When Prediction Becomes a Vulnerability

Branch prediction's speculative nature led to **Spectre** (2018), one of the most significant hardware vulnerabilities ever discovered. The attack exploits a subtle property: even though mispredicted instructions are "rolled back," they leave traces in the CPU cache.

```
  Spectre Attack (variant 1, bounds check bypass):

  // Attacker trains the predictor: x is always in-bounds
  for (many iterations) { victim_function(valid_x); }

  // Then attacker calls with out-of-bounds x
  victim_function(malicious_x);

  void victim_function(size_t x) {
      if (x < array1_size) {             // <-- predictor says TAKEN
          // Speculatively executes with malicious_x:
          y = array2[array1[x] * 256];   // loads secret, caches array2 line
      }
  }

  // After rollback: array2 cache state reveals the secret byte
  // Attacker probes array2 with timing to extract array1[malicious_x]
```

The fix isn't to disable prediction (that would destroy performance). Instead, mitigations include:
- **Retpolines**: Replace indirect branches with a construct that "traps" the predictor into an infinite loop, preventing speculative execution down attacker-controlled paths.
- **IBRS/STIBP**: Microcode updates that restrict indirect branch prediction across privilege boundaries.
- **Compiler barriers**: `lfence` instructions that serialize execution at critical points.

## Writing Prediction-Friendly Code

While compilers and hardware handle most cases, there are patterns that help:

1. **Sort data before branching on it** — creates long runs of same-direction branches.
2. **Use branchless alternatives** — `cmov`, bitwise tricks, `?:` that compilers turn into conditional moves.
3. **Use `__builtin_expect`** — hints the compiler to lay out code so the common path is fall-through:
   ```c
   if (__builtin_expect(error_condition, 0)) {
       handle_error();  // compiler puts this out-of-line
   }
   ```
4. **Avoid data-dependent branches in hot loops** — replace `if (x > threshold)` with arithmetic equivalents when possible.
5. **Profile with `perf stat`** — check actual misprediction rates:
   ```bash
   perf stat -e branches,branch-misses ./my_program
   # Output shows total branches and misprediction rate
   ```

## Summary

```
  Evolution of Branch Prediction

  Era         Technique             Accuracy    Used In
  ---------   -------------------   --------    ------------------
  1980s       Static (BTFNT)        60-70%      MIPS, SPARC
  Early 90s   2-bit BHT             80-85%      i486, Pentium
  Mid 90s     Two-level / gshare    90-93%      Pentium Pro, Alpha
  Late 90s    Tournament            95-97%      Alpha 21264, P4
  2000s+      TAGE                  96-99%      Haswell+, Zen+
  2020s       Perceptron hybrids    97-99.5%    Apple M-series
```

Branch prediction is one of those invisible mechanisms that makes modern computing fast. A 15-stage pipeline running at 5 GHz can execute billions of instructions per second — but only if the predictor keeps the pipeline fed with correct-path instructions. The 50+ years of research in this area have produced remarkably effective solutions, turning what could be a crippling performance bottleneck into a nearly transparent optimization.

## References

1. J. E. Smith, "A study of branch prediction strategies," ISCA 1981 — the foundational paper on two-bit counters.
2. T.-Y. Yeh and Y. N. Patt, "Two-Level Adaptive Training Branch Prediction," MICRO 1991 — introduced two-level adaptive prediction.
3. S. McFarling, "Combining Branch Predictors," DEC WRL Technical Note TN-36, 1993 — introduced gshare and hybrid/tournament predictors.
4. A. Seznec, "A 256 Kbits L-TAGE branch predictor," JILP 2006 — the TAGE predictor used in modern CPUs.
5. P. Kocher et al., "Spectre Attacks: Exploiting Speculative Execution," IEEE S&P 2019 — the Spectre vulnerability paper.
6. Intel 64 and IA-32 Architectures Optimization Reference Manual, Chapter 3 — Intel's official guidance on branch prediction behavior.
7. Agner Fog, "The microarchitecture of Intel, AMD, and VIA CPUs" — detailed reverse-engineering of branch predictor implementations.
