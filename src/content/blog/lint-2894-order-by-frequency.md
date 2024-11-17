---
author: JZ
pubDatetime: 2024-11-16T06:12:00Z
modDatetime: 2024-11-16T07:22:00Z
title: LintCode 2894 Order by frequency
featured: true
tags:
  - a-map
  - a-sort
description:
  "Solutions for LintCode 2894, medium, tags: map, sort. Related to LeetCode 884 and 451."
---

## Table of contents

## Description

Given an `int` array, count the number of occurrences of each number in the array, sort the numbers by the number of occurrences (from largest to smallest), and return the result as a `Map`, where `key` is the number of occurrences and `value` is the set of all numbers that have appeared `key` times (sorted from smallest to largest).

Example

**Sample I**  
Input.

    [1, 0]

Output.

    {1=[0, 1]}

**Sample II**  
Input.

    [5, 4, 4, 0, 0, 1]

Output.

    {2=[0, 4], 1=[1, 5]}


## Solution

This question is related to LeetCode 884 and LeetCode 451.

### Idea

The idea is basically as following:

1. counter: iterate through the array in O(n) time and count the frequency using a hashmap (O(n) space)
2. iterate the values in the hash map, collect the same frequency elements into a list and get the second hash map
3. sort the second hash map by frequency
4. return the sorted second map

With modern idiomatic approaches, we don't have to construct the two hash maps ourselves. In Java, we can use functional programming and streaming APIs. See comments in the Java solution below for details.

Complexity: Time O(n+k*log*k), Space O(n).

If the range of the unique elements in the array is not large, e.g., numbers are within `[0,1000]`, or if space is not a concern, we can use bucket sort to get O(n) time complexity. Stay tuned for LeetCode 451.

#### Java

```java
 class Solution {
    public Map<Integer, List<Integer>> orderByFrequency(int[] nums) {
        Map<Integer, List<Integer>> res = new TreeMap<>(Comparator.reverseOrder());
        res.putAll(
                Arrays.stream(nums).boxed().collect(groupingBy( // num -> count
                                i -> i, collectingAndThen(counting(), Long::intValue)))
                        .entrySet().stream().collect(groupingBy( // count -> [nums]
                                Entry::getValue, mapping(Entry::getKey, toList()))));
        return res;
    }
}
```
