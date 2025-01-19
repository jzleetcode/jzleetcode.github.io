---
author: JZ
pubDatetime: 2025-01-06T06:23:00Z
modDatetime: 2025-01-06T06:23:00Z
title: System Design - Event Loop for Concurrent Applications
featured: true
tags:
  - design-concurrency
description:
  "event loop system design pattern/construct event loop (message dispatcher), reactor/actor pattern, non-blocking mechanism for concurrent applications"
---

## Table of contents

## Context

Applications/frameworks that use event loop include Node.js, Netty, and Jetty.

```javascript
console.log('first')
fs.readFile(__filename, ()=> {console.log('second')}) // async, callback executed last
console.log('third')
```

## Event Loop

The event loop is a key concept in asynchronous programming and is used to handle and manage events and tasks in a program. Its origins trace back to systems programming and were popularized by the need for efficient input/output operations in software.

First Usage of Event Loops

Historical Context:

- The concept of an event loop was first seen in early operating systems
  where the system needed to wait for and respond to hardware interrupts or events
  (e.g., key presses or I/O signals).
- Early graphical user interfaces (GUIs), such as those in systems like X Window System and Microsoft Windows applications,
  employed event loops to manage user interactions like clicks and drags.

Programming Paradigms:

- Event loops gained prominence in event-driven programming, especially in the design of GUIs and networked applications.
- In Node.js, the event loop is a core part of its runtime, enabling it to perform non-blocking I/O operations. This implementation is based on the `libuv` library.

Multiple queues:

![nodejs queues](https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Facadb0ce7d6240639e448d55136c04a6?format=webp&width=1600)

Language-Specific Implementations:

- In JavaScript, the event loop is used to handle the execution of asynchronous code (e.g., `promise`, `setTimeout`), often in conjunction with the browser or Node.js runtime.
- In Python, the event loop is managed by frameworks like asyncio, introduced in Python 3.4.

Networking:

- Early networking systems also used event loops, particularly in single-threaded network servers like nginx or early implementations of `select` or `poll` system calls in UNIX.

```shell
function main
    initialize()
    while message != quit
        message := get_next_message()
        process_message(message)
    end while
end function
```

The `get_next_message()` routine is typically provided by the operating system and blocks until a message is available.
The loop is only entered when there is something to process.

Under Unix, the "everything is a file" paradigm naturally leads to a file-based event loop. Reading from and writing to files, inter-process communication, network communication, and device control are all achieved using file I/O, with the target identified by a file descriptor. The select and poll system calls allow a set of file descriptors to be monitored for a change of state, e.g., when data becomes available to be read.

NodeJs event loop has six phases (see nodejs doc link in references):

1. timers: this phase executes callbacks scheduled by `setTimeout()` and `setInterval()`.
2. pending callbacks: executes I/O callbacks deferred to the next loop iteration.
3. idle, prepare: only used internally.
4. poll: retrieve new I/O events; execute I/O related callbacks (almost all with the exception of close callbacks, the ones scheduled by timers, and `setImmediate()`); node will block here when appropriate.
5. check: `setImmediate()` callbacks are invoked here.
6. close callbacks: some close callbacks, e.g. `socket.on('close', ...)`.

## Actor Model vs. Reactor Pattern

They both use event loops.

Actor model ([wiki](https://en.wikipedia.org/wiki/Actor_model)) originated in 1973. It adopts the philosophy that _everything is an actor_. Thi is similar to the _everything is an object_ philosophy in Python.

Email, web services, and object with locks can be modeled as an actor system.

An actor is a computational entity that, in response to a message it receives, can concurrently:

1. send a finite number of messages to other actors;
2. create a finite number of new actors;
3. designate the behavior to be used for the next message it receives.

There is no assumed sequence to the above actions, and they could be carried out in parallel.

Erlang, Ruby, Scala, and Swift employ the actor model.

Libraries and frameworks include Actix (Rust), Actor (Java), Vert.x (Java), and Pulsar (Python).

Difference between the two discussions on [stackoverflow](https://stackoverflow.com/questions/19352040/whats-the-difference-betwee-actor-model-and-reactor-pattern-in-python).

>In pulsar, each actor (think of a specialized thread or process) has its own event loop. In this way, any actor can run its own asynchronous server.

The reactor pattern is used in many web servers, application servers, and networking frameworks
include Netty, Nginx, Node.js, Twisted, and Vert.x.

## References

1. reactor pattern [wiki](https://en.wikipedia.org/wiki/Reactor_pattern)
2. event loop [wiki](https://en.wikipedia.org/wiki/Event_loop)
3. nodejs event loop builder.io [post](https://www.builder.io/blog/visual-guide-to-nodejs-event-loop)
4. reddit [thread](https://www.reddit.com/r/learnjavascript/comments/1b5jdl3/what_helped_you_truly_understand_the_event_loop/)
5. Python asyncio event loop [doc](https://docs.python.org/3/library/asyncio-eventloop.html)
6. understanding the event loop [stackoverflow](https://stackoverflow.com/questions/21607692/understanding-the-event-loop)
7. nodejs [doc](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
