---
author: JZ
pubDatetime: 2026-07-27T10:07:00Z
modDatetime: 2026-07-27T10:07:00Z
title: LeetCode 148 Sort List
featured: false
tags:
  - a-linkedlist
  - a-sorting
  - a-divide-and-conquer
  - a-merge-sort
description:
  "Solutions for LeetCode 148, medium, tags: linked list, two pointers, divide and conquer, sorting, merge sort."
---

## Table of contents

## Description

Question Link: [LeetCode 148](https://leetcode.com/problems/sort-list/description/)

Given the head of a linked list, return the list after sorting it in ascending order.

Example 1:

![example1](https://assets.leetcode.com/uploads/2020/09/14/sort_list_1.jpg)

```
Input: head = [4,2,1,3]
Output: [1,2,3,4]
```

Example 2:

![example2](https://assets.leetcode.com/uploads/2020/09/14/sort_list_2.jpg)

```
Input: head = [-1,5,3,4,0]
Output: [-1,0,3,4,5]
```

Example 3:

```
Input: head = []
Output: []
```

**Constraints:**

- The number of nodes in the list is in the range `[0, 5 * 10^4]`.
- `-10^5 <= Node.val <= 10^5`

**Follow up:** Can you sort the linked list in O(n log n) time and O(1) memory (i.e. constant space)?

## Idea1

Bottom-up iterative merge sort. Start with sublists of size 1, merge adjacent pairs, double the size, and repeat until the entire list is sorted. This avoids recursion entirely, achieving O(1) space.

```
Original:     4 → 2 → 1 → 3

Pass 1 (size=1): merge pairs of 1
  [4],[2] → 2,4    [1],[3] → 1,3
  Result:   2 → 4 → 1 → 3

Pass 2 (size=2): merge pairs of 2
  [2,4],[1,3] → 1,2,3,4
  Result:   1 → 2 → 3 → 4
```

Key operations: `split(head, step)` cuts after `step` nodes and returns the remainder; `merge(left, right, prev)` merges two sorted sublists and appends them after `prev`, returning the tail.

Complexity: Time $O(n \log n)$ — $O(\log n)$ passes each doing $O(n)$ work, Space $O(1)$.

### Java

```java []
public class SortList {
    // O(nLgn) time, O(1) space. bottom up merge sort.
    public static ListNode sortList(ListNode head) {
        ListNode dummy = new ListNode(0);
        dummy.next = head;
        int n = 0;
        while (head != null) { head = head.next; n++; } // O(n) count length
        for (int step = 1; step < n; step <<= 1) { // O(log n) passes
            ListNode prev = dummy;
            ListNode cur = dummy.next;
            while (cur != null) { // O(n) per pass
                ListNode left = cur, right = split(left, step);
                cur = split(right, step);
                prev = merge(left, right, prev);
            }
        }
        return dummy.next;
    }

    private static ListNode split(ListNode head, int step) {
        if (head == null) return null;
        for (int i = 1; head.next != null && i < step; i++) head = head.next;
        ListNode right = head.next;
        head.next = null;
        return right;
    }

    private static ListNode merge(ListNode left, ListNode right, ListNode prev) {
        ListNode cur = prev;
        while (left != null && right != null) {
            if (left.val < right.val) { cur.next = left; left = left.next; }
            else { cur.next = right; right = right.next; }
            cur = cur.next;
        }
        if (left != null) cur.next = left;
        else if (right != null) cur.next = right;
        while (cur.next != null) cur = cur.next;
        return cur;
    }
}
```

### Python

```python []
class Solution:
    """Bottom-up merge sort. O(n log n) time, O(1) space."""

    def sortList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if not head or not head.next:
            return head
        n = 0
        cur = head
        while cur:  # O(n) count length
            n += 1
            cur = cur.next
        dummy = ListNode(0)
        dummy.next = head
        step = 1
        while step < n:  # O(log n) passes
            prev, cur = dummy, dummy.next
            while cur:  # O(n) per pass
                left = cur
                right = self._split(left, step)
                cur = self._split(right, step)
                prev = self._merge(left, right, prev)
            step <<= 1
        return dummy.next

    def _split(self, head, step):
        if not head:
            return None
        for _ in range(step - 1):
            if not head.next:
                break
            head = head.next
        right = head.next
        head.next = None
        return right

    def _merge(self, left, right, prev):
        cur = prev
        while left and right:
            if left.val <= right.val:
                cur.next = left
                left = left.next
            else:
                cur.next = right
                right = right.next
            cur = cur.next
        cur.next = left if left else right
        while cur.next:
            cur = cur.next
        return cur
```

### C++

```cpp []
class SolutionSortList {
public:
    // O(n log n) time, O(1) space. Bottom-up iterative merge sort.
    ListNode* sortList(ListNode* head) {
        if (!head || !head->next) return head;
        int len = 0;
        for (ListNode* p = head; p; p = p->next) ++len; // O(n)
        ListNode dummy(0);
        dummy.next = head;
        for (int size = 1; size < len; size <<= 1) { // O(log n) passes
            ListNode* prev = &dummy;
            ListNode* cur = dummy.next;
            while (cur) { // O(n) per pass
                ListNode* left = cur;
                ListNode* right = split(left, size);
                cur = split(right, size);
                prev = merge(left, right, prev);
            }
        }
        return dummy.next;
    }

private:
    ListNode* split(ListNode* head, int n) {
        for (int i = 1; head && i < n; ++i) head = head->next;
        if (!head) return nullptr;
        ListNode* rest = head->next;
        head->next = nullptr;
        return rest;
    }

    ListNode* merge(ListNode* l, ListNode* r, ListNode* prev) {
        while (l && r) {
            if (l->val <= r->val) { prev->next = l; l = l->next; }
            else { prev->next = r; r = r->next; }
            prev = prev->next;
        }
        prev->next = l ? l : r;
        while (prev->next) prev = prev->next;
        return prev;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Bottom-up iterative merge sort. O(n log n) time, O(1) extra space.
    pub fn sort_list_bottom_up(head: Option<Box<ListNode>>) -> Option<Box<ListNode>> {
        let len = Self::length(&head);
        if len <= 1 { return head; }
        let mut head = head;
        let mut size = 1;
        while size < len {
            let mut dummy = Box::new(ListNode::new(0));
            let mut tail = &mut dummy;
            let mut cur = head;
            while cur.is_some() {
                let left = Self::cut(&mut cur, size);
                let right = Self::cut(&mut cur, size);
                tail.next = Self::merge(left, right);
                while tail.next.is_some() { tail = tail.next.as_mut().unwrap(); }
            }
            head = dummy.next;
            size *= 2;
        }
        head
    }

    fn cut(head: &mut Option<Box<ListNode>>, n: usize) -> Option<Box<ListNode>> {
        let mut cur = head.take();
        let mut tail = &mut cur;
        for _ in 0..n {
            if tail.is_none() { break; }
            tail = &mut tail.as_mut().unwrap().next;
        }
        *head = tail.take();
        cur
    }

    fn merge(mut l1: Option<Box<ListNode>>, mut l2: Option<Box<ListNode>>) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode::new(0));
        let mut tail = &mut dummy;
        while l1.is_some() && l2.is_some() {
            let take_l1 = l1.as_ref().unwrap().val <= l2.as_ref().unwrap().val;
            if take_l1 {
                let mut node = l1.take().unwrap();
                l1 = node.next.take();
                tail.next = Some(node);
            } else {
                let mut node = l2.take().unwrap();
                l2 = node.next.take();
                tail.next = Some(node);
            }
            tail = tail.next.as_mut().unwrap();
        }
        tail.next = if l1.is_some() { l1 } else { l2 };
        dummy.next
    }

    fn length(head: &Option<Box<ListNode>>) -> usize {
        let mut count = 0;
        let mut cur = head;
        while let Some(node) = cur { count += 1; cur = &node.next; }
        count
    }
}
```

## Idea2

Top-down recursive merge sort. Find the middle using slow/fast pointers, recursively sort each half, then merge the two sorted halves.

```
sortList([4,2,1,3])
├── sortList([4,2])
│   ├── sortList([4]) → [4]
│   ├── sortList([2]) → [2]
│   └── merge → [2,4]
├── sortList([1,3])
│   ├── sortList([1]) → [1]
│   ├── sortList([3]) → [3]
│   └── merge → [1,3]
└── merge [2,4] + [1,3] → [1,2,3,4]
```

Complexity: Time $O(n \log n)$ — $O(\log n)$ recursion levels each merging $O(n)$ nodes, Space $O(\log n)$ for the recursion stack.

### Java

```java []
public class SortList {
    // O(nLgn) time, O(Lgn) space. top-down merge sort.
    public static ListNode sortListRecursive(ListNode head) {
        if (head == null || head.next == null) return head;
        ListNode slow = head, fast = head.next;
        while (fast != null && fast.next != null) { // O(n/2) find middle
            slow = slow.next;
            fast = fast.next.next;
        }
        ListNode mid = slow.next;
        slow.next = null;
        ListNode left = sortListRecursive(head); // T(n/2)
        ListNode right = sortListRecursive(mid); // T(n/2)
        return mergeSorted(left, right);
    }

    private static ListNode mergeSorted(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(0);
        ListNode cur = dummy;
        while (l1 != null && l2 != null) { // O(n)
            if (l1.val <= l2.val) { cur.next = l1; l1 = l1.next; }
            else { cur.next = l2; l2 = l2.next; }
            cur = cur.next;
        }
        cur.next = l1 != null ? l1 : l2;
        return dummy.next;
    }
}
```

### Python

```python []
class Solution2:
    """Top-down merge sort (recursive). O(n log n) time, O(log n) space."""

    def sortList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if not head or not head.next:
            return head
        slow, fast = head, head.next
        while fast and fast.next:  # O(n/2) find middle
            slow = slow.next
            fast = fast.next.next
        mid = slow.next
        slow.next = None
        left = self.sortList(head)  # T(n/2)
        right = self.sortList(mid)  # T(n/2)
        return self._merge(left, right)

    def _merge(self, l1, l2):
        dummy = ListNode(0)
        cur = dummy
        while l1 and l2:  # O(n)
            if l1.val <= l2.val:
                cur.next = l1
                l1 = l1.next
            else:
                cur.next = l2
                l2 = l2.next
            cur = cur.next
        cur.next = l1 if l1 else l2
        return dummy.next
```

### C++

```cpp []
class SolutionSortList {
public:
    // O(n log n) time, O(log n) stack space. Top-down recursive merge sort.
    ListNode* sortListRecursive(ListNode* head) {
        if (!head || !head->next) return head;
        ListNode* slow = head;
        ListNode* fast = head->next;
        while (fast && fast->next) { // O(n/2) find middle
            slow = slow->next;
            fast = fast->next->next;
        }
        ListNode* mid = slow->next;
        slow->next = nullptr;
        ListNode* left = sortListRecursive(head); // T(n/2)
        ListNode* right = sortListRecursive(mid); // T(n/2)
        return mergeTwoLists(left, right);
    }

private:
    ListNode* mergeTwoLists(ListNode* l, ListNode* r) {
        ListNode dummy(0);
        ListNode* tail = &dummy;
        while (l && r) { // O(n)
            if (l->val <= r->val) { tail->next = l; l = l->next; }
            else { tail->next = r; r = r->next; }
            tail = tail->next;
        }
        tail->next = l ? l : r;
        return dummy.next;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Top-down recursive merge sort. O(n log n) time, O(log n) stack space.
    pub fn sort_list(head: Option<Box<ListNode>>) -> Option<Box<ListNode>> {
        if head.is_none() || head.as_ref().unwrap().next.is_none() {
            return head;
        }
        let (left, right) = Self::split(head);
        let left = Self::sort_list(left);
        let right = Self::sort_list(right);
        Self::merge(left, right)
    }

    fn split(head: Option<Box<ListNode>>) -> (Option<Box<ListNode>>, Option<Box<ListNode>>) {
        let len = Self::length(&head);
        let mid = len / 2;
        Self::cut_at(head, mid)
    }

    fn cut_at(head: Option<Box<ListNode>>, at: usize)
        -> (Option<Box<ListNode>>, Option<Box<ListNode>>)
    {
        let mut dummy = Box::new(ListNode::new(0));
        dummy.next = head;
        let mut cur = &mut dummy;
        for _ in 0..at { cur = cur.next.as_mut().unwrap(); }
        let right = cur.next.take();
        let left = dummy.next;
        (left, right)
    }
}
```
