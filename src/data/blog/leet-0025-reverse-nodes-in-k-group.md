---
author: JZ
pubDatetime: 2026-06-21T06:00:00Z
modDatetime: 2026-06-21T06:00:00Z
title: LeetCode 25 Reverse Nodes in k-Group
featured: true
tags:
  - a-linked-list
  - a-recursion
description:
  "Solutions for LeetCode 25, hard, tags: linked list, recursion."
---

## Table of contents

## Description

Question Links: [LeetCode 25](https://leetcode.com/problems/reverse-nodes-in-k-group/description/)

Given the `head` of a linked list, reverse the nodes of the list `k` at a time, and return the modified list.

`k` is a positive integer and is less than or equal to the length of the linked list. If the number of nodes is not a multiple of `k` then left-out nodes, in the end, should remain as it is.

You may not alter the values in the nodes, only nodes themselves may be changed.

```
Example 1:

Input: head = [1,2,3,4,5], k = 2
Output: [2,1,4,3,5]

Example 2:

Input: head = [1,2,3,4,5], k = 3
Output: [3,2,1,4,5]

Constraints:

The number of nodes in the list is n.
1 <= k <= n <= 5000
0 <= Node.val <= 1000
```

## Solution 1: Iterative

### Idea

We use a dummy head node and process k nodes at a time. For each group:
1. Find the k-th node from the current position.
2. If fewer than k nodes remain, we're done.
3. Reverse the k nodes in-place by redirecting pointers.
4. Connect the reversed group back to the previous portion of the list.

```
Original:  dummy -> [1 -> 2 -> 3] -> [4 -> 5 -> 6] -> ...
                    \___ group 1 ___/  \___ group 2 ___/

After reversing group 1 (k=3):
           dummy -> [3 -> 2 -> 1] -> [4 -> 5 -> 6] -> ...
                     ^         ^
                     kth    groupPrev (for next iteration)
```

The outer loop runs $O(n/k)$ times, and each iteration does $O(k)$ work to find the k-th node and $O(k)$ work to reverse. Total: $O(n)$.

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
public static ListNode reverseKGroupIterative(ListNode head, int k) {
    if (head == null || k <= 1) return head;
    ListNode dummy = new ListNode(0);
    dummy.next = head;
    ListNode groupPrev = dummy;

    while (true) { // O(n/k) iterations
        ListNode kth = groupPrev;
        for (int i = 0; i < k; i++) { // O(k) find kth node
            kth = kth.next;
            if (kth == null) return dummy.next;
        }
        ListNode groupNext = kth.next;

        // Reverse k nodes
        ListNode prev = groupNext;
        ListNode curr = groupPrev.next;
        for (int i = 0; i < k; i++) { // O(k) reverse
            ListNode next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }

        ListNode tmp = groupPrev.next;
        groupPrev.next = kth;
        groupPrev = tmp;
    }
}
```

#### Python

```python []
def reverseKGroup(self, head: Optional[ListNode], k: int) -> Optional[ListNode]:
    dummy = ListNode(0, head)
    group_prev = dummy

    while True:
        kth = self._get_kth(group_prev, k)
        if not kth:
            break
        group_next = kth.next

        # reverse the group
        prev, cur = group_next, group_prev.next  # O(k) per group
        while cur != group_next:
            tmp = cur.next
            cur.next = prev
            prev = cur
            cur = tmp

        # connect with previous part
        tmp = group_prev.next
        group_prev.next = kth
        group_prev = tmp

    return dummy.next

def _get_kth(self, cur, k):
    while cur and k > 0:
        cur = cur.next
        k -= 1
    return cur
```

#### C++

```cpp []
ListNode* reverseKGroup(ListNode* head, int k) {
    ListNode dummy(0);
    dummy.next = head;
    ListNode* groupPrev = &dummy;

    while (true) {
        ListNode* kth = groupPrev;
        for (int i = 0; i < k; ++i) { // O(k) find kth
            kth = kth->next;
            if (!kth) return dummy.next;
        }
        ListNode* groupNext = kth->next;

        ListNode* prev = groupNext;
        ListNode* curr = groupPrev->next;
        for (int i = 0; i < k; ++i) { // O(k) reverse
            ListNode* nxt = curr->next;
            curr->next = prev;
            prev = curr;
            curr = nxt;
        }

        ListNode* newGroupTail = groupPrev->next;
        groupPrev->next = prev;
        groupPrev = newGroupTail;
    }
}
```

#### Rust

```rust []
pub fn reverse_k_group(head: Option<Box<ListNode>>, k: i32) -> Option<Box<ListNode>> {
    if k <= 1 { return head; }
    let k = k as usize;
    let mut dummy = Box::new(ListNode { val: 0, next: head });
    let mut group_prev: *mut ListNode = &mut *dummy;

    'outer: loop {
        // Check if k nodes remain
        let mut scout = unsafe { &*group_prev }.next.as_deref();
        for _ in 0..k {
            match scout {
                Some(n) => scout = n.next.as_deref(),
                None => break 'outer,
            }
        }
        // Reverse k nodes starting after group_prev
        let mut cur = unsafe { &mut *group_prev }.next.take();
        let first_ptr: *mut ListNode = cur.as_mut().unwrap().as_mut();
        let mut prev: Option<Box<ListNode>> = None;
        for _ in 0..k { // O(k) reverse
            let mut node = cur.unwrap();
            cur = node.next.take();
            node.next = prev;
            prev = Some(node);
        }
        unsafe { &mut *group_prev }.next = prev;
        unsafe { &mut *first_ptr }.next = cur;
        group_prev = first_ptr;
    }
    dummy.next
}
```

## Solution 2: Recursive

### Idea

A cleaner approach using recursion:
1. Check if there are at least k nodes remaining.
2. Reverse the first k nodes.
3. Recursively process the rest and attach to the tail of the reversed group.

The recursion depth is $O(n/k)$, and each call does $O(k)$ work.

Complexity: Time $O(n)$, Space $O(n/k)$ for recursion stack.

#### Java

```java []
public static ListNode reverseKGroupRecursive(ListNode head, int k) {
    if (head == null || k <= 1) return head;

    ListNode curr = head;
    for (int i = 0; i < k; i++) { // O(k) check group length
        if (curr == null) return head;
        curr = curr.next;
    }

    // Reverse first k nodes
    ListNode prev = null;
    curr = head;
    for (int i = 0; i < k; i++) { // O(k) reverse group
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }

    head.next = reverseKGroupRecursive(curr, k); // O(n/k) recursive calls
    return prev;
}
```

#### Python

```python []
def reverseKGroup(self, head: Optional[ListNode], k: int) -> Optional[ListNode]:
    cur = head
    count = 0
    while cur and count < k:  # O(k) check if k nodes exist
        cur = cur.next
        count += 1
    if count < k:
        return head

    # reverse first k nodes
    prev, cur = None, head  # O(k)
    for _ in range(k):
        tmp = cur.next
        cur.next = prev
        prev = cur
        cur = tmp

    # head is now the tail of the reversed group
    head.next = self.reverseKGroup(cur, k)  # O(n/k) recursion depth
    return prev
```

#### C++

```cpp []
ListNode* reverseKGroup(ListNode* head, int k) {
    ListNode* curr = head;
    for (int i = 0; i < k; ++i) { // O(k) check
        if (!curr) return head;
        curr = curr->next;
    }

    ListNode* prev = nullptr;
    curr = head;
    for (int i = 0; i < k; ++i) { // O(k) reverse
        ListNode* nxt = curr->next;
        curr->next = prev;
        prev = curr;
        curr = nxt;
    }

    head->next = reverseKGroup(curr, k); // O(n/k) recursion depth
    return prev;
}
```

#### Rust

```rust []
pub fn reverse_k_group_recursive(
    head: Option<Box<ListNode>>, k: i32,
) -> Option<Box<ListNode>> {
    if k <= 1 { return head; }
    let k = k as usize;

    // Check if there are at least k nodes
    let mut scout = head.as_deref();
    for _ in 0..k {
        match scout {
            Some(n) => scout = n.next.as_deref(),
            None => return head,
        }
    }

    // Reverse the first k nodes
    let mut prev: Option<Box<ListNode>> = None;
    let mut cur = head;
    for _ in 0..k {
        let mut node = cur.unwrap();
        cur = node.next.take();
        node.next = prev;
        prev = Some(node);
    }

    // Walk to the tail of the reversed segment and recurse
    let mut tail = prev.as_mut().unwrap();
    while tail.next.is_some() {
        tail = tail.next.as_mut().unwrap();
    }
    tail.next = Self::reverse_k_group_recursive(cur, k as i32);
    prev
}
```
