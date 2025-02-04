---
author: JZ
pubDatetime: 2025-01-30T06:23:00Z
modDatetime: 2025-01-30T06:23:00Z
title: LeetCode 206 LintCode 35 Reverse Linked List
featured: true
tags:
  - a-linkedlist
  - a-recursion
  - c-bytedance
description:
  "Solutions for LeetCode 206 LintCode 35, easy, tags: linked list, recursion; companies: bytedance."
---

## Table of contents

## Description

Question Links: [LeetCode 206](https://leetcode.com/problems/reverse-linked-list/description/), [LintCode 35](https://www.lintcode.com/problem/35/)

Given the `head` of a singly linked list, reverse the list, and return _the reversed list_.

Example 1:

![example1](https://assets.leetcode.com/uploads/2021/02/19/rev1ex1.jpg)

```
Input: head = [1,2,3,4,5]
Output: [5,4,3,2,1]
```

Example 2:

![](https://assets.leetcode.com/uploads/2021/02/19/rev1ex2.jpg)

```
Input: head = [1,2]
Output: [2,1]
```

Example 3:

```
Input: head = []
Output: []
```

**Constraints:**

-   The number of nodes in the list is the range `[0, 5000]`.
-   `-5000 <= Node.val <= 5000`

**Follow up:** A linked list can be reversed either iteratively or recursively. Could you implement both?

## Idea1

We could solve this iteratively. For linked list, it is easier to write code as you draw the action on a piece of paper or whiteboard, or imagine in your head. Please check the image below for the steps to reverse the link.

![reverse.linkedlist.iterative](https://drive.google.com/thumbnail?id=1CfQhxmNYn2r1AFcdtq3A6UX7E5eIZg7n&sz=w1000)

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python
class Solution1:
    """0 ms, 18.58 mb"""

    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        res = None
        while head:  # revise head.next (tmp to res), advance res and head
            tmp = head.next
            head.next = res
            res = head
            head = tmp  # head point to None at the end
        return res
```

## Idea2

We could also solve this question recursively. Please check the image below for the steps.

![reverse.linkedlist.recursive](https://drive.google.com/thumbnail?id=1rvLDT4XG-Tjz_IyOeCtGI89OlLFQBeUP&sz=w1000)

Complexity: Time $O(n)$, Space $O(n)$.

The space is linear $O(n)$ considering the stack space used for the recursive calls. The function cannot be made tail recursive.

### Python

```python
class Solution2:
    """0 ms, 18.77 mb"""

    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if head is None or head.next is None:
            return head
        res = self.reverseList(head.next)  # get the new head, then reverse the last two links
        head.next.next = head  # reverse head.next.next
        head.next = None  # reverse head.next
        return res
```
