---
author: JZ
pubDatetime: 2024-11-24T09:23:00Z
modDatetime: 2024-11-24T09:23:00Z
title: LeetCode 146 LintCode 134 LRU Cache
featured: true
tags:
  - a-hash
  - a-list
  - a-design
  - c-amazon
  - c-openai
description:
  "Solutions for LeetCode 146 LintCode 134, medium, tags: hash, linked list, design, doubly linked list, companies: amazon, openai."
---

## Table of contents

## Description

Design a data structure that follows the constraints of the **[Least Recently Used (LRU) cache](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU)**.

Implement the `LRUCache` class:

-   `LRUCache(int capacity)` Initialize the LRU cache with **positive** size `capacity`.
-   `int get(int key)` Return the value of the `key` if the key exists, otherwise return `-1`.
-   `void put(int key, int value)` Update the value of the `key` if the `key` exists. Otherwise, add the `key-value` pair to the cache. If the number of keys exceeds the `capacity` from this operation, **evict** the least recently used key.

The functions `get` and `put` must each run in `O(1)` average time complexity.

```
Example 1:

Input
["LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"]
[[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]
Output
[null, null, null, 1, null, -1, null, -1, 3, 4]

Explanation
LRUCache lRUCache = new LRUCache(2);
lRUCache.put(1, 1); // cache is {1=1}
lRUCache.put(2, 2); // cache is {1=1, 2=2}
lRUCache.get(1);    // return 1
lRUCache.put(3, 3); // LRU key was 2, evicts key 2, cache is {1=1, 3=3}
lRUCache.get(2);    // returns -1 (not found)
lRUCache.put(4, 4); // LRU key was 1, evicts key 1, cache is {4=4, 3=3}
lRUCache.get(1);    // return -1 (not found)
lRUCache.get(3);    // return 3
lRUCache.get(4);    // return 4
```

**Constraints:**

-   `1 <= capacity <= 3000`
-   `0 <= key <= 104`
-   `0 <= value <= 105`
-   At most `2 * 105` calls will be made to `get` and `put`.


## Solution

### Idea

We can use a doubly linked list and a hash map so that both the `put` and `get` operations can be O(1) time complexity.
We cannot use Java standard library's `LinkedList` since `remove` is O(n) time complexity because we need to locate the node in the linked list.

As far as I know, there no standard library implementation of a doubly or singly linked list node. Java has `LinkedList` and C++ has `std::list` and the node data structure is encapsulated. Maybe the data structure itself is very trivial to write so no standard library provides it.

Wait for the Rust solution, it will be fun.

Complexity: Time O(1), Space O(n).

#### Java

```java
public class LRUCache {
    Map<Integer, Node> cache; // key -> node
    int cnt;
    int capacity;
    Node head, tail;

    public LRUCache(int capacity) {
        this.cnt = 0;
        this.capacity = capacity;
        cache = new HashMap<>();
        head = new Node();
        tail = new Node();
        head.next = tail;
        tail.pre = head;
    }

    private void addToHead(Node node) {
        node.pre = head;
        node.next = head.next;
        head.next.pre = node;
        head.next = node;
    }

    private void removeNode(Node node) {
        node.pre.next = node.next;
        node.next.pre = node.pre;
    }

    private void moveToHead(Node node) {
        removeNode(node);
        addToHead(node);
    }

    private Node popTail() {
        Node res = tail.pre;
        removeNode(res);
        return res;
    }

    public int get(int key) {
        Node node = cache.get(key);
        if (node == null) return -1;
        moveToHead(node);
        return node.v;
    }

    public void put(int key, int value) {
        Node node = cache.get(key);
        if (node == null) {
            Node newNode = new Node(key, value);
            cache.put(key, newNode);
            addToHead(newNode);
            ++cnt;
            if (cnt > capacity) {
                Node tail = popTail();
                cache.remove(tail.k);
                --cnt;
            }
        } else {
            node.v = value;
            moveToHead(node);
        }
    }

    static class Node {
        int k;
        int v;
        Node pre;
        Node next;

        Node(int k, int v) {
            this.k = k;
            this.v = v;
        }

        Node() {
        }
    }
}
```

#### Python

```python
def delete(node):
    node.pre.nex = node.nex
    node.nex.pre = node.pre


class LRUCache:
    """118 ms, 77.4 mb"""

    def __init__(self, capacity: int):
        self.head, self.tail = Node(), Node()
        self.head.nex = self.tail
        self.tail.prev = self.head
        self.kn = dict()
        self.cnt = 0
        self.cap = capacity

    def get(self, key: int) -> int:
        if key in self.kn:
            self.move_front(self.kn[key])
            return self.kn[key].v
        else:
            return -1

    def put(self, key: int, value: int) -> None:
        if key in self.kn:
            self.kn[key].v = value
            self.move_front(self.kn[key])
        else:
            node = Node(k=key, v=value)
            self.add_front(node)
            self.cnt += 1
            self.kn[key] = node
            if self.cnt > self.cap:
                tmp = self.pop_tail()
                del self.kn[tmp.k]
                self.cnt -= 1

    def pop_tail(self):
        tmp = self.tail.pre
        delete(tmp)
        return tmp

    def add_front(self, node):
        self.head.nex.pre = node
        node.nex = self.head.nex
        node.pre = self.head
        self.head.nex = node

    def move_front(self, node):
        delete(node)
        self.add_front(node)


class Node:
    def __init__(self, k=0, v=0, pre=None, nex=None):
        self.k = k
        self.v = v
        self.pre = pre
        self.nex = nex
```
