---
author: JZ
pubDatetime: 2024-12-11T07:23:00Z
modDatetime: 2024-12-11T07:23:00Z
title: Rust Option, Rc, and RefCell Explained - LeetCode Tree Node and LinkedList Node
featured: true
tags:
  - a-tree
  - a-list
  - l-rust
description:
  "Explanation for rust data structure for tree node and linked list node. What is Rc and RefCell? Why Option<Rc<RefCell>>> three wrappers? How to avoid circular reference?"
---

## Table of contents

## Pointer vs Reference

There is a paradigm of data structure that can be used to remember the memory address of something else in our program.
This is typically either a pointer or a reference in various languages.

In C++, a pointer is mutable and can be changed to point to a different address after declaration. A reference in C++ is bound to the object at declaration and cannot be changed to refer to another object.

Rust has the raw pointer (not safe), `Box`, and `RefCell`.
Check this stackoverflow [question](https://stackoverflow.com/questions/49377231/when-to-use-rc-vs-box#:~:text=The%20bottom%20line%20is%20they%20are%20meant%20for,be%20needing%20Cell%20or%20RefCell%20for%20internal%20mutability.) for more.
We will not dive deeper in this post.

In Java, by default, everything that is not primitive is a mutable reference.

In Python, everything is an object and by default is referred to by a mutable reference.

In cpu instructions, there is a family of instructions that can dereference an address (or more) saved in a cpu register (faster than memory).
For example, `(%eax)` is a cpu instruction to dereference the memory address saved in register `%eax`. This is a very efficient operation on the cpu.

In summary, mutable reference or pointer is one way to get access to a block of memory address and modify the data saved in there.

On LeetCode, for Rust, the tree node or a linked list node definition uses `Option<Rc<RefCell<Node>>>`. Let's explain the three layers.

## Option

Tony Hoare called `null` the billion dollar mistake, you can read this hacker moon [article](https://hackernoon.com/null-the-billion-dollar-mistake-8t5z32d6) for more.

C++ introduced `std::optional` with C++ 17. Java introduced `Optional` with Java 8. Python introduced `Optional` as a type annotation with Python 3.5.

Rust was born late and there is no `null`. Rust has `Option<T>` where `T` is the generic type.

An option can be two cases:

1. actual data present inside the option
2. nothing inside

In Rust, it is either `Some(T)` or `None`.

Because when nodes are linked together, we need a way to indicate the two cases of what a link may lead to.

1. there is another node this link is leading to.
2. nothing on the other side of this link.

## Rust Rc and Weak

### Use Weak to Break Cycle

Official doc for [Rc](https://doc.rust-lang.org/std/rc/struct.Rc.html).

`Rc` is a single threaded reference counter.

Java uses reference counting in its garbage collector. If there is still a variable holding a reference to the data then the memory for the data cannot be released. For more, read stackoverflow [question1](https://stackoverflow.com/questions/176745/circular-references-in-java), [question2](https://softwareengineering.stackexchange.com/questions/11856/whats-wrong-with-circular-references). If all objects in the circle are no longer reachable, Java's garbage collector can still [correctly collect](https://www.baeldung.com/java-gc-cyclic-references).

Rust, however, does not have a garbage collector. As mentioned in the module `Rc` [doc](https://doc.rust-lang.org/std/rc/index.html#), a cycle between `Rc` pointers will never be deallocated. The doc suggested using `Weak` to break cycles.

A `Weak` pointer can be `upgrade`d to an `Rc`, but will return `None` if the data in the allocation has already been dropped.

We could use `Weak` in a doubly linked list or a tree to break the cycles.

In a doubly linked list or a tree where the child node also holds a pointer to the parent, we need to use `Weak`.

![linked list image](https://media.geeksforgeeks.org/wp-content/uploads/20240809123741/Insertion-at-the-End-in-Doubly-Linked-List-copy.webp)

In the linked list shown above, the pointers between node `1` and `2` may form a circle (cycle). So we will need to use `Weak`.

### Shared Mutability

`Rc` can allow us to have multiple immutable references.

```rust
#[test]
fn test_rc_immut() {
    let x = Rc::new(5);
    let y = Rc::clone(&x);
    assert_eq!(x, y);
    assert_eq!(*x, *y);
    assert_eq!(*x, 5);
}
```

But we cannot have mutable and immutable references pointing to the same data because the immutable reference does not expect the data to change.

```rust
#[test]
/// mutable Rc can no longer mutate if any other Rc exists.
fn test_rc_mut() {
    let mut x = Rc::new(5);
    *Rc::get_mut(&mut x).unwrap() = 6;
    assert_eq!(*x, 6);
    let mut y = Rc::clone(&x);
    let (r1, r2) = (Rc::get_mut(&mut x), Rc::get_mut(&mut y));
    assert!(r1.is_none());
    assert!(r2.is_none());
    drop(y);
    *Rc::get_mut(&mut x).unwrap() = 5;
    assert_eq!(*x, 5);
    let _y = Rc::clone(&x);
    assert!(Rc::get_mut(&mut x).is_none());
}
```

To gain shared mutable pointers, we can use `Rc<RefCell<>>`.

## Rust RefCell

Rust [`Box`](https://doc.rust-lang.org/std/boxed/struct.Box.html) provides an exclusive mutable pointer that can be used to mutate the data.

In doubly linked list or a tree, we need shared mutable pointers. For example, in the picture above, we may want to modify the value of node `2` by accessing it from node `1` or node `3`.

```rust
node1.next = new_value;
node2.prev = new_value;
```

Similar to `Rc`, `RefCell` can be used in single threaded context to allow shared mutable pointers. The borrowing rules are checked at runtime instead and you will get a `panic!` instead of a compiler error.

### Code

Putting all of the above together, we could implement a tree node with `Weak` pointers from child to parent and `Rc` from parent to child.

The `clone()` method just basically increments the strong reference count and get another copy of the `Rc`.

```rust
type NodePtr = Rc<RefCell<Node>>;
type WeakNodePtr = Weak<RefCell<Node>>;

#[derive(Debug)]
struct Node {
    val: i32,
    parent: Option<WeakNodePtr>,
    left: Option<NodePtr>,
    right: Option<NodePtr>,
}

impl Node {
    /// constructs a Rc<RefCell>> pointer to a new point with val
    #[inline]
    pub fn new_ptr(val: i32) -> Rc<RefCell<Self>> {
        Rc::new(RefCell::new(Self {
            val,
            parent: None,
            left: None,
            right: None,
        }))
    }

    pub fn connect(root: NodePtr, left: NodePtr, right: NodePtr) {
        let mut r_m = root.borrow_mut();
        (r_m.left, r_m.right) = (Some(left.clone()), Some(right.clone()));
        left.borrow_mut().parent = Some(Rc::downgrade(&root));
        right.borrow_mut().parent = Some(Rc::downgrade(&root));
    }
}
```

Unit Test

```rust
#[test]
fn test_tree_node() {
    let n_o = Some(Node::new_ptr(0)); // wrapped in option
    println!("{n_o:#?}");
    // Some(
    //     RefCell {
    //         value: Node {
    //             val: 0,
    //             parent: None,
    //             left: None,
    //             right: None,
    //         },
    //     },
    // )
    let (left, right) = (Node::new_ptr(-1), Node::new_ptr(1)); // not wrapped
    let n = n_o.unwrap(); // node moved to var n, n_o can no longer be used
    n.borrow_mut().left = Some(left.clone());
    n.borrow_mut().right = Some(right.clone());
    left.borrow_mut().parent = Some(Rc::downgrade(&n));
    right.borrow_mut().parent = Some(Rc::downgrade(&n));
    println!("{n:#?}");
    // RefCell {
    //     value: Node {
    //         val: 0,
    //         parent: None,
    //         left: Some(
    //             RefCell {
    //                 value: Node {
    //                     val: -1,
    //                     parent: Some(
    //                         (Weak),
    //                     ),
    //                     left: None,
    //                     right: None,
    //                 },
    //             },
    //         ),
    //         right: Some(
    //             RefCell {
    //                 value: Node {
    //                     val: 1,
    //                     parent: Some(
    //                         (Weak),
    //                     ),
    //                     left: None,
    //                     right: None,
    //                 },
    //             },
    //         ),
    //     },
    // }
    println!("{:#?}", left.borrow().parent.as_ref()
        .expect("parent is not None").upgrade());
    println!("{:#?}", left.borrow().parent);
    // Some(
    //     (Weak),
    // )
    // borrow left interior RefCell second time, multiple immutable borrows
    println!("{:#?}", left.borrow().parent.as_ref()
        .expect("parent is not None").upgrade());
    // Some(
    //     RefCell {
    //         value: Node {
    //             val: 0,
    //             parent: None,
    //             left: Some(
    //                 RefCell {
    //                     value: Node {
    //                         val: -1,
    //                         parent: Some(
    //                             (Weak),
    //                         ),
    //                         left: None,
    //                         right: None,
    //                     },
    //                 },
    //             ),
    //             right: Some(
    //                 RefCell {
    //                     value: Node {
    //                         val: 1,
    //                         parent: Some(
    //                             (Weak),
    //                         ),
    //                         left: None,
    //                         right: None,
    //                     },
    //                 },
    //             ),
    //         },
    //     },
    // )
}
```

One drawback of using `Weak` is that it does not support the `PartialEq` trait to compare two nodes for equality.
If you can compare the nodes by value, then you can compare equality as below. Otherwise, you will need to compare all the fields including the value, the parent pointer, the left child pointer, and the right child pointer.

```rust
#[test]
fn test_tree_node_eq() {
    // Weak does not support derive PartialEq, compare node val instead
    let (a, b) = (1, 1);
    assert_eq!(a, b);
    println!("address {:p} != {:p}", &a, &b);
    // address 0x16d312684 != 0x16d312688
    let n = Node::new_ptr(0);
    let (mut n1, mut n2) = (Some(n.clone()), Some(n.clone()));
    assert_eq!(3, Rc::strong_count(&n)); // 3 refs: n,n1,n2
    let n2n = n2.unwrap();
    assert_eq!(n1.unwrap().borrow().val, n2n.borrow().val);
    n1 = Some(Node::new_ptr(1));
    assert_ne!(n1.as_ref().expect("").borrow().val, n2n.borrow().val);
    n2 = Some(Node::new_ptr(1));
    // unwraps moves content in option, as_ref then expect does not
    assert_eq!(n1.as_ref().expect("").borrow().val, n2.unwrap().borrow().val);
}
```


## References

1. For fun, read [rust too many linked lists](https://rust-unofficial.github.io/too-many-lists/index.html)
2. RefCell, rust [book](https://doc.rust-lang.org/book/ch15-05-interior-mutability.html)
