---
author: JZ
pubDatetime: 2025-06-21T06:23:00Z
modDatetime: 2025-06-21T06:23:00Z
title: LeetCode 23 LintCode 104 Merge K Sorted Lists
tags:
  - a-heap
  - a-divide-and-conquer
  - a-linked-list
  - a-merge-sort
description:
  "Solutions for LeetCode 23 and LintCode 104, hard, tags: heap, divide and conquer, linked list, merge sort."
---

## Table of contents

## Description

Question links: [LeetCode 23](https://leetcode.com/problems/merge-k-sorted-lists/description/), [LintCode 104](https://www.lintcode.com/problem/104/)

You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order.

_Merge all the linked-lists into one sorted linked-list and return it._

```
Example 1:

Input: lists = [[1,4,5],[1,3,4],[2,6]]
Output: [1,1,2,3,4,4,5,6]
Explanation: The linked-lists are:
[
  1->4->5,
  1->3->4,
  2->6
]
merging them into one sorted list:
1->1->2->3->4->4->5->6
Example 2:

Input: lists = []
Output: []
Example 3:

Input: lists = [[]]
Output: []
```

**Constraints:**

-   `k == lists.length`
-   `0 <= k <= 10^4`
-   `0 <= lists[i].length <= 500`
-   `-10^4 <= lists[i][j] <= 10^4`
-   `lists[i]` is sorted in **ascending order**.
-   The sum of `lists[i].length` will not exceed `10^4`.

## Idea1

We could use a min heap to maintain the nodes that we are comparing.

1. We can get the minimum node from the min heap in $O(\log k)$ time.
2. We remove the minimum node, add it to the result linked list, and put the next of the removed node into the heap.
3. We repeat until the heap is empty.

Complexity: Time $O(n \log k)$, Space $O(k)$.

### Java

```java []
class Solution {
    public ListNode mergeKListsHeap(ListNode[] lists) {
        PriorityQueue<ListNode> pq = new PriorityQueue<>(Comparator.comparingInt(n -> n.val));
        ListNode dummy = new ListNode(0), cur = dummy;
        for (ListNode n : lists) if (n != null) pq.add(n);
        while (!pq.isEmpty()) {
            ListNode n = pq.remove();
            cur.next = n;
            n = n.next;
            if (n != null) pq.add(n);
            cur = cur.next;
        }
        return dummy.next;
    }
}
```

### Python

Typically, when using heap in Python, we push the `(priority, task)` tuple.
When the priority is equal, heap compares task.
Because the `task` in this question is `ListNode` and is not comparable,
we can either implement `__eq__` and `__lt__` to allow comparison or use another field to break the tie.
In the implementation below, I used `id()` of the node to break the tie.

See this python [doc](https://docs.python.org/3/library/heapq.html#priority-queue-implementation-notes) for more.

```python []
class Solution:
    """7 ms, 20.4 mb"""

    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        pq, dummy = list(), ListNode()
        cur = dummy
        for l in lists:
            if l:
                heappush(pq, (l.val, id(l), l))
        while pq:
            _, _, n = heappop(pq)
            cur.next = n
            n = n.next
            if n:
                heappush(pq, (n.val, id(n), n))
            cur = cur.next
        return dummy.next
```

### C++

```cpp []
class Solution {
public:
    // Time O(N log k), Space O(k).
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        auto cmp = [](ListNode* a, ListNode* b) { return a->val > b->val; }; // min-heap
        priority_queue<ListNode*, vector<ListNode*>, decltype(cmp)> pq(cmp);
        for (ListNode* n : lists) if (n) pq.push(n);
        ListNode dummy(0);
        ListNode* cur = &dummy;
        while (!pq.empty()) {
            ListNode* n = pq.top(); pq.pop();
            cur->next = n;
            cur = cur->next;
            if (n->next) pq.push(n->next);
        }
        return dummy.next;
    }
};
```

### Rust

```rust []
use std::cmp::Reverse;
use std::collections::BinaryHeap;

// Min-heap via Reverse on a wrapper that orders by node val.
// Time O(N log k), Space O(k).
struct Wrapped(Box<ListNode>);
// (PartialEq/Eq/PartialOrd/Ord impls compare self.0.val.)

impl Solution {
    pub fn merge_k_lists(lists: Vec<Option<Box<ListNode>>>) -> Option<Box<ListNode>> {
        let mut heap: BinaryHeap<Reverse<Wrapped>> = BinaryHeap::new();
        for list in lists {
            if let Some(node) = list { heap.push(Reverse(Wrapped(node))); }
        }
        let mut dummy = Box::new(ListNode::new(0));
        let mut tail = &mut dummy;
        while let Some(Reverse(Wrapped(mut node))) = heap.pop() {
            let nxt = node.next.take();           // detach successor
            tail.next = Some(node);
            tail = tail.next.as_mut().unwrap();
            if let Some(n) = nxt { heap.push(Reverse(Wrapped(n))); }
        }
        dummy.next
    }
}
```

## Idea2

We can also merge pairwise bottom-up: combine adjacent pairs of lists, halving
the count of lists each round. After $\log k$ rounds we have one list left.

Each list element is touched in $O(\log k)$ merges (once per round).

Complexity: Time $O(N \log k)$, Space $O(1)$ extra (we mutate the input
slots and reuse list nodes).

### Java

```java []
class Solution {
    // O(N log k) time, O(1) extra space (mutates input array slots).
    public ListNode mergeKListsBU(ListNode[] lists) {
        if (lists.length == 0) return null;
        for (int interval = 1; interval < lists.length; interval *= 2) {
            for (int i = 0; i + interval < lists.length; i += 2 * interval) {
                lists[i] = mergeTwo(lists[i], lists[i + interval]);
            }
        }
        return lists[0];
    }

    private ListNode mergeTwo(ListNode a, ListNode b) {
        ListNode dummy = new ListNode(0), cur = dummy;
        while (a != null && b != null) {
            if (a.val < b.val) { cur.next = a; a = a.next; }
            else               { cur.next = b; b = b.next; }
            cur = cur.next;
        }
        cur.next = a == null ? b : a;
        return dummy.next;
    }
}
```

### Python

```python []
class Solution:
    def mergeKLists(self, lists):
        if not lists:
            return None
        interval = 1
        n = len(lists)
        while interval < n:                     # log k rounds
            for i in range(0, n - interval, interval * 2):
                lists[i] = self._merge_two(lists[i], lists[i + interval])
            interval *= 2
        return lists[0]

    def _merge_two(self, a, b):
        dummy = ListNode()
        cur = dummy
        while a and b:
            if a.val < b.val:
                cur.next = a; a = a.next
            else:
                cur.next = b; b = b.next
            cur = cur.next
        cur.next = a if a else b
        return dummy.next
```

### C++

```cpp []
class Solution {
public:
    // Time O(N log k), Space O(1) extra.
    ListNode* mergeKLists(vector<ListNode*>& lists) {
        if (lists.empty()) return nullptr;
        int n = (int)lists.size();
        for (int interval = 1; interval < n; interval *= 2) {
            for (int i = 0; i + interval < n; i += 2 * interval) {
                lists[i] = mergeTwo(lists[i], lists[i + interval]);
            }
        }
        return lists[0];
    }

private:
    ListNode* mergeTwo(ListNode* a, ListNode* b) {
        ListNode dummy(0);
        ListNode* cur = &dummy;
        while (a && b) {
            if (a->val < b->val) { cur->next = a; a = a->next; }
            else                 { cur->next = b; b = b->next; }
            cur = cur->next;
        }
        cur->next = a ? a : b;
        return dummy.next;
    }
};
```

### Rust

```rust []
// Time O(N log k), Space O(1) extra.
impl Solution {
    pub fn merge_k_lists(lists: Vec<Option<Box<ListNode>>>) -> Option<Box<ListNode>> {
        if lists.is_empty() { return None; }
        let mut buf = lists;
        while buf.len() > 1 {
            let mut next_round = Vec::with_capacity(buf.len() / 2 + 1);
            let mut iter = buf.into_iter();
            while let Some(a) = iter.next() {
                if let Some(b) = iter.next() {
                    next_round.push(Self::merge_two(a, b));
                } else {
                    next_round.push(a);
                }
            }
            buf = next_round;
        }
        buf.into_iter().next().flatten()
    }

    fn merge_two(
        list1: Option<Box<ListNode>>,
        list2: Option<Box<ListNode>>,
    ) -> Option<Box<ListNode>> {
        let mut dummy = Box::new(ListNode::new(0));
        let mut tail = &mut dummy;
        let (mut a, mut b) = (list1, list2);
        while a.is_some() && b.is_some() {
            let take_a = a.as_ref().unwrap().val < b.as_ref().unwrap().val;
            let next_box = if take_a {
                let mut n = a.take().unwrap(); a = n.next.take(); n
            } else {
                let mut n = b.take().unwrap(); b = n.next.take(); n
            };
            tail.next = Some(next_box);
            tail = tail.next.as_mut().unwrap();
        }
        tail.next = if a.is_some() { a } else { b };
        dummy.next
    }
}
```
