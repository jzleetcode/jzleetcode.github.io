---
author: JZ
pubDatetime: 2026-11-06T19:47:03Z
modDatetime: 2026-11-06T19:47:03Z
title: LeetCode 274 H-Index
featured: true
tags:
  - a-array
  - a-counting-sort
  - a-sorting
description:
  "Solutions for LeetCode 274, medium, tags: array, counting sort, sorting."
---

## Table of contents

## Description

Question Link: [LeetCode 274](https://leetcode.com/problems/h-index/)

Given an array `citations` where `citations[i]` is the number of citations for a researcher's $i$th paper, return the researcher's **h-index**. The h-index is the largest integer $h$ such that the researcher has at least $h$ papers with at least $h$ citations each.

```text
Example 1:
Input: citations = [3,0,6,1,5]
Output: 3

Example 2:
Input: citations = [1,3,1]
Output: 1
```

**Constraints:**

- `n == citations.length`
- $1 \leq n \leq 500$
- `0 <= citations[i] <= 1000`

## Idea1: Bucket Counting

Let $n$ be the number of papers. An h-index cannot be greater than $n$, so every citation count above $n$ has the same effect: it can only contribute to thresholds up to $n$. Count papers into $n + 1$ buckets, placing a paper with $c$ citations into bucket $\min(c,n)$.

Then scan candidate h-index values from $n$ down to zero. Keep a running count of papers whose citation counts are at least the current candidate. The first candidate with enough papers is the maximum valid h-index.

For Example 1, the capped buckets contain two papers at 5 or more citations, one at 3, one at 1, and one at 0:

| Candidate $h$ | Papers with at least $h$ citations | Valid? |
| ---: | ---: | :--- |
| 5 | 2 | No |
| 4 | 2 | No |
| 3 | 3 | Yes |

The scan stops at $h=3$.

Complexity: Time $O(n)$, Space $O(n)$ for the buckets.

### Java

```java []
package array;

import java.util.Arrays;

/**
 * LeetCode 274: compute a researcher's h-index from citation counts.
 */
public final class HIndex {

    private HIndex() {
    }

    /**
     * Counts citation buckets, grouping every count greater than n into bucket n.
     * O(n) time and O(n) extra space.
     */
    public static int hIndex(int[] citations) {
        int n = citations.length;
        int[] counts = new int[n + 1];
        for (int citationCount : citations) {
            counts[Math.min(citationCount, n)]++;
        }

        int papersAtLeastH = 0;
        for (int h = n; h >= 0; h--) {
            papersAtLeastH += counts[h];
            if (papersAtLeastH >= h) return h;
        }
        return 0;
    }

    /**
     * Sorts a copy of the citations and checks the largest qualifying suffix.
     * O(n log n) time and O(n) extra space.
     */
    public static int hIndexSort(int[] citations) {
        int[] sortedCitations = citations.clone();
        Arrays.sort(sortedCitations);

        int n = sortedCitations.length;
        for (int i = 0; i < n; i++) {
            int papersAtLeastH = n - i;
            if (sortedCitations[i] >= papersAtLeastH) return papersAtLeastH;
        }
        return 0;
    }
}
```

### Python

```python []
"""Solutions for LeetCode 274, H-Index."""


class Solution:
    def hIndex(self, citations: list[int]) -> int:
        """Count papers by citation count, capped at the number of papers.

        Time O(n): each paper is counted once and each bucket is checked once.
        Space O(n): the bucket array has n + 1 entries.
        """
        n = len(citations)
        buckets = [0] * (n + 1)
        for count in citations:  # O(n) total work
            buckets[min(count, n)] += 1

        papers = 0
        for h in range(n, -1, -1):  # O(n) total work
            papers += buckets[h]
            if papers >= h:
                return h
        return 0

    def hIndexSort(self, citations: list[int]) -> int:
        """Sort citations descending and find the largest valid prefix.

        Time O(n log n) for sorting; the scan is O(n).
        Space O(n) for the sorted copy.
        """
        ordered = sorted(citations, reverse=True)
        for index, count in enumerate(ordered, start=1):  # O(n) scan
            if count < index:
                return index - 1
        return len(ordered)
```

### C++

```cpp []
#pragma once
#include <algorithm>
#include <vector>
using namespace std;

class HIndex {
public:
    // O(n) time and O(n) space.
    int hIndex(vector<int>& citations) {
        int n = (int)citations.size();
        vector<int> counts(n + 1, 0);
        for (int citation : citations)
            ++counts[min(citation, n)];

        int papers = 0;
        for (int h = n; h >= 0; --h) {
            papers += counts[h];
            if (papers >= h)
                return h;
        }
        return 0;
    }

    // O(n log n) time and O(n) extra space for the sorted copy.
    int hIndexSort(vector<int>& citations) {
        vector<int> sorted = citations;
        sort(sorted.begin(), sorted.end());
        int n = (int)sorted.size();
        for (int i = 0; i < n; ++i) {
            int h = n - i;
            if (sorted[i] >= h)
                return h;
        }
        return 0;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Bucket counts capped at n: O(n) time and O(n) extra space.
    pub fn h_index(citations: Vec<i32>) -> i32 {
        let n = citations.len();
        let mut buckets = vec![0; n + 1];

        for citation in citations {
            buckets[(citation as usize).min(n)] += 1;
        }

        let mut papers = 0;
        for h in (0..=n).rev() {
            papers += buckets[h];
            if papers >= h {
                return h as i32;
            }
        }

        0
    }

    /// Sort a copy: O(n log n) time and O(n) extra space.
    pub fn h_index_sort(citations: Vec<i32>) -> i32 {
        let mut sorted = citations.clone();
        sorted.sort_unstable();

        let mut h_index = 0;
        for (index, &citation) in sorted.iter().rev().enumerate() {
            let papers = index + 1;
            if citation >= papers as i32 {
                h_index = papers as i32;
            } else {
                break;
            }
        }

        h_index
    }
}
```

## Idea2: Sorting

A second common approach sorts the citation counts. In ascending order, at index $i$ there are $n-i$ papers in the suffix. If the citation count at $i$ is at least $n-i$, that suffix proves an h-index of $n-i$. The implementations return the largest qualifying suffix. The Python version sorts descending and checks each prefix instead.

For Example 1, sorting gives $[0,1,3,5,6]$. The suffix beginning with 3 contains three papers, so $h=3$; the suffix beginning at 1 has four papers but its minimum citation count is too small.

Complexity: Time $O(n \log n)$, Space $O(n)$ for a sorted copy.

### Java

```java []
package array;

import java.util.Arrays;

/**
 * LeetCode 274: compute a researcher's h-index from citation counts.
 */
public final class HIndex {

    private HIndex() {
    }

    /**
     * Counts citation buckets, grouping every count greater than n into bucket n.
     * O(n) time and O(n) extra space.
     */
    public static int hIndex(int[] citations) {
        int n = citations.length;
        int[] counts = new int[n + 1];
        for (int citationCount : citations) {
            counts[Math.min(citationCount, n)]++;
        }

        int papersAtLeastH = 0;
        for (int h = n; h >= 0; h--) {
            papersAtLeastH += counts[h];
            if (papersAtLeastH >= h) return h;
        }
        return 0;
    }

    /**
     * Sorts a copy of the citations and checks the largest qualifying suffix.
     * O(n log n) time and O(n) extra space.
     */
    public static int hIndexSort(int[] citations) {
        int[] sortedCitations = citations.clone();
        Arrays.sort(sortedCitations);

        int n = sortedCitations.length;
        for (int i = 0; i < n; i++) {
            int papersAtLeastH = n - i;
            if (sortedCitations[i] >= papersAtLeastH) return papersAtLeastH;
        }
        return 0;
    }
}
```

### Python

```python []
"""Solutions for LeetCode 274, H-Index."""


class Solution:
    def hIndex(self, citations: list[int]) -> int:
        """Count papers by citation count, capped at the number of papers.

        Time O(n): each paper is counted once and each bucket is checked once.
        Space O(n): the bucket array has n + 1 entries.
        """
        n = len(citations)
        buckets = [0] * (n + 1)
        for count in citations:  # O(n) total work
            buckets[min(count, n)] += 1

        papers = 0
        for h in range(n, -1, -1):  # O(n) total work
            papers += buckets[h]
            if papers >= h:
                return h
        return 0

    def hIndexSort(self, citations: list[int]) -> int:
        """Sort citations descending and find the largest valid prefix.

        Time O(n log n) for sorting; the scan is O(n).
        Space O(n) for the sorted copy.
        """
        ordered = sorted(citations, reverse=True)
        for index, count in enumerate(ordered, start=1):  # O(n) scan
            if count < index:
                return index - 1
        return len(ordered)
```

### C++

```cpp []
#pragma once
#include <algorithm>
#include <vector>
using namespace std;

class HIndex {
public:
    // O(n) time and O(n) space.
    int hIndex(vector<int>& citations) {
        int n = (int)citations.size();
        vector<int> counts(n + 1, 0);
        for (int citation : citations)
            ++counts[min(citation, n)];

        int papers = 0;
        for (int h = n; h >= 0; --h) {
            papers += counts[h];
            if (papers >= h)
                return h;
        }
        return 0;
    }

    // O(n log n) time and O(n) extra space for the sorted copy.
    int hIndexSort(vector<int>& citations) {
        vector<int> sorted = citations;
        sort(sorted.begin(), sorted.end());
        int n = (int)sorted.size();
        for (int i = 0; i < n; ++i) {
            int h = n - i;
            if (sorted[i] >= h)
                return h;
        }
        return 0;
    }
};
```

### Rust

```rust []
pub struct Solution;

impl Solution {
    /// Bucket counts capped at n: O(n) time and O(n) extra space.
    pub fn h_index(citations: Vec<i32>) -> i32 {
        let n = citations.len();
        let mut buckets = vec![0; n + 1];

        for citation in citations {
            buckets[(citation as usize).min(n)] += 1;
        }

        let mut papers = 0;
        for h in (0..=n).rev() {
            papers += buckets[h];
            if papers >= h {
                return h as i32;
            }
        }

        0
    }

    /// Sort a copy: O(n log n) time and O(n) extra space.
    pub fn h_index_sort(citations: Vec<i32>) -> i32 {
        let mut sorted = citations.clone();
        sorted.sort_unstable();

        let mut h_index = 0;
        for (index, &citation) in sorted.iter().rev().enumerate() {
            let papers = index + 1;
            if citation >= papers as i32 {
                h_index = papers as i32;
            } else {
                break;
            }
        }

        h_index
    }
}
```
