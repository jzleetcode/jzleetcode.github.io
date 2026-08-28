---
author: JZ
pubDatetime: 2026-08-28T19:00:00Z
modDatetime: 2026-08-28T19:00:00Z
title: System Design - How CPU SIMD and Vector Instructions Work
tags:
  - design-system
  - design-hardware
description:
  "How CPU SIMD (Single Instruction, Multiple Data) works: the evolution from MMX to AVX-512, register layouts, data-parallel execution, auto-vectorization, intrinsics, and real-world source code examples from databases and machine learning libraries."
---

## Table of contents

## Context

Imagine you are writing a program that adds two arrays of 1,000 integers. The straightforward code looks like:

```c
for (int i = 0; i < 1000; i++) {
    c[i] = a[i] + b[i];
}
```

On a scalar processor, this loop runs 1,000 iterations — one addition per clock cycle (ideally). But modern CPUs have **wide registers** that can hold multiple integers at once. If a register is 256 bits wide and each integer is 32 bits, you can pack 8 integers into one register and add all 8 in a single instruction. Your 1,000-iteration loop now finishes in ~125 iterations.

This is **SIMD** — Single Instruction, Multiple Data. One instruction operates on many data elements simultaneously. It is the simplest form of parallelism your CPU offers: no threads, no synchronization, no operating system involvement. Just wider hardware.

```
   Scalar addition (one element at a time)
   =========================================

   Register A:  [ 3 ]           (32 bits)
   Register B:  [ 7 ]           (32 bits)
                -----
   Result:      [ 10 ]          1 addition per instruction


   SIMD addition (eight elements at a time, 256-bit AVX2)
   ======================================================

   YMM0:  [ 3 | 1 | 4 | 1 | 5 | 9 | 2 | 6 ]    (8 x 32 bits = 256 bits)
   YMM1:  [ 7 | 2 | 8 | 3 | 1 | 4 | 1 | 5 ]    (8 x 32 bits = 256 bits)
           ---------------------------------
   YMM2:  [ 10| 3 | 12| 4 | 6 | 13| 3 | 11]    8 additions per instruction
```

SIMD matters enormously in practice. Databases use it to scan billions of rows per second. Machine learning frameworks use it for matrix multiplication. Video codecs, compression algorithms, cryptography, and image processing all depend on it.

## Flynn's Taxonomy: Where SIMD Fits

Michael Flynn classified computer architectures in 1966 by how they handle instructions and data:

```
                    Single Data          Multiple Data
                 +------------------+------------------+
  Single Instr.  |      SISD        |      SIMD        |
                 |  (traditional    |  (vector units,  |
                 |   scalar CPU)    |   GPU cores)     |
                 +------------------+------------------+
  Multiple Instr.|      MISD        |      MIMD        |
                 |  (rare, e.g.     |  (multi-core     |
                 |   fault-tolerant)|   CPUs, clusters)|
                 +------------------+------------------+
```

Most CPUs today are **MIMD** at the core level (multiple cores, each running independent instructions) but also have **SIMD** units within each core. So a modern 8-core CPU with AVX2 is doing MIMD + SIMD simultaneously: 8 cores, each processing 8 floats per vector instruction, for 64 floats in flight at once.

## The Evolution of x86 SIMD

Intel and AMD have extended x86 SIMD capabilities across decades. Each generation widens the registers and adds new operations:

```
  Year   Extension   Register Width   Register Names     Key Additions
  ----   ---------   --------------   ---------------    -------------------------
  1997   MMX         64-bit           MM0-MM7            Integer ops (shared with x87!)
  1999   SSE         128-bit          XMM0-XMM7          Floating-point, new registers
  2001   SSE2        128-bit          XMM0-XMM15 (x64)   Double-precision, integer
  2004   SSE3        128-bit          (same)             Horizontal add, complex math
  2006   SSSE3       128-bit          (same)             Shuffle, alignment helpers
  2008   SSE4.1/4.2  128-bit         (same)             Blend, string ops, CRC32
  2011   AVX         256-bit          YMM0-YMM15         Wider FP, 3-operand encoding
  2013   AVX2        256-bit          (same)             Integer widened to 256-bit
  2016   AVX-512     512-bit          ZMM0-ZMM31         Masking, scatter/gather
  2023   AVX10/APX   128/256-bit      ZMM0-ZMM31         Unified, per-core flexibility
```

The key insight: **each new generation is a superset**. AVX2 includes all of SSE4.2. Code written for SSE2 still runs on AVX-512 hardware — the processor just uses the lower portion of the wider registers.

```
  ZMM0 (512 bits) — AVX-512
  +---------------------------------------------------------------+
  |                                                               |
  |  YMM0 (256 bits) — AVX/AVX2                                  |
  |  +-----------------------------+                              |
  |  |                             |                              |
  |  |  XMM0 (128 bits) — SSE     |                              |
  |  |  +----------+              |                              |
  |  |  |          |              |                              |
  |  |  +----------+              |                              |
  |  +-----------------------------+                              |
  +---------------------------------------------------------------+
```

## Register Layout and Data Types

A SIMD register is just a bag of bits. The instruction you use determines how those bits are interpreted. The same 128-bit XMM register can hold:

```
  XMM0 interpreted as 16 x 8-bit integers (bytes):
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
  |b0|b1|b2|b3|b4|b5|b6|b7|b8|b9|bA|bB|bC|bD|bE|bF|
  +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+

  XMM0 interpreted as 8 x 16-bit integers (shorts):
  +-----+-----+-----+-----+-----+-----+-----+-----+
  | s0  | s1  | s2  | s3  | s4  | s5  | s6  | s7  |
  +-----+-----+-----+-----+-----+-----+-----+-----+

  XMM0 interpreted as 4 x 32-bit integers or floats:
  +-----------+-----------+-----------+-----------+
  |    i0     |    i1     |    i2     |    i3     |
  +-----------+-----------+-----------+-----------+

  XMM0 interpreted as 2 x 64-bit doubles or longs:
  +-----------------------+-----------------------+
  |         d0            |         d1            |
  +-----------------------+-----------------------+

  XMM0 interpreted as 1 x 128-bit value:
  +-----------------------------------------------+
  |                  entire value                  |
  +-----------------------------------------------+
```

This flexibility is powerful. A string comparison instruction treats the register as 16 bytes. A physics simulation treats it as 4 floats. No type casting is needed — just use the right instruction.

## How SIMD Execution Works in Hardware

Inside the CPU, SIMD instructions flow through the same pipeline as scalar instructions (fetch, decode, execute, retire). The difference is in the **execution units**:

```
  Instruction Fetch & Decode (same as scalar)
          |
          v
  +-------------------+
  |  Scheduler /      |
  |  Reservation Stn  |     picks ready instructions
  +--------+----------+
           |
           v
  +--------+----------+    +------------------+
  | Scalar ALU (64b)  |    |  SIMD ALU (256b) |    <-- physically wider
  | ADD, SUB, MUL     |    |  VPADDD, VADDPS  |
  +-------------------+    +------------------+
           |                        |
           v                        v
  +-------------------+    +------------------+
  |  Scalar result    |    |  Vector result   |
  |  (1 value)        |    |  (8 values)      |
  +-------------------+    +------------------+
```

The SIMD ALU is physically wider — it has 8 adder circuits in parallel instead of 1. This is not magic: Intel/AMD literally spend more transistors to build wider datapaths. The tradeoff is chip area and power consumption, which is why AVX-512 causes some CPUs to reduce their clock frequency (called **frequency throttling**) when executing heavy 512-bit workloads.

### Port Pressure and Throughput

Modern CPUs have multiple execution ports. On Intel's Golden Cove microarchitecture (Alder Lake/Raptor Lake):

```
  Port 0: SIMD ALU (256-bit), scalar ALU, branch
  Port 1: SIMD ALU (256-bit), scalar ALU
  Port 5: SIMD ALU (256-bit), shuffle, permute
  Port 2/3: Load (256-bit each, can combine for 512-bit)
  Port 4/9: Store data
  Port 7/8: Store address
```

A `VPADDD` (packed 32-bit add) can execute on ports 0, 1, or 5 — meaning up to 3 vector additions can issue per clock cycle. That is $3 \times 8 = 24$ integer additions per cycle from a single core.

## Programming with SIMD: Three Approaches

### 1. Auto-Vectorization (Compiler Does the Work)

The simplest approach: write scalar code and let the compiler figure it out.

```c
// The compiler can auto-vectorize this loop
void add_arrays(int* __restrict__ c, const int* a, const int* b, int n) {
    for (int i = 0; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
```

With `gcc -O2 -mavx2`, GCC generates AVX2 instructions automatically. The `__restrict__` keyword promises that pointers don't alias (overlap), which enables vectorization.

You can check what the compiler did:

```bash
gcc -O2 -mavx2 -S -o - add.c | grep vpadd
# Output: vpaddd  %ymm1, %ymm0, %ymm2    <-- vectorized!
```

Auto-vectorization is convenient but fragile. Complex loop bodies, data dependencies, or non-contiguous memory access patterns can prevent it. Use `-fopt-info-vec-missed` (GCC) or `-Rpass-missed=loop-vectorize` (Clang) to see why loops were not vectorized.

### 2. Intrinsics (You Control the Instructions)

Intrinsics are C functions that map directly to specific SIMD instructions. They give you full control:

```c
#include <immintrin.h>  // AVX2 intrinsics

void add_arrays_avx2(int* c, const int* a, const int* b, int n) {
    int i = 0;
    // Process 8 integers at a time
    for (; i + 7 < n; i += 8) {
        // Load 8 integers from a[] into a 256-bit register
        __m256i va = _mm256_loadu_si256((__m256i*)(a + i));
        // Load 8 integers from b[]
        __m256i vb = _mm256_loadu_si256((__m256i*)(b + i));
        // Add all 8 pairs in parallel
        __m256i vc = _mm256_add_epi32(va, vb);
        // Store the 8 results back to c[]
        _mm256_storeu_si256((__m256i*)(c + i), vc);
    }
    // Handle remaining elements (< 8) with scalar code
    for (; i < n; i++) {
        c[i] = a[i] + b[i];
    }
}
```

The naming convention for Intel intrinsics is systematic:

```
  _mm256_add_epi32
   |  |    |   |
   |  |    |   +-- element type: epi32 = signed 32-bit integer
   |  |    +------ operation: add
   |  +----------- register width: 256 (YMM)
   +-------------- prefix: always _mm (Intel convention)

  Width prefixes:        Element types:
    _mm     = 128-bit      ps     = packed single-precision float
    _mm256  = 256-bit      pd     = packed double-precision float
    _mm512  = 512-bit      epi8   = signed 8-bit integer
                           epi16  = signed 16-bit integer
                           epi32  = signed 32-bit integer
                           epi64  = signed 64-bit integer
                           epu8   = unsigned 8-bit integer
                           si128  = raw 128-bit (no type)
                           si256  = raw 256-bit
```

### 3. Inline Assembly (Maximum Control, Minimum Portability)

For the rare case where intrinsics don't give you what you need:

```c
void add_avx2_asm(int* c, const int* a, const int* b) {
    __asm__ __volatile__(
        "vmovdqu (%1), %%ymm0\n"   // load 8 ints from a
        "vmovdqu (%2), %%ymm1\n"   // load 8 ints from b
        "vpaddd %%ymm1, %%ymm0, %%ymm2\n"  // add
        "vmovdqu %%ymm2, (%0)\n"   // store to c
        :
        : "r"(c), "r"(a), "r"(b)
        : "ymm0", "ymm1", "ymm2", "memory"
    );
}
```

This is rarely necessary — intrinsics cover nearly all use cases and the compiler handles register allocation for you.

## Real-World Example: SIMD String Search in ClickHouse

ClickHouse, the columnar database, uses SIMD extensively for string operations. Here is a simplified version of how it finds a byte in a buffer (similar to `memchr`), from [`src/Common/memcmpSmall.h`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Common/memcmpSmall.h):

```cpp
// Find first occurrence of 'needle' byte in 'haystack'
// Using SSE4.2 — processes 16 bytes per iteration
inline const char* sse42_strstr_byte(const char* haystack, size_t n, char needle) {
    // Broadcast the needle byte to all 16 positions
    __m128i pattern = _mm_set1_epi8(needle);

    size_t i = 0;
    for (; i + 15 < n; i += 16) {
        // Load 16 bytes from the haystack
        __m128i block = _mm_loadu_si128((__m128i*)(haystack + i));
        // Compare each byte with the needle (produces 0xFF where equal, 0x00 elsewhere)
        __m128i cmp = _mm_cmpeq_epi8(block, pattern);
        // Collapse the 16 comparison results into a 16-bit mask
        int mask = _mm_movemask_epi8(cmp);
        if (mask != 0) {
            // Found it! The position of the lowest set bit is the offset
            return haystack + i + __builtin_ctz(mask);
        }
    }
    // Scalar fallback for remaining bytes
    for (; i < n; i++) {
        if (haystack[i] == needle) return haystack + i;
    }
    return nullptr;
}
```

The key operations:

1. **`_mm_set1_epi8(needle)`** — broadcasts one byte to all 16 lanes (fills a 128-bit register with 16 copies of the byte).
2. **`_mm_cmpeq_epi8`** — compares 16 byte-pairs simultaneously, producing 0xFF for matches.
3. **`_mm_movemask_epi8`** — extracts the high bit of each byte result into a 16-bit integer. This converts the 128-bit comparison result into something a scalar `if` can branch on.
4. **`__builtin_ctz`** — counts trailing zeros to find the position of the first match.

This processes 16 bytes per iteration instead of 1, giving roughly a 10-12x speedup over naive `memchr` implementations (less than 16x due to setup overhead and memory bandwidth).

## Real-World Example: Matrix Multiplication in NumPy/BLAS

When you write `numpy.dot(A, B)` in Python, it calls into BLAS (Basic Linear Algebra Subprograms). The underlying implementation (OpenBLAS, Intel MKL, or Apple Accelerate) uses SIMD heavily.

Here is the core idea behind a SIMD-optimized matrix multiply for small blocks (the "microkernel" — the innermost loop that operates on register-sized tiles):

```c
// Microkernel: compute a 8x8 tile of C += A * B
// A is 8x1, B is 1x8, accumulated into 8x8 result
// This is called thousands of times in the inner loop
void microkernel_8x8_avx2(float* C, const float* A, const float* B, int K) {
    // 8 accumulators for 8 rows of C (each holds 8 floats = one row of the tile)
    __m256 c0 = _mm256_loadu_ps(C + 0*8);
    __m256 c1 = _mm256_loadu_ps(C + 1*8);
    __m256 c2 = _mm256_loadu_ps(C + 2*8);
    __m256 c3 = _mm256_loadu_ps(C + 3*8);
    __m256 c4 = _mm256_loadu_ps(C + 4*8);
    __m256 c5 = _mm256_loadu_ps(C + 5*8);
    __m256 c6 = _mm256_loadu_ps(C + 6*8);
    __m256 c7 = _mm256_loadu_ps(C + 7*8);

    for (int k = 0; k < K; k++) {
        // Load one row of B (8 floats)
        __m256 b_row = _mm256_loadu_ps(B + k*8);

        // For each row of A, broadcast the single element and multiply-add
        // FMA: c[i] += A[i][k] * B[k][0..7]
        c0 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 0*K + k), b_row, c0);
        c1 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 1*K + k), b_row, c1);
        c2 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 2*K + k), b_row, c2);
        c3 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 3*K + k), b_row, c3);
        c4 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 4*K + k), b_row, c4);
        c5 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 5*K + k), b_row, c5);
        c6 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 6*K + k), b_row, c6);
        c7 = _mm256_fmadd_ps(_mm256_broadcast_ss(A + 7*K + k), b_row, c7);
    }

    // Store results back
    _mm256_storeu_ps(C + 0*8, c0);
    _mm256_storeu_ps(C + 1*8, c1);
    // ... (store c2 through c7)
}
```

The critical instruction here is **`_mm256_fmadd_ps`** (Fused Multiply-Add): it computes `a * b + c` in a single instruction with only one rounding step. FMA was added in the FMA3 extension (2013) and is essential for numerical accuracy and throughput in scientific computing.

This microkernel computes $8 \times 8 \times 2 = 128$ floating-point operations (multiply + add) per iteration of the inner loop. With FMA executing on 2 ports at 8 floats each, a single core can sustain 32 FLOPs/cycle — over 100 GFLOPS at 4 GHz.

## AVX-512: Masks and Scatter/Gather

AVX-512 introduced **mask registers** (`k0`-`k7`) that enable per-lane predication. Each bit in a mask register controls whether the corresponding lane participates in an operation:

```c
// AVX-512 masked operation: only process elements where mask bit is 1
__m512i data = _mm512_loadu_si512(input);
__mmask16 active = _mm512_cmpgt_epi32_mask(data, threshold);  // which lanes > threshold?

// Only square the lanes where data > threshold; others stay zero
__m512i squared = _mm512_maskz_mullo_epi32(active, data, data);
//                      ^--- 'z' means zero-masked (inactive lanes = 0)
```

This eliminates branching for conditional operations. Without masks, you would need scalar code to handle the "if > threshold, then square" logic — or use blend instructions (which exist in AVX2 but are less flexible).

**Gather** loads non-contiguous memory into a vector register using an index vector:

```c
// Load elements from scattered memory locations
// base[indices[0]], base[indices[1]], ..., base[indices[15]]
__m512i indices = _mm512_loadu_si512(index_array);
__m512i gathered = _mm512_i32gather_epi32(indices, base_ptr, 4);  // scale=4 (int-sized)
```

```
  Memory:    [  ...  42  ...  17  ...  99  ...  ]
                    ^         ^         ^
  Indices:   [  3,       7,       11,    ... ]

  Result:    [ 42 | 17 | 99 | ... ]   (non-contiguous -> contiguous)
```

Gather is essential for database hash joins (probing a hash table at scattered positions) and sparse matrix operations. However, gather is slower than contiguous loads — it still issues multiple cache line requests internally.

## ARM NEON and SVE: The Other SIMD

ARM processors (used in Apple M-series, AWS Graviton, smartphones) have their own SIMD extensions:

- **NEON** (2004): 128-bit registers (`V0`-`V31`), similar capability to SSE. Always available on modern ARM (ARMv8+).
- **SVE/SVE2** (2016/2019): **Scalable Vector Extension** — register width is not fixed at compile time. It can be 128 to 2048 bits, and the code doesn't need to know. The hardware picks the width.

SVE's variable-length design is unique:

```c
// SVE code — works on any SVE hardware regardless of vector width
#include <arm_sve.h>

void add_arrays_sve(int32_t* c, const int32_t* a, const int32_t* b, int n) {
    for (int i = 0; i < n; i += svcntw()) {  // svcntw() = number of 32-bit lanes
        svbool_t pred = svwhilelt_b32(i, n);  // generate predicate for valid lanes
        svint32_t va = svld1(pred, a + i);    // masked load
        svint32_t vb = svld1(pred, b + i);
        svst1(pred, c + i, svadd_x(pred, va, vb));  // masked add + store
    }
}
```

The same binary runs on a chip with 128-bit SVE and a chip with 512-bit SVE. The loop simply takes fewer iterations on wider hardware. This "write once, run wider" approach avoids the x86 problem of recompiling for each new extension.

## Common SIMD Patterns and Idioms

### Pattern 1: Horizontal Reduction

Sum all elements in a vector into a single scalar:

```c
// Sum 8 floats in a YMM register
float hsum_avx(__m256 v) {
    // Step 1: add high 128 bits to low 128 bits
    __m128 hi = _mm256_extractf128_ps(v, 1);  // upper half
    __m128 lo = _mm256_castps256_ps128(v);     // lower half (free, no instruction)
    __m128 sum128 = _mm_add_ps(lo, hi);        // 4 floats

    // Step 2: horizontal add within 128 bits
    __m128 shuf = _mm_movehdup_ps(sum128);     // [1,1,3,3]
    sum128 = _mm_add_ps(sum128, shuf);         // [0+1, _, 2+3, _]
    shuf = _mm_movehl_ps(shuf, sum128);        // [2+3, _, _, _]
    sum128 = _mm_add_ss(sum128, shuf);         // [0+1+2+3, _, _, _]

    return _mm_cvtss_f32(sum128);
}
```

This "tree reduction" pattern takes $\log_2(N)$ steps instead of $N$ additions.

### Pattern 2: Branchless Min/Max

Find the minimum of an array without any branches:

```c
int find_min_avx2(const int* data, int n) {
    __m256i min_vec = _mm256_set1_epi32(INT_MAX);

    for (int i = 0; i + 7 < n; i += 8) {
        __m256i v = _mm256_loadu_si256((__m256i*)(data + i));
        min_vec = _mm256_min_epi32(min_vec, v);  // parallel min of 8 pairs
    }
    // Reduce the 8-wide min to a single value
    // (extract halves, compare, extract quarters, compare...)
    // ...
}
```

No branch mispredictions, no pipeline stalls. The CPU processes 8 comparisons per cycle regardless of data distribution.

### Pattern 3: Lookup Table via Shuffle

The `pshufb` (`_mm_shuffle_epi8`) instruction is secretly a parallel 16-entry lookup table:

```c
// Convert 16 hex nibbles to ASCII characters simultaneously
__m128i nibbles = ...;  // each byte is 0x0-0xF
__m128i hex_lut = _mm_setr_epi8(
    '0','1','2','3','4','5','6','7',
    '8','9','a','b','c','d','e','f'
);
__m128i ascii = _mm_shuffle_epi8(hex_lut, nibbles);
// Each nibble (used as index) is replaced by the corresponding ASCII char
```

This replaces 16 conditional lookups with a single instruction. It is widely used in base64 encoding, JSON parsing, and UTF-8 validation.

## Performance Pitfalls

### 1. Memory Alignment

Aligned loads (`_mm256_load_si256`) require the address to be 32-byte aligned. Unaligned loads (`_mm256_loadu_si256`) work on any address but were historically slower. On modern CPUs (Skylake+), unaligned loads within a cache line have no penalty — but crossing a cache line boundary still costs extra.

```c
// Aligned allocation
int* data = (int*)aligned_alloc(32, n * sizeof(int));  // 32-byte aligned for AVX2

// Or with compiler attributes
int data[1024] __attribute__((aligned(32)));
```

### 2. Crossing Domain Boundaries

Mixing SSE (128-bit) and AVX (256-bit) instructions causes a penalty on older CPUs due to "upper state transitions." The CPU must save/restore the upper 128 bits of YMM registers:

```c
// BAD on pre-Skylake: mixing SSE and AVX
__m128 a = _mm_add_ps(x, y);       // SSE — uses XMM
__m256 b = _mm256_add_ps(p, q);    // AVX — uses YMM  (penalty!)
```

Use `_mm256_zeroupper()` (the `VZEROUPPER` instruction) when transitioning from AVX to SSE code to avoid this.

### 3. AVX-512 Frequency Throttling

Heavy AVX-512 usage causes Intel CPUs to drop their clock frequency by 10-20% (the "AVX-512 turbo penalty"). For short bursts, this can make AVX-512 slower than AVX2 due to the frequency transition latency:

```
  Workload              Clock Speed (typical)    Effective Throughput
  ---------             --------------------     ---------------------
  Scalar / SSE          4.8 GHz                  baseline
  Light AVX2            4.6 GHz                  ~7.5x (8 lanes * 0.96)
  Heavy AVX-512         4.0 GHz                  ~10.7x (16 lanes * 0.83)
```

For database workloads with mixed SIMD and scalar code, AVX2 often wins overall because it avoids the clock reduction.

### 4. Data Dependencies Between Lanes

SIMD works best when lanes are independent. If element $i$ depends on element $i-1$ (like a prefix sum), SIMD provides limited benefit:

```
  Independent (vectorizable):     Dependent (hard to vectorize):
  c[i] = a[i] + b[i]            c[i] = c[i-1] + a[i]
  |   |   |   |   |   |         c[0] -> c[1] -> c[2] -> c[3]
  v   v   v   v   v   v         (serial chain)
  (all lanes independent)
```

There are clever parallel prefix-sum algorithms using SIMD, but they are complex and have limited speedup.

## How Databases Use SIMD Today

| Database | SIMD Usage |
|----------|-----------|
| ClickHouse | Filtering, aggregation, string ops, compression, hashing |
| DuckDB | Filter pushdown, hash joins, sorting, string operations |
| PostgreSQL | CRC32 (SSE4.2), planned for more in future versions |
| SQLite | Minimal — focused on portability over performance |
| Velox (Meta) | Expression evaluation, hashing, filtering |
| Apache Arrow | Comparison, casting, bitmap operations |
| QuestDB | Timestamp filtering, aggregation |

The pattern is clear: modern analytical databases treat SIMD as a first-class optimization strategy, not an afterthought.

## Checking CPU Support at Runtime

Real-world code must handle CPUs with different SIMD support. The standard approach is runtime dispatch using CPUID:

```c
#include <cpuid.h>

typedef enum { IMPL_SCALAR, IMPL_SSE42, IMPL_AVX2, IMPL_AVX512 } impl_t;

impl_t detect_best_impl(void) {
    unsigned int eax, ebx, ecx, edx;

    // Check for AVX2: CPUID leaf 7, bit 5 of EBX
    __cpuid_count(7, 0, eax, ebx, ecx, edx);
    int has_avx2 = (ebx >> 5) & 1;

    // Check for AVX-512F: CPUID leaf 7, bit 16 of EBX
    int has_avx512f = (ebx >> 16) & 1;

    // Also need to check OS support via XGETBV (XCRO bit 2 for AVX, bit 5-7 for AVX-512)
    // ... (omitted for brevity)

    if (has_avx512f) return IMPL_AVX512;
    if (has_avx2) return IMPL_AVX2;
    return IMPL_SSE42;  // SSE4.2 assumed on any modern x86-64
}
```

Many projects (ClickHouse, simdjson) use function pointers initialized at startup:

```c
// Function pointer table — set once at startup, called millions of times
static int (*find_byte)(const char*, size_t, char);

void init_simd_dispatch(void) {
    impl_t impl = detect_best_impl();
    switch (impl) {
        case IMPL_AVX2:   find_byte = find_byte_avx2; break;
        case IMPL_SSE42:  find_byte = find_byte_sse42; break;
        default:          find_byte = find_byte_scalar; break;
    }
}
```

## Summary

```
  +-----------------------------------------------------+
  |  Key Takeaways                                      |
  +-----------------------------------------------------+
  |                                                     |
  |  1. SIMD = one instruction, many data elements      |
  |     (4, 8, 16, or 64 at once)                       |
  |                                                     |
  |  2. x86: SSE (128b) -> AVX2 (256b) -> AVX-512      |
  |     ARM: NEON (128b) -> SVE (128-2048b, scalable)   |
  |                                                     |
  |  3. Three ways to use it:                           |
  |     - Auto-vectorization (easy, fragile)            |
  |     - Intrinsics (reliable, portable-ish)           |
  |     - Inline ASM (last resort)                      |
  |                                                     |
  |  4. Best for: independent, data-parallel work       |
  |     (add arrays, search bytes, hash, filter)        |
  |                                                     |
  |  5. Watch out for:                                  |
  |     - Alignment (cross-cache-line penalties)        |
  |     - Frequency throttling (AVX-512)                |
  |     - Data dependencies between lanes               |
  |     - Tail handling (array size not multiple of N)  |
  |                                                     |
  +-----------------------------------------------------+
```

## References

- Intel Intrinsics Guide: [https://www.intel.com/content/www/us/en/docs/intrinsics-guide/](https://www.intel.com/content/www/us/en/docs/intrinsics-guide/) — searchable reference for all x86 SIMD intrinsics
- Agner Fog's Optimization Manuals: [https://www.agner.org/optimize/](https://www.agner.org/optimize/) — definitive resource on x86 microarchitecture and instruction latencies
- Daniel Lemire's blog: [https://lemire.me/blog/](https://lemire.me/blog/) — practical SIMD optimization for databases and JSON parsing
- simdjson: [https://github.com/simdjson/simdjson](https://github.com/simdjson/simdjson) — SIMD-accelerated JSON parser, excellent learning resource
- ClickHouse source: [https://github.com/ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse) — production SIMD usage in a database
- ARM SVE/SVE2 Programmer's Guide: [https://developer.arm.com/documentation/](https://developer.arm.com/documentation/) — scalable vector extension documentation
- "Is Parallel Programming Hard?" (McKenney, 2023): Chapter on SIMD and vectorization tradeoffs
