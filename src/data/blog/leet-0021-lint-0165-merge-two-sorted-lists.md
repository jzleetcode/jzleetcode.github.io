---
author: JZ
pubDatetime: 2025-06-05T06:23:00Z
modDatetime: 2025-06-05T06:23:00Z
title: LeetCode 21 LintCode 165 Merge Two Sorted Lists
tags:
  - a-heap
  - a-divide-and-conquer
  - a-recursion
  - a-linked-list
  - a-merge-sort
  - c-microsoft
description:
  "Solutions for LeetCode 21 and LintCode 165, easy, tags: heap, divide and conquer, linked list, merge sort, companies: microsoft"
---

## Table of contents

## Description

Question links: [LeetCode 21](https://leetcode.com/problems/merge-two-sorted-lists/description/), [LintCode 165](https://www.lintcode.com/problem/165/)

You are given the heads of two sorted linked lists `list1` and `list2`.

Merge the two lists into one **sorted** list. The list should be made by splicing together the nodes of the first two lists.

Return _the head of the merged linked list_.

**Example 1:**

![example 1 diagram](https://assets.leetcode.com/uploads/2020/10/03/merge_ex1.jpg)

```shell
Input: list1 = [1,2,4], list2 = [1,3,4]
Output: [1,1,2,3,4,4]
Example 2:

Input: list1 = [], list2 = []
Output: []
Example 3:

Input: list1 = [], list2 = [0]
Output: [0]
```

**Constraints:**

-   The number of nodes in both lists is in the range `[0, 50]`.
-   `-100 <= Node.val <= 100`
-   Both `list1` and `list2` are sorted in **non-decreasing** order.

## Idea

Think about the merge step in merge sort.

`let n = list.len()`

Complexity: Time $O(n)$, Space $O(1)$.

### Python

```python []
class Solution:
    """0 ms, 17.93 mb"""

    def mergeTwoLists(self, l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
        dummy = ListNode(0)
        cur = dummy
        while l1 and l2:
            if l1.val < l2.val:
                cur.next = l1
                l1 = l1.next
            else:
                cur.next = l2
                l2 = l2.next
            cur = cur.next
        cur.next = l1 if l1 else l2
        return dummy.next
```

### Java

```java []
class Solution {
    public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(0), cur = dummy;
        while (l1 != null && l2 != null) {
            if (l1.val < l2.val) {
                cur.next = l1;
                l1 = l1.next;
            } else {
                cur.next = l2;
                l2 = l2.next;
            }
            cur = cur.next;
        }
        cur.next = l1 == null ? l2 : l1;
        return dummy.next;
    }
}
```

### C++

```cpp []
class Solution {
public:
    // Time O(n + m), Space O(1).
    ListNode* mergeTwoLists(ListNode* l1, ListNode* l2) {
        ListNode dummy(0);
        ListNode* cur = &dummy;
        while (l1 && l2) {
            if (l1->val < l2->val) { cur->next = l1; l1 = l1->next; }
            else                   { cur->next = l2; l2 = l2->next; }
            cur = cur->next;
        }
        cur->next = l1 ? l1 : l2;
        return dummy.next;
    }
};
```

### Rust

```rust []
// Time O(n + m), Space O(1). Reparents nodes from each list into a merged
// chain via a dummy head; no extra allocation.
impl Solution {
    pub fn merge_two_lists(
        list1: Option<Box<ListNode>>,
        list2: Option<Box<ListNode>>,
    ) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode::new(0));
        let mut tail = &mut dummy;
        let (mut a, mut b) = (list1, list2);
        while a.is_some() && b.is_some() {
            let take_a = a.as_ref().unwrap().val < b.as_ref().unwrap().val;
            let next_box = if take_a {
                let mut n = a.take().unwrap();
                a = n.next.take();
                n
            } else {
                let mut n = b.take().unwrap();
                b = n.next.take();
                n
            };
            tail.next = Some(next_box);
            tail = tail.next.as_mut().unwrap();
        }
        tail.next = if a.is_some() { a } else { b };
        dummy.next
    }
}
```
