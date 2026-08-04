---
author: JZ
pubDatetime: 2026-08-04T06:00:00Z
modDatetime: 2026-08-04T06:00:00Z
title: System Design - How the QUIC Protocol Works
tags:
  - design-system
  - design-networking
description:
  "How QUIC works: connection establishment, 0-RTT handshake, stream multiplexing without head-of-line blocking, loss detection, congestion control, and connection migration. A walkthrough of the protocol that powers HTTP/3."
---

## Table of contents

## Context

Imagine you are on a train, scrolling through a news app. Your phone switches from Wi-Fi to cellular as you leave the station. Suddenly, every page hangs for a few seconds while TCP connections time out and re-establish. Or picture a busy webpage loading images, JavaScript, and CSS over a single HTTP/2 connection — one lost packet stalls everything behind it, even data for completely unrelated resources.

These are not edge cases. They are everyday experiences caused by fundamental limitations in TCP, a protocol designed in 1981.

### The TCP + TLS tax

To load a webpage over HTTPS, a client must complete three sequential round-trips before any application data flows:

```
        Client                          Server
          |                               |
          |--- SYN ---------------------->|  \
          |<-- SYN-ACK ------------------|   | TCP handshake (1 RTT)
          |--- ACK ---------------------->|  /
          |                               |
          |--- ClientHello -------------->|  \
          |<-- ServerHello, Cert ---------|   | TLS 1.3 handshake (1 RTT)
          |--- Finished ----------------->|  /
          |                               |
          |--- HTTP Request ------------->|  Application data (1 RTT)
          |<-- HTTP Response -------------|
          |                               |

          Total before first byte: 2-3 RTT
```

On a 100ms RTT link (common on mobile), that is 200-300ms of dead time before a single byte of content arrives.

### Head-of-line (HOL) blocking

HTTP/2 multiplexes many requests over one TCP connection. But TCP treats its byte stream as a single ordered sequence. If a packet carrying bytes for Stream A is lost, TCP cannot deliver already-arrived bytes for Streams B, C, and D until Stream A's missing packet is retransmitted and received.

```
    TCP byte stream (single ordered pipe):

    +------+------+------+------+------+------+
    | A:1  | B:1  | C:1  | A:2  | B:2  | C:2  |
    +------+------+------+------+------+------+
                    ^
                    | lost!
                    |
    Streams B and C are BLOCKED even though
    their data arrived fine — because TCP must
    deliver bytes in order.
```

This is **head-of-line blocking at the transport layer**, and no amount of clever HTTP framing can fix it — the problem lives below HTTP.

### Enter QUIC

QUIC (originally "Quick UDP Internet Connections") was designed by Google starting in 2012, standardized by the IETF as RFC 9000 in 2021. It replaces the TCP + TLS stack with a single protocol running on top of UDP:

```
    Traditional Stack              QUIC Stack

    +----------------+            +----------------+
    |     HTTP/2     |            |     HTTP/3     |
    +----------------+            +----------------+
    |     TLS 1.3    |            |      QUIC      |
    +----------------+            | (includes TLS) |
    |      TCP       |            +----------------+
    +----------------+            |      UDP       |
    |      IP        |            +----------------+
    +----------------+            |      IP        |
                                  +----------------+
```

By building on UDP, QUIC avoids the kernel's rigid TCP implementation. It can evolve freely in userspace, integrate encryption into the handshake, handle streams independently, and survive network changes.

---

## The QUIC Packet Structure

Every QUIC packet begins with a header. There are two forms: **long headers** (used during connection establishment) and **short headers** (used after the handshake is complete for maximum efficiency).

### Long header format

```
    Long Header Packet:
    +-+-+-+-+-+-+-+-+
    |1|1| Type  |Rsv|  Header Form (1=long) + Long Packet Type
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |                     Version (32 bits)                      |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    | DCID Len (8) |     Destination Connection ID (0-160)      |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    | SCID Len (8) |       Source Connection ID (0-160)         |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |                    Type-Specific Fields                    |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |                     Encrypted Payload                      |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Short header format

After the handshake completes, both sides switch to short headers to minimize overhead:

```
    Short Header Packet:
    +-+-+-+-+-+-+-+-+
    |0|1|S|R|R|K|P P|  Header Form (0=short)
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |              Destination Connection ID (variable)          |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |                   Packet Number (8-32 bits)                |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
    |                     Encrypted Payload                      |
    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Key design decisions:

- **Connection IDs** instead of the TCP 4-tuple (src IP, src port, dst IP, dst port). This is what enables connection migration.
- **Packet numbers are never reused** — unlike TCP sequence numbers that wrap. This makes loss detection unambiguous.
- **Almost everything is encrypted** — even packet numbers and most of the header. Middleboxes cannot inspect or modify QUIC traffic, which prevents ossification (the problem where network equipment assumes protocol details that then cannot change).

In Cloudflare's [quiche](https://github.com/cloudflare/quiche) implementation, packet parsing lives in [`src/packet.rs`](https://github.com/cloudflare/quiche/blob/master/quiche/src/packet.rs), where you can see the header form bit dispatch between long and short headers.

---

## Connection Establishment

QUIC's biggest user-visible win is reducing handshake latency. It merges the transport handshake and the cryptographic handshake into a single operation.

### 1-RTT handshake (first connection)

When a client connects to a server for the first time:

```
        Client                              Server
          |                                   |
          |--- Initial [ClientHello] -------->|
          |    (crypto + transport params)     |
          |                                   |
          |<-- Initial [ServerHello] ---------|
          |<-- Handshake [Cert, Finished] ----|
          |                                   |
          |--- Handshake [Finished] --------->|
          |--- 1-RTT [HTTP Request] --------->|  <-- app data flows!
          |                                   |
          |<-- 1-RTT [HTTP Response] ---------|
          |                                   |

          Total before first byte: 1 RTT
```

Compare this to TCP + TLS 1.3 which requires 2 RTT (1 for TCP SYN/SYN-ACK, 1 for TLS). QUIC saves one full round trip on every new connection.

The trick: QUIC's Initial packet carries the TLS ClientHello **inside** the QUIC transport layer. The server responds with its certificate and finishes the handshake in the same flight. Transport parameters (like flow control limits and supported features) are exchanged as TLS extensions.

### 0-RTT handshake (resumption)

If the client has connected to this server before, it can cache a **session ticket** and **transport parameters**. On the next connection, it sends application data in the very first packet:

```
        Client                              Server
          |                                   |
          |--- Initial [ClientHello] -------->|
          |--- 0-RTT [HTTP Request] -------->|  <-- app data in first flight!
          |                                   |
          |<-- Initial [ServerHello] ---------|
          |<-- Handshake [Finished] ----------|
          |<-- 1-RTT [HTTP Response] ---------|
          |                                   |

          Total before first byte: 0 RTT
```

The server can process the HTTP request before the handshake even completes. This is game-changing for latency-sensitive applications.

**Security caveat:** 0-RTT data is vulnerable to replay attacks. An attacker who captures 0-RTT packets can resend them to the server. For this reason, 0-RTT should only carry idempotent requests (like GET). Servers must implement replay protection or only accept safe operations in 0-RTT.

In Chromium's QUIC stack, the 0-RTT logic is in [`net/quic/quic_crypto_client_stream.cc`](https://source.chromium.org/chromium/chromium/src/+/main:net/quic/quic_crypto_client_stream.cc) where cached server configs enable early data.

---

## Stream Multiplexing

This is where QUIC fundamentally solves HTTP/2's head-of-line blocking problem.

### Independent streams

In QUIC, each request/response pair gets its own **stream**. Streams are independent — loss on one stream does not block any other stream:

```
    QUIC Connection (single UDP socket)
    ============================================

    Stream 0: |--pkt1--|--pkt2--|--pkt3--|--pkt4--|  (CSS file)
    Stream 4: |--pkt1--|--pkt2--|--pkt3--|         (JavaScript)
    Stream 8: |--pkt1--|--pkt2--|                   (Image)

              Packet lost on Stream 4:
                         X
    Stream 0: |--pkt1--|--pkt2--|--pkt3--|--pkt4--|  delivered!
    Stream 4: |--pkt1--|  GAP  |--pkt3--|         BLOCKED (only this stream)
    Stream 8: |--pkt1--|--pkt2--|                   delivered!
```

Each stream has its own flow control and ordering guarantees. The QUIC layer delivers data to the application on a per-stream basis. If Stream 4 has a gap, only Stream 4 waits — Streams 0 and 8 keep delivering.

### Stream types

QUIC defines four types of streams based on two bits:

| Initiated by | Bidirectional | Unidirectional |
|---|---|---|
| Client | ID = 4n + 0 | ID = 4n + 2 |
| Server | ID = 4n + 1 | ID = 4n + 3 |

- **Bidirectional streams** carry request/response pairs (client opens, both sides send data).
- **Unidirectional streams** carry one-way data like HTTP/3 control frames or server push.

Stream IDs are simple integers that increment. A client's first bidirectional stream is 0, then 4, then 8, and so on.

### Flow control

QUIC implements flow control at two levels:

1. **Stream-level**: each stream has a maximum amount of data the receiver is willing to buffer.
2. **Connection-level**: the total data across all streams cannot exceed a connection-wide limit.

The receiver sends `MAX_STREAM_DATA` and `MAX_DATA` frames to advertise increased limits as it consumes data. This prevents a single aggressive stream from consuming all buffer space.

In quiche, stream management is handled in [`src/stream/mod.rs`](https://github.com/cloudflare/quiche/blob/master/quiche/src/stream/mod.rs), where you can see how each stream maintains independent send/receive buffers and flow control state.

---

## Loss Detection and Recovery

QUIC's loss detection is simpler and more accurate than TCP's, thanks to a critical design choice: **packet numbers are never reused**.

### Why TCP's approach is ambiguous

In TCP, if a segment with sequence number 1000 is retransmitted, the ACK for sequence 1000 is ambiguous — did the receiver get the original or the retransmission? This is the **retransmission ambiguity problem** that makes RTT estimation unreliable.

### QUIC's approach

Every QUIC packet gets a unique, monotonically increasing packet number. If packet 42 is lost and its contents are retransmitted, the retransmission goes in packet 73 (or whatever the next number is). When the receiver ACKs packet 73, the sender knows unambiguously:

- Packet 42 was lost (never ACKed).
- Packet 73 was received (and the RTT sample from 73 is accurate).

```
    Sender                              Receiver
      |                                   |
      |--- Pkt 42 [Stream 4, offset 0] -->|  (lost in transit)
      |--- Pkt 43 [Stream 0, offset 0] -->|
      |                                   |
      |<-- ACK [43] ----------------------|  (no ACK for 42)
      |                                   |
      |--- Pkt 44 [Stream 4, offset 0] -->|  (retransmit Stream 4 data)
      |                                   |
      |<-- ACK [43, 44] ------------------|  (clear RTT for pkt 44)
      |                                   |

    No ambiguity: pkt 42 is lost, pkt 44's RTT is measured cleanly.
```

### ACK frames

QUIC receivers send ACK frames that contain **ranges** of received packet numbers:

```
    ACK Frame:
    +------+------+------+------+
    | Largest Acknowledged: 47   |
    +----------------------------+
    | ACK Delay: 12ms            |
    +----------------------------+
    | ACK Range Count: 2         |
    +----------------------------+
    | First ACK Range: 5         |  --> packets 42-47 received
    +----------------------------+
    | Gap: 2                     |  --> packets 39-40 missing
    +----------------------------+
    | ACK Range: 10              |  --> packets 28-38 received
    +----------------------------+
```

This is similar to TCP's SACK (Selective Acknowledgment) option but is a first-class feature in QUIC, not an optional extension.

### Detection heuristics

QUIC uses two signals to declare a packet lost:

1. **Packet threshold**: if a packet's number is more than 3 below the largest ACKed packet, it is presumed lost (similar to TCP's 3 duplicate ACKs).
2. **Time threshold**: if enough time has passed since the packet was sent (typically 9/8 of the smoothed RTT), it is presumed lost.

The implementation in quiche lives in [`src/recovery/mod.rs`](https://github.com/cloudflare/quiche/blob/master/quiche/src/recovery/mod.rs), where `detect_lost_packets()` applies both the packet number threshold and time threshold.

---

## Congestion Control

QUIC separates congestion control from the protocol itself — it is **pluggable**. The protocol specification (RFC 9002) defines the interface but allows implementations to use any algorithm.

### Default: NewReno-like

The default congestion controller described in RFC 9002 is similar to TCP NewReno:

- **Slow start**: increase congestion window by the number of bytes ACKed (exponential growth).
- **Congestion avoidance**: after a loss, increase by one MSS per RTT (linear growth).
- **Recovery**: on loss detection, halve the congestion window and enter recovery.

```
    Congestion Window over Time:

    cwnd
     ^
     |          /\
     |         /  \        /\        /\
     |        /    \      /  \      /  \
     |       /      \    /    \    /    \
     |      /  slow  \  / cong \  / cong \
     |     /  start   \/  avoid \/  avoid \
     |    /            |         |
     |   /             |loss     |loss
     |  /              |         |
     +--+----+---------+---------+--------> time
        |    |
        |    ssthresh
        start
```

### Advanced algorithms

Real-world implementations often use more sophisticated algorithms:

- **Cubic** (Linux default): uses a cubic function for window growth, more aggressive in high-bandwidth networks.
- **BBR** (Bottleneck Bandwidth and RTT): models the network path to find optimal sending rate, used by Google.
- **Copa**, **Reno2**: research algorithms.

Since QUIC runs in userspace, deploying a new congestion control algorithm is just a software update — no kernel patch needed. This is a massive advantage over TCP where changing congestion control requires OS-level changes.

In Chromium, BBR is the default for QUIC connections. The implementation is in [`net/third_party/quiche/src/quiche/quic/core/congestion_control/`](https://source.chromium.org/chromium/chromium/src/+/main:net/third_party/quiche/src/quiche/quic/core/congestion_control/).

---

## Connection Migration

Remember the train scenario from the introduction? QUIC handles it gracefully through **connection migration**.

### The problem with TCP

A TCP connection is identified by a 4-tuple: (source IP, source port, destination IP, destination port). When your phone switches from Wi-Fi to cellular, your source IP changes. Every TCP connection dies. The application must detect the failure, re-establish connections, repeat TLS handshakes, and resend in-flight data.

### How QUIC solves it

QUIC identifies connections by **Connection IDs**, not by network addresses. When the client's IP changes, it sends packets with the same Connection ID from the new address. The server recognizes the connection and continues:

```
    Phone on Wi-Fi (IP: 10.0.0.5)         Server
      |                                      |
      |--- [ConnID: 0xABCD, Pkt 100] ------>|  normal traffic
      |<-- [ConnID: 0x1234, Pkt 200] -------|
      |                                      |
    --- Phone switches to cellular (IP: 172.16.0.9) ---
      |                                      |
      |--- [ConnID: 0xABCD, Pkt 101] ------>|  same ConnID, new IP!
      |    (from 172.16.0.9)                 |
      |                                      |
      |<-- [ConnID: 0x1234, Pkt 201] -------|  server responds to new IP
      |    (to 172.16.0.9)                   |
      |                                      |

    Connection continues seamlessly. No handshake, no data loss.
```

### Path validation

To prevent an attacker from hijacking a connection by spoofing packets from a different address, QUIC requires **path validation**. When the server receives a packet from a new address, it sends a `PATH_CHALLENGE` frame containing a random token. The client must echo it back in a `PATH_RESPONSE` frame from the new address, proving it actually controls that address.

### Connection ID rotation

For privacy, QUIC allows both sides to issue multiple Connection IDs for the same connection via `NEW_CONNECTION_ID` frames. The client can use different Connection IDs on different network paths, making it harder for network observers to correlate traffic across network changes.

---

## HTTP/3 over QUIC

HTTP/3 (RFC 9114) is the version of HTTP designed specifically to run on QUIC. It replaces HTTP/2's complex framing layer with a much simpler design that leverages QUIC's native streams.

### Mapping requests to streams

Each HTTP request/response pair uses one bidirectional QUIC stream:

```
    HTTP/3 over QUIC

    QUIC Connection
    +----------------------------------------------------------+
    |                                                          |
    |  Stream 0 (control): SETTINGS, GOAWAY                   |
    |  Stream 2 (QPACK encoder): header compression updates   |
    |  Stream 6 (QPACK decoder): acknowledgments              |
    |                                                          |
    |  Stream 4:  GET /index.html  -->  200 OK + HTML body    |
    |  Stream 8:  GET /style.css   -->  200 OK + CSS body     |
    |  Stream 12: GET /app.js      -->  200 OK + JS body      |
    |  Stream 16: GET /hero.png    -->  200 OK + image data   |
    |                                                          |
    +----------------------------------------------------------+
```

This is dramatically simpler than HTTP/2, which had to implement its own stream multiplexing, flow control, and prioritization on top of TCP. HTTP/3 just uses QUIC streams directly.

### What HTTP/3 removes from HTTP/2

Since QUIC already provides these features, HTTP/3 does not need:

- **Stream multiplexing logic** — QUIC handles it.
- **Per-stream flow control** — QUIC handles it.
- **TCP-level HOL blocking mitigation** — gone by design.

### What HTTP/3 adds

- **QPACK** header compression (replaces HPACK which required ordered delivery).
- **Server push** using unidirectional streams.
- **Prioritization** via the Priority header and `PRIORITY_UPDATE` frames.

### Real-world adoption

As of 2025, HTTP/3 serves roughly 30% of web traffic. Major CDNs (Cloudflare, Fastly, Akamai), browsers (Chrome, Firefox, Safari, Edge), and platforms (Google, Facebook, YouTube) support it. If you open Chrome DevTools on most Google properties, you will see `h3` in the Protocol column.

---

## Putting It All Together

Let's trace a complete page load to see how these pieces interact:

```
    1. User types URL, phone is on cellular (IP: 172.16.0.9)

    2. DNS resolves, client starts QUIC to port 443/UDP:
       Client --- Initial [ClientHello, 0-RTT: GET /] ---> Server
                  (0-RTT because we visited before)

    3. Server processes GET / immediately (0 RTT latency!)
       Server --- Initial + Handshake + Response [HTML] ---> Client

    4. Client parses HTML, opens streams for CSS, JS, images:
       Stream 4: GET /style.css
       Stream 8: GET /app.js
       Stream 12: GET /hero.png
       (all in parallel, all independent)

    5. Packet for Stream 8 is lost:
       - Stream 4 (CSS) and Stream 12 (image) keep delivering
       - Only Stream 8 (JS) waits for retransmission
       - Page renders progressively

    6. User enters elevator, switches to Wi-Fi (IP: 10.0.0.5):
       - Same Connection ID, packets now from new IP
       - Path validation completes
       - Remaining data continues without interruption

    7. Total user-perceived latency: ~1 RTT for first content
       (vs 2-3 RTT with TCP+TLS, plus HOL stalls, plus migration failures)
```

---

## Common Misconceptions

**"QUIC is just TCP over UDP"**
No. QUIC shares some concepts with TCP (reliable delivery, congestion control) but has fundamentally different semantics: independent streams, integrated encryption, connection IDs, and no head-of-line blocking.

**"UDP is unreliable, so QUIC must be unreliable"**
QUIC implements its own reliability layer. UDP is just the substrate — it provides port numbers and a checksum. QUIC adds everything else.

**"QUIC is always faster than TCP"**
Not necessarily. On a zero-loss network with persistent connections (where handshake cost is amortized), QUIC and TCP perform similarly. QUIC's advantages appear under loss (no HOL blocking), on first connection (fewer RTTs), and during network transitions (migration).

**"Middleboxes block UDP, so QUIC won't work"**
Most networks allow UDP port 443. When UDP is blocked, browsers fall back to TCP + HTTP/2. In practice, QUIC works for over 95% of users.

---

## References

- [RFC 9000 - QUIC: A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000) — The core protocol specification covering packet formats, streams, connection establishment, and migration.
- [RFC 9001 - Using TLS to Secure QUIC](https://www.rfc-editor.org/rfc/rfc9001) — How TLS 1.3 integrates into QUIC for key exchange and encryption.
- [RFC 9002 - QUIC Loss Detection and Congestion Control](https://www.rfc-editor.org/rfc/rfc9002) — Algorithms for detecting lost packets and controlling sending rate.
- [RFC 9114 - HTTP/3](https://www.rfc-editor.org/rfc/rfc9114) — How HTTP maps onto QUIC streams.
- [Cloudflare quiche](https://github.com/cloudflare/quiche) — Production QUIC and HTTP/3 implementation in Rust.
- [Chromium QUIC](https://source.chromium.org/chromium/chromium/src/+/main:net/third_party/quiche/) — Google's QUIC implementation powering Chrome.
- [QUIC Working Group](https://quicwg.org/) — IETF working group with drafts, meeting notes, and implementation reports.
