---
author: JZ
pubDatetime: 2026-06-15T10:00:00Z
modDatetime: 2026-06-15T10:00:00Z
title: System Design - How JIT (Just-In-Time) Compilation Works
tags:
  - design-system
  - design-performance
description:
  "How JIT compilation works: interpreter warm-up, profiling, tiered compilation in the JVM HotSpot and V8 engines, inline caches, deoptimization, and source code walkthrough."
---

## Table of contents

## Context

When you run a program, your CPU only understands machine code — raw binary instructions specific to your hardware (x86, ARM, etc.). But most modern languages (Java, JavaScript, Python, C#) don't compile directly to machine code ahead of time. Instead, they produce an intermediate representation: **bytecode**.

The question is: how do you execute that bytecode efficiently?

There are two extremes:

1. **Pure interpretation:** Read each bytecode instruction and simulate it in software. Simple to implement, but slow — every operation pays the cost of a dispatch loop.
2. **Ahead-of-time (AOT) compilation:** Compile everything to machine code before running. Fast execution, but slow startup and no opportunity to optimize based on actual runtime behavior.

**JIT (Just-In-Time) compilation** is the middle path. It starts interpreting, watches which code is actually "hot" (frequently executed), and then compiles *only that code* to optimized machine code while the program is running. This gives you both fast startup (no waiting for a full compile) and peak performance (machine code for the hot paths).

```
                How Code Executes: The Spectrum

  Source Code           Source Code           Source Code
      |                     |                     |
      v                     v                     v
  [Compiler]          [Compiler to            [Compiler to
      |                bytecode]               bytecode]
      v                     |                     |
  Machine Code              v                     v
      |               [Interpreter]         [Interpreter]
      |                     |                     |
      v                     |               (profile hot code)
  CPU executes              v                     |
  directly              CPU simulates             v
                        each opcode         [JIT Compiler]
                                                  |
                                                  v
                                            Machine Code
                                                  |
                                                  v
                                            CPU executes
                                            directly

  AOT (C, Rust)      Interpreter only       JIT (Java, JS, C#)
                     (CPython, Ruby MRI)
```

Almost every high-performance runtime uses JIT compilation today: the JVM (HotSpot), V8 (Chrome/Node.js), .NET (RyuJIT), PyPy, LuaJIT, and GraalVM. Let's trace how it works from the ground up.

## The Lifecycle of JIT Compilation

A JIT runtime follows a repeating cycle:

```
  +-----------------------------------------------------------+
  |                     Program Start                          |
  +-----------------------------------------------------------+
              |
              v
  +-----------------------+
  |   1. Interpret        |   Execute bytecode instruction
  |      bytecode         |   by instruction (slow but
  |                       |   immediate startup)
  +----------+------------+
             |
             |  (count method invocations
             |   and loop back-edges)
             v
  +-----------------------+
  |   2. Profile          |   Record which methods are hot,
  |      execution        |   what types flow through,
  |                       |   which branches are taken
  +----------+------------+
             |
             |  (threshold reached)
             v
  +-----------------------+
  |   3. Compile          |   Translate bytecode to machine
  |      hot code         |   code with optimizations based
  |                       |   on the profile data
  +----------+------------+
             |
             v
  +-----------------------+
  |   4. Patch & Run      |   Replace interpreted entry
  |      machine code     |   point with compiled code;
  |                       |   future calls jump straight
  |                       |   to machine code
  +----------+------------+
             |
             |  (if assumptions violated)
             v
  +-----------------------+
  |   5. Deoptimize       |   Fall back to interpreter,
  |      (bail out)       |   discard compiled code,
  |                       |   re-profile and try again
  +-----------------------+
```

Let's examine each step through the lens of two real engines: the **JVM HotSpot** compiler and **V8** (the JavaScript engine in Chrome and Node.js).

## Step 1: The Interpreter

### JVM HotSpot

When you run `java MyApp`, the JVM loads `.class` files containing bytecode. The interpreter (called the **template interpreter** in HotSpot) executes bytecode one instruction at a time. Each bytecode maps to a small stub of pre-generated assembly:

```
  Java Source             Bytecode              Template Interpreter
  -----------             --------              --------------------
  int add(int a,          iload_1               mov eax, [rbp-8]
           int b) {       iload_2               mov ecx, [rbp-12]
    return a + b;         iadd                  add eax, ecx
  }                       ireturn               ret
```

The template interpreter in HotSpot lives in [`src/hotspot/cpu/x86/templateInterpreterGenerator_x86_64.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/cpu/x86/templateInterpreterGenerator_x86_64.cpp). At JVM startup, it generates native assembly stubs for each bytecode instruction. This is faster than a C switch-loop interpreter because there's no dispatch overhead between instructions.

### V8

V8's interpreter is called **Ignition**. It compiles JavaScript to a custom bytecode format, then executes using a register-based interpreter. The bytecode for a simple function:

```javascript
function add(a, b) {
  return a + b;
}
```

becomes roughly:

```
  Ldar a1          // Load argument 'b' into the accumulator
  Add a0, [0]     // Add argument 'a' to accumulator
  Return          // Return the accumulator
```

Each bytecode handler is a small machine code snippet generated from [`src/interpreter/interpreter-generator.cc`](https://github.com/nicknisi/v8/blob/main/src/interpreter/interpreter-generator.cc) in V8.

## Step 2: Profiling — Watching the Hot Spots

The runtime needs to decide *what* to compile. Compiling everything wastes time; compiling nothing leaves performance on the table. The answer: **counters**.

### Invocation Counter + Back-Edge Counter (HotSpot)

HotSpot maintains two counters per method:

- **Invocation counter:** incremented each time the method is called.
- **Back-edge counter:** incremented each time a backward branch (i.e., a loop iteration) is taken.

When either counter crosses a threshold (default ~10,000 for the C1 compiler, ~10,000 + profiling for C2), the method is queued for compilation.

```
  Method: computeHash()

  +---------------------------+
  |  invocation_counter: 0    |   ← starts at 0
  |  backedge_counter: 0      |
  +---------------------------+

        ... called 10,000 times ...

  +---------------------------+
  |  invocation_counter: 10000|   ← threshold reached!
  |  backedge_counter: 45200  |
  +---------------------------+
              |
              v
      Queue for JIT compilation
```

The counter logic lives in [`src/hotspot/share/oops/methodCounters.hpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/oops/methodCounters.hpp):

```cpp
class MethodCounters : public MetaspaceObj {
  int _invoke_count;      // number of times method was called
  int _backedge_count;    // number of loop back-edges taken

  bool is_hot() const {
    return (_invoke_count + _backedge_count) >= CompileThreshold;
  }
};
```

### Feedback Vectors (V8)

V8 takes a different approach. Each function has a **feedback vector** — an array of slots that records type information at specific bytecode positions. For example, at an `Add` operation, the feedback slot records whether the operands were always integers, always strings, or a mix:

```
  Feedback Vector for add(a, b):
  +-------+-------------------+-------------------+
  | Slot  | Operation         | Observed Types    |
  +-------+-------------------+-------------------+
  |  [0]  | Add (a + b)       | Smi + Smi         |
  +-------+-------------------+-------------------+

  Smi = "Small Integer" (V8's tagged 31-bit integer)
```

If the slot always sees integers, the JIT can compile a fast integer-add. If it suddenly sees a string, that compiled code becomes invalid (more on this in deoptimization).

## Step 3: Tiered Compilation

Modern JIT systems don't have a single compiler — they have **tiers**, each trading compile time for code quality.

### HotSpot: C1 and C2

```
              +------------------+
              |   Interpreter    |  Tier 0
              +--------+---------+
                       |
           (hot method detected)
                       |
                       v
              +------------------+
              |  C1 Compiler     |  Tier 1-3
              |  (Client)        |  Fast compile, basic opts
              |  ~1-5ms          |  (inlining, null checks,
              |                  |   simple register alloc)
              +--------+---------+
                       |
           (still hot, profile data mature)
                       |
                       v
              +------------------+
              |  C2 Compiler     |  Tier 4
              |  (Server/Opto)   |  Slow compile, aggressive opts
              |  ~50-500ms       |  (escape analysis, loop
              |                  |   unrolling, vectorization,
              |                  |   speculative inlining)
              +------------------+
```

The C1 compiler is quick — it generates decent code in 1-5ms. The C2 compiler (also called "Opto") spends much longer (50-500ms) but produces code that rivals hand-written C for hot loops.

The tiered compilation policy is controlled by [`src/hotspot/share/compiler/compilationPolicy.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/compiler/compilationPolicy.cpp):

```cpp
CompLevel CompilationPolicy::initial_compile_level(const methodHandle& method) {
  // Start with C1 + full profiling (Tier 3)
  if (is_trivial(method)) {
    return CompLevel_simple;        // Tier 1: C1 without profiling
  }
  return CompLevel_full_profile;    // Tier 3: C1 with profiling
}

// Later, when profiling data is mature:
CompLevel CompilationPolicy::next_level(CompLevel current, ...) {
  if (current == CompLevel_full_profile && is_mature(profile)) {
    return CompLevel_full_optimization;  // Tier 4: C2
  }
  ...
}
```

### V8: Sparkplug → Maglev → TurboFan

V8 has evolved to use multiple tiers:

```
  +------------------+
  |  Ignition        |  Interpreter (bytecode)
  +--------+---------+
           |
           v
  +------------------+
  |  Sparkplug       |  Baseline compiler (no optimization,
  |                  |  just removes interpreter overhead)
  +--------+---------+
           |
           v
  +------------------+
  |  Maglev          |  Mid-tier (SSA-based, uses feedback,
  |                  |  fast compilation, good code)
  +--------+---------+
           |
           v
  +------------------+
  |  TurboFan        |  Top-tier (sea-of-nodes IR, aggressive
  |                  |  speculation, escape analysis, inlining)
  +------------------+
```

Each tier compiles faster but produces less optimal code. A function might spend most of its life at the Maglev tier and only get promoted to TurboFan if it's truly a bottleneck.

## Step 4: Key Optimizations

Once the JIT decides to compile a method, it applies optimizations that an AOT compiler cannot, because it has **runtime profile data**.

### Speculative Inlining

The JIT can inline method calls based on observed receiver types:

```java
// Java source
interface Shape { double area(); }
class Circle implements Shape { ... }
class Square implements Shape { ... }

double totalArea(Shape[] shapes) {
  double sum = 0;
  for (Shape s : shapes) {
    sum += s.area();  // virtual call — which impl?
  }
  return sum;
}
```

If profiling shows that `s` is *always* a `Circle`, the JIT can speculatively inline `Circle.area()`:

```
  Before (virtual dispatch):          After (speculative inline):
  --------------------------------    --------------------------------
  load vtable from s                  cmp [s.class], Circle
  load area() entry from vtable       jne DEOPTIMIZE           ← guard
  call [vtable.area]                  ; inlined Circle.area():
                                      movsd xmm0, [s.radius]
                                      mulsd xmm0, xmm0
                                      mulsd xmm0, PI
```

The `cmp` + `jne` is a **type guard**. If a `Square` ever appears, the guard fails and we deoptimize back to the interpreter.

### Inline Caches (V8)

In dynamically-typed languages, property access is expensive because objects can have any shape. V8 uses **inline caches (ICs)** to speed this up:

```
  First call to obj.x:                After IC patched:
  --------------------------------    --------------------------------
  LookupProperty(obj, "x")           cmp [obj+0], expected_map
  // expensive hash-table lookup      jne MISS
  // ~100ns                           mov result, [obj+16]
                                      // ~1ns (direct offset!)
```

The IC remembers the **hidden class** (called a "Map" in V8) of the object and the offset where property `x` lives. On subsequent accesses with the same shape, it's a single memory load — no lookup needed.

V8's IC implementation starts in [`src/ic/ic.cc`](https://github.com/nicknisi/v8/blob/main/src/ic/ic.cc).

### Escape Analysis (HotSpot C2)

If the JIT can prove that an object never "escapes" the method (never stored in a field, never passed to unknown code), it can eliminate the heap allocation entirely:

```java
// Before: allocates a Point on the heap every iteration
for (int i = 0; i < 1_000_000; i++) {
  Point p = new Point(i, i+1);
  sum += p.x + p.y;
}

// After escape analysis: no allocation!
for (int i = 0; i < 1_000_000; i++) {
  int p_x = i;      // scalar replacement
  int p_y = i + 1;
  sum += p_x + p_y;
}
```

The object is "scalarized" — its fields become local variables that live in registers. This is one of the most powerful JIT optimizations and is impossible for a purely ahead-of-time compiler to do reliably (it needs interprocedural escape information that depends on inlining decisions, which depend on profile data).

## Step 5: Deoptimization — When Assumptions Break

Speculative optimizations are only correct if the assumptions hold. When they don't, the JIT must **deoptimize**: discard the compiled code and return to the interpreter.

```
  Timeline of a function's life:
  ─────────────────────────────────────────────────────────────>

  [Interpreter]──>[C1]──>[C2 (speculative)]──>[DEOPT]──>[Interpreter]──>[C1]──>...
                                    |               |
                           assumes only Circle     Square appears!
                           type for Shape.area()   guard fails
```

### How Deoptimization Works (HotSpot)

When a guard fails (unexpected type, null where non-null was assumed, etc.), the compiled code jumps to a **deoptimization stub**. This stub:

1. Captures the current machine state (registers, stack).
2. Maps it back to interpreter frame format using **debug info** recorded during compilation.
3. Resumes execution in the interpreter at the equivalent bytecode position.

The deoptimization entry point lives in [`src/hotspot/share/runtime/deoptimization.cpp`](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/runtime/deoptimization.cpp):

```cpp
void Deoptimization::deoptimize_frame(JavaThread* thread, frame* fr) {
  // 1. Find the compiled method and the deopt point
  CompiledMethod* cm = fr->cb()->as_compiled_method();
  ScopeDesc* scope = cm->scope_desc_at(fr->pc());

  // 2. Build interpreter frames from the scope chain
  //    (handles inlined methods by creating multiple frames)
  vframeArray* array = create_vframeArray(thread, fr, scope);

  // 3. Replace the compiled frame on the stack with interpreter frames
  thread->set_vframe_array_head(array);
  // ... execution resumes in interpreter
}
```

### Deoptimization in V8

V8 calls this "lazy deoptimization." When TurboFan-compiled code hits an invalid assumption, it:

1. Reads the **deoptimization data** (a mapping from machine state back to Ignition bytecode state).
2. Materializes the interpreter registers and accumulator from the machine registers.
3. Jumps back to the Ignition interpreter at the right bytecode offset.

V8 also marks the feedback vector to record *why* deoptimization happened, so TurboFan doesn't make the same speculative bet next time.

## On-Stack Replacement (OSR)

What about a hot loop that's still in its first invocation? The method counter won't trigger because the method was only called once. The **back-edge counter** handles this case.

When the back-edge counter exceeds the threshold, the JIT performs **On-Stack Replacement (OSR)**: it compiles the method and replaces the *currently executing* interpreter frame with a compiled frame mid-loop.

```
  Stack before OSR:                Stack after OSR:
  +-------------------+            +-------------------+
  |  main()           |            |  main()           |
  +-------------------+            +-------------------+
  |  computeHash()    |            |  computeHash()    |
  |  [interpreter     | ────OSR──> |  [compiled code   |
  |   frame, i=5000]  |            |   frame, i=5000]  |
  +-------------------+            +-------------------+
```

The compiled code starts executing at the loop header with all local variables transplanted from the interpreter frame. This is tricky because the compiled code may have allocated variables to registers differently than the interpreter — the OSR entry point contains special "bridge" code to shuffle values into the right places.

## Putting It All Together: A Request's Journey

Let's trace a web request through a Node.js (V8) server:

```
  HTTP Request arrives
        |
        v
  handler(req) called for the 1st time
        |
        v
  Ignition interprets bytecode
  Feedback vector records: req.url is always a string,
                           req.headers is always an object
        |
        | ... called 1000 more times ...
        v
  Sparkplug compiles (no optimization, just native dispatch)
        |
        | ... called 5000 more times ...
        v
  Maglev compiles with type feedback:
    - req.url access uses inline cache (monomorphic)
    - string operations use fast paths for one-byte strings
        |
        | ... called 50,000 more times ...
        v
  TurboFan compiles with aggressive speculation:
    - Inlines the JSON.parse fast path
    - Eliminates bounds checks on known-length arrays
    - Hoists invariant loads out of loops
        |
        v
  Peak performance: handler runs at near-native speed
        |
        | (new request with unexpected header format)
        v
  Type guard fails → deoptimize to Ignition
        |
        v
  Re-profile with new type info → recompile
```

## Observing JIT Behavior

### JVM: `-XX:+PrintCompilation`

```bash
$ java -XX:+PrintCompilation MyApp
    1    b  3     java.lang.String::hashCode (55 bytes)
    2    b  3     java.util.HashMap::hash (20 bytes)
   85    b  4     com.myapp.Handler::process (212 bytes)
  102    n  4     com.myapp.Handler::process (212 bytes)   made not entrant
```

The columns show: timestamp, compile type (b=blocking, n=native), tier (3=C1, 4=C2), and method. "Made not entrant" means the compiled code was invalidated (deoptimized).

### V8: `--trace-opt` and `--trace-deopt`

```bash
$ node --trace-opt --trace-deopt app.js
[marking handler for optimization]
[compiling method handler using TurboFan]
[completed optimizing handler]
...
[deoptimizing (DEOPT eager): begin ... @2, reason: wrong map]
```

## Why Not Compile Everything with C2/TurboFan?

The top-tier compiler is powerful but expensive:

| Aspect | C1 / Maglev | C2 / TurboFan |
|--------|-------------|---------------|
| Compile time | 1-5ms | 50-500ms |
| Code quality | Good (2-5x over interpreter) | Excellent (10-30x over interpreter) |
| Memory for IR | Small | Large (sea-of-nodes graph) |
| Deopt cost | Low (simple mapping) | High (complex state reconstruction) |

If you compiled everything at the top tier, your application would take minutes to start (the JVM compiles thousands of methods). Tiered compilation means you only pay the high cost for code that justifies it.

## Summary

```
  +-------------------------------------------------------------+
  |                    JIT Compilation Pipeline                  |
  +-------------------------------------------------------------+
  |                                                             |
  |  Source → Bytecode → Interpreter → Profile → Compile →     |
  |                        ↑                          |         |
  |                        |    Deoptimize            |         |
  |                        +←←←←←←←←←←←←←←←←←←←←←←←+         |
  |                                                             |
  |  Key insight: Runtime profile data enables optimizations    |
  |  that no static compiler can safely perform.                |
  +-------------------------------------------------------------+
```

JIT compilation is the reason Java and JavaScript can compete with C/C++ on compute-heavy workloads despite being "interpreted" languages. The interpreter gives you instant startup, profiling gives you knowledge of actual runtime behavior, and tiered compilation turns that knowledge into fast machine code — with deoptimization as the safety net when the world changes.

## References

- [HotSpot Compiler Wiki](https://wiki.openjdk.org/display/HotSpot/Compiler) — overview of C1 and C2 architecture
- [V8 Blog: Launching Ignition and TurboFan](https://v8.dev/blog/launching-ignition-and-turbofan) — V8's interpreter and top-tier compiler
- [V8 Blog: Maglev](https://v8.dev/blog/maglev) — V8's mid-tier optimizing compiler
- Aycock, J. (2003). "A Brief History of Just-In-Time." *ACM Computing Surveys*, 35(2), 97-113
- [GraalVM: Understanding Compilation](https://www.graalvm.org/latest/graalvm-as-a-platform/language-implementation-framework/CompilationOverview/) — a modern JIT built on Truffle/Graal
- [OpenJDK Source](https://github.com/openjdk/jdk) — `src/hotspot/share/compiler/` and `src/hotspot/share/opto/`
