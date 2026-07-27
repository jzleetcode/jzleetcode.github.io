---
author: JZ
pubDatetime: 2026-07-27T07:00:00Z
modDatetime: 2026-07-27T07:00:00Z
title: System Design - How Rust's Borrow Checker Works
tags:
  - design-system
  - design-language
description:
  "How Rust's borrow checker enforces memory safety without garbage collection: ownership rules, borrowing, lifetimes, the NLL (Non-Lexical Lifetimes) algorithm, and a source code walkthrough from the rust-lang/rust compiler."
---

## Table of contents

## Context: Why Memory Safety Matters

Imagine you are writing a web server in C. A request comes in, you allocate a buffer to hold the HTTP body, parse it, hand a pointer to the parsed structure to another thread for processing, and free the buffer. Except — the other thread has not finished reading the buffer yet. It dereferences the now-dangling pointer and reads garbage memory. Congratulations, you have a **use-after-free** bug. In 2019, Microsoft reported that ~70% of their CVEs (security vulnerabilities) were memory safety issues exactly like this one.

The rogues gallery of memory bugs includes:

- **Use-after-free** — accessing memory after it has been deallocated.
- **Double-free** — calling `free()` on the same pointer twice, corrupting the allocator's metadata.
- **Data races** — two threads accessing the same memory concurrently without synchronization, where at least one is writing.
- **Buffer overflows** — writing past the end of an allocated region.

Languages have historically taken two approaches to this problem:

1. **Garbage Collection (GC)** — Java, Go, Python, and C# all use a runtime garbage collector that periodically scans memory to find unreachable objects and reclaims them. This eliminates use-after-free and double-free at the cost of unpredictable pauses and higher memory usage.

2. **Manual Management** — C and C++ leave it to the programmer. This gives maximum control and zero runtime overhead, but invites all the bugs listed above.

Rust introduced a third way: **compile-time ownership tracking**. The compiler statically proves that your program never has dangling pointers, never double-frees, and never has data races — all before a single line of code runs. The tool that enforces these guarantees is called the **borrow checker**.

Let us walk through how it works, from the high-level rules down to the compiler source code.

---

## The Three Ownership Rules

Rust's memory model is built on three rules that the compiler enforces at every point in the program:

### Rule 1: Each value has exactly one owner

```rust
fn main() {
    let s = String::from("hello"); // s owns the String
    // There is no other variable that also owns this String.
}
```

An **owner** is a variable binding that is responsible for the value's memory. When you assign a `String` to `s`, the variable `s` is the sole owner of the heap-allocated buffer that holds `"hello"`.

### Rule 2: When the owner goes out of scope, the value is dropped

```rust
fn main() {
    {
        let s = String::from("hello");
        // s is valid here
    } // <-- s goes out of scope; Rust calls drop(s), freeing the heap memory
    // s is no longer valid here
}
```

This is deterministic destruction — no GC pause, no reference counting overhead. The compiler inserts a call to `drop()` (Rust's equivalent of a destructor) at the exact point the owner's scope ends.

### Rule 3: Ownership can be moved

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1; // ownership MOVES from s1 to s2
    // println!("{}", s1); // ERROR: s1 is no longer valid
    println!("{}", s2); // OK: s2 is the new owner
}
```

After a move, the old variable is dead. The compiler will reject any attempt to use it. This prevents double-free: since only one variable ever owns the value, only one `drop()` call is ever inserted.

A helpful mental model:

```
  BEFORE MOVE         AFTER MOVE
  +------+            +------+
  |  s1  |---owns---> |  s1  | (invalid, cannot use)
  +------+     |      +------+
               |
               v      +------+
          [heap data]  |  s2  |---owns---> [heap data]
                       +------+
```

---

## Borrowing: Shared vs Mutable References

Ownership is strict, but passing ownership around for every function call would be unbearably verbose. Instead, Rust lets you **borrow** a value — take a reference to it without taking ownership.

### Shared references: `&T`

A shared reference (`&T`) gives read-only access. You can have as many shared references as you like simultaneously:

```rust
fn print_length(s: &String) {
    println!("length = {}", s.len());
}

fn main() {
    let s = String::from("hello");
    let r1 = &s;
    let r2 = &s;
    print_length(r1);
    print_length(r2);
    // Both r1 and r2 are valid. s is still the owner.
}
```

### Mutable references: `&mut T`

A mutable reference (`&mut T`) gives read-write access, but the constraint is that you can have **at most one** mutable reference to a value at any given time, and **no shared references can coexist** with it:

```rust
fn main() {
    let mut s = String::from("hello");
    let r = &mut s;
    r.push_str(", world");
    println!("{}", r); // "hello, world"
}
```

This code fails to compile:

```rust
fn main() {
    let mut s = String::from("hello");
    let r1 = &s;        // shared borrow
    let r2 = &mut s;    // ERROR: cannot borrow `s` as mutable
                        // because it is also borrowed as shared
    println!("{}", r1);
}
```

### The Readers-Writer Lock Analogy

Think of it as a **compile-time readers-writer lock**:

```
+-----------------------------------------------+
|  Borrowing Rules (enforced at compile time)   |
+-----------------------------------------------+
|                                               |
|  Either:                                      |
|    - N shared references (&T)   [many readers]|
|                                               |
|  Or:                                          |
|    - 1 mutable reference (&mut T) [one writer]|
|                                               |
|  Never both at the same time.                 |
+-----------------------------------------------+
```

A `RwLock` in a concurrent program enforces the same discipline at runtime — many readers OR one writer, never both. Rust's borrow checker enforces it statically, at zero runtime cost. The benefit is not just memory safety: it also prevents data races, because the only way two threads can access the same data is through shared references (which are read-only) or through a synchronization primitive like `Mutex<T>`.

---

## Lifetimes

### What is a lifetime?

A **lifetime** is the span of code during which a reference is valid. Every reference in Rust has a lifetime, even if you do not write it out. Most of the time, the compiler infers lifetimes automatically (this is called **lifetime elision**). But sometimes — particularly in function signatures that return references — the compiler needs your help.

### Why the compiler needs lifetime annotations

Consider this function:

```rust
fn longer(s1: &str, s2: &str) -> &str {
    if s1.len() > s2.len() { s1 } else { s2 }
}
```

This will not compile. The compiler asks: "The return value is a reference — but to what? Does it live as long as `s1` or as long as `s2`?" It cannot know without annotation:

```rust
fn longer<'a>(s1: &'a str, s2: &'a str) -> &'a str {
    if s1.len() > s2.len() { s1 } else { s2 }
}
```

The `'a` annotation says: "The returned reference is valid for at least as long as both input references are valid." Now the compiler can verify at the call site that the returned reference is not used after either input goes out of scope.

### Lifetime annotations do not change how long values live

This is a common misconception. Annotations are descriptive, not prescriptive. They tell the compiler what relationship exists between the lifetimes of different references. The compiler then checks that the relationships hold.

### The `'static` lifetime

The special lifetime `'static` means "lives for the entire duration of the program." String literals have this lifetime because they are embedded in the binary:

```rust
let s: &'static str = "I live forever";
```

---

## Non-Lexical Lifetimes (NLL)

### The Problem with Lexical Lifetimes

Before Rust 2018, the borrow checker used **lexical lifetimes** — a borrow lasted until the end of the enclosing scope (the closing `}`), regardless of whether the reference was actually used again. This led to frustrating false rejections:

```rust
fn main() {
    let mut data = vec![1, 2, 3];
    let first = &data[0];  // immutable borrow starts
    println!("{}", first);  // last use of `first`
    data.push(4);           // mutable borrow -- OLD COMPILER REJECTED THIS
}
```

Under lexical lifetimes, `first` lived until the end of `main()`, so `data.push(4)` conflicted. But clearly, after the `println!`, we never touch `first` again — it should be safe.

### NLL: Borrows End at Last Use

The **Non-Lexical Lifetimes** system, stabilized in Rust 2018, computes the actual "liveness" of each borrow. A borrow is alive only during the region of code where it might still be used. Here is the difference visualized:

```
LINE  CODE                          LEXICAL        NLL
----  ----------------------------  -------------  ----------------
 1    let mut data = vec![1,2,3];
 2    let first = &data[0];         |              |
 3    println!("{}", first);        | first alive  | first alive
 4    data.push(4);                 | first alive  |   (first dead)
 5    }                             | first alive  |
                                    v              v

LEXICAL: first lives 2..5 --> push on line 4 CONFLICTS
NLL:     first lives 2..3 --> push on line 4 is FINE
```

Under NLL, the borrow of `data` via `first` ends right after line 3, because that is the last point where `first` could possibly be used. Line 4 is free to mutably borrow `data`.

### How NLL is Computed

The compiler builds a **control-flow graph (CFG)** of the function, then runs a dataflow analysis to determine, for each borrow, the set of program points where the borrowed reference might still be live (could be used in the future along some execution path). This is a standard liveness analysis — the same technique used in register allocation.

```
                 +----------+
                 | entry    |
                 +----+-----+
                      |
                      v
                 +----------+
                 | let first|  <-- borrow of `data` starts
                 +----+-----+
                      |
                      v
                 +----------+
                 | println! |  <-- last use of `first`
                 +----+-----+
                      |
                      v
                 +----------+
                 | push(4)  |  <-- `first` is dead here, mutable borrow OK
                 +----+-----+
                      |
                      v
                 +----------+
                 | return   |
                 +----------+
```

---

## Inside the Compiler: How the Borrow Checker Actually Works

Now let us look at the actual implementation in the `rust-lang/rust` repository. The borrow checker operates on **MIR** (Mid-level Intermediate Representation), not on the surface syntax you write.

### The Compilation Pipeline

```
Source Code (.rs)
       |
       v
    [Parsing] --> AST (Abstract Syntax Tree)
       |
       v
    [Lowering] --> HIR (High-level IR, desugared)
       |
       v
    [Type Check] --> Typed HIR
       |
       v
    [MIR Construction] --> MIR  <--- borrow checker runs HERE
       |
       v
    [Optimization] --> Optimized MIR
       |
       v
    [Code Generation] --> LLVM IR --> Machine Code
```

### Why MIR?

MIR is a simplified representation where:
- All complex expressions are broken into simple statements.
- Control flow is explicit (basic blocks + terminators).
- Every temporary value has a named "place" (local variable).
- Drop points are explicit.

This makes it much easier to reason about lifetimes and borrows than the original nested expression tree.

### Key Source Files

The borrow checker lives in `compiler/rustc_borrowck/src/`. Here are the key files:

| File | Purpose |
|------|---------|
| `lib.rs` | Entry point; orchestrates the borrow check pass |
| `borrowck_errors.rs` | Error reporting and diagnostics |
| `type_check/mod.rs` | Integrates type checking with region inference |
| `region_infer/mod.rs` | Region (lifetime) inference engine |
| `nll.rs` | The NLL computation: builds constraints, solves regions |
| `places_conflict.rs` | Determines if two memory "places" alias |
| `prefixes.rs` | Computes prefixes of a place (e.g., `a.b.c` -> `a.b`, `a`) |
| `path_utils.rs` | Utilities for working with move paths |
| `diagnostics/` | Directory containing all diagnostic improvement logic |

### The Borrow Check Algorithm (Simplified)

1. **Build the MIR CFG.** The function body is represented as a set of basic blocks, each containing a sequence of statements and ending with a terminator (branch, return, call, etc.).

2. **Compute liveness.** For each local variable, determine at which program points it is live (might be used in the future). This is done via backward dataflow: a variable is live at point P if there is a path from P to a use of that variable that does not pass through a reassignment.

3. **Generate borrow constraints.** Each borrow statement (`_2 = &_1` or `_2 = &mut _1`) generates a region variable. The compiler creates constraints of the form: "region R must include program point P" whenever the reference is live at P.

4. **Solve region constraints.** The region inference engine (`region_infer/mod.rs`) computes the minimal region (set of program points) for each borrow that satisfies all constraints. This is essentially a fixed-point iteration over the constraint graph.

5. **Check for conflicts.** With regions computed, the checker walks the MIR and at each statement asks: "Is there an active borrow that conflicts with this access?" Conflicts arise when:
   - A mutable borrow is active and we try to read/write through another path.
   - A shared borrow is active and we try to write through the original path.
   - A value is moved while a borrow is active.

6. **Report errors.** If a conflict is found, the compiler generates a diagnostic. The diagnostics code in `diagnostics/` is extensive — it tries to suggest fixes, explain why the borrow is still active, and point to the conflicting uses.

### Key Data Structures

**`BorrowSet`** — The set of all borrows in the function, indexed by a `BorrowIndex`. Each entry records:
- The place being borrowed (e.g., `_1.field`)
- The kind of borrow (shared, mutable, or unique)
- The location in the MIR where the borrow was created
- The region variable assigned to this borrow

**`RegionInferenceContext`** — The solver state. Contains:
- A set of region variables (one per borrow, plus others from type annotations)
- A constraint graph: edges like "region A outlives region B"
- The computed values (sets of program points) for each region

**`PlaceConflictBias`** — When checking if two memory accesses conflict, the checker needs to decide if `a.b` and `a.b.c` overlap. This enum controls the bias: `Overlap` (conservative, used for borrows) or `NoOverlap` (used for moves).

### A Concrete Example Through the Pipeline

Consider:

```rust
fn example() {
    let mut x = 5;
    let r = &mut x;
    *r += 1;
    println!("{}", x);
}
```

After lowering to MIR (simplified):

```
bb0: {
    _1 = 5;                    // let mut x = 5
    _2 = &mut _1;             // let r = &mut x
    (*_2) = Add((*_2), 1);   // *r += 1
    // ... println expands to a call using _1
    _3 = &_1;                 // immutable borrow for println
    call fmt::Display(...)
    return;
}
```

The borrow checker sees:
- `_2 = &mut _1` creates borrow B0 (mutable, of `_1`)
- B0's region must include the point of `(*_2) = Add(...)` because `_2` is live there.
- `_3 = &_1` creates borrow B1 (shared, of `_1`)
- At the point of `_3 = &_1`, is B0 still active? We check: is `_2` live after this point? If `_2` is never used again after `(*_2) = Add(...)`, then B0's region ends there, and B1 does not conflict.

Under NLL, `_2` is last used at `(*_2) = Add(...)`, so B0 is dead by the time `_3 = &_1` executes. The code compiles.

---

## Real-World Example: The Iterator Invalidation Problem

One of the most common sources of bugs in C++ is **iterator invalidation** — modifying a container while iterating over it.

### How C++ Gets This Wrong

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5};

    for (auto it = v.begin(); it != v.end(); ++it) {
        if (*it == 3) {
            v.push_back(6); // BUG: may reallocate, invalidating `it`
        }
        std::cout << *it << std::endl;
    }
    return 0;
}
```

This compiles without warning in C++. At runtime, `push_back` may trigger a reallocation of the vector's internal buffer, making `it` a dangling pointer. The program exhibits undefined behavior — it might crash, print garbage, or appear to work correctly until a customer runs it in production.

### How Rust Prevents It

```rust
fn main() {
    let mut v = vec![1, 2, 3, 4, 5];

    for &item in &v {       // immutable borrow of `v` starts here
        if item == 3 {
            v.push(6);      // ERROR: cannot borrow `v` as mutable
                            // because it is also borrowed as immutable
        }
        println!("{}", item);
    }
}
```

The compiler error:

```
error[E0502]: cannot borrow `v` as mutable because it is also
              borrowed as immutable
 --> src/main.rs:5:13
  |
3 |     for &item in &v {
  |                  --
  |                  |
  |                  immutable borrow occurs here
4 |         if item == 3 {
5 |             v.push(6);
  |             ^^^^^^^^^^ mutable borrow occurs here
6 |         }
7 |         println!("{}", item);
  |                        ---- immutable borrow later used here
```

The borrow checker sees that:
1. `&v` creates a shared borrow that lives for the duration of the `for` loop.
2. `v.push(6)` requires `&mut v` — a mutable borrow.
3. A shared borrow and a mutable borrow cannot coexist.

The fix is to collect the modifications and apply them after the loop:

```rust
fn main() {
    let mut v = vec![1, 2, 3, 4, 5];
    let should_push = v.iter().any(|&x| x == 3);

    if should_push {
        v.push(6); // No conflict: the iterator borrow ended above
    }

    for &item in &v {
        println!("{}", item);
    }
}
```

### Why This Matters

Iterator invalidation is not a toy example. It has caused real-world security vulnerabilities in browsers (e.g., use-after-free in DOM node lists), databases (corrupted B-tree iterators), and game engines (entity component systems). Rust eliminates the entire class of bugs at compile time, with zero runtime overhead.

---

## Beyond the Basics: Unsafe and Escape Hatches

The borrow checker is deliberately conservative. It will reject some programs that are actually safe, because proving safety in the general case is undecidable. For these situations, Rust provides `unsafe` blocks:

```rust
fn split_at_mut(slice: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = slice.len();
    let ptr = slice.as_mut_ptr();

    assert!(mid <= len);

    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}
```

The borrow checker cannot prove that two mutable references to non-overlapping parts of a slice are safe. But the programmer knows they are (because the ranges do not overlap), so they use `unsafe` to tell the compiler "trust me here." The key insight is that `unsafe` is not "turn off the borrow checker" — it is a locally-scoped assertion that the programmer has manually verified the invariants that the compiler cannot check.

---

## Summary: The Borrow Checker's Guarantees

At the end of a successful compilation, the borrow checker has proven:

```
+--------------------------------------------------+
|  GUARANTEE                    | PREVENTS         |
+--------------------------------------------------+
|  No dangling references       | Use-after-free   |
|  Single owner or explicit Rc  | Double-free      |
|  &T XOR &mut T               | Data races       |
|  Bounds-checked indexing      | Buffer overflows |
+--------------------------------------------------+
```

All of this with:
- Zero runtime overhead (no GC, no reference counting for normal types)
- Deterministic destruction (resources freed at predictable points)
- Fearless concurrency (the type system prevents data races)

The cost is paid at compile time: longer compile times, and a learning curve as programmers internalize the ownership model. But once you do, entire categories of bugs simply disappear.

---

## References

1. **The Rust Reference — Ownership** https://doc.rust-lang.org/reference/ownership.html
2. **The Rustonomicon — Ownership and Lifetimes** https://doc.rust-lang.org/nomicon/ownership.html
3. **RFC 2094: Non-Lexical Lifetimes** https://rust-lang.github.io/rfcs/2094-nll.html
4. **Rust Compiler Source — Borrow Checker** https://github.com/rust-lang/rust/tree/master/compiler/rustc_borrowck/src
5. **Rust Compiler Dev Guide — Borrow Checking** https://rustc-dev-guide.rust-lang.org/borrow_check.html
6. **Microsoft: 70% of CVEs are memory safety issues** https://msrc.microsoft.com/blog/2019/07/a-proactive-approach-to-more-secure-code/
7. **MIR RFC (RFC 1211)** https://rust-lang.github.io/rfcs/1211-mir.html
8. **Rust Blog: NLL Stabilization** https://blog.rust-lang.org/2018/12/06/Rust-1.31-and-rust-2018.html
