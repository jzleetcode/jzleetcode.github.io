---
author: JZ
pubDatetime: 2026-08-21T06:23:00Z
modDatetime: 2026-08-21T06:23:00Z
title: System Design - How CPU Out-of-Order Execution Works
tags:
  - design-system
  - design-hardware
description:
  "How modern CPUs execute instructions out of order: the fetch-decode-rename-dispatch-execute-retire pipeline, register renaming, reservation stations, reorder buffer, and how it all maintains the illusion of sequential execution."
---

## Table of contents

## Context

Imagine you are a chef in a restaurant kitchen. Orders come in one after another: soup, steak, salad. The soup takes 15 minutes to simmer. Do you stand idle waiting for the soup, or do you start chopping salad greens while it simmers?

A CPU faces the same dilemma millions of times per second. Programs are written as sequential instructions — do A, then B, then C. But executing them strictly in order wastes enormous amounts of time. If instruction A needs data from memory (which takes ~100 cycles to arrive), instructions B and C might not depend on A's result at all. Why wait?

**Out-of-order execution** (OoO) is the technique modern CPUs use to solve this. The processor analyzes upcoming instructions, identifies which ones are independent of each other, and executes them as soon as their inputs are ready — regardless of their original program order. When results are produced, the CPU carefully re-orders them so the program sees exactly the behavior it would have seen with strict sequential execution.

This technique was first implemented commercially in the IBM System/360 Model 91 (1967) using Robert Tomasulo's algorithm. Today, every high-performance CPU — Intel Core, AMD Zen, Apple M-series, ARM Cortex-A — uses out-of-order execution. It is arguably the single most important technique that makes modern CPUs fast.

```
             In-Order vs. Out-of-Order Execution

  Program Order:    A (load from memory, ~100 cycles)
                    B (add, depends on A)
                    C (multiply, independent)
                    D (shift, independent)

  In-Order:                          Out-of-Order:

  cycle 1:   A starts               cycle 1:   A starts
  cycle 2:   ... waiting ...         cycle 2:   C executes (independent!)
  cycle 3:   ... waiting ...         cycle 3:   D executes (independent!)
    ...      ... 100 cycles ...        ...      ... waiting for A ...
  cycle 101: A completes             cycle 101: A completes
  cycle 102: B executes              cycle 102: B executes
  cycle 103: C executes
  cycle 104: D executes              Total: 102 cycles (saved 2 cycles)
                                     (In real code, savings are 2-3x)
  Total: 104 cycles
```

## The Pipeline: Bird's Eye View

A modern out-of-order CPU pipeline has roughly these stages:

```
  +-------+    +--------+    +--------+    +----------+    +---------+    +--------+
  | Fetch |===>| Decode |===>| Rename |===>| Dispatch |===>| Execute |===>| Retire |
  +-------+    +--------+    +--------+    +----------+    +---------+    +--------+
       |                          |              |               |              |
   Instruction               Map to          Place in       Run when        Commit
   cache (L1i)               physical        reservation    inputs are      in original
                             registers       stations       ready           program order
```

The front-end (Fetch, Decode, Rename) processes instructions **in order**. The middle (Dispatch, Execute) runs them **out of order**. The back-end (Retire) commits results **in order** again. This "in-order → out-of-order → in-order" sandwich is what preserves correctness.

Let's walk through each stage.

## Stage 1: Fetch

The CPU fetches instructions from the L1 instruction cache, typically 16-32 bytes per cycle (enough for 4-8 x86 instructions or 4-8 ARM instructions). The **branch predictor** guesses which way conditional branches will go so the fetch unit can keep filling the pipeline speculatively.

```
  +------------------+
  |  Branch          |     predicts direction of
  |  Predictor       |---> upcoming branches
  +--------+---------+
           |
           v
  +------------------+       +------------------+
  |  Program Counter |------>|  L1 Instruction  |
  |  (PC)            |       |  Cache           |
  +------------------+       +--------+---------+
                                      |
                              16-32 bytes/cycle
                                      |
                                      v
                             +------------------+
                             |  Fetch Buffer    |
                             +------------------+
```

If the branch predictor is wrong, all speculatively fetched instructions get thrown away (a **pipeline flush**). Modern predictors achieve >95% accuracy on typical code.

## Stage 2: Decode

The decoder translates instructions from the ISA format (x86, ARM) into **micro-operations** (uops). A single complex instruction like `REP MOVSB` (string copy) might decode into dozens of uops, while a simple `ADD` becomes one uop.

On x86, decoding is particularly complex because instructions are variable-length (1-15 bytes). ARM's fixed-width 32-bit instructions are simpler to decode. This is one reason why ARM chips can be more power-efficient — the decode stage uses less energy.

```
  x86 instruction:    ADD [RBX+8], RAX

  Decoded into uops:  (1) LOAD  tmp1 <- [RBX+8]    (memory read)
                      (2) ADD   tmp2 <- tmp1, RAX   (arithmetic)
                      (3) STORE [RBX+8] <- tmp2     (memory write)
```

## Stage 3: Register Renaming

This is the stage that makes out-of-order execution possible. Consider this code:

```asm
  ADD  R1, R2, R3    ; R1 = R2 + R3
  MUL  R1, R4, R5    ; R1 = R4 * R5  (reuses R1!)
  SUB  R6, R1, R7    ; R6 = R1 - R7
```

The ADD and MUL both write to R1. If we try to execute them out of order, we get confused about which R1 is which. This is called a **name dependency** (or **false dependency**) — the conflict is about the register name, not the data.

Register renaming eliminates this by mapping architectural registers (the ones the programmer sees: R1-R15, RAX-R15 on x86) to a much larger set of **physical registers** (typically 128-256 on modern CPUs):

```
  Before renaming:              After renaming:

  ADD  R1, R2, R3               ADD  P47, P12, P33
  MUL  R1, R4, R5               MUL  P48, P14, P35
  SUB  R6, R1, R7               SUB  P49, P48, P37

  R1 is reused (conflict!)      P47 and P48 are different
                                (no conflict, can run in parallel!)
```

The CPU maintains a **Register Alias Table** (RAT) that maps each architectural register to its current physical register:

```
  Register Alias Table (RAT)
  +------+----------+
  | Arch | Physical |
  +------+----------+
  | R1   | P47      |  <-- after ADD, before MUL
  | R1   | P48      |  <-- after MUL (updated)
  | R2   | P12      |
  | R3   | P33      |
  | R4   | P14      |
  | R5   | P35      |
  | R6   | P49      |
  | R7   | P37      |
  +------+----------+
```

When the MUL writes to R1, the RAT is updated to point R1 → P48. The SUB reads R1 and gets P48 (the MUL's result), which is correct. Meanwhile, the ADD's result sits safely in P47 — nothing overwrites it.

### Tomasulo's Algorithm

Robert Tomasulo invented this approach in 1967 for the IBM 360/91's floating-point unit. His key insight: instead of stalling when a register isn't ready, **tag the operand** with the name of the unit that will produce it. When that unit broadcasts its result, every instruction waiting for that tag grabs the value simultaneously.

Modern CPUs use a refined version of Tomasulo's algorithm. The original used a **Common Data Bus** (CDB) for broadcasting results. Today's CPUs use a physical register file with port-based access, but the principle — track producers, wake up consumers — remains identical.

## Stage 4: Dispatch (Issue)

After renaming, each uop enters the **dispatch queue** and is placed into a **reservation station** (RS). A reservation station is a holding area where the uop waits until all its input operands are ready.

```
  Reservation Stations (simplified)
  +-----+--------+--------+--------+--------+---------+
  | Slot|  Op    | Src1   | Src2   | Ready? | Dest    |
  +-----+--------+--------+--------+--------+---------+
  |  0  |  ADD   | P12=42 | P33=7  |  YES   | P47     |
  |  1  |  MUL   | P14=3  | P35=?  |  NO    | P48     |
  |  2  |  LOAD  | P20=?  |  --    |  NO    | P51     |
  |  3  |  SUB   | P48=?  | P37=9  |  NO    | P49     |
  +-----+--------+--------+--------+--------+---------+
         ^                             ^
         |                             |
    waiting for              when all sources
    P35 to be computed       are ready, issue
                             to execution unit
```

Each cycle, the **issue logic** scans the reservation stations and picks the oldest ready uop(s) to send to execution units. This is where out-of-order magic happens: whichever instruction has all its inputs ready goes next, regardless of program order.

Modern CPUs have separate reservation stations (or a unified scheduler) for different execution units: integer ALUs, floating-point units, load/store units, branch units.

## Stage 5: Execute

Execution units do the actual computation. A modern CPU core typically has:

```
  Execution Units (example: Intel Golden Cove / Zen 4 class)
  +--------------------------------------------------+
  |                                                  |
  |  +-------+  +-------+  +-------+  +-------+    |
  |  | ALU 0 |  | ALU 1 |  | ALU 2 |  | ALU 3 |    |  integer arithmetic
  |  +-------+  +-------+  +-------+  +-------+    |
  |                                                  |
  |  +-------+  +-------+                           |
  |  | FP/VEC|  | FP/VEC|                           |  floating point / SIMD
  |  |   0   |  |   1   |                           |
  |  +-------+  +-------+                           |
  |                                                  |
  |  +-------+  +-------+                           |
  |  | LOAD  |  | LOAD  |                           |  memory loads
  |  |   0   |  |   1   |                           |
  |  +-------+  +-------+                           |
  |                                                  |
  |  +-------+                                      |
  |  | STORE |                                      |  memory stores
  |  +-------+                                      |
  |                                                  |
  |  +-------+                                      |
  |  | BRANCH|                                      |  branch resolution
  |  +-------+                                      |
  +--------------------------------------------------+
```

Different operations take different numbers of cycles:
- Integer ADD/SUB/AND/OR: 1 cycle
- Integer MUL: 3 cycles
- Integer DIV: 10-40 cycles
- FP ADD: 3-5 cycles
- FP MUL: 4-5 cycles
- L1 cache hit: 4-5 cycles
- L2 cache hit: ~12 cycles
- L3 cache hit: ~40 cycles
- Main memory: ~100-300 cycles

When an execution unit finishes, it writes the result to the physical register file and broadcasts the physical register tag. Any reservation station entry waiting on that tag wakes up — its operand is now ready.

## Stage 6: Retire (Commit)

Here is where correctness is enforced. The **Reorder Buffer** (ROB) is a circular queue that tracks every in-flight uop in program order. Each entry records whether the uop has finished executing and what result it produced.

```
  Reorder Buffer (circular queue)
  +------+--------+--------+----------+--------+
  | Entry|  Uop   | State  | Result   | Dest   |
  +------+--------+--------+----------+--------+
  |  0   |  ADD   | DONE   | 49       | P47    |  <-- head (oldest)
  |  1   |  MUL   | DONE   | 15       | P48    |
  |  2   |  LOAD  | WAIT   |  ?       | P51    |  <-- stalls retirement
  |  3   |  SUB   | DONE   | 6        | P49    |
  |  4   |  ...   | ...    |  ...     | ...    |
  +------+--------+--------+----------+--------+
                     ^
                     |
  Retirement proceeds from head, in order.
  Entry 2 is not done yet, so entries 3+ cannot retire
  even though they finished executing.
```

Retirement happens **in program order** from the head of the ROB. The CPU retires one or more instructions per cycle (typically 4-8) as long as they are at the head and marked DONE. If the head entry isn't done (e.g., waiting for a cache miss), retirement stalls — but execution continues for later instructions that have their inputs ready.

### Why retire in order?

Three reasons make in-order retirement essential:

1. **Precise exceptions.** If instruction #2 causes a page fault, the CPU must be able to say "instructions 0-1 completed, instruction 2 faulted, instructions 3+ did not happen." Without in-order retirement, you can't draw that clean line.

2. **Branch misprediction recovery.** If a speculated branch turns out wrong, the CPU discards everything after the branch by simply flushing the ROB from that point forward. Instructions that retired before the branch are safe.

3. **Memory ordering.** Stores must become visible to other cores in program order (on x86's TSO model). The ROB ensures stores commit to the cache hierarchy in the right sequence.

## Putting It All Together

Here is the full picture for a small code sequence:

```
  Program:     (1) LOAD  R1, [addr]     ; R1 = memory[addr]
               (2) ADD   R2, R1, #4     ; R2 = R1 + 4
               (3) MUL   R3, R5, R6     ; R3 = R5 * R6 (independent!)
               (4) STORE [addr2], R3    ; memory[addr2] = R3

  Timeline (cycle by cycle):

  Cycle   Fetch    Decode   Rename    RS/Wait    Execute    Retire
  -----   -----    ------   ------    -------    -------    ------
    1      (1)
    2      (2)      (1)
    3      (3)      (2)      (1)
    4      (4)      (3)      (2)       (1)wait
    5               (4)      (3)       (2)wait    (3)MUL starts
    6                        (4)       (4)wait    (3)MUL...
    7                                             (3)MUL done
    ...                                (1)wait   (cache miss)
    ~105                               (1)done!
    106                                           (2)ADD
    107                                                      (1)retire
    108                                           (4)STORE   (2)retire
    109                                                      (3)retire
    110                                                      (4)retire

  Key insight: (3) executed at cycle 5-7, WAY before (1) finished at ~105.
  But (3) retired AFTER (1) and (2) — preserving program order externally.
```

## The Memory Subsystem: Load/Store Queues

Loads and stores need special handling. The CPU maintains a **Load Queue** and **Store Queue** (together called the **Memory Order Buffer** or MOB):

```
  +-------------------+        +-------------------+
  |    Load Queue     |        |   Store Queue     |
  +-------------------+        +-------------------+
  | addr | data | age |        | addr | data | age |
  +------+------+-----+        +------+------+-----+
  | 0x40 |  ?   |  5  |        | 0x80 | 42   |  2  |
  | 0x80 |  ?   |  7  |  <==>  | 0x40 | 99   |  9  |
  +------+------+-----+        +------+------+-----+
         |                             |
         |  Store-to-load forwarding:  |
         |  Load at 0x80 (age 7) sees  |
         |  Store at 0x80 (age 2) and  |
         |  gets value 42 directly     |
         +-----------------------------+
```

**Store-to-load forwarding**: If a younger load reads from an address that an older store has already written (but not yet retired), the load gets the value directly from the store queue — no need to access the cache.

**Memory ordering violations**: Sometimes a load executes before an older store, and later the CPU discovers the store was to the same address. The load got stale data! The CPU must **flush the pipeline** from the load onward and re-execute. This is called a **memory order violation** or **memory disambiguation failure**.

Modern CPUs use a **memory disambiguator** (a predictor, similar to branch prediction) to guess whether a load will conflict with an earlier unresolved store. If the predictor says "probably conflicts," the load waits until the store's address is known.

## Speculative Execution

Out-of-order execution naturally leads to **speculative execution** — the CPU executes instructions before it knows whether they should execute at all:

```
  CMP   R1, #0
  BEQ   skip          ; branch if R1 == 0
  ADD   R2, R3, R4    ; executed speculatively!
  MUL   R5, R6, R7    ; executed speculatively!
skip:
  SUB   R8, R9, R10
```

The branch predictor guesses BEQ will NOT be taken, so the CPU fetches and executes ADD and MUL. If the prediction was right — great, we saved time. If wrong, the ROB flushes everything after the branch, and we restart from `skip:`.

Speculative execution is safe for correctness because results only become architecturally visible at retirement. A speculatively executed instruction writes to a physical register, but that register isn't "committed" to the architectural state until the instruction retires. If it gets flushed, the physical register is simply freed.

### The Spectre Problem

In 2018, researchers discovered that speculative execution leaves **microarchitectural side effects** even when results are discarded. A speculatively executed load brings data into the cache. Even after the speculation is rolled back, the cache timing difference is observable. This is the basis of the Spectre family of attacks:

```
  ; attacker controls 'x' (out-of-bounds index)
  CMP   x, array_size
  BGE   skip                    ; bounds check
  LOAD  R1, array[x]           ; speculative: loads secret
  LOAD  R2, probe[R1 * 4096]   ; speculative: cache line reveals R1
skip:
  ; speculation rolled back, but probe[] timing leaks the secret
```

Mitigations include retpoline (indirect branch isolation), LFENCE (speculation barriers), and microcode patches that limit what speculative loads can do.

## Real-World Implementation: Intel Golden Cove

Intel's Golden Cove core (12th-14th gen, 2021-2024) provides concrete numbers:

```
  Front-end:
    - Fetch: up to 32 bytes/cycle from L1i (64KB, 8-way)
    - Decode: 6 uops/cycle (6-wide decode)
    - uop cache (DSB): 4096 entries, delivers 8 uops/cycle
    - Allocation: 6 uops/cycle into ROB

  Back-end:
    - ROB size: 512 entries
    - Physical registers: 280 integer, 332 vector
    - Reservation stations: ~100+ entries (unified scheduler)
    - Execution ports: 12 (6 ALU/branch, 2 load, 2 store-data, 2 store-addr)
    - Retirement: 8 uops/cycle

  Memory:
    - Load queue: 128 entries
    - Store queue: 72 entries
    - L1d: 48KB, 12-way, 5-cycle latency
    - L2: 1.25MB, 12-cycle latency
```

A ROB of 512 entries means the CPU can have up to 512 instructions "in flight" simultaneously. At a typical IPC (instructions per cycle) of ~4-6, that's roughly 80-120 cycles of work buffered — enough to hide most L2 cache misses and some L3 misses.

## When OoO Breaks Down

Out-of-order execution isn't magic. It struggles when:

1. **Long dependency chains.** If every instruction depends on the previous one, there's nothing to reorder. A linked-list traversal is the classic example — each `LOAD` depends on the previous `LOAD`'s result (pointer chasing).

2. **Branch mispredictions.** A misprediction wastes ~15-20 cycles (the pipeline depth). Code with unpredictable branches (e.g., binary search comparisons) defeats speculation.

3. **Cache misses beyond the ROB window.** If a load misses all caches and takes 300 cycles, and the ROB only holds 512 uops (~100 cycles of work), the ROB fills up and the front-end stalls. This is called a **ROB stall** or **back-pressure stall**.

4. **Store-to-load dependencies with unknown addresses.** When a load might alias with a pending store but the store's address isn't computed yet, the CPU must either speculate (risk a flush) or wait (waste cycles).

```
  Scenarios where OoO helps vs. doesn't:

  GOOD for OoO:                    BAD for OoO:
  +-------------------------+      +-------------------------+
  | Independent operations  |      | Serial dependencies     |
  | (array processing,      |      | (linked list walk,      |
  |  multiple accumulators) |      |  hash chain lookup)     |
  |                         |      |                         |
  | Cache miss + other      |      | Unpredictable branches  |
  | work available          |      | (binary search, vtable  |
  |                         |      |  dispatch)              |
  | Mix of load/compute     |      |                         |
  | instructions            |      | All-cache-miss workload |
  +-------------------------+      +-------------------------+
```

## The Energy Cost

Out-of-order execution is power-hungry. The ROB, reservation stations, register rename logic, and wakeup/select circuits account for roughly 20-30% of a core's power consumption. This is why:

- **In-order cores** (ARM Cortex-A55, Intel Atom) still exist for efficiency-focused workloads. They trade single-thread performance for drastically lower power.
- **Big.LITTLE / hybrid architectures** (Apple's P+E cores, Intel's P+E cores) pair a few powerful OoO cores with many small in-order (or limited-OoO) cores.
- **GPUs** use thousands of in-order cores with hardware threading to hide latency instead of OoO — a fundamentally different approach to the same problem.

## Historical Timeline

```
  1967  IBM System/360 Model 91    Tomasulo's algorithm (first OoO)
  1995  Intel Pentium Pro (P6)     First x86 OoO (ROB + rename + uops)
  1999  AMD Athlon (K7)            AMD's first OoO, competitive with P6
  2003  Intel Pentium 4 (NetBurst) Deep pipeline (31 stages), huge OoO window
  2006  Intel Core (Merom)         Returned to moderate pipeline, better OoO
  2011  ARM Cortex-A15             First widely-deployed ARM OoO core
  2013  Apple A7 (Cyclone)         Surprisingly wide OoO (6-wide decode)
  2017  AMD Zen                    AMD's comeback, competitive OoO design
  2020  Apple M1 (Firestorm)      Largest OoO window in a consumer core
  2021  Intel Golden Cove          512-entry ROB (largest x86 at the time)
  2023  AMD Zen 5                  2x dispatch bandwidth, 448-entry window
```

## References

1. R. Tomasulo, "An Efficient Algorithm for Exploiting Multiple Arithmetic Units" (IBM Journal, 1967) [paper](https://ieeexplore.ieee.org/document/5392028)
2. Intel 64 and IA-32 Architectures Optimization Reference Manual [doc](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
3. Hennessy & Patterson, "Computer Architecture: A Quantitative Approach" (6th ed.), Chapter 3: Instruction-Level Parallelism
4. Agner Fog, "The microarchitecture of Intel, AMD, and VIA CPUs" [doc](https://www.agner.org/optimize/microarchitecture.pdf)
5. Kocher et al., "Spectre Attacks: Exploiting Speculative Execution" (2018) [paper](https://spectreattack.com/spectre.pdf)
6. WikiChip, Intel Golden Cove microarchitecture [wiki](https://en.wikichip.org/wiki/intel/microarchitectures/golden_cove)
7. ARM Cortex-A78 Technical Reference Manual [doc](https://developer.arm.com/documentation/101430/latest)
8. Anandtech, "AMD Zen 4 / Ryzen 7000 Microarchitecture Deep Dive" [article](https://www.anandtech.com/show/17585/amd-zen-4-part-1)
