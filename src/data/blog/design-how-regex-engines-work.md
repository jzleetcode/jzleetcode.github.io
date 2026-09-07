---
author: JZ
pubDatetime: 2026-09-07T10:00:00Z
modDatetime: 2026-09-07T10:00:00Z
title: System Design - How Regular Expression Engines Work
tags:
  - design-system
  - design-algorithms
description:
  "How regular expression engines work internally: finite automata theory, Thompson's construction, NFA vs DFA trade-offs, backtracking engines, and why some patterns cause catastrophic performance."
---

## Table of contents

## Context

Regular expressions are everywhere. You use them to validate emails, search log files, parse configuration, and match URL routes. Most programmers treat them as a black box: you write a pattern, the engine finds matches. But what happens inside that box?

The answer involves one of the most elegant connections in computer science — the bridge between a pattern you write in text and a tiny virtual machine that processes strings character by character. Understanding this bridge helps you write faster patterns, debug surprising behavior, and avoid the catastrophic backtracking that has taken down production systems.

There are two fundamentally different approaches to building a regex engine:

```
                        Regex Engine Families

  +---------------------------+     +---------------------------+
  |   Automata-based (DFA)    |     |   Backtracking (NFA)      |
  |                           |     |                           |
  |  - Thompson/subset const. |     |  - Recursive descent      |
  |  - Guaranteed linear time |     |  - Supports backrefs      |
  |  - No backreferences     |     |  - Can be exponential     |
  |                           |     |                           |
  |  Used by: grep, awk,     |     |  Used by: Python, Java,   |
  |  RE2, Rust regex crate   |     |  JavaScript, Ruby, Perl,  |
  |                           |     |  PCRE, .NET               |
  +---------------------------+     +---------------------------+
```

Most languages you use daily (Python, Java, JavaScript) use the backtracking approach because it supports powerful features like backreferences. But the automata-based approach, used by tools like `grep` and Google's RE2, guarantees linear-time matching — a property that matters enormously at scale.

Let's start from the theory and build up.

## Finite Automata: The Foundation

A regular expression describes a **regular language** — a set of strings that can be recognized by a **finite automaton**. There are two flavors:

### NFA (Nondeterministic Finite Automaton)

An NFA can be in **multiple states simultaneously**. When it reads a character, it might have several possible next states. It also supports **epsilon transitions** — moves that consume no input.

Here is the NFA for the pattern `a(b|c)*d`:

```
           epsilon         epsilon
    +---->( 2 )---b--->( 3 )----+
    |                            |
    |      epsilon         epsilon
    +---->( 4 )---c--->( 5 )----+
    |                            |
    |                            v
  ( 0 )---a--->( 1 )         ( 6 )---d--->((7))
                  ^              |
                  |   epsilon    |
                  +--------------+
                  |
                  +--- epsilon ---> ( 6 )

  (( )) = accepting state
```

The NFA tries all paths at once. If **any** path reaches the accepting state when the input is consumed, the string matches.

### DFA (Deterministic Finite Automaton)

A DFA is in exactly **one state** at any time. For every state and every input character, there is exactly one transition. No epsilon transitions, no ambiguity.

Here is the DFA for the same pattern `a(b|c)*d`:

```
         b,c
        +---+
        |   |
        v   |
  (0)---a--->(1)---d--->((2))
```

The DFA is simpler and faster to execute — just follow one arrow per character. But as we will see, building it can be expensive.

## Thompson's Construction: From Regex to NFA

Ken Thompson published his construction algorithm in 1968. The idea is beautifully recursive: break a regex into its smallest pieces, build a tiny NFA for each piece, then combine them using three rules.

### The Three Building Blocks

**1. Single character `a`:**

```
  (s)---a--->(e)
```

One start state, one edge labeled `a`, one end state.

**2. Concatenation `AB`:**

```
  (s_A)---..--->(e_A)===epsilon===(s_B)---..--->(e_B)
```

Connect the end of A to the start of B with an epsilon transition. The overall NFA starts at `s_A` and ends at `e_B`.

**3. Alternation `A|B`:**

```
                 epsilon
            +--->( s_A )---...--->( e_A )---+
            |                               |  epsilon
  ( start )-+                               +---->( end )
            |                               |  epsilon
            +--->( s_B )---...--->( e_B )---+
                 epsilon
```

A new start state branches to both sub-NFAs. Both end states merge into a new end state.

**4. Kleene star `A*`:**

```
                      epsilon
                 +--->( s_A )---...--->( e_A )---+
                 |         ^                     |
    epsilon      |         |    epsilon          |    epsilon
  ( start )------+         +---------------------+------->( end )
       |                                                      ^
       +--------------------epsilon---------------------------+
```

The start state can skip the sub-NFA entirely (matching zero times) or enter it. The end of the sub-NFA loops back to the start of it (matching more times) or exits to the final end state.

### Walking Through an Example

Let's build the NFA for `ab|c` step by step:

```
  Step 1: NFA for 'a'          (0)---a--->(1)

  Step 2: NFA for 'b'          (2)---b--->(3)

  Step 3: Concatenate 'ab'     (0)---a--->(1)--eps-->(2)---b--->(3)

  Step 4: NFA for 'c'          (4)---c--->(5)

  Step 5: Alternation 'ab|c'

                   eps
              +--------->(0)---a--->(1)--eps-->(2)---b--->(3)--+
              |                                                |  eps
    ( 6 )-----+                                                +----->((7))
              |                                                |  eps
              +--------->(4)---c--->(5)----------------------------+
                   eps
```

Thompson's construction produces an NFA with at most **2n states** for a pattern of length n. Every state has at most two outgoing edges. This small, predictable size is critical for performance.

The original implementation appeared in Thompson's 1968 paper and was later described clearly in the Plan 9 `grep` source code. Russ Cox's article ["Regular Expression Matching Can Be Simple And Fast"](https://swtch.com/~rsc/regexp/regexp1.html) includes a clean C implementation.

## The Subset Construction: NFA to DFA

An NFA explores multiple paths simultaneously. A DFA follows one path. The **subset construction** (also called the powerset construction) converts an NFA into an equivalent DFA by treating each set of NFA states as a single DFA state.

### The Algorithm

```
  Input:  NFA with states S, start state s0, transitions delta
  Output: DFA with states D, start state d0, transitions Delta

  1. d0 = epsilon_closure({s0})    // all NFA states reachable from s0
                                    // via epsilon transitions
  2. worklist = {d0}
  3. while worklist is not empty:
       pick a DFA state T from worklist
       for each input character c:
           U = epsilon_closure( union of delta(s, c) for s in T )
           if U is not in D:
               add U to D
               add U to worklist
           Delta(T, c) = U
       if T contains an NFA accepting state:
           mark T as accepting
```

### Walking Through It

For the NFA of `a(b|c)*`:

```
  NFA states: 0=start, 1=after 'a', 2=branch, 3=match-b, 4=after-b,
              5=match-c, 6=after-c, 7=rejoin, 8=accept

  epsilon_closure({0}) = {0}                         --> DFA state A
  A on 'a': move to {1}, eps-close to {1,2,3,5,8}   --> DFA state B
  B on 'b': move to {4}, eps-close to {4,7,2,3,5,8} --> DFA state C
  B on 'c': move to {6}, eps-close to {6,7,2,3,5,8} --> DFA state D
  C on 'b': eps-close = same as C                    --> C (self-loop)
  C on 'c': eps-close = same as D                    --> D
  D on 'b': same as C                                --> C
  D on 'c': same as D                                --> D (self-loop)

  DFA:
                 b          c
           +----+     +----+
           v    |     v    |
    A--a-->B--->C<--->D----+
           |    b     c
           |
           B, C, D all contain state 8 => all accepting
```

### The Exponential Blowup

An NFA with n states can produce a DFA with up to $2^n$ states, because each DFA state is a subset of NFA states and there are $2^n$ possible subsets. In practice, most patterns produce manageable DFAs, but adversarial patterns can trigger the worst case.

The classic example is the pattern `(a|b)*a(a|b){n}` — "match any string of a's and b's where the character n+1 positions from the end is an `a`." The DFA must remember the last n+1 characters it has seen, requiring at least $2^n$ states.

This is why some engines use a **lazy DFA** (also called a DFA cache): build DFA states on demand as the input is processed, and discard them when memory is tight. Google's RE2 uses this strategy.

## Backtracking Engines: How Most Languages Do It

Python, Java, JavaScript, Ruby, and Perl all use **backtracking** NFA engines. Instead of simulating all NFA paths simultaneously, they explore one path at a time, backtracking when a path fails.

### How Backtracking Works

```
  Pattern: a*a     Input: "aaa"

  The engine tries to match greedily:

  Step 1: a* matches "aaa" (all three a's)
  Step 2: the final 'a' in the pattern needs a character,
          but input is exhausted
  Step 3: BACKTRACK — a* gives back one 'a', now matches "aa"
  Step 4: the final 'a' matches the third 'a'
  Step 5: success

  Trace:
    a* tries "aaa" | a needs char  -> fail, backtrack
    a* tries "aa"  | a matches "a" -> success
```

This works fine for simple patterns. The problem is when **multiple paths** must be explored and **none of them work**.

### Catastrophic Backtracking

Consider the pattern `(a+)+$` applied to the string `"aaaaaaaaaaaaaaaaX"`:

```
  The outer + tries to match the whole string of a's in one group.
  Fails at X.
  Backtracks: tries splitting into (aaaa...a)(a).
  Fails at X.
  Backtracks: tries (aaaa..)(aa).
  Fails at X.
  ...

  For n a's, the engine explores roughly 2^n ways to partition
  the a's among the groups before concluding no match.
```

This is called **catastrophic backtracking** or **ReDoS** (Regular Expression Denial of Service). It has caused real outages:

- In 2016, a regex in Stack Overflow's markdown parser caused a 34-minute outage.
- Cloudflare experienced a global outage in 2019 traced to a single regex that consumed all CPU.

The fundamental issue is that backtracking engines have **exponential worst-case** time complexity for certain patterns.

### Why Not Just Use DFA?

Backtracking engines support features that DFA engines cannot:

```
  Feature                   DFA    Backtracking
  -----------------------------------------
  Basic matching             yes    yes
  Greedy/lazy quantifiers    yes    yes
  Backreferences (\1)        no     yes
  Lookahead/lookbehind       no*    yes
  Atomic groups              no     yes
  Conditional patterns       no     yes

  * Some limited lookahead support exists in hybrid engines
```

**Backreferences** are the key differentiator. The pattern `(a+)\1` matches "aa", "aaaa", "aaaaaa" — strings where the same sequence of a's repeats exactly. This requires the engine to remember what a capture group matched and compare against it later. A pure finite automaton has no memory, so it cannot do this.

In fact, matching with backreferences is NP-complete — there is no known polynomial-time algorithm.

## Inside a Real Engine: How Python's `re` Module Works

CPython's regex engine lives in [`Modules/_sre/sre_compile.h`](https://github.com/python/cpython/blob/main/Modules/_sre/sre_compile.h) and [`Modules/_sre/sre_lib.h`](https://github.com/python/cpython/blob/main/Modules/_sre/sre_lib.h). The pattern is compiled into a sequence of **opcodes** — a small instruction set for a regex virtual machine.

Key opcodes include:

```
  Opcode          Meaning
  --------        -----------------------------------------
  SRE_OP_LITERAL  Match one specific character
  SRE_OP_NOT_LITERAL  Match any character except this one
  SRE_OP_ANY      Match any character (the . operator)
  SRE_OP_BRANCH   Try alternatives (like | in regex)
  SRE_OP_REPEAT   Start a counted repetition
  SRE_OP_MAX_REPEAT  Greedy repeat (try max first)
  SRE_OP_MIN_REPEAT  Lazy repeat (try min first)
  SRE_OP_GROUPREF    Backreference — match group N again
  SRE_OP_JUMP     Unconditional jump
  SRE_OP_MARK     Record position of capture group
```

The engine executes these opcodes against the input string using a recursive C function (`SRE_MATCH`). When a `BRANCH` opcode is reached, the engine saves its current position, tries the first alternative, and backtracks to try the next if the first fails.

You can inspect the compiled opcodes in Python:

```python
import sre_compile
import sre_parse

pattern = sre_parse.parse(r'a(b|c)*d')
code = sre_compile.compile(r'a(b|c)*d')

# The internal code is a list of integers representing opcodes
print(code.code)
```

## RE2 and the Thompson NFA Approach

Google's [RE2](https://github.com/google/re2) library, written by Russ Cox, takes the automata-based approach. It guarantees **O(n)** matching time for a string of length n, regardless of the pattern.

RE2 uses two key techniques:

**1. Thompson NFA simulation:** Instead of exploring one path at a time, RE2 tracks all active NFA states simultaneously using a state list:

```
  Pattern: a*a    Input: "aaa"

  Thompson NFA simulation:

  Position 0 ('a'):
    Active states: {q0, q1}     (q0 = in a*, q1 = final a)
    After reading 'a':
    Active states: {q0, q1, q2} (q2 = accept)

  Position 1 ('a'):
    Active states: {q0, q1, q2}
    After reading 'a':
    Active states: {q0, q1, q2}

  Position 2 ('a'):
    Active states: {q0, q1, q2}
    After reading 'a':
    Active states: {q0, q1, q2}

  End of input: q2 (accept) is active => match

  Total work: O(n * m) where n = input length, m = NFA states
  No backtracking, no exponential blowup.
```

**2. Lazy DFA caching:** For hot paths, RE2 builds DFA states on the fly and caches them. If the cache gets too large, it flushes and falls back to NFA simulation.

The core of RE2's NFA simulation is in [`re2/nfa.cc`](https://github.com/google/re2/blob/main/re2/nfa.cc). The `Step` function advances all active threads (NFA states) by one character:

```cpp
// Simplified from re2/nfa.cc
void NFA::Step(StateList* from, int c, StateList* to) {
  for (int id : from->states) {
    Inst* ip = prog_->inst(id);
    switch (ip->opcode()) {
      case kInstByteRange:
        if (ip->Matches(c))
          AddToList(to, ip->out());
        break;
      case kInstAlt:
        // Both branches are already in 'from' via AddToList
        break;
      // ... other opcodes
    }
  }
}
```

The Rust [`regex` crate](https://github.com/rust-lang/regex) follows the same philosophy as RE2 — it refuses to support backreferences in exchange for guaranteed linear-time matching.

## Practical Advice: Writing Safe Patterns

### Avoid Nested Quantifiers

The pattern `(a+)+` is the textbook catastrophic case. Any time you have a quantifier inside a quantifier where the inner match can also be matched by the outer one, you risk exponential behavior.

```
  Dangerous             Safe alternative
  -----------------     -----------------
  (a+)+                 a+
  (a|b+)*               [ab]*
  (.*a){10}             Unroll or restructure
  (\s*,\s*)*            Use a specific delimiter match
```

### Use Possessive Quantifiers or Atomic Groups

Some engines (Java, PCRE, .NET) support **possessive quantifiers** (`a++`, `a*+`) and **atomic groups** (`(?>...)`). These tell the engine "once you match this, never backtrack into it."

```
  Pattern: a++a    on input "aaa"

  a++ matches "aaa" and REFUSES to give back any characters.
  The second 'a' fails immediately.
  Total work: O(n), not O(2^n).
```

### Prefer Character Classes Over Alternation

```
  Slow:   (a|b|c|d|e)
  Fast:   [abcde]
```

Character classes are implemented as a single lookup table or bitmap scan, while alternation creates branch points that the engine must explore.

### Anchor Your Patterns

An unanchored pattern forces the engine to try matching at every position in the string:

```
  Pattern: foo.*bar   on a 10,000-character string with no "foo"

  Unanchored: engine tries at positions 0, 1, 2, ..., 9999
  Anchored (^foo.*bar): engine tries once at position 0
```

## The Bigger Picture

Regular expressions sit at a fascinating boundary in computer science. The patterns most people write daily — character classes, quantifiers, alternation — correspond to regular languages that finite automata can recognize in linear time. But the moment you add backreferences, you jump to NP-complete territory.

```
  Language Hierarchy (Chomsky)

  +--------------------------------------------+
  |  Type 0: Recursively Enumerable            |
  |  (Turing machines)                         |
  |  +--------------------------------------+  |
  |  |  Type 1: Context-Sensitive           |  |
  |  |  +--------------------------------+  |  |
  |  |  |  Type 2: Context-Free          |  |  |
  |  |  |  (pushdown automata, parsers)  |  |  |
  |  |  |  +-------------------------+   |  |  |
  |  |  |  | Type 3: Regular         |   |  |  |
  |  |  |  | (finite automata, grep) |   |  |  |
  |  |  |  +-------------------------+   |  |  |
  |  |  +--------------------------------+  |  |
  |  +--------------------------------------+  |
  +--------------------------------------------+

  Most "regex" engines actually recognize more than Type 3
  because backreferences push them beyond regular languages.
```

This means the tool we call "regular expressions" in practice is more powerful than the mathematical concept of regular expressions. The name stuck from the 1950s when Ken Thompson and others first implemented true regular language matchers. Modern engines have grown far beyond that original scope — which is both their strength and their footgun.

## References

1. Thompson, K. "Regular Expression Search Algorithm." Communications of the ACM, 1968. [paper](https://dl.acm.org/doi/10.1145/363347.363387)
2. Cox, R. "Regular Expression Matching Can Be Simple And Fast." 2007. [article](https://swtch.com/~rsc/regexp/regexp1.html)
3. Cox, R. "Regular Expression Matching: the Virtual Machine Approach." 2009. [article](https://swtch.com/~rsc/regexp/regexp2.html)
4. Hopcroft, J. and Ullman, J. "Introduction to Automata Theory, Languages, and Computation." 1979. (Subset construction algorithm)
5. Google RE2 source code [`re2/nfa.cc`](https://github.com/google/re2/blob/main/re2/nfa.cc)
6. CPython `_sre` module [`Modules/_sre/sre_lib.h`](https://github.com/python/cpython/blob/main/Modules/_sre/sre_lib.h)
7. Rust regex crate [documentation](https://docs.rs/regex/latest/regex/#untrusted-input)
8. Davis, J. et al. "The Impact of Regular Expression Denial of Service (ReDoS) in Practice." ESEC/FSE 2018. [paper](https://doi.org/10.1145/3236024.3236027)
9. Cloudflare outage post-mortem, July 2019. [blog](https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/)
