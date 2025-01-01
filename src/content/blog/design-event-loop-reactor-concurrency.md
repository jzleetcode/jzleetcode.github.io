---
author: JZ
pubDatetime: 2024-12-27T06:23:00Z
modDatetime: 2024-12-10T06:23:00Z
title: LeetCode 239 Sliding Window Max
featured: true
draft: true
tags:
  - a-sliding-window
description:
  "Solutions for LeetCode 239, hard, tags: array, queue, sliding window, heap, monotonic queue."
---

## Table of contents

## Context

Applications/frameworks that use event loop include Node.js, Netty, and Jetty.

## Event Loop

The event loop is a key concept in asynchronous programming and is used to handle and manage events and tasks in a program. Its origins trace back to systems programming and were popularized by the need for efficient input/output operations in software.

First Usage of Event Loops

Historical Context:
•	The concept of an event loop was first seen in early operating systems where the system needed to wait for and respond to hardware interrupts or events (e.g., keypresses or I/O signals).
•	Early graphical user interfaces (GUIs), such as those in systems like X Window System, employed event loops to manage user interactions like clicks and drags.

Programming Paradigms:
•	Event loops gained prominence in event-driven programming, especially in the design of GUIs and networked applications.
•	In Node.js, the event loop is a core part of its runtime, enabling it to perform non-blocking I/O operations. This implementation is based on the libuv library.

Language-Specific Implementations:
•	In JavaScript, the event loop is used to handle the execution of asynchronous code (e.g., promises, setTimeout), often in conjunction with the browser or Node.js runtime.
•	In Python, the event loop is managed by frameworks like asyncio, introduced in Python 3.4.

Networking:
•	Early networking systems also used event loops, particularly in single-threaded network servers like nginx or early implementations of select or poll system calls in UNIX.

Summary

The event loop as a concept predates modern programming languages and is rooted in the need for systems to handle asynchronous operations efficiently. While its exact first use is difficult to pinpoint, the earliest systems requiring event-driven behavior—like GUIs and network servers—made use of event loops in their design.

## Actor Model vs. Reactor Pattern

They both use event loops.

Actor model ([wiki](https://en.wikipedia.org/wiki/Actor_model)) originated in 1973. It adopts the philosophy that _everything is an actor_. Thi is similar to the _everything is an object_ philosophy in Python.

Email, web services, and object with locks can be modeled as an actor system.

Difference between the two discussions on [stackoverflow](https://stackoverflow.com/questions/19352040/whats-the-difference-betwee-actor-model-and-reactor-pattern-in-python).

## References
