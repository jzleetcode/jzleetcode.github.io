---
author: JZ
pubDatetime: 2026-08-23T10:00:00Z
modDatetime: 2026-08-23T10:00:00Z
title: LeetCode 142 Linked List Cycle II
featured: false
tags:
  - a-linked-list
  - a-two-pointers
  - a-hash-table
description:
  "Solutions for LeetCode 142, medium, tags: hash table, linked list, two pointers."
---

## Table of contents

## Description

Question Links: [LeetCode 142](https://leetcode.com/problems/linked-list-cycle-ii/description/)

Given the `head` of a linked list, return the node where the cycle begins. If there is no cycle, return `null`.

There is a cycle in a linked list if there is some node in the list that can be reached again by continuously following the `next` pointer. Internally, `pos` is used to denote the index of the node that tail's next pointer is connected to (0-indexed). It is `-1` if there is no cycle. **Note that `pos` is not passed as a parameter.**

Do not modify the linked list.

```
Example 1:

Input: head = [3,2,0,-4], pos = 1
Output: tail connects to node index 1
Explanation: There is a cycle in the linked list, where tail connects to the second node.

Example 2:

Input: head = [1,2], pos = 0
Output: tail connects to node index 0
Explanation: There is a cycle in the linked list, where tail connects to the first node.

Example 3:

Input: head = [1], pos = -1
Output: no cycle
Explanation: There is no cycle in the linked list.

Constraints:

The number of the nodes in the list is in the range [0, 10^4].
-10^5 <= Node.val <= 10^5
pos is -1 or a valid index in the linked-list.
```

Follow up: Can you solve it using `O(1)` (i.e. constant) memory?

## Solution 1: Floyd's Tortoise and Hare

### Idea

Use two pointers: `slow` moves one step at a time, `fast` moves two steps. If a cycle exists, they will eventually meet inside the cycle. Once they meet, reset `slow` to `head` and advance both pointers one step at a time — they will meet at the cycle entry node.

**Why does this work?** Let the distance from `head` to cycle start be $a$, and the distance from cycle start to the meeting point (inside the cycle) be $b$. The cycle length is $c$. When slow and fast meet:

- slow traveled: $a + b$
- fast traveled: $a + b + k \cdot c$ (for some integer $k \geq 1$)

Since fast travels twice as far as slow: $2(a + b) = a + b + k \cdot c$, so $a + b = k \cdot c$, meaning $a = k \cdot c - b$.

After resetting slow to head, both advance one step. After $a$ steps, slow is at the cycle start. Fast has traveled $a$ more steps from the meeting point (which is $b$ past cycle start), so fast is at position $b + a = b + k \cdot c - b = k \cdot c$ from cycle start — i.e., also at the cycle start.

```
head                 cycle start
  |                      |
  v                      v
  1 --> 2 --> 3 --> 4 --> 5 --> 6 --> 7
                          ^              |
                          |______________|
                                (cycle)

  a = 4 (head to cycle start)
  b = distance from cycle start to meeting point
  c = cycle length

  After meeting: reset slow to head
  Both advance 1 step -> meet at node 5 (cycle start)
```

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
public static ListNode detectCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) { // O(n)
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) {
            slow = head;
            while (slow != fast) { // O(n) find cycle start
                slow = slow.next;
                fast = fast.next;
            }
            return slow;
        }
    }
    return null;
}
```

#### Python

```python []
def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:
    """Floyd's tortoise and hare algorithm.
    Time:  O(n) — at most 2 passes through the list
    Space: O(1) — two pointers only
    """
    slow = fast = head
    while fast and fast.next:  # O(n)
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            slow = head
            while slow != fast:  # O(n) find cycle start
                slow = slow.next
                fast = fast.next
            return slow
    return None
```

#### C++

```cpp []
/// Floyd's tortoise and hare. O(n) time, O(1) space.
ListNode* detectCycle(ListNode* head) {
    ListNode *slow = head, *fast = head;
    while (fast && fast->next) { // O(n)
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) {
            slow = head;
            while (slow != fast) { // O(n) find cycle start
                slow = slow->next;
                fast = fast->next;
            }
            return slow;
        }
    }
    return nullptr;
}
```

#### Rust

```rust []
/// Floyd's tortoise and hare. O(n) time, O(1) space.
pub fn detect_cycle(head: *mut CycleListNode) -> *mut CycleListNode {
    unsafe {
        let (mut slow, mut fast) = (head, head);
        loop {
            if fast.is_null() || (*fast).next.is_null() {
                return std::ptr::null_mut();
            }
            slow = (*slow).next; // O(n)
            fast = (*(*fast).next).next;
            if slow == fast {
                break;
            }
        }
        slow = head;
        while slow != fast { // O(n) find cycle start
            slow = (*slow).next;
            fast = (*fast).next;
        }
        slow
    }
}
```

## Solution 2: HashSet

### Idea

Traverse the list while storing visited node references in a hash set. The first node we encounter that is already in the set is the cycle entry. If we reach `null`, there is no cycle.

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
// HashSet approach. O(n) time, O(n) space.
// Uses IdentityHashMap to avoid recursive hashCode on cyclic ListNode.
public static ListNode detectCycleHashSet(ListNode head) {
    Set<ListNode> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    ListNode cur = head;
    while (cur != null) { // O(n)
        if (!seen.add(cur)) return cur; // O(1) amortized
        cur = cur.next;
    }
    return null;
}
```

#### Python

```python []
def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:
    """HashSet approach.
    Time:  O(n) — single pass
    Space: O(n) — store visited nodes
    """
    seen = set()
    cur = head
    while cur:  # O(n)
        if cur in seen:  # O(1) amortized
            return cur
        seen.add(cur)
        cur = cur.next
    return None
```

#### C++

```cpp []
/// HashSet approach. O(n) time, O(n) space.
ListNode* detectCycleHash(ListNode* head) {
    unordered_set<ListNode*> seen;
    ListNode* cur = head;
    while (cur) { // O(n)
        if (seen.count(cur)) return cur; // O(1) amortized
        seen.insert(cur);
        cur = cur->next;
    }
    return nullptr;
}
```

#### Rust

```rust []
/// HashSet approach. O(n) time, O(n) space.
pub fn detect_cycle_hash(head: *mut CycleListNode) -> *mut CycleListNode {
    unsafe {
        let mut seen = std::collections::HashSet::new();
        let mut cur = head;
        while !cur.is_null() { // O(n)
            if !seen.insert(cur) { // O(1) amortized
                return cur;
            }
            cur = (*cur).next;
        }
        std::ptr::null_mut()
    }
}
```
