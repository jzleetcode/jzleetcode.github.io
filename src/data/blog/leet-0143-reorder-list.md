---
author: JZ
pubDatetime: 2026-05-11T06:23:00Z
modDatetime: 2026-05-11T06:23:00Z
title: LeetCode 143 Reorder List
featured: true
tags:
  - a-linkedlist
  - a-two-pointer
  - a-stack
description:
  "Solutions for LeetCode 143, medium, tags: linked list, two pointers, stack, recursion."
---

## Table of contents

## Description

Question Link: [LeetCode 143](https://leetcode.com/problems/reorder-list/description/)

You are given the head of a singly linked-list. The list can be represented as:

```
L0 → L1 → … → Ln - 1 → Ln
```

Reorder the list to be on the following form:

```
L0 → Ln → L1 → Ln - 1 → L2 → Ln - 2 → …
```

You may not modify the values in the list's nodes. Only nodes themselves may be changed.

Example 1:

![example1](https://assets.leetcode.com/uploads/2021/03/04/reorder1linked-list.jpg)

```
Input: head = [1,2,3,4]
Output: [1,4,2,3]
```

Example 2:

![example2](https://assets.leetcode.com/uploads/2021/03/09/reorder2-linked-list.jpg)

```
Input: head = [1,2,3,4,5]
Output: [1,5,2,4,3]
```

**Constraints:**

- The number of nodes in the list is in the range `[1, 5 * 10^4]`.
- `1 <= Node.val <= 1000`

## Idea1

Three steps:

1. **Find the middle** of the list using slow/fast pointers. Slow advances one step while fast advances two. When fast reaches the end, slow is at the end of the first half.
2. **Reverse the second half** in place.
3. **Merge the two halves** by alternating nodes from the first half and the reversed second half.

```
Original:     1 → 2 → 3 → 4 → 5

Step 1 – find middle (slow stops at node 3):
  first half:   1 → 2 → 3
  second half:  4 → 5

Step 2 – reverse second half:
  reversed:     5 → 4

Step 3 – merge alternately:
  1 → 5 → 2 → 4 → 3
```

Complexity: Time $O(n)$ — each step scans at most $n/2$ nodes, Space $O(1)$.

### Java

```java []
public class ReorderList {
    // O(n) time, O(1) space.
    public void reorderList(ListNode head) {
        ListNode slow = head, fast = head, head1 = head;
        while (fast.next != null && fast.next.next != null) { // O(n/2)
            slow = slow.next;
            fast = fast.next.next;
        } // slow is before the section that needs to be reversed
        ListNode headToReverse = slow.next, head2 = null;
        slow.next = null;
        while (headToReverse != null) { // reverse second half, O(n/2)
            ListNode temp = headToReverse.next;
            headToReverse.next = head2;
            head2 = headToReverse;
            headToReverse = temp;
        }
        while (head2 != null) { // merge two halves alternately, O(n/2)
            ListNode temp1 = head1.next, temp2 = head2.next;
            head1.next = head2;
            head2.next = temp1;
            head1 = temp1;
            head2 = temp2;
        }
    }
}
```

### Python

```python []
class Solution:
    """Find middle, reverse second half, merge two halves. O(n) time, O(1) space."""

    def reorderList(self, head: Optional[ListNode]) -> None:
        if not head or not head.next:
            return
        slow, fast = head, head
        while fast.next and fast.next.next:  # O(n/2)
            slow = slow.next
            fast = fast.next.next
        prev, cur = None, slow.next  # O(n/2)
        slow.next = None
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        first, second = head, prev
        while second:  # O(n/2)
            tmp1, tmp2 = first.next, second.next
            first.next = second
            second.next = tmp1
            first = tmp1
            second = tmp2
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(1) space.
    void reorderList(ListNode* head) {
        if (!head || !head->next) return;
        ListNode* slow = head;
        ListNode* fast = head;
        while (fast->next && fast->next->next) { // O(n/2)
            slow = slow->next;
            fast = fast->next->next;
        }
        ListNode* second = slow->next;
        slow->next = nullptr;
        ListNode* prev = nullptr;
        while (second) { // reverse second half, O(n/2)
            ListNode* nx = second->next;
            second->next = prev;
            prev = second;
            second = nx;
        }
        ListNode* first = head;
        second = prev;
        while (second) { // merge two halves, O(n/2)
            ListNode* fn = first->next;
            ListNode* sn = second->next;
            first->next = second;
            second->next = fn;
            first = fn;
            second = sn;
        }
    }
};
```

### Rust

```rust []
impl Solution {
    /// O(n) time, O(1) space.
    pub fn reorder_list(head: &mut Option<Box<ListNode>>) {
        let mut len = 0;
        let mut cur = head.as_ref();
        while let Some(node) = cur { len += 1; cur = node.next.as_ref(); }
        if len <= 2 { return; }
        // split after ceil(len/2) nodes
        let mid = (len + 1) / 2;
        let mut cur = head.as_mut().unwrap().as_mut();
        for _ in 1..mid { cur = cur.next.as_mut().unwrap().as_mut(); }
        let mut second = cur.next.take();
        // reverse second half
        let mut prev: Option<Box<ListNode>> = None;
        while let Some(mut node) = second {
            second = node.next.take();
            node.next = prev;
            prev = Some(node);
        }
        let mut second = prev;
        // merge alternately
        let mut cur = head.as_mut().unwrap().as_mut();
        while let Some(mut s_node) = second {
            second = s_node.next.take();
            s_node.next = cur.next.take();
            cur.next = Some(s_node);
            let next = cur.next.as_mut().unwrap();
            if next.next.is_none() { break; }
            cur = next.next.as_mut().unwrap().as_mut();
        }
    }
}
```

## Idea2

Use a stack (or list/Vec) to collect all nodes, then weave from both ends. Pop from the stack to get nodes in reverse order and splice them between the forward-traversal nodes.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

The Java solution above already uses $O(1)$ space. A stack-based approach would push all nodes onto a stack, then pop and interleave — the logic is the same as the Python solution below.

### Python

```python []
class Solution2:
    """Stack-based: push all nodes, then weave. O(n) time, O(n) space."""

    def reorderList(self, head: Optional[ListNode]) -> None:
        if not head or not head.next:
            return
        stack = []
        cur = head
        while cur:  # O(n)
            stack.append(cur)
            cur = cur.next
        n = len(stack)
        cur = head
        for i in range(n // 2):  # O(n/2)
            tail = stack.pop()
            tail.next = cur.next
            cur.next = tail
            cur = tail.next
        cur.next = None
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(n) space.
    void reorderList(ListNode* head) {
        if (!head || !head->next) return;
        stack<ListNode*> stk;
        ListNode* cur = head;
        int len = 0;
        while (cur) { stk.push(cur); cur = cur->next; len++; } // O(n)
        cur = head;
        int half = len / 2;
        for (int i = 0; i < half; i++) { // O(n/2)
            ListNode* tail = stk.top(); stk.pop();
            ListNode* nx = cur->next;
            cur->next = tail;
            tail->next = nx;
            cur = nx;
        }
        cur->next = nullptr;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Vec-based. O(n) time, O(n) space.
    pub fn reorder_list_vec(head: &mut Option<Box<ListNode>>) {
        let mut nodes: Vec<Box<ListNode>> = Vec::new();
        let mut cur = head.take();
        while let Some(mut node) = cur {
            cur = node.next.take();
            nodes.push(node);
        }
        let n = nodes.len();
        if n <= 2 {
            let mut rebuilt: Option<Box<ListNode>> = None;
            for mut node in nodes.into_iter().rev() {
                node.next = rebuilt;
                rebuilt = Some(node);
            }
            *head = rebuilt;
            return;
        }
        let mut order: Vec<usize> = Vec::with_capacity(n);
        let (mut lo, mut hi) = (0, n - 1);
        while lo <= hi {
            order.push(lo);
            if lo != hi { order.push(hi); }
            lo += 1;
            if hi == 0 { break; }
            hi -= 1;
        }
        let mut result: Option<Box<ListNode>> = None;
        for &idx in order.iter().rev() {
            let mut node = std::mem::replace(&mut nodes[idx], Box::new(ListNode::new(0)));
            node.next = result;
            result = Some(node);
        }
        *head = result;
    }
}
```
