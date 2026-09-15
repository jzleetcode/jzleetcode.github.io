---
author: JZ
pubDatetime: 2026-09-15T12:00:00Z
modDatetime: 2026-09-15T12:00:00Z
title: System Design - How Regex Engines Work
tags:
  - design-system
  - design-algorithms
description:
  "How regex engines work under the hood: Thompson's NFA construction, NFA-to-DFA conversion, backtracking, and how real implementations like RE2 and PCRE differ in their approach to matching."
---

## Table of contents

## Context

You type `grep -E 'ab+c' file.txt` and get matching lines in milliseconds. You write `re.match(r'\d{3}-\d{4}', phone)` in Python and it just works. But what actually happens between the pattern string and the yes-or-no answer?

Behind every regex match is a small engine that compiles a pattern into a state machine and then simulates it against your input. The two dominant approaches — **Thompson's NFA simulation** and **backtracking** — have been around since the 1960s, yet most programmers never see how they work. Understanding the difference matters because one approach guarantees linear-time matching while the other can take exponential time on adversarial inputs (a real security concern called **ReDoS**, Regular expression Denial of Service).

Let's trace the full journey of a regex from pattern string to match result.

## Step 1: Parsing the Pattern into an AST

Every regex engine starts by parsing the pattern string into a tree structure. The pattern `a(b|c)*d` becomes:

```
            Concat
           /  |  \
          a  Star  d
              |
            Alt
           /   \
          b     c
```

- **Concat** — match left, then right, in sequence.
- **Alt** (alternation) — match left or right (the `|` operator).
- **Star** (Kleene star) — match the child zero or more times.

The parser handles operator precedence: `*` and `+` bind tighter than concatenation, which binds tighter than `|`. Parentheses override precedence. This is similar to how a compiler parses arithmetic expressions like `2 + 3 * 4`.

In [Go's `regexp/syntax` package](https://github.com/golang/go/blob/master/src/regexp/syntax/parse.go), the parser uses an explicit stack of partial expressions. As it scans left to right, it pushes operands and applies operators, collapsing the stack when precedence allows:

```go
// Simplified from regexp/syntax/parse.go
func (p *parser) push(re *Regexp) *Regexp {
    // ... collapse concatenation or alternation
    // when the stack shows the right precedence
    p.stack = append(p.stack, re)
    return re
}
```

## Step 2: Thompson's Construction — Pattern to NFA

Ken Thompson published this algorithm in 1968 in his paper ["Regular Expression Search Algorithm"](https://dl.acm.org/doi/10.1145/363347.363387). The idea: recursively translate each node of the AST into a small NFA (Nondeterministic Finite Automaton) fragment with one start state and one accept state, then wire the fragments together.

An NFA is a directed graph where:
- Each node is a **state**.
- Each edge is either a **character transition** (advance on matching input) or an **epsilon transition** (advance without consuming input).
- Multiple edges can leave the same state on the same character (nondeterminism).

### The Three Building Blocks

Every regex, no matter how complex, is built from three operations. Here is how each becomes an NFA fragment:

**Literal character `a`:**

```
    +---------+   'a'   +---------+
    |  start  | ------> | accept  |
    +---------+         +---------+
```

One transition, one character consumed.

**Concatenation `e1 e2`:**

```
    +-------+         +-------+         +-------+         +-------+
    |  s1   | --...--> |  a1   | --eps--> |  s2   | --...--> |  a2   |
    +-------+         +-------+         +-------+         +-------+
      start of e1      accept of e1      start of e2       accept of e2
                       (becomes
                        interior)
```

Wire the accept state of the first fragment to the start state of the second with an epsilon transition. The combined fragment starts at `s1` and accepts at `a2`.

**Alternation `e1 | e2`:**

```
                         +-------+         +-------+
                  eps    |  s1   | --...--> |  a1   |  eps
               +-------> +-------+         +-------+ -------+
               |                                             |
    +-------+  |                                             v  +-------+
    | start  | -+                                            +-> |accept |
    +-------+  |                                             ^  +-------+
               |                                             |
               +-------> +-------+         +-------+ -------+
                  eps    |  s2   | --...--> |  a2   |  eps
                         +-------+         +-------+
```

A new start state branches to both sub-NFAs via epsilon transitions. Both accept states merge into a new shared accept state.

**Kleene star `e*`:**

```
               eps
    +-------+ -----> +-------+         +-------+  eps   +-------+
    | start  |       |  s1   | --...--> |  a1   | ----> |accept |
    +-------+        +-------+         +-------+       +-------+
        |                                  |               ^
        |              eps                 |               |
        +----------------------------------+---------------+
                                       (loop back)
```

The start state can either skip the sub-NFA entirely (matching zero times) or enter it. The sub-NFA's accept state loops back to the sub-NFA's start (matching again) or exits to the overall accept state.

### Why This Works

Thompson's construction produces an NFA with **at most 2n states** for a pattern of length n (each AST node adds at most two states). This bound is crucial — it means the NFA size is linear in the pattern size, no matter how many `|` or `*` operators appear.

Here is the NFA for our example pattern `a(b|c)*d`:

```
                                 'b'
                          +----> (4) ----+
                   eps    |              |  eps
    'a'     eps    |      |              v       eps     'd'
(0) ----> (1) --->(2) --->(3)           (6) --->(7) --->(8) ----> ((9))
                   ^       |              ^
                   |  eps  +----> (5) ----+
                   |        'c'          eps
                   |                      |
                   +-------<--------------+
                          eps (loop)
```

States 3-6 handle the `(b|c)` alternation. The loop from state 7 back to state 2 handles the `*`. State 9 (double circle) is the accept state.

## Step 3: Running the NFA — Two Approaches

Here is where the two schools of regex engines diverge.

### Approach A: Thompson / NFA Simulation (used by RE2, Go, awk)

Instead of picking one path through the NFA, **simulate all possible paths simultaneously**. At each step, maintain a **set** of states the NFA could be in.

```
Algorithm: NFA Simulation
Input: NFA with start state s0, input string w = w1 w2 ... wn

current_states = epsilon_closure({s0})

for each character wi in the input:
    next_states = {}
    for each state s in current_states:
        if s has a transition on wi to state t:
            add t to next_states
    current_states = epsilon_closure(next_states)

if any state in current_states is an accept state:
    return MATCH
else:
    return NO MATCH
```

The **epsilon closure** of a set of states is every state reachable by following zero or more epsilon transitions. It is computed with a simple DFS or BFS.

Let's trace `a(b|c)*d` against input `"abcd"`:

```
Step 0: start
  current = eps_closure({0}) = {0}

Step 1: read 'a'
  transitions on 'a': 0 -> 1
  eps_closure({1}) = {1, 2, 3, 7}    (follow eps from 1->2, 2->3, 2->7)
  current = {1, 2, 3, 7}

Step 2: read 'b'
  transitions on 'b': 3 -> 4
  eps_closure({4}) = {4, 6, 7, 2, 3, 8}  (4->6, 6->7, 7->2, 2->3, 7->8)
  current = {2, 3, 4, 6, 7, 8}

Step 3: read 'c'
  transitions on 'c': 3 -> 5
  eps_closure({5}) = {5, 6, 7, 2, 3, 8}
  current = {2, 3, 5, 6, 7, 8}

Step 4: read 'd'
  transitions on 'd': 8 -> 9
  eps_closure({9}) = {9}
  current = {9}

State 9 is accept => MATCH
```

**Time complexity:** For each of the `m` input characters, we process at most `n` NFA states and compute epsilon closures. Total: **O(m * n)**. This is the key guarantee — matching time is linear in the input length for a fixed pattern.

In [Go's `regexp` package](https://github.com/golang/go/blob/master/src/regexp/exec.go), the NFA simulation is implemented with two lists that swap each step:

```go
// Simplified from regexp/exec.go
func (m *machine) match(i input, pos int) bool {
    // runq and nextq are the "current" and "next" state sets
    for {
        c, width := i.step(pos)
        m.nextq.clear()
        for j := range m.runq.dense {
            s := m.runq.dense[j].s
            // ... follow transitions on character c ...
            m.addState(m.nextq, nextState)
        }
        m.runq, m.nextq = m.nextq, m.runq
        pos += width
    }
}
```

### Approach B: Backtracking (used by PCRE, Python, Java, JavaScript, Perl)

Instead of tracking all paths at once, pick one path and follow it. If it fails, **backtrack** to the last choice point and try the alternative.

```
Algorithm: Backtracking
Input: NFA, input string, current state s, current position p

function try_match(s, p):
    if s is accept state:
        return MATCH

    if s has epsilon transitions to [t1, t2, ...]:
        for each ti:
            if try_match(ti, p) == MATCH:
                return MATCH
        return NO MATCH

    if p < len(input) and s has transition on input[p] to t:
        return try_match(t, p + 1)

    return NO MATCH
```

This is a recursive depth-first search. It works well for most real-world patterns, but it has a worst case.

### The Exponential Blowup

Consider the pattern `a?a?a?aaa` (three optional `a`s followed by three required `a`s) matched against `"aaa"`. A backtracking engine has to try all combinations of whether each `a?` matches or skips:

```
Pattern: a?a?a?aaa    Input: "aaa"

Try 1: match, match, match => need 3 more 'a's, only 0 left => FAIL
Try 2: match, match, skip  => need 3 more 'a's, only 1 left => FAIL
Try 3: match, skip, match  => need 3 more 'a's, only 1 left => FAIL
Try 4: match, skip, skip   => need 3 more 'a's, only 2 left => FAIL
Try 5: skip, match, match  => need 3 more 'a's, only 1 left => FAIL
Try 6: skip, match, skip   => need 3 more 'a's, only 2 left => FAIL
Try 7: skip, skip, match   => need 3 more 'a's, only 2 left => FAIL
Try 8: skip, skip, skip    => need 3 more 'a's, 3 left      => MATCH!
```

With `n` optional characters, the backtracker may explore **2^n** paths. Scale `n` to 30 and matching takes over a billion steps. This is the **ReDoS** vulnerability — an attacker crafts an input that forces exponential backtracking in a server's regex validation.

The Thompson NFA approach handles the same pattern in O(n^2) because it tracks at most `n` states simultaneously at each of the `n` input positions.

Russ Cox's classic article ["Regular Expression Matching Can Be Simple And Fast"](https://swtch.com/~rsc/regexp/regexp1.html) demonstrates this with a benchmark: matching `a?^n a^n` against `a^n`. The Thompson approach scales linearly; the backtracking approach becomes unusable around n=25.

```
              Time to match a?^n a^n against a^n

  n    Thompson NFA     Backtracking (Perl/PCRE)
  --   -------------    -------------------------
  10   < 1 us           ~10 us
  20   < 1 us           ~10 ms
  25   < 1 us           ~1 sec
  30   < 1 us           ~30 sec
  35   < 1 us           ~17 min (estimated)
```

## Step 4 (Optional): NFA to DFA — The Subset Construction

For high-throughput matching (like `grep`), engines often convert the NFA into a **DFA** (Deterministic Finite Automaton). A DFA has no epsilon transitions and exactly one transition per character per state. This means matching requires no set tracking — just follow one edge per input character.

The algorithm is called **subset construction** (also called the powerset construction):

```
Algorithm: Subset Construction (NFA -> DFA)

DFA_start = epsilon_closure({NFA_start})
worklist = [DFA_start]
DFA_states = {DFA_start}

while worklist is not empty:
    S = worklist.pop()
    for each character c in alphabet:
        T = epsilon_closure(move(S, c))
        if T not in DFA_states:
            DFA_states.add(T)
            worklist.append(T)
        DFA_transition[S][c] = T
```

Each DFA state is a **set of NFA states**. The DFA for `a(b|c)*d`:

```
  DFA State    NFA States         Transitions
  =========    ===========        ===========
  D0           {0}                'a' -> D1
  D1           {1,2,3,7}         'b' -> D2, 'c' -> D2, 'd' -> D3
  D2           {2,3,5,6,7,8}     'b' -> D2, 'c' -> D2, 'd' -> D3
  D3           {9}               (accept)

       'a'         'b','c'
  (D0) ----> (D1) ---------> (D2) --+
                \              |     | 'b','c'
                 \   'd'       +-----+
                  +-------+
                          |    'd'
              (D2) -------+---> ((D3))
```

Notice: the DFA has only 4 states while the NFA had 10. But in the worst case, an NFA with `n` states can produce a DFA with **2^n** states (each DFA state is a subset of the NFA states). The classic worst-case pattern is `.*a.{n}` — the DFA must remember which of the last `n` characters was an `a`.

Real engines handle this with **lazy DFA construction** — only build DFA states as they are encountered during matching. Google's [RE2](https://github.com/google/re2) library uses this approach with a bounded cache:

```cpp
// Simplified from re2/dfa.cc
DFA::State* DFA::RunStateOnByte(State* state, int byte) {
    // Check if this transition is already cached
    if (state->next_[byte] != NULL)
        return state->next_[byte];

    // Build the new state on demand
    StateSet nfa_states = ComputeNextStates(state->nfa_set_, byte);
    State* next = CachedState(nfa_states);
    state->next_[byte] = next;

    // If cache is full, flush and start over
    if (mem_budget_ <= 0)
        ResetCache();

    return next;
}
```

If the cache fills up, RE2 flushes it and rebuilds states on demand. This bounds memory while still getting DFA-speed matching for common patterns.

## Why Two Approaches Survive

If Thompson's method is strictly better in worst-case performance, why does anyone use backtracking? The answer: **backreferences**.

A backreference like `(a+)\1` matches one or more `a`s, then the exact same string again. This means `aa` matches but `aaa` doesn't. The "memory" required to check backreferences cannot be expressed as a regular language — it requires context-free (or higher) power.

The Thompson NFA approach cannot implement backreferences because it tracks sets of states, not individual match histories. A backtracking engine naturally maintains a call stack with captured groups, making backreferences straightforward.

```
Feature              Thompson/NFA    Backtracking
---------            -----------     ------------
Time guarantee       O(m*n)          Exponential worst case
Backreferences       No              Yes
Lookahead/behind     Limited         Yes
Lazy quantifiers     Yes (*)         Yes
Capture groups       Yes (with mods) Yes (natural)
```

(*) Thompson-based engines can track capture groups with a modified simulation that records subgroup boundaries, at the cost of higher constant factors. Go's `regexp` package does this.

## Real Engine Architecture

Modern engines often combine both approaches:

```
                        Input pattern
                             |
                             v
                     +---------------+
                     |    Parser     |
                     |  (pattern ->  |
                     |    AST)       |
                     +-------+-------+
                             |
                             v
                     +---------------+
                     |   Compiler    |
                     |  (AST -> NFA  |
                     |   bytecode)   |
                     +-------+-------+
                             |
                 +-----------+-----------+
                 |                       |
                 v                       v
          +-------------+        +--------------+
          |  DFA engine |        | Backtracking |
          | (fast path, |        | engine       |
          |  no groups) |        | (full        |
          +------+------+        |  features)   |
                 |               +--------------+
                 v                       |
          "Does it match?"         "Where and what
           (yes/no, fast)          did it capture?"
```

RE2 uses the DFA engine for simple "does it match?" queries and falls back to the NFA simulation for queries that need capture group positions. It never uses backtracking.

PCRE2 (used by PHP, Nginx, and many others) is primarily a backtracking engine but includes a JIT compiler that translates the pattern into native machine code. The JIT version can be 5-10x faster than the interpreted backtracker, though it still has exponential worst-case behavior.

Go's `regexp` package follows Thompson's approach exclusively. From the package documentation:

> The regexp implementation provided by this package is guaranteed to run in time linear in the size of the input. (This is a property not guaranteed by most open source implementations of regular expressions.)

This guarantee is why Go's regex can be safely used in network-facing code without ReDoS risk.

## Optimization Techniques

Real engines employ several optimizations beyond the basic algorithms:

**1. Literal prefix extraction.** If the pattern starts with a fixed string like `hello.*world`, the engine first scans for `"hello"` using fast string search (like Boyer-Moore) before engaging the regex machinery.

**2. Character classes as bit sets.** A class like `[a-zA-Z0-9_]` is compiled into a 256-bit vector where bit `i` is set if byte `i` is in the class. Testing membership is a single array lookup.

**3. One-pass NFA.** If the NFA has no ambiguity (at every state, at most one transition matches a given character), it can be run in a single pass without maintaining a state set. Go's `regexp` detects this case and uses a specialized fast path.

**4. Anchoring.** Patterns anchored with `^` or `$` skip scanning for match start positions, turning an O(m*n) search into an O(m) match.

## A Note on Security: ReDoS

ReDoS attacks exploit backtracking regex engines in server-side code. If a web application validates user input with a vulnerable pattern like:

```
^(a+)+$
```

An attacker can send a string like `"aaaaaaaaaaaaaaaaaaaaaaaaaaab"` that causes the engine to explore an exponential number of paths before concluding "no match."

Mitigations:
- **Use a Thompson/NFA engine** (RE2, Go's regexp, Rust's regex crate) for untrusted input.
- **Set timeouts** on regex matching in backtracking engines.
- **Lint patterns** with tools like [recheck](https://makenowjust-labs.github.io/recheck/) or [safe-regex](https://github.com/substack/safe-regex) that detect vulnerable patterns.
- **Avoid nested quantifiers** like `(a+)+`, `(a*)*`, `(a|b+)*` in user-facing validation.

## Summary

```
    Pattern string
         |
         v
    [1] Parse into AST
         |
         v
    [2] Thompson's construction: AST -> NFA  (2n states max)
         |
         +------> [3a] NFA simulation: track all states
         |              O(m*n) guaranteed
         |              No backreferences
         |
         +------> [3b] Backtracking: DFS one path at a time
         |              Fast on common patterns
         |              Exponential worst case
         |              Supports backreferences
         |
         +------> [4]  Subset construction: NFA -> DFA
                        One transition per state per char
                        O(m) matching, but up to 2^n states
                        Lazy construction + cache in practice
```

The choice between approaches is a fundamental trade-off in computer science: guaranteed performance vs. expressive power. Thompson's NFA gives you linear-time safety. Backtracking gives you backreferences and lookaround. Modern engines like RE2 show that you can get remarkably far without backtracking — and that for most practical patterns, the features you lose rarely matter.

## References

1. Thompson, K. (1968). "Regular Expression Search Algorithm." Communications of the ACM, 11(6), 419-422.
2. Cox, R. (2007). "Regular Expression Matching Can Be Simple And Fast." https://swtch.com/~rsc/regexp/regexp1.html
3. Cox, R. (2010). "Regular Expression Matching: the Virtual Machine Approach." https://swtch.com/~rsc/regexp/regexp2.html
4. Go `regexp` package source: https://github.com/golang/go/tree/master/src/regexp
5. RE2 library source: https://github.com/google/re2
6. PCRE2 library: https://github.com/PCRE2Project/pcre2
7. Friedl, J. (2006). "Mastering Regular Expressions," 3rd Edition. O'Reilly Media.
