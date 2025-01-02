---
author: JZ
pubDatetime: 2024-12-31T06:23:00Z
modDatetime: 2024-12-31T06:23:00Z
title: LeetCode 2559 Count Vowel Strings in Ranges
featured: true
tags:
  - a-array
  - a-string
  - a-prefix-sum
description:
  "Solutions for LeetCode 2559, medium, tags: array, string, prefix-sum."
---

## Table of contents

## Description

You are given a **0-indexed** array of strings `words` and a 2D array of integers `queries`.

Each query `queries[i] = [li, ri]` asks us to find the number of strings present in the range `li` to `ri` (both **inclusive**) of `words` that start and end with a vowel.

Return _an array_ `ans` _of size_ `queries.length`_, where_ `ans[i]` _is the answer to the_ `i`th _query_.

**Note** that the vowel letters are `'a'`, `'e'`, `'i'`, `'o'`, and `'u'`.

```
Example 1:

Input: words = ["aba","bcb","ece","aa","e"], queries = [[0,2],[1,4],[1,1]]
Output: [2,3,0]
Explanation: The strings starting and ending with a vowel are "aba", "ece", "aa" and "e".
The answer to the query [0,2] is 2 (strings "aba" and "ece").
to query [1,4] is 3 (strings "ece", "aa", "e").
to query [1,1] is 0.
We return [2,3,0].

Example 2:

Input: words = ["a","e","i"], queries = [[0,2],[0,1],[2,2]]
Output: [3,2,1]
Explanation: Every string satisfies the conditions, so we return [3,2,1].
```

**Constraints:**

-   `1 <= words.length <= 10^5`
-   `1 <= words[i].length <= 40`
-   `words[i]` consists only of lowercase English letters.
-   `sum(words[i].length) <= 3 * 10^5`
-   `1 <= queries.length <= 10^5`
-   `0 <= li <= ri <words.length`

Hint 1

Precompute the prefix sum of strings that start and end with vowels.

Hint 2

Use unordered_set to store vowels.

Hint 3

Check if the first and last characters of the string are present in the vowels set.

Hint 4

Subtract prefix sum for range [l-1, r] to find the number of strings starting and ending with vowels.

## Idea

The question requires performing range sum queries. So we could use a prefix sum array `psa`.

We will set `psa[0]=0` as a dummy so that it is easier to calculate the range sum.

We iterate through the `words` array to build the prefix sum array for how many words in range `0,i` are vowel words.

We iterate through the queries and do the calculation.

```rust
let m = words.len();
let n = queries.len();
```

Complexity: Time $O(n+m)$, Space $O(m)$.

### Java

```java
// 7ms, 86 mb
class Solution {
    static HashSet<Character> vowels = new HashSet<>(Arrays.asList('a', 'e', 'i', 'o', 'u'));

    public int[] vowelStrings(String[] words, int[][] queries) {
        int n = words.length, s = 0, m = queries.length;
        int[] psa = new int[n + 1];
        for (int i = 0; i < words.length; i++) {
            String w = words[i];
            if (vowels.contains(w.charAt(0)) && vowels.contains(w.charAt(w.length() - 1))) s++;
            psa[i + 1] = s;
        }
        int[] res = new int[m];
        for (int i = 0; i < m; i++) {
            int l = queries[i][0], r = queries[i][1];
            res[i] = psa[r + 1] - psa[l];
        }
        return res;
    }
}
```

### Python

```python
"""leet 2559, medium"""


class Solution(object):
    """11 ms, 49.6 mb"""

    def vowelStrings(self, words, queries):
        psa, s, vowels = [0], 0, 'aeiou'
        for w in words:
            if w[0] in vowels and w[-1] in vowels:
                s += 1
            psa.append(s)
        res = []
        for l, r in queries:
            res.append(psa[r + 1] - psa[l])
        return res
```
