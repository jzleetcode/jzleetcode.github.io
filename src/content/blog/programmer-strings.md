---
author: JZ
pubDatetime: 2024-12-29T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: LeetCode 239 Sliding Window Max
featured: true
draft: true
tags:
  - a-sliding-window
description:
  "Solutions for LeetCode 239, hard, tags: array, queue, sliding window, heap, monotonic queue."
---

## Table of contents

## Description

A `programmer` string contains letters that can be rearranged to form the word "programmer" and is a substring of a longer string. Note that the strings "programmer", "grammproer", and "prozmerqgram" are all classified as programmer strings by this definition. Given a string, determine the number of indices that lie between the rightmost and leftmost programmer strings.

Example

```
0 1 2 3 4 5 6 7 8 9 10 11 12  13 14 15 16 17 18 19 20 21 22 23 24
p r o g r a m m e r x  x  x   p  r  o  z  m  e  r  q  g  r  a  m
```

In this example, indices 0–9 form one programmer string and indices 15–24 contain another. There are three Indices between the programmer, so the function will return 3.

Function Description

Complete the function ProgrammerStrings in the editor below.

programmerStrings has the following parameters:

strings `s`: a string containing 2 programmer strings

Returns int: the number of indices which are between the rightmost and leftmost programmer strings within `s`

Constraints

- String s consists of lowercase English alphabetic letters only, ascii (a-z).
- 1 ≤ the length of s ≤ 10^5
- There will always be two non-overlapping programmer strings.

## Comment

LeetCode questions have been solved by more people and generally are more well-defined. This question is unclear about whether the substring can contain more letters than needed. The definition only mentioned the substring contains letters that can be rearranged to form the word "programmer". However, "prozmerqgram" contains letter `z` that cannot be rearranged to disappear. Even if we assume we can ignore the letters not in the word `programmer`? How about "pprogrammer" with the extra letter p? How about "pzprogrammer"?

In this post/article, we will assume the rightmost `programmer` in "pprogrammer" does not include the first `p`.

## Idea

How do we know whether we have the leftmost `programmer`?

Let's count the letters in the word `programmer` with a hashmap or counter. And that is

```
p:1
r:3
o:1
g:1
a:1
m:2
e:1
```

We could start counting the letters from the left side, when we have more than the above map/counter, we have the leftmost `programmer`.

Similarly, we could start counting the letters from the right side to find the rightmost `programmer`.

To compare the map/counter with the above map/counter, we check all the keys in the above map and make sure the second map has more than the above map.

Complexity: Time $O(n)$, Space $O(1)$.

Explanation for space complexity: consider string `program zzzz....zzzz mer programmer` with many letter `z`s in that section. If we do store the letters not in the word `programmer`, the time and space for the algorithm will both increase. If the alphabet size is not limited to lower case english letters, the space complexity may increase to $O(n)$.

### Java

```java
public static int programmerStrings(String s) {
    HashMap<Character, Integer> PG = new HashMap<>();
    String PGS = "programmer";
    for (int i = 0; i < PGS.length(); i++) PG.merge(PGS.charAt(i), 1, Integer::sum);
    int e1 = 0, s2 = 0; // end of leftmost programmer, start of rightmost programmer
    HashMap<Character, Integer> m2 = new HashMap<>();
    for (int i = 0; i < s.length(); i++) {
        if (!PG.containsKey(s.charAt(i))) continue;
        m2.merge(s.charAt(i), 1, Integer::sum);
        if (enough(PG, m2)) {
            e1 = i;
            break;
        }
    }
    m2 = new HashMap<>();
    for (int i = s.length() - 1; i >= 0; i--) {
        if (!PG.containsKey(s.charAt(i))) continue;
        m2.merge(s.charAt(i), 1, Integer::sum);
        if (enough(PG, m2)) {
            s2 = i;
            break;
        }
    }
    return s2 - e1 - 1;
}

// m1 is programmer map, check whether m2 has enough letters to compose programmer string
static boolean enough(HashMap<Character, Integer> m1, HashMap<Character, Integer> m2) {
    for (Character c : m1.keySet()) {
        if (!m2.containsKey(c)) return false;
        if (m2.get(c) < m1.get(c)) return false;
    }
    return true;
}
```

Unit Test

```java
class ProgrammerStringsTest {

    static Stream<Arguments> cases() {
        return Stream.of(
                Arguments.of("programmerxxxprozmerqgram", 3),
                Arguments.of("progxrammerrxproxgrammer", 2),
                Arguments.of("xprogxrmaxemrppprommograeiruu", 2),
                Arguments.of("programmerprogrammer", 0)
        );
    }

    @ParameterizedTest
    @MethodSource("cases")
    void programmerStrings(String s, int exp) {
        assertEquals(exp, ProgrammerStrings.programmerStrings(s));
    }
}
```

### Python

With Python, we could use `collections.Counter` and compare the counters with library implementations. So the code becomes much shorter. No wonder more people are using Python for interviews now. Whether the library `sortedcontainers` is available can be a key factor to help you decide whether you could consider Python or Java/C++.

```python
from collections import Counter

PG = Counter('programmer')


def programmerStrings(s: str) -> int:
    e1, s2 = 0, 0
    c2 = Counter()
    for i, c in enumerate(s):
        if c not in PG: continue
        c2[c] += 1
        if PG <= c2:
            e1 = i
            break
    c2.clear()
    for i in range(len(s) - 1, -1, -1):
        if s[i] not in PG: continue
        c2[s[i]] += 1
        if PG <= c2:
            s2 = i
            break
    return s2 - e1 - 1
```

Unit Test

```python
class Test(TestCase):
    def test_programmer_strings(self):
        cases = [
            ('programmerxxxprozmerqgram', 3),
            ('progxrammerrxproxgrammer', 2),
            ('xprogxrmaxemrppprommograeiruu', 2),
            ('programmerprogrammer', 0)
        ]
        for s, exp in cases:
            with self.subTest(s=s, exp=exp):
                self.assertEqual(exp, programmerStrings(s))
```
