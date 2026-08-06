---
author: JZ
pubDatetime: 2026-08-06T06:23:00Z
modDatetime: 2026-08-06T06:23:00Z
title: System Design - How WebAssembly (Wasm) Works
tags:
  - design-system
  - design-concurrency
description:
  "How WebAssembly works: binary format, stack-based virtual machine, module structure, linear memory model, compilation from source languages, and the security sandbox."
---

## Table of contents

## Context

JavaScript has powered the web for decades, but it was never designed for compute-heavy tasks like video encoding, 3D rendering, or running a database in the browser. Developers had to either accept slow performance or build native plugins (like Flash or Java applets) that broke the web's security model.

WebAssembly (Wasm) solves this by providing a **portable binary instruction format** that runs at near-native speed inside a sandboxed virtual machine. It was designed by engineers from Mozilla, Google, Microsoft, and Apple as a compile target — you write code in C, C++, Rust, or Go, and the compiler produces a `.wasm` binary that any compliant runtime can execute.

Today Wasm runs not only in browsers but also on servers (via runtimes like Wasmtime, Wasmer, and WasmEdge), in edge computing (Cloudflare Workers, Fastly Compute), and even inside databases and blockchain nodes.

```
                    WebAssembly Ecosystem

   Source Languages              Compile Targets
  +-------------+              +------------------+
  |    C / C++  |---+          |   Browser (V8,   |
  +-------------+   |          |   SpiderMonkey)  |
                    |          +------------------+
  +-------------+   |
  |    Rust     |---+--> .wasm ---> Runtime
  +-------------+   |          +------------------+
                    |          |  Server (Wasmtime |
  +-------------+   |          |  Wasmer, WAMR)   |
  |    Go       |---+          +------------------+
  +-------------+   |
                    |          +------------------+
  +-------------+   |          |  Edge (Cloudflare|
  | AssemblyScript|-+          |  Workers, Fastly)|
  +-------------+              +------------------+
```

## The Binary Format

A `.wasm` file is a compact binary encoding. Unlike text-based formats (JavaScript, JSON), every byte has a defined purpose. The file starts with an 8-byte header:

```
  Offset   Bytes    Meaning
  ------   -----    -------
  0x00     4        Magic number: 0x00 0x61 0x73 0x6D ("\0asm")
  0x04     4        Version:      0x01 0x00 0x00 0x00 (version 1)
```

After the header, the module is organized into **sections**, each identified by a single-byte ID:

```
  ID   Section        Purpose
  --   -------        -------
   1   Type           Function signatures (param types -> return types)
   2   Import         Functions/memories/tables imported from host
   3   Function       Maps function index -> type index
   4   Table          Indirect function call tables
   5   Memory         Linear memory declarations (initial/max pages)
   6   Global         Global variable declarations
   7   Export         Names exposed to the host environment
   8   Start          Entry point function (optional)
   9   Element        Table initialization data
  10   Code           Function bodies (locals + instructions)
  11   Data           Memory initialization segments
```

Each section is length-prefixed, so a runtime can skip sections it doesn't need or stream-compile the Code section while still downloading Data.

## The Stack Machine

Wasm uses a **stack-based virtual machine**. There are no general-purpose registers in the abstract machine — all computation happens by pushing values onto and popping values from an operand stack.

Here is a simple function that adds two 32-bit integers:

```wasm
(func $add (param $a i32) (param $b i32) (result i32)
  local.get $a    ;; push $a onto stack
  local.get $b    ;; push $b onto stack
  i32.add         ;; pop two values, push their sum
)
```

Execution trace:

```
  Instruction      Stack (top on right)
  -----------      --------------------
  (start)          []
  local.get $a     [3]            (assuming $a = 3)
  local.get $b     [3, 7]         (assuming $b = 7)
  i32.add          [10]           (3 + 7 = 10)
  (end)            returns 10
```

The stack machine design makes **validation simple**: before executing any instruction, the runtime can statically verify that the stack has the right number and types of values. This is done in a single linear pass over the bytecode — no data-flow analysis needed.

### Type System

Wasm has only four value types (with more coming in proposals):

```
  Type    Size     Description
  ----    ----     -----------
  i32     32-bit   Integer (also used for booleans, pointers in 32-bit)
  i64     64-bit   Integer
  f32     32-bit   IEEE 754 float
  f64     64-bit   IEEE 754 double
```

There are no strings, objects, or garbage-collected references in the core spec. Higher-level abstractions are built on top of these primitives using linear memory.

## Module Instantiation

When a runtime loads a `.wasm` file, it goes through three phases:

```
   .wasm binary
        |
        v
  +-----------+      Decode bytes into in-memory IR (Abstract Syntax Tree
  |  Decode   |      or similar). Rejects malformed modules immediately.
  +-----------+
        |
        v
  +-----------+      Type-check all functions. Verify stack consistency,
  | Validate  |      memory bounds, table indices. SINGLE PASS, O(n).
  +-----------+      Rejects unsafe modules before any code executes.
        |
        v
  +-----------+      Link imports, allocate memory, compile to native
  |Instantiate|      code (JIT or AOT), run start function if present.
  +-----------+
        |
        v
    Instance ready — exports available to host
```

**Validation is the security gate.** A valid module cannot:
- Access memory out of bounds (traps at runtime)
- Jump to arbitrary code (structured control flow only)
- Read the call stack or return addresses
- Access host resources without explicit imports

## Linear Memory

Wasm provides each module instance a single contiguous block of bytes called **linear memory**. It starts at address 0 and grows in units of **pages** (64 KiB each).

```
  Linear Memory Layout (example: 3 pages = 192 KiB)

  Address:  0x00000                              0x2FFFF
            |                                        |
            v                                        v
  +---------+----------+----------+---------+--------+
  | Data    | Heap     |  Stack   | (guard) | (end)  |
  | segment | (grows ---->)       |         |        |
  +---------+----------+----------+---------+--------+
  Page 0               Page 1              Page 2

  - Data segment: initialized at instantiation from Section 11
  - Heap: managed by malloc/free (compiled from source language)
  - Stack: managed by compiled code (shadow stack for locals)
  - All accesses bounds-checked against current memory size
```

Key properties:
- **Bounds-checked**: Every `load` and `store` instruction checks that `address + size <= memory.size`. Out-of-bounds access traps (halts execution), never corrupts host memory.
- **Growable**: The `memory.grow` instruction adds pages. Returns the previous size (in pages) on success, or -1 if the runtime refuses (e.g., exceeds declared maximum).
- **Isolated**: The module cannot see the host's memory, other modules' memories, or the runtime's internal data structures.

A C program compiled to Wasm places its heap, stack, and static data all inside this linear memory. The compiled `malloc` manages free lists within this byte array, just as it would in a native process — but confined to the sandbox.

## Compilation Pipeline

Let's trace how a C function becomes executable Wasm:

```
   hello.c
   -------
   #include <stdio.h>
   int square(int x) { return x * x; }

        |
        | clang --target=wasm32 -O2
        v

   hello.o  (Wasm object file, relocatable)

        |
        | wasm-ld (linker)
        v

   hello.wasm  (complete module)
        |
        |  Browser loads it:
        |  WebAssembly.instantiateStreaming(fetch('hello.wasm'))
        v

   +------------------+
   |  V8 / Liftoff    |  Baseline compiler: fast single-pass,
   |  (baseline JIT)  |  generates unoptimized native code in <1ms
   +--------+---------+
            |
            |  Hot functions get recompiled:
            v
   +------------------+
   |  V8 / TurboFan   |  Optimizing compiler: register allocation,
   |  (optimizing)    |  inlining, instruction selection
   +------------------+
            |
            v
      Native x86-64 / ARM64 machine code
      (runs at near-native speed)
```

**Streaming compilation** is critical: V8 can compile Wasm bytes as they arrive over the network. By the time the download finishes, most functions are already compiled. This is possible because Wasm's format is designed for single-pass processing — function bodies are independent and length-prefixed.

### AOT vs JIT

| Approach | When | Example Runtimes | Trade-off |
|----------|------|-----------------|-----------|
| JIT | At load time | V8, SpiderMonkey | Fast startup, optimizes hot paths |
| AOT | Before deployment | Wasmtime (Cranelift), Wasmer (LLVM) | No compilation delay at runtime |
| Interpreter | Immediately | WAMR, wasm3 | Tiny memory footprint, slow execution |

Server-side runtimes often AOT-compile `.wasm` to native code during deployment, eliminating JIT overhead entirely.

## The Host Interface (WASI)

Wasm modules have no built-in I/O — no file system, no network, no clock. All capabilities come from **imports** provided by the host. This is the capability-based security model:

```
                   Host (Runtime)
  +------------------------------------------+
  |                                          |
  |  Capability:    fd_read(fd, iovs, ...)   |
  |  Capability:    fd_write(fd, iovs, ...)  |
  |  Capability:    clock_time_get(...)      |
  |                                          |
  +----+---------------+--------------------+
       |               |
       | import        | import
       v               v
  +----------+    +----------+
  | Module A |    | Module B |
  | (has fd  |    | (no file |
  |  access) |    |  access) |
  +----------+    +----------+
```

**WASI** (WebAssembly System Interface) standardizes these imports for non-browser environments. It defines portable APIs for files, sockets, clocks, and random numbers — all capability-gated. A module can only access resources explicitly passed to it at instantiation.

This is fundamentally different from OS processes: a native binary can call any syscall. A Wasm module can only call the functions its host provides. There is no `exec()`, no raw memory access, no ambient authority.

## Structured Control Flow

Unlike native machine code, Wasm does not have arbitrary `goto` or computed jumps. All control flow uses structured constructs:

```wasm
;; if-else
(if (i32.eq (local.get $x) (i32.const 0))
  (then
    (call $handle_zero))
  (else
    (call $handle_nonzero)))

;; loop (infinite until br exits)
(block $exit
  (loop $continue
    ;; ... loop body ...
    (br_if $exit (i32.eq (local.get $i) (local.get $n)))
    ;; ... increment ...
    (br $continue)))
```

This means:
- No buffer-overflow-to-code-execution exploits (you can't overwrite a return address to jump to shellcode)
- No ROP (Return-Oriented Programming) attacks
- Control flow is fully deterministic from the bytecode

The trade-off: irreducible control flow (like Duff's device or some `goto` patterns) requires the compiler to restructure the code. The Emscripten "Relooper" algorithm and Binaryen's "Stackifier" handle this transformation.

## Performance: Why Near-Native?

Wasm achieves 80-95% of native speed. Here's where the remaining gap comes from:

```
  Source of Overhead         Typical Impact    Why
  --------------------       --------------    ---
  Bounds checking            ~5%               Every memory access checked
  Indirect call overhead     ~3%               Table lookup + signature check
  No SIMD (pre-proposal)     ~10-30%           Now mostly fixed with SIMD proposal
  Sandboxed memory model     ~2%               No mmap, no huge pages
  Limited register hints     ~1-3%             Compiler must infer from stack ops
```

For I/O-bound or memory-bound workloads, Wasm is often indistinguishable from native. The gap widens only for tight computational loops that benefit heavily from auto-vectorization or architecture-specific intrinsics.

## Real-World Examples

| Use Case | Project | Why Wasm |
|----------|---------|----------|
| Browser IDE | VS Code (web) | C++ language servers compiled to Wasm |
| Video editing | Clipchamp | FFmpeg compiled to Wasm, runs client-side |
| Database | DuckDB-Wasm | Full OLAP engine in the browser |
| Game engine | Unity, Unreal | C++ engines targeting Wasm for web |
| Plugin system | Envoy Proxy | User filters in Wasm, hot-reloadable |
| Serverless | Cloudflare Workers | Sub-millisecond cold starts vs containers |
| Blockchain | Near, Polkadot | Deterministic execution for smart contracts |

## Summary

WebAssembly is not a replacement for JavaScript — it's a complement. JavaScript handles the DOM, event handling, and high-level logic. Wasm handles the heavy lifting: codecs, physics engines, cryptography, data processing. Together they let the browser (and increasingly the server) run workloads that previously required native applications.

The key design decisions that make this work:
1. **Stack machine** — simple to validate, easy to compile
2. **Linear memory** — isolated, bounds-checked, no pointer arithmetic escapes
3. **Structured control flow** — eliminates entire classes of exploits
4. **Capability-based imports** — no ambient authority, minimal attack surface
5. **Portable binary format** — same `.wasm` runs on x86, ARM, or RISC-V

## References

1. WebAssembly specification [spec](https://webassembly.github.io/spec/core/)
2. Lin Clark, "A cartoon intro to WebAssembly" [article](https://hacks.mozilla.org/2017/02/a-cartoon-intro-to-webassembly/)
3. WASI — WebAssembly System Interface [repo](https://github.com/WebAssembly/WASI)
4. V8 WebAssembly compilation pipeline [blog](https://v8.dev/blog/liftoff)
5. Cranelift code generator (used by Wasmtime) [repo](https://github.com/bytecodealliance/wasmtime/tree/main/cranelift)
6. Emscripten compiler toolchain [site](https://emscripten.org/)
7. Bringing the web up to speed with WebAssembly (PLDI 2017) [paper](https://dl.acm.org/doi/10.1145/3062341.3062363)
8. Not So Fast: Analyzing the Performance of WebAssembly vs. Native Code [paper](https://www.usenix.org/conference/atc19/presentation/jangda)
