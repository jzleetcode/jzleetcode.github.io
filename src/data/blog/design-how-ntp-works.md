---
author: JZ
pubDatetime: 2026-10-30T19:00:00Z
modDatetime: 2026-10-30T19:00:00Z
title: System Design - How NTP Keeps Computer Clocks in Sync
tags:
  - design-system
  - design-networking
description: "How Network Time Protocol (NTP) estimates clock offset and network delay, selects trustworthy servers, disciplines a local clock, and copes with jitter, asymmetric paths, and failures."
---

## Table of contents

## Context

A computer clock is useful even when it is a little wrong. It becomes dangerous when several computers must agree about **order**. A TLS certificate may appear expired, a distributed trace may run backward, and an access token may be rejected simply because one machine drifted away from the others.

The Network Time Protocol (NTP) is the long-lived protocol that keeps those ordinary clocks close to a common time source. It does not make a machine's oscillator perfect. Instead, it repeatedly measures a server, estimates what portion of a round trip was spent on the network, and gently corrects the local clock.

This article follows one client request. We will use four timestamps, then see how NTP chooses among servers and avoids turning a noisy packet into a sudden wall-clock jump.

## The problem: every oscillator drifts

Computers count time with quartz oscillators. Temperature, age, and manufacturing variation make an oscillator run a little fast or slow. A drift of 20 parts per million sounds tiny, but it is about 1.7 seconds per day.

There is also a second problem: a request crosses a network. If a client asks a time server "what time is it?", the response arrives later. Reading the server's answer as the current time would include an unknown amount of network delay.

NTP separates these two questions:

1. How far is my clock from the server's clock?
2. How much uncertainty came from the network and the server's own uncertainty?

## The four timestamps

In a normal client/server exchange, each side records two timestamps:

```text
  client                                           server
    |                                                |
 t1 |---- request (client transmit timestamp) ----->|
    |                                                | t2 request received
    |                                                |
    |                                                | t3 response transmitted
 t4 |<--- response (server transmit timestamp) -----|
    |                                                |
```

- `t1`: client sends the request.
- `t2`: server receives it.
- `t3`: server sends the response.
- `t4`: client receives the response.

The response carries `t1`, `t2`, and `t3`; the client supplies `t4` on arrival. The server does not need to know the client's correct time in advance—it only preserves the timestamp it received.

## Deriving delay and clock offset

Let the client clock differ from the server clock by `offset`, where a positive value means the client is behind the server. If the path in each direction takes the same time, the useful formulas are:

```text
round-trip delay = (t4 - t1) - (t3 - t2)

clock offset     = ((t2 - t1) + (t3 - t4)) / 2
```

The first formula removes time spent processing at the server. The second averages two observations: the server's receive time compared with the client's send time, and the server's send time compared with the client's receive time.

For example, suppose the client sends at 100 ms and receives at 140 ms. The server receives at 125 ms and replies at 127 ms:

```text
delay  = (140 - 100) - (127 - 125) = 38 ms
offset = ((125 - 100) + (127 - 140)) / 2 = 6 ms
```

The client estimates that it is 6 ms behind the server. It also knows the measurement crossed at least 38 ms of network delay, so it should not pretend that the estimate is exact.

The symmetric-path assumption is important. If the request takes 5 ms but the response takes 33 ms, the formula folds half the 28 ms difference into the offset estimate. NTP reduces this risk by collecting samples, preferring lower-delay paths, and combining multiple independent servers; it cannot infer a permanently asymmetric path from one exchange alone.

## Strata: tracing time back to a reference

NTP describes distance from a reference clock using **strata**:

```text
  atomic clock / GNSS receiver / radio clock
                    |
                 stratum 1
                    |
          NTP servers directly attached
                    |
                 stratum 2
                    |
       ordinary servers and clients
                    |
                 stratum 3 ... 15
```

A stratum-1 server is connected to a reference clock; it is not automatically more reliable than every other machine. A stratum-2 server can be excellent if it has diverse, healthy upstream servers. Stratum 16 means unsynchronized and must not be used as a time source.

Each response includes additional quality information, including root delay, root dispersion, and an indication of the reference source. Together they form an estimate of how far the server may be from the reference time—not merely how many hops away it is.

## From a packet sample to a trustworthy source

One timestamp exchange can be delayed, reordered, or affected by a busy host. NTP clients therefore retain a history of samples from each candidate server.

```text
                     candidate peers
  +---------------------------------------------------+
  | A: low delay, stable offset                       |
  | B: low delay, stable offset                       |
  | C: large delay, noisy offset                      |
  | D: offset disagrees strongly with A and B         |
  +---------------------------+-----------------------+
                              |
                              v
            discard invalid / unreachable / falseticker peers
                              |
                              v
               choose a consistent survivor set (the clique)
                              |
                              v
              combine survivors, favoring lower uncertainty
                              |
                              v
                    local clock discipline loop
```

The exact selection and clustering algorithms vary between NTP implementations and versions, but the principle is stable: do not blindly average every answer. A server can be unreachable, misconfigured, or simply disagree with the others. Independent sources are valuable because agreement is evidence.

The protocol also uses a randomized **kiss-o'-death** rate-limiting response: a server can tell an over-eager client to slow down rather than silently absorbing unlimited polling traffic.

## Discipline: steer the clock instead of jerking it

After selecting a source, a client still should not repeatedly set its clock to the latest offset. Measurements have jitter, and applications often dislike time going backward.

NTP implementations use a feedback loop similar in spirit to a phase-locked loop (PLL):

```text
measured offset ---> filter ---> controller ---> local clock frequency
       ^                                                  |
       |                                                  v
       +----------- next NTP measurement <----- system clock
```

For a modest offset, the client **slews** the clock: it temporarily runs slightly fast or slow until it converges. Slewing preserves a monotonic-looking timeline for most applications.

For a very large startup error, an administrator or a time service may allow a one-time **step**: immediately move the clock. This gets a newly booted machine close to reality quickly, but it can surprise software that assumes wall time only moves forward. Production services often step before serving traffic and slew afterward.

As samples stay stable, the client can poll less often. If quality worsens, it polls more frequently. This adaptive behavior saves traffic while still reacting to a clock whose drift changes with temperature or load.

## What NTP does and does not guarantee

NTP gives a best estimate of civil time, with a stated and evolving uncertainty. It is not a distributed ordering protocol. Two events occurring on different machines may still be too close together to order from wall-clock timestamps alone.

For causality, systems use tools such as request IDs, sequence numbers, Lamport clocks, or a database timestamp oracle. NTP remains essential: those tools need computers whose clocks are broadly sane for logs, expiration, leases, and human diagnosis.

## Practical operating advice

- Use several servers from independent failure domains. Three or four good sources are more informative than one.
- Monitor synchronization state, offset, frequency correction, jitter, and the selected source—not just whether the NTP daemon is running.
- Keep virtualization and host time configuration aligned. Competing clock agents can fight each other.
- Treat a growing offset as a hardware, network, or configuration signal. Do not hide it by repeatedly stepping a live production clock.
- For sub-microsecond requirements, consider Precision Time Protocol (PTP) and hardware timestamping. NTP is designed for robust Internet-scale synchronization, not every precision niche.

## Takeaways

NTP's elegance is that it does not trust any one timestamp. Four timestamps separate delay from clock offset; repeated samples separate a stable signal from jitter; and multiple servers make a single bad clock survivable. The final correction is gradual because time is part of the operating system's shared infrastructure, not just a number a daemon can overwrite without consequences.

## References

1. IETF, [Network Time Protocol Version 4: Protocol and Algorithms Specification (RFC 5905)](https://www.rfc-editor.org/rfc/rfc5905)
2. IETF, [Network Time Protocol Version 4: Extension Fields (RFC 7822)](https://www.rfc-editor.org/rfc/rfc7822)
3. NTP Project, [NTP documentation](https://www.ntp.org/documentation/)
4. chrony, [FAQ and documentation](https://chrony-project.org/documentation.html)
5. David L. Mills, [Computer Network Time Synchronization](https://www.eecis.udel.edu/~mills/book.html)
