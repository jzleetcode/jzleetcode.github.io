---
author: JZ
pubDatetime: 2024-12-17T06:23:00Z
modDatetime: 2024-12-17T06:23:00Z
title: LeetCode 691 LintCode 1081 Stickers to Spell Word
featured: true
tags:
  - a-dp
  - a-memoization
  - a-array
  - a-string
  - a-backtracking
  - a-bit
  - c-ixl
description:
  "Solutions for LeetCode 239, hard, tags: array, queue, sliding window, heap, monotonic queue."
---

## Table of contents

## Description

We are given `n` different types of `stickers`. Each sticker has a lowercase English word on it.

You would like to spell out the given string `target` by cutting individual letters from your collection of stickers and rearranging them. You can use each sticker more than once if you want, and you have infinite quantities of each sticker.

Return _the minimum number of stickers that you need to spell out_ `target`. If the task is impossible, return `-1`.

**Note:** In all test cases, all words were chosen randomly from the `1000` most common US English words, and `target` was chosen as a concatenation of two random words.

```
Example 1:

Input: stickers = ["with","example","science"], target = "thehat"
Output: 3
Explanation:
We can use 2 "with" stickers, and 1 "example" sticker.
After cutting and rearrange the letters of those stickers, we can form the target "thehat".
Also, this is the minimum number of stickers necessary to form the target string.

Example 2:

Input: stickers = ["notice","possible"], target = "basicbasic"
Output: -1
Explanation:
We cannot form the target "basicbasic" from cutting letters from the given stickers.
```

**Constraints:**

-   `n == stickers.length`
-   `1 <= n <= 50`
-   `1 <= stickers[i].length <= 10`
-   `1 <= target.length <= 15`
-   `stickers[i]` and `target` consist of lowercase English letters.

Hint 1

We want to perform an exhaustive search, but we need to speed it up based on the input data being random. For all stickers, we can ignore any letters that are not in the target word. When our candidate answer won't be smaller than an answer we have already found, we can stop searching this path. When a sticker dominates another, we shouldn't include the dominated sticker in our sticker collection. Here, we say a sticker `A` dominates `B` if `A.count(letter) >= B.count(letter)` for all letters.

## Preprocessing

The question essentially requires filling all the characters in the target string with what is available from the stickers. So we can use a counter or hashmap to count how many each character are present in the target and each of the stickers.

We could preprocess the stickers as suggested in Hint 1 above. If a sticker is dominated by another, e.g., `{a:1}` is dominated by `{a:2}`, we can filter it out. If a character in the sticker does not appear in the target, we can filter it out.

```rust
let k = max(stickers.len()), t = target.len();
let s = n * k; // s: sum length of all the stickers
```

Complexity: Time $O(n^2+t)$, Space $O(n+t)$.

### Python

```python
def preprocess(stickers: list[str], target: str) -> list[Counter]:
    tc = Counter(target)  # target counter
    scs = [Counter(sticker) & tc for sticker in stickers]  # sticker counters
    for i in range(len(scs) - 1, -1, -1):
        if any(scs[i] == scs[i] & scs[j] for j in range(len(scs)) if i != j):
            scs.pop(i)
    return scs
```

## Idea1

We could use recursive search with memoization.

1. We define a recursive depth-first-search (dfs) function to find the minimum number of stickers for a target string.
2. Base case: if the target is an empty string, we return 0.
3. We count the characters in target into a counter/hashmap.
4. We iterate through all the stickers. If the first letter of target is in the sticker, we try to use it and remove the corresponding letters from the target and form the next target to recursively search.
5. We recursively explore the next target. After it returns, we add one (the one sticker used in the above step) to the result and take the minimum.

Complexity: Time $O(t^n)$, Space $O(26n+t)$.

For time complexity analysis, imagine target is `{a:7,b:7}` (t=14) and stickers are `{a:1}` and `{b:1}` (n=2). We will recursively try using sticker 1 and sticker 2 for seven times. The combination is $7 \times 7$. We can see that the time complexity is $t \times t... \times t$ for `n` times, which is $O(t^n)$.

### Python

```python
class Solution1:
    """109ms, 18.08 mb"""

    def minStickers(self, stickers: list[str], target: str) -> int:
        scs = preprocess(stickers, target)

        @cache
        def dfs(t):  # target string
            if not t: return 0
            res = inf
            tc = Counter(t)
            for sc in scs:
                if t[0] in sc:  # use this sticker, explore remaining next target
                    nt = "".join(k * v for k, v in (tc - sc).items())
                    res = min(res, 1 + dfs(nt))
            return res

        res = dfs(target)
        return res if res < inf else -1
```

## Idea2

We could use dynamic programming to fill all the characters in the target.

1. We use an array `dp`, where `dp[i]` represents the minimum number of stickers needed for filling all the characters for state `i`. For each bit in `i`, if the bit is set, it means the character is filled. For example, the value of `3` for `i` means the first two characters in the target are filled.
2. For example, `dp[0]` means empty target string. So `dp[0]=0`.
3. We start exploring with the empty string. We iterate through each sticker. For each character in the sticker, if it is not already filled in the target, we fill it and set the bit accordingly in variable `cur`.
4. Then we set `dp[cur]` to the minimum of its value and `dp[j]+1` (the one sticker used above).
5. At the end, if `dp[-1]` is reachable (no longer set to `inf`), then we found the minimum. Otherwise, return -1.


Complexity: Time $O(2^n \cdot s \cdot t)$, Space $O(2^n)$.

### Python

```python
class Solution2:
    """357 ms, 17.86 mb"""

    def minStickers(self, stickers: list[str], target: str) -> int:
        t, scs = len(target), preprocess(stickers, target)
        m = 1 << t
        stickers = ["".join(sc.elements()) for sc in scs]
        # stickers = ["".join(k * v for k, v in sc.items()) for sc in scs]
        dp = [inf] * m  # dp[i]: min stickers for state i, e.g., i==1, first character is filled
        dp[0] = 0  # empty string
        for j in range(m):  # each state
            if dp[j] == inf: continue
            for s in stickers:  # each sticker
                cur = j
                for ch in s:  # try to use every char in sticker
                    for i, c in enumerate(target):
                        if (cur >> i) & 1: continue  # this character already filled
                        if c == ch:  # fill ith char in target with sticker s
                            cur |= 1 << i
                            break
                dp[cur] = min(dp[cur], dp[j] + 1)
        return dp[-1] if dp[-1] != inf else -1
```

Unit Test

```python
class TestSolution(TestCase):
    def test_min_stickers(self):
        cases = [
            (['aa', 'b'], 'aaabbb', 5),
            (["heavy", "stone", "family", "had", "rain", "person", "verb", "clothe"], "overfresh", 4),
            (["with", "example", "science"], 'thehat', 3),
            (["notice", "possible"], 'basicbasic', -1),
            (["city", "would", "feel", "effect", "cell", "paint"], 'putcat', 3),
        ]
        tbt1, tbt2 = Solution1(), Solution2()
        for stickers, target, exp in cases:
            with self.subTest(stickers=stickers, target=target):
                self.assertEqual(exp, tbt1.minStickers(stickers, target))
                self.assertEqual(exp, tbt2.minStickers(stickers, target))
```
