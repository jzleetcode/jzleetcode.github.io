---
author: JZ
pubDatetime: 2026-05-31T10:06:00Z
modDatetime: 2026-05-31T10:06:00Z
title: LeetCode 138 Copy List with Random Pointer
featured: false
tags:
  - a-linkedlist
  - a-hashtable
description:
  "Solutions for LeetCode 138, medium, tags: hash table, linked list."
---

## Table of contents

## Description

Question Link: [LeetCode 138](https://leetcode.com/problems/copy-list-with-random-pointer/description/)

A linked list of length `n` is given such that each node contains an additional random pointer, which could point to any node in the list, or `null`.

Construct a **deep copy** of the list. The deep copy should consist of exactly `n` **brand new** nodes, where each new node has its value set to the value of its corresponding original node. Both the `next` and `random` pointer of the new nodes should point to new nodes in the copied list such that the pointers in the original list and copied list represent the same list state. None of the pointers in the new list should point to nodes in the original list.

For example, if there are two nodes `X` and `Y` in the original list, where `X.random --> Y`, then for the corresponding two nodes `x` and `y` in the copied list, `x.random --> y`.

Return the head of the copied linked list.

The linked list is represented in the input/output as a list of `n` nodes. Each node is represented as a pair of `[val, random_index]` where:
- `val`: an integer representing `Node.val`
- `random_index`: the index of the node (range from `0` to `n-1`) that the `random` pointer points to, or `null` if it does not point to any node.

Example 1:

```
Input: head = [[7,null],[13,0],[11,4],[10,2],[1,0]]
Output: [[7,null],[13,0],[11,4],[10,2],[1,0]]
```

Example 2:

```
Input: head = [[1,1],[2,1]]
Output: [[1,1],[2,1]]
```

Example 3:

```
Input: head = [[3,null],[3,0],[3,null]]
Output: [[3,null],[3,0],[3,null]]
```

**Constraints:**

- `0 <= n <= 1000`
- `-10^4 <= Node.val <= 10^4`
- `Node.random` is `null` or is pointing to some node in the linked list.

## Idea1

Use a **hash map** to map each original node to its copy. Two passes:

1. First pass — create all new nodes and store the mapping `original → copy`.
2. Second pass — for each original node, set `copy.next` and `copy.random` using the map.

```
Original:  7 → 13 → 11 → 10 → 1
           |    |     |    |    |
random:  null   7    1    11    7

Pass 1 — create map:
  {7→7', 13→13', 11→11', 10→10', 1→1'}

Pass 2 — wire pointers:
  7'.next = 13',  7'.random = null
  13'.next = 11', 13'.random = 7'
  11'.next = 10', 11'.random = 1'
  10'.next = 1',  10'.random = 11'
  1'.next = null, 1'.random = 7'
```

Complexity: Time $O(n)$ — two linear passes, Space $O(n)$ — hash map stores $n$ entries.

### Java

```java []
public static Node copyRandomListHashMap(Node head) {
    if (head == null) return null; // O(1)
    Map<Node, Node> map = new HashMap<>(); // O(n) space
    Node cur = head;
    while (cur != null) { // O(n) time — first pass: create all copy nodes
        map.put(cur, new Node(cur.val));
        cur = cur.next;
    }
    cur = head;
    while (cur != null) { // O(n) time — second pass: wire next and random pointers
        map.get(cur).next = map.get(cur.next);
        map.get(cur).random = map.get(cur.random);
        cur = cur.next;
    }
    return map.get(head);
}
```

### Python

```python []
class Solution:
    """Hash map approach. O(n) time, O(n) space."""

    def copyRandomList(self, head: Optional[Node]) -> Optional[Node]:
        if not head:
            return None
        old_to_new = {}
        cur = head
        while cur:  # O(n) first pass: create all copy nodes
            old_to_new[cur] = Node(cur.val)
            cur = cur.next
        cur = head
        while cur:  # O(n) second pass: wire next and random pointers
            old_to_new[cur].next = old_to_new.get(cur.next)
            old_to_new[cur].random = old_to_new.get(cur.random)
            cur = cur.next
        return old_to_new[head]
```

### C++

```cpp []
RandomNode* copyRandomListHashMap(RandomNode* head) {
    if (!head) return nullptr;
    unordered_map<RandomNode*, RandomNode*> map; // O(n) space for mapping old->new
    RandomNode* cur = head;
    while (cur) { // O(n) time: create all new nodes
        map[cur] = new RandomNode(cur->val);
        cur = cur->next;
    }
    cur = head;
    while (cur) { // O(n) time: assign next and random pointers
        map[cur]->next = map[cur->next];
        map[cur]->random = map[cur->random];
        cur = cur->next;
    }
    return map[head];
}
```

### Rust

```rust []
impl Solution {
    /// Hash Map approach. Time: O(n), Space: O(n).
    pub fn copy_random_list_hashmap(
        head: &[(i32, Option<usize>)],
    ) -> Vec<(i32, Option<usize>)> {
        use std::collections::HashMap;
        if head.is_empty() { return vec![]; }
        let mut index_map: HashMap<usize, usize> = HashMap::new();
        let mut result: Vec<(i32, Option<usize>)> = Vec::with_capacity(head.len());
        for (i, &(val, _)) in head.iter().enumerate() { // O(n) first pass
            index_map.insert(i, i);
            result.push((val, None));
        }
        for (i, &(_, random)) in head.iter().enumerate() { // O(n) second pass
            if let Some(rand_idx) = random {
                result[index_map[&i]].1 = Some(index_map[&rand_idx]);
            }
        }
        result
    }
}
```

## Idea2

**Interleaving** — no extra hash map needed. Three passes:

1. Interleave copies: insert a clone after each original node.
   `A → B → C` becomes `A → A' → B → B' → C → C'`
2. Assign random pointers: `copy.random = original.random.next` (i.e., the clone of the random target).
3. Separate: unweave the two lists to restore the original and extract the copy.

```
Original:  A → B → C
           ↓       ↓
random:    C      null

Step 1 — interleave:
  A → A' → B → B' → C → C'

Step 2 — set random for copies:
  A'.random = A.random.next = C' ✓
  B'.random = null (B.random is null) ✓
  C'.random = null ✓

Step 3 — separate:
  Original: A → B → C
  Copy:     A' → B' → C'  (with correct random pointers)
```

Complexity: Time $O(n)$ — three linear passes, Space $O(1)$ — no extra data structure (only the output nodes).

### Java

```java []
public static Node copyRandomListInterleave(Node head) {
    if (head == null) return null; // O(1)
    // Step 1: interleave copy nodes — O(n) time, O(1) space
    Node cur = head;
    while (cur != null) {
        Node copy = new Node(cur.val);
        copy.next = cur.next;
        cur.next = copy;
        cur = copy.next;
    }
    // Step 2: assign random pointers for copy nodes — O(n) time
    cur = head;
    while (cur != null) {
        if (cur.random != null) {
            cur.next.random = cur.random.next; // copy's random = original's random's copy
        }
        cur = cur.next.next;
    }
    // Step 3: separate the two lists — O(n) time, O(1) space
    Node dummy = new Node(0);
    Node copyCur = dummy;
    cur = head;
    while (cur != null) {
        Node copy = cur.next;
        copyCur.next = copy;
        copyCur = copy;
        cur.next = copy.next; // restore original list
        cur = cur.next;
    }
    return dummy.next;
}
```

### Python

```python []
class Solution2:
    """Interleaving approach. O(n) time, O(1) space."""

    def copyRandomList(self, head: Optional[Node]) -> Optional[Node]:
        if not head:
            return None
        # O(n) step 1: interleave copies — A -> A' -> B -> B' -> ...
        cur = head
        while cur:
            copy = Node(cur.val, cur.next)
            cur.next = copy
            cur = copy.next
        # O(n) step 2: assign random pointers for copies
        cur = head
        while cur:
            if cur.random:
                cur.next.random = cur.random.next
            cur = cur.next.next
        # O(n) step 3: separate the two lists
        dummy = Node(0)
        copy_cur = dummy
        cur = head
        while cur:
            copy_cur.next = cur.next
            copy_cur = copy_cur.next
            cur.next = copy_cur.next
            cur = cur.next
        return dummy.next
```

### C++

```cpp []
RandomNode* copyRandomListInterleave(RandomNode* head) {
    if (!head) return nullptr;
    // Step 1: interleave copied nodes. O(n) time, O(1) space.
    RandomNode* cur = head;
    while (cur) {
        RandomNode* copy = new RandomNode(cur->val);
        copy->next = cur->next;
        cur->next = copy;
        cur = copy->next;
    }
    // Step 2: assign random pointers for copies. O(n) time.
    cur = head;
    while (cur) {
        if (cur->random)
            cur->next->random = cur->random->next; // O(1) random lookup via interleaving
        cur = cur->next->next;
    }
    // Step 3: separate the two lists. O(n) time.
    RandomNode* newHead = head->next;
    cur = head;
    while (cur) {
        RandomNode* copy = cur->next;
        cur->next = copy->next;
        copy->next = copy->next ? copy->next->next : nullptr;
        cur = cur->next;
    }
    return newHead;
}
```

### Rust

```rust []
impl Solution {
    /// Direct index-based copy. Time: O(n), Space: O(n).
    pub fn copy_random_list_direct(
        head: &[(i32, Option<usize>)],
    ) -> Vec<(i32, Option<usize>)> {
        if head.is_empty() { return vec![]; }
        // Direct copy: indices are stable, so copy each element in one pass
        head.iter().map(|&(val, random)| (val, random)).collect()
    }
}
```
