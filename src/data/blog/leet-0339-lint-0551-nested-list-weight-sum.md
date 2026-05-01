---
author: JZ
pubDatetime: 2024-12-15T07:23:00Z
modDatetime: 2024-12-15T07:23:00Z
title: LeetCode 339 LintCode 551 Nested List Weight Sum
featured: false
tags:
  - a-dfs
  - a-bfs
  - c-salesforce
description:
  "Solutions for LeetCode 339 LintCode 551, medium, tags: dfs, bfs; companies: salesforce."
---

## Table of contents

## Description

Question Links: [LeetCode 339](https://leetcode.com/problems/nested-list-weight-sum/description/), [LintCode 551](https://www.lintcode.com/problem/551/)

You are given a nested list of integers `nestedList`. Each element is either an integer or a list whose elements may also be integers or other lists.

The **depth** of an integer is the number of lists that it is inside of. For example, the nested list `[1,[2,2],[[3],2],1]` has each integer's value set to its **depth**.

Return _the sum of each integer in_ `nestedList` _multiplied by its **depth**_.

```
Example 1:

Input: nestedList = [[1,1],2,[1,1]]
Output: 10
Explanation: Four 1's at depth 2, one 2 at depth 1. 1*2 + 1*2 + 2*1 + 1*2 + 1*2 = 10.

Example 2:

Input: nestedList = [1,[4,[6]]]
Output: 27
Explanation: One 1 at depth 1, one 4 at depth 2, and one 6 at depth 3. 1*1 + 4*2 + 6*3 = 27.

Example 3:

Input: nestedList = [0]
Output: 0
```

**Constraints:**

-   `1 <= nestedList.length <= 50`
-   The values of the integers in the nested list is in the range `[-100, 100]`.
-   The maximum **depth** of any integer is less than or equal to `50`.

## Idea

`let n=nestedList.length, d=max_depth`

We could recursively explore into the nested list, keeping track of the recursion depth, and multiply the elements with the depth. We then sum up all the products of the multiplications.

We can analyze the time complexity with the recursion tree method. For more, see this [post](../leet-recursion-tree-master-method/).

![leet 339 recursion tree](https://drive.google.com/thumbnail?id=1GGzu_NolKZbJdBJh5-l2YQoZbPe3eKBj&sz=w1000)

Complexity: Time $O(n)$, Space $O(d)$ (recursion depth).

### Python

```python
# """
# This is the interface that allows for creating nested lists.
# You should not implement it, or speculate about its implementation
# """
from typing import Self


class NestedInteger:
    def __init__(self, value=None):
        """
        If value is not specified, initializes an empty list.
        Otherwise initializes a single integer equal to value.
        """

    def isInteger(self) -> bool:
        """
        @return True if this NestedInteger holds a single integer, rather than a nested list.
        :rtype bool
        """

    def add(self, elem):
        """
        Set this NestedInteger to hold a nested list and adds a nested integer elem to it.
        :rtype void
        """

    def setInteger(self, value):
        """
        Set this NestedInteger to hold a single integer equal to value.
        :rtype void
        """

    def getInteger(self) -> int | None:
        """
        @return the single integer that this NestedInteger holds, if it holds a single integer
        Return None if this NestedInteger holds a nested list
        :rtype int
        """

    def getList(self) -> list[Self] | None:
        """
        @return the nested list that this NestedInteger holds, if it holds a nested list
        Return None if this NestedInteger holds a single integer
        :rtype List[NestedInteger]
        """


class Solution:
    """780 ms, 7.28 mb"""

    def depthSum(self, nil: list[NestedInteger]) -> int:
        # nil: nested integer list, d: depth
        def dfs(nil: list[NestedInteger], d):
            res = 0
            for i in nil:
                if i.isInteger():
                    res += i.getInteger() * d
                else:
                    res += dfs(i.getList(), d + 1)
            return res

        return dfs(nil, 1)
```

### Java

```java
// This is the interface that allows for creating nested lists.
// You should not implement it, or speculate about its implementation
interface NestedInteger {
    // @return true if this NestedInteger holds a single integer,
    // rather than a nested list.
    boolean isInteger();

    // @return the single integer that this NestedInteger holds,
    // if it holds a single integer
    // Return null if this NestedInteger holds a nested list
    Integer getInteger();

    // @return the nested list that this NestedInteger holds,
    // if it holds a nested list
    // Return null if this NestedInteger holds a single integer
    List<NestedInteger> getList();
}


static class Solution {
    int depthSum(List<NestedInteger> nil) {
        return dfs(nil, 1);
    }

    int dfs(List<NestedInteger> nil, int d) {
        int res = 0;
        for (NestedInteger i : nil) {
            if (i.isInteger()) res += i.getInteger() * d;
            else res += dfs(i.getList(), d + 1);
        }
        return res;
    }
}
```

### C++

```cpp []
// leet 339, DFS. O(n) time, O(d) space where d = max depth.
class SolutionNestedListWeightSum {
public:
    int depthSum(const vector<NestedInteger> &nestedList) {
        return dfs(nestedList, 1);
    }

private:
    int dfs(const vector<NestedInteger> &list, int depth) {
        int res = 0;
        for (const auto &ni : list) {
            if (ni.isInteger()) res += ni.getInteger() * depth;
            else res += dfs(ni.getList(), depth + 1);
        }
        return res;
    }
};
```

### Rust

```rust []
pub struct Solution;

pub enum NestedInteger {
    Int(i32),
    List(Vec<NestedInteger>),
}

impl Solution {
    /// DFS. O(n) time, O(d) space where d = max depth.
    pub fn depth_sum(nested_list: &[NestedInteger]) -> i32 {
        Self::dfs(nested_list, 1)
    }

    fn dfs(list: &[NestedInteger], depth: i32) -> i32 {
        let mut res = 0;
        for ni in list {
            match ni {
                NestedInteger::Int(val) => res += val * depth,
                NestedInteger::List(inner) => res += Self::dfs(inner, depth + 1),
            }
        }
        res
    }
}
```
