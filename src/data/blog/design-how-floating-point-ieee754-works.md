---
author: JZ
pubDatetime: 2026-09-20T12:00:00Z
modDatetime: 2026-09-20T12:00:00Z
title: System Design - How Floating Point Arithmetic Works (IEEE 754)
tags:
  - design-system
  - design-hardware
description:
  "How IEEE 754 floating point works: the sign-exponent-mantissa bit layout, normalization, special values (infinity, NaN, denormals), rounding modes, and why 0.1 + 0.2 != 0.3 — with binary walkthroughs and real source code."
---

## Table of contents

## Context

Every programmer has encountered this at some point:

```python
>>> 0.1 + 0.2
0.30000000000000004

>>> 0.1 + 0.2 == 0.3
False
```

This is not a bug in Python. It happens in C, Java, JavaScript, Rust — every language that uses **IEEE 754 floating point**, which is virtually all of them. The result is mathematically correct given how the hardware represents numbers.

Understanding IEEE 754 is not just trivia. Floating point bugs have caused real disasters: the [Patriot missile failure](https://www.gao.gov/products/imtec-92-26) in 1991 killed 28 soldiers because of a 0.34-second timing drift from repeated float truncation. The [Ariane 5 rocket](https://en.wikipedia.org/wiki/Ariane_flight_V88) self-destructed 37 seconds after launch because a 64-bit float was cast to a 16-bit integer and overflowed.

IEEE 754 was standardized in **1985** by William Kahan (who won the Turing Award for this work) and revised in 2008 and 2019. It defines how floating point numbers are stored in binary, how arithmetic operations behave, and how edge cases (infinity, not-a-number, underflow) are handled. Every modern CPU implements it directly in hardware.

Let's open it up bit by bit.

## The Big Idea: Scientific Notation in Binary

You already know scientific notation from physics class:

```
  6.022 x 10^23    (Avogadro's number)
  3.0   x 10^8     (speed of light, m/s)
 -1.6   x 10^-19   (electron charge, coulombs)
```

A floating point number is the same idea, but in base 2:

```
  1.101 x 2^3      = 1.625 x 8 = 13.0
 -1.0   x 2^-2     = -1.0 x 0.25 = -0.25
```

The word "floating point" means the decimal (binary) point can float left or right by changing the exponent, unlike **fixed point** where the point stays in one place. This lets the same number of bits represent both very large and very tiny numbers.

IEEE 754 encodes three pieces of information into a fixed-width bit string:

```
  +------+----------+-------------------------+
  | sign | exponent |       mantissa          |
  | (1b) |  (E bits)|      (M bits)           |
  +------+----------+-------------------------+
```

- **Sign**: 0 = positive, 1 = negative (just one bit).
- **Exponent**: Determines the scale (the power of 2).
- **Mantissa** (also called **significand** or **fraction**): The significant digits.

The two most common formats:

```
  Format         Total bits   Exponent   Mantissa   Bias
  --------------------------------------------------------
  single (float)     32          8          23       127
  double             64         11          52       1023
```

## Anatomy of a 64-bit Double

Let's decode an actual number. Take the value **-13.625** and see how it becomes 64 bits.

### Step 1: Convert to binary

The integer part 13 in binary is `1101` (8 + 4 + 1).

The fractional part 0.625: multiply by 2 repeatedly.

```
  0.625 x 2 = 1.25   -> 1
  0.25  x 2 = 0.5    -> 0
  0.5   x 2 = 1.0    -> 1
```

So 0.625 in binary is `.101`. Together: **13.625 = 1101.101** in binary.

### Step 2: Normalize

Move the binary point so there's exactly one `1` before it:

```
  1101.101 = 1.101101 x 2^3
```

The leading `1` is always there for normal numbers (it's **implicit** — not stored!). This is called the **hidden bit**, and it gives us one extra bit of precision for free.

### Step 3: Encode the fields

```
  Sign:     1 (negative)
  Exponent: 3 + 1023 (bias) = 1026 = 10000000010 in binary
  Mantissa: 101101 followed by zeros to fill 52 bits
```

The bias is added so that negative exponents can be stored without a separate sign bit. An exponent field of 0 means the actual exponent is -1023.

Here is the final 64-bit layout:

```
  sign  exponent (11 bits)          mantissa (52 bits)
  [1]   [10000000010]   [1011010000000000000000000000000000000000000000000000]

  Bit 63  Bits 62-52                Bits 51-0
```

We can verify with C:

```c
#include <stdio.h>
#include <stdint.h>
#include <string.h>

int main() {
    double val = -13.625;
    uint64_t bits;
    memcpy(&bits, &val, sizeof(bits));
    printf("0x%016lX\n", bits);
    // Output: 0xC02B400000000000
    // Binary: 1 10000000010 1011010000...0
    return 0;
}
```

## Why 0.1 Cannot Be Represented Exactly

Now we can explain the famous `0.1 + 0.2` problem. Try converting 0.1 to binary:

```
  0.1 x 2 = 0.2  -> 0
  0.2 x 2 = 0.4  -> 0
  0.4 x 2 = 0.8  -> 0
  0.8 x 2 = 1.6  -> 1
  0.6 x 2 = 1.2  -> 1
  0.2 x 2 = 0.4  -> 0  (we've seen 0.2 before!)
  0.4 x 2 = 0.8  -> 0
  0.8 x 2 = 1.6  -> 1
  ...repeating: 0011 0011 0011 ...
```

```
  0.1 (decimal) = 0.0001100110011001100110011... (binary, repeating forever)
```

Just like 1/3 = 0.333... can never be written exactly in decimal, **0.1 can never be written exactly in binary.** The mantissa has only 52 bits, so the infinite sequence gets truncated. The closest 64-bit double to 0.1 is:

```
  0.1000000000000000055511151231257827021181583404541015625
```

The same happens for 0.2. When the hardware adds these two imprecise representations, the accumulated error lands in the 17th decimal digit:

```
  0.1 (rounded) + 0.2 (rounded) = 0.30000000000000004
```

It is not a rounding error in the addition itself — the addition is **exact** given its inputs. The imprecision was baked in when 0.1 and 0.2 were converted to binary in the first place.

## Special Values: Zero, Infinity, and NaN

IEEE 754 reserves specific bit patterns for edge cases:

```
  +-------+----------+-----------+-------------------+
  | sign  | exponent | mantissa  | meaning           |
  +-------+----------+-----------+-------------------+
  |  0/1  | 00...00  | 00...00   | +/- zero          |
  |  0/1  | 00...00  | nonzero   | denormalized      |
  |  0/1  | 11...11  | 00...00   | +/- infinity      |
  |  0/1  | 11...11  | nonzero   | NaN               |
  |  0/1  | anything | anything  | normal number     |
  |       |  else    |           |                   |
  +-------+----------+-----------+-------------------+
```

### Positive and negative zero

Yes, IEEE 754 has **two zeros**: `+0` and `-0`. They compare as equal (`+0 == -0` is true), but they are different bit patterns. This matters for operations like `1.0 / +0.0` (= +infinity) vs `1.0 / -0.0` (= -infinity). The sign preserves information about which direction you approached zero.

```python
>>> import math
>>> math.copysign(1.0, 0.0)
1.0
>>> math.copysign(1.0, -0.0)
-1.0
```

### Infinity

Division by zero produces infinity instead of crashing. Infinity propagates through arithmetic in mathematically sensible ways:

```python
>>> float('inf') + 1
inf
>>> float('inf') * -1
-inf
>>> float('inf') + float('-inf')
nan
```

Infinity minus infinity is indeterminate, so it becomes NaN.

### NaN (Not a Number)

NaN represents undefined or unrepresentable results: `0/0`, `sqrt(-1)`, `inf - inf`. NaN has a unique property: **it is not equal to itself.**

```python
>>> x = float('nan')
>>> x == x
False
>>> x != x
True
```

This is by design. NaN means "this computation went wrong" — comparing it to anything (including itself) should not return true, because there is no meaningful value to compare. This is the standard way to check for NaN:

```c
// In C, use isnan() — don't compare to itself
#include <math.h>
if (isnan(x)) { /* handle it */ }
```

The mantissa of a NaN is nonzero and can encode diagnostic information. A NaN where the top mantissa bit is 1 is called a **quiet NaN** (qNaN) — it propagates silently through calculations. A NaN where the top bit is 0 is a **signaling NaN** (sNaN) — it raises an exception when used. Most languages only expose quiet NaNs.

## Denormalized Numbers: Gradual Underflow

Normal floating point numbers have an implicit leading 1 before the mantissa. But what happens near zero? The smallest normal double has exponent field 1 (actual exponent -1022):

```
  smallest normal = 1.000...0 x 2^-1022
                  ≈ 2.225 x 10^-308
```

Without denormals, any number smaller than this would snap to zero — a "gap" near the origin. IEEE 754 fills this gap with **denormalized numbers** (also called **subnormals**): when the exponent field is all zeros, the implicit leading bit becomes 0 instead of 1, and the exponent is fixed at -1022.

```
  Normal:        1.mantissa x 2^(exponent - bias)
  Denormalized:  0.mantissa x 2^(-1022)
```

This creates a smooth, evenly-spaced gradual underflow to zero:

```
  |------|------|------|------|----|----|----|----|----|
  0   denormals              ^                       normal numbers
                        smallest
                        normal
```

Denormals are controversial. They are **much slower** on most hardware (10x-100x penalty on older x86 CPUs) because the FPU pipeline handles them as a special case, often trapping to microcode. Some high-performance computing codes set the "flush to zero" (FTZ) and "denormals are zero" (DAZ) flags to avoid the penalty:

```c
// x86: set MXCSR to flush denormals to zero
#include <xmmintrin.h>
_mm_setcsr(_mm_getcsr() | 0x8040); // FTZ + DAZ
```

## Rounding: The Four Modes

When a result cannot be represented exactly (which is most of the time), IEEE 754 requires **deterministic rounding**. The default mode is **round to nearest, ties to even** (also called "banker's rounding"):

```
  Value     Rounded to nearest representable float
  -------   ------------------------------------------
  1.50      2.0  (tie, round to even)
  2.50      2.0  (tie, round to even)
  1.51      2.0  (not a tie, round up)
  1.49      1.0  (not a tie, round down)
```

The "ties to even" rule prevents systematic bias. If you always rounded ties up (like you learned in school), repeated additions would accumulate a positive drift.

The other three modes are:

```
  Mode                Example: rounding 1.5 and -1.5
  -------------------------------------------------------
  Round to nearest    1.5 -> 2.0,  -1.5 -> -2.0
  Round toward +inf   1.1 -> 2.0,  -1.1 -> -1.0
  Round toward -inf   1.1 -> 1.0,  -1.1 -> -2.0
  Round toward zero   1.9 -> 1.0,  -1.9 -> -1.0
```

The last three are used in interval arithmetic (to compute guaranteed upper and lower bounds) and in financial calculations.

## The Precision Landscape

Floating point numbers are not uniformly distributed on the number line. They are **logarithmically distributed**: densely packed near zero and increasingly sparse further away.

```
  Near 1.0:     gap between consecutive doubles ≈ 2^-52 ≈ 2.2 x 10^-16
  Near 1000.0:  gap ≈ 2^-42 ≈ 1.1 x 10^-13
  Near 10^15:   gap ≈ 0.125 (can't represent 10^15 + 0.1)
  Near 2^53:    gap = 1.0 (integers are no longer exact!)
```

This means a 64-bit double can represent all integers exactly up to $2^{53}$ (9,007,199,254,740,992). Beyond that, some integers are skipped:

```javascript
// JavaScript: all numbers are doubles
> 9007199254740992 + 1
9007199254740992    // WRONG! Should be 9007199254740993

> 9007199254740992 + 2
9007199254740994    // Only even increments work here
```

This is why JavaScript added `BigInt` and databases use fixed-precision `DECIMAL` types for monetary values.

The relative precision is captured by the **machine epsilon**: the smallest number $\epsilon$ such that $1.0 + \epsilon \neq 1.0$. For doubles, $\epsilon = 2^{-52} \approx 2.22 \times 10^{-16}$. This gives roughly **15-17 significant decimal digits** of precision.

## How the Hardware Actually Does It

Modern CPUs have a dedicated **Floating Point Unit** (FPU) that executes IEEE 754 operations in hardware. On x86-64, this is the SSE/AVX unit (the older x87 FPU is mostly legacy).

The FPU performs addition in three stages. Let's trace `1.0 + 0.001`:

```
  Step 1: Align exponents
  -------------------------------------------------------
  1.0   = 1.000000... x 2^0
  0.001 = 1.000001... x 2^-10

  Shift the smaller number right to match exponents:
  0.001 -> 0.0000000001000001... x 2^0
                     ^^^^^^^^^^ these bits may fall off

  Step 2: Add mantissas
  -------------------------------------------------------
  1.0000000000000000000...  (52 bits of mantissa)
+ 0.0000000001000001000...  (shifted, with guard bits)
= 1.0000000001000001000...

  Step 3: Normalize and round
  -------------------------------------------------------
  Already normalized (leading 1 present).
  Round the result to fit in 52 mantissa bits.
```

The FPU actually uses **three extra bits** beyond the mantissa during computation to minimize rounding error:

```
  +------ 52 mantissa bits ------+---+---+---+
  |                              | G | R | S |
  +------------------------------+---+---+---+
                                  guard  sticky
                                     round
```

- **Guard bit**: The first bit beyond the mantissa.
- **Round bit**: The second bit beyond.
- **Sticky bit**: OR of all remaining bits (captures whether anything nonzero was shifted off).

These three bits let the hardware make the correct rounding decision without keeping infinite precision.

## Catastrophic Cancellation

The most dangerous floating point pitfall is **catastrophic cancellation**: when you subtract two nearly equal numbers, the significant digits cancel, leaving mostly rounding noise.

```
  a = 1.0000000000000001  (16 significant digits)
  b = 1.0000000000000000  (16 significant digits)
  a - b = 1 x 10^-16     (only 1 significant digit!)
```

A classic example: the quadratic formula $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

When $b^2 \gg 4ac$, one of the two roots involves subtracting two nearly equal numbers. The numerically stable fix uses the identity $x_1 \cdot x_2 = c/a$:

```python
import math

def stable_quadratic(a, b, c):
    disc = b*b - 4*a*c
    sqrt_disc = math.sqrt(disc)

    # Choose the root that avoids cancellation
    if b >= 0:
        x1 = (-b - sqrt_disc) / (2*a)
    else:
        x1 = (-b + sqrt_disc) / (2*a)

    # Get the other root from Vieta's formula
    x2 = c / (a * x1)
    return x1, x2
```

Another classic: summing a list of numbers. Adding a tiny number to a large running total loses the small number entirely. **Kahan summation** fixes this by keeping a running compensation term:

```python
def kahan_sum(values):
    total = 0.0
    compensation = 0.0
    for x in values:
        y = x - compensation
        t = total + y
        compensation = (t - total) - y
        total = t
    return total
```

```
  Naive sum of [1.0, 1e-16, 1e-16, ..., 1e-16] (10^16 terms):
    Result: 1.0  (all the small values were lost)

  Kahan sum:
    Result: 2.0  (correct)
```

The `compensation` variable captures the rounding error from each addition and feeds it back into the next step.

## Comparing Floats Correctly

Since exact equality is unreliable, how should you compare floating point numbers?

The naive approach uses an absolute tolerance:

```python
abs(a - b) < 1e-9  # fails for very large or very small numbers
```

A better approach uses **relative tolerance** (also called ULP-based comparison):

```python
import math

def float_equal(a, b, rel_tol=1e-9, abs_tol=0.0):
    """Same logic as Python's math.isclose()."""
    if a == b:
        return True
    diff = abs(a - b)
    return diff <= max(rel_tol * max(abs(a), abs(b)), abs_tol)
```

Python's `math.isclose()` uses exactly this approach. The key insight: the tolerance should scale with the magnitude of the numbers being compared.

For the tightest possible comparison, you can check whether two floats are within a certain number of **ULPs** (Units in the Last Place) — the gap between consecutive representable floats:

```c
#include <stdint.h>
#include <string.h>
#include <math.h>

int ulp_equal(double a, double b, int max_ulps) {
    if (isnan(a) || isnan(b)) return 0;
    // Interpret the bit patterns as integers
    int64_t ia, ib;
    memcpy(&ia, &a, sizeof(a));
    memcpy(&ib, &b, sizeof(b));
    // Fix sign: negative floats map to large positive integers
    if (ia < 0) ia = 0x8000000000000000LL - ia;
    if (ib < 0) ib = 0x8000000000000000LL - ib;
    return llabs(ia - ib) <= max_ulps;
}
```

This works because IEEE 754 was designed so that consecutive floating point values differ by exactly 1 when their bits are interpreted as integers (within the same sign).

## The Fused Multiply-Add (FMA)

Modern CPUs provide a **fused multiply-add** instruction: `fma(a, b, c) = a*b + c` with **only one rounding** instead of two. This is not just faster — it is more accurate:

```c
// Without FMA: two roundings
double r1 = a * b;     // round once
double r2 = r1 + c;    // round again

// With FMA: one rounding
double r3 = fma(a, b, c);  // round once, from full a*b+c
```

FMA is critical for linear algebra (dot products), polynomial evaluation (Horner's method), and compensated arithmetic. It also enables an exact error-free transformation: you can recover the rounding error of `a*b` as:

```c
double product = a * b;
double error   = fma(a, b, -product);  // exact rounding error!
```

## Practical Guidelines

```
  +---------------------------------------+-------------------------------------+
  | Pitfall                               | Fix                                 |
  +---------------------------------------+-------------------------------------+
  | 0.1 + 0.2 != 0.3                      | Use tolerance-based comparison      |
  | Money stored as float                  | Use integer cents or DECIMAL type   |
  | Summing many small values              | Kahan summation or pairwise sum     |
  | Subtracting nearly equal values        | Rearrange the formula               |
  | Comparing to exact zero                | Check abs(x) < epsilon              |
  | Loop counter as float                  | Use integer counter                 |
  | Assuming float order = real order      | NaN breaks all comparisons          |
  | Large integer in double                | Past 2^53, use int64 or BigInt      |
  +---------------------------------------+-------------------------------------+
```

## References

1. IEEE 754-2019 standard. [IEEE Std 754-2019](https://standards.ieee.org/ieee/754/6210/)
2. Goldberg, D. (1991). "What Every Computer Scientist Should Know About Floating-Point Arithmetic." [ACM Computing Surveys](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html)
3. Kahan, W. (1996). "IEEE 754: How It Was." [Berkeley lecture notes](https://people.eecs.berkeley.edu/~wkahan/ieee754status/IEEE754.PDF)
4. Muller, J.M. et al. (2018). *Handbook of Floating-Point Arithmetic.* Birkhauser, 2nd edition.
5. CPython `float` implementation — [`Objects/floatobject.c`](https://github.com/python/cpython/blob/main/Objects/floatobject.c)
6. Go `math` package — [`src/math/bits.go`](https://github.com/golang/go/blob/master/src/math/bits.go)
