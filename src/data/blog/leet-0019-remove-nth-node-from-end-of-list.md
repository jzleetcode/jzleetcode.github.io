---
author: JZ
pubDatetime: 2026-08-07T06:23:00Z
modDatetime: 2026-08-07T06:23:00Z
title: LeetCode 19 Remove Nth Node From End of List
featured: false
tags:
  - a-linkedlist
  - a-two-pointer
description:
  "Solutions for LeetCode 19, medium, tags: linked list, two pointers."
---

## Table of contents

## Description

Question Link: [LeetCode 19](https://leetcode.com/problems/remove-nth-node-from-end-of-list/description/)

Given the `head` of a linked list, remove the `n`th node from the end of the list and return its head.

Example 1:

![example1](https://assets.leetcode.com/uploads/2020/10/03/remove_ex1.jpg)

```
Input: head = [1,2,3,4,5], n = 2
Output: [1,2,3,5]
```

Example 2:

```
Input: head = [1], n = 1
Output: []
```

Example 3:

```
Input: head = [1,2], n = 1
Output: [1]
```

**Constraints:**

- The number of nodes in the list is `sz`.
- `1 <= sz <= 30`
- `0 <= Node.val <= 100`
- `1 <= n <= sz`

**Follow up:** Could you do this in one pass?

## Idea1

Use two pointers with an n-gap. Create a dummy node before head to handle the edge case where the head itself must be removed. Advance the `front` pointer n+1 steps from dummy, then move both `front` and `back` until `front` reaches null. At that point `back.next` is the node to remove.

```
dummy -> 1 -> 2 -> 3 -> 4 -> 5,  n = 2
                        back  X  front=null
         |--- n+1 gap ---|
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public ListNode removeNthFromEnd(ListNode head, int n) {
    ListNode dummy = new ListNode();
    dummy.next = head;
    ListNode front = dummy, back = dummy;
    for (int i = 1; i <= n + 1; i++) front = front.next; // O(n) advance front n+1
    while (front != null) { // O(n)
        back = back.next;
        front = front.next;
    }
    back.next = back.next.next; // O(1) remove
    return dummy.next;
}
```

### Python

```python []
class Solution:
    """Two pointers with n-gap. O(n) time, O(1) space."""

    def removeNthFromEnd(self, head: Optional[ListNode], n: int) -> Optional[ListNode]:
        dummy = ListNode(0)
        dummy.next = head
        front, back = dummy, dummy
        for _ in range(n + 1):  # O(n) advance front n+1 steps
            front = front.next
        while front:  # O(n) advance both until front reaches end
            front = front.next
            back = back.next
        back.next = back.next.next  # O(1) remove the nth node from end
        return dummy.next
```

### C++

```cpp []
class Solution {
public:
    // Two pointer approach. O(n) time, O(1) space.
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        ListNode dummy(0, head);
        ListNode* fast = &dummy;
        ListNode* slow = &dummy;
        for (int i = 0; i <= n; ++i) fast = fast->next; // O(n)
        while (fast) { fast = fast->next; slow = slow->next; } // O(n)
        ListNode* toDelete = slow->next;
        slow->next = toDelete->next;
        delete toDelete;
        return dummy.next;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Two pointers with n-gap. Time O(n), Space O(1).
    pub fn remove_nth_from_end(head: Option<Box<ListNode>>, n: i32) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode { val: 0, next: head });
        let mut fast = &*dummy as *const ListNode;
        for _ in 0..n { // O(n) advance fast n steps
            unsafe { fast = (*fast).next.as_deref().unwrap(); }
        }
        let mut slow = &mut *dummy as *mut ListNode;
        unsafe {
            while (*fast).next.is_some() { // O(n)
                fast = (*fast).next.as_deref().unwrap();
                slow = (*slow).next.as_deref_mut().unwrap();
            }
            let removed = (*slow).next.take();
            (*slow).next = removed.and_then(|n| n.next);
        }
        dummy.next
    }
}
```

## Idea2

Single pass counting. Use a `cur` pointer to traverse the list counting nodes, and a `nth` pointer that starts moving only after `cur` has advanced n steps. When `cur` reaches the end, `nth.next` is the node to remove.

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public ListNode removeNthFromEnd(ListNode head, int n) {
    ListNode dummy = new ListNode();
    dummy.next = head;
    ListNode cur = head, nth = dummy;
    int count = 0;
    while (cur != null) { // O(n)
        cur = cur.next;
        count++;
        if (count > n) nth = nth.next;
    }
    nth.next = nth.next.next;
    return dummy.next;
}
```

### Python

```python []
class Solution2:
    """Single pass counting. O(n) time, O(1) space."""

    def removeNthFromEnd(self, head: Optional[ListNode], n: int) -> Optional[ListNode]:
        dummy = ListNode(0)
        dummy.next = head
        cur, nth = head, dummy
        count = 0
        while cur:  # O(n)
            cur = cur.next
            count += 1
            if count > n:
                nth = nth.next
        nth.next = nth.next.next
        return dummy.next
```

### C++

```cpp []
class Solution {
public:
    // Counting approach. O(n) time, O(1) space.
    ListNode* removeNthFromEnd(ListNode* head, int n) {
        ListNode dummy(0, head);
        int len = 0;
        for (ListNode* p = head; p; p = p->next) ++len; // O(n) count
        ListNode* prev = &dummy;
        for (int i = 0; i < len - n; ++i) prev = prev->next; // O(n) walk to target
        ListNode* toDelete = prev->next;
        prev->next = toDelete->next;
        delete toDelete;
        return dummy.next;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Single pass counting. Time O(n), Space O(1).
    pub fn remove_nth_from_end_v2(head: Option<Box<ListNode>>, n: i32) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode { val: 0, next: head });
        let mut len = 0;
        {
            let mut cur = dummy.next.as_deref();
            while let Some(node) = cur { // O(n) count
                len += 1;
                cur = node.next.as_deref();
            }
        }
        let target = len - n;
        let mut cur = &mut *dummy as &mut ListNode;
        for _ in 0..target { // O(n) walk to node before target
            cur = cur.next.as_deref_mut().unwrap();
        }
        let removed = cur.next.take();
        cur.next = removed.and_then(|n| n.next);
        dummy.next
    }
}
```
