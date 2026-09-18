---
author: JZ
pubDatetime: 2026-09-18T06:00:00Z
modDatetime: 2026-09-18T06:00:00Z
title: LeetCode 2130 Maximum Twin Sum of a Linked List
featured: true
tags:
  - a-linked-list
  - a-two-pointers
  - a-stack
description:
  "Solutions for LeetCode 2130, medium, tags: linked list, two pointers, stack."
---

## Table of contents

## Description

Question Links: [LeetCode 2130](https://leetcode.com/problems/maximum-twin-sum-of-a-linked-list/description/)

In a linked list of size `n`, where `n` is **even**, the `i`th node (0-indexed) of the linked list is known as the **twin** of the `(n-1-i)`th node, if `0 <= i <= (n / 2) - 1`.

For example, if `n = 4`, then node `0` is the twin of node `3`, and node `1` is the twin of node `2`. These are the only nodes with twins for `n = 4`.

The **twin sum** is defined as the sum of a node and its twin.

Given the `head` of a linked list with even length, return the **maximum twin sum** of the linked list.

```
Example 1:

Input: head = [5,4,2,1]
Output: 6
Explanation:
Nodes 0 and 1 are the twins of nodes 3 and 2, respectively.
Twin sum of node 0 = 5 + 1 = 6.
Twin sum of node 1 = 4 + 2 = 6.
The maximum twin sum is 6.

Example 2:

Input: head = [4,2,2,3]
Output: 7
Explanation:
Twin sum of node 0 = 4 + 3 = 7.
Twin sum of node 1 = 2 + 2 = 4.
The maximum twin sum is 7.

Example 3:

Input: head = [1,100000]
Output: 100001
Explanation:
There is only one node with a twin. Twin sum = 1 + 100000 = 100001.

Constraints:

The number of nodes in the list is an even integer in the range [2, 10^5].
1 <= Node.val <= 10^5
```

## Solution 1: Reverse Second Half

### Idea

The core observation is that twin `i` pairs with twin `n-1-i` — the first half mirrors the second half. If we reverse the second half in place, twins become aligned: the head of the first half pairs with the head of the reversed second half.

```
Original:      5 -> 4 -> 2 -> 1
                         ^ middle

First half:    5 -> 4
Second (rev):  1 -> 2

Pair up:       5+1=6, 4+2=6  =>  max = 6
```

Three passes over the list:

1. **Find middle** — slow/fast pointers; when fast reaches the end, slow is at the start of the second half.
2. **Reverse** second half in place.
3. **Pair up** — walk both halves simultaneously, track the max sum.

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
// O(n) time, O(1) space. Reverse second half approach.
public static int pairSum(ListNode head) {
    // O(n/2) find middle
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
    }
    // O(n/2) reverse second half
    ListNode prev = null, cur = slow;
    while (cur != null) {
        ListNode next = cur.next;
        cur.next = prev;
        prev = cur;
        cur = next;
    }
    // O(n/2) pair up and find max
    int max = 0;
    ListNode left = head, right = prev;
    while (right != null) {
        max = Math.max(max, left.val + right.val);
        left = left.next;
        right = right.next;
    }
    return max;
}
```

#### Python

```python []
def pair_sum(self, head: Optional[ListNode]) -> int:
    slow, fast = head, head
    while fast and fast.next:  # O(n/2) find middle
        slow = slow.next
        fast = fast.next.next

    prev = None
    while slow:  # O(n/2) reverse second half
        nxt = slow.next
        slow.next = prev
        prev = slow
        slow = nxt

    max_sum = 0
    left, right = head, prev
    while right:  # O(n/2) pair up twins
        max_sum = max(max_sum, left.val + right.val)
        left = left.next
        right = right.next
    return max_sum
```

#### C++

```cpp []
/// Reverse second half approach. Time O(n), Space O(1).
int pairSum(ListNode* head) {
    // Find middle with slow/fast pointers. O(n/2)
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
    }
    // Reverse second half starting at slow. O(n/2)
    ListNode* prev = nullptr;
    while (slow) {
        ListNode* nx = slow->next;
        slow->next = prev;
        prev = slow;
        slow = nx;
    }
    // Pair up from head and reversed tail, track max. O(n/2)
    int maxSum = 0;
    ListNode* left = head;
    ListNode* right = prev;
    while (right) {
        maxSum = max(maxSum, left->val + right->val);
        left = left->next;
        right = right->next;
    }
    return maxSum;
}
```

#### Rust

```rust []
/// O(n) time, O(n) space. Collect into vec, two-pointer scan from both ends.
pub fn pair_sum(head: Option<Box<ListNode>>) -> i32 {
    let mut vals = Vec::new();
    let mut cur = &head;
    while let Some(node) = cur {
        // O(n) — traverse once to collect
        vals.push(node.val);
        cur = &node.next;
    }
    let n = vals.len();
    let mut max_sum = 0;
    for i in 0..n / 2 {
        // O(n/2) — twin pairs: i and n-1-i
        max_sum = max_sum.max(vals[i] + vals[n - 1 - i]);
    }
    max_sum
}
```

> **Note:** Rust's ownership model makes in-place reversal of `Option<Box<ListNode>>` cumbersome. The idiomatic approach collects values into a `Vec` and uses two-pointer indexing — same $O(n)$ time, $O(n)$ space.

## Solution 2: Stack

### Idea

Instead of reversing the list, we use a stack to "remember" the first half in reverse order. As we advance the slow pointer through the first half, we push each value onto the stack. Once we reach the second half, we pop from the stack — the popped value is the twin of the current node.

```
List:    5 -> 4 -> 2 -> 1

Push phase (first half):
  stack: [5, 4]    slow at node 2

Pop phase (second half):
  pop 4 + node(2) = 6
  pop 5 + node(1) = 6    =>  max = 6
```

Complexity: Time $O(n)$, Space $O(n)$ — the stack stores $n/2$ elements.

#### Java

```java []
// O(n) time, O(n) space. Stack approach.
public static int pairSumStack(ListNode head) {
    // O(n/2) push first half onto stack
    Deque<Integer> stack = new ArrayDeque<>();
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        stack.push(slow.val);
        slow = slow.next;
        fast = fast.next.next;
    }
    // O(n/2) pop and pair with second half
    int max = 0;
    while (slow != null) {
        max = Math.max(max, stack.pop() + slow.val);
        slow = slow.next;
    }
    return max;
}
```

#### Python

```python []
def pair_sum_stack(self, head: Optional[ListNode]) -> int:
    slow, fast = head, head
    stack = []
    while fast and fast.next:  # O(n/2)
        stack.append(slow.val)  # O(n/2) space for stack
        slow = slow.next
        fast = fast.next.next

    max_sum = 0
    while slow:  # O(n/2) pair with popped values
        max_sum = max(max_sum, stack.pop() + slow.val)
        slow = slow.next
    return max_sum
```

#### C++

```cpp []
/// Stack approach. Time O(n), Space O(n).
int pairSumStack(ListNode* head) {
    // Push first half onto stack. O(n/2)
    stack<int> st;
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        st.push(slow->val);
        slow = slow->next;
        fast = fast->next->next;
    }
    // Pop while traversing second half. O(n/2)
    int maxSum = 0;
    while (slow) {
        maxSum = max(maxSum, st.top() + slow->val);
        st.pop();
        slow = slow->next;
    }
    return maxSum;
}
```

#### Rust

```rust []
/// O(n) time, O(n) space. Push first half onto stack, pop while scanning second half.
pub fn pair_sum_stack(head: Option<Box<ListNode>>) -> i32 {
    let mut len = 0;
    let mut cur = &head;
    while let Some(node) = cur { // O(n) count length
        len += 1;
        cur = &node.next;
    }

    let mut stack: Vec<i32> = Vec::with_capacity(len / 2); // O(n/2) space
    let mut cur = &head;
    for _ in 0..len / 2 { // O(n/2) — push first half
        if let Some(node) = cur {
            stack.push(node.val);
            cur = &node.next;
        }
    }

    let mut max_sum = 0;
    while let Some(node) = cur { // O(n/2) — pop matches twin in reverse order
        if let Some(twin_val) = stack.pop() {
            max_sum = max_sum.max(node.val + twin_val);
        }
        cur = &node.next;
    }
    max_sum
}
```
