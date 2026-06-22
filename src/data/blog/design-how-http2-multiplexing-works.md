---
author: JZ
pubDatetime: 2026-06-22T12:01:00Z
modDatetime: 2026-06-22T12:01:00Z
title: System Design - How HTTP/2 Multiplexing and Flow Control Works
tags:
  - design-system
  - design-networking
description:
  "How HTTP/2 multiplexing works: binary framing, streams, flow control, HPACK header compression, and server push — with ASCII diagrams and source code references from the Go net/http2 implementation."
---

## Table of contents

## Context

In the early web, a browser fetching a page with 50 resources (images, scripts, stylesheets) would open multiple TCP connections to the server — each carrying a single request-response pair at a time. HTTP/1.1 added **pipelining** (sending requests without waiting for responses), but it suffered from **head-of-line blocking**: if the first response was slow, all queued responses behind it were stuck.

```
     HTTP/1.1 — one request per connection (or pipeline with HOL blocking)

  Browser                                  Server
    |--- GET /style.css ------------------>|
    |<---------- 200 OK (style.css) -------|     must finish before next
    |--- GET /app.js --------------------->|
    |<---------- 200 OK (app.js) ----------|
    |--- GET /logo.png ------------------->|
    |<---------- 200 OK (logo.png) --------|

    Total: 3 round trips sequentially (or HOL-blocked pipeline)
```

Browsers worked around this by opening 6–8 parallel TCP connections per origin — wasteful in memory, TCP state, and TLS handshakes. Web developers invented hacks like domain sharding, CSS sprites, and resource inlining to reduce request counts.

In 2015, [RFC 7540](https://www.rfc-editor.org/rfc/rfc7540) defined **HTTP/2**, which solves this with a single TCP connection carrying many concurrent **streams**. Let's see how.

## Binary Framing Layer

HTTP/1.1 is a text protocol — headers are plain ASCII separated by `\r\n`. HTTP/2 replaces this with a **binary framing layer**. Every piece of data exchanged between client and server is wrapped in a **frame**:

```
  HTTP/2 Frame Format (9-byte header + payload)

  +-----------------------------------------------+
  |                Length (24 bits)                |
  +---------------+---------------+---------------+
  |  Type (8)     |  Flags (8)    |
  +-+-------------+---------------+--------------+
  |R|            Stream Identifier (31 bits)      |
  +-+---------------------------------------------+
  |              Frame Payload (0...)              |
  +-----------------------------------------------+
```

- **Length**: size of the payload (up to 16 KB by default, negotiable to 16 MB).
- **Type**: what kind of frame — DATA, HEADERS, PRIORITY, RST_STREAM, SETTINGS, PUSH_PROMISE, PING, GOAWAY, WINDOW_UPDATE, CONTINUATION.
- **Flags**: type-specific bits (e.g., END_STREAM, END_HEADERS, PADDED).
- **Stream Identifier**: which stream this frame belongs to. Stream 0 is reserved for connection-level frames.

In Go's `net/http2` package, the frame header is read in [`frame.go`](https://github.com/golang/net/blob/master/http2/frame.go):

```go
// ReadFrame reads a single frame from the connection.
// The frame header is exactly 9 bytes.
func (fr *Framer) ReadFrame() (Frame, error) {
    // Read 9 bytes of header
    _, err := io.ReadFull(fr.r, fr.headerBuf[:frameHeaderLen])
    // Parse: length (3 bytes), type (1), flags (1), stream ID (4)
    fh := FrameHeader{
        Length:   (uint32(buf[0])<<16 | uint32(buf[1])<<8 | uint32(buf[2])),
        Type:     FrameType(buf[3]),
        Flags:    Flags(buf[4]),
        StreamID: binary.BigEndian.Uint32(buf[5:]) & (1<<31 - 1),
    }
    // Read payload of fh.Length bytes...
}
```

## Streams and Multiplexing

A **stream** is a bidirectional sequence of frames exchanged between client and server within a single TCP connection. Each request-response pair uses one stream. Streams are identified by integers — clients use odd numbers (1, 3, 5, ...), servers use even numbers (2, 4, 6, ...) for pushed responses.

```
     HTTP/2 — multiplexed streams on one TCP connection

  Browser                                      Server
    |                                            |
    |=== Stream 1: HEADERS (GET /style.css) ===>|
    |=== Stream 3: HEADERS (GET /app.js) ======>|
    |=== Stream 5: HEADERS (GET /logo.png) ====>|
    |                                            |
    |<=== Stream 1: HEADERS (200) ==============|
    |<=== Stream 3: HEADERS (200) ==============|
    |<=== Stream 1: DATA (css bytes) ===========|
    |<=== Stream 5: HEADERS (200) ==============|
    |<=== Stream 3: DATA (js bytes, part 1) ====|
    |<=== Stream 1: DATA (END_STREAM) ==========|
    |<=== Stream 5: DATA (png bytes) ===========|
    |<=== Stream 3: DATA (js bytes, part 2) ====|
    |<=== Stream 5: DATA (END_STREAM) ==========|
    |<=== Stream 3: DATA (END_STREAM) ==========|
    |                                            |
    Single TCP connection, zero head-of-line blocking at HTTP layer
```

The frames from different streams are **interleaved**. The receiver reassembles them by stream ID. Since each stream is independent, a slow response on stream 1 does not block stream 3 or stream 5.

### Stream Lifecycle

A stream goes through these states:

```
                      +--------+
                send  |        | recv
               ,------|  idle  |------.
              /       |        |       \
             v        +--------+        v
      +----------+                  +----------+
      |          |                  |          |
  ,---| reserved |                  | reserved |---.
  |   |  (local) |                  | (remote) |   |
  |   +----------+                  +----------+   |
  |        |             +--------+        |       |
  |        | send        |        | recv   |       |
  |        v             |  open  |        v       |
  |   +----------+       |        |   +----------+ |
  |   |   half   |------>|        |<------| half   | |
  |   |  closed  |       +--------+       | closed | |
  |   | (remote) |         |    |         | (local)| |
  |   +----------+         |    |         +----------+
  |        |               |    |               |   |
  |        v               v    v               v   |
  |   +----------+   +----------+   +----------+   |
  `-->|          |   |          |   |          |<--'
      |  closed  |   |  closed  |   |  closed  |
      |          |   |          |   |          |
      +----------+   +----------+   +----------+
```

The key transitions:
1. Client sends HEADERS → stream moves from **idle** to **open**.
2. Either side sends END_STREAM flag → that side is **half-closed**.
3. Both sides half-closed → stream is **closed**.
4. Either side can send RST_STREAM at any time to abort.

## Flow Control

Without flow control, a fast sender could overwhelm a slow receiver's buffers. HTTP/2 implements **per-stream** and **per-connection** flow control using a credit-based window system.

### How It Works

1. Each stream starts with a **window size** (default: 65,535 bytes, configured via SETTINGS frame).
2. The connection as a whole also has its own window.
3. When a sender transmits DATA frames, it **decrements** its available window by the payload size.
4. When a receiver processes the data, it sends a **WINDOW_UPDATE** frame to grant more credit.
5. If the window reaches zero, the sender must stop until it receives a WINDOW_UPDATE.

```
  Flow Control Example (window = 64 KB)

  Sender                                    Receiver
    |                                          |
    |  window = 65535                           |  window = 65535
    |                                          |
    |--- DATA (16384 bytes, stream 1) -------->|
    |  window = 49151                          |  consumed, buffers data
    |                                          |
    |--- DATA (16384 bytes, stream 1) -------->|
    |  window = 32767                          |  app reads 32768 bytes
    |                                          |
    |<--- WINDOW_UPDATE (32768, stream 1) -----|  refills sender window
    |  window = 65535                          |
    |                                          |
    |--- DATA (16384 bytes, stream 1) -------->|
    |  ...                                     |
```

The Go implementation tracks this in [`flow.go`](https://github.com/golang/net/blob/master/http2/flow.go):

```go
// flow controls how many bytes can be written on a stream or connection.
type flow struct {
    n int32 // current window size; may go negative during races
}

// available returns how many bytes are available to write.
func (f *flow) available() int32 {
    if f.n < 0 {
        return 0
    }
    return f.n
}

// take subtracts n bytes from the window.
func (f *flow) take(n int32) {
    f.n -= n
}

// add adds n bytes to the window (called on WINDOW_UPDATE receipt).
func (f *flow) add(n int32) bool {
    sum := f.n + n
    if sum > math.MaxInt32 { // overflow → protocol error
        return false
    }
    f.n = sum
    return true
}
```

### Why Two Levels?

- **Connection-level window** prevents the total bandwidth across all streams from exceeding what the receiver can handle.
- **Stream-level window** prevents one stream from starving others.

A DATA frame deducts from *both* windows. A WINDOW_UPDATE frame targets either stream 0 (connection level) or a specific stream.

## HPACK Header Compression

HTTP headers are repetitive. On a typical browsing session, every request sends the same `User-Agent`, `Cookie`, `Accept` headers. HTTP/2 uses **HPACK** ([RFC 7541](https://www.rfc-editor.org/rfc/rfc7541)) to compress headers.

HPACK maintains a **dynamic table** — an ordered list of recently seen header name-value pairs, shared between encoder and decoder. When a header appears again, the encoder sends just its index number instead of the full string.

```
  HPACK Encoding Example

  Request 1:
    :method: GET
    :path: /index.html
    host: example.com
    cookie: session=abc123

  Encoded: [literal entries added to dynamic table]
  Wire bytes: ~95 bytes

  Request 2:
    :method: GET
    :path: /style.css        ← changed
    host: example.com        ← same → send index
    cookie: session=abc123   ← same → send index

  Encoded: [index, index, literal for :path, index]
  Wire bytes: ~20 bytes (78% smaller!)
```

The static table has 61 predefined entries for common headers (`:method: GET`, `:status: 200`, etc.). The dynamic table grows with each new header seen and is bounded by SETTINGS_HEADER_TABLE_SIZE (default 4096 bytes).

## Server Push

HTTP/2 allows a server to **push** resources the client hasn't requested yet. If the server knows the client will need `/style.css` after requesting `/index.html`, it can push it proactively:

```
  Server Push Flow

  Client                                    Server
    |                                         |
    |--- HEADERS (GET /index.html) --------->|
    |                                         |  "client will need style.css"
    |<--- PUSH_PROMISE (stream 2,            |
    |      promised: GET /style.css) ---------|  reserves stream 2
    |                                         |
    |<--- HEADERS (200, stream 1) -----------|
    |<--- DATA (/index.html, stream 1) ------|
    |                                         |
    |<--- HEADERS (200, stream 2) -----------|  pushed response
    |<--- DATA (/style.css, stream 2) -------|
    |                                         |
    Client can RST_STREAM stream 2 if it already has style.css cached
```

In practice, server push proved difficult to use correctly (it could waste bandwidth pushing resources the client already has cached), and most browsers have deprecated support for it. HTTP/3 removed it from the core spec.

## Putting It All Together

Here is the lifecycle of a typical HTTP/2 connection:

```
  Connection Setup and Request Flow

  Client                                          Server
    |                                               |
    |--- TCP handshake (SYN, SYN-ACK, ACK) ------->|
    |--- TLS handshake (with ALPN: h2) ------------>|
    |                                               |
    |--- Connection preface -----------------------|
    |    "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"       |
    |--- SETTINGS frame (stream 0) --------------->|
    |<-- SETTINGS frame (stream 0) ----------------|
    |--- SETTINGS ACK (stream 0) ----------------->|
    |<-- SETTINGS ACK (stream 0) ------------------|
    |                                               |
    |  Connection established, ready for streams    |
    |                                               |
    |--- HEADERS (stream 1, :method GET) --------->|
    |--- HEADERS (stream 3, :method POST) -------->|
    |--- DATA (stream 3, request body) ----------->|
    |                                               |
    |<-- HEADERS (stream 1, :status 200) ----------|
    |<-- DATA (stream 1, response) ----------------|
    |<-- HEADERS (stream 3, :status 201) ----------|
    |                                               |
    |--- GOAWAY (stream 0) ----------------------->|  graceful shutdown
    |                                               |
```

The magic string `PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n` is called the **connection preface**. It is designed to cause HTTP/1.1 servers to fail cleanly (they will interpret it as an invalid HTTP/1.1 request method "PRI").

## Performance Impact

Compared to HTTP/1.1:

| Aspect | HTTP/1.1 | HTTP/2 |
|--------|----------|--------|
| Connections per origin | 6-8 | 1 |
| Head-of-line blocking | Yes (at HTTP layer) | No (at HTTP layer*) |
| Header compression | None | HPACK |
| Request prioritization | None | Stream weights + dependencies |
| Server push | None | Supported |

*Note: HTTP/2 still suffers from TCP-level head-of-line blocking. If a TCP packet is lost, all streams on that connection stall until retransmission succeeds. This motivated HTTP/3, which runs over QUIC (UDP) with independent per-stream loss recovery.

## Key Takeaways

1. **Binary framing** replaces text parsing with efficient 9-byte frame headers.
2. **Stream multiplexing** eliminates HTTP-level head-of-line blocking on a single TCP connection.
3. **Flow control** operates at both stream and connection level to prevent buffer overflow and stream starvation.
4. **HPACK** compresses redundant headers using static/dynamic tables and Huffman encoding.
5. **The remaining problem** — TCP head-of-line blocking — is solved by HTTP/3 (QUIC).

## References

1. [RFC 7540 — HTTP/2](https://www.rfc-editor.org/rfc/rfc7540) — the protocol specification.
2. [RFC 7541 — HPACK](https://www.rfc-editor.org/rfc/rfc7541) — header compression specification.
3. [Go net/http2 package](https://github.com/golang/net/tree/master/http2) — production implementation used in Go's standard library.
4. [High Performance Browser Networking — HTTP/2 chapter](https://hpbn.co/http2/) — Ilya Grigorik's excellent deep dive.
5. [RFC 9113 — HTTP/2 revision](https://www.rfc-editor.org/rfc/rfc9113) — the 2022 update that deprecated some features.
