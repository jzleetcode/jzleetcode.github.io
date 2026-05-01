---
author: JZ
pubDatetime: 2025-01-30T06:23:00Z
modDatetime: 2025-01-30T06:23:00Z
title: LeetCode 206 LintCode 35 Reverse Linked List
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

### Java

```java []
class Solution1 {
    // O(n) time, O(1) space.
    public ListNode reverseListIterative(ListNode head) {
        ListNode res = null;
        while (head != null) {
            ListNode next = head.next; // save successor
            head.next = res;           // reverse pointer
            res = head;                // advance res
            head = next;               // advance head
        }
        return res;
    }
}
```

### Python

```python []
class Solution1:
    """0 ms, 18.58 mb"""

    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        res = None
        while head:                    # O(n)
            tmp = head.next
            head.next = res
            res = head
            head = tmp                 # head reaches None at the end
        return res
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(1) space.
    ListNode* reverseList(ListNode* head) {
        ListNode* res = nullptr;
        while (head) {
            ListNode* next = head->next;
            head->next = res;
            res = head;
            head = next;
        }
        return res;
    }
};
```

### Rust

```rust []
// O(n) time, O(1) extra. We move ownership of each node from `cur` into
// the head of `res`, reversing pointers along the way.
impl Solution {
    pub fn reverse_list(head: Option<Box<ListNode>>) -> Option<Box<ListNode>> {
        let mut res: Option<Box<ListNode>> = None;
        let mut cur = head;
        while let Some(mut node) = cur {
            cur = node.next.take();
            node.next = res;
            res = Some(node);
        }
        res
    }
}
```

## Idea2

We could also solve this question recursively. Please check the image below for the steps.

![reverse.linkedlist.recursive](https://drive.google.com/thumbnail?id=1rvLDT4XG-Tjz_IyOeCtGI89OlLFQBeUP&sz=w1000)

Complexity: Time $O(n)$, Space $O(n)$.

The space is linear $O(n)$ considering the stack space used for the recursive calls. The function cannot be made tail recursive.

### Java

```java []
class Solution2 {
    // O(n) time, O(n) recursion stack.
    public ListNode reverseListRecursive(ListNode head) {
        if (head == null || head.next == null) return head;
        ListNode rev = reverseListRecursive(head.next); // reverse rest first
        head.next.next = head;                          // make next point back at head
        head.next = null;                               // break old forward link
        return rev;
    }
}
```

### Python

```python []
class Solution2:
    """0 ms, 18.77 mb"""

    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        if head is None or head.next is None:
            return head
        res = self.reverseList(head.next)  # reverse rest, returns new head
        head.next.next = head              # reverse head <-> head.next
        head.next = None                   # break forward link
        return res
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(n) recursion stack.
    ListNode* reverseList(ListNode* head) {
        if (!head || !head->next) return head;
        ListNode* rev = reverseList(head->next);
        head->next->next = head;
        head->next = nullptr;
        return rev;
    }
};
```

### Rust

In Rust the classic trick `head.next.next = head` is awkward because of single
ownership. Instead, after reversing the suffix we walk to its tail (now the
original `head.next` node) and append `head` there. This keeps Time $O(n)$,
though the walk-to-tail step on each frame technically makes the total work
$O(n^2)$; an iterative reverse like Idea1 is preferred in idiomatic Rust.

```rust []
impl Solution {
    pub fn reverse_list_recursive(head: Option<Box<ListNode>>) -> Option<Box<ListNode>> {
        match head {
            None => None,
            Some(mut node) => match node.next.take() {
                None => Some(node),
                Some(next) => {
                    let mut new_head = Self::reverse_list_recursive(Some(next)).unwrap();
                    let mut tail = &mut new_head;
                    while tail.next.is_some() { tail = tail.next.as_mut().unwrap(); }
                    tail.next = Some(node);
                    Some(new_head)
                }
            },
        }
    }
}
```
