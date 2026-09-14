---
author: JZ
pubDatetime: 2026-09-14T06:23:00Z
modDatetime: 2026-09-14T06:23:00Z
title: System Design - How Compilers Turn Source Code into Machine Code
tags:
  - design-system
  - design-language
description:
  "How compilers work: the full pipeline from source code to executable — lexing, parsing, AST construction, semantic analysis, intermediate representation, optimization passes, and code generation, with source code examples from real compilers."
---

## Table of contents

## Context

When you type `gcc hello.c -o hello` and run `./hello`, something remarkable happens in between. Your human-readable C code gets transformed into a sequence of binary instructions that the CPU can execute directly. This transformation — **compilation** — is one of the most elegant pipelines in all of computer science.

A compiler is not one monolithic program. It is a **pipeline of stages**, each taking a well-defined input and producing a well-defined output. The beauty is that each stage knows nothing about the others; it just does its job and passes the result forward.

```
  Source Code (.c, .go, .rs)
        |
        v
  +-------------+
  |   Lexer     |  characters --> tokens
  +------+------+
         |
         v
  +-------------+
  |   Parser    |  tokens --> AST (Abstract Syntax Tree)
  +------+------+
         |
         v
  +-------------+
  |  Semantic   |  AST --> annotated AST (types checked)
  |  Analysis   |
  +------+------+
         |
         v
  +-------------+
  |  IR Gen     |  AST --> Intermediate Representation
  +------+------+
         |
         v
  +-------------+
  | Optimizer   |  IR --> optimized IR
  +------+------+
         |
         v
  +-------------+
  | Code Gen    |  IR --> machine code / assembly
  +------+------+
         |
         v
  Executable binary
```

Let's walk through each stage with a concrete example. Suppose we're compiling this small function:

```c
int square(int x) {
    return x * x;
}
```

## Stage 1: Lexical Analysis (Lexing)

The **lexer** (also called a **tokenizer** or **scanner**) reads the raw source code character by character and groups them into **tokens** — the smallest meaningful units of the language. Think of it as breaking a sentence into words and punctuation.

```
  Source characters:

  i n t   s q u a r e ( i n t   x )   { \n     r e t u r n   x   *   x ; \n }

  Lexer output (token stream):

  [KEYWORD:int] [IDENT:square] [LPAREN] [KEYWORD:int] [IDENT:x] [RPAREN]
  [LBRACE] [KEYWORD:return] [IDENT:x] [STAR] [IDENT:x] [SEMICOLON] [RBRACE]
```

The lexer discards whitespace and comments (they're not meaningful to later stages) and classifies each token by type: keyword, identifier, literal, operator, or punctuation.

### How a Lexer Works

Most lexers are built from **finite automata** — state machines that consume one character at a time and transition between states. Here is a simplified state machine for recognizing an integer literal:

```
             digit         digit
  [START] ---------> [IN_NUMBER] ---------> [IN_NUMBER]
                          |
                          | non-digit
                          v
                      [EMIT TOKEN]
```

In practice, production compilers use hand-written lexers for performance. Here is a simplified version of how Go's lexer (in [`cmd/compile/internal/syntax/scanner.go`](https://github.com/golang/go/blob/master/src/cmd/compile/internal/syntax/scanner.go)) identifies a token:

```go
func (s *scanner) next() {
    // skip whitespace
    for s.ch == ' ' || s.ch == '\t' || s.ch == '\n' || s.ch == '\r' {
        s.nextch()
    }

    switch {
    case isLetter(s.ch):
        s.ident()         // could be keyword or identifier
    case isDigit(s.ch):
        s.number(false)   // integer or float literal
    case s.ch == '"':
        s.stdString()     // string literal
    case s.ch == '(':
        s.tok = _Lparen
        s.nextch()
    case s.ch == '*':
        s.tok = _Star
        s.nextch()
    // ... more cases for every token type
    }
}
```

The `ident()` function reads a full word, then checks if it matches a reserved keyword (like `int`, `return`, `for`). If not, it's an identifier (like `square`, `x`).

**Why hand-written instead of generated?** Tools like `lex`/`flex` can auto-generate lexers from regular expressions, and many compilers started this way. But hand-written lexers are faster (no table lookups), produce better error messages, and are easier to debug. GCC, Clang, Go, and Rust all use hand-written lexers.

## Stage 2: Parsing (Syntax Analysis)

The **parser** takes the flat stream of tokens and builds a tree structure that reflects the grammatical structure of the code. This tree is called an **Abstract Syntax Tree** (AST).

For our `square` function, the parser produces:

```
                FunctionDecl
               /     |      \
         type:int  name:square  params:[x:int]
                       |
                     body
                       |
                  ReturnStmt
                       |
                  BinaryExpr
                  /    |    \
              left:x  op:*  right:x
```

The tree is "abstract" because it omits syntactic details that don't affect meaning — parentheses, semicolons, and braces are used during parsing but don't appear in the tree. The tree captures **what** the code means, not **how** it was punctuated.

### Recursive Descent Parsing

The most common parsing technique in production compilers is **recursive descent** — the parser has one function per grammar rule, and functions call each other recursively to build the tree top-down.

Here is how Go's parser (in [`cmd/compile/internal/syntax/parser.go`](https://github.com/golang/go/blob/master/src/cmd/compile/internal/syntax/parser.go)) parses a binary expression:

```go
func (p *parser) binaryExpr(prec int) Expr {
    x := p.unaryExpr()  // parse the left operand first

    for {
        op, oprec := p.tokPrec()
        if oprec < prec {
            return x  // done: next operator has lower precedence
        }
        p.next()  // consume the operator token
        y := p.binaryExpr(oprec + 1)  // parse right operand (higher prec)
        x = &Operation{Op: op, X: x, Y: y}  // build tree node
    }
}
```

This handles **operator precedence** naturally. When parsing `a + b * c`, the `*` has higher precedence than `+`, so `b * c` groups first:

```
        +
       / \
      a   *
         / \
        b   c
```

The recursive call with `oprec + 1` ensures that the right-hand side "grabs" operators of equal or higher precedence before returning.

### Context-Free Grammars

Every programming language is defined by a **context-free grammar** (CFG) — a set of rules describing how tokens can be combined. For expressions, a simplified grammar looks like:

```
  expr     ::= term (('+' | '-') term)*
  term     ::= factor (('*' | '/') factor)*
  factor   ::= NUMBER | IDENT | '(' expr ')'
```

Each rule directly maps to a parsing function. `expr()` calls `term()`, which calls `factor()`. The grammar's recursive structure (an expression can contain sub-expressions inside parentheses) is handled by the parser's recursive function calls.

### Handling Ambiguity: The Dangling Else

Some constructs are famously ambiguous. Consider:

```c
if (a) if (b) x = 1; else x = 2;
```

Does the `else` belong to the inner `if` or the outer `if`? The grammar alone is ambiguous — both parses are valid. Languages resolve this by convention: the `else` always attaches to the **nearest** `if`. The parser implements this by greedily consuming `else` before returning from the inner `if` parse.

## Stage 3: Semantic Analysis

The parser checks **syntax** (is the code grammatically valid?), but it doesn't check **meaning**. That's the job of **semantic analysis** — the stage that gives the AST meaning by resolving names, checking types, and enforcing language rules.

### Name Resolution

When the semantic analyzer sees `return x * x`, it needs to figure out which `x` this refers to. It maintains a **symbol table** — a stack of scopes mapping names to their declarations:

```
  Symbol Table (during analysis of "return x * x")

  +-------------------+
  | Scope: function   |
  |   x -> param:int  |  <-- found here
  +-------------------+
  | Scope: global     |
  |   square -> func  |
  +-------------------+
```

The analyzer walks from the innermost scope outward. If it finds `x` in the function scope, it binds the reference to that declaration. If it reaches the global scope without finding `x`, it reports an "undeclared variable" error.

### Type Checking

After resolving names, the analyzer checks that operations make sense for the types involved. For `x * x` where `x` is `int`:

```
  BinaryExpr(*)
    left:  x  -> type: int  (from symbol table)
    right: x  -> type: int
    op:    *
    rule:  int * int -> int   (valid)
    result type: int

  ReturnStmt
    value type: int
    function return type: int
    rule:  int == int   (valid)
```

If you wrote `return x * "hello"`, the type checker would reject it: `int * string` has no rule. This is where many compile-time errors originate.

### Type Inference

In languages like Rust, Go (with `:=`), or Haskell, you don't always write types explicitly. The semantic analyzer **infers** them. Given:

```rust
let y = x * x;  // what type is y?
```

The analyzer knows `x: i32`, looks up the rule for `i32 * i32 -> i32`, and concludes `y: i32`. More complex inference (like Hindley-Milner in Haskell/ML) can deduce types across entire programs without any annotations.

## Stage 4: Intermediate Representation (IR)

After semantic analysis, the compiler translates the AST into an **intermediate representation** — a lower-level language that is closer to machine code but still machine-independent. The IR is the lingua franca between the front end (language-specific) and the back end (machine-specific).

### Why Not Go Straight to Machine Code?

```
  Without IR:

  C    ----\                   /----> x86
  C++  -----+-- N*M backends -+----> ARM
  Rust ----/                   \----> RISC-V

  With IR:

  C    ---> IR --+                +----> x86
  C++  ---> IR --+--> Optimizer --+----> ARM
  Rust ---> IR --+                +----> RISC-V

  N frontends + M backends = N+M work instead of N*M
```

This is the key insight behind **LLVM** (Low Level Virtual Machine), the compiler infrastructure used by Clang (C/C++), Rust, Swift, and many others. Every language compiles to **LLVM IR**, and LLVM's optimizer and code generators handle the rest.

### LLVM IR

For our `square` function, the LLVM IR looks like:

```llvm
define i32 @square(i32 %x) {
entry:
  %result = mul i32 %x, %x
  ret i32 %result
}
```

You can generate this yourself:

```bash
clang -S -emit-llvm -O0 square.c -o square.ll
cat square.ll
```

LLVM IR is in **Static Single Assignment** (SSA) form — every variable is assigned exactly once. This seems restrictive but makes optimization dramatically easier. If you have:

```c
x = 1;
x = x + 2;
x = x * 3;
```

In SSA form, each assignment gets a new name:

```llvm
%x1 = 1
%x2 = add i32 %x1, 2
%x3 = mul i32 %x2, 3
```

Why? Because with unique names, the compiler can instantly see which value flows where. There's no ambiguity about "which version of `x` does this line use?" — it's right there in the name.

### The Phi Function

SSA has one complication: **control flow**. Consider:

```c
int y;
if (cond)
    y = 1;
else
    y = 2;
return y;  // which y?
```

After the `if/else`, `y` could be either `%y1` or `%y2`. SSA uses a special **phi function** (φ) to merge:

```llvm
entry:
  br i1 %cond, label %then, label %else

then:
  br label %merge

else:
  br label %merge

merge:
  %y = phi i32 [1, %then], [2, %else]   ; pick based on which path we came from
  ret i32 %y
```

The phi function says: "if we arrived from `%then`, use 1; if from `%else`, use 2." It doesn't generate any actual machine instruction — it's a bookkeeping device that tells the register allocator which value to use.

## Stage 5: Optimization

This is where compilers earn their keep. The optimizer transforms the IR to make it faster, smaller, or both — without changing what the program does. Modern optimizers run dozens of **passes**, each looking for a specific pattern to improve.

### Constant Folding

Replace expressions with known values at compile time:

```
  Before:          After:
  %a = mul i32 3, 4    %a = 12
  %b = add i32 %a, 1   %b = 13
```

### Dead Code Elimination

Remove code that has no effect on the program's output:

```
  Before:                    After:
  %x = mul i32 %a, %b       (deleted — %x is never used)
  %y = add i32 %a, 1        %y = add i32 %a, 1
  ret i32 %y                ret i32 %y
```

### Function Inlining

Replace a function call with the function's body:

```
  Before:                        After:
  define i32 @main() {           define i32 @main() {
    %r = call i32 @square(5)       %r = mul i32 5, 5    ; inlined
    ret i32 %r                     ret i32 %r
  }                              }
```

Inlining eliminates the overhead of a function call (pushing arguments, jumping, returning) and — crucially — exposes the inlined code to further optimizations. After inlining `square(5)`, constant folding can turn `mul i32 5, 5` into `25`.

### Loop-Invariant Code Motion

Move computations out of a loop if they produce the same result every iteration:

```
  Before:                     After:
  for i in 0..n:              %len = strlen(s)   ; hoisted
    x = strlen(s) + i         for i in 0..n:
                                x = %len + i
```

### Strength Reduction

Replace expensive operations with cheaper equivalents:

```
  Before:                After:
  %r = mul i32 %x, 8    %r = shl i32 %x, 3   ; shift left by 3 = multiply by 8
```

Multiplication by a power of 2 becomes a bit shift, which is a single CPU cycle.

### Optimization Levels

When you pass `-O0`, `-O1`, `-O2`, or `-O3` to GCC or Clang, you're selecting how many optimization passes to run:

```
  -O0   No optimization. Fast compile, debuggable output.
  -O1   Basic optimizations (constant folding, dead code elimination).
  -O2   Most optimizations (inlining, loop transforms, vectorization).
        This is the standard "production" level.
  -O3   Aggressive optimizations (more inlining, loop unrolling).
        Can increase binary size; rarely faster than -O2.
  -Os   Optimize for size (like -O2 but avoids size-increasing transforms).
```

## Stage 6: Code Generation

The final stage translates the optimized IR into actual machine code for a specific CPU architecture. This is where the abstract becomes concrete.

### Instruction Selection

The code generator maps each IR operation to one or more CPU instructions. For `mul i32 %x, %x` on x86-64:

```
  IR:                    x86-64 assembly:
  %result = mul i32      imul eax, edi, edi    ; eax = edi * edi
             %x, %x
```

But instruction selection isn't always one-to-one. The code generator picks the best instruction from many possibilities. For example, `mul i32 %x, 2` could become:

```asm
  imul eax, edi, 2     ; multiply instruction
  ; or:
  lea  eax, [edi+edi]  ; "load effective address" trick — add edi to itself
  ; or:
  shl  edi, 1          ; shift left by 1
```

The code generator picks the one with the lowest **latency** and **throughput** for the target CPU.

### Register Allocation

CPUs have a limited number of registers (x86-64 has 16 general-purpose registers). The IR can use unlimited virtual registers, so the code generator must decide which values live in which physical registers — and when to **spill** values to memory (the stack) if registers run out.

```
  IR (unlimited registers):         x86-64 (16 registers):

  %a = load ...                     mov eax, [mem_a]
  %b = load ...                     mov ecx, [mem_b]
  %c = add %a, %b                   add eax, ecx       ; reuse eax
  %d = mul %c, %a                   imul eax, eax, ???  ; problem: %a was in eax
                                                        ; but eax now holds %c!
```

This is a hard problem (NP-complete for optimal allocation). Compilers use heuristics like **graph coloring**: build an **interference graph** where nodes are variables and edges connect variables that are "live" at the same time (they can't share a register), then color the graph with as few colors as registers. Variables that get the same color share a register.

```
  Interference graph for:
  %a, %b live at same time
  %b, %c live at same time
  %a, %c live at same time

      %a ---- %b
       \      /
        \    /
         %c

  3 variables, all interfere -> need 3 registers (or spill one)
```

### Putting It All Together

For our `square` function, the complete journey on x86-64:

```
  C source:              int square(int x) { return x * x; }

  Tokens:                [int] [square] [(] [int] [x] [)] [{] [return] [x] [*] [x] [;] [}]

  AST:                   FunctionDecl(square, [x:int], ReturnStmt(BinExpr(x, *, x)))

  LLVM IR:               define i32 @square(i32 %x) {
                           %r = mul i32 %x, %x
                           ret i32 %r
                         }

  x86-64 assembly:       square:
                           mov    eax, edi      ; argument x is in edi (System V ABI)
                           imul   eax, edi      ; eax = eax * edi = x * x
                           ret                  ; return value in eax

  Machine code (hex):    89 f8 0f af c7 c3
```

Six bytes. That's what your function becomes: six bytes of machine code that the CPU runs directly.

## The Linker: The Final Step

Compilation produces **object files** (`.o`) — machine code with unresolved references. If `main.c` calls `square()`, the object file for `main.o` has a placeholder where `square`'s address should go. The **linker** resolves these references:

```
  main.o                          square.o
  +---------------------+        +------------------+
  | ...                 |        | square:          |
  | call ????????       |------->|   mov eax, edi   |
  |      (unresolved)   |        |   imul eax, edi  |
  +---------------------+        |   ret            |
                                 +------------------+

  After linking (executable):
  +------------------------------------------+
  | ...                                      |
  | call 0x401020       ; resolved address   |
  | ...                                      |
  | 0x401020: square:                        |
  |   mov eax, edi                           |
  |   imul eax, edi                          |
  |   ret                                    |
  +------------------------------------------+
```

The linker also pulls in library code (like `printf` from libc), handles symbol visibility, and lays out the final executable in the format the OS expects (ELF on Linux, Mach-O on macOS, PE on Windows).

## Compiler Design Philosophies

Different compilers make different trade-offs:

```
  Compiler    Approach              Trade-off
  ---------   --------------------  ----------------------------------
  GCC         Monolithic, multiple  Mature, supports many targets,
              internal IRs          slower compilation
  Clang/LLVM  Modular, single IR   Clean architecture, fast compile,
              (LLVM IR)             great error messages
  Go (gc)     Custom compiler,      Extremely fast compilation,
              no LLVM               simpler optimizations
  Rust        LLVM backend          Heavy optimization, slow compile,
                                    fast executables
  V8 (JS)     JIT: interpreter +    Starts fast (interpreter), gets
              optimizing compiler   fast over time (JIT-compiled hot paths)
  javac       Compile to bytecode,  Platform independent bytecode,
              JVM JIT at runtime    JIT optimizes for actual hardware
```

**GCC** uses three internal representations: GIMPLE (high-level), then tree SSA, then RTL (Register Transfer Language) for the back end. This is historical — GCC predates LLVM by over a decade.

**LLVM's** modularity is its superpower. Any language can target LLVM IR, and LLVM handles optimization and code generation. This is why new languages (Rust, Swift, Julia, Zig) overwhelmingly choose LLVM as their back end.

**Go's** compiler (`gc`) deliberately avoids LLVM to keep compilation fast. Go compiles large projects in seconds, not minutes. The trade-off is that Go binaries are somewhat less optimized than Clang/LLVM output — but for most Go programs, compilation speed matters more.

## References

1. Compilers: Principles, Techniques, and Tools (the "Dragon Book") by Aho, Lam, Sethi, and Ullman — the classic textbook
2. LLVM Language Reference Manual [doc](https://llvm.org/docs/LangRef.html)
3. Go compiler source code [`cmd/compile`](https://github.com/golang/go/tree/master/src/cmd/compile)
4. Clang: a C language family frontend for LLVM [doc](https://clang.llvm.org/)
5. Crafting Interpreters by Robert Nystrom [book](https://craftinginterpreters.com/) — an excellent hands-on introduction
6. Static Single Assignment form [wiki](https://en.wikipedia.org/wiki/Static_single-assignment_form)
7. Register Allocation via Graph Coloring [paper](https://dl.acm.org/doi/10.1145/800230.806984) by Chaitin et al. (1981)
8. An Introduction to LLVM [article](https://www.aosabook.org/en/llvm.html) from The Architecture of Open Source Applications
