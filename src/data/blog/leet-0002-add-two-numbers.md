---
author: JZ
pubDatetime: 2026-08-19T10:36:00Z
modDatetime: 2026-08-19T10:36:00Z
title: LeetCode 2 Add Two Numbers
featured: true
tags:
  - a-linked-list
  - a-math
  - a-recursion
description:
  "Solutions for LeetCode 2, medium, tags: linked list, math, recursion."
---

## Table of contents

## Description

Question link: [LeetCode 2](https://leetcode.com/problems/add-two-numbers/description/)

You are given two **non-empty** linked lists representing two non-negative integers. The digits are stored in **reverse order**, and each of their nodes contains a single digit. Add the two numbers and return the sum as a linked list.

You may assume the two numbers do not contain any leading zero, except the number 0 itself.

**Example 1:**

```
Input: l1 = [2,4,3], l2 = [5,6,4]
Output: [7,0,8]
Explanation: 342 + 465 = 807.
```

**Example 2:**

```
Input: l1 = [0], l2 = [0]
Output: [0]
```

**Example 3:**

```
Input: l1 = [9,9,9,9,9,9,9], l2 = [9,9,9,9]
Output: [8,9,9,9,0,0,0,1]
```

**Constraints:**

- The number of nodes in each linked list is in the range `[1, 100]`.
- `0 <= Node.val <= 9`
- It is guaranteed that the list represents a number that does not have leading zeros.

## Idea1 Iterative

Use a dummy head and iterate both lists simultaneously, tracking carry. At each step, sum the two node values plus carry, create a new node with `sum % 10`, and advance.

```
  l1:  2 -> 4 -> 3
  l2:  5 -> 6 -> 4
       |    |    |
carry: 0    0    0
 sum:  7    0    8    (7+0+0=7, 4+6+0=10, 3+4+1=8)
 res:  7 -> 0 -> 8
```

Complexity: Time $O(\max(m,n))$ — iterate through both lists once. Space $O(\max(m,n))$ — result list.

## Idea2 Recursive

Same logic expressed recursively — base case is when both lists are null and carry is zero.

Complexity: Time $O(\max(m,n))$, Space $O(\max(m,n))$ including call stack.

### Python

```python []
class Solution:
    def add_two_numbers(self, l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
        """Iterative. Time O(max(m,n)), Space O(max(m,n))."""
        dummy = ListNode()
        cur = dummy
        carry = 0
        while l1 or l2 or carry:  # O(max(m,n)) iterate both lists
            total = carry
            if l1:
                total += l1.val
                l1 = l1.next
            if l2:
                total += l2.val
                l2 = l2.next
            carry = total // 10
            cur.next = ListNode(total % 10)
            cur = cur.next
        return dummy.next

    def add_two_numbers_recursive(
        self, l1: Optional[ListNode], l2: Optional[ListNode], carry: int = 0
    ) -> Optional[ListNode]:
        """Recursive. Time O(max(m,n)), Space O(max(m,n))."""
        if not l1 and not l2 and not carry:
            return None
        total = carry
        if l1:
            total += l1.val
            l1 = l1.next
        if l2:
            total += l2.val
            l2 = l2.next
        node = ListNode(total % 10)
        node.next = self.add_two_numbers_recursive(l1, l2, total // 10)
        return node
```

### Java

```java []
// Iterative. Time O(max(m,n)), Space O(1) extra.
public class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        ListNode head = new ListNode(-1);
        ListNode cur = head;
        int carry = 0;
        while (l1 != null || l2 != null || carry != 0) {
            int sum = carry;
            if (l1 != null) { sum += l1.val; l1 = l1.next; }
            if (l2 != null) { sum += l2.val; l2 = l2.next; }
            cur.next = new ListNode(sum % 10);
            carry = sum / 10;
            cur = cur.next;
        }
        return head.next;
    }
}
```

### C++

```cpp []
class Solution {
public:
    // Iterative. Time O(max(m,n)), Space O(1) extra.
    ListNode* addTwoNumbers(ListNode* l1, ListNode* l2) {
        ListNode dummy(0);
        ListNode* cur = &dummy;
        int carry = 0;
        while (l1 || l2 || carry) {
            int sum = carry;
            if (l1) { sum += l1->val; l1 = l1->next; }
            if (l2) { sum += l2->val; l2 = l2->next; }
            carry = sum / 10;
            cur->next = new ListNode(sum % 10);
            cur = cur->next;
        }
        return dummy.next;
    }

    // Recursive. Time O(max(m,n)), Space O(max(m,n)) stack.
    ListNode* addTwoNumbersRecursive(ListNode* l1, ListNode* l2, int carry = 0) {
        if (!l1 && !l2 && !carry) return nullptr;
        int sum = carry;
        if (l1) sum += l1->val;
        if (l2) sum += l2->val;
        ListNode* node = new ListNode(sum % 10);
        node->next = addTwoNumbersRecursive(
            l1 ? l1->next : nullptr,
            l2 ? l2->next : nullptr,
            sum / 10
        );
        return node;
    }
};
```

### Rust

```rust []
impl Solution {
    /// Iterative. Time O(max(m,n)), Space O(max(m,n)).
    pub fn add_two_numbers(
        l1: Option<Box<ListNode>>, l2: Option<Box<ListNode>>,
    ) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode::new(0));
        let mut tail = &mut dummy;
        let (mut p1, mut p2, mut carry) = (l1, l2, 0);
        while p1.is_some() || p2.is_some() || carry != 0 {
            let v1 = p1.as_ref().map_or(0, |n| n.val);
            let v2 = p2.as_ref().map_or(0, |n| n.val);
            let sum = v1 + v2 + carry;
            carry = sum / 10;
            tail.next = Some(Box::new(ListNode::new(sum % 10)));
            tail = tail.next.as_mut().unwrap();
            p1 = p1.and_then(|n| n.next);
            p2 = p2.and_then(|n| n.next);
        }
        dummy.next
    }

    /// Recursive. Time O(max(m,n)), Space O(max(m,n)).
    pub fn add_two_numbers_recursive(
        l1: Option<Box<ListNode>>, l2: Option<Box<ListNode>>,
    ) -> Option<Box<ListNode>> {
        fn recurse(l1: Option<Box<ListNode>>, l2: Option<Box<ListNode>>, carry: i32) -> Option<Box<ListNode>> {
            if l1.is_none() && l2.is_none() && carry == 0 { return None; }
            let v1 = l1.as_ref().map_or(0, |n| n.val);
            let v2 = l2.as_ref().map_or(0, |n| n.val);
            let sum = v1 + v2 + carry;
            let mut node = ListNode::new(sum % 10);
            node.next = recurse(l1.and_then(|n| n.next), l2.and_then(|n| n.next), sum / 10);
            Some(Box::new(node))
        }
        recurse(l1, l2, 0)
    }
}
```
