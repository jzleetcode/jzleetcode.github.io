---
author: JZ
pubDatetime: 2026-11-25T19:45:37Z
modDatetime: 2026-11-25T19:45:37Z
title: LeetCode 117 Populating Next Right Pointers in Each Node II
featured: true
tags:
  - a-tree
  - a-bfs
  - a-linked-list
description:
  "Solutions for LeetCode 117, medium, tags: tree, breadth-first search, linked list, binary tree."
---

## Table of contents

## Description

Question Links: [LeetCode 117](https://leetcode.com/problems/populating-next-right-pointers-in-each-node-ii/description/)

Given the `root` of a binary tree, connect each node's `next` pointer to the next right node on the same level. If no such node exists, set `next` to `null`. Initially, every `next` pointer is `null`. Return the root after linking the levels.

```
Example 1:

Input: root = [1,2,3,4,5,null,7]
Output: [1,#,2,3,#,4,5,7,#]

Example 2:

Input: root = []
Output: []

Constraints:

The number of nodes in the tree is in the range [0, 6000].
-100 <= Node.val <= 100
```

Follow up: Can you solve the problem using O(1) extra space?

## Idea

### Solution 1: Level-Order BFS

A queue visits nodes from left to right, one level at a time. Link each dequeued node to the next node in that level; after the last node, set `next` to `null`. Children are enqueued left before right so the queue preserves the required order.

Complexity: Time $O(n)$ because each node is visited once. Space $O(w)$ for the queue, where $w$ is the maximum width of the tree (and at most $O(n)$).

### Solution 2: Build the Next Level In Place

After the first level, each level already has a left-to-right `next` chain. Walk that chain and append each parent’s non-null left child, then right child, to the next level. Keep a head and tail pointer for that next level, then continue from the head. This is the same link-building idea without a queue.

```
Current level:   2 ------> 3 ------> null
Children:        4, 5                 7
Next level:      4 ------> 5 ------> 7 ------> null
```

Complexity: Time $O(n)$ because each node is visited once. Space $O(1)$ extra: only a fixed number of pointers are used.

### Java
```java []
package tree;

import java.util.ArrayDeque;
import java.util.Queue;

/** LeetCode 117. Populating Next Right Pointers in Each Node II. */
public final class PopulatingNextRightPointersII {

    private PopulatingNextRightPointersII() {
    }

    public static class Node {
        public int val;
        public Node left;
        public Node right;
        public Node next;

        public Node(int val) {
            this.val = val;
        }
    }

    public static Node connect(Node root) {
        if (root == null) {
            return null;
        }

        Queue<Node> queue = new ArrayDeque<>();
        queue.add(root);
        // Each node is queued once. O(n) time and O(width) auxiliary space.
        while (!queue.isEmpty()) {
            for (int remaining = queue.size(); remaining > 0; remaining--) {
                Node node = queue.remove();
                node.next = remaining > 1 ? queue.peek() : null;
                if (node.left != null) {
                    queue.add(node.left);
                }
                if (node.right != null) {
                    queue.add(node.right);
                }
            }
        }
        return root;
    }

    public static Node connectConstantSpace(Node root) {
        if (root == null) {
            return null;
        }

        root.next = null;
        Node dummy = new Node(0);
        Node levelStart = root;
        // Follow each level's next links once and reuse the dummy head. O(n) time and O(1) auxiliary space.
        while (levelStart != null) {
            dummy.next = null;
            Node tail = dummy;
            for (Node node = levelStart; node != null; node = node.next) {
                if (node.left != null) {
                    tail.next = node.left;
                    tail = node.left;
                }
                if (node.right != null) {
                    tail.next = node.right;
                    tail = node.right;
                }
            }
            tail.next = null;
            levelStart = dummy.next;
        }
        return root;
    }
}
```

### Python
```python []
"""LeetCode 117: populate each node's next pointer to its next right node."""

from collections import deque
from typing import Optional


class Node:
    """Binary tree node with the additional next-level pointer."""

    def __init__(self, val=0, left=None, right=None, next=None):
        self.val = val
        self.left = left
        self.right = right
        self.next = next


class Solution:
    def connect(self, root: Optional[Node]) -> Optional[Node]:
        """Link nodes level by level with a queue: O(n) time, O(w) space."""
        if root is None:
            return None

        root.next = None
        queue = deque([root])
        while queue:
            previous = None
            # Every node enters and leaves the queue once: O(n) total time.
            for _ in range(len(queue)):
                node = queue.popleft()
                if previous is not None:
                    previous.next = node
                previous = node
                if node.left is not None:
                    queue.append(node.left)
                if node.right is not None:
                    queue.append(node.right)
            # The rightmost node on this level must not point into another level.
            previous.next = None

        return root

    def connectConstantSpace(self, root: Optional[Node]) -> Optional[Node]:
        """Build each level's links while walking the previous one: O(n)/O(1)."""
        if root is None:
            return None

        root.next = None
        level = root
        while level is not None:
            next_head = None
            next_tail = None
            node = level
            # Each existing node is visited once; only a fixed number of pointers
            # are used beyond the input tree, so total work is O(n) and extra space O(1).
            while node is not None:
                for child in (node.left, node.right):
                    if child is not None:
                        if next_tail is None:
                            next_head = child
                        else:
                            next_tail.next = child
                        next_tail = child
                node = node.next

            if next_tail is not None:
                next_tail.next = None
            level = next_head

        return root
```

### C++
```cpp []
#ifndef LEETCODE_POPULATINGNEXTRIGHTPOINTERSII_HPP
#define LEETCODE_POPULATINGNEXTRIGHTPOINTERSII_HPP

#include <queue>

namespace populating_next_right_pointers_ii {

struct Node {
    int val;
    Node *left = nullptr;
    Node *right = nullptr;
    Node *next = nullptr;
};

class Solution {
public:
    // O(n) time and O(width) extra space for the queue.
    Node *connect(Node *root) {
        if (!root) return nullptr;

        std::queue<Node *> nodes;
        nodes.push(root);
        while (!nodes.empty()) {
            Node *previous = nullptr;
            for (auto remaining = nodes.size(); remaining > 0; --remaining) {
                Node *current = nodes.front();
                nodes.pop();

                if (previous) previous->next = current;
                previous = current;
                if (current->left) nodes.push(current->left);
                if (current->right) nodes.push(current->right);
            }
            previous->next = nullptr;
        }
        return root;
    }

    // O(n) time and O(1) extra space using the current level's next chain.
    Node *connectConstantSpace(Node *root) {
        if (!root) return nullptr;

        root->next = nullptr;
        Node *level = root;
        while (level) {
            Node dummy{};
            Node *tail = &dummy;
            for (Node *current = level; current; current = current->next) {
                if (current->left) {
                    tail->next = current->left;
                    tail = tail->next;
                }
                if (current->right) {
                    tail->next = current->right;
                    tail = tail->next;
                }
            }
            tail->next = nullptr;
            level = dummy.next;
        }
        return root;
    }
};

}

#endif // LEETCODE_POPULATINGNEXTRIGHTPOINTERSII_HPP
```

### Rust
```rust []
//! LeetCode 117. Populating Next Right Pointers in Each Node II.

use std::cell::RefCell;
use std::collections::VecDeque;
use std::rc::Rc;

pub type Link = Option<Rc<RefCell<Node>>>;

pub struct Node {
    pub val: i32,
    pub left: Link,
    pub right: Link,
    pub next: Link,
}

impl Node {
    pub fn new(val: i32) -> Self {
        Self {
            val,
            left: None,
            right: None,
            next: None,
        }
    }
}

pub struct Solution;

impl Solution {
    /// Connects nodes with breadth-first search in O(n) time and O(width) auxiliary space.
    pub fn connect(root: Link) -> Link {
        let mut queue: VecDeque<_> = root.iter().cloned().collect();

        while !queue.is_empty() {
            let level_size = queue.len();
            for index in 0..level_size {
                let node = queue.pop_front().unwrap();
                let mut node = node.borrow_mut();
                node.next = if index + 1 < level_size {
                    queue.front().cloned()
                } else {
                    None
                };
                queue.extend(
                    [node.left.clone(), node.right.clone()]
                        .into_iter()
                        .flatten(),
                );
            }
        }

        root
    }

    /// Uses each level's next links to build the following level in O(n) time and O(1) auxiliary space.
    pub fn connect_constant_space(root: Link) -> Link {
        let mut level_start = root.clone();
        if let Some(node) = &level_start {
            node.borrow_mut().next = None;
        }

        while level_start.is_some() {
            let mut current = level_start.take();
            let mut next_tail: Link = None;

            while let Some(parent) = current {
                let parent = parent.borrow();
                for child in [&parent.left, &parent.right].into_iter().flatten() {
                    if let Some(tail) = &next_tail {
                        tail.borrow_mut().next = Some(child.clone());
                    } else {
                        level_start = Some(child.clone());
                    }
                    next_tail = Some(child.clone());
                }
                current = parent.next.clone();
            }

            if let Some(tail) = next_tail {
                tail.borrow_mut().next = None;
            }
        }

        root
    }
}
```
