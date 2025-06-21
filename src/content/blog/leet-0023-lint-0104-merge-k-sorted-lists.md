---
author: JZ
pubDatetime: 2025-05-20T06:23:00Z
modDatetime: 2025-05-20T06:23:00Z
title: LeetCode 23 LintCode 104 Merge K Sorted Lists
featured: true
draft: true
tags:
  - a-heap
  - a-divide-and-conquer
  - a-linked-list
  - a-merge-sort
description:
  "Solutions for LeetCode 23 and LintCode 104, hard, tags: heap, divide and conquer, linked list, merge sort."
---

## Table of contents

## Description

Question links: [LeetCode 23](https://leetcode.com/problems/merge-k-sorted-lists/description/), [LintCode 104](https://www.lintcode.com/problem/104/)

You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order.

_Merge all the linked-lists into one sorted linked-list and return it._

```
Example 1:

Input: lists = [[1,4,5],[1,3,4],[2,6]]
Output: [1,1,2,3,4,4,5,6]
Explanation: The linked-lists are:
[
  1->4->5,
  1->3->4,
  2->6
]
merging them into one sorted list:
1->1->2->3->4->4->5->6
Example 2:

Input: lists = []
Output: []
Example 3:

Input: lists = [[]]
Output: []
```

**Constraints:**

-   `k == lists.length`
-   `0 <= k <= 10^4`
-   `0 <= lists[i].length <= 500`
-   `-10^4 <= lists[i][j] <= 10^4`
-   `lists[i]` is sorted in **ascending order**.
-   The sum of `lists[i].length` will not exceed `10^4`.

## Idea1

We could use a min heap to maintain the nodes that we are comparing.

1. We can get the minimum node from the min heap in $O(\log k)$ time.
2. We remove the minimum node, add it to the result linked list, and put the next of the removed node into the heap.
3. We repeat until the heap is empty.

Complexity: Time $O(n \log k)$, Space $O(k)$.

### Java

```java
class Solution {
    public ListNode mergeKListsHeap(ListNode[] lists) {
        PriorityQueue<ListNode> pq = new PriorityQueue<>(Comparator.comparingInt(n -> n.val));
        ListNode dummy = new ListNode(0), cur = dummy;
        for (ListNode n : lists) if (n != null) pq.add(n);
        while (!pq.isEmpty()) {
            ListNode n = pq.remove();
            cur.next = n;
            n = n.next;
            if (n != null) pq.add(n);
            cur = cur.next;
        }
        return dummy.next;
    }
}
```

## Idea2
