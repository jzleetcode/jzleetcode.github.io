---
author: JZ
pubDatetime: 2026-09-12T10:07:00Z
modDatetime: 2026-09-12T10:07:00Z
title: LeetCode 234 Palindrome Linked List
featured: true
tags:
  - a-linkedlist
  - a-two-pointer
  - a-stack
description:
  "Solutions for LeetCode 234, easy, tags: linked list, two pointers, stack, recursion."
---

## Table of contents

## Description

Question Links: [LeetCode 234](https://leetcode.com/problems/palindrome-linked-list/description/)

Given the `head` of a singly linked list, return `true` if it is a palindrome or `false` otherwise.

Example 1:

```
Input: head = [1,2,2,1]
Output: true
```

Example 2:

```
Input: head = [1,2]
Output: false
```

**Constraints:**

- The number of nodes in the list is in the range `[1, 10^5]`.
- `0 <= Node.val <= 9`

**Follow up:** Could you do it in `O(n)` time and `O(1)` space?

## Idea1

Use fast and slow pointers. While advancing, reverse the first half of the list in-place. When fast reaches the end, slow is at the middle. Then compare the reversed first half with the second half. Finally, restore the first half to leave the list unmodified.

For an odd-length list, the middle node is skipped during comparison.

```
Original:    1 -> 2 -> 3 -> 2 -> 1

Phase 1 — reverse first half while finding midpoint:
  rev:  1 <- 2    slow: 3 -> 2 -> 1    fast: 1 (at end)
  Odd length detected (fast != null), so skip middle node.
  tail starts at slow.next = 2 -> 1

Phase 2 — compare rev with tail:
  rev: 2 -> 1,  tail: 2 -> 1   ✓ match

Phase 3 — restore by reversing rev back:
  1 -> 2 -> 3 -> 2 -> 1  (original order restored)
```

Complexity: Time $O(n)$, Space $O(1)$.

### Java

```java []
public static boolean isPalindrome(ListNode head) {
    ListNode rev = null, slow = head, fast = head;
    while (fast != null && fast.next != null) { // O(n/2)
        fast = fast.next.next;
        ListNode temp = rev;
        rev = slow;
        slow = slow.next;
        rev.next = temp;
    }
    ListNode tail = fast == null ? slow : slow.next; // odd: skip middle
    while (rev != null) { // O(n/2)
        if (tail.val != rev.val) return false;
        tail = tail.next;
        ListNode temp = slow;
        slow = rev;
        rev = rev.next;
        slow.next = temp;
    }
    return true;
}
```

### Python

```python []
class Solution:
    """O(n) time, O(1) space. Reverse first half in-place, compare, restore."""

    def isPalindrome(self, head: Optional[ListNode]) -> bool:
        rev, slow, fast = None, head, head
        while fast and fast.next:  # O(n/2)
            fast = fast.next.next
            temp = rev
            rev = slow
            slow = slow.next
            rev.next = temp
        tail = slow.next if fast else slow  # odd: skip middle
        while rev:  # O(n/2)
            if rev.val != tail.val: return False
            tail = tail.next
            temp = rev
            rev = rev.next
            temp.next = slow
            slow = temp
        return True
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(1) space.
    bool isPalindrome(ListNode* head) {
        ListNode* rev = nullptr;
        ListNode* slow = head;
        ListNode* fast = head;
        while (fast && fast->next) { // O(n/2)
            fast = fast->next->next;
            ListNode* temp = rev;
            rev = slow;
            slow = slow->next;
            rev->next = temp;
        }
        ListNode* tail = fast ? slow->next : slow; // odd: skip middle
        while (rev) { // O(n/2)
            if (tail->val != rev->val) return false;
            tail = tail->next;
            ListNode* temp = slow;
            slow = rev;
            rev = rev->next;
            slow->next = temp;
        }
        return true;
    }
};
```

### Rust

Rust's ownership model makes in-place reversal of a singly linked list verbose. Instead, we collect values into a Vec and use two pointers — still $O(n)$ time but $O(n)$ space.

```rust []
impl Solution {
    pub fn is_palindrome(head: Option<Box<ListNode>>) -> bool {
        let mut vals = Vec::new();
        let mut cur = &head;
        while let Some(node) = cur { // O(n)
            vals.push(node.val);
            cur = &node.next;
        }
        let (mut l, mut r) = (0, vals.len());
        while l < r { // O(n/2)
            r -= 1;
            if vals[l] != vals[r] { return false; }
            l += 1;
        }
        true
    }
}
```

## Idea2

Use fast and slow pointers to find the midpoint while pushing the first half's values onto a stack. After the midpoint, pop from the stack and compare with each node in the second half. For odd-length lists, skip the middle node.

This approach does not modify the original list.

Complexity: Time $O(n)$, Space $O(n)$.

### Java

```java []
public static boolean isPalindromeStack(ListNode head) {
    ListNode slow = head, fast = head;
    Deque<Integer> stack = new ArrayDeque<>();
    while (fast != null && fast.next != null) { // O(n/2)
        stack.push(slow.val);
        slow = slow.next;
        fast = fast.next.next;
    }
    if (fast != null) slow = slow.next; // odd: skip middle
    while (slow != null) { // O(n/2)
        if (!stack.pop().equals(slow.val)) return false;
        slow = slow.next;
    }
    return true;
}
```

### Python

```python []
class Solution2:
    """O(n) time, O(n) space. Collect first half with stack, compare with second half."""

    def isPalindrome(self, head: Optional[ListNode]) -> bool:
        slow, fast = head, head
        stack = []
        while fast and fast.next:  # O(n/2)
            stack.append(slow.val)
            slow = slow.next
            fast = fast.next.next
        if fast:  # odd number of nodes, skip middle
            slow = slow.next
        while slow:  # O(n/2)
            if stack.pop() != slow.val:
                return False
            slow = slow.next
        return True
```

### C++

```cpp []
class Solution {
public:
    // O(n) time, O(n) space.
    bool isPalindromeStack(ListNode* head) {
        ListNode* slow = head;
        ListNode* fast = head;
        stack<int> stk;
        while (fast && fast->next) { // O(n/2)
            stk.push(slow->val);
            slow = slow->next;
            fast = fast->next->next;
        }
        if (fast) slow = slow->next; // odd: skip middle
        while (slow) { // O(n/2)
            if (stk.top() != slow->val) return false;
            stk.pop();
            slow = slow->next;
        }
        return true;
    }
};
```

### Rust

```rust []
impl Solution {
    pub fn is_palindrome_stack(head: Option<Box<ListNode>>) -> bool {
        let vals: Vec<i32> = {
            let mut v = Vec::new();
            let mut cur = &head;
            while let Some(node) = cur {
                v.push(node.val);
                cur = &node.next;
            }
            v
        };
        let n = vals.len();
        let mut stack: Vec<i32> = vals[..n / 2].to_vec(); // O(n/2)
        let start = if n % 2 == 0 { n / 2 } else { n / 2 + 1 }; // odd: skip middle
        for &v in &vals[start..] { // O(n/2)
            if stack.pop() != Some(v) { return false; }
        }
        true
    }
}
```
